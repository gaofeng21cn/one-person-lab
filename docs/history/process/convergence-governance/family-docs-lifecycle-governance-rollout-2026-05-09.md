# OPL Family Docs Lifecycle Governance Rollout 2026-05-09

Status: `historical_family_governance_rollout`
Owner: `One Person Lab`
Purpose: record the 2026-05-09 docs lifecycle governance rollout that later fed the current OPL family documentation lifecycle policy
State: `history_only`
Machine boundary: human-readable history only; machine surfaces must use contracts, schemas, source paths, generated artifacts, CLI/API behavior, or semantic `human_doc:*` ids.

2026-05-14 update: 本记录中的“允许目录名差异 / role-equivalent information
architecture”是当时的过渡口径。当前目录治理已由
[OPL 系列项目开发主参考](../../../active/opl-family-development-reference.md)
刷新为同名 canonical docs taxonomy：OPL、MAS、MAG、RCA 统一使用
`active/public/product/runtime/delivery/source/policies/specs/references/history`
作为长期目录集合；旧 `program/plans/capabilities` 等目录能物理迁移就直接
迁移，仍暂留的旧路径只能作为外部/上游支撑、历史 provenance 或 tombstone
保留。

## 背景

MAS 在 2026-05-09 完成了一轮全量 `docs/` 分层与生命周期治理。关键经验不是“把所有仓库目录改成完全一样”，而是把文档当成有生命周期的组合资产管理：

- 默认入口保持短而稳定。
- 核心真相保留在 core five。
- 执行计划、参考材料、运行合同、能力族材料和历史 provenance 分层。
- 完成或退役的计划进入 history，不继续占据默认阅读路径。
- 文档可以合并、精简、重写和移动，但不能改变 machine truth owner。

这份文档把该经验上升为 `OPL` family 标准，用于 `OPL`、`MAS`、`MAG`、`RCA` 以及后续准入 domain repo。

## 外部实践参考

本标准借鉴成熟文档工程实践，但只吸收适合 OPL family 的部分：

