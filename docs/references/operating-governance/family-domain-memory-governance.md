# Family Domain Memory Governance

Status: `active reference`
Owner: `One Person Lab`
Purpose: 给 OPL / MAS / MAG / RCA 的领域经验记忆提供总入口，明确哪些内容应先做自然语言 memory，哪些必须保持结构化 contract。
State: `active_support`
Machine boundary: 本文是人读治理入口。机器可读真相必须继续使用 domain-owned contract、schema、source path、stage descriptor、receipt、artifact locator、quality gate 与 runtime surface；本文不得被 runtime、测试或 dashboard 当成可执行规则源。
Currentness: 本文不冻结日期、receipt id、runtime closeout counter、writeback ref counter、provider proof snapshot、App/operator route count、worklist count 或本机 branch/SHA 状态。当前读数必须从 fresh `opl domain-memory list|inspect|migration-plan --json`、`opl runtime app-operator-drilldown --detail full --json`、`opl framework readiness --family-defaults --json` 和 `opl family-runtime evidence-worklist --family-defaults --provider temporal --executor-kind codex_cli --detail summary --json` 读取。

## 结论

OPL family 需要统一的 domain memory 管理纪律，但不应该把领域经验上收到 OPL 内容库，更不应该提前做通用 recipe engine。

当前合理形态是：

- OPL 提供 framework-level 的发现、索引、stage packet 引用、closeout writeback receipt、freshness 和 operator projection 能力。
- OPL Atlas / Pack / Stagecraft / Runway / Vault / Console / Connect 只承载 catalog、refs、prompt injection、receipt 和 projection 机制；它们不拥有 Markdown memory body、不生成 winning path、不做 route scorer、不替代 domain quality gate。
- MAS / MAG / RCA 持有各自的领域经验内容、质量判断、route 判断和 artifact authority。
- 探索性经验先以自然语言 memory card 沉淀，只加最小 metadata 方便检索、溯源、freshness 和 stage targeting。
- 已成熟且承担执行安全、质量下限、artifact 构建或 gate 判定的内容继续保持强 schema / contract / code owner。

这条规则服务 stage-led、以 Agent executor 为最小执行单位的框架原则：framework 让经验在正确 stage 被找得到，Codex CLI 在 stage 内做上下文判断，domain gate 决定是否成立。

## 总入口

以后讨论“论文套路、基金策略、视觉模式、图表模板、prompt 经验、reviewer 经验应该放哪里”时，先读本文，再按 domain 进入对应 owner 文档：

| repo | domain entry | 当前角色 |
| --- | --- | --- |
| `med-autoscience` | `docs/policies/study-workflow/publication_route_memory_policy.md` | 医学论文路线经验的 natural-language-first policy。 |
| `med-autoscience` | `docs/delivery/medical-display/README.md` | 医学图表模板是 audited display contract；图表选择和视觉审稿经验才适合进入 memory。 |
| `med-autogrant` | `docs/references/grant_strategy_memory_policy.md` | 基金 fundability、aims、reviewer grammar 与同基金任务策略经验的自然语言 memory policy。 |
| `redcube-ai` | `docs/policies/visual_pattern_memory_policy.md` | 视觉叙事、版式、风格、review failure mode 与生产质量经验的 natural-language-first policy。 |
| `one-person-lab` | 本文和 `docs/references/runtime-substrate/opl-stage-led-agent-framework-roadmap.md` | OPL 只定义 framework 发现、索引、receipt 和 owner boundary，不持有领域内容。 |

机器读总入口现在分两层：

- `opl agents descriptors --json` / `opl agents descriptor --domain mas --json` 是维护者和 App 的 domain-agent 总入口：它把 entry、stage、action、memory、skill、runtime、progress 和 artifact refs 聚合到同一个只读 descriptor。
- `opl domain-memory list|inspect|migration-plan --json` 是 memory 专题入口：它只展开 domain-owned memory locator、migration plan、proposal contract、router receipt 和 writeback receipt locator。

因此 MAS 论文路线经验库的 OPL 接入方式是：统一 descriptor 先显示 `domain_memory_descriptor.memory_ref_id=mas_publication_route_memory`，再由 memory 专题入口展开 locator / receipt / freshness。MAS Publication Strategy Memory / `publication_route_memory` 是 AI-readable Markdown reference memory；论文路线正文、案例、caveat、失败模式、路线判断、quality gate 和 writeback accept/reject 继续在 MAS domain surface 中维护。OPL 只携带 refs/status/authority boundary，不复制正文，也不变成 route recipe engine。

