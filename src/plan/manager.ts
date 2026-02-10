import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { gfm } from 'micromark-extension-gfm';
import { gfmFromMarkdown } from 'mdast-util-gfm';
import { visit } from 'unist-util-visit';
import type { Root, Heading, List, ListItem, Paragraph } from 'mdast';
import {
	type PlanDocument,
	type PlanPhase,
	type PlanTask,
	type TaskStatus,
	type PhaseStatus,
	validatePlanDocument,
	createEmptyPlan,
} from './schema';

/**
 * Error thrown by PlanManager operations
 */
export class PlanManagerError extends Error {
	constructor(
		message: string,
		public code: string,
		public cause?: unknown,
	) {
		super(message);
		this.name = 'PlanManagerError';
	}
}

/**
 * Interface for plan management operations
 */
export interface PlanManager {
	/**
	 * Load and parse a plan from file (plan.md or plan.json)
	 * @param filePath - Path to plan file (optional, uses default discovery)
	 * @returns Parsed plan document
	 * @throws PlanManagerError if loading or parsing fails
	 */
	loadPlan(filePath?: string): Promise<PlanDocument>;

	/**
	 * Get the current active phase
	 * @returns Current phase or null if no active phase
	 */
	getCurrentPhase(): PlanPhase | null;

	/**
	 * Update the status of a specific task
	 * @param taskId - Task identifier
	 * @param status - New status value
	 * @returns true if update succeeded
	 * @throws PlanManagerError if task not found
	 */
	updateTaskStatus(taskId: string, status: TaskStatus): Promise<boolean>;

	/**
	 * Get the resolved path to the plan file
	 * @returns Absolute path to plan file
	 */
	getPlanPath(): string;

	/**
	 * Get the currently loaded plan document
	 * @returns Current plan or null if not loaded
	 */
	getPlan(): PlanDocument | null;
}

/**
 * Options for creating a PlanManager instance
 */
export interface PlanManagerOptions {
	/** Base directory for plan discovery */
	baseDir: string;
	/** Default plan file name (default: 'plan.json') */
	defaultPlanName?: string;
	/** Whether to auto-discover plan.md if plan.json not found */
	autoDiscoverMarkdown?: boolean;
}

/**
 * Default plan manager implementation
 */
class PlanManagerImpl implements PlanManager {
	private plan: PlanDocument | null = null;
	private planPath: string | null = null;
	private readonly options: Required<PlanManagerOptions>;

	constructor(options: PlanManagerOptions) {
		this.options = {
			defaultPlanName: 'plan.json',
			autoDiscoverMarkdown: true,
			...options,
		};
	}

	async loadPlan(filePath?: string): Promise<PlanDocument> {
		const resolvedPath = await this.resolvePlanPath(filePath);
		
		try {
			await fs.access(resolvedPath);
		} catch {
			throw new PlanManagerError(
				`Plan file not found: ${resolvedPath}`,
				'PLAN_FILE_NOT_FOUND',
			);
		}

		try {
			const content = await fs.readFile(resolvedPath, 'utf-8');
			let data: unknown;

			if (resolvedPath.endsWith('.json')) {
				data = JSON.parse(content);
			} else {
				// Parse markdown plan document
				data = this.parseMarkdownPlan(content);
			}

			const validation = validatePlanDocument(data);
			
			if (!validation.valid) {
				throw new PlanManagerError(
					`Invalid plan document: ${validation.errors?.message || 'Unknown validation error'}`,
					'PLAN_VALIDATION_ERROR',
					validation.errors,
				);
			}

			this.plan = validation.data ?? null;
			this.planPath = resolvedPath;

			return this.plan ?? createEmptyPlan();
		} catch (error) {
			if (error instanceof PlanManagerError) {
				throw error;
			}
			
			throw new PlanManagerError(
				`Failed to load plan: ${error instanceof Error ? error.message : String(error)}`,
				'PLAN_LOAD_ERROR',
				error,
			);
		}
	}

	getCurrentPhase(): PlanPhase | null {
		if (!this.plan) {
			return null;
		}

		const { current_phase, phases } = this.plan;

		if (!phases || phases.length === 0) {
			return null;
		}

		// If current_phase is specified, find it by id
		if (current_phase !== undefined) {
			const phase = phases.find(
				(p) => String(p.id) === String(current_phase),
			);
			if (phase) return phase;
		}

		// Otherwise, find first non-completed phase
		return phases.find((p) => p.status !== 'completed') ?? null;
	}

