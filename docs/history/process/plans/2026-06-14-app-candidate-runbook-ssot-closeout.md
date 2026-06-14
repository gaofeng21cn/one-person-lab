# App Candidate Runbook SSOT Closeout

Owner: `One Person Lab`
Purpose: `app_candidate_runbook_ssot_closeout`
State: `history_provenance`
Machine boundary: 本文只记录一次 OPL series governance tranche 的 frozen inventory、SSOT lane、验证、提交 / 推送 / cleanup 和停止证据。当前机器真相继续归各 repo 的 `contracts/`、source、tests、CLI/API 行为、runtime ledger、provider receipt、domain-owned manifests、App evidence、candidate manifests、owner receipts、typed blockers 和 fresh command output；本文不得作为 App candidate adoption、App release ready、domain ready、family production ready、owner receipt、typed blocker、quality/export verdict、artifact authority、physical delete authorization 或 compatibility surface。

## Run Snapshot

- `RUN_SNAPSHOT_TS`: `2026-06-14T00:35:04Z`
- Automation: `automation-2` / OPL 系列项目治理与过时面退役
- Scope: six-repo frozen inventory across `/Users/gaofeng/workspace/one-person-lab`, `/Users/gaofeng/workspace/med-autoscience`, `/Users/gaofeng/workspace/med-autogrant`, `/Users/gaofeng/workspace/redcube-ai`, `/Users/gaofeng/workspace/opl-meta-agent`, and `/Users/gaofeng/workspace/one-person-lab-app`
- Starting memory baseline: previous run had already landed OPL `StageRun` authorization identity, MAS owner-gate intake, MAS display-registry assertion alignment, and OPL owner-gate closeout records. Treat those as prior baseline, not this tranche's new core mutation.
- Initial frozen inventory in this tranche showed all six repos on `main` and synced with `origin/main`. MAS/MAG had pre-existing extra worktrees; the root checkouts were clean at the first inventory point.
- First post-mutation inventory showed `med-autoscience` main checkout had an unrelated dirty write set in `current_work_unit`, `paper_recovery_state`, and focused tests. This run did not touch or overwrite those files.
- A final recheck showed that MAS dirty write set had been absorbed by external / concurrent commits `3a9a177df` and `3edd02c8c`; MAS was clean and synced at final closeout. This closeout records that final baseline without claiming the concurrent MAS lane as this tranche's mutation.
- During post-mutation inventory, `one-person-lab` main was already advanced to `22597bfd` by external / concurrent work and remained clean / synced. This closeout records that baseline without claiming the refactor lane as this automation's mutation; the ledger commit itself then advanced OPL root.

## Candidate Gate

| Candidate | Value gate | Safety gate | Decision |
| --- | --- | --- | --- |
| App `agui-codex` candidate runbook SSOT thinning | High. The active runbook duplicated executable candidate acceptance fields that are already machine-owned by App candidate contracts and `scripts/validate-shell-candidates/*`, making the runbook a future second truth source. | Safe. Scope was docs-only and limited to App candidate runbook, docs index, docs portfolio governance and process-history index. No contracts, scripts, workflows, shell checkout, release artifact or updater metadata changed. | Entered lane; landed in `one-person-lab-app`. |
| OPL root stale `gateway/frontdoor/federation/Hermes` wording | Low / mixed. Fresh scans mostly hit decisions, history/provenance, negative guards, explicit non-default executor boundaries, or already governed active support. | Unsafe to edit/delete without a narrower SSOT owner and proof that a hit is outside history/provenance/negative-guard/current adapter context. | Skipped for this tranche. |
| MAS owner/currentness code lane | Potentially high; first post-mutation inventory showed a dirty write set in the same source/test area. | Same-write-set ownership was unclear during this tranche. A final recheck showed the dirty write set had been externally absorbed as MAS commits `3a9a177df` / `3edd02c8c`, leaving no safe additional mutation for this run. | Skipped; next run should start from clean MAS `main`. |
| RCA / OMA private platform retirement tails | Potentially high but still gated by replacement parity, no-active-caller, no-forbidden-write, owner receipt / typed blocker and tombstone/provenance proof. | Current active docs identify gates, but this tranche did not find a concrete disjoint source/test deletion with focused verification ready. | Skipped; next-run slate. |

## SSOT Decisions

| Semantic theme | Single Source of Truth | Peer-doc classification |
| --- | --- | --- |
| App candidate shell registry, adoption gate, design-reference policy and release isolation | `one-person-lab-app/contracts/app-shell-candidates.json` plus `one-person-lab-app/scripts/validate-shell-candidates/*` | `docs/agui-codex-candidate-verification.md` is human runbook only; it now keeps command order and false-authority boundary rather than duplicating acceptance fields. |
| Explicit candidate adapter selection and shell root | `one-person-lab-app/contracts/shell-adapters/agui-codex.json` plus candidate validator checks | Runbook points at the adapter and command env var; it does not define adapter truth. |
| Default stable/nightly release shell | `one-person-lab-app/contracts/app-shell-adapter.json` plus `validateActiveShellUnaffected` | Runbook and process index state that AionUI remains default until active-shell adapter changes under release gates. |
| Candidate smoke / package / manifest proof | Candidate shell artifacts, candidate manifest, CI logs and `npm run validate:candidate -- --require-app --require-smoke` | Process history and docs index now point to these owners; dated smoke details do not live in active docs. |

## Evidence Read

