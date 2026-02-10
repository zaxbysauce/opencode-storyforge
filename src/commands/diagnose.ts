import { loadPluginConfig } from '../config/loader';
import { readSwarmFileAsync } from '../hooks/utils';

/**
 * Handles the /swarm diagnose command.
 * Performs health checks on swarm state files and configuration.
 */
export async function handleDiagnoseCommand(
	directory: string,
	_args: string[],
): Promise<string> {
	const checks: Array<{ name: string; status: '✅' | '❌'; detail: string }> = [];

	// Check 1: .swarm/ directory exists (by trying to read a file)
	const planContent = await readSwarmFileAsync(directory, 'plan.md');
	const contextContent = await readSwarmFileAsync(directory, 'context.md');

	// Check 2: plan.md exists and is parseable
	if (planContent) {
		const hasPhases = /^## Phase \d+/m.test(planContent);
		const hasTasks = /^- \[[ x]\]/m.test(planContent);
		if (hasPhases && hasTasks) {
			checks.push({
				name: 'plan.md',
				status: '✅',
				detail: 'Found with valid phase structure',
			});
		} else {
			checks.push({
				name: 'plan.md',
				status: '❌',
				detail: 'Found but missing phase/task structure',
			});
		}
	} else {
		checks.push({ name: 'plan.md', status: '❌', detail: 'Not found' });
	}

	// Check 3: context.md exists
	if (contextContent) {
		checks.push({ name: 'context.md', status: '✅', detail: 'Found' });
	} else {
		checks.push({ name: 'context.md', status: '❌', detail: 'Not found' });
	}

	// Check 4: Plugin config is valid
	try {
		const config = loadPluginConfig(directory);
		if (config) {
			checks.push({
				name: 'Plugin config',
				status: '✅',
				detail: 'Valid configuration loaded',
			});
		} else {
			checks.push({
				name: 'Plugin config',
				status: '✅',
				detail: 'Using defaults (no custom config)',
			});
		}
	} catch {
		checks.push({
			name: 'Plugin config',
			status: '❌',
			detail: 'Invalid configuration',
		});
	}

	// Format output
	const passCount = checks.filter((c) => c.status === '✅').length;
	const totalCount = checks.length;
	const allPassed = passCount === totalCount;

	const lines = [
		'## Swarm Health Check',
		'',
		...checks.map((c) => `- ${c.status} **${c.name}**: ${c.detail}`),
		'',
		`**Result**: ${allPassed ? '✅ All checks passed' : `⚠️ ${passCount}/${totalCount} checks passed`}`,
	];

	return lines.join('\n');
}
