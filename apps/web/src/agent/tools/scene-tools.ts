import type { AgentTool, ToolResult } from '../types';
import { invokeActionWithCheck } from './action-utils';
import { EditorCore } from '@/core';

/**
 * Scene and Transition Tools
 * Tools for scene management, bookmarks, and navigation
 */

/**
 * Toggle Bookmark
 * Adds or removes a bookmark at the current playhead position
 */
export const toggleBookmarkTool: AgentTool = {
  name: 'toggle_bookmark',
  description: '在当前播放头位置添加或移除书签。Toggle bookmark at the current playhead position.',
  parameters: {
    type: 'object',
    properties: {},
    required: [],
  },
  execute: async (): Promise<ToolResult> => {
    try {
      invokeActionWithCheck('toggle-bookmark');
      return {
        success: true,
        message: '已切换书签 (Toggled bookmark)',
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
 * Create Scene
 * Creates a new scene in the project
 */
export const createSceneTool: AgentTool = {
  name: 'create_scene',
  description: '创建一个新场景。Create a new scene in the project.',
  parameters: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Name for the new scene',
      },
    },
    required: ['name'],
  },
  execute: async (args: Record<string, unknown>): Promise<ToolResult> => {
    try {
      const sceneName = (args.name as string) || `Scene ${Date.now()}`;
      const editor = EditorCore.getInstance();
      const sceneId = await editor.scenes.createScene({ name: sceneName, isMain: false });
      return {
        success: true,
        message: `已创建场景 "${sceneName}" (Created scene, ID: ${sceneId})`,
        data: { sceneId, name: sceneName },
      };
    } catch (error) {
      return {
        success: false,
        message: `创建场景失败: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  },
};

/**
 * Switch Scene
 * Switches to a different scene by name or index
 */
export const switchSceneTool: AgentTool = {
  name: 'switch_scene',
  description: '切换到指定场景。Switch to a scene by name or index.',
  parameters: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Name of the scene to switch to',
      },
      index: {
        type: 'number',
        description: 'Index of the scene to switch to (0-based)',
      },
    },
    required: [],
  },
  execute: async (args: Record<string, unknown>): Promise<ToolResult> => {
    try {
      const argName = args.name as string | undefined;
      const argIndex = args.index as number | undefined;
      const editor = EditorCore.getInstance();
      const scenes = editor.scenes.getScenes();
      
      let targetScene = null;
      
      if (argName) {
        targetScene = scenes.find(s => s.name.toLowerCase() === argName.toLowerCase());
      } else if (typeof argIndex === 'number') {
        targetScene = scenes[argIndex];
      }
      
      if (!targetScene) {
        return {
          success: false,
          message: `未找到场景 (Scene not found). Available: ${scenes.map(s => s.name).join(', ')}`,
        };
      }
      
      await editor.scenes.switchToScene({ sceneId: targetScene.id });
      return {
        success: true,
        message: `已切换到场景 "${targetScene.name}" (Switched to scene)`,
        data: { sceneId: targetScene.id, name: targetScene.name },
      };
    } catch (error) {
      return {
        success: false,
        message: `切换场景失败: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  },
};

/**
 * List Scenes
 * Returns a list of all scenes in the project
 */
export const listScenesTool: AgentTool = {
  name: 'list_scenes',
  description: '获取项目中所有场景的列表。Get a list of all scenes in the project.',
  parameters: {
    type: 'object',
    properties: {},
    required: [],
  },
  execute: async (): Promise<ToolResult> => {
    try {
      const editor = EditorCore.getInstance();
      const scenes = editor.scenes.getScenes();
      const activeScene = editor.scenes.getActiveScene();
      
      const sceneList = scenes.map((s, i) => ({
        index: i,
        id: s.id,
        name: s.name,
        isMain: s.isMain,
        isActive: s.id === activeScene?.id,
        trackCount: s.tracks?.length || 0,
      }));
      
      return {
        success: true,
        message: `共有 ${scenes.length} 个场景 (${scenes.length} scenes total)`,
        data: sceneList,
      };
    } catch (error) {
      return {
        success: false,
        message: `获取场景列表失败: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  },
};

/**
 * Rename Scene
 * Renames a scene by ID or current scene
 */
export const renameSceneTool: AgentTool = {
  name: 'rename_scene',
  description: '重命名当前场景或指定场景。Rename the current scene or a specific scene.',
  parameters: {
    type: 'object',
    properties: {
      newName: {
        type: 'string',
        description: 'New name for the scene',
      },
      sceneId: {
        type: 'string',
        description: 'Optional: ID of the scene to rename (defaults to active scene)',
      },
    },
    required: ['newName'],
  },
  execute: async (args: Record<string, unknown>): Promise<ToolResult> => {
    try {
      const newName = args.newName as string;
      const sceneId = args.sceneId as string | undefined;
      
      if (!newName) {
        return {
          success: false,
          message: '请提供新名称 (Please provide a new name)',
        };
      }
      
      const editor = EditorCore.getInstance();
      const targetId = sceneId || editor.scenes.getActiveScene()?.id;
      
      if (!targetId) {
        return {
          success: false,
          message: '没有可重命名的场景 (No scene to rename)',
        };
      }
      
      await editor.scenes.renameScene({ sceneId: targetId, name: newName });
      return {
        success: true,
        message: `已重命名为 "${newName}" (Renamed scene)`,
      };
    } catch (error) {
      return {
        success: false,
        message: `重命名失败: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  },
};

/**
 * Delete Scene
 * Deletes a scene by ID, name, or index
 */
export const deleteSceneTool: AgentTool = {
  name: 'delete_scene',
  description: '删除指定场景（按ID/名称/索引）。Delete a scene by ID, name, or index.',
  parameters: {
    type: 'object',
    properties: {
      sceneId: {
        type: 'string',
        description: '场景ID (Scene ID)',
      },
      name: {
        type: 'string',
        description: '场景名称 (Scene name)',
      },
      index: {
        type: 'number',
        description: '场景索引 (0-based index)',
      },
    },
    required: [],
  },
  execute: async (args: Record<string, unknown>): Promise<ToolResult> => {
    try {
      const sceneId = typeof args.sceneId === 'string' ? args.sceneId.trim() : '';
      const name = typeof args.name === 'string' ? args.name.trim() : '';
      const index = typeof args.index === 'number' ? args.index : undefined;

      const editor = EditorCore.getInstance();
      const scenes = editor.scenes.getScenes();

      let targetScene = null as { id: string; name: string } | null;

      if (sceneId) {
        targetScene = scenes.find((s) => s.id === sceneId) ?? null;
      } else if (name) {
        targetScene =
          scenes.find((s) => s.name.toLowerCase() === name.toLowerCase()) ??
          null;
      } else if (typeof index === 'number') {
        targetScene = scenes[index] ?? null;
      }

      if (!targetScene) {
        return {
          success: false,
          message: '未找到场景 (Scene not found)',
          data: { errorCode: 'SCENE_NOT_FOUND' },
        };
      }

      await editor.scenes.deleteScene({ sceneId: targetScene.id });
      return {
        success: true,
        message: `已删除场景 "${targetScene.name}" (Scene deleted)`,
        data: { sceneId: targetScene.id, name: targetScene.name },
      };
    } catch (error) {
      return {
        success: false,
        message: `删除场景失败: ${error instanceof Error ? error.message : 'Unknown error'}`,
        data: { errorCode: 'DELETE_SCENE_FAILED' },
      };
    }
  },
};

/**
 * Frame Step Forward
 * Moves playhead forward by one frame
 */
export const frameStepForwardTool: AgentTool = {
  name: 'frame_step_forward',
  description: '向前移动一帧。Move playhead forward by one frame.',
  parameters: {
    type: 'object',
    properties: {},
    required: [],
  },
  execute: async (): Promise<ToolResult> => {
    try {
      invokeActionWithCheck('frame-step-forward');
      return {
        success: true,
        message: '已向前移动一帧 (Moved forward one frame)',
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
 * Frame Step Backward
 * Moves playhead backward by one frame
 */
export const frameStepBackwardTool: AgentTool = {
  name: 'frame_step_backward',
  description: '向后移动一帧。Move playhead backward by one frame.',
  parameters: {
    type: 'object',
    properties: {},
    required: [],
  },
  execute: async (): Promise<ToolResult> => {
    try {
      invokeActionWithCheck('frame-step-backward');
      return {
        success: true,
        message: '已向后移动一帧 (Moved backward one frame)',
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
 * Get all scene tools
 */
export function getSceneTools(): AgentTool[] {
  return [
    toggleBookmarkTool,
    createSceneTool,
    switchSceneTool,
    listScenesTool,
    renameSceneTool,
    deleteSceneTool,
    frameStepForwardTool,
    frameStepBackwardTool,
  ];
}
