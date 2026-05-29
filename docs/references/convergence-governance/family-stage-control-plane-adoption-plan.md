# OPL Family Stage Control Plane Adoption Plan

Owner: `One Person Lab`
Purpose: `support_reference`
State: `support_reference`
Machine boundary: this is a support reference and rationale. Machine truth lives in `contracts/family-orchestration/family-stage-control-plane.schema.json`, domain product-entry manifests, fresh `opl stages list|inspect|readiness`, launch-admission gates, runtime ledgers and domain-owned receipts.

Currentness policy：本文是 stage control plane 的 adoption rationale，不是 active execution board，也不冻结任何一次 stage、conformance、default-caller、framework、worklist 或 App/operator counter。使用本文判断当前 landing 状态时，必须重新读取 `opl stages list|inspect|readiness`、`opl agents conformance --family-defaults --json`、`opl agents default-callers --family-defaults --json`、`opl framework readiness --family-defaults --json`、`opl family-runtime evidence-worklist ... --json` 和 `opl runtime app-operator-drilldown --json`。本文的 MAS/RCA/MAG/OMA stage sequence、inventory 和实施顺序只能作为 design/adoption 支撑，不能被当成 workflow engine landed、domain default caller complete、owner-chain closeout、artifact authority、quality verdict 或 App release-ready 证据。

## 结论

`stage` 作为控制面的方向已经从 MAS 经验提升为 OPL family 的通用支撑面：当前 OPL 能通过 `family-stage-control-plane` contract 和 domain manifest 发现 MAS、MAG、RCA 的 stage pack，并由 `opl stages list|inspect|readiness` 提供只读 discovery、parity、admission 和 readiness drilldown。

关键不是把程序写得更“弱”，而是把程序的责任从“替专家和 Codex CLI 决定每一步怎么做”收回到“定义阶段目标、可用 skill、提示词、输入输出、评价方法、交接条件与审计证据”。真正的创作、判断、拆解、修订和问题解决，应交给具备自主能力的 `Codex CLI` 与 domain-owned AI workflow。

这符合 `AI-first` 原则：

- 利用 `Codex CLI` 的自主拆解与执行能力，而不是用脚本把执行路径规定死。
- 让 AI 承担写作、审核、改稿、设计、诊断、评价等专家工作，而不是让程序用大量机械规则模拟专家。
- 让程序负责可验证的控制面、状态面、证据面和边界面，而不是成为领域创造力的瓶颈。

## 为什么这会简化架构

过度脚本化的流程通常会带来三个问题：

- 每个领域都堆出自己的流程引擎、状态机、补救脚本和特殊分支。
- 执行器只能在程序预设路径里移动，遇到真实研究、写作或设计中的开放问题时反而被限制。
- 质量判断被拆散到大量程序规则里，最后既不像专家判断，也难以解释或维护。

`stage control plane` 把这些责任重新分层：

| 层 | 应该做什么 | 不应该做什么 |
| --- | --- | --- |
| `OPL` shared layer | 定义 stage descriptor 形状、skill / prompt / evaluation refs、handoff envelope、projection / parity helper。 | 不持有 domain truth，不执行 domain action，不给质量 verdict。 |
| Domain repo | 定义本领域 stage sequence、stage goal、输入输出、评价方法、domain skill、AI reviewer 或 expert reviewer 规则。 | 不重复造 family shared schema，不把跨仓通用控制面写成仓内私有协议。 |
| `Codex CLI` executor | 在 stage 目标和可用 skill 约束下自主拆解、创作、审核、修订、运行验证、汇报证据。 | 不绕过 domain gate，不伪造 stage 完成，不把探索性输出写成最终 verdict。 |
| Program / scripts | 做启动、恢复、索引、证据收集、结构化输出、schema 校验、工件打包、可重复验证。 | 不用硬编码流程替代 AI 的专家判断，不用启发式后处理掩盖质量问题。 |

