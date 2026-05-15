# One Person Lab 仓库协作规范

## 适用范围

本文件适用于仓库根目录及其所有子目录；若更深层目录存在 `AGENTS.md`，以更近者为准。

## 定位

- `AGENTS.md` 只约束工作方式，不承载项目知识细节。
- 项目知识默认从 `README*`、`docs/README*`、`docs/project.md`、`docs/status.md`、`docs/architecture.md`、`docs/invariants.md`、`docs/decisions.md` 读取。
- `OPL` 是以 Agent executor 为最小执行单位的 stage-led 完整智能体运行框架：当前第一公民 executor 是 `Codex CLI`，`Hermes-Agent`、Claude Code 等其他 executor 可以按显式 adapter 接入；OPL 只保证接入、生命周期、回执与投影边界可审计，不保证非默认 executor 的行为或效果与 `Codex CLI` 等价。
- 当前 active domain agent 仓是 `MAS`、`MAG`、`RCA`。这些仓持有各自的 domain truth、quality verdict、runtime owner、artifact authority 与直接 app skill 路径；OPL 持有 framework-level runtime / activation / discovery / projection。
- `MDS` 已随 MAS monolith closeout 降为 MAS 显式声明的 backend audit、source provenance、historical fixture、explicit archive import、upstream intake 与 parity oracle reference。

## 开发原则

- 第一优先级：保持 `Codex CLI first-class executor -> explicit OPL activation -> provider-backed stage runtime / typed queue when durable orchestration is needed -> selected domain agent entry` 这条当前主链路；domain app skill 的 direct path 仍是一等入口，其他 executor 只通过显式 adapter 进入。
- 第二优先级：把 shared modules / contracts / indexes 的共享边界放在 domain 仓之上，同时保留 domain-owned truth。
- 第三优先级：保证 public docs、machine-readable contracts、reference docs 与 active domain agent 状态同步，不制造第二真相源。
- repo-tracked 源码与测试默认都应保持文件边界清晰，优先控制在 `1000` 行以内；超过 `1500` 行应视为明确的拆分信号，而不是继续堆叠实现。
- 新增能力或继续重构时，优先采用稳定薄入口加 `parts/`、`cases/`、`modules/` 等子模块拆分；不要把新逻辑继续堆回单个超长文件。
- 若文档提到 `Hermes-Agent`，必须明确它指的是上游外部 runtime 项目 / 服务；仓内自写的 shim、pilot、helper 或过渡 scaffold，不得写成“已接入 Hermes-Agent”。
- Temporal-backed provider 是 OPL production online runtime 的必需 substrate；`Hermes-Agent` 不再作为目标 24h session/wakeup substrate，但作为可选 Agent executor adapter、显式 proof lane、diagnostic 或历史参考保留。文档和合同必须区分 required production substrate、landed state、executor adapter 与 retained provenance；local provider 只能写成 dev/CI/offline diagnostic baseline，不能写成 Full online readiness 的替代品。
- 一旦 target topology 已明确，新增投入默认服务目标形态；旧路线只允许作为迁移桥、兼容层或回归对照存在，不继续深磨。
- 不做降级处理、兜底补丁、启发式修补或“先糊住再说”式实现。

## 文档分层与生命周期治理

