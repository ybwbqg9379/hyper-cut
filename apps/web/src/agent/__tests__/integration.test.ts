import { describe } from "vitest";
import { setupIntegrationHarness } from "./integration-harness";
import { registerRegistryTimelineTests } from "./integration-registry-timeline";
import { registerWorkflowPlaybackQueryTests } from "./integration-workflow-playback-query";
import { registerMediaSceneErrorTests } from "./integration-media-scene-error";
import { registerAssetProjectSplitTests } from "./integration-asset-project-split";

describe("Agent Tools Integration", () => {
	setupIntegrationHarness();
	registerRegistryTimelineTests();
	registerWorkflowPlaybackQueryTests();
	registerMediaSceneErrorTests();
	registerAssetProjectSplitTests();
});
