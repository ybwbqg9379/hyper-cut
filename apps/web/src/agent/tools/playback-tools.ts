import type { AgentTool, ToolResult } from '../types';
import { EditorCore } from '@/core';
import { invokeActionWithCheck } from './action-utils';

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
      invokeActionWithCheck('toggle-play');
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
      invokeActionWithCheck('seek-forward', { seconds });
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
      invokeActionWithCheck('seek-backward', { seconds });
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
 * Jump Forward
 * Jumps forward by specified seconds (default 5 seconds)
 */
export const jumpForwardTool: AgentTool = {
  name: 'jump_forward',
  description: '向前跳转指定秒数（默认5秒）。Jump forward by specified seconds (default 5).',
  parameters: {
    type: 'object',
    properties: {
      seconds: {
        type: 'number',
        description: '跳转秒数 (Number of seconds to jump forward)',
      },
    },
    required: [],
  },
  execute: async (params): Promise<ToolResult> => {
    try {
      const seconds = (params.seconds as number) ?? 5;
      if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) {
        return {
          success: false,
          message: '无效的秒数参数 (Invalid seconds parameter)',
          data: { errorCode: 'INVALID_SECONDS' },
        };
      }
      invokeActionWithCheck('jump-forward', { seconds });
      return {
        success: true,
        message: `已向前跳转 ${seconds} 秒 (Jumped forward ${seconds} second(s))`,
      };
    } catch (error) {
      return {
        success: false,
        message: `跳转失败: ${error instanceof Error ? error.message : 'Unknown error'}`,
        data: { errorCode: 'JUMP_FAILED' },
      };
    }
  },
};

/**
 * Jump Backward
 * Jumps backward by specified seconds (default 5 seconds)
 */
