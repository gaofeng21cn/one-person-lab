# OPL Family Ponytail Audit Matrix 2026-06-27

Owner: `One Person Lab`
Purpose: `opl_family_ponytail_cleanup_audit_matrix`
State: `active_closeout_snapshot`
Machine boundary: 本文是 2026-06-27 首轮 Ponytail cleanup 矩阵、执行波次与 closeout 快照。它记录已经落地的 cleanup / reclassification / retention guard，不声明 domain ready / App release ready / production ready、不替代 owner receipt、typed blocker、runtime truth、release truth 或机器合同。后续执行必须重新读取 fresh `git status`、owner docs、contracts/source/tests/readback 与 repo-native 验证输出。

## Current Hard Guard

Effective from the 2026-06-27 upstream fork correction, older Hermes/Aion rows in this matrix are history only and must not be reused as future cleanup candidates. `opl-hermes-shell/**`, `opl-aion-shell/**`, `one-person-lab-app/shells/aionui/**`, and `_external/hermes-agent/**` are upstream fork / reference bodies by default. They may be inspected to classify fork owner and OPL overlay boundaries, but selected write sets must be limited to clearly OPL-owned overlay, adapter, docs, contracts, packaging metadata, or test shell files. Fork-body source/tests should be classified as `not_safe` / `blocked_owner_gated` with reason `upstream_fork_excluded`.

## Fresh Evidence

- 本轮最终 closeout readback：`med-autogrant`、`redcube-ai`、`opl-meta-agent` root checkout clean；`one-person-lab` root 只有非本轮 dirty 测试写集 `tests/src/cli/cases/family-runtime-binding-intake.test.ts`、`tests/src/family-runtime-codex-stage-runner-process-lifecycle.test.ts`；`med-autoscience` root 有非本轮 PaperMission / domain-handler followthrough dirty 写集，且 `main...origin/main [behind 1]`，本轮 cleanup 未覆盖这些 dirty paths。各 repo 的本轮 Ponytail 临时 worktree 已清理；剩余 dirty 写集不属于本轮 cleanup。
- OPL safe slices 已进入本地 `main`：`b00b743a docs: add ponytail cleanup runbook`、`5d7ae130 Prune unused ponytail surfaces`、`21797080 docs: add ponytail family audit matrix`、`be5865ae Shrink Temporal query import path`、`1a05dfb8 Split brand command specs`、`b6c97c0c docs: close ponytail family cleanup audit`、`82556636 Shrink stage replay workorder helpers`、`2f421aa2 docs: update ponytail family cleanup closeout`、`fbc4e406 docs: refresh ponytail closeout state`。
- OPL verification：`npm run typecheck` exit 0；DomainProgressTransitionRuntime / CLI broken-pipe focused tests 25 pass；brand / pack command surface focused tests 50 pass；Temporal provider / terminal query / stage-replay evidence-worklist focused suite 49 pass；`git diff --check` passed for the OPL cleanup diffs.
- OPL temporary lane absorption proof：`git cherry main codex/ponytail-command-spec-shrink-20260627`、`git cherry main codex/ponytail-temporal-provider-shrink-20260627` both returned `- <lane-commit>`, proving patch-equivalent absorption after cherry-pick even though ancestry-only absorption audit reported `needs-owner-review`.
- `opl-meta-agent` script-to-pack cleanup 已落到 local `main`：`c274f14` 初始 gate、`6a47399` agent evidence wrapper retirement、`2a7ceb7` external work-order retention、`9069fd6` external suite retention、`73a0d7f` stage materializer retention、`d726892` repo maintenance wrapper retention、`a645390` takeover helper retention、`555033d` authority-functions digest refresh。Fresh evidence：`npm run --silent script-to-pack:readback` 与 `script-to-pack:readback:full` 均 `ok=true`，`cleanup_candidate_count=0`、`retained_current_count=30`、`retained_current_authority_function_count=24`、`retained_current_repo_native_surface_count=6`、`missing_evidence_item_count=0`；`npm run --silent source-structure:strict:json` passed，line-budget/script guard violations 均 0；`npm run --silent test:smoke` 24/24 pass；`npm run --silent typecheck` pass。
- `opl-bookforge` owner-local cleanup landed on local `main` as `352218d Remove unused BookForge hygiene active paths constant`; fresh `npm run verify` exit 0. This removes one unused local hygiene constant and does not claim book delivery, final export, or owner acceptance readiness.
- `med-autoscience` owner-gated cleanup gate first landed on local `main` as `6f1fd3607 docs: record MAS ponytail cleanup gate`; the 2026-06-27 follow-up owner authorization converted exactly one safe item into a physical delete: local `main` now contains `f43a7271f Remove legacy owner route re-export` and `f20d3ebe9 docs: record MAS ponytail physical cleanup evidence`. Fresh evidence: `scripts/run-pytest-clean.sh tests/owner_route_reconcile_cases/test_owner_route_contract.py::test_owner_route_scan_consumer_and_executor_share_contract_import -q` passed 1/1; `scripts/run-python-clean.sh` returned `None` for `med_autoscience.controllers.owner_route_reconcile_parts.owner_route`; `scripts/run-pytest-clean.sh tests/owner_route_reconcile_cases/test_owner_route_contract.py -q -k 'not materialize_domain_action_requests_preserves_owner_route_in_dispatch'` passed 12 / deselected 1 known baseline failure; `git diff --check HEAD~2..HEAD` passed. This does not touch PaperMission truth, owner receipts, typed blockers, human gates, publication/controller/current package truth, runtime DB, or provider attempts.
- `redcube-ai` owner-local code cleanup landed on local `main` as `e6dbbc95 Share RCA PPT proof command constants`; fresh product-entry / native-PPT focused tests 3 pass, `npm run typecheck` exit 0, and `git diff --check HEAD~1..HEAD` passed. This only shares command constants and does not touch visual artifact authority, deliverable truth, quality verdicts, generated descriptors, or artifacts.
- `one-person-lab-app` docs cleanup landed on local `main` as `c7d3e38 docs: shrink Hermes candidate evidence ledger`; fresh `scripts/verify.sh smoke` exit 0 and `git diff --check HEAD~1..HEAD` passed. This shrinks dated candidate evidence prose and does not claim release/install/user-path readiness.
- `opl-scholarskills` docs cleanup landed on local `main` as `24213a6 docs: point ScholarSkills snapshots to source manifests`; fresh `scripts/verify.sh` exit 0 and `git diff --check HEAD~1..HEAD` passed. This removes duplicate snapshot numbers from README/gallery prose and points to manifest truth.
- `med-autogrant` grouped CLI wrapper cleanup and compact worklist closeout landed on local `main` as `ef1cbd6` and `a01db4a`。Fresh `./scripts/verify.sh source-purity:strict` passed；`/tmp/med-autogrant-source-purity-guard.json#/compact_cleanup_readiness_summary` reports `state=compact_cleanup_worklist_empty_current_thin_surfaces_retained`、`cleanup_candidate_count=0`、`can_apply_cleanup=false`、`can_authorize_physical_delete=false`、`owner_delta_required=false`。七个原低完成度 surfaces 已分别落为 `grouped_cli_wrapper=migrated_no_active_compat_alias_or_facade` 或 `retained_current_thin_surface`。
- `redcube-ai` default-caller tail cleanup 已落到 local `main`：`df149c94` runtime wrapper removal、`6247e7e4` refs-only readback classification、`a19463ab` tail batch3 current surface classification。Fresh `npm run --silent default-caller-tail:readback` reports `state=tail_worklist_empty_current_surfaces_guarded`、`tail_surface_count=0`、`cleanup_candidate_count=0`、`missing_evidence_surface_count=0`、`owner_delta_route_count=0`；`npm run --silent typecheck` passed。Visual artifact authority、deliverable truth、quality verdicts、generated descriptors 和 artifact blobs 仍未被 cleanup lane 写入。
- 2026-06-27 owner-authorization re-audit：user explicitly authorized physical cleanup across user-owned OPL family repos as long as function does not regress. This removes the human permission blocker, but not active-caller, replacement parity, no-forbidden-write, tombstone/provenance, or repo-native verification requirements. Four parallel item-level audits found no additional apply-safe physical delete beyond the already landed MAS legacy re-export delete.
- MAS follow-up cleanup after owner authorization landed `f61964b08` default paper dispatch diagnostics retirement、`0fe9ce20b` legacy PaperRecovery dispatch carrier demotion、`c6c42b61` PaperRecovery default-executor task materializer retirement。Fresh `scripts/run-pytest-clean.sh tests/test_legacy_active_path_retire.py tests/test_domain_handler_owner_route_handoff.py -q` passed 19/19 after absorption. Remaining `default_executor` / DHD / PaperRecovery / ScholarSkills / MDS refs are retained as ABI provenance、diagnostic、refs-only consumer 或 historical fixture/oracle surfaces, not ordinary cleanup candidates; MAS root dirty files are concurrent non-cleanup PaperMission/domain-handler work.
- MAG final re-audit：fresh `./scripts/verify.sh source-purity:strict` passed；compact cleanup summary now `cleanup_candidate_count=0`、`owner_delta_required=false`，no remaining MAG cleanup worklist item is open from this matrix.
- OMA final re-audit：fresh compact/full script-to-pack readbacks both `cleanup_candidate_count=0`、`retained_current_count=30`、`cleanup_apply_candidate_count=0`、`missing_evidence_item_count=0`。All remaining scripts are classified as retained current authority functions or repo-native verification/maintenance surfaces; no target-agent truth, owner receipt body, typed blocker body, human gate, domain ready, or production ready claim is made.
- RCA final re-audit：fresh default-caller-tail readback reports `tail_surface_count=0`、`cleanup_candidate_count=0`、`missing_evidence_surface_count=0`、`owner_delta_route_count=0`。The retained current surfaces are refs-only/domain-handler/repo-native verification boundaries, not visual deliverable authority.
- Initial inventory signal before owner-lane execution：`one-person-lab` tracked files 1687 / legacy-term hits 3401 / TODO 1；`med-autoscience` tracked files 3452 / legacy-term hits 6159 / TODO 57；`med-autogrant` tracked files 547 / legacy-term hits 1586 / TODO 22；`redcube-ai` tracked files 1366 / legacy-term hits 2219 / TODO 2；`opl-meta-agent` tracked files 210 / legacy-term hits 310 / TODO 0；`opl-bookforge` tracked files 182 / legacy-term hits 87 / TODO 0；`one-person-lab-app` tracked files 287 / legacy-term hits 260 / TODO 9；`opl-scholarskills` tracked files 19 / legacy-term hits 97 / TODO 0.