- `README*` 与 `docs/README*` 是默认入口；`docs/**` 是中文内部开发与维护参考。
- `docs/project.md`：项目概览与当前公开角色。
- `docs/architecture.md`：顶层 session/runtime、activation、contract 与 domain-agent 边界。
- `docs/invariants.md`：硬约束与不能破坏的边界。
- `docs/decisions.md`：仍有效的关键决策与取舍。
- `docs/status.md`：当前 admitted domains、活跃主线、下一步和验证口径。
- `docs/docs_portfolio_consolidation.md` 是当前文档组合治理入口；维护者应先读核心五件套，再按该文件判断新增、更新、归档或 tombstone。
- 每份长期文档都必须能说明 `owner`、`purpose`、`state`、`machine boundary`；缺少任一信号时，先补入口或归位，再继续扩写。
- 文档治理按内容生命周期判断，文件名和目录名只作为辅助信号；同一文档内的当前事实、活跃计划、支撑参考与历史叙事应分别归入当前 owner doc、active/support 层或 history/tombstone 语境。
- 入口文档应优先让读者一眼看清当前状态、层次、新旧关系和下一跳；旧计划、旧路线和已完成 closeout 进入 provenance / history 层。
- `docs/active/`：当前执行、当前计划、当前差距、active baton 与 closeout evidence。
- `docs/public/`：当前公开叙事、roadmap、task map 与 operating model。
- `docs/product/`：One Person Lab App/workbench、operator entry、product entry 与 action-routing shell 支撑。
- `docs/runtime/`：framework runtime、provider/executor、control plane、projection/read model、resume/wakeup 与 repair 语义支撑。
- `docs/delivery/`：通用 artifact/package/export lifecycle shell 支撑；domain 交付 authority 留在 MAS/MAG/RCA。
- `docs/source/`：通用 workspace/source intake 与 source truth transport shell 支撑；domain source semantics 留在 MAS/MAG/RCA。
- `docs/policies/`：稳定治理规则、运行纪律和 repo-local 维护规则。
- `docs/specs/`：当前仍生效的 runtime、domain admission、shared boundary 或 product-boundary 规格支撑。
- `contracts/` 只保留 machine-readable contract surface；不再承载 narrative 规则。
- `docs/references/`：参考级配套文档。
- `docs/history/`：历史归档入口，包含已完成 plans、退役 specs、frontdoor / gateway / federation / routed-action 旧定位与 repo-tracked process drafts，不再承担活跃 workflow。

## 文档规则

- `docs/**` 默认只维护中文 canonical 内容；稳定路径优先使用无语言后缀 `.md`。
- 根层 `README*` 是否保留公开双语入口，由产品分发和 public 需求单独决定。
- 新文档先判断角色，再决定落点；不要把公开主线、合同配套、参考材料和历史记录混在同一层。
- `README*`、`docs/**` 与参考文档是人读面。代码、测试、contracts、dashboard 或 runtime 不得把 prose path、Markdown 章节或文案当成稳定机器接口；确需关联人读材料时，使用 contract/schema/source 路径或 `human_doc:*` 语义 ID。
- 退役定位只能放在 `docs/history/**` 的 archive / tombstone 语境中；active docs 提到 gateway、federation、frontdoor 等旧路线时，必须同时指向当前 truth owner。
- 如果某条规则需要长期冻结，应写入 `docs/invariants.md` 或相关 contract/doc surface，而不是继续堆在 `AGENTS.md`。

## 变更与验证

- 保持 diff 小、可审查、可回退。
- 能删就别加；能复用现有模式就别新起抽象。
- 没有明确必要不要新增依赖。
- 修改 machine-readable contracts、公开边界、默认 docs 入口、文档骨架或 active domain-agent wording 时，必须同步更新文档、contracts 与相关测试。
- 叙述性 `README*`、`docs/**` 和参考文档不作为脚本/测试的断言对象；可以测试 machine-readable contract、schema、CLI/API 行为、生成产物结构与路径，但不要用测试固定文档措辞、章节或状态文案。
- 默认最小验证入口是 `scripts/verify.sh`。
- 默认 smoke 是 `npm test` / `npm run test:fast`。
- `npm run test:meta` 与 `npm run test:artifact` 是显式 lane。
- `npm run test:full` 是 clean-clone 基线。
- 上述验证入口必须与 `package.json` 和已跟踪测试保持一致。

## 并行开发与工作树

- 大改动、长链路工作、并行多 AI 开发，默认先从最新 `main` 开独立 worktree，再在 worktree 内实现和验证。
- 共享根 checkout 只用于轻量阅读、评审、吸收验证后提交、push 和清理，不应长期承担重型实现。
- 需要多条 lane 时创建多个 worktree，不要把多条长线塞进同一工作目录。
- worktree 内实现和验证完成后，应尽快吸收回 `main`，并清理对应 worktree、分支与临时状态。

## 本地状态

- 项目级 `.codex/` 与 `.omx/` 已退役，不再作为仓库本地状态入口。
- 如需保留历史 session、prompt、log 或 hook 状态，应迁入用户级 `~/.codex/` 归档，而不是继续留在仓库根目录。
