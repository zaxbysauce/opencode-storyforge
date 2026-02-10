import { z } from 'zod';

// Agent override configuration
export const AgentOverrideConfigSchema = z.object({
	model: z.string().optional(),
	temperature: z.number().min(0).max(2).optional(),
	disabled: z.boolean().optional(),
});

export type AgentOverrideConfig = z.infer<typeof AgentOverrideConfigSchema>;

// Context budget configuration
export const ContextBudgetConfigSchema = z.object({
	enabled: z.boolean().default(true),
	warn: z.number().min(0).max(1).default(0.7),
	critical: z.number().min(0).max(1).default(0.9),
	warn_threshold: z.number().min(0).max(1).optional(),
	critical_threshold: z.number().min(0).max(1).optional(),
	max_injection_tokens: z.number().min(0).default(4000),
	model_limits: z.record(z.string(), z.number()).default({ default: 128000 }),
	target_agents: z.array(z.string()).default(['architect']),
});

export type ContextBudgetConfig = z.infer<typeof ContextBudgetConfigSchema>;

// Evidence configuration
export const EvidenceConfigSchema = z.object({
	enabled: z.boolean().default(true),
	max_age_days: z.number().min(1).default(90),
	max_bundles: z.number().min(1).default(1000),
	auto_archive: z.boolean().default(false),
});

export type EvidenceConfig = z.infer<typeof EvidenceConfigSchema>;

// Guardrails configuration
export const GuardrailsConfigSchema = z.object({
	enabled: z.boolean().default(true),
	max_tool_calls: z.number().min(1).default(200),
	max_duration_minutes: z.number().min(1).default(30),
	max_repetitions: z.number().min(1).default(10),
	max_consecutive_errors: z.number().min(1).default(5),
	warning_threshold: z.number().min(0).max(1).default(0.5),
});

export type GuardrailsConfig = z.infer<typeof GuardrailsConfigSchema>;

// Hooks configuration
export const HooksConfigSchema = z.object({
	pre_agent: z.string().optional(),
	post_agent: z.string().optional(),
});

export type HooksConfig = z.infer<typeof HooksConfigSchema>;

// Main plugin configuration
export const PluginConfigSchema = z.object({
	agents: z.record(z.string(), AgentOverrideConfigSchema).optional(),

	// Context budget settings
	context_budget: ContextBudgetConfigSchema.default({
		enabled: true,
		warn: 0.7,
		critical: 0.9,
		max_injection_tokens: 4000,
		model_limits: { default: 128000 },
		target_agents: ['architect'],
	}),

	// Evidence settings
	evidence: EvidenceConfigSchema.default({
		enabled: true,
		max_age_days: 90,
		max_bundles: 1000,
		auto_archive: false,
	}),

	// Guardrails settings
	guardrails: GuardrailsConfigSchema.default({
		enabled: true,
		max_tool_calls: 200,
		max_duration_minutes: 30,
		max_repetitions: 10,
		max_consecutive_errors: 5,
		warning_threshold: 0.5,
	}),

	// Hooks settings
	hooks: HooksConfigSchema.optional(),

	// QA workflow settings (max revisions)
	qa_retry_limit: z.number().min(1).max(10).default(3),

	// File retry configuration (can be overridden via env vars)
	file_retry_enabled: z.boolean().default(true),
	max_file_operation_retries: z.number().min(0).max(5).default(3),

	// Config validation security settings
	config_validation_enabled: z.boolean().default(true),
});

export type PluginConfig = z.infer<typeof PluginConfigSchema>;

// Environment variable parsing helpers
function parseEnvBoolean(envValue: string | undefined): boolean | undefined {
	if (envValue === undefined) return undefined;
	return envValue.toLowerCase() === 'true' || envValue === '1';
}

function parseEnvInt(envValue: string | undefined, min: number, max: number): number | undefined {
	if (envValue === undefined) return undefined;
	const parsed = parseInt(envValue, 10);
	if (isNaN(parsed)) return undefined;
	return Math.max(min, Math.min(max, parsed));
}

// Environment variable override helpers
export function getFileRetryEnabled(config?: PluginConfig): boolean {
	const envValue = parseEnvBoolean(process.env.FILE_RETRY_ENABLED);
	if (envValue !== undefined) return envValue;
	if (config?.file_retry_enabled !== undefined) {
		return config.file_retry_enabled;
	}
	return true; // default
}

export function getMaxFileRetries(config?: PluginConfig): number {
	const envValue = parseEnvInt(process.env.WRITER_MAX_RETRIES, 0, 5);
	if (envValue !== undefined) return envValue;
	if (config?.max_file_operation_retries !== undefined) {
		return config.max_file_operation_retries;
	}
	return 3; // default
}

export function getConfigValidationEnabled(config?: PluginConfig): boolean {
	const envValue = parseEnvBoolean(process.env.CONFIG_VALIDATION_ENABLED);
	if (envValue !== undefined) return envValue;
	if (config?.config_validation_enabled !== undefined) {
		return config.config_validation_enabled;
	}
	return true; // default
}

// Default getter helpers for deep merge support
export function getContextBudgetDefaults(): ContextBudgetConfig {
	return {
		enabled: true,
		warn: 0.7,
		critical: 0.9,
		max_injection_tokens: 4000,
		model_limits: { default: 128000 },
		target_agents: ['architect'],
	};
}

export function getEvidenceDefaults(): EvidenceConfig {
	return {
		enabled: true,
		max_age_days: 90,
		max_bundles: 1000,
		auto_archive: false,
	};
}

export function getGuardrailsDefaults(): GuardrailsConfig {
	return {
		enabled: true,
		max_tool_calls: 200,
		max_duration_minutes: 30,
		max_repetitions: 10,
		max_consecutive_errors: 5,
		warning_threshold: 0.5,
	};
}

export function getHooksDefaults(): HooksConfig {
	return {};
}
