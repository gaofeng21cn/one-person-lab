# One Person Lab 仓库协作规范

## 适用范围

本文件适用于仓库根目录及其所有子目录；若更深层目录存在 `AGENTS.md`，以更近者为准。

## 定位

- `AGENTS.md` 只约束工作方式、少量稳定身份边界和文档生命周期纪律，不承载项目知识细节或阶段完成判断。
- OPL Flow 用户级 `~/.codex/TASTE.md` 记录维护者可跨 OPL family 与相关项目复用的维护开发 taste；进行架构、代码、文档、测试、review、cleanup 和 closeout 判断时，应先按用户级 taste 校准长期偏好，再读取本仓事实与更深层规范。
- 项目知识默认从 `README*`、`docs/README*`、`docs/project.md`、`docs/status.md`、`docs/architecture.md`、`docs/invariants.md`、`docs/decisions.md` 读取。
- `OPL` 是以 Agent executor 为最小执行单位的 stage-led 完整智能体运行框架：当前第一公民 executor 是 `Codex CLI`，`Hermes-Agent`、Claude Code 等其他 executor 可以按显式 adapter 接入；OPL 只保证接入、生命周期、回执与投影边界可审计，不保证非默认 executor 的行为或效果与 `Codex CLI` 等价。
- 当前 active domain agent 仓是 `MAS`、`MAG`、`RCA`。这些仓持有各自的 domain truth、quality verdict、runtime owner、artifact authority 与直接 app skill 路径；OPL 持有 framework-level runtime / activation / discovery / projection。
- `MDS` 已随 MAS monolith closeout 降为 MAS 显式声明的 backend audit、source provenance、historical fixture、explicit archive import、upstream intake 与 parity oracle reference。
- `opl-aion-shell` 是用户 fork 的上游 AionUI implementation carrier，App 内 `shells/aionui/**` 同样按上游 AionUI body 处理。除非用户明确指定 OPL-owned overlay / adapter 的写集、验证命令和回滚点，否则默认只读；不得做测试瘦身、结构重写、样式/交互重构、依赖升级或实现清理。误动这些路径时优先回退误动，不把它们纳入 OPL family 常规落地范围。

## 开发原则