These counts are inventory signals only. They do not prove dead code, safe deletion, runtime readiness, or owner acceptance.

## Current Owner Constraints

| Repo | Current state signal | Cleanup stance |
| --- | --- | --- |
| `one-person-lab` | Main is local-ahead; no本轮 Ponytail worktree remains; root has unrelated runtime domain-intake dirty files outside this batch. | Safe OPL-only slices landed; no runtime/readiness/release claim is made from cleanup. Do not absorb or overwrite the unrelated dirty write set from this Ponytail lane. |
| `med-autoscience` | Main has non-cleanup dirty PaperMission/domain-handler write set and is behind origin by 1; cleanup commits through `c6c42b61` are on local main. | Apply-safe MAS legacy cleanup landed. Remaining default-executor/DHD/PaperRecovery/ScholarSkills/MDS refs are explicitly retained ABI/diagnostic/refs-only/provenance surfaces; not open cleanup candidates in this matrix. |
| `med-autogrant` | Main is local-ahead and clean; grouped CLI wrapper and compact worklist closeout landed. | Strict guard reports `cleanup_candidate_count=0` and `owner_delta_required=false`; original 7 surfaces are either migrated away from compat aliases or retained current thin surfaces. |
| `redcube-ai` | Main is local-ahead and clean; RCA runtime wrapper/tail batches landed. | Default-caller tail readback reports `tail_surface_count=0`, `cleanup_candidate_count=0`, `missing_evidence_surface_count=0`; visual/deliverable authority remains protected and untouched. |
| `opl-meta-agent` | Main is ahead and clean; OMA script-to-pack batch4 landed and worktrees cleaned. | Compact/full readbacks report `cleanup_candidate_count=0`, `retained_current_count=30`, `missing_evidence_item_count=0`; retained rows are current authority or repo-native verification surfaces, not cleanup candidates. |
| `opl-bookforge` | Main is ahead and clean; unused hygiene constant cleanup landed. | Further cleanup must still protect book artifact/materialization authority. |
| `one-person-lab-app` | Main is ahead and clean; Hermes candidate evidence ledger docs shrink landed. | App owns GUI shell, install, release, and user path truth; cleanup is not release readiness. |
| `opl-scholarskills` | Main is ahead and clean; README/gallery snapshot prose now points to manifest truth. | Treat as capability source of truth; do not copy or delete capability semantics from OPL/MAS without source owner route. |

## Matrix

| repo | module/owner surface | tag | candidate | authority blocker | write owner | validation | wave | status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `one-person-lab` | `OPL Runway / DomainProgressTransitionRuntime` | `shrink` | Remove unused facade re-exports while keeping implementation in `*-parts/*`. | none for first slice; contracts/docs string refs remain descriptive and were not changed. | OPL framework lane | `npm run typecheck`; focused DomainProgressTransitionRuntime tests; `git diff --check`. | `single-repo-slice` | `done` |
| `one-person-lab` | `OPL Console / CLI pipe handling` | `shrink` | Make broken-pipe helper private while keeping exported CLI installer behavior. | none. | OPL framework lane | focused CLI broken-pipe test; `npm run typecheck`. | `single-repo-slice` | `done` |
| `one-person-lab` | `OPL Charter / Atlas operating governance` | `shrink` | Add durable cleanup runbook and this family audit matrix so future candidates have owner/authority/validation fields. | none; docs do not authorize deletion. | OPL docs/governance lane | `git diff --check`; `rg` sanity; file existence. | `single-repo-slice` | `done` |
| `one-person-lab` | `OPL Connect / CLI command specs` | `shrink` | Split long command-spec builders along existing `public-command-specs-parts/` pattern. | active command catalog behavior must stay behavior-compatible. | OPL command-spec lane | `npm run typecheck`; brand / pack command surface focused tests 50 pass. | `single-repo-slice` | `done` |
| `one-person-lab` | `OPL Runway / Temporal provider import topology` | `shrink` | Shrink the query entry by importing the Temporal attempt-query part directly instead of dynamically importing the whole provider module. | runtime/readiness claims require live readback; import refactor alone is not readiness. | OPL runtime lane | `npm run typecheck`; Temporal provider / terminal query focused coverage included in 49-test suite. | `single-repo-slice` | `done` |
| `one-person-lab` | `OPL Vault / refs-only ledgers` | `shrink` | Reuse existing `json-utils.ts` for stage-replay missing receipt workorder helpers. | ledger format and receipt semantics are authority-sensitive; no receipt shape drift allowed. | OPL Vault lane | stage-replay missing receipt worklist coverage included in 49-test suite; `npm run typecheck`; `git diff --check`. | `single-repo-slice` | `done` |
| `med-autoscience` | `MAS PaperMission / paper truth` | `delete` | Physically delete the exact legacy `owner_route_reconcile_parts/owner_route.py` re-export and remove its compatibility test; keep PaperMission carriers and diagnostics that still have active owner/runtime roles. | PaperMission truth, owner receipts, typed blockers, publication/controller/current package truth, runtime DB, and provider attempts remain protected. | MAS repo owner lane | `find_spec` for old import returned `None`; replacement parity test 1 pass; focused owner-route suite 12 passed / 1 known baseline deselected; `git diff --check HEAD~2..HEAD`; `git cherry main codex/mas-ponytail-physical-cleanup-20260627` returned `-` for both lane commits before branch cleanup. | `owner-authorized-domain-wave` | `done` |
| `med-autoscience` | `MAS PaperMission / default executor diagnostics` | `delete/shrink` | Retire default paper dispatch diagnostics, demote legacy PaperRecovery/default dispatch carriers, and fail-close PaperRecovery default-executor task materializer. | Remaining default-executor refs are ABI/provenance/diagnostic current surfaces, not ordinary task/progress/provider-admission authority. | MAS repo owner lane | Local main includes `f61964b08`, `0fe9ce20b`, `c6c42b61`; fresh `scripts/run-pytest-clean.sh tests/test_legacy_active_path_retire.py tests/test_domain_handler_owner_route_handoff.py -q` passed 19/19. | `owner-authorized-domain-wave` | `done` |
| `med-autoscience` | `MAS capability registry / external ScholarSkills boundary` | `shrink` | Gate MAS refs-only use of ScholarSkills without copying capability source truth. | ScholarSkills source of truth external to MAS. | MAS + ScholarSkills owner lanes | MAS cleanup gate plus ScholarSkills verify/source-manifest docs; no semantic copy/delete in this follow-up. | `owner-gated-domain-wave` | `done_gate_no_delete` |
| `med-autogrant` | `MAG grant authority / legacy aliases` | `delete/shrink` | Remove grouped CLI wrapper dispatch and close compact cleanup worklist. | Grant verdict / artifact authority stays MAG-owned; retained current thin surfaces are not domain-ready claims. | MAG repo owner lane | `./scripts/verify.sh source-purity:strict` passed; `/tmp/med-autogrant-source-purity-guard.json#/compact_cleanup_readiness_summary` reports `cleanup_candidate_count=0`, `owner_delta_required=false`; grouped CLI wrapper is `migrated_no_active_compat_alias_or_facade`, other 6 are `retained_current_thin_surface`. | `owner-authorized-domain-wave` | `done` |
| `redcube-ai` | `RCA product-entry command constants` | `shrink` | Share image/native PPT proof command constants through existing product-entry policy constants. | visual artifact and quality verdict authority stays RCA-owned. | RCA repo owner lane | product-entry/native-PPT focused tests 3 pass; `npm run typecheck`; `git diff --check`. | `owner-local-domain-wave` | `done` |
| `redcube-ai` | `RCA visual deliverable authority` | `shrink` | Remove runtime wrapper residue and classify default-caller tail surfaces as current refs-only/domain-handler/repo-native boundaries. | Visual artifact, deliverable truth, quality verdict, generated descriptor, and artifact authority stay RCA-owned and untouched. | RCA repo owner lane | `npm run --silent default-caller-tail:readback` reports `tail_surface_count=0`, `cleanup_candidate_count=0`, `missing_evidence_surface_count=0`, `owner_delta_route_count=0`; `npm run --silent typecheck` passed. | `owner-authorized-domain-wave` | `done` |
| `opl-meta-agent` | `OMA target-agent builder` | `shrink` | Retire the first agent-evidence wrapper and reclassify all script-to-pack candidates as current authority or repo-native verification surfaces. | Target-agent truth, owner receipt bodies, typed blocker bodies, human gates, domain ready and production ready claims remain outside cleanup authority. | OMA repo owner lane | `npm run --silent script-to-pack:readback` and `script-to-pack:readback:full` report `cleanup_candidate_count=0`, `retained_current_count=30`, `missing_evidence_item_count=0`; `source-structure:strict:json` passed; `test:smoke` 24 pass; `typecheck` passed. | `small-domain-agent-wave` | `done` |
| `opl-bookforge` | `BookForge manuscript/materialization` | `shrink` | Remove unused `DEFAULT_ACTIVE_PATHS` from the repo hygiene helper. | book artifact authority stays BookForge-owned; verify output is not publication readiness. | BookForge owner lane | `npm run verify` exit 0. | `small-domain-agent-wave` | `done` |
| `one-person-lab-app` | `App GUI shell / release user path` | `shrink` | Remove dated Hermes candidate smoke ledger detail from active plan and keep evidence ownership in artifacts/history. | App release/install/user path authority; no release-ready claim from cleanup. | App owner lane | `scripts/verify.sh smoke`; `git diff --check`. | `product-doc-wave` | `done_docs_shrink` |
| `opl-scholarskills` | `ScholarSkills capability source` | `shrink` | Replace duplicate module/snapshot prose with links to module contract, SKILL, gallery manifest, and snapshot. | capability semantics must not be copied into OPL/MAS as second truth. | ScholarSkills owner lane | `scripts/verify.sh`; `git diff --check`. | `capability-source-wave` | `done_docs_shrink` |

