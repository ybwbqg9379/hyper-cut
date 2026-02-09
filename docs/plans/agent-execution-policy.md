# Agent Execution Policy（Phase 2）

日期：2026-02-09  
状态：已完成

## 目标

将 Agent 工具执行策略统一为 Action-first，并为改动型/破坏型操作增加可撤销保障，避免“执行成功但未进入 undo/redo 链路”。

## 交付内容

1. 新增统一策略层  
文件：`apps/web/src/agent/tools/execution-policy.ts`
- `executeActionFirst`：优先走 action
- action 不可用时，默认仅允许内部上下文 fallback（用户态默认禁止）
- `executeMutationWithUndoGuard`：对 destructive 操作检查 undo checkpoint

2. action 调用统一入口  
文件：`apps/web/src/agent/tools/action-utils.ts`
- `invokeActionWithCheck` 迁移到 execution-policy
- 新增 `invokeDestructiveActionWithCheck`

3. 关键破坏型工具接入 undo guard  
文件：
- `apps/web/src/agent/tools/timeline-tools-core.ts`
- `apps/web/src/agent/tools/scene-tools.ts`
- `apps/web/src/agent/tools/asset-tools-core.ts`
- `apps/web/src/agent/tools/filler-tools.ts`
- `apps/web/src/agent/tools/highlight-tools-core.ts`

覆盖场景：
- `delete_selected` / `split_left` / `split_right`（destructive action）
- `remove_track` / `delete_element_by_id` / `remove_silence`
- `delete_scene` / `remove_asset`
- `remove_filler_words` / `apply_highlight_cut`

4. remove_asset 改为 command-safe
- `remove_asset` 由直接 `media.removeMediaAsset` 改为 `RemoveMediaAssetCommand` 进入命令历史链路

## 测试

新增：
- `apps/web/src/agent/__tests__/execution-policy.test.ts`

更新：
- `apps/web/src/agent/__tests__/integration-registry-timeline.ts`
- `apps/web/src/agent/__tests__/integration-asset-project-split.ts`

验证点：
- action 不可用时用户态失败路径
- internal fallback 路径
- destructive 操作 undo checkpoint 一致性
- remove_asset 进入 command 执行链路
