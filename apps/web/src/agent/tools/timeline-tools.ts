import type { AgentTool, ToolResult } from '../types';
import type { TextElement, TimelineElement, TimelineTrack } from '@/types/timeline';
import type { LanguageCode } from '@/types/language';
import type { TranscriptionModelId } from '@/types/transcription';
import { EditorCore } from '@/core';
import {
  getElementsAtTime,
  canElementHaveAudio,
  buildTextElement,
} from '@/lib/timeline/element-utils';
import {
  canTrackBeHidden,
  canTracktHaveAudio,
  getMainTrack,
  validateElementTrackCompatibility,
  calculateTotalDuration,
} from '@/lib/timeline';
import { DEFAULT_TEXT_ELEMENT } from '@/constants/text-constants';
import {
  TRANSCRIPTION_LANGUAGES,
  TRANSCRIPTION_MODELS,
  DEFAULT_TRANSCRIPTION_MODEL,
} from '@/constants/transcription-constants';
import { extractTimelineAudio } from '@/lib/media/mediabunny';
import { decodeAudioToFloat32 } from '@/lib/media/audio';
import { buildCaptionChunks } from '@/lib/transcription/caption';
import { transcriptionService } from '@/services/transcription/service';
import { UpdateElementTransformCommand } from '@/lib/commands/timeline';
import { invokeActionWithCheck } from './action-utils';

/**
 * Timeline Editing Tools
 * These tools wrap existing HyperCut actions for timeline manipulation
 */

const TEXT_ALIGN_VALUES = ['left', 'center', 'right'] as const;
const TEXT_WEIGHT_VALUES = ['normal', 'bold'] as const;
const TEXT_STYLE_VALUES = ['normal', 'italic'] as const;
const TEXT_DECORATION_VALUES = ['none', 'underline', 'line-through'] as const;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function resolveElementById({
  tracks,
  elementId,
  trackId,
}: {
  tracks: TimelineTrack[];
  elementId: string;
  trackId?: string;
}): { track: TimelineTrack; element: TimelineElement } | null {
  if (trackId) {
    const track = tracks.find((t) => t.id === trackId);
    if (!track) return null;
    const element = track.elements.find((el) => el.id === elementId);
    return element ? { track, element } : null;
  }

  for (const track of tracks) {
    const element = track.elements.find((el) => el.id === elementId);
    if (element) {
      return { track, element };
    }
  }

  return null;
}

function detectSilenceIntervals({
  samples,
  sampleRate,
  threshold,
  minDuration,
  windowSeconds = 0.1,
}: {
  samples: Float32Array;
  sampleRate: number;
  threshold: number;
  minDuration: number;
  windowSeconds?: number;
}): Array<{ start: number; end: number }> {
  const intervals: Array<{ start: number; end: number }> = [];
  if (samples.length === 0 || sampleRate <= 0) return intervals;

  const windowSize = Math.max(1, Math.floor(sampleRate * windowSeconds));
  let inSilence = false;
  let silenceStart = 0;

  for (let i = 0; i < samples.length; i += windowSize) {
    const end = Math.min(samples.length, i + windowSize);
    let sum = 0;
    for (let j = i; j < end; j++) {
      const v = samples[j];
      sum += v * v;
    }
    const count = end - i;
    const rms = count > 0 ? Math.sqrt(sum / count) : 0;
    const currentTime = i / sampleRate;

    if (rms < threshold) {
      if (!inSilence) {
        inSilence = true;
        silenceStart = currentTime;
      }
    } else if (inSilence) {
      const silenceEnd = currentTime;
      if (silenceEnd - silenceStart >= minDuration) {
        intervals.push({ start: silenceStart, end: silenceEnd });
      }
      inSilence = false;
    }
  }

  if (inSilence) {
    const silenceEnd = samples.length / sampleRate;
    if (silenceEnd - silenceStart >= minDuration) {
      intervals.push({ start: silenceStart, end: silenceEnd });
    }
  }

  return intervals;
}

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
 * Generate Captions
 * Transcribes audio and inserts caption text elements
 */
