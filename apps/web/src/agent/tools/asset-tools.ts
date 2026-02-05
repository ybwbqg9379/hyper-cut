import type { AgentTool, ToolResult } from '../types';
import type { CreateTimelineElement } from '@/types/timeline';
import { EditorCore } from '@/core';
import {
  buildVideoElement,
  buildImageElement,
  buildUploadAudioElement,
} from '@/lib/timeline/element-utils';
import { canElementGoOnTrack } from '@/lib/timeline/track-utils';
import { TIMELINE_CONSTANTS } from '@/constants/timeline-constants';
import { processMediaAssets } from '@/lib/media/processing';

const MEDIA_TYPES = ['image', 'video', 'audio'] as const;
const FETCH_TIMEOUT_MS = 20000;
const MAX_MEDIA_BYTES = 200 * 1024 * 1024;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Asset Management Tools
 * Tools for listing and adding assets to the timeline
 */

/**
 * List Assets
 * Returns all assets available in the current project
 */
export const listAssetsTool: AgentTool = {
  name: 'list_assets',
  description: '列出项目中的所有素材资源。List all assets available in the current project.',
  parameters: {
    type: 'object',
    properties: {},
    required: [],
  },
  execute: async (): Promise<ToolResult> => {
    try {
      const editor = EditorCore.getInstance();
      const assets = editor.media.getAssets();
      
      // Filter out ephemeral assets
      const availableAssets = assets.filter(a => !a.ephemeral);
      
      if (availableAssets.length === 0) {
        return {
          success: true,
          message: '项目中没有素材资源 (No assets in project)',
          data: { assets: [], count: 0 },
        };
      }

      const assetList = availableAssets.map(asset => ({
        id: asset.id,
        name: asset.name,
        type: asset.type,
        duration: asset.duration,
      }));

      return {
        success: true,
        message: `项目中有 ${assetList.length} 个素材资源 (${assetList.length} asset(s) available)`,
        data: {
          assets: assetList,
          count: assetList.length,
        },
      };
    } catch (error) {
      return {
        success: false,
        message: `获取素材列表失败: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  },
};

/**
 * Add Asset to Timeline
 * Adds an asset to the timeline at a specified time or current playhead position
 */
export const addAssetToTimelineTool: AgentTool = {
  name: 'add_asset_to_timeline',
  description: '将素材添加到时间线。可指定素材ID和开始时间。Add an asset to the timeline by ID, optionally at a specific start time.',
  parameters: {
    type: 'object',
    properties: {
      assetId: {
        type: 'string',
        description: '素材ID (Asset ID to add)',
      },
      startTime: {
        type: 'number',
        description: '开始时间（秒），默认为当前播放头位置 (Start time in seconds, defaults to current playhead)',
      },
      trackId: {
        type: 'string',
        description: '目标轨道ID，可选 (Optional target track ID)',
      },
    },
    required: ['assetId'],
  },
  execute: async (params): Promise<ToolResult> => {
    try {
      const editor = EditorCore.getInstance();
      const assetId = params.assetId as string;
      
      if (!assetId) {
        return {
          success: false,
          message: '缺少素材ID参数 (Missing assetId parameter)',
        };
      }

      // Find the asset
      const assets = editor.media.getAssets();
      const asset = assets.find(a => a.id === assetId);
      
      if (!asset) {
        return {
          success: false,
          message: `找不到素材: ${assetId} (Asset not found: ${assetId})`,
        };
      }

      if (asset.ephemeral) {
        return {
          success: false,
          message: `素材为临时资源，无法添加: ${assetId} (Asset is ephemeral and cannot be added: ${assetId})`,
        };
      }

      // Determine start time
      const startTime = typeof params.startTime === 'number' 
        ? params.startTime 
        : editor.playback.getCurrentTime();

      if (!Number.isFinite(startTime) || startTime < 0) {
        return {
          success: false,
          message: '无效的开始时间 (Invalid start time)',
        };
      }

      // Build element based on asset type
      const duration = asset.duration ?? TIMELINE_CONSTANTS.DEFAULT_ELEMENT_DURATION;
      let element: CreateTimelineElement;

      switch (asset.type) {
        case 'video':
          element = buildVideoElement({
            mediaId: asset.id,
            name: asset.name,
            duration,
            startTime,
          });
          break;
        case 'image':
          element = buildImageElement({
            mediaId: asset.id,
            name: asset.name,
            duration,
            startTime,
          });
          break;
        case 'audio':
          element = buildUploadAudioElement({
            mediaId: asset.id,
            name: asset.name,
            duration,
            startTime,
          });
          break;
        default:
          return {
            success: false,
            message: `不支持的素材类型: ${asset.type} (Unsupported asset type)`,
          };
      }

      const requestedTrackId =
        typeof params.trackId === 'string' ? params.trackId.trim() : '';
      const placement = requestedTrackId
        ? { mode: 'explicit' as const, trackId: requestedTrackId }
        : { mode: 'auto' as const };

      if (placement.mode === 'explicit') {
        const targetTrack = editor.timeline.getTrackById({ trackId: placement.trackId });
        if (!targetTrack) {
          return {
            success: false,
            message: `找不到轨道: ${placement.trackId} (Track not found: ${placement.trackId})`,
          };
        }

        if (!canElementGoOnTrack({ elementType: element.type, trackType: targetTrack.type })) {
          return {
            success: false,
            message: `素材类型 ${element.type} 不能放入轨道 ${targetTrack.type} (Incompatible track type)`,
          };
        }
      }

      // Insert element into timeline
      editor.timeline.insertElement({
        element,
        placement,
      });

      return {
        success: true,
        message: `已将 "${asset.name}" 添加到时间线 ${startTime.toFixed(2)} 秒处 (Added "${asset.name}" to timeline at ${startTime.toFixed(2)}s)`,
        data: {
          assetId: asset.id,
          assetName: asset.name,
          assetType: asset.type,
          startTime,
          duration,
          placementMode: placement.mode,
          trackId: placement.mode === 'explicit' ? placement.trackId : undefined,
        },
      };
    } catch (error) {
      return {
        success: false,
        message: `添加素材失败: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  },
};

/**
 * Add Media Asset
 * Adds a media asset from a URL to the project
 */
export const addMediaAssetTool: AgentTool = {
  name: 'add_media_asset',
  description:
    '通过URL添加媒体素材（image/video/audio）。Add a media asset from a URL.',
  parameters: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: '媒体文件URL (Media file URL)',
      },
      name: {
        type: 'string',
        description: '素材名称（可选）(Asset name, optional)',
      },
      type: {
        type: 'string',
        enum: [...MEDIA_TYPES],
        description: '素材类型 (image/video/audio)',
      },
      mimeType: {
        type: 'string',
        description: 'MIME 类型（可选）(Optional MIME type)',
      },
    },
    required: ['url', 'type'],
  },
  execute: async (params): Promise<ToolResult> => {
    try {
      const editor = EditorCore.getInstance();
      const activeProject = editor.project.getActive();

      if (!activeProject) {
        return {
          success: false,
          message: '当前没有活动项目 (No active project)',
          data: { errorCode: 'NO_ACTIVE_PROJECT' },
        };
      }

      const url = isNonEmptyString(params.url) ? params.url.trim() : '';
      const type = isNonEmptyString(params.type) ? params.type.trim() : '';

      if (!url) {
        return {
          success: false,
          message: '缺少 url 参数 (Missing url)',
          data: { errorCode: 'INVALID_PARAMS' },
        };
      }

      if (!MEDIA_TYPES.includes(type as (typeof MEDIA_TYPES)[number])) {
        return {
          success: false,
          message: `无效的素材类型: ${type} (Invalid media type)`,
          data: { errorCode: 'INVALID_MEDIA_TYPE' },
        };
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      let response: Response;

      try {
        response = await fetch(url, { signal: controller.signal });
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return {
            success: false,
            message: '下载超时 (Fetch timed out)',
            data: { errorCode: 'FETCH_TIMEOUT' },
          };
        }
        return {
          success: false,
          message:
            '下载失败，可能是网络错误或跨域限制 (Fetch failed, possibly due to network/CORS)',
          data: { errorCode: 'FETCH_FAILED' },
        };
      } finally {
        clearTimeout(timeoutId);
      }

      if (!response.ok) {
        return {
          success: false,
          message: `下载失败: ${response.status} (Failed to fetch media)`,
          data: { errorCode: 'FETCH_FAILED' },
        };
      }

      const contentLength = response.headers.get('content-length');
      if (contentLength) {
        const length = Number(contentLength);
        if (Number.isFinite(length) && length > MAX_MEDIA_BYTES) {
          return {
            success: false,
            message: '文件过大，无法处理 (File is too large)',
            data: { errorCode: 'FILE_TOO_LARGE', maxBytes: MAX_MEDIA_BYTES },
          };
        }
      }

      const blob = await response.blob();
      if (blob.size > MAX_MEDIA_BYTES) {
        return {
          success: false,
          message: '文件过大，无法处理 (File is too large)',
          data: { errorCode: 'FILE_TOO_LARGE', maxBytes: MAX_MEDIA_BYTES },
        };
      }
      const mimeTypeParam = isNonEmptyString(params.mimeType)
        ? params.mimeType.trim()
        : '';
      const fallbackMimeType = `${type}/*`;
      const mimeType = mimeTypeParam || blob.type || fallbackMimeType;

      const nameParam = isNonEmptyString(params.name) ? params.name.trim() : '';
      const urlName = (() => {
        try {
          const parsed = new URL(url);
          return parsed.pathname.split('/').pop() || '';
        } catch {
          return '';
        }
      })();
      const fileName = nameParam || urlName || `asset-${Date.now()}`;

      const file = new File([blob], fileName, {
        type: mimeType,
        lastModified: Date.now(),
      });

      const processedAssets = await processMediaAssets({
        files: [file],
      });

      if (processedAssets.length === 0) {
        return {
          success: false,
          message: '媒体处理失败 (Media processing failed)',
          data: { errorCode: 'PROCESSING_FAILED' },
        };
      }

      const processed = processedAssets[0];
      await editor.media.addMediaAsset({
        projectId: activeProject.metadata.id,
        asset: processed,
      });

      const assets = editor.media.getAssets();
      const added =
        assets.find((asset) => asset.file === processed.file) ??
        assets.find(
          (asset) => asset.name === processed.name && asset.type === processed.type,
        );

      if (!added) {
        return {
          success: true,
          message:
            '已添加素材，但未能解析ID，请使用 list_assets 获取 (Asset added, ID unavailable)',
          data: {
            assetId: null,
            name: processed.name,
            type: processed.type,
            duration: processed.duration,
          },
        };
      }

      return {
        success: true,
        message: `已添加素材 "${processed.name}" (Asset added)`,
        data: {
          assetId: added?.id,
          name: processed.name,
          type: processed.type,
          duration: processed.duration,
        },
      };
    } catch (error) {
      return {
        success: false,
        message: `添加素材失败: ${error instanceof Error ? error.message : 'Unknown error'}`,
        data: { errorCode: 'ADD_ASSET_FAILED' },
      };
    }
  },
};

