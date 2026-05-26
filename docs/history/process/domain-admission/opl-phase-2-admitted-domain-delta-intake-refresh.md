# Historical Admitted-Domain Delta Intake Refresh

Owner: `One Person Lab`
Purpose: `historical_admitted_domain_delta_intake_record`
State: `history_only`
Machine boundary: 本文只保存早期 admitted-domain delta intake 的历史 package。当前 admitted-domain truth、runtime readiness 和 production evidence 继续归核心五件套、`docs/active/current-state-vs-ideal-gap.md`、contracts、CLI/read-model 与 domain-owned manifests / receipts。

> 历史说明：本文件保留为参考级 tranche 记录。OMX 已退出当前 OPL 开发环境；本文件不得再作为提示词、长跑手册或 worktree 入口使用。

状态锚点：`2026-05-02`

## 历史定位

这是当时 `opl_phase_2_central_reference_sync_board` 的第一条 activation package。
它当时的 machine-readable package id 固定为 `phase_2_admitted_domain_delta_intake_refresh`。

它只负责一件事：

- 把当时最新 absorbed admitted-domain delta 先同步进中央 reference surfaces，
- 让后续 wording sync、历史迁移参考清理与 regression refresh 有同一个当时起点。

## 当时要 intake 的 absorbed delta

### 1. `RedCube AI`

- 当时 latest absorbed commit：`c124c5d`
- 当时 absorbed 主线锚点：已经不再只是 `Phase 2 / runtime watch locator integrity hardening`；当时 repo-tracked truth 已推进到 upstream runtime-owner cutover 与 `Repo-Verified Product Entry And OPL Federation`
- 中央 sync 最小要求：
  - 不再把 `RedCube AI` 写成 upstream pilot prep、待吸收默认执行器，或只停留在 quickstart provenance
  - 要把 upstream runtime-owner cutover、`redcube product frontdoor`、federated product entry、session continuity、family manifest companion，以及当时 latest `product_entry_readiness` companion 一并写回中央参考面

### 2. `MedAutoScience`

- 当时 latest absorbed commit：`6c64264`
- 当时 repo-side 仍停在 `EXTERNAL_RUNTIME_DEPENDENCY_BLOCKED_AFTER_ABSORB`
- 中央 sync 最小要求：
  - 不再把 `5366d18` 单独写成 repo-side hardening 的最新 absorbed edge
  - 要把 `9b5cea8` 的 verification surface 分层、`7ee19a8` 的 runtime/workspace repair priorities，以及 `6c64264` 的 workflow entry migration back to repo-tracked truth，一并写回中央参考面
  - 同时继续保持 external runtime / workspace gate 未清除的停车结论

## 当时只允许修改的中央文件

- `docs/references/contract-convergence-v1-execution-board.md`
- `docs/history/process/convergence-governance/ecosystem-status-matrix-2026-04.md`
- `docs/references/runtime-alignment-taskboard.md`
- `docs/references/opl-phase2-ecosystem-sync-owner-line.md`

## 当时不允许做的事

- 不因为 intake refresh 就改写 `OPL` public authority
- 不因为 `MedAutoGrant` 当时有新 truth 就把它 admission 成 domain
- 不把这条 refresh 写成 routed-action runtime 许可
- 不把 central sync 写成 managed web runtime / shared core 路线图

## 当时成功标准

- 中央执行板、状态矩阵、任务板都能准确指向 `RedCube AI` 与 `MedAutoScience` 的当时 absorbed truth
- `Grant Foundry -> Med Auto Grant` 继续保持 signal-only / non-admitted wording
- closeout 后可以继续顺着 board 进入下一条 wording sync tranche；如果没有后续漂移，也可以直接 honest stop
