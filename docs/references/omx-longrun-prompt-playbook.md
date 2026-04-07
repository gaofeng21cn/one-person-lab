# OMX 长线提示词模板库

状态锚点：`2026-04-07`

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
1. 先读取仓内 AGENTS.md、contracts/project-truth/AGENTS.md、CURRENT_PROGRAM.md、LATEST_STATUS.md、OPEN_ISSUES.md、ITERATION_LOG.md 与当前 tranche 对应 specs / plans / docs。
2. 在当前 tranche / same-phase 内，只要 hard gates 通过，就自动继续完成 review -> manual test -> commit -> absorb。
3. 每完成一个阶段动作，都要同步 CURRENT_PROGRAM、LATEST_STATUS、OPEN_ISSUES 与必要的 repo-tracked truth surface。
4. 不得把开发控制面成熟度误写成产品 runtime 成熟度。
5. 不得越过当前 frozen phase / tranche 边界偷跑下一阶段。

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

- `G2 release-closeout` 已提交后，继续打开 `G3 thin handoff planning freeze hardening`

```text
你现在在 one-person-lab 仓库，按“同一棒内自动收口”执行。

先读：
- AGENTS.md
- contracts/project-truth/AGENTS.md
- docs/roadmap.zh-CN.md
- docs/plans/2026-04-07-g3-thin-handoff-planning-brief.md
- docs/references/opl-gateway-rollout.zh-CN.md
- docs/references/opl-gateway-acceptance-test-spec.zh-CN.md
- contracts/opl-gateway/README.zh-CN.md
- docs/opl-routed-action-gateway.zh-CN.md
- docs/opl-public-surface-index.zh-CN.md

任务目标：
在 G2 stable public baseline 已收口的前提下，把 OPL 继续推进到 G3 thin handoff planning freeze hardening，但不进入 routed-action runtime implementation。

必须完成：
1. 统一 route_request、build_handoff_payload、audit_routing_decision 的最小边界。
2. 把 no-bypass 规则写成硬边界，并确保 handoff 目标只能是 domain gateway。
3. 清理任何会把 OPL 误写成 runtime owner、mutation gateway、shared truth store 的表述。
4. 让 acceptance / rollout / public-surface / contracts README 的 G3 口径保持一致。
5. 若本轮 hardening 完成且验证全绿，就直接 commit-closeout。

硬边界：
- 不新增 mutation entry
- 不新增 run launch
- 不新增 workspace write
- 不把 routed-actions schema 变成 launcher
- 不实现真正的 G3 routed-action runtime
- 不把 Unified Harness Engineering Substrate 写成共享代码框架

验证要求：
- npm test
- git diff --check
- 用 rg 复核 runtime owner / no-bypass / mutation entry / domain gateway 等关键口径没有漂移

结束状态：
- 优先自动收口到 ready to commit / commit closeout
- 本轮结束后仍停留在 Phase 1；不升格为 runtime owner
```

### 2. med-autoscience

当前推荐用途：

- `P1` 已完成后，自动执行 manual-test closeout，并在通过后吸收到 `main`

```text
你现在在 med-autoscience 仓库，按“同一棒内自动收口”执行。

先读：
- AGENTS.md
- contracts/project-truth/AGENTS.md
- .omx/context/CURRENT_PROGRAM.md
- .omx/reports/research-foundry-medical-mainline/MANUAL_TEST_PACKAGE.md
- .omx/reports/research-foundry-medical-mainline/LATEST_STATUS.md
- .omx/reports/research-foundry-medical-mainline/OPEN_ISSUES.md
- .omx/reports/research-foundry-medical-mainline/ITERATION_LOG.md
- docs/study_runtime_control_surface.md

当前起点默认按：
- P1 已完成
- closeout slice 已存在
- ready for manual test = yes
- ready to commit = yes
- P2 未开启

执行顺序：
1. 先在当前 P1 closeout slice 上执行正式 manual-test closeout。
2. 同步复跑 targeted regression 与 broader regression。
3. 若 hard gates 通过，就自动完成本轮 remaining closeout work。
4. 然后把当前 P1 closeout slice 吸收到 main。
5. 吸收后在 main 上做一轮 fresh verification，并同步 CURRENT_PROGRAM 与 reports。
6. 最终停在：
   - P1 fully closed on main
   - P2 not started / not activated

冻结语义不得漂移：
- pause_runtime = recoverable
- stop_runtime = terminal stop
- stop_after_current_step = unsupported / fail-closed
- rerun = unsupported executable control action
- requires_human_confirmation = dispatch gate

硬边界：
- 不自动进入 P2
- 不做 real-study relaunch
- 不做 end-to-end study harness
- 不做 MedDeepScientist 写入
- 不做 cross-repo write

验证要求：
- 执行 MANUAL_TEST_PACKAGE
- 复跑 targeted regression
- 复跑 broader regression
- git diff --check
- 吸收到 main 后再做一轮 fresh verification

停车规则：
- 只要当前 P1 hard gates 通过，就自动完成 manual test -> commit closeout -> absorb to main
- 本轮结束时不得自动开启 P2
```

