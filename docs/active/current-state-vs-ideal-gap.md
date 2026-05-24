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
| Standard agent structural conformance | `structurally_passed` | Fresh `opl agents conformance --family-defaults --json` 显示已收录 repos 的 structural conformance 通过，并把 production evidence tail 分开报告；结构通过不等于 production caller / long soak 通过。 |
| App/user path evidence | `partial` | App release/user-path ledger 能记录/验证 release package、screenshot、reload prompt、provider linkage、long operator evidence 或 typed blocker refs；当前重点仍是同 cohort long operator evidence。 |
| OMA/new agent consumption | `partial` | New-agent scaffold/structural consumption、managed install/update、App live path、owner receipt/typed blocker scaleout 已进入读面；production-consumption tail 仍是 verified long-soak refs。 |
| Domain production evidence | `partial` | MAS/MAG/RCA 的 owner receipt refs、typed blocker refs、no-regression refs 可进入 OPL refs-only ledger；真实 paper/grant/visual owner-chain、memory/artifact/lifecycle receipt 和 repeated no-regression 仍需扩面。 |
| Docs lifecycle | `current_doc_compacted` | 本文只保留当前真相、当前 gap 和下一步；已闭合 lane、历史 proof 和细节长清单不再作为 active plan 展开。 |

## 功能/结构差距

| gap | 当前状态 | 完成口径 |
| --- | --- | --- |
| `generated_surface_default_consumption` | OPL 已能从 descriptor/stage/action/memory/artifact metadata 生成或投影 CLI、MCP、Skill/product-entry、sidecar、status、session、workbench、harness 等 surface。 | MAS/MAG/RCA 的生产默认 caller 使用 OPL generated/hosted surfaces；repo-local wrapper 只剩 domain handler、refs-only adapter、authority function、diagnostic 或 tombstone。 |
| `domain_private_platform_retirement` | OPL 已能审计 MAS/MAG/RCA standard pack、authority functions、private platform residue、semantic equivalence 和 forbidden generic owner flags。 | 任何 repo-local scheduler、queue、attempt ledger、session store、workspace/source shell、artifact/memory lifecycle shell、workbench 或 generated wrapper owner 都完成上收、替换、收薄或 tombstone。 |
| `MAS_physical_thinning` | MAS 默认 runtime owner 已回到 OPL provider-backed stage runtime；旧 runtime transport、runner、worker lease、SQLite lifecycle writer 只按 retired/no-resurrection 读取。 | product/status/workbench、owner-route handoff、progress/domain-ref projection 等仍有 caller 的 residue 在 no-active-caller、OPL replacement parity、MAS receipt parity、no-forbidden-write 和 focused tests 成立后删除、archive 或 tombstone。 |
| `MAG_wrapper_shell_retirement` | MAG repo-side handler/ref-only/authority boundary 已闭合；product-entry、status/user-loop、sidecar、domain_runtime、lifecycle/projection shell 仍是 active direct path 或 migration input。 | OPL generated/default caller 与 App/default consumption 有真实证据后，MAG 只保留 grant authority functions、domain handler target、refs-only adapter 或 tombstone。 |
| `RCA_naming_and_adapter_hygiene` | RCA generated/hosted shell、legacy cleanup 和 visual authority boundary 已清晰；旧 session/store/managed/runtime/gateway 命名已降到 retired/provenance/tombstone 语境。 | active source 命名继续收敛为 visual authority implementation、native helper、domain handler target 或 refs-only adapter；不恢复 compatibility alias。 |
| `App_workbench_user_path` | App/operator drilldown、safe action route、payload workorder、App release/user-path evidence ledger 已可用。 | App release artifact、截图、reload prompt、provider state linkage 与真实用户路径在同一 cohort 下可重复证明；App 不生成 release-ready 或 production-ready verdict。 |
| `OMA_production_consumption` | OMA structural consumption 和 App live-path evidence 已进入读面；production-consumption record/verify 与 long-soak observation workorder 已可用。 | verified real long-soak refs 进入 ledger；event-only log、observation workorder、operator evidence 或 typed blocker 不能替代 long-soak success。 |
| `memory_artifact_lifecycle_apply` | OPL 只持 locator/index/ledger/ref transport；domain 持 body、mutation authority、accept/reject 和 final verdict。 | MAS/MAG/RCA 在真实 workspace 形成 accepted/rejected memory writeback、artifact mutation、cleanup/restore/retention 和 lifecycle receipts。 |

