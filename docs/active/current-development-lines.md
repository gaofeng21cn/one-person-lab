# OPL 当前开发 Owner Map 支撑

Owner: `One Person Lab`
Purpose: `current_owner_map_support`
State: `active_support`
Machine boundary: 本文是人读路线支撑。机器真相继续归 `contracts/`、source code、CLI/API behavior、runtime ledgers、provider receipts、domain-owned manifests 和真实 workspace / App evidence。
Date: `2026-06-06`

## 读法

当前开发线路不再作为独立 active plan 维护。OPL family 的当前目标、差距、完成口径和下一轮 baton 的唯一 active owner 是 [OPL Family 当前状态与理想目标差距](./current-state-vs-ideal-gap.md)。

本文只回答一个支撑问题：各类工作应回到哪个长期 owner。它不排序下一步、不维护路线图、不冻结 live counter、readiness 摘要、receipt id、attempt id、workorder 数、branch/worktree 或 closeout 过程。

当前 runtime 边界固定为 Codex-default executor 进入 provider-backed Stage Attempt；legacy wrapper、provenance、diagnostic、history 或 fixture 只作为支撑证据和退役语境，不进入 ordinary owner root。

2026-06-06 以后，原先分散的 purpose-first audit、MVP friction、Stage Native Kernel、App cockpit、wrapper retirement、OMA script-to-pack 和 domain canary 线都只按同一个 owner map 读取。已落地结构能力写回对应 owner repo；未闭合项只能保留为 domain-owned live evidence、App release/user-path evidence、wrapper retirement gate 或 support no-resurrection tail。MAS terminal `publication_handoff_owner_gate` callable 已在 MAS main 落地并吸收；它属于 `stage_artifact_progress_truth` 的结构能力。Fresh owner-route/currentness follow-through 证明 DM002 / DM003 terminal stage folder 已投影到该 gate，targeted dispatch dry-run 已到达 `publication_handoff_owner_gate.evaluate_terminal_handoff`；fresh apply/readout 被 OPL execution authorization blocker 阻断，只写出 observe-only supervision execution record，没有产生 MAS stage-native `handoff_owner_receipt.json` 或 `receipts/typed_blocker.json`。因此不能写成 publication-ready 或 stage handoff live closed。

统一目标仍是：

```text
OPL Framework current_owner_delta root
  -> One Person Lab App cockpit
  -> Foundry Agent single ordinary golden path
  -> Stage Artifact Unit progress truth
  -> domain owner receipt / typed blocker / human gate
```

审计标准回到 [OPL Family Ideal Operating Model Redesign](./opl-family-ideal-operating-model-redesign.md)：每个新优化项只能归为 `meets_target`、`needs_demotion` 或 `needs_retirement`。

## Live Truth 入口

每轮开发先读 live 机器面，不从本文继承旧数字：

```bash
rtk opl framework readiness --family-defaults --json
rtk opl runtime app-operator-drilldown --json
rtk opl family-runtime evidence-worklist --family-defaults --provider temporal --executor-kind codex_cli --detail full --json
rtk opl agents conformance --family-defaults --json
rtk opl agents default-callers --family-defaults --json
```

这些命令只提供 framework、App/operator、generated surface、evidence worklist 和 standard-agent structural 状态。它们不能单独声明 domain ready、App release ready、production ready、artifact authority ready 或 domain repo physical delete authorized。

## Owner Map

