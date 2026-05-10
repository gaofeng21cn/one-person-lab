# OPL Stage-Led Agent Framework Roadmap

Owner: `One Person Lab`
Purpose: `development_reference`
State: `active_support`
Machine boundary: this is a human-readable development roadmap. Machine-readable truth must live in `contracts/`, source code, CLI/API behavior, runtime ledgers, or domain-owned manifests.
Date: `2026-05-10`

## 结论

`OPL` 的目标定位应统一为 Codex-first、stage-led family agent framework。

它对标的是 DeerFlow、Dify、LangGraph、AutoGen、CrewAI、Temporal 这类 agent / workflow framework 的工程层能力，但核心差异是：OPL 不把单个 LLM 调用或轻量 agent node 当成主要原子步骤，而是把 `Codex CLI` 作为默认强执行器，把 domain `stage` 作为可观察、可恢复、可审计的语义工作单元。

`MAS`、`MAG`、`RCA` 是运行在这个 family framework 上的独立 domain agents。它们可以被 OPL 托管、唤醒、排队、投影和恢复，也可以继续通过 Codex App 的单一 app skill 直接调用。OPL 不成为这些 domain 的领域大脑、truth owner、quality gate 或 artifact authority。

## 外部工程经验

成熟系统给出的共同方向很一致：

- LangGraph 把线程、checkpoint、persistence、human-in-the-loop 和 resume 作为长期 agent 的基础能力。
- Temporal 把 durable workflow、activity、retry policy、signal/query 和 workflow history 作为可靠执行的基本单元；它是 OPL family runtime provider 的生产 substrate 候选，而不只是参考对象。
- OpenAI Agents SDK 把 handoff、guardrail 和 tracing 当作多 agent 运行的基础结构能力。
- Cloudflare Agents 强调 durable identity、state、schedule 和 event-driven agent runtime。
- Pydantic AI durable execution 把 long-running、async、human-in-the-loop 和 restart recovery 归入 durable agent 的生产可靠性问题。
- Dify、AutoGen、CrewAI、DeerFlow 等系统说明了 workflow / agent team / research flow 的组织方式。OPL 应吸收这些工程模式；其中 Temporal 与这类 agent 框架不同，可以作为 durable execution substrate 被正式评估和接入。

这些经验不支持让程序硬编码领域思路。更稳的结构是：durable state、typed handoff、checkpoint、retry/dead-letter、human gate、trace、projection 和 owner boundary 由 framework 提供；领域判断由 domain agent stage pack 和 Codex 执行器完成。

参考来源：

- LangGraph persistence: <https://docs.langchain.com/oss/python/langgraph/persistence>
- Temporal durable execution: <https://docs.temporal.io/>
- OpenAI Agents SDK: <https://openai.github.io/openai-agents-python/>
- Cloudflare Agents: <https://developers.cloudflare.com/agents/>
- Pydantic AI durable execution: <https://pydantic.dev/docs/ai/integrations/durable_execution/overview/>
- Dify workflow: <https://docs.dify.ai/>
- AutoGen: <https://microsoft.github.io/autogen/>
- CrewAI: <https://docs.crewai.com/>
- DeerFlow: <https://github.com/bytedance/deer-flow>

## 目标架构

```text
User / Codex App / OPL GUI / CLI
  -> OPL Codex-default session runtime
  -> OPL activation + stage control plane
  -> typed family queue / wakeup / approval / retry
  -> family runtime provider (Temporal target; Hermes/local legacy)
  -> domain app skill or domain capability surface
  -> Codex CLI executing a domain-owned stage
  -> domain-owned quality gate / truth reducer / artifact authority
```

OPL 负责：

- domain module discovery 与 skill sync。
- stage descriptor discovery、stage lifecycle receipt 和 handoff envelope。
- typed family queue、idempotency key、lease、retry、dead-letter。
- human gate / approval transport、notification、wakeup。
- durable session/runtime status、attempt ledger、trace projection。
- cross-domain progress、attention queue、artifact locator 和 operator dashboard。
- parity helper、manifest validation、framework-level governance。

## Temporal-Backed Runtime Provider

Temporal provider 的定位是生产级 durable substrate，不是新的领域大脑。

语义映射：

- Temporal Workflow = `stage_attempt`。一次 scout、idea、analysis-campaign、review、decision 等 stage attempt 进入可恢复 workflow history。
- Temporal Activity = `Codex CLI` stage execution、domain sidecar dispatch、artifact rebuild、review/gate replay 等可重试外部动作。
- Temporal Signal = human gate、用户插入修改要求、approval、pause/resume/stop、milestone 后 reactivation intake。
- Temporal Query = OPL App / CLI / Portal 读取 stage progress、attempt status、next owner、blocked reason、artifact refs。
- Temporal retry / timeout / heartbeat / history = OPL durable execution 的生产可靠性底座。