## OPL 品牌模块边界

长期 family 基线规则如下：

| OPL 模块 | 可以承载 | 不可以承载 |
| --- | --- | --- |
| Atlas | domain memory catalog、locator、stage applicability、freshness 和 provenance refs | memory Markdown body、领域路线解释、路线打分或质量结论 |
| Pack | stage / domain pack 中的 `knowledge_refs`、prompt injection refs、rubric refs 和 allowed-read boundary | 把 memory 正文打包成 OPL-owned 内容，或把 refs 完整性当作 launch / quality gate |
| Stagecraft | stage packet / descriptor / attempt 中的 retrieved memory refs 与 writeback proposal refs | 生成 winning path、执行 route scorer、接受或拒绝 domain writeback |
| Runway | runtime attempt ledger、consumed refs、closeout writeback receipt refs、typed blocker refs | 依据 memory ref 宣称 domain progress、publication ready、artifact ready 或 production ready |
| Vault | refs-only index、receipt locator、opaque payload ref、freshness / provenance projection | domain memory body store、domain truth store、quality verdict store 或 artifact authority |
| Console | operator drilldown 中的 memory refs、rejected writeback reason、blocked reason 和 authority boundary | 展示或编辑 memory 正文，或代替 domain owner 做 accept/reject / route verdict |
| Connect | CLI / MCP / Skill / App descriptor discovery 与 external integration refs | 把外部 connector 输出直接写成 domain memory body、route verdict 或 quality gate |

这组边界是 family 基座规则，不只适用于 MAS。MAG grant strategy memory 和 RCA visual pattern memory 复用同一规则：rich Markdown body 留在 domain；OPL 只把可审计引用送到正确 stage、operator view 和 receipt chain。

## 分类规则

### 适合自然语言 memory 的内容

这些内容通常是探索性、经验性、上下文相关，适合由 Codex 在 stage 内参考：

- 哪类数据通常能支撑什么论文路线；
- 哪类 funder / call / applicant 组合更容易讲出有竞争力的申请书；
- 哪类 visual direction、页面节奏、信息密度或行业风格更适合特定交付物；
- reviewer 常见质疑、失败路径、stop/pivot 信号；
- route / figure / proposal / deliverable 成功或失败后的可复用复盘；
- 具体 stage 中“值得考虑什么”的提示，而不是“必须执行什么”的程序。

这类 memory 的最小结构只用于检索：

- `memory_id`
- domain / family tags
- stage applicability
- source / provenance
- status / freshness
- short title

正文应保留 prose、例子、 caveat、失败模式和使用边界。

### 必须保持强 contract 的内容

这些内容承担安全、可复现、质量下限或 artifact authority，不能降成 loose memory：

- stage descriptor、action catalog、sidecar dispatch schema、attempt receipt；
- evidence ledger、review ledger、controller decision、publication / fundability / visual quality gate；
- artifact locator、canonical package、submission-ready / export gate；
- display template input schema、renderer family、layout QC、manifest；
- RCA image-first route、native PPT route、export bundle contract；
- MAG quality scorecard、quality diff、closure dossier、autonomy controller schema；
- MAS paper progress reconciler、owner route、publication eval、AI reviewer verdict。

如果某条经验已经成熟到需要自动执行，也应先上升为 domain-owned audited capability，再暴露 contract；不应直接从 memory 变成隐式 recipe engine。

### 混合层

允许存在轻量混合层，但只能做 routing / retrieval / provenance：

- `knowledge_refs`
- stage packet 中的 retrieved memory refs
- closeout memory writeback proposal
- write router receipt
- recall index / read model
- operator projection 中的 source refs

这些 surface 可以告诉 Agent “读哪些经验”，不能告诉系统“结论已经成立”。

## 当前排查结果

| repo | 类似候选 | 判断 |
| --- | --- | --- |
| MAS | `preferred_study_archetypes`、publication route bias、AI reviewer/repair 复盘 | 已适合 natural-language publication route memory；不应变成 winning-path generator。 |
| MAS | medical display template catalog / arsenal / route cookbook | 模板、schema、renderer、QC 是强 contract；“某类论文为什么选某类图、视觉审稿失败怎么修”才进入 memory。 |
| MAS | paper autonomy / route-back / weak-result handling 经验 | 适合 stage closeout 写回 memory；单篇 evidence 仍归 evidence/review ledger。 |
| MAG | fundability strategy、specific aims pattern、funder/reviewer grammar、template strategy | 适合 natural-language grant strategy memory；质量 scorecard 和 controller schema 继续结构化。 |
| RCA | xiaohongshu / PPT / poster 的视觉叙事、页面密度、风格 profile、review failure mode | 适合 natural-language visual pattern memory；image-first/native/HTML route 与 gate 继续结构化。 |
| OPL | 跨 domain memory discovery、stage injection、writeback receipt、operator projection | 适合做 framework mechanics；暂不做 OPL-owned domain content 或统一 recipe runtime。 |

