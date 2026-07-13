# OPL 标准化智能体迁移 owner map

Owner: `One Person Lab`
Purpose: `standard_agent_migration_owner_map`
State: `active_support`
Machine boundary: 本文是人读迁移验收源。机器真相继续归 `contracts/`、source、CLI/API 行为、runtime ledger、provider receipt、domain-owned contracts、domain owner receipt、typed blocker、真实 workspace / App / release evidence。

## 本轮边界

本文既是本轮结构迁移的原始验收源，也是终局 Plan Completion Audit。落地范围包括 OPL 与各 domain repo 的 source / contract / tests / docs / generated surfaces / caller cutover；本文本身仍是人读支持面，不取代 machine contract 或 runtime evidence。任何结构完成结论都不声明 production readiness、runtime ready、domain ready、owner acceptance、App release ready、Brand L5 或 live owner-chain scaleout。

涉及的 OPL 主模块是 `OPL Pack`、`OPL Runway`、`OPL Stagecraft`、`OPL Console`、`OPL Ledger`、`OPL Workspace`、`OPL Connect`、`OPL Atlas` 和 `OPL Foundry Lab`。协同 owner 是 MAS、MAG、RCA、OMA、OBF 各自 domain repo。不触碰范围是 App runtime、domain truth、quality/export/review verdict、artifact body、memory body、owner receipt、typed blocker、human gate 与 live runtime state。

## 目标态

标准 OPL Agent 的目标形态固定为：

`Declarative Domain Pack + OPL generated/hosted surfaces + minimal authority functions`

含义：

- Domain repo 用 `agent/stages/manifest.json`、其余 `agent/` source、`contracts/`、capability map、quality gates、knowledge / tool refs 和最小 authority functions 声明领域能力；OPL Pack 生成 stage control plane，domain repo 不维护第二份 generated plane。
- OPL 生成或托管 CLI / MCP / Skill/plugin / App action / status / workbench / session / default-caller / conformance / package transport 等通用面。
- Domain repo 继续持有 domain truth、quality / export / review verdict、artifact authority、memory accept/reject、owner receipt、typed blocker、human gate 和 direct domain skill path。
- 任何 repo-local generic scheduler、queue、session store、progress shell、workbench shell、sidecar/status wrapper、currentness tracker、artifact lifecycle shell、delivery export shell 或 conformance scaffold 都是迁移输入，不是长期设计。

## 原始 26 项验收表

以下编号固定本轮源码审计的原始范围。后续实现、提交、验证和 Plan Completion Audit 必须逐项回指这些编号，不能用实际完成的切片替代原始规划。

### List 1：Agent 仓内应上收到 OPL 的通用能力

1. `MAS workspace cockpit`：并发、health、attention queue、operator brief 与 commands 由 Console 托管；MAS 只保留 paper / study progress truth。
2. `MAS provider transport`：developer supervisor、GitHub identity、repo-write policy 与 provider attempt currentness 由 Runway 托管；MAS 保留 domain action 与 human / owner gate。
3. `MAS artifact lifecycle`：递归扫描、restore / cleanup readiness 与 lifecycle registry 由 Workspace / Ledger 托管；artifact body、package / export authority 与删除决定留 MAS。
4. `MAS source / memory transport`：文献 registry、BibTeX、coverage、文件物化与 publication-memory locator / writeback 由 Connect / Workspace / Ledger 承担；医学相关性、证据评价和 memory accept / reject 留 MAS。
5. `MAG receipt observability`：receipt 校验、计数、SLO / operator projection 由 Ledger / Console 托管；fundability、quality / export verdict 与 receipt body 留 MAG。
6. `MAG workspace / schema engine`：scaffold、schema subset validation 与 workspace validation 由 Workspace 通用实现加 MAG declarative profile 承担。
7. `MAG product / runtime shell`：preflight、runtime registration、receipt reconciliation 与 package lifecycle envelope 由 Pack / Runway / Console 托管；grant stage policy 与 submission authority 留 MAG。
8. `RCA entry / status / session shell`：quickstart、start、readiness、resume、status 与 session response 改由 Pack / Console generated surface 承担。
9. `RCA executor envelope`：Codex timeout、attempt、telemetry 与 blocker envelope 由 Runway 托管；PPT invocation 与视觉失败解释留 RCA。
10. `RCA lifecycle / operator transport`：memory / artifact lifecycle、review-repair transport、operator evidence 与 native-helper receipt shell 分别由 Workspace / Ledger / Stagecraft / Pack 托管；visual memory judgment、artifact mutation 与 renderer 留 RCA。
11. `OMA Agent Lab ledger`：suite、owner receipt、learning candidate、promotion / mechanism / scaleout ledger 由 Foundry Lab 托管；OMA 保留 agent-building judgment 与 candidate refs。
12. `OMA takeover materializer`：suite 写入、Agent Lab 调用与 delivery gate 组装由 Foundry Lab execution 承担；OMA 只提交 declarative work order。
13. `OBF project hygiene`：通用目录遍历、source byproduct、cache 与 lifecycle 检查由 Workspace / Charter 承担；书稿长度、章节、图表与 review-PDF 判断留 OBF。
14. `OBF native-helper shell`：Pack 已提供 provider/domain-neutral `opl pack native-helper probe`，用 descriptor/content SHA-256 绑定 `resolved|missing` 工具探测 receipt；renderer、helper 执行、publication proof、版式质量与 export authority 留 OBF。OBF caller cutover 与私有通用 shell 删除仍由 OBF domain lane 验收。

