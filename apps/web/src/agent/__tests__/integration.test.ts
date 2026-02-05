/**
 * Agent Integration Tests
 * Tests for agent → action flow to ensure tools correctly invoke HyperCut actions
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getAllTools, getToolsSummary } from '../tools';
import type { AgentTool, ToolResult } from '../types';

// Mock invokeAction to track calls without side effects
vi.mock('@/lib/actions', () => ({
  invokeAction: vi.fn(),
}));

// Mock EditorCore for query and scene tools
vi.mock('@/core', () => ({
  EditorCore: {
    getInstance: vi.fn(() => ({
      timeline: {
        getTracks: vi.fn(() => [
          { id: 'track1', type: 'video', elements: [{ id: 'el1' }, { id: 'el2' }] },
          { id: 'track2', type: 'audio', elements: [{ id: 'el3' }] },
        ]),
        getTotalDuration: vi.fn(() => 120000),
      },
      playback: {
        getCurrentTime: vi.fn(() => 5),  // Returns seconds, not milliseconds
      },
      selection: {
        getSelectedElements: vi.fn(() => [{ id: 'el1', type: 'video' }]),
      },
      scenes: {
        getScenes: vi.fn(() => [
          { id: 'scene1', name: 'Main Scene', isMain: true, tracks: [] },
          { id: 'scene2', name: 'Scene 2', isMain: false, tracks: [] },
        ]),
        getActiveScene: vi.fn(() => ({ id: 'scene1', name: 'Main Scene', isMain: true })),
        createScene: vi.fn(async () => 'new-scene-id'),
        switchToScene: vi.fn(async () => {}),
        renameScene: vi.fn(async () => {}),
      },
    })),
  },
}));

describe('Agent Tools Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Tool Registry', () => {
    it('should have all expected tools registered', () => {
      const tools = getAllTools();
      expect(tools.length).toBeGreaterThanOrEqual(29);
    });

    it('should categorize tools correctly', () => {
      const summary = getToolsSummary();
      expect(summary).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ category: 'Timeline' }),
          expect.objectContaining({ category: 'Playback' }),
          expect.objectContaining({ category: 'Query' }),
          expect.objectContaining({ category: 'Media' }),
          expect.objectContaining({ category: 'Scene' }),
        ])
      );
    });

    it('should have unique tool names', () => {
      const tools = getAllTools();
      const names = tools.map((t) => t.name);
      const uniqueNames = new Set(names);
      expect(names.length).toBe(uniqueNames.size);
    });

    it('should have valid tool definitions', () => {
      const tools = getAllTools();
      for (const tool of tools) {
        expect(tool.name).toBeDefined();
        expect(tool.description).toBeDefined();
        expect(tool.parameters).toBeDefined();
        expect(tool.parameters.type).toBe('object');
        expect(typeof tool.execute).toBe('function');
      }
    });
  });

  describe('Timeline Tools', () => {
    it('split_at_playhead should invoke split action', async () => {
      const { invokeAction } = await import('@/lib/actions');
      const tool = getAllTools().find((t) => t.name === 'split_at_playhead');
      expect(tool).toBeDefined();

      const result = await tool!.execute({});
      expect(invokeAction).toHaveBeenCalledWith('split');
      expect(result.success).toBe(true);
    });

    it('delete_selected should invoke delete-selected action', async () => {
      const { invokeAction } = await import('@/lib/actions');
      const tool = getAllTools().find((t) => t.name === 'delete_selected');
      
      const result = await tool!.execute({});
      expect(invokeAction).toHaveBeenCalledWith('delete-selected');
      expect(result.success).toBe(true);
    });
  });

  describe('Playback Tools', () => {
    it('toggle_play should invoke toggle-play action', async () => {
      const { invokeAction } = await import('@/lib/actions');
      const tool = getAllTools().find((t) => t.name === 'toggle_play');
      
      const result = await tool!.execute({});
      expect(invokeAction).toHaveBeenCalledWith('toggle-play');
      expect(result.success).toBe(true);
    });

    it('seek_forward should invoke seek-forward action with seconds', async () => {
      const { invokeAction } = await import('@/lib/actions');
      const tool = getAllTools().find((t) => t.name === 'seek_forward');
      
      const result = await tool!.execute({ seconds: 5 });
      expect(invokeAction).toHaveBeenCalledWith('seek-forward', { seconds: 5 });
      expect(result.success).toBe(true);
    });

    it('undo should invoke undo action', async () => {
      const { invokeAction } = await import('@/lib/actions');
      const tool = getAllTools().find((t) => t.name === 'undo');
      
      const result = await tool!.execute({});
      expect(invokeAction).toHaveBeenCalledWith('undo');
      expect(result.success).toBe(true);
    });
  });

  describe('Query Tools', () => {
    it('get_timeline_info should return track and element counts', async () => {
      const tool = getAllTools().find((t) => t.name === 'get_timeline_info');
      
      const result = await tool!.execute({});
      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({
        trackCount: 2,
        totalElements: 3,
      });
    });

    it('get_current_time should return playhead position', async () => {
      const tool = getAllTools().find((t) => t.name === 'get_current_time');
      
      const result = await tool!.execute({});
      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({
        currentTimeSeconds: 5,
      });
    });
  });

  describe('Media Tools', () => {
    it('copy_selected should invoke copy-selected action', async () => {
      const { invokeAction } = await import('@/lib/actions');
      const tool = getAllTools().find((t) => t.name === 'copy_selected');
      
      const result = await tool!.execute({});
      expect(invokeAction).toHaveBeenCalledWith('copy-selected');
      expect(result.success).toBe(true);
    });

    it('paste_copied should invoke paste-copied action', async () => {
      const { invokeAction } = await import('@/lib/actions');
      const tool = getAllTools().find((t) => t.name === 'paste_copied');
      
      const result = await tool!.execute({});
      expect(invokeAction).toHaveBeenCalledWith('paste-copied');
      expect(result.success).toBe(true);
    });

    it('toggle_mute_selected should invoke toggle-elements-muted-selected action', async () => {
      const { invokeAction } = await import('@/lib/actions');
      const tool = getAllTools().find((t) => t.name === 'toggle_mute_selected');
      
      const result = await tool!.execute({});
      expect(invokeAction).toHaveBeenCalledWith('toggle-elements-muted-selected');
      expect(result.success).toBe(true);
    });
  });

  describe('Scene Tools', () => {
    it('list_scenes should return all scenes', async () => {
      const tool = getAllTools().find((t) => t.name === 'list_scenes');
      
      const result = await tool!.execute({});
      expect(result.success).toBe(true);
      expect(Array.isArray(result.data)).toBe(true);
      expect((result.data as unknown[]).length).toBe(2);
    });

    it('create_scene should create a new scene', async () => {
      const tool = getAllTools().find((t) => t.name === 'create_scene');
      
      const result = await tool!.execute({ name: 'Test Scene' });
      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({
        sceneId: 'new-scene-id',
        name: 'Test Scene',
      });
    });

    it('switch_scene should switch to named scene', async () => {
      const tool = getAllTools().find((t) => t.name === 'switch_scene');
      
      const result = await tool!.execute({ name: 'Scene 2' });
      expect(result.success).toBe(true);
    });

    it('toggle_bookmark should invoke toggle-bookmark action', async () => {
      const { invokeAction } = await import('@/lib/actions');
      const tool = getAllTools().find((t) => t.name === 'toggle_bookmark');
      
      const result = await tool!.execute({});
      expect(invokeAction).toHaveBeenCalledWith('toggle-bookmark');
      expect(result.success).toBe(true);
    });
  });

  describe('Tool Error Handling', () => {
    it('should return error result when action fails', async () => {
      const { invokeAction } = await import('@/lib/actions');
      vi.mocked(invokeAction).mockImplementationOnce(() => {
        throw new Error('Action failed');
      });

      const tool = getAllTools().find((t) => t.name === 'split_at_playhead');
      const result = await tool!.execute({});
      
      expect(result.success).toBe(false);
      expect(result.message).toContain('Action failed');
    });
  });
});
