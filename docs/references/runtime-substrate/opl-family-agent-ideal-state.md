# OPL 与 Foundry Agents 理想目标态

Owner: `One Person Lab`
Purpose: `north_star_reference`
State: `active_support`
Machine boundary: 本文是人读目标态参考。机器可读真相继续归 `contracts/`、源码、CLI/API 行为、runtime ledger、provider receipt、domain-owned manifest、真实 workspace 与 App 证据。
Date: `2026-05-16`

## 文档读法

- `定位`：本文只写 OPL family 的 north-star 目标态和长期 owner boundary；当前完成度、验证计数和实施计划回到 gap plan、status、roadmap 与机器面。
- `当前实态校准`：带日期的校准段只记录当前代码或 fresh evidence，不把目标态写成已完成事实。
- `Owner 边界`：OPL 持有 framework/runtime/development primitives；MAS/MAG/RCA 持有 domain truth、quality/export verdict、artifact authority、memory body 和 owner receipt。
- `目标态优先`：当前 MAS/MAG/RCA 已经手写的 runtime、sidecar、status、workbench、session、memory/artifact lifecycle 或 CLI/MCP/product shell 只能作为迁移输入，不是目标态约束。标准 OPL Agent 默认由 OPL pack compiler / generated surface 承载通用外壳，domain repo 只保留声明式 pack 和极少数 authority function。
- `最短路径`：先把目标收紧为 OPL-hosted `Declarative Domain Pack`：OPL 提供 pack compiler、generated sidecar / CLI / MCP / product-entry / workbench、generic runtime primitives、functional harness 和 legacy retirement gate；domain repo 默认只提交声明式 stage / policy / schema / knowledge / receipt contract 和极少量 domain authority function。当前 P0 已落地 OPL `family_scheduler_replacement`、`functional-agent-runtime-harness`、`functional_privatization_audit`、`family-runtime-lifecycle-index` refs-only SQLite sidecar index 和完整 `Agent Lab` 控制面，后续迁移/退役 domain repo 中仍手写的通用功能残留，随后做 focused parity / no-forbidden-write / receipt 对账，最后跑 integration、provider SLO 和 live soak。
- `禁写口径`：provider ready、descriptor aligned、skeleton evidence observed 或 provider completion 都不能写成 domain ready、publication-ready、fundability-ready、visual-ready 或 production soak complete。

## 结论

理想状态下，`OPL Framework` 是完整生产级智能体开发与运行框架。它负责把开发、运行、长时间在线、状态管理、记忆管理、文件生命周期、恢复、审计、质控投影和用户工作台连接成一套可复用 framework。MAS、MAG 与 RCA 理想目标态中提到的通用 runtime、queue、workspace/source intake shell、memory locator、generic persistence / runtime lifecycle SQLite index、artifact/package lifecycle、restore/retention、projection、workbench shell、route/decision visualization、review/repair transport、native-helper execution envelope 和 observability primitive，都应优先在这一层沉淀为 family-level 能力。

`MAS`、`MAG`、`RCA` 以及未来 Patent、Award、Thesis、Review 等 `Foundry Agents` 是基于 OPL Framework 开发的垂类智能体。它们持有领域知识、stage 语义、领域真相、质量 verdict 与交付 authority；它们复用 OPL 的运行外围能力，不重复维护 scheduler、queue、attempt ledger、workspace lifecycle、artifact index、memory locator、generic persistence engine、SQLite lifecycle index、resume token、operator projection 这类通用模块。

换句话说，理想 Foundry Agent 是 `Declarative Domain Pack + minimal authority functions`，不是自带一套运行平台，也不应长期手写一层通用 thin program surface。开发、运行、托管、恢复、排队、唤醒、状态机执行、工作区生命周期、文件生命周期、App/workbench 投影、CLI/MCP/product-entry/sidecar 外壳和跨 domain 审计都应由 OPL Framework / One Person Lab App 生成或托管；Foundry Agent 默认只声明 stage 内需要做什么、使用哪些 knowledge / prompt / skill refs、如何判断质量、谁能写 truth、哪些 artifact 可变更、以及完成或阻塞时返回什么 receipt。只有在领域裁决无法可靠声明化时，domain repo 才保留最小 authority function，例如 quality verdict、artifact mutation authorization、memory accept/reject、source readiness verdict、owner receipt signer 或 domain-specific native helper implementation；每个保留函数都必须有 `cannot_absorb_reason`、active caller、receipt schema 和 no-forbidden-write proof。

这个目标态高于当前实现。MAS/MAG/RCA 今天存在的私有 scheduler、session store、SQLite index、managed runner、workspace/source intake、memory/artifact lifecycle、operator projection、native-helper envelope、sidecar、status wrapper 或 product shell，不因为“已经能跑”而成为长期设计。它们要么被 OPL primitive / pack compiler / App shell 吸收，要么被收薄成 refs-only adapter 或 authority function，要么在 active caller 迁移后直接删除或归档。例外必须被写成可审计接口，不允许用笼统的“domain 需要”保留整块私有平台。

2026-05-17 fresh 总控读模型显示，这条目标态已经落到 `functional_privatization_audit` 的机器口径：三仓合计仍有 `53` 个非知识功能审计项，但它们现在是完整追溯清单，不是默认待办清单。结构性层面 `functional_privatization_default_watchlist_count=0`、`functional_privatization_default_hidden_cleared_count=53`，同时 `opl_owned_replacement=0`、`retire_tombstone=0`、`temporary_migration_bridge=0`、`active_private_generic_residue=0`、`blocker=0`。语义等价层面也已清零：`functional_privatization_semantic_equivalence_review_count=0`、`functional_privatization_semantic_equivalence_cleared_count=53`；MAS/RCA 先前仍带 pending / should-move / active-private / handoff-required 文案的 10 项已经改成 OPL primitive consumption、OPL generated-hosted surface、refs-only adapter 或 domain minimal authority function。这个读法表示“清空”不等于代码路径数量归零，而是清掉 domain repo 对 generic runtime/platform 的长期 owner claim；真实 long soak、memory/artifact apply、App drilldown 和物理删除仍要看后续 evidence gate。同日 `domain-pack-compiler` 合同与 `opl agents pack-compiler` read model 已落地，OPL 可以从 admitted domain pack 投影 CLI、MCP、product-entry、sidecar、status、workbench 和 harness 的 generated-surface handoff metadata；它不生成 domain handler，不写 domain truth、memory body 或 artifact，也不授权质量或导出 verdict。

