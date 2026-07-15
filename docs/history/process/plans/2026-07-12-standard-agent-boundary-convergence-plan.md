# OPL 标准智能体边界收敛计划

- Owner: OPL Framework
- Purpose: 关闭 MAS/MAG/RCA/OMA/OBF 与 OPL Base 之间的通用 mechanics / domain authority 双向泄漏。
- State: completed_structural_2026-07-12
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
| A11 | OBF | child Codex/imagegen transport 上收 | Connect + Runway | OPL Book Forge 只保留 book prompt、figure manifest 与 image receipt |
| A12 | OBF | helper probe/dependency/byproduct mechanics 上收 | Connect + Workspace | PDF/publication/hygiene domain rules 保留，通用 helper lifecycle 不重复实现 |

## B. OPL 基座侧迁出或参数化

| ID | 当前 surface | 验收目标 | 目标 owner | 结构完成证据 |
| --- | --- | --- | --- | --- |
| B1 | Console progress-study | 论文/临床进度模型改由 domain projection 提供 | MAS | Console 只消费标准 operator projection，无 paper path/gate 解释 |
| B2 | OMA descriptor/consumption/long-soak/Console action | 改为 standard-agent extension/evidence profile | OMA + Atlas/Foundry Lab/Ledger | OPL 无 OMA-only ledger/action/gate 实现 |
| B3 | standard conformance | golden path/morphology/residue 由 domain contract 声明 | 各 domain pack | validator 无 MAS/MAG/RCA/OMA 分支和专用常量 |
| B4 | Agent Lab longline/developer drills | scenario/oracle/scorecard 外置 | 各 domain/eval pack | runner 通用；active source 无静态 domain passed 结果 |
| B5 | default executor recovery | 移除 MAS 默认 owner | Runway | owner 缺失 fail closed，或从 attempt/pack/registry 解析 |
| B6 | transition oracle | 退役 MAG alias 与通用 runner，Codex CLI 独占语义 route | MAG + Stagecraft | OPL ABI 不再暴露 `mag_grant_transition_oracle` 或 transition runner |
| B7 | agent profile spine | OMA typed-object ABI 改为 generic ABI/adapter | OMA + Foundry Lab | selector 不强制 `opl_meta_agent_*` object kind |
| B8 | research frontier board | 退役 legacy decoder，保留 candidate portfolio projection | MAS + Runway | legacy caller 为零，研究语义不在 OPL |
| B9 | Console owner payload summary | MAS/MAG decoder 改为注册式 domain summary projection | MAS/MAG + Console | Console 无 paper/grant payload shape 分支 |
| B10 | Temporal production proof | MAS vocabulary 改为 generic fixture | Runway | probe 使用 `example-domain`，不携带 publication semantics |

## 吸收与清理结果

- OPL Framework boundary closeout `c39e2b347`，plan closeout `9929b98`：B1-B10 与 A1/A4/A7/A9/A10/A11 所需 shared primitives 已吸收；本轮 feature worktree/branch 均通过 `tree-equivalent` 或 `patch-equivalent` 后清理。现存 stable framework worktree 属于其他 owner，不在本轮清理范围。
- MAS boundary closeout `b190e62a1`：A1-A3 与 domain-owned conformance profile 已吸收；submission/probe transport、StageRun projector、artifact-index 残片及 route-back retry substrate 已退役；本轮 worktree/branch 已清理。后续 stage-surface 文档整理提交不改变本计划边界。
- MAG `main=43f8676`：A4-A6 与 conformance profile 已吸收；本轮 worktree/branch 已清理。
- RCA `main=bfd0e020`：A7-A8 与 conformance profile 已吸收；本轮 worktree/branch 已清理。
- OMA `main=99cdfb6`：A9-A10 与 conformance profile 已吸收；本轮 worktree/branch 已清理。
- OBF `main=9c8fa2a`：A11-A12 与 conformance profile 已吸收；本轮 worktree/branch 已清理。

## Plan Completion Audit

### A. 智能体侧上收