### 3. redcube-ai

当前推荐用途：

- `P0 durable closeout` 已完成后，执行 `stable deliverable manual-test-driven hardening`

```text
你现在在 redcube-ai 仓库，按“同一棒内自动收口”执行。

先读：
- AGENTS.md
- contracts/project-truth/AGENTS.md
- .omx/context/CURRENT_PROGRAM.md
- contracts/runtime-program/current-program.json
- contracts/runtime-program/stable-deliverable-manual-test-driven-hardening.json
- contracts/runtime-program/stable-deliverable-hardening-backlog.json
- docs/stable_deliverable_manual_test_brief.md
- README.zh-CN.md
- docs/runtime_architecture.md
- .omx/reports/redcube-runtime-program/LATEST_STATUS.md
- .omx/reports/redcube-runtime-program/OPEN_ISSUES.md

任务目标：
围绕当前已稳定能力做正式手工测试，并把 findings 收敛成 hardening backlog，不重开 P1，不打开 Phase 2。

当前 scope 只包含：
- ppt_deck
- xiaohongshu

必须完成：
1. 依据手工测试包执行 stable deliverable manual tests。
2. 把真实 findings 回写到 stable-deliverable hardening backlog。
3. 保持 current formal entry 真相为 MCP / CLI。
4. 保持 tracked-only / clean-clone 口径下的 green baseline 可信。
5. 若本轮 manual-test hardening 收口且验证全绿，就直接完成 commit-closeout。

硬边界：
- 不把 controller 写成正式入口
- 不重开 P1
- 不打开 Phase 2 / source intake + shared source truth
- 不新增 family
- 不扩大 OPL 联动面

验证要求：
- npm test
- npm run typecheck
- git diff --check
- tracked-only targeted truth-freeze tests 可复现

结束状态：
- 停在 stable deliverable manual-test-driven hardening closeout
- 不自动进入 Phase 2
```

### 4. med-autogrant

当前推荐用途：

- `P2.A / Intake-Direction-Question Mainline` 已激活后，继续做 tranche closeout，但不自动进入 `P2.B`

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
- docs/specs/2026-04-07-formal-entry-matrix-current-truth.md
- docs/specs/2026-04-07-durability-model-clarification.md
- docs/specs/2026-04-07-p2a-intake-direction-question-mainline-current-truth.md
- .omx/reports/med-autogrant-mainline/LATEST_STATUS.md
- .omx/reports/med-autogrant-mainline/OPEN_ISSUES.md
- .omx/reports/med-autogrant-mainline/ITERATION_LOG.md

任务目标：
在不破坏 P1 baseline 与当前 formal entry / durability / grant_run_id 合同的前提下，把 P2.A 收口成稳定 tranche，但不自动进入 P2.B。

必须完成：
1. 守住 input_intake -> direction_screening -> question_refinement 的当前 canonical route。
2. 守住 current_selection 对 direction / question 的显式绑定。
3. 让 CLI、runtime、tests、examples、docs、reports 对当前 P2.A 真相保持一致。
4. 若本轮 P2.A hard gates 通过，就自动完成当前 tranche closeout。
5. 结束时保持 same-phase hold，不自动进入 P2.B。

硬边界：
- grant_run_id 继续是当前正式 execution handle
- formal durable entry 仍是 CLI + OMX control surfaces
- 不扩成 MCP / controller formal entry
- 不自动进入 P2.B / P2.C / P3
- 不提前扩 write/export/HITL skeleton

验证要求：
- 运行 active test-spec 定义的 repo-native commands
- git diff --check
- 确认 CLI / reports / docs / tests 对 grant_run_id 的合同仍一致

结束状态：
- 停在 P2.A closeout / ready for review / ready to commit
- 不自动进入 P2.B
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
