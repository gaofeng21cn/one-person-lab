# OPL Family Purpose-First Current Design Audit

Owner: `One Person Lab`
Purpose: `purpose_first_current_design_audit_support`
State: `active_support`
Machine boundary: 本文是人读跨仓顶层设计审计支撑。机器真相继续归各 repo 的 contracts、source、tests、CLI/read-model、runtime ledger、provider receipt、owner receipt、typed blocker、release artifact 和 domain-owned evidence。
Date: `2026-06-05`

## 读法

本文不再维护独立 re-audit 流水、closeout ledger、跨仓执行清单或下一轮计划。OPL family 的当前目标、差距、完成口径和下一轮 baton 的唯一 active owner 是 [OPL Family 当前状态与理想目标差距](./current-state-vs-ideal-gap.md)。

本文只保留目的优先审计的稳定结论：从最终产出反推，哪些 surface 必须进入默认路径，哪些只应下沉为 diagnostic / audit / support / history，哪些被替代后应进入 retirement gate。

统一审计标准回到 [OPL Family Ideal Operating Model Redesign](./opl-family-ideal-operating-model-redesign.md)。目标操作架构回到 [OPL Foundry Agent Target Operating Architecture](./opl-foundry-agent-target-operating-architecture.md)。历史审计、dated proof、fresh snapshot、worktree/branch closeout 和命令输出进入 `docs/history/**`、runtime ledger 或提交历史。

## 审计问题

按 `AI-first / executor-first / purpose-first`，OPL family 的默认设计面只应服务四件事：

1. 推动当前 owner 更快产出 answer、artifact delta、receipt、typed blocker、human gate 或 no-regression ref。
2. 保护 framework / App / domain / human / provider 的 authority boundary。
3. 支撑 durable execution、replay、audit、route-back 或 stop-loss。
4. 降低 App/operator 判断下一步的成本。

不能做到这些的 surface 不应进入 ordinary App/CLI/operator path。

## 总判断

当前 OPL family 的目标态固定为：

```text
OPL Framework -> One Person Lab App -> Foundry Agents
```

标准 Foundry Agent 的长期形态固定为：

```text
Declarative Domain Pack
  + OPL generated/hosted surfaces
  + minimal authority functions
```

从目的反推，后续优化不应再开第二套 worklist、第二 App bridge、第二 Agent Lab、第二 active plan 或更多 repo-local wrapper。更优路径是：

- 默认读面压到 `current_owner_delta`：当前有没有 safe action、等哪个 owner、缺什么 answer shape、是否 hard gate。
- Stage 内保留 Codex executor 的开放式专家工作；工具目录只声明 affordance 和边界，不写死认知流程。
- Progress 回到 Stage Artifact Unit：physical output、valid manifest、owner answer、current pointer。
- Evidence Vault 保持 passive：raw evidence、replay、typed-blocker group、provider trace 和 private residue 只能作为 full-detail / audit。
- Domain verdict 留在 domain owner：MAS paper、MAG grant、RCA visual、OMA target-agent closeout 只能由各自 owner receipt、typed blocker、human gate 或质量/导出/审查 receipt 关闭。
- Support repo 只做 support：shell 是 App renderer carrier，OPL Doc 是 workflow steward，不能反向定义 OPL/App/domain truth。

## Cross-Repo 结论

