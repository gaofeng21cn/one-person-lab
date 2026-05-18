# OPL 硬约束

## 顶层定位

- `OPL` 是面向高价值知识工作的完整智能体运行框架。它以 `Codex-default session runtime` 为默认交互底座，以 stage-led family framework 承接长期自治、恢复、队列、human gate、trace、projection 与交付收口。
- `OPL` 的默认交互与具体执行 runtime 是 `Codex CLI`；`Codex CLI` 是阶段内默认最小执行单元。Full online family runtime 的 readiness 对象是已配置且 ready 的 Temporal-backed family runtime provider。Temporal 是 OPL production online runtime 的必需 substrate，local provider 只能作为 dev/CI/offline diagnostic baseline，不能替代 Full online readiness；`hermes_agent` 只允许作为显式非默认 executor adapter/backend，Hermes provider / Gateway / readiness / compat 面只允许作为历史 provenance、诊断语料或负向 guard。
- `Codex CLI` 是 OPL 的受管 runtime dependency：OPL 必须检测实际命中的 binary、版本、最低版本策略和 PATH 候选；同版本兼容 wrapper / alias 归并到当前有效入口，低于当前最低版本或当前命中版本无法解析的 Codex CLI 只能进入 `attention_needed`，不得被报告为 ready。
- 只有显式 domain activation 或显式 runtime switch，才允许离开 Codex-default 语义。
- 大型任务必须按 stage 作为可观察、可恢复、可审计的工作单元推进；不得把开放式知识工作降级成只靠硬编码步骤或固定脚本后处理的流程。
- 涉及知识交付、专家判断或正式交付质量的复杂步骤必须是 first-class stage，例如 AI 审稿、publication quality review、fundability review、visual review、revision/rebuttal review；不得把这类流程作为另一个 stage 内部的普通函数、helper、后处理或 authority function 暗中完成。
- `OPL Runtime Manager` 只能是产品级薄管理/投影层和 typed family queue owner，不得被写成 domain scheduler、domain truth owner、domain quality owner、domain artifact owner 或 concrete executor。
- family runtime provider 负责 stage-attempt durability、wakeup、retry/dead-letter、human-gate transport、status query 与 execution history。生产在线路径必须由 Temporal-backed provider 承接；缺少 Temporal service、worker 或 readiness proof 时，OPL production readiness 必须 fail-closed 为可修复 blocker，而不是退回 local provider 宣称在线可用。
- `hermes_agent` 可作为显式非默认 executor adapter/backend。该 adapter 不得被写成 provider、provider proof surface、readiness path、MAS/MAG/RCA domain truth、quality、artifact、publication gate 或默认 concrete executor owner，也不得被 fork/vendor 成 OPL 私有 runtime kernel。
- OPL 应上收 domain-neutral 的智能体运行外围能力：stage attempt ledger、typed queue、checkpoint / closeout / receipt、source fingerprint / idempotency、artifact index、file lifecycle、retention、restore proof、migration ledger、workspace lifecycle、human gate / resume token 和 operator projection。任何上收都必须保留 domain truth owner 不变。
- MAS/MAG/RCA 的目标接入形态是统一 `domain-agent skeleton`：`agent/`、`contracts/`、`runtime/`、`docs/` 这些 repo-source 边界应可由 OPL 发现、校验和托管；artifact locator / index / retention / restore proof 只以 contract 和 receipt ref 暴露，真实运行产物必须在 workspace / runtime artifact root。domain 内部业务实现、语言和 quality gate 可以不同。
- OPL family 开发 checkout 不承载运行生成物。默认验证入口、Python clean runner、Node-triggered Python helper 和 build/proof 命令必须把 `__pycache__`、`.pytest_cache`、`*.egg-info`、`uv sync` project venv、安装/同步副产物、临时 build 输出和 runtime artifact 导向仓库外的系统临时目录、用户级 runtime-state、workspace 或 runtime artifact root；`.gitignore` 和 repo hygiene 只作为兜底守门。
- MAS 已验证的 SQLite / file lifecycle / restore-proof 经验只能作为 OPL framework primitive 的参考实现和 parity oracle。OPL 可以持有 lifecycle metadata、artifact locator、retention receipt、restore proof 和 migration ledger；不得复制 MAS study truth、publication verdict、evidence/review ledger 或 manuscript/package authority。
- `OPL native helper` 与高频状态索引只能加速系统探测、artifact discovery、session/progress/artifact projection，不得替代 admitted domain 仓自己的 durable truth。
- `OPL` 的 shared contract、graph、gate、index、scorecard 与 projection 只能携带证据、provenance、状态和路由信号；不得替 MAS/MAG/RCA 或未来 domain 持有 AI-first 作者判断、审稿判断、质量裁决或 ready verdict。
- `OPL` 可以上收 family-level stage descriptor、skill / prompt / evaluation refs、handoff 与 projection 语义；不得把 stage 控制面实现成替代 `Codex CLI` 自主拆解、创作、审核或 domain-owned quality gate 的硬编码流程引擎。
- `OPL` 可以上收 stage-level integrity / citation-support / evidence-handoff / data-access / human-checkpoint metadata，作为通用 framework primitive 和 App/operator 投影；不得据此持有 domain truth、publication / fundability / visual verdict、artifact authority、domain audit body、direct skill path 或最终质量裁决。
- AI-first quality gate 必须由独立 reviewer / gate stage attempt 完成。执行与审核必须是两个独立的智能体任务，具备独立上下文、输入 refs、closeout / gate receipt 与 owner；不得让同一个 `Codex CLI` attempt 在同一上下文里先执行再自审并放行。缺少独立 gate receipt、gate evidence stale 或出现 self-review attempt 时，stage progression 必须 fail-closed。
- `OPL` 可以上收 domain memory locator、stage `knowledge_refs`、migration plan ref、seed corpus ref、writeback proposal refs、router receipt refs、freshness 与 operator projection；不得持有 domain memory 正文，不得执行 memory body migration，不得接受或拒绝 memory writeback，不得把 memory card 提升为 evidence / review / grant / visual / artifact truth，也不得据此生成 publication、fundability、visual quality 或 artifact readiness verdict。
- `OPL` 文档中的 MAS stage 抽象只能作为跨仓投影维度；不得直接覆盖 MAS 现有 route contract、stage 名称、stage 数量、controller truth 或 publication / quality authority。
- MAS v2 wording 必须保持 `MAS` 为独立 `domain agent` 与单一 domain app skill owner；`OPL` 只能消费 MAS-owned entry/projection truth，不得把 MAS runtime、controller truth、quality authority 或 publication gate 收归 OPL。
- `MDS` 只能作为 `MAS` 显式声明的可选 backend audit、source provenance、historical fixture、explicit archive import、upstream intake 或 parity oracle companion 被读取；不得作为 OPL 默认安装依赖、顶层 domain-agent 入口或独立 OPL-managed domain agent 回流。
- 当 admitted domain 吸收外部 companion 能力时，OPL 只上收 domain-neutral control-plane 原则与 discovery refs；可保留能力必须落到 domain-owned surface，外部 companion 必须降级为显式 audit/diagnostic/intake/oracle 引用，并记录 source ref/hash、capability classification、license refs、owner boundary、parity proof 与 no-history contributor audit。
- `OPL` 持有 family-level 开发与运行框架、通用状态机、stage attempt lifecycle、queue/wakeup、resume/human gate、workspace/artifact/memory locator、operator projection 和 App/workbench shell。MAS/MAG/RCA 不维护平行的通用 runtime 模块；需要运行能力时通过 OPL Framework 托管。
- `OPL` 不替代各个领域仓的智能体逻辑、domain truth、quality verdict、artifact authority、memory body 或 domain transition semantics。
- OPL family 的目标态高于当前实现分布。MAS/MAG/RCA 当前存在的私有 scheduler、runner、session store、SQLite/lifecycle、workspace/source intake、memory/artifact transport、workbench、sidecar/status/product wrapper 或 generated wrapper，只能作为迁移输入；不得因为已有 active caller 就写成长期合理。
- 标准 OPL Agent 必须收敛到 `Declarative Domain Pack + OPL generated/hosted surfaces + standard authority functions`。stage 定义、domain policy、quality/export verdict、artifact authority、memory accept/reject 和 owner receipt signer 属于标准 pack 或 OPL authority ABI，不算私有平台污染；repo-local 通用 runtime、状态机、持久化、调度、展示、transport、lifecycle 或 observability residue 只能作为明确例外保留，且必须有接口、receipt/blocker/ref 输出边界、active caller、不能上收原因、no-forbidden-write 证据和退役/复审门。
- 当 OPL primitive、pack compiler 或 App shell 还不够成熟时，应在 OPL 层定义缺口、必要时调研外部成熟系统，并把结论沉淀为 OPL generic primitive / generated surface / policy；不得让 MAS/MAG/RCA 各自复制私有平台。
- 文档和计划必须先设理想态，再找差距；差距不是妥协清单。为了理想态，可以做革命式重构并完全抛弃旧模块、旧接口、旧测试、旧目录和旧文案；处理清楚 active caller、替代 surface、provenance 和必要证据后，不保留历史兼容面。