/**
 * Remove Asset
 * Removes a media asset from the project
 */
export const removeAssetTool: AgentTool = {
  name: 'remove_asset',
  description: '从项目中删除素材资源。Remove a media asset from the project.',
  parameters: {
    type: 'object',
    properties: {
      assetId: {
        type: 'string',
        description: '素材ID (Asset ID)',
      },
    },
    required: ['assetId'],
  },
  execute: async (params): Promise<ToolResult> => {
    try {
      const editor = EditorCore.getInstance();
      const activeProject = editor.project.getActive();

      if (!activeProject) {
        return {
          success: false,
          message: '当前没有活动项目 (No active project)',
          data: { errorCode: 'NO_ACTIVE_PROJECT' },
        };
      }

      const assetId = isNonEmptyString(params.assetId) ? params.assetId.trim() : '';
      if (!assetId) {
        return {
          success: false,
          message: '缺少 assetId 参数 (Missing assetId)',
          data: { errorCode: 'INVALID_PARAMS' },
        };
      }

      const asset = editor.media.getAssets().find((item) => item.id === assetId);
      if (!asset) {
        return {
          success: false,
          message: `找不到素材: ${assetId} (Asset not found)`,
          data: { errorCode: 'ASSET_NOT_FOUND' },
        };
      }

      await editor.media.removeMediaAsset({
        projectId: activeProject.metadata.id,
        id: assetId,
      });

      return {
        success: true,
        message: `已删除素材 "${asset.name}" (Asset removed)`,
        data: { assetId, name: asset.name, type: asset.type },
      };
    } catch (error) {
      return {
        success: false,
        message: `删除素材失败: ${error instanceof Error ? error.message : 'Unknown error'}`,
        data: { errorCode: 'REMOVE_ASSET_FAILED' },
      };
    }
  },
};

/**
 * Get all asset tools
 */
export function getAssetTools(): AgentTool[] {
  return [
    listAssetsTool,
    addAssetToTimelineTool,
    addMediaAssetTool,
    removeAssetTool,
  ];
}
