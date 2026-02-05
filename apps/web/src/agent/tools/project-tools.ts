import type { AgentTool, ToolResult } from '../types';
import { EditorCore } from '@/core';
import { getExportFileExtension, getExportMimeType } from '@/lib/export';
import {
  DEFAULT_CANVAS_PRESETS,
  FPS_PRESETS,
} from '@/constants/project-constants';
import {
  EXPORT_FORMAT_VALUES,
  EXPORT_QUALITY_VALUES,
  type ExportFormat,
  type ExportQuality,
} from '@/types/export';

const DEFAULT_EXPORT_FORMAT: ExportFormat = 'mp4';
const DEFAULT_EXPORT_QUALITY: ExportQuality = 'high';

function isExportFormat(value: string): value is ExportFormat {
  return EXPORT_FORMAT_VALUES.some((formatValue) => formatValue === value);
}

function isExportQuality(value: string): value is ExportQuality {
  return EXPORT_QUALITY_VALUES.some((qualityValue) => qualityValue === value);
}

const FPS_VALUES = FPS_PRESETS.map((preset) => Number(preset.value));

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function parseCanvasSize(value: unknown): { width: number; height: number } | null {
  if (value && typeof value === 'object') {
    const width = (value as { width?: unknown }).width;
    const height = (value as { height?: unknown }).height;
    if (isFiniteNumber(width) && isFiniteNumber(height)) {
      return { width, height };
    }
  }

  if (typeof value === 'string') {
    const match = value.trim().match(/^(\d+)x(\d+)$/);
    if (match) {
      return { width: Number(match[1]), height: Number(match[2]) };
    }
  }

  return null;
}

function isCanvasPreset(size: { width: number; height: number }): boolean {
  return DEFAULT_CANVAS_PRESETS.some(
    (preset) => preset.width === size.width && preset.height === size.height,
  );
}

/**
 * Export Video
 * Exports the current project to a video file and triggers download
 */
export const exportVideoTool: AgentTool = {
  name: 'export_video',
  description: '导出视频（mp4/webm），支持质量与是否包含音频。Export the project to video (mp4/webm).',
  parameters: {
    type: 'object',
    properties: {
      format: {
        type: 'string',
        enum: ['mp4', 'webm'],
        description: '导出格式 (Export format)',
      },
      quality: {
        type: 'string',
        enum: ['low', 'medium', 'high', 'very_high'],
        description: '导出质量 (Export quality)',
      },
      includeAudio: {
        type: 'boolean',
        description: '是否包含音频 (Include audio)',
      },
    },
    required: [],
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

      const formatParam = typeof params.format === 'string' ? params.format : '';
      const qualityParam = typeof params.quality === 'string' ? params.quality : '';
      const includeAudio =
        typeof params.includeAudio === 'boolean' ? params.includeAudio : true;

      const format = isExportFormat(formatParam)
        ? formatParam
        : DEFAULT_EXPORT_FORMAT;
      const quality = isExportQuality(qualityParam)
        ? qualityParam
        : DEFAULT_EXPORT_QUALITY;

      if (formatParam && !isExportFormat(formatParam)) {
        return {
          success: false,
          message: `无效的导出格式: ${formatParam} (Invalid export format)`,
          data: { errorCode: 'INVALID_FORMAT' },
        };
      }

      if (qualityParam && !isExportQuality(qualityParam)) {
        return {
          success: false,
          message: `无效的导出质量: ${qualityParam} (Invalid export quality)`,
          data: { errorCode: 'INVALID_QUALITY' },
        };
      }

      let lastProgress = 0;
      const result = await editor.project.export({
        options: {
          format,
          quality,
          fps: activeProject.settings.fps,
          includeAudio,
          onProgress: ({ progress }) => {
            lastProgress = progress;
          },
          onCancel: () => false,
        },
      });

      if (result.cancelled) {
        return {
          success: false,
          message: '导出已取消 (Export cancelled)',
          data: { errorCode: 'EXPORT_CANCELLED' },
        };
      }

      if (!result.success || !result.buffer) {
        return {
          success: false,
          message: `导出失败: ${result.error || 'Unknown error'}`,
          data: { errorCode: 'EXPORT_FAILED' },
        };
      }

      let downloaded = false;
      let fileName = `${activeProject.metadata.name}`;
      try {
        const mimeType = getExportMimeType({ format });
        const extension = getExportFileExtension({ format });
        fileName = `${activeProject.metadata.name}${extension}`;

        const blob = new Blob([result.buffer], { type: mimeType });
        const url = URL.createObjectURL(blob);

        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        downloaded = true;
      } catch (error) {
        downloaded = false;
        console.warn('Export download failed:', error);
      }

      return {
        success: true,
        message: downloaded
          ? `导出成功并已开始下载 (${format.toUpperCase()})`
          : `导出成功，但下载触发失败 (${format.toUpperCase()})`,
        data: {
          format,
          quality,
          includeAudio,
          fps: activeProject.settings.fps,
          fileName,
          byteLength: result.buffer.byteLength,
          progress: lastProgress,
          downloaded,
        },
      };
    } catch (error) {
      return {
        success: false,
        message: `导出失败: ${error instanceof Error ? error.message : 'Unknown error'}`,
        data: { errorCode: 'EXPORT_FAILED' },
      };
    }
  },
};