## Remaining Owner Routes

1. `MAS runtime/live authority`: cleanup target已落地；剩余 MAS default-executor/DHD/PaperRecovery/ScholarSkills/MDS references 是 retained ABI / diagnostic / refs-only / provenance surfaces。未来只有当某个 retained surface 失去 active caller 或有 OPL primitive parity / tombstone / no-forbidden-write proof 时，才重新进入 physical delete lane。MAS paper progress、provider readiness、owner receipt、typed blocker 和 current package truth 仍由 MAS runtime/owner gates 证明，不由 Ponytail cleanup 证明。
2. `MAG current thin surfaces`: cleanup worklist已清零；`product_entry/status/user_loop/domain_handler/control_plane/lifecycle` 是 retained current thin surfaces。未来上收到 OPL generated/default caller 后，可再开删除 lane；当前不是 open blocker。
3. `RCA visual authority`: default-caller tail worklist已清零；保留的 product-entry/session/domain-action/repo-shell surfaces 是 current refs-only/domain-handler/repo-native boundaries。Visual artifact、deliverable truth、quality verdict 和 generated descriptor 仍由 RCA 自身 authority 证明，不由 cleanup 证明。
4. `OMA retained script surfaces`: script-to-pack cleanup candidates已清零；30 个 script refs 全部有 retained current 分类。未来物理删除需要先完成 OPL primitive / target-owner parity、no-active-caller、no-forbidden-write 和 tombstone/provenance proof；当前不是本轮未完成项。
5. `App release/user-path evidence`: docs shrink is done; release/install/currentness claims still require App release gates and live/user-path evidence.

## 完成度审计

| Item | Status | Completion | Fresh evidence | Gap | Next action |
| --- | --- | --- | --- | --- | --- |
| Joint read-only inventory exists | `done` | `100%` | family repo status/count scan and this matrix | Counts are not proof of deletion safety. | Rerun per repo before each owner lane. |
| OPL safe single-repo slices landed | `done` | `100%` | local `main` contains docs/surface cleanup, command-spec split, Temporal query import shrink, and Vault helper shrink; `npm run typecheck`, command-spec focused 50 pass, Temporal provider / terminal query / stage-replay evidence-worklist focused suite 49 pass | Not a runtime readiness or release claim. | Future Vault edits still require receipt-shape tests. |
| Small domain-agent safe cleanup landed | `done` | `100%` | MAS gate/physical delete/default-executor cleanup landed; MAG grouped wrapper and worklist closeout landed; OMA script-to-pack cleanup candidate list closed at 0; BookForge `352218d` cleanup + `npm run verify` exit 0; RCA constants/runtime-tail cleanup + typecheck/readback pass; App `c7d3e38` smoke pass; ScholarSkills `24213a6` verify pass | App/BookForge/RCA/ScholarSkills verification is not release/publication/deliverable readiness. Retained current surfaces are intentionally documented, not leftover cleanup candidates. | Future physical deletions need fresh item-level no-regression evidence. |
| Apply-safe physical delete candidates landed | `done` | `100%` | MAS legacy owner-route re-export physically deleted; MAS default PaperRecovery task materializer retired; OMA first agent-evidence wrapper retired; RCA runtime wrapper removed; MAG grouped CLI wrapper dispatch removed. Focused repo-native tests/readbacks passed after absorption. | This does not authorize deleting retained ABI/diagnostic/provenance/repo-native surfaces. | Rerun item-level guards before future deletes. |
| Broad high-authority cleanup target | `done` | `100%` | MAS focused retirement suite 19 pass; MAG strict guard `cleanup_candidate_count=0`; RCA tail readback `tail_surface_count=0`, `cleanup_candidate_count=0`; OMA compact/full readback `cleanup_candidate_count=0`, `retained_current_count=30`; all batch worktrees/branches cleaned. | Completion is cleanup/readback closeout, not runtime/domain/release readiness. Retained current surfaces remain but are no longer unresolved cleanup candidates. | Future physical deletes require new no-active-caller or parity evidence. |
| Authority blockers mapped | `done` | `100%` | matrix rows identify MAS/MAG/RCA/App/ScholarSkills owner boundaries and now distinguish owner permission from function-safety evidence. | Owner authorization no longer blocks user-owned repos; safety evidence still blocks unsafe deletes. | Use this matrix as intake plus rerun repo-native guards before each delete. |
| Temporary Ponytail lane cleanup | `done` | `100%` | MAS/RCA cherry-picked lanes recorded and cleaned; OMA batch2/3/4 worktrees and branches cleaned; MAG cleanup worktrees cleaned; prior OPL/App/ScholarSkills/BookForge Ponytail lanes already cleaned. | Unrelated active dirty writes remain outside this batch, including OPL root test files and MAS PaperMission/domain-handler files. | No further cleanup for this Ponytail batch. |

## Governance Automation Split

The two Codex automations now share the same authority-aware matrix shape but keep separate owners:

| Automation | Primary route | Owns | Does not own | Handoff rule |
| --- | --- | --- | --- | --- |
| `opl-family` / `OPL family 合理重构巡检` | `refactor_patrol` | line-budget-first / overlong-file-first structure work, natural splits, cycle breaks, duplicate helper merges, over-wide export shrink, low-risk YAGNI cleanup. | docs SSOT, active truth owner migration, runtime/domain/release readiness, owner receipt or typed blocker authority. | Docs / machine truth conflict routes to `governance_ssot`. |
| `opl` / `OPL系列项目治理与过时面退役` | `governance_ssot` | SSOT-first docs governance, docs lifecycle cleanup, machine truth alignment, retired public surface leakage, SSOT-coupled retirement. | Pure long-file cleanup, circular dependency cleanup, duplicate helper cleanup, or wrapper cleanup that does not create a docs / machine truth conflict. | Pure complexity candidates route to `refactor_patrol`. |

`opl-family` next run must treat line-budget-first / overlong-file-first as the mainline: at least 70% of the selected batch should come from >1000-line file governance, line-budget ratchet, cycles, or duplicate helpers unless fresh gates prove no safe semantic split, owner-blocked state, or dirty write-set conflict. Low-value wrapper cleanup is only filler. `opl` stays SSOT-first and may pull a long-file / cycle / duplicate-helper candidate into its batch only when that candidate is actively causing docs / machine truth conflict, second truth, or retired public surface leakage.

### Next Refactor Patrol Queue

Fresh `npm run --silent line-budget -- --list` on 2026-06-27 reported 20 OPL files above the 1000-line advisory budget. Next `opl-family` should start from these P0/P1 candidates before another wrapper cleanup tranche:

