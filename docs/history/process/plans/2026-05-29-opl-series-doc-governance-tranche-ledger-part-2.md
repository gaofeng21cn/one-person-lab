# 2026-05-29 OPL Series Doc Governance Tranche Ledger Part 2

Owner: `One Person Lab`
Purpose: `docs_governance_tranche_ledger`
State: `history_provenance`
Machine boundary: 本文是人读 coverage ledger。当前 truth 继续归各 repo 核心五件套、single Active Truth plans、contracts、source、CLI/read-model、runtime ledger、provider receipt、domain-owned manifests、tests 和真实 App evidence。
Date: `2026-05-29T01:41:00+0800`

## Tranche scope

本轮延续 OPL series 文档治理 `/goal`，先重新盘点 6 个 repo 的 `main`、worktree、branch、dirty、ahead/behind、远端 PR 线索、最近写入和后台进程，再处理安全 stale lane，并选择低冲突文档治理 tranche。

本轮主写入范围：

- `med-autogrant/docs/docs_portfolio_consolidation.md`
- 本 OPL 主仓历史 ledger 和 process-plans index

本轮不关闭全局 `/goal`。六仓 `README*` 与 `docs/**/*.md` 的全量逐段覆盖仍未全部完成。

## Repository status snapshot

| Repo | Main state after fetch / verification | Worktree / branch state | Process / PR notes |
| --- | --- | --- | --- |
| `one-person-lab` | Final main is clean and aligned with `origin/main` at `1e67783d` after external Agent Lab work was fast-forwarded and pushed during this run. | `codex/agent-lab-risk-tier-promotion` was externally absorbed/cleaned before final status. `codex/dm003-runner-liveness` was clean, `HEAD` was a main ancestor and 3 behind main; it was removed with its local branch. | `gh pr list` returned `[]`. Remote `fix/opl-temporal-worker-stale-repair-20260528` is merged into `origin/main` by ancestry but is non-codex/non-automation named; remote deletion deferred. |
| `med-autoscience` | Final main is clean and aligned with `origin/main` at `a6b4c365` after an external coverage-ledger commit landed during this run. | Intermediate `codex/mas-doc-governance-inventory-20260529b` appeared dirty/recent and was retained while present; by final status it had disappeared externally and only the clean main worktree remained. | `gh pr list --head codex/mas-doc-governance-inventory-20260529b` returned `[]` when the worktree existed. No MAS cleanup action was taken after the external state change. |
| `med-autogrant` | `main` clean and ahead `origin/main` by 1 after this tranche at `d0d00fe`. | Clean merged stale local `codex/mag-doc-governance-20260529` worktree/branch was removed because HEAD equaled `main`; new temporary `codex/mag-doc-governance-automation-20260529b` worktree was fast-forwarded into main and then removed. | `gh pr list` returned `[]`. Remote `feature/ai-narration-contracts` remains old, unmerged, and non-codex; retained. |
| `redcube-ai` | `main` remains dirty and ahead `origin/main` by 1 at `fa09f1d`; retained untouched. | No extra worktree, but main checkout has active native-PPT code/docs/test changes. | `gh pr list` returned `[]`. Remote `codex/developer-mode-fork-pr-live-closeout-20260528` remains ancestry-unmerged / squash-ambiguous while RCA main is dirty; retained. |
| `opl-meta-agent` | `main` clean and aligned with `origin/main` at `096337e`. | No extra worktree. | `gh pr list` returned `[]`; no body docs edited this tranche. |
| `one-person-lab-app` | `main` clean and aligned with `origin/main` at `d6f60d2`. | `codex/full-first-run-stable-gate-20260525` worktree remains dirty, remote-backed, `3 ahead / 93 behind` versus main; retained. | `gh pr list` returned `[]`. App body docs remain unsafe while release lane is dirty/unmerged. |

Only Codex app support processes were visible in the final process scan: Playwright MCP, node REPL and Codex Python resource process. No repo-specific long-running verification command was treated as a cleanup target.

## Stale lane actions

Deleted local lanes:

- `med-autogrant/.worktrees/doc-governance-20260529` and local branch `codex/mag-doc-governance-20260529`: clean, HEAD equaled `main`, no open PR, and already absorbed.
- `med-autogrant/.worktrees/doc-governance-automation-20260529b` and local branch `codex/mag-doc-governance-automation-20260529b`: created for this tranche, fast-forwarded into `main`, verified, then removed.
- `one-person-lab/.worktrees/dm003-runner-liveness` and local branch `codex/dm003-runner-liveness`: clean, no open PR, `HEAD` was a main ancestor, and final main had already absorbed it.

Retained with reasons:

- `one-person-lab-app/.worktrees/codex/full-first-run-stable-gate-20260525`: dirty, remote-backed and unmerged.
- `redcube-ai` dirty main lane: active native-PPT implementation/docs/test changes.
- `one-person-lab` remote `fix/opl-temporal-worker-stale-repair-20260528`: merged but branch name is not automation-owned.
- `med-autogrant` remote `feature/ai-narration-contracts`: old but unmerged and non-codex.
- `redcube-ai` remote `codex/developer-mode-fork-pr-live-closeout-20260528`: likely superseded by squash history but not safe to delete while RCA main is dirty.

## Reviewed documents / sections

