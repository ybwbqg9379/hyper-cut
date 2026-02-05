# Long-to-Short 端到端工作流设计

> 目标：30 分钟长视频 → 60 秒可发布短视频精华剪辑
> 日期：2026-02-05
> 状态：待实现

---

## 1. 设计决策

| 决策项 | 选择 | 理由 |
|--------|------|------|
| 目标内容 | 混合类（口播+画面） | 覆盖最广，向下兼容纯口播/纯画面 |
| 输出形态 | 两步走（建议→确认→应用） | 复用现有 Planning 模式，可控性强 |
| 分析策略 | 转录为主 + 视觉辅助 | Qwen3 VL 8B (4096 token) 下最优解 |
| 输出数量 | MVP: 1 个精华剪辑 | 复杂度最低，价值感知明确 |
| LLM | 先 LM Studio 本地，后扩展 Gemini | 降低初期依赖，保持隐私优先 |

---

## 2. 流水线架构

```
用户: "把这个30分钟视频剪成60秒精华"
  │
  ▼
┌─────────────────────────────────────────────────┐
│  Phase 1: 转录 + 分段                            │
│  [已有] Whisper 转录 → 全量文本                    │
│  [新增] 按语义边界分段 → TranscriptSegment[]       │
│         每段 10-30 秒，按句号/停顿/话题切分         │
└──────────────────────┬──────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────┐
│  Phase 2: 高光评分                                │
│  [新增] 规则引擎 → 基础分数（无需 LLM）             │
│         · 语速 (words/sec)                        │
│         · 内容密度 (非填充词占比)                    │
│         · 互动标记 (问句/感叹/情绪词)                │
│         · 静音占比 (低 = 紧凑)                      │
│  [新增] LLM 增强 → 语义分数（5 分钟块送 LLM）       │
│         · 信息重要度 (1-10)                        │
│         · 情绪强度 (1-10)                          │
│         · 开头 Hook 潜力 (1-10)                    │
│         · 独立可理解性 (1-10)                       │
│  输出: ScoredSegment[] (每段带综合分)               │
└──────────────────────┬──────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────┐
│  Phase 3: 视觉验证（仅候选段）                      │
│  [新增] 取 Top-15 候选段 → 每段取 1 关键帧          │
│  [复用] 现有 VLM 帧分析 → 视觉质量评估              │
│         · 画面构图/清晰度                           │
│         · 人物表情/动作                             │
│         · 视觉多样性                               │
│  [新增] 视觉分加权到综合分                          │
│  输出: ScoredSegment[] (综合分已含视觉权重)          │
└──────────────────────┬──────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────┐
│  Phase 4: 片段选取                                │
│  [新增] 给定目标时长 → 贪心选取最优组合              │
│         · 按时间顺序保持叙事连贯                     │
│         · 总时长在目标 ±15% 内                      │
│         · 优先纳入首段强 Hook                       │
│         · 优先纳入尾段收束                          │
│  输出: HighlightPlan (选中段列表 + 元数据)          │
└──────────────────────┬──────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────┐
│  Phase 5: 计划呈现（复用 Planning 模式）             │
│  [复用] AgentExecutionPlan 展示选中段               │
│         每段显示: 时间范围 | 转录摘要 | 分数 | 原因   │
│         用户可: 删除段 / 调整顺序 / 修改边界          │
└──────────────────────┬──────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────┐
│  Phase 6: 执行剪辑                                │
│  [新增] 反向删除非选中区间                          │
│         · 从末尾向前删（避免时间偏移）                │
│         · 保留选中段间的最小间隔（可选过渡）           │
│  [已有] 可选: 自动加字幕 / 去静音                    │
│  输出: 时间线上只剩精华片段                          │
└─────────────────────────────────────────────────┘
```

---

## 3. 新增类型定义

文件: `apps/web/src/agent/tools/highlight-types.ts`