如果某个目标能力在当前 OPL 中还没有足够优雅的实现，处理方式是先在 OPL 层定义缺口和调研 lane。可以参考 Kubernetes、Temporal、LangGraph、Dapr、OpenAI Agents SDK、Airflow 等成熟系统的 spec/status/reconcile、durable workflow、checkpoint/store、building blocks、tools/handoff/trace 和 DAG/executor 分层模式；调研结论必须转化为 OPL generic primitive、pack compiler contract、generated surface 或 App/workbench 设计，不回流为每个 domain repo 的私有 runtime。

2026-05-17 顶层设计收紧参考了几类成熟系统模式：Kubernetes controller 把 desired spec、current status 和 reconcile controller 分离；Temporal 把 durable workflow、恢复、重试和长时间状态放在 runtime；LangGraph 把 graph checkpoint、thread state 和跨 thread store 作为运行层能力；Dapr 以 sidecar / building blocks 把 state、pub/sub、workflow、jobs 等通用外围放到应用代码之外；OpenAI Agents SDK 把 tools、handoffs 和 tracing 做成结构化运行 surface。这些模式共同支持 OPL 的目标形态：domain repo 提交可验证 spec / policy / schema / receipt，而不是继续保留私有 scheduler、ledger、SQLite lifecycle engine、workbench、sidecar adapter 或状态机 runner。OPL 的 `Agent Pack Compiler` 已具备可调用的 handoff read model，能从 domain pack 生成或装配 CLI、MCP、Skill/product-entry metadata、sidecar export/dispatch、status/read model、functional harness cases 和 App drilldown projection；手写 domain adapter 只能作为迁移桥或无法声明化的 authority boundary。

状态机也按这个边界拆分：OPL Framework 提供 generic state-machine engine，包括 transition schema、幂等 tick、attempt/retry/dead-letter、human gate transport、dispatch receipt、operator projection、transition matrix runner 和 functional runtime harness；Foundry Agents 提供 domain transition table / spec。OPL 可以验证和执行 domain 声明的 transition spec，也可以用构造状态机证明 queue、attempt、typed closeout、refs-only memory writeback、human gate、retry/dead-letter 和 repair transport 的功能性链路，但不能把 MAS 的 publication gate、MAG 的 fundability gate 或 RCA 的 visual/export gate 解释成 OPL 自己的 ready verdict。

完整 Agent Lab 是理想态中的开发与强化学习控制面。它不是 domain agent，也不是训练平台本身；它负责把任务定义、轨迹 refs、恢复探针、domain-owned scorer refs、失败分类、candidate、promotion gate、observability refs 和 online learning refs 统一成 OPL 可审计 read model。Inspect AI、METR task standard、Langfuse、Phoenix、DSPy、TextGrad 或 Agent Lightning 这类外部项目只能作为 adapter、trace backend、optimizer 或 RL consumer 接入；OPL core 继续持有 refs-only control plane，不把外部 eval log、trace store、reward model 或 optimizer 输出升级为 domain verdict 或默认 agent promotion。

基于这个边界，`opl-meta-agent` 是下一个目标态 Foundry Agent：它面向“用 OPL 开发新的高价值知识交付智能体”。它本身属于 meta-agent 类型的 Foundry Agent，但它的交付物是一个达到 baseline 要求的 OPL-compatible agent package / repo。它的默认 stage chain 是：

```text
intent intake
  -> web experience research
  -> stage decomposition
  -> agent skeleton build
  -> eval suite build
  -> baseline run
  -> optimizer iteration
  -> baseline delivery
  -> online learning
```

这个 OPL-compatible meta-agent 可以理解用户意图、检索目标领域的公开经验、拆解专家步骤、构建 descriptor / stage / action / memory / quality / artifact contract、生成 agent skeleton、通过 Agent Lab 运行 baseline、产出 prompt / skill / stage policy / tool policy candidate，并在显式 gate 后交付 baseline。后续持续在线学习只能以 trajectory refs、human/domain owner labels、scorecard refs 和 candidate refs 的形式进入 Agent Lab；不能直接写 domain memory body、不能无 gate 改默认 agent 配置、不能训练或部署模型权重作为 OPL core 行为。

`One Person Lab App` 是面向普通用户的桌面端或 Web 端工作台。它消费 OPL Framework 与 Foundry Agents 的投影，让用户看见任务、阶段、进度、阻塞、人类确认点、交付物和下一步动作。App 不持有 domain truth，也不复制 OPL runtime 或 domain runtime。

本文描述目标态，不替代当前状态判断。当前落地程度和剩余闭环以 [OPL 当前状态](../../status.md)、[OPL 架构](../../architecture.md)、[OPL Stage-Led Agent Framework Roadmap](./opl-stage-led-agent-framework-roadmap.md) 与 [OPL 生产级框架闭环差距矩阵](../../active/production-framework-closure-gap-matrix.md) 为准。

