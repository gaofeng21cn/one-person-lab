# Hermes Agent Runtime Substrate 对标与吸收清单

状态锚点：`2026-04-11`

## 文档目的

这份文档把 `Hermes Agent` 作为一个外部工程参照物，只用于帮助 `OPL` 冻结 `S1 / shared runtime substrate v1` 的吸收判断。

它不做三件事：

- 不把 `OPL` 改写成通用长期在线 agent 平台
- 不把 `OPL` 提升成当前 runtime owner
- 不把 future managed runtime 写成 current truth

它只回答一个问题：

> Hermes 哪些 runtime substrate 设计值得被 `OPL` 直接吸收、改写后吸收、暂缓吸收或明确拒绝？

## 对标快照

- 本地路径：`/Users/gaofeng/workspace/_external/hermes-agent`
- 快照提交：`96051955`
- 快照日期：`2026-04-10`

本轮重点参照的能力面包括：

- runtime profile / profile isolation
- session store / session search / resume
- gateway runtime status / owner-process discipline
- memory provider contract
- cron / delivery substrate
- approval / tool registry / interrupt / resume

## 吸收总原则

`OPL` 对 Hermes 的吸收只围绕 shared runtime substrate v1 进行。
判断标准是：

- 是否能稳定 `OPL` 顶层对长期在线 runtime 的语言判断
- 是否不会把 domain truth 不当上收
- 是否不会把 `OPL` 错写成已经实现的统一平台 runtime

## Adopted

下面这些对象直接进入 `S1` 顶层冻结。
这里的 “adopted” 指概念与边界直接被吸收，不等于实现已经共享。

### 1. `runtime profile`

- 原因：
  - Hermes 已经把 profile 证明成长期在线 runtime 的一等隔离单元
- 边界：
  - `OPL` 只吸收 profile 的顶层命名、隔离语义与迁移兼容面
  - domain-local canonical truth、credential、artifact mapping 继续留在 domain 内
- 对 `OPL` 的实际影响：
  - `S1` 把 `runtime profile` 固定成跨本地 host-agent 与 future managed runtime 的统一对象

### 2. `session substrate`

- 原因：
  - Hermes 证明了 session store 不是附属日志，而是 search、resume、audit 的 substrate
- 边界：
  - `OPL` 只冻结 session continuity contract，不持有 domain conversation truth
  - session 对 domain object 的语义解释仍留在 domain 内
- 对 `OPL` 的实际影响：
  - `S1` 固定 `session substrate` 为共享对象，而不是各仓各写一套 continuation 叙事

### 3. `gateway runtime status`

- 原因：
  - Hermes 把 runtime status 做成了正式可观测表面，而不是临时日志
- 边界：
  - `OPL` 只吸收最小 runtime-health 语义
  - 业务指标、gate outcome 与 promotion truth 继续由 domain 持有
- 对 `OPL` 的实际影响：
  - `S1` 可以稳定解释什么叫 active / interrupted / resumable / exiting runtime context

### 4. `delivery / cron substrate`

- 原因：
  - Hermes 证明定时继续、定时交付与静默投递应该属于 runtime substrate，而不是附属脚本
- 边界：
  - `OPL` 只冻结 scheduled continuation 与 durable delivery targeting 的共享合同
  - 真正的 deliverable object、approval threshold 与 publication semantics 继续留在 domain 内
- 对 `OPL` 的实际影响：
  - `S1` 可以统一解释 cron / delivery 为什么必须是 substrate，而不是各仓私有补丁

### 5. `approval / interrupt / resume`

- 原因：
  - Hermes 把 approval、interrupt、resume 做成了 runtime 的中心控制合同
- 边界：
  - `OPL` 只吸收 stop / pause / approval / interrupt / resume 的共享合同
  - 危险动作、预算、具体审批规则仍留在 domain 内
- 对 `OPL` 的实际影响：
  - `S1` 对长期在线但仍可控的运行形态有了稳定统一语言

## Adapted

下面这些设计有明显价值，但不能原样搬进 `OPL`。
它们必须经过 domain-oriented 改写后才能吸收。

### 1. `memory provider hook`

- 原因：
  - Hermes 的 hook lifecycle 很干净，适合直接成为 substrate contract
- 边界：
  - `OPL` 不吸收 user-centric memory 主线
  - `OPL` 只吸收 `prefetch / sync_turn / on_session_end / on_delegation` 这类 hook 语义
