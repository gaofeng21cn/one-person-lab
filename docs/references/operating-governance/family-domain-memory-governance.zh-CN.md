# Family Domain Memory Governance

Status: `active reference`
Date: `2026-05-11`
Owner: `One Person Lab`
Purpose: 给 OPL / MAS / MAG / RCA 的领域经验记忆提供总入口，明确哪些内容应先做自然语言 memory，哪些必须保持结构化 contract。
State: `active_support`
Machine boundary: 本文是人读治理入口。机器可读真相必须继续使用 domain-owned contract、schema、source path、stage descriptor、receipt、artifact locator、quality gate 与 runtime surface；本文不得被 runtime、测试或 dashboard 当成可执行规则源。

## 结论

OPL family 需要统一的 domain memory 管理纪律，但不应该把领域经验上收到 OPL 内容库，更不应该提前做通用 recipe engine。

当前合理形态是：

- OPL 提供 framework-level 的发现、索引、stage packet 引用、closeout writeback receipt、freshness 和 operator projection 能力。
- MAS / MAG / RCA 持有各自的领域经验内容、质量判断、route 判断和 artifact authority。
- 探索性经验先以自然语言 memory card 沉淀，只加最小 metadata 方便检索、溯源、freshness 和 stage targeting。
- 已成熟且承担执行安全、质量下限、artifact 构建或 gate 判定的内容继续保持强 schema / contract / code owner。

这条规则服务 Codex-first、stage-led 的框架原则：framework 让经验在正确 stage 被找得到，Codex CLI 在 stage 内做上下文判断，domain gate 决定是否成立。

## 总入口

以后讨论“论文套路、基金策略、视觉模式、图表模板、prompt 经验、reviewer 经验应该放哪里”时，先读本文，再按 domain 进入对应 owner 文档：

| repo | domain entry | 当前角色 |
| --- | --- | --- |
| `med-autoscience` | `docs/policies/study-workflow/publication_route_memory_policy.md` | 医学论文路线经验的 natural-language-first policy。 |
| `med-autoscience` | `docs/capabilities/medical-display/README.md` | 医学图表模板是 audited display contract；图表选择和视觉审稿经验才适合进入 memory。 |
| `med-autogrant` | `docs/references/grant_strategy_memory_policy.md` | 基金 fundability、aims、reviewer grammar 与同基金任务策略经验的自然语言 memory policy。 |
| `redcube-ai` | `docs/policies/visual_pattern_memory_policy.md` | 视觉叙事、版式、风格、review failure mode 与生产质量经验的 natural-language-first policy。 |
| `one-person-lab` | 本文和 `docs/references/runtime-substrate/opl-stage-led-agent-framework-roadmap.zh-CN.md` | OPL 只定义 framework 发现、索引、receipt 和 owner boundary，不持有领域内容。 |

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

## 现在适合落地

当前 OPL framework 仍在完善，因此现在已经先落地低风险、能指导迁移和后续开发的治理面，以及 locator / receipt / migration-plan 级 machine-readable contract：

- repo-tracked 人读总入口和 domain policy；
- domain skeleton 中 `agent/knowledge` / `knowledge_refs` 的 owner 语义；
- memory card 的自然语言优先形状；
- stage-specific retrieval / closeout writeback 的边界；
- OPL 统一 `domain_memory_ref` / `knowledge_ref` descriptor；
- domain-owned memory pack locator；
- closeout writeback proposal 与 acceptance/rejection receipt；
- domain-owned migration plan、seed corpus 与 writeback receipt locator 的 family projection；
- freshness / deprecation / provenance projection；
- `now / next / defer` 的实施顺序；
- 明确哪些已有 contract 不能被降级成 loose memory。

机器面入口是 `contracts/family-orchestration/family-domain-memory-ref.schema.json`、`contracts/family-orchestration/family-domain-memory-writeback.schema.json`，以及 `family-stage-control-plane.schema.json` 中的可选 `knowledge_refs`。这些 surface 只冻结 locator、migration plan ref、seed corpus ref、proposal、receipt 和 projection，不承载 memory 正文。OPL CLI 只提供 `opl domain-memory list|inspect|migration-plan` 读模型，不提供 apply；stage attempt query/workbench 只显示 typed closeout 中的 consumed memory refs、writeback receipt refs 与 rejected writes，不接受或拒绝 memory writeback。

当前完成度：

- 已完成：OPL 标准 `family_domain_memory_ref` / `family_domain_memory_writeback` 合同、stage `knowledge_refs` 和 `opl domain-memory list|inspect|migration-plan` 读模型已落地。
- 已完成：MAS 已通过标准 `domain_memory_descriptor` 暴露 `mas_publication_route_memory`，当前 OPL live binding 可解析为 1 个 resolved descriptor。
- 部分完成：MAG/RCA 已在各自 manifest / adoption contract 中暴露 domain-specific `domain_memory_descriptor_locator`，但尚未映射成 OPL 当前 `family_domain_memory_ref.v1` 标准 descriptor；因此 `opl domain-memory list` 当前会把 MAG/RCA 计为 missing descriptor，而不是 resolved memory。
- 部分完成：MAS/MAG/RCA 的政策文档已定义哪些经验适合进入 memory，哪些必须保留为强 contract。
- 未完成：真实 reusable lessons 从历史 workspace/runtime 迁移到 domain-owned memory store 的 apply receipt。
- 已完成：stage attempt query/workbench 可展示 typed closeout 带回的 consumed memory refs、writeback receipt refs 与 rejected writes。
- 未完成：stage entry 小集合 retrieval、typed closeout writeback apply，以及真实/controlled stage soak。

## 下一阶段再做

等 OPL provider-backed stage runner、closeout packet、human gate / resume 和 operator workbench 更稳定后，再做真实执行闭环：

- stage packet 的小集合 retrieval；
- App/workbench 中按 domain/stage 展示 consumed memory refs 和 rejected writebacks。
- domain router receipt 到 workspace/runtime artifact root 的真实写回 proof；
- stale/deprecated memory ref 的 operator action 和 human gate。

这些都应保持 content owner 在 domain repo，OPL 只持 locator、receipt 和 projection。

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
