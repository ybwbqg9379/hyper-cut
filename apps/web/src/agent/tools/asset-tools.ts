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
 * Get all asset tools
 */
export function getAssetTools(): AgentTool[] {
  return [
    listAssetsTool,
    addAssetToTimelineTool,
  ];
}
