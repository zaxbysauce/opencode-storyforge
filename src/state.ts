/**
 * Shared state module for OpenCode Writer Swarm plugin.
 */

export interface DelegationEntry {
	from: string;
	to: string;
	timestamp: number;
}

export interface CacheStats {
	cacheHits: number;
	cacheMisses: number;
	cacheSizeBytes: number;
}

export const swarmState = {
	/** Active agent per session — keyed by sessionID */
	activeAgent: new Map<string, string>(),

	/** Delegation chains per session — keyed by sessionID */
	delegationChains: new Map<string, DelegationEntry[]>(),

	/** Number of events since last flush */
	pendingEvents: 0,

	/** Cache statistics for markdown AST parsing */
	cacheStats: {
		cacheHits: 0,
		cacheMisses: 0,
		cacheSizeBytes: 0,
	} as CacheStats,
};

export function resetSwarmState(): void {
	swarmState.activeAgent.clear();
	swarmState.delegationChains.clear();
	swarmState.pendingEvents = 0;
	swarmState.cacheStats.cacheHits = 0;
	swarmState.cacheStats.cacheMisses = 0;
	swarmState.cacheStats.cacheSizeBytes = 0;
}