export const generateCaptionsTool: AgentTool = {
  name: 'generate_captions',
  description:
    '从选中片段或整条时间线生成字幕（Whisper）。默认使用选中片段音频，自动创建字幕轨道。Generate captions from selected clips or the full timeline.',
  parameters: {
    type: 'object',
    properties: {
      source: {
        type: 'string',
        enum: ['selection', 'timeline'],
        description: '音频来源：selection 或 timeline (Audio source: selection or timeline)',
      },
      language: {
        type: 'string',
        description: '语言代码或 auto (Language code or auto)',
      },
      modelId: {
        type: 'string',
        enum: [
          'whisper-tiny',
          'whisper-small',
          'whisper-medium',
          'whisper-large-v3-turbo',
        ],
        description: 'Whisper 模型 ID (Whisper model ID)',
      },
      wordsPerChunk: {
        type: 'number',
        description: '每个字幕块的单词数 (Words per caption chunk)',
      },
      minDuration: {
        type: 'number',
        description: '字幕最短时长（秒）(Minimum caption duration in seconds)',
      },
      trackId: {
        type: 'string',
        description: '目标字幕轨道 ID（可选）(Optional target text track ID)',
      },
      trackIndex: {
        type: 'number',
        description: '新建字幕轨道插入位置（可选）(Insert index for new track)',
      },
    },
    required: [],
  },
  execute: async (params): Promise<ToolResult> => {
    try {
      const editor = EditorCore.getInstance();
      const allTracks = editor.timeline.getTracks();
      const mediaAssets = editor.media.getAssets();
      const source = params.source === 'timeline' ? 'timeline' : 'selection';

      const modelIdParam = typeof params.modelId === 'string' ? params.modelId.trim() : '';
      const modelId = modelIdParam || DEFAULT_TRANSCRIPTION_MODEL;
      if (modelIdParam && !TRANSCRIPTION_MODELS.some((model) => model.id === modelIdParam)) {
        return {
          success: false,
          message: `无效的模型ID: ${modelIdParam} (Invalid modelId)`,
          data: { errorCode: 'INVALID_MODEL' },
        };
      }

      const rawLanguage = typeof params.language === 'string' ? params.language.trim() : '';
      const languageParam = rawLanguage || 'auto';
      if (
        languageParam !== 'auto' &&
        !TRANSCRIPTION_LANGUAGES.some((lang) => lang.code === languageParam)
      ) {
        return {
          success: false,
          message: `不支持的语言: ${languageParam} (Unsupported language)`,
          data: { errorCode: 'INVALID_LANGUAGE' },
        };
      }

      let tracksToUse = allTracks;
      let selectedRefs: Array<{ trackId: string; elementId: string }> = [];
      if (source === 'selection') {
        selectedRefs = editor.selection.getSelectedElements();
        if (selectedRefs.length === 0) {
          return {
            success: false,
            message: '没有选中任何可转录的元素 (No selected elements)',
            data: { errorCode: 'NO_SELECTION' },
          };
        }

        const selectionMap = new Map<string, Set<string>>();
        for (const ref of selectedRefs) {
          if (!selectionMap.has(ref.trackId)) {
            selectionMap.set(ref.trackId, new Set());
          }
          selectionMap.get(ref.trackId)?.add(ref.elementId);
        }

        tracksToUse = allTracks
          .map((track) => {
            const selectedIds = selectionMap.get(track.id);
            if (!selectedIds) return null;
            const elements = track.elements.filter((el) => selectedIds.has(el.id));
            if (elements.length === 0) return null;
            return { ...track, elements } as TimelineTrack;
          })
          .filter((track): track is TimelineTrack => track !== null);

        if (tracksToUse.length === 0) {
          return {
            success: false,
            message: '未找到选中元素 (Selected elements not found)',
            data: { errorCode: 'SELECTION_NOT_FOUND' },
          };
        }
      }

      const hasAudioSource = tracksToUse.some((track) =>
        track.elements.some((element) => canElementHaveAudio(element)),
      );
      if (!hasAudioSource) {
        return {
          success: false,
          message: '选中内容中没有可用音频 (No audio-capable elements)',
          data: { errorCode: 'NO_AUDIO_SOURCE' },
        };
      }

      const totalDuration = calculateTotalDuration({ tracks: tracksToUse });
      if (totalDuration <= 0) {
        return {
          success: false,
          message: '音频时长为 0，无法转录 (Audio duration is 0)',
          data: { errorCode: 'EMPTY_AUDIO' },
        };
      }

      const audioBlob = await extractTimelineAudio({
        tracks: tracksToUse,
        mediaAssets,
        totalDuration,
      });

      const { samples } = await decodeAudioToFloat32({ audioBlob });

      if (samples.length === 0) {
        return {
          success: false,
          message: '音频数据为空 (Audio data is empty)',
          data: { errorCode: 'EMPTY_AUDIO' },
        };
      }

      const wordsPerChunk = isFiniteNumber(params.wordsPerChunk)
        ? params.wordsPerChunk
        : undefined;
      const minDuration = isFiniteNumber(params.minDuration)
        ? params.minDuration
        : undefined;

      if (wordsPerChunk !== undefined && wordsPerChunk <= 0) {
        return {
          success: false,
          message: 'wordsPerChunk 必须大于 0 (wordsPerChunk must be > 0)',
          data: { errorCode: 'INVALID_CHUNK_SIZE' },
        };
      }
      if (minDuration !== undefined && minDuration <= 0) {
        return {
          success: false,
          message: 'minDuration 必须大于 0 (minDuration must be > 0)',
          data: { errorCode: 'INVALID_MIN_DURATION' },
        };
      }

      const transcription = await transcriptionService.transcribe({
        audioData: samples,
        language: languageParam === 'auto' ? undefined : (languageParam as LanguageCode),
        modelId: modelId as TranscriptionModelId,
      });

      const captionChunks = buildCaptionChunks({
        segments: transcription.segments,
        ...(wordsPerChunk !== undefined ? { wordsPerChunk } : {}),
        ...(minDuration !== undefined ? { minDuration } : {}),
      });

      if (captionChunks.length === 0) {
        return {
          success: true,
          message: '未检测到可生成的字幕 (No captions generated)',
          data: { captionCount: 0, language: transcription.language, modelId },
        };
      }

      const explicitTrackId = isNonEmptyString(params.trackId)
        ? params.trackId.trim()
        : '';

      let captionTrackId = '';
      if (explicitTrackId) {
        const targetTrack = editor.timeline.getTrackById({ trackId: explicitTrackId });
        if (!targetTrack) {
          return {
            success: false,
            message: `找不到轨道: ${explicitTrackId} (Track not found)`,
            data: { errorCode: 'TRACK_NOT_FOUND', trackId: explicitTrackId },
          };
        }
        if (targetTrack.type !== 'text') {
          return {
            success: false,
            message: '目标轨道不是文本轨道 (Target track is not text)',
            data: { errorCode: 'TRACK_NOT_TEXT', trackId: explicitTrackId },
          };
        }
        captionTrackId = explicitTrackId;
      } else {
        const existingTextTrack = allTracks.find((track) => track.type === 'text');
        if (existingTextTrack) {
          captionTrackId = existingTextTrack.id;
        } else {
          const index =
            isFiniteNumber(params.trackIndex) && params.trackIndex >= 0
              ? Math.floor(params.trackIndex)
              : 0;
          captionTrackId = editor.timeline.addTrack({ type: 'text', index });
        }
      }

      const baseCaption: Omit<TextElement, 'id'> = {
        ...DEFAULT_TEXT_ELEMENT,
        fontSize: 65,
        fontWeight: 'bold',
      };

      for (let i = 0; i < captionChunks.length; i++) {
        const caption = captionChunks[i];
        editor.timeline.insertElement({
          placement: { mode: 'explicit', trackId: captionTrackId },
          element: {
            ...baseCaption,
            name: `Caption ${i + 1}`,
            content: caption.text,
            duration: caption.duration,
            startTime: caption.startTime,
          },
        });
      }

      return {
        success: true,
        message: `已生成 ${captionChunks.length} 条字幕 (Generated ${captionChunks.length} captions)`,
        data: {
          captionCount: captionChunks.length,
          trackId: captionTrackId,
          source,
          language: transcription.language,
          modelId,
        },
      };
    } catch (error) {
      return {
        success: false,
        message: `生成字幕失败: ${error instanceof Error ? error.message : 'Unknown error'}`,
        data: { errorCode: 'GENERATE_CAPTIONS_FAILED' },
      };
    }
  },
};

/**
 * Update Text Style
 * Updates properties of a text element
 */
