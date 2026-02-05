# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## IMPORTANT: Read Before Development

**Before starting any feature development, you MUST read:**

- [`docs/DEVELOPMENT_PITFALLS.md`](docs/DEVELOPMENT_PITFALLS.md) - Common pitfalls and solutions

**After encountering and fixing a new issue, you MUST update:**

- Add the pitfall and solution to `docs/DEVELOPMENT_PITFALLS.md`

This prevents repeating the same mistakes and builds institutional knowledge.

## Project Overview

HyperCut is a privacy-first, open-source video editor for web, desktop, and mobile. It's a monorepo built with Bun, Turbo, Next.js 16, React 19, TypeScript, and Zustand.

## Fork 管理规范

HyperCut fork 自 [OpenCut](https://github.com/OpenCut-app/OpenCut)，需要持续同步上游更新。

### 核心原则

1. **不修改 upstream 核心代码** - 除非绝对必要，禁止直接修改上游文件
2. **最小侵入集成** - 必须集成时，用 wrapper/decorator 模式，单点注入
3. **UI/CSS 与 upstream 一致** - 复用上游组件和样式，不引入新设计系统

### 新功能开发流程

```
✅ 正确做法：
src/agent/           # 独立目录，完全解耦
src/components/agent/ # 独立组件
src/hooks/use-agent.ts # 独立 hook

❌ 错误做法：
直接修改 src/core/index.ts
在 upstream 组件中添加条件分支
```

### 集成模式（参考 Agent 实现）

```typescript
// 1. 创建 wrapper 组件
export function EditorLayoutWithAgent() {
  if (!FEATURE_ENABLED) return <OriginalLayout />;
  return <LayoutWithFeature />;
}

// 2. 单点注入（page.tsx 仅改 1 行 import）
import { EditorLayoutWithAgent } from "@/components/editor/editor-layout-with-agent";
```

### 我们的解耦目录

| 路径 | 用途 |
|------|------|
| `src/agent/` | AI Agent 核心模块 |
| `src/components/agent/` | Agent UI 组件 |
| `.agent/workflows/` | 工作流文档 |

### 同步 upstream

详见 `.agent/workflows/upstream-sync.md`

## Commands

```bash
# Development (from root)
bun run dev:web              # Start Next.js dev server with Turbopack

# Build
bun run build:web            # Production build

# Linting & Formatting (Biome - tabs, 80-char, double quotes)
bun run lint:web             # Check for issues
bun run lint:web:fix         # Auto-fix issues

# Tests (from apps/web)
cd apps/web
bun run test                 # Run all tests (Vitest)
bun run test:watch           # Watch mode
bun run test:coverage        # With coverage

# Database (from apps/web)
bun run db:migrate           # Run migrations
bun run db:generate          # Generate migrations
```

## Architecture

### EditorCore (Singleton)

The editor uses a singleton pattern with specialized managers:

```
EditorCore
├── playback: PlaybackManager   - Play/pause/seek
├── timeline: TimelineManager   - Tracks and elements
├── scenes: ScenesManager       - Multi-scene support
├── project: ProjectManager     - Project metadata
├── media: MediaManager         - Media assets
├── renderer: RendererManager   - Canvas rendering
├── command: CommandManager     - Undo/redo
├── save: SaveManager           - IndexedDB persistence
├── audio: AudioManager         - Audio handling
└── selection: SelectionManager - Selection state
```

**In React:** Always use `useEditor()` hook - it subscribes to changes automatically.

**Outside React:** Use `EditorCore.getInstance()` directly.

### Actions System

Single source of truth: `@/lib/actions/definitions.ts`

To add a new action:
1. Add to `ACTIONS` in `definitions.ts`
2. Add handler in `@/hooks/actions/use-editor-actions.ts` using `useActionHandler()`
3. Invoke via `invokeAction("action-name")` in components

Use `invokeAction()` for user-triggered operations (provides toasts, validation feedback). Direct `editor.xxx()` calls are for internal use only.

### Commands System (Undo/Redo)

Commands live in `@/lib/commands/` organized by domain. Each extends `Command` with `execute()` and `undo()`.

Flow: Action → Command → EditorCore Manager → State change

### Directory Conventions

- `lib/` - Domain-specific logic (editor features)
- `utils/` - Generic helpers (reusable across projects)
- `stores/` - Zustand stores for persistent UI state
- `services/` - Storage, rendering, transcription services

### Agent Module (Feature-Flagged)

AI-driven video editing at `@/agent/`. Enabled via `NEXT_PUBLIC_AGENT_ENABLED=true`.

## Code Style

- **Comments:** Explain WHY, not WHAT. Only add when behavior is non-obvious.
- **Separation:** One file, one responsibility. Extract at 500+ lines.
- **TypeScript:** No `any`, no enums, use `as const`, strict null checks.
- **Avoid:** Preview panel enhancements - binary rendering refactor in progress.

## Key Files

| File | Purpose |
|------|---------|
| `docs/DEVELOPMENT_PITFALLS.md` | **Must read** - Common pitfalls & solutions |
| `apps/web/src/core/index.ts` | EditorCore singleton |
| `apps/web/src/lib/actions/definitions.ts` | All action definitions |
| `apps/web/src/lib/commands/` | Undo/redo commands |
| `apps/web/src/stores/` | Zustand state stores |
| `.cursor/rules/codebase-index.mdc` | Exported functions/types index |
