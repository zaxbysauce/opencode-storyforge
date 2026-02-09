import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { type PluginConfig, PluginConfigSchema, getConfigValidationEnabled } from './schema';

const CONFIG_FILENAME = 'opencode-writer-swarm.json';

export const MAX_CONFIG_FILE_BYTES = 102_400;

/**
 * Structured error log entry for config loading failures.
 */
export interface ConfigLoadErrorLog {
	timestamp: string;
	filePath: string;
	errorCode: string | null;
	errorName: string;
	message: string;
}

/**
 * Log a structured error when config loading fails.
 * Exported for testing purposes.
 */
export function logConfigLoadError(filePath: string, error: unknown): void {
	const logEntry: ConfigLoadErrorLog = {
		timestamp: new Date().toISOString(),
		filePath,
		errorCode: error instanceof Error && 'code' in error ? String((error as any).code) : null,
		errorName: error instanceof Error ? error.name : 'UnknownError',
		message: error instanceof Error ? error.message : String(error),
	};

	console.warn(
		`[opencode-writer-swarm] Config load error: ${JSON.stringify(logEntry)}`,
	);
}

/**
 * Get the user's configuration directory (XDG Base Directory spec).
 */
function getUserConfigDir(): string {
	return process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
}

/**
 * Load and validate config from a specific file path.
 */
function loadConfigFromPath(configPath: string): PluginConfig | null {
	try {
		// Check file size before reading
		if (!fs.existsSync(configPath)) return null;

		const stats = fs.statSync(configPath);
		if (stats.size > MAX_CONFIG_FILE_BYTES) {
			console.warn(
				`[opencode-writer-swarm] Config file too large (max 100 KB): ${configPath}`,
			);
			return null;
		}

		const content = fs.readFileSync(configPath, 'utf-8');
		const rawConfig = JSON.parse(content);
		const result = PluginConfigSchema.safeParse(rawConfig);

		if (!result.success) {
			console.warn(`[opencode-writer-swarm] Invalid config at ${configPath}:`);
			console.warn(result.error.format());
			return null;
		}

		return result.data;
	} catch (error) {
		logConfigLoadError(configPath, error);
		return null;
	}
}

/**
 * Options for deepMerge function.
 */
export interface DeepMergeOptions {
	enforceKeyFiltering?: boolean;
}

/**
 * Forbidden keys that could be used for prototype pollution.
 */
const FORBIDDEN_KEYS = ['__proto__', 'constructor', 'prototype'];

/**
 * Deep merge two objects, with override values taking precedence.
 * Arrays are replaced, not merged.
 * 
 * When enforceKeyFiltering is enabled, keys like __proto__, constructor, and prototype
 * are skipped to prevent prototype pollution attacks.
 */
export function deepMerge<T>(
	base?: T,
	override?: T,
	options: DeepMergeOptions = {},
): T | undefined {
	if (base === undefined) return override;
	if (override === undefined) return base;

	if (
		typeof base !== 'object' ||
		base === null ||
		typeof override !== 'object' ||
		override === null ||
		Array.isArray(base) ||
		Array.isArray(override)
	) {
		return override;
	}

	const { enforceKeyFiltering = false } = options;
	const result = { ...base } as any;

	for (const key of Object.keys(override)) {
		// Skip forbidden keys when filtering is enabled
		if (enforceKeyFiltering && FORBIDDEN_KEYS.includes(key)) {
			continue;
		}

		const baseValue = (base as any)[key];
		const overrideValue = (override as any)[key];
		result[key] = deepMerge(baseValue, overrideValue, options);
	}
	return result as T;
}

/**
 * Load plugin configuration from user and project config files.
 *
 * Config locations:
 * 1. User config: ~/.config/opencode/opencode-writer-swarm.json
 * 2. Project config: <directory>/.opencode/opencode-writer-swarm.json
 *
 * Project config takes precedence.
 */
export function loadPluginConfig(directory: string): PluginConfig {
	const userConfigPath = path.join(
		getUserConfigDir(),
		'opencode',
		CONFIG_FILENAME,
	);

	const projectConfigPath = path.join(directory, '.opencode', CONFIG_FILENAME);

	let config: PluginConfig = loadConfigFromPath(userConfigPath) ?? {
		qa_retry_limit: 3,
		file_retry_enabled: true,
		max_file_operation_retries: 3,
		config_validation_enabled: true,
	};

	const projectConfig = loadConfigFromPath(projectConfigPath);
	if (projectConfig) {
		// Compute effective config validation enabled flag
		const configValidationEnabled = getConfigValidationEnabled(projectConfig);

		config = {
			...config,
			...projectConfig,
			agents: deepMerge(config.agents, projectConfig.agents, {
				enforceKeyFiltering: configValidationEnabled,
			}),
		};
	}

	return config;
}

/**
 * Load prompt file from prompts/ directory
 */
export function loadPrompt(name: string): string {
	const promptPath = path.join(__dirname, '..', '..', 'prompts', `${name}.md`);
	try {
		return fs.readFileSync(promptPath, 'utf-8');
	} catch (error) {
		console.warn(`[opencode-writer-swarm] Error reading prompt ${name}:`, error);
		// Try with underscore instead of hyphen for backward compatibility
		const altPath = path.join(__dirname, '..', '..', 'prompts', `${name.replace(/-/g, '_')}.md`);
		try {
			return fs.readFileSync(altPath, 'utf-8');
		} catch {
			return '';
		}
	}
}

/**
 * Load reference file from references/ directory
 */
export function loadReference(name: string): string {
	const refPath = path.join(__dirname, '..', '..', 'references', `${name}.md`);
	try {
		return fs.readFileSync(refPath, 'utf-8');
	} catch (error) {
		console.warn(
			`[opencode-writer-swarm] Error reading reference ${name}:`,
			error,
		);
		return '';
	}
}
