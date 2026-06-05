# OPL 当前开发线路支撑

Owner: `One Person Lab`
Purpose: `current_execution_map_support`
State: `active_support`
Machine boundary: 本文是人读路线支撑。机器真相继续归 `contracts/`、source code、CLI/API behavior、runtime ledgers、provider receipts、domain-owned manifests 和真实 workspace / App evidence。
Date: `2026-06-05`

## 读法

当前开发线路不再作为独立 active plan 维护。OPL family 的当前目标、差距、完成口径和下一轮 baton 的唯一 active owner 是 [OPL Family 当前状态与理想目标差距](./current-state-vs-ideal-gap.md)。

本文只回答一个支撑问题：当唯一 active owner 需要排序下一步时，各类工作应回到哪个长期 owner。本文不冻结 live counter、readiness 摘要、receipt id、attempt id、workorder 数、branch/worktree 或 closeout 过程。

当前 runtime 边界固定为 Codex-default executor 进入 provider-backed Stage Attempt；legacy wrapper、provenance、diagnostic、history 或 fixture 只作为支撑证据和退役语境，不进入 ordinary owner root。

统一目标仍是：

```text
OPL Framework current_owner_delta root
  -> One Person Lab App cockpit
  -> Foundry Agent single ordinary golden path
  -> Stage Artifact Unit progress truth
  -> domain owner receipt / typed blocker / human gate
```

审计标准回到 [OPL Family Ideal Operating Model Redesign](./opl-family-ideal-operating-model-redesign.md)：每个新优化项只能归为 `meets_target`、`needs_demotion` 或 `needs_retirement`。

## Live Truth 读取

每轮开发先读 live 机器面，不从本文继承旧数字：

```bash
rtk opl framework readiness --family-defaults --json
rtk opl runtime app-operator-drilldown --json
rtk opl family-runtime evidence-worklist --family-defaults --provider temporal --executor-kind codex_cli --detail full --json
rtk opl agents conformance --family-defaults --json
rtk opl agents default-callers --family-defaults --json
```

这些命令只提供 framework、App/operator、generated surface、evidence worklist 和 standard-agent structural 状态。它们不能单独声明 domain ready、App release ready、production ready、artifact authority ready 或 domain repo physical delete authorized。

## 路线分层

| 路线 | 长期 owner | 默认落点 | 完成口径 |
| --- | --- | --- | --- |
| `current_owner_delta_default` | OPL Framework | `current-state-vs-ideal-gap.md` | 默认 CLI/App/operator summary 只回答当前 owner、accepted answer shape、hard gate 和下一步 owner action。raw evidence、worklist、replay、typed-blocker group 和 private residue 只进入 full-detail / diagnostic。 |
| `stage_attempt_runtime` | OPL Framework / Temporal provider | `docs/runtime/`、contracts、source | Temporal-backed provider、typed queue、stage attempt、retry/dead-letter、human gate 和 provider receipt 可恢复、可审计；local provider 只作 dev/CI/offline diagnostic baseline。 |
| `stage_artifact_progress_truth` | OPL Framework + domain owner | `current-state-vs-ideal-gap.md`、target architecture | Progress 只能来自 physical output、valid manifest、owner answer 和 current pointer；provider completion、file existence、receipt count 或 conformance pass 单独不算 progress。 |
| `generated_surface_consumption` | OPL generated surface owner | contracts/source/CLI/App derived surfaces | MAS/MAG/RCA/OMA 生产入口消费 OPL generated/hosted surfaces；domain repo retained wrapper 只作为 refs-only adapter、domain handler target、migration input 或 tombstone candidate。 |
| `domain_owner_delta_tail` | MAS/MAG/RCA/OMA domain owner | 各 domain active plan / owner receipt | 真实 paper、grant、visual 或 target-agent owner receipt、typed blocker、human gate、review/export receipt、no-regression ref 或 long-soak ref 关闭对应 evidence tail。 |
| `app_cockpit_consumption` | One Person Lab App | `docs/product/`、App repo contract/release evidence | App 只展示和介入，消费 framework/provider 状态与 domain-owned projection；App release truth 回 App repo contracts、release artifact 和真实 user-path evidence。 |
| `wrapper_retirement` | OPL cleanup gate + domain owner | private inventory、domain repo gate | 满足 replacement parity、no-active-caller、owner receipt / typed blocker、no-forbidden-write 和 tombstone/provenance 后删除或 tombstone；不新增 compatibility alias、facade 或 wrapper。 |
| `support_repo_clarity` | App shell / OPL Doc support owner | support repo docs | shell 是 App renderer carrier，OPL Doc 是 workflow steward；support repo 不反向定义 OPL/App/domain truth。 |

## Direct Retirement 读法

旧 gateway/frontdoor/federation/Hermes-first/local-manager wording、旧 CLI alias、repo-local generic scheduler/session/workbench/status shell、compat facade、re-export wrapper 和 compatibility-only tests 都只按当前 owner surface 判断：

- 已被 generated/hosted surface、App contract 或 domain authority function 替代：`needs_retirement`。
- 仍有 diagnostic、audit、history、proof 或 support 价值：`needs_demotion`。
- 默认路径更短、owner 更清楚、artifact / receipt / blocker 更可接力：`meets_target`。

物理删除必须逐 surface 读取 active caller、contract refs、domain owner receipt / typed blocker、no-forbidden-write 与 tombstone/provenance。OPL conformance、default-caller readiness、ledger verified 或 docs updated 只作为输入，不授权删除。

## 文档落点

- 当前目标、差距、baton、验证入口：`current-state-vs-ideal-gap.md`。
- 顶层 operating model 与三类审计标准：`opl-family-ideal-operating-model-redesign.md`。
- 目标操作架构、primitive、acceptance gate：`opl-foundry-agent-target-operating-architecture.md`。
- 生产闭环证据门映射：`production-framework-closure-gap-matrix.md`。
- 私有平台残留分类与迁移门：`standard-agent-private-platform-inventory.md`。
- dated proof、receipt 流水、closeout 过程、旧路线来龙去脉：`docs/history/**`、runtime ledger 或提交历史。
