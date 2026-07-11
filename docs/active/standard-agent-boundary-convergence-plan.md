# OPL 标准智能体边界收敛计划

- Owner: OPL Framework
- Purpose: 关闭 MAS、MAG、RCA、OMA、BookForge 与 OPL 基座之间的通用 mechanics / domain authority 双向泄漏。
- State: active
- Machine boundary: 本文是跨仓实施与验收入口；machine truth 仍由各仓 source、contracts、tests 与 `opl agents * --json` readback 持有。

## 验收边界

本轮只关闭功能与结构缺口。Live Evidence、production readiness、long-soak、真实 owner acceptance 后置，不作为结构实现 blocker，也不能替代下面任一源码、contract、caller 或退役门。

通用 mechanics 必须由 OPL primitive、generated/hosted surface 或参数化 extension 承担；domain repo 只保留领域判断、artifact authority、quality/export verdict、owner receipt 与 typed blocker authority。混合模块必须拆分，禁止整模块搬迁导致 authority 上收。

## A. 智能体侧上收

| ID | Owner repo | 验收目标 | OPL owner | 结构完成证据 |
| --- | --- | --- | --- | --- |
| A1 | MAS | 删除本地 OPL subprocess/provider/attempt transport 的默认职责 | Runway | MAS 默认路径消费 OPL hosted/readback API；本地只保留 study/owner 匹配 |
| A2 | MAS | Stage Folder pointer/promotion/orphan/tombstone mechanics 上收 | Workspace + Ledger + Runway | 通用 lifecycle 由 OPL primitive 承担；MAS 保留 receipt 与 publication truth |
| A3 | MAS | StageRun/artifact index 按 generic skeleton 与 paper authority 拆分 | Stagecraft + Runway + Ledger | 无第二套 generic kernel/index；MAS taxonomy 与 validator 仍在 domain owner |
| A4 | MAG | executor invocation/default topology 上收 | Runway + Pack | MAG 不再 spawn OPL/Codex transport；grant prompt/route policy 保留 |
| A5 | MAG | plugin/skill/marketplace 生命周期上收 | Connect | install/update/remove/readback 走 OPL Connect package lifecycle |
| A6 | MAG | 关闭 cli/product_entry/product_status/product_session/domain_handler/workbench 退休门 | Pack + Console | 六项均具备 no-active-caller、no-forbidden-write、tombstone/provenance 与 owner decision refs |
| A7 | RCA | Python helper catalog/env/spawn/JSON envelope 上收 | Connect + Runway | RCA 只声明 helper 与视觉 renderer/quality semantics |
| A8 | RCA | 通用 runtimeWatch/product status shell 上收并关闭 product_status 退休门 | Console + Runway + Ledger | status/attempt transport 由 OPL 提供；RCA 只保留 visual review refs |
| A9 | OMA | 目标 Agent 文件物化由 OPL scaffold/pack compiler 承担 | Foundry Lab + Pack + Workspace | OMA 产出 semantic draft，不直接拥有通用 physical materializer |
| A10 | OMA | work-order IO/lifecycle/receipt mechanics 上收 | Foundry Lab + Ledger | OMA 保留 agent-building judgment 与 candidate semantics |
| A11 | BookForge | child Codex/imagegen transport 上收 | Connect + Runway | BookForge 只保留 book prompt、figure manifest 与 image receipt |
| A12 | BookForge | helper probe/dependency/byproduct mechanics 上收 | Connect + Workspace | PDF/publication/hygiene domain rules 保留，通用 helper lifecycle 不重复实现 |

## B. OPL 基座侧迁出或参数化

