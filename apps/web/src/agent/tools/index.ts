/**
 * Agent Tools
 * Export all tool categories and helper to get all tools
 */

import type { AgentTool } from '../types';
import { getTimelineTools } from './timeline-tools';
import { getPlaybackTools } from './playback-tools';
import { getQueryTools } from './query-tools';
import { getMediaTools } from './media-tools';
import { getSceneTools } from './scene-tools';
import { getAssetTools } from './asset-tools';

// Re-export individual tool getters
export { getTimelineTools } from './timeline-tools';
export { getPlaybackTools } from './playback-tools';
export { getQueryTools } from './query-tools';
export { getMediaTools } from './media-tools';
export { getSceneTools } from './scene-tools';
export { getAssetTools } from './asset-tools';

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
  ];
}

/**
 * Tool count summary
 */
export function getToolsSummary(): { category: string; count: number }[] {
  return [
    { category: 'Timeline', count: getTimelineTools().length },
    { category: 'Playback', count: getPlaybackTools().length },
    { category: 'Query', count: getQueryTools().length },
    { category: 'Media', count: getMediaTools().length },
    { category: 'Scene', count: getSceneTools().length },
    { category: 'Asset', count: getAssetTools().length },
  ];
}