export const jumpBackwardTool: AgentTool = {
  name: 'jump_backward',
  description: '向后跳转指定秒数（默认5秒）。Jump backward by specified seconds (default 5).',
  parameters: {
    type: 'object',
    properties: {
      seconds: {
        type: 'number',
        description: '跳转秒数 (Number of seconds to jump backward)',
      },
    },
    required: [],
  },
  execute: async (params): Promise<ToolResult> => {
    try {
      const seconds = (params.seconds as number) ?? 5;
      if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) {
        return {
          success: false,
          message: '无效的秒数参数 (Invalid seconds parameter)',
          data: { errorCode: 'INVALID_SECONDS' },
        };
      }
      invokeActionWithCheck('jump-backward', { seconds });
      return {
        success: true,
        message: `已向后跳转 ${seconds} 秒 (Jumped backward ${seconds} second(s))`,
      };
    } catch (error) {
      return {
        success: false,
        message: `跳转失败: ${error instanceof Error ? error.message : 'Unknown error'}`,
        data: { errorCode: 'JUMP_FAILED' },
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
      invokeActionWithCheck('goto-start');
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
      invokeActionWithCheck('goto-end');
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
      invokeActionWithCheck('undo');
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
      invokeActionWithCheck('redo');
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
 * Seek to Time
 * Seeks to a specified time (seconds)
 */
export const seekToTimeTool: AgentTool = {
  name: 'seek_to_time',
  description: '精确跳转到指定时间点（秒）。Seek to a specific time (seconds).',
  parameters: {
    type: 'object',
    properties: {
      time: {
        type: 'number',
        description: '跳转时间点（秒）(Time in seconds to seek to)',
      },
    },
    required: ['time'],
  },
  execute: async (params): Promise<ToolResult> => {
    try {
      const time = params.time as number;
      if (typeof time !== 'number' || !Number.isFinite(time)) {
        return {
          success: false,
          message: '无效的时间参数 (Invalid time parameter)',
          data: { errorCode: 'INVALID_TIME' },
        };
      }

      if (time < 0) {
        return {
          success: false,
          message: '时间不能为负数 (Time cannot be negative)',
          data: { errorCode: 'INVALID_TIME' },
        };
      }

      const editor = EditorCore.getInstance();
      const duration = editor.timeline.getTotalDuration();
      const clampedTime = Math.max(0, Math.min(duration, time));

      editor.playback.seek({ time: clampedTime });

      const wasClamped = clampedTime !== time;
      return {
        success: true,
        message: wasClamped
          ? `已跳转到 ${clampedTime.toFixed(2)} 秒（已自动限制到范围内）`
          : `已跳转到 ${clampedTime.toFixed(2)} 秒`,
        data: {
          requestedTime: time,
          actualTime: clampedTime,
          duration,
          clamped: wasClamped,
        },
      };
    } catch (error) {
      return {
        success: false,
        message: `跳转失败: ${error instanceof Error ? error.message : 'Unknown error'}`,
        data: { errorCode: 'SEEK_FAILED' },
      };
    }
  },
};

/**
 * Set Volume
 * Sets playback volume (0-1)
 */
export const setVolumeTool: AgentTool = {
  name: 'set_volume',
  description: '设置播放音量（0-1）。Set playback volume (0-1).',
  parameters: {
    type: 'object',
    properties: {
      volume: {
        type: 'number',
        description: '音量值，范围 0-1 (Volume value between 0 and 1)',
      },
    },
    required: ['volume'],
  },
  execute: async (params): Promise<ToolResult> => {
    try {
      const volume = params.volume as number;
      if (typeof volume !== 'number' || !Number.isFinite(volume)) {
        return {
          success: false,
          message: '无效的音量参数 (Invalid volume parameter)',
          data: { errorCode: 'INVALID_VOLUME' },
        };
      }

      const clampedVolume = Math.max(0, Math.min(1, volume));
      const editor = EditorCore.getInstance();
      editor.playback.setVolume({ volume: clampedVolume });

      const wasClamped = clampedVolume !== volume;
      return {
        success: true,
        message: wasClamped
          ? `已设置音量为 ${clampedVolume.toFixed(2)}（已自动限制到 0-1）`
          : `已设置音量为 ${clampedVolume.toFixed(2)}`,
        data: {
          requestedVolume: volume,
          volume: clampedVolume,
          muted: editor.playback.isMuted(),
          clamped: wasClamped,
        },
      };
    } catch (error) {
      return {
        success: false,
        message: `设置音量失败: ${error instanceof Error ? error.message : 'Unknown error'}`,
        data: { errorCode: 'SET_VOLUME_FAILED' },
      };
    }
  },
};

/**
 * Toggle Playback Mute
 * Toggles playback mute state
 */
export const togglePlaybackMuteTool: AgentTool = {
  name: 'toggle_playback_mute',
  description: '切换播放静音状态。Toggle playback mute on/off.',
  parameters: {
    type: 'object',
    properties: {},
    required: [],
  },
  execute: async (): Promise<ToolResult> => {
    try {
      const editor = EditorCore.getInstance();
      editor.playback.toggleMute();
      const muted = editor.playback.isMuted();
      return {
        success: true,
        message: muted ? '已静音播放 (Playback muted)' : '已取消静音 (Playback unmuted)',
        data: { muted, volume: editor.playback.getVolume() },
      };
    } catch (error) {
      return {
        success: false,
        message: `切换静音失败: ${error instanceof Error ? error.message : 'Unknown error'}`,
        data: { errorCode: 'TOGGLE_MUTE_FAILED' },
      };
    }
  },
};

/**
 * Stop Playback
 * Stops playback
 */
export const stopPlaybackTool: AgentTool = {
  name: 'stop_playback',
  description: '停止播放。Stop playback.',
  parameters: {
    type: 'object',
    properties: {},
    required: [],
  },
  execute: async (): Promise<ToolResult> => {
    try {
      invokeActionWithCheck('stop-playback');
      return {
        success: true,
        message: '已停止播放 (Playback stopped)',
      };
    } catch (error) {
      return {
        success: false,
        message: `停止失败: ${error instanceof Error ? error.message : 'Unknown error'}`,
        data: { errorCode: 'STOP_FAILED' },
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
    jumpForwardTool,
    jumpBackwardTool,
    seekToTimeTool,
    goToStartTool,
    goToEndTool,
    setVolumeTool,
    togglePlaybackMuteTool,
    stopPlaybackTool,
    undoTool,
    redoTool,
  ];
}
