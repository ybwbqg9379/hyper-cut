import { beforeEach, describe, expect, it } from "vitest";
import {
	getCapabilityRegistry,
	getToolBindingCoverage,
	listCapabilities,
	resetCapabilityRegistryForTests,
} from "../capabilities";
import { getAllTools } from "../tools";

describe("Capability registry", () => {
	beforeEach(() => {
		resetCapabilityRegistryForTests();
	});

	it("should build capability indexes from actions, managers, and tools", () => {
		const registry = getCapabilityRegistry();

		expect(registry.capabilities.length).toBeGreaterThan(50);
		expect(registry.bySource.action.length).toBeGreaterThan(10);
		expect(registry.bySource.manager.length).toBeGreaterThan(10);
		expect(registry.bySource.tool.length).toBeGreaterThan(5);

		expect(registry.byId["action.split"]).toBeDefined();
		expect(registry.byId["manager.timeline.addTrack"]).toBeDefined();
		expect(registry.byId["tool.highlight.apply_highlight_cut"]).toBeDefined();
	});

	it("should filter capabilities by source and risk", () => {
		const managerCapabilities = listCapabilities({ source: "manager" });
		expect(managerCapabilities.every((item) => item.source === "manager")).toBe(
			true,
		);

		const destructiveCapabilities = listCapabilities({ risk: "destructive" });
		expect(
			destructiveCapabilities.every((item) => item.risk === "destructive"),
		).toBe(true);
		expect(destructiveCapabilities.length).toBeGreaterThan(0);
	});

	it("should provide high capability binding coverage for registered tools", () => {
		const tools = getAllTools();
		const coverage = getToolBindingCoverage({ tools });

		expect(coverage.totalTools).toBeGreaterThan(60);
		expect(coverage.coverageRatio).toBeGreaterThanOrEqual(0.8);
	});

	it("should bind capability ids to mapped tools", () => {
		const tools = getAllTools();
		const splitTool = tools.find((tool) => tool.name === "split_at_playhead");
		const listCapabilityTool = tools.find(
			(tool) => tool.name === "list_capabilities",
		);

		expect(splitTool?.capabilityIds).toContain("action.split");
		expect(splitTool?.capabilityId).toBe("action.split");
		expect(listCapabilityTool?.capabilityIds).toContain(
			"tool.capability.list_capabilities",
		);
	});
});