export const updateTextStyleTool: AgentTool = {
  name: 'update_text_style',
  description: '更新文字元素样式（内容/字体/颜色/对齐等）。Update text element style properties.',
  parameters: {
    type: 'object',
    properties: {
      elementId: {
        type: 'string',
        description: '文字元素ID（可选，默认当前选中）(Text element ID, defaults to selected)',
      },
      trackId: {
        type: 'string',
        description: '轨道ID（可选）(Optional track ID)',
      },
      content: {
        type: 'string',
        description: '文字内容 (Text content)',
      },
      fontSize: {
        type: 'number',
        description: '字号 (Font size)',
      },
      fontFamily: {
        type: 'string',
        description: '字体 (Font family)',
      },
      color: {
        type: 'string',
        description: '文字颜色 (Text color)',
      },
      backgroundColor: {
        type: 'string',
        description: '背景颜色 (Background color)',
      },
      textAlign: {
        type: 'string',
        enum: [...TEXT_ALIGN_VALUES],
        description: '对齐方式 (Text align)',
      },
      fontWeight: {
        type: 'string',
        enum: [...TEXT_WEIGHT_VALUES],
        description: '字重 (Font weight)',
      },
      fontStyle: {
        type: 'string',
        enum: [...TEXT_STYLE_VALUES],
        description: '字体样式 (Font style)',
      },
      textDecoration: {
        type: 'string',
        enum: [...TEXT_DECORATION_VALUES],
        description: '文本装饰 (Text decoration)',
      },
    },
    required: [],
  },
  execute: async (params): Promise<ToolResult> => {
    try {
      const editor = EditorCore.getInstance();
      const tracks = editor.timeline.getTracks();
      const elementIdParam = isNonEmptyString(params.elementId) ? params.elementId.trim() : '';
      const trackIdParam = isNonEmptyString(params.trackId) ? params.trackId.trim() : '';

      let resolved = null as null | { track: TimelineTrack; element: TimelineElement };

      if (elementIdParam) {
        resolved = resolveElementById({
          tracks,
          elementId: elementIdParam,
          trackId: trackIdParam || undefined,
        });
      } else {
        const selected = editor.selection.getSelectedElements();
        if (selected.length === 0) {
          return {
            success: false,
            message: '没有选中任何元素 (No element selected)',
            data: { errorCode: 'NO_SELECTION' },
          };
        }
        if (selected.length > 1) {
          return {
            success: false,
            message: '一次只能更新一个文字元素 (Select a single text element)',
            data: { errorCode: 'MULTIPLE_SELECTIONS' },
          };
        }
        const [selection] = selected;
        resolved = resolveElementById({
          tracks,
          elementId: selection.elementId,
          trackId: selection.trackId,
        });
      }

      if (!resolved) {
        return {
          success: false,
          message: '未找到元素 (Element not found)',
          data: { errorCode: 'ELEMENT_NOT_FOUND' },
        };
      }

      if (resolved.element.type !== 'text') {
        return {
          success: false,
          message: '目标元素不是文字元素 (Target is not a text element)',
          data: { errorCode: 'NOT_TEXT_ELEMENT' },
        };
      }

      const updates: Partial<TextElement> = {};

      if (params.content !== undefined) {
        if (!isNonEmptyString(params.content)) {
          return {
            success: false,
            message: 'content 必须是非空字符串 (content must be a non-empty string)',
            data: { errorCode: 'INVALID_CONTENT' },
          };
        }
        updates.content = params.content.trim();
      }

      if (params.fontSize !== undefined) {
        if (!isFiniteNumber(params.fontSize) || params.fontSize <= 0) {
          return {
            success: false,
            message: 'fontSize 必须是正数 (fontSize must be > 0)',
            data: { errorCode: 'INVALID_FONT_SIZE' },
          };
        }
        updates.fontSize = params.fontSize;
      }

      if (params.fontFamily !== undefined) {
        if (!isNonEmptyString(params.fontFamily)) {
          return {
            success: false,
            message: 'fontFamily 必须是非空字符串 (fontFamily must be a non-empty string)',
            data: { errorCode: 'INVALID_FONT_FAMILY' },
          };
        }
        updates.fontFamily = params.fontFamily.trim();
      }

      if (params.color !== undefined) {
        if (!isNonEmptyString(params.color)) {
          return {
            success: false,
            message: 'color 必须是非空字符串 (color must be a non-empty string)',
            data: { errorCode: 'INVALID_COLOR' },
          };
        }
        updates.color = params.color.trim();
      }

      if (params.backgroundColor !== undefined) {
        if (!isNonEmptyString(params.backgroundColor)) {
          return {
            success: false,
            message:
              'backgroundColor 必须是非空字符串 (backgroundColor must be a non-empty string)',
            data: { errorCode: 'INVALID_BACKGROUND_COLOR' },
          };
        }
        updates.backgroundColor = params.backgroundColor.trim();
      }

      if (params.textAlign !== undefined) {
        if (!TEXT_ALIGN_VALUES.includes(params.textAlign as typeof TEXT_ALIGN_VALUES[number])) {
          return {
            success: false,
            message: 'textAlign 无效 (Invalid textAlign)',
            data: { errorCode: 'INVALID_TEXT_ALIGN' },
          };
        }
        updates.textAlign = params.textAlign as TextElement['textAlign'];
      }

      if (params.fontWeight !== undefined) {
        if (!TEXT_WEIGHT_VALUES.includes(params.fontWeight as typeof TEXT_WEIGHT_VALUES[number])) {
          return {
            success: false,
            message: 'fontWeight 无效 (Invalid fontWeight)',
            data: { errorCode: 'INVALID_FONT_WEIGHT' },
          };
        }
        updates.fontWeight = params.fontWeight as TextElement['fontWeight'];
      }

      if (params.fontStyle !== undefined) {
        if (!TEXT_STYLE_VALUES.includes(params.fontStyle as typeof TEXT_STYLE_VALUES[number])) {
          return {
            success: false,
            message: 'fontStyle 无效 (Invalid fontStyle)',
            data: { errorCode: 'INVALID_FONT_STYLE' },
          };
        }
        updates.fontStyle = params.fontStyle as TextElement['fontStyle'];
      }

      if (params.textDecoration !== undefined) {
        if (
          !TEXT_DECORATION_VALUES.includes(
            params.textDecoration as typeof TEXT_DECORATION_VALUES[number],
          )
        ) {
          return {
            success: false,
            message: 'textDecoration 无效 (Invalid textDecoration)',
            data: { errorCode: 'INVALID_TEXT_DECORATION' },
          };
        }
        updates.textDecoration = params.textDecoration as TextElement['textDecoration'];
      }

      const updateKeys = Object.keys(updates);
      if (updateKeys.length === 0) {
        return {
          success: false,
          message: '没有提供可更新的字段 (No updates provided)',
          data: { errorCode: 'NO_UPDATES' },
        };
      }

      editor.timeline.updateTextElement({
        trackId: resolved.track.id,
        elementId: resolved.element.id,
        updates,
      });

      return {
        success: true,
        message: '已更新文字样式 (Text style updated)',
        data: {
          trackId: resolved.track.id,
          elementId: resolved.element.id,
          updatedFields: updateKeys,
        },
      };
    } catch (error) {
      return {
        success: false,
        message: `更新文字失败: ${error instanceof Error ? error.message : 'Unknown error'}`,
        data: { errorCode: 'UPDATE_TEXT_FAILED' },
      };
    }
  },
};