```typescript
/** 转录文本语义分段 */
export interface TranscriptChunk {
  index: number;
  startTime: number;
  endTime: number;
  text: string;
  wordCount: number;
}

/** 规则引擎评分明细 */
export interface RuleScores {
  speakingRate: number;       // 0-1, 语速归一化
  contentDensity: number;     // 0-1, 非填充词占比
  engagementMarkers: number;  // 0-1, 问句/感叹/情绪词密度
  silenceRatio: number;       // 0-1, 反向(低静音=高分)
}

/** LLM 语义评分明细 */
export interface SemanticScores {
  importance: number;         // 1-10, 信息重要度
  emotionalIntensity: number; // 1-10, 情绪强度
  hookPotential: number;      // 1-10, 开头吸引力
  standalone: number;         // 1-10, 独立可理解性
}

/** 视觉评分明细 */
export interface VisualScores {
  frameQuality: number;       // 0-1, 画面质量
  visualInterest: number;     // 0-1, 视觉吸引力
  hasValidFrame: boolean;     // 是否成功提取帧
}

/** 带评分的分段 */
export interface ScoredSegment {
  chunk: TranscriptChunk;
  ruleScores: RuleScores;
  semanticScores: SemanticScores | null;  // LLM 不可用时为 null
  visualScores: VisualScores | null;      // 仅候选段有
  combinedScore: number;                  // 加权综合分 0-100
  rank: number;
}

/** 精华计划 */
export interface HighlightPlan {
  targetDuration: number;         // 目标时长(秒)
  actualDuration: number;         // 实际时长(秒)
  segments: SelectedSegment[];    // 选中的段
  totalSegments: number;          // 原始总段数
  coveragePercent: number;        // 精华占原片比例
}

/** 选中的段 */
export interface SelectedSegment {
  chunk: TranscriptChunk;
  combinedScore: number;
  reason: string;                 // 入选理由(给用户看)
  thumbnailDataUrl?: string;      // 预览帧(可选)
}

/** 评分权重配置 */
export interface ScoringWeights {
  rule: number;     // 规则分权重, 默认 0.4
  semantic: number; // 语义分权重, 默认 0.4
  visual: number;   // 视觉分权重, 默认 0.2
}
```

---

## 4. 新增服务

### 4.1 TranscriptAnalyzer

文件: `apps/web/src/agent/services/transcript-analyzer.ts`

**职责**: 将 Whisper 转录结果按语义边界分段，提取规则特征

```typescript
export class TranscriptAnalyzerService {
  /**
   * 将转录文本切分为语义段
   * 策略: 按句号/问号/感叹号分割 → 合并过短段(< 5s) → 拆分过长段(> 30s)
   */
  segmentTranscript(context: TranscriptContext): TranscriptChunk[];

  /**
   * 计算单段的规则评分（纯算法，无需 LLM）
   * - speakingRate: wordCount / duration, 归一化到 [0,1]
   * - contentDensity: 过滤填充词后的词数占比
   * - engagementMarkers: 问句数 + 感叹句数 + 情绪关键词数, 归一化
   * - silenceRatio: 1 - (实际语音时长 / 段总时长)
   */
  computeRuleScores(chunk: TranscriptChunk, words: TranscriptWord[]): RuleScores;
}
```

**填充词表** (中英双语):
- 英文: "um", "uh", "like", "you know", "basically", "actually", "literally", "right", "so", "well"
- 中文: "嗯", "啊", "然后", "就是", "那个", "这个", "对吧", "反正"

**情绪/互动关键词** (中英双语):
- 英文: "amazing", "important", "key", "secret", "mistake", "problem", "solution", "must", "never", "always"
- 中文: "重要", "关键", "秘密", "错误", "必须", "一定", "绝对", "太棒了", "注意", "千万"

### 4.2 HighlightScorer

文件: `apps/web/src/agent/services/highlight-scorer.ts`

**职责**: 整合规则分 + LLM 语义分 + 视觉分，输出综合评分

