# OPL 当前开发 Owner Map 支撑

Owner: `One Person Lab`
Purpose: `current_owner_map_support`
State: `active_support`
Machine boundary: 本文是人读路线支撑。机器真相继续归 `contracts/`、source code、CLI/API behavior、runtime ledgers、provider receipts、domain-owned manifests 和真实 workspace / App evidence。

## 读法

当前开发线路不再作为独立 active plan 维护。OPL family 的当前目标、差距、完成口径和 active-goal baton 的唯一 active owner 是 [OPL Family 当前状态与理想目标差距](./current-state-vs-ideal-gap.md)。

本文只回答一个支撑问题：各类工作应回到哪个长期 owner。它不排序下一步、不维护路线图、不冻结 live counter、readiness 摘要、receipt id、attempt id、workorder 数、branch/worktree 或 closeout 过程。

当前 active 支撑读法必须 wrapper-aware。`framework readiness` 读 `.framework_readiness`，`framework operating-maturity` 读 `.framework_operating_maturity`，App/operator drilldown 读 `.app_operator_drilldown`，Brand L5 读 `.brand_module_l5_status`，attempt list 读 `.family_runtime_stage_attempts`。当前 durable 目标按 `functional-structure-first` 读取：active 默认先处理 source、contract、CLI/API、readback、App shell、generated surface、wrapper retirement、docs SSOT 和 no-second-truth guard；release / readiness / owner-decision hard gate 只在独立 evidence owner 维护。本文不能把 workspace binding foldback、provider capability refs-only evidence、docs foldback、source split、verified ledger、conformance pass、App projection 或 `open_count=0` 写成 owner gate 关闭。

当前 runtime 边界固定为 Codex-default executor 进入 provider-backed Stage Attempt；legacy wrapper、provenance、diagnostic、history 或 fixture 只作为支撑证据和退役语境，不进入 ordinary owner root。

原先分散的 purpose-first audit、MVP friction、Stage Native Kernel、App cockpit、wrapper retirement、OMA script-to-pack 和 domain canary 线都只按同一个 owner map 读取。已落地结构能力写回对应 owner repo；当前状态、功能/结构缺口和 active-goal baton 归 `docs/status.md` 与 `current-state-vs-ideal-gap.md`，不由本文冻结 branch、SHA、receipt id 或 closeout 流水。Ready / release / owner-decision 证据只能在独立维护入口或 owner repo evidence surface 读取；active owner 只保留功能/结构缺口、wrapper retirement gate、docs SSOT 和 support no-resurrection tail。因此不能写成 publication-ready、grant-ready、visual-ready、target-agent ready、App release-ready、domain ready、production ready 或 L5 complete。

统一目标仍是：

```text
OPL Framework current_owner_delta root
  -> One Person Lab App cockpit
  -> Foundry Agent single ordinary golden path
  -> Stage Artifact Unit progress truth
  -> domain owner receipt / typed blocker / human gate
```

审计标准回到 [OPL Family Ideal Operating Model Redesign](./opl-family-ideal-operating-model-redesign.md)：每个新优化项只能归为 `meets_target`、`needs_demotion` 或 `needs_retirement`。

## 功能/结构读入

每轮开发先读 repo source、contracts、tests、CLI/read-model 和 owner docs，不从本文继承旧数字。下列命令用于确认结构/readback边界和 false-ready guard；不要把它们返回的 evidence counters 变成本文件的 active backlog：

```bash
rtk opl framework readiness --family-defaults --json
rtk opl framework operating-maturity --family-defaults --json
rtk opl runtime app-operator-drilldown --json
rtk opl brand-modules l5-status --json
rtk opl family-runtime evidence-worklist --family-defaults --provider temporal --executor-kind codex_cli --detail full --json
rtk opl agents conformance --family-defaults --json
rtk opl agents default-callers --family-defaults --json
```

这些命令只提供 framework、App/operator、generated surface、evidence worklist、Brand L5 refs-only ledger、default-caller delete gate 和 standard-agent structural 状态。它们不能单独声明 domain ready、App release ready、Brand L5 complete、production ready、artifact authority ready 或 domain repo physical delete authorized。

当前状态、计数、receipt、attempt、workorder、workspace binding 和 provider capability evidence 的完整读法归 [OPL 当前状态](../status.md) 与 [OPL Family 当前状态与理想目标差距](./current-state-vs-ideal-gap.md)。本文只保留 owner map：读到 fresh evidence 后，应把它归入对应 owner lane，而不是在本文件维护第二套 readback 清单。

## Owner Map

