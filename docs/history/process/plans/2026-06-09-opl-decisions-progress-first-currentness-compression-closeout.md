# OPL 决策面 Progress-First currentness 压缩 closeout

Owner: `One Person Lab`
Purpose: `opl_decisions_progress_first_currentness_compression_closeout`
State: `history_provenance`
Machine boundary: 本文是人读 OPL Doc closeout。当前 queue / attempt / provider / read-model 机器真相继续归 `contracts/`、source、tests、CLI/read-model、runtime ledger、provider receipt 和 domain-owned owner answer refs；`docs/decisions.md` 只保留仍有效的主题级取舍。

## 语义主题

本轮治理主题是 `Progress-First queue / attempt currentness decision compression`。

`docs/decisions.md` 曾按日期持续追加 completed typed closeout、waiting-approval reconcile、superseded task reconcile、same-source anti-spin、current-control provider admission、compact timeline、queue scoped filtering、provider worker source currentness、evidence-worklist summary、Temporal worker lifecycle 和 provider SLO 的字段级实现细节。

这些内容已经不适合继续留在 active decision 面：

- 它们描述的是当前 source / tests / CLI projection 的实现细节，而不是需要人工长期阅读的决策边界。
- 多条 dated follow-through 会让 `docs/decisions.md` 重新变成实现流水账，后续维护者容易从旧字段名或旧事件名继承 stale truth。
- 当前有效取舍是 `current_owner_delta` 优先、queue / attempt / provider 只能做 OPL currentness projection、domain answer 必须回 domain owner。

## Single Source of Truth

| Theme | SSOT owner | Why it wins |
| --- | --- | --- |
| ordinary next action / owner answer root | `contracts/opl-framework/current-owner-delta.schema.json`、`docs/active/current-state-vs-ideal-gap.md`、fresh CLI/read-model | `current_owner_delta` 是 App/CLI/operator 默认 planning root；active plan 只维护当前 owner、gap、gate 和下一步。 |
| queue / attempt currentness and anti-spin | `src/family-runtime-tick*`、`src/family-runtime-domain-intake*`、`src/family-runtime-enqueue*`、`tests/src/cli/cases/family-runtime-*` | 事件名、guard、timeout、dedupe、terminal sync、same-source redrive 和 accepted typed closeout 行为必须以 source/tests 为准。 |
| provider lifecycle / Temporal SLO | `src/family-runtime-temporal-*`、`src/family-runtime-stage-attempt-*`、provider lifecycle tests、CLI read-model | Worker readiness、source-version equivalence、workflow bundle、dependency integrity、replay gate、payload guard、supervisor 和 provider SLO 是 runtime substrate 机器面。 |
| operator evidence / App drilldown | `src/family-runtime-evidence-worklist*`、`src/runtime-tray-app-operator-drilldown*`、focused tests、fresh CLI output | Evidence-worklist、compact timeline、safe action 和 App cockpit 是 refs-only projection；不能生成 domain truth 或 owner receipt。 |
| durable decision readout | `docs/decisions.md` | 只保留当前仍有效的主题级边界、authority split 和 false-authority claims。 |
| process provenance | 本 closeout 与 git history | 保存本轮压缩范围和为什么不在 active decision 面维护字段级长清单。 |

## Peer Sections Reviewed

本轮按语义核查了以下 peer surfaces：

- `docs/decisions.md`
- `docs/active/current-state-vs-ideal-gap.md`
- `docs/active/current-development-lines.md`
- `docs/active/production-framework-closure-gap-matrix.md`
- `docs/active/opl-stage-native-kernel-rollout-plan.md`
- `docs/active/development-document-portfolio.md`
- `docs/docs_portfolio_consolidation.md`
- `docs/history/process/README.md`
- `docs/history/process/plans/README.md`
- `src/family-runtime-domain-intake.ts`
- `src/family-runtime-status.ts`
- `src/runtime-tray-app-operator-drilldown.ts`
- `tests/src/cli/cases/family-runtime-queue-guards-currentness.test.ts`
- `tests/src/cli/cases/family-runtime-worker-lifecycle.test.ts`
- `tests/src/cli/cases/family-runtime-provider-slo.test.ts`
- `tests/src/cli/cases/family-runtime-evidence-worklist-*.test.ts`
- `tests/src/cli/cases/runtime-app-operator-drilldown-*.test.ts`

## 内容分类

