// @ts-nocheck
import { describe, expect, it, vi, beforeEach, afterEach } from 'bun:test';

import { deepMerge, logConfigLoadError, type ConfigLoadErrorLog, type DeepMergeOptions } from '../config/loader';
import {
	getConfigValidationEnabled,
	getContextBudgetDefaults,
	getEvidenceDefaults,
	getGuardrailsDefaults,
	getHooksDefaults,
	PluginConfigSchema,
	ContextBudgetConfigSchema,
	EvidenceConfigSchema,
	GuardrailsConfigSchema,
	HooksConfigSchema,
	type ContextBudgetConfig,
	type EvidenceConfig,
	type GuardrailsConfig,
	type HooksConfig,
} from './schema';

describe('deepMerge', () => {
	describe('Happy path', () => {
		it('should merge simple objects', () => {
			const base = { a: 1, b: 2 };
			const override = { b: 3, c: 4 };
			const result = deepMerge(base, override);

			expect(result).toEqual({ a: 1, b: 3, c: 4 });
		});

		it('should merge nested objects', () => {
			const base = { a: { b: 1, c: 2 } };
			const override = { a: { c: 3, d: 4 } };
			const result = deepMerge(base, override);

			expect(result).toEqual({ a: { b: 1, c: 3, d: 4 } });
		});

		it('should merge deeply nested objects', () => {
			const base = { a: { b: { c: 1 } } };
			const override = { a: { b: { d: 2 } } };
			const result = deepMerge(base, override);

			expect(result).toEqual({ a: { b: { c: 1, d: 2 } } });
		});

		it('should merge arrays by replacing', () => {
			const base = { a: [1, 2, 3] };
			const override = { a: [4, 5] };
			const result = deepMerge(base, override);

			expect(result).toEqual({ a: [4, 5] });
		});

		it('should replace arrays at any level', () => {
			const base = { a: { b: [1, 2, 3] } };
			const override = { a: { b: [4, 5] } };
			const result = deepMerge(base, override);

			expect(result).toEqual({ a: { b: [4, 5] } });
		});
	});

	describe('Override precedence', () => {
		it('should give override values precedence for primitive values', () => {
			const base = { a: 1 };
			const override = { a: 2 };
			const result = deepMerge(base, override);

			expect(result).toEqual({ a: 2 });
		});

		it('should give override objects precedence over nested merges', () => {
			const base = { a: { b: 1 } };
			const override = { a: { c: 2 } };
			const result = deepMerge(base, override);

			// deepMerge merges nested objects, not replaces them
			expect(result).toEqual({ a: { b: 1, c: 2 } });
		});

		it('should give override arrays precedence over merging', () => {
			const base = { a: [1, 2] };
			const override = { a: [3, 4] };
			const result = deepMerge(base, override);

			expect(result).toEqual({ a: [3, 4] });
		});
	});

	describe('Null and undefined handling', () => {
		it('should return undefined when base is undefined', () => {
			const base = undefined as any;
			const override = { a: 1 };
			const result = deepMerge(base, override);

			expect(result).toEqual({ a: 1 });
		});

		it('should return base when override is undefined', () => {
			const base = { a: 1, b: 2 };
			const override = undefined as any;
			const result = deepMerge(base, override);

			expect(result).toEqual({ a: 1, b: 2 });
		});

		it('should return base when both are undefined', () => {
			const base = undefined as any;
			const override = undefined as any;
			const result = deepMerge(base, override);

			expect(result).toBeUndefined();
		});

		it('should handle null in base', () => {
			const base = null as any;
			const override = { a: 1 };
			const result = deepMerge(base, override);

			expect(result).toEqual({ a: 1 });
		});

		it('should handle null in override', () => {
			const base = { a: 1 };
			const override = null as any;
			const result = deepMerge(base, override);

			// When override is null, null takes precedence
			expect(result).toBeNull();
		});

		it('should handle null values in objects', () => {
			const base = { a: null, b: 2 };
			const override = { a: 1, c: 3 };
			const result = deepMerge(base, override);

			expect(result).toEqual({ a: 1, b: 2, c: 3 });
		});

		it('should handle undefined values in objects', () => {
			const base = { a: undefined as any, b: 2 };
			const override = { a: 1, c: 3 };
			const result = deepMerge(base, override);

			expect(result).toEqual({ a: 1, b: 2, c: 3 });
		});
	});

	describe('Edge cases', () => {
		it('should handle empty objects', () => {
			const base = {};
			const override = { a: 1 };
			const result = deepMerge(base, override);

			expect(result).toEqual({ a: 1 });
		});

		it('should handle empty override objects', () => {
			const base = { a: 1 };
			const override = {};
			const result = deepMerge(base, override);

			expect(result).toEqual({ a: 1 });
		});

		it('should handle objects with mixed types', () => {
			const base = { a: 1, b: 'hello', c: true, d: [1, 2] };
			const override = { a: 2, b: 'world', e: null };
			const result = deepMerge(base, override);

			expect(result).toEqual({ a: 2, b: 'world', c: true, d: [1, 2], e: null });
		});

		it('should handle objects with only override keys', () => {
			const base = {};
			const override = { a: 1, b: 2 };
			const result = deepMerge(base, override);

			expect(result).toEqual({ a: 1, b: 2 });
		});

		it('should handle objects with only base keys', () => {
			const base = { a: 1, b: 2 };
			const override = {};
			const result = deepMerge(base, override);

			expect(result).toEqual({ a: 1, b: 2 });
		});

		it('should preserve non-object values', () => {
			const base = { a: 1, b: 'test', c: true, d: null };
			const override = { b: 'changed', e: false };
			const result = deepMerge(base, override);

			expect(result).toEqual({ a: 1, b: 'changed', c: true, d: null, e: false });
		});

		it('should not merge arrays (replace)', () => {
			const base = { a: [1, 2, 3] };
			const override = { a: [4, 5, 6] };
			const result = deepMerge(base, override);

			expect(result).toEqual({ a: [4, 5, 6] });
		});

		it('should not merge nested arrays', () => {
			const base = { a: { b: [1, 2] } };
			const override = { a: { b: [3, 4] } };
			const result = deepMerge(base, override);

			expect(result).toEqual({ a: { b: [3, 4] } });
		});
	});

	describe('Prototype pollution guard', () => {
		afterEach(() => {
			delete process.env.CONFIG_VALIDATION_ENABLED;
		});

		it('should skip __proto__ when filtering is enabled', () => {
			const base = { a: { existing: true } };
			const override = { a: { constructor: { hacked: true }, newProp: true } };
			const result = deepMerge(base, override, { enforceKeyFiltering: true });
			expect(result).toEqual({ a: { existing: true, newProp: true } });
			expect(result?.a?.constructor).toBe(Object);
			expect((result?.a as any).constructor?.hacked).toBeUndefined();
		});

		it('should allow __proto__ when filtering is disabled', () => {
			const base = { a: {} };
			const override = { a: { constructor: { hacked: true } } };
			const result = deepMerge(base, override, { enforceKeyFiltering: false });
			expect((result?.a as any).constructor.hacked).toBe(true);
			expect(result?.a?.constructor).not.toBe(Object);
		});

		it('should respect CONFIG_VALIDATION_ENABLED env flag', () => {
			process.env.CONFIG_VALIDATION_ENABLED = 'false';
			expect(getConfigValidationEnabled()).toBe(false);
			process.env.CONFIG_VALIDATION_ENABLED = 'true';
			expect(getConfigValidationEnabled()).toBe(true);
		});
	});
});

