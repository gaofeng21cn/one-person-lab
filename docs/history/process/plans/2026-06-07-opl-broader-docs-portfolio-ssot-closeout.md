# OPL Broader Docs Portfolio SSOT Closeout

Owner: `One Person Lab`
Purpose: `opl_broader_docs_portfolio_ssot_closeout`
State: `history_provenance`
Machine boundary: 本文是人读 OPL Doc closeout。当前执行目标、差距、完成口径和下一轮 baton 继续归 `docs/active/current-state-vs-ideal-gap.md`；文档生命周期治理归 `docs/docs_portfolio_consolidation.md`；机器真相继续归 `contracts/`、source、tests、CLI/read-model、runtime ledger、provider receipt、domain-owned manifest 和真实 App/workspace evidence。

## Semantic Theme

本轮治理主题是 `one-person-lab broader docs portfolio currentness / stale-surface routing`。

目标是按语义主题覆盖 root `README*`、`docs/*.md` 和 `docs/**/*.md`，确认当前文档组合没有第二 active truth、没有按历史增量堆叠的 active 长清单污染、没有把旧模块 / 接口 / 测试 / workflow / 入口保留成兼容面。

本轮不是逐文件润色，也不把 doctor 输出当任务清单。判断顺序是：

1. 先确定当前主题的 Single Source of Truth。
2. 再把 peer docs 的内容段落分类为 current truth、support detail、history/provenance、negative guard 或 stale pollution。
3. 若 peer docs 已经被 SSOT 覆盖且没有冲突，不做无意义重写，只记录覆盖结论和剩余范围。

## Single Source of Truth

| Theme | SSOT owner | Why it wins |
| --- | --- | --- |
| Docs lifecycle / portfolio routing | `docs/docs_portfolio_consolidation.md` | 维护 canonical taxonomy、文档角色、active/support/history 分层、长清单压缩和 direct retirement 规则。 |
| Docs navigation | `docs/README.md` | 作为 docs 默认入口，指向核心五件套、active/support/history 层和各目录职责。 |
| Current active truth | `docs/active/current-state-vs-ideal-gap.md` | 唯一 `State: active_plan`；维护当前目标、完成进度、功能/结构差距、测试/证据差距和下一轮 Agent prompt。 |
| Core current truth | `docs/project.md`、`docs/status.md`、`docs/architecture.md`、`docs/invariants.md`、`docs/decisions.md` | 分别持有项目角色、当前状态、架构、硬约束和仍有效决策；support docs 不得覆盖这些边界。 |
| Family development support | `docs/active/opl-family-development-reference.md` | 固定 OPL family owner split、目标态优先、标准 agent 物理形态、过时面直接退役和 docs taxonomy 对齐。 |
| Current owner map support | `docs/active/current-development-lines.md` | 只说明各类工作回到哪个长期 owner；不维护独立 active plan、live counter、readiness 摘要或 closeout 流水。 |
| Production closure evidence support | `docs/active/production-framework-closure-gap-matrix.md` | 解释 production closure 证据如何被唯一 active owner 消费；不声明 production ready。 |
| North-star target | `docs/references/runtime-substrate/opl-family-agent-ideal-state.md` | 持有 OPL / Foundry Agents 目标态、标准 agent 形态和旧兼容面退役原则；不冻结当前 live 状态。 |
| History / provenance | `docs/history/**` | 承载 dated proof、branch/worktree closeout、旧计划、旧路线、tombstone 和 provenance；不再承担 active workflow。 |

## Portfolio Inventory

本轮覆盖库存采用两套口径：语义审计覆盖的是新增本 closeout 之前已经存在的 portfolio；验证库存包含本 closeout 自身。

| Scope | Pre-closeout reviewed count | Post-closeout verification count |
| --- | ---: | ---: |
| `README*` + `docs/**/*.md` | 213 | 214 |
| `docs/**/*.md` | 211 | 212 |
| non-history `docs/**/*.md` | 82 | 82 |
| `docs/history/**/*.md` | 129 | 130 |

Root README files reviewed as portfolio entry points:

- `README.md`
- `README.zh-CN.md`

## Peer Section Classification

| Classification | Readout |
| --- | --- |
| `covered_by_ssot` | 当前目标、完成进度、差距、next baton 和验证入口由 `docs/active/current-state-vs-ideal-gap.md` 覆盖；docs lifecycle 由 `docs/docs_portfolio_consolidation.md` 覆盖；核心状态由核心五件套覆盖。 |
| `more_specific_detail` | `docs/active/README.md`、`current-development-lines.md`、`production-framework-closure-gap-matrix.md`、`development-document-portfolio.md`、`standard-agent-private-platform-inventory.md`、`opl-family-development-reference.md` 和 runtime/product/source/delivery/spec/reference docs 保留支撑细节，但不竞争 current truth。 |
| `conflicts_with_ssot` | 未发现非 history 文档中存在第二个 `State: active_plan`、独立 live readiness owner、domain ready owner、App release ready owner、production ready owner 或 physical-delete authority owner。 |
| `stale_or_superseded` | 旧 gateway / frontdoor / federation / Hermes-default / Product API / local-manager / wrapper / facade / alias / compatibility wording 在非 history 文档中主要作为 negative guard、support boundary 或 retired-surface rule 出现；未发现需要从 active/support 正文删除的正向兼容保留段。 |
| `history_or_provenance` | `docs/history/**` 持有旧计划、旧 route、dated ledger、branch/worktree/receipt/workorder closeout 和 tombstone；当前入口均指回 active owner、核心五件套或 machine truth。 |
| `out_of_scope` | 本轮不改 contracts、source、tests、runtime behavior、domain owner receipt、quality verdict、artifact authority、App release evidence 或 physical deletion gate。 |

