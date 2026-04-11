# OPL Phase 2 Admitted-Domain Delta Intake Refresh

> 历史说明（2026-04-11 OMX offboarding）：本文件保留为历史/迁移参考，不作为当前活跃执行入口。

状态锚点：`2026-04-11`

## 这是什么

这是 `opl_phase_2_central_reference_sync_board` 的第一条 activation package。
它的 machine-readable package id 固定为 `phase_2_admitted_domain_delta_intake_refresh`。

它只负责一件事：

- 把最新 absorbed admitted-domain delta 先同步进中央 reference surfaces，
- 让后续 wording sync、OMX handbook sync 与 regression refresh 有同一个最新起点。

## 当前要 intake 的 absorbed delta

### 1. `RedCube AI`

- latest absorbed commit：`9cfe58b`
- 当前 absorbed tranche：`Phase 2 / runtime watch locator integrity hardening`
- 中央 sync 最小要求：
  - 不再把 `workspace / operator quickstart convergence` 写成最新 absorbed tranche
  - 要把 `runtimeWatch` quartet locator fail-closed 与 `topic_id / deliverable_id` durable identity 作为最新 absorbed delta 写回中央参考面

### 2. `MedAutoScience`

- latest absorbed commit：`5366d18`
- 当前 repo-side 仍停在 `EXTERNAL_RUNTIME_DEPENDENCY_BLOCKED_AFTER_ABSORB`
- 中央 sync 最小要求：
  - 不再把 `7444000` 写成 repo-side hardening 的最新 absorbed edge
  - 要把 publication-gate routing / premature completion / managed supervisor watch 的 follow-on truth 写回中央参考面
  - 同时继续保持 external runtime / workspace gate 未清除的停车结论

## 当前只允许修改的中央文件

- `docs/references/contract-convergence-v1-execution-board.md`
- `docs/references/ecosystem-status-matrix.md`
- `docs/references/runtime-alignment-taskboard.md`
- `docs/references/omx-longrun-prompt-playbook.md`
- `docs/references/opl-phase2-ecosystem-sync-owner-line.md`

## 不允许做的事

- 不因为 intake refresh 就改写 `OPL` public authority
- 不因为 `MedAutoGrant` 当前有新 truth 就把它 admission 成 domain
- 不把这条 refresh 写成 routed-action runtime 许可
- 不把 central sync 写成 managed web runtime / shared core 路线图

## 成功标准

- 中央执行板、状态矩阵、任务板、提示词模板都能准确指向 `RedCube AI` 与 `MedAutoScience` 的当前 absorbed truth
- `Grant Foundry -> Med Auto Grant` 继续保持 signal-only / non-admitted wording
- closeout 后可以继续顺着 board 进入下一条 wording sync tranche；如果没有后续漂移，也可以直接 honest stop
