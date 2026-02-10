import type { PluginConfig } from '../config';
import type { ContextBudgetConfig } from '../config/schema';
import { readSwarmFileAsync, safeHook } from './utils';
import { log, warn } from '../utils/logger';

/** Heuristic token estimation based on character count. */
function estimateTokens(text?: string): number {
	if (!text) return 0;
	return Math.ceil(text.length * 0.33);
}

function normalizeAgentValue(value?: unknown): string | null {
	if (typeof value !== 'string') return null;
	const trimmed = value.trim();
	if (!trimmed) return null;
	return trimmed.replace(/^(?:mega_|paid_|local_|default_)/i, '').toLowerCase();
}

function resolveTokenLimit(model: unknown, budget: ContextBudgetConfig): number {
 const modelLimits = budget.model_limits ?? { default: 128000 };
	if (typeof model === 'string') {
		const normalizedModel = model.toLowerCase();
		const matchingKey = Object.keys(modelLimits).find((key) => key.toLowerCase() === normalizedModel);
		if (matchingKey) return modelLimits[matchingKey];
	}
	return modelLimits.default ?? 128000;
}

type SystemTransformInput = {
	agent?: unknown;
	model?: unknown;
	[other: string]: unknown;
};

export function createContextBudgetHook(
	config: PluginConfig,
	directory: string,
): Partial<Record<string, (input: SystemTransformInput, output: { system: string[] }) => Promise<void>>> {
	const handler = safeHook(async (input: SystemTransformInput, output: { system: string[] }) => {
		const budget = config.context_budget;
		if (!budget || !budget.enabled) return;

		const normalizedAgent = normalizeAgentValue(input.agent);
		if (!normalizedAgent) return;

		const targets = (budget.target_agents ?? ['architect'])
			.map(normalizeAgentValue)
			.filter((entry): entry is string => typeof entry === 'string');
		if (!targets.includes(normalizedAgent)) return;

		const [planResult, contextResult] = await Promise.allSettled([
			readSwarmFileAsync(directory, 'plan.md'),
			readSwarmFileAsync(directory, 'context.md'),
		]);

		if (planResult.status === 'rejected') {
			log('Context budget file read failed (.swarm/plan.md)', {
				filename: 'plan.md',
				error: planResult.reason,
			});
		}
		if (contextResult.status === 'rejected') {
			log('Context budget file read failed (.swarm/context.md)', {
				filename: 'context.md',
				error: contextResult.reason,
			});
		}

		const planContent = planResult.status === 'fulfilled' ? planResult.value : null;
		const contextContent = contextResult.status === 'fulfilled' ? contextResult.value : null;


		const planTokens = estimateTokens(planContent ?? undefined);
		const contextTokens = estimateTokens(contextContent ?? undefined);
		const systemTokens = (Array.isArray(output.system) ? output.system : []).reduce(
			(total, entry) => {
				if (typeof entry !== 'string') return total;
				if (entry.includes('[WRITER SWARM CONTEXT] CONTEXT')) return total;
				return total + estimateTokens(entry);
			},
			0,
		);

		const totalTokens = planTokens + contextTokens + systemTokens;
		const maxTokens = resolveTokenLimit(input.model, budget);
		if (maxTokens <= 0) return;

		const warnThreshold =
			budget.warn_threshold !== undefined
				? budget.warn_threshold
				: budget.warn !== undefined
				? budget.warn
				: 0.7;
		const criticalThreshold =
			budget.critical_threshold !== undefined
				? budget.critical_threshold
				: budget.critical !== undefined
				? budget.critical
				: 0.9;
		const normalizedWarn = Math.min(1, Math.max(0, warnThreshold));
		const normalizedCritical = Math.max(normalizedWarn, Math.min(1, criticalThreshold));

		const ratio = totalTokens / maxTokens;
		if (ratio < normalizedWarn) return;

		const level = ratio >= normalizedCritical ? 'CRITICAL' : 'WARNING';
		const percent = Math.min(100, Math.round(ratio * 100));
		const suggestions =
			level === 'CRITICAL'
				? 'Archive completed phases and summarize decisions before adding new content.'
				: 'Focus on the current phase/task and latest decisions before adding more context.';
		const message = `[WRITER SWARM CONTEXT] CONTEXT ${level}: ${percent}% of the ${maxTokens}-token budget estimated (${totalTokens} tokens). ${suggestions}`;
		const injectionLimit = budget.max_injection_tokens ?? 4000;
		if (estimateTokens(message) > injectionLimit) {
			log('Context budget warning skipped: injection limit exceeded', {
				agent: normalizedAgent,
				limit: injectionLimit,
				estimatedTokens: estimateTokens(message),
			});
			return;
		}

		if (!Array.isArray(output.system)) {
			output.system = [];
		}

		if (level === 'CRITICAL') {
			output.system = (output.system as string[]).filter((entry) => {
				if (typeof entry !== 'string') return true;
				return !entry.includes('[WRITER SWARM CONTEXT] CONTEXT WARNING:');
			});
		}
		if (
			(output.system as string[]).some(
				(entry) => typeof entry === 'string' && entry.includes(`[WRITER SWARM CONTEXT] CONTEXT ${level}:`),
			)
		) {
			log('Context budget warning skipped: duplicate level already present', { level });
			return;
		}

		output.system.push(message);
		warn('Context budget warning triggered', {
			agent: normalizedAgent,
			level,
			percent,
			tokens: totalTokens,
			limit: maxTokens,
			model: input.model,
		});
	});

	return {
		'experimental.chat.system.transform': handler,
	};
}
