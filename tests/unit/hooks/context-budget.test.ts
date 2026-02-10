import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { createContextBudgetHook } from '../../../src/hooks/context-budget';
import type { PluginConfig } from '../../../src/config';
import {
	PluginConfigSchema,
	getContextBudgetDefaults,
	type ContextBudgetConfig,
} from '../../../src/config/schema';

const FIXTURE_DIR = path.join(process.cwd(), 'tmp', 'context-budget-test');

async function writeFixture(filename: string, content: string): Promise<void> {
	const swarmDir = path.join(FIXTURE_DIR, '.swarm');
	await fs.mkdir(swarmDir, { recursive: true });
	await fs.writeFile(path.join(swarmDir, filename), content, 'utf-8');
}

function buildConfig(overrides: Partial<ContextBudgetConfig> = {}): PluginConfig {
	const baseBudget: ContextBudgetConfig = {
		...getContextBudgetDefaults(),
		warn: 0.1,
		critical: 0.9,
		max_injection_tokens: 4000,
		model_limits: { default: 100 },
		target_agents: ['architect'],
		...overrides,
	};

	const config = PluginConfigSchema.parse({});
	config.context_budget = baseBudget;
	return config;
}

describe('context budget hook', () => {
	beforeEach(async () => {
		await fs.rm(FIXTURE_DIR, { recursive: true, force: true });
	});

	afterEach(async () => {
		await fs.rm(FIXTURE_DIR, { recursive: true, force: true });
	});

	test('injects warning when warn threshold reached', async () => {
		await writeFixture('plan.md', '# Phase\n- [ ] ' + 'A'.repeat(200));
		await writeFixture('context.md', '# Context\n- Decision: test');

		const config = buildConfig();

		const hook = createContextBudgetHook(config, FIXTURE_DIR);
		const transformer = hook['experimental.chat.system.transform'];
		if (!transformer) throw new Error('transformer missing');

		const output = { system: [] };
		await transformer({ agent: 'architect', model: 'gpt-4' }, output as any);

		expect(output.system.some((entry) => entry.includes('CONTEXT WARNING'))).toBe(true);
	});

	test('injects critical message when critical threshold exceeded', async () => {
		await writeFixture('plan.md', '# Phase\n- [ ] ' + 'B'.repeat(400));
		await writeFixture('context.md', '# Context\n- Decision: critical');

		const config = buildConfig({
			critical: 0.2,
			model_limits: { default: 10 },
		});

		const hook = createContextBudgetHook(config, FIXTURE_DIR);
		const transformer = hook['experimental.chat.system.transform'];
		if (!transformer) throw new Error('transformer missing');

		const output = { system: [] };
		await transformer({ agent: 'architect', model: 'gpt-4' }, output as any);

		expect(output.system.some((entry) => entry.includes('CONTEXT CRITICAL'))).toBe(true);
	});

	test('skips warning when agent not targeted', async () => {
		await writeFixture('plan.md', '# Phase\n- [ ] Task');
		await writeFixture('context.md', '# Context\n- Decision: test');

		const config = buildConfig({
			model_limits: { default: 1 },
		});

		const hook = createContextBudgetHook(config, FIXTURE_DIR);
		const transformer = hook['experimental.chat.system.transform'];
		if (!transformer) throw new Error('transformer missing');

		const output = { system: [] };
		await transformer({ agent: 'qa', model: 'gpt-4' }, output as any);

		expect(output.system).toHaveLength(0);
	});

	test('skips warning when budget disabled', async () => {
		await writeFixture('plan.md', '# Phase\n- [ ] ' + 'A'.repeat(200));
		await writeFixture('context.md', '# Context\n- Decision: test');

		const config = buildConfig({ enabled: false });
		const hook = createContextBudgetHook(config, FIXTURE_DIR);
		const transformer = hook['experimental.chat.system.transform'];
		if (!transformer) throw new Error('transformer missing');

		const output = { system: [] };
		await transformer({ agent: 'architect', model: 'gpt-4' }, output as any);

		expect(output.system).toHaveLength(0);
	});

	test('honors warn_threshold alias', async () => {
		await writeFixture('plan.md', '# Phase\n- [ ] ' + 'A'.repeat(200));
		await writeFixture('context.md', '# Context\n- Decision: alias');

		const config = buildConfig({
			warn: undefined,
			critical: undefined,
			warn_threshold: 0.1,
			critical_threshold: 0.9,
		});

		const hook = createContextBudgetHook(config, FIXTURE_DIR);
		const transformer = hook['experimental.chat.system.transform'];
		if (!transformer) throw new Error('transformer missing');

		const output = { system: [] };
		await transformer({ agent: 'architect', model: 'gpt-4' }, output as any);

		expect(output.system.some((entry) => entry.includes('CONTEXT WARNING'))).toBe(true);
	});

	test('normalizes prefixed agent names', async () => {
		await writeFixture('plan.md', '# Phase\n- [ ] ' + 'A'.repeat(200));
		await writeFixture('context.md', '# Context\n- Decision: normalized');

		const config = buildConfig();
		const hook = createContextBudgetHook(config, FIXTURE_DIR);
		const transformer = hook['experimental.chat.system.transform'];
		if (!transformer) throw new Error('transformer missing');

		const output = { system: [] };
		await transformer({ agent: 'mega_architect', model: 'gpt-4' }, output as any);

		expect(output.system.some((entry) => entry.includes('CONTEXT WARNING'))).toBe(true);
	});

	test('handles missing files gracefully', async () => {
		const config = buildConfig();
		const hook = createContextBudgetHook(config, FIXTURE_DIR);
		const transformer = hook['experimental.chat.system.transform'];
		if (!transformer) throw new Error('transformer missing');

		const output = { system: [] };
		await transformer({ agent: 'architect', model: 'gpt-4' }, output as any);

		expect(output.system).toHaveLength(0);
	});

	test('skips warning when injection limit is exceeded', async () => {
		await writeFixture('plan.md', '# Phase\n- [ ] ' + 'A'.repeat(200));
		await writeFixture('context.md', '# Context\n- Decision: limit');

		const config = buildConfig({ max_injection_tokens: 1 });
		const hook = createContextBudgetHook(config, FIXTURE_DIR);
		const transformer = hook['experimental.chat.system.transform'];
		if (!transformer) throw new Error('transformer missing');

		const output = { system: [] };
		await transformer({ agent: 'architect', model: 'gpt-4' }, output as any);

		expect(output.system).toHaveLength(0);
	});

	test('handles missing system array gracefully', async () => {
		await writeFixture('plan.md', '# Phase\n- [ ] ' + 'A'.repeat(200));
		await writeFixture('context.md', '# Context\n- Decision: systemless');

		const config = buildConfig();
		const hook = createContextBudgetHook(config, FIXTURE_DIR);
		const transformer = hook['experimental.chat.system.transform'];
		if (!transformer) throw new Error('transformer missing');

		const output = {} as unknown as { system?: string[] };
		await transformer({ agent: 'architect', model: 'gpt-4' }, output as any);

		expect(output.system).toHaveLength(1);
	});

	test('does not duplicate warnings on repeated calls', async () => {
		await writeFixture('plan.md', '# Phase\n- [ ] ' + 'A'.repeat(200));
		await writeFixture('context.md', '# Context\n- Decision: repeat');

		const config = buildConfig();
		const hook = createContextBudgetHook(config, FIXTURE_DIR);
		const transformer = hook['experimental.chat.system.transform'];
		if (!transformer) throw new Error('transformer missing');

		const output = { system: [] };
		await transformer({ agent: 'architect', model: 'gpt-4' }, output as any);
		const firstLength = output.system.length;

		await transformer({ agent: 'architect', model: 'gpt-4' }, output as any);

		expect(output.system.length).toBe(firstLength);
	});

	test('skips warning when model limits empty (default cap applies)', async () => {
		await writeFixture('plan.md', '# Phase\n- [ ] ' + 'A'.repeat(200));
		await writeFixture('context.md', '# Context\n- Decision: default-limit');

		const config = buildConfig({ model_limits: {} });
		const hook = createContextBudgetHook(config, FIXTURE_DIR);
		const transformer = hook['experimental.chat.system.transform'];
		if (!transformer) throw new Error('transformer missing');

		const output = { system: [] };
		await transformer({ agent: 'architect', model: 'gpt-4' }, output as any);

		expect(output.system).toHaveLength(0);
	});
});
