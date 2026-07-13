# OPL 与 Foundry Agents 理想目标态

Owner: `One Person Lab`
Purpose: `north_star_reference`
State: `active_support`
Machine boundary: 本文是人读目标态参考。机器可读真相继续归 `contracts/`、源码、CLI/API 行为、runtime ledger、provider receipt、domain-owned manifest、真实 workspace 与 App 证据。

## 文档读法

- 本文只写 north-star 目标态和长期 owner boundary；当前差距、实施顺序和 proof 细节回到 [OPL 当前状态与理想目标差距](../../active/current-state-vs-ideal-gap.md)、核心五件套和机器面。
- 主文档不保存历史演变、dated follow-through 或 closeout 流水。过程性记录归档到 [OPL family 文档过程归档 2026-05](../../history/process/plans/2026-05-18-opl-family-doc-process-history.md)。
- 本文不冻结日期、receipt id、worklist counter、provider proof snapshot、repo branch 状态或本机 binary 诊断；这些动态事实只从 active plan、核心五件套和 fresh CLI/read-model 读取。
- 目标态优先于现状。MAS/MAG/RCA 当前已经存在的 runtime、sidecar、status、workbench、session、memory/artifact lifecycle 或 CLI/MCP/product shell 只能作为迁移输入，不是目标态约束。
- Provider ready、descriptor aligned、skeleton evidence observed 或 provider completion 都不能写成 domain ready、publication-ready、fundability-ready、visual-ready 或 production soak complete。
- Framework readiness hard blocker、production closeout open item 或 App workorder 读数归零，也只能说明 OPL workorder accounting / refs-only transport 当前闭合；`stage_readiness_warning_count` 这类 advisory / diagnostic warning 不能被写成 domain ready blocker，也不能反向证明真实 owner-chain、App 用户路径、memory/artifact/lifecycle scaleout 或 long-soak 已完成。
- `opl agents interfaces --repo-dir <domain> --json` 返回 `status=ready` 只表示 OPL 可以从现有 descriptor / action / stage / memory / audit source 生成接口描述，并且这些描述只路由到 domain handler target。它不等于生成面已经成为生产唯一 caller，也不等于旧 wrapper、sidecar、session、workbench 或 lifecycle 面已经物理退役。
- 目标态不要求兼容旧平台面。旧模块、旧接口、旧测试、旧文档入口、旧 CLI alias、facade、wrapper、Gateway/frontdoor/Hermes/local-manager/MDS-default 等词面，只能作为迁移输入、history/tombstone/provenance 或 negative guard；一旦 replacement 与 no-active-caller proof 成立，应直接清理，不新增 compatibility alias 或第二入口。

## 目标结论

理想状态下，`OPL Framework` 是知识工程驱动的完整生产级智能体开发与运行框架。它负责开发接入、domain admission、stage-led runtime、provider-backed durable workflow、stage-attempt request/projection、attempt ledger、human gate、retry/dead-letter、memory/artifact/lifecycle locator、operator projection、App/workbench 投影、质量证据承载和跨 domain 审计。

它的智能体原则是 AI-first、AI 原生专家判断优先、contract-light。OPL 不追求把专家智能写成越来越厚的固定流程；它把开放式规划、创作、评审、路线判断、诊断和修订交给 `Codex CLI` 等 AI executor、domain stage pack、prompt、skill、knowledge、rubric 与 quality gate，让后续 AI 能力提升能直接转化为 Agent 能力提升。合同只负责 owner boundary、权限、安全、审计、receipt、阻塞、恢复、projection 和 fail-closed 这些下限，不负责替 AI executor 决定怎么思考或怎么完成专家工作，也不让机械分数、checklist 或 contract completeness 替代专家判断。

`MAS`、`MAG`、`RCA` 以及未来 Patent、Award、Thesis、Review 等 `Foundry Agents` 是基于 OPL Framework 的垂类智能体。它们持有领域知识、stage 语义、领域真相、质量 / export verdict、artifact authority、memory body 和 owner receipt；它们复用 OPL 的运行外围能力，不重复维护通用 runtime、queue、attempt ledger、session store、SQLite lifecycle engine、workspace/source shell、artifact index、memory locator、operator projection 或 generated wrapper。

理想 Foundry Agent 是：

```text
Declarative Domain Pack
  + OPL generated/hosted surfaces
  + standard authority functions
```