```typescript
export class HighlightScorerService {
  /**
   * Phase 2: LLM 语义评分
   * 将转录文本按 ~5 分钟块发送给 LLM
   * 每块 Prompt 模板:
   *
   *   "以下是一段视频转录文本。请为每个编号段落评分(1-10):
   *    - importance: 信息重要度
   *    - emotionalIntensity: 情绪强度
   *    - hookPotential: 作为短视频开头的吸引力
   *    - standalone: 脱离上下文后是否仍可理解
   *
   *    [段落1] (00:32-00:58) 这里是转录文本...
   *    [段落2] (00:58-01:15) 这里是转录文本...
   *    ...
   *
   *    请仅以 JSON 数组返回。"
   *
   * Token 预算: ~800 字/5 分钟 → ~1200 token input + ~500 token output
   * 30 分钟视频 = 6 次 LLM 调用
   */
  scoreWithLLM(
    chunks: TranscriptChunk[],
    provider: LMStudioProvider
  ): Promise<Map<number, SemanticScores>>;

  /**
   * Phase 3: 视觉验证
   * 仅对 Top-N 候选段做 VLM 评估
   * 每段取 1 帧 → 发 VLM:
   *   "Rate this video frame: visual quality (0-1), visual interest (0-1).
   *    Return JSON: {frameQuality: number, visualInterest: number}"
   */
  scoreWithVision(
    candidates: ScoredSegment[],
    maxCandidates: number,
    provider: LMStudioProvider
  ): Promise<Map<number, VisualScores>>;

  /**
   * 综合评分 = rule * W_rule + semantic * W_semantic + visual * W_visual
   * 默认权重: rule=0.4, semantic=0.4, visual=0.2
   * LLM 不可用时: rule=0.7, visual=0.3
   * LLM + VLM 都不可用时: 纯规则分
   */
  computeCombinedScore(
    ruleScores: RuleScores,
    semanticScores: SemanticScores | null,
    visualScores: VisualScores | null,
    weights: ScoringWeights
  ): number;
}
```

### 4.3 SegmentSelector

文件: `apps/web/src/agent/services/segment-selector.ts`

**职责**: 从排序后的 ScoredSegment[] 中选出最优组合

```typescript
export class SegmentSelectorService {
  /**
   * 贪心选取算法:
   *
   * 1. 按 combinedScore 降序排列
   * 2. 遍历候选段:
   *    a. 跳过与已选段时间重叠的
   *    b. 累加时长，直到达到目标 ±15%
   * 3. 按原始时间顺序重排选中段
   * 4. Hook 优化: 仅当最强 Hook 段较首段 hookPotential 至少高 2 分，且不重叠、且不超时长时才替换
   *
   * 参数:
   *   segments: 所有评分段
   *   targetDuration: 目标时长(秒)
   *   tolerance: 时长容差(默认 0.15 = ±15%)
   */
  selectSegments(
    segments: ScoredSegment[],
    targetDuration: number,
    tolerance?: number
  ): HighlightPlan;
}
```

---

## 5. 新增 Agent 工具

文件: `apps/web/src/agent/tools/highlight-tools.ts`

### 5.1 `score_highlights` 工具

**触发**: Phase 1-2 (转录分段 + 评分)

```typescript
{
  name: "score_highlights",
  description: "分析视频转录文本，为每个片段计算高光评分。" +
    "Analyze transcript and score each segment for highlight potential.",
  parameters: {
    type: "object",
    properties: {
      videoAssetId: {
        type: "string",
        description: "视频素材 ID（可选，默认自动选择）"
      },
      segmentMinSeconds: {
        type: "number",
        description: "最小分段时长(秒)，默认 8"
      },
      segmentMaxSeconds: {
        type: "number",
        description: "最大分段时长(秒)，默认 30"
      },
      useLLM: {
        type: "boolean",
        description: "是否使用 LLM 做语义评分(默认 true，不可用时自动降级)"
      }
    }
  }
}
```

**返回**: `ScoredSegment[]` (全量分段+评分)

**依赖**: 现有 `generate_captions` 产出的转录 / Whisper 服务

### 5.2 `validate_highlights_visual` 工具

**触发**: Phase 3 (视觉验证)

```typescript
{
  name: "validate_highlights_visual",
  description: "对候选高光片段做视觉质量验证（VLM 帧分析）。" +
    "Validate highlight candidates with visual frame analysis.",
  parameters: {
    type: "object",
    properties: {
      videoAssetId: {
        type: "string",
        description: "视频素材 ID"
      },
      topN: {
        type: "number",
        description: "验证前 N 个候选段(默认 15)"
      }
    }
  }
}
```

**返回**: 更新后的 `ScoredSegment[]` (含视觉分)

**依赖**: `score_highlights` 的输出 (通过内存缓存传递)

### 5.3 `generate_highlight_plan` 工具

**触发**: Phase 4 (片段选取 + 计划生成)

```typescript
{
  name: "generate_highlight_plan",
  description: "根据评分结果生成精华剪辑计划。" +
    "Generate a highlight reel plan from scored segments.",
  parameters: {
    type: "object",
    properties: {
      targetDuration: {
        type: "number",
        description: "目标时长(秒)，默认 60"
      },
      tolerance: {
        type: "number",
        description: "时长容差比例(默认 0.15 = ±15%)"
      },
      includeHook: {
        type: "boolean",
        description: "是否优先包含强开头 Hook(默认 true)"
      }
    }
  }
}
```