- 维护开发判断默认遵循用户级 `~/.codex/TASTE.md` 的原则；如果本仓事实、contracts、runtime evidence 或更深层 `AGENTS.md` 需要局部偏离，必须把偏离原因和适用范围写清楚。
- 第一优先级：保持 `Codex CLI first-class executor -> explicit OPL activation -> stage-attempt projection / Temporal-backed provider runtime -> selected domain agent entry` 这条当前主链路；domain app skill 的 direct path 仍是一等入口，其他 executor 只通过显式 adapter 进入。
- 第二优先级：把 shared modules / contracts / indexes 的共享边界放在 domain 仓之上，同时保留 domain-owned truth。
- 第三优先级：保证 public docs、machine-readable contracts、reference docs 与 active domain agent 状态同步，不制造第二真相源。
- 面向本仓的方案、重构、优化、代码改动、配置改动和文档改动，必须在方案说明、执行说明和最终汇报中标明涉及的 OPL 品牌模块；若涉及多个模块，应分别列出主模块、协同模块和不触碰范围。当前品牌模块集合以 `contracts/opl-framework/brand-module-registry.json`、`docs/references/brand-modules/`、核心五件套和 fresh `opl brand-modules * --json` 输出为准；本规则只约束表达透明度，不把当前模块数量冻结为上限。若实际需要新增、合并、拆分或退役模块，必须说明必要性、目标 owner、machine boundary、验证口径和文档 / contract foldback。
- OPL family 以理想目标态为最高优先级：OPL 是完整智能体开发/运行框架，MAS/MAG/RCA 是标准化 OPL Agent。当前 domain 仓内已经存在的私有 scheduler、runner、session store、lifecycle、workbench、sidecar/status/product wrapper 等实现，只能作为迁移输入，不能反过来定义长期架构。
- 标准 OPL Agent 默认是 `Declarative Domain Pack + OPL generated/hosted surfaces + minimal authority functions`；私有功能面是例外，必须写清接口、active caller、不能上收原因、receipt/blocker/ref 输出边界和退役门。
- Live Evidence 后置是 OPL family 的基本开发原则。日常开发默认先关闭功能/结构缺口，包括 source、contract、CLI/API、readback、App shell、generated / hosted surface、wrapper retirement、第二语义控制面退役、memory/artifact/lifecycle functional boundary 和 no-second-truth guard。Live Evidence / production evidence / L5 evidence 保留为 release、readiness、Brand L5、provider long-soak、真实用户路径、真实项目运行和 owner acceptance 的后置验收 lane；它们不阻塞可独立完成的功能/结构清理，也不能被 docs、contract pass、focused tests、projection clean、refs-only ledger 或 source cleanup 替代为 ready claim。
- 开发文档先设理想态，再找差距；差距不是妥协清单。为了理想态，可以做革命式重构并完全抛弃旧模块、旧接口、旧测试、旧目录和旧文案，不以兼容为理由保留历史污染面。
- repo-tracked 源码与测试默认都应保持文件边界清晰，优先控制在 `1000` 行以内；超过 `1500` 行应视为明确的拆分信号，而不是继续堆叠实现。line budget 默认是结构维护 advisory，不进入日常开发硬门；默认 `verify`、`smoke`、`fast`、`lint` 不得因行数预算阻断。已显式审查并写入 `contracts/opl-framework/source-structure-budget.json` 的历史超线文件由定时结构治理和显式 strict 入口执行 ratchet：`scripts/line-budget.mjs --strict`、`OPL_LINE_BUDGET_STRICT=1`、`npm run line-budget:strict`、`./scripts/verify.sh line-budget:strict` 或 `./scripts/verify.sh structure:strict` 才把新增超线、超过 reviewed baseline、stale baseline 和 retired baseline 作为失败。新增超线优先按语义边界拆分；若暂时不拆，必须提交带 owner、reason 与 intended boundary 的 reviewed baseline。
- 新增能力或继续重构时，优先采用稳定薄入口加 `parts/`、`cases/`、`modules/` 等子模块拆分；不要把新逻辑继续堆回单个超长文件。
- 若文档提到 `Hermes-Agent`，必须明确它指的是上游外部 runtime 项目 / 服务；仓内自写的 shim、pilot、helper 或过渡 scaffold，不得写成“已接入 Hermes-Agent”。
- Temporal-backed provider 是 OPL production online runtime 的必需 substrate；`Hermes-Agent` 不再作为目标 24h session/wakeup substrate，但作为可选 Agent executor adapter、显式 proof lane、diagnostic 或历史参考保留。文档和合同必须区分 required production substrate、landed state、executor adapter 与 retained provenance；local provider 只能写成 dev/CI/offline diagnostic baseline，不能写成 Full online readiness 的替代品。
- 一旦 target topology 已明确，新增投入默认服务目标形态；旧路线只允许作为迁移桥、兼容层或回归对照存在，不继续深磨。
- 已被当前 owner surface 替代的模块、接口、alias、facade、聚合测试和文档入口，默认迁移 active caller 后直接退役；需要来龙去脉时只保留 history/tombstone/provenance，不新增兼容面。
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
- `docs/active/`：当前执行、当前计划、当前差距、active baton 与 closeout evidence；OPL 系列项目开发主参考和 OPL 自身 gap plan 保持在这里。
- `docs/public/`：当前公开叙事、roadmap、task map 与 operating model。
- `docs/product/`：One Person Lab App/workbench、operator entry、product entry、action-routing shell 与 public surface 支撑；`opl-aion-shell/docs` 属于上游 AionUI 依赖文档，不纳入本仓 docs taxonomy 治理。
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
- OPL、MAS、MAG、RCA 采用同名 canonical docs taxonomy：`active/public/product/runtime/delivery/source/policies/specs/references/history`；目录是否保留按长期生命周期职责判断，不按当前文件数量判断。
- OPL 文档持有全局目标、全局差距、shared primitive 上收边界、App/workbench 目标、domain admission 与跨仓开发顺序；MAS/MAG/RCA 只在各自仓维护本仓 truth、gap、authority、direct/hosted 边界和上收候选。
- 理想态差距和开发计划默认拆开写 `功能/结构差距` 与 `测试/证据差距`；不能把“功能本身未完成”和“功能已在但缺少测试/真实证据”混在同一差距项里。
- `功能/结构差距` 按目标态判断，不按现有实现是否可用判断；凡现有功能面应由 OPL primitive / pack compiler / App shell 承担，就写成上收、generated surface 替换、收薄或退役差距。
- Live Evidence、production evidence、release evidence、Brand L5 evidence、owner-chain scaleout、provider long-soak 和真实项目 evidence 默认写入 `测试/证据差距` 或后置验收 lane；只有它们正在保护启动安全、authority、不可逆 mutation、owner receipt、typed blocker、release/production claim 或 closeout admission 时，才允许升级为当前功能开发 blocker。
- 新文档先判断角色，再决定落点；不要把公开主线、合同配套、参考材料和历史记录混在同一层。
- `README*`、`docs/**` 与参考文档是人读面。代码、测试、contracts、dashboard 或 runtime 不得把 prose path、Markdown 章节或文案当成稳定机器接口；确需关联人读材料时，使用 contract/schema/source 路径或 `human_doc:*` 语义 ID。
- 根层 `README*` 是面向使用者的公开入口，默认从问题、价值、场景、开始方式和可见效果讲起；关键概念可以在公开区出现，但必须先翻译成用户能理解的效果，并优先使用肯定表达，例如“认知计算”应解释为 AI 在阶段内理解、比较、创作、审阅和修订；`executor-first`、stage、route、receipt、typed blocker、Tool Affordance Boundary、domain truth、quality verdict 等技术边界只放在折叠的 Agent / 开发者 / operator 区或 canonical 技术文档。
- 退役定位只能放在 `docs/history/**` 的 archive / tombstone 语境中；active docs 提到 gateway、federation、frontdoor 等旧路线时，必须同时指向当前 truth owner。
- 如果某条规则需要长期冻结，应写入 `docs/invariants.md` 或相关 contract/doc surface，而不是继续堆在 `AGENTS.md`。