/**
 * Move Element
 * Moves an element to a new time or track
 */
export const moveElementTool: AgentTool = {
  name: 'move_element',
  description: '移动元素到指定时间或轨道。Move an element to a new time or track.',
  parameters: {
    type: 'object',
    properties: {
      elementId: {
        type: 'string',
        description: '元素ID（可选，默认当前选中）(Element ID, defaults to selected)',
      },
      sourceTrackId: {
        type: 'string',
        description: '源轨道ID（可选）(Source track ID)',
      },
      targetTrackId: {
        type: 'string',
        description: '目标轨道ID（可选，默认不变）(Target track ID, defaults to source)',
      },
      newStartTime: {
        type: 'number',
        description: '新的开始时间（秒）(New start time in seconds)',
      },
    },
    required: ['newStartTime'],
  },
  execute: async (params): Promise<ToolResult> => {
    try {
      const editor = EditorCore.getInstance();
      const tracks = editor.timeline.getTracks();
      const newStartTime = params.newStartTime as number;

      if (!isFiniteNumber(newStartTime) || newStartTime < 0) {
        return {
          success: false,
          message: 'newStartTime 必须是非负数字 (newStartTime must be >= 0)',
          data: { errorCode: 'INVALID_START_TIME' },
        };
      }

      const elementIdParam = isNonEmptyString(params.elementId) ? params.elementId.trim() : '';
      const sourceTrackIdParam = isNonEmptyString(params.sourceTrackId)
        ? params.sourceTrackId.trim()
        : '';

      let resolved = null as null | { track: TimelineTrack; element: TimelineElement };

      if (elementIdParam) {
        resolved = resolveElementById({
          tracks,
          elementId: elementIdParam,
          trackId: sourceTrackIdParam || undefined,
        });
      } else {
        const selected = editor.selection.getSelectedElements();
        if (selected.length === 0) {
          return {
            success: false,
            message: '没有选中任何元素 (No element selected)',
            data: { errorCode: 'NO_SELECTION' },
          };
        }
        if (selected.length > 1) {
          return {
            success: false,
            message: '一次只能移动一个元素 (Select a single element)',
            data: { errorCode: 'MULTIPLE_SELECTIONS' },
          };
        }
        const [selection] = selected;
        resolved = resolveElementById({
          tracks,
          elementId: selection.elementId,
          trackId: selection.trackId,
        });
      }

      if (!resolved) {
        return {
          success: false,
          message: '未找到元素 (Element not found)',
          data: { errorCode: 'ELEMENT_NOT_FOUND' },
        };
      }

      const targetTrackId = isNonEmptyString(params.targetTrackId)
        ? params.targetTrackId.trim()
        : resolved.track.id;
      const targetTrack = tracks.find((track) => track.id === targetTrackId);

      if (!targetTrack) {
        return {
          success: false,
          message: `找不到目标轨道: ${targetTrackId} (Target track not found)`,
          data: { errorCode: 'TRACK_NOT_FOUND', trackId: targetTrackId },
        };
      }

      const validation = validateElementTrackCompatibility({
        element: resolved.element,
        track: targetTrack,
      });

      if (!validation.isValid) {
        return {
          success: false,
          message: validation.errorMessage || '元素与轨道不兼容 (Incompatible track)',
          data: { errorCode: 'INCOMPATIBLE_TRACK' },
        };
      }

      editor.timeline.moveElement({
        sourceTrackId: resolved.track.id,
        targetTrackId,
        elementId: resolved.element.id,
        newStartTime,
      });

      return {
        success: true,
        message: '已移动元素 (Element moved)',
        data: {
          elementId: resolved.element.id,
          sourceTrackId: resolved.track.id,
          targetTrackId,
          newStartTime,
        },
      };
    } catch (error) {
      return {
        success: false,
        message: `移动失败: ${error instanceof Error ? error.message : 'Unknown error'}`,
        data: { errorCode: 'MOVE_FAILED' },
      };
    }
  },
};

/**
 * Trim Element
 * Updates trimStart/trimEnd for an element
 */
