import * as fs from 'node:fs/promises';
import type { Stats } from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { EvidenceConfig } from '../config/schema';
import { validateSwarmPath } from '../hooks/utils';
import { warn } from '../utils/logger';

export type EvidenceType = 'review' | 'test' | 'diff' | 'approval' | 'note';

export interface EvidenceBundle {
  id?: string;
  type: EvidenceType;
  payload: unknown;
  created_at?: string;
}

export interface EvidenceRecord extends EvidenceBundle {
  id: string;
  created_at: string;
  filename: string;
}

interface EvidenceFileEntry {
  path: string;
  stat: Stats;
  record: EvidenceRecord | null;
}

const ID_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;
const WINDOWS_RESERVED_NAMES = new Set([
  'CON',
  'PRN',
  'AUX',
  'NUL',
  'COM1',
  'COM2',
  'COM3',
  'COM4',
  'COM5',
  'COM6',
  'COM7',
  'COM8',
  'COM9',
  'LPT1',
  'LPT2',
  'LPT3',
  'LPT4',
  'LPT5',
  'LPT6',
  'LPT7',
  'LPT8',
  'LPT9',
]);

const LOCK_TIMEOUT_MS = 5_000;
const LOCK_TOTAL_TIMEOUT_MS = 10_000;
const LOCK_BACKOFFS_MS = [10, 50, 100, 200, 500];
const PRUNE_MIN_INTERVAL_MS = 1_000;
const PRUNE_RERUN_CAP = 3;
const MAX_TMP_CLEANUP_FILES = 1000;

export class EvidenceStore {
  private readonly initPromise: Promise<void>;
  private readonly lockBackoffs = LOCK_BACKOFFS_MS;
  private evidenceRoot: string | null = null;
  private tmpRoot: string | null = null;
  private pruneInFlight: Promise<void> | null = null;
  private prunePending = false;
  private lastPruneEndTime = 0;

  constructor(private readonly directory: string, private readonly config: EvidenceConfig) {
    this.initPromise = this.initialize();
  }

  public async saveEvidence(bundle: EvidenceBundle): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    await this.initPromise;

    const safeId = this.normalizeId(bundle.id);
    const createdAt = bundle.created_at ?? new Date().toISOString();
    const record: EvidenceRecord = {
      id: safeId,
      type: bundle.type,
      payload: bundle.payload,
      created_at: createdAt,
      filename: `${safeId}.json`,
    };

    const serialized = JSON.stringify(record, null, 2);
    const targetPath = await this.resolveRelativePath(path.join('evidence', record.filename));
    const tmpPath = await this.resolveRelativePath(
      path.join('evidence', '.tmp', `${safeId}.${randomUUID()}.json.tmp`),
    );

