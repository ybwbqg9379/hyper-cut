# Agent Capability Registry（Phase 1）

日期：2026-02-09  
状态：已完成

## 目标

建立 Agent 能力镜像层，把 upstream 的 action / manager 能力统一注册成结构化能力定义，并与现有工具绑定，支持查询与后续编排策略扩展。

## 交付内容

1. 能力类型系统  
文件：`apps/web/src/agent/capabilities/types.ts`
- 定义 `CapabilityDefinition`、`CapabilityRegistry`
- 定义 `source/domain/risk/preconditions/parameters` 统一字段

2. 自动收集器  
文件：
- `apps/web/src/agent/capabilities/collect-from-actions.ts`
- `apps/web/src/agent/capabilities/collect-from-managers.ts`
- 从 `ACTIONS` 自动抽取 action 能力
- 从 manager 方法描述表抽取 manager 能力

3. Registry 与绑定能力  
文件：`apps/web/src/agent/capabilities/registry.ts`
- 构建 `byId` / `bySource` 索引
- 提供 `listCapabilities` 过滤接口
- 提供 `bindCapabilitiesToTools` 自动注入 `capabilityId/capabilityIds`
- 提供 `getToolBindingCoverage` 覆盖率统计

4. 工具绑定与原生能力  
文件：`apps/web/src/agent/capabilities/tool-bindings.ts`
- 为现有 Agent 工具维护 capability 映射
- 增加 tool-native 能力定义（如 highlight / vision / transcription / workflow）

5. 查询工具  
文件：`apps/web/src/agent/tools/capability-tools.ts`
- 新增只读工具 `list_capabilities`
- 支持 `source` / `risk` 过滤

6. 系统接入  
文件：
- `apps/web/src/agent/tools/index.ts`
- `apps/web/src/agent/index.ts`
- `apps/web/src/agent/types.ts`
- `apps/web/src/agent/capabilities/index.ts`
- `getAllTools()` 统一绑定 capability 元信息
- 对外导出 capability registry API

## 覆盖率结果

- 工具总数：85
- 已绑定能力工具数：85
- 绑定覆盖率：100%

## 测试

新增：
- `apps/web/src/agent/__tests__/capability-registry.test.ts`
- `apps/web/src/agent/__tests__/capability-tools.test.ts`

验证点：
- registry 构建与索引完整性
- source/risk 过滤正确性
- tool 绑定覆盖率（>=80%，实测 100%）
- `list_capabilities` 参数校验与返回结构
