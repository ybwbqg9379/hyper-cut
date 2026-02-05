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
- **Agent Planning（Phase 1）**：新增“先计划后执行”的确认式工作流
  - Orchestrator 支持规划模式：先返回工具步骤计划，再由用户确认后执行
  - 支持步骤级编辑/移除：可修改单步参数并重排执行意图
  - Agent 聊天面板新增计划卡片：步骤参数 JSON 编辑、确认执行、取消计划
- **Agent Query 工具增强（Phase 1）**：新增 4 个只读分析工具
  - `get_element_details`
  - `get_elements_in_range`
  - `get_track_details`
  - `get_timeline_summary`
- **转录面板（Phase 2 - MVP）**：新增转录文本与时间线联动视图
  - Agent 面板新增“聊天 / 转录”双视图切换
  - 点击转录段落可跳转到对应时间并联动选中元素
  - 支持文本范围选择并联动多元素选中
  - 支持从转录面板直接删除对应字幕片段
  - 支持逐条编辑字幕文本并一键同步写回时间线元素
  - 转录面板优先使用字幕 metadata 识别 caption（兼容旧 `Caption *` 命名）
  - 新增可选“词级视图”：展示 word-level token，hover 显示时间戳，点击词可跳转并联动对应字幕段
- **工作流引擎（Phase 2）**：新增可复用工作流与 `run_workflow` 执行工具
  - 新增 `list_workflows` / `run_workflow` 两个 Agent 工具
  - 新增预置工作流：`auto-caption-cleanup`、`selection-caption-cleanup`
  - 支持 `stepOverrides` 覆盖指定工作流步骤参数
  - Planning 模式下会将 `run_workflow` 自动展开为逐步计划，确认前可逐步审阅/编辑
  - Agent 面板新增“工作流”视图：选择工作流、编辑 `stepOverrides`、一键发送执行
  - `stepOverrides` 编辑升级为按步骤可视化参数表单，减少手写 JSON 出错
  - 工作流参数编辑新增“恢复本步骤默认 / 恢复全部默认参数”按钮
- **Agent 视觉理解（L3）**：新增浏览器端视频视觉分析链路（无 Python sidecar）
  - Provider：`Message.content` 扩展为多模态 `ContentPart[]`，`lm-studio-provider` 支持 OpenAI 兼容 `image_url` 内容块
  - 新增工具：`detect_scenes`、`analyze_frames`、`suggest_edits`
  - 新增服务：`frame-extractor`（VideoCache 帧采样 + JPEG/base64 编码）与 `scene-detector`（Canvas 像素差分）
  - 转录链路升级为 `segments + words`：Whisper worker 优先请求 `return_timestamps: "word"`，失败回退到 segment 模式
  - `analyze_frames` / `suggest_edits` 已接入 word-level 上下文窗口，优先使用词级时间戳拼接转录文本
  - 支持场景检测结果缓存与帧分析缓存，`analyze_frames` 可复用 `detect_scenes` 的关键帧
  - `run_workflow` 执行映射已接入 Vision 工具类别
- **Agent 资产与贴纸能力补齐（Upstream 对齐）**
  - 新增 `search_sticker`：仅搜索 Iconify 贴纸候选，不直接插入
  - 新增 `add_sticker`：支持 Iconify 搜索并将贴纸插入时间线
  - 新增 `search_sound_effect`：仅搜索 Freesound 音效候选，不直接插入
  - 新增 `add_sound_effect`：支持 `soundId` 直加或按搜索结果添加到时间线
  - 新增 `update_sticker_color`：支持更新贴纸 `color`
  - 扩展 `UpdateElementTransformCommand`：支持 sticker 颜色更新并保留 undo/redo 链路
- **Long-to-Short 工作流（MVP）**：新增长视频转短视频精华链路
  - 新增工具：`score_highlights`、`validate_highlights_visual`、`generate_highlight_plan`、`apply_highlight_cut`
  - 新增服务：`transcript-analyzer`（语义分段 + 规则评分）、`highlight-scorer`（语义/视觉综合评分）、`segment-selector`（时长约束选段）
  - 新增工作流：`long-to-short`（评分 → 视觉验证 → 计划生成 → 应用剪辑）
  - 新增测试：`transcript-analyzer` / `highlight-scorer` / `segment-selector` / `highlight-tools`

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
- **Agent planning robustness**: Added execution lock, cancellation history symmetry, and required-parameter validation for editable plan steps
- **Agent planning UI safety**: Disabled destructive controls during execution and added JSON payload size guard for step editing
- **Agent tooling**: Added tool execution timeout guardrail
- **Clipboard tooling**: Routed `paste_at_time` through action system to avoid direct store coupling
- **Env examples**: Documented Agent-related environment variables
- **Gemini provider**: Marked unavailable until implementation is complete
- **Caption metadata stability**: `generate_captions` 与资产面板字幕生成均写入结构化 metadata，不再依赖名称前缀作为唯一判定
- **自动保存稳定性**: 关闭/删除项目后若延迟保存触发，不再因无 active project 抛出运行时错误

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
