# 文档生命周期政策

Owner: `One Person Lab`
Purpose: `docs_lifecycle_policy`
State: `active_support`
Machine boundary: 本文是人读政策。机器真相继续归 contracts、schema、source、CLI/API、runtime ledgers、domain manifests 和 semantic `human_doc:*` ids。

## 当前政策

OPL series docs governance 默认覆盖 12 个维护 repo：`one-person-lab`、`one-person-lab-app`、`one-person-lab-cloud`、`opl-native-workbench`、`opl-flow`、`opl-doc`、`med-autoscience`、`med-autogrant`、`redcube-ai`、`opl-meta-agent`、`opl-bookforge` 和 `mas-scholar-skills`。其中 OPL、MAS、MAG、RCA 采用同一套 strict canonical docs 目录：

`active/public/product/runtime/delivery/source/policies/specs/references/history`

这套目录不是按“当前有没有文件”决定保留，而是按 repo 长期生命周期职责决定保留。OPL/MAS/MAG/RCA 的目录如果承接长期职责，可以暂时只有索引；但索引必须写清 owner、purpose、state、machine boundary、当前承载状态和何时应新增正文。没有长期职责的目录不进入 taxonomy。

`one-person-lab-cloud`、`opl-meta-agent`、`opl-bookforge`、`one-person-lab-app`、`opl-native-workbench`、`opl-flow`、`opl-doc` 和 `mas-scholar-skills` 纳入同一治理巡检，但按各自 repo 职责治理：Cloud 只持有长期、条件启用的 Cloud 产品包装与白皮书 truth，不把 Hosted Workspace 写成当前必要产品面；OMA 可以保持 target-agent builder 所需的轻量 docs 形态；BookForge 按 OPL-compatible authoring agent / artifact lifecycle owner 治理；App docs 归产品、release、testing、user guides 和 screenshot lifecycle；其余 support/candidate repo 只维护自身 GUI candidate、workflow profile、docs tooling 或 capability-pack truth。它们只有在出现长期 public、product、runtime、delivery、source、policies、specs 或 history 内容时，才新增对应目录索引。

## 文档基本原则

OPL 系列开发文档必须先设理想态，再用现状找差距。理想态不是从当前代码和历史目录里折中推出来的，而是从目标产品、目标架构、标准 OPL Agent 形态、owner boundary 和长期可维护性推导出来的。

差距文档不是妥协清单，也不是完成史。它的任务是把当前现状与理想态之间仍然存在的距离逐项显性化，并给出上收、重构、收薄、迁移、删除或归档路径。为了理想态，可以做革命式重构，可以完全抛弃旧模块、旧接口、旧测试、旧目录和旧文案；只要 active caller、证据、provenance 和替代 surface 被处理清楚，就不需要为历史兼容保留额外接口。

因此，文档中的 `当前实际` 只用于描述迁移起点和风险，不用于限制理想态。`功能/结构差距` 记录目标结构还未达到的 owner、模块、接口、目录、调用链和 generated surface 缺口；`测试/证据差距` 记录目标结构已经落位但还缺真实 receipt、workspace proof、provider-hosted apply、App drilldown、soak 或 regression proof 的缺口。不得把“当前已有实现”写成“长期合理”，也不得把“缺少证据”写成“功能必须继续留在旧位置”。

当某个功能/结构 gap 已经落地，active gap 文档必须删除或重写该条目，只保留当前守门面、后置 evidence 指针或 compact history pointer。若当前范围内没有 active gap，gap 文档应保持薄 current-state / no-gap / next-audit baton，而不是继续保存已完成任务清单。已完成 gap 的调研、规划、worktree closeout、branch/SHA、receipt 流水和验证过程进入 `docs/history/**`、runtime ledger、owner repo provenance 或提交历史。

## 中文 canonical 规则

`docs/**` 是开发文档和维护参考，默认只保留中文内容。稳定路径优先使用无语言后缀的 `.md` 文件承载中文 canonical 内容。历史文档可以保留旧双语计划描述作为 provenance，但 active/reference 索引必须指向当前无后缀路径。

根层 `README*` 是否继续保留公开双语入口由各仓 public/product 需求单独决定；它不改变 `docs/**` 作为中文内部开发文档的规则。

## 直接退役规则

当旧模块、旧接口、旧 CLI alias、旧 wrapper、旧 facade、旧测试入口或旧文档入口已经被当前 owner surface 替代时，默认处理是 direct retirement：

1. 先确认 active caller、合同引用、`human_doc:*` 语义 ID、fixture/provenance 需求。
2. active caller 存在时，先迁移到最新 owner surface。
3. caller 迁完后删除旧模块、接口、alias、wrapper、facade 或 aggregate compatibility test。
4. 需要保留来龙去脉时，放入 `docs/history/`、tombstone 或明确的 provenance/reference。
5. 不新增兼容 shim、别名、re-export facade 或 compatibility-only 聚合测试。

文档清理不能替代内容清理。旧内容必须按当前 owner surface 吸收、归档或删除，避免在 active/reference 层继续污染新规划。

## Active Ledger 禁止项

Active 文档不能继续充当过程账本。以下内容只能进入 `docs/history/**`、tombstone、runtime ledger 或对应机器读面：

- 某次 provider tick、safe action、receipt record/verify、workorder 计数、具体命令输出或 branch/worktree closeout。
- 某个文件从多少行拆到多少行、某次 helper extraction、某次 focused test closeout 这类 line-count / implementation ledger。
- 已闭合 tranche 的完整时间线、命令流水、commit 过程和 conflict 处理记录。

Active 文档只保留当前 owner、当前状态、当前 gap、下一跳 gate、完成口径和验证入口。若过程证据形成长期规则，先抽象成 policy/spec/contract 或核心五件套条款，再把原始流水归档。

line-budget 的逐文件 baseline 清单、当前行数和 locked limit 归 `contracts/opl-framework/source-structure-budget.json` 与 `scripts/line-budget.mjs` 管理；长期文档只写默认预算、reviewed baseline、no-growth ratchet、baseline retirement、自然语义拆分标准和验证入口，不复制逐文件数字账本。

## 单文档唯一职责

每份长期文档只能承担一个主要职责。允许在开头给出必要导航，但不能同时承担 target state、current truth、active plan、proof ledger、runbook 和 history narrative。

职责冲突时按下面顺序拆分：

- 当前事实进入核心五件套、当前 owner doc、contracts/source/runtime surface。
- 目标态进入 `docs/references/` 或明确的 ideal-state owner。
- 当前差距、执行顺序、baton 和完成门槛进入 `docs/active/` 的唯一 owner。
- 稳定命令和长期治理规则进入 `docs/policies/`、`docs/specs/` 或对应工具文档。
- dated proof、coverage tranche、branch/worktree closeout、frozen inventory、receipt 流水和历史长清单进入 `docs/history/**`。

文档中如果存在按历史增量堆叠的长表，active 层只保留 `owner / current state / evidence gate / next action` 这类当前决策所需粒度。原始逐项记录必须折叠为 history/provenance，不继续追加在 active governance、status 或 gap plan 文档里。
