# OPL Series Docs Governance Ledger Chain Rollup

Owner: `One Person Lab`
Purpose: `opl_series_docs_governance_ledger_chain_rollup`
State: `history_provenance`
Machine boundary: 本文只保留 OPL series docs-governance ledger chain 的主题级 provenance、SSOT 决策、当前 carry-forward 和 no-resurrection 规则。当前机器真相继续归各 repo 的 active truth owner、核心文档、contracts、source、tests、CLI/read-model、runtime ledger、provider receipt、domain-owned manifests、App evidence、owner receipts、typed blockers 和 git history；本文不得作为 readiness claim、owner receipt、typed blocker、quality/export verdict、artifact authority、physical delete authorization、active worklist 或 compatibility surface。

## Scope

本 rollup 折叠并退役 2026-05-26 到 2026-06-09 之间的 OPL series docs-governance dated ledger chain。被吸收的旧文件包括：

| Group | Retired files | Current read |
| --- | --- | --- |
| Six-repo branch / worktree / doctor heartbeat ledgers | `2026-05-26-opl-doc-governance-tranche-ledger.md`、`2026-05-28-opl-series-doc-governance-tranche-ledger.md`、`2026-05-29-opl-series-doc-governance-tranche-ledger.md`、`2026-06-01-opl-series-doc-governance-tranche-ledger.md`、`2026-06-02-opl-series-doc-lifecycle-cleanup-ledger.md`、`2026-06-03-opl-series-branch-doc-governance-ledger.md` | Historical dirty/ahead/behind snapshots, branch retention reasons and doctor outputs are provenance only. Fresh governance starts from live `git fetch`, worktree status, active owner docs and OPL Doc doctor risk map. |
| 2026-05-30 OPL support-reference micro-ledgers | `2026-05-30-opl-series-doc-governance-*.md` | Durable corrections were already folded into support docs, source/contracts/tests/read-model or current owner docs. The micro-ledgers no longer carry unique current truth. |
| Old shard retirement / long-ledger compression closeouts | `2026-05-29-opl-series-doc-governance-part-ledger-retirement.md`、`2026-06-06-opl-series-doc-governance-ssot-tranche-ledger.md`、`2026-06-08-opl-series-ledger-compression-closeout.md` | The no-resurrection rule is preserved here: do not recreate dated shard chains or long command/worktree transcripts as current governance evidence. |
| 2026-06-09 OPL Doc series follow-up ledgers | `2026-06-09-opl-doc-series-six-repo-docs-process-closeout.md`、`2026-06-09-opl-doc-series-mas-ledger-compression-closeout.md`、`2026-06-09-opl-doc-series-rca-mag-ledger-tail-followup.md` | The final carry-forward is preserved below. Repo-specific current truth remains in each repo's active plan, docs portfolio governance, process/provenance index and machine surfaces. |

Exact retired text remains available through git history of the deleted files. This file is the current history/provenance entry for the chain.

## SSOT Decisions

| Semantic theme | Single Source of Truth |
| --- | --- |
| OPL docs lifecycle policy and taxonomy | `docs/docs_portfolio_consolidation.md`, `docs/policies/docs-lifecycle-policy.md` |
| OPL active truth / global next baton | `docs/active/current-state-vs-ideal-gap.md` |
| OPL development owner map | `docs/active/current-development-lines.md` plus live contracts/source/CLI/read-model |
| App active truth | `one-person-lab-app/docs/active/app-ideal-state-gap-plan.md` |
| MAS active truth | `med-autoscience/docs/active/mas-ideal-state-gap-plan.md` |
| MAG active truth | `med-autogrant/docs/active/mag-ideal-state-cross-repo-gap-plan.md` |
| RCA active truth | `redcube-ai/docs/active/rca-ideal-state-gap-plan.md` |
| OMA active truth | `opl-meta-agent/docs/active/opl-meta-agent-ideal-state-gap-plan.md` |
| Per-surface private implementation / direct-retirement detail | Each repo private implementation inventory plus machine contracts/source/tests |
| Process coverage and dated proof history | This rollup, repo-local compressed process/provenance indexes and git history |

## Compressed Result

- OPL series docs-governance records are no longer maintained as one dated file per frozen inventory, micro-cleanup, doctor run or sibling-repo follow-up.
- Durable current conclusions were already folded into active/core docs, repo-local docs lifecycle maps, machine contracts/source/tests/read-model, or compressed repo-local process indexes.
- Historical dirty-state, branch, process, command transcript, commit list, verification longlist and old "remaining unreviewed docs" snapshots are not current truth. Fresh work must rerun live status and choose a semantic SSOT lane.
- Latest follow-up evidence is folded into repo-local history/provenance owners instead of new OPL dated ledgers: RCA `a03ee655` compresses Hermes and plans history indexes, and MAG `fcb3b31` compresses product handoff history body governance. These commits are docs-history governance evidence, not functional completion, production readiness, default-caller closure or physical delete authorization.
- The global OPL Doc `/goal` remains active. This rollup closes only the stale ledger-chain shape in OPL main history.

## Fresh Intake 2026-06-09

This intake updates the rollup itself instead of creating another dated ledger
file. It records the current six-repo docs-governance gate after fresh
`git fetch`, root checkout status, repo-local coverage owners, and OPL Doc
doctor risk-map reads.

