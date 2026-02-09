import { spawnSync } from 'node:child_process';

const COVERAGE_THRESHOLD = 90;

function runCoverage(): string {
  const proc = spawnSync('bun', ['test', '--coverage'], {
    encoding: 'utf8',
  });

  const stdout = proc.stdout ?? '';
  const stderr = proc.stderr ?? '';
  if (stdout) {
    console.log(stdout);
  }
  if (stderr) {
    console.error(stderr);
  }

  if (proc.status !== 0) {
    process.exit(proc.status ?? 1);
  }

  return [stdout, stderr].filter(Boolean).join('\n');
}

function parseCoverage(output: string): number | null {
  const lines = output.split(/\r?\n/);
  for (const line of lines) {
    if (!line) continue;
    if (!line.includes('All files')) continue;
    const parts = line.split('|').map((segment) => segment.trim());
    if (parts.length >= 3) {
      const value = parseFloat(parts[2]);
      if (!Number.isNaN(value)) {
        return value;
      }
    }
  }
  return null;
}

function main(): void {
  const output = runCoverage();
  const lineCoverage = parseCoverage(output);
  if (lineCoverage === null) {
    console.error('Failed to read line coverage summary');
    process.exit(1);
  }

  console.log(`Line coverage: ${lineCoverage.toFixed(2)}%`);
  if (lineCoverage < COVERAGE_THRESHOLD) {
    console.error(`Line coverage ${lineCoverage.toFixed(2)}% is below threshold ${COVERAGE_THRESHOLD}%`);
    process.exit(1);
  }
}

main();