2026-05-16 校准：当前代码已经证明 OPL 不是单纯入口聚合，而是具备 descriptor discovery、stage plane、action catalog、domain memory locator、typed family queue、provider-backed stage attempt、Temporal worker/service readiness、production closeout read model、App/workbench 投影接口、`family_scheduler_replacement`、`functional-agent-runtime-harness`、`functional_privatization_audit`、`family-runtime-lifecycle-index`、完整 `Agent Lab` 控制面和 `opl agents scaffold` 的框架主干。`./bin/opl agents list --json` 当前显示三仓 `aligned_count=3`、`missing_count=0`、`drift_detected_count=0`、`physical_skeleton_evidence_observed_count=3`、`production_closure_gap_count=12`；`OPL_FAMILY_RUNTIME_PROVIDER=temporal ./bin/opl family-runtime status --json` 显示 Temporal provider `provider_ready=true`、`full_online_ready=true`、`durable_online_ready=true`；`./bin/opl framework production-closeout --json` 返回 `functional_closure_ready_for_live_soak`、`typed_blocker_count=0`、queue `total=19` / `succeeded=19`、stage attempts `total=21` / `completed=21`；`tests/src/functional-agent-runtime-harness.test.ts` fresh focused test 证明构造状态机 9 个 transition case 中 7 个 applied、1 个 fail-closed blocked、1 个 dead-letter intended，且 memory body 未进入 OPL、forbidden authority flags 为 0；`tests/src/cli/cases/workspace-domain.descriptor.test.ts` 覆盖 MAS/MAG/RCA 三种 privatized functional audit 输入形状；`tests/src/family-runtime-lifecycle-index.test.ts` 证明 OPL-owned refs-only SQLite lifecycle index 可记录 domain lifecycle refs 而不写 domain truth、memory body 或 quality/export verdict；`./bin/opl agents scaffold` 已输出 OPL-owned standard scaffold、generic primitive owner map、forbidden domain generic owner roles、functional privatization audit contract 和 legacy retirement gate，显式 `--target-dir <path> --domain-id <id>` 可生成标准 skeleton，`--validate <repo-dir>` 可校验 required dirs、contracts、authority boundary 和 forbidden generic owner guards；`opl agent-lab complete --json` 已输出 Inspect AI optional adapter、METR task-standard reference、OpenInference/OpenTelemetry refs、Langfuse/Phoenix optional connector refs、optimizer loop 与 RL transition boundary。这说明 OPL 已接近“完整智能体运行、开发、评估与优化框架”的可用骨架，并已具备替换 domain-owned generic scheduler / wakeup / supervision / persistence lifecycle index 的 owner contract、functional runtime harness、Agent Lab control plane 与新 Agent generator / validator；理想态仍要求把 domain repo 中的 legacy diagnostic path 收干净，并用真实长时 owner-chain receipts、memory/lifecycle apply receipts、optional connector 和 App drilldown 证明生产闭环。

同日校准的反例也要进入目标态边界：MAS repo 仍保留 MAS-owned local supervision scheduler、`local_launchd_on_macos` / `300` 秒 tick 和 LaunchAgent 代码，但默认 `runtime-supervision-status`、`runtime-ensure-supervision`、`runtime-remove-supervision` 消费 OPL replacement；fresh CLI 返回 `status=replacement_owner_active`、`scheduler_owner=opl_provider_runtime_manager`、`adapter_id=opl_family_runtime_provider`，legacy local adapter 当前 `status=not_installed`。local scheduler 只能作为显式 `--manager local` legacy diagnostic / cleanup path 存在，显式 local ensure dry-run 返回 `action=retired_cleanup_only`、`status=blocked`、`install_proof.reason=mas_local_scheduler_install_retired_use_opl_replacement`。理想终态下，周期唤醒、supervision cadence、provider SLO 和通用运行监管应由 OPL Framework / provider 层持有，MAS 只返回医学 owner receipt、typed blocker、route/quality/artifact refs。

执行顺序也属于目标态的一部分：已知的功能迁移、上收、清理和 template 抽取应先做，focused parity / no-forbidden-write / receipt 对账随后验证，cross-repo integration、长时 provider SLO 和 live soak 放在最后作为生产验收。不能把几乎不可一次性完成的超级大测试写成所有已知功能补足之前的门槛。

## 产品分层

目标产品认知保持三层：

1. `OPL Framework`
   开发者和技术操作者使用的完整智能体框架。它提供 CLI、module registry、domain-agent activation、stage control plane、typed queue、provider-backed runtime、state/index/cache primitives、memory locator、artifact/file lifecycle、operator projection、shared contracts、shared helpers 和验证门禁。
2. `Foundry Agents`
   垂类智能体产品线。每个 Agent 以 OPL-compatible repo / package 形态提供声明式 descriptor、stage graph、prompt / Skill / knowledge refs、policy tables、domain schemas、quality/export/readiness gates、receipt schema、artifact/memory authority contract、fixtures 和少量 domain authority functions。CLI/MCP/product-entry/sidecar/status/workbench 外壳默认由 OPL pack compiler 生成或托管；领域判断和最终交付真相归对应 Agent。
3. `One Person Lab App`
   用户工作台。它把 Framework 的 runtime truth 和 Foundry Agents 的 domain-owned projection 组织成可使用界面，包括工作区、任务、阶段、进度、交付物、人类确认点、恢复入口和关注队列。

目标链路如下：

```text
User / Codex / CLI / One Person Lab App
  -> OPL Framework
  -> explicit domain-agent activation
  -> stage control plane
  -> typed queue / provider-backed runtime
  -> selected Agent executor
  -> domain-owned stage pack
  -> domain-owned quality gate / truth reducer / artifact authority
```

## OPL Framework 的理想职责

OPL Framework 的长期职责是持有所有 domain-neutral、可跨垂类复用、服务长期自治和生产级恢复的外围能力。

### 开发与接入

- 提供 `opl framework locate`、module install/update、domain discovery、skill sync、contract validation、skeleton validation、pack compilation 和 package/release surface。
- 提供统一 `domain-agent skeleton` 与 `Agent Pack Compiler`，让新 Agent 按稳定目录、声明式 spec 和 contract 暴露能力；action catalog、CLI/MCP/product-entry/sidecar/status/projection/harness 默认从 pack metadata 派生，而不是由每个 repo 手写。当前 `opl agents pack-compiler` 已提供只读 generated-surface handoff projection，剩余是 release/dist/App consumption 和真实 owner receipt 证据。
- 提供 shared TypeScript / Python helpers 作为 compiler/runtime 内部能力或显式迁移桥，帮助 domain repo 暂时导出 action catalog、stage descriptor、runtime supervision projection、memory locator、lifecycle ledger、owner route、receipt 和 projection；generic scheduler lifecycle、cadence owner 和 generated wrapper owner 留在 OPL replacement / provider。
- 提供统一测试与验证 lane：descriptor parity、direct skill parity、OPL-hosted path、no-forbidden-write proof、artifact locator proof、restore/provenance proof 和 closeout gate。

### 运行与长时间在线