这样，架构可以从“每个项目都有一套重流程 runtime”收敛成“共享 stage 语言 + domain stage pack + Codex autonomous execution + domain-owned evaluation”。

## Stage 的最小语义

一个 family-level stage 不应该是一段固定脚本，而应是一个可交给 `Codex CLI` 执行的专家任务单元。

最小字段应包括：

- `stage_id`：稳定语义 ID。
- `stage_kind`：例如 intake、planning、source_preparation、creation、review、revision、packaging、publish、operator_gate。
- `goal`：本阶段要达成的专家目标。
- `inputs`：需要读取的 repo-owned truth、source refs、workspace refs、artifact refs。
- `skills`：建议或必需的 Codex skill / domain skill / companion tool。
- `prompt_refs`：stage prompt、role prompt、review prompt 或 continuation prompt。
- `allowed_actions`：允许执行的 domain action 或 CLI command descriptor。
- `outputs`：本阶段要产生的 artifact、ledger entry、review note、package 或 projection。
- `evaluation`：完成标准、AI reviewer / expert reviewer 方法、必要测试或人工 gate。
- `handoff`：进入下一 stage 的条件、失败时 next owner、resume handle 与 source refs。
- `authority_boundary`：哪些判断属于 domain owner，哪些只是 OPL projection。

其中 `goal`、`skills`、`prompt_refs`、`evaluation` 是 stage 控制面的核心。程序只需要保证它们可发现、可追踪、可验证，不需要把专家行为写死成大段流程代码。

## 与现有 OPL shared contracts 的关系

这个支撑面已经进入 machine-readable companion 与只读 discovery 阶段，但仍然复用并连接已经存在的 shared surfaces：

- `family-action-graph`：继续描述 stage / action 拓扑、入口、出口和 checkpoint policy。
- `family-action-catalog`：继续描述可调用 action metadata，以及 CLI / MCP / Skill / product-entry / OpenAI / AI SDK descriptor 派生。
- `family-human-gate`：继续描述需要人类确认或补充判断的 gate。
- `family-runtime-supervision`：继续描述长期任务的 supervision freshness、repair hint 与 domain-owned source refs。
- `family-persistence-policy`、`family-lifecycle-ledger`、`family-owner-route`：继续描述状态角色、receipt 与 next-owner routing。
- `family-product-entry-manifest-v2`：继续作为 OPL 发现 domain-owned stage/action/gate/projection refs 的入口。

`family-stage-control-plane` companion 是窄 schema，不是完整流程引擎。它只声明 stage descriptor、skill/prompt/evaluation refs、handoff refs 与 authority boundary，并通过 manifest discovery 暴露。`opl stages list|inspect|readiness` 只做发现、inspection、admission/parity 和 readiness drilldown；launch admission 可以阻断未声明 stage 或缺少启动安全 refs 的 attempt，但不执行 domain action，不给 domain quality verdict，也不关闭 domain ready / production ready。Fresh stage discovery/readiness 只能作为结构、admission 和 readiness-warning 证据；production evidence、owner receipt、artifact mutation、quality/export verdict 和 memory body authority 继续由 domain 持有。

## Research Harness 学习记录

`Biajin-PKU/research-harness@006ab44` 的有用部分是把研究工作表达为 typed primitive registry、stage boundary gate、provenance trail、typed artifact 和 human checkpoint；这些概念只进入 OPL 的 shared contract vocabulary。OPL 可吸收 primitive/action registry、provenance receipt、gate descriptor、checkpoint/resume 和 artifact ref 语言；MAS 可参考其文献、claim/evidence、number verification 与 adversarial review 模板；OPL 不吸收 RH 的研究判断、auto-runner、SQLite `pool.db`、HTTP API、web dashboard、MCP server 或 Python package 依赖。

## MAS 吸收路径

