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

## Fresh Intake 2026-06-12

This tranche used OPL Doc as a semantic SSOT governance lane across the six default repos after fresh `git fetch`, root status reads, repo-local guidance reads, active-truth owner reads and OPL Doc doctor risk-map checks. It governs high-confidence docs lifecycle compression and support-doc role correction only.

It does not attempt physical source/test/workflow/package/CLI/API retirement because the readback did not produce no-active-caller, replacement parity, owner receipt / typed blocker roundtrip, no-forbidden-write proof and tombstone/provenance proof for any concrete interface. OPL and MAS also have concurrent runtime/currentness source-test edits in the root checkouts; those edits are outside this docs-governance tranche.

| Repo | Fresh state / write boundary | SSOT result | Edited / carried forward |
| --- | --- | --- | --- |
| `one-person-lab` | Root checkout has concurrent runtime/currentness source-test edits; docs write set is limited to active support foldback and this history rollup. | Active truth remains `docs/active/current-state-vs-ideal-gap.md`; `docs/active/opl-family-ideal-operating-model-redesign.md` is support/north-star only, including the 2026-06-12 `running smoothness / output quality / brand feel` refresh. | Folded the ideal-experience refresh back into the active owner read section and recorded this six-repo coverage result here. Next OPL write scope remains concrete active/support thinning for `architecture.md`, `decisions.md`, and large support docs when disjoint from owner/runtime edits. |
| `one-person-lab-app` | Clean before this lane; docs-only release guide compression is safe. | Active truth remains `docs/active/app-ideal-state-gap-plan.md`; release truth remains `contracts/app-release-channel.json`, workflows, validators and release artifacts. | Compressed `docs/release/README.md`, changed active plan date to `Last reviewed`, and folded the release-guide compression rule into App process history. |
| `med-autoscience` | Root has concurrent currentness source/test edits; docs-only changes avoid that write set. | Active truth remains `docs/active/mas-ideal-state-gap-plan.md`; MAS Agent OS target architecture is support reference, not an active plan. | Reclassified the target architecture doc as `active_support_reference` and narrowed the medical display board role. Status/decisions/display catalog compression remains next scope. |
| `med-autogrant` | Clean before this lane. | Active truth remains `docs/active/mag-ideal-state-cross-repo-gap-plan.md`; command evidence should use repo-local clean runner unless the shell command source is verified. | Updated Chinese README command wording to avoid treating bare `uv run mag` / PATH `mag` as readiness evidence. Architecture/status thinning remains next scope. |
| `redcube-ai` | Clean before this lane. | Active truth remains `docs/active/rca-ideal-state-gap-plan.md`; ideal state remains the reference doc; support docs are not readiness truth. | Folded this readback into `docs/history/process/README.md`. Concrete status/architecture/decisions thinning and physical-retirement lanes remain future work. |
| `opl-meta-agent` | Clean before this lane. | Active truth remains `docs/active/opl-meta-agent-ideal-state-gap-plan.md`; dynamic OPL read-model counts stay out of the active plan. | Compressed active-plan evidence prose around production-consumption and stage-replay typed-blocker evidence. |

Coverage result:

- Reviewed owner routes: six repo `AGENTS.md` / `TASTE.md` where present, six active truth owners, OPL Doc doctor risk maps, edited peer docs and their immediate SSOT peers.
- Edited docs: OPL active/support foldback and this rollup; App release guide / active plan metadata / process history; MAS medical display board and Agent OS target architecture support doc; MAG Chinese README command evidence wording; RCA process history index; OMA active plan evidence prose.
- Not fully covered in this tranche: every paragraph in the six repos' full `README*` and `docs/**/*.md` corpus, OPL `architecture.md` / `decisions.md` thinning, MAS status/decisions/display catalog compression, MAG architecture/status thinning, RCA status/architecture/decisions thinning, OMA script-to-pack source reductions, and all concrete physical retirement lanes.
- Remaining stale/retire candidates require their owning repo's fresh replacement-owner, no-active-caller, owner receipt / typed blocker roundtrip, no-forbidden-write and tombstone/provenance evidence before deletion. This tranche authorizes no source, contract, test, workflow, package, CLI/API or runtime surface deletion by itself.

The parent OPL Doc `/goal` remains open. This tranche covers high-confidence SSOT compression and role correction; it does not prove full six-repo paragraph coverage or close remaining functional/evidence gaps.

## Fresh Intake 2026-06-12 Runtime Decisions Follow-up

This OPL-only follow-up continued the runtime / provider / executor boundary SSOT lane after the MAS currentness source/test work was verified and landed in `med-autoscience` as `c7ea46029 fix(runtime): harden readiness blocker currentness`. That MAS commit is runtime authority foldback evidence, not six-repo docs coverage, domain-ready proof, paper progress, owner receipt, typed blocker closure, or physical retirement authorization.