### List 2：OPL 基座中应迁出或通用化的能力

1. `MAS paper-mission runtime stack`：改为通用 `domain_route` implementation；MAS 名称只存在于 MAS-owned adapter / profile。
2. `MAS Console portal / current-work-unit`：改为 registry-driven domain projection；paper display adapter 回 MAS / profile。
3. `ScholarSkills 医学 catalog`：医学 module IDs、validator 规则、artifact engines 与 profile 内容由 `mas-scholar-skills` 持有；OPL 只保留 capability-pack validation、安装、同步与 provenance。
4. `MAS Display Pack v2 转换`：迁至 MAS / ScholarSkills display adapter；OPL Pack 只接受通用 descriptor。
5. `RCA visual transition schema`：已退役；RCA 只提供 visual artifact、review finding 与非权威 route context，Codex CLI 选择语义路线。
6. `RCA cost preset`：`rca-ppt-40` 归 RCA / registry-owned profile；Foundry Lab 只保留通用 estimator。
7. `MAG sustained-consumption shell`：MAG 专用 command / projection 折叠到 generic owner-evidence ledger；grant 语义归 MAG adapter。
8. `Workspace norm 硬编码`：supported agents 与 topology 全部从 standard-agent registry / profile 派生，不内置 MAS `studies` 语义。
9. `BookForge dependency 默认值`：dependency doctor 不再默认 `bookforge-publication-proof`；profile 由 active agent / package 显式选择。
10. `PubMed provider implementation`：Connect 保留 provider-neutral connector；科学 provider 列表由显式 provider registry / package profile 提供。
11. `kernel first-party hardcode`：repo、evidence path 与 runtime state path 从 registry / profile 派生；paper 语义归 MAS。
12. `conformance 行为盲点`：hard gate 同时验证合同声明与 source behavior，不再把源码通用能力残留降为 advisory。

## Domain -> OPL 上收 owner map

| 通用功能面 | OPL owner surface | Domain repo 保留 | 迁移 / 退役 gate |
| --- | --- | --- | --- |
| runtime wrapper、session shell、queue、provider heartbeat、currentness、retry/dead-letter | `Runway` stage-attempt transport、Temporal-backed provider、attempt ledger、failure diagnostic、provider repair readback | domain stage policy、owner answer、typed blocker、human gate、domain retry语义 | OPL replacement parity、no-forbidden-write proof与 owner decision；不作为 stage progress gate |
| progress / owner-delta / workbench / operator projection / delegation | `Console` current owner delta、App/operator drilldown、`Stagecraft` owner-answer projection、`Ledger` refs-only evidence | domain progress truth、artifact delta、quality/export/review verdict、owner receipt | generated surface cutover、active caller proof、route-back / owner receipt roundtrip、no second truth |
| tool affordance、skill inventory、professional Skill carrier、capability registry | `Pack` ABI、`Atlas` registry、`Connect` skill/package sync、generated Codex carrier | professional Skill source truth、domain rubric、domain knowledge、tool-use judgment | pack/compiler conformance、canonical skill source pointer、carrier provenance、no-authority flags |
| artifact lifecycle、delivery export、workspace/source locator、memory locator | `Workspace` project / stage artifact units、`Pack` descriptor / lifecycle refs、`Ledger` evidence refs、delivery/source shell docs | artifact body、package/export authority、memory body、accept/reject decision、domain source semantics | same-ref parity、owner receipt or typed blocker binding、no body migration by OPL、domain delete/keep/typed-blocker decision |
| conformance scaffolding、default caller、domain action adapter、status/read model | `Foundry Lab` scaffold/conformance、`Pack` generated interfaces、`Stagecraft` stage control plane, `Console` status projection | domain handler implementation、authority functions、domain-specific source code | `opl agents conformance` / `default-callers` fresh readback、active-caller cutover、tombstone/provenance ref、owner decision |

