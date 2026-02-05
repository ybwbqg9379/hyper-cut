import type { AgentTool, ToolResult } from '../types';
import { EditorCore } from '@/core';
import { getElementsAtTime } from '@/lib/timeline/element-utils';
import { invokeActionWithCheck } from './action-utils';

/**
 * Timeline Editing Tools
 * These tools wrap existing HyperCut actions for timeline manipulation
 */

/**
 * Split at Playhead
 * Splits selected elements at the current playhead position
 */
export const splitAtPlayheadTool: AgentTool = {
  name: 'split_at_playhead',
  description: '在当前播放头位置分割选中的视频片段。Split the selected clip(s) at the current playhead position.',
  parameters: {
    type: 'object',
    properties: {},
    required: [],
  },
  execute: async (): Promise<ToolResult> => {
    try {
      invokeActionWithCheck('split');
      return {
        success: true,
        message: '已在播放头位置分割片段 (Split completed at playhead)',
      };
    } catch (error) {
      return {
        success: false,
        message: `分割失败: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  },
};

/**
 * Delete Selected
 * Deletes currently selected elements
 */
export const deleteSelectedTool: AgentTool = {
  name: 'delete_selected',
  description: '删除当前选中的片段。Delete the currently selected element(s).',
  parameters: {
    type: 'object',
    properties: {},
    required: [],
  },
  execute: async (): Promise<ToolResult> => {
    try {
      invokeActionWithCheck('delete-selected');
      return {
        success: true,
        message: '已删除选中的片段 (Deleted selected elements)',
      };
    } catch (error) {
      return {
        success: false,
        message: `删除失败: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  },
};

/**
 * Split and Remove Left
 * Splits at playhead and removes the left portion
 */
export const splitLeftTool: AgentTool = {
  name: 'split_left',
  description: '在播放头位置分割并删除左侧部分。Split at playhead and remove the left portion.',
  parameters: {
    type: 'object',
    properties: {},
    required: [],
  },
  execute: async (): Promise<ToolResult> => {
    try {
      invokeActionWithCheck('split-left');
      return {
        success: true,
        message: '已分割并删除左侧部分 (Split and removed left portion)',
      };
    } catch (error) {
      return {
        success: false,
        message: `操作失败: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  },
};

/**
 * Split and Remove Right
 * Splits at playhead and removes the right portion
 */
export const splitRightTool: AgentTool = {
  name: 'split_right',
  description: '在播放头位置分割并删除右侧部分。Split at playhead and remove the right portion.',
  parameters: {
    type: 'object',
    properties: {},
    required: [],
  },
  execute: async (): Promise<ToolResult> => {
    try {
      invokeActionWithCheck('split-right');
      return {
        success: true,
        message: '已分割并删除右侧部分 (Split and removed right portion)',
      };
    } catch (error) {
      return {
        success: false,
        message: `操作失败: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  },
};

/**
 * Duplicate Selected
 * Duplicates the currently selected elements
 */
export const duplicateSelectedTool: AgentTool = {
  name: 'duplicate_selected',
  description: '复制当前选中的片段。Duplicate the currently selected element(s).',
  parameters: {
    type: 'object',
    properties: {},
    required: [],
  },
  execute: async (): Promise<ToolResult> => {
    try {
      invokeActionWithCheck('duplicate-selected');
      return {
        success: true,
        message: '已复制选中的片段 (Duplicated selected elements)',
      };
    } catch (error) {
      return {
        success: false,
        message: `复制失败: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  },
};

/**
 * Select All
 * Selects all elements on the timeline
 */
export const selectAllTool: AgentTool = {
  name: 'select_all',
  description: '选择时间线上的所有片段。Select all elements on the timeline.',
  parameters: {
    type: 'object',
    properties: {},
    required: [],
  },
  execute: async (): Promise<ToolResult> => {
    try {
      invokeActionWithCheck('select-all');
      return {
        success: true,
        message: '已选择所有片段 (Selected all elements)',
      };
    } catch (error) {
      return {
        success: false,
        message: `选择失败: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  },
};

/**
 * Split at Time
 * Seeks to a specified time and splits selected elements there
 */
export const splitAtTimeTool: AgentTool = {
  name: 'split_at_time',
  description: '在指定时间点分割片段。默认优先分割当前选中片段，如未选中则分割该时间点覆盖的片段；可选 selectAll=true 分割全部片段。Split clips at a specific time (seconds).',
  parameters: {
    type: 'object',
    properties: {
      time: {
        type: 'number',
        description: '分割时间点（秒）(Time in seconds to split at)',
      },
      selectAll: {
        type: 'boolean',
        description: '是否分割所有片段（默认 false）(Whether to split all clips, default false)',
      },
    },
    required: ['time'],
  },
  execute: async (params): Promise<ToolResult> => {
    try {
      const editor = EditorCore.getInstance();
      const time = params.time as number;
      const selectAll = params.selectAll === true;

      if (typeof time !== 'number' || !Number.isFinite(time) || time < 0) {
        return {
          success: false,
          message: '无效的时间参数 (Invalid time parameter)',
        };
      }

      const duration = editor.timeline.getTotalDuration();
      if (time > duration) {
        return {
          success: false,
          message: `时间 ${time}s 超出时间线总时长 ${duration.toFixed(2)}s (Time exceeds timeline duration)`,
        };
      }

      const tracks = editor.timeline.getTracks();

      const elementsToSplit = selectAll
        ? tracks.flatMap((track) =>
            track.elements.map((element) => ({
              trackId: track.id,
              elementId: element.id,
            }))
          )
        : (() => {
            const selectedElements = editor.selection.getSelectedElements();
            if (selectedElements.length > 0) {
              return selectedElements;
            }
            return getElementsAtTime({ tracks, time });
          })();

      if (elementsToSplit.length === 0) {
        return {
          success: true,
          message: '没有可分割的片段 (No clips to split)',
          data: { splitTime: time, splitCount: 0 },
        };
      }

      // Seek to the specified time
      editor.playback.seek({ time });

      // Perform the split
      editor.timeline.splitElements({
        elements: elementsToSplit,
        splitTime: time,
      });

      return {
        success: true,
        message: `已在 ${time.toFixed(2)} 秒处分割 (Split performed at ${time.toFixed(2)}s)`,
        data: { splitTime: time, splitCount: elementsToSplit.length },
      };
    } catch (error) {
      return {
        success: false,
        message: `分割失败: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  },
};

/**
 * Get all timeline tools
 */
export function getTimelineTools(): AgentTool[] {
  return [
    splitAtPlayheadTool,
    splitAtTimeTool,
    deleteSelectedTool,
    splitLeftTool,
    splitRightTool,
    duplicateSelectedTool,
    selectAllTool,
  ];
}
