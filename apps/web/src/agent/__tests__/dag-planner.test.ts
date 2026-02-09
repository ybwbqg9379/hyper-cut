import { describe, expect, it } from "vitest";
import {
	buildDagFromPlanSteps,
	getReadyDagNodes,
	getTopologicalOrder,
} from "../planner/dag";
import type { AgentPlanStep } from "../types";

describe("DAG planner", () => {
	it("should keep write steps serialized and allow sibling reads", () => {
		const steps: AgentPlanStep[] = [
			{
				id: "write-1",
				toolName: "split_at_playhead",
				arguments: {},
				summary: "write",
				operation: "write",
			},
			{
				id: "read-1",
				toolName: "get_timeline_info",
				arguments: {},
				summary: "read",
				operation: "read",
			},
			{
				id: "read-2",
				toolName: "get_current_time",
				arguments: {},
				summary: "read",
				operation: "read",
			},
			{
				id: "write-2",
				toolName: "delete_selected",
				arguments: {},
				summary: "write",
				operation: "write",
			},
		];

		const dag = buildDagFromPlanSteps(steps);

		expect(dag.byId["read-1"].dependsOn).toEqual(["write-1"]);
		expect(dag.byId["read-2"].dependsOn).toEqual(["write-1"]);
		expect(dag.byId["write-2"].dependsOn).toEqual([
			"write-1",
			"read-1",
			"read-2",
		]);
		expect(getTopologicalOrder(dag)).toEqual([
			"write-1",
			"read-1",
			"read-2",
			"write-2",
		]);
	});

	it("should enforce resource lock conflict protection", () => {
		const steps: AgentPlanStep[] = [
			{
				id: "a",
				toolName: "custom-a",
				arguments: {},
				summary: "A",
				operation: "read",
				resourceLocks: ["shared-lock"],
			},
			{
				id: "b",
				toolName: "custom-b",
				arguments: {},
				summary: "B",
				operation: "read",
				resourceLocks: ["shared-lock"],
			},
		];
		const dag = buildDagFromPlanSteps(steps);
		const ready = getReadyDagNodes({
			dag,
			states: {
				a: "pending",
				b: "pending",
			},
			runningLocks: new Set(["shared-lock"]),
		});
		expect(ready).toHaveLength(0);
	});

	it("should throw on cyclic dependencies", () => {
		const steps: AgentPlanStep[] = [
			{
				id: "a",
				toolName: "get_timeline_info",
				arguments: {},
				summary: "A",
				operation: "read",
				dependsOn: ["b"],
			},
			{
				id: "b",
				toolName: "get_current_time",
				arguments: {},
				summary: "B",
				operation: "read",
				dependsOn: ["a"],
			},
		];

		const dag = buildDagFromPlanSteps(steps);
		expect(() => getTopologicalOrder(dag)).toThrow("cyclic");
	});
});