describe('logConfigLoadError', () => {
	interface LogCapture {
		message: string;
		args: unknown[];
	}

	let capturedLogs: LogCapture[] = [];
	let originalWarn: typeof console.warn;

	beforeEach(() => {
		capturedLogs = [];
		originalWarn = console.warn;
		console.warn = (...args: unknown[]) => {
			capturedLogs.push({ message: String(args[0]), args: args.slice(1) });
		};
	});

	afterEach(() => {
		capturedLogs = [];
		console.warn = originalWarn;
	});

	describe('structured error logging', () => {
		it('should log structured error with Error instance', () => {
			const filePath = '/test/config.json';
			const error = new Error('Test error message');
			(error as any).code = 'ENOENT';

			logConfigLoadError(filePath, error);

		expect(capturedLogs).toHaveLength(1);
		const logRecord = capturedLogs[0];
		expect(logRecord.message).toContain('Config load error');
		expect(logRecord.args.length).toBeGreaterThanOrEqual(1);

		const logEntry = logRecord.args[0] as ConfigLoadErrorLog;

		expect(logEntry.filePath).toBe(filePath);
		expect(logEntry.errorCode).toBe('ENOENT');
		expect(logEntry.errorName).toBe('Error');
		expect(logEntry.message).toBe('Test error message');
		expect(logEntry.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z$/);
		});

		it('should log structured error without error code', () => {
			const filePath = '/test/config.json';
			const error = new Error('Parse error');

			logConfigLoadError(filePath, error);

		expect(capturedLogs).toHaveLength(1);
		const logRecord = capturedLogs[0];
		expect(logRecord.args.length).toBeGreaterThanOrEqual(1);
		const logEntry = logRecord.args[0] as ConfigLoadErrorLog;

		expect(logEntry.filePath).toBe(filePath);
		expect(logEntry.errorCode).toBeNull();
		expect(logEntry.errorName).toBe('Error');
		expect(logEntry.message).toBe('Parse error');
		});

		it('should log structured error with non-Error value', () => {
			const filePath = '/test/config.json';
			const error = 'String error message';

			logConfigLoadError(filePath, error);

		expect(capturedLogs).toHaveLength(1);
		const logRecord = capturedLogs[0];
		expect(logRecord.args.length).toBeGreaterThanOrEqual(1);
		const logEntry = logRecord.args[0] as ConfigLoadErrorLog;

		expect(logEntry.filePath).toBe(filePath);
		expect(logEntry.errorCode).toBeNull();
		expect(logEntry.errorName).toBe('UnknownError');
		expect(logEntry.message).toBe('String error message');
		});

		it('should log structured error with number', () => {
			const filePath = '/test/config.json';
			const error = 42;

			logConfigLoadError(filePath, error);

		expect(capturedLogs).toHaveLength(1);
		const logRecord = capturedLogs[0];
		expect(logRecord.args.length).toBeGreaterThanOrEqual(1);
		const logEntry = logRecord.args[0] as ConfigLoadErrorLog;

		expect(logEntry.filePath).toBe(filePath);
		expect(logEntry.errorCode).toBeNull();
		expect(logEntry.errorName).toBe('UnknownError');
		expect(logEntry.message).toBe('42');
		});

		it('should log structured error with object', () => {
			const filePath = '/test/config.json';
			const error = { custom: 'error' };

			logConfigLoadError(filePath, error);

		expect(capturedLogs).toHaveLength(1);
		const logRecord = capturedLogs[0];
		expect(logRecord.args.length).toBeGreaterThanOrEqual(1);
		const logEntry = logRecord.args[0] as ConfigLoadErrorLog;

		expect(logEntry.filePath).toBe(filePath);
		expect(logEntry.errorCode).toBeNull();
		expect(logEntry.errorName).toBe('UnknownError');
		expect(logEntry.message).toBe('[object Object]');
		});
	});
});