| 来源 | 吸收规则 |
| --- | --- |
| [Diataxis](https://diataxis.fr/) | 用读者意图区分 explanation、how-to、reference 与 tutorial；OPL family 映射为核心解释、执行入口、规则/运行 reference、历史/provenance。 |
| [GitLab documentation topic types](https://docs.gitlab.com/development/documentation/topic_types/troubleshooting/) | 把 troubleshooting、task、reference 放在可检索的 topic 边界里；OPL family 对应为 active guide、policy/reference 与 history troubleshooting。 |
| [Microsoft Learn style guide](https://learn.microsoft.com/en-us/style-guide/word-choice/use-simple-words-concise-sentences) | 保持短句、明确术语、少堆叠形容词；默认入口短，长解释下沉到目录 README 或 reference。 |
| [Write the Docs: Docs as Code](https://www.writethedocs.org/guide/docs-as-code.html) | 文档走 repo review、diff、link check、验证与 lifecycle owner；但不把 Markdown prose 变成机器接口。 |

## Family 标准

每个仓库都必须能回答四个 lifecycle signals：

| Signal | 要求 |
| --- | --- |
| `owner` | 哪个 repo、domain、program 或 maintainer surface 持有该文档的当前真相 |
| `purpose` | 默认入口、核心解释、运行/规则 reference、执行 program、能力族文档、支撑 reference、历史 provenance、tombstone |
| `state` | `active_truth`、`active_support`、`support_reference`、`dated_snapshot`、`superseded`、`retired`、`tombstone` 或仓库本地等价状态 |
| `machine boundary` | 代码、测试、contract、dashboard 或 runtime 是否可以直接依赖它；默认答案应为否 |

这些 signals 不要求每个文档都用同一个 front matter 格式，但长期文档必须能在正文、目录 README 或 portfolio note 中被明确归类。

## 统一与差异

### 必须统一

- `README*` 与 `docs/README*` 是默认入口，不承载长清单。
- `docs/project.md`、`docs/status.md`、`docs/architecture.md`、`docs/invariants.md`、`docs/decisions.md` 是核心五件套。
- `docs/docs_portfolio_consolidation.md` 是仓库内 docs governance 入口。
- `docs/history/` 是 provenance、dated snapshot、retired board、process draft 和 tombstone 的入口。
- 人读文档不能成为 machine-readable API；机器面使用 contract/schema/source/artifact 或 `human_doc:*`。
- 已完成的 plan、activation package、旧 implementation plan 和 dated intake 不能继续冒充 active backlog。

### 允许差异

- Superseded by 2026-05-14 canonical taxonomy refresh. 这些差异可作为历史迁移来源理解，不再作为新文档落点规则。

当前标准要求同名 canonical docs taxonomy，同时仍按正文内容判断 active、reference、history 或 tombstone 状态。

## Domain 应用规则

### OPL

`OPL` 是 family-level shared module / contract / index owner。它负责把文档生命周期语言、跨仓 intake 模板、family-level checklist 和 shared governance surface 固化下来，但不接管 domain truth。

当前 OPL 目标：

- 保持 `docs/docs_portfolio_consolidation.md` 为 portfolio 入口。
- 保持 `docs/references/convergence-governance/` 作为 family docs governance、cross-repo intake 与 convergence reference 层。
- 新增跨仓治理经验时，先进入 convergence-governance reference；只有长期硬规则才提升到 core five、contract 或 repo AGENTS。

### MAS

MAS 已完成 2026-05-09 docs lifecycle restructure。2026-05-14 后，它的长期目录
落点已按 canonical taxonomy 收口：

- `docs/runtime/` 拆为 contracts、control、projections、display、designs。
- `docs/active/` 承接当前执行队列、active baton 与 program lifecycle portfolio。
- `docs/delivery/medical-display/` 承接 medical-display 能力族材料。
- `docs/references/` 和 `docs/policies/` 拆分成用途明确的子目录。
- completed implementation plans 移入 `docs/history/runtime/`。

### RCA

RCA 的优化目标是把 visual-deliverable domain 的 root docs 收窄到核心入口，把 product、delivery、source、runtime 与 references 分开。

默认策略：

- 用户和 operator 文档进入 `docs/product/`。
- 交付物路线、proof、manual test brief 进入 `docs/delivery/`。
- source readiness / deep research / augmentation 进入 `docs/source/`。
- positioning、target-state、OPL handoff、executor config、quality closeout 进入 `docs/references/<purpose>/`。
- history 只保留 repo-local migration records 和 historical plans。

### MAG

MAG 的主要风险是大量 dated specs 同时承担 current truth、activation package 与历史 provenance。当前不能为了目录整齐批量移动它们，因为 `current-program.json`、历史审计和旧绝对路径仍需要可读。

默认策略：

- 保持 path-stable `docs/specs/*.md`。
- 用 `docs/specs/README*` 和 specs lifecycle map 把 active specs、support specs、historical activation packages、fail-closed hardening notes 分层。
- 新的 active work 不再继续堆进 dated specs 根层；应进入 current owner surface、`docs/active/`、references 或 history。
- 当机器面和历史审计都不再需要旧路径时，再按小批次物理迁移。

## 落地流程

每次跨仓 docs 治理按下面顺序执行：

1. 读取每个仓库的 AGENTS、README、docs README、core five、docs portfolio。
2. 建立每仓独立 worktree，避免污染根 checkout 或其他对话的改动。
3. 对每个 docs root 做 inventory：root 文件、一级目录、超长目录、machine-readable path refs。
4. 分类每份长期文档的 `owner / purpose / state / machine boundary`。
5. 先更新目录 README 和 portfolio，再移动或合并文档。
6. 移动前用 `rg` 查 inbound refs；移动后更新 active links、semantic ids 或 README index。
7. 对历史材料保留 provenance，不把旧路径示例强行改写成当前事实。
8. 每仓跑 `git diff --check`、docs link check 和仓库原生最小验证。
9. 吸收回各自 `main`，清理本次 worktree/branch；保留无关活跃 worktree。

## 完成标准

一次 docs governance rollout 只有同时满足下面条件，才算完成：

- 默认入口变短，详细索引下沉到目录 README。
- root docs allowlist 明确。
- 每个高密度目录有 README 或 lifecycle index。
- active docs 不再把 history/provenance 写成当前执行权。
- machine-readable surfaces 不依赖 prose path 或 Markdown 文案。
- old path grep 不再命中 active docs，或命中处明确是历史 provenance。
- 验证命令和 cleanup 状态被记录。