| 路线 | 长期 owner | 默认落点 | 完成口径 |
| --- | --- | --- | --- |
| `current_owner_delta_default` | OPL Framework | `current-state-vs-ideal-gap.md` | 默认 CLI/App/operator summary 只回答当前 owner、accepted answer shape、hard gate 和下一步 owner action。raw evidence、worklist、replay、typed-blocker group 和 private residue 只进入 full-detail / diagnostic。 |
| `stage_attempt_runtime` | OPL Framework / Temporal provider | `docs/runtime/`、contracts、source | Temporal-backed provider、typed queue、stage attempt、retry/dead-letter、human gate 和 provider receipt 可恢复、可审计；local provider 只作 dev/CI/offline diagnostic baseline。 |
| `stage_artifact_progress_truth` | OPL Framework + domain owner | `current-state-vs-ideal-gap.md`、target architecture | Progress 只能来自 physical output、valid manifest、owner answer 和 current pointer；provider completion、file existence、receipt count 或 conformance pass 单独不算 progress。OPL 标准层现在已有 stage_manifest / role artifact / owner receipt / typed blocker schemas、`opl stage validate` 和 StageRun profile conformance gate；MAS terminal handoff callable 已落地为 domain authority function。下一步只排序 live owner receipt / typed blocker / human gate、真实 domain canary、App cockpit consumption 和补偿链退役。 |
| `brand_system_freeze` | OPL Charter + module owners | `contracts/opl-framework/brand-system-profile.json`、brand module refs | One Person Lab 三层产品认知、九模块 product grammar、Foundry Agent 命名、App 状态语言、visual/status pattern group 和 receipt/blocker 文案由 required framework contract 冻结；后续 UI/CLI/App/public surface 只能对齐或显式提出 profile 变更。 |
| `standard_agent_pack_abi` | OPL Foundry Lab + pack compiler | standard skeleton contract、stage pack v2、conformance | 新 agent 和 domain repo 迁移必须满足 standard Agent Pack ABI：declarative `agent/`、machine contracts、`runtime/authority_functions/` 和 domain handler target。ABI pass 只证明标准源码入口，不等于 L5、domain ready 或 production ready。 |
| `generated_surface_consumption` | OPL generated surface owner | contracts/source/CLI/App derived surfaces | MAS/MAG/RCA/OMA 生产入口默认消费 OPL generated/hosted surfaces；CLI、MCP、OpenAI/AI SDK tools、Skill/plugin、App action、status read model 和 workbench 从同一 action/stage catalog 派生。domain repo retained wrapper 只作为 refs-only adapter、domain handler target、migration input 或 tombstone candidate。 |
| `domain_owner_delta_tail` | MAS/MAG/RCA/OMA domain owner | 各 domain active plan / owner receipt | MAS terminal handoff callable 已可产出 stage-native receipt/blocker，targeted dispatch dry-run 已到达该 callable；fresh apply/readout 被 OPL execution authorization blocker 阻断，尚未产生 MAS handoff owner receipt、typed blocker、human gate 或 route-back evidence。真实 paper、grant、visual 或 target-agent owner receipt、typed blocker、human gate、review/export receipt、no-regression ref 或 long-soak ref 才关闭对应 evidence tail。OPL/App 只记录 refs，不生成 domain answer。 |
| `app_cockpit_consumption` | One Person Lab App | `docs/product/`、App repo contract/release evidence | App 只展示和介入，消费 framework/provider 状态与 domain-owned projection；ordinary cockpit 默认只展示 purpose、task、current owner、next action、artifact 或 blocker，provider/ledger/worklist/raw receipt/release evidence 只在 full/developer detail。App release truth 回 App repo contracts、release artifact 和真实 user-path evidence。 |
| `wrapper_retirement` | OPL cleanup gate + domain owner | private inventory、domain repo gate | 满足 replacement parity、no-active-caller、owner receipt / typed blocker、no-forbidden-write 和 tombstone/provenance 后删除或 tombstone；不新增 compatibility alias、facade 或 wrapper。private platform residue 逐项按 scheduler、queue、session store、workbench、status shell、domain wrapper、runtimeWatch、agent-lab materializer 分类，并由 domain owner 给出 delete / keep-authority-adapter / typed-blocker refs。 |
| `support_repo_clarity` | App shell / OPL Doc support owner | support repo docs | shell 是 App renderer carrier，OPL Doc 是 workflow steward；support repo 不反向定义 OPL/App/domain truth。 |

## Direct Retirement 读法

已退役入口、旧 runtime / provider 叙事、旧产品壳路线、旧 CLI alias、repo-local generic scheduler/session/workbench/status shell、compat facade、re-export wrapper 和 compatibility-only tests 都只按当前 owner surface 判断。具体旧词和历史路线归 `docs/history/**`、tombstone 或 provenance owner；本文不保存旧路线词清单，不把它们恢复为 active topology：

- 已被 generated/hosted surface、App contract 或 domain authority function 替代：`needs_retirement`。
- 仍有 diagnostic、audit、history、proof 或 support 价值：`needs_demotion`。
- 默认路径更短、owner 更清楚、artifact / receipt / blocker 更可接力：`meets_target`。

物理删除必须逐 surface 读取 active caller、contract refs、domain owner receipt / typed blocker、no-forbidden-write 与 tombstone/provenance。OPL conformance、default-caller readiness、ledger verified 或 docs updated 只作为输入，不授权删除。

## 支撑入口

- 当前目标、差距、baton、验证入口：`current-state-vs-ideal-gap.md`。
- 顶层 operating model 与三类审计标准：`opl-family-ideal-operating-model-redesign.md`。
- 目标操作架构、primitive、acceptance gate：`opl-foundry-agent-target-operating-architecture.md`。
- 生产闭环证据门映射：`production-framework-closure-gap-matrix.md`。
- 私有平台残留分类与迁移门：`standard-agent-private-platform-inventory.md`。
- dated proof、receipt 流水、closeout 过程、退役路线来龙去脉：`docs/history/**`、runtime ledger 或提交历史。
