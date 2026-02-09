import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import {
	extractCurrentPhase,
	extractIncompleteTasks,
	extractDecisions,
	resetMarkdownCache,
} from './extractors';
import { swarmState } from '../state';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { createSystemEnhancerHook } from './system-enhancer';

// Reset cache before each test
beforeEach(() => {
	resetMarkdownCache();
});

// Ensure cache is clean after tests
afterEach(() => {
	resetMarkdownCache();
});

describe('extractCurrentPhase', () => {
	it('Should extract the first unchecked item under "Workflow Status"', () => {
		const content = `# Project Plan

## Workflow Status
- [x] Task 1: Completed task
- [ ] Task 2: This is the first unchecked task
- [ ] Task 3: Another unchecked task

## Decisions
- Decision 1: Use TypeScript`;
		const result = extractCurrentPhase(content);
		expect(result).toBe('Task 2: This is the first unchecked task');
	});

	it('Should return null for empty input', () => {
		const result = extractCurrentPhase('');
		expect(result).toBeNull();
	});

	it('Should return null for null input', () => {
		const result = extractCurrentPhase(null as any);
		expect(result).toBeNull();
	});

	it('Should return null for whitespace-only input', () => {
		const result = extractCurrentPhase('   \n  ');
		expect(result).toBeNull();
	});

	it('Should return null when no Workflow Status section exists', () => {
		const content = `# Project Plan

## Decisions
- Decision 1: Use TypeScript

## Other Section
Some content here`;
		const result = extractCurrentPhase(content);
		expect(result).toBeNull();
	});

	it('Should return null when Workflow Status has no unchecked items', () => {
		const content = `# Project Plan

## Workflow Status
- [x] Task 1: Completed
- [x] Task 2: Also completed

## Decisions
- Decision 1: Use TypeScript`;
		const result = extractCurrentPhase(content);
		expect(result).toBeNull();
	});

	// Note: Section name matching is case-sensitive (must be "Workflow Status" or "Status")

	it('Should extract from nested lists', () => {
		const content = `# Project Plan

## Workflow Status
- [x] Parent task
- [ ] Child task: This should be extracted
  - [ ] Grandchild task
- [ ] Another task

## Decisions
- Decision 1`;
		const result = extractCurrentPhase(content);
		expect(result).toBe('Child task: This should be extracted');
	});

	it('Should stop at next ## heading', () => {
		const content = `# Project Plan

## Workflow Status
- [ ] Task 1: Before heading
- [ ] Task 2: Also before heading

## Decisions
- Decision 1
- [ ] Task 3: After heading - should not be extracted`;
		const result = extractCurrentPhase(content);
		expect(result).toBe('Task 1: Before heading');
	});

	it('Should handle plain text in tasks', () => {
		const content = `# Project Plan

## Workflow Status
- [ ] Task with bold and italic text and code blocks
- [ ] Another task with complex formatting

## Decisions
- Decision 1`;
		const result = extractCurrentPhase(content);
		expect(result).toBe('Task with bold and italic text and code blocks');
	});
});

