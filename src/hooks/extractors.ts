/** Markdown extractors for plan.md and context.md files. Uses AST parsing with LRU caching. */

import { createHash } from 'node:crypto';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { gfm } from 'micromark-extension-gfm';
import { gfmFromMarkdown } from 'mdast-util-gfm';
import { visit } from 'unist-util-visit';
import type {
	Root,
	Heading,
	ListItem,
	Text,
} from 'mdast';
import { swarmState } from '../state';

// Cache configuration constants
const MAX_CACHE_ENTRIES = 500;
const MAX_CACHE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CacheEntry {
	tree: Root;
	timestamp: number;
	sizeBytes: number;
}

// LRU Cache for markdown AST trees
const markdownCache = new Map<string, CacheEntry>();

/**
 * Calculate the approximate serialized size of a tree in bytes.
 */
function calculateTreeSize(tree: Root): number {
	try {
		return JSON.stringify(tree).length * 2; // UTF-16 encoding approximation
	} catch {
		return 0;
	}
}

/**
 * Hash a string using SHA-256.
 */
function hashInput(input: string): string {
	return createHash('sha256').update(input).digest('hex');
}

/**
 * Clean up expired entries based on TTL.
 */
function cleanupExpiredEntries(): void {
	const now = Date.now();
	for (const [key, entry] of markdownCache.entries()) {
		if (now - entry.timestamp > CACHE_TTL_MS) {
			swarmState.cacheStats.cacheSizeBytes -= entry.sizeBytes;
			markdownCache.delete(key);
		}
	}
}

/**
 * Evict entries to maintain size and count limits.
 */
function evictEntriesIfNeeded(): void {
	while (markdownCache.size > MAX_CACHE_ENTRIES) {
		const oldestKey = markdownCache.keys().next().value;
		if (oldestKey) {
			const entry = markdownCache.get(oldestKey);
			if (entry) {
				swarmState.cacheStats.cacheSizeBytes -= entry.sizeBytes;
			}
			markdownCache.delete(oldestKey);
		}
	}

	while (
		swarmState.cacheStats.cacheSizeBytes > MAX_CACHE_SIZE_BYTES &&
		markdownCache.size > 0
	) {
		const oldestKey = markdownCache.keys().next().value;
		if (oldestKey) {
			const entry = markdownCache.get(oldestKey);
			if (entry) {
				swarmState.cacheStats.cacheSizeBytes -= entry.sizeBytes;
			}
			markdownCache.delete(oldestKey);
		}
	}
}

/**
 * Parse markdown content with LRU caching.
 * Cache entries expire after 5 minutes and are evicted based on entry count and size limits.
 */
export function parseMarkdownWithCache(content: string): Root {
	const key = hashInput(content);
	const cached = markdownCache.get(key);

	if (cached && Date.now() - cached.timestamp <= CACHE_TTL_MS) {
		// Cache hit - move to end (most recently used)
		markdownCache.delete(key);
		markdownCache.set(key, { ...cached, timestamp: Date.now() });
		swarmState.cacheStats.cacheHits++;
		return cached.tree;
	}

	// Cache miss - parse and store
	if (cached) {
		// Expired entry - remove from size tracking
		swarmState.cacheStats.cacheSizeBytes -= cached.sizeBytes;
		markdownCache.delete(key);
	}

	const tree = fromMarkdown(content, {
		extensions: [gfm()],
		mdastExtensions: [gfmFromMarkdown()],
	});

	const sizeBytes = calculateTreeSize(tree);
	cleanupExpiredEntries();
	markdownCache.set(key, { tree, timestamp: Date.now(), sizeBytes });
	swarmState.cacheStats.cacheSizeBytes += sizeBytes;
	evictEntriesIfNeeded();

	swarmState.cacheStats.cacheMisses++;

	return tree;
}

/**
 * Reset the markdown cache and cache stats.
 * Useful for testing.
 */
export function resetMarkdownCache(): void {
	markdownCache.clear();
	swarmState.cacheStats.cacheHits = 0;
	swarmState.cacheStats.cacheMisses = 0;
	swarmState.cacheStats.cacheSizeBytes = 0;
}

/**
 * Extracts the current phase information from plan content.
 */
export function extractCurrentPhase(planContent: string): string | null {
	if (!planContent) {
		return null;
	}

	// Parse markdown using cached AST
	const tree = parseMarkdownWithCache(planContent);

	let currentSection: string | null = null;
	let firstUncheckedPhase: string | null = null;

	visit(tree, (node) => {
		if (firstUncheckedPhase) return; // Stop if found

		// Check for headings
		if (node.type === 'heading') {
			const heading = node as Heading;
			const text = heading.children
				.map((child) => (child.type === 'text' ? (child as Text).value : ''))
				.join('');

			const normalizedText = text.toLowerCase();
			if (normalizedText === 'workflow status' || normalizedText === 'status') {
				currentSection = text;
			} else if (currentSection !== null && heading.depth === 2) {
				// Found a new section after the status section
				currentSection = null;
			}
		}

		// Check for list items in the current section
		if (currentSection !== null && node.type === 'listItem') {
			const listItem = node as ListItem;
			const checked = listItem.checked;

			// If checked is explicitly false (unchecked task), extract text
			if (checked === false) {
				// Extract text from paragraph children
				const text = listItem.children
					.map((child) => {
						if (child.type === 'paragraph') {
							return child.children
								.map((c) => (c.type === 'text' ? (c as Text).value : ''))
								.join('');
						}
						return '';
					})
					.join(' ')
					.trim();

				if (text) {
					firstUncheckedPhase = text;
				}
			}
		}
	});

	return firstUncheckedPhase;
}

