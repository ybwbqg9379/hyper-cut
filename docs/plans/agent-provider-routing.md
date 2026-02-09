# Agent Provider Routing（Phase 8）

日期：2026-02-09  
状态：已完成

## 目标

实现按任务类型与隐私模式的多 Provider 路由，支持本地优先、云端优先和混合 fallback，提升稳定性并保持隐私可控。

## 交付内容

1. 新增 Provider Router  
文件：`apps/web/src/agent/providers/router.ts`
- 新增路由维度：
  - `taskType`: `planning` / `semantic` / `vision`
  - `privacyMode`: `local-only` / `hybrid` / `cloud-preferred`
- 新增能力：
  - `resolveProviderPrivacyMode`
  - `resolveProviderRoute`

2. Provider 工厂接入路由与 fallback  
文件：`apps/web/src/agent/providers/index.ts`
- 新增 `createRoutedProvider`
- 新增 `RoutedProvider`：
  - 按路由顺序选择 provider
  - 主 provider 不可用时自动 fallback
  - `local-only` 模式禁止 fallback 到云端

3. Agent 主链路接入  
文件：`apps/web/src/agent/orchestrator.ts`
- Orchestrator 默认 provider 从固定实例改为 `createRoutedProvider({ taskType: "planning" })`

4. 语义/视觉工具接入任务型路由  
文件：
- `apps/web/src/agent/tools/highlight-tools-core.ts`
- `apps/web/src/agent/tools/vision-tools-core.ts`
- `apps/web/src/agent/services/highlight-scorer.ts`

变更：
- 语义评分使用 `taskType: "semantic"` 路由 provider
- 视觉分析使用 `taskType: "vision"` 路由 provider
- `highlight-scorer` provider 类型从 `LMStudioProvider` 泛化为 `LLMProvider`

5. 配置与导出补齐  
文件：
- `apps/web/src/agent/types.ts`
- `apps/web/src/agent/index.ts`
- `apps/web/.env.example`

变更：
- 新增 `ProviderPrivacyMode` 和 `AgentConfig.providerPrivacyMode`
- 导出 provider 路由相关类型/方法
- `.env.example` 新增 `NEXT_PUBLIC_AGENT_PROVIDER_PRIVACY_MODE`

## 测试

新增：
- `apps/web/src/agent/providers/__tests__/router.test.ts`
  - 路由决策测试
  - 隐私模式默认行为测试
- `apps/web/src/agent/providers/__tests__/routed-provider.test.ts`
  - cloud-preferred fallback 测试
  - local-only 禁止 fallback 测试