## 证据差距

| evidence gate | 当前读法 | 完成口径 |
| --- | --- | --- |
| Provider long SLO | Temporal provider cadence/capability SLO 已有机器读面；读数以 `framework readiness` 和 App drilldown 为准。 | 持续窗口 satisfied，并在真实 domain owner-chain dispatch 中保持 restart re-query、signal history、typed closeout、retry/dead-letter 和 no-forbidden-write proof。 |
| App long operator evidence | App release/user-path ledger 可记录/验证同 cohort refs 或 typed blocker。 | 同一 release/user-path cohort 的 long operator evidence verified；typed blocker 只说明显式阻塞，不说明完成。 |
| OMA long soak | OMA production-consumption ledger 与 local observation workorder 可物化 long-soak payload。 | verified real long-soak ref observed；recorded-but-unverified receipt 不关闭 gate。 |
| MAS real paper chain | MAS guarded-apply、owner-route、aftercare、default-executor typed blocker payload 可被 OPL record/verify 消费。 | 多条真实 paper line 产生 progress delta、AI reviewer update、artifact delta、human gate、stop-loss、owner receipt 或 stable typed blocker。 |
| MAG grant soak | MAG transition oracle、owner receipt contract、refs-only handoff 边界清晰。 | 真实 OPL-hosted grant-stage attempt 持续返回 grant-owned receipt、typed blocker 或 no-regression evidence。 |
| RCA visual soak | RCA transition/evidence fixture、refs-only projection 和 visual authority boundary 清晰。 | 真实 artifact-producing owner receipt、visual memory reuse、workspace receipt scaleout 和 repeated no-regression evidence。 |
| Cross-family regression | 三仓 structural conformance 与 generated/readiness consumer boundary 可读。 | direct/hosted parity、generated default consumption、legacy no-active-caller、no-forbidden-write 和 release/dist consumption 反复通过。 |

## 下一轮 baton

Objective:

- 推进 OPL family production-evidence tranche。每轮先读 fresh machine truth，再只修改仍 open 的功能/结构差距或证据差距；完成后把 durable current truth 折回本文、核心五件套或对应 repo-owned active plan。

优先顺序：

1. 读取 `opl framework readiness --family-defaults --json`、`opl runtime app-operator-drilldown --json`、`opl family-runtime evidence-worklist --family-defaults --provider temporal --executor-kind codex_cli --detail full --json`，确认当前 open gate。
2. 若 App release/user path 仍只缺 `long_operator_evidence_refs`，推进同 cohort long-operator `start -> event -> finish -> record -> verify`。
3. 若 OMA production-consumption 仍只缺 `long_soak_refs`，推进 OMA long-soak `start -> event -> finish -> record -> verify`。
4. 推进 MAS/MAG/RCA repo-owned production caller、owner receipt、typed blocker、memory/artifact/lifecycle receipt、no-regression 和 live long-soak evidence。
5. 在 default caller / no-active-caller / replacement parity / owner receipt parity 成立后，删除、archive 或 tombstone repo-local generic residue，不新增兼容面。

Non-goals:

- 不把 provider proof、generated surface proof、conformance pass、refs-only ledger verified、doctor clean 或 workorder accounting closed 写成 domain ready、App release ready 或 production ready。
- 不恢复 gateway/frontdoor/Hermes-first、compatibility alias、facade、wrapper 或旧默认入口。
- 不把 MAS/MAG/RCA 的 domain truth、quality/export verdict、artifact body、memory body 或 owner receipt authority 上收到 OPL。

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
- App selected cohort、verified package/provider refs、typed blocker refs 或 partial observed gates 等于 App release/user path 已闭合。
- Workorder accounting、stage evidence route、domain-dispatch refs-only receipt 或 legacy cleanup ledger 等于真实 owner-chain、expected receipt instance、monitor freshness、artifact mutation 或 long-soak evidence。
- Private functional audit 分类完成等于 domain repo 物理代码路径清零。
- Descriptor ready、read model ready、generated bundle ready、provider completion 或 cleanup proof 等于 domain ready、artifact ready、quality/export/fundability/visual verdict。
- 为兼容保留旧模块、旧接口、旧测试、旧 CLI alias、facade 或 wrapper；active caller 迁走后直接删除或进入 history/tombstone。
