import type { AgentTool, ToolResult } from '../types';
import { EditorCore } from '@/core';

/**
 * Query Tools
 * Read-only tools for getting information about the timeline state
 */

/**
 * Get Timeline Info
 * Returns information about tracks and elements on the timeline
 */
export const getTimelineInfoTool: AgentTool = {
  name: 'get_timeline_info',
  description: '获取时间线信息，包括轨道数量和片段数量。Get timeline information including track count and element count.',
  parameters: {
    type: 'object',
    properties: {},
    required: [],
  },
  execute: async (): Promise<ToolResult> => {
    try {
      const editor = EditorCore.getInstance();
      const tracks = editor.timeline.getTracks();
      
      const totalElements = tracks.reduce(
        (sum, track) => sum + track.elements.length,
        0
      );
      
      const trackInfo = tracks.map((track, index) => ({
        index,
        type: track.type,
        elementCount: track.elements.length,
      }));

      return {
        success: true,
        message: `时间线有 ${tracks.length} 个轨道，共 ${totalElements} 个片段。(Timeline has ${tracks.length} track(s) with ${totalElements} element(s))`,
        data: {
          trackCount: tracks.length,
          totalElements,
          tracks: trackInfo,
        },
      };
    } catch (error) {
      return {
        success: false,
        message: `获取时间线信息失败: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  },
};

/**
 * Get Total Duration
 * Returns the total duration of the timeline
 */
export const getTotalDurationTool: AgentTool = {
  name: 'get_total_duration',
  description: '获取时间线总时长。Get the total duration of the timeline.',
  parameters: {
    type: 'object',
    properties: {},
    required: [],
  },
  execute: async (): Promise<ToolResult> => {
    try {
      const editor = EditorCore.getInstance();
      const duration = editor.timeline.getTotalDuration();
      
      // Format duration as mm:ss.ms
      const minutes = Math.floor(duration / 60);
      const seconds = Math.floor(duration % 60);
      const ms = Math.round((duration % 1) * 100);
      const formatted = `${minutes}:${seconds.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;

      return {
        success: true,
        message: `时间线总时长: ${formatted} (${duration.toFixed(2)} 秒)`,
        data: {
          durationSeconds: duration,
          formatted,
        },
      };
    } catch (error) {
      return {
        success: false,
        message: `获取时长失败: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  },
};

/**
 * Get Current Time
 * Returns the current playhead position
 */
export const getCurrentTimeTool: AgentTool = {
  name: 'get_current_time',
  description: '获取当前播放头位置。Get the current playhead position.',
  parameters: {
    type: 'object',
    properties: {},
    required: [],
  },
  execute: async (): Promise<ToolResult> => {
    try {
      const editor = EditorCore.getInstance();
      const currentTime = editor.playback.getCurrentTime();
      
      // Format time as mm:ss.ms
      const minutes = Math.floor(currentTime / 60);
      const seconds = Math.floor(currentTime % 60);
      const ms = Math.round((currentTime % 1) * 100);
      const formatted = `${minutes}:${seconds.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;

      return {
        success: true,
        message: `当前播放位置: ${formatted} (${currentTime.toFixed(2)} 秒)`,
        data: {
          currentTimeSeconds: currentTime,
          formatted,
        },
      };
    } catch (error) {
      return {
        success: false,
        message: `获取当前时间失败: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  },
};

/**
 * Get Selected Elements
 * Returns information about currently selected elements
 */
export const getSelectedElementsTool: AgentTool = {
  name: 'get_selected_elements',
  description: '获取当前选中的元素信息。Get information about currently selected elements.',
  parameters: {
    type: 'object',
    properties: {},
    required: [],
  },
  execute: async (): Promise<ToolResult> => {
    try {
      const editor = EditorCore.getInstance();
      const selection = editor.selection.getSelectedElements();
      
      if (!selection || selection.length === 0) {
        return {
          success: true,
          message: '当前没有选中任何元素 (No elements currently selected)',
          data: { selectedCount: 0, elements: [] },
        };
      }

      return {
        success: true,
        message: `当前选中了 ${selection.length} 个元素 (${selection.length} element(s) selected)`,
        data: {
          selectedCount: selection.length,
          elements: selection,
        },
      };
    } catch (error) {
      return {
        success: false,
        message: `获取选中元素失败: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  },
};

/**
 * Get all query tools
 */
export function getQueryTools(): AgentTool[] {
  return [
    getTimelineInfoTool,
    getTotalDurationTool,
    getCurrentTimeTool,
    getSelectedElementsTool,
  ];
}

