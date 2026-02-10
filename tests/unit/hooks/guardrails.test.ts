import { createGuardrailsHook } from '../../../src/hooks/guardrails';
import { resetSwarmState } from '../../../src/state';
import type { GuardrailsConfig } from '../../../src/config/schema';

function buildConfig(overrides: Partial<GuardrailsConfig> = {}): GuardrailsConfig {
	return {
		enabled: true,
		max_tool_calls: 2,
		max_duration_minutes: 30,
		max_repetitions: 10,
		max_consecutive_errors: 1,
		warning_threshold: 0.5,
		...overrides,
	};
}

describe('guardrails hook', () => {
	beforeEach(() => {
		resetSwarmState();
	});

	afterEach(() => {
		resetSwarmState();
	});

	test('toolBefore enforces tool call limits', async () => {
		const config = buildConfig({ max_tool_calls: 2 });
		const hook = createGuardrailsHook(config);
		const input = { sessionID: 'test-session', tool: 'test-tool', agent: 'test-agent' };

		// First two calls should succeed
		await hook.toolBefore(input);
		await hook.toolBefore(input);

		// Third call should throw
		await expect(hook.toolBefore(input)).rejects.toThrow('Tool call limit');
	});

	test('toolAfter tracks consecutive errors', async () => {
		const config = buildConfig({ max_consecutive_errors: 1 });
		const hook = createGuardrailsHook(config);
		const input = { sessionID: 'test-session', tool: 'test-tool', agent: 'test-agent' };

		// First toolBefore to initialize session
		await hook.toolBefore(input);

		// First error - should not throw yet (count becomes 1, which equals max)
		await hook.toolAfter(input, { error: new Error('First error') });

		// Second toolBefore to increment counters
		await hook.toolBefore(input);

		// Second error - should throw (count becomes 2, which exceeds max of 1)
		await expect(
			hook.toolAfter(input, { error: new Error('Second error') }),
		).rejects.toThrow('Consecutive errors limit');
	});
});
