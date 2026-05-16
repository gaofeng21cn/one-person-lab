# Hermes-Agent 真相重置与目标形态说明

Status: `history_boundary_support`
Owner: `One Person Lab`
Purpose: `hermes_naming_and_migration_provenance`
State: `support_reference_for_executor_boundary_guard`
Machine boundary: 本文是人读迁移边界和旧误读来源说明。机器可读 executor / provider 真相继续归 `contracts/opl-framework/family-executor-adapter-defaults.json`、provider contracts、源码、CLI/API 行为、runtime ledger 和 provider receipt。本文不得作为 provider、readiness、Gateway、compatibility surface 或默认执行路径的恢复依据。

> 2026-05-14 更新：本文保留为 Hermes 相关历史和迁移边界说明。OPL family runtime 的 production online 路径已经收敛为 provider-backed runtime，其中 Temporal-backed provider 是必需 substrate。旧 Hermes provider / Gateway / proof-provider / readiness / compatibility surface 不再承担 provider、默认 executor、Codex CLI 备线、可选安装模块或目标 session/wakeup substrate 角色。`hermes_agent` 是 canonical 显式非默认 executor adapter/backend，并只承诺接口连接、生命周期、回执、审计和 fail-closed。该 adapter 不承诺质量、工具语义或 resume 与 `Codex CLI` 等价。旧 Hermes provider / Gateway / proof-provider / readiness / compatibility surface 只保留为历史 provenance、诊断语料或负向 guard。最新计划见 [Temporal Family Runtime Provider 落地计划](./temporal-family-runtime-provider-plan.md)。

## 1. 为什么要做这份重置

这一轮返工的核心，不是“重新换一个更好听的命名”，而是纠正一条已经开始误导实现和文档的错误叙事：

- 我们之前一度把“参考并吸收 Hermes-Agent 的 runtime substrate 设计”
- 误写成了“仓内已经接入 Hermes-Agent”或“仓内自写一层 Hermes substrate 就等于接入 Hermes-Agent”

这两件事不是一回事。

当前必须冻结的历史命名边界是：

- `Hermes-Agent` 只指上游外部 runtime substrate 项目 / 服务本体。
- 仓内自写的 runtime helper、adapter、shim、migration scaffold、repo-local substrate，都不等于接入上游 `Hermes-Agent`。
- `hermes_agent` 是当前 canonical 显式非默认 executor adapter/backend；它不是 provider/Gateway/readiness surface，也不是默认执行器。

## 2. 当前四仓的真实状态

### 2.1 OPL

当前状态补充（2026-05-14）：本节保留的是 Hermes-first 重置时的历史判断。当前 `OPL` 已经收敛为 stage-led、provider-backed，并以 Agent executor 为最小执行单位的 family agent framework owner，持有 stage attempt、typed queue、projection、shared contracts 和 provider abstraction；`gateway / federation` 只作为 history/provenance/diagnostic vocabulary 或负向 guard 阅读。`OPL` 仍不能声称自己已经拥有上游 `Hermes-Agent` runtime，也不把 Hermes 写成默认 session/wakeup substrate、provider、proof-provider、readiness path 或兼容接口。`hermes_agent` executor adapter/backend 是单独的显式非默认接口，不能被解读成 provider 或默认路径。

### 2.2 RedCube AI

- 当前已经有可运行、可验证的视觉交付主线。
- 但当前所谓 `Hermes` 运行层，本质上仍是仓内本地实现与本地控制面。
- 它可以被称为 `repo-local managed runtime pilot`，不能被称为“已接入上游 Hermes-Agent”。

### 2.3 Med Auto Science

当前状态补充（2026-05-11）：`Med Auto Science` 是独立医学科研 domain agent。外部 `MDS / DeepScientist` 已降为 MAS 显式声明的 archive / provenance / backend audit / explicit archive import / upstream intake / diagnostic / parity oracle reference。历史上对 `controlled MedDeepScientist backend`、repo-side Hermes seam / shim 和 outer-loop contract 的描述只保留为迁移来源；它不再定义 MAS 默认 runtime owner，也不等于“已接入上游 Hermes-Agent”。

### 2.4 Med Auto Grant

- 当前已经有可运行的本地 `CLI` grant runtime 基线。
- 当前仓内所谓 `Hermes` 主线，本质仍是 repo-local runtime helper / migration scaffold。
- 它可以描述为“本地 runtime 重构试验”或“面向未来托管 runtime 的本地合同收口”，不能描述成“已切到上游 Hermes-Agent runtime”。

## 3. 什么才算真正接入上游 Hermes-Agent

本节记录 2026-05-10 之前 Hermes-first 目标的历史验收标准。当前 production online runtime 目标已经转向 Temporal-backed provider；这些条件只用于解释历史 Hermes provider/substrate 说法为什么不能被冒充为当前事实。`hermes_agent` executor adapter/backend 的当前验收另见 [Hermes-Agent 备选执行器评估](./hermes-agent-executor-evaluation.md) 与 [Family Executor Adapter Defaults](./family-executor-adapter-defaults.md)。

至少同时满足下面几类条件，历史上才可以在 repo-tracked truth 里写“已接入上游 Hermes-Agent provider/substrate”：

1. runtime substrate 的 owner 真正是上游 `Hermes-Agent`
   - session、run、event、resume、interrupt、memory、scheduler、gateway 等核心 substrate 能力，不再由仓内自写实现承担主责。

2. 仓内只保留 domain adapter / contract hydration
   - 业务仓保留 domain object、gate、audit、delivery、artifact truth。
   - runtime substrate 的长期在线能力由上游 `Hermes-Agent` 提供，而不是仓内 duplicate 一份。