/**
 * Update Project Settings
 * Updates fps, canvas size, and background settings
 */
export const updateProjectSettingsTool: AgentTool = {
  name: 'update_project_settings',
  description:
    '更新项目设置（fps/canvasSize/background）。Update project settings (fps/canvasSize/background).',
  parameters: {
    type: 'object',
    properties: {
      fps: {
        type: 'number',
        description: '帧率 (FPS: 24/25/30/60/120)',
      },
      canvasSize: {
        type: 'object',
        properties: {
          width: { type: 'number' },
          height: { type: 'number' },
        },
        description: '画布尺寸对象 (Canvas size object)',
      },
      canvasPreset: {
        type: 'string',
        description: '画布尺寸预设（如 1920x1080）(Canvas preset like 1920x1080)',
      },
      background: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['color', 'blur'] },
          color: { type: 'string' },
          blurIntensity: { type: 'number' },
        },
        description: '背景设置 (Background settings)',
      },
    },
    required: [],
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

      const settings: {
        fps?: number;
        canvasSize?: { width: number; height: number };
        background?: { type: 'color'; color: string } | { type: 'blur'; blurIntensity: number };
      } = {};

      if (params.fps !== undefined) {
        if (!isFiniteNumber(params.fps) || !FPS_VALUES.includes(params.fps)) {
          return {
            success: false,
            message: 'fps 必须为 24/25/30/60/120 (Invalid fps)',
            data: { errorCode: 'INVALID_FPS' },
          };
        }
        settings.fps = params.fps;
      }

      const canvasPreset = typeof params.canvasPreset === 'string' ? params.canvasPreset : '';
      const parsedPreset = canvasPreset ? parseCanvasSize(canvasPreset) : null;
      const parsedCanvas =
        parsedPreset || parseCanvasSize(params.canvasSize);

      if (params.canvasSize !== undefined || canvasPreset) {
        if (!parsedCanvas || !isCanvasPreset(parsedCanvas)) {
          return {
            success: false,
            message:
              'canvasSize 必须是预设尺寸（1920x1080、1080x1920、1080x1080、1440x1080）',
            data: { errorCode: 'INVALID_CANVAS_SIZE' },
          };
        }
        settings.canvasSize = parsedCanvas;
      }

      if (params.background !== undefined) {
        if (!params.background || typeof params.background !== 'object') {
          return {
            success: false,
            message: 'background 参数无效 (Invalid background)',
            data: { errorCode: 'INVALID_BACKGROUND' },
          };
        }

        const backgroundType = (params.background as { type?: unknown }).type;
        if (backgroundType === 'color') {
          const color = (params.background as { color?: unknown }).color;
          if (typeof color !== 'string' || color.trim().length === 0) {
            return {
              success: false,
              message: 'background.color 必须是非空字符串 (Invalid background color)',
              data: { errorCode: 'INVALID_BACKGROUND_COLOR' },
            };
          }
          settings.background = { type: 'color', color: color.trim() };
        } else if (backgroundType === 'blur') {
          const blurIntensity = (params.background as { blurIntensity?: unknown }).blurIntensity;
          if (!isFiniteNumber(blurIntensity) || blurIntensity < 0) {
            return {
              success: false,
              message: 'background.blurIntensity 必须为非负数字 (Invalid blur intensity)',
              data: { errorCode: 'INVALID_BLUR_INTENSITY' },
            };
          }
          settings.background = { type: 'blur', blurIntensity };
        } else {
          return {
            success: false,
            message: 'background.type 必须是 color 或 blur (Invalid background type)',
            data: { errorCode: 'INVALID_BACKGROUND_TYPE' },
          };
        }
      }

      if (Object.keys(settings).length === 0) {
        return {
          success: false,
          message: '没有提供可更新的设置 (No settings provided)',
          data: { errorCode: 'NO_UPDATES' },
        };
      }

      await editor.project.updateSettings({ settings });

      return {
        success: true,
        message: '已更新项目设置 (Project settings updated)',
        data: settings,
      };
    } catch (error) {
      return {
        success: false,
        message: `更新项目设置失败: ${error instanceof Error ? error.message : 'Unknown error'}`,
        data: { errorCode: 'UPDATE_PROJECT_FAILED' },
      };
    }
  },
};

/**
 * Get all project tools
 */
export function getProjectTools(): AgentTool[] {
  return [exportVideoTool, updateProjectSettingsTool];
}