| Repo | Fresh root state | OPL Doc shape | Coverage read |
| --- | --- | --- | --- |
| `one-person-lab` @ `78690ebc` | `main...origin/main`, clean, no extra root worktree | `finding_count=0`; active owner `docs/active/current-state-vs-ideal-gap.md` | OPL main history rollup and process index are compressed; OPL itself still carries only theme-level future governance, so new work must choose one semantic SSOT lane rather than replaying old paragraph ledgers. |
| `one-person-lab-app` @ `d65afe9` | `main...origin/main`, clean | `finding_count=0`; active owner `docs/active/app-ideal-state-gap-plan.md` | App process ledger carries no generic unreviewed docs-governance theme; open scope is App implementation, release/install, GUI, or evidence-tail work when live App truth changes. |
| `med-autoscience` @ `ec5deee8` | root `main...origin/main`, clean; concurrent currentness / owner-route worktrees exist | `finding_count=0`; active owner `docs/active/mas-ideal-state-gap-plan.md` | MAS part ledgers are compressed. This intake treats MAS docs/source/test mutation as `no_safe_semantic_split` unless a new docs-only body, live-truth foldback need, or concrete stale surface with replacement-owner and no-active-caller proof is isolated from the active currentness lanes. |
| `med-autogrant` @ `16e15b3` | `main...origin/main`, clean | `finding_count=0`; active owner `docs/active/mag-ideal-state-cross-repo-gap-plan.md` | MAG coverage ledger routes active/support specs and thin support bodies through current owners. Reopen only for a precise SSOT conflict, triggered spec/history body issue, or physical-delete candidate with owner evidence. |
| `redcube-ai` @ `aa207faa` | `main...origin/main`, clean | `finding_count=0`; active owner `docs/active/rca-ideal-state-gap-plan.md` | RCA process index covers tracked human docs and retained support indexes for this tranche. Remaining work is functional/evidence-tail or concrete source/contract/test retirement lanes, not history-log expansion. |
| `opl-meta-agent` @ `19425df` | `main...origin/main`, clean | `finding_count=0`; active owner `docs/active/opl-meta-agent-ideal-state-gap-plan.md` | OMA process index covers its tracked human-doc inventory; remaining work is registry/App consumption, real patch-loop, reviewer evidence, target-agent handoff, and script-to-pack reductions under active owners. |

This intake does not close the parent `/goal`: doctor clean and compressed
ledgers are not proof of complete six-repo paragraph coverage. It does close
the safe write decision for this turn: no App/MAG/RCA/OMA docs rewrite is
needed from the current ledgers, and MAS is intentionally excluded from this
write set because the active concurrent worktrees overlap currentness and
owner-route semantics.

## Current Carry-Forward

| Repo | Current carry-forward |
| --- | --- |
| `one-person-lab` | Continue by one concrete semantic SSOT lane at a time. Candidate lanes are active/support/runtime/product/source/delivery/reference/history themes that still risk stale current-truth duplication or old surface resurrection. Fold durable conclusions into current owners; keep process detail here or in git history only at topic level. |
| `one-person-lab-app` | No generic unreviewed docs backlog is carried from the App process ledger. Open work remains release/install/GUI implementation and evidence-tail work under App owners when live App truth changes. |
| `med-autoscience` | Dated coverage part ledgers are compressed. Because active currentness and owner-route worktrees exist, MAS is `no_safe_semantic_split` for this docs-governance turn; reopen MAS only through an isolated docs-only lane for new docs, live-truth foldback, or a concrete stale source/test/workflow/package/CLI/API retirement candidate with replacement-owner and no-active-caller proof. |
| `med-autogrant` | Specs/history body governance and product handoff history are compressed in current MAG ledgers. Remaining work is private inventory detail refresh, precise source/test/workflow/package retirement candidates and production/default-caller evidence tails. Reopen docs only on a fresh current conflict, uncompressed current rule, or physical-delete candidate. |
| `redcube-ai` | Process/history governance is compressed in current RCA indexes. Remaining work is private inventory refresh, generated/default caller thinning evidence tails, production-like no-regression, Temporal visual-stage long soak and concrete source/contract/test retirement lanes. Reopen history bodies only when fresh scan finds a current conflict or uncompressed current rule. |
| `opl-meta-agent` | Registry/App live consumption, additional target cohorts, real source patch-loop, independent reviewer direct evidence, standard target-agent handoff convergence and actual script-to-pack source reductions remain owner/evidence tails. Do not reopen `external-suite` / external work-order as stale vocabulary without replacement machine truth. |

## Future Record Policy

- Do not create new dated docs-governance coverage-ledger chains for ordinary process, frozen inventory, doctor transcript, branch/worktree state, command transcripts or per-run proof.
- A future docs-governance record must be topic-level and compact: name the semantic theme, SSOT owner, edited docs, retired/tombstoned/deleted surfaces, remaining carry-forward and verification boundary.
- Durable current conclusions fold back to active/core owner docs, contracts/source/tests/read-model or the relevant repo-local process/provenance index. Historical detail stays in git history.
- Physical deletion of source, tests, workflows, package scripts, CLI/API entries or runtime surfaces still requires the owning repo's replacement parity, no-active-caller proof, owner receipt / typed blocker roundtrip, no-forbidden-write proof and tombstone/provenance pointer.

## Verification Boundary

Docs-only verification for this rollup:

```bash
rtk git diff --check
rtk rg -n '^(<<<<<<<|=======|>>>>>>>)' README* docs
rtk rg -n '<retired ledger filename>' README* docs contracts tests package.json scripts src
rtk opl-doc-doctor doctor . --format json
```

These checks prove history/provenance shape, link hygiene and OPL Doc structural health for this docs-only lane. They do not prove OPL runtime ready, any domain ready, App release ready, production ready, owner receipt / typed blocker closeout, quality/export verdict, artifact authority, physical delete authorization or full six-repo paragraph coverage.
