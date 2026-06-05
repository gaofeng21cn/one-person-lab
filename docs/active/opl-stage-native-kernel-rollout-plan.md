# OPL Stage Native Kernel 推广方案

Owner: `One Person Lab`
Purpose: `stage_native_kernel_rollout_plan`
State: `active_plan`
Machine boundary: 本文是 OPL family Stage Native Kernel 的人读推广和落地方案。机器真相继续归 `contracts/`、schema、source、CLI/API 行为、runtime ledger、provider receipt、domain-owned manifest、Stage Folder、owner receipt、typed blocker、真实 workspace 与 App evidence。
Date: `2026-06-05`

## 结论

Stage Native 应推广到 OPL 基座和所有 Foundry Agents。推广对象不是 MAS 论文流程，也不是 RCA visual workflow，而是这套通用执行内核：

```text
Stage Folder
  + stage_manifest
  + role artifacts
  + owner receipt / typed blocker
  + minimal StageRun state
```

它应成为 OPL family 的标准执行模型。OPL 现在最需要的不是更多 controller、read-model 补偿链、dispatch wrapper 或 evidence worklist，而是一个统一、简单、可恢复、可审计的 stage 推进口径。RCA 已经证明 stage folder、role artifact、review/export receipt 和 closeout 集中时，推进会更顺滑；MAS 暴露的问题说明如果完成口径没有落到 manifest-backed role artifact 与 receipt/blocker，domain agent 很容易继续长出 progress、route、materialize、dispatch、read-model 的互相补偿链。

默认目标口径固定为：

```text
Stage 目录承载证据
manifest 定义角色和 required artifacts
receipt / blocker 决定推进
StageRun 只表达最小 runtime 状态
```

## 目标与非目标

目标：

- 把 Stage Native 从单仓经验提升为 OPL Framework primitive。
- 让 MAS/MAG/RCA/OMA 都通过同一 StageRun Kernel、Stage Folder contract、stage manifest、role artifact、owner receipt / typed blocker 口径推进。
- 把 App/workbench 默认读面收敛到 StageRun current owner delta。
- 把旧 progress/read-model/controller 补偿链退役为 projection、audit 或 tombstone。

非目标：

- 不把 MAS 论文流程复制给 MAG/RCA/OMA。
- 不让 OPL 判断医学质量、grant 质量、visual quality、agent patch quality 或 export/submission readiness。
- 不新增一个 domain controller system。
- 不把文件存在、provider completed、read-model refreshed、conformance passed 或 verified ledger 写成 stage complete。

## Owner Split

| 层 | OPL 基座负责 | Domain agent 负责 |
| --- | --- | --- |
| `StageRun Kernel` | `StageRun.spec/status`、generation、attempt、lease、retry、dead-letter、event log、read-model rebuild。 | stage semantics、entry requirements、quality gate、domain route semantics。 |
| `Stage Folder` | folder contract、manifest schema、hash/index/rebuild、current pointer、conformance validator。 | required role artifacts、domain artifact authority、receipt/blocker schema 和签发。 |
| `Runtime` | Temporal-backed attempt lifecycle、worker/provider liveness、terminal closeout ingest、projection。 | domain handler / authority function 只返回 owner receipt、typed blocker、human gate 或 safe action refs。 |
| `App/workbench` | StageRun current owner delta、stage status、missing roles、receipt/blocker drilldown。 | 人能理解的 stage_work_done、changed_stage_surfaces、domain next owner 和 owner answer。 |
| `Quality` | 只检查结构合法性、refs 覆盖、manifest/hash/current pointer 和 receipt/blocker 是否存在。 | 医学、基金、视觉、agent-building 质量判断和 artifact/export verdict。 |

OPL 可以回答：

```text
这个 Stage 是否有合法 manifest、required role artifacts、receipt/blocker？
这个 StageRun 是否 running、blocked、terminalizing、accepted、superseded？
当前 owner 欠什么 accepted answer shape？
```

OPL 不能回答：

