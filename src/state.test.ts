import { describe, it, expect, beforeEach } from 'bun:test';
import {
	MAX_SESSIONS,
	swarmState,
	pruneOldestSessions,
	enforceSessionLimit,
	resetSwarmState,
	disposeSwarmState,
} from './state';

describe('MAX_SESSIONS constant', () => {
	it('equals 1000', () => {
		expect(MAX_SESSIONS).toBe(1000);
	});
});

describe('pruneOldestSessions', () => {
	beforeEach(() => {
		resetSwarmState();
	});

	it('prunes exactly count sessions from both Maps', () => {
		// Add 5 sessions
		for (let i = 0; i < 5; i++) {
			const sessionID = `session-${i}`;
			swarmState.activeAgent.set(sessionID, `agent-${i}`);
			swarmState.delegationChains.set(sessionID, []);
		}

		pruneOldestSessions(3);

		expect(swarmState.activeAgent.size).toBe(2);
		expect(swarmState.delegationChains.size).toBe(2);
	});

	it('prunes oldest entries (first inserted)', () => {
		// Add sessions in order
		for (let i = 0; i < 5; i++) {
			const sessionID = `session-${i}`;
			swarmState.activeAgent.set(sessionID, `agent-${i}`);
			swarmState.delegationChains.set(sessionID, [
				{ from: 'agent-0', to: `agent-${i}`, timestamp: i },
			]);
		}

		pruneOldestSessions(2);

		// Should have removed session-0 and session-1
		expect(swarmState.activeAgent.has('session-0')).toBe(false);
		expect(swarmState.activeAgent.has('session-1')).toBe(false);
		expect(swarmState.activeAgent.has('session-2')).toBe(true);
		expect(swarmState.activeAgent.has('session-3')).toBe(true);
		expect(swarmState.activeAgent.has('session-4')).toBe(true);
	});

	it('handles count=0 (no-op)', () => {
		// Add 3 sessions
		for (let i = 0; i < 3; i++) {
			const sessionID = `session-${i}`;
			swarmState.activeAgent.set(sessionID, `agent-${i}`);
			swarmState.delegationChains.set(sessionID, []);
		}

		const originalSize = swarmState.activeAgent.size;
		pruneOldestSessions(0);

		expect(swarmState.activeAgent.size).toBe(originalSize);
		expect(swarmState.activeAgent.has('session-0')).toBe(true);
		expect(swarmState.activeAgent.has('session-1')).toBe(true);
		expect(swarmState.activeAgent.has('session-2')).toBe(true);
	});

	it('handles count > Map.size (prunes all)', () => {
		// Add 3 sessions
		for (let i = 0; i < 3; i++) {
			const sessionID = `session-${i}`;
			swarmState.activeAgent.set(sessionID, `agent-${i}`);
			swarmState.delegationChains.set(sessionID, []);
		}

		pruneOldestSessions(10); // More than available

		expect(swarmState.activeAgent.size).toBe(0);
		expect(swarmState.delegationChains.size).toBe(0);
	});

	it('only prunes from activeAgent entries (delegationChains without matching activeAgent remain)', () => {
		// Add sessions to activeAgent
		for (let i = 0; i < 5; i++) {
			const sessionID = `session-${i}`;
			swarmState.activeAgent.set(sessionID, `agent-${i}`);
			swarmState.delegationChains.set(sessionID, [
				{ from: 'agent-0', to: `agent-${i}`, timestamp: i },
			]);
		}

		// Add extra delegationChain entries not in activeAgent
		swarmState.delegationChains.set('orphan-1', [
			{ from: 'agent-A', to: 'agent-B', timestamp: 100 },
		]);
		swarmState.delegationChains.set('orphan-2', [
			{ from: 'agent-C', to: 'agent-D', timestamp: 200 },
		]);

		// Prune 2 sessions (should prune session-0 and session-1)
		pruneOldestSessions(2);

		// activeAgent should be reduced by 2
		expect(swarmState.activeAgent.size).toBe(3);
		expect(swarmState.activeAgent.has('session-0')).toBe(false);
		expect(swarmState.activeAgent.has('session-1')).toBe(false);

		// delegationChains should be reduced by 2 (matching activeAgent prunes)
		// but orphans should remain
		expect(swarmState.delegationChains.size).toBe(5);
		expect(swarmState.delegationChains.has('session-0')).toBe(false);
		expect(swarmState.delegationChains.has('session-1')).toBe(false);
		expect(swarmState.delegationChains.has('orphan-1')).toBe(true);
		expect(swarmState.delegationChains.has('orphan-2')).toBe(true);
	});
});

