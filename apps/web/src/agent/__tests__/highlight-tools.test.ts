import { describe, expect, it } from "vitest";
import { getHighlightTools } from "../tools/highlight-tools";

function findTool(name: string) {
	const tool = getHighlightTools().find((candidate) => candidate.name === name);
	if (!tool) {
		throw new Error(`Tool not found: ${name}`);
	}
	return tool;
}

describe("Highlight tools", () => {
	it("should expose all long-to-short tools", () => {
		const names = getHighlightTools().map((tool) => tool.name);
		expect(names).toEqual([
			"score_highlights",
			"validate_highlights_visual",
			"generate_highlight_plan",
			"apply_highlight_cut",
		]);
	});

	it("validate_highlights_visual should require scored cache", async () => {
		const result = await findTool("validate_highlights_visual").execute({
			topN: 5,
		});
		expect(result.success).toBe(false);
	});

	it("generate_highlight_plan should require scored cache", async () => {
		const result = await findTool("generate_highlight_plan").execute({
			targetDuration: 45,
		});
		expect(result.success).toBe(false);
	});

	it("apply_highlight_cut should require generated plan", async () => {
		const result = await findTool("apply_highlight_cut").execute({
			addCaptions: true,
		});
		expect(result.success).toBe(false);
	});
});