- 以 `stage_attempt` 为生产运行单元，记录 attempt id、provider kind、workflow id、stage id、workspace locator、source fingerprint、retry budget、checkpoint refs、closeout refs、human gate refs 和 owner receipt refs。
- 使用 provider-backed runtime 承担 durable workflow、worker residency、activity retry/timeout、heartbeat、signal/query、history、dead-letter 和 restart recovery。生产在线目标由 Temporal-backed provider 承接。
- 把 `Codex CLI` 作为当前第一公民 Agent executor。非默认 executor 只能通过当前 canonical registry 显式接入并产生可审计 receipt；`hermes_agent` 和 `claude_code` 同属显式非默认 executor adapter/backend，不属于 provider、默认 executor、readiness path 或兼容 fallback，也不承诺与 `Codex CLI` 行为、质量、工具语义或 resume 等价。
- 支持 pause、resume、human gate、user instruction、stop、repair、retry、dead-letter 和 handoff；每个动作都必须留下 provider receipt 或 domain owner receipt。

### 状态管理

- 统一管理 session、stage attempt、queue item、checkpoint、closeout、progress、attention item、recent item、running item、blocked reason、freshness 和 operator action history。
- 状态投影面服务 CLI、App、TUI 和外部 shell；它们读取同一套 runtime truth。
- OPL 可以保存 control metadata、locator、source refs、receipt refs、freshness 和 repair hints；domain truth、quality verdict 和最终交付 authority 保持在 domain repo / workspace owner surface。

### 记忆管理

- OPL 持有 domain memory 的 locator、descriptor、freshness、migration plan ref、seed corpus ref、consumed memory refs、writeback proposal refs 与 writeback receipt refs。
- 记忆正文、写回接受/拒绝、route 判断、质量判断和最终 truth 由 domain agent 持有。
- 理想运行中，每个 stage 明确声明需要读取的 `knowledge_refs`、可提出的 writeback、写回 owner、验收 gate 和拒绝原因；OPL 只投影这些 refs 和 receipts。

### 文件生命周期

- OPL 持有 workspace registry、runtime artifact root locator、artifact index、retention policy、safe cleanup receipt、restore proof、migration ledger 和 provenance refs。
- 真实输入文件、中间产物、运行日志、receipt 实例、交付包、manuscript、grant package、PPT deck 等运行产物属于 workspace / runtime artifact root。
- domain repo 源码目录只放 source、contract、prompt、Skill、stage definition、quality gate、projection builder、tests、fixtures 和 docs；生产运行文件不写入开发目录。

### 通用能力上收

MAS、MAG 与 RCA 理想目标态进一步明确了一条适用于所有 Foundry Agents 的上收边界：domain agent 应成为 `Declarative Domain Pack + minimal authority functions`，OPL Framework 应提供可复用的通用运行、生成外壳和产品外围。MAG 在这条边界上补充了 grant-specific 证据：funding/call intake、TODO/显式唤醒、grant strategy memory、submission-ready package、route/decision drilldown 和质量/导出投影都需要通用 transport 与 workbench 壳，但不能把 fundability、authoring quality 或 export verdict 交给 OPL。RCA 在这条边界上补充了 visual-deliverable 证据：source/workspace intake、artifact gallery、route/decision map、review/repair queue、export handoff、native helper execution 和 screenshot/export proof 都需要通用 envelope 与 workbench 壳，但不能把 visual direction、review verdict、export verdict 或 canonical artifact authority 交给 OPL。

理想态的 private functional audit 不是一句“domain repo 没有私有功能”声明。每个 OPL-compatible Foundry Agent 都必须暴露代码路径级清单，至少记录 `module_id`、owner/classification、`code_paths`、`active_callers`、`active_caller_status`、`migration_action`，并在保留 domain 内时写明 `retention_reason` 或 `cannot_absorb_reason`。OPL 统一读模型负责把这些模块归一到 OPL hosted/generated surface、declarative pack、minimal authority function、refs-only adapter、diagnostic cleanup path 或 provenance/fixture；domain repo 负责持续收薄 active caller 和删除退役面。MAS 的 SQLite/lifecycle store、MAG 的 local runtime journal / attempt ledger、RCA 的 managed-run/session store 这类历史实现，只有在 refs-only adapter、最小 authority function、显式 legacy cleanup diagnostic 或 provenance/fixture 语境中可以保留，不能作为 domain-owned generic platform 继续扩展；长期目标是由 OPL lifecycle/attempt/session primitives 替代，domain 只保留 authority refs。准入规则由 `docs/policies/domain-private-functional-surface-policy.md`、`contracts/opl-framework/standard-domain-agent-skeleton-contract.json` 和每个 scaffold 生成的 `contracts/private_functional_surface_policy.json` 固定。