## Historical Increment Compression

非 history active/support 层已经把历史增量压缩到当前 owner 读法：

- `docs/active/README.md` 明确 dated closeout、receipt/proof 流水、line-count closeout、worktree/branch 过程、workorder 瞬时计数和历史演变进入 `docs/history/**`。
- `docs/active/development-document-portfolio.md` 明确 coverage ledger 已 fold back，后续 tranche logs 不再追加到 active support。
- `docs/active/current-development-lines.md` 不冻结 live counter、receipt id、attempt id、workorder 数、branch/worktree 或 closeout 过程。
- `docs/active/production-framework-closure-gap-matrix.md` 只解释证据门，不维护 dated proof ledger。

因此本轮没有把长清单再复制进 active owner；新增文件只作为 history closeout 记录本次覆盖。

## Stale-Surface Retirement Readout

本轮确认当前 OPL docs 的退役口径已经对齐：

- 旧模块、旧接口、旧 CLI alias、旧 wrapper、旧 facade、旧测试入口或旧文档入口被当前 owner surface 替代后，迁移 active caller 后直接删除或进入 history/tombstone，不保留兼容面。
- `gateway`、`frontdoor`、`federation`、`Hermes-default`、`Product API`、`local-manager`、`MDS-default`、compat residue 和旧 route wording 只能作为 history/provenance/negative guard 或显式非默认 executor adapter 边界读取。
- Descriptor ready、conformance passed、default-caller readiness、provider proof、verified ledger、controlled canary 或 worklist count 不能升级为 domain ready、App release ready、artifact ready、quality verdict、physical delete authorization 或 production ready。

本 docs-only lane 没有授权物理删除；物理删除仍必须逐 surface 读取 replacement parity、no-active-caller、owner receipt / typed blocker、no-forbidden-write 和 tombstone/provenance。

## Edit Decision

本轮是 docs-only / no-rewrite closeout。

没有改写 root README、核心五件套、active/support/reference 正文，因为扫描结果显示当前文档组合已经按 SSOT 分层：

- 只有 `docs/active/current-state-vs-ideal-gap.md` 声明 `State: active_plan`。
- 非 history 文档中的旧词命中主要是禁止误读、retirement rule、support boundary 或 explicit non-default executor adapter 语境。
- 正向 readiness overclaim 窄扫描只命中禁止误读语境，例如 `provider proof = ready` / `generated surface = domain ready` 这类负向 guard。
- Active/support 标题中的 roadmap、plan、backlog、ledger 和 workorder 信号都有明确 support/reference/history 角色，不承担第二 active owner。

本轮只新增本 closeout，并更新 process plans history index。

## Verification

已执行并通过：

```bash
find README* docs -name '*.md' -type f -print | wc -l
find docs -name '*.md' -type f -print | wc -l
find docs -path 'docs/history' -prune -o -name '*.md' -type f -print | wc -l
find docs/history -name '*.md' -type f -print | wc -l
find README* docs -name '*.md' -type f -not -path 'docs/history/*' -print | wc -l
rtk rg -n 'State: .*active_plan|State: `active_plan|State: active_plan' docs/active/*.md
find README* docs -name '*.md' -type f -not -path 'docs/history/*' -print0 | xargs -0 rg -n '(is|are|已|已经|=|:) *(production ready|production-ready|domain ready|domain-ready|App release ready|release-ready|artifact ready|publication ready|submission ready|physical delete authorized|safe_to_delete_now|ready verdict)'
find README* docs -name '*.md' -type f -not -path 'docs/history/*' -print0 | xargs -0 rg -n '^#{1,3} .*(Plan|计划|Roadmap|路线图|Next|下一|Backlog|待办|Closeout|Ledger|Tranche|流水|证明|receipt|workorder)'
rtk opl-doc-doctor doctor /Users/gaofeng/workspace/one-person-lab-opl-broader-docs-portfolio --format json
```

Key results:

- Pre-closeout reviewed inventory: `README* + docs/**/*.md = 213`、`docs/**/*.md = 211`、non-history docs `82`、history docs `129`。
- Post-closeout verification inventory: `README* + docs/**/*.md = 214`、`docs/**/*.md = 212`、non-history docs `82`、history docs `130`。
- Active-plan scan only returned `docs/active/current-state-vs-ideal-gap.md` as `State: active_plan`.
- Positive overclaim scan only returned negative-guard wording in `docs/active/standard-agent-private-platform-inventory.md` and `docs/references/runtime-substrate/ai-first-executor-first-long-horizon-optimization.md`.
- Plan/backlog/ledger heading scan showed current active owner, support/reference headings and history headings; no competing active truth owner was found.
- OPL doctor returned `finding_count=0` and `active_truth_health.status=pass`; doctor was used only as a risk map.

## Remaining Scope

This closeout only closes the `one-person-lab` broader docs portfolio lane for this tranche. It does not close the global six-repo `/goal`.

Carry-forward remains:

- Fold this lane into the OPL series SSOT tranche ledger after commit/absorb.
- Continue semantic SSOT coverage for the remaining repo/theme lanes until six repos' README* and `docs/**/*.md` coverage ledgers have no unreviewed docs or unresolved stale/retire candidates.
- Keep physical stale-surface deletion, domain owner receipts, quality verdicts, App release evidence and production readiness outside docs-only closeouts unless their owning machine surfaces provide fresh proof.
