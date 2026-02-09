import { describe, expect, test } from "bun:test";
import { loadPluginConfig, loadPrompt, loadReference, DEFAULT_MODELS } from "../../src/config";
import { createAgents } from "../../src/agents";

	describe("Config Loading", () => {
		test("should load default config when no file exists", () => {
			const config = loadPluginConfig("/tmp/nonexistent");
			expect(config.qa_retry_limit).toBe(3);
			expect(config.file_retry_enabled).toBe(true);
			expect(config.max_file_operation_retries).toBe(3);
		});

	test("should load prompts correctly", () => {
		const prompt = loadPrompt("editor-in-chief");
		expect(prompt).toContain("You are the editor-in-chief");
	});

	test("should load references correctly", () => {
		const ref = loadReference("slop-dictionary");
		expect(ref).toContain("# AI Slop Dictionary");
	});
});

describe("Agent Creation", () => {
	test("should create all 7 agents by default", () => {
		const agents = createAgents();
		expect(agents.length).toBe(7);
		
		const names = agents.map(a => a.name);
		expect(names).toContain("editor_in_chief");
		expect(names).toContain("writer");
		expect(names).toContain("researcher");
		expect(names).toContain("section_editor");
		expect(names).toContain("copy_editor");
		expect(names).toContain("fact_checker");
		expect(names).toContain("reader_advocate");
	});

	test("should respect model overrides", () => {
		const config = {
			agents: {
				writer: {
					model: "custom/model"
				}
			}
		};
		const agents = createAgents(config);
		const writer = agents.find(a => a.name === "writer");
		expect(writer?.config.model).toBe("custom/model");
	});
});