## 当前公开产品模型

- 当前主线公开模型固定为：
  - `system`
  - `engines`
  - `modules`
  - `agents`
  - `workspaces`
  - `sessions`
  - `progress`
  - `artifacts`
- `OPL` 的 session runtime 是这组资源的 canonical truth。
- `opl`、`opl exec`、`opl resume` 与 OPL-branded AionUI GUI/WebUI 必须围绕这组资源组织当前产品语义。
- `agents` 资源必须指向 admitted domain 仓的稳定 capability surface，而不是重新发明第二套 domain 协议。

## 文档分层

- `README*` 与 `docs/README*` 是默认公开入口。
- `docs/project.md`、`docs/architecture.md`、`docs/invariants.md`、`docs/decisions.md`、`docs/status.md` 是 AI / 维护者核心工作集。
- `docs/README*` 维护的 canonical docs taxonomy 继续有效：`active/public/product/runtime/delivery/source/policies/specs/references/history`。
- 参考级与历史文档不得反向改写公开主线。
- 文档生命周期状态按内容角色判断，长期落点服从 canonical docs taxonomy。若一份文档内容已经是过时计划、旧 topology、旧入口或旧 provider 判断，即使它仍在 `docs/references/` 或被索引引用，也必须标注为 superseded / retired / tombstone 语境，并指向当前 owner surface。
- 叙述性 `README*`、`docs/**` 与参考文档不得被脚本或测试固定措辞、标题、段落或具体 prose path；需要机器约束时使用 contract/schema/source surface、CLI/API 行为、生成 artifact 或 `human_doc:*` 语义标识。
- 理想态差距、gap plan 和开发计划必须把 `功能/结构差距` 与 `测试/证据差距` 分开维护；真实运行证据、soak、coverage、no-forbidden-write proof 或 regression proof 不得被写成同一条未完成的功能缺口。
- `功能/结构差距` 以标准 OPL Agent 目标态为准；不符合目标态的现有通用功能面，即使当前可运行，也必须写成上收、generated surface 替换、收薄或退役对象。
- `当前实际` 只能作为迁移起点、风险和证据来源；不得反向约束理想态，不得把现有私有实现包装成长期设计。

