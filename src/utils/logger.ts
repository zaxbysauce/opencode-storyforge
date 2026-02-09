function isDebugEnabled(): boolean {
	return process.env.OPENCODE_WRITER_SWARM_DEBUG === '1';
}

export function log(message: string, data?: unknown): void {
	if (!isDebugEnabled()) return;

	const timestamp = new Date().toISOString();
	if (data !== undefined) {
		console.log(`[opencode-writer-swarm ${timestamp}] ${message}`, data);
	} else {
		console.log(`[opencode-writer-swarm ${timestamp}] ${message}`);
	}
}

export function warn(message: string, data?: unknown): void {
	const timestamp = new Date().toISOString();
	if (data !== undefined) {
		console.warn(`[opencode-writer-swarm ${timestamp}] WARN: ${message}`, data);
	} else {
		console.warn(`[opencode-writer-swarm ${timestamp}] WARN: ${message}`);
	}
}

export function error(message: string, data?: unknown): void {
	const timestamp = new Date().toISOString();
	if (data !== undefined) {
		console.error(`[opencode-writer-swarm ${timestamp}] ERROR: ${message}`, data);
	} else {
		console.error(`[opencode-writer-swarm ${timestamp}] ERROR: ${message}`);
	}
}
