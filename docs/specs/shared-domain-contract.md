# Shared Domain Contract

Owner: `One Person Lab`
Purpose: `specs_shared_domain_contract`
State: `active_spec_support`
Machine boundary: 本文是人读 spec 支撑材料。机器可读行为继续归 contracts、schema、source、CLI/API 行为、runtime ledger、生成产物和 semantic human_doc ids。

> 当前状态说明：本文作为共享 domain 行为边界参考保留。公开产品分层、admitted Foundry Agents、MDS 读法、standard domain-agent skeleton 状态、family orchestration companion schemas 和 no-bypass 边界均以核心五件套、active gap plan、`docs/active/current-development-lines.md`、`contracts/opl-framework/standard-domain-agent-skeleton-contract.json`、`contracts/family-orchestration/*.schema.json`、source/tests 与 fresh CLI/read-model 为准。当前长期读法仍是 `OPL Framework -> One Person Lab App -> Foundry Agents`：`MAS`、`MAG`、`RCA` 持有各自 domain truth、quality/export verdict、artifact authority、memory body 和 owner receipt；`OPL Meta Agent` 是 Agent Foundry / new-agent builder/tester module，不持有 MAS/MAG/RCA 的 domain truth；`MDS` 只通过 MAS 显式声明的 backend audit、source provenance、historical fixture、explicit archive import、upstream intake 与 parity oracle reference 出现。旧 `Domain Gateway` / `Domain Harness OS` 词汇只按历史内部边界、tombstone 或 provenance 语境读取，不保留兼容接口或默认路由；历史日期校准和具体 counters 归 `docs/history/**`，不得从本文冻结。

## 目的

这份文档用于冻结 `OPL` 体系下跨 domain 共享的产品语义与行为合同。
它回答的是“多个 domain agent 至少要在哪些公开行为面上保持一致”，而不是“它们是否必须共享同一套 domain object model”。

这份合同同样属于 `Unified Harness Engineering Substrate` 之内，但它与 `Shared Runtime Contract` 不是一回事。

## 它负责什么

`Shared Domain Contract` 负责冻结跨 domain 共享的上层行为语义，包括：

- formal-entry matrix
- `per-run handle`
- durable report
- audit trail
- gate semantics
- `Auto-only` 主线与 future `HITL` sibling / upper-layer 关系
- `family action graph`
- `family human gate`
- `family product-entry manifest v2`

这些内容决定的是产品如何被稳定地接入、观察、审核和推进，而不是 runtime 进程如何托管。

## 当前 v1 统一对象

当前应优先保持一致的对象和规则包括：

1. formal-entry matrix
   - 默认正式入口 `CLI`
   - `MCP` 作为 supported protocol layer
   - `controller` 仅作为 internal control surface

2. `per-run handle`
   - 每次正式运行都有可追踪身份
   - 运行身份应能稳定连接到报告、审计与交付记录

3. durable report
   - 每次正式运行都要留下稳定报告面
   - 报告面应能支持 review、promotion 与 history 对照

4. audit trail
   - 关键阶段变化必须可回看
   - 审计记录不能依赖临时对话上下文才可理解

5. gate semantics
   - gate 必须具备明确身份、证据输入与状态输出
   - 不能把未冻结的判断写成已通过 gate 的事实
   - 涉及知识交付或正式质量判断的 gate 必须有独立 stage / review surface；不能藏在执行 stage 内部函数里
   - quality/export/publication/ready 声明的 AI-first gate 必须由独立审核任务签发 receipt；同一执行 attempt 的自审只形成质量债，不阻止已有可读 artifact 进入下一 stage

6. no-bypass
   - 顶层与跨域 activation 只能指向 domain-agent entry
   - 不允许把 `OPL` 直接写成 domain-owned truth 的 runtime owner

7. AI-first / AI 原生专家判断质量边界
   - 创作判断、科学判断、审稿判断与交付质量判断继续由各 domain 拥有的 AI artifact 持有
   - 执行与审核必须分离成两个智能体任务：执行任务产出 artifact / refs / closeout，审核任务基于这些显式输入产出 gate receipt、typed blocker 或 route-back
   - shared contract、graph、gate、index、scorecard 与 projection 只能携带证据、provenance、状态与路由信号
   - `OPL` 不能把 projection-only、scorecard-only、checklist、schema completeness、contract completeness、descriptor ready 或 provider completion 信号提升成 domain-ready、quality 或 artifact verdict