	async updateTaskStatus(taskId: string, status: TaskStatus): Promise<boolean> {
		if (!this.plan) {
			throw new PlanManagerError(
				'No plan loaded. Call loadPlan() first.',
				'PLAN_NOT_LOADED',
			);
		}

		let taskFound = false;

		for (const phase of this.plan.phases) {
			const task = phase.tasks.find((t) => t.id === taskId);
			if (task) {
				task.status = status;
				taskFound = true;
				break;
			}
		}

		if (!taskFound) {
			throw new PlanManagerError(
				`Task not found: ${taskId}`,
				'TASK_NOT_FOUND',
			);
		}

		return true;
	}

	getPlanPath(): string {
		if (!this.planPath) {
			throw new PlanManagerError(
				'No plan loaded. Call loadPlan() first.',
				'PLAN_NOT_LOADED',
			);
		}
		return this.planPath;
	}

	getPlan(): PlanDocument | null {
		return this.plan;
	}

	/**
	 * Resolve the plan file path, with auto-discovery if not specified
	 */
	private async resolvePlanPath(filePath?: string): Promise<string> {
		if (filePath) {
			const resolvedPath = path.resolve(filePath);
			// Validate user-provided path against baseDir to prevent path traversal
			const baseDirResolved = path.resolve(this.options.baseDir);
			if (!resolvedPath.toLowerCase().startsWith(baseDirResolved.toLowerCase())) {
				throw new PlanManagerError(
					`Invalid file path: ${filePath} is outside the base directory`,
					'PATH_TRAVERSAL_DETECTED',
				);
			}
			return resolvedPath;
		}

		// Try plan.json first
		const jsonPath = path.join(
			this.options.baseDir,
			'.swarm',
			this.options.defaultPlanName,
		);
		
		try {
			await fs.access(jsonPath);
			return jsonPath;
		} catch {
			// JSON file not found, continue to markdown fallback
		}

		// Fall back to plan.md if auto-discovery enabled
		if (this.options.autoDiscoverMarkdown) {
			const mdPath = path.join(this.options.baseDir, '.swarm', 'plan.md');
			try {
				await fs.access(mdPath);
				return mdPath;
			} catch {
				// Markdown file not found, continue to default
			}
		}

		// Return default path even if it doesn't exist (error will be thrown later)
		return jsonPath;
	}

	/**
	 * Parse markdown plan content into plan document structure.
	 * Uses mdast parsing with GFM support for robust markdown handling.
	 */
	private parseMarkdownPlan(content: string): PlanDocument {
		// Parse markdown into AST using GFM extensions
		const tree = fromMarkdown(content, {
			extensions: [gfm()],
			mdastExtensions: [gfmFromMarkdown()],
		});

		// Extract basic document metadata
		const title = this.extractTitle(tree);
		const swarm = this.extractSwarmIdentifier(tree);
		const current_phase = this.extractCurrentPhaseFromMeta(tree);

		// Parse phases from the document
		const phases = this.parsePhases(tree);

		return {
			schema_version: '1.0.0',
			title,
			swarm,
			current_phase,
			phases,
		};
	}

	/**
	 * Extract the document title from the first H1 heading.
	 */
	private extractTitle(tree: Root): string {
		let title = 'Untitled Plan';
		let found = false;
		visit(tree, 'heading', (node) => {
			if (found) return;
			if (node.depth === 1) {
				const text = this.extractTextFromNode(node);
				if (text) {
					title = this.ensureNonEmpty(this.sanitizeText(text), 'Untitled Plan');
					found = true;
				}
			}
		});
		return title;
	}

	/**
	 * Extract the swarm identifier from a 'Swarm:' line in a paragraph.
	 * Allows optional leading whitespace/indentation for flexibility.
	 */
	private extractSwarmIdentifier(tree: Root): string | undefined {
		let swarm: string | undefined;
		let found = false;
		visit(tree, 'paragraph', (node) => {
			if (found) return;
			const text = this.extractTextFromNode(node);
			// Allow optional leading whitespace/indentation (e.g., "  Swarm: name" or "Swarm: name")
			const match = text.match(/^\s*Swarm:\s*(.+)$/m);
			if (match) {
				swarm = match[1].trim();
				found = true;
			}
		});
		return swarm;
	}

	/**
	 * Extract current phase from a 'Phase:' line in a paragraph.
	 */
	private extractCurrentPhaseFromMeta(tree: Root): number | undefined {
		let currentPhase: number | undefined;
		let found = false;
		visit(tree, 'paragraph', (node) => {
			if (found) return;
			const text = this.extractTextFromNode(node);
			// Match "Phase: N" or "Phase: N STATUS" patterns
			const match = text.match(/^Phase:\s*(\d+)/m);
			if (match) {
				const parsed = parseInt(match[1], 10);
				// Guard against NaN and negative values
				if (!Number.isNaN(parsed) && parsed >= 0) {
					currentPhase = parsed;
					found = true;
				}
			}
		});
		return currentPhase;
	}