## Per-agent owner route

| Agent | 应上收到 OPL 的通用面 | 必须留在 domain 的 authority | 当前计划读法 |
| --- | --- | --- | --- |
| `MAS` | paper route wrapper、progress/workbench shell、session/currentness/delegation、workspace/source/artifact lifecycle transport、provider heartbeat、scientific connector receipt transport | study truth、paper mission truth、publication quality、source/evidence judgment、paper package authority、MAS Scholar Skills professional truth、owner receipt、typed blocker、human gate | OPL 只托管 route / attempt / refs / projection；`paper_mission` 等旧名只能作为 compatibility carrier，不能继续做 OPL canonical vocabulary。 |
| `MAG` | product/status/workbench shell、grant loop session shell、runtime report locator、package/lifecycle/memory projection envelope、default caller | grant truth、fundability verdict、grant strategy memory、grant package/export authority、AI route context、owner receipt、typed blocker | grant / proposal 词汇可以在 public routing 或 domain profile 中出现，不能作为 OPL base assertion 或 generic lifecycle。 |
| `RCA` | product/session/status sidecar、domain action wrapper、runtimeWatch/operator evidence shell、artifact gallery/handoff shell、generic native-helper envelope | visual truth、layout/review/export verdict、canonical artifact authority、visual memory accept/reject、native helper implementation、owner receipt、typed blocker | visual / RCA 词汇只保留在 profile、fixture、domain repo 或 history；generated domain action / workbench 走 OPL generic surface。 |
| `OMA` | Agent Lab runner、promotion gate read model、target-agent work-order execution refs、generic materializer shell、generated interfaces | agent-building semantics、candidate package refs、proposal materialization refs、target-agent typed blocker refs | OMA 是 standard domain agent；`opl-meta-agent` 只是 repo/package/plugin carrier 名。scripts 只能是 authority implementation、smoke/helper、fixture/proof 或 work-order materializer。 |
| `OBF` | hosted/generated package/workbench、StageRun、Pack / Workspace / Ledger locator、dependency profile / package transport、delivery lifecycle shell | manuscript truth、chapter/source/reference judgment、quality/export verdict、book artifact authority、style/reference memory accept/reject、owner receipt、typed blocker | OBF 是当前 Stage Pack v2 样板；BookForge helper/materializer 的物理删除仍需 owner delete/keep/typed-blocker decision。 |

## OPL base -> 迁出 / 通用化 owner map

| OPL 基座残留 | 目标 owner / 目标形态 | 处理口径 | 禁止声明 |
| --- | --- | --- | --- |
| MAS-specific wording、paper/publication/medical fixtures、RCA visual 或 MAG grant 词汇进入 generic docs / schema / examples | generic vocabulary in OPL；domain profile / fixture / history in domain support docs | 新 canonical surface 使用 `domain_*`、`stage_*`、`owner_evidence_*`、`artifact_*`；domain terms 只作 compatibility、fixture 或 domain profile | 不能把 fixture 当 OPL ontology、domain truth 或 readiness evidence。 |
| App settings 中 MAS/MAG/RCA 具体配置被读成 base runtime identity | App repo owns GUI product truth；OPL owns registry/profile/package refs | OPL docs 只声明 App 消费 standard-agent registry、package profile 和 action refs；具体设置页改动回 App lane | 不能把 App settings clean 读成 OPL runtime ready 或 agent ready。 |
| CLI/API tests 用 MAS 名称作为 base 断言 | generic OPL contract / source tests；domain-specific cases marked fixture/profile | 后续代码 lane 应断言 machine surface、registry id、generic example 或 profile kind，不测试 prose，也不把 MAS 作为 base default | 测试绿不能证明 domain ready、paper progress 或 owner acceptance。 |
| OPL runtime / App shell concrete routing defaults 绑定 first-party agent | `standard_agent_registry`、domain profile、package descriptor、action catalog | default route 来自 registry/profile；MAS/MAG/RCA/OMA/OBF 是 first-party starter / admitted agents，不是框架上限 | 不能把 first-party starter 当用户不可替换的固定身份。 |
| `paper_mission`、`paper-autonomy`、MAG manifest alias、RCA visual profile、OMA/OBF helper-materializer 等 compatibility carrier | profile / fixture / history，或 owner-gated delete/keep/typed-blocker | active caller 存在时保留；caller cutover 后按 no-active-caller、no-forbidden-write、tombstone/provenance、owner decision 退役 | 空 worklist、closed gate、docs patch 或 default-caller clean 不授权 physical delete。 |

