# OPL Doc Series Six-Repo Docs Tranche

Owner: `One Person Lab`
Purpose: `opl_doc_series_six_repo_docs_tranche_coverage`
State: `history_provenance`
Machine boundary: 本文只记录一次 OPL Doc series docs-governance tranche 的覆盖范围、SSOT 决策、未覆盖清单和下一轮写入范围。当前机器真相继续归各 repo 的 contracts、source、tests、CLI/read-model、runtime ledger、provider receipt、domain-owned manifests、App evidence、owner receipts、typed blockers 和 repo-local active truth owner；本文不得作为 readiness claim、owner receipt、typed blocker、quality/export verdict、artifact authority、physical delete authorization 或 compatibility surface。

## 本轮目标

使用 OPL Doc 治理 OPL series 六仓 `README*`、`docs/*.md` 和 `docs/**/*.md` 的文档生命周期。方法是按语义主题先确定 Single Source of Truth，再做内容级合并、历史增量长清单压缩，并在有 replacement owner / no-active-caller / no-forbidden-write / tombstone evidence 时直接退役过时模块、接口、测试、workflow 和入口，不保留兼容面。

本轮不是全局完成声明。它是一个 verified tranche：压缩 clean sibling repos 的 process coverage ledger，并留下六仓 coverage / carry-forward ledger。

## Fresh Inventory

2026-06-09 fresh inventory 后的写入边界：

| Repo | Main checkout state | 本轮处置 |
| --- | --- | --- |
| `one-person-lab` | clean `main...origin/main` | 写本全局 coverage ledger 和索引。 |
| `one-person-lab-app` | clean `main...origin/main` | 隔离 worktree docs-only 压缩 process history / portfolio foldback。 |
| `med-autogrant` | clean `main...origin/main` | 隔离 worktree docs-only 压缩 coverage ledger / portfolio foldback。 |
| `redcube-ai` | clean `main...origin/main` | 隔离 worktree docs-only 压缩 process history / portfolio foldback。 |
| `opl-meta-agent` | clean `main...origin/main` | 隔离 worktree docs-only 压缩 process history / portfolio foldback。 |
| `med-autoscience` | root checkout has unresolved merge conflicts, including `docs/decisions.md` | 本轮不写 MAS。MAS docs 同写集存在 unresolved conflict，必须等 owner lane resolve / absorb 后再 fresh intake。 |

Default OPL series scope 仍是六仓：`one-person-lab`、`one-person-lab-app`、`med-autoscience`、`med-autogrant`、`redcube-ai`、`opl-meta-agent`。`opl-doc` 是 support repo，本轮只读 skill，不纳入默认六仓写集。

## SSOT Decisions

| Semantic theme | Single Source of Truth |
| --- | --- |
| OPL series docs lifecycle method | `opl-doc` skill + each repo `docs/docs_portfolio_consolidation.md` |
| OPL active truth / global next baton | `one-person-lab/docs/active/current-state-vs-ideal-gap.md` |
| App active truth | `one-person-lab-app/docs/active/app-ideal-state-gap-plan.md` |
| MAG active truth | `med-autogrant/docs/active/mag-ideal-state-cross-repo-gap-plan.md` |
| RCA active truth | `redcube-ai/docs/active/rca-ideal-state-gap-plan.md` |
| OMA active truth | `opl-meta-agent/docs/active/opl-meta-agent-ideal-state-gap-plan.md` |
| MAS active truth | `med-autoscience/docs/active/mas-ideal-state-gap-plan.md`, pending conflict-safe fresh intake |
| Per-surface private implementation / direct-retirement detail | Each repo private implementation inventory plus machine contracts/source/tests |
| Process coverage / dated proof history | Each repo `docs/history/**` process/provenance index, not active docs |

## Edited Tranche

| Repo | Edited files | Content-level change |
| --- | --- | --- |
| `one-person-lab-app` | `docs/history/process/README.md`, `docs/docs_portfolio_consolidation.md`, `docs/active/app-ideal-state-gap-plan.md` | Folded dated App release/candidate/user-guide/runtime coverage entries into topic-level SSOT/provenance groups, then closed the named install exposure / release cohort evidence / GUI definition docs-governance tails in App commit `658c3d1`. App remaining work is implementation/evidence-tail work under existing owners, not an unreviewed docs backlog. |
| `med-autogrant` | `docs/history/docs-portfolio-coverage-ledger/README.md`, `docs/docs_portfolio_consolidation.md` | Folded dated MAG active-shell, command-surface, route/spec/history coverage entries into topic-level groups; kept specs/private-surface/physical-delete carry-forward explicit. |
| `redcube-ai` | `docs/history/process/README.md`, `docs/docs_portfolio_consolidation.md` | Folded long RCA process history across adapter thinning, Hermes, Phase 2, tombstones and plans into topic-level groups; kept retained process records and source/contract/test retirement gates explicit. |
| `opl-meta-agent` | `docs/history/process/README.md`, `docs/docs_portfolio_consolidation.md` | Folded OMA target-agent field/takeover, external-suite/work-order, script-to-pack and coverage entries into topic-level groups; kept evidence tails and script-to-pack owner explicit. |
| `one-person-lab` | this file plus process indexes | Added global six-repo coverage ledger and MAS conflict boundary. |

