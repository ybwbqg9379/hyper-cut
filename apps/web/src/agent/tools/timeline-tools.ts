import type { AgentTool, ToolResult } from '../types';
import { EditorCore } from '@/core';
import { getElementsAtTime } from '@/lib/timeline/element-utils';
import { canTrackBeHidden, canTracktHaveAudio, getMainTrack } from '@/lib/timeline';
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
 * Select Element(s)
 * Selects elements by ID or track
 */
export const selectElementTool: AgentTool = {
  name: 'select_element',
  description: '通过元素ID或轨道ID设置选中元素。Select elements by element ID(s) or track ID.',
  parameters: {
    type: 'object',
    properties: {
      elementId: {
        type: 'string',
        description: '单个元素ID (Single element ID)',
      },
      elementIds: {
        type: 'array',
        items: { type: 'string' },
        description: '多个元素ID (Multiple element IDs)',
      },
      elements: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            trackId: { type: 'string' },
            elementId: { type: 'string' },
          },
          required: ['elementId'],
        },
        description: '显式元素引用 (Explicit element refs)',
      },
      trackId: {
        type: 'string',
        description: '轨道ID（若不提供元素ID，则选中该轨道全部元素）(Track ID to select all elements)',
      },
      mode: {
        type: 'string',
        enum: ['replace', 'add'],
        description: '选择模式：替换/追加 (Selection mode: replace or add)',
      },
    },
    required: [],
  },
  execute: async (params): Promise<ToolResult> => {
    try {
      const editor = EditorCore.getInstance();
      const tracks = editor.timeline.getTracks();
      const mode = params.mode === 'add' ? 'add' : 'replace';

      const normalizeId = (value: unknown): string =>
        typeof value === 'string' ? value.trim() : '';

      const rawTrackId = normalizeId(params.trackId);
      const rawElementId = normalizeId(params.elementId);
      const rawElementIds = Array.isArray(params.elementIds)
        ? (params.elementIds as unknown[]).map(normalizeId).filter(Boolean)
        : [];
      const rawElements = Array.isArray(params.elements)
        ? (params.elements as Array<Record<string, unknown>>).map((entry) => ({
            trackId: normalizeId(entry.trackId),
            elementId: normalizeId(entry.elementId),
          }))
        : [];

      const resolvedElements: Array<{ trackId: string; elementId: string }> = [];

      const findElementRef = (elementId: string, trackId?: string) => {
        if (trackId) {
          const track = tracks.find((t) => t.id === trackId);
          if (!track) return null;
          const element = track.elements.find((el) => el.id === elementId);
          return element ? { trackId: track.id, elementId: element.id } : null;
        }

        for (const track of tracks) {
          const element = track.elements.find((el) => el.id === elementId);
          if (element) {
            return { trackId: track.id, elementId: element.id };
          }
        }
        return null;
      };

      if (rawElements.length > 0) {
        for (const entry of rawElements) {
          if (!entry.elementId) {
            return {
              success: false,
              message: 'elements 参数缺少 elementId (elements is missing elementId)',
              data: { errorCode: 'INVALID_PARAMS' },
            };
          }
          const ref = findElementRef(entry.elementId, entry.trackId || undefined);
          if (!ref) {
            return {
              success: false,
              message: `未找到元素: ${entry.elementId} (Element not found)`,
              data: { errorCode: 'ELEMENT_NOT_FOUND', elementId: entry.elementId },
            };
          }
          resolvedElements.push(ref);
        }
      } else if (rawElementId || rawElementIds.length > 0) {
        const idsToResolve = rawElementId ? [rawElementId] : rawElementIds;
        for (const elementId of idsToResolve) {
          const ref = findElementRef(elementId, rawTrackId || undefined);
          if (!ref) {
            return {
              success: false,
              message: `未找到元素: ${elementId} (Element not found)`,
              data: { errorCode: 'ELEMENT_NOT_FOUND', elementId },
            };
          }
          resolvedElements.push(ref);
        }
      } else if (rawTrackId) {
        const track = tracks.find((t) => t.id === rawTrackId);
        if (!track) {
          return {
            success: false,
            message: `找不到轨道: ${rawTrackId} (Track not found)`,
            data: { errorCode: 'TRACK_NOT_FOUND', trackId: rawTrackId },
          };
        }
        for (const element of track.elements) {
          resolvedElements.push({ trackId: track.id, elementId: element.id });
        }
      } else {
        return {
          success: false,
          message: '请提供 elementId、elementIds、elements 或 trackId (Missing selection criteria)',
          data: { errorCode: 'INVALID_PARAMS' },
        };
      }

      if (resolvedElements.length === 0) {
        editor.selection.setSelectedElements({ elements: [] });
        return {
          success: true,
          message: '没有可选元素，已清空选择 (No elements to select, selection cleared)',
          data: { selectedCount: 0, elements: [] },
        };
      }

      const nextSelection =
        mode === 'add'
          ? (() => {
              const existing = editor.selection.getSelectedElements();
              const merged = [...existing];
              const seen = new Set(existing.map((e) => `${e.trackId}:${e.elementId}`));
              for (const element of resolvedElements) {
                const key = `${element.trackId}:${element.elementId}`;
                if (!seen.has(key)) {
                  seen.add(key);
                  merged.push(element);
                }
              }
              return merged;
            })()
          : resolvedElements;

      editor.selection.setSelectedElements({ elements: nextSelection });

      return {
        success: true,
        message: `已选中 ${nextSelection.length} 个元素 (Selected ${nextSelection.length} element(s))`,
        data: { selectedCount: nextSelection.length, elements: nextSelection, mode },
      };
    } catch (error) {
      return {
        success: false,
        message: `选择失败: ${error instanceof Error ? error.message : 'Unknown error'}`,
        data: { errorCode: 'SELECT_FAILED' },
      };
    }
  },
};

