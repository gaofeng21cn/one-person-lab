# OPL 文档组合治理

Status: `active_docs_governance`
Owner: `One Person Lab`
Purpose: `docs_lifecycle_governance`
State: `active_support`
Machine boundary: 本文是人读治理入口。机器可读真相继续归 `contracts/`、schema、source、CLI/API 行为、runtime ledger、provider receipt、domain manifest、生成产物和语义化 `human_doc:*` id。

## 当前结论

`docs/**` 是 OPL 的中文内部开发与维护参考，不再维护 docs 层双语镜像。稳定文档路径优先使用无语言后缀 `.md` 承载中文 canonical 内容。历史文档可以保留旧双语方案、旧路径和旧命令作为 provenance，但 active/reference 索引必须指向当前无后缀路径。

OPL、MAS、MAG、RCA 采用同一套 canonical docs taxonomy：

`active/public/product/runtime/delivery/source/policies/specs/references/history`

这套目录不是按“当前有没有文件”决定保留，而是按四仓长期生命周期职责决定保留。目录有长期职责时，可以暂时只有 README/索引；但索引必须写清 owner、purpose、state、machine boundary、当前承载状态和新增正文准入规则。目录没有长期职责时，不进入 taxonomy。

`one-person-lab-app/docs/` 治理 One Person Lab App 的产品文档、release、testing、user guides 和 screenshots；当前 AionUI shell 的 upstream 依赖文档归 `opl-aion-shell/docs/`，不主导 App 顶层，也不纳入 OPL/MAS/MAG/RCA 的 canonical docs taxonomy。`one-person-lab-app/shells/aionui` 只是外部 checkout 入口，不能把 AionUI 文档历史合入 App 默认分支。OPL 主仓只记录 One Person Lab App/workbench 的目标、消费合同、action routing 和 runtime/domain truth 投影边界。

## 主参考

OPL 系列项目开发主参考是 [OPL 系列项目开发主参考](./active/opl-family-development-reference.md)。它持有：

- OPL 全局目标、全局差距、shared primitive 上收边界、App/workbench 目标、domain admission 与跨仓开发顺序；
- MAS/MAG/RCA 单仓目标、差距、authority、direct/hosted 边界和上收候选的放置规则；
- 过时模块、接口、alias、facade、聚合测试和旧文档入口的 direct retirement 规则；
- 四仓 canonical docs taxonomy 与非 canonical 目录迁移规则。

单仓文档只维护本仓 truth、差距、计划、authority 和与 OPL 的上收边界。MAS/MAG/RCA 不在本仓维护其他 domain 的 backlog，也不保留 parallel framework plan。

## 阅读顺序

1. 根层 `README*`：安装、启动和用户第一入口。
2. `docs/README.md`：文档入口和当前阅读路径。
3. 核心五件套：`project.md`、`status.md`、`architecture.md`、`invariants.md`、`decisions.md`。
4. `docs/active/`：当前执行、当前差距、active baton 与 closeout evidence。
5. `docs/runtime/`、`docs/specs/`、`docs/product/`：runtime、domain admission/shared boundary、App/workbench/product-entry 支撑。
6. `docs/source/`、`docs/delivery/`、`docs/policies/`：workspace/source、artifact/package lifecycle、稳定治理规则。
7. `docs/references/`：目标态、收敛治理、运行支撑、domain admission、样例和操作治理参考。
8. `docs/history/`：退役路线、完成计划、历史设计、tombstone 和 provenance。

## 目录职责

