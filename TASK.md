# Feature: Agent 最大化智能编辑（Upstream + Fork 融合）

## Overview

目标：在不破坏 upstream 可合并性的前提下，最大化利用 OpenCut 核心能力，并通过 HyperCut Agent 编排实现更强的自动化、可解释性、稳定性与可恢复性。

执行方式：严格按 Ralph Loop 逐 Phase 迭代。每个 Phase 必须完成：

1. 实现代码
2. 补全测试（单元/集成）
3. 更新文档（README/CHANGELOG/专项设计文档）
4. 通过 lint/build/test
5. 提交 commit
6. 才能进入下一 Phase

---

## Global Quality Gates（每个 Phase 都必须满足）

- [ ] `bun run lint` 0 warning / 0 error
- [ ] `bun run build` 成功
- [ ] `bun run test` 成功（至少包含本 Phase 新增/修改覆盖）
- [ ] 更新 `CHANGELOG.md`（记录本阶段新增/修复/变更）
- [ ] 更新相关文档（本文件或 `docs/plans/*`）
- [ ] 完成一次自审（架构边界、可维护性、回归风险）
- [ ] 完成一次 commit（禁止跨 Phase 混提）

Commit message 约定：

- `feat(agent): complete phase N - <short-title>`
- `refactor(agent): complete phase N - <short-title>`
- `test(agent): complete phase N - <short-title>`

---

## Phases

### Phase 1: Capability Registry（能力镜像层）

- **Status**: ✅ Completed
- **Description**: 建立 upstream 能力自动发现与规范化注册，减少手写工具映射。
- **Implementation Scope**:
  - 新增 `apps/web/src/agent/capabilities/`：
    - `types.ts`（能力元信息）
    - `collect-from-actions.ts`（从 `lib/actions/definitions.ts` 收集）
    - `collect-from-managers.ts`（从 `core/managers` 映射）
    - `registry.ts`（统一导出）
  - 为现有工具添加 capabilityId 绑定（最小侵入式）
  - 新增 debug/query 工具：`list_capabilities`（只读）
- **Acceptance Criteria**:
  - [x] 可列出能力清单（类别、参数、风险级别、来源）
  - [x] 至少覆盖现有 Agent 工具对应能力的 80% 映射（当前 100%）
  - [x] 未破坏现有 `getAllTools()` 行为
- **Tests**:
  - [x] `capabilities/registry.test.ts`
  - [x] `list_capabilities` 工具测试
- **Docs**:
  - [x] `CHANGELOG.md`
  - [x] 新增 `docs/plans/agent-capability-registry.md`

### Phase 2: Action-first + Command-safe 执行策略

- **Status**: ✅ Completed
- **Description**: 用户触发编辑优先走 Action，破坏性操作必须可撤销。
- **Implementation Scope**:
  - 新增 `apps/web/src/agent/tools/execution-policy.ts`
  - 在各工具中统一执行入口：
    - 优先 `invokeAction`
    - fallback 到 manager/command（仅内部场景）
  - 为删除/裁剪/批量变更增加“可撤销保证”检查
- **Acceptance Criteria**:
  - [x] 主要用户触发型工具默认走 action
  - [x] 破坏性工具都能走 undo/redo 链路（新增 undo checkpoint guard）
  - [x] 无“提示成功但未实际生效”路径（action 不可用直接失败）
- **Tests**:
  - [x] action 不可用时的失败路径测试
  - [x] undo/redo 行为一致性测试
- **Docs**:
  - [x] `CHANGELOG.md`
  - [x] `docs/plans/agent-execution-policy.md`

### Phase 3: Planner 升级为 DAG（读并行/写串行）

- **Status**: ✅ Completed
- **Description**: 把线性计划扩展为依赖图执行，提升吞吐与稳定性。
- **Implementation Scope**:
  - 扩展 `AgentPlanStep`：依赖关系、读写类型、资源锁
  - 新增 `apps/web/src/agent/planner/dag.ts`
  - Orchestrator 支持 DAG 执行调度：
    - 只读步骤并行
    - 写操作串行
    - 冲突资源互斥