`MAS` 是这个方向的参考实现候选，但它不能按 RCA / MAG 的方式直接新起一套 stage sequence。MAS 内部已经有 stage / route / progress / gate / delivery 等多层阶段语义，本计划不要求先修改 MAS 原有 stage，也不要求用下面的抽象名称替换现有 `scout`、`idea`、`baseline`、`experiment`、`analysis-campaign`、`write`、`review`、`decision/finalize` 等 route contract。

本计划里的 MAS stage 名称只表示 family-level 抽象维度，用来帮助 OPL 理解和投影，不是 MAS 的实际 stage 列表：

| Family 抽象维度 | MAS 现有语义的候选来源 | 用途 | 明确非目标 |
| --- | --- | --- | --- |
| study intake / direction framing | `scout`、`idea`、study charter、stage-led policy | 说明研究问题、数据边界、文献空白、候选路线和人类 gate。 | 不替换 MAS route id，不新增并行 intake engine。 |
| evidence preparation / grounding | `baseline`、reference context、evidence ledger、bounded-analysis policy | 说明证据、数据、文献、claim boundary 和失败路径。 | 不让 OPL 持有 evidence truth。 |
| analysis and argument | `experiment`、`analysis-campaign`、route decision、candidate board | 说明分析路线、结果解释、负结果处理和 next route。 | 不把评分矩阵变成研究思路生成器。 |
| manuscript authoring | `write`、authoring workplan、authoring stage graph、manuscript blueprint | 说明写作目标、段落结构、display-to-claim 和 claim-evidence map。 | 不把 authoring read model 升级成 draft readiness authority。 |
| review / publication gate | `review`、`decision/finalize`、AI reviewer workflow、publication gate | 说明 AI reviewer、publication eval、package gate 和 human gate。 | 不用 mechanical gate 替代 AI reviewer / publication authority。 |

程序侧只应持有 stage 状态、输入输出索引、receipt、gate 与 projection；医学研究质量、publication readiness 与 current package authority 继续属于 `MAS`。

如果后续为了跨仓统一而调整 MAS stage 命名，前提必须是逻辑层级不变、原 route contract 可追溯、现有 truth surface 不漂移。命名统一只能发生在 inventory 和映射完成之后，不能先用 OPL 示例覆盖 MAS 内部流程。

## MAS Inventory 计划

在 MAS 上推进前，先做一次 inventory，而不是直接重构 stage 或状态机。目标是把现有对象按职责分类，判断哪些已经是专家 stage，哪些只是 guard / router / reconciler / dispatcher / evaluator / read model。

### Inventory 范围

第一轮只读盘点这些 surface：

- Stage / route contract：`agent/stages/stage_route_contract.yaml`、stage-led policy、bounded-analysis policy、stage packet / prompt / skill refs；旧 `agent_entry_modes` 入口只作为 MAS 兼容别名，不再作为 OPL family inventory 的 canonical source。
- Controller / route：study charter、controller decisions、owner route、route decision orchestrator、study line decision engine。
- Runtime / state machine：runtime watch、runtime supervisor scan / consume / execute-dispatch / reconcile、RuntimeHealthKernel、worker lease / retry / idempotency receipts。
- Quality / evaluation：AI reviewer workflow、publication eval、medical publication surface、review ledger、evidence ledger、quality repair / gate clearing。
- Authoring / delivery：authoring workplan、authoring stage graph、manuscript blueprint、current package projection、submission / delivery sync。
- Projection / UI：study progress、study macro state、Progress Portal、Live Console、paper stage / current stage read models。

### 分类表

每个盘点对象都要落到下表之一，避免“stage”这个词继续混用：