3. 可以给出真实依赖或真实连接证据
   - 例如上游安装依赖、runtime root、process / service、session store、gateway endpoint、CLI/SDK adapter、版本约束，而不是只有“接口命名类似”。

4. 失败语义是真实转移过去的
   - session 恢复、掉线检测、调度、记忆、审批、中断等，不再只是仓内文档宣称，而要由真实 substrate 行为负责。

5. 文档、machine-readable contract、测试口径一致
   - README、核心 docs、program/specs、current-program pointer 与测试，不能再一边写 Hermes-Agent、一边仍靠 repo-local 假 substrate 兜底。

## 4. 历史 Hermes-first 理想形态

本节记录 2026-05-10 之前的 Hermes-first 迁移判断，已经被 provider-backed / Temporal-required production substrate 决策 supersede。当前有效目标不再是让 Hermes-Agent 成为四仓统一默认 substrate，而是让 OPL family runtime 以 Temporal-backed provider 作为 production online runtime 的必需 substrate。

`hermes_agent` 作为显式非默认 executor adapter/backend 保留。Hermes provider / Gateway / readiness / compatibility surface 只保留为历史 provenance、诊断语料或负向 guard。

### 4.1 OPL 的历史 Hermes-first 理想形态

- `OPL` 只负责顶层 gateway / federation / shared-contract。
- `OPL` 不拥有 domain runtime，也不复制 substrate。
- `OPL` 定义统一的 `Shared Runtime Contract` / `Shared Domain Contract`，并明确哪些 domain 已经真正接入上游 `Hermes-Agent`。

### 4.2 RedCube AI 的历史 Hermes-first 理想形态

- 上游 `Hermes-Agent` 持有 session / run / event / watch / memory / schedule / supervision。
- `RedCube AI` 只保留 visual domain logic：
  - source truth
  - deliverable families
  - audit / review / export / projection
  - domain-specific gate semantics

### 4.3 Med Auto Science 的历史 Hermes-first 理想形态

- 上游 `Hermes-Agent` 持有 outer runtime substrate。
- `MedAutoScience` 继续持有 study / workspace authority、publication gate、outer-loop judgment。
- `MedDeepScientist` 逐步退成受控 research backend，随后再按能力边界继续吸收或替换。

### 4.4 Med Auto Grant 的历史 Hermes-first 理想形态

- 历史设想中，上游 `Hermes-Agent` 持有长期在线 runtime orchestration、session、resume、hosted handoff substrate。
- `MedAutoGrant` 只保留：
  - `NSFCWorkspace`
  - critique / revision / final package
  - author-side grant semantics
  - grant-specific gate / audit / export truth

## 5. 历史 Hermes-first 理想形态相对当时状态的优点

- 少维护一整套自写 runtime substrate：session、memory、cron、approval、interrupt、gateway 等能力可以更多依赖上游。
- 顶层与业务仓边界更清楚：`OPL` 不再被误解成 runtime owner，各业务仓也不用一边做 domain，一边重复造 substrate。
- 更利于后续 Web / hosted 产品化：如果 runtime substrate 已经是可托管形态，产品迁移难度显著下降。
- 更利于多仓统一：formal entry、run handle、durable report、audit trail、gate semantics 可以建立在同一真实 substrate 之上，而不是三套本地 runtime 各写各的。

## 6. 历史 Hermes-first 理想形态相对当时状态的代价

- 引入上游依赖与版本耦合：要接受上游节奏、兼容性和部署要求。
- 前期适配成本上升：要把当前仓内自写的 runtime 责任重新拆回 domain logic 与 substrate adapter 两层。
- 迁移必须更诚实：尤其是当时的 `MedAutoScience` 仍与 `MedDeepScientist` 强耦合，不能靠文档硬切。当前 MAS 已完成 monolith closeout；这条只作为历史风险说明。

## 7. 历史推荐迁移顺序

本节同样保留为历史背景。当前迁移顺序以 [Temporal Family Runtime Provider 落地计划](./temporal-family-runtime-provider-plan.md) 为准：先冻结 provider abstraction，再做 Temporal stage workflow skeleton、MAS paper-line pilot、MAG/RCA controlled attempts、visibility，最后清理 Hermes-first 默认口径。

### 第一阶段：真相重置

- 回收“仓内 Hermes = 上游 Hermes-Agent”这类错误叙事。
- 在四仓统一“当前真实状态 / 理想形态 / 迁移边界 / 命名规则”。

### 第二阶段：冻结真实接入标准

- 把“什么算真正接入上游 Hermes-Agent”写成共享标准。
- machine-readable current-program 与 human-readable core docs 逐步对齐。

### 第三阶段：从较轻的 domain 开真实 pilot

- 优先在 `RedCube AI` 或 `Med Auto Grant` 这类本地闭环更强、外部 backend 依赖更少的 domain 上做真实上游接入试点。
- 先证明“上游 Hermes-Agent 真能接住 runtime substrate”，再推广。

### 第四阶段：Med Auto Science 做受控切换

- `MedAutoScience` 不应为了追求口径统一而粗暴重构。
- 应在手工测试、external gate、backend contract、真实 runtime evidence 都到位后，再做真正的 outer substrate cutover。

### 第五阶段：回到 OPL 做联邦同步

- 当时的设想是至少一个业务仓完成真实上游 Hermes-Agent provider/substrate 集成后，`OPL` 再提升顶层 runtime substrate 口径。
- 该设想已被 Temporal-backed provider 取代；当前不能把 Hermes provider/substrate 写成 OPL 目标态或既成事实，但 `hermes_agent` executor adapter/backend 仍是 canonical 显式非默认接口。
