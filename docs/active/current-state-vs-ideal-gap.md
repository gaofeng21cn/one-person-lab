# OPL Family 当前状态与理想目标差距

Owner: `One Person Lab`
Purpose: `family_ideal_state_gap_plan`
State: `active_plan`
Machine boundary: 本文是人读 gap / completion map。机器真相继续归 `contracts/`、源码、CLI/API 行为、runtime ledger、provider receipt、domain-owned manifest、真实 workspace 与 App 证据。
Date: `2026-05-24`

## 读法

- 本文是 OPL family 当前目标、完成进度、功能/结构差距、测试/证据差距和下一轮 baton 的唯一 active owner。
- North-star 目标态回到 [OPL 与 Foundry Agents 理想目标态](../references/runtime-substrate/opl-family-agent-ideal-state.md)；核心公开角色、runtime 边界和默认入口回到 `project/status/architecture/invariants/decisions`。
- 过程 proof、dated closeout、worktree/branch、receipt 流水和历史长清单进入 [OPL family 文档过程归档 2026-05](../history/process/plans/2026-05-18-opl-family-doc-process-history.md) 或其他 `docs/history/**`。
- 本文不冻结瞬时 counters。当前读数从 `opl framework readiness --family-defaults --json`、`opl agents conformance --family-defaults --json`、`opl runtime app-operator-drilldown --json` 和 evidence ledger 命令读取。
- 功能/结构差距按目标态判断；测试/证据差距只记录目标结构已正确但仍缺真实运行、owner receipt、long-soak、no-regression 或用户路径证据的事项。

## 当前唯一真相

OPL family 的目标形态已经明确：`OPL Framework -> One Person Lab App -> Foundry Agents`。

- `OPL Framework` 是完整 stage-led 智能体开发/运行框架，持有 Codex-default activation、Temporal-backed provider、typed queue、stage attempt、receipt/projection、generated/hosted surfaces、Agent Lab 和 App/operator read model。
- `One Person Lab App` 是人用工作台，只消费 framework/provider 状态和 domain-owned projection，展示任务、阶段、阻塞、source/artifact/memory refs、SLO、repair、workorder 和 owner-aware action。
- `MAS`、`MAG`、`RCA` 是当前 Foundry Agents，持有各自 domain truth、quality/export verdict、artifact authority、memory body、owner receipt 和 direct app skill path。
- `OPL Meta Agent` 是 Agent Foundry / new-agent builder/tester module，不持有 MAS/MAG/RCA 的领域真相。

标准 Foundry Agent 的目标源码形态是：

```text
Declarative Domain Pack
  + OPL generated/hosted surfaces
  + standard authority functions
```

`Codex CLI` 是当前第一公民 executor。Temporal-backed provider 是 production online runtime 的必需 substrate；`local_sqlite` 只允许作为 dev/CI/offline diagnostic baseline。`hermes_agent`、`claude_code`、`antigravity_cli` 等只能作为显式非默认 executor adapter/backend。

## 当前完成进度