不迁移的内容：

- MAS/MAG/RCA 的 domain truth、quality gate、artifact/package authority 不进入 Temporal。
- Temporal 不生成研究方向、基金策略或视觉审美判断；这些仍由 domain stage pack、prompt/skill、AI reviewer/review gate 和 Codex CLI 执行器完成。
- Temporal history 只能作为 runtime audit / replay evidence，不能替代 evidence ledger、review ledger、publication_eval、submission-ready gate 或 visual export gate。

优先落地顺序：

1. Provider abstraction freeze：把 OPL family runtime provider 显式枚举为 `local_sqlite | hermes_legacy | temporal`，并声明一致的 readiness、attempt、signal、query、receipt 字段。
2. Temporal stage workflow schema：冻结 `stage_attempt_id`、domain id、stage id、workspace locator、source fingerprint、checkpoint refs、human gate refs、retry budget、closeout refs。
3. Codex CLI activity runner：把 stage prompt/skill/context packet 作为 activity input，输出 typed closeout、artifact delta refs、receipt 和 next owner。
4. Human gate signal/query/projection：把用户修改要求、approval、stop-loss、resume token 与 App 状态查询接入 Signal/Query。
5. MAS paper-line pilot：选择真实 paper line 做 read-only / guarded apply soak，证明 `stage entry packet -> Codex activity -> closeout packet -> router receipt -> progress delta / human gate / stop-loss`。
6. MAG/RCA controlled attempts：用 controlled workspace 或 fixture 证明 grant/visual stage attempt 可复用同一 provider abstraction。
7. Hermes retirement：Temporal provider 通过 readiness、soak 与 direct skill parity 后，Hermes 退到 optional executor/proof backend、legacy compatibility provider 或可选安装模块。

Domain agent 负责：

- stage sequence、stage goal、prompt、skill 和 role policy。
- domain data / source / evidence / material truth。
- quality gate、reviewer logic、submission / publication / deliverable verdict。
- artifact build、package authority 和 final export gate。
- domain-specific stop-loss、claim downgrade、route switch、revision reactivation。

Codex CLI 负责：

- 在 stage 目标与 boundary 内自主拆解、阅读、实现、运行验证、修订和交付。
- 输出 stage closeout、artifact delta、review notes、receipts 和 handoff evidence。

## 主要缺口

1. Stage descriptor 已有雏形，但还没有成为 OPL family runtime 的第一等 attempt lifecycle。
2. Domain handoff envelope 与 direct skill invocation 仍需统一成同一套 machine-readable owner split。
3. Stage attempt ledger 需要记录 executor、source fingerprint、checkpoint refs、closeout refs、cost/token、retry budget、human gate 和 dead-letter。
4. Framework guardrail 与 domain quality gate 还需要明确分层：OPL 只能检查 contract completeness、forbidden writes、freshness 和 owner boundary；domain 才能判断论文、基金、视觉交付质量。
5. Human gate 需要统一 approval request、decision receipt、resume token 和 route-back semantics。
6. Observability 需要把 stage freshness、consumed refs、rejected writes、route impact、next owner 和 artifact proof 投影到 OPL App / CLI，而不制造第二 truth。
7. Direct skill compatibility 需要被固定为开发纪律：domain skill 仍可直接被 Codex App 调用，OPL 消费的是同一 skill/action/stage catalog。

## 落地计划

### Lane 1. Family Stage Descriptor Contract

目标：把 stage 作为 OPL family framework 的正式语义单元。

交付：

- 扩展 `family-stage-control-plane` descriptor，稳定 `stage_id`、`domain_owner`、`stage_kind`、`goal`、`required_inputs`、`expected_outputs`、`skill_refs`、`prompt_refs`、`evaluation_refs`、`handoff_refs`、`authority_boundary`。
- 把 descriptor 接入 `family-product-entry-manifest-v2` discovery。
- 保持 `opl stages list|inspect` 只读，不执行 stage。

验收：

- MAS/MAG/RCA 都能声明 stage projection。
- descriptor 不包含 domain verdict 字段。
- OPL 无法通过 descriptor 生成 publication-ready、submission-ready 或 deliverable-ready 结论。

### Lane 2. Stage Attempt Ledger

目标：把一次 stage 执行变成可恢复、可审计的 attempt。

交付：

- `stage_attempt_id`、domain id、stage id、executor kind、workspace locator、source fingerprint、checkpoint refs、closeout refs、status、retry budget、human gate refs。
- attempt status 最少覆盖 `queued`、`running`、`checkpointed`、`blocked`、`human_gate`、`completed`、`failed`、`dead_lettered`。
- OPL 只记录 attempt/control metadata；stage outputs 和 quality verdict 留在 domain surface。