- **Acceptance Criteria**:
  - [x] 兼容现有线性计划
  - [x] 至少 1 个 workflow 启用并行读步骤（`timeline-diagnostics`）
  - [x] 执行事件流能反映 DAG 节点状态（`planStepId` + `dagState`）
- **Tests**:
  - [x] DAG 拓扑排序测试
  - [x] 并发冲突保护测试
  - [x] orchestrator DAG 集成测试
- **Docs**:
  - [x] `CHANGELOG.md`
  - [x] `docs/plans/agent-dag-planner.md`

### Phase 4: 通用 Dry-run + Diff 仿真

- **Status**: ✅ Completed
- **Description**: 所有改动型工具先仿真输出 diff，再确认应用。
- **Implementation Scope**:
  - 扩展工具参数协议：`dryRun?: boolean`
  - 在 `timeline-edit-ops.ts` 引入统一 diff 结构：
    - affected elements
    - duration delta
    - keep/delete ranges
  - `agent-ui-store` + `AgentChatbox` 增加通用 diff 可视化（不只 highlight）
- **Acceptance Criteria**:
  - [x] 关键改动工具支持 dryRun
  - [x] dryRun 与真实执行结果统计一致（误差在允许范围）
  - [x] UI 可预览并支持“确认执行”
- **Tests**:
  - [x] dryRun/real-run 一致性测试
  - [x] diff schema 序列化测试
  - [x] UI 交互测试（确认/取消）
- **Docs**:
  - [x] `CHANGELOG.md`
  - [x] `docs/plans/agent-dryrun-diff.md`

### Phase 5: Recovery Policy（失败自恢复）

- **Status**: ✅ Completed
- **Description**: 对常见错误码进行自动补救与重试策略。
- **Implementation Scope**:
  - 新增 `apps/web/src/agent/recovery/policies.ts`
  - Orchestrator 在工具失败后按 errorCode 匹配补救路径
  - 支持最大重试次数、指数退避、可观测事件
- **Acceptance Criteria**:
  - [x] `NO_TRANSCRIPT`、`PROVIDER_UNAVAILABLE`、`HIGHLIGHT_CACHE_STALE` 等有策略
  - [x] 不产生无限重试
  - [x] 用户可看到“失败->恢复->结果”完整轨迹
- **Tests**:
  - [x] 策略匹配测试
  - [x] 重试上限测试
  - [x] 恢复成功/失败集成测试
- **Docs**:
  - [x] `CHANGELOG.md`
  - [x] `docs/plans/agent-recovery-policy.md`

### Phase 6: Workflow 产品化（场景包）

- **Status**: ✅ Completed
- **Description**: 从“技术工作流”升级到“场景工作流”。
- **Implementation Scope**:
  - 在 `workflows/definitions.ts` 增加场景向工作流：
    - `podcast-to-clips`
    - `talking-head-polish`
    - `course-chaptering`
  - 工作流参数 schema 化（默认值、范围、说明）
  - Workflow UI 支持按场景筛选和模板说明
- **Acceptance Criteria**:
  - [x] 新增至少 3 个场景工作流
  - [x] 工作流参数校验统一化
  - [x] Workflow 面板可直接配置并运行
- **Tests**:
  - [x] workflow 参数校验测试
  - [x] workflow 展开/恢复测试
  - [x] 场景 workflow 集成测试
- **Docs**:
  - [x] `CHANGELOG.md`
  - [x] `docs/plans/agent-workflow-productization.md`

### Phase 7: 质量评估器 + 自动二次迭代

- **Status**: ✅ Completed
- **Description**: 执行后自动打分，不达标自动触发二次规划。
- **Implementation Scope**:
  - 新增 `apps/web/src/agent/services/quality-evaluator.ts`
  - 指标：
    - 语义完整性
    - 静音率
    - 字幕覆盖率
    - 时长达标率
  - Orchestrator 集成“目标驱动最多 N 次迭代”