| Area | 当前进度 | 当前读法 |
| --- | --- | --- |
| OPL framework control plane | `landed_with_evidence_tail` | Temporal provider path、typed queue、stage attempt ledger、safe action shell、refs-only evidence ledger、App/operator drilldown、Agent Lab、pack compiler 和 conformance/readiness 读面已经是 framework 主干；不能写成 production ready。 |
| Standard agent structural conformance | `passed_with_production_evidence_tail` | Fresh `opl agents conformance --family-defaults --json` 显示 4 个 repo 通过、0 个 repo blocked，active forbidden-name residue 清零；结构通过不等于 production caller / long soak 通过。 |
| App/user path evidence | `user_path_evidence_ready` | App release/user-path ledger 已验证同 cohort release package、screenshot、reload prompt、provider linkage 与 long operator evidence；`framework readiness` 读为 App user-path evidence ready，但 `release_ready_claimed=false`、`production_ready_claimed=false`，不等于 App release ready。 |
| OMA/new agent consumption | `production_consumption_ready` | New-agent scaffold/structural consumption、managed install/update、App live path、owner receipt/typed blocker scaleout 和 verified long-soak 已进入读面；OMA production-consumption ready 不授权 MAS/MAG/RCA 或 family production ready。 |
| Domain production evidence | `partial` | MAS/MAG/RCA 的 owner receipt refs、typed blocker refs、no-regression refs 可进入 OPL refs-only ledger；worklist/readiness 已把重复 domain-owned typed blocker refs 作为 attention group 去重展示，同时保留 raw item / envelope 审计数量；真实 paper/grant/visual owner-chain、memory/artifact/lifecycle receipt 和 repeated no-regression 仍需扩面。 |
| Docs lifecycle | `current_doc_compacted` | 本文只保留当前真相、当前 gap 和下一步；已闭合 lane、历史 proof 和细节长清单不再作为 active plan 展开。 |

## 功能/结构差距

| gap | 当前状态 | 完成口径 |
| --- | --- | --- |
| `generated_surface_default_consumption` | OPL 已能从 descriptor/stage/action/memory/artifact metadata 生成或投影 CLI、MCP、Skill/product-entry、sidecar、status、session、workbench、harness 等 surface。 | MAS/MAG/RCA 的生产默认 caller 使用 OPL generated/hosted surfaces；repo-local wrapper 只剩 domain handler、refs-only adapter、authority function、diagnostic 或 tombstone。 |
| `domain_private_platform_retirement` | OPL 已能审计 MAS/MAG/RCA standard pack、authority functions、private platform residue、semantic equivalence 和 forbidden generic owner flags。 | 任何 repo-local scheduler、queue、attempt ledger、session store、workspace/source shell、artifact/memory lifecycle shell、workbench 或 generated wrapper owner 都完成上收、替换、收薄或 tombstone。 |
| `MAS_physical_thinning` | MAS 默认 runtime owner 已回到 OPL provider-backed stage runtime；旧 runtime transport、runner、worker lease、SQLite lifecycle writer 只按 retired/no-resurrection 读取。 | product/status/workbench、owner-route handoff、progress/domain-ref projection 等仍有 caller 的 residue 在 no-active-caller、OPL replacement parity、MAS receipt parity、no-forbidden-write 和 focused tests 成立后删除、archive 或 tombstone。 |
| `MAG_wrapper_shell_retirement` | MAG repo-side handler/ref-only/authority boundary 已闭合；product-entry、status/user-loop、sidecar、domain_runtime、lifecycle/projection shell 仍是 active direct path 或 migration input。 | OPL generated/default caller 与 App/default consumption 有真实证据后，MAG 只保留 grant authority functions、domain handler target、refs-only adapter 或 tombstone。 |
| `RCA_naming_and_adapter_hygiene` | RCA generated/hosted shell、legacy cleanup 和 visual authority boundary 已清晰；旧 session/store/managed/runtime/gateway 命名已降到 retired/provenance/tombstone 语境。 | active source 命名继续收敛为 visual authority implementation、native helper、domain handler target 或 refs-only adapter；不恢复 compatibility alias。 |
| `App_workbench_user_path` | App/operator drilldown、safe action route、payload workorder、App release/user-path evidence ledger 已可用，且 `26.5.19` 同 cohort 五类 evidence 已 verified。 | 保持同 cohort evidence 可重复证明；App 不生成 release-ready 或 production-ready verdict，App release owner boundary 仍需单独关闭。 |
| `OMA_production_consumption` | OMA structural consumption、App live-path evidence、owner receipt / typed blocker scaleout 和 verified long-soak 已进入读面。 | 继续用真实 target patch/rerun/owner receipt 样本验证 OMA consumption；OMA ready 不授权目标 domain ready、family production ready 或默认 promotion。 |
| `memory_artifact_lifecycle_apply` | OPL 只持 locator/index/ledger/ref transport；domain 持 body、mutation authority、accept/reject 和 final verdict。App/operator 与 framework attention-first 读面已把 memory refs、memory writeback receipt refs、domain-dispatch memory writeback refs、artifact/package/export refs、lifecycle index refs、restore proof refs 和 domain artifact mutation receipt refs 统一投影为 refs-only 计数。 | MAS/MAG/RCA 在真实 workspace 形成 accepted/rejected memory writeback、artifact mutation、cleanup/restore/retention 和 lifecycle receipts；默认读面 observed 计数不等于 owner-chain、artifact authority、quality/export verdict 或 long-soak 完成。 |