| 目录 | 长期职责 | 当前 OPL 承载 |
| --- | --- | --- |
| `docs/` root | 文档入口、核心五件套、docs governance | `README.md`、核心五件套、本文件。 |
| `docs/active/` | 当前执行、当前计划、当前差距、active baton、closeout evidence | family 开发主参考、当前开发线路、当前状态与理想差距、生产闭环差距矩阵、开发文档组合整理。 |
| `docs/public/` | 仓库首页之后的公开产品方向支撑 | roadmap、task map、operating model、UHS 叙事。 |
| `docs/product/` | One Person Lab App/workbench、operator entry、product entry、action-routing shell | public surface index 与 App/workbench 消费边界。 |
| `docs/runtime/` | framework runtime、provider/executor、control plane、projection/read model、resume/wakeup、repair 语义 | runtime 命名与边界合同。 |
| `docs/delivery/` | 通用 artifact/package/export lifecycle shell、locator、restore/retention、handoff projection | artifact/package lifecycle boundary。domain delivery authority 留在 MAS/MAG/RCA。 |
| `docs/source/` | 通用 workspace/source intake shell、locator、source readiness projection、source truth transport | workspace/source intake boundary。domain source semantics 留在 MAS/MAG/RCA。 |
| `docs/policies/` | 稳定治理规则、运行纪律、repo-local 维护规则 | docs lifecycle policy。硬约束仍以 core five 和 contracts 为准。 |
| `docs/specs/` | 当前仍有效的 domain admission、shared boundary、runtime/product boundary 规格支撑 | domain onboarding、shared runtime/domain contracts。 |
| `docs/references/` | north-star、positioning、integration、governance、verification、operating support | runtime substrate、convergence governance、current support、domain admission、examples、operating governance。 |
| `docs/history/` | retired route、completed plans、tombstone、provenance、process archive | gateway/federation/frontdoor/OMX/runtime-substrate/process history。 |

## 当前长期文档台账

维护者审阅 `docs/**` 时，以本台账判断每份长期文档的唯一职责。台账没有列出的 loose 文档需要先归入某个 owner 文档、子目录索引、reference/history，或在本文补充职责后再扩写。

