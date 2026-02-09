import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import type { AgentConfig as SDKAgentConfig } from '@opencode-ai/sdk';
import { 
	loadPluginConfig,
	loadPrompt,
	loadReference,
	DEFAULT_MODELS,
} from '../../src/config';
import { createAgents } from '../../src/agents';
import {
	ensureAgentMap,
	formatStartupLog,
	getSafeConfigKeys,
	PluginInitConfig,
	WriterSwarmPlugin,
} from '../../src/index';
import { createSystemEnhancerHook } from '../../src/hooks/system-enhancer';
import { log, warn, error } from '../../src/utils/logger';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

const CLEAN_ENV = { ...process.env };

describe('Config Loading', () => {
	test('should load default config when no file exists', () => {
		const config = loadPluginConfig('/tmp/nonexistent');
		expect(config.qa_retry_limit).toBe(3);
		expect(config.file_retry_enabled).toBe(true);
		expect(config.max_file_operation_retries).toBe(3);
	});

	test('should load prompts correctly', () => {
		const prompt = loadPrompt('editor-in-chief');
		expect(prompt).toContain('You are the editor-in-chief');
	});

	test('should load references correctly', () => {
		const ref = loadReference('slop-dictionary');
		expect(ref).toContain('# AI Slop Dictionary');
	});
});

describe('Agent Creation', () => {
	test('should create all 7 agents by default', () => {
		const agents = createAgents();
		expect(agents.length).toBe(7);

		const names = agents.map((agent) => agent.name);
		expect(names).toContain('editor_in_chief');
		expect(names).toContain('writer');
		expect(names).toContain('researcher');
		expect(names).toContain('section_editor');
		expect(names).toContain('copy_editor');
		expect(names).toContain('fact_checker');
		expect(names).toContain('reader_advocate');
	});

	test('should respect model overrides', () => {
		const config = {
			agents: {
				writer: {
					model: 'custom/model',
				},
			},
		};

		const agents = createAgents(config);
		const writer = agents.find((a) => a.name === 'writer');
		expect(writer?.config.model).toBe('custom/model');
	});
});

describe('getSafeConfigKeys', () => {
	afterEach(() => {
		process.env.LOG_REDACTION_ENABLED = CLEAN_ENV.LOG_REDACTION_ENABLED;
	});

	test('filters secret keys when redaction enabled', () => {
		process.env.LOG_REDACTION_ENABLED = '1';
		const config = {
			visible: 'ok',
			secret_KEY: 'hide',
			deploy_SECRET: 'hide',
			token_TOKEN: 'hide',
		};

		const keys = getSafeConfigKeys(config as any);
		expect(keys).toEqual(['visible']);
	});

	test('returns all keys when redaction disabled', () => {
		process.env.LOG_REDACTION_ENABLED = 'false';
		const config = { alpha: 1, beta_KEY: 2 };
		const keys = getSafeConfigKeys(config as any);
		expect(keys).toEqual(['alpha', 'beta_KEY']);
	});
});

describe('formatStartupLog', () => {
	test('builds a sanitized banner', () => {
		const logMessage = formatStartupLog(2, ['alpha', 'beta'], process.cwd());
		expect(logMessage).toContain('agents=2');
		expect(logMessage).toContain('configKeys=alpha,beta');
		expect(logMessage).toContain('directory=.');
	});
});

describe('ensureAgentMap', () => {
	const agents: Record<string, SDKAgentConfig> = { primary: {} as SDKAgentConfig };

	test('logs a warning and injects defaults when agent map is missing', () => {
		const warnings: Array<{ message: string; data?: unknown }> = [];
		const config: PluginInitConfig = {};

		ensureAgentMap(config, agents, (message, data) => warnings.push({ message, data }));

		expect(warnings).toHaveLength(1);
		expect(warnings[0].message).toBe('Missing config.agent - injecting defaults');
		expect(config.agent).toEqual(agents);
	});

	test('uses existing agent map without logging a warning', () => {
		const warnings: Array<{ message: string; data?: unknown }> = [];
		const config: PluginInitConfig = { agent: { existing: {} as SDKAgentConfig } };

		ensureAgentMap(config, agents, (message, data) => warnings.push({ message, data }));

		expect(warnings).toHaveLength(0);
		expect(config.agent?.existing).toBeDefined();
	});
});

describe('WriterSwarmPlugin', () => {
	test('initializes plugin and injects defaults', async () => {
		const plugin = await WriterSwarmPlugin({
			client: {} as any,
			project: {} as any,
			directory: process.cwd(),
		});

		expect(plugin.name).toBe('OpenCode-StoryForge');
		expect(plugin.agent).toBeDefined();
		expect(plugin.tool?.read_writer_file).toBeDefined();

		const config: PluginInitConfig = {};
		await plugin.config?.(config);
		expect(config.agent).toBeDefined();
	});
});

describe('system enhancer hook', () => {
	const FIXTURE_DIR = path.join(process.cwd(), 'tmp', 'system-enhancer-test');

	async function writeFixture(filename: string, content: string): Promise<void> {
		const writerDir = path.join(FIXTURE_DIR, '.writer');
		await fs.mkdir(writerDir, { recursive: true });
		await fs.writeFile(path.join(writerDir, filename), content, 'utf-8');
	}

	beforeEach(async () => {
		await fs.rm(FIXTURE_DIR, { recursive: true, force: true });
	});

	afterEach(async () => {
		await fs.rm(FIXTURE_DIR, { recursive: true, force: true });
	});

	test('appends context entries when files exist', async () => {
		await writeFixture('plan.md', '# Plan\n\n## Workflow Status\n- [ ] Task 1');
		await writeFixture('context.md', '# Context\n\n## Decisions\n- Decision: Test');

		const hook = createSystemEnhancerHook({}, FIXTURE_DIR);
		const transformer = hook['experimental.chat.system.transform'];
		if (!transformer) throw new Error('Transformer missing');

		const output = { system: [] };
		await transformer({}, output as any);
		expect(output.system.some((entry) => entry.includes('[WRITER SWARM CONTEXT]'))).toBe(true);
	});
});

describe('logger utilities', () => {
	const originalLog = console.log;
	const originalWarn = console.warn;
	const originalError = console.error;

	beforeEach(() => {
		process.env.OPENCODE_WRITER_SWARM_DEBUG = '1';
		console.log = () => {};
		console.warn = () => {};
		console.error = () => {};
	});

	afterEach(() => {
		process.env.OPENCODE_WRITER_SWARM_DEBUG = undefined;
		console.log = originalLog;
		console.warn = originalWarn;
		console.error = originalError;
	});

	test('log emits when debug enabled', () => {
		let captured = false;
		console.log = (message) => {
			captured = true;
			expect((message as string)).toContain('opencode-writer-swarm');
		};
		log('hi', {});
		expect(captured).toBe(true);
	});

	test('warn outputs WARN prefix', () => {
		let captured = false;
		console.warn = (message) => {
			captured = true;
			expect((message as string)).toContain('WARN');
		};
		warn('alert');
		expect(captured).toBe(true);
	});

	test('error outputs ERROR prefix', () => {
		let captured = false;
		console.error = (message) => {
			captured = true;
			expect((message as string)).toContain('ERROR');
		};
		error('oops');
		expect(captured).toBe(true);
	});
});
