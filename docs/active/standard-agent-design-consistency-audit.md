# OPL 系列智能体设计同源与历史残留审计

Owner: `One Person Lab`
Purpose: `foundry_agent_design_consistency_audit`
State: `active_audit`
Machine boundary: 本文是人读审计记录。机器真相继续归 `contracts/`、domain-owned contracts、CLI/API 行为、runtime ledger、provider receipt、domain-owned manifest 和真实 workspace / App evidence。
Date: `2026-06-01`

## 审计问题

本轮审计回答两个问题：

- MAS / MAG / RCA / OMA 作为智能体本身，设计逻辑是否同源、一致，是否看起来像从一开始就是 OPL Foundry Agent，而不是后来被 OPL 收编。
- active surface 中是否仍有历史残留，尤其是旧 scheduler / runner / daemon / attempt loop / gateway / wrapper / facade / compat alias / repo-local generic platform shell。

审计范围是 `/Users/gaofeng/workspace/med-autoscience`、`/Users/gaofeng/workspace/med-autogrant`、`/Users/gaofeng/workspace/redcube-ai`、`/Users/gaofeng/workspace/opl-meta-agent`，并以本仓 OPL shared contracts / readiness / descriptor read model 为顶层对照。

## 结论

结构同源结论：`passed`。

四个 agent 都已对齐同一个 OPL Foundry Agent series 设计签名：canonical `opl_foundry_agent_series_design_profile.v1`、同一 lifecycle pipeline、同一 stage pack sections、同一 success / typed-blocker / route-back closeout shape、同一 authority invariants 和同一 Progress-First policy release fingerprint。领域差异现在落在 `domain_specific_profile`、stage/action contracts、authority refs 和各自 agent pack 中。

历史残留结论：默认 active blocker 为 `0`，但 full-detail deletion / purity tail 仍存在。

`opl agents conformance --family-defaults --json` 显示 4/4 passed、0 blocked，并且 MAS/MAG/RCA/OMA 的 physical morphology、workspace lifecycle 和 active forbidden name residue 都通过。这个结论说明默认入口不再把旧平台面当作当前设计，但不能声明“物理删除全部完成”。Full-detail `opl agents descriptors --json` 仍只覆盖 MAS/MAG/RCA 三个 descriptor；OMA 单仓 conformance 通过，但未进入当前 unified descriptor index，属于统一外观风险。MAS/MAG/RCA/OMA 的 active docs/contracts 也仍明确保留 refs-only adapter、domain handler target、materializer/helper 或 bridge-exit tail；这些尾项应继续按 no-resurrection / physical-delete / evidence tail 管理，不能包装成长期合理组成。

## 设计同源证据

OPL 顶层 status 已把公开角色固定为 `OPL Framework -> One Person Lab App -> Foundry Agents`，并要求 MAS/MAG/RCA/OMA 共享同一 series design profile 和 lifecycle；OPL 只消费 refs，不写 domain body、truth、artifact、owner receipt 或 quality verdict。见 `docs/status.md:11-19`。

OPL series contract 的 shared profile 固定如下：`domain_material_intake -> domain_pack_interpretation -> stage_led_agent_execution -> independent_quality_gate_or_owner_review -> owner_receipt_or_typed_blocker_closeout -> artifact_or_deliverable_handoff -> opl_refs_only_projection_and_recovery`；provider completion 不是 closeout；OPL 不能推断 domain output、读取 domain body、写 domain truth 或授权 quality/export。见 `contracts/opl-framework/foundry-agent-series-contract.json:1-120`。

OPL standard skeleton contract 要求 repo source 形态为 `agent`、`contracts`、`runtime`、`docs`，其中 `runtime` 只允许 minimal authority functions、domain handler targets、opaque ref projection outputs 和必要 native helpers；generated sidecar/status/workbench/lifecycle/queue/ledger/dispatch shells 归 OPL。见 `contracts/opl-framework/standard-domain-agent-skeleton-contract.json:1-52`。

OPL skeleton 还把 scheduler、provider wakeup transport、queue attempt ledger、generic transition runner、workspace/source shell、memory/writeback transport、artifact/package lifecycle shell、operator workbench shell、observability repair、generic persistence、runtime lifecycle SQLite index、native helper envelope、review repair transport、pack compiler generated surface 和 functional privatization audit 明确列为 OPL-owned generic primitives。见 `contracts/opl-framework/standard-domain-agent-skeleton-contract.json:119-209`。

各 domain contract 现状：