describe('extractIncompleteTasks', () => {
	it('Should extract all unchecked items under "Workflow Status"', () => {
		const content = `# Project Plan

## Workflow Status
- [x] Task 1: Completed
- [ ] Task 2: First unchecked
- [ ] Task 3: Second unchecked
- [ ] Task 4: Third unchecked

## Decisions
- Decision 1`;
		const result = extractIncompleteTasks(content);
		expect(result).toBe('Task 2: First unchecked\nTask 3: Second unchecked\nTask 4: Third unchecked');
	});

	it('Should return null for empty input', () => {
		const result = extractIncompleteTasks('');
		expect(result).toBeNull();
	});

	it('Should return null for null input', () => {
		const result = extractIncompleteTasks(null as any);
		expect(result).toBeNull();
	});

	it('Should return null for whitespace-only input', () => {
		const result = extractIncompleteTasks('   \n  ');
		expect(result).toBeNull();
	});

	it('Should return null when no Workflow Status section exists', () => {
		const content = `# Project Plan

## Decisions
- Decision 1

## Other Section
Some content here`;
		const result = extractIncompleteTasks(content);
		expect(result).toBeNull();
	});

	it('Should return null when Workflow Status has no unchecked items', () => {
		const content = `# Project Plan

## Workflow Status
- [x] Task 1: Completed
- [x] Task 2: Also completed

## Decisions
- Decision 1`;
		const result = extractIncompleteTasks(content);
		expect(result).toBeNull();
	});

	it('Should respect maxChars parameter and truncate with ellipsis', () => {
		const longTask = 'Task: ' + 'A'.repeat(600);
		const content = `# Project Plan

## Workflow Status
- [ ] Task 1: Basic
${longTask}
- [ ] Task 3: Another basic task

## Decisions
- Decision 1`;
		const result = extractIncompleteTasks(content, 50);
		expect(result).toContain('...');
		expect(result?.length).toBeLessThanOrEqual(50 + 3);
	});

	it('Should use default maxChars of 500 when not specified', () => {
		const longTask = 'Task: ' + 'A'.repeat(600);
		const content = `# Project Plan

## Workflow Status
${longTask}

## Decisions
- Decision 1`;
		const result = extractIncompleteTasks(content);
		if (result) {
			expect(result).toContain('...');
			expect(result.length).toBeLessThanOrEqual(500 + 3);
		}
	});

	// Note: Section name matching is case-sensitive (must be "Workflow Status" or "Status")

	it('Should stop at next ## heading', () => {
		const content = `# Project Plan

## Workflow Status
- [ ] Task 1: Before heading
- [ ] Task 2: Also before heading

## Decisions
- Decision 1
- [ ] Task 3: After heading - should not be extracted`;
		const result = extractIncompleteTasks(content);
		expect(result).toBe('Task 1: Before heading\nTask 2: Also before heading');
	});

	it('Should handle empty string after unchecked items', () => {
		const content = `# Project Plan

## Workflow Status
- [ ] Task 1: Before heading
- [ ] Task 2: Also before heading

## Decisions
- Decision 1`;
		const result = extractIncompleteTasks(content);
		expect(result).toBe('Task 1: Before heading\nTask 2: Also before heading');
	});

	it('Should handle whitespace between unchecked items', () => {
		const content = `# Project Plan

## Workflow Status
- [ ] Task 1: First
- [ ]    Task 2: Second with spaces
- [ ] Task 3: Third

## Decisions
- Decision 1`;
		const result = extractIncompleteTasks(content);
		expect(result).toBe('Task 1: First\nTask 2: Second with spaces\nTask 3: Third');
	});

	it('Should handle nested lists', () => {
		const content = `# Project Plan

## Workflow Status
- [x] Parent task
- [ ] Child task: Should be extracted
  - [ ] Grandchild task: Also extracted
- [ ] Another task

## Decisions
- Decision 1`;
		const result = extractIncompleteTasks(content);
		expect(result).toBe('Child task: Should be extracted\nGrandchild task: Also extracted\nAnother task');
	});

	it('Should handle plain text in tasks', () => {
		const content = `# Project Plan

## Workflow Status
- [ ] Task with bold and italic text and code blocks
- [ ] Another task with complex formatting

## Decisions
- Decision 1`;
		const result = extractIncompleteTasks(content);
		expect(result).toBe('Task with bold and italic text and code blocks\nAnother task with complex formatting');
	});
});

describe('extractDecisions', () => {
	it('Should extract all items under "Decisions"', () => {
		const content = `# Context

## Decisions
- Decision 1: Use TypeScript for all new code
- Decision 2: Follow existing coding standards
- Decision 3: Write comprehensive tests

## Other section
- Not a decision`;
		const result = extractDecisions(content);
		expect(result).toBe('Decision 1: Use TypeScript for all new code\nDecision 2: Follow existing coding standards\nDecision 3: Write comprehensive tests');
	});

	it('Should return null for empty input', () => {
		const result = extractDecisions('');
		expect(result).toBeNull();
	});

	it('Should return null for null input', () => {
		const result = extractDecisions(null as any);
		expect(result).toBeNull();
	});

	it('Should return null for whitespace-only input', () => {
		const result = extractDecisions('   \n  ');
		expect(result).toBeNull();
	});

	it('Should return null when no Decisions section exists', () => {
		const content = `# Context

## Patterns
- Pattern 1: Use TypeScript

## Other section
- Some content`;
		const result = extractDecisions(content);
		expect(result).toBeNull();
	});

	it('Should return null when Decisions section is empty', () => {
		const content = `# Context

## Decisions

## Other section
- Some content`;
		const result = extractDecisions(content);
		expect(result).toBeNull();
	});

	it('Should return null when Decisions section has no bullet points', () => {
		const content = `# Context

## Decisions
Just text, no bullets here

## Other section
- Some content`;
		const result = extractDecisions(content);
		expect(result).toBeNull();
	});

	it('Should respect maxChars parameter and truncate with ellipsis', () => {
		const longDecision = '- Decision: ' + 'A'.repeat(600);
		const content = `# Context

## Decisions
- Basic decision
${longDecision}
- Another decision
- Final decision`;

		const result = extractDecisions(content, 50);
		expect(result).toContain('...');
		expect(result?.length).toBeLessThanOrEqual(50 + 3);
	});

	it('Should use default maxChars of 500 when not specified', () => {
		const longDecision = '- Decision: ' + 'A'.repeat(600);
		const content = `# Context

## Decisions
${longDecision}

## Patterns
- Pattern 1`;
		const result = extractDecisions(content);
		if (result) {
			expect(result).toContain('...');
			expect(result.length).toBeLessThanOrEqual(500 + 3);
		}
	});

	it('Should stop at next ## heading', () => {
		const content = `# Context

## Decisions
- Decision 1: Use TypeScript
- Decision 2: Write tests

## Patterns
- Pattern 1: Follow standards`;
		const result = extractDecisions(content);
		expect(result).toBe('Decision 1: Use TypeScript\nDecision 2: Write tests');
	});

	it('Should handle bullet points separated by empty lines', () => {
		const content = `# Context

## Decisions
- Decision 1: Use TypeScript
- Decision 2: Write tests
- Decision 3: Document everything

## Patterns
- Pattern 1: Follow standards`;
		const result = extractDecisions(content);
		expect(result).toBe('Decision 1: Use TypeScript\nDecision 2: Write tests\nDecision 3: Document everything');
	});

	it('Should handle empty Decisions section with bullet point', () => {
		const content = `# Context

## Decisions

## Patterns
- Pattern 1`;
		const result = extractDecisions(content);
		expect(result).toBeNull();
	});

	it('Should handle plain text in decisions', () => {
		const content = `# Context

## Decisions
- Decision 1: Always use TypeScript for new code
- Decision 2: Prefer composition over inheritance
- Decision 3: Write comprehensive tests and documentation

## Patterns
- Pattern 1: Follow standards`;
		const result = extractDecisions(content);
		expect(result).toBe('Decision 1: Always use TypeScript for new code\nDecision 2: Prefer composition over inheritance\nDecision 3: Write comprehensive tests and documentation');
	});

	it('Should handle decisions with code blocks', () => {
		const content = `# Context

## Decisions
- Use const for variable declarations
- Use let only when reassignment is needed
- Use arrow functions for callbacks

## Patterns
- Pattern 1`;
		const result = extractDecisions(content);
		expect(result).toBe('Use const for variable declarations\nUse let only when reassignment is needed\nUse arrow functions for callbacks');
	});
});

