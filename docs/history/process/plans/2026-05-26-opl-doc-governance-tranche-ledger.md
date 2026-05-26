# 2026-05-26 OPL Doc Governance Tranche Ledger

Owner: `One Person Lab`
Purpose: `docs_governance_tranche_ledger`
State: `history_provenance`
Machine boundary: 本文是人读 coverage ledger。当前 truth 继续归核心五件套、`docs/active/current-state-vs-ideal-gap.md`、contracts、source、CLI/read-model、runtime ledger、provider receipt、domain-owned manifest 和真实 App evidence。
Date: `2026-05-26`

## Tranche scope

本轮只覆盖 OPL 主仓的 docs-governance 切片，目标是校准 fresh read-model 已漂移的 evidence-worklist 读法，并留下多仓 coverage ledger。其他 OPL series repo 当前存在未提交改动、近期写入或外部活跃 worktree，因此本轮只做只读状态判定，不吸收、不删除、不重写。

## Reviewed documents / sections

| Repo | Reviewed docs / sections | Live truth checked |
| --- | --- | --- |
| `one-person-lab` | `AGENTS.md`、`TASTE.md`、`docs/docs_portfolio_consolidation.md`、`docs/active/current-state-vs-ideal-gap.md` 的当前完成进度与 next-round prompt、`docs/status.md` 的 evidence-worklist / payload-required 语义段、`docs/history/process/plans/README.md`、本目录既有 2026-05 process ledger。 | `opl_doc_doctor.py doctor /Users/gaofeng/workspace/one-person-lab --format json`、`opl framework readiness --family-defaults --json`、`opl agents conformance --family-defaults --json`、`opl runtime app-operator-drilldown --json`、`opl family-runtime evidence-worklist --family-defaults --provider temporal --executor-kind codex_cli --detail full --json`、git worktree / branch / dirty-state checks。 |
| `med-autoscience` | Worktree / branch state only. | Multiple dirty worktrees remain active or externally owned; no docs edited. |
| `med-autogrant` | Branch status only. | Main is ahead of origin; no extra stale worktree found in this pass; no docs edited. |
| `redcube-ai` | Root dirty-state only. | Root checkout has broad unrelated source/docs changes and an untracked screenshot; no docs edited. |
| `opl-meta-agent` | Branch status only. | Main is ahead of origin; no docs edited. |
| `one-person-lab-app` | Root/worktree dirty-state only. | Root and two codex worktrees contain uncommitted changes; no docs edited. |

## Edited documents

| File | Change |
| --- | --- |
| `docs/active/current-state-vs-ideal-gap.md` | Replaced stale zero-open worklist numbers with fresh 2026-05-26 readings: `open_worklist_item_count=2`, `open_safe_action_payload_required_item_count=2`, `open_safe_action_payload_free_item_count=0`, `external_evidence_item_count=10`, `domain_ready_authorized=false`, `production_ready_authorized=false`; also recorded readiness attention split `hard_blocker_count=0`, `operator_actionable_attention_tail_count=2`, `operator_payload_required_attention_tail_count=2`, `operator_payload_free_attention_tail_count=0`. |
| `docs/status.md` | Reworded the `open_worklist_item_count=0` paragraph into a dynamic-read rule so status no longer freezes an instantaneous worklist count as durable truth. |
| `docs/history/process/plans/2026-05-26-opl-doc-governance-tranche-ledger.md` | Added this coverage ledger for the current tranche. |

## Archived / tombstoned / deleted documents

None. This tranche corrected active-truth drift and created a history ledger only.

## Unreviewed documents

This tranche did not complete whole-portfolio coverage. Remaining unreviewed scope includes:

- `one-person-lab`: most `README*` and `docs/**/*.md` outside the sections listed above.
- `med-autoscience`: all `README*` and `docs/**/*.md` content-level audit remains, excluding worktree status triage.
- `med-autogrant`: all `README*` and `docs/**/*.md` content-level audit remains, excluding branch status triage.
- `redcube-ai`: all `README*` and `docs/**/*.md` content-level audit remains, excluding root dirty-state triage.
- `opl-meta-agent`: all `README*` and `docs/**/*.md` content-level audit remains, excluding branch status triage.
- `one-person-lab-app`: all `README*` and `docs/**/*.md` content-level audit remains, excluding root/worktree status triage.

## Remaining stale / retire candidates

- No new stale doc was proven safe to archive or delete in this tranche.
- `one-person-lab` still needs portfolio-level section audit across active/support/history docs, especially any text that freezes live read-model counters.
- Other repos must be rechecked after active dirty lanes settle; dirty worktrees cannot be treated as stale solely by commit age.

## Next write scope

Next tranche should start from fresh worktree/dirty-state checks, then choose either:

1. `one-person-lab` portfolio continuation: audit remaining `README*` and `docs/**/*.md` sections for frozen counters, historical proof leakage, and single-owner metadata.
2. A repo whose main checkout and worktrees are clean or explicitly owned by the automation: audit its ideal-state reference plus Active Truth plan first, then fold stale support/history docs into canonical owners.

Completion still requires all 6 repos' `README*` and `docs/**/*.md` to be section-reviewed, with no unreviewed docs and all remaining gaps either closed or carried into the next-round Agent prompt.
