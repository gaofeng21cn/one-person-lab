# OMX 长线提示词模板库

状态锚点：`2026-04-10`

## 文档目的

这份文档把四仓当前可直接复用的 `OMX` 长线提示词沉淀成仓库跟踪模板。

它解决两件事：

1. 不再让“下一棒该开什么”只存在于聊天记录里
2. 让四仓默认采用同一套“同一棒内自动收口”写法，而不是每次临时重写

## 与其他文档的关系

- 这份文档是“可复制的提示词模板库”
- [`omx-stage-gated-longrun-guide.md`](./omx-stage-gated-longrun-guide.md) 是“统一门控规则”
- 各仓 `AGENTS.md`、`contracts/project-truth/AGENTS.md`、`CURRENT_PROGRAM.md`、active reports 始终高于本模板库

换句话说：

- 这份文档负责提供当前可发给 `OMX` 的标准写法
- 它不是新的 phase owner
- 它不是新的 runtime truth surface
- 它也不替代各仓自己的当前程序真相

## 使用规则

每次复制模板前，先做四件事：

1. 读取目标仓的 `AGENTS.md`、`project-truth`、`CURRENT_PROGRAM.md`
2. 确认当前唯一 active mainline 与当前 tranche
3. 确认当前工作区状态、验证命令与 reports 路径
4. 若仓内当前真相与本模板冲突，以仓内当前真相为准，并在本仓后续同步更新本模板库

另外必须固定两条运行纪律：

1. 重型 `OMX` 长线一律在独立 `git worktree` 中运行；根工作区只负责规划、吸收、推送、清理与文档同步，不承载并行重型执行。
2. 如果本地 `.omx/context/CURRENT_PROGRAM.md` 落后于 repo-tracked truth，先同步本地控制面到当前 repo-tracked 真相，再继续实现与 closeout。

## 统一通用前缀

下面这段是四仓都可复用的默认前缀。