/**
 * Clear Selection
 * Clears currently selected elements
 */
export const clearSelectionTool: AgentTool = {
  name: 'clear_selection',
  description: '清除当前选择。Clear the current selection.',
  parameters: {
    type: 'object',
    properties: {},
    required: [],
  },
  execute: async (): Promise<ToolResult> => {
    try {
      const editor = EditorCore.getInstance();
      editor.selection.clearSelection();
      return {
        success: true,
        message: '已清除选择 (Selection cleared)',
      };
    } catch (error) {
      return {
        success: false,
        message: `清除选择失败: ${error instanceof Error ? error.message : 'Unknown error'}`,
        data: { errorCode: 'CLEAR_SELECTION_FAILED' },
      };
    }
  },
};

/**
 * Add Track
 * Adds a new track of specified type
 */
export const addTrackTool: AgentTool = {
  name: 'add_track',
  description: '新增轨道（video/audio/text/sticker）。Add a new track by type.',
  parameters: {
    type: 'object',
    properties: {
      type: {
        type: 'string',
        enum: ['video', 'audio', 'text', 'sticker'],
        description: '轨道类型 (Track type)',
      },
      index: {
        type: 'number',
        description: '插入位置索引（可选）(Optional insert index)',
      },
    },
    required: ['type'],
  },
  execute: async (params): Promise<ToolResult> => {
    try {
      const type = params.type as string;
      const allowedTypes = ['video', 'audio', 'text', 'sticker'];
      if (!allowedTypes.includes(type)) {
        return {
          success: false,
          message: `无效轨道类型: ${type} (Invalid track type)`,
          data: { errorCode: 'INVALID_TRACK_TYPE' },
        };
      }

      const index = typeof params.index === 'number' ? params.index : undefined;
      if (typeof index === 'number' && (!Number.isInteger(index) || index < 0)) {
        return {
          success: false,
          message: 'index 必须是非负整数 (index must be a non-negative integer)',
          data: { errorCode: 'INVALID_INDEX' },
        };
      }

      const editor = EditorCore.getInstance();
      const trackId = editor.timeline.addTrack({ type: type as 'video' | 'audio' | 'text' | 'sticker', index });

      return {
        success: true,
        message: `已添加 ${type} 轨道 (Added ${type} track)`,
        data: { trackId, type, index },
      };
    } catch (error) {
      return {
        success: false,
        message: `添加轨道失败: ${error instanceof Error ? error.message : 'Unknown error'}`,
        data: { errorCode: 'ADD_TRACK_FAILED' },
      };
    }
  },
};

/**
 * Remove Track
 * Removes a track by ID
 */
export const removeTrackTool: AgentTool = {
  name: 'remove_track',
  description: '删除指定轨道（不会删除主轨道）。Remove a track by ID (main track is protected).',
  parameters: {
    type: 'object',
    properties: {
      trackId: {
        type: 'string',
        description: '轨道ID (Track ID)',
      },
    },
    required: ['trackId'],
  },
  execute: async (params): Promise<ToolResult> => {
    try {
      const trackId = typeof params.trackId === 'string' ? params.trackId.trim() : '';
      if (!trackId) {
        return {
          success: false,
          message: '缺少 trackId 参数 (Missing trackId)',
          data: { errorCode: 'INVALID_PARAMS' },
        };
      }

      const editor = EditorCore.getInstance();
      const tracks = editor.timeline.getTracks();
      const targetTrack = tracks.find((track) => track.id === trackId);
      if (!targetTrack) {
        return {
          success: false,
          message: `找不到轨道: ${trackId} (Track not found)`,
          data: { errorCode: 'TRACK_NOT_FOUND', trackId },
        };
      }

      const mainTrack = getMainTrack({ tracks });
      if (mainTrack?.id === trackId) {
        return {
          success: false,
          message: '主轨道不可删除 (Main track cannot be removed)',
          data: { errorCode: 'MAIN_TRACK_PROTECTED', trackId },
        };
      }

      editor.timeline.removeTrack({ trackId });

      return {
        success: true,
        message: `已删除轨道 ${trackId} (Track removed)`,
        data: { trackId, type: targetTrack.type },
      };
    } catch (error) {
      return {
        success: false,
        message: `删除轨道失败: ${error instanceof Error ? error.message : 'Unknown error'}`,
        data: { errorCode: 'REMOVE_TRACK_FAILED' },
      };
    }
  },
};