```text
论文是否 publication ready？
grant 是否 fundable？
visual artifact 是否视觉质量合格？
agent patch 是否应进入目标 repo？
```

## 标准对象模型

### StageRun

StageRun 是最小状态壳，不是第二 controller。

```text
StageRun
  stage_run_id
  domain_id
  stage_id
  generation
  spec
    input_refs
    required_role_artifacts
    selected_executor
    authority_boundary
    expected_receipt_or_blocker
  status
    declared | inputs_ready | admitted | running | terminalizing | accepted | blocked | deferred | superseded | crashed
  observed_generation
  current_attempt_ref
  current_owner_delta_ref
  event_log_refs
```

规则：

- 一个 Stage 只能有一个 active generation。
- old generation 的 request、attempt、redrive 只能进入 superseded / historical。
- retry budget 绑定 `{stage_run_id, generation, input_fingerprint, failure_signature}`。
- `StageRun.status` 由 OPL 写；domain owner 只签 receipt/blocker。

### stage_manifest

`stage_manifest` 是 Stage Folder 内的结构合同。

```text
stage_manifest
  manifest_version
  domain_id
  stage_id
  stage_run_id
  generation
  required_roles[]
  produced_roles[]
  input_refs[]
  output_artifact_refs[]
  receipt_refs[]
  typed_blocker_refs[]
  content_hashes
  current_pointer
  lineage_refs
  authority_boundary
```

规则：

- role artifact 是产出角色，不是文件名。
- 文件存在只证明 evidence 存在。
- role 是否 current、是否满足 gate、是否被 receipt/blocker 消费，由 manifest 和 receipt/blocker 判定。

### Role Artifact

Role artifact 是每个 Stage 的 typed output slot。

例子：

| Agent | role artifact 示例 |
| --- | --- |
| MAS | `source_truth_pack`、`analysis_result`、`ai_reviewer_record`、`revision_action_matrix`、`publication_handoff_packet` |
| MAG | `call_intake_pack`、`specific_aims_draft`、`proposal_package`、`fundability_review`、`submission_handoff` |
| RCA | `source_truth_pack`、`visual_direction`、`render_manifest`、`review_verdict`、`export_bundle`、`handoff_manifest` |
| OMA | `target_agent_intake`、`stage_decomposition_pack`、`baseline_result`、`mechanism_patch_proposal`、`owner_closeout_packet` |

### OwnerReceipt / TypedBlocker

成功推进只能由 owner receipt 关闭，阻断只能由 typed blocker 关闭。

```text
OwnerReceipt
  receipt_id
  domain_id
  stage_id
  stage_run_id
  consumed_role_artifacts
  accepted_delta
  next_stage_or_owner
  authority_owner

TypedBlocker
  blocker_id
  domain_id
  stage_id
  stage_run_id
  blocked_surface
  missing_or_failed_input
  required_owner
  next_safe_action
  stability_or_retry_policy
```

规则：

- provider completion 不能代替 owner receipt。
- verified refs-only ledger 不能代替 owner receipt。
- typed blocker 是明确 owner answer，不是完成。

## 三层彻底落地

### 1. OPL 标准层

目标：让 OPL 基座拥有统一 StageRun / stage manifest / role artifact / receipt-blocker 运行内核。

必须落地：

- `contracts/opl-framework/stage-run-kernel-contract.json`
- `contracts/opl-framework/stage-manifest.schema.json`
- `contracts/opl-framework/role-artifact-ref.schema.json`
- `contracts/opl-framework/stage-owner-receipt.schema.json`
- `contracts/opl-framework/stage-typed-blocker.schema.json`
- `opl stage status --json`
- `opl stage validate --json`
- `opl stage explain --json`
- `opl stage promote --json`
- `opl stage rebuild --json`
- `opl agents conformance` 增加 StageRun / manifest / role artifact adoption gate

完成口径：

