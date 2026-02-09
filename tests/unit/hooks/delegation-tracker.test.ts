import { describe, it, expect, beforeEach } from 'bun:test';
import { createDelegationTrackerHook } from '../../../src/hooks/delegation-tracker';
import { swarmState, resetSwarmState } from '../../../src/state';

describe('createDelegationTrackerHook', () => {
	beforeEach(() => {
		resetSwarmState();
	});

	it('creates a delegation chain when none exists', async () => {
		const hook = createDelegationTrackerHook({} as any);
		await hook({ sessionID: 'session-1', agent: 'agent-1' }, {} as any);

		await hook({ sessionID: 'session-1', agent: 'agent-2' }, {} as any);

		const chain = swarmState.delegationChains.get('session-1');
		expect(chain).toHaveLength(1);
		expect(chain?.[0]).toEqual(
			expect.objectContaining({ from: 'agent-1', to: 'agent-2' }),
		);
	});

	it('handles a missing chain without throwing', async () => {
		const hook = createDelegationTrackerHook({} as any);
		await hook({ sessionID: 'session-2', agent: 'agent-A' }, {} as any);
		swarmState.delegationChains.delete('session-2');

		await expect(
			hook({ sessionID: 'session-2', agent: 'agent-B' }, {} as any),
		).resolves.toBeUndefined();

		const chain = swarmState.delegationChains.get('session-2');
		expect(chain).toHaveLength(1);
		expect(chain?.[0]).toEqual(
			expect.objectContaining({ from: 'agent-A', to: 'agent-B' }),
		);
	});
});