**返回**: `HighlightPlan`

### 5.4 `apply_highlight_cut` 工具

**触发**: Phase 6 (用户确认后执行)

```typescript
{
  name: "apply_highlight_cut",
  description: "将精华剪辑计划应用到时间线（删除非选中区间）。" +
    "Apply highlight plan to timeline by removing non-selected intervals.",
  parameters: {
    type: "object",
    properties: {
      addCaptions: {
        type: "boolean",
        description: "是否同时生成字幕(默认 false)"
      },
      removeSilence: {
        type: "boolean",
        description: "是否同时去除精华段内的静音(默认 false)"
      }
    }
  }
}
```

**执行逻辑**:
```
1. 从缓存读取已确认的 HighlightPlan
2. 计算"要删除的区间" = 总时间线 - 选中段的并集
3. 从末尾向前遍历删除区间（避免前面的删除导致后面时间偏移）
4. 对每个删除区间:
   a. split_at_time(区间起点)
   b. split_at_time(区间终点)
   c. 选中中间片段 → delete_selected
5. 可选: 对剩余片段执行 generate_captions + remove_silence
```

---

## 6. 新增工作流

文件: 修改 `apps/web/src/agent/workflows/definitions.ts`

```typescript
{
  name: "long-to-short",
  description: "将长视频自动剪辑为短视频精华。" +
    "Auto-cut long video into a short highlight reel.",
  steps: [
    {
      id: "score-highlights",
      toolName: "score_highlights",
      arguments: {},
      summary: "分析转录文本，为每个片段计算高光评分"
    },
    {
      id: "visual-validation",
      toolName: "validate_highlights_visual",
      arguments: { topN: 15 },
      summary: "对候选高光片段做视觉质量验证"
    },
    {
      id: "generate-plan",
      toolName: "generate_highlight_plan",
      arguments: { targetDuration: 60 },
      summary: "生成精华剪辑计划"
    },
    {
      id: "apply-cut",
      toolName: "apply_highlight_cut",
      requiresConfirmation: true,
      arguments: { addCaptions: true, removeSilence: true },
      summary: "应用剪辑计划到时间线"
    }
  ]
}
```

**用户交互流**: 通过 Planning 模式，前 3 步执行后暂停，用户可修改计划中的段落，确认后执行 `apply_highlight_cut`。

---

## 7. 工具间数据传递

工具之间通过**模块级缓存** (与现有 vision-tools.ts 的 sceneCache/frameAnalysisCache 模式一致):

```typescript
// highlight-tools.ts 顶部
const highlightCache = {
  scoredSegments: null as ScoredSegment[] | null,
  highlightPlan: null as HighlightPlan | null,
  assetId: null as string | null,
};
```

**流转**:
```
score_highlights → 写入 highlightCache.scoredSegments
validate_highlights_visual → 读/写 highlightCache.scoredSegments
generate_highlight_plan → 读 scoredSegments → 写 highlightCache.highlightPlan
apply_highlight_cut → 读 highlightCache.highlightPlan → 执行剪辑
```

---

## 8. LLM Prompt 设计

### 8.1 转录评分 Prompt (Phase 2)

```
你是一位专业短视频剪辑师。以下是一段长视频的转录文本片段。
请为每个编号段落评分(1-10 整数):

- importance: 信息含量和重要程度
- emotionalIntensity: 语气的情绪强度(兴奋/激动/感动/紧张)
- hookPotential: 如果作为短视频的前3秒，能否吸引观众继续看
- standalone: 脱离前后上下文，这段话是否仍然有意义

[1] (00:32-00:58) "所以今天我要分享三个最重要的..."
[2] (00:58-01:22) "第一个就是你一定要注意..."
...

仅返回 JSON 数组，格式:
[{"index":1,"importance":8,"emotionalIntensity":6,"hookPotential":9,"standalone":7}, ...]
```

### 8.2 视觉验证 Prompt (Phase 3)

```
你是一位视频画面质量评估专家。
请评估这帧画面作为短视频片段的视觉吸引力。

评分标准:
- frameQuality: 画面清晰度、构图、光线 (0.0-1.0)
- visualInterest: 视觉吸引力，人物表情/动作/场景变化 (0.0-1.0)

仅返回 JSON: {"frameQuality": 0.8, "visualInterest": 0.7}
```