| ID | 当前 surface | 验收目标 | 目标 owner | 结构完成证据 |
| --- | --- | --- | --- | --- |
| B1 | Console progress-study | 论文/临床进度模型改由 domain projection 提供 | MAS | Console 只消费标准 operator projection，无 paper path/gate 解释 |
| B2 | OMA descriptor/consumption/long-soak/Console action | 改为 standard-agent extension/evidence profile | OMA + Atlas/Foundry Lab/Ledger | OPL 无 OMA-only ledger/action/gate 实现 |
| B3 | standard conformance | golden path/morphology/residue 由 domain contract 声明 | 各 domain pack | validator 无 MAS/MAG/RCA/OMA 分支和专用常量 |
| B4 | Agent Lab longline/developer drills | scenario/oracle/scorecard 外置 | 各 domain/eval pack | runner 通用；active source 无静态 domain passed 结果 |
| B5 | default executor recovery | 移除 MAS 默认 owner | Runway | owner 缺失 fail closed，或从 attempt/pack/registry 解析 |
| B6 | transition oracle | 退役 MAG alias，保留通用 runner | MAG + Stagecraft | OPL ABI 不再暴露 `mag_grant_transition_oracle` |
| B7 | agent profile spine | OMA typed-object ABI 改为 generic ABI/adapter | OMA + Foundry Lab | selector 不强制 `opl_meta_agent_*` object kind |
| B8 | research frontier board | 退役 legacy decoder，保留 candidate portfolio projection | MAS + Runway | legacy caller 为零，研究语义不在 OPL |
| B9 | Console owner payload summary | MAS/MAG decoder 改为注册式 domain summary projection | MAS/MAG + Console | Console 无 paper/grant payload shape 分支 |
| B10 | Temporal production proof | MAS vocabulary 改为 generic fixture | Runway | probe 使用 `example-domain`，不携带 publication semantics |

## Lane 与写集

- `codex/opl-agent-boundary-core-20260711`: OPL `src/modules/**` 中 B1-B10、对应 contracts/tests、本计划与核心 docs；禁止修改现有 dirty registry lane 的文件。
- `codex/oma-boundary-materializer-20260711`: OMA `scripts/lib/**`、相关 contracts/tests/docs；不写其他仓。
- `codex/obf-boundary-helper-20260711`: BookForge `runtime/native_helpers/**`、相关 contracts/tests/docs；不写 evidence/provenance dirty lane 文件。
- MAS、MAG、RCA 后续 lane 只在 fresh gate 后创建；已有同写集脏 lane 优先 owner 协调，不并发覆盖。

## 当前结构实施状态

| ID | 状态 | Fresh 结构证据 |
| --- | --- | --- |
| B1 | `done_in_lane` | Console 的 progress surface 只消费 normalized runtime control/session/progress/artifact projection；旧 paper path、clinical question、study queue 和专用 gate 解释已删除。 |
| B5 | `done_in_lane` | default executor receipt recovery 按 execution / stage packet / attempt owner 解析，并用 standard-agent registry 归一化；无 owner 返回 `owner_unresolved`，不再默认 MAS。 |
| B10 | `done_in_lane` | Temporal production proof 使用 `example-domain`、generic memory ref 和 generic next owner；fixture 不再携带 MAS/publication vocabulary。 |
| A11 transport prerequisite | `done_in_lane` | `AgentExecutionRequest.required_capabilities=["image_generation"]` 仅允许 `codex_cli`，未知 capability 或非 Codex executor fail closed；receipt 回读 requested/activated capabilities；`timeout_ms` 由 Codex process 实际执行并在超时时返回 typed fail-closed error；artifact authority 仍归 domain。 |

上述状态只表示当前 feature lane 的 source/contract/focused-test 结构完成；吸收 `main`、main 上 fresh 验证与 worktree cleanup 仍由 root closeout 执行。

## 验证与停止条件

每条 lane 必须通过 touched-surface focused tests、`git diff --check`、repo 默认 `scripts/verify.sh` 可适用入口，并提交到独立 branch。吸收前由 root 审查 diff；吸收后在 `main` 重跑相关验证与：

```text
opl agents conformance --family-defaults --json
opl agents default-callers --family-defaults --json
opl agents residue-decisions --family-defaults --json
```

只有 A1-A12、B1-B10 全部具备 canonical `main` fresh evidence，且新 lane 获得 `exact-merged`、`tree-equivalent` 或 `patch-equivalent` 后，才能清理 worktree/branch 并声明结构完成。外部 owner 的未知 dirty write set、同写集冲突或无法满足的 domain authority 决策必须保持 typed blocker，不得以 docs 或测试绿替代。
