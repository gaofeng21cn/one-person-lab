# 2026-05-29 OPL Series Doc Governance Tranche Ledger Part 5

Owner: `One Person Lab`
Purpose: `docs_governance_tranche_ledger`
State: `history_provenance`
Machine boundary: 本文是人读 coverage ledger。当前 truth 继续归各 repo 核心五件套、single Active Truth plans、contracts、source、CLI/read-model、runtime ledger、provider receipt、domain-owned manifests、tests 和真实 App evidence。
Date: `2026-05-29T02:40:00+0800`

## Tranche scope

本轮延续 OPL series 文档治理 `/goal`，从 automation memory 和 fresh 六仓 scan 接续。主要处理 OPL active docs 中 MAS domain-dispatch read-model 快照漂移：上一段未提交文案仍写成 zero-open worklist，但 fresh `family-runtime evidence-worklist` 与 `framework readiness` 已重新暴露 1 个 MAS payload-required domain-dispatch workorder。

本轮主写入范围：

- `one-person-lab/docs/status.md`
- `one-person-lab/docs/active/current-state-vs-ideal-gap.md`
- 本 OPL 主仓历史 ledger 和 process-plans index

本轮不关闭全局 `/goal`。六仓 `README*` 与 `docs/**/*.md` 的全量逐段覆盖仍未全部完成。

## Repository status snapshot

| Repo | Main state before edits | Worktree / branch state | Notes |
| --- | --- | --- | --- |
| `one-person-lab` | `main` aligned with `origin/main` at `bcfd5485`, with pre-existing dirty docs in `docs/status.md` and `docs/active/current-state-vs-ideal-gap.md`. | No extra OPL worktree. | Dirty docs were currentness foldback text and were corrected against fresh read-model output. |
| `med-autoscience` | `main` clean and aligned with `origin/main` at `cdc4006a`. | Dirty implementation worktree `codex/dm003-dispatch-currentness` retained. | Not touched; it contains source/test changes and an untracked controller file. |
| `med-autogrant` | `main` clean and aligned with `origin/main` at `d0d00fe`. | No extra worktree. | No body docs edited this tranche. |
| `redcube-ai` | `main` clean but ahead of `origin/main` by 2 native-PPT commits at `e4c1d49`. | No extra worktree. | Left untouched; ahead commits are native-PPT implementation work outside this OPL docs tranche. |
| `opl-meta-agent` | `main` clean and aligned with `origin/main` at `096337e`. | No extra worktree. | No body docs edited this tranche. |
| `one-person-lab-app` | `main` clean and aligned with `origin/main` at `d6f60d2`. | Dirty remote-backed `codex/full-first-run-stable-gate-20260525` worktree retained. | App body docs remain unsafe while the release lane is dirty/unmerged. |

## Fresh live truth inputs

- Six-repo OPL Doc Governance doctor sweep returned `finding_count=0` and active truth `pass` for all six repos.
- Fresh `opl family-runtime evidence-worklist --family-defaults --provider temporal --executor-kind codex_cli --detail full --json` returned:
  - `open_worklist_item_count=1`
  - `open_safe_action_payload_required_item_count=1`
  - `open_safe_action_payload_free_item_count=0`
  - `domain_dispatch_evidence_workorder_count=1`
  - `stage_receipt_freshness_open_workorder_count=0`
  - `closed_refs_only_item_count=307`
  - `domain_dispatch_evidence_receipt_item_count=267`
  - `domain_ready_authorized=false`
  - `production_ready_authorized=false`
- The open domain-dispatch workorder is MAS `sat_55e36b0dbf2b609fb33329db`, action `domain_dispatch:medautoscience:sat_55e36b0dbf2b609fb33329db:record`, stage `domain_owner/default-executor-dispatch`, study `003-dpcc-primary-care-phenotype-treatment-gap`, action type `run_quality_repair_batch`.
- Fresh `opl framework readiness --family-defaults --json` summary returned `operator_actionable_attention_tail_count=1`, `operator_payload_required_attention_tail_count=1`, `operator_payload_free_attention_tail_count=0`, `evidence_envelope_open_count=1`, `evidence_envelope_blocked_count=513`, `domain_dispatch_attention_count=11`, and `domain_blocked_attention_tail_count=524`.
- `opl runtime action execute --action domain_dispatch:medautoscience:sat_55e36b0dbf2b609fb33329db:record --dry-run` with an empty payload returned a blocked preflight: missing `domain_receipt_refs_or_typed_blocker_refs_or_owner_chain_refs_or_no_regression_refs`. The route is current/default-actionable but requires domain/App/live owner refs or a domain-owned typed blocker.

