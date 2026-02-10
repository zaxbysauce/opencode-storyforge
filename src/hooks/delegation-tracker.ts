import type { PluginConfig } from '../config';
import { swarmState, type DelegationEntry, enforceSessionLimit } from '../state';

export function createDelegationTrackerHook(
	config: PluginConfig,
): (
	input: { sessionID: string; agent?: string },
	output: Record<string, unknown>, // RECORD-JUSTIFIED: dynamic hook metadata
) => Promise<void> {
	return async (
		input: { sessionID: string; agent?: string },
		_output: Record<string, unknown>, // RECORD-JUSTIFIED: safe hook payload
	): Promise<void> => {
		if (!input.agent || input.agent === '') {
			return;
		}

		const previousAgent = swarmState.activeAgent.get(input.sessionID);
		swarmState.activeAgent.set(input.sessionID, input.agent);

		if (previousAgent && previousAgent !== input.agent) {
			const entry: DelegationEntry = {
				from: previousAgent,
				to: input.agent,
				timestamp: Date.now(),
			};

		if (!swarmState.delegationChains.has(input.sessionID)) {
				swarmState.delegationChains.set(input.sessionID, []);
			}

			const chain = swarmState.delegationChains.get(input.sessionID)!;
			chain.push(entry);

			swarmState.pendingEvents++;
			enforceSessionLimit();
		}
	};
}