- OPL 能从 Stage Folder + manifest + receipt/blocker 重建 read model。
- OPL queue / attempt / lease / retry / dead-letter 能绑定 StageRun generation。
- OPL default read surface 输出 StageRun current owner delta。
- SQLite、Temporal、App、stage_progress_log 只能做 projection，不成为 primary truth。

### 2. Agent 适配层

目标：MAS/MAG/RCA/OMA 都只提交自己的 stage pack，使用同一 Stage Native Kernel。

每个 agent 必须声明：

- 每个 Stage 的 `stage_id`、goal、entry refs、required role artifacts。
- 每个 Stage 的 allowed output roles。
- 哪些 owner receipt / typed blocker 可以关闭本 Stage。
- 哪些 independent quality gate 必须 domain owner 签发。
- App/workbench 可以显示哪些 stage_work_done / changed_stage_surfaces 摘要。
- 哪些旧 projection 只作为 evidence projection，不再作为 authority。

Agent 顺序：

1. RCA 固化为 reference implementation。
2. MAS 用 DM002 / DM003 AI reviewer Stage 做高压 canary。
3. MAG 选一个 grant stage 做轻量 canary。
4. OMA 最后接入，验证非医学、非文档交付型 agent 是否自然适配。

完成口径：

- 每个 agent 至少一个真实 StageRun 产出 manifest-backed role artifacts。
- 每个 canary 返回 owner receipt 或 stable typed blocker。
- agent-local progress / portal / workbench 只从 manifest + receipt/blocker 派生。
- domain quality verdict 仍由 domain owner 持有。

### 3. 迁移与清理层

目标：退役旧补偿链，把旧状态面降为 projection。

必须清理：

- progress/read-model/controller 补偿链不能继续抢占完成判断。
- `latest.json`、portal、workbench、runtime tray 只能读 StageRun / manifest / receipt/blocker projection。
- route 只选择 next owner / action / StageRun spec，不修 runtime state。
- old request、old attempt、old redrive 必须被 generation / observed_generation 收敛为 superseded。
- repeated receipt-only、read-model-reconcile-only、platform-repair-only、stale-route-redrive-only 必须触发 stop-loss 或 typed blocker。

完成口径：

- 不需要人工反复跑 reconcile/materialize/dispatch 才能看到当前 Stage 状态。
- 旧 compensation path 有 no-active-caller、replacement parity、owner receipt / typed blocker、no-forbidden-write 和 tombstone/provenance 后删除或 tombstone。
- App/workbench 不展示各 agent 私有状态串，只展示 StageRun current owner delta。

## Canary 计划

### RCA reference

目的：把已顺滑的 RCA stage folder / role artifact / review-export receipt 口径固化成 OPL reference implementation。

验收：

- RCA stage outputs 以 role interface 表达，而不是 filename surface。
- output-only folder 仍视为 orphan，不算 complete。
- review/export closeout 返回 owner receipt 或 typed blocker。
- OPL conformance 能读取 RCA adoption contract 并投影为 Stage Native reference。

### MAS high-pressure canary

Stage：DM002 / DM003 `ai_reviewer_publication_eval_rebuild`。

当前状态：MAS 已在 `e509395c fix(controller): route current reviewer record to gate replay` 落地 canary 前置 currentness / dispatch 修复：request-bound current AI reviewer record 可关闭旧 lifecycle request，`publication_gate_replay_after_clean_migration` 已进入 gate-clearing work unit / owner reason，provider-hosted Stage Attempt identity 匹配时可授权 gate-clearing dispatch，Progress-first monitoring 保留 running provider proof 但不让它覆盖 artifact owner action。这只关闭 canary 前置的 owner-route/currentness/liveness arbitration 缺口，不等于 fresh StageRun、manifest-backed role artifact、owner receipt、publication ready 或 paper closure。

验收：

- 每个 study 生成 fresh StageRun。
- Stage Folder 至少包含：

```text
stage_manifest.json
inputs/consumed_artifact_refs.json
outputs/ai_reviewer_record.json
outputs/revision_action_matrix.json
receipts/owner_receipt.json or receipts/typed_blocker.json
lineage/prov.json
projection/current_owner_delta.json
```

