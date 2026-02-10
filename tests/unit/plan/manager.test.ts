import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
	createPlanManager,
	loadPlanDocument,
	PlanManagerError,
	type PlanManager,
	type PlanManagerOptions,
} from '../../../src/plan/manager';

describe('Plan Manager', () => {
	let tempDir: string;
	let manager: PlanManager;

	beforeEach(async () => {
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-test-'));
		const options: PlanManagerOptions = {
			baseDir: tempDir,
			defaultPlanName: 'plan.json',
			autoDiscoverMarkdown: true,
		};
		manager = createPlanManager(options);
	});

	afterEach(() => {
		// Clean up temp directory
		try {
			fs.rmSync(tempDir, { recursive: true, force: true });
		} catch {
			// Ignore cleanup errors
		}
	});

	describe('loadPlan', () => {
		it('should load valid JSON plan', async () => {
			const planData = {
				schema_version: '1.0.0',
				title: 'Test Plan',
				phases: [
					{
						id: 1,
						name: 'Phase 1',
						tasks: [{ id: 'task-1', title: 'Task 1' }],
					},
				],
			};

			const swarmDir = path.join(tempDir, '.swarm');
			fs.mkdirSync(swarmDir, { recursive: true });
			fs.writeFileSync(
				path.join(swarmDir, 'plan.json'),
				JSON.stringify(planData, null, 2),
			);

			const plan = await manager.loadPlan();
			expect(plan.title).toBe('Test Plan');
			expect(plan.phases).toHaveLength(1);
			expect(plan.phases[0].tasks).toHaveLength(1);
		});

		it('should throw error when plan file not found', async () => {
			await expect(manager.loadPlan()).rejects.toThrow(PlanManagerError);
			await expect(manager.loadPlan()).rejects.toThrow('Plan file not found');
		});

		it('should throw error for invalid JSON', async () => {
			const swarmDir = path.join(tempDir, '.swarm');
			fs.mkdirSync(swarmDir, { recursive: true });
			fs.writeFileSync(path.join(swarmDir, 'plan.json'), 'invalid json');

			await expect(manager.loadPlan()).rejects.toThrow(PlanManagerError);
		});

		it('should throw error for invalid plan structure', async () => {
			const swarmDir = path.join(tempDir, '.swarm');
			fs.mkdirSync(swarmDir, { recursive: true });
			fs.writeFileSync(
				path.join(swarmDir, 'plan.json'),
				JSON.stringify({ invalid: 'data' }),
			);

			await expect(manager.loadPlan()).rejects.toThrow(PlanManagerError);
			await expect(manager.loadPlan()).rejects.toThrow('Invalid plan document');
		});

		it('should load from explicit file path', async () => {
			const planData = { title: 'Explicit Plan', phases: [] };
			const customPath = path.join(tempDir, 'custom-plan.json');
			fs.writeFileSync(customPath, JSON.stringify(planData));

			const plan = await manager.loadPlan(customPath);
			expect(plan.title).toBe('Explicit Plan');
		});
	});

	describe('getCurrentPhase', () => {
		it('should return null when no plan loaded', () => {
			const phase = manager.getCurrentPhase();
			expect(phase).toBeNull();
		});

		it('should return phase matching current_phase', async () => {
			const planData = {
				title: 'Test Plan',
				current_phase: 2,
				phases: [
					{ id: 1, name: 'Phase 1', status: 'completed' },
					{ id: 2, name: 'Phase 2', status: 'in_progress' },
					{ id: 3, name: 'Phase 3', status: 'pending' },
				],
			};

			const swarmDir = path.join(tempDir, '.swarm');
			fs.mkdirSync(swarmDir, { recursive: true });
			fs.writeFileSync(
				path.join(swarmDir, 'plan.json'),
				JSON.stringify(planData),
			);

			await manager.loadPlan();
			const phase = manager.getCurrentPhase();
			expect(phase).not.toBeNull();
			expect(phase?.id).toBe(2);
			expect(phase?.name).toBe('Phase 2');
		});

		it('should return first non-completed phase when no current_phase', async () => {
			const planData = {
				title: 'Test Plan',
				phases: [
					{ id: 1, name: 'Phase 1', status: 'completed' },
					{ id: 2, name: 'Phase 2', status: 'pending' },
					{ id: 3, name: 'Phase 3', status: 'pending' },
				],
			};

			const swarmDir = path.join(tempDir, '.swarm');
			fs.mkdirSync(swarmDir, { recursive: true });
			fs.writeFileSync(
				path.join(swarmDir, 'plan.json'),
				JSON.stringify(planData),
			);

			await manager.loadPlan();
			const phase = manager.getCurrentPhase();
			expect(phase?.id).toBe(2);
		});

		it('should return null when all phases completed', async () => {
			const planData = {
				title: 'Test Plan',
				phases: [
					{ id: 1, name: 'Phase 1', status: 'completed' },
					{ id: 2, name: 'Phase 2', status: 'completed' },
				],
			};

			const swarmDir = path.join(tempDir, '.swarm');
			fs.mkdirSync(swarmDir, { recursive: true });
			fs.writeFileSync(
				path.join(swarmDir, 'plan.json'),
				JSON.stringify(planData),
			);

			await manager.loadPlan();
			const phase = manager.getCurrentPhase();
			expect(phase).toBeNull();
		});
	});

	describe('updateTaskStatus', () => {
		it('should throw error when no plan loaded', async () => {
			await expect(manager.updateTaskStatus('task-1', 'completed')).rejects.toThrow(
				PlanManagerError,
			);
			await expect(manager.updateTaskStatus('task-1', 'completed')).rejects.toThrow(
				'No plan loaded',
			);
		});

		it('should update task status successfully', async () => {
			const planData = {
				title: 'Test Plan',
				phases: [
					{
						id: 1,
						name: 'Phase 1',
						tasks: [{ id: 'task-1', title: 'Task 1', status: 'pending' }],
					},
				],
			};

			const swarmDir = path.join(tempDir, '.swarm');
			fs.mkdirSync(swarmDir, { recursive: true });
			fs.writeFileSync(
				path.join(swarmDir, 'plan.json'),
				JSON.stringify(planData),
			);

			await manager.loadPlan();
			const result = await manager.updateTaskStatus('task-1', 'completed');
			expect(result).toBe(true);
		});

		it('should throw error for non-existent task', async () => {
			const planData = {
				title: 'Test Plan',
				phases: [{ id: 1, name: 'Phase 1', tasks: [] }],
			};

			const swarmDir = path.join(tempDir, '.swarm');
			fs.mkdirSync(swarmDir, { recursive: true });
			fs.writeFileSync(
				path.join(swarmDir, 'plan.json'),
				JSON.stringify(planData),
			);

			await manager.loadPlan();
			await expect(manager.updateTaskStatus('non-existent', 'completed')).rejects.toThrow(
				'Task not found',
			);
		});
	});

	describe('getPlanPath', () => {
		it('should throw error when no plan loaded', () => {
			expect(() => manager.getPlanPath()).toThrow(PlanManagerError);
			expect(() => manager.getPlanPath()).toThrow('No plan loaded');
		});

		it('should return path after loading', async () => {
			const planData = { title: 'Test Plan', phases: [] };
			const swarmDir = path.join(tempDir, '.swarm');
			fs.mkdirSync(swarmDir, { recursive: true });
			fs.writeFileSync(path.join(swarmDir, 'plan.json'), JSON.stringify(planData));

			await manager.loadPlan();
			const planPath = manager.getPlanPath();
			expect(planPath).toContain('plan.json');
			expect(path.isAbsolute(planPath)).toBe(true);
		});
	});

	describe('createPlanManager', () => {
		it('should create manager with default options', () => {
			const m = createPlanManager({ baseDir: tempDir });
			expect(m).toBeDefined();
			expect(m.loadPlan).toBeDefined();
			expect(m.getCurrentPhase).toBeDefined();
			expect(m.updateTaskStatus).toBeDefined();
			expect(m.getPlanPath).toBeDefined();
			expect(m.getPlan).toBeDefined();
		});
	});

	describe('loadPlanDocument', () => {
		it('should load plan from explicit path', async () => {
			const planData = { title: 'Direct Load', phases: [] };
			const filePath = path.join(tempDir, 'direct.json');
			fs.writeFileSync(filePath, JSON.stringify(planData));

			const plan = await loadPlanDocument(filePath);
			expect(plan.title).toBe('Direct Load');
		});

		it('should throw error for non-existent file', async () => {
			const filePath = path.join(tempDir, 'non-existent.json');
			await expect(loadPlanDocument(filePath)).rejects.toThrow(PlanManagerError);
		});
	});
});