| Repo | Reviewed docs / sections | Live truth checked |
| --- | --- | --- |
| `one-person-lab` | Root guidance, `TASTE.md`, OPL Doc Governance skill, previous 2026-05-29 ledger, process-plans index, final repo state. | `get_goal`, automation memory, `git fetch`, `git status`, `git worktree list`, branch ancestry, recent writes, final external commit inspection, `gh pr list`, process scan. |
| `med-autoscience` | Branch/worktree lifecycle state only, including intermediate dirty worktree and final clean main state. | git status/worktree/log/ahead-behind, dirty files while present, recent writes, PR head scan. |
| `med-autogrant` | Full paragraph read of four 2026-04-08 P3/P4 history specs: P3.B revision/re-review, P3.C rollback/presubmission, P4.A verification gate, P4.B checkpoint surface; support read of specs lifecycle map, specs index, history specs index, core docs, active plan, ideal-state reference. | `current-program.json`, production acceptance contract, repository hygiene / standard-pack / production-acceptance tests, doctor preflight, git state, conflict-marker and diff checks. |
| `redcube-ai` | Branch/worktree lifecycle state only; dirty native-PPT lane retained. | git status/worktree/ref checks, recent writes, PR scan. |
| `opl-meta-agent` | Branch/worktree lifecycle state only; no body docs edited. | git status/worktree/ref checks, PR scan. |
| `one-person-lab-app` | Branch/worktree lifecycle state only; dirty release lane retained. | git status/worktree/ahead-behind, PR scan. |

## Edited documents

| Repo | File | Change |
| --- | --- | --- |
| `med-autogrant` | `docs/docs_portfolio_consolidation.md` | Added `2026-05-29 P3/P4 rollback and verification history specs tranche` coverage ledger, recording full paragraph-level coverage and currentness classification for the four P3/P4 history specs. |
| `one-person-lab` | `docs/history/process/plans/2026-05-29-opl-series-doc-governance-tranche-ledger-part-2.md` | Added this cross-repo branch/worktree/docs governance ledger. |
| `one-person-lab` | `docs/history/process/plans/README.md` | Indexed this ledger as historical provenance. |

## Archived / tombstoned / deleted documents

None. The reviewed MAG P3/P4 history specs remain useful provenance and already carry lifecycle/machine-boundary guards.

## Verification evidence

| Repo | Verification | Result |
| --- | --- | --- |
| `med-autogrant` | `git diff --check`; strict conflict-marker scan over `docs`, root README files, `agent/README.md`, `contracts/README.md`, and `runtime/README.md`; OPL Doc Governance doctor on main after fast-forward. | Passed: diff check clean, no conflict markers, doctor `finding_count=0`, active truth `pass`. |
| `one-person-lab` | `git diff --check`; strict conflict-marker scan over `docs/history/process/plans` after ledger write. | Passed: diff check clean; no conflict markers. |

The failed intermediate conflict-marker command was caused by using zsh's read-only `status` variable name in the shell snippet. The command was rerun with `rc` and returned `no conflict markers`; no repo file was changed for that issue.

## Unreviewed documents

This tranche did not complete whole-portfolio coverage.

- `one-person-lab`: most `README*` and `docs/**/*.md` outside branch/governance ledgers remain unreviewed in this tranche.
- `med-autoscience`: content-level README/docs audit remains; the intermediate dirty docs-governance worktree disappeared externally before final status, so next run should re-inventory MAS from current main before assuming coverage state.
- `med-autogrant`: P3/P4 rollback/verification history body batch is covered. Remaining higher-risk history body batches include 2026-04-08 P5 / R-series activation packages, 2026-04-10 post-R5A fail-closed / hosted-bundle records, 2026-04-11 Hermes/reset/local-runtime records and 2026-04-12 hosted / OPL handoff records unless already covered by prior date/topic tranche entries.
- `redcube-ai`: content-level README/docs audit remains and should coordinate with the active native-PPT dirty lane.
- `opl-meta-agent`: no new OMA body-doc tranche was performed this run; prior OMA coverage stands.
- `one-person-lab-app`: content-level README/docs audit remains, especially release/user-guide/status docs, after dirty release worktree is merged, cleaned, or explicitly assigned.

## Remaining stale / retire candidates

- MAS should be re-inventoried from final main `a6b4c365`; an intermediate dirty docs-governance worktree was externally resolved during this run.
- App `codex/full-first-run-stable-gate-20260525` remains dirty, remote-backed and unmerged.
- RCA dirty native-PPT lane remains active; remote `codex/developer-mode-fork-pr-live-closeout-20260528` should not be deleted until a clean RCA context proves supersession.
- OPL remote `fix/opl-temporal-worker-stale-repair-20260528` and MAG remote `feature/ai-narration-contracts` remain preserved due non-automation ownership / unmerged state.
- MAG evidence tails remain implementation/evidence work: physical delete authorization, production long-soak, submission-ready human gate, sustained real App/operator consumption and long-soak evidence.

## Next write scope

1. Re-inventory MAS from final main `a6b4c365` before deciding whether the externally landed docs coverage closes any MAS section-level gap.
2. Continue MAG history body coverage only if needed by global coverage, prioritizing 2026-04-10 / 2026-04-11 / 2026-04-12 hosted-provider-risk batches.
3. Prefer OPL / MAS / RCA safe document clusters next; delay App body docs while the release lane remains dirty/unmerged.
4. Keep each verified tranche separate from global completion; the global `/goal` remains open until all 6 repos' `README*` and `docs/**/*.md` are section-reviewed and no unreviewed docs or unresolved stale candidates remain.