## 外部经验校准

这次排查也参考了当前 agent / workflow 系统的公开文档，结论与本仓判断一致：

- LangGraph 把长期记忆按 semantic / episodic / procedural 来理解，并强调 memory type、更新时间和 namespace；这支持我们把领域经验、运行事件和执行规则分层，而不是塞进一个全局 prompt。
- OpenAI Agents SDK 的 session memory 主要负责跨 run 保存和恢复 conversation items，并支持自定义 storage / compaction；这更接近 session continuity，不等于 domain route recipe authority。
- Dify 的 Knowledge Retrieval node 把 knowledge base 检索结果作为下游 LLM context，并有 query、knowledge base、retrieval/rerank/top-k 等配置；这支持“小集合检索 + 下游推理”的形态，不支持把知识库本身当成 verdict owner。

参考：

- LangGraph memory overview: <https://docs.langchain.com/oss/python/concepts/memory>
- OpenAI Agents SDK sessions: <https://openai.github.io/openai-agents-js/guides/sessions/>
- Dify Knowledge Retrieval: <https://docs.dify.ai/en/use-dify/nodes/knowledge-retrieval>

## 支撑面与动态证据入口

本文只保存 domain memory governance 的稳定分层。当前完成度、descriptor 解析数、receipt 数、rejected write 数、per-domain evidence 分布和 App/operator 读数都必须留在 fresh read-model 或过程 ledger。

| 支撑面 | 稳定读法 | 当前证据入口 |
| --- | --- | --- |
| Domain memory contract | OPL 只冻结 locator、migration plan ref、seed corpus ref、writeback proposal ref、router receipt ref、receipt locator 和 authority boundary；不承载 memory 正文。 | `contracts/family-orchestration/family-domain-memory-ref.schema.json`、`contracts/family-orchestration/family-domain-memory-writeback.schema.json`、`family-stage-control-plane.schema.json` 的 `knowledge_refs`。 |
| Domain descriptor projection | `opl domain-memory list|inspect|migration-plan` 是 descriptor / locator / receipt projection 专题入口；resolved / missing / runtime evidence counters 是动态读数。 | `opl domain-memory list --json`、`opl domain-memory inspect --domain <domain> --json`、`opl domain-memory migration-plan --domain <domain> --json`。 |
| Runtime receipt evidence | `runtime_receipt_evidence` 只说明 OPL attempt ledger 当前观测到 consumed memory refs、writeback receipt refs、rejected writes 或 closeout refs；它不表示 retrieval apply、writeback apply、memory body migration、domain ready 或 production ready。 | `src/family-domain-memory.ts`、`opl domain-memory list|inspect --json`、stage attempt closeout ledger。 |
| App/operator projection | App/operator 只能展示 memory refs、verified writeback receipt refs、rejected write count、blocked reason 和 authority boundary；不能读取 memory body，也不能 accept/reject writeback。 | `opl runtime app-operator-drilldown --detail full --json`、runtime tray memory/writeback source 与 tests。 |
| Framework attention lens | `framework readiness` 与 `family-runtime evidence-worklist` 只报告 refs-only attention；open worklist 为 0 或 provider SLO satisfied 都不是 domain memory lane complete。 | `opl framework readiness --family-defaults --json`、`opl family-runtime evidence-worklist --family-defaults --provider temporal --executor-kind codex_cli --detail summary --json`。 |
| Domain policy owner | MAS/MAG/RCA 决定 memory body、retrieval/apply、writeback accept/reject、quality/export verdict、artifact authority 和 domain truth。 | 各 domain policy、manifest、receipt locator、owner receipt、typed blocker 与 domain-owned runtime artifacts。 |

Fresh read-model 应按下列规则解释：

