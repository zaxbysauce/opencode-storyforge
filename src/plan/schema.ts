import { z } from 'zod';

/**
 * Task status values representing the lifecycle of a task
 */
export const TaskStatusSchema = z.enum(['pending', 'in_progress', 'completed', 'blocked', 'cancelled']);

export type TaskStatus = z.infer<typeof TaskStatusSchema>;

/**
 * Individual task within a phase
 */
export const PlanTaskSchema = z.object({
	id: z.string().min(1),
	title: z.string().min(1),
	description: z.string().optional(),
	status: TaskStatusSchema.default('pending'),
	assignee: z.string().optional(),
	depends_on: z.array(z.string()).default([]),
	acceptance_criteria: z.array(z.string()).default([]),
	metadata: z.record(z.string(), z.unknown()).optional(),
});

export type PlanTask = z.infer<typeof PlanTaskSchema>;

/**
 * Phase status values
 */
export const PhaseStatusSchema = z.enum(['pending', 'in_progress', 'completed', 'blocked']);

export type PhaseStatus = z.infer<typeof PhaseStatusSchema>;

/**
 * A phase containing multiple tasks
 */
export const PlanPhaseSchema = z.object({
	id: z.union([z.string(), z.number()]),
	name: z.string().min(1),
	status: PhaseStatusSchema.default('pending'),
	tasks: z.array(PlanTaskSchema).default([]),
	started_at: z.string().datetime().optional(),
	completed_at: z.string().datetime().optional(),
});

export type PlanPhase = z.infer<typeof PlanPhaseSchema>;

/**
 * Plan metadata for tracking and versioning
 */
export const PlanMetadataSchema = z.object({
	created_at: z.string().datetime().optional(),
	updated_at: z.string().datetime().optional(),
	version: z.string().default('1.0.0'),
	author: z.string().optional(),
	swarm: z.string().optional(),
	migration_status: z.enum(['pending', 'migrated', 'failed']).optional(),
});

export type PlanMetadata = z.infer<typeof PlanMetadataSchema>;

/**
 * Main plan document schema supporting both JSON and Markdown-derived structures
 */
export const PlanDocumentSchema = z.object({
	schema_version: z.string().default('1.0.0'),
	title: z.string().min(1),
	swarm: z.string().optional(),
	current_phase: z.union([z.string(), z.number()]).optional(),
	phases: z.array(PlanPhaseSchema).default([]),
	metadata: PlanMetadataSchema.optional(),
});

export type PlanDocument = z.infer<typeof PlanDocumentSchema>;

/**
 * Validation result for plan documents
 */
export interface PlanValidationResult {
	valid: boolean;
	errors: z.ZodError | null;
	data?: PlanDocument;
}

/**
 * Validate a plan document against the schema
 */
export function validatePlanDocument(data: unknown): PlanValidationResult {
	const result = PlanDocumentSchema.safeParse(data);

	if (result.success) {
		return {
			valid: true,
			errors: null,
			data: result.data,
		};
	}

	return {
		valid: false,
		errors: result.error,
	};
}

/**
 * Default empty plan document
 */
export function createEmptyPlan(title = 'Untitled Plan'): PlanDocument {
	return {
		schema_version: '1.0.0',
		title,
		phases: [],
	};
}

/**
 * Get default values for plan metadata
 */
export function getPlanMetadataDefaults(): PlanMetadata {
	return {
		version: '1.0.0',
		created_at: new Date().toISOString(),
		updated_at: new Date().toISOString(),
	};
}