## 合同面

- `contracts/` 只保留机器可读真相，不承载叙事规则。
- 修改网关合同、公开边界或已收录领域表述时，必须同步更新文档与测试。
- admitted domain 仓对外应继续暴露本地 CLI、程序/脚本与 repo-tracked contract；`OPL` activation 只消费这些稳定 surface。

## 目标优先级

- 一旦系列项目的目标形态已经明确，新增投入默认服务该目标形态。
- 旧执行形态只能作为迁移桥、兼容层、回归基线或历史记录存在。
- 当前主线禁止重新把旧本地 Product API / UI-adapter 公开语义拉回产品入口。
- 当前主线禁止恢复 `MAS` 用户安装型 standalone GitHub Release / standalone product release 叙事；MAS 的分发与安装表述必须继续落在 OPL module / Packages / git checkout / sibling repo 更新路径上，MDS 相关内容只能作为 MAS-declared optional companion provenance / audit / oracle / intake 引用出现。

## GUI 主线约束

- `OPL` 主仓跟踪 family-level session runtime、`opl` shell / TUI、release distribution 与 activation contracts，不跟踪外部 GUI 外壳实现。
- 本地 8787 `Product API` / `opl web` 模块已退役，不再作为 projection surface 或用户入口保留。
- 外部壳不得反向定义 `workspace / session / agent / progress / artifacts` 的 canonical truth。
- 外部壳不得反向改写默认 runtime 合同；GUI 定制只能建立在 Codex-default 路径之上。
- 外部产品名只能在基准、上游参考或规划中的界面目标语境出现。

## 语言规则

- `docs/**` 是中文内部开发与维护参考；稳定文档路径优先使用无语言后缀 `.md` 承载中文 canonical 内容。
- 根层 `README*` 是否保留公开双语入口，由产品分发和 public 需求单独决定；它不要求 `docs/**` 继续维护双语镜像。

## 本地工具状态

- 项目级 `.codex/` 与 `.omx/` 已退役，不再作为当前仓库的本地状态入口。
- 如需保留历史 session、prompt、log、hook 或执行痕迹，应迁入用户级 `~/.codex/` 归档。