export const trimElementTool: AgentTool = {
  name: 'trim_element',
  description: '调整元素修剪点（trimStart/trimEnd）。Adjust trimStart/trimEnd for an element.',
  parameters: {
    type: 'object',
    properties: {
      elementId: {
        type: 'string',
        description: '元素ID（可选，默认当前选中）(Element ID, defaults to selected)',
      },
      trackId: {
        type: 'string',
        description: '轨道ID（可选）(Optional track ID)',
      },
      trimStart: {
        type: 'number',
        description: '起始修剪（秒）(Trim start in seconds)',
      },
      trimEnd: {
        type: 'number',
        description: '结束修剪（秒）(Trim end in seconds)',
      },
    },
    required: [],
  },
  execute: async (params): Promise<ToolResult> => {
    try {
      const editor = EditorCore.getInstance();
      const tracks = editor.timeline.getTracks();
      const elementIdParam = isNonEmptyString(params.elementId) ? params.elementId.trim() : '';
      const trackIdParam = isNonEmptyString(params.trackId) ? params.trackId.trim() : '';

      let resolved = null as null | { track: TimelineTrack; element: TimelineElement };

      if (elementIdParam) {
        resolved = resolveElementById({
          tracks,
          elementId: elementIdParam,
          trackId: trackIdParam || undefined,
        });
      } else {
        const selected = editor.selection.getSelectedElements();
        if (selected.length === 0) {
          return {
            success: false,
            message: '没有选中任何元素 (No element selected)',
            data: { errorCode: 'NO_SELECTION' },
          };
        }
        if (selected.length > 1) {
          return {
            success: false,
            message: '一次只能修剪一个元素 (Select a single element)',
            data: { errorCode: 'MULTIPLE_SELECTIONS' },
          };
        }
        const [selection] = selected;
        resolved = resolveElementById({
          tracks,
          elementId: selection.elementId,
          trackId: selection.trackId,
        });
      }

      if (!resolved) {
        return {
          success: false,
          message: '未找到元素 (Element not found)',
          data: { errorCode: 'ELEMENT_NOT_FOUND' },
        };
      }

      const nextTrimStart =
        params.trimStart !== undefined ? params.trimStart : resolved.element.trimStart;
      const nextTrimEnd =
        params.trimEnd !== undefined ? params.trimEnd : resolved.element.trimEnd;

      if (!isFiniteNumber(nextTrimStart) || nextTrimStart < 0) {
        return {
          success: false,
          message: 'trimStart 必须是非负数字 (trimStart must be >= 0)',
          data: { errorCode: 'INVALID_TRIM_START' },
        };
      }

      if (!isFiniteNumber(nextTrimEnd) || nextTrimEnd < 0) {
        return {
          success: false,
          message: 'trimEnd 必须是非负数字 (trimEnd must be >= 0)',
          data: { errorCode: 'INVALID_TRIM_END' },
        };
      }

      editor.timeline.updateElementTrim({
        elementId: resolved.element.id,
        trimStart: nextTrimStart,
        trimEnd: nextTrimEnd,
      });

      return {
        success: true,
        message: '已更新修剪点 (Trim updated)',
        data: {
          elementId: resolved.element.id,
          trackId: resolved.track.id,
          trimStart: nextTrimStart,
          trimEnd: nextTrimEnd,
        },
      };
    } catch (error) {
      return {
        success: false,
        message: `修剪失败: ${error instanceof Error ? error.message : 'Unknown error'}`,
        data: { errorCode: 'TRIM_FAILED' },
      };
    }
  },
};

/**
 * Resize Element
 * Updates element duration
 */
export const resizeElementTool: AgentTool = {
  name: 'resize_element',
  description: '调整元素时长。Resize an element by updating duration.',
  parameters: {
    type: 'object',
    properties: {
      elementId: {
        type: 'string',
        description: '元素ID（可选，默认当前选中）(Element ID, defaults to selected)',
      },
      trackId: {
        type: 'string',
        description: '轨道ID（可选）(Optional track ID)',
      },
      duration: {
        type: 'number',
        description: '新的时长（秒）(New duration in seconds)',
      },
    },
    required: ['duration'],
  },
  execute: async (params): Promise<ToolResult> => {
    try {
      const editor = EditorCore.getInstance();
      const tracks = editor.timeline.getTracks();
      const duration = params.duration as number;

      if (!isFiniteNumber(duration) || duration <= 0) {
        return {
          success: false,
          message: 'duration 必须是正数 (duration must be > 0)',
          data: { errorCode: 'INVALID_DURATION' },
        };
      }

      const elementIdParam = isNonEmptyString(params.elementId) ? params.elementId.trim() : '';
      const trackIdParam = isNonEmptyString(params.trackId) ? params.trackId.trim() : '';

      let resolved = null as null | { track: TimelineTrack; element: TimelineElement };

      if (elementIdParam) {
        resolved = resolveElementById({
          tracks,
          elementId: elementIdParam,
          trackId: trackIdParam || undefined,
        });
      } else {
        const selected = editor.selection.getSelectedElements();
        if (selected.length === 0) {
          return {
            success: false,
            message: '没有选中任何元素 (No element selected)',
            data: { errorCode: 'NO_SELECTION' },
          };
        }
        if (selected.length > 1) {
          return {
            success: false,
            message: '一次只能调整一个元素时长 (Select a single element)',
            data: { errorCode: 'MULTIPLE_SELECTIONS' },
          };
        }
        const [selection] = selected;
        resolved = resolveElementById({
          tracks,
          elementId: selection.elementId,
          trackId: selection.trackId,
        });
      }

      if (!resolved) {
        return {
          success: false,
          message: '未找到元素 (Element not found)',
          data: { errorCode: 'ELEMENT_NOT_FOUND' },
        };
      }

      editor.timeline.updateElementDuration({
        trackId: resolved.track.id,
        elementId: resolved.element.id,
        duration,
      });

      return {
        success: true,
        message: '已更新元素时长 (Duration updated)',
        data: {
          elementId: resolved.element.id,
          trackId: resolved.track.id,
          duration,
        },
      };
    } catch (error) {
      return {
        success: false,
        message: `调整时长失败: ${error instanceof Error ? error.message : 'Unknown error'}`,
        data: { errorCode: 'RESIZE_FAILED' },
      };
    }
  },
};

/**
 * Update Element Transform
 * Updates transform or opacity for an element
 */