/**
 * Extracts incomplete tasks (phases) from plan content.
 */
export function extractIncompleteTasks(
	planContent: string,
	maxChars: number = 500,
): string | null {
	if (!planContent) {
		return null;
	}

	// Parse markdown using cached AST
	const tree = parseMarkdownWithCache(planContent);

	const tasksText: string[] = [];
	let inStatusSection = false;

	visit(tree, (node) => {
		// Check for headings
		if (node.type === 'heading') {
			const heading = node as Heading;
			const text = heading.children
				.map((child) => (child.type === 'text' ? (child as Text).value : ''))
				.join('');

			const normalizedText = text.toLowerCase();
			if (normalizedText === 'workflow status' || normalizedText === 'status') {
				inStatusSection = true;
			} else if (inStatusSection && heading.depth === 2) {
				// Found a new section after the status section
				inStatusSection = false;
			}
		}

		// Check for unchecked list items in the status section
		if (inStatusSection && node.type === 'listItem') {
			const listItem = node as ListItem;
			const checked = listItem.checked;

			// If checked is explicitly false (unchecked task), extract text
			if (checked === false) {
				// Extract text from paragraph children
				const text = listItem.children
					.map((child) => {
						if (child.type === 'paragraph') {
							return child.children
								.map((c) => (c.type === 'text' ? (c as Text).value : ''))
								.join('');
						}
						return '';
					})
					.join(' ')
					.trim();

				if (text) {
					tasksText.push(text);
				}
			}
		}
	});

	if (tasksText.length === 0) {
		return null;
	}

	const joined = tasksText.join('\n');
	const trimmed = joined.trim();
	if (trimmed.length <= maxChars) {
		return trimmed;
	}

	return `${trimmed.slice(0, maxChars)}...`;
}

/**
 * Extracts patterns section from context content.
 */
export function extractPatterns(
	contextContent: string,
	maxChars: number = 500,
): string | null {
	if (!contextContent) {
		return null;
	}

	// Parse markdown using cached AST
	const tree = parseMarkdownWithCache(contextContent);

	const patternsText: string[] = [];
	let inPatternsSection = false;

	visit(tree, (node) => {
		// Check for headings
		if (node.type === 'heading') {
			const heading = node as Heading;
			const text = heading.children
				.map((child) => (child.type === 'text' ? (child as Text).value : ''))
				.join('');

			const normalizedText = text.toLowerCase();
			if (normalizedText === 'patterns') {
				inPatternsSection = true;
			} else if (inPatternsSection && heading.depth === 2) {
				// Found a new section after the patterns section
				inPatternsSection = false;
			}
		}

		// Check for list items in the patterns section
		if (inPatternsSection && node.type === 'listItem') {
			const listItem = node as ListItem;

			// Extract text from paragraph children
			const text = listItem.children
				.map((child) => {
					if (child.type === 'paragraph') {
						return child.children
							.map((c) => (c.type === 'text' ? (c as Text).value : ''))
							.join('');
					}
					return '';
				})
				.join(' ')
				.trim();

			if (text) {
				patternsText.push(text);
			}
		}
	});

	if (patternsText.length === 0) {
		return null;
	}

	const joined = patternsText.join('\n');
	const trimmed = joined.trim();
	if (trimmed.length <= maxChars) {
		return trimmed;
	}

	return `${trimmed.slice(0, maxChars)}...`;
}

/**
 * Extracts decisions section from context content.
 */
export function extractDecisions(
	contextContent: string,
	maxChars: number = 500,
): string | null {
	if (!contextContent) {
		return null;
	}

	// Parse markdown using cached AST
	const tree = parseMarkdownWithCache(contextContent);

	const decisionsText: string[] = [];
	let inDecisionsSection = false;

	visit(tree, (node) => {
		// Check for headings
		if (node.type === 'heading') {
			const heading = node as Heading;
			const text = heading.children
				.map((child) => (child.type === 'text' ? (child as Text).value : ''))
				.join('');

			const normalizedText = text.toLowerCase();
			if (normalizedText === 'decisions') {
				inDecisionsSection = true;
			} else if (inDecisionsSection && heading.depth === 2) {
				// Found a new section after the decisions section
				inDecisionsSection = false;
			}
		}

		// Check for list items in the decisions section
		if (inDecisionsSection && node.type === 'listItem') {
			const listItem = node as ListItem;

			// Extract text from paragraph children
			const text = listItem.children
				.map((child) => {
					if (child.type === 'paragraph') {
						return child.children
							.map((c) => (c.type === 'text' ? (c as Text).value : ''))
							.join('');
					}
					return '';
				})
				.join(' ')
				.trim();

			if (text) {
				decisionsText.push(text);
			}
		}
	});

	if (decisionsText.length === 0) {
		return null;
	}

	const joined = decisionsText.join('\n');
	const trimmed = joined.trim();
	if (trimmed.length <= maxChars) {
		return trimmed;
	}

	return `${trimmed.slice(0, maxChars)}...`;
}