| 通用能力 | OPL Framework 理想职责 | Domain Agent 理想职责 |
| --- | --- | --- |
| Provider-backed workflow | 提供 stage attempt、workflow id、query/signal、heartbeat、retry/dead-letter、restart recovery 和 provider receipt。 | 声明 stage、entry condition、allowed task、domain closeout、owner receipt 和 forbidden writes。 |
| State-machine runner / transition matrix / functional harness | 提供 transition schema、幂等 tick、attempt/retry/dead-letter、human gate transport、dispatch receipt、operator projection、table-driven matrix runner 和 constructed/domain-declared functional harness。 | 声明 domain transition table、guard、owner、next work unit、domain action、fail-closed blocker、oracle fixtures、owner receipt 和 forbidden cross-owner writes；消费 OPL harness pass 但不把它升级为 domain ready。 |
| Queue / human gate transport | 提供 typed queue、approval transport、resume token、human gate signal、operator action ledger 和 handoff history。 | 给出 human gate 边界、resume/stop-loss 语义、domain blocker 和下一 owner。 |
| Workspace / source intake shell | 提供 workspace registry、source receipt、candidate/input pool、profile/call/material locator、intake handoff、missing-material attention item 和 provenance shell。 | 持有 funding/call 解释、profile 选择策略、study/grant/source truth、source readiness verdict、blocking/residual gap 和 go/no-go 或 refine 决策。 |
| Memory locator / index / writeback transport | 提供 memory descriptor discovery、locator/index、freshness、body-free inventory、consumed refs、writeback proposal/ref transport 和 App grouping。 | 持有 memory body、领域检索策略、接受/拒绝规则、writeback receipt、route/quality judgment。 |
| Generic persistence / lifecycle SQLite index | 提供 refs-only lifecycle index、sidecar index contract、checksum/receipt ref registry、projection cache boundary 和 functional privatization audit，不写 domain truth。 | 只声明 file authority、domain sidecar reference adapter、owner receipt、artifact/memory authority 和必要的 tombstone / no-active-caller proof；不能声明 generic persistence engine owner。 |
| Artifact lifecycle / restore / retention | 提供 artifact locator、runtime artifact root registry、retention、safe cleanup、restore proof、migration ledger 和 lifecycle projection。 | 持有 canonical artifact authority、artifact mutation permission、package/export verdict 和 domain receipt。 |
| Package/export lifecycle shell | 提供 package locator、export attempt ledger、gap-report projection、delivery artifact index、artifact gallery、handoff packet navigation、restore/provenance proof 和 external-submission status shell。 | 持有 package readiness、submission/export verdict、visual/export verdict、portal/manual submission boundary 和 artifact content authority。 |
| Generated entry / wrapper surface | 从 canonical pack metadata 生成 CLI、MCP、Skill/product-entry manifest、sidecar export/dispatch、status/read model 和 focused harness cases；保留 versioned generator receipt。 | 提供 descriptor、stage graph、action intent、schema、policy、receipt contract 和少量 domain authority function；不手写通用 wrapper。 |
| Workbench shell / route visualization | 提供 workspace shell、attention queue、running/recent items、stage attempt drilldown、通用 route/decision graph renderer 和 action routing shell。 | 提供 domain-owned projection refs、route map nodes/edges、decision rationale、quality refs、artifact refs 和 typed action receipts；优先声明化，必要时才保留 projection authority function。 |
| Quality / readiness projection shell | 提供 scorecard/closure-dossier/quality-ref 展示协议、freshness、AI-reviewer-currentness 状态和 operator drilldown。 | 持有 publication/fundability/visual/authoring quality verdict、AI reviewer artifact 和 hard-issue closure 判断。 |
| Review / repair transport | 提供 blocked item queue、repair target transport、rerun request envelope、human approval lane、repair receipt threading、screenshot/export proof locator 和 repair command projection。 | 持有 review verdict、blocked item 语义、repair decision、quality gate、ready/exportable/handoffable verdict。 |
| Native helper catalog / execution envelope | 提供 helper registration、environment/provisioning metadata、execution receipt、version/proof index、operator-safe launch envelope 和 helper artifact locator。 | 持有 domain helper implementation、helper-specific proof、artifact mutation logic 和 domain gate integration。 |
| Observability / diagnostics | 提供 trace/log/event transport、freshness/SLO projection、stale scan、repair command projection 和 operator drilldown。 | 提供 domain blocker、quality/source refs、runtime health facts、safe repair hint 和 authority boundary。 |

这类上收不表示 OPL 接管 domain truth。OPL 持有的是 transport、locator、index、projection、receipt refs 和 operator workflow；医学研究路线、基金策略、fundability、specific aims、视觉策略、visual direction、review/export verdict、质量 verdict、artifact/export authority、source readiness verdict 和 memory body 继续回到对应 domain owner。

### 仍需 OPL 层实现的目标能力

对照 MAS、MAG、RCA 的理想态与当前三仓 read model，OPL 后续应优先补齐下面这些 framework 能力，而不是让 domain repo 各自复制。更硬的规则是：同一份 canonical action/stage metadata 负责派生 CLI、MCP、Skill、product-entry 与 sidecar 的 descriptor / routing metadata；OPL 只做发现、投影和校验，不派生 domain handler，也不派生 domain truth：

- `state-machine runner`：OPL 已有 domain-neutral transition schema、runner、matrix runner、generic `family_transition_spec` manifest ingestion、MAS `study-state-matrix` descriptor locator ingestion、MAG `grant_transition_oracle` ingestion、RCA `visual_transition_spec` ingestion、`family_transition_matrix_result` -> provider-hosted `family_transition/domain_tick` task bridge，以及 `functional-agent-runtime-harness`。provider-hosted transition attempt locator、runtime stage-attempt workbench 与 operator item 已 refs-only 投影 owner receipt / typed blocker / no-regression evidence；functional harness 进一步证明 queue claim、running、typed closeout、memory writeback proposal、owner writeback receipt、human gate、retry queued、dead-lettered、repair queued、unknown guard fail-closed 和 unknown transition dead-letter 的构造链路。MAS `study-state-matrix` 现在还会把 package closure / completed turn closeout 与 newer default executor execution receipt 作为 `completion_receipt_consumption` 写入 MAS-owned transition spec / matrix oracle，供 OPL 只读消费。后续继续补 MAS/MAG/RCA adapter 的真实 owner receipt / no-regression evidence 规模化对账和长时运行证据。Domain repo 提供 transition spec、receipt consumption context 与 owner receipt；OPL 只执行、hydrate、审计和投影 spec，不解释医学发表、基金 fundability 或视觉 export ready。
- `scheduler / supervision replacement`：OPL 已有 `family_scheduler_replacement` contract 与 Runtime Manager projection，owner 为 `opl_provider_runtime_manager`，adapter 为 `opl_family_runtime_provider`，命令面覆盖 provider SLO tick、domain registration intake、family runtime tick 和 runtime manager projection；authority boundary 明确禁止 OPL 写 domain truth、安装 domain daemon、写 memory body 或下质量/export verdict。后续继续推动 MAS local adapter 的 no-active-caller proof / physical retirement，以及 MAG/RCA consumer projection 的 focused integration proof。
- `provider SLO executor`：把当前 Temporal production proof / `operator_slo_repair_loop` 从 read-model 推进到 supervised cadence tick、execution receipt、overdue repair receipt、restart/re-query/signal/history 长时证据。当前 `family-runtime provider-slo tick --provider temporal` 已能在 due 时执行 production proof、fresh 时写 skipped cadence receipt、`--force` 时强制重跑；runtime snapshot / closeout 还会汇总 SLO execution receipt history 的 executed/skipped/blocked/proven counts。下一步仍需长时窗口中的周期性证据。该能力只证明 provider residency，不证明 domain ready。
- `stage attempt activity bridge`：把 typed queue、provider attempt、sidecar dispatch、typed closeout、owner receipt refs、typed blocker、no-regression evidence refs 和 no-forbidden-write proof 做成跨 domain 的稳定 transport。
- `App workbench product shell`：把 workspace/source intake、route/decision graph、review/repair queue、artifact gallery、package/export lifecycle、memory locator、transition bridge evidence、quality/readiness、observability/SLO 与 owner-aware action routing 做成 One Person Lab App 的通用工作台。
- `memory / artifact / lifecycle transport`：提供 body-free memory inventory、writeback proposal / receipt transport、runtime artifact root locator、retention / restore ledger、package/export shell 和 provenance drilldown。OPL 不保存 memory body、不接受/拒绝 writeback、不改 artifact、不下 export verdict。
- `standard scaffold / physical skeleton / legacy retirement gate`：OPL 通过 `opl agents scaffold` 持有新 Agent scaffold、checklist、显式 generator 与 validator；默认无 `--target-dir` 时只读描述，显式 `--target-dir` 才写入模板文件，`--validate` 只做机器校验。在 direct/hosted parity、replacement proof 和 provenance retention 齐备后，由 repo owner 按该 gate 做受控迁移或删除。

