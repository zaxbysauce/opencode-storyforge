export class SwarmError extends Error {
	constructor(
		message: string,
		public guidance: string,
		public code?: string,
	) {
		super(message);
		this.name = 'SwarmError';
	}
}