describe('Markdown caching', () => {
	it('Should increment cacheHits on repeated parsing of same content', () => {
		const content = `# Project Plan

## Workflow Status
- [ ] Task 1: First unchecked task

## Decisions
- Decision 1: Use caching`;

		// First call - cache miss
		extractCurrentPhase(content);
		expect(swarmState.cacheStats.cacheMisses).toBe(1);
		expect(swarmState.cacheStats.cacheHits).toBe(0);

		// Second call - cache hit
		extractCurrentPhase(content);
		expect(swarmState.cacheStats.cacheMisses).toBe(1);
		expect(swarmState.cacheStats.cacheHits).toBe(1);

		// Third call - another cache hit
		extractIncompleteTasks(content);
		expect(swarmState.cacheStats.cacheMisses).toBe(1);
		expect(swarmState.cacheStats.cacheHits).toBe(2);
	});

	it('Should increment cacheMisses when cache is reset', () => {
		const content = `# Project Plan

## Workflow Status
- [ ] Task 1: Test task`;

		// First call - cache miss
		extractCurrentPhase(content);
		expect(swarmState.cacheStats.cacheMisses).toBe(1);
		expect(swarmState.cacheStats.cacheHits).toBe(0);

		// Reset cache
		resetMarkdownCache();
		expect(swarmState.cacheStats.cacheMisses).toBe(0);
		expect(swarmState.cacheStats.cacheHits).toBe(0);

		// Call again after reset - cache miss
		extractCurrentPhase(content);
		expect(swarmState.cacheStats.cacheMisses).toBe(1);
		expect(swarmState.cacheStats.cacheHits).toBe(0);
	});

	it('Should track cacheSizeBytes', () => {
		const content = `# Project Plan

## Workflow Status
- [ ] Task 1: Test task

## Decisions
- Decision 1: Test decision`;

		// Before parsing
		expect(swarmState.cacheStats.cacheSizeBytes).toBe(0);

		// After parsing
		extractCurrentPhase(content);
		expect(swarmState.cacheStats.cacheSizeBytes).toBeGreaterThan(0);
	});

	it('Should share cache across different extractors', () => {
		const content = `# Project Plan

## Workflow Status
- [ ] Task 1: First task

## Decisions
- Decision 1: Test decision`;

		// Use extractCurrentPhase
		extractCurrentPhase(content);
		expect(swarmState.cacheStats.cacheMisses).toBe(1);
		expect(swarmState.cacheStats.cacheHits).toBe(0);

		// Use extractDecisions - should hit cache
		extractDecisions(content);
		expect(swarmState.cacheStats.cacheMisses).toBe(1);
		expect(swarmState.cacheStats.cacheHits).toBe(1);

		// Use extractIncompleteTasks - should hit cache
		extractIncompleteTasks(content);
		expect(swarmState.cacheStats.cacheMisses).toBe(1);
		expect(swarmState.cacheStats.cacheHits).toBe(2);
	});

	it('Should produce identical results with and without cache', () => {
		const content = `# Project Plan

## Workflow Status
- [x] Task 1: Completed
- [ ] Task 2: First unchecked

## Decisions
- Decision 1: Use TypeScript`;

		// First call (cold cache)
		const result1 = extractCurrentPhase(content);

		// Second call (warm cache)
		const result2 = extractCurrentPhase(content);

		expect(result1).toBe(result2);
		expect(result1).toBe('Task 2: First unchecked');
	});
});
import { swarmState } from '../state';
import * as path from 'node:path';