- `opl domain-memory list --json` 证明当前 family index 能否解析 domain-owned memory descriptors，并投影 receipt locator / runtime receipt evidence；它不证明 memory body 已迁移、retrieval 已投产或 writeback apply 已落地。
- `opl domain-memory inspect --domain <domain> --json` 和 `migration-plan` 展开单仓 locator、proposal contract、router receipt、writeback receipt locator、migration readiness 与 authority boundary；即使 migration readiness 显示 domain-owned workspace/runtime apply surface ready，也不授予 OPL 写 memory body、接受或拒绝 writeback、写 domain truth或授权质量 verdict。
- App/operator summary 的 `memory_writeback_ref_count` 可以包含 domain dispatch 与 verified external evidence refs；它是 refs-only projection，不是 retrieval/apply landed。
- 历史 dated proof、receipt id、DM002/MAG/RCA 单次样本、closeout counter 和 branch/SHA 状态只属于 provenance。复用任何样本前必须重跑 fresh `list` / `inspect` / `migration-plan`。

## 证据门与长期候选

| Gate | 可关闭的事实 | 不能关闭的事实 |
| --- | --- | --- |
| `descriptor_projection` | OPL 能读取 domain-owned memory descriptor、locator、proposal/ref、receipt locator、freshness 和 non-authority flags。 | retrieval apply、writeback apply、memory body migration、domain ready、production ready。 |
| `runtime_receipt_evidence` | OPL 能从 stage attempt closeout ledger refs-only 投影 consumed memory refs、writeback receipt refs、rejected writes 或 closeout refs。 | OPL 接受/拒绝 writeback、写 memory body、写 domain truth、授权质量 verdict。 |
| `operator_projection` | App/operator 能按 refs/status/reason 展示 memory writeback trace、rejected writeback、safe attention 和 authority boundary。 | App release ready、domain owner-chain closed、artifact authority、memory body readable。 |
| `domain_apply_receipt` | Domain owner 可以生成 accepted/rejected apply receipt、typed blocker、owner receipt 或 no-forbidden-write proof。 | OPL-owned family memory store、统一 recipe engine、跨 domain 自动 winning route。 |
| `cross_domain_soak` | MAS/MAG/RCA 分别给出真实或 controlled stage 的 domain-owned receipt instance，并保持 OPL/Aion 只显示 refs/projection。 | 用单个 domain 的 refs 关闭全家族 apply gate，或把 evidence counter 写成 production ready。 |

后续候选只能从 fresh evidence gate 倒推：

1. 保持 memory 正文、retrieval/apply、accept/reject、fundability / visual quality 判断和 artifact authority 在 domain；OPL 只读 locator、proposal ref、receipt ref、freshness、rejected writeback reason 和 typed blocker。
2. 若 fresh read-model 显示某个 domain 已有 runtime receipt evidence，下一步应回到该 domain owner surface 生成或验证对应 provider-hosted guarded apply proof；不能在 OPL 文档里直接提升为 landed。
3. App/workbench 可以把 memory refs 从 raw refs 提升为按 domain/stage 分组的 operator view；仍不得复制 memory body。
4. Legacy Hermes/Gateway/frontdoor/local-manager/default-compat 名称只能作为 diagnostic、history、fixture 或 negative guard；默认文档/help 不得把旧 operator path 写成 retrieval/apply/runtime owner。
5. 只有三仓各自具备 domain-owned receipt instance，且 OPL/Aion 仍只显示 refs/projection，才允许 active owner doc 把对应 lane 写成 `apply_landed`；否则保持 `descriptor_projection_only`、`runtime_receipt_evidence_only` 或明确 evidence gap。

## 暂缓或禁止

以下内容现在不适合做：

- 把 50 种论文套路、基金策略或视觉模式塞进全局 prompt；
- 做 OPL-owned 跨 domain 经验库并让它持有领域真相；
- 做自动选择 winning route 的 recipe engine；
- 用统一 score 取代 MAS publication judgment、MAG fundability judgment 或 RCA visual review；
- 把 memory writeback 当成 evidence ledger / review ledger / export gate；
- 为了索引方便，把 rich prose 过早压成大量必填字段。

## 维护规则

- 新增 memory 内容时，先问它是否跨 study / grant / deliverable 可复用。
- 如果只是当前任务结果，写回当前 workspace truth；不要写进 family memory。
- 如果它影响质量 verdict、publication readiness、submission readiness 或 export readiness，必须进入 domain-owned gate / contract，不得只写 memory。
- 如果它只是提醒 Codex 探索某条路线、避免某类失败、参考某种风格或 reviewer 经验，优先写成自然语言 memory。
- OPL 文档只能解释 owner boundary 和 discovery mechanics；领域内容变化必须回到 MAS / MAG / RCA 对应文档。
