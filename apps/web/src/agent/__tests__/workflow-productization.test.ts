import { describe, expect, it } from "vitest";
import { listWorkflows, resolveWorkflowFromParams } from "../workflows";

describe("workflow productization", () => {
	it("should include scenario workflows", () => {
		const workflows = listWorkflows();
		const names = workflows.map((workflow) => workflow.name);

		expect(names).toContain("podcast-to-clips");
		expect(names).toContain("talking-head-polish");
		expect(names).toContain("course-chaptering");
		expect(names).toContain("one-click-masterpiece");
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

	it("should allow one-click workflow target overrides", () => {
		const resolved = resolveWorkflowFromParams({
			workflowName: "one-click-masterpiece",
			stepOverrides: [
				{
					stepId: "smart-trim",
					arguments: {
						targetDurationSeconds: 22.5,
					},
				},
				{
					stepId: "generate-plan",
					arguments: {
						targetDuration: 22.5,
					},
				},
				{
					stepId: "quality-report",
					arguments: {
						targetDurationSeconds: 22.5,
					},
				},
			],
		});

		expect(resolved.ok).toBe(true);
		if (!resolved.ok) {
			throw new Error("Expected valid one-click override to pass");
		}
		const smartTrim = resolved.resolved.steps.find(
			(step) => step.id === "smart-trim",
		);
		const generatePlan = resolved.resolved.steps.find(
			(step) => step.id === "generate-plan",
		);
		const quality = resolved.resolved.steps.find(
			(step) => step.id === "quality-report",
		);
		expect(smartTrim?.arguments.targetDurationSeconds).toBe(22.5);
		expect(generatePlan?.arguments.targetDuration).toBe(22.5);
		expect(quality?.arguments.targetDurationSeconds).toBe(22.5);
	});
});