No source, contract, workflow, package, CLI/API or test file was changed in this tranche.

## Retired / Guarded Surfaces

No active code surface was physically deleted in this tranche. The docs-level retired or guarded surfaces remain:

| Repo | Guarded surface classes |
| --- | --- |
| App | Legacy **Build and Release** workflow, optional release-evidence seed download, command-center duplicate active doc, duplicate candidate verification checklist, user-guide screenshot release-readiness proof, Team ordinary-user route, single Developer Mode switch, legacy settings routes. |
| MAG | `run-local`, `runtime-run`, `runtime-resume`, `probe-upstream-hermes`, active `frontdoor` fields/help wording, local journal / attempt ledger, Gateway/local-manager default path, flat aliases, facades, patch bridge, compatibility aggregate tests, physical-delete-by-read-model claims. |
| RCA | Active-looking Hermes / Phase 2 / history prose, repo-local product/session/domain_action_adapter/runtimeWatch/operator projection compatibility wording, old public path tests, alias/facade/fallback surfaces, `legacy_payload_field_aliases`, physical-delete-by-read-model claims. |
| OMA | Old target-agent fields, external-agent takeover identifiers, `takeover:test --fixture`, implicit fixture graph, direct graph compatibility, generic `external_agent/*` patch-ref fallback, compatibility facades and repo-owned generic runtime/wrapper/App/registry/Agent Lab/promotion surfaces. |

These are no-resurrection guards, not physical-delete authorization. Any source/test/workflow deletion still needs the repo-local machine gate, replacement parity, no-active-caller proof, owner receipt / typed blocker roundtrip, no-forbidden-write proof and tombstone/provenance pointer required by the owning repo.

## Remaining Scope

| Repo | Remaining docs governance scope |
| --- | --- |
| `one-person-lab` | Full OPL `README*` and `docs/**/*.md` paragraph-level portfolio audit remains open; current active/support docs still require future theme-by-theme SSOT lanes, especially active support docs with target architecture, ordinary progress spine, brand module and private platform inventory content. |
| `one-person-lab-app` | App `README*` and `docs/**/*.md` have no unreviewed docs-governance theme remaining at App commit `658c3d1`. Open App work remains under existing owners: future release cohorts, Full/VM evidence, candidate shell technical proof/adoption gates, GUI implementation parity and install exposure live-root validation when package roots change. |
| `med-autoscience` | No write in this tranche due unresolved merge conflicts. Requires conflict-safe fresh intake over MAS active truth, core docs, `docs/docs_portfolio_consolidation.md`, huge history/process ledgers and current owner-route/runtime evidence after the active owner lane resolves. |
| `med-autogrant` | Active/support spec body governance, product/runtime/delivery/source thin support body governance, remaining historical spec body tombstones, private inventory detail refresh, concrete source/test/workflow/package retirement candidates and production/default-caller evidence tails. |
| `redcube-ai` | Active private-inventory detail refresh, generated/default caller thinning evidence tails, remaining history/provenance bodies, production-like no-regression, Temporal visual-stage long soak and concrete source/contract/test retirement lanes. |
| `opl-meta-agent` | Registry/App live consumption, additional target cohorts, real source patch-loop, independent reviewer direct evidence, standard target-agent handoff convergence and actual script-to-pack source reductions. |

## Next Write Scope

The next tranche should choose one high-confidence semantic theme at a time:

1. Resolve or wait for MAS conflict owner, then run MAS docs fresh intake.
2. Continue clean repo theme lanes: MAG specs/body governance, RCA private-inventory/default-caller thinning, OMA script-to-pack / evidence-tail, or a concrete App implementation/evidence lane only when App live truth changes.
3. Return to OPL main active-support docs only with a specific SSOT theme and a concrete peer-doc set.

Do not expand process indexes back into dated proof ledgers. Durable current conclusions fold back to active/core owner docs, contracts/source/tests or the relevant machine surface. Process history keeps only compressed provenance and next write scope.

## Verification Boundary

Docs-only verification for this tranche:

```bash
rtk git diff --check
rtk rg -n '^(<<<<<<<|=======|>>>>>>>)' README* docs
opl-doc-doctor doctor <repo-root> --format json
```

These checks prove docs shape and conflict-marker hygiene for edited repos only. They do not prove OPL runtime ready, domain ready, App release ready, production ready, owner receipt / typed blocker closeout, quality/export verdict, artifact authority, physical delete authorization or full six-repo paragraph coverage.