describe('deepMerge prototype pollution protection', () => {
	let originalEnv: string | undefined;

	beforeEach(() => {
		originalEnv = process.env.CONFIG_VALIDATION_ENABLED;
	});

	afterEach(() => {
		if (originalEnv === undefined) {
			delete process.env.CONFIG_VALIDATION_ENABLED;
		} else {
			process.env.CONFIG_VALIDATION_ENABLED = originalEnv;
		}
	});

	describe('with enforceKeyFiltering enabled (default)', () => {
		it('should block __proto__ key injection', () => {
			const base = { a: 1 };
			const override = { ['__proto__']: { isAdmin: true } };
			const result = deepMerge(base, override, { enforceKeyFiltering: true });

			expect(result).toEqual({ a: 1 });
			// Verify __proto__ was not polluted
			expect(({} as any).isAdmin).toBeUndefined();
		});

		it('should block constructor key injection', () => {
			const base = { a: 1 };
			const override = { constructor: { prototype: { isAdmin: true } } };
			const result = deepMerge(base, override, { enforceKeyFiltering: true });

			expect(result).toEqual({ a: 1 });
			// Verify prototype was not polluted
			expect(({} as any).isAdmin).toBeUndefined();
		});

		it('should block prototype key injection', () => {
			const base = { a: 1 };
			const override = { prototype: { isAdmin: true } };
			const result = deepMerge(base, override, { enforceKeyFiltering: true });

			expect(result).toEqual({ a: 1 });
			expect(({} as any).isAdmin).toBeUndefined();
		});

		it('should block nested prototype pollution attempts', () => {
			const base = { user: { name: 'test' } };
			const override = { user: { ['__proto__']: { isAdmin: true } } };
			const result = deepMerge(base, override, { enforceKeyFiltering: true });

			expect(result).toEqual({ user: { name: 'test' } });
			expect(({} as any).isAdmin).toBeUndefined();
		});

		it('should still merge legitimate keys when filtering is enabled', () => {
			const base = { a: 1, b: 2 };
			const override = { b: 3, c: 4 };
			const result = deepMerge(base, override, { enforceKeyFiltering: true });

			expect(result).toEqual({ a: 1, b: 3, c: 4 });
		});

		it('should filter forbidden keys at any nesting level', () => {
			const base = { level1: { level2: { value: 'safe' } } };
			const override = {
				level1: {
					level2: {
						['__proto__']: { polluted: true },
						newValue: 'added',
					},
				},
			};
			const result = deepMerge(base, override, { enforceKeyFiltering: true });

			expect(result).toEqual({
				level1: { level2: { value: 'safe', newValue: 'added' } },
			});
			expect(({} as any).polluted).toBeUndefined();
		});
	});

	describe('with enforceKeyFiltering disabled', () => {
		it('should allow __proto__ key when filtering is disabled', () => {
			const base = { a: 1 };
			const override = { ['__proto__']: { isAdmin: true } };
			const result = deepMerge(base, override, { enforceKeyFiltering: false });

			// The key should be present in the result object
			expect(result).toHaveProperty('__proto__');
			expect((result as any).__proto__.isAdmin).toBe(true);
		});

		it('should allow constructor key when filtering is disabled', () => {
			const base = { a: 1 };
			const override = { constructor: { isAdmin: true } };
			const result = deepMerge(base, override, { enforceKeyFiltering: false });

			expect(result).toHaveProperty('constructor');
			expect((result as any).constructor.isAdmin).toBe(true);
		});

		it('should allow prototype key when filtering is disabled', () => {
			const base = { a: 1 };
			const override = { prototype: { isAdmin: true } };
			const result = deepMerge(base, override, { enforceKeyFiltering: false });

			expect(result).toHaveProperty('prototype');
			expect((result as any).prototype.isAdmin).toBe(true);
		});
	});

	describe('default behavior (no options provided)', () => {
		it('should block forbidden keys by default when no options provided', () => {
			const base = { a: 1 };
			const override = { ['__proto__']: { isAdmin: true } };
			const result = deepMerge(base, override);

			// Without explicit enforceKeyFiltering, it defaults to true (secure by default)
			expect(result).toEqual({ a: 1 });
			expect(({} as any).isAdmin).toBeUndefined();
		});
	});
});

