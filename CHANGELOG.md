# Changelog

All notable changes to this project (forked from HyperCut) will be documented in this file.

## [Unreleased]

### Added

- **Agentic Video Editing**: AI-driven video editing via natural language commands
  - New `src/agent/` module with LLM orchestration layer
  - LM Studio provider (MVP) with Qwen3 VL 8B model support
  - 29 editing tools across 5 categories:
    - Timeline (6): split, delete, duplicate, select-all
    - Playback (7): play/pause, seek, jump, undo/redo
    - Query (4): timeline info, current time, selected elements, duration
    - Media (5): copy, paste, mute, visibility, snapping
    - Scene (7): bookmark, create/switch/list/rename scene, frame stepping
  - `AgentChatbox` UI component with provider status indicator
  - Feature-flagged integration via `NEXT_PUBLIC_AGENT_ENABLED`
  - Upstream-safe wrapper pattern (`editor-layout-with-agent.tsx`)
  - Integration tests with Vitest (19 test cases)
  - Vitest configuration (`vitest.config.ts`) with jsdom environment

### Fixed

- **React version mismatch**: Upgraded `react` from 19.2.0 to 19.2.4 to match `react-dom` version

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