| 分类 | 定义 | MAS 中的典型例子 | 处理原则 |
| --- | --- | --- | --- |
| `expert_stage` | 给 Codex CLI 的专家任务单元，包含目标、输入、自由度、输出和评价。 | `scout`、`idea`、`analysis-campaign`、`write`、`review`、`decision`。 | 保留为 MAS stage truth；后续只做 descriptor 映射。 |
| `guard` | 守住权限、医学边界、claim boundary、human gate、publication gate。 | study charter boundary、publication gate blocker、human gate policy。 | 保留，禁止变成创作引擎。 |
| `router` | 把 stage closeout、review finding 或 blocker 转成 next owner / next route。 | owner route、route decision orchestrator。 | 保留，但只路由，不替 AI 生成研究判断。 |
| `reconciler` | 从 current truth 重算 desired state、safe action、no-op / retry / redrive。 | runtime-supervisor scan、paper progress reconciler。 | 保留为控制面，不持有质量 verdict。 |
| `dispatcher` | 幂等派发 worker、repair work unit、gate replay 或 delivery sync。 | sidecar dispatch、execute-dispatch、work-unit outbox。 | 保留，必须有 receipt 和 forbidden surface。 |
| `evaluator` | 评估医学质量、写作质量、publishability 或 package completeness。 | AI reviewer workflow、publication eval、medical publication surface。 | 区分 AI-first quality authority 与 mechanical completeness。 |
| `read_model` | 汇总展示状态、阶段、下一步、blocker 和 evidence refs。 | study progress、Progress Portal、authoring stage graph、current_stage / paper_stage。 | 只读投影，不参与授权。 |

### Inventory 输出

第一轮 inventory 应产生一份 MAS 仓内文档或表格，至少包含：

- object / surface 名称。
- 当前 owner。
- 当前输入 truth surfaces。
- 当前输出 artifact / projection。
- 分类：`expert_stage`、`guard`、`router`、`reconciler`、`dispatcher`、`evaluator`、`read_model`。
- 是否可映射到 family stage descriptor。
- 是否存在“过度机械化”风险。
- 是否存在第二 truth source 风险。
- 建议动作：`keep`、`rename_only`、`map_to_descriptor`、`downgrade_to_read_model`、`split_authority`、`retire_after_parity`。

### Inventory 后的决策门

只有 inventory 完成后，才允许进入命名统一或 descriptor 草案：

1. `keep`：现有 MAS stage / controller 语义正确，只补引用和文档。
2. `rename_only`：逻辑层级不变，只统一名称或显示名。
3. `map_to_descriptor`：把现有 MAS surface 投影成 OPL 可发现 descriptor。
4. `downgrade_to_read_model`：把误承担 authority 的 stage/projection 降级为只读。
5. `split_authority`：把同一对象中混在一起的创作、路由、评价、展示拆开。
6. `retire_after_parity`：只有在 parity fixture 和替代 surface 成立后才退役旧入口。

## RCA 吸收计划

`RCA` 应按视觉交付专家工作流重构 stage，而不是继续把 PPT / Xiaohongshu / poster 的每一步都写成硬流程。

建议的第一版 stage sequence：

1. `source_intake`
   - 目标：读取素材、主题、受众、场景、约束，冻结 source pack。
   - Skills：source extraction、document / web extraction、domain-specific intake。
   - 评价：source completeness、source fingerprint、missing source risk。
2. `communication_strategy`
   - 目标：确定叙事、受众目标、信息密度、语气和关键 takeaways。
   - Skills：strategy prompt、presentation / visual communication skill。
   - 评价：outline quality、audience fit、claim-source alignment。
3. `visual_direction`
   - 目标：形成视觉方向、版式密度、图片/图表/色彩/字体策略。
   - Skills：image generation、presentation design、screenshot review。
   - 评价：visual direction brief、reference fit、asset feasibility。
4. `artifact_creation`
   - 目标：生成 PPT、图文页面、海报或其他 deliverable。
   - Skills：presentation / office / image / browser verification skill。
   - 评价：render proof、layout proof、content coverage。
5. `review_and_revision`
   - 目标：以 AI reviewer / screenshot reviewer / domain reviewer 进行审查和修订。
   - Skills：visual QA、copy review、artifact audit。
   - 评价：text fit、image quality、source fidelity、delivery checklist。
6. `package_and_handoff`
   - 目标：输出最终文件、预览、metadata、复用信息和 resume handle。
   - Skills：artifact packaging、manifest builder。
   - 评价：deliverable manifest、export proof、handoff completeness。

