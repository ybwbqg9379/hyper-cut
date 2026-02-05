import type { AgentTool, ToolResult } from '../types';
import { invokeAction } from '@/lib/actions';

/**
 * Playback Control Tools
 * These tools wrap existing HyperCut actions for playback control
 */

/**
 * Toggle Play/Pause
 * Toggles between play and pause states
 */
export const togglePlayTool: AgentTool = {
  name: 'toggle_play',
  description: '切换播放/暂停状态。Toggle between play and pause.',
  parameters: {
    type: 'object',
    properties: {},
    required: [],
  },
  execute: async (): Promise<ToolResult> => {
    try {
      invokeAction('toggle-play');
      return {
        success: true,
        message: '已切换播放状态 (Toggled play/pause)',
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
 * Seek Forward
 * Seeks forward by specified seconds (default 1 second)
 */
export const seekForwardTool: AgentTool = {
  name: 'seek_forward',
  description: '向前跳转指定秒数（默认1秒）。Seek forward by specified seconds (default 1).',
  parameters: {
    type: 'object',
    properties: {
      seconds: {
        type: 'number',
        description: '跳转秒数 (Number of seconds to seek forward)',
      },
    },
    required: [],
  },
  execute: async (params): Promise<ToolResult> => {
    try {
      const seconds = (params.seconds as number) ?? 1;
      invokeAction('seek-forward', { seconds });
      return {
        success: true,
        message: `已向前跳转 ${seconds} 秒 (Seeked forward ${seconds} second(s))`,
      };
    } catch (error) {
      return {
        success: false,
        message: `跳转失败: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  },
};

/**
 * Seek Backward
 * Seeks backward by specified seconds (default 1 second)
 */
export const seekBackwardTool: AgentTool = {
  name: 'seek_backward',
  description: '向后跳转指定秒数（默认1秒）。Seek backward by specified seconds (default 1).',
  parameters: {
    type: 'object',
    properties: {
      seconds: {
        type: 'number',
        description: '跳转秒数 (Number of seconds to seek backward)',
      },
    },
    required: [],
  },
  execute: async (params): Promise<ToolResult> => {
    try {
      const seconds = (params.seconds as number) ?? 1;
      invokeAction('seek-backward', { seconds });
      return {
        success: true,
        message: `已向后跳转 ${seconds} 秒 (Seeked backward ${seconds} second(s))`,
      };
    } catch (error) {
      return {
        success: false,
        message: `跳转失败: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  },
};

/**
 * Go to Start
 * Jumps to the beginning of the timeline
 */
export const goToStartTool: AgentTool = {
  name: 'go_to_start',
  description: '跳转到时间线开头。Jump to the beginning of the timeline.',
  parameters: {
    type: 'object',
    properties: {},
    required: [],
  },
  execute: async (): Promise<ToolResult> => {
    try {
      invokeAction('goto-start');
      return {
        success: true,
        message: '已跳转到开头 (Jumped to start)',
      };
    } catch (error) {
      return {
        success: false,
        message: `跳转失败: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  },
};

/**
 * Go to End
 * Jumps to the end of the timeline
 */
export const goToEndTool: AgentTool = {
  name: 'go_to_end',
  description: '跳转到时间线结尾。Jump to the end of the timeline.',
  parameters: {
    type: 'object',
    properties: {},
    required: [],
  },
  execute: async (): Promise<ToolResult> => {
    try {
      invokeAction('goto-end');
      return {
        success: true,
        message: '已跳转到结尾 (Jumped to end)',
      };
    } catch (error) {
      return {
        success: false,
        message: `跳转失败: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  },
};

/**
 * Undo
 * Undoes the last action
 */
export const undoTool: AgentTool = {
  name: 'undo',
  description: '撤销上一步操作。Undo the last action.',
  parameters: {
    type: 'object',
    properties: {},
    required: [],
  },
  execute: async (): Promise<ToolResult> => {
    try {
      invokeAction('undo');
      return {
        success: true,
        message: '已撤销 (Undo completed)',
      };
    } catch (error) {
      return {
        success: false,
        message: `撤销失败: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  },
};

/**
 * Redo
 * Redoes the last undone action
 */
export const redoTool: AgentTool = {
  name: 'redo',
  description: '重做上一步撤销的操作。Redo the last undone action.',
  parameters: {
    type: 'object',
    properties: {},
    required: [],
  },
  execute: async (): Promise<ToolResult> => {
    try {
      invokeAction('redo');
      return {
        success: true,
        message: '已重做 (Redo completed)',
      };
    } catch (error) {
      return {
        success: false,
        message: `重做失败: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  },
};

/**
 * Get all playback tools
 */
export function getPlaybackTools(): AgentTool[] {
  return [
    togglePlayTool,
    seekForwardTool,
    seekBackwardTool,
    goToStartTool,
    goToEndTool,
    undoTool,
    redoTool,
  ];
}
