/**
 * Agent Tools
 * Export all tool categories and helper to get all tools
 */

import type { AgentTool } from '../types';
import { getTimelineTools } from './timeline-tools';
import { getPlaybackTools } from './playback-tools';
import { getQueryTools } from './query-tools';

// Re-export individual tool getters
export { getTimelineTools } from './timeline-tools';
export { getPlaybackTools } from './playback-tools';
export { getQueryTools } from './query-tools';

/**
 * Get all available agent tools
 */
export function getAllTools(): AgentTool[] {
  return [
    ...getTimelineTools(),
    ...getPlaybackTools(),
    ...getQueryTools(),
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
  ];
}