| Agent | shared profile / policy | pack / stage shape | owner boundary |
| --- | --- | --- | --- |
| MAS | `contracts/foundry_agent_series.json` 使用 canonical profile、同一 policy fingerprint；MAS status 说明医学差异只在 domain-specific profile / stage/action / authority refs 中。 | `pack_compiler_input` 列出 20 个 semantic pack path，conformance stage count 为 6。 | MAS 持有医学 truth、AI reviewer gate、publication route、memory body、artifact/package authority、owner receipt / typed blocker。见 `/Users/gaofeng/workspace/med-autoscience/docs/status.md:24-30`。 |
| MAG | `contracts/foundry_agent_series.json` 使用 canonical profile、同一 policy fingerprint；MAG status 明确与 MAS/RCA/OMA 共享生命周期。 | `pack_compiler_input` 列出 21 个 semantic pack path，conformance stage count 为 6。 | MAG 持有 grant truth、fundability / quality / export verdict、package authority、memory accept/reject、owner receipt / typed blocker。见 `/Users/gaofeng/workspace/med-autogrant/docs/status.md:11-16`。 |
| RCA | `contracts/foundry_agent_series.json` 使用 canonical profile、同一 policy fingerprint；RCA status 明确 visual 差异留在 domain-specific profile / stage/action / authority refs。 | `pack_compiler_input` 列出 28 个 semantic pack path，conformance stage count 为 6。 | RCA 持有 visual truth、review/export verdict、artifact authority、visual memory accept/reject 和 owner receipt。见 `/Users/gaofeng/workspace/redcube-ai/docs/status.md:12-20` 与 `:36-39`。 |
| OMA | `contracts/foundry_agent_series.json` 使用 canonical profile、同一 policy fingerprint；OMA status 明确 agent-building 差异和 target-agent boundary 留在 domain-specific profile / stage/action / authority refs。 | `pack_compiler_input` 列出 37 个 semantic pack path，conformance stage count 为 11。 | OMA 只做 target-agent foundry / repair / takeover materializer 和 typed blocker，不写目标 domain truth、artifact body、memory body、quality/export verdict 或 owner receipt。见 `/Users/gaofeng/workspace/opl-meta-agent/docs/status.md:12-20` 与 `:49-55`。 |

Live conformance snapshot：

```text
cmd: ./bin/opl agents conformance --family-defaults --json
summary: total_repo_count=4, passed_count=4, blocked_count=0, structural_conformance_status=passed
MAS: pack_path_count=20, stage_count=6, physical_status=passed, active_forbidden_name_residue_count=0, workspace_lifecycle_status=passed
MAG: pack_path_count=21, stage_count=6, physical_status=passed, active_forbidden_name_residue_count=0, workspace_lifecycle_status=passed
RCA: pack_path_count=28, stage_count=6, physical_status=passed, active_forbidden_name_residue_count=0, workspace_lifecycle_status=passed
OMA: pack_path_count=37, stage_count=11, physical_status=passed, active_forbidden_name_residue_count=0, workspace_lifecycle_status=passed
```

## 历史残留审计

默认面没有 active forbidden name residue 或 structural blocker。该结论来自 conformance structural gate，不等于 full-detail physical deletion complete。

MAS：active docs 明确 OPL/Temporal 是默认 hosted autonomous runtime，MDS / DeepScientist 只作为 provenance、historical fixture、archive import、backend audit、upstream learning 和 parity oracle，不是默认 backend；MAS 不得新增或恢复 generic daemon/scheduler/attempt loop/queue owner。见 `/Users/gaofeng/workspace/med-autoscience/docs/status.md:18-20`、`/Users/gaofeng/workspace/med-autoscience/docs/status.md:29-31`、`/Users/gaofeng/workspace/med-autoscience/docs/invariants.md:15-24`。

MAG：active status 明确 OPL 持有 Temporal-backed runtime、typed queue、scheduler/daemon、attempt ledger、generic transition runner、workspace/source shell、memory locator、artifact/package lifecycle shell、operator projection、observability/SLO、generated wrapper 和 App/workbench shell；product-entry / domain_handler / grouped CLI / projection / lifecycle wrapper 只能作为 direct domain handler、refs-only adapter、native helper target 或 migration input，长期 owner 是 OPL generated/hosted surface，physical-delete 未授权。见 `/Users/gaofeng/workspace/med-autogrant/docs/status.md:15-16` 与 `:39-50`。

