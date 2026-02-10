import * as path from 'node:path';
import * as fsPromises from 'node:fs/promises';
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

async function validateSubdirectoryPath(
	directory: string,
	filename: string,
	baseDirName: string,
): Promise<string> {
	// Reject null bytes
	if (/[\0]/.test(filename)) {
		throw new Error('Invalid filename: contains null bytes');
	}

	// Reject Windows Alternate Data Streams (colon in filename)
	// Drive letters are not valid in relative filenames
	if (filename.includes(':')) {
		throw new Error('Invalid filename: contains invalid character ":"');
	}

	// Reject UNC paths and extended-length paths
	if (/^[\\/]{2}/.test(filename)) {
		throw new Error('Invalid filename: UNC paths are not allowed');
	}

	// Resolve the base directory and the requested file
	const baseDir = path.resolve(directory, baseDirName);

	// Use path.join to ensure filename is treated as relative, then resolve
	const resolved = path.resolve(path.join(baseDir, filename));

	// Check that the resolved path is within the base directory
	if (process.platform === 'win32') {
		// On Windows, do case-insensitive comparison
		if (
			!resolved.toLowerCase().startsWith((baseDir + path.sep).toLowerCase())
		) {
			throw new Error(`Invalid filename: path escapes ${baseDirName} directory`);
		}
	} else {
		// On other platforms, do case-sensitive comparison
		if (!resolved.startsWith(baseDir + path.sep)) {
			throw new Error(`Invalid filename: path escapes ${baseDirName} directory`);
		}
	}

	// Symlink detection when validation is enabled
	if (isFileValidationEnabled()) {
		try {
			// Use lstat to check if it's a symlink
			const stats = await fsPromises.lstat(resolved);
			if (stats.isSymbolicLink()) {
				throw new Error('Invalid filename: symlinks are not allowed');
			}

			// Also verify the real path doesn't escape the base directory
			const realPath = await fsPromises.realpath(resolved);
			if (process.platform === 'win32') {
				if (!realPath.toLowerCase().startsWith((baseDir + path.sep).toLowerCase())) {
					throw new Error(`Invalid filename: symlink escapes ${baseDirName} directory`);
				}
			} else {
				if (!realPath.startsWith(baseDir + path.sep)) {
					throw new Error(`Invalid filename: symlink escapes ${baseDirName} directory`);
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

export async function validateWriterPath(directory: string, filename: string): Promise<string> {
	return validateSubdirectoryPath(directory, filename, '.writer');
}

export async function validateSwarmPath(directory: string, filename: string): Promise<string> {
	return validateSubdirectoryPath(directory, filename, '.swarm');
}

// Check if a file exceeds the size limit
export async function checkFileSizeLimit(filePath: string): Promise<void> {
	if (!isFileValidationEnabled()) {
		return;
	}

	try {
		const stats = await fsPromises.stat(filePath);
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
export async function isSymlink(filePath: string): Promise<boolean> {
	if (!isFileValidationEnabled()) {
		return false;
	}

	try {
		const stats = await fsPromises.lstat(filePath);
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
		const resolvedPath = await validateWriterPath(directory, filename);
		const file = Bun.file(resolvedPath);
		const exists = await file.exists();
		if (!exists) return null;

		const content = await file.text();
		return content;
	} catch {
		return null;
	}
}

export async function readSwarmFileAsync(
	directory: string,
	filename: string,
): Promise<string | null> {
	try {
		const resolvedPath = await validateSwarmPath(directory, filename);
		const file = Bun.file(resolvedPath);
		const exists = await file.exists();
		if (!exists) return null;

		const content = await file.text();
		return content;
	} catch {
		return null;
	}
}