它不是自带一套运行平台。Domain repo 默认先把领域工作拆成专家 stage，再为每个 stage 声明提示词、工具、知识、质控、输入输出、handoff 和 receipt。工具包括 OPL 提供的通用工具、stage skill、以及无法声明化但边界清晰的私有功能，例如 MAS 的绘图 / 统计 / artifact materialization helper；知识包括领域规则、source refs、memory refs、经验卡、rubric 和 policy。只有领域裁决无法可靠声明化时，domain repo 才保留最小 authority function，例如 quality verdict、artifact mutation authorization、memory accept/reject、source readiness verdict、owner receipt signer 或 domain-specific native helper implementation。

理想 Foundry Agent 的物理源码形态也必须表达同一分层。标准 repo source tree 应让维护者不读长文档也能看出谁持有语义、谁持有合同、谁只是 authority implementation，谁是 OPL 生成或托管面：

```text
domain-agent-repo/
  agent/
    stages/
    prompts/
    skills/
    knowledge/
    quality_gates/
    policies/
  contracts/
    domain_descriptor.json
    pack_compiler_input.json
    stage_control_plane.json
    action_catalog.json
    memory_descriptor.json
    artifact_locator_contract.json
    generated_surface_handoff.json
    owner_receipt.schema.json
  runtime/
    authority_functions/
    native_helpers/
    fixtures/
  src/ or packages/
    domain handlers, authority implementations, native helpers, schema helpers
  docs/
    project.md
    status.md
    architecture.md
    invariants.md
    decisions.md
```

`agent/` 是唯一 canonical semantic pack root。`contracts/` 是机器合同和 OPL 消费边界。`runtime/authority_functions/`、`src/` 或 `packages/` 中长期保留的代码必须能归为 domain handler、minimal authority function、native helper implementation、refs-only adapter、fixture 或 diagnostic probe。任何 repo-local generic scheduler、queue、attempt ledger、state-machine runner、session store、SQLite lifecycle engine、operator workbench、generated wrapper owner、default runtime owner、compatibility facade 或 local daemon 都不是标准 OPL Agent 物理形态。

因此，`supervisor`、`scheduler`、`managed run`、`runtime manager`、`session store`、`workbench` 这类命名只允许在 active source 中作为明确的 domain bridge、refs-only adapter、diagnostic 或 history/tombstone 出现。否则即使 descriptor ready 或 functional audit 已 closed，也应列为 physical source morphology gap，继续 rename、split、delete、archive 或 tombstone。

## 语义单真相与冗余治理

Contract-light 与语义单真相并不冲突。OPL 的机器面必须少而权威，固定的是可审计边界和恢复语义，而不是智能行为本身。一个合同可以要求 stage 提供 goal、refs、owner、allowed action、expected receipt、gate 和 blocker；它不能规定 AI executor 必须按固定模板推理、必须用固定句式评审，或必须把开放式探索压成预设分支。这样才能在不牺牲安全和审计的情况下，最大程度吸收后续模型、工具和 executor 能力提升。

理想 OPL Framework 不能靠多个相似读模型分别解释“是否 ready”“谁是 owner”“哪个 surface 是生产入口”。所有面向 CLI、App、Agent、测试和文档的状态，都必须从少数权威机器面派生：

| 语义 | 唯一权威 owner | 可派生 surface | 禁止形态 |
| --- | --- | --- | --- |
| provider/runtime readiness | lifecycle-aware provider runtime inspection | `opl family-runtime status`、`opl status runtime`、`opl runtime manager`、App provider panel | 每个命令各自用 env、state file、managed projection 或旧 proof 推断 ready |
| generated surface readiness | canonical action/stage metadata 与 pack compiler input | CLI、MCP、Skill、product-entry、sidecar、status、session、workbench、OpenAI tool、AI SDK tool | domain repo 声称自己持有 generated wrapper owner，或 generated artifact 与 source metadata 漂移 |
| App/operator drilldown | summary-first OPL operator projection | App 首页、operator tray、detail drilldown、safe action route | 默认输出巨量 refs/routes，让用户和 App 把 projection 当成第二 runtime |
| stage launch guarantee | stage admission、trust boundary、scope refs、runtime assumptions、monitor refs | queue/provider/App launch gate、proof bundle、operator drilldown | 把静态 admission 写成 domain verdict，或把 observability-only projection 写成 ready |
| family runtime CLI grammar | registry + scoped parser modules | `opl family-runtime ...` public command surface | 单个超长 parser 同时承载 provider、scheduler、attempt、queue、lifecycle、evidence 语义 |
| legacy/provenance vocabulary | history/tombstone/provenance docs and negative guards | cleanup plan、audit fixture、migration record | Hermes/Gateway/frontdoor/MDS/default-compat 等旧词回到 active runtime 或默认产品入口 |

