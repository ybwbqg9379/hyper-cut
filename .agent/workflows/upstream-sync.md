---
description: how to sync with upstream OpenCut repository
---

# Upstream Sync Workflow

## Overview

HyperCut is forked from OpenCut. We want upstream bug fixes and features, but we've customized/removed certain parts.

## Before Syncing

1. Ensure working directory is clean

```bash
git status
```

> **WARNING**: If you have unstaged changes, commit or stash them **before** starting. Do NOT `git stash` during a merge-in-progress — it destroys the MERGE_HEAD state, and `stash pop` cannot restore it. You'll have to reset and redo the merge.

2. Fetch upstream

```bash
git fetch upstream
```

3. Check what's new

```bash
git log --oneline HEAD..upstream/main
git log --stat HEAD..upstream/main   # see which files each commit touches
```

4. Analyze conflict risk (identify files modified by both sides)

```bash
merge_base=$(git merge-base HEAD upstream/main)
# Files changed by upstream
git diff --name-only "$merge_base" upstream/main | sort > /tmp/upstream_files.txt
# Files changed by us
git diff --name-only "$merge_base" HEAD | sort > /tmp/our_files.txt
# Overlap = potential conflicts
comm -12 /tmp/upstream_files.txt /tmp/our_files.txt
```

If overlap files exist, inspect both sides' diffs to understand if changes are in the same region:

```bash
git diff "$merge_base" HEAD -- <file>           # our changes
git diff "$merge_base" upstream/main -- <file>   # their changes
```

## Sync Process

5. Create a sync branch (safer than direct merge)

```bash
git checkout -b sync-upstream-$(date +%Y%m%d)
```

6. Merge with no auto-commit for manual review

```bash
git merge upstream/main --no-commit --no-ff
```

7. **CRITICAL**: Remove restored files we intentionally deleted

```bash
# Blog and related
rm -rf apps/web/src/app/blog/
rm -rf apps/web/src/lib/blog/
rm -rf apps/web/src/types/blog.ts

# Contributors, sponsors, roadmap
rm -rf apps/web/src/app/contributors/
rm -rf apps/web/src/app/sponsors/
rm -rf apps/web/src/app/roadmap/

# RSS feed, sitemap
rm -rf apps/web/src/app/rss.xml/
rm -rf apps/web/src/app/sitemap.ts

# Legal (we'll add our own)
rm -rf apps/web/src/app/privacy/
rm -rf apps/web/src/app/terms/
```

8. Resolve any conflicts (common conflict files):
   - `package.json` - keep our deps (vitest, biome, agent deps)
   - `CHANGELOG.md` - merge both, keep our entries on top
   - `packages/env/src/web.ts` - accept theirs, we use placeholder env
   - `project-manager.ts` - keep our `discardPending()` additions, accept their refactors

9. Verify branding wasn't reverted

```bash
grep -rn "OpenCut" apps/web/src/ --include="*.tsx" --include="*.ts" | head -10
# If found, re-apply branding: sed -i '' 's/OpenCut/HyperCut/g' <files>
```

10. Test build

```bash
bun run build
```

11. Run tests

```bash
bun run test
```

> **If tests fail**: Check whether the failure is pre-existing by switching to main and running the same test. Only failures introduced by the merge need fixing before commit.
>
> ```bash
> # Stash merge state (only if merge is already committed or you're on a clean state)
> git stash
> git checkout main
> bun run test -- <failing-test-file>
> git checkout sync-upstream-$(date +%Y%m%d)
> git stash pop
> ```

12. Commit the merge

```bash
git add -A
git commit -m "chore: sync with upstream OpenCut $(git log upstream/main -1 --format=%h)"
```

13. Merge back to main

```bash
git checkout main
git merge sync-upstream-$(date +%Y%m%d)
git branch -d sync-upstream-$(date +%Y%m%d)
```

14. Verify sync is complete

```bash
git log --oneline HEAD..upstream/main
# Should produce no output
```

## Files We Always Delete After Sync

| Path                      | Reason                         |
| ------------------------- | ------------------------------ |
| `src/app/blog/**`         | Removed Marble CMS integration |
| `src/app/contributors/**` | Removed GitHub contributors    |
| `src/app/sponsors/**`     | Removed sponsors page          |
| `src/app/roadmap/**`      | Removed roadmap                |
| `src/app/rss.xml/**`      | Removed blog RSS               |
| `src/app/sitemap.ts`      | Removed sitemap                |
| `src/app/privacy/**`      | Will add our own               |
| `src/app/terms/**`        | Will add our own               |
| `src/lib/blog/**`         | Blog utilities                 |
| `src/types/blog.ts`       | Blog types                     |

## Our Decoupled Additions (should never conflict)

| Path                                                 | Description          |
| ---------------------------------------------------- | -------------------- |
| `src/agent/**`                                       | Agent module         |
| `src/components/agent/**`                            | Chatbox UI           |
| `src/components/editor/editor-layout-with-agent.tsx` | Agent wrapper        |
| `src/hooks/use-agent.ts`                             | Agent React hook     |
| `src/stores/agent-ui-store.ts`                       | Agent UI state       |
| `vitest.config.ts`                                   | Test config          |
| `.agent/workflows/`                                  | Workflow docs        |
| `docs/DEVELOPMENT_PITFALLS.md`                       | Dev pitfalls doc     |
| `CLAUDE.md`                                          | Claude Code guidance |

## Known Overlap Files (modified by both sides)

These files have been modified by us **and** may be modified by upstream. Auto-merge usually succeeds if changes are in different regions, but always verify:

| File | Our changes | Common upstream changes |
| ---- | ----------- | ---------------------- |
| `src/app/projects/page.tsx` | Branding: `@opencut/ui` → `@hypercut/ui` | UI tweaks, layout changes |
| `src/core/managers/project-manager.ts` | `discardPending()` in close/delete paths | Migration system refactors |

## Sync History

| Date | Upstream HEAD | Commits | Notes |
| ---- | ------------- | ------- | ----- |
| 2026-02-07 | `464a6e8` | 6 | Storage migration per-project refactor, v1→v2 fixes, checkbox style. 2 overlap files auto-merged cleanly. |