export const updateElementTransformTool: AgentTool = {
  name: 'update_element_transform',
  description:
    '更新元素的变换与透明度（scale/position/rotate/opacity）。Update element transform/opacity.',
  parameters: {
    type: 'object',
    properties: {
      elementId: {
        type: 'string',
        description: '元素ID（可选，默认当前选中）(Element ID, defaults to selected)',
      },
      trackId: {
        type: 'string',
        description: '轨道ID（可选）(Optional track ID)',
      },
      transform: {
        type: 'object',
        properties: {
          scale: { type: 'number' },
          position: {
            type: 'object',
            properties: {
              x: { type: 'number' },
              y: { type: 'number' },
            },
          },
          rotate: { type: 'number' },
        },
        description: '变换参数 (Transform)',
      },
      opacity: {
        type: 'number',
        description: '透明度 0-1 (Opacity 0-1)',
      },
    },
    required: [],
  },
  execute: async (params): Promise<ToolResult> => {
    try {
      const editor = EditorCore.getInstance();
      const tracks = editor.timeline.getTracks();
      const elementIdParam = isNonEmptyString(params.elementId) ? params.elementId.trim() : '';
      const trackIdParam = isNonEmptyString(params.trackId) ? params.trackId.trim() : '';

      let resolved = null as null | { track: TimelineTrack; element: TimelineElement };

      if (elementIdParam) {
        resolved = resolveElementById({
          tracks,
          elementId: elementIdParam,
          trackId: trackIdParam || undefined,
        });
      } else {
        const selected = editor.selection.getSelectedElements();
        if (selected.length === 0) {
          return {
            success: false,
            message: '没有选中任何元素 (No element selected)',
            data: { errorCode: 'NO_SELECTION' },
          };
        }
        if (selected.length > 1) {
          return {
            success: false,
            message: '一次只能更新一个元素 (Select a single element)',
            data: { errorCode: 'MULTIPLE_SELECTIONS' },
          };
        }
        const [selection] = selected;
        resolved = resolveElementById({
          tracks,
          elementId: selection.elementId,
          trackId: selection.trackId,
        });
      }

      if (!resolved) {
        return {
          success: false,
          message: '未找到元素 (Element not found)',
          data: { errorCode: 'ELEMENT_NOT_FOUND' },
        };
      }

      if (!('transform' in resolved.element) || !('opacity' in resolved.element)) {
        return {
          success: false,
          message: '该元素不支持变换 (Element does not support transform)',
          data: { errorCode: 'UNSUPPORTED_ELEMENT' },
        };
      }

      const updates: { transform?: TextElement['transform']; opacity?: number } = {};

      if (params.transform !== undefined) {
        if (!params.transform || typeof params.transform !== 'object') {
          return {
            success: false,
            message: 'transform 参数无效 (Invalid transform)',
            data: { errorCode: 'INVALID_TRANSFORM' },
          };
        }

        const current = resolved.element.transform;
        const transform = params.transform as {
          scale?: unknown;
          position?: { x?: unknown; y?: unknown };
          rotate?: unknown;
        };

        const nextTransform = {
          ...current,
          ...(transform.scale !== undefined ? { scale: transform.scale } : {}),
          ...(transform.rotate !== undefined ? { rotate: transform.rotate } : {}),
          position: {
            ...current.position,
            ...(transform.position?.x !== undefined ? { x: transform.position.x } : {}),
            ...(transform.position?.y !== undefined ? { y: transform.position.y } : {}),
          },
        };

        if (
          (transform.scale !== undefined && !isFiniteNumber(nextTransform.scale)) ||
          (transform.rotate !== undefined && !isFiniteNumber(nextTransform.rotate)) ||
          (transform.position?.x !== undefined && !isFiniteNumber(nextTransform.position.x)) ||
          (transform.position?.y !== undefined && !isFiniteNumber(nextTransform.position.y))
        ) {
          return {
            success: false,
            message: 'transform 数值无效 (Invalid transform values)',
            data: { errorCode: 'INVALID_TRANSFORM' },
          };
        }

        updates.transform = {
          scale: nextTransform.scale as number,
          rotate: nextTransform.rotate as number,
          position: {
            x: nextTransform.position.x as number,
            y: nextTransform.position.y as number,
          },
        };
      }

      if (params.opacity !== undefined) {
        if (!isFiniteNumber(params.opacity) || params.opacity < 0 || params.opacity > 1) {
          return {
            success: false,
            message: 'opacity 必须在 0-1 之间 (opacity must be between 0 and 1)',
            data: { errorCode: 'INVALID_OPACITY' },
          };
        }
        updates.opacity = params.opacity;
      }

      if (updates.transform === undefined && updates.opacity === undefined) {
        return {
          success: false,
          message: '没有提供可更新的字段 (No updates provided)',
          data: { errorCode: 'NO_UPDATES' },
        };
      }

      const command = new UpdateElementTransformCommand(
        resolved.track.id,
        resolved.element.id,
        updates,
      );
      editor.command.execute({ command });

      return {
        success: true,
        message: '已更新元素变换 (Transform updated)',
        data: {
          trackId: resolved.track.id,
          elementId: resolved.element.id,
          updatedTransform: updates.transform,
          opacity: updates.opacity,
        },
      };
    } catch (error) {
      return {
        success: false,
        message: `更新变换失败: ${error instanceof Error ? error.message : 'Unknown error'}`,
        data: { errorCode: 'UPDATE_TRANSFORM_FAILED' },
      };
    }
  },
};

/**
 * Remove Silence
 * Detects silence intervals and removes corresponding segments
 */