| Priority | File | Lines | Preferred boundary |
| --- | --- | ---: | --- |
| P0 | `tests/src/cli/cases/family-runtime-paper-mission-stage-route.test.ts` | 2458 | test scenario / stage-route behavior cases |
| P0 | `src/family-runtime-enqueue-parts/existing-dedupe-reconcile.ts` | 1542 | dedupe reconciliation phase / helper boundary |
| P0 | `tests/src/cli/cases/family-runtime-binding-intake.test.ts` | 1414 | binding intake scenario groups |
| P0 | `tests/src/cli/cases/family-runtime-current-control-provider-admission-cases/transition-runtime-readback-intake.ts` | 1352 | provider-admission readback case families |
| P1 | `tests/src/family-runtime-codex-stage-runner.test.ts` | 1277 | stage-runner lifecycle / process interaction scenarios |
| P1 | `tests/src/cli/cases/system-startup-maintenance.test.ts` | 1235 | startup vs maintenance behavior cases |
| P1 | `src/opl-skills.ts` | 1192 | skill registry / descriptor / rendering boundary |
| P1 | `tests/src/cli/cases/family-runtime-worker-lifecycle.test.ts` | 1146 | worker lifecycle scenario groups |
| P1 | `src/standard-domain-agent-scaffold-validation.ts` | 1142 | validation phase / contract boundary |
| P1 | `tests/src/cli/cases/family-runtime-domain-progress-transition-runtime.test.ts` | 1142 | transition-runtime behavior cases |

## 2026-06-27 Refactor Patrol Landing

This follow-up applied the automation split above and landed the first line-budget-first tranche. It does not declare runtime, domain, release, App, grant, visual, paper, book, or production readiness.

| Repo | Route | Result | Fresh evidence | Residual |
| --- | --- | --- | --- | --- |
| `one-person-lab` | `refactor_patrol` | `src/family-runtime-enqueue-parts/existing-dedupe-reconcile.ts` split into PaperMission replacement and live-attempt helpers; local `main` commit `f3c80f31`. | `npm run typecheck` passed; `node --experimental-strip-types --test tests/src/cli/cases/family-runtime-paper-mission-stage-route.test.ts` passed 26/26; `node scripts/line-budget.mjs --list` shows the file at 1004 lines; `git diff --check HEAD~1..HEAD` passed. | File is now near-limit, not fully under 1000; next natural split should avoid a mechanical four-line cut. |
| `one-person-lab-app` | `refactor_patrol` | Full first-install runtime release-boundary cases split into cache/acceleration and package-size case files; local `main` commits `a9dcae8`, `fc12b1a`. | Focused Node test over the three case files passed 16/16 with `OPL_APP_SHELL_ROOT=/Users/gaofeng/workspace/one-person-lab-app/shells/aionui`; `git diff --check HEAD~2..HEAD` passed; target file is 979 lines. | Full App release/user-path readiness remains App release-gate work, not proven by this test split. |
| `med-autogrant` | `refactor_patrol` | `tests/test_opl_standard_pack.py` physical morphology assertions moved to focused test file; local `main` commit `4795aca`. | `make test-line-budget-strict` passed; `./scripts/verify.sh source-purity:strict` passed; `./scripts/run-pytest-clean.sh -q tests/test_opl_standard_pack_physical_morphology.py` passed 1/1; `git diff --check HEAD~1..HEAD` passed. | Existing `functional_privatization_audit` generated/contract drift noted by the worker is outside this split. |
| `opl-hermes-shell` | `refactor_patrol` | Electron main split into link-title, media-preview, and open-external parts; local `main` commits `37098b3`, `97c81bf`. | `node --check` for main and new parts passed; focused Node tests passed 12/12; `npm run typecheck` passed; `git diff --check HEAD~2..HEAD` passed; `electron/main.cjs` reduced from 6762 to 6021 lines. | Hermes shell remains a candidate shell, not App truth. `electron/main.cjs` and `electron/opl-codex-gateway.cjs` remain P0 structure debt. |
| `med-autoscience` | `owner_lane` | No mutation. | Fresh root status had unresolved conflicts in `src/med_autoscience/cli_parts/paper_mission_commands.py`, `src/med_autoscience/paper_mission_authority.py`, and `tests/test_paper_mission_drive_followthrough.py`, plus `main...origin/main [ahead 1, behind 8]`. | MAS line-budget work is blocked until the active conflict/dirty owner lane is resolved or handed off. |

Temporary worktrees created by this tranche were cleaned after absorption for OPL, App, MAG, and Hermes shell. The remaining OPL worktree `codex/opl-currentness-20260627` was not created by this tranche and was left untouched.

## 2026-06-27 Refactor Patrol Landing Round 2

This follow-up continued the same line-budget-first route. It does not declare runtime, domain, release, App, grant, visual, paper, book, or production readiness.

| Repo | Route | Result | Fresh evidence | Residual |
| --- | --- | --- | --- | --- |
| `one-person-lab` | `refactor_patrol` | `tests/src/cli/cases/family-runtime-paper-mission-stage-route.test.ts` split into helper, provider-redrive, requeue-dispatch, and terminal case files; local `main` commit `6e215bcf`. | Main rerun: `node --experimental-strip-types --test tests/src/cli/cases/family-runtime-paper-mission-stage-route.test.ts` passed 26/26; `npm run typecheck` passed; `git diff --check main...HEAD` passed in the candidate worktree before absorption. Line readback after absorption: root file 379 lines; largest split file 849 lines. | This is test structure cleanup only. It does not claim MAS PaperMission progress, owner receipt validity, typed blocker validity, provider readiness, or runtime readiness. |
| `opl-bookforge` | `refactor_patrol` | `runtime/native_helpers/bookforge_project_hygiene.py` split out status helpers to `runtime/native_helpers/bookforge_project_hygiene_parts/status.py`; local `main` commit `c15da99`. | Main rerun: `npm run verify` exit 0; source byproduct hygiene passed; artifact lifecycle handoff contract passed. Line readback after absorption: main helper 974 lines; new status part 88 lines. | Verify output is not book delivery, final export, publication readiness, or owner acceptance evidence. Root `main` also contains prior local commits `fafed9d` and `352218d`. |
| `opl-hermes-shell` | `refactor_patrol` | `CodexAppServerClient` split from `electron/opl-codex-gateway.cjs` to `electron/parts/codex-app-server-client.cjs` with focused helper tests; local `main` commit `2484cab`. | Main rerun: `node --test electron/parts/codex-app-server-client.test.cjs electron/opl-codex-gateway.test.cjs` passed 30/30; `npm run typecheck` passed; candidate `node --check` and `git diff --check main...HEAD` passed before absorption. Line readback after absorption: gateway 2168 lines; client part 405 lines. | Hermes shell remains a candidate shell, not App truth. `electron/main.cjs` remains P0 structure debt at 6021 lines and `electron/opl-codex-gateway.cjs` remains above the advisory budget. |
| `med-autoscience` | `owner_lane` | Still no mutation in this refactor lane. | Subagent gate found an existing worktree `/Users/gaofeng/workspace/.worktrees/mas-owner-fallback-20260627` modifying the same target file `tests/test_cli_cases/paper_mission_commands.py` and related source, so this lane did not write MAS. | MAS line-budget work remains same-write-set owner-gated until the active MAS owner-fallback lane is resolved, absorbed, or explicitly handed off. |

Second-round temporary worktrees were absorbed to their target `main` branches and are ready for cleanup after push/readback. The older OPL worktree `codex/opl-currentness-20260627` remains outside this tranche and must not be deleted by this cleanup route.

### Refactor Patrol Queue Adjustment

Completed or demoted from the current P0 queue:

- `tests/src/cli/cases/family-runtime-paper-mission-stage-route.test.ts`: now 379 lines; split files are all below 1000 lines.
- `runtime/native_helpers/bookforge_project_hygiene.py`: now 974 lines; no longer above the advisory budget.
- `electron/opl-codex-gateway.cjs`: reduced from 2568 to 2168 lines but remains P0 because it is still well above the advisory budget.

Next high-value candidates after this round:

| Priority | File | Current reason | Gate |
| --- | --- | --- | --- |
| P0 | `electron/main.cjs` in `opl-hermes-shell` | Still 6021 lines after first split. | Split only along stable Electron responsibility boundaries with focused `node --check`, focused tests, and `npm run typecheck`. |
| P0 | `electron/opl-codex-gateway.cjs` in `opl-hermes-shell` | Still 2168 lines after client extraction. | Continue one responsibility block at a time; no new gateway framework. |
| P0 | `tests/src/cli/cases/family-runtime-binding-intake.test.ts` in `one-person-lab` | Previously P0 and still owner-gated by unrelated dirty/currentness lanes. | Mutate only after write-set ownership is clean or handed off. |
| P0 | MAS `tests/test_cli_cases/paper_mission_commands.py` / PaperMission command source | High line count but same-write-set conflict exists. | Do not write until `mas-owner-fallback-20260627` is resolved or handed off. |
| P1 | OPL provider-admission / stage-runner / startup-maintenance long tests | Still useful line-budget candidates. | Choose only if focused verification stays cheap and authority surfaces are untouched. |

