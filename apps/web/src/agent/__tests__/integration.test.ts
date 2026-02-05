/**
 * Agent Integration Tests
 * Tests for agent → action flow to ensure tools correctly invoke HyperCut actions
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getAllTools, getToolsSummary } from '../tools';

// Mock invokeAction to track calls without side effects
vi.mock('@/lib/actions', () => ({
  invokeAction: vi.fn(),
  hasActionHandlers: vi.fn(() => true),
}));

// Mock element builder functions
vi.mock('@/lib/timeline/element-utils', () => ({
  buildVideoElement: vi.fn(() => ({ type: 'video', id: 'mock-element' })),
  buildImageElement: vi.fn(() => ({ type: 'image', id: 'mock-element' })),
  buildUploadAudioElement: vi.fn(() => ({ type: 'audio', id: 'mock-element' })),
  getElementsAtTime: vi.fn(() => [{ trackId: 'track1', elementId: 'el1' }]),
}));

// Mock constants
vi.mock('@/constants/timeline-constants', () => ({
  TIMELINE_CONSTANTS: { DEFAULT_ELEMENT_DURATION: 5 },
}));

// Mock EditorCore for query, scene, and asset tools
vi.mock('@/core', () => {
  const mockEditor = {
    timeline: {
      getTracks: vi.fn(() => [
        { id: 'track1', type: 'video', elements: [{ id: 'el1' }, { id: 'el2' }] },
        { id: 'track2', type: 'audio', elements: [{ id: 'el3' }] },
      ]),
      // Returns seconds (timeline uses seconds for all time values)
      getTotalDuration: vi.fn(() => 120),
      insertElement: vi.fn(),
      splitElements: vi.fn(),
      getTrackById: vi.fn(({ trackId }: { trackId: string }) => {
        if (trackId === 'track1') return { id: 'track1', type: 'video' };
        if (trackId === 'track2') return { id: 'track2', type: 'audio' };
        return null;
      }),
    },
    playback: {
      getCurrentTime: vi.fn(() => 5),  // Returns seconds, not milliseconds
      seek: vi.fn(),
    },
    selection: {
      getSelectedElements: vi.fn(() => [{ trackId: 'track1', elementId: 'el1' }]),
    },
    media: {
      getAssets: vi.fn(() => [
        { id: 'asset1', name: 'Test Video', type: 'video', duration: 60, ephemeral: false },
        { id: 'asset2', name: 'Test Image', type: 'image', duration: 5, ephemeral: false },
        { id: 'asset3', name: 'Temp Clip', type: 'video', duration: 10, ephemeral: true },
      ]),
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
  };

  return {
    EditorCore: {
      getInstance: vi.fn(() => mockEditor),
    },
  };
});

/**
 * Helper to get a tool by name and throw if not found
 */
