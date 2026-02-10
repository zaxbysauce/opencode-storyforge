import * as path from 'node:path';
import type { Plugin } from '@opencode-ai/plugin';
import type { AgentConfig as SDKAgentConfig } from '@opencode-ai/sdk';
import { createAgents, getAgentConfigs } from './agents';
import { loadPluginConfig, type PluginConfig } from './config';
import {
	createDelegationTrackerHook,
	createSystemEnhancerHook,
	createContextBudgetHook,
	safeHook,
	composeHandlers,
} from './hooks';
import { createGuardrailsHook } from './hooks/guardrails';
import { getGuardrailsDefaults } from './config';
import {
	createReadWriterFile,
	createWriteWriterFile,
	createListWriterFiles,
} from './tools';
import { log, warn } from './utils';
import { createSwarmCommandHandler } from './commands';

// Export plan module for external use (Phase 2.2 scaffolding)
export * from './plan';

const SECRET_SUFFIX_PATTERN = /(_KEY|_SECRET|_TOKEN)$/i;

function isLogRedactionEnabled(): boolean {
	const envValue = process.env.LOG_REDACTION_ENABLED;
	return envValue === undefined || envValue.toLowerCase() !== 'false';
}

export function getSafeConfigKeys(config: PluginConfig): string[] {
	const keys = Object.keys(config);
	if (!isLogRedactionEnabled()) {
		return keys.sort();
	}
	return keys.filter((key) => !SECRET_SUFFIX_PATTERN.test(key)).sort();
}

export function formatStartupLog(agentCount: number, configKeys: string[], directory: string): string {
	const relativePath = path.relative(process.cwd(), directory) || '.';
	return `[WRITER_SWARM INIT] agents=${agentCount} configKeys=${configKeys.join(',')} directory=${relativePath}`;
}

export interface PluginInitConfig {
	agent?: Record<string, SDKAgentConfig>;
}

export function ensureAgentMap(
	opencodeConfig: PluginInitConfig,
	agents: Record<string, SDKAgentConfig>,
	logger: (message: string, data?: unknown) => void = warn,
): PluginInitConfig {
	if (!opencodeConfig.agent) {
		logger('Missing config.agent - injecting defaults', {
			fallback: true,
			agentCount: Object.keys(agents).length,
		});
		opencodeConfig.agent = { ...agents };
	} else {
		Object.assign(opencodeConfig.agent, agents);
	}

	return opencodeConfig;
}

export const WriterSwarmPlugin: Plugin = async ({ client, project, directory }) => {
	const config = loadPluginConfig(directory);
	const agents = getAgentConfigs(config);
	const safeConfigKeys = getSafeConfigKeys(config);
	const agentCount = Object.keys(agents).length;
	const agentNames = Object.keys(agents);

	const systemEnhancerHook = createSystemEnhancerHook(config, directory);
	const contextBudgetHook = createContextBudgetHook(config, directory);
	const delegationHandler = createDelegationTrackerHook(config);
	const commandHandler = createSwarmCommandHandler(directory);
	const guardrailsHook = createGuardrailsHook(config.guardrails ?? getGuardrailsDefaults());

	const startupMessage = formatStartupLog(agentCount, safeConfigKeys, directory);
	console.log(startupMessage);

	const verboseInit = process.env.VERBOSE_INIT === '1' || process.env.LOG_LEVEL === 'debug';

	if (verboseInit) {
		log('Plugin initialized', {
			directory: path.relative(process.cwd(), directory) || '.',
			agentCount,
			agentNames,
			configKeys: safeConfigKeys,
		});
	}

	const transformHandlers = [] as Array<(input: unknown, output: { system: string[] }) => Promise<void>>;
	if ((systemEnhancerHook as any)['experimental.chat.system.transform']) {
		transformHandlers.push(
			(systemEnhancerHook as any)['experimental.chat.system.transform'],
		);
	}
	if ((contextBudgetHook as any)['experimental.chat.system.transform']) {
		transformHandlers.push(
			(contextBudgetHook as any)['experimental.chat.system.transform'],
		);
	}
	const systemTransform = composeHandlers(...transformHandlers);

	return {
		name: 'opencode-writer-swarm',

		agent: agents,

		tool: {
			read_writer_file: createReadWriterFile(directory),
			write_writer_file: createWriteWriterFile(directory, config),
			list_writer_files: createListWriterFiles(directory),
		},

		// biome-ignore lint/suspicious/noExplicitAny: Plugin API requires generic config wrapper
		config: async (opencodeConfig: Record<string, unknown>): Promise<void> => { // RECORD-JUSTIFIED: Plugin API config shape is dynamic
			ensureAgentMap(opencodeConfig as PluginInitConfig, agents);

			if (!opencodeConfig.command) {
				opencodeConfig.command = {};
			}
			(opencodeConfig.command as Record<string, { template: string; description: string }>)['swarm'] = {
				template: '{{arguments}}',
				description: 'Swarm management commands',
			};

			log('Config applied', {
				agents: Object.keys(agents),
			});
		},

		// biome-ignore lint/suspicious/noExplicitAny: Plugin API requires generic hook wrappers
		'experimental.chat.system.transform': systemTransform as any,

		// biome-ignore lint/suspicious/noExplicitAny: Plugin API requires generic hook wrappers
		'chat.message': safeHook(delegationHandler) as any,

		// biome-ignore lint/suspicious/noExplicitAny: Plugin API requires generic hook wrappers
		'command.execute.before': safeHook(commandHandler) as any,

		// biome-ignore lint/suspicious/noExplicitAny: Plugin API requires generic hook wrappers
		'tool.execute.before': guardrailsHook.toolBefore as any,

		// biome-ignore lint/suspicious/noExplicitAny: Plugin API requires generic hook wrappers
		'tool.execute.after': guardrailsHook.toolAfter as any,
	};
};

export default WriterSwarmPlugin;