## 2026-06-27 Refactor Patrol Landing Round 3

This follow-up continued line-budget-first cleanup with disjoint worktrees. It does not declare runtime, domain, release, App, grant, visual, paper, book, or production readiness.

| Repo | Route | Result | Fresh evidence | Residual |
| --- | --- | --- | --- | --- |
| `one-person-lab` | `refactor_patrol` | `tests/src/cli/cases/family-runtime-binding-intake.test.ts` split into binding-export, PaperMission, profile, and requeue case files; local `main` commit `b2315369`. | Main rerun: `node --experimental-strip-types --test tests/src/cli/cases/family-runtime-binding-intake.test.ts` passed 11/11; `npm run typecheck` passed; `git diff --check origin/main..HEAD` passed. Line readback after absorption: entry file 4 lines; largest split file 508 lines. | This is test structure cleanup only. It does not claim MAS PaperMission progress or runtime readiness. Local `main` also contained `bfdafb31` currentness work from another lane; its touched test passed 7/7 before push. |
| `one-person-lab` | `refactor_patrol` | `tests/src/cli/cases/family-runtime-current-control-provider-admission-cases/transition-runtime-readback-intake.ts` split out PaperMission carrier readback cases; local `main` commit `e6a5be88`. | Main rerun: `node --experimental-strip-types --test tests/src/cli/cases/family-runtime-current-control-provider-admission.test.ts` passed 51/51; `npm run typecheck` passed; `git diff --check origin/main..HEAD` passed. Line readback: main file 791 lines; new part 573 lines. | Provider-admission tests are structure evidence only; they do not prove live provider readiness or domain completion. |
| `opl-hermes-shell` | `refactor_patrol` | Electron window appearance helpers split from `electron/main.cjs`; local `main` commit `a1e6c8a`. | Main rerun: `node --check electron/main.cjs`; `node --check electron/parts/window-appearance.cjs`; `node --test electron/parts/window-appearance.test.cjs` passed 5/5; `npm run typecheck` passed. Line readback: `electron/main.cjs` 5882 lines. | `electron/main.cjs` remains P0 structure debt. |
| `opl-hermes-shell` | `refactor_patrol` | Gateway bridge surface / slash catalog / path completion / legacy prompt cleanup helpers split from `electron/opl-codex-gateway.cjs`; local `main` commit `9897be6`. | Main rerun: gateway/window focused tests passed 36/36; `node --check` for gateway and helper passed; `npm run typecheck` passed; `git diff --check origin/main..HEAD` passed. Line readback: `electron/opl-codex-gateway.cjs` 1903 lines. | Gateway remains P0/P1 structure debt because it is still above the advisory budget. |
| `med-autoscience` | `owner_lane` | Still no mutation. | MAS target test/source write set remains owned by `/Users/gaofeng/workspace/.worktrees/mas-owner-fallback-20260627`. | MAS line-budget cleanup remains same-write-set owner-gated until that lane is resolved, absorbed, or handed off. |

Round-3 temporary worktrees are cleanup candidates after push/readback and absorption audit. The older OPL worktree `codex/opl-currentness-20260627` remains outside this tranche and must not be deleted by this cleanup route.

## 2026-06-27 Refactor Patrol Landing Round 4

This follow-up continued line-budget-first cleanup. It does not declare runtime, domain, release, App, grant, visual, paper, book, or production readiness.

| Repo | Route | Result | Fresh evidence | Residual |
| --- | --- | --- | --- | --- |
| `one-person-lab` | `refactor_patrol` | `tests/src/cli/cases/family-runtime-domain-progress-transition-runtime.test.ts` split out human-gate replay cases; local `main` commit `fba1b9c7`. | Main rerun: `node --experimental-strip-types --test tests/src/cli/cases/family-runtime-domain-progress-transition-runtime.test.ts` passed 23/23; `npm run typecheck` passed; `git diff --check origin/main..HEAD` passed. Line readback: entry file 949 lines; new part 211 lines. | This is test structure cleanup only. It does not prove live runtime readiness or domain progress. |
| `opl-hermes-shell` | `refactor_patrol` | Desktop log buffer / rotation / flush controller split from `electron/main.cjs`; local `main` commit `6e3db35`. | Main rerun: desktop-log/window/gateway focused tests passed 40/40; `node --check` for touched files passed; `npm run typecheck` passed; `git diff --check origin/main..HEAD` passed. Line readback: `electron/main.cjs` 5745 lines. | `electron/main.cjs` remains P0 structure debt. No Electron GUI runtime smoke claim is made. |
| `one-person-lab` | `refactor_patrol` | `tests/src/cli/cases/system-startup-maintenance.test.ts` split into fixture, startup, and maintenance case files; local `main` commit `fd56d085`. | Main rerun: `node --experimental-strip-types --test tests/src/cli/cases/system-startup-maintenance.test.ts` passed 9/9; `npm run typecheck` passed; `git diff --check origin/main..HEAD` passed. Line readback: entry file 3 lines; startup case 499 lines; maintenance case 719 lines. | This is test structure cleanup only. The test is slow on this machine, but no release/install readiness claim is made. |

Round-4 completed worktrees are cleanup candidates after push/readback and absorption audit.

## 2026-06-27 Refactor Patrol Landing Round 5

This follow-up continued line-budget-first cleanup with three parallel subagent worktrees plus one main-session worktree. It does not declare runtime, domain, release, App, grant, visual, paper, book, or production readiness.

| Repo | Route | Result | Fresh evidence | Residual |
| --- | --- | --- | --- | --- |
| `one-person-lab` | `refactor_patrol` | `tests/src/family-runtime-codex-stage-runner.test.ts` split terminal closeout capture/parsing cases into `tests/src/family-runtime-codex-stage-runner-cases/terminal-closeout-capture.ts`; local `main` commit `57449ca5`. | Main rerun: `node --experimental-strip-types --test tests/src/family-runtime-codex-stage-runner.test.ts` passed 24/24; `npm run typecheck` passed; `git diff --check` passed. Line readback: entry file 756 lines; new case file 531 lines. Remote readback: `origin/main` = `57449ca5b72e0f86e17ffabce043feee0e4838d8`. | This is test structure cleanup only. It does not prove Codex provider runtime readiness or domain closeout readiness. |
| `one-person-lab` | `refactor_patrol` | `tests/src/cli/cases/family-runtime-worker-lifecycle.test.ts` split orphan worker cleanup cases into `family-runtime-worker-lifecycle-cases/worker-orphan-cleanup.ts`; local `main` commit `53c21ed3`. | Main rerun: `node --experimental-strip-types --test tests/src/cli/cases/family-runtime-worker-lifecycle.test.ts` passed 22/22; `npm run typecheck` passed; `git diff --check` passed. Line readback: entry file 934 lines; new case file 228 lines. | This is worker lifecycle test structure evidence only, not Temporal runtime readiness. |
| `one-person-lab` | `refactor_patrol` | `tests/src/cli/cases/managed-update-kernel.test.ts` split runtime toolchain maintenance case into `managed-update-kernel-cases/runtime-toolchain-maintenance.ts`; local `main` commit `163f7cae`. | Main rerun: `node --experimental-strip-types --test tests/src/cli/cases/managed-update-kernel.test.ts` passed 5/5; `npm run typecheck` passed; `git diff --check` passed. Line readback: entry file 935 lines; new case file 140 lines. | This is managed-update test structure evidence only, not installed App/runtime update readiness. |
| `opl-hermes-shell` | `refactor_patrol` | Terminal shell selection/env/spawn-helper helpers split from `electron/main.cjs` into `electron/parts/terminal-shell.cjs` with focused tests; local `main` commit `4483664`. | Main rerun: `node --check electron/main.cjs`; `node --check electron/parts/terminal-shell.cjs`; `node --check electron/parts/terminal-shell.test.cjs`; `node --test electron/parts/terminal-shell.test.cjs` passed 4/4; `npm run typecheck` passed; `git diff --check` passed. Line readback: `electron/main.cjs` 5587 lines; helper 164 lines; test 137 lines. Remote readback: `origin/main` = `4483664135e78299191381afea316185ab2d97aa`. | `electron/main.cjs` remains P0 structure debt. No Electron GUI runtime smoke or Windows live terminal claim is made. |
| `med-autoscience` | `owner_lane` | Still no mutation. | Fresh inherited gate still identifies `/Users/gaofeng/workspace/.worktrees/mas-owner-fallback-20260627` as owner of the PaperMission command/test write set; root remains `main...origin/main [ahead 1]`. | MAS line-budget cleanup remains same-write-set owner-gated until that lane is resolved, absorbed, or explicitly handed off. |

Round-5 worktrees and branches were removed after patch-equivalence (`git cherry main <branch>` returned `-`) and push/readback. Subagents were closed after main-session diff review, root verification, absorption, push, and cleanup.