- `one-person-lab-app/AGENTS.md`, `TASTE.md`
- `one-person-lab-app/docs/agui-codex-candidate-verification.md`
- `one-person-lab-app/docs/project.md`, `docs/status.md`, `docs/README.md`, `docs/docs_portfolio_consolidation.md`, `docs/history/process/README.md`
- `one-person-lab-app/contracts/app-shell-candidates.json`
- `one-person-lab-app/contracts/shell-adapters/agui-codex.json`
- `one-person-lab-app/contracts/app-shell-adapter.json`
- `one-person-lab-app/scripts/validate-shell-candidates.ts`
- `one-person-lab-app/scripts/validate-shell-candidates/candidate-contract.ts`
- `one-person-lab-app/scripts/validate-shell-candidates/registry.ts`
- `one-person-lab-app/scripts/validate-shell-candidates/candidate-evidence.ts`
- Six-repo git inventory and post-mutation stale / remaining-candidate scans

## Changed Surface

| Repo | Commit | Change |
| --- | --- | --- |
| `one-person-lab-app` | `9b7b264` `docs: thin candidate shell verification runbook` | Removed the long active acceptance checklist from `docs/agui-codex-candidate-verification.md`, replaced it with SSOT pointers to candidate contracts / validators / manifests, and updated docs index, docs portfolio governance and process-history coverage row. |

No OPL Framework source, MAS/MAG/RCA/OMA source, App contracts, App scripts, workflows, shell checkouts, release artifacts or updater metadata changed in the App lane.

## Verification

```bash
# one-person-lab-app lane
rtk git diff --check
rtk npm run validate:shell-candidates
rtk node --experimental-strip-types scripts/validate-active-shell.ts --quick
rg -n '^(<<<<<<<|=======|>>>>>>>)' README.md README.zh-CN.md docs -g '*.md'
node <local markdown link scanner>
python3 /Users/gaofeng/workspace/opl-doc/scripts/opl_doc_doctor.py doctor . --format json
```

Results:

- App diff check: passed.
- `npm run validate:shell-candidates`: passed; `active_shell_unchanged=aionui`, candidate `agui-codex`, release participation `explicit_candidate_build_only_until_adopted`.
- Active-shell quick validation: passed; active shell contract structurally valid.
- Conflict marker scan: passed after using anchored marker pattern.
- Local markdown link scan: checked `25` Markdown files, no broken local links.
- App OPL Doc doctor risk map: `finding_count=0`, `active_truth_health.status=pass`, `markdown_doc_count=23`.
- Temporary ignored `shells/aionui` and `shells/agui-codex` symlinks were used only to satisfy validator external-checkout preconditions in the isolated worktree; they were not tracked or committed.

## Absorption And Cleanup

- App worktree branch: `automation/app-candidate-docs-20260614`
- App isolated worktree: `/Users/gaofeng/workspace/one-person-lab-app-auto-candidate-docs-20260614`
- Commit `9b7b264` was pushed to branch, fast-forward merged into `one-person-lab-app` `main`, and pushed to `origin/main`.
- `worktree_absorption_audit.py` classified the App worktree as `exact-merged`.
- The App temporary worktree, local branch and remote branch were removed.

## Final Inventory

| Repo | Final `HEAD` | `HEAD...origin/main` | Status |
| --- | --- | --- | --- |
| `one-person-lab` | `c520e50c` | `0 0` | clean / synced after this closeout ledger commit; prior `22597bfd` was an external concurrent refactor outside the App docs lane |
| `med-autoscience` | `3edd02c8c` | `0 0` | clean / synced; concurrent MAS owner/currentness lane absorbed outside this App docs lane |
| `med-autogrant` | `14dfd42` | `0 0` | clean / synced |
| `redcube-ai` | `0e0e7534` | `0 0` | clean / synced |
| `opl-meta-agent` | `6bd09e8` | `0 0` | clean / synced |
| `one-person-lab-app` | `9b7b264` | `0 0` | clean / synced |

## Post-Mutation Reevaluation

After the App lane landed, the candidate queue was reevaluated:

- OPL root stale-wording scans still mostly hit history/provenance, negative guards, explicit non-default executor adapter boundaries, or active false-authority guardrails. No high-confidence active-current conflict with a narrow write set was found.
- App candidate shell docs are now tighter; further App docs edits would be low-value wording work unless a contract, validator, candidate manifest, release artifact, active-shell validation output or package script changes.
- MAS briefly had a dirty write set in the exact source/test area that could have become a future high-value owner/currentness lane; final recheck showed it had already been externally committed and synced. No same-write-set target remained for this run.
- RCA / OMA private-platform and script-to-pack retirement tails remain real, but current docs require no-active-caller, replacement parity, owner receipt / typed blocker and no-forbidden-write proof before physical deletion. This run did not identify one concrete deletion with ready verification.

## Next Run Slate

1. Freeze fresh six-repo inventory and treat `one-person-lab@c520e50c`, `med-autoscience@3edd02c8c`, `med-autogrant@14dfd42`, `redcube-ai@0e0e7534`, `opl-meta-agent@6bd09e8`, and `one-person-lab-app@9b7b264` as the current baselines unless `origin/main` has moved.
2. MAS next-run work should read commits `3a9a177df` / `3edd02c8c` before choosing any owner/currentness continuation; do not assume the earlier dirty write set is still present.
3. Prefer concrete source / contract / test / workflow / CLI/API retirements with no-active-caller evidence and replacement-owner proof.
4. Reopen stale keyword cleanup only when the hit is outside history/provenance/negative-guard/current explicit-adapter context and has a clear SSOT owner.
5. Do not treat App candidate validation, candidate package smoke, runbook prose, docs foldback, doctor pass, refs-only owner evidence, or observed typed-blocker shapes as App adoption, App release ready, domain ready, owner answer closeout or family production ready.
