# OPL 硬约束

## 顶层定位

- `OPL` 是面向高价值知识工作的完整智能体运行框架。它以 `Codex-default session runtime` 为默认交互底座，以 stage-led family framework 承接长期自治、恢复、队列、human gate、trace、projection 与交付收口。
- `OPL` 的默认交互与具体执行 runtime 是 `Codex CLI`；`Codex CLI` 是阶段内默认最小执行单元。Full online family runtime 的 readiness 对象是已配置的 provider-backed family runtime。Temporal-backed provider 是生产 substrate 候选，迁移期 Hermes/local provider 只能作为 legacy/optional provider。
- `Codex CLI` 是 OPL 的受管 runtime dependency：OPL 必须检测实际命中的 binary、版本、最低版本策略和 PATH 候选；同版本兼容 wrapper / alias 归并到当前有效入口，低于当前最低版本或当前命中版本无法解析的 Codex CLI 只能进入 `attention_needed`，不得被报告为 ready。
- 只有显式 domain activation 或显式 runtime switch，才允许离开 Codex-default 语义。
- 大型任务必须按 stage 作为可观察、可恢复、可审计的工作单元推进；不得把开放式知识工作降级成只靠硬编码步骤或固定脚本后处理的流程。
- `OPL Runtime Manager` 只能是产品级薄管理/投影层和 typed family queue owner，不得被写成 domain scheduler、domain truth owner、domain quality owner、domain artifact owner 或 concrete executor。
- family runtime provider 负责 stage-attempt durability、wakeup、retry/dead-letter、human-gate transport、status query 与 execution history。Temporal provider 落地后，这些长期职责应由 Temporal-backed provider 承接；`Hermes-Agent` 只保留 legacy/optional provider 或显式 executor/proof lane，不得被写成 MAS/MAG/RCA domain truth、quality、artifact、publication gate 或默认 concrete executor owner，也不得被 fork/vendor 成 OPL 私有 runtime kernel。
- OPL 应上收 domain-neutral 的智能体运行外围能力：stage attempt ledger、typed queue、checkpoint / closeout / receipt、source fingerprint / idempotency、artifact index、file lifecycle、retention、restore proof、migration ledger、workspace lifecycle、human gate / resume token 和 operator projection。任何上收都必须保留 domain truth owner 不变。
- MAS/MAG/RCA 的目标接入形态是统一 `domain-agent skeleton`：`agent/`、`contracts/`、`runtime/`、`docs/` 这些 repo-source 边界应可由 OPL 发现、校验和托管；artifact locator / index / retention / restore proof 只以 contract 和 receipt ref 暴露，真实运行产物必须在 workspace / runtime artifact root。domain 内部业务实现、语言和 quality gate 可以不同。
- MAS 已验证的 SQLite / file lifecycle / restore-proof 经验只能作为 OPL framework primitive 的参考实现和 parity oracle。OPL 可以持有 lifecycle metadata、artifact locator、retention receipt、restore proof 和 migration ledger；不得复制 MAS study truth、publication verdict、evidence/review ledger 或 manuscript/package authority。
- `OPL native helper` 与高频状态索引只能加速系统探测、artifact discovery、session/progress/artifact projection，不得替代 admitted domain 仓自己的 durable truth。
- `OPL` 的 shared contract、graph、gate、index、scorecard 与 projection 只能携带证据、provenance、状态和路由信号；不得替 MAS/MAG/RCA 或未来 domain 持有 AI-first 作者判断、审稿判断、质量裁决或 ready verdict。
- `OPL` 可以上收 family-level stage descriptor、skill / prompt / evaluation refs、handoff 与 projection 语义；不得把 stage 控制面实现成替代 `Codex CLI` 自主拆解、创作、审核或 domain-owned quality gate 的硬编码流程引擎。
- `OPL` 可以上收 domain memory locator、stage `knowledge_refs`、writeback proposal refs、router receipt refs、freshness 与 operator projection；不得持有 domain memory 正文，不得接受或拒绝 memory writeback，不得把 memory card 提升为 evidence / review / grant / visual / artifact truth，也不得据此生成 publication、fundability、visual quality 或 artifact readiness verdict。
- `OPL` 文档中的 MAS stage 抽象只能作为跨仓投影维度；不得直接覆盖 MAS 现有 route contract、stage 名称、stage 数量、controller truth 或 publication / quality authority。
- MAS v2 wording 必须保持 `MAS` 为独立 `domain agent` 与单一 domain app skill owner；`OPL` 只能消费 MAS-owned entry/projection truth，不得把 MAS runtime、controller truth、quality authority 或 publication gate 收归 OPL。
- `MDS` 只能作为 `MAS` 显式声明的可选 backend audit、source provenance、historical fixture、explicit archive import、upstream intake 或 parity oracle companion 被读取；不得作为 OPL 默认安装依赖、顶层 domain-agent 入口或独立 OPL-managed domain agent 回流。
- 当 admitted domain 吸收外部 companion 能力时，OPL 只上收 domain-neutral control-plane 原则与 discovery refs；可保留能力必须落到 domain-owned surface，外部 companion 必须降级为显式 audit/diagnostic/intake/oracle 引用，并记录 source ref/hash、capability classification、license refs、owner boundary、parity proof 与 no-history contributor audit。
- `OPL` 不持有领域运行时所有权。
- `OPL` 不替代各个领域仓的智能体逻辑。

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
- `docs/README*` 维护的四层文档体系继续有效：公开主线、公开合同配套、参考级配套、历史规格与计划。
- 参考级与历史文档不得反向改写公开主线。
- 文档生命周期治理按内容角色判断，不按文件名、目录名或旧链接机械判断。若一份文档内容已经是过时计划、旧 topology、旧入口或旧 provider 判断，即使它仍在 `docs/references/` 或被索引引用，也必须标注为 superseded / retired / tombstone 语境，并指向当前 owner surface。
- 叙述性 `README*`、`docs/**` 与参考文档不得被脚本或测试固定措辞、标题、段落或具体 prose path；需要机器约束时使用 contract/schema/source surface、CLI/API 行为、生成 artifact 或 `human_doc:*` 语义标识。

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

- 第一层和第二层公开文档必须双语同步。
- 内部技术、参考、维护、历史与规划文档默认中文。

## 本地工具状态

- 项目级 `.codex/` 与 `.omx/` 已退役，不再作为当前仓库的本地状态入口。
- 如需保留历史 session、prompt、log、hook 或执行痕迹，应迁入用户级 `~/.codex/` 归档。