- **Acceptance Criteria**:
  - [x] 可输出结构化质量报告
  - [x] 不达标可自动二次迭代
  - [x] 达到迭代上限后有清晰退化结果
- **Tests**:
  - [x] evaluator 单元测试
  - [x] 迭代停止条件测试
  - [x] 端到端质量闭环测试
- **Docs**:
  - [x] `CHANGELOG.md`
  - [x] `docs/plans/agent-quality-loop.md`

### Phase 8: 多 Provider 路由（隐私分级）

- **Status**: 🔄 In Progress
- **Description**: 本地优先，云端兜底，按任务类型和隐私等级路由。
- **Implementation Scope**:
  - 新增 `apps/web/src/agent/providers/router.ts`
  - 按任务类型分流（planning/semantic/vision）
  - 配置隐私模式：
    - local-only
    - hybrid
    - cloud-preferred
- **Acceptance Criteria**:
  - [ ] provider route 可观测且可配置
  - [ ] local 不可用时有可控 fallback
  - [ ] 现有 provider 行为兼容
- **Tests**:
  - [ ] 路由决策测试
  - [ ] fallback 测试
  - [ ] 隐私模式测试
- **Docs**:
  - [ ] `CHANGELOG.md`
  - [ ] `apps/web/.env.example` 新增路由配置说明
  - [ ] `docs/plans/agent-provider-routing.md`

### Phase 9: Upstream 同步护栏 + 兼容回归

- **Status**: ⏳ Pending
- **Description**: 建立 upstream 变更自动 diff 与 Agent 兼容检查。
- **Implementation Scope**:
  - 新增脚本 `apps/web/scripts/agent-upstream-guard.ts`
  - 对比 actions/managers/commands 的能力差异报告
  - 在 CI 增加 agent 兼容回归任务（工具注册、关键 workflow、恢复链路）
- **Acceptance Criteria**:
  - [ ] 每次上游同步后可自动产出差异报告
  - [ ] 报告可定位“新增能力未映射”清单
  - [ ] CI 阻断严重兼容回归
- **Tests**:
  - [ ] guard 脚本单测
  - [ ] 兼容性 smoke tests
- **Docs**:
  - [ ] `CHANGELOG.md`
  - [ ] `docs/plans/agent-upstream-guard.md`

### Phase 10: 全链路代码审查与硬化收尾

- **Status**: ⏳ Pending
- **Description**: 全量复盘、风险清理、发布前稳定性收口。
- **Implementation Scope**:
  - 对 Agent 核心链路做系统审查：
    - orchestrator
    - tools
    - workflows
    - providers
    - UI state
  - 清理 tech debt、重复逻辑、无效路径
  - 补齐遗漏测试与文档
- **Acceptance Criteria**:
  - [ ] 全链路审查报告完成（含风险分级）
  - [ ] P0/P1 问题全部修复
  - [ ] 发布门禁全绿
- **Tests**:
  - [ ] 全量测试通过
  - [ ] 关键路径手工验收清单通过
- **Docs**:
  - [ ] `CHANGELOG.md` 最终汇总
  - [ ] 新增 `docs/plans/agent-final-review.md`

---

## Phase Transition Rules

进入下一 Phase 之前必须同时满足：

- [ ] 当前 Phase 全部 acceptance criteria 勾选完成
- [ ] 当前 Phase 的测试文件已补齐并通过
- [ ] 当前 Phase 文档已更新
- [ ] lint/build/test 均通过
- [ ] 已 commit

若任一门禁失败：禁止进入下一 Phase，先修复。

---

## Completion Criteria

整体任务完成条件：

- [ ] Phase 1-10 全部完成
- [ ] 每个 Phase 均有独立 commit
- [ ] 质量门禁在最终分支再次全绿
- [ ] 完成最终全链路代码审查并输出结论
