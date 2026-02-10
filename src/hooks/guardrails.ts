import type { GuardrailsConfig } from '../config/schema';
import { swarmState, getGuardrailSession } from '../state';
import { warn } from '../utils/logger';

/** Tool call input structure */
interface ToolInput {
	sessionID: string;
	tool?: string;
	agent?: string;
}

/** Tool call output structure */
interface ToolOutput {
	result?: unknown;
	error?: unknown;
}

/**
 * Check if the current tool is a repetition of the last tool.
 * @param currentTool - The current tool name
 * @param lastTool - The last tool name
 * @returns True if the tool is a repetition
 */
function isToolRepetition(currentTool: string | undefined, lastTool: string | null): boolean {
	if (!currentTool || !lastTool) return false;
	return currentTool === lastTool;
}

/**
 * Check duration limit and return error message if exceeded.
 * @param session - The guardrail session
 * @param maxDurationMinutes - Maximum allowed duration in minutes
 * @returns Error message if limit exceeded, null otherwise
 */
function checkDurationLimit(
	session: { firstToolAt: number | null },
	maxDurationMinutes: number,
): string | null {
	if (!session.firstToolAt) return null;

	const elapsedMs = Date.now() - session.firstToolAt;
	const elapsedMinutes = elapsedMs / (1000 * 60);

	if (elapsedMinutes > maxDurationMinutes) {
		return `Duration limit exceeded: ${Math.round(elapsedMinutes)} minutes (max: ${maxDurationMinutes})`;
	}
	return null;
}

/**
 * Check tool call limit and return error message if exceeded.
 * @param toolCalls - Current tool call count
 * @param maxToolCalls - Maximum allowed tool calls
 * @returns Error message if limit exceeded, null otherwise
 */
function checkToolCallLimit(toolCalls: number, maxToolCalls: number): string | null {
	if (toolCalls > maxToolCalls) {
		return `Tool call limit exceeded: ${toolCalls} calls (max: ${maxToolCalls})`;
	}
	return null;
}

/**
 * Check repetition limit and return error message if exceeded.
 * @param repetitionCount - Current repetition count
 * @param maxRepetitions - Maximum allowed repetitions
 * @returns Error message if limit exceeded, null otherwise
 */
function checkRepetitionLimit(repetitionCount: number, maxRepetitions: number): string | null {
	if (repetitionCount > maxRepetitions) {
		return `Repetition limit exceeded: ${repetitionCount} repetitions (max: ${maxRepetitions})`;
	}
	return null;
}

/**
 * Check consecutive errors limit and return error message if exceeded.
 * @param consecutiveErrors - Current consecutive error count
 * @param maxConsecutiveErrors - Maximum allowed consecutive errors
 * @returns Error message if limit exceeded, null otherwise
 */
function checkConsecutiveErrorsLimit(
	consecutiveErrors: number,
	maxConsecutiveErrors: number,
): string | null {
	if (consecutiveErrors > maxConsecutiveErrors) {
		return `Consecutive errors limit exceeded: ${consecutiveErrors} errors (max: ${maxConsecutiveErrors})`;
	}
	return null;
}

/**
 * Check if warning threshold is exceeded (but not yet blocking).
 * @param toolCalls - Current tool call count
 * @param maxToolCalls - Maximum allowed tool calls
 * @param warningThreshold - Warning threshold ratio (0-1)
 * @returns True if warning should be triggered
 */
function shouldWarn(
	toolCalls: number,
	maxToolCalls: number,
	warningThreshold: number,
): boolean {
	const ratio = toolCalls / maxToolCalls;
	return ratio >= warningThreshold && toolCalls <= maxToolCalls;
}

/**
 * Create guardrail hooks for tracking and limiting tool usage.
 * @param config - Guardrails configuration
 * @returns Object with toolBefore and toolAfter hooks
 */
export function createGuardrailsHook(
	config: GuardrailsConfig,
): {
	toolBefore: (input: ToolInput) => Promise<void>;
	toolAfter: (input: ToolInput, output: ToolOutput) => Promise<void>;
} {
	/**
	 * Hook called before each tool execution.
	 * Validates limits and tracks tool usage.
	 */
	async function toolBefore(input: ToolInput): Promise<void> {
		// Skip if guardrails are disabled
		if (!config.enabled) {
			return;
		}

		const sessionID = input.sessionID;
		if (!sessionID) {
			return;
		}

		// Get or initialize guardrail session
		const session = getGuardrailSession(sessionID);

		// Set first tool timestamp if not already set
		if (session.firstToolAt === null) {
			session.firstToolAt = Date.now();
		}

		// Increment tool call count
		session.toolCalls++;

		// Check tool call limit
		const toolCallError = checkToolCallLimit(session.toolCalls, config.max_tool_calls);
		if (toolCallError) {
			throw new Error(`Guardrail violation: ${toolCallError}`);
		}

		// Check duration limit
		const durationError = checkDurationLimit(session, config.max_duration_minutes);
		if (durationError) {
			throw new Error(`Guardrail violation: ${durationError}`);
		}

		// Update repetition tracking
		const currentTool = input.tool || null;
		if (isToolRepetition(currentTool ?? undefined, session.lastTool)) {
			session.repetitionCount++;
		} else {
			session.repetitionCount = 0;
		}
		session.lastTool = currentTool;

		// Check repetition limit
		const repetitionError = checkRepetitionLimit(session.repetitionCount, config.max_repetitions);
		if (repetitionError) {
			throw new Error(`Guardrail violation: ${repetitionError}`);
		}

		// Check consecutive errors limit
		const consecutiveErrorsError = checkConsecutiveErrorsLimit(
			session.consecutiveErrors,
			config.max_consecutive_errors,
		);
		if (consecutiveErrorsError) {
			throw new Error(`Guardrail violation: ${consecutiveErrorsError}`);
		}

		// Warn if approaching tool call limit
		if (shouldWarn(session.toolCalls, config.max_tool_calls, config.warning_threshold)) {
			warn('Guardrail warning: Approaching tool call limit', {
				sessionID,
				toolCalls: session.toolCalls,
				maxToolCalls: config.max_tool_calls,
				agent: input.agent,
				tool: input.tool,
			});
		}
	}

	/**
	 * Hook called after each tool execution.
	 * Tracks success/failure and updates consecutive error count.
	 */
	async function toolAfter(input: ToolInput, output: ToolOutput): Promise<void> {
		// Skip if guardrails are disabled
		if (!config.enabled) {
			return;
		}

		const sessionID = input.sessionID;
		if (!sessionID) {
			return;
		}

		// Ensure guardrail session exists
		const session = getGuardrailSession(sessionID);

		// Determine if the tool call was successful
		const hasError = output.error !== undefined && output.error !== null;
		const hasResult = output.result !== undefined && output.result !== null;
		const isSuccess = !hasError && hasResult;

		if (isSuccess) {
			// Reset consecutive errors on success
			session.consecutiveErrors = 0;
		} else {
			// Increment consecutive errors on failure
			session.consecutiveErrors++;

			// Check if consecutive errors limit exceeded
			const consecutiveErrorsError = checkConsecutiveErrorsLimit(
				session.consecutiveErrors,
				config.max_consecutive_errors,
			);
			if (consecutiveErrorsError) {
				throw new Error(`Guardrail violation: ${consecutiveErrorsError}`);
			}
		}
	}

	return {
		toolBefore,
		toolAfter,
	};
}
