import { readSwarmFileAsync } from '../hooks/utils';

/**
 * Handles the /swarm export command.
 * Exports plan.md and context.md as a portable JSON object.
 */
export async function handleExportCommand(
	directory: string,
	_args: string[],
): Promise<string> {
	const planContent = await readSwarmFileAsync(directory, 'plan.md');
	const contextContent = await readSwarmFileAsync(directory, 'context.md');

	const exportData = {
		version: '1.0.0',
		exported: new Date().toISOString(),
		plan: planContent,
		context: contextContent,
	};

	const lines = [
		'## Swarm Export',
		'',
		'```json',
		JSON.stringify(exportData, null, 2),
		'```',
	];

	return lines.join('\n');
}
