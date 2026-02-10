import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { safeHook, composeHandlers, validateWriterPath } from './utils';
import { SwarmError } from '../utils';

describe('safeHook', () => {
	let consoleWarnCalls: Array<Parameters<typeof console.warn>> = [];
	let originalConsoleWarn: typeof console.warn;

	beforeEach(() => {
		consoleWarnCalls = [];
		originalConsoleWarn = console.warn;
		console.warn = (...args: Parameters<typeof console.warn>) => {
			consoleWarnCalls.push(args);
		};
	});

	afterEach(() => {
		console.warn = originalConsoleWarn;
	});

	it('should log structured context when a regular error occurs', async () => {
		async function testHook(
			input: { sessionID: string; agent: string; data: string },
			_output: Record<string, unknown> // RECORD-JUSTIFIED: test output metadata,
		): Promise<void> {
			throw new Error('Test error');
		}

		const safeFn = safeHook(testHook);
		const input = { sessionID: 'session-123', agent: 'test-agent', data: 'test' };
		const output = {};

		await safeFn(input, output);

		expect(consoleWarnCalls).toHaveLength(1);
		const callArgs = consoleWarnCalls[0];

		const warnMessage = callArgs[0] as string;
		const errorArg = callArgs[1] as Error;
		const contextJson = callArgs[2] as string;

		expect(warnMessage).toContain("Hook function 'testHook' failed:");
		expect(errorArg.message).toBe('Test error');

		const context = JSON.parse(contextJson);
		expect(context.hookName).toBe('testHook');
		expect(context.sessionID).toBe('session-123');
		expect(context.agent).toBe('test-agent');
		expect(context.inputKeys).toContain('sessionID');
		expect(context.inputKeys).toContain('agent');
		expect(context.inputKeys).toContain('data');
	});

	it('should log structured context when a SwarmError occurs', async () => {
		async function swarmErrorHook(
			input: { sessionID: string; agent?: string },
			_output: Record<string, unknown> // RECORD-JUSTIFIED: test output metadata,
		): Promise<void> {
			throw new SwarmError('Swarm operation failed', 'Check swarm configuration');
		}

		const safeFn = safeHook(swarmErrorHook);
		const input = { sessionID: 'session-456' };
		const output = {};

		await safeFn(input, output);

		expect(consoleWarnCalls).toHaveLength(1);
		const callArgs = consoleWarnCalls[0];

		const warnMessage = callArgs[0] as string;

		expect(warnMessage).toContain("Hook 'swarmErrorHook' failed:");
		expect(warnMessage).toContain('Swarm operation failed');
		expect(warnMessage).toContain('Check swarm configuration');

		// Extract context JSON from the message
		const jsonMatch = warnMessage.match(/\{[^}]+\}$/);
		expect(jsonMatch).toBeTruthy();

		const context = JSON.parse(jsonMatch![0]);
		expect(context.hookName).toBe('swarmErrorHook');
		expect(context.sessionID).toBe('session-456');
		expect(context.agent).toBeUndefined();
		expect(context.inputKeys).toContain('sessionID');
	});

	it('should handle missing sessionID and agent gracefully', async () => {
		async function minimalHook(
			input: { data: number },
			_output: Record<string, unknown> // RECORD-JUSTIFIED: test output metadata,
		): Promise<void> {
			throw new Error('Minimal error');
		}

		const safeFn = safeHook(minimalHook);
		const input = { data: 42 };
		const output = {};

		await safeFn(input, output);

		expect(consoleWarnCalls).toHaveLength(1);
		const callArgs = consoleWarnCalls[0];
		const contextJson = callArgs[2] as string;

		const context = JSON.parse(contextJson);
		expect(context.hookName).toBe('minimalHook');
		expect(context.sessionID).toBeUndefined();
		expect(context.agent).toBeUndefined();
		expect(context.inputKeys).toEqual(['data']);
	});

	it('should handle anonymous functions', async () => {
		const safeFn = safeHook(async (_input: { sessionID: string }) => {
			throw new Error('Anonymous error');
		});

		const input = { sessionID: 'anon-session' };
		const output = {};

		await safeFn(input, output);

		expect(consoleWarnCalls).toHaveLength(1);
		const callArgs = consoleWarnCalls[0];
		const contextJson = callArgs[2] as string;

		const context = JSON.parse(contextJson);
		expect(context.hookName).toBe('unknown');
		expect(context.sessionID).toBe('anon-session');
	});

	it('should not log anything when hook succeeds', async () => {
		async function successHook(
			_input: { sessionID: string },
			_output: Record<string, unknown> // RECORD-JUSTIFIED: test output metadata,
		): Promise<void> {
			// Success - no error
		}

		const safeFn = safeHook(successHook);
		const input = { sessionID: 'success-session' };
		const output = {};

		await safeFn(input, output);

	expect(consoleWarnCalls).toHaveLength(0);
	});
});

describe('composeHandlers', () => {
	it('executes handlers in order', async () => {
		const order: string[] = [];
		const handler = composeHandlers(
			async () => {
				order.push('first');
			},
			async () => {
				order.push('second');
			},
		);

		await handler({}, {} as any);

		expect(order).toEqual(['first', 'second']);
	});

	it('logs only once when wrapped via safeHook', async () => {
		const handler = composeHandlers(
			async () => {
				throw new Error('boom');
			},
		);

		const warnCalls: Array<Parameters<typeof console.warn>> = [];
		const originalWarn = console.warn;
		console.warn = (...args: Parameters<typeof console.warn>) => {
			warnCalls.push(args);
		};

		await safeHook(handler)({}, {} as any);

		expect(warnCalls).toHaveLength(1);

		console.warn = originalWarn;
	});
});

describe('validateWriterPath', () => {
	it('rejects filename with colon (ADS protection)', async () => {
		await expect(validateWriterPath(process.cwd(), 'test:ads.txt')).rejects.toThrow(
			'Invalid filename: contains invalid character ":"'
		);
	});

	it('rejects filename with null byte', async () => {
		await expect(validateWriterPath(process.cwd(), 'test\x00.txt')).rejects.toThrow(
			'Invalid filename: contains null bytes'
		);
	});

	it('rejects UNC path (//server/share)', async () => {
		await expect(validateWriterPath(process.cwd(), '//server/share/file.txt')).rejects.toThrow(
			'Invalid filename: UNC paths are not allowed'
		);
	});

	it('rejects UNC path (\\\\server\\share)', async () => {
		await expect(validateWriterPath(process.cwd(), '\\\\server\\share\\file.txt')).rejects.toThrow(
			'Invalid filename: UNC paths are not allowed'
		);
	});

	it('rejects path traversal (../escape)', async () => {
		await expect(validateWriterPath(process.cwd(), '../outside.txt')).rejects.toThrow(
			'Invalid filename: path escapes .writer directory'
		);
	});

	it('accepts valid filename', async () => {
		const result = await validateWriterPath(process.cwd(), 'valid-file.md');
		expect(result).toBeTruthy();
		expect(result).toContain('valid-file.md');
	});

	it('accepts valid nested filename (subdir/file.md)', async () => {
		const result = await validateWriterPath(process.cwd(), 'subdir/file.md');
		expect(result).toBeTruthy();
		expect(result).toContain('subdir');
		expect(result).toContain('file.md');
	});
});