## 2026-07-11 Fresh Readback

排除 Live Evidence 后，本轮功能/结构迁移已经达到 terminal 状态：原始 `26/26` 项均为 `done / 100%`。这里的 `100%` 只表示能力 owner、active caller、generated/hosted surface 和旧实现退役/收薄四项已经有 fresh executable evidence；不表示 production readiness、domain readiness、quality/export ready、owner acceptance、Brand L5、provider long-soak 或真实用户路径完成。

`opl agents interfaces --family-defaults` 当前返回：

- `status=ready`
- `total_domain_count=5`
- `ready_domain_count=5`
- `blocked_domain_count=0`
- MAS / MAG / RCA / OMA / OBF 均由 OPL generated default surfaces 承载；canonical agent id 分别为 `mas`、`mag`、`rca`、`oma`、`obf`。

`opl agents conformance --family-defaults` 当前返回：

- `passed_count=6`
- `blocked_count=0`
- `structural_conformance_status=passed`
- `structural_contract_status=passed`
- `ordinary_path_guard_status=passed`
- 五个 domain report 均为 `passed`；计数中的第六项是 family aggregate。

`opl agents default-callers --family-defaults` 当前返回：

- `total_repo_count=5`
- `blocked_count=0`
- `blocked_surface_count=0`
- `missing_no_active_caller_proof_count=0`
- `status=ready_domain_evidence_required`

remaining retirement worklist 只负责 domain owner receipt / typed blocker、no-forbidden-write、tombstone/provenance 和 physical-delete owner decision。它不构成 generated caller 结构 blocker，也不授权 OPL 删除仍被 domain owner保留的最小 authority adapter。

Live Evidence 继续单列：`live_domain_progress_status=owner_evidence_recorded_not_ready_claim`、`live_stage_run_progress_evidence_status=owner_evidence_recorded_not_ready_claim`。OPL 不能据此声称 domain ready、quality/export ready、production ready 或 owner acceptance。

## 原始 26 项 Plan Completion Audit

### List 1：Agent 仓通用能力上收

| # | 验收项 | 状态 | 完成度 | Fresh evidence / 缺口 / 后续动作 |
| ---: | --- | --- | ---: | --- |
| 1 | MAS workspace cockpit | done | 100% | MAS私有cockpit/current-work-unit/portal已物理退役；Console从registry、runtime activity与current-owner-delta构建domain-neutral refs-only projection。MAS generated default-caller 8/8 closed、worklist=0。 |
| 2 | MAS provider transport | done | 100% | Runway 持有 StageRun transport、provider attempt currentness与no-forbidden-write；MAS保留owner/human gate。不存在 stage admission。 |
| 3 | MAS artifact lifecycle | done | 100% | OPL Stagecraft/Workspace/Ledger持有artifact write/index/lifecycle primitive；MAS只输出opaque artifact refs并保留artifact body/删除授权。无production caller的`workspace_target_state_cleanup`私有递归扫描/archive/move shell及专用测试已物理删除。 |
| 4 | MAS source / memory transport | done | 100% | Connect/Workspace/Ledger只传source/memory refs与receipt；医学相关性、evidence judgment、memory accept/reject仍归MAS。 |
| 5 | MAG receipt observability | done | 100% | Generic owner-evidence ledger与Console projection已替代MAG专用shell；fundability/export verdict留MAG。 |
| 6 | MAG workspace / schema engine | done | 100% | standard-agent scaffold、schema subset、workspace validation由OPL通用实现和declarative profile提供。 |
| 7 | MAG product / runtime shell | done | 100% | Pack/Runway/Console generated shell已落地，MAG structural adoption为passed；不把此项写成grant/submission ready。 |
| 8 | RCA entry / status / session shell | done | 100% | RCA tracked stage plane、手写generic product/status/workbench shell已退役；product manifest只投影generated session/stage refs与RCA authority refs。fresh interfaces ready、conformance blockers=0。 |
| 9 | RCA executor envelope | done | 100% | timeout、attempt、telemetry、blocker envelope归Runway；PPT invocation与视觉失败解释留RCA。 |
| 10 | RCA lifecycle / operator transport | done | 100% | Workspace/Ledger/Stagecraft/Pack持有generic transport；RCA domain-handler已收薄为约3.4KB refs-only projection，generic operator/evidence/workorder/lifecycle builders删除，renderer、visual memory judgment与artifact mutation仍归RCA。 |
| 11 | OMA Agent Lab ledger | done | 100% | OPL Foundry Lab从thin evaluation request编译suite并拥有execution/result/ledger；OMA不再生产suite seed/plan，只保留agent-building judgment与candidate refs。 |
| 12 | OMA takeover materializer | done | 100% | OMA只写raw-byte digest绑定的evaluation request与Foundry work order；OPL在parse/write前校验digest/task/target/provenance并执行suite。legacy suite body被strict schema拒绝。 |
| 13 | OBF project hygiene | done | 100% | OBF默认verify前后调用`opl workspace source-hygiene`；旧hygiene helper已收薄为无default caller的书稿领域诊断，不再承担source byproduct/lifecycle遍历。 |
| 14 | OBF native-helper shell | done | 100% | OBF默认caller使用`opl pack native-helper probe`验证PDF/imagegen descriptor与helper SHA；保留代码仅负责BookForge renderer、publication proof与export authority。 |