---

## 9. 降级策略

| 场景 | 降级方案 | 评分权重调整 |
|------|---------|-------------|
| LLM 可用 + VLM 可用 | 全量流水线 | rule=0.4, semantic=0.4, visual=0.2 |
| LLM 可用 + VLM 不可用 | 跳过 Phase 3 | rule=0.5, semantic=0.5 |
| LLM 不可用 + VLM 可用 | 跳过 Phase 2 语义 | rule=0.7, visual=0.3 |
| LLM + VLM 均不可用 | 纯规则评分 | rule=1.0 |

纯规则评分仍能产出合理结果——语速高+内容密集+互动标记多的段落大概率就是高光片段。

---

## 10. 约束与限制

### 10.1 已知约束

| 约束 | 值 | 影响 | 应对 |
|------|---|------|------|
| LLM token 窗口 | 4096 | 不能一次送全部转录 | 5 分钟块分批送 |
| VLM 帧分析上限 | 20 帧 | 不能全量视觉分析 | 仅 Top-15 候选段验证 |
| 场景检测帧上限 | 600 帧 | 1 FPS 只覆盖 10 分钟 | 本方案不依赖场景检测做主干 |
| 工具超时 | 60s | 长转录可能超时 | 分段处理，每段独立超时 |
| 本地推理速度 | ~2-5s/调用 | 6 次 LLM + 15 次 VLM | 总计 ~1-3 分钟 |

### 10.2 30 分钟视频的处理预算

```
Whisper 转录:          ~2-5 min (取决于模型大小)
规则评分:              < 1 sec  (纯计算)
LLM 语义评分 (6 块):   ~12-30 sec (本地推理)
VLM 视觉验证 (15 帧):  ~30-75 sec (本地推理)
片段选取:              < 1 sec  (纯算法)
应用剪辑:              < 5 sec  (时间线操作)
───────────────────────────────────
总计:                  ~3-7 min (转录占大头)
```

---

## 11. 分阶段开发计划

### Phase A: 基础设施 (预计 2-3 天)

**目标**: 新增类型、服务骨架、工具注册

| 步骤 | 文件 | 内容 |
|------|------|------|
| A1 | `agent/tools/highlight-types.ts` | 所有新增类型定义 (§3) |
| A2 | `agent/services/transcript-analyzer.ts` | TranscriptAnalyzerService 骨架 + `segmentTranscript()` |
| A3 | `agent/services/highlight-scorer.ts` | HighlightScorerService 骨架 |
| A4 | `agent/services/segment-selector.ts` | SegmentSelectorService 骨架 |
| A5 | `agent/tools/highlight-tools.ts` | 4 个工具定义 + 导出注册 |
| A6 | `agent/tools/index.ts` | 将新工具加入 allTools |
| A7 | 测试 | 类型编译通过 + 工具可被 orchestrator 发现 |

**验收**: `bun run build` 通过, 新工具出现在 agent 工具列表中

### Phase B: 转录分段 + 规则评分 (预计 2-3 天)

**目标**: 实现 Phase 1-2 的规则部分，不依赖 LLM 即可工作

| 步骤 | 文件 | 内容 |
|------|------|------|
| B1 | `transcript-analyzer.ts` | `segmentTranscript()` 实现: 句号分割 + 合并/拆分逻辑 |
| B2 | `transcript-analyzer.ts` | `computeRuleScores()` 实现: 四维规则评分 |
| B3 | `transcript-analyzer.ts` | 填充词表 + 情绪关键词表 (中英双语) |
| B4 | `highlight-scorer.ts` | `computeCombinedScore()` 纯规则模式实现 |
| B5 | `highlight-tools.ts` | `score_highlights` 工具 execute 实现 (规则路径) |
| B6 | `segment-selector.ts` | `selectSegments()` 贪心算法实现 |
| B7 | `highlight-tools.ts` | `generate_highlight_plan` 工具 execute 实现 |
| B8 | 测试 | 单元测试: 分段逻辑、规则评分、贪心选取 |

**验收**: 对测试转录文本运行 `score_highlights` → `generate_highlight_plan`，能输出合理的 HighlightPlan

### Phase C: LLM 语义评分集成 (预计 2 天)

**目标**: 接入 LLM 做语义增强评分