export const removeSilenceTool: AgentTool = {
  name: 'remove_silence',
  description:
    '检测并删除静音区间（按阈值与最短时长）。Detect silence and delete silent segments.',
  parameters: {
    type: 'object',
    properties: {
      source: {
        type: 'string',
        enum: ['timeline', 'selection'],
        description: '检测来源：timeline 或 selection (Source for detection)',
      },
      threshold: {
        type: 'number',
        description: '静音阈值 (Silence threshold, 0-1)',
      },
      minDuration: {
        type: 'number',
        description: '最短静音时长（秒）(Minimum silence duration in seconds)',
      },
      windowSeconds: {
        type: 'number',
        description: '分析窗口长度（秒）(Analysis window seconds)',
      },
    },
    required: [],
  },
  execute: async (params): Promise<ToolResult> => {
    try {
      const editor = EditorCore.getInstance();
      const allTracks = editor.timeline.getTracks();
      const mediaAssets = editor.media.getAssets();
      const source = params.source === 'selection' ? 'selection' : 'timeline';

      let tracksToUse = allTracks;
      const allowedElements = new Set<string>();
      let selectedRefs: Array<{ trackId: string; elementId: string }> = [];

      if (source === 'selection') {
        selectedRefs = editor.selection.getSelectedElements();
        if (selectedRefs.length === 0) {
          return {
            success: false,
            message: '没有选中任何可检测的元素 (No selected elements)',
            data: { errorCode: 'NO_SELECTION' },
          };
        }

        const selectionMap = new Map<string, Set<string>>();
        for (const ref of selectedRefs) {
          if (!selectionMap.has(ref.trackId)) {
            selectionMap.set(ref.trackId, new Set());
          }
          selectionMap.get(ref.trackId)?.add(ref.elementId);
          allowedElements.add(`${ref.trackId}:${ref.elementId}`);
        }

        tracksToUse = allTracks
          .map((track) => {
            const selectedIds = selectionMap.get(track.id);
            if (!selectedIds) return null;
            const elements = track.elements.filter((el) => selectedIds.has(el.id));
            if (elements.length === 0) return null;
            return { ...track, elements } as TimelineTrack;
          })
          .filter((track): track is TimelineTrack => track !== null);

        if (tracksToUse.length === 0) {
          return {
            success: false,
            message: '未找到选中元素 (Selected elements not found)',
            data: { errorCode: 'SELECTION_NOT_FOUND' },
          };
        }
      }

      const hasAudioSource = tracksToUse.some((track) =>
        track.elements.some((element) => canElementHaveAudio(element)),
      );
      if (!hasAudioSource) {
        return {
          success: false,
          message: '没有可用音频用于检测 (No audio-capable elements)',
          data: { errorCode: 'NO_AUDIO_SOURCE' },
        };
      }

      const totalDuration = calculateTotalDuration({ tracks: tracksToUse });
      if (totalDuration <= 0) {
        return {
          success: false,
          message: '音频时长为 0，无法检测 (Audio duration is 0)',
          data: { errorCode: 'EMPTY_AUDIO' },
        };
      }

      const threshold =
        isFiniteNumber(params.threshold) && params.threshold >= 0
          ? params.threshold
          : 0.02;
      const minDuration =
        isFiniteNumber(params.minDuration) && params.minDuration > 0
          ? params.minDuration
          : 0.5;
      const windowSeconds =
        isFiniteNumber(params.windowSeconds) && params.windowSeconds > 0
          ? params.windowSeconds
          : 0.1;

      const audioBlob = await extractTimelineAudio({
        tracks: tracksToUse,
        mediaAssets,
        totalDuration,
      });
      const { samples, sampleRate } = await decodeAudioToFloat32({ audioBlob });

      const silenceIntervals = detectSilenceIntervals({
        samples,
        sampleRate,
        threshold,
        minDuration,
        windowSeconds,
      }).map((interval) => ({
        start: Math.max(0, interval.start),
        end: Math.min(totalDuration, interval.end),
      }));

      const filteredIntervals = silenceIntervals.filter(
        (interval) => interval.end > interval.start,
      );

      if (filteredIntervals.length === 0) {
        return {
          success: true,
          message: '未检测到静音区间 (No silence detected)',
          data: { silenceCount: 0, intervals: [] },
        };
      }

      const previousSelection = editor.selection.getSelectedElements();
      let totalDeleted = 0;
      let totalSplits = 0;

      const shouldInclude = (trackId: string, elementId: string) => {
        if (source !== 'selection') return true;
        return allowedElements.has(`${trackId}:${elementId}`);
      };

      for (const interval of filteredIntervals) {
        const splitAt = (splitTime: number) => {
          const tracks = editor.timeline.getTracks();
          const elementsToSplit: Array<{ trackId: string; elementId: string }> = [];

          for (const track of tracks) {
            for (const element of track.elements) {
              if (!shouldInclude(track.id, element.id)) continue;
              const elementStart = element.startTime;
              const elementEnd = element.startTime + element.duration;
              if (splitTime > elementStart && splitTime < elementEnd) {
                elementsToSplit.push({ trackId: track.id, elementId: element.id });
              }
            }
          }

          if (elementsToSplit.length > 0) {
            const rightSide = editor.timeline.splitElements({
              elements: elementsToSplit,
              splitTime,
            });
            totalSplits += elementsToSplit.length;
            if (source === 'selection') {
              for (const ref of rightSide) {
                allowedElements.add(`${ref.trackId}:${ref.elementId}`);
              }
            }
          }
        };

        splitAt(interval.start);
        splitAt(interval.end);

        const updatedTracks = editor.timeline.getTracks();
        const elementsToDelete: Array<{ trackId: string; elementId: string }> = [];

        for (const track of updatedTracks) {
          for (const element of track.elements) {
            if (!shouldInclude(track.id, element.id)) continue;
            const elementStart = element.startTime;
            const elementEnd = element.startTime + element.duration;
            if (elementStart >= interval.start && elementEnd <= interval.end) {
              elementsToDelete.push({ trackId: track.id, elementId: element.id });
            }
          }
        }

        if (elementsToDelete.length > 0) {
          editor.timeline.deleteElements({ elements: elementsToDelete });
          totalDeleted += elementsToDelete.length;
        }
      }

      editor.selection.setSelectedElements({ elements: previousSelection });

      return {
        success: true,
        message: `已删除 ${totalDeleted} 个静音片段 (Removed ${totalDeleted} silent segment(s))`,
        data: {
          silenceCount: filteredIntervals.length,
          intervals: filteredIntervals,
          deletedCount: totalDeleted,
          splitCount: totalSplits,
          source,
          threshold,
          minDuration,
        },
      };
    } catch (error) {
      return {
        success: false,
        message: `移除静音失败: ${error instanceof Error ? error.message : 'Unknown error'}`,
        data: { errorCode: 'REMOVE_SILENCE_FAILED' },
      };
    }
  },
};

/**
 * Insert Text
 * Inserts a text element into a text track
 */