### List 2：OPL 基座迁出 / 通用化

| # | 验收项 | 状态 | 完成度 | Fresh evidence / 边界 |
| ---: | --- | --- | ---: | --- |
| 1 | MAS paper-mission runtime stack通用化 | done | 100% | OPL canonical runtime为generic `domain_route`与StageRun attempt/runtime substrate；MAS命名只留在MAS-owned route profile/compatibility mapping。旧OPL `family-runtime-mas-*` implementation和MAS私有generic study runtime chain已退役。 |
| 2 | MAS Console portal通用化 | done | 100% | 旧MAS portal/cockpit implementation物理不存在；Console只做registry-driven current-owner-delta/operator projection，MAS payload只作为domain data，不拥有portal/current-work-unit控制面。 |
| 3 | ScholarSkills医学catalog迁出 | done | 100% | OPL私有catalog、validator、artifact engines、plugin mirror已删除；只消费外部package/provenance。 |
| 4 | MAS Display Pack v2迁出 | done | 100% | Pack descriptor已provider/domain-neutral，MAS conversion由domain adapter拥有。 |
| 5 | RCA visual transition迁出 | done | 100% | Stagecraft从RCA-owned profile ref读取，内置REDCUBE registry/default已删除。 |
| 6 | RCA cost preset迁出 | done | 100% | Foundry estimator只接受profile输入；通用fixture不含RCA preset，真实RCA profile经standard-agent registry发现；`rca-ppt-40`只出现在RCA owner profile/fixture级输入。 |
| 7 | MAG sustained-consumption shell合并 | done | 100% | MAG alias/projection删除，统一到owner-evidence ledger/action route。 |
| 8 | Workspace norm去硬编码 | done | 100% | supported agents、topology与workspace defaults从standard-agent registry/profile派生。 |
| 9 | BookForge dependency默认值移除 | done | 100% | dependency doctor使用显式domain/package profile，不再以publication-proof作为基座默认。 |
| 10 | PubMed provider迁出 | done | 100% | OPL私有PubMed command/client已删除；Connect保provider-neutral metadata/receipt transport，医学client/normalization归MAS。 |
| 11 | kernel first-party hardcode移除 | done | 100% | workspace root/runtime/evidence/repo discovery从registry/profile派生；Connect局部目录数组由registry映射生成，不是第二份手写family列表。 |
| 12 | conformance source-behavior hard gate | done | 100% | source behavior与functional audit逐项比对并进入blocking blockers；负向探针覆盖未声明generic surface、audit声明active residue、diagnostic仍有active caller。修复后fresh family conformance为0 blocked。 |

## 明确拒绝与停止条件

- 本次 `26/26 done` 是功能/结构 completion，不是 runtime/domain/production readiness。任何文档、focused/full tests、queue empty、refs-only ledger或generated bundle都不能替代 Live Evidence。
- `default-callers` 的 remaining owner-evidence/physical-delete worklist继续fail-closed；OPL projection不授权物理删除domain authority adapter。domain owner可返回owner receipt、typed blocker或keep decision。
- Live Evidence、provider long-soak、真实App/user path、release、Brand L5、quality/export verdict和owner acceptance继续后置分账；其 canonical状态仍为`owner_evidence_recorded_not_ready_claim`。
- 不恢复tracked `contracts/stage_control_plane.json`、repo-local generic scheduler/session/workbench/status shell、OPL内置RCA/MAS/MAG ontology或OMA suite body。
