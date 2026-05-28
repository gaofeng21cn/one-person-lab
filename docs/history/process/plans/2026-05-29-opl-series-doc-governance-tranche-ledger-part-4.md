# 2026-05-29 OPL Series Doc Governance Tranche Ledger Part 4

Owner: `One Person Lab`
Purpose: `docs_governance_tranche_ledger`
State: `history_provenance`
Machine boundary: 本文是人读 coverage ledger。当前 truth 继续归各 repo 核心五件套、single Active Truth plans、contracts、source、CLI/read-model、runtime ledger、provider receipt、domain-owned manifests、tests 和真实 App evidence。
Date: `2026-05-29T02:09:14+0800`

## Tranche scope

本轮延续 OPL series 文档治理 `/goal`，按上一轮 part 3 的 next write scope 先重查可清理的临时 lane，再做一个低风险 active CLI/help surface 退役。

本轮主写入范围：

- `one-person-lab/src/cli/modules/help-output.ts`
- `one-person-lab/src/cli/cases/private-command-specs.ts`
- `one-person-lab/tests/src/active-path-residue-scan.test.ts`
- 本 OPL 主仓历史 ledger 和 process-plans index

本轮不关闭全局 `/goal`。六仓 `README*` 与 `docs/**/*.md` 的全量逐段覆盖仍未全部完成。

## Repository status snapshot

| Repo | Main state after verification | Worktree / branch state | Notes |
| --- | --- | --- | --- |
| `one-person-lab` | `main` clean with `origin/main` at `f549faf6` before this tranche edits. | Temporary `codex/developer-mode-risk-tier-receipt-20260529` worktree and local branch removed after confirming its Developer Mode risk-tier followthrough facts were already absorbed into `main`. | Current tranche edits are only active CLI/help example retirement plus this ledger. |
| `med-autoscience` | `main` clean and aligned with `origin/main` at `cdc4006a`. | No extra worktree. | No body docs edited this tranche. |
| `med-autogrant` | `main` clean and aligned with `origin/main` at `d0d00fe`. | Temporary `codex/mag-doc-governance-hosted-history-20260529c` worktree and local branch removed after it remained equal to `main`. | No body docs edited this tranche. |
| `redcube-ai` | `main` remains ahead of `origin/main` by 1 with active dirty native-PPT implementation/docs/test changes. | No extra worktree. | Left untouched; this is active external work and not safe to absorb or clean in this tranche. |
| `opl-meta-agent` | `main` clean and aligned with `origin/main` at `096337e`. | No extra worktree. | No body docs edited this tranche. |
| `one-person-lab-app` | `main` clean and aligned with `origin/main` at `d6f60d2`. | Dirty, remote-backed `codex/full-first-run-stable-gate-20260525` worktree retained. | App body docs remain unsafe while the release lane is dirty/unmerged. |

## Stale lane actions

Deleted local lanes:

- `one-person-lab/.worktrees/developer-mode-risk-tier-receipt-20260529` and local branch `codex/developer-mode-risk-tier-receipt-20260529`.
- `med-autogrant/.worktrees/codex/mag-doc-governance-hosted-history-20260529c` and local branch `codex/mag-doc-governance-hosted-history-20260529c`.

Retained with reasons:

- `redcube-ai` dirty native-PPT main lane: active implementation/docs/test changes plus untracked native-PPT helper/test files.
- `one-person-lab-app/.worktrees/codex/full-first-run-stable-gate-20260525`: dirty, remote-backed and unmerged.
- Non-automation or squash-ambiguous remote branches remain deferred to a dedicated branch-cleanup pass with fresh owner context.

## Reviewed documents / sections

| Repo | Reviewed docs / sections | Live truth checked |
| --- | --- | --- |
| `one-person-lab` | Root guidance, `TASTE.md`, OPL Doc Governance skill, active gap/status excerpts for structured workspace binding, CLI help/spec surfaces, active-path residue guard. | Automation memory, prior OPL memory notes, `git status`, `git worktree list`, branch ancestry/equivalence, CodeGraph context for legacy cleanup/action routes, fallow summary, focused CLI/help tests. |
| `med-autogrant` | Worktree lifecycle state only. | git status/worktree equality and branch removal result. |
| Other OPL series repos | Branch/worktree lifecycle state only. | git status/worktree state and doctor shape from this run; body docs not edited. |

## Edited documents and source