describe('Phase 2.1 Config Schema Defaults', () => {
	describe('ContextBudgetConfigSchema', () => {
		it('should have correct default values', () => {
			const result = ContextBudgetConfigSchema.parse({});
			expect(result.warn).toBe(0.7);
			expect(result.critical).toBe(0.9);
			expect(result.max_injection_tokens).toBe(4000);
			expect(result.model_limits).toEqual({ default: 128000 });
			expect(result.target_agents).toEqual(['architect']);
		});

		it('should allow custom values to override defaults', () => {
			const customConfig = {
				warn: 0.8,
				critical: 0.95,
				max_injection_tokens: 2000,
				model_limits: { default: 64000, gpt4: 8192 },
				target_agents: ['reviewer', 'coder'],
			};
			const result = ContextBudgetConfigSchema.parse(customConfig);
			expect(result.warn).toBe(0.8);
			expect(result.critical).toBe(0.95);
			expect(result.max_injection_tokens).toBe(2000);
			expect(result.model_limits).toEqual({ default: 64000, gpt4: 8192 });
			expect(result.target_agents).toEqual(['reviewer', 'coder']);
		});

		it('should reject invalid warn values', () => {
			expect(() => ContextBudgetConfigSchema.parse({ warn: 1.5 })).toThrow();
			expect(() => ContextBudgetConfigSchema.parse({ warn: -0.1 })).toThrow();
		});

		it('should reject invalid critical values', () => {
			expect(() => ContextBudgetConfigSchema.parse({ critical: 1.5 })).toThrow();
			expect(() => ContextBudgetConfigSchema.parse({ critical: -0.1 })).toThrow();
		});

		it('should reject negative max_injection_tokens', () => {
			expect(() => ContextBudgetConfigSchema.parse({ max_injection_tokens: -1 })).toThrow();
		});
	});

	describe('EvidenceConfigSchema', () => {
		it('should have correct default values', () => {
			const result = EvidenceConfigSchema.parse({});
			expect(result.enabled).toBe(true);
			expect(result.max_age_days).toBe(90);
			expect(result.max_bundles).toBe(1000);
			expect(result.auto_archive).toBe(false);
		});

		it('should allow custom values to override defaults', () => {
			const customConfig = {
				enabled: false,
				max_age_days: 30,
				max_bundles: 500,
				auto_archive: true,
			};
			const result = EvidenceConfigSchema.parse(customConfig);
			expect(result.enabled).toBe(false);
			expect(result.max_age_days).toBe(30);
			expect(result.max_bundles).toBe(500);
			expect(result.auto_archive).toBe(true);
		});

		it('should reject max_age_days less than 1', () => {
			expect(() => EvidenceConfigSchema.parse({ max_age_days: 0 })).toThrow();
			expect(() => EvidenceConfigSchema.parse({ max_age_days: -1 })).toThrow();
		});

		it('should reject max_bundles less than 1', () => {
			expect(() => EvidenceConfigSchema.parse({ max_bundles: 0 })).toThrow();
			expect(() => EvidenceConfigSchema.parse({ max_bundles: -1 })).toThrow();
		});
	});

	describe('GuardrailsConfigSchema', () => {
		it('should have correct default values', () => {
			const result = GuardrailsConfigSchema.parse({});
			expect(result.enabled).toBe(true);
			expect(result.max_tool_calls).toBe(200);
			expect(result.max_duration_minutes).toBe(30);
			expect(result.max_repetitions).toBe(10);
			expect(result.max_consecutive_errors).toBe(5);
			expect(result.warning_threshold).toBe(0.5);
		});

		it('should allow custom values to override defaults', () => {
			const customConfig = {
				enabled: false,
				max_tool_calls: 100,
				max_duration_minutes: 15,
				max_repetitions: 5,
				max_consecutive_errors: 3,
				warning_threshold: 0.75,
			};
			const result = GuardrailsConfigSchema.parse(customConfig);
			expect(result.enabled).toBe(false);
			expect(result.max_tool_calls).toBe(100);
			expect(result.max_duration_minutes).toBe(15);
			expect(result.max_repetitions).toBe(5);
			expect(result.max_consecutive_errors).toBe(3);
			expect(result.warning_threshold).toBe(0.75);
		});

		it('should reject max_tool_calls less than 1', () => {
			expect(() => GuardrailsConfigSchema.parse({ max_tool_calls: 0 })).toThrow();
			expect(() => GuardrailsConfigSchema.parse({ max_tool_calls: -1 })).toThrow();
		});

		it('should reject max_duration_minutes less than 1', () => {
			expect(() => GuardrailsConfigSchema.parse({ max_duration_minutes: 0 })).toThrow();
			expect(() => GuardrailsConfigSchema.parse({ max_duration_minutes: -1 })).toThrow();
		});

		it('should reject max_repetitions less than 1', () => {
			expect(() => GuardrailsConfigSchema.parse({ max_repetitions: 0 })).toThrow();
			expect(() => GuardrailsConfigSchema.parse({ max_repetitions: -1 })).toThrow();
		});

		it('should reject max_consecutive_errors less than 1', () => {
			expect(() => GuardrailsConfigSchema.parse({ max_consecutive_errors: 0 })).toThrow();
			expect(() => GuardrailsConfigSchema.parse({ max_consecutive_errors: -1 })).toThrow();
		});

		it('should reject invalid warning_threshold values', () => {
			expect(() => GuardrailsConfigSchema.parse({ warning_threshold: 1.5 })).toThrow();
			expect(() => GuardrailsConfigSchema.parse({ warning_threshold: -0.1 })).toThrow();
		});
	});

	describe('HooksConfigSchema', () => {
		it('should accept empty object', () => {
			const result = HooksConfigSchema.parse({});
			expect(result).toEqual({});
		});

		it('should accept pre_agent hook', () => {
			const result = HooksConfigSchema.parse({ pre_agent: 'pre-agent-hook.ts' });
			expect(result.pre_agent).toBe('pre-agent-hook.ts');
			expect(result.post_agent).toBeUndefined();
		});

		it('should accept post_agent hook', () => {
			const result = HooksConfigSchema.parse({ post_agent: 'post-agent-hook.ts' });
			expect(result.pre_agent).toBeUndefined();
			expect(result.post_agent).toBe('post-agent-hook.ts');
		});

		it('should accept both hooks', () => {
			const result = HooksConfigSchema.parse({
				pre_agent: 'pre.ts',
				post_agent: 'post.ts',
			});
			expect(result.pre_agent).toBe('pre.ts');
			expect(result.post_agent).toBe('post.ts');
		});
	});

	describe('PluginConfigSchema', () => {
		it('should have correct defaults for all new sections', () => {
			const result = PluginConfigSchema.parse({});
			expect(result.context_budget).toBeDefined();
			expect(result.context_budget.warn).toBe(0.7);
			expect(result.context_budget.critical).toBe(0.9);
			expect(result.context_budget.target_agents).toEqual(['architect']);

			expect(result.evidence).toBeDefined();
			expect(result.evidence.enabled).toBe(true);
			expect(result.evidence.max_age_days).toBe(90);

			expect(result.guardrails).toBeDefined();
			expect(result.guardrails.enabled).toBe(true);
			expect(result.guardrails.max_tool_calls).toBe(200);

			expect(result.hooks).toBeUndefined();
		});

		it('should merge context_budget with defaults', () => {
			const result = PluginConfigSchema.parse({
				context_budget: { enabled: true, warn: 0.8 },
			});
			expect(result.context_budget.warn).toBe(0.8);
			expect(result.context_budget.critical).toBe(0.9);
			expect(result.context_budget.target_agents).toEqual(['architect']);
		});

		it('should merge evidence with defaults', () => {
			const result = PluginConfigSchema.parse({
				evidence: { max_age_days: 60 },
			});
			expect(result.evidence.enabled).toBe(true);
			expect(result.evidence.max_age_days).toBe(60);
			expect(result.evidence.max_bundles).toBe(1000);
		});

		it('should merge guardrails with defaults', () => {
			const result = PluginConfigSchema.parse({
				guardrails: { max_tool_calls: 150 },
			});
			expect(result.guardrails.enabled).toBe(true);
			expect(result.guardrails.max_tool_calls).toBe(150);
			expect(result.guardrails.max_duration_minutes).toBe(30);
		});
	});
});

