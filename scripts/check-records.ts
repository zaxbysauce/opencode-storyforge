import { readdir, readFile } from 'node:fs/promises';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '..');
const TARGET_PATTERN = 'Record<string, unknown>';
const JUSTIFICATION_TAG = 'RECORD-JUSTIFIED';
const IGNORE_DIRS = new Set(['node_modules', 'dist', '.swarm', 'coverage', 'tmp', '.tmp']);

async function* walk(dir: string): AsyncGenerator<string> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (IGNORE_DIRS.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(fullPath);
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      yield fullPath;
    }
  }
}

async function main(): Promise<void> {
  const offenders: string[] = [];
  for await (const file of walk(ROOT)) {
    const content = await readFile(file, 'utf-8');
    if (content.includes(TARGET_PATTERN) && !content.includes(JUSTIFICATION_TAG)) {
      offenders.push(path.relative(ROOT, file));
    }
  }

  if (offenders.length > 0) {
    console.error('Record<string, unknown> lint failed for the following files:');
    for (const file of offenders) {
      console.error('-', file);
    }
    process.exit(1);
  }

  console.log('Record<string, unknown> lint passed');
}

main().catch((error) => {
  console.error('Failed to run record lint:', error);
  process.exit(1);
});