## 变更与验证

- 保持 diff 小、可审查、可回退。
- 能删就别加；能复用现有模式就别新起抽象。
- 没有明确必要不要新增依赖。
- 当用户要求“彻底落地 / 全部落地 / 一步到位 / 完善后立刻吸收 / 持续推进直到完成 / 能做的都做掉”等目标态交付时，最终声称完成前必须执行 `Plan Completion Audit`：把原始规划拆成可验收条目，逐项给出 `done / partial / not_started / blocked`、完成度百分比、新鲜证据、缺口和后续动作。`100%` 只能用于已有 fresh executable evidence 的条目；docs、catalog、plan、read-model、refs-only surface、contract landed、测试绿或提交推送不能单独替代 runnable behavior、runtime artifact、owner receipt、end-to-end acceptance 或用户明确要求的目标态证据。
- 若 `Plan Completion Audit` 仍有非 `100%` 条目，且用户要求的是“彻底落地”，默认继续推进；只有同一写集冲突、source of truth 不清、验证无法覆盖、权限/外部依赖无法满足或需要真实 owner 决策时，才输出 typed blocker / blocked，并写清不能继续的具体证据。
- 修改 machine-readable contracts、公开边界、默认 docs 入口、文档骨架或 active domain-agent wording 时，必须同步更新文档、contracts 与相关测试。
- 叙述性 `README*`、`docs/**` 和参考文档不作为脚本/测试的断言对象；可以测试 machine-readable contract、schema、CLI/API 行为、生成产物结构与路径，但不要用测试固定文档措辞、章节或状态文案。
- 默认验证入口、Python clean runner、Node-triggered Python helper 和 build/proof 命令必须把 bytecode、pytest cache、`uv sync` project venv、安装/同步副产物和 runtime artifact 导向仓库外部；禁止在开发 checkout 生成 `.venv`、`__pycache__`、`.pytest_cache` 或 `*.egg-info` 后再靠测试清理兜底。
- 默认最小验证入口是 `scripts/verify.sh`。
- 默认 smoke 是 `npm test` / `npm run test:smoke`；`npm run test:fast` 是显式标准本地入口，不作为裸 `npm test` 的默认成本。
- `npm run test:meta` 与 `npm run test:artifact` 是显式 lane。
- `npm run test:full` 是 clean-clone 基线。
- 上述验证入口必须与 `package.json` 和已跟踪测试保持一致。

## 并行开发与工作树

- 根 checkout 默认固定在 `main`；除非用户明确要求临时检查分支状态，否则不要在共享根 checkout 切到非 `main` 分支。非 `main` 开发、验证、CI 修复和并行 lane 都应通过独立 worktree 承载。
- 大改动、长链路工作、并行多 AI 开发，默认先从最新 `main` 开独立 worktree，再在 worktree 内实现和验证。
- 共享根 checkout 只用于轻量阅读、评审、吸收验证后提交、push 和清理，不应长期承担重型实现。
- 对互不冲突、写集可隔离、source of truth 清楚的任务，默认优先用 subagent 并行开多个 worktree 推进，以提高落地效率；完善后由主会话核查 diff、验证、吸收回 `main` 并清理 worktree / branch / thread。
- 需要多条 lane 时创建多个 worktree，不要把多条长线塞进同一工作目录。
- worktree 内实现和验证完成后，应尽快吸收回 `main`，并清理对应 worktree、分支与临时状态。

## 本地状态

- 项目级 `.codex/` 与 `.omx/` 已退役，不再作为仓库本地状态入口。
- 如需保留历史 session、prompt、log 或 hook 状态，应迁入用户级 `~/.codex/` 归档，而不是继续留在仓库根目录。

<!-- OPL_FLOW_MANAGED_START -->
OPL Flow managed surface: repo_agent_instructions
Plugin: opl-flow
Plugin version: 0.1.7
Profile pointer: contracts/opl-native-profile.json
本块只声明 OPL Flow 工作流 profile 指针；repo-specific 规则、项目事实、contracts、source、tests 和 runtime 输出继续归本仓既有 owner。
请只通过 OPL Flow repo_profile sync 更新本块；本块外内容由目标 repo 自己维护。
<!-- OPL_FLOW_MANAGED_END -->

<!-- CODEGRAPH_START -->
## CodeGraph

- 本仓库使用本地 `.codegraph/` 索引；该目录不得纳入 Git。
- 定义、调用、影响范围和代码路径等结构检索优先使用 CodeGraph；字面文本检索使用 `rg`。
- 索引缺失或过期时运行 `codegraph init .` 或 `codegraph sync .`。
<!-- CODEGRAPH_END -->