RCA：active status 明确旧 repo-local managed runtime 物理实现已删除，active source/package/test surface 不再保留内部 managed runtime fixture；但 product-entry-continuity adapter、runtimeWatch read model、domain handler guarded actions、operator evidence/stability projection、native helper envelope、MCP/CLI/product-entry wrapper 和 `@redcube/domain-entry` package boundary 仍只能按 refs-only adapter、domain handler target、native helper implementation、fixture、diagnostic 或 package/protocol boundary读取，后续继续 rename/delete/tombstone。见 `/Users/gaofeng/workspace/redcube-ai/docs/status.md:14-20` 与 `:64-74`。

OMA：active status 明确 tracked active source 不保留 repo-owned generic runtime、generated shell、workbench、sidecar 或 compatibility surface；`scripts/*` 仍是 materializer / smoke helper / authority implementation refs，并被约束为非长期 generic 组成，不能成为长期 private runner、promotion engine、workbench、compat facade 或 generated wrapper materializer。见 `/Users/gaofeng/workspace/opl-meta-agent/docs/status.md:8-16` 与 `:49-66`。

Full-detail descriptor snapshot：

```text
cmd: ./bin/opl agents descriptors --json
summary: total_projects_count=3, descriptor_surfaces_resolved_count=3, blocked_count=0
descriptors: med-autogrant/mag, med-autoscience/mas, redcube_ai/rca
functional_privatization_active_private_generic_residue_count=0
functional_privatization_blocker_count=0
functional_privatization_default_watchlist_count=0
functional_privatization_default_hidden_cleared_count=47
functional_privatization_private_platform_residue_inventory_count=25
```

该 snapshot 的读法是：默认 descriptor 面对 MAS/MAG/RCA 无 blocker；private platform residue inventory 已被清空为 action-required=0 / hidden-cleared，但 full-detail 仍保留 25 个历史/bridge/residue 分类项用于审计。OMA 没有进入 `opl agents descriptors` 默认 index，虽然 `opl agents conformance --family-defaults` 已覆盖并通过 OMA。

## 风险与下一步

1. OMA 统一发现面风险：`opl agents descriptors --json` 当前只列 MAS/MAG/RCA，`opl agents descriptor --domain opl-meta-agent|oma --json` 返回 unknown domain。OMA 的 conformance 和 production-consumption 可读，但 descriptor index 外观还不像“一开始就是同一套 OPL Foundry Agent”。应把 OMA 纳入统一 descriptor index，或在 OPL docs/CLI 中明确 descriptor index 只覆盖 domain delivery agents，OMA 走 agent-foundry consumption read model。

2. Full-detail residue 命名风险：MAS/MAG/RCA 的 private platform residue inventory、RCA executor adapter bridge-exit、MAG product-entry/domain_handler wrapper、MAS domain-handler/product-entry projection 等仍会在 full detail 中出现。当前分类是 refs-only adapter / migration input / diagnostic / provenance，没有 active blocker；后续 strict source-purity lane 仍要继续按 no-active-caller、owner receipt、no-forbidden-write、replacement parity 后 rename/delete/tombstone，避免读者误认为这些是长期标准组成。

3. 历史叙事复活风险：MAS 的 MDS/DeepScientist/Hermes、MAG 的 old Gateway/local manager、RCA 的 managed/runtime/gateway/session terminology、OMA 的 scripts/materializer 都已有 active docs 约束，但任何新文档、contract、CLI help 或 test fixture 如果把它们写成默认 owner、default runtime、generic scheduler、generated shell 或 product wrapper，都应 fail closed。

4. 证据尾项不能混成结构缺口：当前结构同源已经通过；剩余应按 production evidence tail 管理，包括 MAS real paper chain、MAG grant-stage human gate / sustained App consumption / long-soak、RCA visual long-soak / repeated no-regression、OMA real target patch-loop / registry/App/live consumption。不要再把 conformance pass、descriptor ready、provider proof 或 refs-only ledger verified 写成 domain ready、artifact ready、quality/export ready 或 production ready。

## 推荐判定

如果问题是“设计逻辑是否已经统一成 OPL 原生 Foundry Agent”，答案是：是，结构层已经统一。

如果问题是“是否已经没有任何历史残留”，答案是：默认 active surface 没有 structural blocker；full-detail/source-purity 仍有删除尾项和 OMA descriptor-index 外观风险。下一步不应再补抽象原则，而应补 OMA descriptor index 一致性，并继续按各仓 active gap plan 清 refs-only adapter / wrapper / bridge-exit 的 physical deletion tail。