- 对 `OPL` 的实际影响：
  - `S1` 把 memory provider hook 冻结成 shared object，但要求 memory 继续是 domain-centric

### 2. `tool registry contract`

- 原因：
  - Hermes 证明 tool registry 应该是正式 runtime surface，而不是散落在 prompt 或 CLI 回调里
- 边界：
  - `OPL` 不建立全局 tool universe
  - `OPL` 只冻结 registry 的共享语义，具体 tool surface 继续保持 domain-scoped
- 对 `OPL` 的实际影响：
  - tool registry 被纳入 `approval / interrupt / resume` 对象组的共享边界，但不抽成顶层工具平台

### 3. `report / audit linkage`

- 原因：
  - Hermes 的 runtime status、delivery 与 session 之间具备天然联动
- 边界：
  - `OPL` 只吸收 linkage 语义
  - report schema、review truth 与 publish truth 继续留在 domain 内
- 对 `OPL` 的实际影响：
  - `S1` 的 adoption board 可以要求各 domain 明确 runtime status 如何进入 audit / delivery surface

## Deferred

下面这些方向在 `S1` 只保留为后续可能推进的对象，不进入当前冻结的已吸收主线。

### 1. `gateway owner process` 的统一实现

- 原因：
  - Hermes 已经证明长期在线 owner process 很重要
- 边界：
  - `OPL` 当前只能冻结 owner-process 语义，不诚实地宣称统一实现已经存在
- 对 `OPL` 的实际影响：
  - adoption board 可以把它列为 `med-autoscience` pilot 的后续目标，但不能写成 `OPL` 顶层已落地能力

### 2. 平台托管的 managed runtime

- 原因：
  - Hermes 的 owner-process 与 status 设计对 future managed runtime 很有启发
- 边界：
  - `S1` 只冻结 host-agent 与 managed runtime 的命名关系
  - 当前不实现平台托管 execution plane
- 对 `OPL` 的实际影响：
  - `OPL` 对 future migration 有了稳定语言，但仍停留在 host-agent reality

### 3. 多渠道 delivery / messaging 矩阵

- 原因：
  - Hermes 的 delivery surface 很适合更大产品
- 边界：
  - `OPL` 当前不应该把 omnichannel matrix 提升成主线
- 对 `OPL` 的实际影响：
  - `S1` 只冻结 delivery substrate，不扩张产品渠道矩阵

## Rejected

下面这些判断不应进入 `OPL` 当前主线。

### 1. 把 `OPL` 改写成通用长期在线 agent 平台

- 原因：
  - 这会直接改写产品定位
- 边界：
  - `OPL` 继续是顶层 `Gateway / Federation`
- 对 `OPL` 的实际影响：
  - 所有吸收都必须服从垂类家族定位，而不是通用平台叙事

### 2. 把 user-centric memory 做成核心卖点

- 原因：
  - `OPL` 更关心对象、证据、决策、gate 与交付记忆
- 边界：
  - user preference 不应成为顶层主线
- 对 `OPL` 的实际影响：
  - memory provider hook 必须坚持 domain-centric memory

### 3. 单体 runtime / 一个共享 execution kernel

- 原因：
  - 这会抹掉 domain gateway 与 `Domain Harness OS` 边界
- 边界：
  - `OPL` 必须继续保留 gateway、domain gateway、domain harness 的三层结构
- 对 `OPL` 的实际影响：
  - `S1` 只能冻结 contract，不能强推统一实现

### 4. 自动 skill growth 直接改写 repo-tracked mainline

- 原因：
  - 这会破坏 truth freeze 与 contract stability
- 边界：
  - 自动沉淀可以存在，但进入 repo-tracked mainline 前必须经过验证与裁决
- 对 `OPL` 的实际影响：
  - runtime substrate 不能反向变成“自动改写真相”的机制

## 当前 `S1` 吸收结论

这轮对标的直接结论是：

- `OPL` 应直接 adopted：`runtime profile`、`session substrate`、`gateway runtime status`、`delivery / cron substrate`、`approval / interrupt / resume`
- `OPL` 应 adapted 后吸收：`memory provider hook`、`tool registry contract`、`report / audit linkage`
- `OPL` 应 deferred：统一 owner-process 实现、managed runtime、omnichannel delivery matrix
- `OPL` 应 rejected：通用 agent 平台定位、user-centric memory、单体 runtime、自动 skill growth 改写主线

具体推广顺序与 activation package，见：

- `docs/references/opl-vertical-online-agent-platform-roadmap.md`