这条规则高于现有实现分布。只要一个 surface 需要回答 readiness、owner、production consumption、domain authority、App route、launch guarantee 或 legacy cleanup，它必须引用对应权威 payload；不能重新读取另一套局部状态，也不能把描述性文档、旧 proof、fixture 或 historical wording 当成当前真相。

成熟 agent/runtime 工程经验也指向同一约束：Temporal 官方模型把 workflow execution/history、activity、worker 和 task queue 拆成不同 durable execution primitive；LangGraph 官方文档把 persistence/checkpoint 用于 thread state、human-in-the-loop、time travel 与 replay；OpenAI Agents SDK 把 sessions、handoffs、guardrails、tracing 拆成独立 primitive；MCP 规范把 tools、resources、prompts 按 server capability 分开声明。OPL 吸收的是这些分层原则，不引入第二 runtime truth，也不把外部框架升级为 OPL provider、planner、executor 或 domain authority。本条参考 2026-05-19 live check 的 [Temporal Docs](https://docs.temporal.io/)、[Temporal SDK developer guide](https://docs.temporal.io/develop)、[LangGraph persistence](https://docs.langchain.com/oss/python/langgraph/persistence)、[OpenAI Agents SDK sessions](https://openai.github.io/openai-agents-python/sessions/)、[OpenAI Agents SDK handoffs](https://openai.github.io/openai-agents-python/handoffs/)、[OpenAI Agents SDK guardrails](https://openai.github.io/openai-agents-python/guardrails/)、[OpenAI Agents SDK tracing](https://openai.github.io/openai-agents-python/tracing/) 与 [MCP server concepts](https://modelcontextprotocol.io/docs/learn/server-concepts)。

## 产品分层

| 层级 | 理想职责 |
| --- | --- |
| `OPL Framework` | 开发者和技术操作者使用的智能体框架；持有 runtime、contracts、provider、queue、attempt、generated surface、scaffold、Agent Lab 与验证门禁。 |
| `Foundry Agents` | 垂类智能体产品线；持有 domain pack、stage graph、quality gate、artifact/memory authority、receipt schema 与少量 authority functions。 |
| `One Person Lab App` | 用户工作台；展示任务、阶段、进度、阻塞、人类确认点、交付物、memory refs、SLO 和下一步动作，不持有 truth。 |

目标链路如下：

```text
User / Codex / CLI / One Person Lab App
  -> OPL Framework
  -> explicit domain-agent activation
  -> stage control plane
  -> stage-attempt request/projection / provider-backed runtime
  -> selected Agent executor
  -> domain-owned stage pack
  -> domain-owned quality gate / truth reducer / artifact authority
```

## OPL Framework 理想职责

### 开发与接入

- 提供 `opl framework locate`、module install/update、domain discovery、skill sync、contract validation、skeleton validation、pack compilation 和 release surface。
- 提供统一 `domain-agent skeleton` 与 `Agent Pack Compiler`，从 descriptor、stage graph、action metadata、memory/artifact/source policy、receipt schema 和 authority manifest 派生 CLI、MCP、Skill/product-entry、sidecar、status、session、workbench 和 harness metadata。
- 提供 stage pack admission 与 proof bundle projection，统一暴露 runtime-event、idempotency、composition obligation、source/artifact/workspace scope refs、runtime assumption monitor refs、expected receipt refs、guarantee mode 和 no-forbidden-write 边界，供 queue/provider/App 在启动前 fail closed 消费。
- 提供 direct path / hosted path parity、no-forbidden-write、source fingerprint、receipt idempotency、conflict fail-closed、line budget 和 repo hygiene 验证。

### 运行与长时间在线

- Temporal-backed provider 是 production online runtime 的必需 substrate。
- `local_sqlite` 只作为 retired-provider negative guard 和 SQLite projection/index 旧名语境。
- OPL 持有 stage attempt、workflow id、activity、signal/query、heartbeat、retry/dead-letter、human gate、provider receipt、runtime event ledger 和 operator attention projection。
- OPL runtime status 与 App/workbench 必须把 provider scheduler cadence、provider SLO receipt、repair command 和 domain-daemon replacement policy 作为同一套机器读面暴露；domain repo 不安装或维护自己的 scheduler / LaunchAgent / daemon。
- `Codex CLI` 是当前第一公民 executor；`hermes_agent`、Claude Code、`antigravity_cli` 等只能作为显式非默认 executor adapter 接入。非默认 executor 必须通过 stage-level executor policy 声明 `executor_kind`、能力要求、receipt 要求与 `executor_binding_ref`；缺少 binding ref 或 receipt/audit/fail-closed 证明时不得启动，也不承诺行为或质量等价。

### 状态、记忆与文件生命周期

- OPL 持有 refs-only state/index/cache primitives、workspace locator、source receipt、memory descriptor discovery、body-free memory inventory、writeback proposal/receipt transport、artifact locator、retention、restore proof、migration ledger 和 package/export shell。
- OPL 不保存 domain memory body，不接受或拒绝 memory writeback，不写 domain truth，不改 artifact body，不给 publication/fundability/visual/export verdict。
- Domain repo 持有真实 workspace / runtime artifact root、memory body、artifact authority、quality gate 和 owner receipt。

### Workbench 与 projection

- OPL App/workbench 应提供 route graph、stage attempt drilldown、running/recent items、review/repair queue、artifact gallery、package/export lifecycle、memory refs、functional privatization audit、quality/readiness projection、provider scheduler cadence、provider SLO/repair 和 owner-aware action routing。
- OPL 应把 admitted stage 的 expected receipt / monitor freshness 缺口投影成 body-free refs-only evidence request，并提供 `record` / `verify` safe action route。该 route 只记录或验证 domain/App/live evidence refs、typed blocker refs、no-regression refs 或 owner-chain refs，不执行 domain action、不签 domain owner receipt、不声明 stage complete 或 domain ready。Stage contract 可显式声明 `expected_receipt_refs` / `monitor_freshness_refs`；OPL proof bundle 和 App workorder 必须优先投影这些 domain-owned refs，只有缺少显式 receipt refs 时才退回 `owner_receipt:<stage>` fallback，只有缺少显式 freshness refs 时才从 stage/cohort `monitor_refs` 派生 monitor freshness fallback。Record route 必须同时给出空 `payload_template`、机器可审计 `payload_workorder` 与 preflight 规则：expected receipt 只能由真实 domain receipt instance ref 或 domain-owned typed blocker 覆盖，monitor freshness 只能由真实 evidence ref 或 domain-owned typed blocker 覆盖，声明型占位 ref、OPL ledger receipt ref、memory/artifact/domain truth body 都不能被当作成功 payload。
- App 只能展示 refs、receipt、blocked reason、next owner 和 safe action；domain verdict 必须回到 domain owner surface。

## 通用能力上收边界

| 通用能力 | OPL Framework 理想职责 | Domain Agent 理想职责 |
| --- | --- | --- |
| Provider-backed workflow | stage attempt、workflow、signal/query、heartbeat、retry/dead-letter、provider receipt | 声明 stage、entry condition、allowed task、domain closeout、owner receipt、forbidden writes |
| State-machine runner | transition schema、幂等 tick、matrix runner、human gate transport、operator projection | domain transition table、guard、owner、next work unit、typed blocker、oracle fixtures |
| Workspace/source intake | workspace registry、source receipt、input pool、missing-material attention item | source truth、readiness verdict、domain blocker、go/no-go/refine |
| Memory transport | locator/index、body-free inventory、consumed refs、proposal refs、accepted/rejected receipt refs | memory body、检索策略、接受/拒绝规则、writeback receipt |
| Artifact/package lifecycle | artifact locator、retention、cleanup、restore、package/export shell、handoff navigation | canonical artifact authority、mutation permission、package/export verdict |
| Generated wrapper | 生成 CLI、MCP、Skill/product-entry、sidecar、status、session、workbench、harness metadata | descriptor、handler target、receipt schema、policy、authority function |
| Review/repair transport | blocked item queue、repair target threading、human approval、screenshot/export proof locator | review verdict、repair decision、quality/export gate |
| Native helper envelope | helper registry、environment metadata、execution receipt、version/proof index | domain helper implementation、artifact mutation logic、domain gate integration |
| Observability/SLO | trace/log/event transport、freshness/SLO、repair command projection | domain blocker meaning、safe repair hint、owner receipt refs |

## Stage 是核心组织单元

OPL 的运行逻辑以专家阶段 `stage` 为中心。标准 OPL Agent 必须先拆 stage，再定义每个 stage 的 prompt、tool、knowledge 和 quality gate。每个 stage 应接近真实专家完成复杂工作的一个阶段，而不是单个工具调用、脚本函数或后处理分支。

Stage 是 AI-first 的容器，不是把 AI 行为写死的流程节点。一个 stage 应把目标、资料、权限、质量门和交接说清楚，然后允许被选中的 executor 用当前最强的模型能力完成拆解、推理、创作、审核和修订。OPL 只在边界、receipt、审计、恢复和 owner authority 上 fail closed。

每个 stage 至少声明：

- `goal`：本阶段目标。
- `inputs`：workspace locator、source refs、上游 handoff、用户约束、memory refs、artifact refs。
- `entry_conditions`：允许进入阶段的条件。
- `executor_requirements`：默认 `Codex CLI`，显式 executor adapter 的要求和限制。
- `prompt_refs`：阶段执行、修订、总结、handoff 和必要 reviewer/auditor 的提示词入口。
- `tool_refs` / `skill_refs`：OPL 通用工具、domain skill、必要私有功能和 native helper；私有功能只能以 receipt/blocker/ref 形态服务 stage，不能绕过 stage。
- `knowledge_refs`：领域知识、source refs、memory refs、经验卡、rubric、policy、fixture 和 prior receipt refs。
- `quality_gates`：本 stage 怎么算做好；必须指向 domain-owned review / quality / export / publication gate 或 AI-first reviewer/auditor receipt。
- `gate_attempt_policy`：执行 attempt 与 reviewer/auditor attempt 必须分离。
- `source_scope_refs` / `artifact_scope_refs` / `workspace_scope_refs`：本 stage 启动前冻结的 source cohort、artifact set 与 workspace/runtime scope；OPL 只投影 refs，不拥有 source truth、artifact authority 或 workspace truth。
- `cohort_query_refs` / `trigger_refs` / `monitor_refs` / `dashboard_metric_refs`：本 stage 从“要处理哪组对象”到“由 OPL provider 怎么触发”再到“如何观察同一组对象”的闭环引用；OPL 只检查和投影闭环声明，不执行 domain 判断、不写 source truth、不生成 owner receipt。
- `guarantee_mode`：本 stage 对 App / scheduler 可声明的保证类型；`static_admission_only` 表示只能静态准入，`runtime_enforced` 需要运行时 receipt/gate 约束，`domain_owned_judgment` 表示判断归 domain owner，`observability_only` 只做可见性投影。
- `outputs`：closeout packet、artifact delta refs、owner receipt、typed blocker、human gate、writeback proposal refs。
- `handoff`：下一 stage、next owner、resume token、stop rule。

AI-first quality gate 的理想实现是“双 attempt”：执行 attempt 产出 artifact/source/evidence refs；审核 attempt 在独立 invocation、独立 context 和独立 task record 中读取这些 refs，产出 review/audit receipt。两个 attempt 可以都使用 `Codex CLI` 作为 executor，但必须是两个独立智能体任务，不能共享污染上下文，不能让同一个 agent 在同一上下文中先执行再自审并关闭质量门。

## Foundry Agents 理想职责

每个 Foundry Agent 应持有：

- 领域 stage pack、prompt、skill、knowledge、quality gate、policy table、domain schemas 和 fixtures。
- Domain transition table / spec、oracle fixture、owner action、typed blocker 和 owner receipt schema。
- Artifact locator contract、memory descriptor、memory policy、accept/reject authority 和 no-forbidden-write contract。
- Direct Codex skill path 与 OPL-hosted path 的语义等价证明。
- 少量无法声明化的 authority functions，并声明 `cannot_absorb_reason`、active caller、receipt schema、OPL 标准 ABI 和 no-forbidden-write proof。

每个 Foundry Agent 不应长期维护：

- 独立 agent runtime framework、scheduler、daemon、queue、attempt ledger、generic state-machine runner。
- Generic session store、SQLite lifecycle engine、workspace/source shell、memory locator/index、artifact/package lifecycle、review/repair transport、native-helper generic envelope。
- Generic workbench、operator projection、observability/SLO、generated CLI/MCP/product-entry/sidecar/status wrapper。

## 必要私有函数审计原则

私有函数是例外，不能用函数调用绕过 OPL stage，也不能用机械规则替代适合 AI 完成的判断。每个 domain repo 中声称必要的函数都必须逐项回答：

- 它是否直接产生 domain truth、quality / export verdict、artifact mutation authorization、memory accept/reject、source readiness、owner receipt、typed blocker 或 domain-native helper output。
- 它是否能改成 declarative pack、stage prompt/skill/knowledge refs、OPL generated surface、refs-only adapter 或 OPL primitive。
- 它的输入输出是否只通过 OPL stage receipt、typed blocker、safe action refs、locator refs 或 owner receipt 暴露。
- 它是否有 active caller、cannot absorb reason、no-forbidden-write guard、direct/hosted parity 和退役门。

AI-first 的判断必须由独立 stage output 承担。医学 publication quality、AI reviewer verdict、基金 fundability / authoring quality / export verdict、视觉 communication strategy / visual direction / review/export verdict、memory accept/reject 和 artifact mutation authorization，都应由 AI-authored stage artifact、独立 reviewer/auditor attempt 或 domain-owned gate receipt 关闭。程序只能做 validator、materializer、receipt signer、guard、locator/ref projection 或 native helper implementation；程序返回值、regex、scorecard、schema 完整性、截图机械检查、provider completion 或脚本退出码都不能升级成 ready verdict。

已知家族的长期保留函数边界如下：

| Agent | 可长期保留的私有 authority functions | AI-first 要求 |
| --- | --- | --- |
| `MAS` | publication quality verdict、AI reviewer quality decision、artifact mutation authorization、publication-route memory accept/reject、source readiness verdict、owner receipt signer、medical helper implementation | 前五项必须有独立 reviewer/auditor 或 AI-first record；代码只验证、物化、签 receipt 和阻断越权。 |
| `MAG` | fundability verdict、authoring quality/export verdict、package authority、grant strategy memory accept/reject、owner receipt signer、grant helper implementation | Codex CLI 独占 semantic route；fundability、质量、写作、评审和 export readiness 必须来自 AI-first grant stage artifact，scorecard/schema/controller 只做证据聚合和 claim guard。 |
| `RCA` | source readiness verdict、communication / visual direction decision、review/export verdict、artifact mutation authorization、visual memory accept/reject、owner receipt signer、native helper implementation、typed blocker、safe action refs | 故事、视觉方向、页面判断、review verdict 和 repair judgment 由 AI-authored visual stage artifact 持有；机械检查只表达阻断点和 rerun target。 |

目标 skeleton：

```text
domain-agent-repo/
  agent/
    stages/
    prompts/
    skills/
    knowledge/
    quality_gates/
    policies/
  contracts/
    domain_descriptor.json
    stage_control_plane.json
    action_catalog.json
    memory_descriptor.json
    artifact_locator_contract.json
    sidecar_export.schema.json
    sidecar_dispatch_receipt.schema.json
  runtime/
    authority_functions/
    native_helpers/
    fixtures/
  docs/
    project.md
    status.md
    architecture.md
    invariants.md
    decisions.md
```

## Agent 家族目标边界

| Agent | 长期保留 | 应由 OPL/App 承接 |
| --- | --- | --- |
| `MAS` | 医学研究 stage pack、study truth、AI reviewer、publication quality、artifact authority、publication-route memory body、owner receipt | scheduler/supervision、queue/attempt、SQLite lifecycle、workspace/source shell、Portal/workbench、CLI/MCP/product shell、memory/artifact transport |
| `MAG` | grant truth、fundability/quality/export verdict、specific aims、package authority、grant memory accept/reject、非权威 route context、owner receipt | product/status/user-loop/sidecar/grouped CLI、workspace/source shell、package/export lifecycle shell、memory locator、workbench、observability、semantic route transport |
| `RCA` | visual truth、communication strategy、visual direction、review/export verdict、canonical artifact、visual memory body、native helper implementation、owner receipt | session/store/wrapper、artifact gallery/handoff shell、review/repair transport、native-helper generic envelope、workspace/source shell、observability/workbench |
| future agents | domain pack、quality/export authority、memory/artifact authority、receipt signer | runtime、generated wrapper、App/workbench、lifecycle, SLO, generic transport |

## Workspace 与文件边界

Repo source 保存 source、contracts、schemas、prompts、skills、stage definitions、quality gates、projection builders、fixtures、tests 和 docs。

OPL Workspace Protocol 固定 `Workspace Group -> Project Unit -> Stage Artifact Unit -> Owner Receipt / Typed Blocker`。`one_off`、`series`、`portfolio` 都使用 series-capable skeleton；默认 physical Project Unit 集合统一为 `projects`，即新 workspace 默认生成 `projects/<project-id>`。MAS 保留 `studies` 作为 display / legacy alias 并继续把 study 映射到 Project Unit；MAG/RCA/OMA 保留 `deliverables` 作为 display / legacy alias，不定义新的 lifecycle 或 canonical physical root。

OPL Workspace Protocol 的实例级默认 projection 包括 workspace-local `workspace_inspection.json`、`workspace_resource_inventory.json`，以及每个 Project Unit 下的 `artifacts/stage_outputs/stage_outputs_index.json` 和 `artifacts/stage_outputs/current_stage.json`。这些文件服务用户检查、shared resource inventory、stage lifecycle shape、current pointer 与 App/CLI read model；它们只保存 refs、路径、状态枚举、authority false flags 和 freshness / inventory metadata，不保存 artifact body、memory body、domain truth、quality verdict 或 owner answer。Stage runtime 可以把 `current_stage.json` 写成合法非空 pointer；workspace upgrade 只能补齐缺失 projection 或刷新 OPL-owned metadata，不能把 runtime 已写入的合法 pointer 重置成空态。

Domain workspace 保存用户输入、source assets、domain truth、runtime state、controller decisions、quality records、memory pack、writeback receipts、analysis/artifact outputs、canonical deliverables 和 package/export evidence。普通用户默认检查 project-local `artifacts/stage_outputs/<stage-id>/` 与 domain-owned product views；runtime-state、SQLite sidecar、provider ledger 和 App projection 都不是默认用户检查面。

OPL/provider 保存 attempt metadata、workflow id、provider receipt、queue item、signal/query history、retry/dead-letter state、framework closeout refs、locator refs、freshness 和 operator projection。

真实运行产物、private evidence、receipt instance、memory body、PPT/PDF/PNG/DOCX/zip 等不进入 repo source tree。

Skill、MCP、App、OpenAI tool 和 AI SDK tool 的 workspace 入口必须通过 `opl workspace ensure` / `opl workspace interfaces` 派生或委托；它们不能绕过 workspace binding 自行猜测或创建目录。

## 理想完成门槛

- OPL generated/hosted surfaces 成为 MAS/MAG/RCA 的生产默认 wrapper/caller；domain repo 只保留 domain handler、refs-only adapter、authority function 或 diagnostic cleanup。
- Temporal-backed provider 能长期承载 stage attempt，并证明 restart/re-query、signal、retry/dead-letter、human gate/resume 和 no-forbidden-write。
- App/workbench 能按 owner drill down provider readiness、stage attempt、route graph、source refs、artifact refs、memory refs、quality/readiness、review/repair、SLO、expected receipt / monitor freshness evidence 和 safe actions。
- Memory / artifact / lifecycle transport 在真实 workspace 中只传 refs 和 receipt；body 与 verdict 留在 domain。
- MAS/MAG/RCA 的 private platform residue 完成 OPL 上收、generated surface 替换、refs-only 收薄或 tombstone。
- MAS/MAG/RCA 的必要私有函数完成逐项 AI-first 审计；适合 AI 评估、创作、评审或路线判断的内容都由 stage output 持有，代码不以函数调用替代 OPL stage。
- Legacy Hermes/Gateway/frontdoor/local-manager/MDS-default/compat residue 完成 no-active-caller scan、replacement proof、history/provenance 分类与 physical retirement。
- 新 Agent 默认从 OPL scaffold、domain pack、pack compiler、private surface policy 和 Agent Lab eval suite 开始，不复制旧 domain repo 的历史私有平台。

## 默认入口边界

默认目标链路保持 `Codex CLI first-class executor -> explicit OPL activation -> provider-backed stage runtime when durable orchestration is needed -> selected domain-agent entry`。MAS/MAG/RCA 的 direct app skill path 仍是一等入口；OPL-hosted path 必须回到同一 domain-owned truth、quality gate、artifact authority 和 owner receipt。当前各入口、provider、executor 和 evidence tail 状态只从 active gap plan、核心五件套、contracts/source/tests 与 fresh CLI/read-model 读取。
