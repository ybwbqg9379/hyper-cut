import { describe, expect, it } from "vitest";
import {
	buildUpstreamGuardReport,
	type UpstreamGuardContext,
	type UpstreamSnapshot,
} from "../compat/upstream-guard";

function createSnapshot(partial?: Partial<UpstreamSnapshot>): UpstreamSnapshot {
	return {
		generatedAt: "2026-02-09T00:00:00.000Z",
		actions: [],
		managerMethods: [],
		commands: [],
		...partial,
	};
}

function createContext(
	partial?: Partial<UpstreamGuardContext>,
): UpstreamGuardContext {
	return {
		managerCapabilityIds: [],
		toolBoundActionCapabilityIds: [],
		toolBoundManagerCapabilityIds: [],
		agentCommandImportPrefixes: [],
		...partial,
	};
}

describe("upstream guard report", () => {
	it("should block when new manager method is not in capability mapping", () => {
		const report = buildUpstreamGuardReport({
			baseline: createSnapshot({
				managerMethods: ["manager.timeline.getTracks"],
			}),
			current: createSnapshot({
				managerMethods: [
					"manager.timeline.getTracks",
					"manager.timeline.replaceTracks",
				],
			}),
			context: createContext({
				managerCapabilityIds: ["manager.timeline.getTracks"],
				toolBoundManagerCapabilityIds: ["manager.timeline.getTracks"],
			}),
		});

		expect(report.coverage.newManagerMethodsWithoutCapability).toEqual([
			"manager.timeline.replaceTracks",
		]);
		expect(report.blockingIssues.length).toBeGreaterThan(0);
	});

	it("should block when upstream removes action that existing tools still reference", () => {
		const report = buildUpstreamGuardReport({
			baseline: createSnapshot({
				actions: ["split", "toggle-play"],
			}),
			current: createSnapshot({
				actions: ["toggle-play"],
			}),
			context: createContext({
				toolBoundActionCapabilityIds: ["action.split", "action.toggle-play"],
			}),
		});

		expect(report.diff.actions.removed).toEqual(["split"]);
		expect(
			report.blockingIssues.some((issue) => issue.includes("action")),
		).toBe(true);
	});

	it("should only warn for newly added commands without explicit agent import", () => {
		const report = buildUpstreamGuardReport({
			baseline: createSnapshot({
				commands: ["timeline/element/split-elements"],
			}),
			current: createSnapshot({
				commands: ["timeline/element/split-elements", "scene/delete-scene"],
			}),
			context: createContext({
				agentCommandImportPrefixes: ["timeline"],
			}),
		});

		expect(report.coverage.newCommandsWithoutAgentCoverage).toEqual([
			"scene/delete-scene",
		]);
		expect(report.blockingIssues).toEqual([]);
		expect(report.warnings.length).toBeGreaterThan(0);
	});

	it("should pass cleanly when no compatibility change exists", () => {
		const baseline = createSnapshot({
			actions: ["split", "toggle-play"],
			managerMethods: ["manager.timeline.getTracks"],
			commands: ["timeline/element/split-elements"],
		});
		const report = buildUpstreamGuardReport({
			baseline,
			current: baseline,
			context: createContext({
				managerCapabilityIds: ["manager.timeline.getTracks"],
				toolBoundActionCapabilityIds: ["action.split", "action.toggle-play"],
				toolBoundManagerCapabilityIds: ["manager.timeline.getTracks"],
				agentCommandImportPrefixes: ["timeline"],
			}),
		});

		expect(report.blockingIssues).toEqual([]);
		expect(report.warnings).toEqual([]);
	});
});