验收：

- OPL App 能显示 current stage attempt、freshness、last checkpoint、next owner。
- 重复 dispatch 使用 idempotency key，不重复启动同一 intent。
- failed attempt 可以指向 domain-owned resume / repair surface。

### Lane 3. Domain Handoff Envelope

目标：统一 OPL 托管调用与 Codex direct skill 调用的边界。

交付：

- `target_domain_id`、`task_intent`、`entry_mode`、`workspace_locator`、`stage_id`、`runtime_session_contract`、`return_surface_contract`、`human_gate_policy`。
- domain 返回 `receipt`、`stage_closeout_ref`、`artifact_refs`、`next_owner`、`blocked_reason`、`rejected_writes`。
- direct skill catalog 与 OPL handoff 使用同一 domain-owned action/stage metadata。

验收：

- MAS/MAG/RCA direct skill invocation 不依赖 OPL 才能解释 task。
- OPL handoff 不绕过 domain route/gate。
- OPL handoff 与 direct call 在同一 domain entry 后收敛到同一 truth surface。

### Lane 4. Guardrails And Quality Boundary

目标：防止 OPL framework 越权成为 domain truth owner。

交付：

- OPL generic guardrails：schema completeness、forbidden authority writes、stale refs、missing owner, retry budget, human gate required。
- Domain quality gates：MAS publication / AI reviewer, MAG fundability / authoring quality, RCA visual review / export gate。
- 每个 projection 明确 `projection_only`、`domain_authority_ref`、`forbidden_verdicts`。

验收：

- OPL 能阻断 forbidden write，不能宣布 domain quality pass。
- Portal / App / CLI 的 ready 类 wording 都必须回指 domain authority。
- 测试只断言 machine-readable contract，不锁 Markdown 措辞。

### Lane 5. Human Gate And Resume

目标：把用户插入指令、审批和修改要求变成可恢复的 stage event。

交付：

- approval request、user instruction intake、decision receipt、resume token、route-back policy。
- milestone package 后的用户修改要求进入 domain-owned revision/reactivation intake。
- OPL 只传递 gate/approval，不直接 patch domain artifacts。

验收：

- MAS 投稿包后 10 条修改要求进入 MAS durable revision intake。
- MAG/RCA 的用户返修进入各自 stage closeout / revision stage。
- human gate 关闭后能恢复到正确 domain stage，而不是新开第二 truth line。

### Lane 6. Observability And Operator Console

目标：让 stage-led autonomy 可见、可诊断、可追责。

交付：

- OPL App / CLI 显示 stage freshness、attempt ledger、consumed refs、artifact refs、closeout receipt、rejected writes、route impact、next owner。
- 支持按 domain、workspace、stage、human gate、dead-letter 过滤。
- trace projection 可回指 domain truth，不复制 domain truth。

验收：

- 至少 MAS 一条真实 paper line 显示 `stage entry -> Codex execution -> closeout -> router receipt -> progress delta / human gate / stop-loss`。
- MAG/RCA 至少各有一条 fixture 或 controlled workspace stage attempt。
- UI/CLI 不把 projection 写成最终质量 verdict。

### Lane 7. Direct Skill Compatibility

目标：固定“OPL 支撑运行，不垄断入口”的开发纪律。

交付：

- 每个 domain 的单一 app skill 继续作为 Codex App 可直接调用入口。
- OPL skill sync 只同步/发现，不改写 skill semantics。
- Domain action/stage catalog 是 OPL 和 direct skill 的共同元数据来源。

验收：

- 不经过 OPL，也能用 MAS/MAG/RCA skill 进入工作。
- 经过 OPL 时，调用仍回到同一 domain-owned command/action/stage surface。
- 文档和 contract 不出现“domain agent 是 OPL 内部模块”的表述。

## 开发纪律

- 后续流程优化优先调整 domain stage pack、prompt、skill、quality gate 和 descriptor，而不是把领域路线写成 OPL 脚本分流。
- OPL 可以调度、唤醒、恢复、观察和投影；不能生成领域结论、不能替 domain 宣布 ready、不能写 domain truth。
- 任何新 framework 能力必须先回答：这是 durable framework concern，还是 domain expertise concern。
- 若属于 framework concern，进入 OPL shared contract / helper；若属于 domain expertise concern，留在 MAS/MAG/RCA。
- direct skill path 是硬约束，不能为了 OPL 托管而退化。

## 推荐优先级

1. 先把 Stage Attempt Ledger 与 Domain Handoff Envelope 做成最小可用闭环。
2. 再把 Human Gate / Resume 与 Observability 接到 OPL App / CLI。
3. MAS 做真实 paper line soak，MAG/RCA 做 controlled workspace proof。
4. 最后清理旧的机械分流入口，只保留 router/audit/materializer 角色。