	/**
	 * Parse all phases from the document structure.
	 */
	private parsePhases(tree: Root): PlanPhase[] {
		const phases: PlanPhase[] = [];
		let currentPhase: PlanPhase | null = null;
		let inPhaseSection = false;
		let hasSeenPhase = false; // Track if we've encountered any phase

		// Track the current list being processed for task extraction
		let currentTaskList: ListItem[] | null = null;

		visit(tree, (node) => {
			// Check for phase headings (## Phase N: Name [STATUS])
			if (node.type === 'heading') {
				const heading = node as Heading;
				if (heading.depth === 2) {
					// Save previous phase if exists and has tasks (avoid empty phases)
					if (currentPhase !== null && currentTaskList !== null) {
						const phaseToSave: PlanPhase = currentPhase;
						phaseToSave.tasks = this.parseTasksFromList(currentTaskList);
						// Only add phase if it has tasks or was explicitly defined with content
						if (phaseToSave.tasks.length > 0) {
							phases.push(phaseToSave);
						}
					}

					// Parse new phase heading
					const phaseInfo = this.parsePhaseHeading(heading);
					if (phaseInfo) {
						currentPhase = {
							id: phaseInfo.id,
							name: phaseInfo.name,
							status: phaseInfo.status,
							tasks: [],
						};
						currentTaskList = [];
						inPhaseSection = true;
						hasSeenPhase = true;
					} else {
						inPhaseSection = false;
						currentPhase = null;
						currentTaskList = null;
					}
				} else if (heading.depth < 2) {
					// H1 or higher - end phase section
					inPhaseSection = false;
					if (currentPhase !== null && currentTaskList !== null) {
						const phaseToSave: PlanPhase = currentPhase;
						phaseToSave.tasks = this.parseTasksFromList(currentTaskList);
						// Only add phase if it has tasks
						if (phaseToSave.tasks.length > 0) {
							phases.push(phaseToSave);
						}
						currentPhase = null;
						currentTaskList = null;
					}
				}
			}

			// Collect list items within phase section
			// Orphaned lists (before any phase) are intentionally ignored
			if (inPhaseSection && hasSeenPhase && node.type === 'listItem') {
				if (currentTaskList) {
					currentTaskList.push(node as ListItem);
				}
			}
		});

		// Don't forget to save the last phase (only if it has tasks)
		if (currentPhase !== null && currentTaskList !== null) {
			const phaseToSave: PlanPhase = currentPhase;
			phaseToSave.tasks = this.parseTasksFromList(currentTaskList);
			// Only add phase if it has tasks
			if (phaseToSave.tasks.length > 0) {
				phases.push(phaseToSave);
			}
		}

		return phases;
	}

	/**
	 * Parse a phase heading like "## Phase 1: Discovery & Alignment [COMPLETE]"
	 * Returns null if not a valid phase heading.
	 * Robustly handles extra punctuation by parsing status tag separately from name.
	 */
	private parsePhaseHeading(heading: Heading): { id: number; name: string; status: PhaseStatus } | null {
		const text = this.extractTextFromNode(heading);

		// Match "Phase N: Name [STATUS]" pattern - more robust for extra punctuation
		// Extract the status tag first, then parse the rest
		const statusMatch = text.match(/\[\s*(\w[\w\s]*)\s*\]$/);
		let statusText = 'PENDING';
		let nameText = text;

		if (statusMatch) {
			statusText = statusMatch[1].trim().toUpperCase();
			nameText = text.substring(0, text.length - statusMatch[0].length).trim();
		}

		// Now match the Phase N: Name part
		const match = nameText.match(/^Phase\s+(\d+)[:\s]+(.+)$/i);
		if (!match) {
			return null;
		}

		const id = parseInt(match[1], 10);
		const rawName = match[2].trim();

		// Map status text to PhaseStatus (case-insensitive lookup with underscore normalization)
		const statusMap: Record<string, PhaseStatus> = {
			'COMPLETE': 'completed',
			'COMPLETED': 'completed',
			'IN PROGRESS': 'in_progress',
			'IN_PROGRESS': 'in_progress',
			'PROGRESS': 'in_progress',
			'PENDING': 'pending',
			'BLOCKED': 'blocked',
			'ACTIVE': 'in_progress',
		};
		const status = statusMap[statusText] ?? 'pending';

		// Sanitize phase name with fallback for empty results
		const name = this.ensureNonEmpty(this.sanitizeText(rawName), 'Untitled Phase');

		return { id, name, status };
	}