/**
 * Toggle Track Mute
 * Toggles mute state for audio-capable tracks
 */
export const toggleTrackMuteTool: AgentTool = {
  name: 'toggle_track_mute',
  description: '切换轨道静音状态（仅 audio/video 轨道）。Toggle track mute (audio/video only).',
  parameters: {
    type: 'object',
    properties: {
      trackId: {
        type: 'string',
        description: '轨道ID (Track ID)',
      },
    },
    required: ['trackId'],
  },
  execute: async (params): Promise<ToolResult> => {
    try {
      const trackId = typeof params.trackId === 'string' ? params.trackId.trim() : '';
      if (!trackId) {
        return {
          success: false,
          message: '缺少 trackId 参数 (Missing trackId)',
          data: { errorCode: 'INVALID_PARAMS' },
        };
      }

      const editor = EditorCore.getInstance();
      const track = editor.timeline.getTrackById({ trackId });
      if (!track) {
        return {
          success: false,
          message: `找不到轨道: ${trackId} (Track not found)`,
          data: { errorCode: 'TRACK_NOT_FOUND', trackId },
        };
      }

      if (!canTracktHaveAudio(track)) {
        return {
          success: false,
          message: '该轨道不支持静音 (Track does not support mute)',
          data: { errorCode: 'TRACK_NOT_AUDIO_CAPABLE', trackId },
        };
      }

      editor.timeline.toggleTrackMute({ trackId });
      const updated = editor.timeline.getTrackById({ trackId });
      const isMuted = updated && canTracktHaveAudio(updated) ? updated.muted : false;

      return {
        success: true,
        message: isMuted ? '已静音轨道 (Track muted)' : '已取消静音 (Track unmuted)',
        data: { trackId, muted: isMuted },
      };
    } catch (error) {
      return {
        success: false,
        message: `切换静音失败: ${error instanceof Error ? error.message : 'Unknown error'}`,
        data: { errorCode: 'TOGGLE_TRACK_MUTE_FAILED' },
      };
    }
  },
};

/**
 * Toggle Track Visibility
 * Toggles visibility for hideable tracks
 */
export const toggleTrackVisibilityTool: AgentTool = {
  name: 'toggle_track_visibility',
  description: '切换轨道可见性（不支持 audio 轨道）。Toggle track visibility (non-audio tracks).',
  parameters: {
    type: 'object',
    properties: {
      trackId: {
        type: 'string',
        description: '轨道ID (Track ID)',
      },
    },
    required: ['trackId'],
  },
  execute: async (params): Promise<ToolResult> => {
    try {
      const trackId = typeof params.trackId === 'string' ? params.trackId.trim() : '';
      if (!trackId) {
        return {
          success: false,
          message: '缺少 trackId 参数 (Missing trackId)',
          data: { errorCode: 'INVALID_PARAMS' },
        };
      }

      const editor = EditorCore.getInstance();
      const track = editor.timeline.getTrackById({ trackId });
      if (!track) {
        return {
          success: false,
          message: `找不到轨道: ${trackId} (Track not found)`,
          data: { errorCode: 'TRACK_NOT_FOUND', trackId },
        };
      }

      if (!canTrackBeHidden(track)) {
        return {
          success: false,
          message: '该轨道不支持隐藏 (Track cannot be hidden)',
          data: { errorCode: 'TRACK_NOT_HIDEABLE', trackId },
        };
      }

      editor.timeline.toggleTrackVisibility({ trackId });
      const updated = editor.timeline.getTrackById({ trackId });
      const isHidden = updated && canTrackBeHidden(updated) ? updated.hidden : false;

      return {
        success: true,
        message: isHidden ? '已隐藏轨道 (Track hidden)' : '已显示轨道 (Track visible)',
        data: { trackId, hidden: isHidden },
      };
    } catch (error) {
      return {
        success: false,
        message: `切换可见性失败: ${error instanceof Error ? error.message : 'Unknown error'}`,
        data: { errorCode: 'TOGGLE_TRACK_VISIBILITY_FAILED' },
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
    selectElementTool,
    clearSelectionTool,
    addTrackTool,
    removeTrackTool,
    toggleTrackMuteTool,
    toggleTrackVisibilityTool,
  ];
}