## 2026-06-27 Refactor Patrol Landing Round 6

This follow-up continued line-budget-first cleanup with three OPL test-split worktrees and one Hermes shell worktree. It does not declare runtime, domain, release, App, grant, visual, paper, book, or production readiness.

| Repo | Route | Result | Fresh evidence | Residual |
| --- | --- | --- | --- | --- |
| `one-person-lab` | `refactor_patrol` | `tests/src/family-runtime-temporal-provider.test.ts` split closeout payload compaction cases into `tests/src/family-runtime-temporal-provider-cases/closeout-payload-compaction.ts`; local `main` commit `6213ee48`, remote `origin/main` later read back at `7a59e117`. | Lane rerun passed focused entry 25/25, `npm run typecheck`, `git diff --check`, and line readback. Main rerun across Round 6 OPL targets passed 65/65, `npm run typecheck`, `git diff --check`, and `npm run --silent line-budget -- --list`. Line readback: entry file 977 lines; new case file 79 lines. | This is Temporal provider test structure evidence only. It does not prove live Temporal/runtime/provider readiness. |
| `one-person-lab` | `refactor_patrol` | `tests/src/cli/cases/family-runtime-stage-attempts-temporal-provider.test.ts` split local-ledger fail-closed cases into `family-runtime-stage-attempts-temporal-provider-cases/local-ledger-fail-closed.ts`; local `main` commit `31847cdd`, remote `origin/main` later read back at `7a59e117`. | Lane rerun passed focused entry 12/12, `npm run typecheck`, `git diff --check`, and line readback. Main Round 6 aggregate rerun passed 65/65 plus typecheck/diff/line-budget readback. Line readback: entry file 953 lines; new case file 119 lines. | This is stage-attempt test structure evidence only. It does not prove runtime readiness, provider readiness, or domain progress. |
| `one-person-lab` | `refactor_patrol` | `tests/src/cli-codex-default-shell.test.ts` split raw Codex passthrough cases into `tests/src/cli-codex-default-shell-cases/raw-codex-passthrough.ts`; local `main` commit `7a59e117`, remote readback `origin/main` = `7a59e117b8d25428d4e81ac976c93044790e455c`. | Subagent found pre-existing focused failure from stale ScholarSkills expectations; main session updated `ready_to_sync` and `skill_entry_valid` expectations to current six-pack fake workspace behavior, then reran focused entry 28/28, `npm run typecheck`, `git diff --check`, and line readback. Main Round 6 aggregate rerun passed 65/65 plus typecheck/diff/line-budget readback. Line readback: entry file 979 lines; raw passthrough case file 178 lines. | The stale assertion fix is test-maintenance for already-current ScholarSkills package-channel behavior, not a new capability or readiness claim. |
| `opl-hermes-shell` | `refactor_patrol` | Electron window zoom helpers split from `electron/main.cjs` into `electron/parts/window-zoom.cjs` with focused tests; local `main` commit `5373cea`, remote readback `origin/main` = `5373cea49bee09608783984fe9783ac8d47588d7`. | Main rerun passed `node --check electron/main.cjs`, `node --check electron/parts/window-zoom.cjs`, `node --check electron/parts/window-zoom.test.cjs`, `node --test electron/parts/window-zoom.test.cjs` 4/4, `npm run typecheck`, `git diff --check`, and line readback. Line readback: `electron/main.cjs` 5533 lines; helper 69 lines; test 86 lines. | `electron/main.cjs` remains P0 structure debt. No Electron GUI runtime smoke, App truth, or Windows terminal live claim is made. |

Round-6 worktrees and branches were removed after patch-equivalence (`git cherry main <branch>` returned `-`) and push/readback. Subagents were closed after main-session diff review, verification, absorption, push, and cleanup.

### Round 6 Queue Adjustment

Completed exact OPL items removed from the current line-budget queue:

- `tests/src/family-runtime-temporal-provider.test.ts`: now 977 lines.
- `tests/src/cli/cases/family-runtime-stage-attempts-temporal-provider.test.ts`: now 953 lines.
- `tests/src/cli-codex-default-shell.test.ts`: now 979 lines.

Fresh OPL `npm run --silent line-budget -- --list` after Round 6 reports 9 remaining advisory-budget files:

| Priority | File | Lines | Next route |
| --- | --- | ---: | --- |
| P0 | `src/opl-skills.ts` | 1192 | Source split only after caller/boundary inspection; prefer registry / descriptor / rendering boundary. |
| P0 | `src/standard-domain-agent-scaffold-validation.ts` | 1142 | Source split only by validation phase / contract boundary. |
| P0 | `src/family-runtime.ts` | 1085 | Inspect existing runtime part boundaries before editing. |
| P0 | `src/family-runtime-tick.ts` | 1065 | Inspect tick phase and runtime authority boundary before editing. |
| P0 | `src/app-state.ts` | 1054 | Split only with clear App state owner boundary. |
| P1 | `tests/src/cli/cases/workspace-domain.descriptor.test.ts` | 1033 | Cheap focused test split by descriptor case family. |
| P1 | `tests/src/cli/cases/agent-lab.test.ts` | 1025 | Cheap focused test split by agent-lab command behavior. |
| P1 | `tests/src/family-runtime-temporal-terminal-sync.test.ts` | 1012 | Cheap focused test split by terminal-sync scenario. |
| P1 | `src/family-runtime-enqueue-parts/existing-dedupe-reconcile.ts` | 1004 | Near-limit residual; avoid mechanical four-line split unless a natural helper boundary is found. |

## 2026-06-27 Refactor Patrol Landing Round 7

This follow-up continued line-budget-first cleanup with four OPL lanes and one Hermes shell lane. It does not declare runtime, domain, release, App, grant, visual, paper, book, or production readiness.

| Repo | Route | Result | Fresh evidence | Residual |
| --- | --- | --- | --- | --- |
| `one-person-lab` | `refactor_patrol` | `tests/src/cli/cases/workspace-domain.descriptor.test.ts` split missing optional descriptor surfaces case into `workspace-domain.descriptor-cases/missing-optional-surfaces.ts`; local `main` commit `548abedb`, pushed before final Round 7 at `b6f14f41`. | Lane focused entry passed 3/3. Main first Round 7 aggregate rerun passed workspace-domain/agent-lab/app-action 31/31, `npm run typecheck`, `git diff --check`, and line-budget readback. Line readback: entry file 999 lines; new case 47 lines. | This is descriptor test structure evidence only, not domain admission readiness. Entry is just under advisory budget; future edits should continue case extraction instead of growing the entry. |
| `one-person-lab` | `refactor_patrol` | `tests/src/cli/cases/agent-lab.test.ts` split export and cost-estimate cases into `agent-lab-cases/export-and-cost.ts`; local `main` commit `91111fc9`, pushed before final Round 7 at `b6f14f41`. | Lane focused entry passed 22/22. Main first Round 7 aggregate rerun passed 31/31 plus typecheck/diff/line-budget readback. Line readback: entry file 957 lines; new case 70 lines. | This is Agent Lab test structure evidence only. It does not prove external suite/runtime readiness. |
| `one-person-lab` | `refactor_patrol` | `src/app-state.ts` split App action execution into `src/app-state-parts/action-execute.ts`; local `main` commit `b6f14f41`, remote readback before terminal-sync follow-up `b6f14f4163738b521a082c4c9f15186cf7c0fec2`. | Main-session lane rerun passed `tests/src/cli/cases/app-action.test.ts` 6/6, `npm run typecheck`, `git diff --check`, and line readback. Main first Round 7 aggregate rerun passed 31/31 plus typecheck/diff/line-budget readback. Line readback: `src/app-state.ts` 444 lines; action-execute part 617 lines. | This is source structure cleanup of the App action producer, not App release/user-path readiness. Public import path remains via re-export. |
| `one-person-lab` | `refactor_patrol` | `tests/src/family-runtime-temporal-terminal-sync.test.ts` split attempt precedence cases and helpers into `family-runtime-temporal-terminal-sync-cases/`; local `main` commit `3007c528`, remote readback `origin/main` = `3007c5281e59d266f4ffa55f8856066c1064725d`. | Lane focused entry passed 14/14. Main final Round 7 aggregate rerun passed workspace-domain/agent-lab/app-action/terminal-sync 45/45, `npm run typecheck`, `git diff --check`, and line-budget readback. Line readback: entry file 630 lines; new case 162 lines; helper 251 lines. | This is Temporal terminal-sync test structure evidence only. It does not prove live Temporal runtime readiness or provider readiness. |
| `opl-hermes-shell` | `refactor_patrol` | Electron window-state helpers split from `electron/main.cjs` into `electron/parts/window-state.cjs` with focused tests; local `main` commit `01b205f`, remote readback `origin/main` = `01b205f99fc2c8724c925ac58886716b4a7ecb20`. | Main rerun passed `node --check` for main/helper/test, `node --test electron/parts/window-state.test.cjs` 4/4, `npm run typecheck`, `git diff --check`, and line readback. Line readback: `electron/main.cjs` 5509 lines; helper 63 lines; test 89 lines. | `electron/main.cjs` remains P0 structure debt. No Electron GUI runtime smoke, App truth, or Windows terminal live claim is made. |

