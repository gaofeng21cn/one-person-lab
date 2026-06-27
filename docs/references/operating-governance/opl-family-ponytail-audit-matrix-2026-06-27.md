# OPL Family Ponytail Audit Matrix 2026-06-27

Owner: `One Person Lab`
Purpose: `opl_family_ponytail_cleanup_audit_matrix`
State: `active_support_snapshot`
Machine boundary: 本文是 2026-06-27 首轮 Ponytail cleanup 只读矩阵与执行波次快照。它不授权物理删除、不声明 domain ready / App release ready / production ready、不替代 owner receipt、typed blocker、runtime truth、release truth 或机器合同。后续执行必须重新读取 fresh `git status`、owner docs、contracts/source/tests/readback 与 repo-native 验证输出。

## Fresh Evidence

本轮矩阵基于以下 fresh evidence：

- OPL root preflight：`git status --short --branch` 显示 `main...origin/main [ahead 6]`，随后本轮已吸收 docs 与 surface cleanup，root 变为 `ahead 8`。
- `codex_ops_gate.py status --repo . --target-ref main` 显示既有 active / dirty worktree：`mas-papermission-followthrough`、`scholarskills-app-managed-source`；本轮新增 Ponytail lanes 均隔离在 `.worktrees/`。
- OPL surface cleanup lane 已吸收：`docs: add ponytail cleanup runbook` 与 `Prune unused ponytail surfaces` 均进入本地 `main`。
- Root targeted verification 已通过：`npm run typecheck`；`node --experimental-strip-types --test tests/src/cli/cases/family-runtime-domain-progress-transition-runtime.test.ts tests/src/cli/cases/cli-broken-pipe.test.ts`，25 pass；`git diff --check HEAD~2..HEAD`。
- Family repo summary scan：`one-person-lab` tracked files 1687 / legacy-term hits 3401 / TODO 1；`med-autoscience` tracked files 3452 / legacy-term hits 6159 / TODO 57 and dirty `paper_mission_commands.py` / test diff；`med-autogrant` tracked files 547 / legacy-term hits 1586 / TODO 22；`redcube-ai` tracked files 1366 / legacy-term hits 2219 / TODO 2；`opl-meta-agent` tracked files 210 / legacy-term hits 310 / TODO 0；`opl-bookforge` tracked files 182 / legacy-term hits 87 / TODO 0；`one-person-lab-app` tracked files 287 / legacy-term hits 260 / TODO 9；`opl-scholarskills` tracked files 19 / legacy-term hits 97 / TODO 0.

These counts are inventory signals only. They do not prove dead code, safe deletion, runtime readiness, or owner acceptance.

## Current Owner Constraints

| Repo | Current state signal | Cleanup stance |
| --- | --- | --- |
| `one-person-lab` | Main is local-ahead and has active/dirty sibling worktrees. | Safe OPL-only slices may continue in isolated worktrees; do not touch active lane write sets. |
| `med-autoscience` | Main is ahead and currently dirty in paper mission command/test files. | Read-only audit only until the active owner lane closes; do not delete MAS paper authority, owner receipt, typed blocker, publication gate, or mission truth surfaces. |
| `med-autogrant` | Main is ahead and clean by status summary. | Candidate-only audit; write only in a future MAG owner lane with grant authority tests. |
| `redcube-ai` | Main is ahead and clean by status summary. | Candidate-only audit; visual authority and artifact verdicts remain RCA-owned. |
| `opl-meta-agent` | Main is ahead and clean by status summary. | Good candidate for a later small cleanup lane; target-agent builder truth stays repo-owned. |
| `opl-bookforge` | Main is ahead and clean by status summary. | Good candidate for a later small cleanup lane; book artifact/materialization authority stays repo-owned. |
| `one-person-lab-app` | Main is ahead and clean by status summary. | App cleanup comes after framework/domain surface convergence; App owns GUI shell, install, release, and user path truth. |
| `opl-scholarskills` | Small repo, main ahead and clean by status summary. | Treat as capability source of truth; do not copy or delete capability semantics from OPL/MAS without source owner route. |

## Matrix

