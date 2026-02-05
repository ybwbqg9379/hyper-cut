import type { AgentTool, ToolResult } from '../types';
import { invokeAction } from '@/lib/actions';
import { EditorCore } from '@/core';

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
      invokeAction('split');
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
      invokeAction('delete-selected');
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
      invokeAction('split-left');
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
      invokeAction('split-right');
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
      invokeAction('duplicate-selected');
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
      invokeAction('select-all');
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
 * Get all timeline tools
 */
export function getTimelineTools(): AgentTool[] {
  return [
    splitAtPlayheadTool,
    deleteSelectedTool,
    splitLeftTool,
    splitRightTool,
    duplicateSelectedTool,
    selectAllTool,
  ];
}