`RCA` 的关键收益是：source pack、visual strategy、review rubric 和 final package 变成稳定 stage outputs；生成策略由 `Codex CLI` 与视觉 skill 自主推进，程序只负责证据、渲染、审查和打包边界。

## MAG 吸收计划

`MAG` 应按基金专家工作流组织 stage：

1. `call_and_candidate_intake`
   - 目标：读取指南、申请人/团队基础、方向候选与限制条件。
   - 评价：call fit、eligibility、source completeness。
2. `fundability_strategy`
   - 目标：判断选题竞争力、创新点、风险和资助口径。
   - 评价：fundability review、gap list、decision trail。
3. `specific_aims_and_structure`
   - 目标：形成研究目标、技术路线、创新性和预期成果结构。
   - 评价：aim coherence、reviewer objection list。
4. `proposal_authoring`
   - 目标：生成申请书正文、摘要、预算/进度等材料。
   - 评价：section completeness、style fit、internal consistency。
5. `review_and_rebuttal`
   - 目标：模拟评审、返修、补强依据。
   - 评价：review ledger、risk closure、human gate。
6. `package_and_submit_ready`
   - 目标：形成最终交付包与提交前检查。
   - 评价：package checklist、format proof、owner sign-off。

`MAG` 与 `MAS` 的共同点是质量判断必须 domain-owned；区别是 MAG 的 stage evaluation 更偏申请书策略、指南匹配、评审视角和材料完整性。

## OPL 应该上收的共享部分

`OPL` 值得上收的是 domain-neutral 的控制面，而不是任何领域真相。

优先上收：

- Stage descriptor vocabulary：stage id、kind、goal、inputs、outputs、evaluation、handoff、authority boundary。
- Skill and prompt refs：stage 需要哪些 skill、role prompt、review prompt、continuation prompt。
- Evaluation descriptor：AI reviewer、human gate、artifact proof、test command、render proof、source fidelity check。
- Stage lifecycle receipts：started、checkpointed、reviewed、revised、blocked、completed、handoff。
- Handoff envelope：next stage、next owner、resume handle、source refs、idempotency key。
- Product-entry projection：当前 stage、下一步、blocker、可用 action、推荐 skill、最近证据。
- Parity helpers：检查 domain manifest 是否声明 stage refs、action refs、gate refs 和 authority boundary。

不应上收：

- MAS 的 publication readiness、研究结论、current package authority。
- RCA 的最终视觉质量 verdict、审美判断、deliverable authority。
- MAG 的 fundability verdict、评审结论、提交可行性判断。
- 任何 domain-specific controller truth、runtime truth、artifact truth。
- 把 `Codex CLI` 限制成只能执行固定脚本的重流程 engine。

## 实施顺序

### S0. 文档冻结

当前文档冻结原则和边界：stage control plane 是 family design direction；最小 schema、admission/parity helper 与只读 discovery 已落在 OPL，执行内核、owner receipt、artifact authority 和质量判断仍由 domain 持有。

### S1. Domain inventory

在 `MAS`、`RCA`、`MAG` 各自仓内继续维护 product-entry manifest、action catalog、prompt / skill refs、review surface 和 runtime projection 的 current mapping，标出哪些已经等价于 stage，哪些只是 read-model、guard、router、dispatcher 或 evaluator。

`MAS` 必须先执行上面的 MAS inventory。它不能跳过 inventory 直接改 stage 名称或 stage 数量；第一轮目标是分类和映射，不是重构。

### S2. Stage descriptor and discovery

OPL 侧当前已有最小 `family-stage-control-plane` descriptor、normalizer、parity 和 `opl stages` 只读 discovery / readiness drilldown。后续只按 source/contract/test 证据扩展，不把 diagnostic lenses 升级为新 workflow runtime。

### S3. RCA stage pack maintenance