Round-7 worktrees and branches were removed after patch-equivalence (`git cherry main <branch>` returned `-`) and push/readback. Round-7 subagents were closed after main-session diff review, verification, absorption, push, and cleanup.

### Round 7 Queue Adjustment

Completed exact OPL items removed from the current line-budget queue:

- `src/app-state.ts`: now 444 lines.
- `tests/src/cli/cases/workspace-domain.descriptor.test.ts`: now 999 lines.
- `tests/src/cli/cases/agent-lab.test.ts`: now 957 lines.
- `tests/src/family-runtime-temporal-terminal-sync.test.ts`: now 630 lines.

Fresh OPL `npm run --silent line-budget -- --list` after Round 7 reports 5 remaining advisory-budget files:

| Priority | File | Lines | Next route |
| --- | --- | ---: | --- |
| P0 | `src/opl-skills.ts` | 1192 | Split generated plugin surface / inspection / sync boundary only after caller inspection. |
| P0 | `src/standard-domain-agent-scaffold-validation.ts` | 1142 | Split validation groups by pack files / stage refs / Foundry contract boundary. |
| P0 | `src/family-runtime.ts` | 1085 | Inspect CLI action clusters before editing; preserve public `runFamilyRuntime` path. |
| P0 | `src/family-runtime-tick.ts` | 1065 | Split only along existing tick-parts maintenance/default-executor boundaries with focused provider-hosted tests. |
| P1 | `src/family-runtime-enqueue-parts/existing-dedupe-reconcile.ts` | 1004 | Near-limit residual; avoid mechanical four-line split unless a natural helper boundary is found. |

## 2026-06-27 Refactor Patrol Landing Round 8

This follow-up continued line-budget-first source cleanup with five OPL source lanes and one Hermes shell lane. It does not declare runtime, domain, release, App, grant, visual, paper, book, or production readiness.

| Repo | Route | Result | Fresh evidence | Residual |
| --- | --- | --- | --- | --- |
| `one-person-lab` | `refactor_patrol` | `src/opl-skills.ts` split generated plugin surface into `src/opl-skills-parts/generated-plugin.ts`; local `main` commit `14005bbb`. | Main rerun: `node --experimental-strip-types --test tests/src/opl-skills-boundary.test.ts tests/src/cli/cases/agents-scaffold-validation-failures.test.ts tests/src/cli/cases/agents-conformance-stage-pack-v2.test.ts tests/src/cli/cases/agents-conformance.test.ts tests/src/cli/cases/family-runtime-paper-mission-stage-route.test.ts` passed 58/58; `npm run typecheck` passed; `git diff --check` passed; `npm run --silent line-budget -- --list` returned no entries. Line readback: `src/opl-skills.ts` 701 lines; generated plugin part 506 lines. | This is skills source structure evidence only. It does not prove skill install/runtime readiness. |
| `one-person-lab` | `refactor_patrol` | `src/standard-domain-agent-scaffold-validation.ts` split by foundry contract, pack files, shared helpers, stage refs, and user stage log; local `main` commit `8b50880d`. | Same Round 8 OPL main rerun passed 58/58 plus typecheck/diff/line-budget readback. Line readback: entry 158 lines; largest new part `foundry-contract.ts` 543 lines. | This is scaffold validation source structure evidence only. It does not change standard agent authority or domain admission readiness. |
| `one-person-lab` | `refactor_patrol` | `src/family-runtime.ts` split provider follow-through helper into `src/family-runtime-parts/provider-followthrough.ts`; local `main` commit `c65b3ccd`. | Same Round 8 OPL main rerun passed 58/58 plus typecheck/diff/line-budget readback. Line readback: `src/family-runtime.ts` 991 lines; helper 114 lines. | Public `runFamilyRuntime` entry remains in place; this is not runtime readiness evidence. |
| `one-person-lab` | `refactor_patrol` | `src/family-runtime-tick.ts` split PaperMission stage-route provider preflight into `src/family-runtime-tick-parts/paper-mission-stage-route-preflight.ts`; local `main` commit `db54652f`. | Same Round 8 OPL main rerun passed 58/58 plus typecheck/diff/line-budget readback. Line readback: `src/family-runtime-tick.ts` 986 lines; preflight part 94 lines. | This preserves the existing PaperMission authority boundary; it does not claim MAS paper progress or provider readiness. |
| `one-person-lab` | `refactor_patrol` | `src/family-runtime-enqueue-parts/existing-dedupe-reconcile.ts` split resolved owner-answer materialization into `existing-dedupe-resolved-owner-answer.ts`; local `main` commit `2a164bbc`. | Same Round 8 OPL main rerun passed 58/58 plus typecheck/diff/line-budget readback. Line readback: reconcile file 963 lines; helper 87 lines. | This was a natural materialization boundary, not a mechanical four-line cut. It does not change queue/provider/domain authority. |
| `opl-hermes-shell` | `refactor_patrol` | Electron install stamp loader split from `electron/main.cjs` into `electron/parts/install-stamp.cjs` with focused tests; local `main` commit `30f462a`. | Main rerun passed `node --check electron/main.cjs`, `node --check electron/parts/install-stamp.cjs`, `node --check electron/parts/install-stamp.test.cjs`, `node --test electron/parts/install-stamp.test.cjs` 3/3, `npm run typecheck`, and `git diff --check`. Line readback: `electron/main.cjs` 5466 lines; gateway 1903 lines; helper 50 lines. | `electron/main.cjs` and `electron/opl-codex-gateway.cjs` remain P0 structure debt. No Electron GUI runtime smoke, App truth, or release readiness claim is made. |

Round-8 candidate worktrees are cleanup candidates after push/readback and patch-equivalence audit. During absorption, an incomplete untracked root residue under `src/standard-domain-agent-scaffold-validation-parts/` was moved to `/tmp/opl-scaffold-validation-parts-root-residue-20260627232951` before the verified scaffold split was cherry-picked.

### Round 8 Queue Adjustment

Completed exact OPL items removed from the current line-budget queue:

- `src/opl-skills.ts`: now 701 lines.
- `src/standard-domain-agent-scaffold-validation.ts`: now 158 lines.
- `src/family-runtime.ts`: now 991 lines.
- `src/family-runtime-tick.ts`: now 986 lines.
- `src/family-runtime-enqueue-parts/existing-dedupe-reconcile.ts`: now 963 lines.

Fresh OPL `npm run --silent line-budget -- --list` after Round 8 returned no entries, so the currently tracked OPL advisory-budget queue is empty. The next `opl-family` refactor patrol must not treat upstream fork bodies as OPL structure debt.

| Priority | File | Current reason | Gate |
| --- | --- | --- | --- |
| excluded | `electron/main.cjs` and `electron/opl-codex-gateway.cjs` in `opl-hermes-shell` | Upstream Hermes Desktop fork body, not OPL-owned structure debt. | Read-only fork-boundary audit only; no cleanup/refactor/line-budget write set unless the target is explicitly OPL-owned overlay/adapter/docs/contracts/packaging/test shell. |
| excluded | `opl-aion-shell/**` and `one-person-lab-app/shells/aionui/**` | Upstream AionUI fork body. | Read-only fork-boundary audit only; App-owned tests under `one-person-lab-app/tests/**` remain eligible when they do not modify the fork body. |
| P0 | MAS PaperMission command/test source | Still same-write-set owner-gated by `/Users/gaofeng/workspace/.worktrees/mas-owner-fallback-20260627`. | Do not mutate until that owner lane is resolved, absorbed, or explicitly handed off. |
| P1 | Other OPL family repos | Re-scan with repo-native line-budget/source-purity tools after MAS gate. | Mutate only when fresh repo status is clean or the dirty write set is unrelated and owner-classified. |

### Upstream Fork Exclusion Correction

After Round 8, `opl-hermes-shell` fork-body refactor commits were reverted because Hermes Desktop upstream source should remain easy to upgrade. Revert evidence: `opl-hermes-shell` commit `fa60d9e` (`revert: restore upstream Hermes shell code`) restored `electron/main.cjs` and `electron/opl-codex-gateway.cjs` to fork-body shape, deleted the OPL refactor-only parts, passed `node --check` on both entry files, passed `npm run typecheck`, passed `git diff --cached --check` before commit, and pushed with remote readback `origin/main` = `fa60d9e9e981b30534a67b9032554f4e78b45a81`.

The corrected standing rule is: `opl-hermes-shell/**`, `opl-aion-shell/**`, `one-person-lab-app/shells/aionui/**`, and `_external/hermes-agent/**` are not OPL cleanup/refactor targets by default. They may be inspected to classify fork/overlay boundaries, but selected write sets must be limited to clearly OPL-owned overlay, adapter, docs, contracts, packaging metadata, or test shell files.

## 2026-06-28 Refactor Patrol Landing Round 9