| 路线 | 长期 owner | 默认落点 | 完成口径 |
| --- | --- | --- | --- |
| `current_owner_delta_default` | OPL Framework + domain owner | `current-state-vs-ideal-gap.md` | CLI/App/operator summary 只被动展示当前 owner、可读 progress refs、quality debt 与真实 hard gate。它不选择下一 stage，也不要求 closeout 格式；Codex 可继续消费 artifact。ready/currentness claim 仍回 fresh owner truth。 |
| `stage_attempt_runtime` | OPL Framework / Temporal provider | `docs/runtime/`、contracts、source | Temporal-backed provider、stage-attempt projection、stage attempt、retry/dead-letter、human gate 和 provider receipt 可恢复、可审计；`local_sqlite` 只作 retired-provider negative guard，SQLite sidecar 只作 projection/readback index。 |
| `stage_artifact_progress_truth` | OPL Framework + domain owner | `current-state-vs-ideal-gap.md`、target architecture | 任意可读 physical output 都算 progress；manifest、owner answer、pointer、hash、reviewer 或 schema 缺口只形成质量债并限制 quality/export/publication/ready 声明。provider completion 且零可读输出不算 progress。 |
| `brand_system_freeze` | OPL Charter + module owners | `contracts/opl-framework/brand-system-profile.json`、brand module refs | One Person Lab 三层产品认知、品牌模块 product grammar、Foundry Agent 命名、App 状态语言、visual/status pattern group 和 receipt/blocker 文案由 required framework contract 冻结；后续 UI/CLI/App/public surface 只能对齐或显式提出 profile 变更。Brand L5 必须另读 `.brand_module_l5_status`，verified ledger、docs foldback、App projection 或 module command pass 都不能替代 owner acceptance / live path / release-install / long-soak evidence。 |
| `standard_agent_pack_abi` | OPL Foundry Lab + pack compiler | standard skeleton contract、stage pack v2、conformance | 新 agent 和 domain repo 迁移必须满足 standard Agent Pack ABI：declarative `agent/`、machine contracts、`runtime/authority_functions/` 和 domain handler target。ABI pass 只证明标准源码入口，不等于 L5、domain ready 或 production ready。 |
| `generated_surface_consumption` | OPL generated surface owner | contracts/source/CLI/App derived surfaces | MAS/MAG/RCA/OMA 生产入口默认消费 OPL generated/hosted surfaces；CLI、MCP、OpenAI/AI SDK tools、Skill/plugin、App action、status read model 和 workbench 从同一 action/stage catalog 派生。domain repo retained wrapper 只作为 refs-only adapter、domain handler target、migration input 或 tombstone candidate。 |
| `domain_owner_delta_tail` | MAS/MAG/RCA/OMA domain owner | 各 domain active plan / owner receipt | MAS current-control / next-action admission、MAG owner-chain canary blocker evidence、RCA owner-chain canary evidence 和 OMA human-gate owner evidence tail 属于各 domain repo 的 owner surface；真实 paper、grant、visual 或 target-agent owner receipt、typed blocker、human gate、review/export receipt、no-regression ref 或 long-soak ref 才能支撑 ready / release / production 类声明。OPL/App 只记录 refs，不生成 domain answer。 |
| `app_cockpit_consumption` | One Person Lab App | `docs/product/`、App repo contract/release evidence | App 只展示和介入，消费 framework/provider 状态与 domain-owned projection；ordinary cockpit 默认只展示 purpose、task、current owner、next action、artifact 或 blocker，provider/ledger/worklist/raw receipt/release evidence 只在 full/developer detail。App release/user-path truth 仍回 App repo contracts、release artifacts 和真实 user-path evidence，不回 OPL Framework；open count、claim flags、owner work-order status 和 verified ledger receipt 都从 App drilldown / maturity live-read，不能写成 release-ready。 |
| `wrapper_retirement` | OPL cleanup gate + domain owner | default-caller delete gate、private inventory、domain repo gate、`contracts/opl-framework/private-platform-residue-owner-decisions.json` | 满足 replacement parity、no-active-caller、owner receipt / typed blocker、no-forbidden-write 和 tombstone/provenance 后删除或 tombstone；不新增 compatibility alias、facade 或 wrapper。`app_operator_drilldown.cleanup_retirement` 与 `agents default-callers` broader worklist 都是 refs-only projection；`physical_delete_authorized=false` 时不执行物理删除。private platform residue 逐项按 scheduler、queue、session store、workbench、status shell、domain wrapper、runtimeWatch、agent-lab materializer 分类；该 ledger 只读 refs，不驱动 ordinary owner delta，不写 domain truth，也不授权物理删除。 |
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