| 文档 | 生命周期 | 唯一职责 | 当前处置 |
| --- | --- | --- | --- |
| `docs/README.md` | `active_index` | 文档入口、阅读顺序、当前 truth 去向和历史入口导航。 | 保持入口索引；不承载新计划正文。 |
| `docs/project.md` | `active_truth` | 项目公开角色、产品分层和 admitted domain 总览。 | 核心五件套；current truth 优先。 |
| `docs/status.md` | `active_truth` | 当前状态、fresh evidence、完成边界和下一步验证口径。 | 核心五件套；旧计划不得覆盖。 |
| `docs/architecture.md` | `active_truth` | 顶层 runtime、activation、contract、domain-agent 和 App/workbench 边界。 | 核心五件套；当前架构 owner。 |
| `docs/invariants.md` | `active_truth` | 硬约束、不可破坏边界和 fail-closed 规则。 | 核心五件套；长期规则优先上提到这里。 |
| `docs/decisions.md` | `active_truth_with_history_notes` | 仍有效决策和被 supersede 决策的当前读法。 | 核心五件套；旧决策必须标明 superseded。 |
| `docs/active/opl-family-development-reference.md` | `active_support` | OPL 系列项目开发主参考、owner 分层、上收判断和 direct-retirement 规则。 | 保持主参考；不替代单仓 truth。 |
| `docs/active/current-state-vs-ideal-gap.md` | `active_plan` | 对照理想态的 family-level 当前差距、执行顺序和验收顺序。 | 保持 active plan；fresh evidence 需与机器面同步。 |
| `docs/active/current-development-lines.md` | `active_plan` | 当前 framework-first 开发线路图。 | 保持 active plan；旧路线只作输入。 |
| `docs/active/opl-meta-agent-builder-plan.md` | `active_plan` | 基于完整 Agent Lab control plane 的元智能体开发计划；定义用 OPL 开发、测试、优化和持续学习新 Foundry Agent 的阶段链路。 | 保持 active plan；机器入口回到 `opl agent-lab complete --json` 和 `opl agents meta-builder plan --json`。 |
| `docs/active/production-framework-closure-gap-matrix.md` | `active_plan` | production closure 差距矩阵、evidence gate 与功能 follow-through owner。 | 保持 active plan；承接 2026-05-14 closeout 后续。 |
| `docs/active/development-document-portfolio.md` | `active_docs_support` | 开发文档组合整理和旧计划吸收/归档规则。 | 保持 active support；只管开发文档组合，不重复全仓治理。 |
| `docs/public/*` | `public_support` | 公开 roadmap、task map、operating model 和 UHS 叙事。 | 保持 public 支撑；不作为实现 backlog。 |
| `docs/product/README.md` 与 `docs/product/opl-public-surface-index.md` | `active_support` | App/workbench、operator/product entry、public surface 与 action routing 边界。 | 保持 product 支撑；App release truth 回 App 仓和 artifact。 |
| `docs/runtime/opl-runtime-naming-and-boundary-contract.md` | `active_support` | Codex-default executor、Temporal provider、explicit executor adapter 与 retired runtime vocabulary 边界。 | 保持 runtime 支撑；机器 truth 回 contracts/source/CLI/runtime ledger。 |
| `docs/delivery/artifact-package-lifecycle-boundary.md` | `active_support` | 通用 artifact/package/export lifecycle shell 与 domain delivery authority split。 | 保持 delivery 支撑；不写 domain verdict。 |
| `docs/source/workspace-source-intake-boundary.md` | `active_support` | 通用 workspace/source intake shell 与 domain source semantics split。 | 保持 source 支撑；不写领域 source truth。 |
| `docs/policies/docs-lifecycle-policy.md` | `active_policy` | docs taxonomy、中文 canonical 和 direct-retirement 政策。 | 保持 policy；硬约束必要时同步 `invariants.md`。 |
| `docs/specs/*` | `active_spec_support` | 当前仍有效的 domain admission、shared runtime/domain 和 boundary specs。 | 保持 specs 支撑；机器合同仍回 `contracts/`。 |
| `docs/references/runtime-substrate/opl-family-agent-ideal-state.md` | `active_support` | OPL Framework、Foundry Agents 与 App 的 north-star 目标态。 | 主参考；不能写成当前完成事实。 |
| `docs/references/runtime-substrate/opl-stage-led-agent-framework-roadmap.md` | `active_support` | stage-led framework roadmap、runtime substrate 与旧面退役顺序。 | 保持 roadmap；状态需服从 core five 和 fresh evidence。 |
| `docs/references/current-support/*` | `support_reference` | 安装、GUI/WebUI、release、skills、测试和质量操作参考。 | 保持支撑参考；行为 truth 回命令、合同和 artifact。 |
| `docs/references/convergence-governance/*` | `support_reference_or_rollout_record` | 收敛治理、外部学习、intake 模板和 dated rollout 记录。 | 有效规则上提；dated 记录不当 current plan。 |
| `docs/references/operating-governance/*` | `support_reference` | quality、operator projection、memory governance 和 family governance 支撑。 | 保持支撑参考；gateway-derived 旧 matrix 留 history。 |
| `docs/references/domain-admission/*` | `support_reference` | candidate backlog 和准入支撑参考。 | 保持 reference；正式准入规则回 specs。 |
| `docs/history/**` | `history_or_tombstone` | 退役路线、完成计划、frontdoor/gateway/federation/OMX/process provenance。 | 不作为 active owner；有用结论先吸收再保留原文。 |

## 四仓目录状态

| 仓库 | 当前判断 |
| --- | --- |
| `OPL` | 完整保留 canonical 目录集合；本轮把 active 中的 runtime/spec/product 内容归位，并给 source/delivery/policies 放入真实 owner 文档。 |
| `MAS` | 完整保留 canonical 目录集合；`active/runtime/delivery/policies/references/history` 已真实承载，`product/public/source/specs` 可先保持薄索引，后续按真实 owner surface 吸收。旧 `program/`、`capabilities/` active 目录已物理退役，历史内容留在 `docs/history/`。 |
| `MAG` | 完整保留 canonical 目录集合；真实 owner 主要在 core five、`active/`、`references/`、`specs/`、`history/`，`product/runtime/delivery/source/policies/public` 先作为职责明确的薄索引，后续小批量吸收仍 current 的内容。旧 `plans/` 已退役。 |
| `RCA` | 完整保留 canonical 目录集合；`active/product/runtime/delivery/source/policies/references/history` 已真实承载，`public/specs` 可以保持薄索引。旧 `program/`、`plans/`、`capabilities/` 不复活成 active 目录。 |