This follow-up used the corrected fork-boundary rule. It did not touch `opl-hermes-shell/**`, `opl-aion-shell/**`, `one-person-lab-app/shells/aionui/**`, or `_external/hermes-agent/**`, and it does not declare runtime, domain, release, App, grant, visual, paper, book, or production readiness.

| Repo | Route | Result | Fresh evidence | Residual |
| --- | --- | --- | --- | --- |
| `one-person-lab-app` | `refactor_patrol` | `tests/release/app-release-boundary-cases/release-plan-and-publishing.ts` split Full package optimization fixture helpers into `release-plan-full-package-fixtures.ts`; local `main` commit `51a36d5`. | Main rerun: `node --experimental-strip-types --test tests/release/app-release-boundary-cases/release-plan-and-publishing.ts` passed 12/12; `git diff --check HEAD~1..HEAD` passed; `git cherry main codex/app-release-plan-fixtures-split-20260628` returned `- f38df97`; line readback: entry file 896 lines, fixture file 141 lines. | This is App-owned release-boundary test structure evidence only. It does not modify the AionUI fork body and does not prove App release/install/user-path readiness. |

### Round 9 Queue Adjustment

Fresh OPL root readback on 2026-06-28: `npm run --silent line-budget -- --list` returned no entries, and root `main` was clean and aligned with `origin/main` before this docs update. App source scan found the only App-owned tracked over-1000-line candidate in the active release test surface was `tests/release/app-release-boundary-cases/release-plan-and-publishing.ts` at 1029 lines; it is now 896 lines after Round 9. The larger App scan hits were under `tmp/active-shell-checkout-backups/**`, `node_modules/**`, `out/**`, or release artifacts, so they are generated/dependency/fork-adjacent residue and not refactor write sets.

Current next-route rules:

| Priority | File or surface | Current reason | Gate |
| --- | --- | --- | --- |
| excluded | `opl-hermes-shell/**`, `opl-aion-shell/**`, `one-person-lab-app/shells/aionui/**`, `_external/hermes-agent/**` | Upstream fork / reference bodies. | Read-only fork-boundary audit only; no cleanup/refactor/line-budget write set unless the target is explicitly OPL-owned overlay, adapter, docs, contracts, packaging metadata, or test shell. |
| P0 | MAS PaperMission command/test source | Same-write-set owner-gated by MAS PaperMission/domain-handler work, not safe as an OPL refactor patrol mutation. | Re-audit only after the owning MAS lane is resolved, absorbed, or explicitly handed off. |
| P1 | App `tmp/active-shell-checkout-backups/**`, generated `out/**`, dependency `node_modules/**`, release artifacts | Inventory noise, not App-owned source structure debt. | Exclude from selected batch; if cleanup is needed, route to artifact/cache lifecycle, not source refactor. |
| P1 | OPL family non-fork repos | OPL root line-budget queue is empty; other repos need fresh repo-native source-purity/line-budget scans before mutation. | Mutate only with clean or unrelated dirty write set, authority-aware owner route, focused verification, and no fork-body path. |

## 2026-06-28 Refactor Patrol Landing Round 10

This follow-up continued the corrected non-fork rule. It did not touch upstream fork bodies and does not declare runtime, domain, release, App, grant, visual, paper, book, or production readiness.

| Repo | Route | Result | Fresh evidence | Residual |
| --- | --- | --- | --- | --- |
| `redcube-ai` | `refactor_patrol` | `packages/redcube-domain-entry/src/actions/domain-action-adapter-parts/physical-source-morphology-policy.ts` split shared constants/source-structure metadata into `physical-source-morphology-policy-constants.ts`; pushed `main` commit `e9277f0e`. | Root main rerun: `npm run --silent build` passed; `node --experimental-strip-types --test tests/opl-agent-pack-contracts-source-morphology.test.ts tests/rca-private-platform-retirement-readback.test.ts` passed 9/9; `npm run --silent line-budget` passed; line readback: entry file 969 lines, constants part 99 lines; remote readback `origin/main` = `e9277f0e968b9f44bc289eae5e010e56440b2a14`; candidate branch patch-equivalent and cleaned. | This is behavior-preserving RCA machine-policy source structure evidence only. It does not authorize physical delete, default-caller cutover, visual readiness, export readiness, domain readiness, or production readiness. RCA canonical metadata test was already red on root `main` with `functional_privatization_audit` source/contract drift and remains a separate contract-alignment lane. |
| `med-autoscience` | `read_only_candidate` | Subagent audit identified `tests/test_display_pack_renderer_structure.py` as the safest next non-authority test split candidate. | MAS root was clean but ahead 1; candidate is test-only and avoids contracts, generated gallery payload, paper authority, owner receipts, typed blockers, runtime DB, and source implementation. | Not mutated in Round 10 because RCA was already selected and verified. Next MAS lane should preserve the original test entry path and run `scripts/run-pytest-clean.sh tests/test_display_pack_renderer_structure.py tests/display_pack_renderer_structure_cases -q`. |

### Round 10 Queue Adjustment

Current next-route rules:

| Priority | File or surface | Current reason | Gate |
| --- | --- | --- | --- |
| excluded | `opl-hermes-shell/**`, `opl-aion-shell/**`, `one-person-lab-app/shells/aionui/**`, `_external/hermes-agent/**` | Upstream fork / reference bodies. | Read-only fork-boundary audit only; no cleanup/refactor/line-budget write set unless the target is explicitly OPL-owned overlay, adapter, docs, contracts, packaging metadata, or test shell. |
| P0 | MAS `tests/test_display_pack_renderer_structure.py` | Safest fresh non-authority >1000-line candidate from MAS audit. | Use a MAS worktree; only split tests into `tests/display_pack_renderer_structure_cases/**`; do not touch renderer implementation, contracts, gallery payload, or paper authority. |
| P1 | RCA canonical metadata drift | `tests/opl-agent-pack-contracts-canonical.test.ts` fails on current RCA `main` due to `functional_privatization_audit` source/contract shape drift unrelated to Round 10. | Route to a separate RCA contract-alignment lane; do not hide it behind structure cleanup. |
| P1 | App / BookForge / OMA large tracked files | Current large hits are images, PDFs, lockfiles, workflows, or JSON contracts. | Do not split as source structure debt; only mutate when a repo-native owner route says the machine contract or workflow itself needs semantic change. |

## 2026-06-28 Refactor Patrol Landing Round 11

This follow-up landed the MAS Round 10 read-only candidate under the corrected non-fork rule. It did not touch upstream fork bodies and does not declare runtime, domain, release, App, grant, visual, paper, book, or production readiness.

| Repo | Route | Result | Fresh evidence | Residual |
| --- | --- | --- | --- | --- |
| `med-autoscience` | `refactor_patrol` | `tests/test_display_pack_renderer_structure.py` split into `tests/display_pack_renderer_structure_cases/` while preserving the original test entry path; pushed `main` commit `59ce17ecd`. | Root main rerun: `scripts/run-pytest-clean.sh tests/test_display_pack_renderer_structure.py tests/display_pack_renderer_structure_cases -q` passed 27/27; `git diff --check HEAD~1..HEAD` passed; line readback: original entry 1216 -> 7 lines, largest case file 448 lines; candidate branch patch-equivalent and cleaned; remote readback `origin/main` = `59ce17ecd3dd24f5efa71e83843304b6765d2d71`. | This is MAS display-pack test structure evidence only. It did not touch renderer implementation, contracts, generated gallery payload, docs assets, PaperMission truth, owner receipts, typed blockers, human gates, runtime DB, or provider queues. Existing `mas-owner-fallback-20260627` and `mas-paper-delta-ref-adoption-20260628` worktrees remain separate owner lanes and were not cleaned by this route. |

### Round 11 Queue Adjustment

Current next-route rules:

| Priority | File or surface | Current reason | Gate |
| --- | --- | --- | --- |
| excluded | `opl-hermes-shell/**`, `opl-aion-shell/**`, `one-person-lab-app/shells/aionui/**`, `_external/hermes-agent/**` | Upstream fork / reference bodies. | Read-only fork-boundary audit only; no cleanup/refactor/line-budget write set unless the target is explicitly OPL-owned overlay, adapter, docs, contracts, packaging metadata, or test shell. |
| P0 | MAS PaperMission command/test source | Still same-write-set owner-gated by older MAS owner/fallback work, not safe as this refactor patrol mutation. | Re-audit only after the owning MAS lane is resolved, absorbed, or explicitly handed off. |
| P1 | RCA canonical metadata drift | `tests/opl-agent-pack-contracts-canonical.test.ts` fails on current RCA `main` due to `functional_privatization_audit` source/contract shape drift unrelated to Round 10. | Route to a separate RCA contract-alignment lane; do not hide it behind structure cleanup. |
| P1 | OPL family non-fork repos | Re-scan with repo-native source-purity/line-budget tools before selecting another mutation. | Mutate only with clean or unrelated dirty write set, authority-aware owner route, focused verification, and no fork-body path. |