| Repo | File | Change |
| --- | --- | --- |
| `one-person-lab` | `src/cli/modules/help-output.ts` | Removed the active root-help example that still recommended explicit RCA `--entry-command "redcube product invoke ..."` and `--manifest-command "redcube product manifest ..."` flags; the example now uses structured binding so OPL derives the product-entry materializer. |
| `one-person-lab` | `src/cli/cases/private-command-specs.ts` | Removed the same legacy explicit RCA direct-entry example from internal command specs. |
| `one-person-lab` | `tests/src/active-path-residue-scan.test.ts` | Added a no-resurrection assertion that root help keeps the structured binding example and does not reintroduce legacy explicit RCA direct-entry / manifest-command flags. |
| `one-person-lab` | `docs/history/process/plans/2026-05-29-opl-series-doc-governance-tranche-ledger-part-4.md` | Added this tranche coverage ledger. |
| `one-person-lab` | `docs/history/process/plans/README.md` | Indexed this ledger as historical provenance. |

## Archived / tombstoned / deleted documents

None. The retired content was an active CLI/help example, not a long-lived document. Domain-owned product-entry manifest fixtures still contain domain command strings where they describe RCA product-entry behavior; this tranche only removed OPL's active recommendation to hand-freeze those commands during workspace binding.

## Verification evidence

| Repo | Verification | Result |
| --- | --- | --- |
| `one-person-lab` | `node --experimental-strip-types --test tests/src/active-path-residue-scan.test.ts tests/src/cli/cases/contracts-help.test.ts tests/src/cli/cases/system-commands.test.ts tests/src/cli/cases/system-management.test.ts` | Passed: 74 tests. |
| `one-person-lab` | `rg -n "workspace bind --project redcube .*--entry-command|workspace bind --project redcube .*--manifest-command|redcube product manifest --workspace-root" src/cli/modules/help-output.ts src/cli/cases/private-command-specs.ts src/cli/cases/public-command-specs.ts tests/src/active-path-residue-scan.test.ts` | Passed by absence: no active help/spec occurrence of the retired explicit RCA binding example. |

## Unreviewed documents

This tranche did not complete whole-portfolio coverage.

- `one-person-lab`: most `README*` and `docs/**/*.md` outside branch/governance ledgers and touched active CLI/help surfaces remain unreviewed in this tranche.
- `med-autoscience`: no new MAS body-doc tranche was performed this run; prior MAS coverage stands.
- `med-autogrant`: P3/P4 rollback/verification history body batch is covered. Remaining higher-risk history body batches include 2026-04-10 / 2026-04-11 / 2026-04-12 hosted-provider-risk records unless already covered by prior date/topic tranche entries.
- `redcube-ai`: content-level README/docs audit remains and should coordinate with the active native-PPT dirty lane.
- `opl-meta-agent`: no new OMA body-doc tranche was performed this run; prior OMA coverage stands.
- `one-person-lab-app`: content-level README/docs audit remains, especially release/user-guide/status docs, after dirty release worktree is merged, cleaned, or explicitly assigned.

## Remaining stale / retire candidates

- Future OPL CLI/help examples that ask users to freeze MAS/MAG/RCA repo-local product/status/manifest wrapper commands during normal structured workspace binding are stale. Normal examples should prefer `opl workspace bind --project <domain> --path <checkout>` plus locator fields such as `--profile` or `--input` when needed, letting OPL derive the current product-entry materializer.
- `legacy-cleanup` remains an active OPL safe-action / cleanup-ledger surface, not a compatibility alias. It should not be deleted unless the cleanup gate itself is replaced and active callers/tests/docs move first.
- RCA dirty native-PPT lane remains active and must be handled by its owner lane before RCA body docs or branch cleanup.
- App `codex/full-first-run-stable-gate-20260525` remains dirty, remote-backed and unmerged.

## Next write scope

1. Continue OPL series whole-docs coverage outside MAS, prioritizing OPL uncovered support docs or MAG 2026-04-10/11/12 hosted-provider history batches.
2. Delay App body docs while the release lane remains dirty/unmerged; delay RCA body docs unless the native-PPT dirty lane is merged or explicitly handed off.
3. For CLI/help cleanup, continue retiring active examples that recommend hand-freezing old repo-local wrappers when the current structured binding / generated materializer path already exists.
4. Keep each verified tranche separate from global completion; the global `/goal` remains open until all 6 repos' `README*` and `docs/**/*.md` are section-reviewed and no unreviewed docs or unresolved stale candidates remain.
