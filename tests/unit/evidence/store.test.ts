import { describe, expect, test, beforeEach, afterEach, spyOn } from 'bun:test';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { EvidenceStore } from '../../../src/evidence/store';
import { getEvidenceDefaults } from '../../../src/config/schema';

const FIXTURE_DIR = path.join(process.cwd(), 'tmp', 'evidence-store-test');

async function cleanupFixture(): Promise<void> {
  await fs.rm(FIXTURE_DIR, { recursive: true, force: true });
}

function buildConfig() {
  return getEvidenceDefaults();
}

describe('EvidenceStore', () => {
  beforeEach(async () => {
    await cleanupFixture();
  });

  afterEach(async () => {
    await cleanupFixture();
  });

  test('saves and lists bundles', async () => {
    const config = buildConfig();
    const store = new EvidenceStore(FIXTURE_DIR, config);

    const bundle = {
      id: 'test-bundle-1',
      type: 'test' as const,
      payload: { result: 'passed', count: 42 },
    };

    await store.saveEvidence(bundle);

    const records = await store.listEvidence();
    expect(records).toHaveLength(1);

    const record = records[0];
    expect(record.id).toBe('test-bundle-1');
    expect(record.type).toBe('test');
    expect(record.filename).toMatch(/\.json$/);
    expect(record.payload).toEqual({ result: 'passed', count: 42 });
    expect(record.created_at).toBeDefined();
  });

  test('pruneStaleBundles removes bundles older than max_age_days', async () => {
    const config = { ...buildConfig(), max_age_days: 1 };
    const store = new EvidenceStore(FIXTURE_DIR, config);

    const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const now = new Date().toISOString();

    await store.saveEvidence({
      id: 'old-bundle',
      type: 'test' as const,
      payload: { data: 'old' },
      created_at: fortyEightHoursAgo,
    });

    await store.saveEvidence({
      id: 'new-bundle',
      type: 'test' as const,
      payload: { data: 'new' },
      created_at: now,
    });

    await store.pruneStaleBundles();

    const records = await store.listEvidence();
    expect(records).toHaveLength(1);
    expect(records[0].id).toBe('new-bundle');
  });

  test('pruneStaleBundles respects max_bundles keeping newest first', async () => {
    const config = { ...buildConfig(), max_bundles: 2 };
    const store = new EvidenceStore(FIXTURE_DIR, config);

    const now = Date.now();

    await store.saveEvidence({
      id: 'bundle-1',
      type: 'test' as const,
      payload: { data: 1 },
      created_at: new Date(now).toISOString(),
    });

    await store.saveEvidence({
      id: 'bundle-2',
      type: 'test' as const,
      payload: { data: 2 },
      created_at: new Date(now + 1000).toISOString(),
    });

    await store.saveEvidence({
      id: 'bundle-3',
      type: 'test' as const,
      payload: { data: 3 },
      created_at: new Date(now + 2000).toISOString(),
    });

    await store.pruneStaleBundles();

    const records = await store.listEvidence();
    expect(records).toHaveLength(2);
    expect(records[0].id).toBe('bundle-3');
    expect(records[1].id).toBe('bundle-2');
  });

  test('saveEvidence rejects invalid ids', async () => {
    const config = buildConfig();
    const store = new EvidenceStore(FIXTURE_DIR, config);
    const invalidIds = ['..', 'COM1', 'bad:name'];

    for (const invalidId of invalidIds) {
      const bundle = {
        id: invalidId,
        type: 'test' as const,
        payload: { data: 'test' },
      };
      await expect(store.saveEvidence(bundle)).rejects.toThrow();
    }
  });

  test('tmp files removed after rename failure', async () => {
    const config = buildConfig();
    const store = new EvidenceStore(FIXTURE_DIR, config);
    const renameError = new Error('rename failed');
    const renameSpy = spyOn(fs, 'rename').mockRejectedValue(renameError);

    try {
      const bundle = {
        id: 'test-bundle-rename-fail',
        type: 'test' as const,
        payload: { data: 'test' },
      };
      await expect(store.saveEvidence(bundle)).rejects.toThrow('rename failed');

      // Verify .tmp directory is empty
      const tmpDir = path.join(FIXTURE_DIR, 'evidence', '.tmp');
      const tmpFiles = await fs.readdir(tmpDir).catch(() => []);
      expect(tmpFiles).toHaveLength(0);
    } finally {
      renameSpy.mockRestore();
    }
  });
});
