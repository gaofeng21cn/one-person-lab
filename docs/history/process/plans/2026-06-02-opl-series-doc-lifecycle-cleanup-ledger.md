# 2026-06-02 OPL Series Doc Lifecycle Cleanup Ledger

Owner: `One Person Lab`
Purpose: `docs_lifecycle_cleanup_ledger`
State: `history_provenance`
Machine boundary: 本文是人读 closeout ledger。当前 truth 继续归各 repo 核心五件套、single Active Truth plans、contracts、source、CLI/read-model、runtime ledger、provider receipt、domain-owned manifests、tests 和真实 App evidence。
RUN_SNAPSHOT_TS: `2026-06-02T16:42:53+0800`

## Scope

本轮按 OPL family 文档生命周期治理要求，结合只读 subagent 审计和主会话 live git/worktree 状态，清理 active docs 中已经退化成 process ledger、closed foldback record 或 history-only coverage tranche 的内容。

不改变 source、contracts、tests、runtime surface、domain truth、owner receipt、artifact authority、memory body 或 App product truth。Docs-only 改动只处理生命周期、路径归位和 current owner 边界。

## Live Safety Snapshot

| Repo | Root state | Lifecycle action |
| --- | --- | --- |
| `one-person-lab` | clean root；另有并行 `codex/module-package-channel-20260602` worktree，未触碰。 | 补强 docs lifecycle policy 和 history index header；记录本轮 closeout。 |
| `med-autoscience` | clean root；本轮独立 docs lifecycle worktree。 | 将 closed `state_contract_thinning` foldback record 从 active 移入 `docs/history/program/`；active 层只保留 guard 和 current owner refs。 |
| `med-autogrant` | clean root；本轮独立 docs lifecycle worktree。 | 将 `docs/docs_portfolio_consolidation.md` 的 dated coverage ledger 移入 `docs/history/docs-portfolio-coverage-ledger/`；active governance 只保留 current lifecycle rules。 |
| `redcube-ai` | root ahead/behind with no dirty files；本轮独立 docs lifecycle worktree。 | 将 active governance 中的 dated RCA coverage/process ledger 移入 `docs/history/process/`；active governance 只保留 current lifecycle rules。 |
| `opl-meta-agent` | clean root；本轮独立 docs lifecycle worktree。 | 将 OMA dated coverage tranche / folded tranche history 移入 `docs/history/process/`；active governance 只保留 current coverage state 与 reopening conditions。 |
| `one-person-lab-app` | root has active GUI/release/product contract dirty changes and two existing App worktrees. | Only read-only audit was accepted. No App file was edited in this tranche to avoid overwriting concurrent App product authority work. |

## Applied Cleanup

- OPL root policy now states single-document responsibility explicitly: target state, current truth, active plan, proof ledger, runbook and history narrative must not co-exist as one long-lived document role.
- OPL history indexes now carry owner / purpose / state / machine-boundary headers, including the OMX tombstone index.
- MAS active docs no longer list a closed control-plane thinning foldback record as an active default entry. The current behavior contract remains in status, gap plan, current-development-lines, runtime projection docs, contracts/source and focused tests; the old foldback record is history/provenance.
- MAG, RCA and OMA active docs governance files no longer carry proof-by-proof historical coverage ledgers. They keep current lifecycle rules and point to precise history owners for the archived ledgers.

## Deferred App Cleanup

The App audit found real doc-role conflicts around `docs/status.md`, `docs/active/app-ideal-state-gap-plan.md`, GUI feature inventory, candidate verification, release/testing docs and current Runtime wording. Those files are concurrently dirty in the App root and related worktrees, together with App-owned contracts and release validators.

Because the App repo is the sole GUI product authority, this tranche does not edit those files from an external docs-cleanup lane. Next App-owned tranche should start from the current App dirty state, preserve user/concurrent changes, and then:

1. Align project/invariants Runtime wording with the current `running activity first, project refs second` contract.
2. Move dated release/candidate evidence logs from status/gap/inventory into App history or evidence ledgers.
3. Decide the final owner for the untracked element-level GUI audit before adding it as a long-lived document.
4. Keep GUI ideal spec, Codex-to-App delta, feature inventory and candidate runbook as separate single-purpose owners.

## Completion Boundary

This tranche closes only the document lifecycle cleanup items listed above. It does not claim:

- every App docs conflict has been edited;
- MAS/MAG/RCA/OMA production evidence tails are closed;
- active docs are free of all future stale content;
- any domain repo source/interface/test/workflow is physically retired;
- any domain ready, App release ready or production ready state.

Future docs governance should continue using the current policy: active docs keep `owner / current state / evidence gate / next action`; dated coverage, branch/worktree closeout, receipt proof and historical long tables go to `docs/history/**`.
