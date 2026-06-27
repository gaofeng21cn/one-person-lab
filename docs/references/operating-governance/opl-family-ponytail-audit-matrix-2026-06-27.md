# OPL Family Ponytail Audit Matrix 2026-06-27

Owner: `One Person Lab`
Purpose: `opl_family_ponytail_cleanup_audit_matrix`
State: `active_support_snapshot`
Machine boundary: 本文是 2026-06-27 首轮 Ponytail cleanup 只读矩阵与执行波次快照。它不授权物理删除、不声明 domain ready / App release ready / production ready、不替代 owner receipt、typed blocker、runtime truth、release truth 或机器合同。后续执行必须重新读取 fresh `git status`、owner docs、contracts/source/tests/readback 与 repo-native 验证输出。

## Fresh Evidence

本轮矩阵基于以下 fresh evidence：

- OPL root final readback：`git status --short --branch` 显示 `main...origin/main [ahead 3]`，root dirty 只剩外部 MAS followthrough 写集：`src/workspace-registry.ts`、`tests/src/cli/cases/workspace-domain.registry.test.ts`。
- OPL safe slices 已进入本地 `main`：`b00b743a docs: add ponytail cleanup runbook`、`5d7ae130 Prune unused ponytail surfaces`、`21797080 docs: add ponytail family audit matrix`、`be5865ae Shrink Temporal query import path`、`1a05dfb8 Split brand command specs`、`efe3cbac docs: close ponytail family cleanup audit`。
- OPL verification：`npm run typecheck` exit 0；DomainProgressTransitionRuntime / CLI broken-pipe focused tests 25 pass；brand / pack command surface focused tests 50 pass；Temporal focused suite 26 pass；`git diff --check` passed for the OPL cleanup diffs.
- OPL temporary lane absorption proof：`git cherry main codex/ponytail-command-spec-shrink-20260627`、`git cherry main codex/ponytail-temporal-provider-shrink-20260627` both returned `- <lane-commit>`, proving patch-equivalent absorption after cherry-pick even though ancestry-only absorption audit reported `needs-owner-review`.
- `opl-meta-agent` owner-local gate landed on local `main` as `c274f14 docs: record OMA ponytail cleanup gate`; fresh `npm run verify` exit 0 with 24 pass. The gate recorded `cleanup_candidate_count=31`, `cleanup_apply_candidate_count=0`, so no physical delete was authorized.
- `opl-bookforge` owner-local cleanup landed on local `main` as `352218d Remove unused BookForge hygiene active paths constant`; fresh `npm run verify` exit 0. This removes one unused local hygiene constant and does not claim book delivery, final export, or owner acceptance readiness.
- Family repo summary scan：`one-person-lab` tracked files 1687 / legacy-term hits 3401 / TODO 1；`med-autoscience` tracked files 3452 / legacy-term hits 6159 / TODO 57 and dirty `paper_mission_commands.py` / test diff；`med-autogrant` tracked files 547 / legacy-term hits 1586 / TODO 22；`redcube-ai` tracked files 1366 / legacy-term hits 2219 / TODO 2；`opl-meta-agent` tracked files 210 / legacy-term hits 310 / TODO 0；`opl-bookforge` tracked files 182 / legacy-term hits 87 / TODO 0；`one-person-lab-app` tracked files 287 / legacy-term hits 260 / TODO 9；`opl-scholarskills` tracked files 19 / legacy-term hits 97 / TODO 0.

These counts are inventory signals only. They do not prove dead code, safe deletion, runtime readiness, or owner acceptance.

## Current Owner Constraints

