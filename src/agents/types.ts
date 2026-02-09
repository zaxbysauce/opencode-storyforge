import type { AgentConfig } from '@opencode-ai/sdk';

export interface AgentDefinition {
	name: string;
	description?: string;
	config: AgentConfig;
}

export interface AgentTemplate {
	name: string;
	description: string;
	defaultTemperature: number;
}
