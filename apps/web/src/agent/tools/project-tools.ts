import type { AgentTool, ToolResult } from '../types';
import { EditorCore } from '@/core';
import { getExportFileExtension, getExportMimeType } from '@/lib/export';
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
 * Get all project tools
 */
export function getProjectTools(): AgentTool[] {
  return [exportVideoTool];
}
