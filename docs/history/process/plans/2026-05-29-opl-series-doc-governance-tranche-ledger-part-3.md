# 2026-05-29 OPL Series Doc Governance Tranche Ledger Part 3

Owner: `One Person Lab`
Purpose: `docs_governance_tranche_ledger`
State: `history_provenance`
Machine boundary: 本文是人读 coverage ledger。当前 truth 继续归各 repo 核心五件套、single Active Truth plans、contracts、source、CLI/read-model、runtime ledger、provider receipt、domain-owned manifests、tests 和真实 App evidence。
Date: `2026-05-29T01:59:12+0800`

## Tranche scope

本轮延续 OPL series 文档治理 `/goal`，先重新盘点 6 个 repo 的 `main`、worktree、branch、dirty、ahead/behind、远端 PR 线索、最近写入和后台进程，再保留仍活跃或最近写入的 lane，并在 MAS 做一个低冲突语义刷新 tranche。

本轮主写入范围：

- `med-autoscience/docs/active/stage_surface_standardization_program.md`
- `med-autoscience/docs/docs_portfolio_consolidation.md`
- `med-autoscience/docs/history/docs-portfolio-coverage-ledger/2026-05-29-part-14.md`
- 本 OPL 主仓历史 ledger 和 process-plans index

本轮不关闭全局 `/goal`。六仓 `README*` 与 `docs/**/*.md` 的全量逐段覆盖仍未全部完成。

## Repository status snapshot

| Repo | Main state after fetch / verification | Worktree / branch state | Process / PR notes |
| --- | --- | --- | --- |
| `one-person-lab` | `main` clean and aligned with `origin/main` at `25cbb505` before this central ledger write. | `codex/developer-mode-risk-tier-receipt-20260529` worktree is clean and equal to `main`, but its files had recent writes in the last hour; retained for the next run to recheck once idle. | Fresh `gh pr list` returned `[]`. Remote `fix/opl-temporal-worker-stale-repair-20260528` is ancestry-contained in `origin/main`, but branch name is not automation-owned; remote deletion deferred. |
| `med-autoscience` | `main` was fast-forwarded to `cdc4006a`, pushed, and aligned with `origin/main`. | Temporary worktree `codex/mas-doc-governance-history-20260529c` was created before this tranche, fast-forwarded into `main`, then removed with its local branch after verification. | Fresh `gh pr list` returned `[]`. No MAS remote cleanup needed. |
| `med-autogrant` | `main` clean and aligned with `origin/main` at `d0d00fe`. | `codex/mag-doc-governance-hosted-history-20260529c` worktree is clean and equal to `main`, but had recent writes in the last hour; retained for the next run to recheck once idle. | Fresh `gh pr list` returned `[]`. Remote `feature/ai-narration-contracts` remains old, unmerged and non-codex; retained. |
| `redcube-ai` | `main` remains dirty and ahead `origin/main` by 1 at `fa09f1d`; retained untouched. | No extra worktree, but main checkout has active native-PPT source/docs/test changes plus new untracked native-PPT test/helper files. | Fresh `gh pr list` returned `[]`. Remote `codex/developer-mode-fork-pr-live-closeout-20260528` remains ancestry-unmerged / squash-ambiguous while RCA main is dirty; retained. A native-PPT node test process was visible during process scan and treated as external active work. |
| `opl-meta-agent` | `main` clean and aligned with `origin/main` at `096337e`. | No extra worktree. | Fresh `gh pr list` returned `[]`; no body docs edited this tranche. |
| `one-person-lab-app` | `main` clean and aligned with `origin/main` at `d6f60d2`. | `codex/full-first-run-stable-gate-20260525` worktree remains dirty, remote-backed and unmerged; retained. | Fresh `gh pr list` returned `[]`. App body docs remain unsafe while release lane is dirty/unmerged. |

Process scan also showed OPL provider-backed stage attempts under `/Users/gaofeng/workspace/Yang/DM-CVD-Mortality-Risk`, App GitHub Actions runner processes, Codex app support processes and remote SSH probes. These were treated as external active work and not cleanup targets.

## Stale lane actions

Deleted local lanes:

