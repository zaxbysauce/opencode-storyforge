import type { AgentConfig as SDKAgentConfig } from '@opencode-ai/sdk';
import {
	DEFAULT_MODELS,
	type PluginConfig,
	loadPrompt,
} from '../config';
import type { AgentDefinition } from './types';
import { AGENT_TEMPLATES } from './definitions';

export type { AgentDefinition } from './types';

/** Resolve model: config override → default constant. */
function getModelForAgent(
	agentName: string,
	config?: PluginConfig,
): string {
	// 1. Check explicit override
	const explicit = config?.agents?.[agentName]?.model;
	if (explicit) return explicit;

	// 2. Default from constants
	return DEFAULT_MODELS[agentName] ?? DEFAULT_MODELS.default;
}

/** Check if agent is disabled via config. */
function isAgentDisabled(
	agentName: string,
	config?: PluginConfig,
): boolean {
	return config?.agents?.[agentName]?.disabled === true;
}

/** Get temperature override from config, if any. */
function getTemperatureOverride(
	agentName: string,
	config?: PluginConfig,
): number | undefined {
	return config?.agents?.[agentName]?.temperature;
}

/** Apply temperature override to agent definition. */
function applyOverrides(
	agent: AgentDefinition,
	config?: PluginConfig,
): AgentDefinition {
	const tempOverride = getTemperatureOverride(agent.name, config);
	if (tempOverride !== undefined) {
		return {
			...agent,
			config: { ...agent.config, temperature: tempOverride },
		};
	}
	return agent;
}

/**
 * Create all agent definitions with configuration applied
 */
export function createAgents(config?: PluginConfig): AgentDefinition[] {
	const agents: AgentDefinition[] = [];

	// Helper to get model
	const getModel = (name: string) => getModelForAgent(name, config);

  // Helper to load prompt
  const getPrompt = (name: string) => loadPrompt(name.replaceAll('_', '-'));

	for (const template of AGENT_TEMPLATES) {
		if (!isAgentDisabled(template.name, config)) {
			const agent: AgentDefinition = {
				name: template.name,
				description: template.description,
				config: {
					model: getModel(template.name),
					temperature: template.defaultTemperature,
					prompt: getPrompt(template.name),
				},
			};
			agents.push(applyOverrides(agent, config));
		}
	}

	return agents;
}

/**
 * Get agent configurations formatted for the OpenCode SDK.
 */
export function getAgentConfigs(
	config?: PluginConfig,
): Record<string, SDKAgentConfig> {
	const agents = createAgents(config);

	return Object.fromEntries(
		agents.map((agent) => {
			const sdkConfig: SDKAgentConfig = {
				...agent.config,
				description: agent.description,
			};

			// Apply mode based on agent type
			if (agent.name === 'editor_in_chief') {
				sdkConfig.mode = 'primary';
			} else {
				sdkConfig.mode = 'subagent';
			}

			return [agent.name, sdkConfig];
		}),
	);
}
