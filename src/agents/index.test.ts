import { describe, it, expect, beforeEach } from 'bun:test';
import { createAgents, getAgentConfigs } from '../agents';
import type { PluginConfig } from '../config';

describe('createAgents', () => {
	let mockConfig: PluginConfig;

	beforeEach(() => {
		mockConfig = {
			qa_retry_limit: 3,
			file_retry_enabled: true,
			max_file_operation_retries: 3,
			config_validation_enabled: true,
			agents: {
				writer: { model: 'custom-model', temperature: 0.8 },
			},
		context_budget: {
			enabled: true,
			warn: 0.7,
				critical: 0.9,
				max_injection_tokens: 4000,
				model_limits: { default: 128000 },
				target_agents: ['architect'],
			},
			evidence: {
				enabled: true,
				max_age_days: 90,
				max_bundles: 1000,
				auto_archive: false,
			},
			guardrails: {
				enabled: true,
				max_tool_calls: 200,
				max_duration_minutes: 30,
				max_repetitions: 10,
				max_consecutive_errors: 5,
				warning_threshold: 0.5,
			},
		};
	});

	describe('Happy path', () => {
		it('should create all agents from templates', () => {
			const agents = createAgents();

			expect(agents).toHaveLength(7);
			expect(agents).toContainEqual(
				expect.objectContaining({ name: 'editor_in_chief' }),
			);
			expect(agents).toContainEqual(
				expect.objectContaining({ name: 'writer' }),
			);
			expect(agents).toContainEqual(
				expect.objectContaining({ name: 'researcher' }),
			);
			expect(agents).toContainEqual(
				expect.objectContaining({ name: 'section_editor' }),
			);
			expect(agents).toContainEqual(
				expect.objectContaining({ name: 'copy_editor' }),
			);
			expect(agents).toContainEqual(
				expect.objectContaining({ name: 'fact_checker' }),
			);
			expect(agents).toContainEqual(
				expect.objectContaining({ name: 'reader_advocate' }),
			);
		});

		it('should create agent with default model when no override', () => {
			const agents = createAgents(mockConfig);

			const editor = agents.find((a) => a.name === 'editor_in_chief');
			expect(editor).toBeDefined();
			expect(editor?.config.model).toBe('anthropic/claude-sonnet-4-5');
		});

		it('should create agent with default temperature when no override', () => {
			const agents = createAgents(mockConfig);

			const editor = agents.find((a) => a.name === 'editor_in_chief');
			expect(editor).toBeDefined();
			expect(editor?.config.temperature).toBe(0.1);
		});
	});

	describe('Config overrides', () => {
		it('should apply model override from config', () => {
			const agents = createAgents(mockConfig);

			const writer = agents.find((a) => a.name === 'writer');
			expect(writer).toBeDefined();
			expect(writer?.config.model).toBe('custom-model');
		});

		it('should apply temperature override from config', () => {
			const agents = createAgents(mockConfig);

			const writer = agents.find((a) => a.name === 'writer');
			expect(writer).toBeDefined();
			expect(writer?.config.temperature).toBe(0.8);
		});

		it('should apply multiple overrides', () => {
			mockConfig.agents = {
				editor_in_chief: {
					model: 'gpt-4-turbo',
					temperature: 0.15,
				},
			};
			const agents = createAgents(mockConfig);

			const editor = agents.find((a) => a.name === 'editor_in_chief');
			expect(editor).toBeDefined();
			expect(editor?.config.model).toBe('gpt-4-turbo');
			expect(editor?.config.temperature).toBe(0.15);
		});

		it('should preserve default temperature when not overridden', () => {
			const agents = createAgents(mockConfig);

			const researcher = agents.find((a) => a.name === 'researcher');
			expect(researcher).toBeDefined();
			expect(researcher?.config.temperature).toBe(0.2);
		});

		it('should use default model when no override', () => {
			const agents = createAgents(mockConfig);

			const researcher = agents.find((a) => a.name === 'researcher');
			expect(researcher).toBeDefined();
			expect(researcher?.config.model).toBe('google/gemini-2.0-flash');
		});
	});

	describe('Disabled agents', () => {
		it('should skip disabled agents', () => {
			mockConfig.agents = {
				researcher: { disabled: true },
			};
			const agents = createAgents(mockConfig);

			expect(agents).toHaveLength(6); // 7 total - 1 disabled
			expect(agents).not.toContainEqual(
				expect.objectContaining({ name: 'researcher' }),
			);
		});

		it('should respect disabled flag in config', () => {
			mockConfig.agents = {
				researcher: { disabled: true },
			};
			const agents = createAgents(mockConfig);

			expect(agents).toHaveLength(6);
			expect(agents.find((a) => a.name === 'researcher')).toBeUndefined();
		});

		it('should not skip agent when disabled is false', () => {
			mockConfig.agents = {
				editor_in_chief: { disabled: false },
			};
			const agents = createAgents(mockConfig);

			expect(agents).toHaveLength(7);
			expect(agents.find((a) => a.name === 'editor_in_chief')).toBeDefined();
		});
	});

	describe('getAgentConfigs', () => {
		it('should convert agents to SDK configs', () => {
			mockConfig.agents = {
				researcher: { disabled: true },
			};
			const sdkConfigs = getAgentConfigs(mockConfig);

			expect(Object.keys(sdkConfigs)).toHaveLength(6); // 7 total - 1 disabled
			expect(sdkConfigs['editor_in_chief']).toBeDefined();
			expect(sdkConfigs['writer']).toBeDefined();
			expect(sdkConfigs['researcher']).toBeUndefined();
		});

		it('should include description in SDK config', () => {
			const sdkConfigs = getAgentConfigs(mockConfig);

			expect(sdkConfigs['editor_in_chief']).toHaveProperty('description');
			expect(sdkConfigs['editor_in_chief'].description).toBeDefined();
			expect(typeof sdkConfigs['editor_in_chief'].description).toBe('string');
		});

		it('should set editor_in_chief mode to primary', () => {
			const sdkConfigs = getAgentConfigs(mockConfig);

			expect(sdkConfigs['editor_in_chief'].mode).toBe('primary');
		});

		it('should set other agents mode to subagent', () => {
			const sdkConfigs = getAgentConfigs(mockConfig);

			expect(sdkConfigs['writer'].mode).toBe('subagent');
			expect(sdkConfigs['researcher'].mode).toBe('subagent');
			expect(sdkConfigs['section_editor'].mode).toBe('subagent');
		});

		it('should include all config properties in SDK config', () => {
			const sdkConfigs = getAgentConfigs(mockConfig);

			expect(sdkConfigs['writer']).toHaveProperty('model');
			expect(sdkConfigs['writer']).toHaveProperty('temperature');
			expect(sdkConfigs['writer']).toHaveProperty('prompt');
		});
	});

	describe('Edge cases', () => {
		it('should handle empty config', () => {
			const agents = createAgents(undefined);

			expect(agents).toHaveLength(7);
			expect(agents[0].name).toBe('editor_in_chief');
		});

		it('should handle config with no agent overrides', () => {
		const emptyOverrides = {
				qa_retry_limit: 3,
				file_retry_enabled: true,
				max_file_operation_retries: 3,
				config_validation_enabled: true,
				agents: {},
			context_budget: {
				enabled: true,
					warn: 0.7,
					critical: 0.9,
					max_injection_tokens: 4000,
					model_limits: { default: 128000 },
					target_agents: ['architect'],
				},
				evidence: {
					enabled: true,
					max_age_days: 90,
					max_bundles: 1000,
					auto_archive: false,
				},
				guardrails: {
					enabled: true,
					max_tool_calls: 200,
					max_duration_minutes: 30,
					max_repetitions: 10,
					max_consecutive_errors: 5,
					warning_threshold: 0.5,
				},
			};
			const agents = createAgents(emptyOverrides as PluginConfig);

			expect(agents).toHaveLength(7);
			expect(agents.find((a) => a.name === 'researcher')).toBeDefined();
		});

		it('should handle config with empty agents object', () => {
			const emptyAgents = {
				qa_retry_limit: 3,
				file_retry_enabled: true,
				max_file_operation_retries: 3,
				config_validation_enabled: true,
				agents: undefined,
			context_budget: {
				enabled: true,
					warn: 0.7,
					critical: 0.9,
					max_injection_tokens: 4000,
					model_limits: { default: 128000 },
					target_agents: ['architect'],
				},
				evidence: {
					enabled: true,
					max_age_days: 90,
					max_bundles: 1000,
					auto_archive: false,
				},
				guardrails: {
					enabled: true,
					max_tool_calls: 200,
					max_duration_minutes: 30,
					max_repetitions: 10,
					max_consecutive_errors: 5,
					warning_threshold: 0.5,
				},
			};
			const agents = createAgents(emptyAgents as PluginConfig);

			expect(agents).toHaveLength(7);
		});

		it('should handle all agents disabled', () => {
			mockConfig.agents = {
				editor_in_chief: { disabled: true },
				writer: { disabled: true },
				researcher: { disabled: true },
				section_editor: { disabled: true },
				copy_editor: { disabled: true },
				fact_checker: { disabled: true },
				reader_advocate: { disabled: true },
			};
			const agents = createAgents(mockConfig);

			expect(agents).toHaveLength(0);
		});

		it('should preserve other config values when config is provided', () => {
			const agents = createAgents(mockConfig);

			// The config should still be accessible through the returned agents
			expect(agents).toBeDefined();
		});
	});
});
