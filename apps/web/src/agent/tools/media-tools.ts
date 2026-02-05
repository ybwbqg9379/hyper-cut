import type { AgentTool, ToolResult } from '../types';
import { invokeAction } from '@/lib/actions';

/**
 * Media Management Tools
 * Tools for copy/paste, mute/unmute, and visibility operations
 */

/**
 * Copy Selected
 * Copies the currently selected elements to clipboard
 */
export const copySelectedTool: AgentTool = {
  name: 'copy_selected',
  description: '复制当前选中的片段到剪贴板。Copy the selected element(s) to clipboard.',
  parameters: {
    type: 'object',
    properties: {},
    required: [],
  },
  execute: async (): Promise<ToolResult> => {
    try {
      invokeAction('copy-selected');
      return {
        success: true,
        message: '已复制到剪贴板 (Copied to clipboard)',
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
 * Paste Copied
 * Pastes copied elements at the current playhead position
 */
export const pasteCopiedTool: AgentTool = {
  name: 'paste_copied',
  description: '在播放头位置粘贴已复制的片段。Paste copied element(s) at the current playhead position.',
  parameters: {
    type: 'object',
    properties: {},
    required: [],
  },
  execute: async (): Promise<ToolResult> => {
    try {
      invokeAction('paste-copied');
      return {
        success: true,
        message: '已粘贴片段 (Pasted elements)',
      };
    } catch (error) {
      return {
        success: false,
        message: `粘贴失败: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  },
};

/**
 * Toggle Mute Selected
 * Mutes or unmutes the audio of selected elements
 */
export const toggleMuteSelectedTool: AgentTool = {
  name: 'toggle_mute_selected',
  description: '切换选中片段的静音状态。Toggle mute/unmute for selected element(s).',
  parameters: {
    type: 'object',
    properties: {},
    required: [],
  },
  execute: async (): Promise<ToolResult> => {
    try {
      invokeAction('toggle-elements-muted-selected');
      return {
        success: true,
        message: '已切换静音状态 (Toggled mute state)',
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
 * Toggle Visibility Selected
 * Shows or hides the selected elements
 */
export const toggleVisibilitySelectedTool: AgentTool = {
  name: 'toggle_visibility_selected',
  description: '切换选中片段的可见性。Toggle show/hide for selected element(s).',
  parameters: {
    type: 'object',
    properties: {},
    required: [],
  },
  execute: async (): Promise<ToolResult> => {
    try {
      invokeAction('toggle-elements-visibility-selected');
      return {
        success: true,
        message: '已切换可见性 (Toggled visibility)',
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
 * Toggle Snapping
 * Enables or disables timeline snapping
 */
export const toggleSnappingTool: AgentTool = {
  name: 'toggle_snapping',
  description: '切换时间线吸附功能。Toggle timeline snapping on/off.',
  parameters: {
    type: 'object',
    properties: {},
    required: [],
  },
  execute: async (): Promise<ToolResult> => {
    try {
      invokeAction('toggle-snapping');
      return {
        success: true,
        message: '已切换吸附功能 (Toggled snapping)',
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
 * Get all media management tools
 */
export function getMediaTools(): AgentTool[] {
  return [
    copySelectedTool,
    pasteCopiedTool,
    toggleMuteSelectedTool,
    toggleVisibilitySelectedTool,
    toggleSnappingTool,
  ];
}