## 证据差距

| evidence gate | 当前读法 | 完成口径 |
| --- | --- | --- |
| Provider long SLO | Temporal provider cadence/capability SLO 已有机器读面；读数以 `framework readiness` 和 App drilldown 为准。 | 持续窗口 satisfied，并在真实 domain owner-chain dispatch 中保持 restart re-query、signal history、typed closeout、retry/dead-letter 和 no-forbidden-write proof。 |
| App long operator evidence | `26.5.19` 同 cohort long operator evidence 已 verified，并使 App user-path evidence ready。 | 后续只需守住同 cohort 规则和 release-owner boundary；不把 user-path evidence ready 写成 App release ready。 |
| OMA long soak | OMA production-consumption ledger 已观察 verified real long-soak ref。 | 后续只需守住 refs-only intake 和 target-owner authority boundary；不把 OMA ready 写成 family/domain production ready。 |
| MAS real paper chain | MAS guarded-apply、owner-route、aftercare、default-executor typed blocker payload 可被 OPL record/verify 消费。 | 多条真实 paper line 产生 progress delta、AI reviewer update、artifact delta、human gate、stop-loss、owner receipt 或 stable typed blocker。 |
| MAG grant soak | MAG transition oracle、owner receipt contract、refs-only handoff 边界清晰。 | 真实 OPL-hosted grant-stage attempt 持续返回 grant-owned receipt、typed blocker 或 no-regression evidence。 |
| RCA visual soak | RCA transition/evidence fixture、refs-only projection 和 visual authority boundary 清晰。 | 真实 artifact-producing owner receipt、visual memory reuse、workspace receipt scaleout 和 repeated no-regression evidence。 |
| Cross-family regression | MAS/MAG/RCA/OMA structural conformance 与 generated/readiness consumer boundary 可读。 | direct/hosted parity、generated default consumption、legacy no-active-caller、no-forbidden-write 和 release/dist consumption 反复通过。 |

## 下一轮 Agent prompt

Objective:

- 推进 OPL family production-evidence tranche。每轮先读 fresh machine truth，再只修改仍 open 的功能/结构差距或证据差距；完成后把 durable current truth 折回本文、核心五件套或对应 repo-owned active plan。

Write scope:

- `one-person-lab` 的 active truth owner、核心五件套、contracts/source/tests、runtime read model 与 App/operator projection；必要时同步 MAS/MAG/RCA/OMA repo-owned active plan 中对应的 current truth。

Live truth inputs:

- `TASTE.md`、核心五件套、本文、`docs/docs_portfolio_consolidation.md`、`docs/active/opl-family-development-reference.md`。
- `opl framework readiness --family-defaults --json`、`opl agents conformance --family-defaults --json`、`opl runtime app-operator-drilldown --json`、`opl family-runtime evidence-worklist --family-defaults --provider temporal --executor-kind codex_cli --detail full --json`。
- MAS/MAG/RCA/OMA repo-owned contracts、generated handoff、production acceptance、owner receipt / typed blocker refs 和 focused verification。

优先顺序：

