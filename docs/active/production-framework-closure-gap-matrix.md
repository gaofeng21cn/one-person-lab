# OPL 生产闭环差距矩阵支撑

Owner: `One Person Lab`
Purpose: `production_closure_gap_matrix_support`
State: `active_support`
Machine boundary: 本文是人读 production closure 证据门支撑。机器真相继续归 `contracts/`、source code、CLI/API behavior、runtime ledgers、provider receipts、domain-owned manifests 与真实 workspace / App evidence。

## 读法

本文不再作为独立 active plan 维护。OPL family 当前目标、差距、完成口径和 active-goal baton 的唯一 active owner 是 [OPL Family 当前状态与理想目标差距](./current-state-vs-ideal-gap.md)。本文只解释 production closure 相关证据如何被唯一 active owner 消费。

统一 operating model 标准回到 [OPL Family Ideal Operating Model Redesign](./opl-family-ideal-operating-model-redesign.md)。目标操作架构回到 [OPL Foundry Agent Target Operating Architecture](./opl-foundry-agent-target-operating-architecture.md)。过程性 provider proof、receipt 事件、workorder 计数、命令输出、分支名、attempt id 和 dated closeout 流水进入 `docs/history/**`、runtime ledger 或提交历史。

## 当前判断

OPL 已具备 production framework control plane 的主要结构：Temporal-backed provider、stage-attempt projection、stage attempt ledger、retry/dead-letter、human gate transport、safe action shell、refs-only evidence ledger、stage artifact/progress truth、App/operator drilldown、generated surface read model、standard conformance、Agent Lab 与 lifecycle/source/artifact/memory refs-only primitives。

这仍不能写成全量 production ready。Production closure 只能由正确 owner 的真实 delta 关闭：

- Framework closure：OPL 证明 stage runtime、provider、stage-attempt projection、generated surface、guardrail 和 read model 同源可用。
- App release/user path：App repo 的 contract、release artifact、screenshot、first-run/reload/user-path 和 release owner evidence 关闭。
- Domain production tail：MAS/MAG/RCA/OMA 的 owner receipt、typed blocker、human gate、quality/export/review receipt、artifact/memory lifecycle receipt、no-regression 或 long-soak refs 关闭。
- Physical deletion：每个 retained wrapper / adapter / alias / script 逐项满足 replacement parity、no-active-caller、owner receipt / typed blocker、no-forbidden-write 与 tombstone/provenance。

OPL readiness、provider proof、generated surface proof、stage evidence workorder、conformance pass、default-caller readiness、cleanup ledger 或 refs-only typed blocker roundtrip，只能定位控制面和证据缺口。它们不能授权 MAS paper closure、MAG grant readiness、RCA visual ready、OMA target-agent promotion、App release ready、artifact authority、memory writeback 或 production-ready verdict。

## Closure Gap Matrix

| gap | 当前读法 | 完成口径 |
| --- | --- | --- |
| `framework_control_plane` | OPL control plane 已是 current-owner-delta-first 的 framework 主干。 | 默认 summary、App fast state、runtime tray、evidence-worklist summary 和 generated surface 从同一 machine payload 派生；新增 surface 不制造第二 truth。 |
| `current_owner_delta_default` | `current_owner_delta` 是 ordinary App/CLI/operator root；raw evidence/worklist/replay 只作 audit/detail。 | 默认读面能直接回答当前 owner、缺什么 accepted answer shape、是否 hard gate、下一步可执行 owner action；计数清零不能写成完成。 |
| `stage_artifact_progress_truth` | Stage Artifact Unit 是 progress root。 | Progress 同时具备 physical output、valid manifest、owner answer 和 current pointer；provider completion、receipt verified、file presence 或 conformance pass 单独不计进度。 |
| `app_cockpit_release_path` | App 只消费 framework/provider 状态与 domain-owned projection。 | App release/user-path cohort 用真实 release package、screenshot、reload/first-run path、provider linkage 和 operator evidence 关闭；不外推 family production ready。 |
| `domain_owner_chain_scaleout` | OPL 可 refs-only 承载 owner receipt / typed blocker refs，但不生成它们。 | MAS paper、MAG grant、RCA visual、OMA target-agent stage 由 domain-owned owner receipt、typed blocker、human gate、quality/export/review receipt、no-regression 或 long-soak refs 关闭。 |
| `memory_artifact_lifecycle_apply` | OPL 持 locator/index/ledger/ref transport；domain 持 body、mutation authority、accept/reject 和 final verdict。 | Domain-owned surface 产生真实 memory/artifact/lifecycle receipts；OPL 不保存 body、不判定 verdict。 |
| `generated_surface_consumption` | OPL generated/hosted surfaces 已是 standard-agent replacement 输入。 | MAS/MAG/RCA/OMA 生产默认 caller 使用 generated/hosted surfaces；domain repo 只保 domain pack、authority function、domain handler target、native helper 或 direct skill path。 |
| `wrapper_retirement` | Retained wrappers / adapters / aliases / scripts 是 deletion-gate 候选，不是长期组成。 | 逐 surface 满足 replacement parity、no-active-caller、owner receipt / typed blocker、no-forbidden-write、tombstone/provenance 后删除或 tombstone；不新增兼容入口。 |
| `provider_long_soak` | Temporal 是 production required provider；SQLite sidecar 只作 projection/readback index。 | 更长窗口内 provider cadence/capability、domain dispatch、retry/dead-letter、owner receipt / typed blocker 可重复 record/verify；不外推 domain production ready。 |
| `no_resurrection` | 旧 gateway/frontdoor/federation/Hermes-first/local-manager、compat facade、old CLI alias、compatibility-only test 都只按 negative guard / history / tombstone 读取。 | Focused guard、docs scan、contract/source tests 和 review 阻断旧路径复活；保留旧词必须处在 history/provenance/negative-guard 语境。 |

## Forbidden Claims

- `open_worklist=0`、payload-free safe action 为 0、conformance passed、default-caller readiness、verified ledger、provider SLO satisfied、selected release cohort 或 docs updated 不能写成 completion、domain ready、App release ready 或 production ready。
- OPL ledger receipt、stage evidence workorder、provider proof 或 App drilldown projection 不能写成 MAS paper closure、MAG grant-ready、RCA visual-ready、OMA target-agent promotion 或 artifact authority。
- Private functional audit / default-caller deletion evidence 清零不能授权 domain repo physical delete。
- Refs-only adapter、diagnostic shell、tombstone/provenance code path、compatibility facade、re-export wrapper 或 default-caller duplicate 不是标准 agent 完成态。
- 文档归档不能替代实现清理。旧模块、旧接口、旧测试和旧文档入口被当前 owner surface 替代后，按 direct retirement 删除或 tombstone。

## 验证入口

Docs-only 治理最小验证：

```bash
rtk git diff --check docs/active/README.md docs/active/current-state-vs-ideal-gap.md docs/active/current-development-lines.md docs/active/production-framework-closure-gap-matrix.md docs/active/opl-foundry-agent-target-operating-architecture.md docs/active/opl-family-ideal-operating-model-redesign.md docs/docs_portfolio_consolidation.md
rtk rg -n "^(<<<<<<<|=======|>>>>>>>)" docs/active docs/docs_portfolio_consolidation.md
```

涉及 contracts/source/runtime/App 行为时，按触及 owner repo 追加 repo-native focused tests；本文自身不要求新增 Markdown wording tests。
