# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

HyperCut is a privacy-first, open-source video editor for web, desktop, and mobile. It's a monorepo built with Bun, Turbo, Next.js 16, React 19, TypeScript, and Zustand.

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
| `apps/web/src/core/index.ts` | EditorCore singleton |
| `apps/web/src/lib/actions/definitions.ts` | All action definitions |
| `apps/web/src/lib/commands/` | Undo/redo commands |
| `apps/web/src/stores/` | Zustand state stores |
| `.cursor/rules/codebase-index.mdc` | Exported functions/types index |