1. 读取 `opl framework readiness --family-defaults --json`、`opl runtime app-operator-drilldown --json`、`opl family-runtime evidence-worklist --family-defaults --provider temporal --executor-kind codex_cli --detail full --json`，确认当前 open gate。
2. 继续把 `opl agents conformance --family-defaults --json` 作为结构回归守门；若 fresh conformance hard blocker 重新出现，先处理 blocker，再推进证据尾项。
3. 推进 MAS/MAG/RCA repo-owned production caller、owner receipt、typed blocker、memory/artifact/lifecycle receipt、no-regression 和 live long-soak evidence。
4. 推进 Developer Mode non-owner fork/PR owner acceptance 与 App release-ready owner boundary；App user-path evidence ready 不等于 App release ready。
5. 在 default caller / no-active-caller / replacement parity / owner receipt parity 成立后，删除、archive 或 tombstone repo-local generic residue，不新增兼容面。

Non-goals:

- 不把 provider proof、generated surface proof、conformance pass、refs-only ledger verified、doctor clean 或 workorder accounting closed 写成 domain ready、App release ready 或 production ready。
- 不恢复 gateway/frontdoor/Hermes-first、compatibility alias、facade、wrapper 或旧默认入口。
- 不把 MAS/MAG/RCA 的 domain truth、quality/export verdict、artifact body、memory body 或 owner receipt authority 上收到 OPL。

Verification commands:

- Docs-only：`rtk git diff --check`、`rtk rg -n "<<<<<<<|>>>>>>>|=======" docs`。
- 触及 source/contracts/runtime/App 时追加：`rtk ./scripts/verify.sh`、`rtk npm run test:fast`、`rtk npm run test:meta`、`rtk npm run test:artifact`、`rtk opl framework readiness --family-defaults --json`、`rtk opl runtime app-operator-drilldown --json`。

Completion gate:

- 本轮关闭的 gap 已从本文重写为当前完成进度或移出 active path；仍 open 的 production evidence tail 保持在功能/结构差距或证据差距中。
- 所有 worktree lane 已吸收回 `main` 或明确标记为近期写入/有未提交改动而保留；最终在 `main` checkout 上完成最小充分验证。

Foldback target:

- Durable current truth 折回本文、核心五件套或对应 repo-owned active plan；过程 proof、receipt id、命令流水、worktree/branch 细节进入 `docs/history/**`、runtime ledger、提交历史或 automation memory。

## 验证入口

Docs-only 治理最小验证：

```bash
rtk git diff --check
rtk rg -n "<<<<<<<|>>>>>>>|=======" docs
```

涉及 contracts/source/runtime/App 的变更按触及面补跑：

```bash
rtk ./scripts/verify.sh
rtk npm run test:fast
rtk npm run test:meta
rtk npm run test:artifact
rtk opl framework readiness --family-defaults --json
rtk opl runtime app-operator-drilldown --json
rtk git status --short
```

## 当前不能写成

- OPL 已全量 production ready。
- Temporal provider proof 等于 MAS paper closure、MAG grant readiness 或 RCA visual ready。
- Structural conformance 通过等于 production evidence tail 关闭。
- App selected cohort、verified package/provider refs、typed blocker refs、partial observed gates 或 user-path evidence ready 等于 App release ready / production ready。
- Workorder accounting、stage evidence route、domain-dispatch refs-only receipt 或 legacy cleanup ledger 等于真实 owner-chain、expected receipt instance、monitor freshness、artifact mutation 或 long-soak evidence。
- Blocked cleanup plan / route-back blocker 等于 production evidence complete，或等于 domain typed blocker。
- Private functional audit 分类完成等于 domain repo 物理代码路径清零。
- Descriptor ready、read model ready、generated bundle ready、provider completion 或 cleanup proof 等于 domain ready、artifact ready、quality/export/fundability/visual verdict。
- 为兼容保留旧模块、旧接口、旧测试、旧 CLI alias、facade 或 wrapper；active caller 迁走后直接删除或进入 history/tombstone。