### 质控与审计

- OPL 提供 framework-level gate：stage closeout required-for-completion、receipt idempotency、conflict fail-closed、forbidden write protection、source fingerprint、attempt replay safety、direct/hosted parity 和 operator audit trail。
- Domain agent 提供 domain-level gate：publication quality、fundability、visual quality、submission/package readiness、artifact export verdict 和最终交付 authority。
- App 和 CLI 只展示证据、状态、owner、next action 与 refs；ready verdict 必须回到 domain-owned surface。

## Stage 是核心组织单元

理想的 OPL 运行逻辑以专家阶段 `stage` 为中心，而不是以单个工具调用、脚本节点或轻量 LLM message 为中心。每个 stage 都应接近真实专家完成复杂工作的一个阶段。

每个 stage 至少声明：

- `goal`：本阶段要完成的专家目标。
- `inputs`：输入材料、workspace locator、上游 handoff、用户约束、domain memory refs、artifact refs。
- `entry_conditions`：何时允许进入该阶段。
- `executor_requirements`：默认 `Codex CLI`，以及当前允许的显式 executor adapter 要求；退役 executor 名称只允许作为历史、诊断或负向 guard。
- `prompt_refs`：阶段提示词、审稿提示词、修复提示词、角色策略。
- `skill_refs`：Codex skill、domain skill、工具说明和可调用 surface。
- `knowledge_refs`：领域知识、记忆、文献、历史失败路径、参考 corpus。
- `tool_refs`：CLI、MCP、脚本、native helper、Office/PDF/browser 等可审计工具入口。
- `quality_gates`：domain-owned 质量 gate、review gate、export gate、publication / submission / deliverable gate。
- `outputs`：closeout packet、artifact delta refs、owner receipt refs、blocked reason、human gate refs、writeback proposal refs。
- `handoff`：下一 stage、next owner、resume token、用户确认点、stop rule。

OPL 负责 stage 的发现、排队、唤醒、恢复、投影和审计。Stage 内部的专家拆解、创作、分析、修订和质量判断由被选中的 Agent executor 与 domain-owned stage pack 完成。

## Foundry Agents 的理想职责

垂类 Agent 的目标是把领域专业性做好，把通用运行外围和生成外壳交给 OPL。它们保留 domain package 必需的声明式 pack 和最小 authority functions，但不承担 generic framework/runtime，也不长期手写可由 OPL pack compiler 派生的薄程序面。

判断标准按目标态执行，而不是按当前仓库形态执行。一个现有模块只要承担跨 domain transport、ledger、index、lifecycle、workbench、runner、scheduler、session、status、generated wrapper、review/repair transport、native-helper envelope 或 observability，就默认是 OPL 上收或 generated surface 替换候选。只有直接作出 publication/fundability/visual/export verdict、memory accept/reject、artifact mutation authorization、source readiness verdict、owner receipt signing 或 domain-native helper mutation 的最小部分，才可能保留在 domain。

每个 Foundry Agent 应持有：

- 领域 `Declarative Domain Pack`：领域 stage pack、路线/策略知识、quality rubric、memory policy、artifact authority contract、owner receipt schema、domain schemas、transition table、fixtures 和 authority policy。
- 领域 ontology、任务类型、stage pack 和 route policy。
- 领域 prompt、Skill、tool policy、knowledge refs 和 memory writeback policy。
- 领域 truth reducer、quality gate、review gate、artifact/package authority；能声明化的先写 policy/table/schema，不能声明化的才保留最小函数。
- OPL-generated sidecar export / dispatch surface 所需的声明式 metadata；domain-owned 手写 sidecar 只作为迁移桥。
- OPL-readable descriptor、receipt schema、projection spec、artifact locator contract 和 lifecycle policy。
- domain transition spec/table、oracle fixture、owner action、typed blocker、focused tests 和 domain entry。
- Direct Codex skill path 与 OPL-hosted path 的语义等价证明。

每个 Foundry Agent 不需要重复维护：

- 独立 agent runtime framework 或通用运行平台。
- 长时间在线 runtime substrate。
- 通用 queue / retry / dead-letter / human gate transport。
- stage attempt ledger。
- generic state-machine runner / transition matrix runner。
- framework-level state cache 和 operator projection。
- workspace registry、artifact index、retention、restore proof 和 migration ledger 的通用实现。
- generic memory service、memory locator/index、body-free inventory projection 和 writeback transport。
- generic workspace/source intake shell、profile/call/material locator、source receipt provenance、missing-material attention item 和 intake handoff transport。
- generic workbench navigation、attention queue、running/recent items、route graph renderer、transition evidence drilldown、notification 和 cross-domain dashboard。
- generic package/export locator、gap-report projection、delivery artifact index、artifact gallery、handoff shell 和 external-submission status shell。
- generic review/repair transport、blocked item queue、repair target threading、screenshot/export proof locator 和 human approval lane。
- generic native helper catalog、execution envelope、version/proof index、helper artifact locator 和 operator-safe launch shell。
- generic observability transport、trace/log/event collection、freshness/SLO projection、stale scan 和 repair command projection。
- family-level skill sync、module install、contract discovery 和 App 投影协议。
- generated CLI/MCP/product-entry/sidecar/status wrapper、generic projection builder、generic session store 和 generic product shell。

