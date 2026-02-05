/**
 * Agent Tools
 * Export all tool categories and helper to get all tools
 */

import type { AgentTool } from "../types";
import { getTimelineTools } from "./timeline-tools";
import { getPlaybackTools } from "./playback-tools";
import { getQueryTools } from "./query-tools";
import { getMediaTools } from "./media-tools";
import { getSceneTools } from "./scene-tools";
import { getAssetTools } from "./asset-tools";
import { getProjectTools } from "./project-tools";
import { getWorkflowTools } from "./workflow-tools";
import { getVisionTools } from "./vision-tools";
import { getHighlightTools } from "./highlight-tools";

// Re-export individual tool getters
export { getTimelineTools } from "./timeline-tools";
export { getPlaybackTools } from "./playback-tools";
export { getQueryTools } from "./query-tools";
export { getMediaTools } from "./media-tools";
export { getSceneTools } from "./scene-tools";
export { getAssetTools } from "./asset-tools";
export { getProjectTools } from "./project-tools";
export { getWorkflowTools } from "./workflow-tools";
export { getVisionTools } from "./vision-tools";
export { getHighlightTools } from "./highlight-tools";

/**
 * Get all available agent tools
 */
export function getAllTools(): AgentTool[] {
	return [
		...getTimelineTools(),
		...getPlaybackTools(),
		...getQueryTools(),
		...getMediaTools(),
		...getSceneTools(),
		...getAssetTools(),
		...getProjectTools(),
		...getVisionTools(),
		...getHighlightTools(),
		...getWorkflowTools(),
	];
}

/**
 * Tool count summary
 */
export function getToolsSummary(): { category: string; count: number }[] {
	return [
		{ category: "Timeline", count: getTimelineTools().length },
		{ category: "Playback", count: getPlaybackTools().length },
		{ category: "Query", count: getQueryTools().length },
		{ category: "Media", count: getMediaTools().length },
		{ category: "Scene", count: getSceneTools().length },
		{ category: "Asset", count: getAssetTools().length },
		{ category: "Project", count: getProjectTools().length },
		{ category: "Vision", count: getVisionTools().length },
		{ category: "Highlight", count: getHighlightTools().length },
		{ category: "Workflow", count: getWorkflowTools().length },
	];
}