| Classification | Readout |
| --- | --- |
| `covered_by_ssot` | 字段级 currentness 行为已由 runtime source、contracts、tests 和 fresh CLI/read-model 覆盖。`docs/decisions.md` 不再需要重复 event name、单个 guard reason 或 dated provider lifecycle 字段表。 |
| `more_specific_detail` | Active support docs 可以继续解释 `current_owner_delta` 默认根、production evidence lane、provider long-soak 和 StageRun cockpit 边界，但当前 counter、字段和事件必须回 source/read-model。 |
| `conflicts_with_ssot` | 旧 dated decision sections 会让 stale event name 和实现细节看起来像当前 authority；本轮把它们压缩成一个边界决策。 |
| `stale_or_superseded` | repeated closeout、read-model reconcile、provider liveness、queue filter、compact timeline、worker lifecycle、provider SLO 和 evidence-worklist dated follow-through list 已被 source/tests/read-model 取代为 active truth。 |
| `history_or_provenance` | 详细历史上下文保留在本 closeout 和 git history。 |
| `out_of_scope` | 本 tranche 不改变 runtime behavior、contracts、tests、CLI output、provider readiness、MAS truth、domain owner receipts、typed blockers、publication/package state、App release readiness 或 production readiness。 |

## 编辑决策

`docs/decisions.md` 从 dated implementation ledger 收薄为 compact decision surface：

- 保留 queue / attempt / provider currentness 只治理 OPL ledger 和 projection 的 durable boundary。
- 保留 `current_owner_delta` 作为 ordinary App/CLI/operator default root。
- 保留 MAS/MAG/RCA/OMA truth、owner receipt、typed blocker、quality verdict、artifact authority、App release ready 和 production ready 的 false-authority boundary。
- 把详细 dated implementation history 移到本 process closeout 和 git history。
- 当前 field / event / guard truth 回 source、contracts、tests 和 CLI/read-model。

`docs/history/process/plans/README.md` 只保留本次 decision compression 的主题级行，不重新维护 file-by-file 或 event-by-event currentness table。

## 验证

本轮 docs-only 验证在 `/Users/gaofeng/workspace/one-person-lab` 执行：

```bash
rtk git diff --check
rtk rg -n '^(<<<<<<<|=======|>>>>>>>)' docs
find README* docs -name '*.md' -type f -print | wc -l
find docs -name '*.md' -type f -print | wc -l
find docs -path 'docs/history' -prune -o -name '*.md' -type f -print | wc -l
find docs/history -name '*.md' -type f -print | wc -l
rtk rg -n 'Progress-First queue / attempt currentness|completed typed closeout|waiting-approval|same-source|provider_slo|Temporal worker|evidence-worklist|compact timeline|current-control' README* docs/**/*.md contracts src tests package.json
rtk opl-doc-doctor doctor /Users/gaofeng/workspace/one-person-lab --format json
```

结果：

- `rtk git diff --check`: passed。
- conflict-marker scan: no matches。
- post-closeout inventory: `README* + docs/**/*.md = 231`，`docs/**/*.md = 229`，non-history docs `98`，history docs `131`。
- targeted currentness scan: 确认预期命中已经回到 `docs/decisions.md` 主题边界、active support docs、history/provenance、contracts、source 和 tests。
- `opl-doc-doctor`: `finding_count=0`，`active_truth_health.status=pass`，owner doc 是 `docs/active/current-state-vs-ideal-gap.md`。

Doctor output 只作为 risk map。上述 SSOT 判断来自 source/tests/read-model ownership 和 peer document role，不来自 doctor completion。

## 剩余范围

本 closeout 只覆盖 `one-person-lab` 的 `docs/decisions.md` Progress-First currentness compression tranche。

六仓 OPL Doc governance 仍然 active。Carry-forward：

- 继续对 `one-person-lab`、`one-person-lab-app`、`med-autoscience`、`med-autogrant`、`redcube-ai` 和 `opl-meta-agent` 的 README/docs sections 做 semantic SSOT coverage。
- MAS 存在无关并发 lane 时，不进入 MAS 写集，除非 fresh safe docs-only write set 已被证明。
- 退役 stale modules、interfaces、tests、workflows 和 entrypoints 时，必须具备 replacement-owner、no-active-caller、no-forbidden-write 和 owner answer evidence。
- Historical increment ledger 保持 compact 且 repo-local；active docs 只保留 current owner、current gate、completion readout 和 next-round prompt。