目标 skeleton 如下：

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

该 skeleton 是 OPL 发现、托管、审计和投影所需的外部边界。`runtime/authority_functions` 只放确实无法声明化的领域裁决、artifact mutation authorization、memory accept/reject、owner receipt signer 或 native helper implementation；`sidecar`、`projection_builders`、`lifecycle_adapters` 这类通用外壳长期应由 OPL 生成或托管。OPL-facing skeleton 与 docs taxonomy 应在 MAS/MAG/RCA 以及后续 domain agents 之间保持一致；Domain 内部可以继续使用最适合自己的语言、包结构、数据格式和专业 workflow，但不能因此复制通用运行平台。

## 当前与未来 Agent 家族

| Agent 家族 | 理想 domain truth owner | 典型 stage | 最终 authority |
| --- | --- | --- | --- |
| `Research Foundry / MAS` | 医学研究设计、证据、分析、审稿、publication route、manuscript/package truth | study intake、evidence preparation、analysis campaign、manuscript authoring、AI reviewer、publication decision | MAS-owned publication / manuscript / package gate |
| `Grant Foundry / MAG` | 基金方向、fundability、specific aims、proposal strategy、review/rebuttal truth | call intake、fundability strategy、aims design、proposal authoring、review/revision、package gate | MAG-owned grant / submission readiness gate |
| `Presentation Foundry / RCA` | 视觉策略、叙事结构、PPT/图像/报告交付、review/export truth | source intake、communication strategy、visual direction、artifact creation、review/revision、handoff/export | RCA-owned visual quality / artifact export gate |
| `IP Foundry` | 专利交底、权利要求、实施例、检索和答复 truth | invention intake、prior art review、claim strategy、drafting、review/revision、filing package | Patent agent-owned patent package gate |
| `Award Foundry` | 科技奖材料、成果叙事、证明材料和评审口径 truth | award intake、evidence assembly、impact narrative、document drafting、review/revision、package gate | Award agent-owned award package gate |
| `Thesis Foundry` | 学位论文结构、章节、格式、答辩材料和学术合规 truth | thesis intake、chapter plan、writing、format/references、defense preparation | Thesis agent-owned thesis package gate |
| `Review Foundry` | 审稿、回复、修回策略和版本交付 truth | review intake、critique mapping、response strategy、revision drafting、final response package | Review agent-owned revision / response gate |

`MDS` 保持 MAS 声明的 backend audit、source provenance、historical fixture、explicit archive import、upstream intake 或 parity oracle reference；它不作为独立 Foundry Agent 进入 OPL 顶层产品线。

## Workspace 与运行文件边界

理想情况下，每次 domain Agent 运行都有明确 workspace。Workspace 是运行时真相和文件生命周期的承载点。

Workspace 应保存：

- 用户输入、原始资料、source refs 和 ingest receipts。
- 运行状态、stage attempt receipts、domain owner receipts、human gate receipts。
- 中间产物、分析结果、审稿意见、artifact deltas 和最终交付物。
- domain memory body、accepted/rejected writeback receipt、restore proof、retention receipt。
- App / CLI 需要展示的只读投影源。

Domain repo 应保存：

- 源码、contract、schema、prompt、Skill、stage definition、quality gate、projection builder、tests 和文档。
- 小型 fixture 或模拟数据，但必须与真实运行产物区分。

OPL 应保存：

- workspace locator、artifact locator、runtime root locator、attempt metadata、queue metadata、receipt refs、freshness、provenance refs、repair hints 和 operator projection。

这个边界能保证开发目录干净、可审查、可发布；运行文件有生命周期、可恢复、可清理、可迁移；用户工作和 domain truth 不被 framework 源码目录污染。

## One Person Lab App 的理想职责

One Person Lab App 面向用户，不面向 framework 内部实现。理想 App 应提供：

- `Agents`：展示已安装 Foundry Agents、能力范围、当前 readiness、可启动 stage 和 direct / hosted path。
- `Workspaces`：展示用户工作区、资料、运行状态、artifact root、recent activity 和 cleanup / restore 状态。
- `Sessions`：展示普通 Codex session、OPL-hosted stage attempt、resume token 和历史上下文。
- `Progress`：展示 stage、当前 owner、blocked reason、human gate、next action、freshness 和 quality refs。
- `Route / Decision`：展示 domain-owned route map、decision trail、分支、失败/阻塞原因、转向理由、superseded path、active/winning path、route node/edge 和 source refs。App 提供通用图形壳与 drilldown，不推断 domain route 或质量。
- `Review / Repair`：展示 domain-owned review verdict、blocked item、repair target、rerun request、human approval、repair receipt、screenshot/export proof 和 residual risk；App 只提供通用队列和 drilldown。
- `Artifacts`：展示交付物、artifact deltas、artifact gallery、package refs、export state、handoff packet、restore proof 和 provenance。
- `Attention Queue`：汇总需要用户确认、需要修复、需要等待 provider、需要 domain owner action 的事项。
- `Operator Drilldown`：在不越权写 domain truth 的前提下，展示 provider receipt、domain receipt、memory refs、artifact locator 和 repair command。

### 运行状态页 / Runtime Workbench 理想形态

理想的 OPL 运行状态页应是面向人的状态工作台，而不是巨大 raw snapshot 的直接渲染。它消费 `opl runtime snapshot`、family runtime provider、stage attempt ledger、domain-owned projection、workspace / artifact locator 和 source refs，把普通用户与操作者真正需要判断的状态放在第一屏。

