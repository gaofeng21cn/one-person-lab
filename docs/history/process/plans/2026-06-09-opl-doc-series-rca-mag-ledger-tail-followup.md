# OPL Doc Series RCA / MAG Ledger Tail Follow-Up

Owner: `One Person Lab`
Purpose: `opl_doc_series_rca_mag_ledger_tail_followup`
State: `history_provenance`
Machine boundary: 本文只记录一次 OPL Doc series docs-governance follow-up。当前机器真相继续归各 repo 的 contracts、source、tests、CLI/read-model、runtime ledger、provider receipt、domain-owned manifests、App evidence、owner receipts、typed blockers 和 repo-local active truth owner；本文不得作为 readiness claim、owner receipt、typed blocker、quality/export verdict、artifact authority、physical delete authorization 或 compatibility surface。

## Scope

本 follow-up 只覆盖两个 clean sibling repo 的 coverage-ledger tail 收窄：

- `redcube-ai`
- `med-autogrant`

`one-person-lab` 根 checkout 当时存在并发非文档 `src/` / `tests/` 脏改动；本轮只写本 process ledger 和索引，不触碰该代码写集。`med-autoscience` 仍存在并发非文档控制面 / 测试脏改动，本轮继续不写 MAS。`one-person-lab-app` 与 `opl-meta-agent` 在 live docs 中已经记录无 unreviewed docs-governance theme 或已完成 OMA lifecycle tranche，未重复编辑。

## SSOT Decisions

| Repo | SSOT owner | Follow-up decision |
| --- | --- | --- |
| `redcube-ai` | `docs/active/rca-ideal-state-gap-plan.md`, `docs/docs_portfolio_consolidation.md`, `docs/history/process/README.md` | 历史正文按目录级 index 读取；Hermes、Phase 2、plans、positioning、tombstones、process 和 runtime history owner note 已覆盖 current read-through / no-resurrection boundary。`remaining individual history/provenance bodies` 不再作为泛化未审 docs backlog，只有 fresh scan 发现 active-looking checklist、可复制 prompt、current owner conflict 或 machine surface 依赖未压缩历史规则时才 reopening。 |
| `med-autogrant` | `docs/active/mag-ideal-state-cross-repo-gap-plan.md`, `docs/docs_portfolio_consolidation.md`, `docs/specs/specs_lifecycle_map.md`, `docs/history/specs/README.md`, `docs/history/docs-portfolio-coverage-ledger/README.md` | `product/runtime/delivery/source/policies` thin support indexes、active/support specs lifecycle map 和 history specs index 已承担对应 body governance。`active/support spec body governance`、thin support body governance 和 historical spec tombstone body 不再作为泛化未审 docs backlog，只有 fresh scan 发现 active-looking checklist、reusable prompt、current owner conflict 或 machine surface 依赖未压缩历史规则时才 reopening。 |

## Edited Repos

| Repo | Commit | Edited files | Result |
| --- | --- | --- | --- |
| `redcube-ai` | `c3333e64 docs: clarify RCA history body coverage` | `docs/history/README.md`, `docs/history/process/README.md` | 将 RCA history body coverage 从“remaining individual history/provenance bodies”收窄为 directory-level SSOT indexes covered unless triggered reopening。 |
| `med-autogrant` | `1a4661a docs: narrow MAG coverage ledger tail` | `docs/history/docs-portfolio-coverage-ledger/README.md` | 将 MAG specs / thin-support / history-spec body governance 从泛化未审尾项收窄为 indexed coverage unless triggered reopening。 |
| `one-person-lab` | this file plus process index | `docs/history/process/plans/2026-06-09-opl-doc-series-rca-mag-ledger-tail-followup.md`, `docs/history/process/plans/README.md` | 记录本 follow-up，保持 global `/goal` active。 |

No source, contract, workflow, package, CLI/API or test file was changed in this follow-up.

## Remaining Scope

The global OPL Doc goal remains open. Current carry-forward is:

| Repo | Remaining scope |
| --- | --- |
| `one-person-lab` | Full `README*` and `docs/**/*.md` paragraph-level portfolio audit remains open by semantic theme. Current process history indexes are compressed, but active support docs, runtime-substrate references, brand-module references, product/runtime/source/delivery support and remaining history clusters still need theme-by-theme SSOT lanes when selected from fresh live truth. |
| `med-autoscience` | Requires conflict-safe fresh intake after the active control-plane / test lane resolves. MAS docs are large and must be governed from live `study.yaml`, `study_progress`, publication/controller decisions, owner-route/runtime read-model and MAS active truth owner. |
| `med-autogrant` | Remaining work is private inventory detail refresh, concrete source/test/workflow/package retirement candidates and production/default-caller evidence tails. Triggered specs/history body reopening only if fresh scan finds a concrete conflict or uncompressed current rule. |
| `redcube-ai` | Remaining work is private inventory detail refresh, generated/default caller thinning evidence tails, production-like no-regression, Temporal visual-stage long soak and concrete source/contract/test retirement lanes. Triggered history body reopening only if fresh scan finds a concrete conflict or uncompressed current rule. |
| `opl-meta-agent` | Registry/App live consumption, additional target cohorts, real source patch-loop, independent reviewer direct evidence, standard target-agent handoff convergence and actual script-to-pack source reductions remain owner/evidence tails. |
| `one-person-lab-app` | Open work remains release / install / GUI implementation and evidence-tail work under App owners, not a generic unreviewed docs backlog at the recorded snapshot. |

## Verification Boundary

Docs-only verification for this follow-up:

```bash
rtk git diff --check
rtk rg -n '^(<<<<<<<|=======|>>>>>>>)' README* docs
opl-doc-doctor doctor <repo-root> --format json
```

These checks prove docs shape and conflict-marker hygiene for edited repos only. They do not prove OPL runtime ready, domain ready, App release ready, production ready, owner receipt / typed blocker closeout, quality/export verdict, artifact authority, physical delete authorization or full six-repo paragraph coverage.
