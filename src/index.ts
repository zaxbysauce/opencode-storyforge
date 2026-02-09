import * as path from 'node:path';
import type { Hooks, Plugin } from '@opencode-ai/plugin';
import type { AgentConfig as SDKAgentConfig, Config } from '@opencode-ai/sdk';
import { createAgents, getAgentConfigs } from './agents';
import { loadPluginConfig, type PluginConfig } from './config';
import { createDelegationTrackerHook, createSystemEnhancerHook, safeHook } from './hooks';
import { read_writer_file, write_writer_file, list_writer_files } from './tools';
import { log, warn } from './utils';

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

type StoryForgeConfig = Config & PluginConfig & { agent?: Record<string, SDKAgentConfig> };

export function ensureAgentMap(
  opencodeConfig: StoryForgeConfig,
  agents: Record<string, SDKAgentConfig>,
  logger: (message: string, data?: unknown) => void = warn,
): StoryForgeConfig {
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
  const delegationHandler = createDelegationTrackerHook(config);

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

  const hooks: Hooks = {
    tool: {
      read_writer_file,
      write_writer_file,
      list_writer_files,
    },

    config: async (opencodeConfig: Config) => {
      ensureAgentMap(opencodeConfig as StoryForgeConfig, agents);
      log('Config applied', {
        agents: Object.keys(agents),
      });
    },

    'experimental.chat.system.transform': systemEnhancerHook[
      'experimental.chat.system.transform'
    ] as NonNullable<Hooks['experimental.chat.system.transform']>,

    'chat.message': safeHook(delegationHandler) as NonNullable<Hooks['chat.message']>,
  };

  return {
    ...hooks,
    name: 'OpenCode-StoryForge',
    agent: agents,
  } as Hooks & { name: string; agent: Record<string, SDKAgentConfig> };
};

export default WriterSwarmPlugin;
