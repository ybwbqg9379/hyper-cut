import { afterEach, describe, expect, it } from "vitest";
import { resolveProviderPrivacyMode, resolveProviderRoute } from "../router";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
	process.env = { ...ORIGINAL_ENV };
});

describe("provider router", () => {
	it("should resolve local-only route", () => {
		process.env.NEXT_PUBLIC_AGENT_PROVIDER_PRIVACY_MODE = "local-only";

		const route = resolveProviderRoute({ taskType: "planning" });

		expect(route.privacyMode).toBe("local-only");
		expect(route.providerOrder).toEqual(["lm-studio"]);
	});

	it("should resolve hybrid route with fallback", () => {
		process.env.NEXT_PUBLIC_AGENT_PROVIDER_PRIVACY_MODE = "hybrid";

		const route = resolveProviderRoute({ taskType: "vision" });

		expect(route.privacyMode).toBe("hybrid");
		expect(route.providerOrder).toEqual(["lm-studio", "gemini"]);
	});

	it("should resolve cloud-preferred route", () => {
		process.env.NEXT_PUBLIC_AGENT_PROVIDER_PRIVACY_MODE = "cloud-preferred";

		const route = resolveProviderRoute({ taskType: "semantic" });

		expect(route.privacyMode).toBe("cloud-preferred");
		expect(route.providerOrder).toEqual(["gemini", "lm-studio"]);
	});

	it("should keep backward-compatible default from provider config", () => {
		delete process.env.NEXT_PUBLIC_AGENT_PROVIDER_PRIVACY_MODE;
		process.env.NEXT_PUBLIC_LLM_PROVIDER = "gemini";

		expect(resolveProviderPrivacyMode()).toBe("cloud-preferred");
	});
});
