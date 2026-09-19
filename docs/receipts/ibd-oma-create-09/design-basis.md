# 设计依据准入（design-basis-admission）— 叙述稿

> 本 Stage 的语义决定是「哪些证据与可复用实践可以支撑本 Agent 的设计」，不是「设计成什么」。
> 本文件只准入依据：不产出 `AgentBlueprint`、不产出 `EvalSpec`、不授予权限、不裁定质量或就绪，
> 也不声称资格、评测通过或激活。provider 完成仅表示该协议对象已产出。

- 目标：`ibd-evidence-assistant`（domain `ibd_evidence`），mode=`create`，`target_version_ref=null`。
- 请求摘要（规范排序紧凑 UTF-8 JSON SHA-256）：`sha256:2c7988fc35cac3dd86cf7387c3747fbbecb11c252321c362703ad8ebdb434370`
  ，与活动信封 `activity.input_digest` 及 mission-intake 的 `design_request_digest` 三处一致。
- 可重算检查：30 项全部通过（见 `design-basis.json` 的 `arithmetic_and_identity_checks`）。

## 1. 决定

准入。只有以下类别可以支撑设计：

| 类别 | 内容 | 权威 |
| --- | --- | --- |
| `owner_requirement` | DesignRequest 原文（objective、7 条验收判据、3 条非目标、constraints、delivery_policy、mode/身份、request_id）与活动信 envelope | 唯一具有设计权威 |
| `derived_admissible_decision` | mission-intake 已产出的归一化决定（字节校验通过） | 可采纳，其数值断言已独立重算 |
| `admitted_source_content` | 五个已物化 source-material 字节 | 前四者=契约来源；第五者仅以「某一次示例调用的返回」身份 |
| `design_method` | 绑定的专业 Skill、Stage 策略/提示、角色片段、质量门、Stage 图、质量循环策略切片 | 决定怎么做与什么算合格，不 establish 目标域真值 |
| `knowledge_guardrail` | 可迁移实践知识与 OMA/OPL 边界知识 | 约束设计自由度 |

非权威类别：目标域临床内容（仅示例）、`opl://capability/*`（仅是身份，未解析内容）、未支撑假设、被排除声明。

**硬边界评估**：无权限/身份/当前性/凭据/不可逆动作/人类决定边界。目标身份唯一且精确；五个来源字节与声明摘要逐一一致；工具声明为本地运行时且已准入字节无凭据材料。剩余缺口是**显式限制与开放问题**，不是新执行门、质量债或硬停。

## 2. 来源事实与限制（摘要）

- **输入契约**（`…302284`）：`query` 必填 1..4000 含非空白；`top_k` ∈ [1,20] 默认 8；闭合。*不能* establish 返回数恒为 8。
- **输出契约**（`…dc3998`）：`records[]` ≤ 20；每条含 `evidence_id`(模式 `^ev_[a-f0-9]{24}$`)/`guideline_title`/`guideline_version`/`original_text`/`score`([0,1])；两层闭合；**无阈值字段、无调用身份、无查询回显、无时序字段**。
- **答案契约**（`…314bc`）：仅 `response_kind`/`claims`/`uncertainties` 且两层闭合；answered⇒claims 非空；insufficient_evidence⇒claims 空且 uncertainties 非空；claim 必填 `claim_id`/`text`/`evidence_ids`(1..8 唯一)。**答案对象不含指南标题/版本/原文成员**。
- **工具声明**（`…8fcc77`）：`search_evidence`，`POST http://127.0.0.1:8081/v1/search-evidence`，`authentication=local_runtime`；四项硬契约标志 `must_return_exact_original_text`/`must_return_guideline_title_and_version`/`must_not_return_pdf_page_numbers`/`errors_are_terminal` 均为真。*不能* establish 端点可达或工具集合闭包。
- **示例响应**（`…718c65a02`，15609 字节）：8 条记录、全部同一指南/版本、分数极差 ≈ 0.0302、原文含 `<sup>`/`<table>`/转义/换行。**仅以某一次调用的返回身份准入**，不证明覆盖、当前性或临床真值。

## 3. 关键语义裁定（10 条，节选）