| ID | 状态 | 完成度 | Canonical 结构证据 |
| --- | --- | ---: | --- |
| A1 | `done` | 100% | MAS 删除本地 runtime submission 与 CLI live probe；只产出 typed handoff、消费 host 注入 readback。OPL 提供 `opl_framework.family_runtime_client` 通用 submit/query client。 |
| A2 | `done` | 100% | MAS 旧 physical Stage Folder kernel/promotion runtime 已删除；现存 pointer 仅为 refs/shape validation，通用 lifecycle 归 OPL Workspace/Ledger/Runway。 |
| A3 | `done` | 100% | MAS 删除 `stage_run_kernel.py` 与 `stage_artifact_index` 通用残片；医学 taxonomy、profile、receipt/typed-blocker validator 与 authority 保留。 |
| A4 | `done` | 100% | MAG 六个 authoring stage、Codex critique 与 Hermes adapter 全部走 OPL `run_agent_execution_request`；私有 Codex transport/fallback 已删除。 |
| A5 | `done` | 100% | MAG 私有 plugin installer/script 已删除；package lifecycle 归 OPL Connect。 |
| A6 | `done` | 100% | MAG 六项退休门具备 no-active-caller/no-forbidden-write/provenance/owner refs；family default-caller gate 全闭合。 |
| A7 | `done` | 100% | RCA helper 只声明 catalog/helper；catalog resolution、Python env、spawn、timeout、JSON receipt 归 `opl pack native-helper run`。 |
| A8 | `done` | 100% | RCA `runtimeWatch` 仅返回 visual review/artifact/blocker/owner evidence refs；generic status/telemetry/lifecycle/resumable 归 OPL Console/Runway/Ledger。 |
| A9 | `done` | 100% | OMA 只产出 scaffold semantic materialization request；目标 Agent 文件由 `opl agents scaffold --materialize-request` 物化。 |
| A10 | `done` | 100% | OMA execution wrapper、文件 IO、receipt/lifecycle validation 已删除；OPL `work-order materialize-request` 全量 preflight、原子物化、schema binding 与 SHA receipt。 |
| A11 | `done` | 100% | BookForge child Codex/imagegen 统一走 OPL AgentExecutionRequest capability transport；book prompt/figure manifest/image receipt 保留在 domain。 |
| A12 | `done` | 100% | BookForge helper probe 走 `opl pack native-helper probe`；通用 dependency/byproduct lifecycle 归 OPL，PDF/publication/hygiene 领域规则保留。 |

### B. OPL 基座侧迁出或参数化

| ID | 状态 | 完成度 | Canonical 结构证据 |
| --- | --- | ---: | --- |
| B1 | `done` | 100% | Console progress surface 只消费 normalized domain/operator projection，无 paper/clinical path 与专用 gate 解释。 |
| B2 | `done` | 100% | OPL 中 OMA-only descriptor、consumption、ledger、long-soak、Console/CLI/runtime action 链物理删除；标准 identity/registry 保留。 |
| B3 | `done` | 100% | golden path、morphology、residue 由各 domain `standard_agent_conformance_profile.json` 声明；validator 无 domain-id 分支，并移除 retired provenance exact-3 假设。 |
| B4 | `done` | 100% | Developer Mode/longline 使用显式 domain-owned evaluation manifest；缺省为空或 generic blocked example，非法 manifest fail closed，无静态 MAS/RCA passed 注入。 |
| B5 | `done` | 100% | default executor owner 从 attempt/pack/registry 解析；缺失返回 `owner_unresolved`，不再默认 MAS。 |
| B6 | `done` | 100% | `mag_grant_transition_oracle` ABI 与 OPL 通用 transition runner 均退役；StageRun 只运输 declared stage context 与 artifact refs。 |
| B7 | `done` | 100% | Agent profile selector 使用 generic/source-derived ABI，不要求 `opl_meta_agent_*` typed object。 |
| B8 | `done` | 100% | legacy research-frontier decoder 已删除，替换为通用 candidate portfolio projection。 |
| B9 | `done` | 100% | Console owner payload summary 改为注册式 domain summary refs，无 MAS/MAG payload-shape 分支。 |
| B10 | `done` | 100% | Temporal production proof 使用 `example-domain` generic fixture，不携带 MAS/publication semantics。 |

结构计划完成度：`22/22 = 100%`。该百分比只覆盖本计划冻结的 source/contract/caller/retirement 目标；Live Evidence、production readiness、long-soak、真实 owner acceptance 继续作为独立后置 lane，不计入也不被本结论替代。

## Fresh Closeout

- `opl agents conformance --family-defaults --json`：`6 passed / 0 blocked`，structural contract 与 conformance 均为 `passed`。
- `opl agents default-callers --family-defaults --json`：`40/40` retirement gates closed，active deletion worklist `0`。
- `opl agents residue-decisions --family-defaults --json`：五仓均为 `no_private_platform_residue_decisions`。
- 上述结果是结构 readback，不构成 domain ready、production ready、quality/export ready 或 Live Evidence 完成声明。