```text
你现在在 <repo> 仓库，按“同一棒内自动收口”执行。

统一口径：
- OPL = Gateway / Federation
- 三个业务仓 = Domain Harness OS
- 共享基座 = Unified Harness Engineering Substrate
- 当前本地默认形态 = Codex-default host-agent runtime
- 开发控制面 = Codex Host / Codex App 负责规划冻结，OMX 负责长时执行

执行规则：
0. 必须在独立 worktree 中执行；root checkout 只负责 absorb / push / cleanup / central sync，不直接承载重型长线实现。
1. 先读取仓内 AGENTS.md、contracts/project-truth/AGENTS.md、CURRENT_PROGRAM.md、LATEST_STATUS.md、OPEN_ISSUES.md、ITERATION_LOG.md 与当前 tranche 对应 specs / plans / docs。
2. 在当前 tranche / same-phase 内，只要 hard gates 通过，就自动继续完成 review -> manual test -> commit -> absorb。
3. 每完成一个阶段动作，都要同步 CURRENT_PROGRAM、LATEST_STATUS、OPEN_ISSUES 与必要的 repo-tracked truth surface。
4. 不得把开发控制面成熟度误写成产品 runtime 成熟度。
5. 不得越过当前 frozen phase / tranche 边界偷跑下一阶段。
6. 如果发现本地 `.omx/**` 控制面落后于 repo-tracked truth，先修正本地控制面，再继续 write-set。

只有以下情况才允许停车询问：
1. 需要破坏性 git 操作
2. frozen truth 冲突且无法在现有合同内裁决
3. 需要显式 phase promotion 或新增 formal entry / runtime surface
4. 需要仓库外输入、授权或凭据
```

## 当前模板

下面四份模板都是“当前推荐模板”，不是永久不变的全局真相。
当任一仓切 phase、切 tranche、或 closeout 后，应同步回写本文件。

### 1. one-person-lab

当前推荐用途：

- 当 admitted-domain 业务仓有新的 absorbed repo-tracked truth 后，作为中央 sync owner 继续收紧 `Phase 2` 顶层 federation wording 与四仓中央参考面

```text
你现在在 one-person-lab 仓库，按“同一棒内自动收口”执行。

先读：
- AGENTS.md
- contracts/project-truth/AGENTS.md
- .omx/context/CURRENT_PROGRAM.md
- docs/roadmap.zh-CN.md
- docs/references/opl-phase2-ecosystem-sync-owner-line.md
- docs/references/ecosystem-status-matrix.md
- docs/references/contract-convergence-v1-execution-board.md
- docs/references/runtime-alignment-taskboard.md
- docs/references/omx-longrun-prompt-playbook.md
- docs/references/opl-gateway-rollout.zh-CN.md
- docs/references/opl-gateway-acceptance-test-spec.zh-CN.md
- contracts/opl-gateway/minimal-admitted-domain-federation-activation-package.json
- contracts/opl-gateway/README.zh-CN.md
- README.zh-CN.md

任务目标：
作为 admitted-domain federation 的中央 sync owner，在当前 evidence boundary 内继续同步顶层 federation wording、四仓状态总表、执行板、任务板与提示词模板，但不把 OPL 写成 runtime owner。

必须完成：
1. 先判断 admitted-domain 是否已经出现新的 repo-tracked absorbed delta，或 OPL 中央参考面是否发生真实漂移。
2. 如果没有新增 delta，也没有中央漂移，就诚实停车，不编造新 tranche。
3. 如果存在真实 delta，只同步中央 reference surfaces 与最小必要的 docs/contracts/tests。
4. 每个 same-mainline slice 都先更新 machine-readable / repo-tracked truth，再更新 README / docs / tests。
5. 保持 `CLI-first / read-only` formal entry、no-bypass、candidate-domain blocked truth、signal-only `Grant Ops` wording 一致。
6. 若本轮 sync 收口且验证全绿，就直接 commit-closeout -> absorb to main。

硬边界：
- 不 admission 新 domain
- 不新增 G2 / G3 readiness
- 不实现 routed-action runtime
- 不把 OPL 写成 runtime owner / mutation gateway / shared execution core
- 不把 `Grant Foundry -> Med Auto Grant` 从 signal-only 擅自提升成 admitted domain
- 不把 Unified Harness Engineering Substrate 写成共享代码框架

验证要求：
- npm run lint
- npm run typecheck
- npm run build
- npm test
- git diff --check
- 用 rg 复核 runtime owner / no-bypass / signal-only / candidate-domain / G2 / G3 / handoff-ready 等关键口径没有漂移

结束状态：
- 有真实 delta 时：优先自动收口到 ready to commit / commit closeout / absorbed to main
- 无真实 delta 时：停在 honest stop，不升格为 runtime owner
```

### 2. med-autoscience

当前推荐用途：

- 当前不推荐新开“runtime 架构继续推进”型 owner line；主线保持 external gate truth，由人工真实项目测试驱动。若要开新线，只建议：
  1. `medical display` rolling hardening / visual audit；
  2. 已通过人工测试打出的具体 repo-side bugfix worktree，并先对齐 `docs/manual_runtime_stabilization_checklist.md`、`docs/external_runtime_dependency_gate.md` 与 `docs/agent_runtime_interface.md`。

```text
med-autoscience 当前主线不适合继续自动打开新的 runtime architecture tranche。
如果任务不是 display-only hardening 或人工测试已明确定位的 repo-side bugfix，请不要在本仓开启新的 heavy OMX mainline。
若确有 repo-side bugfix，先对齐当前已 absorbed truth：manual stabilization checklist 已冻结；runtime_watch heartbeat / auto-recovery、closure handoff-ready bundle 识别、以及 publication gate 未 clear 时拒绝 premature completion 都已经进入 repo-side hardening 基线。不要把这些已 landed truth 重新写成新的 architecture tranche。
```

### 3. redcube-ai

当前推荐用途：

- `Phase 2 / workspace operator quickstart convergence` 已吸收后，只在出现新的 same-mainline concrete delta 时继续；不得再把 quickstart 当作等待 freeze 的下一棒

```text
你现在在 redcube-ai 仓库，按“同一棒内自动收口”执行。

先读：
- AGENTS.md
- contracts/project-truth/AGENTS.md
- .omx/context/CURRENT_PROGRAM.md
- .omx/reports/redcube-runtime-program/LATEST_STATUS.md
- .omx/reports/redcube-runtime-program/OPEN_ISSUES.md
- .omx/reports/redcube-runtime-program/ITERATION_LOG.md
- contracts/runtime-program/current-program.json
- docs/README.md
- docs/policies/runtime_operating_model.md
- docs/human_quickstart.md
- docs/phase_2_source_readiness_deep_research_trigger_gate_convergence.md
- docs/phase_2_workspace_operator_quickstart_convergence.md

任务目标：
在同一个 `redcube-runtime-program` 主线内，先确认当前 main 已吸收到 `Phase 2 / workspace operator quickstart convergence`，并包含 `fd01266` quickstart test alignment；随后只在存在新的、已可诚实冻结的 same-mainline concrete delta 时继续推进。

必须完成：
1. 先确认 `contracts/runtime-program/current-program.json`、README/docs 与 reports 都把 quickstart 写成当前 absorbed tranche，而不是 future brief。
2. 保持 `workspace doctor -> source intake / source research -> deliverable create -> deliverable audit -> deliverable run` 的 repo-verified quickstart route 与 `planning_ready` gate 对齐；其中 `workspace doctor` 只做诊断，brand-new workspace 的 bootstrap writer 仍是 `source intake / source research`（`run_source_intake` / `source research`），不是独立 workspace-init surface。
3. 保持 `auditDeliverable / runtimeWatch / getReviewState / getPublicationProjection` 的同轴语义，以及 `xiaohongshu` human publication 边界。
4. `619415f` 的 `phase_2_operator_surface_consistency_hardening` 仍未 absorbed；在 verification 过关并 absorbed to main 之前，不得把它写成 current truth。
5. 若发现新的 concrete hostedization-prep / contract-export delta，必须先 freeze 到 active truth，再进入 implement -> verify -> review-closeout -> commit-closeout -> absorb。
6. 若没有新的 honest delta，就停车在 honest stop；不得把 quickstart 重新写成未冻结 blocker。

硬边界：
- 不把 controller 写成正式入口
- 不推进 paper poster / conference poster academic contract
- 不新增 family / overlay
- 不把 xiaohongshu 改写成 direct-delivery
- 不扩大 OPL federation / managed web runtime / controller expansion
- 不抽统一执行内核

验证要求：
- git diff --check
- npm run typecheck
- node --test tests/workspace-operator-quickstart.test.js tests/source-intake.test.js tests/source-research.test.js tests/deliverable-review-loop.test.js tests/phase-2-source-readiness-deep-research-trigger-gate-convergence.test.js tests/source-readiness-deep-research-gate.test.js tests/phase-2-behavior-convergence.test.js
- npm test

结束状态：
- 若形成新的 honest delta，则自动收口到 ready to commit / commit closeout / absorbed to main
- 若当前无 honest delta，则停在 `NO_NEW_REDCUBE_QUICKSTART_DELTA_HONEST_STOP`，不自动编造 hosted runtime、family parity 或 full autopilot
```

### 4. med-autogrant

当前推荐用途：

- 在本地 `R1 -> R5` runtime ladder 已吸收到 `R5.A` 后，打开 `post-R5A local runtime hardening`

```text
你现在在 med-autogrant 仓库，按“同一棒内自动收口”执行。

先读：
- AGENTS.md
- contracts/project-truth/AGENTS.md
- .omx/context/CURRENT_PROGRAM.md
- .omx/context/PROGRAM_ROUTING.md
- .omx/plans/spec-program-operating-model.md
- .omx/plans/prd-med-autogrant-mainline.md
- .omx/plans/test-spec-med-autogrant-mainline.md
- .omx/plans/implementation-med-autogrant-mainline.md
- README.zh-CN.md
- docs/specs/2026-04-08-runtime-first-productization-program.md
- docs/specs/2026-04-08-runtime-first-r1-to-r5-boundary-map.md
- docs/specs/2026-04-07-formal-entry-matrix-current-truth.md
- docs/specs/2026-04-07-durability-model-clarification.md
- docs/specs/2026-04-09-r3a-machine-applicable-revision-mutation-contract.md
- docs/specs/2026-04-09-r4a-final-freeze-and-export-package-activation-package.md
- docs/specs/2026-04-09-r5a-hosted-friendly-session-boundary-activation-package.md
- docs/specs/2026-04-09-post-r5a-local-runtime-hardening-brief.md
- .omx/reports/med-autogrant-mainline/LATEST_STATUS.md
- .omx/reports/med-autogrant-mainline/OPEN_ISSUES.md
- .omx/reports/med-autogrant-mainline/ITERATION_LOG.md

任务目标：
在 `R3.A / R4.A / R5.A` 已 landed 的前提下，继续把本地 `CLI-first + host-agent` runtime 收紧成更诚实、更可操作的 local product baseline，但不进入 actual hosted runtime 或 `P5`。已 absorbed 的 canonical walkthrough / output consistency、revised-workspace validator / operator alignment、以及 root `CURRENT_PROGRAM.program_id` fail-closed guard 都视为前置 current truth，不再重开为 open delta。

必须完成：
1. 先按 `docs/specs/2026-04-09-post-r5a-local-runtime-hardening-brief.md` 判断当前 post-R5A delta 是否具体、可验证、仍在本地 runtime hardening 边界内。
2. 先确认当前 delta 没有回退已 absorbed 的 canonical walkthrough / output consistency、revised-workspace validator / operator alignment，以及 `build-hosted-contract-bundle` 对 root `CURRENT_PROGRAM.program_id` 的 fail-closed 校验。
3. 若存在新的 honest delta，再同步 README / docs / command matrix / operator walkthrough 到已 landed 的本地命令面：`run-local`、`resume-local`、`build-artifact-bundle`、`execute-revision-pass`、`build-final-package`、`build-hosted-contract-bundle`。
4. 保持 `grant_run_id / workspace_id / draft_id / program_id`、checkpoint 语义、formal entry matrix 与 hostedization boundary 不漂移。
5. 若 hard gates 通过，就自动完成 freeze -> implement -> verify -> review-closeout -> commit-closeout -> absorb to main。
6. 若当前没有新的 honest post-R5A delta，就停车，而不是偷跑 actual hosted runtime、`P5`、same-repo HITL 或新 formal entry。

硬边界：
- grant_run_id 继续是当前正式 execution handle
- formal durable entry 仍是 CLI + OMX control surfaces
- 不扩成 MCP / controller public formal entry
- 不进入 actual hosted runtime / remote execution / Web UI / multi-tenant
- 不进入 P5.A / P5.B / second-family / federation
- 不进入 same-repo HITL

验证要求：
- python3 -m unittest discover -s tests -p 'test_program_control_surfaces.py'
- python3 -m unittest discover -s tests -p 'test_local_runtime.py'
- python3 -m unittest discover -s tests -p 'test_artifact_bundle.py'
- python3 -m unittest discover -s tests -p 'test_revision_executor.py'
- python3 -m unittest discover -s tests -p 'test_final_package.py'
- python3 -m unittest discover -s tests -p 'test_hosted_contract_bundle.py'
- python3 -m unittest discover -s tests -p 'test_*.py'
- current canonical CLI examples
- git diff --check
- 确认 CLI / reports / docs / tests 对 grant_run_id 与 post-R5A local runtime truth 仍一致

结束状态：
- 若存在 honest delta，则自动收口到 ready to commit / commit closeout / absorbed to main
- 若不存在 honest delta，则停在 `NO_NEW_POST_R5A_LOCAL_RUNTIME_DELTA_HONEST_STOP`
```

## 维护规则

出现下面任一情况时，应同步更新这份模板库：

1. 任一仓切换了当前 phase 或 tranche
2. 任一仓从 `ready_for_review` 进入 `ready_to_commit` 或 `committed` 后，下一棒发生变化
3. 四仓统一控制面语义发生变更
4. `same-phase auto-closeout` 规则出现新的硬边界

## 维护位置

这份文档属于 `docs/references/` 下的中文内部参考文档。
它应被 `docs/README.zh-CN.md`、`docs/README.md` 与 [`omx-stage-gated-longrun-guide.md`](./omx-stage-gated-longrun-guide.md) 明确索引，但不进入根 `README*` 的默认公开阅读路径。
