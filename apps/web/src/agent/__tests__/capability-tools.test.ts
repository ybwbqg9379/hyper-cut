import { beforeEach, describe, expect, it } from "vitest";
import {
	getCapabilityRegistry,
	resetCapabilityRegistryForTests,
} from "../capabilities";
import { getCapabilityTools } from "../tools/capability-tools";

function getTool(name: string) {
	const tool = getCapabilityTools().find(
		(candidate) => candidate.name === name,
	);
	if (!tool) {
		throw new Error(`Tool not found: ${name}`);
	}
	return tool;
}

describe("Capability tools", () => {
	beforeEach(() => {
		resetCapabilityRegistryForTests();
	});

	it("should expose list_capabilities tool", () => {
		const names = getCapabilityTools().map((tool) => tool.name);
		expect(names).toEqual(["list_capabilities"]);
	});

	it("list_capabilities should return registry data", async () => {
		const result = await getTool("list_capabilities").execute({});
		expect(result.success).toBe(true);

		const data = result.data as {
			total: number;
			summary: {
				all: number;
				action: number;
				manager: number;
				tool: number;
			};
		};
		const registry = getCapabilityRegistry();

		expect(data.total).toBe(registry.capabilities.length);
		expect(data.summary.all).toBe(registry.capabilities.length);
	});

	it("list_capabilities should support source and risk filters", async () => {
		const result = await getTool("list_capabilities").execute({
			source: "action",
			risk: "caution",
		});
		expect(result.success).toBe(true);

		const data = result.data as {
			capabilities: Array<{ source: string; risk: string }>;
		};
		expect(data.capabilities.length).toBeGreaterThan(0);
		expect(
			data.capabilities.every(
				(item) => item.source === "action" && item.risk === "caution",
			),
		).toBe(true);
	});

	it("list_capabilities should reject invalid filters", async () => {
		const invalidSourceResult = await getTool("list_capabilities").execute({
			source: "invalid",
		});
		expect(invalidSourceResult.success).toBe(false);

		const invalidRiskResult = await getTool("list_capabilities").execute({
			risk: "invalid",
		});
		expect(invalidRiskResult.success).toBe(false);
	});
});
