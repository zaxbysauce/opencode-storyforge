import * as path from 'node:path';
import * as fs from 'node:fs';
import { SwarmError } from '../utils';
import { MAX_FILE_SIZE, MAX_DIRECTORY_DEPTH } from '../config/constants';

interface HookContext {
	hookName: string;
	sessionID?: string;
	agent?: string;
	inputKeys: string[];
}

function extractContext<I>(fn: { name?: string }, input: I): HookContext {
	const hookName = fn.name || 'unknown';
	const inputRecord = input as Record<string, unknown>; // RECORD-JUSTIFIED: hook inputs can be arbitrary metadata
	const sessionID =
		typeof inputRecord?.sessionID === 'string' ? inputRecord.sessionID : undefined;
	const agent =
		typeof inputRecord?.agent === 'string' ? inputRecord.agent : undefined;
	const inputKeys =
		input && typeof input === 'object' ? Object.keys(inputRecord) : [];

	return {
		hookName,
		sessionID,
		agent,
		inputKeys,
	};
}

export function safeHook<I, O>(
	fn: (input: I, output: O) => Promise<void>,
): (input: I, output: O) => Promise<void> {
	return async (input: I, output: O) => {
		try {
			await fn(input, output);
		} catch (_error) {
			const context = extractContext(fn as { name?: string }, input);
			const contextJson = JSON.stringify(context);

			if (_error instanceof SwarmError) {
				console.warn(
					`Hook '${context.hookName}' failed: ${_error.message}\n  → ${_error.guidance} ${contextJson}`,
				);
			} else {
				console.warn(
					`Hook function '${context.hookName}' failed:`,
					_error,
					contextJson,
				);
			}
		}
	};
}

export function composeHandlers<I, O>(
	...fns: Array<(input: I, output: O) => Promise<void>>
): (input: I, output: O) => Promise<void> {
	if (fns.length === 0) {
		return async () => {};
	}

	return async (input: I, output: O) => {
		for (const fn of fns) {
			await fn(input, output);
		}
	};
}

// Environment-based configuration for validation
function isFileValidationEnabled(): boolean {
	const envValue = process.env.ENABLE_FILE_VALIDATION;
	return envValue === undefined || envValue.toLowerCase() !== 'false';
}

function getMaxFileBytes(): number {
	const envValue = process.env.WRITER_MAX_FILE_BYTES;
	if (envValue) {
		const parsed = parseInt(envValue, 10);
		if (!isNaN(parsed) && parsed > 0) {
			return parsed;
		}
	}
	return MAX_FILE_SIZE;
}

function getMaxScanDepth(): number {
	const envValue = process.env.WRITER_MAX_SCAN_DEPTH;
	if (envValue) {
		const parsed = parseInt(envValue, 10);
		if (!isNaN(parsed) && parsed > 0) {
			return parsed;
		}
	}
	return MAX_DIRECTORY_DEPTH;
}

export function validateWriterPath(directory: string, filename: string): string {
	// Reject null bytes
	if (/[\0]/.test(filename)) {
		throw new Error('Invalid filename: contains null bytes');
	}

	// Resolve the base directory and the requested file
	const baseDir = path.resolve(directory, '.writer');

	// Use path.join to ensure filename is treated as relative, then resolve
	const resolved = path.resolve(path.join(baseDir, filename));

	// Check that the resolved path is within the .writer directory
	if (process.platform === 'win32') {
		// On Windows, do case-insensitive comparison
		if (
			!resolved.toLowerCase().startsWith((baseDir + path.sep).toLowerCase())
		) {
			throw new Error('Invalid filename: path escapes .writer directory');
		}
	} else {
		// On other platforms, do case-sensitive comparison
		if (!resolved.startsWith(baseDir + path.sep)) {
			throw new Error('Invalid filename: path escapes .writer directory');
		}
	}

	// Symlink detection when validation is enabled
	if (isFileValidationEnabled()) {
		try {
			// Use lstat to check if it's a symlink
			const stats = fs.lstatSync(resolved);
			if (stats.isSymbolicLink()) {
				throw new Error('Invalid filename: symlinks are not allowed');
			}

			// Also verify the real path doesn't escape the base directory
			const realPath = fs.realpathSync(resolved);
			if (process.platform === 'win32') {
				if (!realPath.toLowerCase().startsWith((baseDir + path.sep).toLowerCase())) {
					throw new Error('Invalid filename: symlink escapes .writer directory');
				}
			} else {
				if (!realPath.startsWith(baseDir + path.sep)) {
					throw new Error('Invalid filename: symlink escapes .writer directory');
				}
			}
		} catch (error) {
			// If the file doesn't exist yet, that's fine - just pass through
			// Re-throw validation errors
			if (error instanceof Error && 
				(error.message.includes('symlinks are not allowed') || 
				 error.message.includes('symlink escapes'))) {
				throw error;
			}
			// For other errors (file not found), continue normally
		}
	}

	return resolved;
}

