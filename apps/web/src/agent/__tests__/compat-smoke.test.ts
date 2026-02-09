import { describe, expect, it } from "vitest";
import { getToolBindingCoverage } from "../capabilities/registry";
import { resolveRecoveryPolicyDecision } from "../recovery/policies";
import { getAllTools } from "../tools";
import { resolveWorkflowFromParams } from "../workflows";

describe("agent compatibility smoke", () => {
	it("tool registry should keep high capability coverage", () => {
		const tools = getAllTools();
		const coverage = getToolBindingCoverage({ tools });

		expect(coverage.totalTools).toBeGreaterThan(0);
		expect(coverage.coverageRatio).toBeGreaterThanOrEqual(0.95);
	});

	it("critical workflow should still resolve with schema validation", () => {
		const resolved = resolveWorkflowFromParams({
			workflowName: "long-to-short",
		});

		expect(resolved.ok).toBe(true);
		if (resolved.ok) {
			expect(resolved.resolved.workflow.name).toBe("long-to-short");
			expect(resolved.resolved.steps.length).toBeGreaterThan(0);
		}
	});

	it("recovery chain should still provide transcript bootstrap policy", () => {
		const decision = resolveRecoveryPolicyDecision({
			toolCall: {
				id: "smoke-1",
				name: "remove_filler_words",
				arguments: {},
			},
			errorCode: "NO_TRANSCRIPT",
			retryCount: 0,
		});

		expect(decision).not.toBeNull();
		expect(decision?.policyId).toBe("transcript-bootstrap");
		expect(decision?.prerequisiteCalls[0]?.name).toBe("generate_captions");
	});
});
