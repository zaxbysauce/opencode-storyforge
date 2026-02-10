/**
 * Compaction Customizer Hook
 *
 * Enhances session compaction by injecting swarm context from plan.md and context.md.
 * Adds current phase information and key decisions to the compaction context.
 */

import type { PluginConfig } from '../config';
import {
	extractCurrentPhase,
	extractDecisions,
	extractIncompleteTasks,
	extractPatterns,
} from './extractors';
import { readSwarmFileAsync, safeHook } from './utils';

/**
 * Creates the experimental.session.compacting hook for compaction customization.
 */
export function createCompactionCustomizerHook(
	config: PluginConfig,
	directory: string,
): Record<string, unknown> {
	const enabled = config.hooks?.compaction !== false;

	if (!enabled) {
		return {};
	}

	return {
		'experimental.session.compacting': safeHook(
			async (
				_input: { sessionID: string },
				output: { context: string[]; prompt?: string },
			): Promise<void> => {
				const planContent = await readSwarmFileAsync(directory, 'plan.md');
				const contextContent = await readSwarmFileAsync(
					directory,
					'context.md',
				);

				// Add current phase from plan.md
				if (planContent) {
					const currentPhase = extractCurrentPhase(planContent);
					if (currentPhase) {
						output.context.push(`[SWARM PLAN] ${currentPhase}`);
					}
				}

				// Add decisions summary from context.md
				if (contextContent) {
					const decisionsSummary = extractDecisions(contextContent);
					if (decisionsSummary) {
						output.context.push(`[SWARM DECISIONS] ${decisionsSummary}`);
					}
				}

				// Add incomplete tasks from plan.md
				if (planContent) {
					const incompleteTasks = extractIncompleteTasks(planContent);
					if (incompleteTasks) {
						output.context.push(`[SWARM TASKS] ${incompleteTasks}`);
					}
				}

				// Add patterns from context.md
				if (contextContent) {
					const patterns = extractPatterns(contextContent);
					if (patterns) {
						output.context.push(`[SWARM PATTERNS] ${patterns}`);
					}
				}

				// Note: Do not modify output.prompt - let OpenCode use its default compaction prompt
			},
		),
	};
}
