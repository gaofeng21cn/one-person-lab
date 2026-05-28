# 2026-05-29 OPL Series Doc Governance Tranche Ledger

Owner: `One Person Lab`
Purpose: `docs_governance_tranche_ledger`
State: `history_provenance`
Machine boundary: 本文是人读 coverage ledger。当前 truth 继续归各 repo 核心五件套、single Active Truth plans、contracts、source、CLI/read-model、runtime ledger、provider receipt、domain-owned manifests、tests 和真实 App evidence。
Date: `2026-05-29`

## Tranche scope

本轮先盘点 OPL series 6 个 repo 的 `main`、worktree、branch、最近写入、dirty、ahead/behind、远端 PR 线索和后台进程，再选择低冲突文档治理 tranche。文档治理主写入范围选择 `opl-meta-agent` repo-local coverage ledger 和 OPL 主仓本历史 ledger。

本轮不关闭全局 `/goal`。六仓 `README*` 与 `docs/**/*.md` 的全量逐段覆盖仍未完成。

## Repository status snapshot

| Repo | Main state after fetch | Worktree / branch state | Process / PR notes |
| --- | --- | --- | --- |
| `one-person-lab` | `main` clean and aligned with `origin/main` at `ac2ac77a`. | `codex/agent-lab-risk-tier-promotion` remains attached to an extra worktree at old `e672e2ba`, dirty in `tests/src/cli/cases/runtime-developer-mode-closeout-ledger.test.ts`, with recent writes; retained. A previous stale missing worktree record for `codex/opl-devmode-patrol-doc-ledger-20260529` is no longer listed after fresh worktree status. | No open PR found. Long-running local app/browser/OPL related processes exist; not treated as cleanup targets. `origin/fix/opl-temporal-worker-stale-repair-20260528` is merged into `origin/main` but has non-codex branch naming, so remote deletion was deferred. |
| `med-autoscience` | `main` clean and aligned with `origin/main` at `b6e7c18c`. | No extra worktree. Recent source/tests/docs writes exist in main checkout from other active work. | No open PR found. Existing long-running MAS/OPL quality or verify commands were observed; no cleanup action. |
| `med-autogrant` | `main` clean and aligned with `origin/main` at `8aa7d8c`. | No extra worktree. Only recent docs portfolio write found. | No open PR found. `origin/feature/ai-narration-contracts` is old but unmerged and non-codex; retained. |
| `redcube-ai` | `main` checkout is dirty and one commit ahead of local `origin/main` before fetch reconciliation; `origin/main` is at `8f8dfcb` while local `main` is `fa09f1d`. | No extra worktree, but main checkout has substantial active code/docs/test changes around native PPT proof; retained. | No open PR found. `origin/codex/developer-mode-fork-pr-live-closeout-20260528` is unmerged by ancestry because `origin/main` has the squashed PR commit `3085c51`; semantic equivalence was not safe to assert in this automation while RCA main is dirty, so remote branch was retained. |
| `opl-meta-agent` | `main` clean and aligned with `origin/main` at `23e1730` before this tranche. | New isolated worktree `codex/oma-doc-governance-20260529` created for this tranche, initially at `23e1730`. | No open PR found. |
| `one-person-lab-app` | `main` clean and aligned with `origin/main` at `d6f60d2`. | `codex/full-first-run-stable-gate-20260525` worktree is dirty, unmerged (`93 behind / 3 ahead` versus `main`), and has a remote branch; retained. | No open PR found. App-related packaged shell processes exist; not cleanup targets. |

## Stale lane actions

No worktree, local branch, or remote branch was deleted in this tranche.

Retained with reasons:

- `one-person-lab/.worktrees/agent-lab-risk-tier-promotion`: dirty and recently written; do not delete or absorb.
- `one-person-lab` remote `fix/opl-temporal-worker-stale-repair-20260528`: merged into `origin/main`, but branch name is not codex/automation-owned; remote deletion deferred.
- `med-autogrant` remote `feature/ai-narration-contracts`: old but unmerged and non-codex; retained.
- `redcube-ai` remote `codex/developer-mode-fork-pr-live-closeout-20260528`: likely semantically superseded by `origin/main` PR squash, but not ancestry-merged and RCA main is dirty; retained for owner-safe follow-up.
- `one-person-lab-app/.worktrees/codex/full-first-run-stable-gate-20260525`: dirty and unmerged; retained.

## Reviewed documents / sections