| Repo | Current state signal | Cleanup stance |
| --- | --- | --- |
| `one-person-lab` | Main is local-ahead; root dirty paths are the external MAS followthrough write set only. | Safe OPL-only slices landed; do not touch active MAS followthrough paths. |
| `med-autoscience` | Main is ahead and currently dirty in paper mission command/test files. | Read-only audit only until the active owner lane closes; do not delete MAS paper authority, owner receipt, typed blocker, publication gate, or mission truth surfaces. |
| `med-autogrant` | Main is ahead and clean by status summary. | Candidate-only audit; write only in a future MAG owner lane with grant authority tests. |
| `redcube-ai` | Main is ahead and clean by status summary. | Candidate-only audit; visual authority and artifact verdicts remain RCA-owned. |
| `opl-meta-agent` | Main is ahead and clean; OMA cleanup gate landed with `cleanup_apply_candidate_count=0`. | No physical delete until the script-to-pack gate authorizes it; target-agent builder truth stays repo-owned. |
| `opl-bookforge` | Main is ahead and clean; unused hygiene constant cleanup landed. | Further cleanup must still protect book artifact/materialization authority. |
| `one-person-lab-app` | Main is ahead and clean by status summary. | App cleanup comes after framework/domain surface convergence; App owns GUI shell, install, release, and user path truth. |
| `opl-scholarskills` | Small repo, main ahead and clean by status summary. | Treat as capability source of truth; do not copy or delete capability semantics from OPL/MAS without source owner route. |

## Matrix

| repo | module/owner surface | tag | candidate | authority blocker | write owner | validation | wave | status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `one-person-lab` | `OPL Runway / DomainProgressTransitionRuntime` | `shrink` | Remove unused facade re-exports while keeping implementation in `*-parts/*`. | none for first slice; contracts/docs string refs remain descriptive and were not changed. | OPL framework lane | `npm run typecheck`; focused DomainProgressTransitionRuntime tests; `git diff --check`. | `single-repo-slice` | `done` |
| `one-person-lab` | `OPL Console / CLI pipe handling` | `shrink` | Make broken-pipe helper private while keeping exported CLI installer behavior. | none. | OPL framework lane | focused CLI broken-pipe test; `npm run typecheck`. | `single-repo-slice` | `done` |
| `one-person-lab` | `OPL Charter / Atlas operating governance` | `shrink` | Add durable cleanup runbook and this family audit matrix so future candidates have owner/authority/validation fields. | none; docs do not authorize deletion. | OPL docs/governance lane | `git diff --check`; `rg` sanity; file existence. | `single-repo-slice` | `done` |
| `one-person-lab` | `OPL Connect / CLI command specs` | `shrink` | Split long command-spec builders along existing `public-command-specs-parts/` pattern. | active command catalog behavior must stay behavior-compatible. | OPL command-spec lane | `npm run typecheck`; brand / pack command surface focused tests 50 pass. | `single-repo-slice` | `done` |
| `one-person-lab` | `OPL Runway / Temporal provider import topology` | `shrink` | Shrink the query entry by importing the Temporal attempt-query part directly instead of dynamically importing the whole provider module. | runtime/readiness claims require live readback; import refactor alone is not readiness. | OPL runtime lane | `npm run typecheck`; Temporal focused suite 26 pass. | `single-repo-slice` | `done_first_slice` |
| `one-person-lab` | `OPL Vault / refs-only ledgers` | `yagni` | Review single-caller ledger helpers and duplicate JSON helpers for same-domain consolidation. | ledger format and receipt semantics are authority-sensitive. | Future OPL Vault lane | focused ledger tests; no receipt shape drift. | `candidate` | `candidate` |
| `med-autoscience` | `MAS PaperMission / paper truth` | `delete` | Review old supervisor / legacy route / alias surfaces only after current dirty paper-mission lane closes. | active dirty files and MAS paper authority; needs MAS owner route. | MAS repo owner lane | MAS `make test-meta` or repo-native focused paper-mission tests plus owner readback. | `owner-gated` | `blocked` |
| `med-autoscience` | `MAS capability registry / external ScholarSkills boundary` | `shrink` | Keep MAS docs pointing to external capability source; avoid duplicate capability catalog in MAS. | ScholarSkills source of truth external to MAS. | MAS + ScholarSkills owner lane | MAS docs/tests plus ScholarSkills contract readback. | `candidate` | `candidate` |
| `med-autogrant` | `MAG grant authority / legacy aliases` | `delete` | Inventory legacy compatibility aliases and tombstone-only surfaces. | grant verdict / artifact authority stays MAG-owned. | MAG repo owner lane | repo-native smoke/meta tests and grant authority readback. | `candidate` | `candidate` |
| `redcube-ai` | `RCA visual deliverable authority` | `shrink` | Reduce historical helper/test residue around retired generic runtime labels. | visual artifact and quality verdict authority stays RCA-owned. | RCA repo owner lane | `npm test` / repo smoke plus RCA artifact authority checks. | `candidate` | `candidate` |
| `opl-meta-agent` | `OMA target-agent builder` | `shrink` | Run script-to-pack cleanup gate and record that current candidates are not apply-authorized. | target-agent work-order truth stays OMA-owned; cleanup readback cannot authorize physical delete. | OMA repo owner lane | `npm run verify` 24 pass; script-to-pack readback `cleanup_apply_candidate_count=0`. | `small-domain-agent-wave` | `done_gate_no_delete` |
| `opl-bookforge` | `BookForge manuscript/materialization` | `shrink` | Remove unused `DEFAULT_ACTIVE_PATHS` from the repo hygiene helper. | book artifact authority stays BookForge-owned; verify output is not publication readiness. | BookForge owner lane | `npm run verify` exit 0. | `small-domain-agent-wave` | `done` |
| `one-person-lab-app` | `App GUI shell / release user path` | `yagni` | Audit AGUI/Hermes/AionUI historical wording and local wrappers after framework/domain projection cleanup settles. | App release/install/user path authority; no release-ready claim from cleanup. | App owner lane | `npm run verify`; release/user-path evidence only for release claims. | `later` | `candidate` |
| `opl-scholarskills` | `ScholarSkills capability source` | `shrink` | Keep repo as source; only remove local duplication with explicit source-owner validation. | capability semantics must not be copied into OPL/MAS as second truth. | ScholarSkills owner lane | contract/skill validation; OPL consumer readback. | `later` | `candidate` |