| repo | 目的优先角色 | 当前默认处置 |
| --- | --- | --- |
| `one-person-lab` | OPL Framework，持有 runtime / provider / queue / generated surface / Agent Lab / App/operator read model。 | `current_owner_delta`、Stage Artifact Unit、passive audit 和 wrapper-retirement gate 是主轴；raw count、worklist、replay、provider trace、private inventory 下沉为 diagnostic。 |
| `one-person-lab-app` | App product/release/user-path owner，消费 OPL runtime state 和 domain-owned projection。 | Ordinary path 是 Codex wrapper + Foundry Agent purpose entries；shell/provider/candidate/release proof detail 下沉为 release / diagnostic / developer detail。 |
| `med-autoscience` | MAS Research Foundry，持有医学研究 truth、publication quality、artifact/memory authority 和 owner receipt。 | 默认推进 paper/reviewer/human-gate owner delta；platform repair、read-model currentness、storage/index maintenance 只作为 ops progress。 |
| `med-autogrant` | MAG Grant Foundry，持有 grant truth、fundability / quality / export / submission gate、package authority 和 owner receipt。 | 默认推进 selected grant authoring / fundability / export / submission delta；grouped CLI、status/user-loop、Hermes proof lane 和 runtime shell 只按 explicit lane / delete gate 读取。 |
| `redcube-ai` | RCA Presentation Foundry，持有 visual truth、review/export verdict、artifact authority、visual memory authority 和 owner receipt。 | 默认 image-first visual artifact -> review/export gate；HTML/native PPTX、runtimeWatch、route variants、identity aliases 和 proof/helper tail 下沉为 explicit variant / diagnostic / retirement gate。 |
| `opl-meta-agent` | OMA Agent Foundry，产出 candidate package、developer patch work order、mechanism proposal 或 typed blocker。 | 不做第二 Framework / Agent Lab；scripts/materializer 只保 refs/smoke/work-order helper，稳定策略上收到 `agent/`、contracts、authority functions 或 OPL primitive。 |
| `opl-aion-shell` | App renderer/Electron carrier。 | 只实现 App-owned contracts；upstream AionUI multi-backend / Team / provider 叙事按 implementation provenance 读取。 |
| `opl-doc` | OPL-native workflow / doctor / profile sync steward。 | doctor clean、profile sync 或 family-plan 不能升级为 repo truth、runtime readiness 或 domain verdict。 |

## 审计分类

| 分类 | 含义 | 典型动作 |
| --- | --- | --- |
| `meets_target` | 默认路径更短，owner 更清楚，artifact / receipt / blocker 更可接力。 | 保持同源读面；防止 raw audit tail 重新进入 ordinary path。 |
| `needs_demotion` | surface 有诊断、审计、history、support 或 production hardening 价值，但不应进入 ordinary path。 | 移到 `--detail full`、diagnostic、audit、support docs、release detail 或 history/provenance。 |
| `needs_retirement` | surface 已被 generated/hosted surface、App contract 或 domain authority function 替代。 | 逐项跑 replacement parity、no-active-caller、owner receipt / typed blocker、no-forbidden-write、tombstone/provenance gate；满足后删除或 tombstone。 |

## 不再单独维护的内容

- 多轮 fresh re-audit、snapshot 表、closeout 验证命令和 branch/worktree 过程。
- 以 repo 为主的长执行 lane 清单。
- `open_worklist`、blocked envelope、typed blocker group、replay count、release cohort、provider SLO、doctor clean 等动态计数。
- 被 target architecture 或 current-state gap plan 吸收后的旧 partial/covered 对账。

这些内容需要保留时进入 `docs/history/**`、runtime ledger、提交历史或对应 owner repo 的 status / gap plan。

## Forbidden Claims

- Conformance pass、default caller readiness、generated bundle ready、provider completion、stage replay refs、doctor clean 或 docs updated 不能写成 domain ready、App release ready、production ready 或 physical delete authority。
- OPL/App/Doctor/schema/provider 不能替代 MAS paper quality、MAG grant submission readiness、RCA visual review/export verdict 或 OMA target owner closeout。
- Retained refs-only adapter、diagnostic shell、tombstone/provenance code path、compatibility facade、re-export wrapper 或 default-caller duplicate 不是标准 agent 完成态。
- Support repo 不进入 Foundry Agent core truth owner set。

## 验证方式

Docs-only 审计支撑最小验证：

```bash
rtk git diff --check docs/active/opl-family-purpose-first-current-design-audit.md
rtk rg -n "^(<<<<<<<|=======|>>>>>>>)" docs/active/opl-family-purpose-first-current-design-audit.md
```

触及 source/contracts/runtime/App behavior 时，按对应 owner repo 追加 repo-native focused tests。本文自身不新增 Markdown wording tests。
