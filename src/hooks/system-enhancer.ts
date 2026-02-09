import type { Plugin } from '@opencode-ai/plugin';
import type { PluginConfig } from '../config';
import { warn } from '../utils';
import {
	extractCurrentPhase,
	extractIncompleteTasks,
	extractDecisions,
} from './extractors';
import { readWriterFileAsync, safeHook } from './utils';

export function createSystemEnhancerHook(
	config: PluginConfig,
	directory: string,
): Partial<Plugin> {
	return {
		'experimental.chat.system.transform': safeHook(
			async (
				_input: { sessionID?: string; model?: unknown },
				output: { system: string[] },
			): Promise<void> => {
				try {
					const planContent = await readWriterFileAsync(directory, 'plan.md');
					const contextContent = await readWriterFileAsync(
						directory,
						'context.md',
					);

					if (planContent) {
						const currentPhase = extractCurrentPhase(planContent);
						if (currentPhase) {
							output.system.push(
								`[WRITER SWARM CONTEXT] Current phase: ${currentPhase}`,
							);
						}

						const incompleteTasks = extractIncompleteTasks(planContent);
						if (incompleteTasks) {
							output.system.push(
								`[WRITER SWARM CONTEXT] Pending phases:\n${incompleteTasks}`,
							);
						}
					}

					if (contextContent) {
						const decisions = extractDecisions(contextContent, 500);
						if (decisions) {
							output.system.push(`[WRITER SWARM CONTEXT] Key decisions:\n${decisions}`);
						}
					}
				} catch (error) {
					warn('System enhancer failed:', error);
				}
			},
		),
	};
}