第一屏应采用中文优先、dense、status-first 的工作台布局：顶部指标条展示整体健康、provider readiness、最后更新时间、数据 freshness、运行中数量、OPL 正在处理数量、需用户处理数量、后台恢复数量和近期项目数量；下面使用 segmented filter 或 tabs 按 lane 分组展示 `运行中`、`用户处理`、`OPL 正在处理`、`后台恢复` 与 `近期项目`。CLI 命令只作为 probe / debug / repair 证据留在详情层，不作为普通用户主操作面。

每个 runtime item 卡片应固定展示：

- Agent / domain、workspace、stage、active run、当前 owner、下一步动作、blocked reason、freshness 和状态来源。
- source refs、artifact refs、portal / workbench 链接、artifact/package/export 状态，以及可打开的 workspace 或交付物入口。
- owner-aware action：用户确认、provider signal、OPL repair、domain sidecar / direct skill / product entry action 必须分清 owner；不可把按钮做成无 owner 的通用“继续”或“修复”。

Stage attempt drilldown 应展示 attempt id、provider kind、workflow / activity 状态、heartbeat、checkpoint refs、closeout refs、receipt refs、human gate refs、dead-letter、resume refs、rejected writes、route impact、provider completion 与 domain ready verdict 的区别。Provider completion 只能说明 transport / workflow 完成，不能写成 domain readiness、quality verdict 或 artifact/export readiness。

Domain agent drilldown 应按 MAS / MAG / RCA 以及后续 Foundry Agents 展示 domain-owned projection：质量 / publication / fundability / visual / export verdict、domain route、review / repair queue、artifact authority、receipt refs 和可执行 action。OPL App 只展示投影、路由、owner、source refs 和 action transport；不持有或改写 domain truth，不替代 domain-owned ready verdict。

基础设施与恢复面板应展示 provider、queue、worker、native helpers、module install 状态、dirty / ahead / behind 开发状态、repair command、latest proof、SLO / freshness 和 degraded reason。开发状态应作为诊断信息展示，不应在没有 install / update / repair action 时误导为不可用或必须更新。

详情层默认折叠 raw refs、命令、JSON pointer、payload 摘要和 schema refs，只在开发者详情或操作者 drilldown 中展开。普通用户优先看到当前状态、原因、谁负责、下一步和可安全点击的动作；操作者可以继续下钻到 receipt、source ref、repair command 与 provider/domain 边界。

App 中的按钮和动作必须路由到明确 owner：

- framework-level 动作走 OPL CLI / Runtime Manager。
- provider-level 动作走 family runtime provider signal / query / repair。
- domain-level 动作走 domain sidecar / direct skill / domain CLI / domain product entry。
- quality verdict、publication verdict、fundability verdict、visual verdict、artifact authority 回到 domain-owned gate。

## 新垂类 Agent 的开发路径

理想开发者体验如下：

1. 创建 OPL-compatible domain repo / package。
2. 声明 `domain_descriptor`、stage control plane、action catalog、memory descriptor、artifact locator contract 和 authority boundary。
3. 编写 `agent/stages`、prompts、skills、knowledge refs 与 quality gates。
4. 实现 domain sidecar export / dispatch receipt 和 projection builder。
5. 定义 workspace/runtime artifact root 策略、retention policy、restore proof 和 no-forbidden-write rule。
6. 运行 OPL skeleton validation、contract validation、direct skill parity、OPL-hosted dry run、controlled apply、closeout gate 和 artifact locator proof。
7. 让 OPL Framework 安装、发现、托管、唤醒、投影和恢复该 Agent。
8. 让 One Person Lab App 以同一套 projection 显示该 Agent。

开发者主要维护领域专业内容和质量边界；OPL 提供可复用的生产运行外围。

## 理想完成门槛

OPL 与 Foundry Agents 达到理想生产级状态时，应满足以下门槛：

- OPL production provider 长期 ready：service、worker、query/signal、retry/dead-letter、restart recovery、operator repair 都有持续证据。
- OPL generic state-machine runner 可消费 MAS/MAG/RCA 声明的 domain transition table / spec，并用 matrix runner 验证输入状态组合到 route/work-unit/action/receipt 的转换；sidecar/export 返回的 matrix result 可进入 provider-hosted transition task；OPL 不持有 domain gate 语义。
- 每个 admitted Agent 同时通过 direct Codex skill path 与 OPL-hosted path，并留下语义等价和 no-regression evidence。
- 每个 stage attempt 都有 typed closeout、checkpoint、owner receipt、blocked reason 或 human gate receipt。
- OPL 只持 refs、locator、metadata 和 projection；domain truth、quality verdict 和 artifact authority 留在 domain owner。
- Memory retrieval、writeback proposal、accepted/rejected receipt 和 migration plan 在三仓以上泛化。
- File lifecycle、retention、safe cleanup、restore proof 和 migration ledger 在 workspace/runtime root 上可运行。
- Source/workspace envelope、artifact gallery、route/decision graph、review/repair transport、native-helper execution envelope 和 observability projection 在 MAS/MAG/RCA 之间泛化，同时保持 domain-owned verdict。
- App 能展示用户关心的状态和动作来源，不把 provider completion 写成 domain ready verdict。
- Domain repo 不写入真实 runtime artifacts；运行文件全部进入 workspace / runtime artifact root。
- 旧 Hermes-first、Gateway/frontdoor、local manager、MDS-default 等历史默认面完成 active-path 退役；active surface 不保留兼容接口，旧名称只在 diagnostic、fixture、provenance、history 或负向 guard 语境保留。

## 当前使用方式

本文适合作为新增垂类 Agent、规划 OPL production closure、设计 App runtime workbench、评估 shared module 上收范围时的目标态参考。MAS/MAG/RCA 的单仓理想态和仓内完善计划由对应 domain repo 自己维护；OPL 只保留 framework-level 上收边界、shared primitives、domain admission 和 App/workbench 目标。

实际实施时按当前状态递进：

- 当前 truth 读核心五件套。
- 当前闭环差距读 production gap matrix。
- Runtime/provider 执行路线读 stage-led roadmap 和 Temporal plan。
- Domain-specific truth 回到 MAS/MAG/RCA 各自仓库。
- 新增机器接口写入 `contracts/`、源码、CLI/API 行为或 domain-owned manifest，不写入本文。
