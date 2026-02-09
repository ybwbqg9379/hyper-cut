# Agent Quality Loop（Phase 7）

日期：2026-02-09  
状态：已完成

## 目标

在工作流执行后自动进行质量评估，并在未达标时触发受控二次迭代（最多 N 次），形成“执行 -> 评估 -> 再执行”闭环。

## 交付内容

1. 新增质量评估服务  
文件：`apps/web/src/agent/services/quality-evaluator.ts`
- 输出结构化 `QualityReport`
- 核心指标：
  - `semanticCompleteness`
  - `silenceRate`
  - `subtitleCoverage`
  - `durationCompliance`
- 支持目标时长与容差配置，输出综合分与失败原因

2. Orchestrator 接入自动二次迭代  
文件：`apps/web/src/agent/orchestrator.ts`
- `run_workflow` 成功后自动评估质量
- 未达标时自动触发下一轮迭代（默认最多 2 轮，范围 1-4）
- 支持配置项：
  - `enableQualityLoop`
  - `qualityMaxIterations`
  - `qualityTargetDuration`
  - `qualityDurationTolerance`
- 达标：返回成功并附带质量报告  
- 达到上限仍未达标：返回 `QUALITY_TARGET_NOT_MET`（清晰退化结果）

3. 工具参数与类型链路补齐  
文件：
- `apps/web/src/agent/tools/workflow-tools.ts`
- `apps/web/src/hooks/use-agent.ts`

变更：
- `run_workflow` 参数 schema 增加质量循环相关配置
- `useAgent.runWorkflow` 支持透传质量循环参数

## 测试

新增：
- `apps/web/src/agent/__tests__/quality-evaluator.test.ts`
  - 指标达标测试
  - 无转录失败测试
  - 时长不达标测试

增强：
- `apps/web/src/agent/__tests__/orchestrator.test.ts`
  - 自动二次迭代成功测试
  - 达到迭代上限后失败退化测试