- OPL ledger、StageRun status、MAS study progress、stage manifest 四者一致。
- `publication_eval/latest.json` 只能由 receipt 派生刷新。
- 旧 attempt / 旧 request 不再消耗新 generation retry budget。

### MAG light canary

Stage：`specific_aims_and_structure` 或 `fundability_strategy`，二选一。

验收：

- grant-facing role artifacts 和 fundability gate 明确。
- package/export/submission readiness 只能由 MAG owner receipt / typed blocker 关闭。
- grouped CLI/status/read-model 只做 projection。

### OMA generality canary

Stage：`stage-decomposition` 或 `baseline-run`，二选一。

验收：

- target-agent candidate / mechanism patch / work-order closeout 使用 role artifacts。
- OMA 不持有第二 OPL Framework、第二 Agent Lab、worktree lifecycle owner 或 promotion verdict owner。
- target owner answer 决定下一步。

## App / Workbench 改造

默认 App/workbench 只展示：

```text
task
stage
StageRun status
current owner
accepted answer shape
missing role artifacts
owner receipt / typed blocker / human gate
next safe action
```

不展示为默认面：

- raw worklist count
- replay packet
- provider trace
- route variant menu
- typed blocker group
- evidence ledger browser
- private residue inventory
- per-agent 私有 progress/status 串

这些内容保留在 full drilldown / audit lane。

## 验收标准

设计层：

- 本方案明确 Stage Native Kernel 是 OPL family 标准执行模型。
- 本方案明确 StageRun Kernel 是最小状态壳，不是新增 controller。
- 本方案明确 OPL / domain owner split。
- 本方案明确 file presence、provider completion、read-model refresh、verified ledger 不能关闭 stage。
- 本方案明确 RCA、MAS、MAG、OMA canary 顺序。

工程层：

- StageRun / stage_manifest / role artifact / receipt / blocker schema 可 machine validate。
- OPL stage CLI 能 validate、status、explain、promote、rebuild。
- `opl agents conformance --family-defaults --json` 能检查四个 agent 的 Stage Native adoption。
- 至少 RCA reference + MAS high-pressure canary 通过。
- App/workbench 默认只消费 StageRun current owner delta。

迁移层：

- MAS AI reviewer canary 不再需要人工重复 reconcile。
- MAG/RCA/OMA 不新增 generic scheduler、queue、attempt ledger、status shell 或 workbench owner。
- 旧 compensation path 进入 no-active-caller / tombstone / delete gate。

## Forbidden Claims

- Stage folder 有文件不等于 stage complete。
- Provider completed 不等于 owner receipt。
- `latest.json` refreshed 不等于 domain accepted。
- Read-model rebuilt 不等于 progress。
- Verified refs-only ledger 不等于 owner answer。
- Conformance passed 不等于 domain ready。
- RCA reference 不等于 MAS/MAG/OMA 自动 ready。
- StageRun status 不能替代医学、基金、视觉或 agent-building 质量判断。

## 下一步写入范围

第一 tranche 应写入 OPL 主仓：

- `contracts/opl-framework/stage-run-kernel-contract.json`
- `contracts/opl-framework/stage-manifest.schema.json`
- OPL stage CLI validate/status/explain 的最小实现或现有 `opl stage` 命令扩展计划
- `opl agents conformance` 的 Stage Native adoption gate
- 本文折回 `current-state-vs-ideal-gap.md` 和 `docs/active/README.md`

第二 tranche 写入 domain repos：

- RCA reference closeout notes 和 adoption contract hardening
- MAS `ai_reviewer_publication_eval_rebuild` StageRun canary
- MAG grant-stage canary
- OMA generality canary

第三 tranche 执行 cleanup：

- 每个 canary 对应旧 progress/read-model/controller compensation path 的 no-active-caller 审计
- replacement parity、owner receipt / typed blocker、no-forbidden-write、tombstone/provenance
- 满足后删除或 tombstone，不保留兼容 facade
