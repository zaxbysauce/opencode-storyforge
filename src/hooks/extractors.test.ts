import { describe, expect, test } from 'bun:test';
import { extractCurrentPhase, extractIncompleteTasks, extractDecisions } from './extractors';

const plan = `# Project Plan\n\n## Workflow Status\n- [x] Task 1\n- [ ] Task 2\n- [ ] Task 3\n\n## Decisions\n- Decision 1\n- Decision 2`;

describe('extractCurrentPhase', () => {
  test('returns first unchecked task', () => {
    expect(extractCurrentPhase(plan)).toBe('Task 2');
  });

  test('returns null when there are no unchecked tasks', () => {
    expect(extractCurrentPhase('# Plan\n## Workflow Status\n- [x] done')).toBeNull();
  });
});

describe('extractIncompleteTasks', () => {
  test('returns all unchecked tasks', () => {
    expect(extractIncompleteTasks(plan)).toBe('Task 2\nTask 3');
  });

  test('returns null when none exist', () => {
    expect(extractIncompleteTasks('# Plan\n## Workflow Status\n- [x] done')).toBeNull();
  });
});

describe('extractDecisions', () => {
  test('returns the decision list', () => {
    expect(extractDecisions(plan)).toContain('Decision 1');
  });

  test('truncates output when limit provided', () => {
    const longList = '# Decisions\n' + Array.from({ length: 100 }, (_, i) => `- Item ${i}`).join('\n');
    const truncated = extractDecisions(longList, 50);
    expect(truncated?.length).toBeLessThanOrEqual(50);
  });
});