function getToolByName(name: string) {
  const tool = getAllTools().find((t) => t.name === name);
  if (!tool) {
    throw new Error(`Tool "${name}" not found`);
  }
  return tool;
}

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
      expect(tools.length).toBeGreaterThanOrEqual(32);
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
          expect.objectContaining({ category: 'Asset' }),
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
      const tool = getToolByName('split_at_playhead');

      const result = await tool.execute({});
      expect(invokeAction).toHaveBeenCalledWith('split', undefined);
      expect(result.success).toBe(true);
    });

    it('delete_selected should invoke delete-selected action', async () => {
      const { invokeAction } = await import('@/lib/actions');
      const tool = getToolByName('delete_selected');

      const result = await tool.execute({});
      expect(invokeAction).toHaveBeenCalledWith('delete-selected', undefined);
      expect(result.success).toBe(true);
    });
  });

  describe('Playback Tools', () => {
    it('toggle_play should invoke toggle-play action', async () => {
      const { invokeAction } = await import('@/lib/actions');
      const tool = getToolByName('toggle_play');

      const result = await tool.execute({});
      expect(invokeAction).toHaveBeenCalledWith('toggle-play', undefined);
      expect(result.success).toBe(true);
    });

    it('seek_forward should invoke seek-forward action with seconds', async () => {
      const { invokeAction } = await import('@/lib/actions');
      const tool = getToolByName('seek_forward');

      const result = await tool.execute({ seconds: 5 });
      expect(invokeAction).toHaveBeenCalledWith('seek-forward', { seconds: 5 });
      expect(result.success).toBe(true);
    });

    it('undo should invoke undo action', async () => {
      const { invokeAction } = await import('@/lib/actions');
      const tool = getToolByName('undo');

      const result = await tool.execute({});
      expect(invokeAction).toHaveBeenCalledWith('undo', undefined);
      expect(result.success).toBe(true);
    });
  });

  describe('Query Tools', () => {
    it('get_timeline_info should return track and element counts', async () => {
      const tool = getToolByName('get_timeline_info');

      const result = await tool.execute({});
      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({
        trackCount: 2,
        totalElements: 3,
      });
    });

    it('get_current_time should return playhead position', async () => {
      const tool = getToolByName('get_current_time');

      const result = await tool.execute({});
      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({
        currentTimeSeconds: 5,
      });
    });
  });

  describe('Media Tools', () => {
    it('copy_selected should invoke copy-selected action', async () => {
      const { invokeAction } = await import('@/lib/actions');
      const tool = getToolByName('copy_selected');

      const result = await tool.execute({});
      expect(invokeAction).toHaveBeenCalledWith('copy-selected', undefined);
      expect(result.success).toBe(true);
    });

    it('paste_copied should invoke paste-copied action', async () => {
      const { invokeAction } = await import('@/lib/actions');
      const tool = getToolByName('paste_copied');

      const result = await tool.execute({});
      expect(invokeAction).toHaveBeenCalledWith('paste-copied', undefined);
      expect(result.success).toBe(true);
    });

    it('toggle_mute_selected should invoke toggle-elements-muted-selected action', async () => {
      const { invokeAction } = await import('@/lib/actions');
      const tool = getToolByName('toggle_mute_selected');

      const result = await tool.execute({});
      expect(invokeAction).toHaveBeenCalledWith('toggle-elements-muted-selected', undefined);
      expect(result.success).toBe(true);
    });
  });

  describe('Scene Tools', () => {
    it('list_scenes should return all scenes', async () => {
      const tool = getToolByName('list_scenes');

      const result = await tool.execute({});
      expect(result.success).toBe(true);
      expect(Array.isArray(result.data)).toBe(true);
      expect((result.data as unknown[]).length).toBe(2);
    });

    it('create_scene should create a new scene', async () => {
      const tool = getToolByName('create_scene');

      const result = await tool.execute({ name: 'Test Scene' });
      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({
        sceneId: 'new-scene-id',
        name: 'Test Scene',
      });
    });

    it('switch_scene should switch to named scene', async () => {
      const tool = getToolByName('switch_scene');

      const result = await tool.execute({ name: 'Scene 2' });
      expect(result.success).toBe(true);
    });

    it('toggle_bookmark should invoke toggle-bookmark action', async () => {
      const { invokeAction } = await import('@/lib/actions');
      const tool = getToolByName('toggle_bookmark');

      const result = await tool.execute({});
      expect(invokeAction).toHaveBeenCalledWith('toggle-bookmark', undefined);
      expect(result.success).toBe(true);
    });
  });

  describe('Tool Error Handling', () => {
    it('should return error result when action fails', async () => {
      // Import and manually mock for this test
      const actions = await import('@/lib/actions');
      (actions.invokeAction as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
        throw new Error('Action failed');
      });

      const tool = getToolByName('split_at_playhead');
      const result = await tool.execute({});

      expect(result.success).toBe(false);
      expect(result.message).toContain('Action failed');
    });
  });

  describe('Asset Tools', () => {
    it('list_assets should return all assets', async () => {
      const tool = getToolByName('list_assets');

      const result = await tool.execute({});
      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({
        count: 2,
      });
      expect((result.data as { assets: unknown[] }).assets).toHaveLength(2);
    });

    it('add_asset_to_timeline should insert element into timeline', async () => {
      const tool = getToolByName('add_asset_to_timeline');
      const { EditorCore } = await import('@/core');
      const editor = EditorCore.getInstance() as unknown as {
        timeline: { insertElement: ReturnType<typeof vi.fn> };
      };

      const result = await tool.execute({ assetId: 'asset1' });
      expect(result.success).toBe(true);
      // Verify result contains correct data (indicates successful processing)
      expect(result.data).toMatchObject({
        assetId: 'asset1',
        assetName: 'Test Video',
        assetType: 'video',
      });
      expect(editor.timeline.insertElement).toHaveBeenCalledWith(
        expect.objectContaining({
          element: expect.objectContaining({ type: 'video' }),
          placement: { mode: 'auto' },
        })
      );
    });

    it('add_asset_to_timeline should fail for non-existent asset', async () => {
      const tool = getToolByName('add_asset_to_timeline');

      const result = await tool.execute({ assetId: 'non-existent' });
      expect(result.success).toBe(false);
      expect(result.message).toContain('non-existent');
    });

    it('add_asset_to_timeline should fail for ephemeral asset', async () => {
      const tool = getToolByName('add_asset_to_timeline');

      const result = await tool.execute({ assetId: 'asset3' });
      expect(result.success).toBe(false);
      expect(result.message).toContain('临时');
    });

    it('add_asset_to_timeline should fail for invalid start time', async () => {
      const tool = getToolByName('add_asset_to_timeline');

      const result = await tool.execute({ assetId: 'asset1', startTime: -1 });
      expect(result.success).toBe(false);
      expect(result.message).toContain('无效');
    });

    it('add_asset_to_timeline should use explicit placement with trackId', async () => {
      const tool = getToolByName('add_asset_to_timeline');
      const { EditorCore } = await import('@/core');
      const editor = EditorCore.getInstance() as unknown as {
        timeline: { insertElement: ReturnType<typeof vi.fn> };
      };

      const result = await tool.execute({ assetId: 'asset1', trackId: 'track1' });
      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({
        placementMode: 'explicit',
        trackId: 'track1',
      });
      expect(editor.timeline.insertElement).toHaveBeenCalledWith(
        expect.objectContaining({
          placement: { mode: 'explicit', trackId: 'track1' },
        })
      );
    });

    it('add_asset_to_timeline should fail for non-existent track', async () => {
      const tool = getToolByName('add_asset_to_timeline');

      const result = await tool.execute({ assetId: 'asset1', trackId: 'non-existent' });
      expect(result.success).toBe(false);
      expect(result.message).toContain('Track not found');
    });

    it('add_asset_to_timeline should fail for incompatible track type', async () => {
      const tool = getToolByName('add_asset_to_timeline');

      // asset1 is video type, track2 is audio type - incompatible
      const result = await tool.execute({ assetId: 'asset1', trackId: 'track2' });
      expect(result.success).toBe(false);
      expect(result.message).toContain('Incompatible track type');
    });
  });

  describe('Split at Time', () => {
    it('split_at_time should seek and split', async () => {
      const tool = getToolByName('split_at_time');
      const { EditorCore } = await import('@/core');
      const editor = EditorCore.getInstance() as unknown as {
        playback: { seek: ReturnType<typeof vi.fn> };
        timeline: { splitElements: ReturnType<typeof vi.fn> };
      };

      const result = await tool.execute({ time: 30 });
      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({ splitTime: 30 });
      expect(editor.playback.seek).toHaveBeenCalledWith({ time: 30 });
      expect(editor.timeline.splitElements).toHaveBeenCalledWith({
        elements: [{ trackId: 'track1', elementId: 'el1' }],
        splitTime: 30,
      });
    });

    it('split_at_time should fail for invalid time', async () => {
      const tool = getToolByName('split_at_time');

      const result = await tool.execute({ time: -5 });
      expect(result.success).toBe(false);
      expect(result.message).toContain('无效');
    });

    it('split_at_time should fail when time exceeds duration', async () => {
      const tool = getToolByName('split_at_time');

      const result = await tool.execute({ time: 200 }); // Duration is 120s
      expect(result.success).toBe(false);
      expect(result.message).toContain('超出');
    });

    it('split_at_time should support selectAll', async () => {
      const tool = getToolByName('split_at_time');
      const { EditorCore } = await import('@/core');
      const editor = EditorCore.getInstance() as unknown as {
        selection: { getSelectedElements: ReturnType<typeof vi.fn> };
        timeline: { splitElements: ReturnType<typeof vi.fn> };
      };

      editor.selection.getSelectedElements.mockReturnValueOnce([]);

      const result = await tool.execute({ time: 30, selectAll: true });
      expect(result.success).toBe(true);
      expect(editor.timeline.splitElements).toHaveBeenCalledWith({
        elements: [
          { trackId: 'track1', elementId: 'el1' },
          { trackId: 'track1', elementId: 'el2' },
          { trackId: 'track2', elementId: 'el3' },
        ],
        splitTime: 30,
      });
    });
  });
});
