import { z } from 'zod';

// Agent override configuration
export const AgentOverrideConfigSchema = z.object({
	model: z.string().optional(),
	temperature: z.number().min(0).max(2).optional(),
	disabled: z.boolean().optional(),
});

export type AgentOverrideConfig = z.infer<typeof AgentOverrideConfigSchema>;

// Main plugin configuration
export const PluginConfigSchema = z.object({
	agents: z.record(z.string(), AgentOverrideConfigSchema).optional(),

	// QA workflow settings (max revisions)
	qa_retry_limit: z.number().min(1).max(10).default(3),

	// File retry configuration (can be overridden via env vars)
	file_retry_enabled: z.boolean().default(true),
	max_file_operation_retries: z.number().min(0).max(5).default(3),

	// Config validation security settings
	config_validation_enabled: z.boolean().default(true),
});

export type PluginConfig = z.infer<typeof PluginConfigSchema>;

// Environment variable override helpers
export function getFileRetryEnabled(config?: PluginConfig): boolean {
  	const envValue = process.env.FILE_RETRY_ENABLED;
  	if (envValue !== undefined) {
  		return envValue.toLowerCase() === 'true' || envValue === '1';
  	}
  	if (config?.file_retry_enabled !== undefined) {
  		return config.file_retry_enabled;
  	}
	return true; // default
}

export function getMaxFileRetries(config?: PluginConfig): number {
  	const envValue = process.env.WRITER_MAX_RETRIES;
  	if (envValue !== undefined) {
  		const parsed = parseInt(envValue, 10);
  		if (!isNaN(parsed)) {
  			return Math.max(0, Math.min(5, parsed));
  		}
  	}
  	if (config?.max_file_operation_retries !== undefined) {
  		return config.max_file_operation_retries;
  	}
	return 3; // default
}

export function getConfigValidationEnabled(config?: PluginConfig): boolean {
	const envValue = process.env.CONFIG_VALIDATION_ENABLED;
	if (envValue !== undefined) {
		return envValue.toLowerCase() === 'true' || envValue === '1';
	}
	if (config?.config_validation_enabled !== undefined) {
		return config.config_validation_enabled;
	}
	return true; // default
}