| repo | module/owner surface | tag | candidate | authority blocker | write owner | validation | wave | status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `one-person-lab` | `OPL Runway / DomainProgressTransitionRuntime` | `shrink` | Remove unused facade re-exports while keeping implementation in `*-parts/*`. | none for first slice; contracts/docs string refs remain descriptive and were not changed. | OPL framework lane | `npm run typecheck`; focused DomainProgressTransitionRuntime tests; `git diff --check`. | `single-repo-slice` | `done` |
| `one-person-lab` | `OPL Console / CLI pipe handling` | `shrink` | Make broken-pipe helper private while keeping exported CLI installer behavior. | none. | OPL framework lane | focused CLI broken-pipe test; `npm run typecheck`. | `single-repo-slice` | `done` |
| `one-person-lab` | `OPL Charter / Atlas operating governance` | `shrink` | Add durable cleanup runbook and this family audit matrix so future candidates have owner/authority/validation fields. | none; docs do not authorize deletion. | OPL docs/governance lane | `git diff --check`; `rg` sanity; file existence. | `single-repo-slice` | `done` |
| `one-person-lab` | `OPL Connect / CLI command specs` | `shrink` | Split long command-spec builders along existing `public-command-specs-parts/` pattern. | active command catalog behavior must stay byte-compatible. | Future OPL command-spec lane | `npm run typecheck`; command surface focused tests; CLI JSON readback when relevant. | `candidate` | `candidate` |
| `one-person-lab` | `OPL Runway / Temporal provider import topology` | `shrink` | Break provider/query import cycle by moving query adapter and worker lifecycle exports behind thinner modules. | runtime/readiness claims require live readback; import refactor alone is not readiness. | Future OPL runtime lane | typecheck; Temporal provider focused tests; runtime readback only for readiness claims. | `candidate` | `candidate` |
| `one-person-lab` | `OPL Vault / refs-only ledgers` | `yagni` | Review single-caller ledger helpers and duplicate JSON helpers for same-domain consolidation. | ledger format and receipt semantics are authority-sensitive. | Future OPL Vault lane | focused ledger tests; no receipt shape drift. | `candidate` | `candidate` |
| `med-autoscience` | `MAS PaperMission / paper truth` | `delete` | Review old supervisor / legacy route / alias surfaces only after current dirty paper-mission lane closes. | active dirty files and MAS paper authority; needs MAS owner route. | MAS repo owner lane | MAS `make test-meta` or repo-native focused paper-mission tests plus owner readback. | `owner-gated` | `blocked` |
| `med-autoscience` | `MAS capability registry / external ScholarSkills boundary` | `shrink` | Keep MAS docs pointing to external capability source; avoid duplicate capability catalog in MAS. | ScholarSkills source of truth external to MAS. | MAS + ScholarSkills owner lane | MAS docs/tests plus ScholarSkills contract readback. | `candidate` | `candidate` |
| `med-autogrant` | `MAG grant authority / legacy aliases` | `delete` | Inventory legacy compatibility aliases and tombstone-only surfaces. | grant verdict / artifact authority stays MAG-owned. | MAG repo owner lane | repo-native smoke/meta tests and grant authority readback. | `candidate` | `candidate` |
| `redcube-ai` | `RCA visual deliverable authority` | `shrink` | Reduce historical helper/test residue around retired generic runtime labels. | visual artifact and quality verdict authority stays RCA-owned. | RCA repo owner lane | `npm test` / repo smoke plus RCA artifact authority checks. | `candidate` | `candidate` |
| `opl-meta-agent` | `OMA target-agent builder` | `shrink` | Apply OPL surface cleanup pattern to stage-control/source-structure helpers if no active caller. | target-agent work-order truth stays OMA-owned. | OMA repo owner lane | `npm run repo:hygiene`; source-structure check; focused OMA tests. | `candidate` | `candidate` |
| `opl-bookforge` | `BookForge manuscript/materialization` | `shrink` | Small-repo cleanup of unused local wrappers and stale docs after checking artifact authority paths. | book artifact authority stays BookForge-owned. | BookForge owner lane | `npm run verify`. | `candidate` | `candidate` |
| `one-person-lab-app` | `App GUI shell / release user path` | `yagni` | Audit AGUI/Hermes/AionUI historical wording and local wrappers after framework/domain projection cleanup settles. | App release/install/user path authority; no release-ready claim from cleanup. | App owner lane | `npm run verify`; release/user-path evidence only for release claims. | `later` | `candidate` |
| `opl-scholarskills` | `ScholarSkills capability source` | `shrink` | Keep repo as source; only remove local duplication with explicit source-owner validation. | capability semantics must not be copied into OPL/MAS as second truth. | ScholarSkills owner lane | contract/skill validation; OPL consumer readback. | `later` | `candidate` |

## Next Waves

1. `OPL command-spec slice`: split command spec aggregators and validate command surface behavior.
2. `OPL Temporal import topology slice`: break provider/query cycles without changing runtime semantics.
3. `MAS read-only to owner-lane transition`: wait for current dirty PaperMission lane to close, then rerun fresh MAS ponytail audit.
4. `Small domain-agent cleanup wave`: OMA / BookForge first, because their repos are small and the owner boundary is easier to verify.
5. `App cleanup wave`: only after framework/domain projections settle; App release/user-path truth remains separate.

## Completion Audit For This Matrix

| Item | Status | Completion | Fresh evidence | Gap | Next action |
| --- | --- | --- | --- | --- | --- |
| Joint read-only inventory exists | `done` | `100%` | family repo status/count scan and this matrix | Counts are not proof of deletion safety. | Rerun per repo before each owner lane. |
| OPL first safe single-repo slice landed | `done` | `100%` | local `main` contains docs and surface cleanup commits; typecheck and focused tests passed | Not pushed in this lane; sibling dirty lanes remain separate. | Final closeout decides push/cleanup. |
| Shared-boundary linked cleanup landed | `partial` | `35%` | OPL runbook/matrix and surface cleanup landed | CLI command specs and Temporal import topology still candidates. | Open focused future lanes or continue in this goal if no blocker. |
| Domain repo cleanups landed | `blocked` | `0%` | MAS currently dirty; all sibling repos local-ahead | Needs owner-lane freshness and no overlapping dirty write set. | Start with read-only owner audit after existing lanes close. |
| Authority blockers mapped | `done` | `100%` | matrix rows identify MAS/MAG/RCA/App/ScholarSkills owner boundaries | Each future row still needs fresh owner evidence. | Use this matrix as intake, not authorization. |
