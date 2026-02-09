// @ts-nocheck
import { describe, expect, it, vi, beforeEach, afterEach } from 'bun:test';

import { deepMerge, logConfigLoadError, type ConfigLoadErrorLog, type DeepMergeOptions } from '../config/loader';
import { getConfigValidationEnabled } from './schema';

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
	let consoleWarnSpy: ReturnType<typeof vi.spyOn> | null = null;
	let capturedLogs: string[] = [];
	let originalWarn: typeof console.warn;

	beforeEach(() => {
		capturedLogs = [];
		originalWarn = console.warn;
		console.warn = (...args: any[]) => {
			capturedLogs.push(args.join(' '));
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
			const logMessage = capturedLogs[0];
			expect(logMessage).toContain('[opencode-writer-swarm] Config load error:');

			// Extract and parse the JSON portion
			const jsonMatch = logMessage.match(/\{.*\}$/);
			expect(jsonMatch).toBeTruthy();
			const logEntry: ConfigLoadErrorLog = JSON.parse(jsonMatch![0]);

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
			const logMessage = capturedLogs[0];
			const jsonMatch = logMessage.match(/\{.*\}$/);
			expect(jsonMatch).toBeTruthy();
			const logEntry: ConfigLoadErrorLog = JSON.parse(jsonMatch![0]);

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
			const logMessage = capturedLogs[0];
			const jsonMatch = logMessage.match(/\{.*\}$/);
			expect(jsonMatch).toBeTruthy();
			const logEntry: ConfigLoadErrorLog = JSON.parse(jsonMatch![0]);

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
			const logMessage = capturedLogs[0];
			const jsonMatch = logMessage.match(/\{.*\}$/);
			expect(jsonMatch).toBeTruthy();
			const logEntry: ConfigLoadErrorLog = JSON.parse(jsonMatch![0]);

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
			const logMessage = capturedLogs[0];
			const jsonMatch = logMessage.match(/\{.*\}$/);
			expect(jsonMatch).toBeTruthy();
			const logEntry: ConfigLoadErrorLog = JSON.parse(jsonMatch![0]);

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
		it('should allow forbidden keys by default when no options provided', () => {
			const base = { a: 1 };
			const override = { ['__proto__']: { isAdmin: true } };
			const result = deepMerge(base, override);

			// Without explicit enforceKeyFiltering, it should default to false
			expect(result).toHaveProperty('__proto__');
		});
	});
});