8. operating posture
   - 当前 admitted mainline 统一按 `Auto-only` 理解
   - future `Human-in-the-loop` 产品应作为 sibling 或 upper-layer product 复用稳定模块，而不是把当前仓改成同仓双模

## Family Orchestration Companion Schemas

当前与这份合同并列冻结的 machine-readable companion schemas 包括：

1. `family action graph`
   - 统一 graph topology、node、edge、checkpoint policy 与 gate binding surface
2. `family human gate`
   - 统一 human review 的 request / evidence / decision / resume surface
3. `family product-entry manifest v2`
   - 统一可指向 graph、gate、resume contract 与 runtime companion 的 product-entry discovery surface

这些 schema 位于 `contracts/family-orchestration/`。
它们的作用是让上层行为语义保持一致，而不是强制所有 domain 共享一模一样的内部对象模型。

## 与 CrewAI 的关系

`CrewAI` 在这里的意义，只是提供值得吸收的 orchestration 思想来源。

家族当前并不统一：

- `CrewAI` 作为默认 `Agent` / `Crew` runtime
- `CrewAI` 作为 `LLM` wrapper 或 memory owner
- `CrewAI` 作为 domain truth owner

家族当前真正统一的是可复用的正式行为面：graph、gate、checkpoint 与 discovery 语义。

## 它不负责什么

这份合同不负责：

- 统一各 domain 的内部对象模型
- 统一各 domain 的 artifact 内容结构
- 统一各 domain 的具体评审标准
- 持有 domain 的作者 / reviewer 判断、AI-first 质量裁决，或投稿 / 发表 / 交付 ready 裁决
- 把 contract completeness 写成专家判断上限或质量 verdict
- 决定 runtime substrate 用哪一个具体实现

## 与 Shared Runtime Contract 的关系

两者关系可以简单理解为：

- `Shared Runtime Contract`
  - 冻结“怎么稳定地跑”
- `Shared Domain Contract`
  - 冻结“跑出来的正式行为如何可接入、可审计、可推进”

它们共同属于 `UHS`，但职责不同。

## 当前真实状态

截至当前公开主线，这份合同已经部分落在 OPL Framework 与当前 Foundry Agents 的共享行为面里：

- `CLI-first`
- `MCP-supported`
- `controller internal only`
- `Auto-only` mainline
- 不绕过 domain-agent entry
- domain-oriented 的 family orchestration companion schemas 已冻结为 `family action graph + family human gate + family product-entry manifest v2`

但 `per-run handle`、durable report、audit trail、gate semantics 仍在持续往 repo-verified 行为面压实，不应被夸写成“已经在所有仓完全统一实现”。

## 当前产品分层中的位置

- `one-person-lab` / `OPL Framework`
  - 负责定义这份共享产品合同的顶层语言、machine-readable companion schema、descriptor/projection/read-model 与 App/operator 消费边界。
- `one-person-lab-app`
  - 作为产品工作台消费 framework/provider 状态和 domain-owned projection；不持有 domain truth、quality/export verdict、artifact authority 或 owner receipt。
- `med-autoscience`
  - 作为医学研究 Foundry Agent，在研究 runtime 主线上把共享行为面落成真实 domain-owned 行为、receipt、typed blocker 与 review gate。
- `med-autogrant`
  - 作为基金申请 Foundry Agent，在 grant authoring 主线上把共享行为面落成真实 grant-owned 行为、receipt、typed blocker 与 quality/export gate。
- `redcube-ai`
  - 作为视觉交付 Foundry Agent，在视觉交付主线上把共享行为面落成真实 visual-owned 行为、receipt、typed blocker 与 review/export gate。

因此，这份合同是当前 Foundry Agents 共享正式行为面的顶层锚点；历史“四仓统一” wording 只按当时的 OPL + MAS/MAG/RCA 收敛语境读取。