describe('enforceSessionLimit', () => {
	beforeEach(() => {
		resetSwarmState();
	});

	it('no-op when both Maps are under MAX_SESSIONS', () => {
		// Add fewer than MAX_SESSIONS (e.g., 100)
		for (let i = 0; i < 100; i++) {
			const sessionID = `session-${i}`;
			swarmState.activeAgent.set(sessionID, `agent-${i}`);
			swarmState.delegationChains.set(sessionID, []);
		}

		const originalSize = swarmState.activeAgent.size;
		enforceSessionLimit();

		expect(swarmState.activeAgent.size).toBe(originalSize);
		expect(swarmState.delegationChains.size).toBe(originalSize);
	});

	it('prunes when activeAgent exceeds MAX_SESSIONS', () => {
		// Add more than MAX_SESSIONS (e.g., 1100)
		for (let i = 0; i < 1100; i++) {
			const sessionID = `session-${i}`;
			swarmState.activeAgent.set(sessionID, `agent-${i}`);
			swarmState.delegationChains.set(sessionID, []);
		}

		enforceSessionLimit();

		// Should have pruned 10% of 1100 = 110 (Math.ceil)
		expect(swarmState.activeAgent.size).toBe(990);
	});

	it('prunes when delegationChains exceeds MAX_SESSIONS', () => {
		// Add sessions with extra delegationChains entries
		for (let i = 0; i < 500; i++) {
			const sessionID = `session-${i}`;
			swarmState.activeAgent.set(sessionID, `agent-${i}`);
			swarmState.delegationChains.set(sessionID, []);
		}

		// Add extra delegationChain entries not in activeAgent
		for (let i = 0; i < 700; i++) {
			const sessionID = `orphan-${i}`;
			swarmState.delegationChains.set(sessionID, [
				{ from: 'agent-0', to: `agent-${i}`, timestamp: i },
			]);
		}

		enforceSessionLimit();

		// maxSize = 1200, pruneCount = 120 (10% of 1200)
		// pruneOldestSessions removes 120 from activeAgent and 120 from delegationChains
		// Result: 380 activeAgent, 1080 delegationChains (500 - 120 = 380, 1200 - 120 = 1080)
		expect(swarmState.activeAgent.size).toBe(380);
		expect(swarmState.delegationChains.size).toBe(1080);
	});

	it('prunes 10% of max size (Math.ceil)', () => {
		// Add exactly 1005 sessions (so 10% = 100.5, rounds to 101)
		for (let i = 0; i < 1005; i++) {
			const sessionID = `session-${i}`;
			swarmState.activeAgent.set(sessionID, `agent-${i}`);
			swarmState.delegationChains.set(sessionID, []);
		}

		enforceSessionLimit();

		// 1005 - 101 = 904
		expect(swarmState.activeAgent.size).toBe(904);
	});

	it('works when only one Map exceeds limit', () => {
		// Add exactly 1000 sessions to activeAgent
		for (let i = 0; i < 1000; i++) {
			const sessionID = `session-${i}`;
			swarmState.activeAgent.set(sessionID, `agent-${i}`);
			swarmState.delegationChains.set(sessionID, []);
		}

		// Add extra to delegationChains only (make it exceed by 50)
		for (let i = 0; i < 50; i++) {
			const sessionID = `extra-${i}`;
			swarmState.delegationChains.set(sessionID, [
				{ from: 'agent-0', to: `agent-${i}`, timestamp: i },
			]);
		}

		// maxSize = 1050, pruneCount = 105 (10% of 1050, Math.ceil)
		enforceSessionLimit();

		// pruneOldestSessions removes 105 from activeAgent and 105 from delegationChains
		// Result: 895 activeAgent (1000 - 105), 945 delegationChains (1050 - 105)
		expect(swarmState.activeAgent.size).toBe(895);
		expect(swarmState.delegationChains.size).toBe(945);
	});
});

describe('disposeSwarmState', () => {
	beforeEach(() => {
		resetSwarmState();
	});

	it('clears all Maps', () => {
		// Add some sessions
		for (let i = 0; i < 10; i++) {
			const sessionID = `session-${i}`;
			swarmState.activeAgent.set(sessionID, `agent-${i}`);
			swarmState.delegationChains.set(sessionID, [
				{ from: 'agent-0', to: `agent-${i}`, timestamp: i },
			]);
		}

		expect(swarmState.activeAgent.size).toBe(10);
		expect(swarmState.delegationChains.size).toBe(10);

		disposeSwarmState();

		expect(swarmState.activeAgent.size).toBe(0);
		expect(swarmState.delegationChains.size).toBe(0);
	});

	it('resets pendingEvents to 0', () => {
		swarmState.pendingEvents = 42;

		disposeSwarmState();

		expect(swarmState.pendingEvents).toBe(0);
	});

	it('resets all cacheStats to 0', () => {
		swarmState.cacheStats.cacheHits = 100;
		swarmState.cacheStats.cacheMisses = 50;
		swarmState.cacheStats.cacheSizeBytes = 1024;

		disposeSwarmState();

		expect(swarmState.cacheStats.cacheHits).toBe(0);
		expect(swarmState.cacheStats.cacheMisses).toBe(0);
		expect(swarmState.cacheStats.cacheSizeBytes).toBe(0);
	});

	it('clears all state completely', () => {
		// Set all state
		for (let i = 0; i < 5; i++) {
			const sessionID = `session-${i}`;
			swarmState.activeAgent.set(sessionID, `agent-${i}`);
			swarmState.delegationChains.set(sessionID, []);
		}
		swarmState.pendingEvents = 10;
		swarmState.cacheStats.cacheHits = 20;
		swarmState.cacheStats.cacheMisses = 30;
		swarmState.cacheStats.cacheSizeBytes = 4096;

		disposeSwarmState();

		expect(swarmState.activeAgent.size).toBe(0);
		expect(swarmState.delegationChains.size).toBe(0);
		expect(swarmState.pendingEvents).toBe(0);
		expect(swarmState.cacheStats.cacheHits).toBe(0);
		expect(swarmState.cacheStats.cacheMisses).toBe(0);
		expect(swarmState.cacheStats.cacheSizeBytes).toBe(0);
	});
});