| Repo | Reviewed docs / sections | Live truth checked |
| --- | --- | --- |
| `one-person-lab` | Root guidance, `TASTE.md`, OPL Doc Governance skill, current docs portfolio ledger, prior 2026-05-28 tranche ledger, process plans index. | `git fetch --all --prune`, `git status`, `git worktree list --porcelain`, branch/ref ancestry, recent writes, `gh pr list`, doctor preflight, process scan. |
| `med-autoscience` | Branch/docs lifecycle state only; body docs not edited due active recent writes and external processes. | git status/worktree/ref checks, recent writes, `gh pr list`, doctor preflight, process scan. |
| `med-autogrant` | Branch/docs lifecycle state only. | git status/worktree/ref checks, recent writes, remote branch ancestry, `gh pr list`, doctor preflight. |
| `redcube-ai` | Branch/docs lifecycle state only; dirty native-PPT lane classified as active/unsafe. | git status/worktree/ref checks, recent writes, remote branch ancestry, `gh pr list`, doctor preflight. |
| `opl-meta-agent` | Exact root `README*`, all `docs/**/*.md`, tracked `agent/*/README.md` support indexes, active truth plan, ideal-state reference, private inventory, docs governance ledger, package scripts, core contracts, generated interface read model, OMA production-consumption ledger. | Doctor preflight, human-doc inventory, heading inventory, contract reads, `opl agents interfaces --repo-dir <OMA worktree> --json`, `opl runtime oma-production-consumption list --json`, `npm test`, `npm run typecheck`, diff checks. |
| `one-person-lab-app` | Branch/worktree/docs lifecycle state only; body docs not edited because the stale release worktree is dirty and unmerged. | git status/worktree/ref checks, recent writes, `gh pr list`, doctor preflight, App worktree diff classification. |

## Edited documents

| File | Change |
| --- | --- |
| `opl-meta-agent/docs/docs_portfolio_consolidation.md` | Refreshed OMA semantic coverage timestamp to `2026-05-29T01:09:43+0800` and folded this OPL-series no-drift refresh into the compact history table. |
| `one-person-lab/docs/history/process/plans/2026-05-29-opl-series-doc-governance-tranche-ledger.md` | Added this cross-repo branch/worktree/docs governance ledger. |
| `one-person-lab/docs/history/process/plans/README.md` | Indexed this ledger as historical provenance. |

## Archived / tombstoned / deleted documents

None. No README/docs path was proven stale enough to archive, tombstone, or delete in this tranche.

## Verification evidence

| Repo | Verification | Result |
| --- | --- | --- |
| `opl-meta-agent` | `npm test`; `npm run typecheck`; `git diff --check`; `rg -n "^(<<<<<<<\|=======\|>>>>>>>)" docs README.md README.zh-CN.md agent/*/README.md`; OPL generated interface and production-consumption read-model reads. | Passed: `47 passed`, typecheck exit 0, diff/conflict-marker checks clean; generated interface bundle returned `status=ready`; OMA production-consumption ledger returned 2 verified refs-only receipts. |
| `one-person-lab` | `git diff --check`; `rg -n "^(<<<<<<<\|=======\|>>>>>>>)" docs/history/process/plans docs/docs_portfolio_consolidation.md`. | Passed: diff/conflict-marker checks clean. |

## Unreviewed documents

This tranche did not complete whole-portfolio coverage.

- `one-person-lab`: most `README*` and `docs/**/*.md` outside current governance ledger/context remain unreviewed in this tranche.
- `med-autoscience`: content-level README/docs audit remains.
- `med-autogrant`: content-level README/docs audit remains.
- `redcube-ai`: content-level README/docs audit remains and should wait for or coordinate with the active native-PPT dirty lane.
- `opl-meta-agent`: current repo-root `README*`, `docs/**/*.md`, and tracked `agent/*/README.md` support indexes were re-read; no unreviewed OMA human-doc path remains for this tranche.
- `one-person-lab-app`: content-level README/docs audit remains, especially release/user-guide/status docs, once dirty release lane is merged, cleaned, or explicitly assigned.

## Remaining stale / retire candidates

- App `codex/full-first-run-stable-gate-20260525` needs owner follow-up because it is dirty and unmerged.
- RCA `origin/codex/developer-mode-fork-pr-live-closeout-20260528` may be superseded by squashed PR history, but requires a clean RCA context or explicit owner decision before remote deletion.
- OPL `origin/fix/opl-temporal-worker-stale-repair-20260528` is merged but not codex/automation-named; delete only after confirming branch ownership.
- MAG `origin/feature/ai-narration-contracts` is old and unmerged; preserve until owner/currentness is established.
- OMA remaining work is evidence/hygiene rather than doc-path retirement: App live render/runtime drilldown, repeat long-soak, more real target patch-loop owner receipt or typed blocker samples, independent Codex reviewer direct-evidence samples, standard target-agent handoff convergence, domain refs-only adapter thinning, and script-to-pack / OPL primitive hygiene.

## Next write scope

1. Continue a clean repo tranche next, preferably MAG or OMA only if exact human-doc inventory changes; otherwise avoid dirty RCA/App lanes.
2. For RCA, first resolve or explicitly route the native-PPT dirty main lane before docs governance or remote branch retirement.
3. For App, first resolve the dirty `full-first-run-stable-gate` worktree before editing App body docs.
4. Keep each verified tranche separate from global completion; the global `/goal` remains open until all 6 repos' `README*` and `docs/**/*.md` are section-reviewed and no unreviewed docs or unresolved stale candidates remain.
