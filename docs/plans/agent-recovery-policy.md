# Agent Recovery Policy（Phase 5）

日期：2026-02-09  
状态：已完成

## 目标

为常见可恢复错误引入统一恢复策略：失败后自动补救、受控重试、可观测轨迹，避免用户手动重复操作。

## 交付内容

1. 新增恢复策略模块  
文件：`apps/web/src/agent/recovery/policies.ts`
- 新增 `resolveRecoveryPolicyDecision`：按 `errorCode + toolName + retryCount` 决策恢复动作
- 新增 `extractToolErrorCode`：统一解析工具失败错误码
- 内置策略：
  - `NO_TRANSCRIPT` → `generate_captions(source=timeline)` 后重试
  - `PROVIDER_UNAVAILABLE` → 指数退避重试（上限 2 次）
  - `HIGHLIGHT_CACHE_STALE/MISSING` → 先 `score_highlights` 再重试
  - `HIGHLIGHT_PLAN_STALE/MISSING` → 先 `score_highlights + generate_highlight_plan` 再重试 `apply_highlight_cut`

2. Orchestrator 接入失败自恢复  
文件：`apps/web/src/agent/orchestrator.ts`
- 新增 `executeToolCallWithRecovery`
- 在 DAG 执行链路替换为恢复感知执行
- 支持：
  - 最大重试次数约束（无无限重试）
  - 指数退避等待（可中断）
  - 前置恢复步骤执行与失败短路

3. 可观测恢复事件与 UI 展示  
文件：
- `apps/web/src/agent/types.ts`
- `apps/web/src/hooks/use-agent.ts`
- `apps/web/src/components/agent/AgentChatbox.tsx`

新增事件：
- `recovery_started`
- `recovery_prerequisite_started`
- `recovery_prerequisite_completed`
- `recovery_retrying`
- `recovery_exhausted`

效果：
- 用户可在执行轨迹中看到“失败 -> 自动恢复 -> 重试 -> 最终结果”完整链路

## 测试

新增：
- `apps/web/src/agent/__tests__/recovery-policies.test.ts`
  - 策略匹配测试
  - 重试上限测试
  - 错误码解析测试

增强：
- `apps/web/src/agent/__tests__/orchestrator.test.ts`
  - 恢复成功集成测试（NO_TRANSCRIPT）
  - 恢复耗尽测试（PROVIDER_UNAVAILABLE）
  - 恢复失败测试（前置步骤失败）
