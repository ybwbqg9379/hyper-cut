# Changelog

All notable changes to this project (forked from HyperCut) will be documented in this file.

## [Unreleased]

### Added

- **Agentic Video Editing**: AI-driven video editing via natural language commands
  - New `src/agent/` module with LLM orchestration layer
  - LM Studio provider (MVP) with Qwen3 VL 8B model support
  - 32 editing tools across 6 categories:
    - Timeline (7): split, split-at-time, delete, duplicate, select-all
    - Playback (7): play/pause, seek, jump, undo/redo
    - Query (4): timeline info, current time, selected elements, duration
    - Media (5): copy, paste, mute, visibility, snapping
    - Scene (7): bookmark, create/switch/list/rename scene, frame stepping
    - Asset (2): list assets, add asset to timeline
  - `AgentChatbox` UI component with provider status indicator
  - Feature-flagged integration via `NEXT_PUBLIC_AGENT_ENABLED`
  - Upstream-safe wrapper pattern (`editor-layout-with-agent.tsx`)
  - Integration tests with Vitest (31 test cases)
  - Vitest configuration (`vitest.config.ts`) with jsdom environment
- **Agent tools扩展（Phase 1）**：新增播放、轨道、选择与导出能力
  - Playback：`seek_to_time`、`set_volume`、`toggle_playback_mute`
  - Timeline：`select_element`、`clear_selection`、`add_track`、`remove_track`、`toggle_track_mute`、`toggle_track_visibility`
  - Project：`export_video`（支持格式/质量/音频参数并触发下载）
- **Agent tools扩展（Phase 2）**：新增转录、文本与时间线编辑能力
  - Transcription：`generate_captions`（支持模型/语言/字幕分块参数）
  - Text：`update_text_style`
  - Timeline：`move_element`、`trim_element`、`resize_element`
  - Project：`update_project_settings`（fps/canvas/background）
- **Agent tools扩展（Phase 3）**：新增变换、静音删除与插入文字能力
  - Transform：`update_element_transform`（scale/position/rotate/opacity）
  - Audio cleanup：`remove_silence`（阈值/最小时长/窗口参数）
  - Text：`insert_text`
- **Agent tools扩展（Upstream补齐）**：新增播放/场景/资产/项目与批量移动能力
  - Playback：`jump_forward`、`jump_backward`、`stop_playback`
  - Scene：`delete_scene`
  - Asset：`add_media_asset`、`remove_asset`
  - Project：`get_project_info`、`save_project`
  - Timeline：`move_elements`
  - Clipboard：`paste_at_time`

### Changed

- **Agent LM Studio configuration**: Full inference parameter support
  - Configurable via `LMStudioConfig` interface or environment variables
  - Supported parameters: `maxTokens`, `temperature`, `topP`, `topK`, `repeatPenalty`, `stop`
  - Increased default timeouts: LLM request 15s → 120s, tool execution 30s → 60s
  - Environment variables:
    - `NEXT_PUBLIC_LM_STUDIO_TIMEOUT_MS` - Request timeout
    - `NEXT_PUBLIC_LM_STUDIO_MAX_TOKENS` - Max generation tokens (default: 4096)
    - `NEXT_PUBLIC_LM_STUDIO_TEMPERATURE` - Sampling temperature (default: 0.7)
    - `NEXT_PUBLIC_LM_STUDIO_TOP_P` - Nucleus sampling (default: 0.9)
    - `NEXT_PUBLIC_LM_STUDIO_TOP_K` - Top-K sampling (default: 40)
    - `NEXT_PUBLIC_LM_STUDIO_REPEAT_PENALTY` - Repetition penalty (default: 1.1)

### Fixed

- **Timeline hydration error**: Fixed nested `<button>` elements causing React hydration mismatch
  - Changed outer `<button>` in `TimelineTrackContent` to `<div>` with proper ARIA attributes
  - Added `role="button"`, `tabIndex={0}`, and keyboard event handlers for accessibility
- **Agent code quality**: Fixed lint errors and improved test coverage
  - Resolved TypeScript type errors in fetch mocks
  - Eliminated non-null assertions in tests via `getToolByName()` helper
  - Added trackId parameter tests for `add_asset_to_timeline`
  - Cleaned up unused imports and private class members
- **React version mismatch**: Upgraded `react` from 19.2.0 to 19.2.4 to match `react-dom` version
- **Agent reliability**: Added tool argument parsing safeguards, request timeout, and conversation history limits
- **Agent assets**: Added download timeout/size limits for `add_media_asset` and clarified CORS/network failures
- **Agent tests**: Force-mocked `fetch` to prevent real network calls, added failure-path coverage for asset ingestion
- **Agent actions**: Fail fast when action handlers are unavailable to avoid false success
- **Agent orchestration**: Added multi-step tool-call loop with prompt overrides and safer tool execution handling
- **Agent orchestration**: Treat tool failures as unsuccessful responses and avoid mixed content/tool-call history
- **Agent tooling**: Added tool execution timeout guardrail
- **Clipboard tooling**: Routed `paste_at_time` through action system to avoid direct store coupling
- **Env examples**: Documented Agent-related environment variables
- **Gemini provider**: Marked unavailable until implementation is complete

### Changed

- **Re-branding**: OpenCut → HyperCut
  - Replaced all `OpenCut` / `opencut` text references with `HyperCut` / `hypercut`
  - Renamed package namespace `@opencut/*` → `@hypercut/*`
  - Renamed logo directory `logos/opencut/` → `logos/hypercut/`
  - Updated site URL to `https://hypercut.app`

### Removed

- **Blog feature**: Removed Marble CMS integration and all blog-related code
  - Deleted `apps/web/src/app/blog/`
  - Deleted `apps/web/src/lib/blog/`
  - Deleted `apps/web/src/types/blog.ts`
  - Removed `MARBLE_WORKSPACE_KEY` and `NEXT_PUBLIC_MARBLE_API_URL` from env schema
- **Contributors page**: Removed GitHub contributors showcase
  - Deleted `apps/web/src/app/contributors/`
- **RSS feed**: Removed blog RSS feed
  - Deleted `apps/web/src/app/rss.xml/`
- **Sponsors page**: Removed sponsors showcase
  - Deleted `apps/web/src/app/sponsors/`
- **Roadmap page**: Removed OpenCut roadmap
  - Deleted `apps/web/src/app/roadmap/`
- **Legal pages**: Removed (will add custom versions later)
  - Deleted `apps/web/src/app/privacy/`
  - Deleted `apps/web/src/app/terms/`
- **UI cleanup**:
  - Changed homepage headline from "The open source" to "HyperCut"
  - Removed GitHub 40k+ star counter button from header
  - Simplified footer to only show logo + copyright
  - Removed all navigation links (Blog, Contributors, Sponsors, Roadmap, etc.)
