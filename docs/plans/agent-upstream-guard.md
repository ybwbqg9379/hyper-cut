# Agent Upstream Guard（Phase 9）

日期：2026-02-09  
状态：已完成

## 目标

建立 upstream 同步护栏，自动识别 actions / managers / commands 的变更差异，并在出现高风险兼容回归时由 CI 阻断。

## 交付内容

1. 新增 Upstream Guard 核心模块  
文件：`apps/web/src/agent/compat/upstream-guard.ts`
- 自动采集当前快照：
  - actions（来自 `lib/actions/definitions.ts`）
  - manager methods（来自 `core/managers/*.ts` AST）
  - commands（来自 `lib/commands/**/*.ts`）
- 对比 baseline 产出 diff：
  - added / removed actions
  - added / removed manager methods
  - added / removed commands
- 输出“新增能力未映射”清单：
  - 新增 action 未绑定工具
  - 新增 manager 方法未进入 capability 映射
  - 新增 manager 方法未绑定工具（warning）
  - 新增 command 未被 Agent 显式导入（warning）
- 输出阻断级与告警级问题：
  - blocking：关键映射缺失、被引用能力被 upstream 移除
  - warning：新增 command 未覆盖、非关键移除

2. 新增 CLI 脚本  
文件：`apps/web/scripts/agent-upstream-guard.ts`
- 支持命令：
  - `--write-baseline`：写入 baseline 快照
  - `--fail-on-blocking`：发现 blocking issues 时返回非 0
  - `--baseline <path>`：自定义 baseline 路径
  - `--report <path>`：输出 JSON 报告文件

3. 新增 baseline 快照  
文件：`apps/web/src/agent/compat/upstream-baseline.json`
- 作为 upstream 对比基线
- 每次完成 upstream 合并后更新

4. 新增兼容 smoke tests  
文件：`apps/web/src/agent/__tests__/compat-smoke.test.ts`
- 覆盖工具能力绑定覆盖率
- 覆盖关键 workflow（`long-to-short`）可解析
- 覆盖 recovery 策略链路（`NO_TRANSCRIPT`）

5. 新增 guard 单元测试  
文件：`apps/web/src/agent/__tests__/upstream-guard.test.ts`
- 覆盖 blocking / warning 分级判断
- 覆盖新增未映射与删除已引用能力路径

6. CI 接入  
文件：`.github/workflows/bun-ci.yml`
- 新增 `agent:upstream-guard:ci`
- 新增 `test:agent-smoke`
- 去除原测试占位步骤，兼容回归检查正式进入 CI

## 使用方式

在 `apps/web` 下执行：

```bash
bun run agent:upstream-guard
bun run agent:upstream-guard:ci
bun run test:agent-smoke
```

若完成了一次 upstream 同步并确认映射调整已完成，更新基线：

```bash
bun run agent:upstream-guard:baseline
```