`RCA` 最适合先验证这个思路，因为它已有 source-first fanout、managed deliverable、review state、render proof 与 package manifest。第一轮把现有 PPT / Xiaohongshu / poster 流程映射到 stage，不大改生成逻辑。

当前 RCA stage plane 已由 `opl stages list --json` 读到 6 个 admitted stage。后续维护重点是保持 source pack、visual strategy、artifact creation、review/revision、package handoff 与 RCA owner receipts / visual authority 对齐；不重写 PPT / Xiaohongshu / poster 生成内核，也不改变默认 route。

### S4. MAS reference-depth stage pack maintenance

MAS 当前 stage plane 已映射现有 route contract、study charter、evidence ledger、review ledger、publication eval、runtime status 和 controller decisions。重点继续是解释现有 stage 和控制面的职责边界，而不是改 stage 数量、替换 route id，或把医学质量 gate 程序化成僵硬脚本。

### S5. MAG grant stage pack maintenance

`MAG` 在 fundability、specific aims、proposal authoring、review/rebuttal、package gate 上提供 stage pack。重点是复用 shared descriptor，而不是复制 MAS 的医学研究字段。

当前 MAG stage plane 已把指南匹配、资助策略、aims、正文写作、模拟评审和提交包检查映射为可发现 stage。后续维护重点是 grant-owned owner receipt / typed blocker / no-regression refs 与 stage projection 对齐；不先改写更深的 runtime/controller 内核。

### S6. OPL discovery / workbench

`OPL` 只做 discovery、index、parity、admission、projection 和 typed queue dispatch：显示当前 stage、可用 skill、下一步、blocker、source refs 和 handoff，不接管执行或质量 verdict。

## 验收口径

这个方向只有在同时满足以下条件时才算走对：

- domain repo 能用 stage 描述专家工作流，而不是只暴露一串脚本命令。
- `Codex CLI` 在每个 stage 内仍有足够自主空间，可以拆解、创作、审核和修订。
- 程序只负责可验证的控制面、证据面、投影面和恢复面。
- 每个 stage 都能说明输入、输出、评价方法、human gate、resume handle 与 authority boundary。
- `OPL` 能跨 MAS / RCA / MAG 发现同型 stage 信息，但不能给出 domain quality verdict。
- RCA 的视觉交付、MAG 的基金写作、MAS 的论文生产都能减少重复流程代码，同时保留或增强质量 gate。

## 风险与防线

| 风险 | 防线 |
| --- | --- |
| 把 stage 又做成一套重流程引擎 | Stage descriptor 只描述目标、skill、评价、handoff，不固定每个内部动作。 |
| AI 自主执行变成不可审计 | 每个 stage 必须产生 source refs、receipts、review notes 或 artifact proof。 |
| OPL 越权给 domain quality verdict | 在 descriptor 和 projection 中强制写 authority boundary。 |
| MAS 误读为要替换现有 stage | MAS 先做 inventory 和映射；OPL 示例只作为 family 抽象维度，不作为 MAS 实际 stage 列表。 |
| 各仓 stage 名称漂移 | OPL 提供 vocabulary、parity helper 和 manifest discovery；MAS 命名统一只能在逻辑层级不变时做。 |
| 过度抽象导致 domain 不好用 | 先 RCA 轻 adapter，再 MAS 深 adapter，最后 MAG pack，不一次性强制全仓改形。 |

## 当前非目标

- 不新增 OPL runtime kernel。
- 不替换 `Codex CLI` 默认执行语义。
- 不把 `Hermes-Agent` 写成 domain executor 或 quality owner。
- 不把已落地的 `family-stage-control-plane` descriptor、discovery、admission 或 readiness drilldown 写成 workflow engine、domain action executor、owner receipt signer 或 quality verdict owner。
- 不把 MAS / RCA / MAG 的领域判断移动到 OPL。
- 不为了统一 stage 语言重写已有可用 workflow。
- 不用 OPL 文档里的 MAS 抽象维度替换 MAS 现有 route contract 或 stage 名称。
