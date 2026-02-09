# Agent DAG Planner（Phase 3）

日期：2026-02-09  
状态：已完成

## 目标

将计划执行从线性步骤升级为 DAG 调度，支持“读并行、写串行”，在保证编辑安全的前提下提升执行吞吐。

## 交付内容

1. 新增 DAG planner  
文件：`apps/web/src/agent/planner/dag.ts`
- `buildDagFromPlanSteps`：从计划步骤构建依赖图
- `getTopologicalOrder`：拓扑排序与环检测
- `getReadyDagNodes`：结合依赖状态与资源锁挑选可执行节点

2. 计划步骤模型升级  
文件：`apps/web/src/agent/types.ts`
- `AgentPlanStep` 新增：
  - `operation?: "read" | "write"`
  - `dependsOn?: string[]`
  - `resourceLocks?: string[]`
- 执行事件新增 DAG 字段：
  - `planStepId`
  - `dagState`

3. Orchestrator DAG 调度接入  
文件：`apps/web/src/agent/orchestrator.ts`
- 新增 `executeToolCallsAsDag` 统一 DAG 执行入口
- `process()` 工具批次执行切换为 DAG 调度
- `confirmPendingPlan()` 切换为 DAG 调度
- 保持兼容：无 DAG 元数据时自动推断（默认写串行，`get_`/`list_` 读步骤可并行）

4. Workflow 并行读示例  
文件：`apps/web/src/agent/workflows/definitions.ts`
- 新增 `timeline-diagnostics` workflow
- 三个 read-only 查询步骤可并行执行

## 测试

新增：
- `apps/web/src/agent/__tests__/dag-planner.test.ts`

增强：
- `apps/web/src/agent/__tests__/orchestrator.test.ts`

验证点：
- DAG 拓扑排序与环检测
- 资源锁冲突保护
- `confirmPendingPlan` 下 read-only 节点并行执行（事件顺序与耗时验证）
