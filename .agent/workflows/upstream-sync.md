---
description: how to sync with upstream OpenCut repository
---

# Upstream Sync Workflow

## Overview

HyperCut is forked from OpenCut. We want upstream bug fixes and features, but we've customized/removed certain parts.

## Before Syncing

// turbo

1. Ensure working directory is clean

```bash
git status
```

2. Fetch upstream

```bash
git fetch upstream
```

3. Check what's new

```bash
git log --oneline HEAD..upstream/main
```

## Sync Process

4. Create a sync branch (safer than direct merge)

```bash
git checkout -b sync-upstream-$(date +%Y%m%d)
```

5. Merge with no auto-commit for manual review

```bash
git merge upstream/main --no-commit --no-ff
```

6. **CRITICAL**: Remove restored files we intentionally deleted

```bash
# Blog and related
rm -rf apps/web/src/app/blog/
rm -rf apps/web/src/lib/blog/
rm -rf apps/web/src/types/blog.ts

# Contributors, sponsors, roadmap
rm -rf apps/web/src/app/contributors/
rm -rf apps/web/src/app/sponsors/
rm -rf apps/web/src/app/roadmap/

# RSS feed
rm -rf apps/web/src/app/rss.xml/

# Legal (we'll add our own)
rm -rf apps/web/src/app/privacy/
rm -rf apps/web/src/app/terms/
```

7. Resolve any conflicts (common conflict files):
   - `package.json` - keep our deps (vitest, biome, agent deps)
   - `CHANGELOG.md` - merge both, keep our entries on top
   - `packages/env/src/web.ts` - accept theirs, we use placeholder env

8. Verify branding wasn't reverted

```bash
grep -r "OpenCut" apps/web/src/ --include="*.tsx" --include="*.ts" | head -10
# If found, re-apply branding: sed -i '' 's/OpenCut/HyperCut/g' <files>
```

9. Test build

```bash
cd apps/web && bun run build
```

10. Run tests

```bash
bun run test
```

11. Commit the merge

```bash
git add -A
git commit -m "chore: sync with upstream OpenCut $(git log upstream/main -1 --format=%h)"
```

12. Merge back to main

```bash
git checkout main
git merge sync-upstream-$(date +%Y%m%d)
git branch -d sync-upstream-$(date +%Y%m%d)
```

## Files We Always Delete After Sync

| Path                      | Reason                         |
| ------------------------- | ------------------------------ |
| `src/app/blog/**`         | Removed Marble CMS integration |
| `src/app/contributors/**` | Removed GitHub contributors    |
| `src/app/sponsors/**`     | Removed sponsors page          |
| `src/app/roadmap/**`      | Removed roadmap                |
| `src/app/rss.xml/**`      | Removed blog RSS               |
| `src/app/privacy/**`      | Will add our own               |
| `src/app/terms/**`        | Will add our own               |
| `src/lib/blog/**`         | Blog utilities                 |
| `src/types/blog.ts`       | Blog types                     |

## Our Decoupled Additions (should never conflict)

| Path                                                 | Description      |
| ---------------------------------------------------- | ---------------- |
| `src/agent/**`                                       | Agent module     |
| `src/components/agent/**`                            | Chatbox UI       |
| `src/components/editor/editor-layout-with-agent.tsx` | Agent wrapper    |
| `src/hooks/use-agent.ts`                             | Agent React hook |
| `vitest.config.ts`                                   | Test config      |
| `.agent/workflows/`                                  | Workflow docs    |