| 步骤 | 文件 | 内容 |
|------|------|------|
| C1 | `highlight-scorer.ts` | `scoreWithLLM()` 实现: 5 分钟分块 + prompt 构建 + JSON 解析 |
| C2 | `highlight-scorer.ts` | LLM 响应解析容错 (JSON 格式异常、部分返回等) |
| C3 | `highlight-scorer.ts` | 权重动态调整逻辑 (LLM 可用/不可用) |
| C4 | `highlight-tools.ts` | `score_highlights` 集成 LLM 路径 |
| C5 | 测试 | mock LLM provider 的集成测试 |

**验收**: LLM 可用时综合分 = 规则 + 语义; 不可用时自动降级到纯规则

### Phase D: 视觉验证集成 (预计 2 天)

**目标**: 接入 VLM 做视觉二次确认

| 步骤 | 文件 | 内容 |
|------|------|------|
| D1 | `highlight-scorer.ts` | `scoreWithVision()` 实现: 帧提取 + VLM prompt + 解析 |
| D2 | `highlight-tools.ts` | `validate_highlights_visual` 工具 execute 实现 |
| D3 | `highlight-scorer.ts` | 三维权重综合评分逻辑 |
| D4 | 测试 | mock VLM 的集成测试 |

**验收**: VLM 可用时视觉分参与排名; 不可用时自动跳过

### Phase E: 剪辑执行 + 工作流 (预计 2-3 天)

**目标**: 实现 apply_highlight_cut + 注册工作流

| 步骤 | 文件 | 内容 |
|------|------|------|
| E1 | `highlight-tools.ts` | `apply_highlight_cut` 执行逻辑: 反向区间删除算法 |
| E2 | `highlight-tools.ts` | 可选: 剪辑后自动生成字幕 + 去静音 |
| E3 | `workflows/definitions.ts` | 新增 `long-to-short` 工作流定义 |
| E4 | 集成测试 | 端到端: 工作流触发 → Planning 呈现 → 确认 → 执行 |
| E5 | 手动测试 | 用真实 30 分钟视频跑完整流程 |

**验收**: 用户可在 Chatbox 中通过工作流或自然语言触发完整 long-to-short 流程

### Phase F: 打磨 + 体验优化 (预计 1-2 天)

| 步骤 | 内容 |
|------|------|
| F1 | Planning 模式 UI 中展示每段的转录摘要 + 时间范围 + 分数 |
| F2 | 进度反馈: 每个 Phase 完成时向用户发消息 |
| F3 | 错误处理: 转录失败、LLM 超时、视频无音频等边界情况 |
| F4 | 缓存管理: 同一视频二次运行时复用转录结果 |
| F5 | 更新 `docs/DEVELOPMENT_PITFALLS.md` 记录新踩坑 |

---

## 12. 文件变更清单

### 新增文件

```
apps/web/src/agent/
├── tools/
│   ├── highlight-types.ts          # 类型定义
│   └── highlight-tools.ts          # 4 个新工具
├── services/
│   ├── transcript-analyzer.ts      # 转录分段 + 规则评分
│   ├── highlight-scorer.ts         # 综合评分引擎
│   └── segment-selector.ts         # 片段选取算法
└── __tests__/
    ├── transcript-analyzer.test.ts
    ├── highlight-scorer.test.ts
    ├── segment-selector.test.ts
    └── highlight-tools.test.ts
```

### 修改文件

```
apps/web/src/agent/tools/index.ts           # 注册新工具
apps/web/src/agent/workflows/definitions.ts  # 新增 long-to-short 工作流
```

### 不修改的文件

```
orchestrator.ts          # 不需要改，现有流程完全支持
vision-tools.ts          # 不需要改，highlight-tools 直接调用 services
scene-detector.ts        # 不需要改，本方案不依赖像素差分做主干
lm-studio-provider.ts    # 不需要改，现有 API 够用
```

---

## 13. 未来扩展（不在本期范围）

| 能力 | 依赖 | 备注 |
|------|------|------|
| Gemini provider | API key + provider 实现 | 可替换 LM Studio，提升语义评分质量 |
| 多候选输出 | UI 改造 | 从 1 个精华扩展到 3-5 个候选 |
| 智能 Reframe | 主体检测模型 | 横屏→竖屏自动裁切 |
| 节拍同步 | 音频分析 | 剪辑点对齐音乐节拍 |
| 自动 B-roll | 素材库搜索 | 空镜头自动填充 |
| Viral Score | 平台数据 | 参考 Opus Clip 的传播力预测 |
