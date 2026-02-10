import { describe, it, expect } from 'bun:test';
import {
	TaskStatusSchema,
	PhaseStatusSchema,
	PlanTaskSchema,
	PlanPhaseSchema,
	PlanDocumentSchema,
	PlanMetadataSchema,
	validatePlanDocument,
	createEmptyPlan,
	getPlanMetadataDefaults,
	type PlanDocument,
	type PlanPhase,
	type PlanTask,
} from '../../../src/plan/schema';

describe('Plan Schema', () => {
	describe('TaskStatusSchema', () => {
		it('should validate valid task statuses', () => {
			const validStatuses = ['pending', 'in_progress', 'completed', 'blocked', 'cancelled'];
			for (const status of validStatuses) {
				const result = TaskStatusSchema.safeParse(status);
				expect(result.success).toBe(true);
			}
		});

		it('should reject invalid task statuses', () => {
			const invalidStatuses = ['unknown', 'done', 'active', ''];
			for (const status of invalidStatuses) {
				const result = TaskStatusSchema.safeParse(status);
				expect(result.success).toBe(false);
			}
		});
	});

	describe('PhaseStatusSchema', () => {
		it('should validate valid phase statuses', () => {
			const validStatuses = ['pending', 'in_progress', 'completed', 'blocked'];
			for (const status of validStatuses) {
				const result = PhaseStatusSchema.safeParse(status);
				expect(result.success).toBe(true);
			}
		});

		it('should reject invalid phase statuses', () => {
			const invalidStatuses = ['unknown', 'active', 'done', ''];
			for (const status of invalidStatuses) {
				const result = PhaseStatusSchema.safeParse(status);
				expect(result.success).toBe(false);
			}
		});
	});

	describe('PlanTaskSchema', () => {
		it('should validate minimal task', () => {
			const task = { id: 'task-1', title: 'Test Task' };
			const result = PlanTaskSchema.safeParse(task);
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.status).toBe('pending');
				expect(result.data.depends_on).toEqual([]);
				expect(result.data.acceptance_criteria).toEqual([]);
			}
		});

		it('should validate full task', () => {
			const task: PlanTask = {
				id: 'task-1',
				title: 'Test Task',
				description: 'A test task',
				status: 'in_progress',
				assignee: 'developer',
				depends_on: ['task-0'],
				acceptance_criteria: ['should work'],
				metadata: { priority: 'high' },
			};
			const result = PlanTaskSchema.safeParse(task);
			expect(result.success).toBe(true);
		});

		it('should reject task without id', () => {
			const task = { title: 'Test Task' };
			const result = PlanTaskSchema.safeParse(task);
			expect(result.success).toBe(false);
		});

		it('should reject task without title', () => {
			const task = { id: 'task-1' };
			const result = PlanTaskSchema.safeParse(task);
			expect(result.success).toBe(false);
		});

		it('should reject task with empty id', () => {
			const task = { id: '', title: 'Test' };
			const result = PlanTaskSchema.safeParse(task);
			expect(result.success).toBe(false);
		});
	});

	describe('PlanPhaseSchema', () => {
		it('should validate minimal phase', () => {
			const phase = { id: 1, name: 'Phase 1' };
			const result = PlanPhaseSchema.safeParse(phase);
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.status).toBe('pending');
				expect(result.data.tasks).toEqual([]);
			}
		});

		it('should validate phase with string id', () => {
			const phase: PlanPhase = {
				id: 'phase-1',
				name: 'Phase 1',
				status: 'in_progress',
				tasks: [],
			};
			const result = PlanPhaseSchema.safeParse(phase);
			expect(result.success).toBe(true);
		});

		it('should validate phase with tasks', () => {
			const phase: PlanPhase = {
				id: 1,
				name: 'Phase 1',
				status: 'completed',
				tasks: [
					{ id: 'task-1', title: 'Task 1', status: 'completed' },
				],
				started_at: '2026-01-01T00:00:00Z',
				completed_at: '2026-01-02T00:00:00Z',
			};
			const result = PlanPhaseSchema.safeParse(phase);
			expect(result.success).toBe(true);
		});

		it('should reject phase without name', () => {
			const phase = { id: 1 };
			const result = PlanPhaseSchema.safeParse(phase);
			expect(result.success).toBe(false);
		});
	});

	describe('PlanMetadataSchema', () => {
		it('should validate minimal metadata', () => {
			const metadata = {};
			const result = PlanMetadataSchema.safeParse(metadata);
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.version).toBe('1.0.0');
			}
		});

		it('should validate full metadata', () => {
			const metadata = {
				created_at: '2026-01-01T00:00:00Z',
				updated_at: '2026-01-02T00:00:00Z',
				version: '2.0.0',
				author: 'test',
				swarm: 'mega',
				migration_status: 'migrated' as const,
			};
			const result = PlanMetadataSchema.safeParse(metadata);
			expect(result.success).toBe(true);
		});

		it('should reject invalid migration status', () => {
			const metadata = { migration_status: 'unknown' };
			const result = PlanMetadataSchema.safeParse(metadata);
			expect(result.success).toBe(false);
		});
	});

	describe('PlanDocumentSchema', () => {
		it('should validate minimal plan', () => {
			const plan = { title: 'Test Plan' };
			const result = PlanDocumentSchema.safeParse(plan);
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.schema_version).toBe('1.0.0');
				expect(result.data.phases).toEqual([]);
			}
		});

		it('should validate full plan document', () => {
			const plan: PlanDocument = {
				schema_version: '1.0.0',
				title: 'Test Plan',
				swarm: 'mega',
				current_phase: 1,
				phases: [
					{
						id: 1,
						name: 'Phase 1',
						status: 'in_progress',
						tasks: [
							{ id: 'task-1', title: 'Task 1', status: 'completed' },
							{ id: 'task-2', title: 'Task 2', status: 'in_progress' },
						],
					},
				],
				metadata: {
					version: '1.0.0',
					created_at: '2026-01-01T00:00:00Z',
				},
			};
			const result = PlanDocumentSchema.safeParse(plan);
			expect(result.success).toBe(true);
		});

		it('should reject plan without title', () => {
			const plan = { phases: [] };
			const result = PlanDocumentSchema.safeParse(plan);
			expect(result.success).toBe(false);
		});

		it('should reject plan with empty title', () => {
			const plan = { title: '' };
			const result = PlanDocumentSchema.safeParse(plan);
			expect(result.success).toBe(false);
		});
	});

	describe('validatePlanDocument', () => {
		it('should return valid result for valid plan', () => {
			const plan = { title: 'Test Plan' };
			const result = validatePlanDocument(plan);
			expect(result.valid).toBe(true);
			expect(result.errors).toBeNull();
			expect(result.data).toBeDefined();
		});

		it('should return invalid result for invalid plan', () => {
			const plan = { title: '' };
			const result = validatePlanDocument(plan);
			expect(result.valid).toBe(false);
			expect(result.errors).not.toBeNull();
			expect(result.data).toBeUndefined();
		});

		it('should include error details for invalid plan', () => {
			const plan = { title: 123 };
			const result = validatePlanDocument(plan);
			expect(result.valid).toBe(false);
			expect(result.errors?.issues.length).toBeGreaterThan(0);
		});
	});

	describe('createEmptyPlan', () => {
		it('should create plan with default title', () => {
			const plan = createEmptyPlan();
			expect(plan.title).toBe('Untitled Plan');
			expect(plan.schema_version).toBe('1.0.0');
			expect(plan.phases).toEqual([]);
		});

		it('should create plan with custom title', () => {
			const plan = createEmptyPlan('Custom Plan');
			expect(plan.title).toBe('Custom Plan');
		});
	});

	describe('getPlanMetadataDefaults', () => {
		it('should return metadata with defaults', () => {
			const metadata = getPlanMetadataDefaults();
			expect(metadata.version).toBe('1.0.0');
			expect(metadata.created_at).toBeDefined();
			expect(metadata.updated_at).toBeDefined();
		});

		it('should return ISO datetime strings', () => {
			const metadata = getPlanMetadataDefaults();
			expect(() => new Date(metadata.created_at!)).not.toThrow();
			expect(() => new Date(metadata.updated_at!)).not.toThrow();
		});
	});
});