describe('Phase 2.1 Deep Merge Configuration Sections', () => {
	describe('context_budget deep merge', () => {
		it('should merge context_budget with defaults', () => {
			const base = getContextBudgetDefaults();
			const override = { warn: 0.8 } as Partial<ContextBudgetConfig>;
			const result = deepMerge(base, override as ContextBudgetConfig);

			expect(result?.warn).toBe(0.8);
			expect(result?.critical).toBe(0.9);
			expect(result?.max_injection_tokens).toBe(4000);
			expect(result?.target_agents).toEqual(['architect']);
		});

		it('should override target_agents array', () => {
			const base = getContextBudgetDefaults();
			const override = { target_agents: ['reviewer', 'coder'] } as Partial<ContextBudgetConfig>;
			const result = deepMerge(base, override as ContextBudgetConfig);

			expect(result?.target_agents).toEqual(['reviewer', 'coder']);
		});

		it('should merge model_limits object', () => {
			const base = getContextBudgetDefaults();
			const override = { model_limits: { gpt4: 8192 } } as Partial<ContextBudgetConfig>;
			const result = deepMerge(base, override as ContextBudgetConfig);

			expect(result?.model_limits).toEqual({ default: 128000, gpt4: 8192 });
		});
	});

	describe('evidence deep merge', () => {
		it('should merge evidence with defaults', () => {
			const base = getEvidenceDefaults();
			const override = { enabled: false } as Partial<EvidenceConfig>;
			const result = deepMerge(base, override as EvidenceConfig);

			expect(result?.enabled).toBe(false);
			expect(result?.max_age_days).toBe(90);
			expect(result?.max_bundles).toBe(1000);
			expect(result?.auto_archive).toBe(false);
		});
	});

	describe('guardrails deep merge', () => {
		it('should merge guardrails with defaults', () => {
			const base = getGuardrailsDefaults();
			const override = { max_tool_calls: 100 } as Partial<GuardrailsConfig>;
			const result = deepMerge(base, override as GuardrailsConfig);

			expect(result?.max_tool_calls).toBe(100);
			expect(result?.max_duration_minutes).toBe(30);
			expect(result?.warning_threshold).toBe(0.5);
		});
	});

	describe('hooks deep merge', () => {
		it('should merge hooks with defaults', () => {
			const base = getHooksDefaults();
			const override = { pre_agent: 'pre-hook.ts' } as HooksConfig;
			const result = deepMerge(base, override);

			expect(result?.pre_agent).toBe('pre-hook.ts');
			expect(result?.post_agent).toBeUndefined();
		});

		it('should merge both hook types', () => {
			const base = { pre_agent: 'old-pre.ts' } as HooksConfig;
			const override = { post_agent: 'post.ts' } as HooksConfig;
			const result = deepMerge(base, override);

			expect(result?.pre_agent).toBe('old-pre.ts');
			expect(result?.post_agent).toBe('post.ts');
		});
	});

	describe('default getter functions', () => {
		it('getContextBudgetDefaults should return correct defaults', () => {
			const defaults = getContextBudgetDefaults();
			expect(defaults.warn).toBe(0.7);
			expect(defaults.critical).toBe(0.9);
			expect(defaults.max_injection_tokens).toBe(4000);
			expect(defaults.model_limits).toEqual({ default: 128000 });
			expect(defaults.target_agents).toEqual(['architect']);
		});

		it('getEvidenceDefaults should return correct defaults', () => {
			const defaults = getEvidenceDefaults();
			expect(defaults.enabled).toBe(true);
			expect(defaults.max_age_days).toBe(90);
			expect(defaults.max_bundles).toBe(1000);
			expect(defaults.auto_archive).toBe(false);
		});

		it('getGuardrailsDefaults should return correct defaults', () => {
			const defaults = getGuardrailsDefaults();
			expect(defaults.enabled).toBe(true);
			expect(defaults.max_tool_calls).toBe(200);
			expect(defaults.max_duration_minutes).toBe(30);
			expect(defaults.max_repetitions).toBe(10);
			expect(defaults.max_consecutive_errors).toBe(5);
			expect(defaults.warning_threshold).toBe(0.5);
		});

		it('getHooksDefaults should return empty object', () => {
			const defaults = getHooksDefaults();
			expect(defaults).toEqual({});
		});
	});
});