- `med-autoscience/.worktrees/doc-governance-history-20260529c` and local branch `codex/mas-doc-governance-history-20260529c`: created for this tranche, fast-forwarded into `main`, verified, pushed, then removed.

Retained with reasons:

- `one-person-lab/.worktrees/developer-mode-risk-tier-receipt-20260529`: clean and equal to `main`, but files in the worktree showed writes within the last hour; defer cleanup until it is idle.
- `med-autogrant/.worktrees/codex/mag-doc-governance-hosted-history-20260529c`: clean and equal to `main`, but files in the worktree showed writes within the last hour; defer cleanup until it is idle.
- `redcube-ai` dirty main lane: active native-PPT implementation/docs/test changes and active process evidence.
- `one-person-lab-app/.worktrees/codex/full-first-run-stable-gate-20260525`: dirty, remote-backed and unmerged.
- OPL remote `fix/opl-temporal-worker-stale-repair-20260528`: merged into `origin/main` by ancestry but not automation/codex named.
- MAG remote `feature/ai-narration-contracts`: old but unmerged and non-codex.
- RCA remote `codex/developer-mode-fork-pr-live-closeout-20260528`: not safe to delete while RCA main is dirty and supersession is not cleanly established.

## Reviewed documents / sections

| Repo | Reviewed docs / sections | Live truth checked |
| --- | --- | --- |
| `one-person-lab` | Root guidance, `TASTE.md`, OPL Doc Governance skill, process-plans index, previous 2026-05-29 ledger part 2, final repo state. | `get_goal`, automation memory, `git fetch`, `git status`, `git worktree list`, branch ancestry, recent writes, `gh pr list`, process scan, doctor sweep. |
| `med-autoscience` | Full currentness read of `docs/active/stage_surface_standardization_program.md` sections `AI-first verdict 口径`, `Quality Pack Maturity Gate`, `当前缺口`, `Planning Gate Classification`, and adjacent review/index/workbench projection paragraphs; support read of MAS active gap plan, status and decisions. | `contracts/pack_compiler_input.json`, `contracts/stage_control_plane.json`, `contracts/action_catalog.json`, `contracts/functional_privatization_audit.json`, `contracts/production_acceptance/mas-production-acceptance.json`, `src/med_autoscience/opl_domain_pack/family_adoption.py`, `stage_quality_contract.py`, `stage_knowledge_contract.py`, `stage_surface_contract.py`, focused tests and doctor. |
| `med-autogrant` | Branch/worktree lifecycle state only; recent clean/equal worktree retained. | git status/worktree/log/ahead-behind, recent writes, PR scan. |
| `redcube-ai` | Branch/worktree lifecycle state only; dirty native-PPT lane retained. | git status/worktree/ref checks, recent writes, process scan, PR scan. |
| `opl-meta-agent` | Branch/worktree lifecycle state only; no body docs edited. | git status/worktree/ref checks, PR scan, doctor. |
| `one-person-lab-app` | Branch/worktree lifecycle state only; dirty release lane retained. | git status/worktree/ahead-behind, PR scan, doctor. |

## Edited documents

| Repo | File | Change |
| --- | --- | --- |
| `med-autoscience` | `docs/active/stage_surface_standardization_program.md` | Reclassified `ai_first_verdict_alignment` from `authority_wording_split_pending` to `contract_validator_landed; receipt_scaleout_pending`, matching live pack/compiler/stage-quality contracts and tests while keeping real reviewer/auditor receipt scaleout as evidence tail. |
| `med-autoscience` | `docs/docs_portfolio_consolidation.md` | Indexed the new part-14 coverage ledger. |
| `med-autoscience` | `docs/history/docs-portfolio-coverage-ledger/2026-05-29-part-14.md` | Added coverage ledger for the MAS stage-surface AI-first verdict semantic refresh. |
| `one-person-lab` | `docs/history/process/plans/2026-05-29-opl-series-doc-governance-tranche-ledger-part-3.md` | Added this cross-repo branch/worktree/docs governance ledger. |
| `one-person-lab` | `docs/history/process/plans/README.md` | Indexed this ledger as historical provenance. |

