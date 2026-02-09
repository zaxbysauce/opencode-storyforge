import type { AgentTemplate } from './types';

export const AGENT_TEMPLATES: AgentTemplate[] = [
	{
		name: 'editor_in_chief',
		description:
			'Orchestrator of the writing workflow. Sets direction, delegates tasks, and makes final quality decisions. Never writes content directly.',
		defaultTemperature: 0.1,
	},
	{
		name: 'writer',
		description:
			'Professional writer who produces content based on briefs and outlines.',
		defaultTemperature: 0.7,
	},
	{
		name: 'researcher',
		description:
			'Research desk editor who gathers facts, sources, and data.',
		defaultTemperature: 0.2,
	},
	{
		name: 'section_editor',
		description:
			'Structural editor who reviews content for flow, argument, and completeness.',
		defaultTemperature: 0.1,
	},
	{
		name: 'copy_editor',
		description:
			'Language expert who reviews for grammar, style, and AI slop.',
		defaultTemperature: 0.1,
	},
	{
		name: 'fact_checker',
		description:
			'Fact checker who verifies all claims and attributions.',
		defaultTemperature: 0.1,
	},
	{
		name: 'reader_advocate',
		description:
			'Reader persona who evaluates engagement, clarity, and authenticity.',
		defaultTemperature: 0.5,
	},
];
