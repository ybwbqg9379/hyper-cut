# Agent Dry-run + Diff（Phase 4）

日期：2026-02-09  
状态：已完成

## 目标

为关键改动型工具提供统一 `dryRun` 协议与可序列化 diff 结构，先给出变更预览，再执行实际写入，提升可解释性与可控性。

## 交付内容

1. 统一 diff schema  
文件：`apps/web/src/agent/tools/timeline-edit-ops.ts`
- 新增 `TimelineOperationDiff` 结构：
  - `affectedElements`（added / removed / moved）
  - `duration`（before / after / delta）
  - `keepRanges` / `deleteRanges`
- 新增 `buildTimelineOperationDiff` 生成函数

2. 工具层 dry-run 接入  
文件：
- `apps/web/src/agent/tools/timeline-tools-core.ts`（`remove_silence`）
- `apps/web/src/agent/tools/filler-tools.ts`（`remove_filler_words`）
- `apps/web/src/agent/tools/highlight-tools-core.ts`（`apply_highlight_cut`）

变更：
- 新增 `dryRun?: boolean` 参数
- dryRun 返回预估 diff，不落盘
- real-run 返回实际 diff 并执行 mutation

3. UI 状态与展示接入  
文件：
- `apps/web/src/stores/agent-ui-store.ts`
- `apps/web/src/components/agent/AgentChatbox.tsx`

变更：
- store 新增 `operationDiffPreview` 状态
- `AgentChatbox` 解析 tool result 中的 `diff`，回填 store
- 在 tool result 列表显示精简 diff 摘要（时长变化/删除数/移动数）

## 测试

新增：
- `apps/web/src/agent/__tests__/timeline-diff.test.ts`

增强：
- `apps/web/src/agent/__tests__/integration-registry-timeline.ts`

验证点：
- diff schema 计算与序列化
- `remove_silence` dryRun 与 real-run 都返回 diff
- dryRun 不触发真实 `replaceTracks` 写入