    await this.withLock(async () => {
      try {
        await this.writeWithRetries(tmpPath, serialized);
        await fs.rename(tmpPath, targetPath);
      } finally {
        await this.safeUnlink(tmpPath);
      }
    });
  }

  public async listEvidence(): Promise<EvidenceRecord[]> {
    await this.initPromise;
    const entries = await this.scanEvidenceFiles();
    return entries
      .map((entry) => entry.record)
      .filter((record): record is EvidenceRecord => record !== null)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  public async pruneStaleBundles(): Promise<void> {
    await this.initPromise;
    await this.runPruneCycle();
  }

  private async initialize(): Promise<void> {
    this.evidenceRoot = await this.resolveRelativePath('evidence');
    this.tmpRoot = path.join(this.evidenceRoot, '.tmp');
    await fs.mkdir(this.tmpRoot, { recursive: true });
    await this.cleanupTmpDirectory();
  }

  private normalizeId(candidate?: string): string {
    const base = (candidate || randomUUID()).trim();
    if (!ID_PATTERN.test(base)) {
      throw new Error('Evidence ID must match /^[a-zA-Z0-9_-]{1,64}$/');
    }
    if (base.includes('.') || base.includes(':')) {
      throw new Error('Evidence ID cannot contain "." or ":"');
    }
    const normalized = base.toUpperCase();
    if (WINDOWS_RESERVED_NAMES.has(normalized)) {
      throw new Error(`Evidence ID cannot be reserved name: ${base}`);
    }
    return base;
  }

  private async withLock<T>(work: () => Promise<T>): Promise<T> {
    const lockPath = await this.resolveRelativePath(path.join('evidence', '.lock'));
    const handle = await this.acquireLock(lockPath);
    try {
      return await work();
    } finally {
      await handle.close().catch(() => undefined);
      await fs.unlink(lockPath).catch(() => undefined);
    }
  }

  private async acquireLock(lockPath: string): Promise<fs.FileHandle> {
    const startTime = Date.now();
    let attempt = 0;

    while (true) {
      try {
        const handle = await fs.open(lockPath, 'wx');
        await handle.write(JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() }));
        return handle;
      } catch (error) {
        if (!(error instanceof Error) || (error as NodeJS.ErrnoException).code !== 'EEXIST') {
          throw error;
        }

        const stats = await fs.stat(lockPath).catch(() => null);
        if (stats && Date.now() - stats.mtimeMs > LOCK_TIMEOUT_MS) {
          const reStat = await fs.stat(lockPath).catch(() => null);
          if (
            reStat &&
            reStat.ino === stats.ino &&
            reStat.dev === stats.dev &&
            Date.now() - reStat.mtimeMs > LOCK_TIMEOUT_MS
          ) {
            await fs.unlink(lockPath).catch(() => undefined);
          }
        }

        const elapsed = Date.now() - startTime;
        if (elapsed > LOCK_TOTAL_TIMEOUT_MS) {
          warn('Evidence store lock acquisition timed out', { directory: this.directory });
          throw new Error('Failed to acquire evidence lock');
        }

        const delay = this.lockBackoffs[Math.min(attempt, this.lockBackoffs.length - 1)];
        await this.sleep(delay);
        attempt += 1;
      }
    }
  }

  private async runPruneCycle(): Promise<void> {
    if (this.pruneInFlight) {
      this.prunePending = true;
      return;
    }

    this.prunePending = true;
    this.pruneInFlight = this.executePruneCycle();
    await this.pruneInFlight;
  }

  private async executePruneCycle(): Promise<void> {
    let reruns = 0;
    while (true) {
      this.prunePending = false;
      try {
        await this.withLock(async () => this.pruneOnce());
        this.lastPruneEndTime = Date.now();
      } catch (error) {
        warn('Evidence prune failed', { error, directory: this.directory });
        break;
      }

      if (!this.prunePending) {
        break;
      }

      if (reruns >= PRUNE_RERUN_CAP) {
        warn('Evidence prune rerun cap reached', { cap: PRUNE_RERUN_CAP });
        this.prunePending = false;
        break;
      }

      reruns += 1;
      const elapsedSinceEnd = Date.now() - this.lastPruneEndTime;
      if (elapsedSinceEnd < PRUNE_MIN_INTERVAL_MS) {
        await this.sleep(PRUNE_MIN_INTERVAL_MS - elapsedSinceEnd);
      }
    }

    this.pruneInFlight = null;

    if (this.prunePending) {
      this.runPruneCycle().catch((error) => warn('Evidence prune reschedule failed', { error }));
    }
  }

  private async pruneOnce(): Promise<void> {
    const entries = await this.scanEvidenceFiles();
    const now = Date.now();
    const maxAgeMs = (this.config.max_age_days ?? 0) * 24 * 60 * 60 * 1000;
    const toDelete = new Set<string>();
    const kept: { entry: EvidenceFileEntry; timestamp: number }[] = [];

    for (const entry of entries) {
      if (!entry.record) {
        toDelete.add(entry.path);
        continue;
      }

      const createdAt = Date.parse(entry.record.created_at);
      const safeTimestamp = Number.isNaN(createdAt) ? entry.stat.mtimeMs : createdAt;

      if (maxAgeMs > 0 && now - safeTimestamp > maxAgeMs) {
        toDelete.add(entry.path);
        continue;
      }

      kept.push({ entry, timestamp: safeTimestamp });
    }

    const maxBundles = this.config.max_bundles ?? Infinity;
    if (kept.length > maxBundles) {
      kept
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(maxBundles)
        .forEach(({ entry }) => { toDelete.add(entry.path); });
    }

    await Promise.all(Array.from(toDelete).map((filePath) => this.safeUnlink(filePath)));
  }

  private async scanEvidenceFiles(): Promise<EvidenceFileEntry[]> {
    const evidenceDir = await this.resolveRelativePath('evidence');
    const dirEntries = await fs.readdir(evidenceDir, { withFileTypes: true }).catch(() => []);
    const results: EvidenceFileEntry[] = [];

    for (const entry of dirEntries) {
      if (!entry.isFile()) {
        continue;
      }
      if (!entry.name.endsWith('.json')) {
        continue;
      }
      const relative = path.join('evidence', entry.name);
      const absolute = await this.resolveRelativePath(relative);
      const stat = await fs.stat(absolute).catch(() => null);
      if (!stat) {
        continue;
      }
      const record = await this.readRecord(absolute);
      results.push({ path: absolute, stat, record });
    }

    return results;
  }

  private async readRecord(filePath: string): Promise<EvidenceRecord | null> {
    try {
      const text = await Bun.file(filePath).text();
      const parsed = JSON.parse(text) as EvidenceRecord;
      if (parsed.id && parsed.created_at) {
        return parsed;
      }
      return null;
    } catch (error) {
      warn('Evidence record read failed', { error, path: filePath });
      return null;
    }
  }

  private async cleanupTmpDirectory(): Promise<void> {
    if (!this.tmpRoot) {
      return;
    }

    const entries = await fs.readdir(this.tmpRoot).catch(() => []);
    let cleaned = 0;
    for (const entry of entries) {
      if (cleaned >= MAX_TMP_CLEANUP_FILES) {
        warn('Evidence tmp cleanup reached file limit', { limit: MAX_TMP_CLEANUP_FILES });
        break;
      }
      const candidate = path.join(this.tmpRoot, entry);
      await fs.unlink(candidate).catch(() => warn('Failed to remove tmp file', { path: candidate }));
      cleaned += 1;
    }
  }

  private async writeWithRetries(filePath: string, content: string): Promise<void> {
    const maxRetries = 5;
    let attempt = 0;
    while (true) {
      try {
        await fs.writeFile(filePath, content, 'utf-8');
        return;
      } catch (error) {
        if (
          attempt < maxRetries &&
          error instanceof Error &&
          ['EMFILE', 'ENFILE'].includes((error as NodeJS.ErrnoException).code ?? '')
        ) {
          await this.sleep(50 * 2 ** attempt);
          attempt += 1;
          continue;
        }
        throw error;
      }
    }
  }

  private async safeUnlink(filePath: string): Promise<void> {
    try {
      await fs.unlink(filePath);
    } catch {
      /* ignore */
    }
  }

  private async resolveRelativePath(relative: string): Promise<string> {
    return validateSwarmPath(this.directory, relative);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