## 内容级整合规则

文档生命周期按内容判断，不按文件名、日期或目录名自动判断。维护时先拆分同一文件中的几类内容：

1. 当前事实合入核心五件套、当前 owner doc、contracts/schema/source 或 runtime/generated surface。
2. 当前执行、当前差距、active baton、closeout evidence 留在 `docs/active/`。
3. Runtime、product、source、delivery、policy、spec 这类长期 owner 内容进入对应 canonical 目录。
4. 目标态、外部学习、governance、verification、operator support 进入 `docs/references/`，不得写成 current truth。
5. 已完成计划、旧路线、旧接口、旧 provider、旧 gateway/frontdoor/federation、旧 compatibility 叙事进入 `docs/history/` 或 tombstone。
6. 如果历史文件仍因 `human_doc:*`、absolute evidence、audit path 或 contract-linked reader context 需要 path stability，先用 README/index 标清生命周期，物理迁移后置。

## Direct Retirement

过时模块、接口、CLI alias、wrapper、facade、聚合测试和旧文档入口被当前 owner surface 替代后，默认直接退役：

1. 搜 active caller、contract refs、`human_doc:*`、fixture/provenance 需求。
2. active caller 存在时先迁移到最新 owner surface。
3. caller 迁完后删除旧模块、接口、alias、wrapper、facade 或 compatibility-only aggregate test。
4. 需要保留来龙去脉时，放入 `docs/history/`、tombstone 或明确 provenance/reference。
5. 不新增兼容 shim、别名、re-export facade 或只为旧入口存在的聚合测试。

文档归档不能替代内容清理。旧内容必须吸收、归档或删除，避免在 active/reference 层二次污染新规划。

## 机器边界

`README*`、`docs/**` 与参考文档是人读面。代码、测试、contracts、dashboard 或 runtime 不得把 prose path、Markdown 章节或文案当成稳定机器接口。确需关联人读材料时，使用 contract/schema/source 路径或语义化 `human_doc:*` id。

允许测试的对象是 contracts、schemas、CLI/API 行为、source paths、generated artifact structure、manifest、runtime receipt、`human_doc:*` id 和 machine-readable index。不要新增固定 Markdown wording、章节标题、叙述路径或状态文案的测试。

## 新文档准入

新增长期文档前先回答：

| 问题 | 决策 |
| --- | --- |
| 是否决定当前执行顺序、差距、baton 或 closeout evidence？ | 放 `docs/active/`。 |
| 是否面向 public narrative / roadmap / task map / operating model？ | 放 `docs/public/`。 |
| 是否面向 App/workbench、operator/product entry、profile 或 action routing？ | 放 `docs/product/`。 |
| 是否解释 runtime/provider/executor/control plane/projection/watch/repair？ | 放 `docs/runtime/`。 |
| 是否解释 artifact/package/export lifecycle shell 或 domain deliverable support？ | 放 `docs/delivery/`。 |
| 是否解释 workspace/source intake、source readiness 或 source truth transport？ | 放 `docs/source/`。 |
| 是否是长期规则或 repo-local discipline？ | 放 `docs/policies/`，必要时同步 `invariants.md`。 |
| 是否定义当前 active spec 或 boundary spec？ | 放 `docs/specs/`。 |
| 是否是目标态、支撑参考、外部学习、governance 或 verification support？ | 放 `docs/references/`。 |
| 是否只是旧路线、完成计划、provenance 或 tombstone？ | 放 `docs/history/`。 |

无法归类的文档不得直接新增到 active 层；先更新本治理文档或对应目录 README。
