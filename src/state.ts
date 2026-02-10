import type { PluginConfig } from './config/schema';

/** Shared state for plugin sessions and cache tracking. */

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

/** Guardrail tracking state per session */
export interface GuardrailSession {
    toolCalls: number;
    firstToolAt: number | null;
    repetitionCount: number;
    consecutiveErrors: number;
    lastTool: string | null;
}

/** Maximum number of sessions to track before pruning */
export const MAX_SESSIONS = 1000;

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

    /** Last successfully loaded config document */
    lastValidConfig: null as PluginConfig | null,

    /** Guardrail tracking per session — keyed by sessionID */
    guardrails: new Map<string, GuardrailSession>(),
};

/**
 * Prune the oldest sessions from both Maps.
 * Map iteration order is insertion order, so the first entries are oldest.
 * @param count - Number of sessions to prune
 */
export function pruneOldestSessions(count: number): void {
	let pruned = 0;
	for (const [sessionID] of swarmState.activeAgent) {
		if (pruned >= count) break;
		swarmState.activeAgent.delete(sessionID);
		swarmState.delegationChains.delete(sessionID);
		pruned++;
	}
}

/**
 * Enforce the session limit by pruning if Maps exceed MAX_SESSIONS.
 * Prunes 10% of sessions when the limit is hit.
 */
export function enforceSessionLimit(): void {
	const activeAgentSize = swarmState.activeAgent.size;
	const delegationChainsSize = swarmState.delegationChains.size;

	const maxSize = Math.max(activeAgentSize, delegationChainsSize);
	if (maxSize > MAX_SESSIONS) {
		const pruneCount = Math.ceil(maxSize * 0.1);
		pruneOldestSessions(pruneCount);
	}
}

/** Clear all session tracking, events, and cache stats. Used between tests and for plugin reinitialization. */
export function resetSwarmState(): void {
    swarmState.activeAgent.clear();
    swarmState.delegationChains.clear();
    swarmState.pendingEvents = 0;
    swarmState.cacheStats.cacheHits = 0;
    swarmState.cacheStats.cacheMisses = 0;
    swarmState.cacheStats.cacheSizeBytes = 0;
    swarmState.lastValidConfig = null;
    swarmState.guardrails.clear();
}

/**
 * Finalize and clear all swarm state.
 * Alias for resetSwarmState, signaling end-of-lifecycle cleanup.
 */
export function disposeSwarmState(): void {
	resetSwarmState();
}

/**
 * Get or initialize guardrail session state for a given sessionID.
 * @param sessionID - The session identifier
 * @returns The guardrail session state (initializes if missing)
 */
export function getGuardrailSession(sessionID: string): GuardrailSession {
	let session = swarmState.guardrails.get(sessionID);
	if (!session) {
		session = {
			toolCalls: 0,
			firstToolAt: null,
			repetitionCount: 0,
			consecutiveErrors: 0,
			lastTool: null,
		};
		swarmState.guardrails.set(sessionID, session);
	}
	return session;
}

/**
 * Reset guardrail state for a specific session.
 * @param sessionID - The session identifier to clear
 */
export function resetGuardrailState(sessionID: string): void {
	swarmState.guardrails.delete(sessionID);
}