Semantic theme: OPL runtime history and Runtime Manager current-reading compression in `docs/decisions.md`.

Single Source of Truth:

- Runtime boundary support: `docs/runtime/opl-runtime-naming-and-boundary-contract.md`.
- Runtime Manager detail: `contracts/opl-framework/runtime-manager-contract.json`, `docs/references/runtime-substrate/opl-runtime-manager-target.md`, runtime source/tests, and fresh CLI/read-model.
- Current active baton: `docs/active/current-state-vs-ideal-gap.md`.
- Current core docs: `docs/architecture.md`, `docs/status.md`, `docs/invariants.md`, `docs/decisions.md`.
- Historical provenance: `docs/history/runtime-substrate/README.md`, `docs/history/process/plans/2026-06-09-opl-decisions-runtime-history-compression-closeout.md`, and this rollup.

Edited docs:

- `docs/decisions.md`: compressed the 2026-04-26 Runtime Manager historical implementation longlist into a current-reading paragraph that points to the contract/runtime support owners and keeps only the no-resurrection boundary; marked the 2026-04-11 runtime substrate decision as historical and removed active-looking `gateway` wording from its impact.
- `docs/history/process/plans/2026-06-09-opl-series-doc-governance-ledger-chain-rollup.md`: records this follow-up and preserves the open parent goal.

Coverage / carry-forward:

- Covered: OPL `docs/decisions.md` runtime history paragraphs that could still freeze implementation detail, native-helper dynamic state, provider lifecycle detail, or stale Gateway vocabulary inside an active decision log.
- Not covered: full OPL `docs/architecture.md` / `docs/status.md` thinning, every OPL support/reference doc paragraph, the full six-repo docs corpus, and any source/test/workflow/package/CLI/API physical-retirement lane.
- Remaining rule: stale source/test/workflow/package/CLI/API surfaces still require replacement-owner, no-active-caller, no-forbidden-write, owner receipt / typed blocker roundtrip or explicit owner decision, and tombstone/provenance evidence before deletion. This follow-up authorizes no physical surface deletion.

## Fresh Intake 2026-06-12 Active Gap Readout Compression Follow-up

This OPL-only follow-up continued the active gap / status dynamic readout compression lane. It does not supersede the earlier six-repo intake and does not close the parent OPL Doc `/goal`.

Semantic theme: OPL active truth and status pages were freezing dated readout packets, work-order detail and runtime-currentness implementation history that now belong to live CLI/read-model, source/contracts/tests or history provenance.

Single Source of Truth:

- Active owner: `docs/active/current-state-vs-ideal-gap.md`.
- Current summary: `docs/status.md`.
- Dynamic readout: `opl framework readiness --family-defaults --json`, `opl framework operating-maturity --family-defaults --json`, `opl agents conformance --family-defaults --json`, `opl brand-modules l5-status --json`, and `opl agents default-callers --family-defaults --json`.
- Runtime/currentness detail: contracts, source, tests, provider/read-model output and runtime ledger.
- Historical provenance: this rollup and git history.

Edited docs:

- `docs/active/current-state-vs-ideal-gap.md`: compressed dated machine readout blocks into a fresh readout discipline table, kept the 2026-06-12 conclusion as a short readback, and corrected conformance status to `passed_count=4` / `blocked_count=0` while preserving the `not_ready_claim` boundary.
- `docs/status.md`: compressed the Foundry Agent OS, multi-plane operating model, Temporal / StageRun transport, Runway current-control and Stage-route substrate date chain into current status semantics and owner-delta-first live-read rules.
- `docs/history/process/plans/2026-06-09-opl-series-doc-governance-ledger-chain-rollup.md`: records this tranche as compact topic-level provenance instead of creating another dated ledger file.

Coverage / carry-forward:

- Covered: OPL active gap and status paragraphs that were duplicating dynamic counters, W0-W7 work-order detail, provider / attempt history, currentness implementation longlists or branch-era readbacks as current truth.
- Not covered: full OPL `docs/architecture.md` / `docs/decisions.md` thinning, every OPL support/reference doc paragraph, every paragraph in the six repos' full `README*` and `docs/**/*.md` corpus, MAS status/decisions/display catalog compression, MAG architecture/status thinning, RCA status/architecture/decisions thinning, OMA script-to-pack source reductions, and all concrete physical-retirement lanes.
- No physical source, contract, test, workflow, package, CLI/API or runtime surface deletion is authorized by this follow-up. Concrete retirement still requires replacement-owner, no-active-caller, no-forbidden-write, owner receipt / typed blocker roundtrip or explicit owner decision, and tombstone/provenance evidence.

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