## Remaining Owner Routes

1. `MAS read-only to owner-lane transition`: wait for current dirty PaperMission lane to close, then rerun fresh MAS ponytail audit before any physical delete.
2. `MAG / RCA owner lanes`: rerun repo-native audits with grant / visual artifact authority tests before touching aliases, helpers, or historical labels.
3. `OPL Vault ledger consolidation`: only proceed if focused ledger tests prove no receipt-shape or refs-only ledger drift.
4. `OMA script-to-pack retirement`: requires a future cleanup readback with apply authorization, no active caller, no forbidden write, and tombstone/provenance evidence.
5. `App cleanup wave`: only after framework/domain projections settle; App release/user-path truth remains separate.

## 完成度审计

| Item | Status | Completion | Fresh evidence | Gap | Next action |
| --- | --- | --- | --- | --- | --- |
| Joint read-only inventory exists | `done` | `100%` | family repo status/count scan and this matrix | Counts are not proof of deletion safety. | Rerun per repo before each owner lane. |
| OPL first safe single-repo slice landed | `done` | `100%` | local `main` contains docs/surface cleanup, command-spec split, and Temporal query import shrink; `npm run typecheck`, command-spec focused 50 pass, Temporal focused 26 pass | Not a runtime readiness or release claim; root still has unrelated MAS followthrough dirty files. | Keep those dirty files with their owner lane. |
| Shared-boundary linked cleanup landed | `done` | `100%` | `be5865ae` and `1a05dfb8` are patch-equivalent absorbed to local `main`; focused tests passed | Larger Vault ledger consolidation remains a separate owner-sensitive candidate. | Re-audit Vault only with receipt-shape tests. |
| Small domain-agent safe cleanup landed | `done` | `100%` | OMA `c274f14` gate + `npm run verify` 24 pass; BookForge `352218d` cleanup + `npm run verify` exit 0 | OMA gate explicitly says no physical delete; BookForge verify is not publication readiness. | Future physical deletions need fresh owner-authorized gates. |
| High-authority domain repo cleanups landed | `blocked_owner_gated` | `0%` | MAS currently dirty; MAG/RCA/App/ScholarSkills rows remain candidate-only | These surfaces carry paper/grant/visual/release/capability authority and cannot be cleaned from OPL without owner evidence. | Start separate owner lanes after fresh repo-native audits. |
| Authority blockers mapped | `done` | `100%` | matrix rows identify MAS/MAG/RCA/App/ScholarSkills owner boundaries | Each future row still needs fresh owner evidence. | Use this matrix as intake, not authorization. |
| Temporary Ponytail lane cleanup | `done` | `100%` | OPL, OMA, and BookForge Ponytail branches were patch-equivalent by `git cherry`; their temporary worktrees and branches were removed after verification. | External `mas-papermission-followthrough` worktree intentionally remains. | No further cleanup for this Ponytail batch. |