## Fresh semantic result

- The earlier MAS 2026-05-29 foldback remains valid as historical coverage: OPL verified three MAS domain-dispatch typed-blocker receipts for `sat_ad741309cc05d5a261551a4e`, `sat_ca911a95f094f8c6fa7fb4e0`, and `sat_56ccb7a51946c12b59e09ee9`, and did not write OPL payload for `sat_d4886f8a7fb00b136bfe9f47`.
- The fresh current read-model no longer supports freezing the status/gap plan as zero-open. Current truth is a payload-required MAS open workorder for `sat_55e36b0dbf2b609fb33329db`.
- The open route only proves that OPL refs-only accounting is waiting for MAS domain/App/live owner refs or a typed blocker. It does not grant OPL authority to generate owner receipt, typed blocker, owner-chain ref, no-regression ref, domain ready, production ready, paper closure, artifact authority, monitor freshness, App release/user path or long-soak evidence.

## Reviewed documents / sections

| Repo | Reviewed docs / sections | Live truth checked |
| --- | --- | --- |
| `one-person-lab` | `docs/status.md` MAS domain-dispatch currentness paragraph; `docs/active/current-state-vs-ideal-gap.md` MAS real paper chain evidence row; process-plans history index. | `git status`, six-repo doctor, `family-runtime evidence-worklist`, `framework readiness`, `runtime action execute` dry-run for the open MAS route. |
| Other OPL series repos | Branch/worktree lifecycle state only. | git status/worktree state and doctor shape; body docs not edited. |

## Edited documents

| Repo | File | Change |
| --- | --- | --- |
| `one-person-lab` | `docs/status.md` | Replaced the stale zero-open MAS worklist snapshot with current live counts and the open `sat_55e36b0dbf2b609fb33329db` payload-required route. |
| `one-person-lab` | `docs/active/current-state-vs-ideal-gap.md` | Updated the MAS real paper chain evidence row to carry the same current open route while keeping the authority boundary explicit. |
| `one-person-lab` | `docs/history/process/plans/2026-05-29-opl-series-doc-governance-tranche-ledger-part-5.md` | Added this tranche coverage ledger. |
| `one-person-lab` | `docs/history/process/plans/README.md` | Indexed this ledger as historical provenance. |

## Archived / tombstoned / deleted documents

None. This was a currentness correction and coverage ledger tranche; no long-lived doc was archived, tombstoned or deleted.

## Unreviewed documents

This tranche did not complete whole-portfolio coverage.

- `one-person-lab`: most `README*` and `docs/**/*.md` outside the touched status/gap sections and process history index remain unreviewed in this tranche.
- `med-autoscience`: no new MAS body-doc tranche was performed; dirty owner lane `codex/dm003-dispatch-currentness` remains outside this tranche.
- `med-autogrant`: no new MAG body-doc tranche was performed; MAG 2026-04-10 / 2026-04-11 / 2026-04-12 hosted-provider history batches remain candidate scopes unless already covered by a future exact tranche.
- `redcube-ai`: content-level README/docs audit remains and should coordinate with the native-PPT ahead commits.
- `opl-meta-agent`: no new OMA body-doc tranche was performed.
- `one-person-lab-app`: content-level README/docs audit remains, especially release/user-guide/status docs, after dirty release worktree is merged, cleaned or explicitly assigned.

## Remaining stale / retire candidates

- Any active doc that freezes `open_worklist_item_count=0` or `domain_dispatch_evidence_workorder_count=0` after the fresh `sat_55e36b0dbf2b609fb33329db` route is stale.
- Any prose implying that an open MAS refs-only workorder lets OPL generate MAS owner receipt, typed blocker, owner-chain ref, no-regression ref, paper closure, domain ready or production ready is stale pollution.
- Dirty owner lanes remain deferred: MAS `codex/dm003-dispatch-currentness`, App `codex/full-first-run-stable-gate-20260525`, and RCA native-PPT ahead commits.

## Next write scope

1. Start with another fresh six-repo scan and read-model check.
2. If `sat_55e36b0dbf2b609fb33329db` remains open, either leave it as owner-payload-required attention or explicitly route through MAS domain/App/live owner payload; do not self-close from OPL.
3. Continue OPL uncovered support-doc paragraph coverage or MAG hosted-provider history batches.
4. Keep App full-first-run and RCA native-PPT body docs deferred unless explicitly assigned or clean/inactive.
5. Keep global `/goal` active until all 6 repos' `README*` and `docs/**/*.md` are section-reviewed and no unreviewed docs or unresolved stale candidates remain.