	/**
	 * Parse tasks from a list of list items.
	 */
	private parseTasksFromList(listItems: ListItem[]): PlanTask[] {
		const tasks: PlanTask[] = [];

		for (const item of listItems) {
			const task = this.parseTask(item);
			if (task) {
				tasks.push(task);
			}
		}

		return tasks;
	}

	/**
	 * Parse a single task from a list item.
	 * Format: "- [ ] 2.2: Title [SIZE] (depends: x,y)" with optional nested "Acceptance: ..." items
	 */
	private parseTask(listItem: ListItem): PlanTask | null {
		const text = this.extractTextFromListItem(listItem);
		if (!text) {
			return null;
		}

		// Check for acceptance criteria in nested items (with null/undefined guards)
		const acceptanceCriteria: string[] = [];
		if (!listItem.children || !Array.isArray(listItem.children)) {
			return null;
		}
		for (const child of listItem.children) {
			if (!child || typeof child !== 'object' || child.type !== 'list') {
				continue;
			}
			const listChild = child as List;
			if (!listChild.children || !Array.isArray(listChild.children)) {
				continue;
			}
			for (const nestedItem of listChild.children) {
				if (!nestedItem || typeof nestedItem !== 'object') {
					continue;
				}
				const nestedText = this.extractTextFromListItem(nestedItem as ListItem);
				// Use non-greedy regex to allow colons inside acceptance criteria text
				// Matches 'Acceptance: text' or 'Acceptance:text' without truncating on internal colons
				const acceptanceMatch = nestedText.match(/^acceptance\s*:\s*(.+?)$/i);
				if (acceptanceMatch) {
					acceptanceCriteria.push(acceptanceMatch[1].trim());
				}
			}
		}

		// Parse task line format: "2.2: Title [SIZE] (depends: x,y)" or "- [ ] 2.2: Title..."
		// Remove leading checkbox indicator if present
		let cleanText = text.replace(/^-?\s*\[.\]\s*/, '');

		// Extract task ID (supports alphanumeric like "2.2", "A.1", "T-123", "feature-x")
		const idMatch = cleanText.match(/^([a-zA-Z0-9][\w\-\.]*):/);
		if (!idMatch) {
			// Not a task line with ID
			return null;
		}
		const id = idMatch[1];
		cleanText = cleanText.substring(idMatch[0].length).trim();

		// Determine status from checkbox or [BLOCKED]/[CANCELLED] tags
		let status: TaskStatus = 'pending';
		if (listItem.checked === true) {
			status = 'completed';
		} else if (listItem.checked === false) {
			status = 'pending';
		}

		// Check for explicit status tags (case-insensitive)
		const upperText = text.toUpperCase();
		if (upperText.includes('[BLOCKED]')) {
			status = 'blocked';
		} else if (upperText.includes('[CANCELLED]') || upperText.includes('[CANCELED]')) {
			status = 'cancelled';
		} else if (upperText.includes('[IN_PROGRESS]') || upperText.includes('[IN PROGRESS]')) {
			status = 'in_progress';
		}

		// Extract dependencies from (depends: x,y) pattern
		const dependsOn: string[] = [];
		const dependsMatch = cleanText.match(/\(depends:\s*([^)]+)\)/i);
		if (dependsMatch) {
			// Use same ID regex as tasks for validation: alphanumeric like "2.2", "A.1", "T-123", "feature-x"
			const validIdRegex = /^[a-zA-Z0-9][\w\-\.]*$/;
			const deps = dependsMatch[1]
				.split(',')
				.map(d => d.trim())
				.filter(d => d.length > 0 && validIdRegex.test(d));
			dependsOn.push(...deps);
			// Remove the depends clause from text
			cleanText = cleanText.replace(dependsMatch[0], '').trim();
		}

		// Extract and normalize size marker to only SMALL|MEDIUM|LARGE
		// Size markers must be surrounded by square brackets [SIZE]
		let size: string | undefined;
		const sizeMatch = cleanText.match(/\[\s*(SMALL|MEDIUM|LARGE|S|M|L|XS|XL|XXL)\s*\]/i);
		if (sizeMatch) {
			const sizeRaw = sizeMatch[1].toUpperCase();
			// Normalize to standard sizes
			const sizeMap: Record<string, string> = {
				'XS': 'SMALL',
				'S': 'SMALL',
				'SMALL': 'SMALL',
				'M': 'MEDIUM',
				'MEDIUM': 'MEDIUM',
				'L': 'LARGE',
				'LARGE': 'LARGE',
				'XL': 'LARGE',
				'XXL': 'LARGE',
			};
			size = sizeMap[sizeRaw] ?? 'MEDIUM';
			cleanText = cleanText.replace(sizeMatch[0], '').trim();
		}

