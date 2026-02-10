import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { describe, test, beforeEach, afterEach, expect } from 'bun:test';
import { createSwarmCommandHandler } from '../../../src/commands';

const FIXTURE_DIR = path.join(process.cwd(), 'tmp', 'swarm-commands-test');

async function cleanupFixture(): Promise<void> {
	await fs.rm(FIXTURE_DIR, { recursive: true, force: true });
}

async function ensureSwarmFiles(): Promise<void> {
	const swarmDir = path.join(FIXTURE_DIR, '.swarm');
	await fs.mkdir(swarmDir, { recursive: true });
}

describe('swarm command handler', () => {
	beforeEach(async () => {
		await cleanupFixture();
	});

	afterEach(async () => {
		await cleanupFixture();
	});

	test('diagnose command reports health status', async () => {
		await ensureSwarmFiles();

		// Write minimal plan.md with required structure
		const planContent = `## Phase 1
- [x] Setup project
- [ ] Implement feature
`;
		await fs.writeFile(
			path.join(FIXTURE_DIR, '.swarm', 'plan.md'),
			planContent,
			'utf-8',
		);

		// Write minimal context.md
		const contextContent = `# Context

## Decisions
- Using TypeScript
`;
		await fs.writeFile(
			path.join(FIXTURE_DIR, '.swarm', 'context.md'),
			contextContent,
			'utf-8',
		);

		const handler = createSwarmCommandHandler(FIXTURE_DIR);
		const output = { parts: [] as Array<{ type: 'text'; text: string }> };

		await handler({ command: 'swarm', args: ['diagnose'] }, output);

		const text = output.parts[0]?.text ?? '';
		expect(text).toContain('Swarm Health Check');
	});

	test('export command outputs JSON payload', async () => {
		await ensureSwarmFiles();

		const planContent = `## Phase 1
- [x] Setup project
- [ ] Implement feature
`;
		await fs.writeFile(
			path.join(FIXTURE_DIR, '.swarm', 'plan.md'),
			planContent,
			'utf-8',
		);

		const contextContent = `# Context

## Decisions
- Using TypeScript
`;
		await fs.writeFile(
			path.join(FIXTURE_DIR, '.swarm', 'context.md'),
			contextContent,
			'utf-8',
		);

		const handler = createSwarmCommandHandler(FIXTURE_DIR);
		const output = { parts: [] as Array<{ type: 'text'; text: string }> };

		await handler({ command: 'swarm', args: ['export'] }, output);

		const text = output.parts[0]?.text ?? '';
		expect(text).toContain('Swarm Export');
		expect(text).toContain('```json');
	});

	test('reset command prompts for confirmation', async () => {
		await ensureSwarmFiles();

		const planContent = `## Phase 1
- [x] Setup project
`;
		await fs.writeFile(
			path.join(FIXTURE_DIR, '.swarm', 'plan.md'),
			planContent,
			'utf-8',
		);

		const handler = createSwarmCommandHandler(FIXTURE_DIR);
		const output = { parts: [] as Array<{ type: 'text'; text: string }> };

		await handler({ command: 'swarm', args: ['reset'] }, output);

		const text = output.parts[0]?.text ?? '';
		expect(text).toContain('Reset Requires Confirmation');
	});

	test('reset command deletes files when confirmed', async () => {
		await ensureSwarmFiles();

		const planContent = `## Phase 1
- [x] Setup project
`;
		await fs.writeFile(
			path.join(FIXTURE_DIR, '.swarm', 'plan.md'),
			planContent,
			'utf-8',
		);

		const contextContent = `# Context
## Decisions
- Using TypeScript
`;
		await fs.writeFile(
			path.join(FIXTURE_DIR, '.swarm', 'context.md'),
			contextContent,
			'utf-8',
		);

		const handler = createSwarmCommandHandler(FIXTURE_DIR);
		const output = { parts: [] as Array<{ type: 'text'; text: string }> };

		await handler({ command: 'swarm', args: ['reset', '--confirm'] }, output);

		const text = output.parts[0]?.text ?? '';
		expect(text).toContain('✅ Removed');

		// Verify files are deleted
		await expect(
			fs.access(path.join(FIXTURE_DIR, '.swarm', 'plan.md')),
		).rejects.toThrow();
		await expect(
			fs.access(path.join(FIXTURE_DIR, '.swarm', 'context.md')),
		).rejects.toThrow();
	});
});