// Check if a file exceeds the size limit
export function checkFileSizeLimit(filePath: string): void {
	if (!isFileValidationEnabled()) {
		return;
	}

	try {
		const stats = fs.statSync(filePath);
		if (stats.isFile()) {
			const maxBytes = getMaxFileBytes();
			if (stats.size > maxBytes) {
				throw new Error(
					`File size (${stats.size} bytes) exceeds maximum allowed size (${maxBytes} bytes)`
				);
			}
		}
	} catch (error) {
		// Re-throw size limit errors
		if (error instanceof Error && error.message.includes('exceeds maximum allowed size')) {
			throw error;
		}
		// For other errors (file not found), ignore
	}
}

// Check if directory depth exceeds limit
export function checkDirectoryDepth(currentDepth: number): void {
	if (!isFileValidationEnabled()) {
		return;
	}

	const maxDepth = getMaxScanDepth();
	if (currentDepth > maxDepth) {
		throw new Error(
			`Directory depth (${currentDepth}) exceeds maximum allowed depth (${maxDepth})`
		);
	}
}

// Check if a path is a symlink (for directory listing)
export function isSymlink(filePath: string): boolean {
	if (!isFileValidationEnabled()) {
		return false;
	}

	try {
		const stats = fs.lstatSync(filePath);
		return stats.isSymbolicLink();
	} catch {
		return false;
	}
}

// Export configuration getters for testing
export { getMaxFileBytes, getMaxScanDepth, isFileValidationEnabled };

export async function readWriterFileAsync(
	directory: string,
	filename: string,
): Promise<string | null> {
	try {
		const resolvedPath = validateWriterPath(directory, filename);
		const file = Bun.file(resolvedPath);
		const exists = await file.exists();
		if (!exists) return null;
		
		const content = await file.text();
		return content;
	} catch {
		return null;
	}
}

/**
 * Estimates the number of tokens in a text string.
 *
 * **Formula:** `tokenCount ≈ Math.ceil(characterCount × 0.33)`
 *
 * This is based on the general observation that one token corresponds to roughly
 * 3 characters of English text on average. The multiplier of 0.33 (1/3) provides
 * a conservative upper-bound estimate.
 *
 * **Accuracy:**
 * - Expected variance: approximately ±40%
 * - Actual token counts vary significantly based on:
 *   - Language (non-English text often requires more tokens per character)
 *   - Content type (code, technical terms, vs. natural language)
 *   - Tokenizer model (GPT-3/4, Claude, etc. use different tokenization schemes)
 *   - Presence of special characters, whitespace, and punctuation
 *
 * **Recommendation:**
 * Use this function only for rough budget planning and preliminary size estimates.
 * For precise token counting required for API limits or billing, use the actual
 * tokenizer of the target model (e.g., tiktoken for OpenAI models).
 *
 * @param text - The input string to estimate token count for
 * @returns The estimated number of tokens (rounded up), or 0 for empty/null input
 */
export function estimateTokens(text: string): number {
	if (!text) {
		return 0;
	}

	return Math.ceil(text.length * 0.33);
}
