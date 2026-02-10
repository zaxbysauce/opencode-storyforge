import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
	type PluginConfig,
	PluginConfigSchema,
	getConfigValidationEnabled,
	getContextBudgetDefaults,
	getEvidenceDefaults,
	getGuardrailsDefaults,
	getHooksDefaults,
} from './schema';
import { warn } from '../utils/logger';
import { swarmState } from '../state';

const __filename = fileURLToPath(import.meta.url);
const __moduleDir = path.dirname(__filename);

/**
 * Resolve the package root directory by searching upward for the prompts/ directory.
 * Works from both source (src/config/) and bundled (dist/) locations.
 */
function resolvePackageRoot(): string {
	let dir = __moduleDir;
	// Walk up at most 3 levels to find the directory containing prompts/
	for (let i = 0; i < 3; i++) {
		if (fs.existsSync(path.join(dir, 'prompts'))) {
			return dir;
		}
		const parent = path.dirname(dir);
		if (parent === dir) break; // reached filesystem root
		dir = parent;
	}
	// Fallback: assume source layout (2 levels up from src/config/)
	return path.join(__moduleDir, '..', '..');
}

const PACKAGE_ROOT = resolvePackageRoot();
const CONFIG_FILENAME = 'opencode-writer-swarm.json';

export const MAX_CONFIG_FILE_BYTES = 102_400;

function clonePluginConfig(config: PluginConfig): PluginConfig {
	return JSON.parse(JSON.stringify(config));
}

function createDefaultPluginConfig(): PluginConfig {
	return {
		qa_retry_limit: 3,
		file_retry_enabled: true,
		max_file_operation_retries: 3,
		config_validation_enabled: true,
		context_budget: getContextBudgetDefaults(),
		evidence: getEvidenceDefaults(),
		guardrails: getGuardrailsDefaults(),
		hooks: getHooksDefaults(),
	};
}

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

	warn('Config load error', logEntry);
}

/** XDG-compliant user config directory (~/.config or $XDG_CONFIG_HOME). */
function getUserConfigDir(): string {
	return process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
}

/** Load and validate config JSON from path, returning null on any failure. */
function loadConfigFromPath(configPath: string): PluginConfig | null {
	try {
		// Check file size before reading
		if (!fs.existsSync(configPath)) return null;

		const stats = fs.statSync(configPath);
		if (stats.size > MAX_CONFIG_FILE_BYTES) {
			warn('Config file too large', {
				path: configPath,
				maxBytes: MAX_CONFIG_FILE_BYTES,
			});
			return null;
		}

		const content = fs.readFileSync(configPath, 'utf-8');
		const rawConfig = JSON.parse(content);
		const result = PluginConfigSchema.safeParse(rawConfig);

		if (!result.success) {
			warn('Invalid config document', {
				path: configPath,
				errors: result.error.format(),
			});
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

	const { enforceKeyFiltering = true } = options;
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

	const userConfig = loadConfigFromPath(userConfigPath);
	const projectConfig = loadConfigFromPath(projectConfigPath);

	let config: PluginConfig;

	if (userConfig) {
		config = clonePluginConfig(userConfig);
	} else if (swarmState.lastValidConfig) {
		warn('Falling back to last valid plugin config (project config will still apply)', {
			source: 'lastValidConfig',
		});
		config = clonePluginConfig(swarmState.lastValidConfig);
	} else {
		warn('Falling back to default plugin config', { source: 'defaults' });
		config = createDefaultPluginConfig();
	}

	if (projectConfig) {
		config = {
			...config,
			...projectConfig,
			agents: deepMerge(config.agents, projectConfig.agents, {
				enforceKeyFiltering: getConfigValidationEnabled(projectConfig),
			}),
			// Deep merge context_budget, evidence, guardrails, and hooks
			context_budget: deepMerge(
				config.context_budget ?? getContextBudgetDefaults(),
				projectConfig.context_budget,
				{ enforceKeyFiltering: getConfigValidationEnabled(projectConfig) },
			) ?? getContextBudgetDefaults(),
			evidence: deepMerge(
				config.evidence ?? getEvidenceDefaults(),
				projectConfig.evidence,
				{ enforceKeyFiltering: getConfigValidationEnabled(projectConfig) },
			) ?? getEvidenceDefaults(),
			guardrails: deepMerge(
				config.guardrails ?? getGuardrailsDefaults(),
				projectConfig.guardrails,
				{ enforceKeyFiltering: getConfigValidationEnabled(projectConfig) },
			) ?? getGuardrailsDefaults(),
			hooks: deepMerge(
				config.hooks ?? getHooksDefaults(),
				projectConfig.hooks,
				{ enforceKeyFiltering: getConfigValidationEnabled(projectConfig) },
			) ?? getHooksDefaults(),
		};
	}

	swarmState.lastValidConfig = clonePluginConfig(config);

	return config;
}

/**
 * Load prompt file from prompts/ directory
 */
export function loadPrompt(name: string): string {
	const promptPath = path.join(PACKAGE_ROOT, 'prompts', `${name}.md`);
	try {
		return fs.readFileSync(promptPath, 'utf-8');
	} catch (error) {
		warn('Error reading prompt file', { name, path: promptPath, error });
		// Try with underscore instead of hyphen for backward compatibility
		const altPath = path.join(PACKAGE_ROOT, 'prompts', `${name.replace(/-/g, '_')}.md`);
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
	const refPath = path.join(PACKAGE_ROOT, 'references', `${name}.md`);
	try {
		return fs.readFileSync(refPath, 'utf-8');
	} catch (error) {
		warn('Error reading reference file', { name, path: refPath, error });
		return '';
	}
}
