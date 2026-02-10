import { existsSync, unlinkSync } from 'node:fs';
import { validateSwarmPath } from '../hooks/utils';

export async function handleResetCommand(
	directory: string,
	args: string[],
): Promise<string> {
	// Check for --confirm flag
	if (!args.includes('--confirm')) {
		return [
			'## ⚠️ Reset Requires Confirmation',
			'',
			'To reset the swarm state, use the `--confirm` flag:',
			'',
			'```',
			'/swarm reset --confirm',
			'```',
			'',
			'**Warning:** This will delete:',
			'- `.swarm/plan.md`',
			'- `.swarm/context.md`',
			'',
			'This action cannot be undone.',
		].join('\n');
	}

	const filesToDelete = ['plan.md', 'context.md'];
	const results: Array<{ file: string; status: 'removed' | 'skipped' | 'error'; message?: string }> = [];

	for (const filename of filesToDelete) {
		try {
			const resolvedPath = await validateSwarmPath(directory, filename);

			if (existsSync(resolvedPath)) {
				unlinkSync(resolvedPath);
				results.push({ file: `.swarm/${filename}`, status: 'removed' });
			} else {
				results.push({ file: `.swarm/${filename}`, status: 'skipped', message: 'File does not exist' });
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			results.push({ file: `.swarm/${filename}`, status: 'error', message });
		}
	}

	// Build markdown report
	const removed = results.filter((r) => r.status === 'removed');
	const skipped = results.filter((r) => r.status === 'skipped');
	const errors = results.filter((r) => r.status === 'error');

	const lines: string[] = ['## 🗑️ Swarm Reset Report', ''];

	if (removed.length > 0) {
		lines.push('### ✅ Removed', '');
		for (const item of removed) {
			lines.push(`- **${item.file}**`);
		}
		lines.push('');
	}

	if (skipped.length > 0) {
		lines.push('### ⏭️ Skipped', '');
		for (const item of skipped) {
			lines.push(`- **${item.file}**: ${item.message}`);
		}
		lines.push('');
	}

	if (errors.length > 0) {
		lines.push('### ❌ Errors', '');
		for (const item of errors) {
			lines.push(`- **${item.file}**: ${item.message}`);
		}
		lines.push('');
	}

	if (removed.length === 0 && errors.length === 0) {
		lines.push('No files were removed. The swarm state appears to be clean.');
	}

	return lines.join('\n');
}
