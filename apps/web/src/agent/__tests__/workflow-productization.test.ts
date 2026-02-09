import { describe, expect, it } from "vitest";
import { listWorkflows, resolveWorkflowFromParams } from "../workflows";

describe("workflow productization", () => {
	it("should include scenario workflows", () => {
		const workflows = listWorkflows();
		const names = workflows.map((workflow) => workflow.name);

		expect(names).toContain("podcast-to-clips");
		expect(names).toContain("talking-head-polish");
		expect(names).toContain("course-chaptering");
	});

	it("should expose scenario metadata and template description", () => {
		const workflows = listWorkflows();
		const podcastWorkflow = workflows.find(
			(workflow) => workflow.name === "podcast-to-clips",
		);

		expect(podcastWorkflow?.scenario).toBe("podcast");
		expect(podcastWorkflow?.templateDescription).toBeTruthy();
		expect(podcastWorkflow?.steps[0]?.argumentSchema?.length).toBeGreaterThan(
			0,
		);
	});

	it("should validate step override by schema range", () => {
		const resolved = resolveWorkflowFromParams({
			workflowName: "podcast-to-clips",
			stepOverrides: [
				{
					stepId: "generate-plan",
					arguments: {
						targetDuration: 999,
					},
				},
			],
		});

		expect(resolved.ok).toBe(false);
		if (resolved.ok) {
			throw new Error("Expected invalid override to fail");
		}
		expect(resolved.message).toContain("高于最大值");
	});

	it("should accept valid schema-compliant step override", () => {
		const resolved = resolveWorkflowFromParams({
			workflowName: "podcast-to-clips",
			stepOverrides: [
				{
					stepId: "generate-plan",
					arguments: {
						targetDuration: 75,
						tolerance: 0.3,
					},
				},
			],
		});

		expect(resolved.ok).toBe(true);
		if (!resolved.ok) {
			throw new Error("Expected valid override to pass");
		}
		const generatePlanStep = resolved.resolved.steps.find(
			(step) => step.id === "generate-plan",
		);
		expect(generatePlanStep?.arguments).toMatchObject({
			targetDuration: 75,
			tolerance: 0.3,
		});
	});
});
