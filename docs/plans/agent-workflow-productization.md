# Agent Workflow Productization（Phase 6）

日期：2026-02-09  
状态：已完成

## 目标

将 Agent Workflow 从“技术工具链”升级为“场景化模板”，让用户按内容类型快速配置并运行，同时保证参数校验一致性。

## 交付内容

1. 新增场景化工作流模板  
文件：`apps/web/src/agent/workflows/definitions.ts`
- 新增 3 个场景 workflow：
  - `podcast-to-clips`
  - `talking-head-polish`
  - `course-chaptering`
- 每个 workflow 增加 `scenario` / `templateDescription` / `tags` 元数据

2. 工作流参数 schema 化  
文件：
- `apps/web/src/agent/workflows/types.ts`
- `apps/web/src/agent/workflows/index.ts`

变更：
- `WorkflowStep` 新增 `argumentSchema`
- `Workflow` 新增 `scenario/templateDescription/tags`
- `resolveWorkflowFromParams` 新增统一 schema 校验（类型、数值范围、枚举）

3. Workflow UI 场景筛选与模板展示  
文件：`apps/web/src/components/agent/AgentChatbox.tsx`

变更：
- 新增“场景筛选”控件（全部/通用/播客/口播人像/课程）
- 工作流列表按场景过滤
- 模板详情展示场景、模板说明、标签
- 参数编辑区展示 schema 信息：说明、默认值、范围、可选枚举
- 发送前按 schema 做统一参数校验

4. 工具输出与类型导出补齐  
文件：
- `apps/web/src/agent/tools/workflow-tools.ts`
- `apps/web/src/agent/index.ts`

变更：
- `list_workflows` 返回 `scenario/templateDescription/tags/argumentSchema`
- `agent` 模块导出 `WorkflowScenario`、`WorkflowStepArgumentSchema`

## 测试

新增：
- `apps/web/src/agent/__tests__/workflow-productization.test.ts`
  - 场景模板存在性测试
  - schema 校验通过/失败测试

增强：
- `apps/web/src/agent/__tests__/integration-workflow-playback-query.ts`
  - `list_workflows` 场景元数据断言
