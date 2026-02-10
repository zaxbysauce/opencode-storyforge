import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { tool, type ToolDefinition } from '@opencode-ai/plugin/tool';
import { 
	validateWriterPath, 
	checkFileSizeLimit, 
	checkDirectoryDepth,
	isSymlink,
	isFileValidationEnabled 
} from '../hooks/utils';
import { MAX_FILE_SIZE, MAX_DIRECTORY_DEPTH } from '../config/constants';
import { getFileRetryEnabled, getMaxFileRetries, type PluginConfig } from '../config/schema';

// Retryable error codes
const RETRYABLE_ERROR_CODES = ['EBUSY', 'EAGAIN', 'EMFILE'];

/**
 * Sleep for a given number of milliseconds
 */
export function sleep(ms: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Calculate retry delay with exponential backoff and ±20% jitter
 */
export function calculateRetryDelay(attempt: number, baseDelay: number = 50): number {
	const exponentialDelay = baseDelay * Math.pow(2, attempt - 1);
	const jitterFactor = 0.8 + Math.random() * 0.4; // ±20% jitter (0.8 to 1.2)
	return Math.round(exponentialDelay * jitterFactor);
}

/**
 * Check if an error is retryable
 */
export function isRetryableError(error: unknown): boolean {
	if (error instanceof Error && 'code' in error) {
		const code = (error as NodeJS.ErrnoException).code;
		return code !== undefined && RETRYABLE_ERROR_CODES.includes(code);
	}
	return false;
}

/**
 * Execute a write operation with retry logic
 * The writeFn parameter allows for dependency injection during testing
 */
export async function writeFileWithRetry(
    filePath: string,
    content: string,
    options: { encoding: BufferEncoding },
    writeFn: typeof fs.writeFile = fs.writeFile,
    retryEnabled?: boolean,
    maxRetries?: number
): Promise<void> {
    const effectiveRetryEnabled = retryEnabled ?? getFileRetryEnabled();
    const effectiveMaxRetries = maxRetries ?? getMaxFileRetries();

    // Short-circuit if retries are disabled
    if (!effectiveRetryEnabled || effectiveMaxRetries === 0) {
        return writeFn(filePath, content, options);
    }

	let lastError: unknown;

    for (let attempt = 1; attempt <= effectiveMaxRetries; attempt++) {
        try {
            return await writeFn(filePath, content, options);
        } catch (error) {
            lastError = error;

            // Only retry on specific error codes
            if (!isRetryableError(error) || attempt === effectiveMaxRetries) {
                throw error;
            }

			// Calculate delay with exponential backoff and jitter
			const delay = calculateRetryDelay(attempt);
			await sleep(delay);
		}
	}

	throw lastError;
}

/**
 * Create a tool to read a file from the .writer/ directory.
 */
export function createReadWriterFile(directory: string): ToolDefinition {
	return tool({
		description: 'Read a file from the .writer/ directory.',
		args: {
			filename: tool.schema
				.string()
				.describe('Relative path to the file inside .writer/ (e.g., "brief.md", "drafts/draft-1.md")'),
		},
		execute: async ({ filename }) => {
			try {
				const resolvedPath = await validateWriterPath(directory, filename);

				// Check if file exists
				try {
					await fs.access(resolvedPath);
				} catch {
					return `File not found: ${filename}`;
				}

				// Check file size limit before reading
				await checkFileSizeLimit(resolvedPath);

				const content = await fs.readFile(resolvedPath, 'utf-8');
				return content;
			} catch (error) {
				return `Error reading file: ${error instanceof Error ? error.message : String(error)}`;
			}
		},
	});
}

/**
 * Create a tool to write content to a file in the .writer/ directory. Overwrites if exists.
 */
export function createWriteWriterFile(directory: string, config?: PluginConfig): ToolDefinition {
	return tool({
		description: 'Write content to a file in the .writer/ directory. Overwrites if exists.',
		args: {
			filename: tool.schema
				.string()
				.describe('Relative path to the file inside .writer/'),
			content: tool.schema
				.string()
				.describe('The content to write'),
		},
		execute: async ({ filename, content }) => {
			try {
				const resolvedPath = await validateWriterPath(directory, filename);

				// Ensure directory exists
				await fs.mkdir(path.dirname(resolvedPath), { recursive: true });

				const retryEnabled = getFileRetryEnabled(config);
				const maxRetries = getMaxFileRetries(config);

				// Use retry logic for file writes
				await writeFileWithRetry(resolvedPath, content, { encoding: 'utf-8' }, undefined, retryEnabled, maxRetries);
				return `Successfully wrote to ${filename}`;
			} catch (error) {
				return `Error writing file: ${error instanceof Error ? error.message : String(error)}`;
			}
		},
	});
}

/**
 * Create a tool to list all files in the .writer/ directory recursively.
 */
export function createListWriterFiles(directory: string): ToolDefinition {
	return tool({
		description: 'List all files in the .writer/ directory recursively.',
		args: {},
		execute: async () => {
			try {
				const writerDir = path.join(directory, '.writer');

				// Check if directory exists
				try {
					await fs.access(writerDir);
				} catch {
					return 'No .writer directory found.';
				}

				const files: string[] = [];

				async function scan(dir: string, relative: string, depth: number = 0) {
					// Check directory depth limit
					checkDirectoryDepth(depth);

					const entries = await fs.readdir(dir, { withFileTypes: true });
					for (const entry of entries) {
						const fullPath = path.join(dir, entry.name);
						const relPath = path.join(relative, entry.name);

						// Skip symlinks if validation is enabled
						if (isFileValidationEnabled() && await isSymlink(fullPath)) {
							continue;
						}

						if (entry.isDirectory()) {
							await scan(fullPath, relPath, depth + 1);
						} else {
							files.push(relPath);
						}
					}
				}

				await scan(writerDir, '', 0);
				return files.length > 0 ? files.join('\n') : 'No files found in .writer directory.';
			} catch (error) {
				return `Error listing files: ${error instanceof Error ? error.message : String(error)}`;
			}
		},
	});
}

// Export constants for external use
export { MAX_FILE_SIZE, MAX_DIRECTORY_DEPTH };
