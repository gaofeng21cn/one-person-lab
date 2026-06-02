# 2026-06-01 OPL Series Doc Governance Tranche Ledger

Owner: `One Person Lab`
Purpose: `docs_governance_tranche_ledger`
State: `history_provenance`
Machine boundary: 本文是人读 coverage ledger。当前 truth 继续归各 repo 核心五件套、single Active Truth plans、contracts、source、CLI/read-model、runtime ledger、provider receipt、domain-owned manifests、tests 和真实 App evidence。
RUN_SNAPSHOT_TS: `2026-06-01T17:11:38+0800`

## Tranche Scope

本轮先刷新并盘点 OPL series 6 个 repo 的 `main`、worktree、branch、最近写入、dirty、ahead/behind、远端/PR 线索和后台进程。随后只记录本轮 branch/worktree hygiene 与 docs coverage ledger，不做 prose body rewrite，不关闭全局 `/goal`。

固定 OPL Doc Governance skill / doctor 路径在本机当前缺失：

- `/Users/gaofeng/workspace/opl-doc-governance/skills/opl-doc-governance/SKILL.md`
- `/Users/gaofeng/workspace/opl-doc-governance/scripts/opl_doc_doctor.py`

本轮因此按本仓 `AGENTS.md`、`TASTE.md`、`docs/docs_portfolio_consolidation.md`、`docs/active/current-state-vs-ideal-gap.md` 和既有 history coverage ledger 模式执行。Doctor 缺口只作为 tooling blocker 记录，不能替代 docs 语义审计，也不能据此关闭全局 goal。

## Repository Status Snapshot

| Repo | Main state after fetch / fast-forward | README/docs inventory | Worktree / branch state |
| --- | --- | ---: | --- |
| `one-person-lab` | aligned with `origin/main` at `35647ee0` (`Fix Progress-First attempt study alias lookup`) but carried unrelated concurrent dirty files outside this tranche. | `193` | Stale clean worktree `/private/tmp/opl-cleanup-20260601` on `codex/opl-retire-mas-legacy-locator-rehydration-20260601` had no commits beyond `main` and was removed; local branch deleted. |
| `med-autoscience` | clean and aligned with `origin/main` at `8c6da4f2` (`Fix Progress-First dispatch export fallthrough`). | `261` | Only root worktree on `main`. |
| `med-autogrant` | clean and aligned with `origin/main` at `7432fdc` (`chore(ci): update official action majors`). | `117` | Only root worktree on `main`; remote `origin/feature/ai-narration-contracts` retained. |
| `redcube-ai` | clean and aligned with `origin/main` at `dff02816` (`test(ci): update artifact action contracts`). | `92` | Only root worktree on `main`. |
| `opl-meta-agent` | clean and aligned with `origin/main` at `712b006` (`fix(progress): record OMA progress-first work-order bounds`). | `15` | Only root worktree on `main`. |
| `one-person-lab-app` | clean and aligned with `origin/main` at `6566b6d` (`chore(ci): update official action majors`). | `19` | Only root worktree on `main`; remote `origin/codex/full-first-run-stable-gate-20260525` retained. |

Open PR checks returned `[]` for all six repos after ref refresh. Recent-write scan over root checkouts returned no repo-file writes in the last hour before the ledger write, but the OPL root already carried unrelated concurrent dirty changes in `src/workspace-registry.ts`, `docs/status.md` and `tests/src/cli/cases/workspace-domain.binding.test.ts` from a workspace-binding/runtime cleanup line. Process scan found Codex app/server, CodeGraph, Playwright and desktop infrastructure processes, but no repo-specific build/test/runtime process that would make a clean stale worktree active.

## Stale Lane Actions

Deleted locally:

- `/private/tmp/opl-cleanup-20260601`
- `codex/opl-retire-mas-legacy-locator-rehydration-20260601`

Retained with reasons:

- `one-person-lab` remote `origin/fix/opl-temporal-worker-stale-repair-20260528`: already ancestor of current `main`, but branch name is not codex/automation-owned; no open PR found, remote deletion deferred until ownership is explicit.
- `med-autogrant` remote `origin/feature/ai-narration-contracts`: old and unmerged by ancestry. Its single commit changes `grant-progress` schema, `product_entry.py`, tests and lock metadata; currentness/supersession requires MAG semantic review, so it was not deleted.
- `one-person-lab-app` remote `origin/codex/full-first-run-stable-gate-20260525`: codex-named but not ancestry-merged; the branch carries Full first-run release, VM smoke and user-guide asset changes. Current `main` has later release/first-run work that likely supersedes part of the lane, but semantic equivalence was not proven in this tranche, so the remote branch was retained.
- `one-person-lab` local dirty `src/workspace-registry.ts`, `docs/status.md` and `tests/src/cli/cases/workspace-domain.binding.test.ts`: unrelated external workspace-binding/runtime cleanup edits, not staged or committed in this docs-governance tranche.