export const insertTextTool: AgentTool = {
  name: 'insert_text',
  description: '插入文字元素到时间线。Insert a text element into the timeline.',
  parameters: {
    type: 'object',
    properties: {
      content: {
        type: 'string',
        description: '文字内容 (Text content)',
      },
      startTime: {
        type: 'number',
        description: '开始时间（秒）(Start time in seconds)',
      },
      duration: {
        type: 'number',
        description: '时长（秒）(Duration in seconds)',
      },
      trackId: {
        type: 'string',
        description: '目标文本轨道ID（可选）(Target text track ID)',
      },
      trackIndex: {
        type: 'number',
        description: '新建文本轨道插入位置（可选）(Insert index for new track)',
      },
      name: {
        type: 'string',
        description: '元素名称 (Element name)',
      },
      fontSize: { type: 'number' },
      fontFamily: { type: 'string' },
      color: { type: 'string' },
      backgroundColor: { type: 'string' },
      textAlign: { type: 'string', enum: [...TEXT_ALIGN_VALUES] },
      fontWeight: { type: 'string', enum: [...TEXT_WEIGHT_VALUES] },
      fontStyle: { type: 'string', enum: [...TEXT_STYLE_VALUES] },
      textDecoration: { type: 'string', enum: [...TEXT_DECORATION_VALUES] },
      transform: {
        type: 'object',
        properties: {
          scale: { type: 'number' },
          position: {
            type: 'object',
            properties: {
              x: { type: 'number' },
              y: { type: 'number' },
            },
          },
          rotate: { type: 'number' },
        },
      },
      opacity: { type: 'number' },
    },
    required: [],
  },
  execute: async (params): Promise<ToolResult> => {
    try {
      const editor = EditorCore.getInstance();
      const tracks = editor.timeline.getTracks();

      const startTime = isFiniteNumber(params.startTime)
        ? params.startTime
        : editor.playback.getCurrentTime();
      if (startTime < 0) {
        return {
          success: false,
          message: 'startTime 必须是非负数字 (startTime must be >= 0)',
          data: { errorCode: 'INVALID_START_TIME' },
        };
      }

      if (params.duration !== undefined) {
        if (!isFiniteNumber(params.duration) || params.duration <= 0) {
          return {
            success: false,
            message: 'duration 必须是正数 (duration must be > 0)',
            data: { errorCode: 'INVALID_DURATION' },
          };
        }
      }

      if (params.textAlign !== undefined) {
        if (!TEXT_ALIGN_VALUES.includes(params.textAlign as typeof TEXT_ALIGN_VALUES[number])) {
          return {
            success: false,
            message: 'textAlign 无效 (Invalid textAlign)',
            data: { errorCode: 'INVALID_TEXT_ALIGN' },
          };
        }
      }

      if (params.fontWeight !== undefined) {
        if (!TEXT_WEIGHT_VALUES.includes(params.fontWeight as typeof TEXT_WEIGHT_VALUES[number])) {
          return {
            success: false,
            message: 'fontWeight 无效 (Invalid fontWeight)',
            data: { errorCode: 'INVALID_FONT_WEIGHT' },
          };
        }
      }

      if (params.fontStyle !== undefined) {
        if (!TEXT_STYLE_VALUES.includes(params.fontStyle as typeof TEXT_STYLE_VALUES[number])) {
          return {
            success: false,
            message: 'fontStyle 无效 (Invalid fontStyle)',
            data: { errorCode: 'INVALID_FONT_STYLE' },
          };
        }
      }

      if (params.textDecoration !== undefined) {
        if (
          !TEXT_DECORATION_VALUES.includes(
            params.textDecoration as typeof TEXT_DECORATION_VALUES[number],
          )
        ) {
          return {
            success: false,
            message: 'textDecoration 无效 (Invalid textDecoration)',
            data: { errorCode: 'INVALID_TEXT_DECORATION' },
          };
        }
      }

      if (params.opacity !== undefined) {
        if (!isFiniteNumber(params.opacity) || params.opacity < 0 || params.opacity > 1) {
          return {
            success: false,
            message: 'opacity 必须在 0-1 之间 (opacity must be between 0 and 1)',
            data: { errorCode: 'INVALID_OPACITY' },
          };
        }
      }

      if (params.transform !== undefined) {
        if (!params.transform || typeof params.transform !== 'object') {
          return {
            success: false,
            message: 'transform 参数无效 (Invalid transform)',
            data: { errorCode: 'INVALID_TRANSFORM' },
          };
        }
        const transform = params.transform as {
          scale?: unknown;
          position?: { x?: unknown; y?: unknown };
          rotate?: unknown;
        };

        if (
          (transform.scale !== undefined && !isFiniteNumber(transform.scale)) ||
          (transform.rotate !== undefined && !isFiniteNumber(transform.rotate)) ||
          (transform.position?.x !== undefined && !isFiniteNumber(transform.position.x)) ||
          (transform.position?.y !== undefined && !isFiniteNumber(transform.position.y))
        ) {
          return {
            success: false,
            message: 'transform 数值无效 (Invalid transform values)',
            data: { errorCode: 'INVALID_TRANSFORM' },
          };
        }
      }

      const raw: Partial<Omit<TextElement, 'type' | 'id'>> = {
        name: isNonEmptyString(params.name) ? params.name.trim() : undefined,
        content: isNonEmptyString(params.content)
          ? params.content.trim()
          : DEFAULT_TEXT_ELEMENT.content,
        duration: params.duration as number | undefined,
        fontSize: params.fontSize as number | undefined,
        fontFamily: isNonEmptyString(params.fontFamily)
          ? params.fontFamily.trim()
          : undefined,
        color: isNonEmptyString(params.color) ? params.color.trim() : undefined,
        backgroundColor: isNonEmptyString(params.backgroundColor)
          ? params.backgroundColor.trim()
          : undefined,
        textAlign: params.textAlign as TextElement['textAlign'] | undefined,
        fontWeight: params.fontWeight as TextElement['fontWeight'] | undefined,
        fontStyle: params.fontStyle as TextElement['fontStyle'] | undefined,
        textDecoration: params.textDecoration as TextElement['textDecoration'] | undefined,
        transform: params.transform as TextElement['transform'] | undefined,
        opacity: params.opacity as TextElement['opacity'] | undefined,
      };

      const explicitTrackId = isNonEmptyString(params.trackId)
        ? params.trackId.trim()
        : '';
      let targetTrackId = '';

      if (explicitTrackId) {
        const targetTrack = editor.timeline.getTrackById({ trackId: explicitTrackId });
        if (!targetTrack) {
          return {
            success: false,
            message: `找不到轨道: ${explicitTrackId} (Track not found)`,
            data: { errorCode: 'TRACK_NOT_FOUND', trackId: explicitTrackId },
          };
        }
        if (targetTrack.type !== 'text') {
          return {
            success: false,
            message: '目标轨道不是文本轨道 (Target track is not text)',
            data: { errorCode: 'TRACK_NOT_TEXT', trackId: explicitTrackId },
          };
        }
        targetTrackId = explicitTrackId;
      } else {
        const existingTextTrack = tracks.find((track) => track.type === 'text');
        if (existingTextTrack) {
          targetTrackId = existingTextTrack.id;
        } else {
          const index =
            isFiniteNumber(params.trackIndex) && params.trackIndex >= 0
              ? Math.floor(params.trackIndex)
              : 0;
          targetTrackId = editor.timeline.addTrack({ type: 'text', index });
        }
      }

      const element = buildTextElement({ raw, startTime });
      editor.timeline.insertElement({
        placement: { mode: 'explicit', trackId: targetTrackId },
        element,
      });

      return {
        success: true,
        message: '已插入文字元素 (Text element inserted)',
        data: {
          trackId: targetTrackId,
          startTime,
          duration: element.duration,
          content: (element as { content?: string }).content,
        },
      };
    } catch (error) {
      return {
        success: false,
        message: `插入文字失败: ${error instanceof Error ? error.message : 'Unknown error'}`,
        data: { errorCode: 'INSERT_TEXT_FAILED' },
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
    generateCaptionsTool,
    updateTextStyleTool,
    moveElementTool,
    trimElementTool,
    resizeElementTool,
    updateElementTransformTool,
    removeSilenceTool,
    insertTextTool,
  ];
}