## Archived / tombstoned / deleted documents

None. `docs/active/stage_surface_standardization_program.md` remains a valid MAS active support owner; the stale portion was a narrow status/classification drift inside the document.

## Verification evidence

| Repo | Verification | Result |
| --- | --- | --- |
| `med-autoscience` | In the worktree and again on main after fast-forward: `git diff --check`; strict conflict-marker scan over `docs` and root README files; OPL Doc Governance doctor; focused `scripts/run-pytest-clean.sh tests/test_opl_standard_pack.py tests/test_opl_family_contract_adoption.py tests/product_entry_cases/action_catalog_parity.py tests/test_stage_quality_contract.py tests/test_stage_surface_contract.py tests/test_stage_knowledge_plane.py -q`. | Passed: diff check clean, no conflict markers, doctor `finding_count=0` / active truth `pass`, focused tests `67 passed`. Commit `cdc4006a docs: refresh MAS stage surface coverage` is on `origin/main`. |
| `one-person-lab` | `git diff --check` and strict conflict-marker scan over `docs/history/process/plans` after ledger write; OPL Doc Governance doctor on the main checkout. | Passed: diff check clean, no conflict markers, doctor `finding_count=0` / active truth `pass`. |

An intermediate focused pytest attempt failed during collection because `tests/product_entry_cases/action_catalog_parity_cases/stage_descriptor_cases.py` uses package-relative imports and must be collected through `tests/product_entry_cases/action_catalog_parity.py`. The corrected command above passed and is the verification evidence.

## Unreviewed documents

This tranche did not complete whole-portfolio coverage.

- `one-person-lab`: most `README*` and `docs/**/*.md` outside branch/governance ledgers remain unreviewed in this tranche.
- `med-autoscience`: exact-path local ledger already showed no newly uncovered MAS path; this tranche was a semantic refresh over a previously covered high-drift active support doc. Future source/contract/read-model changes can reopen sections.
- `med-autogrant`: P3/P4 rollback/verification history body batch is covered. Remaining higher-risk history body batches include 2026-04-10 / 2026-04-11 / 2026-04-12 hosted-provider-risk records unless already covered by prior date/topic tranche entries.
- `redcube-ai`: content-level README/docs audit remains and should coordinate with the active native-PPT dirty lane.
- `opl-meta-agent`: no new OMA body-doc tranche was performed this run; prior OMA coverage stands.
- `one-person-lab-app`: content-level README/docs audit remains, especially release/user-guide/status docs, after dirty release worktree is merged, cleaned, or explicitly assigned.

## Remaining stale / retire candidates

- Future MAS prose that writes `ai_first_verdict_alignment` as an open structural gap is stale unless the contract / validator / focused tests are removed or replaced.
- Any future MAS prose that treats quality pack descriptors, stage review pages, OPL refs-only ledgers, provider completion, worklist zero-open state, queue completion, human annotation or mechanical projection as quality verdict, publication readiness, domain readiness, submission readiness, artifact authority or paper closure remains stale pollution.
- App `codex/full-first-run-stable-gate-20260525` remains dirty, remote-backed and unmerged.
- RCA dirty native-PPT lane remains active; remote `codex/developer-mode-fork-pr-live-closeout-20260528` should not be deleted until a clean RCA context proves supersession.
- OPL clean/equal `codex/developer-mode-risk-tier-receipt-20260529` and MAG clean/equal `codex/mag-doc-governance-hosted-history-20260529c` should be rechecked next run; if still idle and equal to main, remove local worktree/branch.

## Next write scope

1. Recheck and clean OPL / MAG clean-equal temporary worktrees if they are still idle and equal to main.
2. Continue OPL series whole-docs coverage outside MAS, prioritizing OPL uncovered support docs or MAG 2026-04-10/11/12 hosted-provider history batches.
3. Delay App body docs while the release lane remains dirty/unmerged; delay RCA body docs unless the native-PPT dirty lane is merged or explicitly handed off.
4. Keep each verified tranche separate from global completion; the global `/goal` remains open until all 6 repos' `README*` and `docs/**/*.md` are section-reviewed and no unreviewed docs or unresolved stale candidates remain.