No clean unmerged local lane was found that could be safely absorbed into `main` in this run.

## Reviewed Documents / Sections

| Repo | Reviewed docs / sections | Live truth checked |
| --- | --- | --- |
| `one-person-lab` | Root `AGENTS.md`, `TASTE.md`, `docs/docs_portfolio_consolidation.md`, `docs/active/current-state-vs-ideal-gap.md`, `docs/active/development-document-portfolio.md`, process history index, prior 2026-05-29/2026-05-30 coverage ledger shape, this ledger. | `git fetch --prune`, status/ahead-behind, worktree list, branch/ref ancestry, open PR scan, process scan, recent-write scan, fixed skill/doctor path lookup. |
| `med-autoscience` | Branch/docs lifecycle state and main current head only; no prose body edit. | fetch/fast-forward/status, inventory count, open PR scan, recent-write/process scan. |
| `med-autogrant` | Branch/docs lifecycle state plus remote `feature/ai-narration-contracts` commit stat/name review; no prose body edit. | fetch/fast-forward/status, inventory count, branch ancestry, commit file scope, open PR scan. |
| `redcube-ai` | Branch/docs lifecycle state only; no prose body edit. | fetch/fast-forward/status, inventory count, open PR scan, recent-write/process scan. |
| `opl-meta-agent` | Branch/docs lifecycle state only; no prose body edit. | fetch/fast-forward/status, inventory count, open PR scan, recent-write/process scan. |
| `one-person-lab-app` | Branch/docs lifecycle state plus remote `codex/full-first-run-stable-gate-20260525` diff stat/name review; no prose body edit. | fetch/fast-forward/status, inventory count, branch ancestry, changed file scope, open PR scan. |

## Edited Documents

| File | Change |
| --- | --- |
| `docs/history/process/plans/2026-06-01-opl-series-doc-governance-tranche-ledger.md` | Added this cross-repo branch/worktree/docs governance ledger. |
| `docs/history/process/plans/README.md` | Indexed this ledger as historical provenance. |

## Archived / Tombstoned / Deleted Documents

None. No README/docs body was proven stale enough to archive, tombstone or delete in this tranche.

## Unreviewed Documents

This tranche did not complete whole-portfolio body coverage.

- `one-person-lab`: most `README*` and `docs/**/*.md` outside the governance/index/current-gap context remain under the long-running coverage ledger.
- `med-autoscience`: content-level README/docs audit remains.
- `med-autogrant`: prior focused ledgers cover many areas, but this run did not close remaining repo-wide history/support bodies or the unmerged `ai-narration-contracts` remote branch.
- `redcube-ai`: content-level README/docs audit remains.
- `opl-meta-agent`: no new exact README/docs path was found in this run, but no full body re-read was performed.
- `one-person-lab-app`: content-level README/docs audit remains, especially release/user-guide/status docs and the retained full-first-run remote branch.

## Remaining Stale / Retire Candidates

- OPL remote `fix/opl-temporal-worker-stale-repair-20260528`: merged by ancestry, remote cleanup requires explicit ownership confirmation.
- MAG remote `feature/ai-narration-contracts`: unmerged semantic candidate; next MAG tranche should compare current `grant-progress` schema, product-entry output and tests before deciding absorb, supersede with marker, or retain.
- App remote `codex/full-first-run-stable-gate-20260525`: codex-named supersession candidate; next App tranche should compare current release contracts/workflows/user-guide assets and either record a supersession marker or absorb any still-current asset/test changes.
- OPL dirty `src/workspace-registry.ts`, `docs/status.md` and `tests/src/cli/cases/workspace-domain.binding.test.ts`: external workspace-binding/runtime cleanup edits must remain out of docs-only commits unless their owner explicitly routes them into a runtime tranche.
- OPL Doc Governance skill/doctor fixed path is missing on disk; restore or relocate it before relying on doctor preflight again.

## Verification Scope

Docs-only verification for this tranche should cover:

- staged docs diff only;
- `git diff --check`;
- strict line-start merge marker scan over touched docs;
- final `git status --short --branch` showing only intended docs changes plus the pre-existing unrelated OPL workspace-binding/runtime dirty files before commit, and only those unrelated dirty files after commit.

No source/contracts/runtime/App behavior was changed in this tranche.

## Next Write Scope

1. Restore or locate the OPL Doc Governance skill/doctor path, then rerun doctor as preflight only.
2. Resolve retained remote branch candidates in separate repo-owned tranches: MAG `ai-narration-contracts`, App `full-first-run-stable-gate`, and OPL merged non-codex remote branch ownership.
3. Continue content-level README/docs governance from the latest coverage ledger, prioritizing clean repos and newly changed docs after the 2026-06-01 fast-forward.
4. Keep the global `/goal` active until all 6 repos' `README*` and `docs/**/*.md` are section-reviewed and no unreviewed docs or unresolved stale candidates remain.