- `rule-sample-is-not-corpus-truth`：示例≠语料真值/覆盖/当前版本/排名语义。
- `rule-capability-refs-are-identity-only`：三条 `opl://capability/*` 是身份引用，不证明能力可用或已授权。
- `rule-exactly-once-semantics`：「仅一次」= 每被作答问题恰一次调用；`errors_are_terminal` ⇒ 失败建模为终止路径，不静默重试；`top_k=8` 也等于每条 claim 的 `evidence_ids` 上限。
- `rule-evidence-card-boundary`：证据卡/安全卡**不是**答案契约成员，是宿主渲染；契约闭合。
- `rule-citation-fidelity-scope`：逐字保真覆盖标记、转义与编码层，不得规范化为可见文本。
- `rule-no-numeric-adequacy-threshold`：充分性不得用固定分数阈值判定；须语义判断。
- `rule-corpus-lock-not-agent-verifiable`：语料锁定属外部事实，Agent 不得声明。
- `rule-provenance-requires-external-observation`：「不来自先前/缓存调用」不可自证，须 OPL 外部观测支撑。
- `rule-substantive-claim-operationalization`：以 `claims` 成员为「实质医学陈述」唯一操作化载体（设计内约定）。
- `rule-no-conversational-template`：不采用对话式 RAG/问答模板（会引入缓存/多轮，与判据 4 冲突）。

## 4. 可复用模式（10 条）

采纳：`pattern-single-shot-retrieve-then-cite`、`pattern-claim-level-evidence-binding`、`pattern-closed-output-contracts`、`pattern-external-observation-for-provenance`、`pattern-design-as-open-judgment-stages`、`pattern-input-domain-explicit-minimum`、`pattern-answer-mode-explicit-branch`、`pattern-deny-capability-escalation`、`pattern-single-public-action-surface`。
适配：`pattern-byte-fidelity-citation`（扩展保真范围到标记/转义层，载体须在答案契约之外）。
未采用任何 catalog Profile 作为模板；唯一结构一致性目标是 OPL 标准智能体形态。

## 5. 假设（8 条）、排除声明（14 条）、开放问题（7 项）

- 假设 A1..A8：输入域通用性、单次调用语义、语料锁定不可验证、安全卡为首版范围、claims 操作化、无数值门、首版输入域、端点可用性/工具闭包。
- 排除声明 X1..X14：示例=覆盖/当前性、score 阈值、卡片为契约成员、Agent 校验语料、产物自证来源、失败重试/缓存、本设计已资格、capability 已证明、规范化原文、推断权限、改写契约、硬编码答案、uncertainties 载建议、Agent 侧写回。
- 开放问题 Q1..Q7：输入域边界、引用承载契约（→`stage-architecture`）；终止检索错误契约（→`stage-architecture`）；调用计数观测单位、充分性判定、成本/时延门限、专业 Skill 消费可达性（→`evaluation-design`）。

## 6. 下游消费契约

- **stage-architecture**：可直接采用本节 1–5 的准入类别、18 条要求→证据映射、10 条裁定、10 条模式、假设与 Q1/Q2/Q4，无需重复来源复核。
- **agent-blueprint-authoring**：以准入类别为界撰写；假设作为假设携带；排除声明不得进入蓝图；内容引用须解析为 SHA 绑定终态字节（capability 引用只是身份）。
- **evaluation-design**：承接 Q3/Q5/Q6/Q7；两个 `privacy:` 字符串逐字进入 `protected_requirements[].category`；门限与公开用例不得削弱；充分性与跨调用溯源须作为需 OPL 观测支撑的门。

## 7. 建议路由

`advance` → `stage-architecture`（`target-agent-assessment` 因 create/无基线不适用）。
本文件只给出**建议**：本 Stage 配置了正式独立评审，终端路由由 reviewer/re_reviewer 决定。

## 8. 权威边界

- OMA：仅作设计依据准入、可复用性判断与设计/评测义务声明。
- OPL：候选编译、独立评测、版本、回执、激活与回滚。
- 目标 Owner：`ibd_evidence` 的领域真值、权限、质量接受与采纳。
- `provider_completion_is_qualification = false`。