		// Remove status tags from title (case-insensitive)
		cleanText = cleanText.replace(/\[(BLOCKED|CANCELLED|CANCELED|IN_PROGRESS|IN PROGRESS)\]/gi, '').trim();

		// Sanitize title (HTML entity escape for safety) with fallback
		const title = this.ensureNonEmpty(this.sanitizeText(cleanText), 'Untitled Task');

		// Sanitize acceptance criteria
		const sanitizedCriteria = acceptanceCriteria.map(c => this.sanitizeText(c));

		// Build metadata with size if parsed
		const metadata: Record<string, unknown> = {};
		if (size) {
			metadata.size = size;
		}

		// Build task object - acceptance_criteria defaults to [] per schema
		const task: PlanTask = {
			id,
			title,
			status,
			depends_on: dependsOn,
			acceptance_criteria: sanitizedCriteria,
		};

		if (Object.keys(metadata).length > 0) {
			task.metadata = metadata;
		}

		return task;
	}

	/**
	 * Extract text content from any mdast node recursively.
	 * Comprehensive null/undefined guards for safe AST traversal.
	 */
	private extractTextFromNode(node: { type: string; children?: unknown[] }): string {
		if (!node || typeof node !== 'object') {
			return '';
		}
		if (!node.children || !Array.isArray(node.children)) {
			return '';
		}

		const texts: string[] = [];
		for (const child of node.children) {
			if (typeof child === 'object' && child !== null) {
				const childNode = child as { type: string; value?: string; children?: unknown[] };
				if (childNode.type === 'text' && typeof childNode.value === 'string') {
					texts.push(childNode.value);
				} else if (childNode.children && Array.isArray(childNode.children)) {
					texts.push(this.extractTextFromNode(childNode));
				}
			}
		}

		return texts.join('');
	}

	/**
	 * Extract text from a list item, handling paragraph children.
	 * Comprehensive null/undefined guards for safe AST traversal.
	 */
	private extractTextFromListItem(listItem: ListItem): string {
		if (!listItem || typeof listItem !== 'object') {
			return '';
		}
		if (!listItem.children || !Array.isArray(listItem.children)) {
			return '';
		}

		const texts: string[] = [];
		for (const child of listItem.children) {
			if (child && typeof child === 'object' && child.type === 'paragraph') {
				texts.push(this.extractTextFromNode(child));
			}
		}
		return texts.join(' ').trim();
	}

	/**
	 * Sanitize text by escaping HTML entities for safe output.
	 * Converts special characters to their HTML entity equivalents.
	 * Also defensively strips javascript: URLs and inline event handler patterns.
	 * Neutralizes javascript: in markdown link URLs like [text](url).
	 * LIMITATION: This sanitization targets common XSS vectors but is not exhaustive.
	 * For production use with untrusted content, consider using a dedicated sanitization library.
	 */
	private sanitizeText(text: string): string {
		// First pass: escape HTML entities
		let sanitized = text
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#39;');

		// Second pass: neutralize javascript: URLs and event handlers
		// Strip javascript: protocol (case-insensitive, with optional whitespace)
		sanitized = sanitized.replace(/javascript\s*:/gi, 'blocked-script:');
		// Strip common inline event handlers (onload, onclick, onerror, etc.)
		sanitized = sanitized.replace(/\son\w+\s*=/gi, ' data-blocked-event=');
		// Neutralize javascript: in markdown link URLs [text](javascript:...)
		sanitized = sanitized.replace(
			/\[([^\]]*)\]\(\s*javascript\s*:/gi,
			'[$1](blocked-script:'
		);

		return sanitized;
	}

	/**
	 * Ensure text is non-empty after sanitization, with fallback to default.
	 */
	private ensureNonEmpty(text: string, fallback: string): string {
		const trimmed = text.trim();
		return trimmed.length > 0 ? trimmed : fallback;
	}
}

/**
 * Create a new PlanManager instance
 */
export function createPlanManager(options: PlanManagerOptions): PlanManager {
	return new PlanManagerImpl(options);
}

/**
 * Load a plan document from file directly (convenience function)
 */
export async function loadPlanDocument(
	filePath: string,
): Promise<PlanDocument> {
	const manager = createPlanManager({
		baseDir: path.dirname(filePath),
		defaultPlanName: path.basename(filePath),
		autoDiscoverMarkdown: false,
	});

	return manager.loadPlan(filePath);
}
