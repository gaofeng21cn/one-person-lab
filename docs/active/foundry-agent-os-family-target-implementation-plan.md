# Foundry Agent OS Family Target Implementation Plan

Owner: `One Person Lab`
Purpose: `foundry_agent_os_family_target_implementation_plan`
State: `active_support`
Machine boundary: 本文是人读目标实施规划。机器真相继续归 `contracts/`、source、CLI/API 行为、runtime ledger、provider receipt、domain-owned manifest、owner receipt、typed blocker、真实 workspace 与 App evidence。当前执行顺序、live gap 和完成判断仍回到 [OPL Family 当前状态与理想目标差距](./current-state-vs-ideal-gap.md)。
Last reviewed: `2026-06-14`

## 结论

MAS 这轮 `OPL Agent OS + MAS Declarative Medical Research Pack + MAS Minimal Authority Kernel + Scientific Capability Registry` 不应停留在 MAS 单仓设计。它已经被抽象成 OPL family-level pattern：

```text
OPL Agent OS
  + Domain Declarative Pack
  + Domain Minimal Authority Kernel
  + Domain Capability Registry
```

这个 pattern 适用于 `MAS`、`MAG`、`RCA` 和 `OMA`。OPL 持有通用运行时、Pack compiler、generated/hosted surfaces、current_owner_delta 默认读面、refs-only Vault、Console 和 cross-agent conformance；domain 仓只保留无法声明化的领域 authority kernel。

本规划已经落到 `contracts/opl-framework/target-operating-architecture-contract.json` 的 `foundry_agent_os_standard`，并同步扩展品牌模块 registry / surfaces / L5 evidence 合同。近期 runtime/read-model 重构后，本规划只引用 wrapper-aware live payload，不复制旧顶层字段路径：`framework operating-maturity` 读 `.framework_operating_maturity`，App operator drilldown 读 `.app_operator_drilldown`，Brand L5 读 `.brand_module_l5_status`。它不声明功能已经全量完成、domain ready、App release ready、Brand L5 或 production ready；它只冻结后续改造要对齐的目标架构和实施顺序。

当前角色：本规划保持为 `active_support`，不升级为新的 active backlog。Active 执行解释已经收敛到 `W7-owner-evidence-and-production-tail`，并由 [OPL Family 当前状态与理想目标差距](./current-state-vs-ideal-gap.md) 维护 owner、gate、next action 和 Plan Completion Audit。本文只保留 Foundry Agent OS 的目标 ABI、owner 边界、写集类别和 false-authority guard；live readiness、maturity、App drilldown、Brand L5、provider long-soak、workspace currentness 与 source-boundary cleanup 都必须回到 active plan 指向的 live readout、contracts、source 和 tests。`framework readiness.current_owner_delta.latest_owner_answer_ref`、`framework operating-maturity.current_owner_delta_bridge.readiness_current_pointer_owner_answer_ref` 和 `owner_payload_summary_closure_state` 等字段只按 fresh live owner 读取；本规划不得冻结旧样本，也不得把 refs-only typed-blocker payload summary、App user-path evidence、verified ledger、conformance pass、docs foldback 或 source cleanup 写成 current pointer closeout、domain ready、App release ready、Brand L5、provider production ready 或 production ready。

## 后续开发主入口

后续开发不从本文维护第二 active backlog；本文只作为 Foundry Agent OS 目标 ABI、lane 和 false-authority guard 的支撑规划。阅读顺序固定为：

1. 先读 [OPL Family 当前状态与理想目标差距](./current-state-vs-ideal-gap.md)，确认当前 active owner、live gate 和不能声明的范围。
2. 再读本文，确认 Foundry Agent OS 的目标 ABI、lane、写集和验收门。
3. 需要改某个 domain 时，再读对应仓的 target delta：MAS `docs/runtime/designs/mas_opl_agent_os_target_operating_architecture.md`，MAG/RCA/OMA `docs/active/foundry-agent-os-target-delta.md`。
4. 开工时只选下面一个 work order 或一组写集不相交的 work orders；不要先新增第二规划文档、第二 active backlog 或第二 capability registry。
5. 外部学习后续优化只折回本文的 `W3-capability-registry-fail-open`、`W4-domain-kernel-manifest` 和 `W7-production-evidence-soak`：OPL 负责 current-delta-bound capability resolver / selector，domain 仓只声明可消费 refs、authority 边界和 owner receipt / typed blocker 晋级门；不要在 MAS 或其他 domain 仓另建 external-learning selector/backlog。

W0-W7 work order map 只定义 Foundry Agent OS 的目标 ABI、owner 边界和验证类别。实际下一步、owner gate 和是否开写入 lane 由 [OPL Family 当前状态与理想目标差距](./current-state-vs-ideal-gap.md) 结合 live readout 决定：

| Work order | Owner repo | 写集 | 产出 | 验证 |
| --- | --- | --- | --- | --- |
| `W0-cross-agent-conformance-readout` | OPL | `contracts/opl-framework/*`、conformance source、focused tests | `opl agents conformance --family-defaults --json` 暴露 `foundry_agent_os_standard`：per-agent default read root、target delta present、false-authority flags、generated-surface status、domain-kernel authority owner。 | `npm run typecheck`、`npm run test:fast`、`npm run test:meta` |
| `W1-pack-abi-generated-surface` | OPL + one domain canary | Pack compiler、generated interface bundle、descriptor tests | Domain Pack 可生成 CLI/MCP/Skill/App/status/workbench descriptor；generated surface 不写 domain truth。 | contract tests、interface snapshot、direct/generated parity fixture |
| `W2-current-owner-delta-default-root` | OPL + App read-model | Console/read-model/App cockpit contracts | 默认 operator/App 首屏只从 `current_owner_delta` 生成 next action；raw worklist/evidence 只能 drilldown。 | read-model tests、App fast-state fixture |
| `W3-capability-registry-fail-open` | OPL | Atlas/Pack/Stagecraft capability registry ABI | optional capability ref 缺失 fail open；route-required hard-boundary 缺失才 typed blocker；external-learning / Light / Co-Scientist / Evo 等能力由 current-delta-bound resolver 选择，不由 domain 私有 selector 再造。 | schema tests、fail-open/fail-blocker tests |
| `W4-domain-kernel-manifest` | MAS/MAG/RCA/OMA | domain manifest/policy/docs/tests | 每仓声明 retained authority kernel、OPL upcollect surfaces、owner receipt / typed blocker signer。 | domain focused contract tests、docs diff check |
| `W5-generated-parity-scaleout` | OPL + MAS/MAG/RCA/OMA | generated descriptors、domain action catalogs | direct path 与 OPL-hosted path 返回同一 accepted answer shape。 | cross-agent conformance、direct/generated parity tests |
| `W6-app-cockpit-consumption` | OPL + App | Console/App projection contracts | App cockpit first screen 只显示 owner、delta、accepted answer shape、hard gate、typed blocker 和 drilldown refs。 | App contract tests、manual screenshot when App changed |
| `W7-production-evidence-soak` | OPL + domain owners | runtime evidence contracts、real owner receipts | 用真实 owner receipt、typed blocker、human gate、long-soak、release/install 和 owner acceptance 关闭 production evidence。 | repo-native soak、owner acceptance refs |

当前维护读法：`W0` 机器读面、`W1/W5` generated/direct parity proof 第一版、`W3` current-delta-bound Capability Registry resolver ABI、`W4` domain kernel manifest、`W6` App cockpit contract 和 `W7` production evidence intake / owner-route work-order readout gate 已进入 regression / maintenance 语境。只有当两条 work order 的写集、source of truth、验证命令和禁止范围完全分离时，才并行开 worktree。`W0-W6` 关闭的是 structural / functional landing；`W7` 当前只关闭 intake、work-order projection 与 non-closing guard，不关闭 production evidence。真实 production evidence 仍必须来自 owner receipt、typed blocker、human gate、reviewer/quality/export receipt、long-soak、release/install 或 owner acceptance refs。

## 当前落地主入口

当前后续开发先从 [OPL Family 当前状态与理想目标差距](./current-state-vs-ideal-gap.md) 读取 active baton，再回到本文确认 W0-W7 目标 ABI、owner 边界和 false-authority guard；不要重开 `W0`，也不要把本文当第二 active backlog。`W0-cross-agent-conformance-readout` 已落为 `opl_foundry_agent_os_conformance` 读面：它把 `foundry_agent_os_standard` 变成 `opl agents conformance --family-defaults --json` 可稳定消费、可测试、可审计的结构字段。

后续 source of truth 固定为：

- 本文与 [OPL Family 当前状态与理想目标差距](./current-state-vs-ideal-gap.md)。
- `contracts/opl-framework/target-operating-architecture-contract.json#foundry_agent_os_standard`。
- `contracts/opl-framework/brand-module-registry.json`、`brand-module-surfaces.json`、`brand-module-l5-operating-evidence.json`。
- live `opl framework readiness --family-defaults --json`、`opl agents conformance --family-defaults --json`、`opl framework operating-maturity --family-defaults --json`、`opl runtime app-operator-drilldown --json`、`opl brand-modules l5-status --json`；读取时必须进入各自 wrapper payload。
- MAS/MAG/RCA/OMA 各自 `contracts/foundry-agent-os-domain-kernel-manifest.json`。
- App `contracts/app-runtime-bridge.json`、`contracts/app-gui-product-contract.json` 和 fast-state fixture。

已落地的结构面：

- `W0`：`opl agents conformance --family-defaults --json` 暴露 `foundry_agent_os_conformance`，包含 pattern、required claims、capability registry fail-open policy、per-domain default read root、generated surface/source-of-work status、domain authority kernel status 和 false-authority flags。
- `W1/W5`：`opl agents interfaces` 的 generated interface bundle 暴露 `generated_direct_parity`，证明 CLI/MCP/Skill/product-entry/OpenAI/AI SDK descriptors 与 direct domain target 源自同一 action catalog 和 accepted answer shape；该 proof 不能写 domain truth、不能签 owner receipt、不能创建 typed blocker、不能声明 domain ready / production ready。
- `W3`：`contracts/opl-framework/capability-registry-resolver.schema.json` 与 `src/capability-registry-resolver.ts` 固定 current-delta-bound resolver ABI；optional capability ref 缺失 fail open，只有 current owner delta route-required hard-boundary 缺失才输出 typed blocker candidate，且 OPL 仍不能创建 domain typed blocker。
- `W4`：MAS/MAG/RCA/OMA 均新增 `contracts/foundry-agent-os-domain-kernel-manifest.json` 与 focused tests，声明 retained authority kernel、OPL upcollect surfaces、owner receipt / typed blocker signer 和 non-claims。
- `W6`：App contract/fixture/validator 固定 first screen / ordinary cockpit 只从 `current_owner_delta` 派生 default next action，raw worklist / raw evidence / provider trace / release evidence 只进入 drilldown。
- `W7`：`opl framework operating-maturity --family-defaults --json` 暴露 `owner_evidence_intake`、`foundry_agent_os_production_evidence_gate.owner_route_work_orders` 与 `domain_owner_chain_scaleout.domain_owner_evidence_routes`。`owner_evidence_intake` 读取既有 refs-only ledgers：`runtime domain-owner-payload-summary list`、`runtime brand-module-l5-evidence list`、`runtime app-release-evidence list`、`runtime codex-app-runtime-evidence list`，MAG repo-tracked `contracts/production_acceptance/mag-production-acceptance.json`，RCA repo-tracked `contracts/owner_chain_live_progress_evidence.json`，OMA repo-tracked `contracts/target_agent_owner_chain_evidence.json`，`agents default-callers` 的 private-platform retirement read model，以及 `runtime app-operator-drilldown` 的 memory/artifact lifecycle read model；再把 MAS/MAG/RCA/OMA、Brand L5、App release、provider long-soak、private platform retirement 和 memory/artifact lifecycle 的 observed receipt refs / ref shapes / per-lane status 回投到 W7 work orders。domain owner payload summary intake 会保留 `human_gate_refs`、`quality_or_export_receipt_refs`、`reviewer_receipt_refs` 和 `long_soak_refs`，并把这些 concrete refs 投影到 per-domain evidence routes。它只证明 intake / work-order projection / false-authority guard，不声明 production evidence closed。
- External-learning：后续优化折回 `W3/W4/W7`，不再在 MAS 或其他 domain 仓另建 selector、第二 active backlog、always-on sidecar 或默认 preflight。

后续最小完成门：

- `W1/W5` 的 MAS/MAG/RCA/OMA generated/direct accepted-answer-shape roundtrip 已进入机器读面；后续不再补第二套 parity 计划，而是把任何 drift 当作 `generated_direct_parity` regression 修复。
- `W3` 已把 domain pack external-learning refs 接入 current-delta-bound resolver readout；后续只扩展可消费 refs 与 route-required hard-boundary policy，继续保持 optional fail-open 和 domain-owned typed blocker 晋级边界。
- `W7` 后续必须用真实 owner receipt、typed blocker、human gate、reviewer/quality/export receipt、long-soak、release/install、private-platform owner decision 或 owner acceptance refs 关闭 production evidence；当前 `owner_evidence_intake`、work-order/readout、conformance pass、App projection、provider completion、verified ledger 和 docs foldback 都不能替代它。
- 若后续 live `opl agents conformance --family-defaults --json` 仍出现 OMA 或其他 domain blocked，必须分类为 conformance projection、domain target delta、stage boundary drift 或 domain-owned live evidence tail；不能用 suite pass、controlled canary 或 docs foldback 伪关闭。

## Supervisory acceptance gate

本节吸收原先独立的 OPL / MAS supervisory acceptance 目标。它不再作为第二条 active line 维护，也不再单独追 MAS owner-answer 生成；它是 `W0`、`W2`、`W6` 和 `W7` 的共同验收细目。

验收目标固定为：OPL 只承载和验收，不替 domain 裁决。每个相关 work order 在声称完成前都必须证明：

- `current_owner_delta` 仍是 ordinary planning root；App / Console / conformance / maturity 读面不能从 raw worklist、queued provider candidate、evidence count、provider completion 或 audit tail 生成默认 next action。
- StageRun identity、stage manifest、current pointer、source fingerprint、idempotency、provider attempt、active lease、execution authorization decision 和 closeout binding 必须指向同一个合法 owner answer 或 OPL runtime blocker。
- OPL / Vault / Console / Runway / Pack / Capability Registry 不能签 `owner_receipt`、不能创建 domain `typed_blocker`、不能写 domain truth、不能授权 quality / export / publication verdict。
- refs-only Vault 只能记录、校验和投影 domain-owned refs；只有 domain owner 把 refs fold 成 owner delta、owner answer、hard gate、route-back、human gate 或 typed blocker 后，才影响默认下一步。
- 如果 MAS/MAG/RCA/OMA 同一 work unit 同时暴露 typed blocker 与 action queue / provider candidate / replay candidate，OPL 必须 fail closed 或投影为 owner/currentness conflict；不能把 queued candidate 当成已授权 execution，也不能用旧 blocker、study-level decision 或 stale lineage 关闭当前 delta。

对应 work order 的落点是：

| Work order | acceptance gate focus |
| --- | --- |
| `W0-cross-agent-conformance-readout` | conformance 必须暴露 default read root、false-authority flags、domain-kernel authority owner 和 live evidence still-required 状态；conformance pass 不能关闭 domain progress。 |
| `W2-current-owner-delta-default-root` | Console / App 默认读面只显示 owner、delta、accepted answer shape、hard gate、artifact/blocker 和 drilldown refs；raw worklist 与 evidence lane 只进 drilldown。 |
| `W6-app-cockpit-consumption` | App cockpit 不能把 OPL ledger verified、provider completed、queue empty、descriptor ready 或 L5 evidence count 显示成 domain ready / release ready / production ready。 |
| `W7-production-evidence-soak` | 只有真实 owner receipt、typed blocker、human gate、quality/export/review receipt、long-soak、release/install 和 owner acceptance refs 能关闭 production evidence；OPL 只 intake / verify / project。 |

后续如果某条会话只负责这类 acceptance 工作，应把它命名为 `Foundry Agent OS acceptance gate`，并把产出折回本文、`current-state-vs-ideal-gap.md` 或相应机器合同；不要再新增独立规划文档、独立 `/goal` 主线或 MAS source-repair backlog。

## 模块映射

| 能力 | OPL 主模块 | 支撑模块 | 默认 lane | 不能声明 |
| --- | --- | --- | --- | --- |
| Pack compiler / generated surfaces | `OPL Pack` | `Atlas`, `Connect`, `Console` | `ordinary` | 不能写 domain truth、不能签 owner receipt、不能创建 typed blocker、不能给 quality/export verdict。 |
| Domain Capability Registry | `OPL Atlas` | `Pack`, `Stagecraft` | `advisory` | 不能执行 capability、不能拥有 domain authority、不能把 optional ref 缺失变成默认阻塞。 |
| Capability use policy | `OPL Stagecraft` | `Atlas`, `Pack` | `advisory` | 不能替代 reviewer / quality gate，也不能把工具目录变成 workflow script。 |
| `current_owner_delta` default read root | `OPL Console` | `Runway`, `Vault`, `Stagecraft` | `ordinary` | Console 只能投影 current owner / next delta / accepted answer shape，不能签 owner answer。 |
| Durable StageRun execution | `OPL Runway` | `Stagecraft`, `Vault` | `ordinary` | Provider completion 不能变成 domain completion。 |
| Evidence / lineage | `OPL Vault` | `Console`, `Runway` | `audit` | Vault 只存 refs，不存 artifact body / memory body，也不把 ref 变成 owner authority。 |
| Agent improvement | `OPL Foundry Lab` | `Atlas`, `Pack`, `Connect` | `advisory` | Work order / candidate / promotion proposal 不能替 domain owner 接受 target agent。 |

## Capability Registry 边界

`Scientific Capability Registry` 不新增第 11 个品牌模块。它是跨 `Atlas + Pack + Stagecraft` 的 registry / ABI / use-policy：

- `Atlas` 负责 catalog：capability id、owner、surface ref、lifecycle、依赖和 discovery。
- `Pack` 负责 ABI：domain pack 如何声明 capability refs、generated surfaces 如何暴露调用边界。
- `Stagecraft` 负责 use policy：stage 内何时可用、何时只是 advisory、何时 route-required。

默认行为固定为 `current_owner_delta_bound_jit_or_fail_open`。只有当前 owner delta 明确需要某个 ref 来保护 source/data/evidence、owner-route identity、forbidden write、irreversible mutation、reviewer/publication hard gate 时，缺失才升级为 typed blocker。其余缺口进入 advisory / audit，不阻断主线，也不要求默认 memory scan、meta-review、tournament、blocking prefetch 或 always-on sidecar。

外部学习 intake 的后续优化也走同一条线：Co-Scientist、Light、EvoScientist、ARS、AutoSci / OmegaWiki、ARK、ARIS、PaperSpine、PaperOrchestra 和 Open Auto Research 不能各自形成 domain-local scheduler、selector、sidecar pipeline 或 active backlog。OPL `W3` 只提供 capability catalog / ABI / use policy / resolver；domain pack 声明哪些 capability refs 适用于哪些 stage / owner delta；domain authority kernel 决定哪些 refs 可被消费、哪些 refs 只能作为 advisory，以及哪些 refs 需要 owner receipt、typed blocker、reviewer receipt 或 human gate 后才能计入真实进度。

## Cross-Agent Delta

| Agent | 目标形态 | 上收到 OPL | 保留为 domain authority kernel |
| --- | --- | --- | --- |
| `MAS` | `OPL Agent OS + Medical Research Pack + Medical Authority Kernel + Scientific Capability Registry` | generic runtime、StageRun、queue/attempt ledger、workspace/source/artifact shell、generated surfaces、Console/workbench、refs-only evidence、capability registry ABI。 | medical research truth、publication/study/artifact authority、quality verdict、medical memory accept/reject、owner receipt、typed blocker、human gate。 |
| `MAG` | `OPL Agent OS + Grant Pack + Grant Authority Kernel + Grant Capability Registry` | generic runtime、Pack compiler、generated CLI/MCP/App/status surfaces、source/package shell、quality/readiness projection、Console/workbench、capability registry ABI。 | grant truth、fundability / quality / export verdict、submission/package authority、grant strategy memory accept/reject、owner receipt、typed blocker、grant-native helpers。 |
| `RCA` | `OPL Agent OS + Visual Pack + Visual Authority Kernel + Visual Capability Registry` | generic runtime、workspace/source intake shell、artifact gallery/handoff shell、review/repair transport、native-helper envelope、generated surfaces、Console/workbench、capability registry ABI。 | visual truth、layout / review / export verdict、artifact mutation/export authority、visual memory accept/reject、owner receipt、typed blocker、visual-native helper authority。 |
| `OMA` | `OPL Agent OS + Agent-Building Pack + Agent-Building Authority Kernel + Improvement Capability Registry` | Agent Lab runtime、work order execution primitive、scaffold generator, generated interface bundle、conformance/read-model projection、promotion/canary/rollback shell、capability registry ABI。 | agent-building semantics、candidate package materialization、developer work-order materialization、mechanism proposal materialization、target-agent no-forbidden-write proof、target-agent typed blocker / route-back evidence。 |

## 已落地合同

当前合同锚点：

- `contracts/opl-framework/target-operating-architecture-contract.json` 新增 `foundry_agent_os_standard`。
- `contracts/opl-framework/brand-module-registry.json` 把 `Atlas / Pack / Stagecraft / Runway / Vault / Console` 的 target architecture、capability registry 和 false-authority 边界折回 registry。
- `contracts/opl-framework/brand-module-surfaces.json` 把 capability registry / current_owner_delta / provider completion false boundary 加入模块 surface。
- `contracts/opl-framework/brand-module-l5-operating-evidence.json` 扩展 L5 evidence 类：`pack_compile_parity`、`current_owner_delta_default_read`、`capability_fail_open_boundary`、`domain_authority_false_boundary`、`cross_agent_foundry_agent_os_adoption`。
- focused validator / tests 固定这些机器合同字段，避免只剩人读规划。

这些合同不声明：

- OPL Agent OS runtime 已功能完备；
- MAS/MAG/RCA/OMA 已 domain ready；
- App release ready 或 production ready；
- 任意品牌模块已达到 L5；
- capability registry 可以生成 owner answer、typed blocker 或 quality verdict。

## 实施 Lanes

| Lane | 名称 | 目标 | 完成门 |
| --- | --- | --- | --- |
| `L0` | Family docs / contract baseline | 冻结 family-level target pattern 和 source-of-truth 文档入口。 | target architecture contract、active_support plan、core docs foldback、focused tests 通过。 |
| `L1` | Brand module matrix | 十个品牌模块都能表达 Agent OS pattern 下的职责和 false authority。 | registry/surfaces/L5 evidence validator 通过；L5 仍保持 evidence_required。 |
| `L2` | Pack compiler / generated surface ABI | Domain Pack 生成 CLI/MCP/App/status/workbench surfaces，替代私有 wrapper。 | direct vs generated parity refs、no forbidden write、domain authority false flags。 |
| `L3` | Capability Registry | Atlas/Pack/Stagecraft 共同承载 capability registry / ABI / use policy。 | JIT/fail-open policy、route-required blocker policy、no domain authority proof。 |
| `L4` | CurrentOwnerDelta conformance | MAS/MAG/RCA/OMA 默认读根都证明是 `current_owner_delta`。 | `opl agents conformance --family-defaults --json` 暴露 default read root and false-authority claims；App fast state 不从 raw worklist 生成 next action。 |
| `L5` | Domain authority kernel manifests | 各 domain 明确哪些保留在 kernel，哪些上收到 OPL。 | 每仓 target delta doc + machine-readable policy / manifest 后续跟进。 |
| `L6` | Evidence / lineage / Vault | Vault 只做 refs-only sidecar，L5 和 production evidence 不抢 default next action。 | evidence refs 只能 fold 成 owner delta / hard gate / owner answer / typed blocker 后影响 default planning。 |
| `L7` | Console / workbench UX | 默认 operator cockpit 只显示 owner、delta、accepted answer shape、artifact/blocker 和 hard gate。 | full drilldown 不污染 first screen；App release truth 仍归 App owner。 |
| `L8` | Domain target deltas | MAS/MAG/RCA/OMA 各自完成 target delta 和后续工作清单。 | 每仓 docs/status/architecture/decisions 可指向本 family target，不制造第二 framework。 |
| `L9` | Production conformance / soak | 真实用户路径、跨 agent scaleout、long-soak、release/install、owner acceptance 和 no-second-truth evidence。 | 只有模块 owner 的 live evidence / owner acceptance 才能关闭 L5 或 production claim。 |

## Cross-Agent Conformance Gate

每个 Foundry Agent 必须证明：

- default read root 是 `current_owner_delta`；
- generated / hosted surface 不写 domain truth；
- OPL / Vault / Console / Runway / Pack 不签 owner receipt、不创建 domain typed blocker、不授权 quality/export verdict；
- conformance pass、contract validation、pack lock、verified ledger、provider completion 和 App projection 都不能声明 domain ready；
- capability registry 缺 optional ref 时 fail open；只有 current delta route-required ref 缺失且影响大边界时才升级 blocker；
- domain authority kernel 的 owner receipt / typed blocker / quality gate / artifact authority 仍在 domain 仓。

## 目标运行架构

目标运行架构不是把 MAS 的医学实现复制到 OPL，而是把 MAS 方案抽象成 family agent operating system：

```text
User / Agent / App
  -> OPL generated or hosted surface
  -> current_owner_delta default read root
  -> OPL StageRun / Pack / Vault / Console / Capability ABI
  -> Domain Pack action target
  -> Domain Authority Kernel owner receipt / typed blocker / verdict ref
```

这条链路的关键是“OPL 承运，domain 裁决”：

- OPL 负责 durable execution、descriptor generation、stage attempt lifecycle、queue/retry/dead-letter、resume、human-gate transport、refs-only ledger、state index、workbench shell、capability discovery 和 cross-agent conformance。
- Domain agent 负责 domain truth、quality/export/publication/review verdict、artifact mutation authority、memory accept/reject、owner receipt、typed blocker 和 domain-native helper。
- App / Console 默认只读 `current_owner_delta`：当前 owner、下一条实质 delta、accepted answer shape、hard gate、typed blocker 和 drilldown refs。
- Vault / lineage / observability / L5 evidence 只进入 audit 或 drilldown；只有被 domain owner fold 成 owner delta、owner answer、hard gate 或 typed blocker 后，才影响默认下一步。

## 十大品牌模块关系

`Domain Capability Registry` 不新增第 11 个品牌模块。它是 `Atlas + Pack + Stagecraft` 的组合能力，而不是新品牌。

| Brand module | Agent OS 职责 | 当前边界 |
| --- | --- | --- |
| `Charter` | 定义 family-level mission、authority split、public promise 和 no-second-truth。 | 不声明 domain ready、Brand L5 或 App release ready。 |
| `Atlas` | 持有 domain registry、capability catalog、workspace/source locator catalog 和 discovery refs。 | Capability catalog 只登记 refs / owner / lifecycle，不执行 capability，不拥有 domain verdict。 |
| `Workspace` | 持有 workspace topology、source root、project root 和 ignored local state 约束。 | Workspace shell 上收，不读取或裁决 domain truth body。 |
| `Pack` | 编译 `agent/` + `contracts/`，生成 CLI/MCP/Skill/product-entry/workbench descriptors。 | Generated surface 不能写 domain truth、不能签 receipt、不能创建 typed blocker。 |
| `Stagecraft` | 持有 stage grammar、stage policy、capability use policy、Progress-First / typed-blocker lineage。 | Capability invocation 绑定 current work unit；optional ref 默认 fail open。 |
| `Runway` | 持有 StageRun、provider attempt、lease、retry/dead-letter、resume、human-gate transport。 | Provider completion 只是 transport evidence，不是 domain completion。 |
| `Vault` | 持有 refs-only evidence、lineage、receipt/blocker refs、audit ledger、retention refs。 | Vault 不存 artifact body / memory body，不把 ref 升级成 owner authority。 |
| `Console` | 持有 default cockpit、`current_owner_delta` projection、operator next action 和 drilldown。 | Console 不能签 owner answer；raw worklist / evidence count 不生成 default next action。 |
| `Foundry Lab` | 持有 Agent Lab、suite run、variant comparison、promotion/canary proposal 和 target improvement refs。 | Work order / proposal 不替 target domain owner 接受变更。 |
| `Connect` | 持有 external interface、generated descriptors、App/plugin/product bridge 和 release/install channel refs。 | Connect 只暴露 surface，不授权 domain ready 或 App release ready。 |

## 核心合同形状

后续实现应把下面合同固定为 family-level 共同语言。这里列的是目标 ABI，不代表所有运行面已完成或 production-ready。

| Contract | Owner | 用途 | 禁止升级 |
| --- | --- | --- | --- |
| `FoundryAgentOsStandard` | OPL | 声明 family target pattern、适用 agents、module mapping、false authority flags。 | 不能声明 domain ready 或 production ready。 |
| `DomainAgentPack` | Domain declares, OPL compiles | 声明 stage、skill、knowledge、quality gate、action、receipt、blocker、capability refs。 | Pack completeness 不能变成 quality/export verdict。 |
| `GeneratedSurfaceBundle` | Pack / Connect | 生成 CLI/MCP/Skill/product-entry/workbench descriptors 和 action targets。 | Generated callable 不能写 domain truth。 |
| `StageRun` | Runway lifecycle, domain semantic refs | 表达 attempt、lease、provider attempt refs、manifest、closeout binding 和 current pointer。 | Provider completion 不能关闭 domain stage。 |
| `CurrentOwnerDelta` | Domain owner truth, Console projection | 默认读面；说明 current owner、required delta、accepted answer shape、hard gate。 | Projection 不能成为 owner answer。 |
| `OwnerReceipt` | Domain authority kernel | 关闭 owner action、artifact mutation、memory decision、quality/export gate 或 handoff。 | OPL / Vault / Console 不能签。 |
| `TypedBlocker` | Domain or gate owner | 命名 blocker、route-back owner、repair condition、avoided forbidden shortcut。 | Generic blocker count 不能替代 domain-owned blocker。 |
| `CapabilityInvocation` | Stagecraft schedules, domain bounds | 当前 delta 触发 capability 的 input refs、question、budget、output refs、fail-open policy。 | Capability output 不能直接变成 verdict。 |
| `ProvenanceEnvelope` | Vault refs-only | entity/activity/agent/source/artifact/run lineage refs。 | Lineage 存在不等于 readiness。 |
| `ConformanceEvidence` | OPL validator | 证明 default read root、false authority、generated surface no-forbidden-write、pack parity。 | Conformance pass 不等于 domain ready。 |

## OPL 基座优化接口

OPL 基座需要优先补齐的不是更多流程，而是稳定、薄、可生成的 family primitives：

| Primitive | 目标接口 | 消费者 |
| --- | --- | --- |
| Pack compiler | `compile_domain_agent_pack(repo_dir, pack_root, contracts)` | MAS/MAG/RCA/OMA generated surfaces |
| Generated surface registry | `render_interface_bundle(domain_descriptor, action_catalog)` | CLI/MCP/Skill/App/Connect |
| StageRun kernel | `start/query/signal/closeout_stage_run(stage_ref, owner_delta_ref)` | Runway / Stagecraft / domain handler |
| Current owner delta reducer | `project_current_owner_delta(domain_receipts, blockers, stage_state)` | Console / App / operator |
| Capability registry | `resolve_capability_for_current_delta(capability_ref, work_unit_ref)` | Atlas / Pack / Stagecraft |
| Evidence Vault | `record_ref_lineage(envelope)` / `read_owner_folded_refs(delta_ref)` | Vault / Console / audits |
| Human gate transport | `open/answer/resume_human_gate(gate_ref)` | Runway / Console / domain owner |
| Cross-agent conformance | `validate_foundry_agent_os(repo_dir)` | OPL CI / domain CI |
| App cockpit projection | `render_current_delta_cockpit(domain_id)` | Console / Connect / App |
| Work-order primitive | `execute/absorb/cleanup_work_order(work_order_ref)` | Foundry Lab / OMA / target agents |

每个 primitive 都必须带 false-authority flags：`can_write_domain_truth=false`、`can_sign_owner_receipt=false`、`can_create_domain_typed_blocker=false`、`can_claim_quality_or_export_verdict=false`。

## Domain Delta 接收门

MAG/RCA/OMA 各自使用 target delta 文档表达同类目标；MAS 使用 `docs/runtime/designs/mas_opl_agent_os_target_operating_architecture.md` 作为同类参考。OPL 接收这些 delta 时只看四类信息：

| 接收项 | 必需内容 |
| --- | --- |
| 上收清单 | 哪些 generic surface 属于 OPL：runtime、generated surfaces、workspace/source shell、artifact/memory lifecycle、Console/workbench、ledger、Agent Lab、work-order primitive。 |
| Authority kernel | 哪些 domain surface 不能上收：truth、quality/export/publication/review verdict、artifact authority、memory accept/reject、owner receipt、typed blocker。 |
| Default read root | 是否明确 `current_owner_delta` 是默认读根，raw worklist / provider completion / evidence count 只做 drilldown。 |
| 禁止声明 | 是否明确 target delta 不等于 domain ready、production ready、App release ready、owner acceptance 或 physical delete authority。 |

OPL 后续不能把 domain target delta 当成“OPL 已接管完成”。接收 delta 只关闭 family-level target clarity；当前 generated parity、no-forbidden-write guard、App/operator consumption 和 owner-route work-order projection 已有机器读面，生产可用性仍要靠 domain/App/brand owner 的 owner receipt roundtrip、typed blocker、human gate、reviewer/quality/export receipt、long-soak、release/install、private-platform owner decision 和 owner acceptance。

## 并行落地地图

下面是后续可并行推进的工作线。前七条已作为机器面落地并进入 regression/maintenance 读法；真正的未闭合开发入口从 `owner-evidence` 开始。每条 lane 都应有 disjoint write set、source of truth、验证命令、停止条件和禁止范围。

| Lane | 写集 | Source of truth | 验证 | 停止条件 |
| --- | --- | --- | --- | --- |
| `pack-abi` | OPL `contracts/opl-framework/*`、pack compiler、interface generator tests | `FoundryAgentOsStandard`、domain pack contracts | typecheck、focused contract tests、interface snapshot tests | MAS/MAG/RCA/OMA 都能生成 descriptor bundle，且 no-forbidden-authority flags 通过。 |
| `current-delta` | Console/read-model/currentness tests | domain owner receipt / typed blocker fixtures | read-model gate tests、App cockpit fixture | 默认首屏只读 `current_owner_delta`，raw worklist 不再生成 next action。 |
| `capability-registry` | Atlas/Pack/Stagecraft contracts + tests | capability registry boundary | schema tests、fail-open/fail-blocker tests | optional ref fail open；route-required hard boundary 缺失才 typed blocker。 |
| `domain-kernel-manifest` | MAS/MAG/RCA/OMA docs/contracts | each domain target delta | docs check、domain focused contract tests | 每仓有 kernel manifest / policy 指向 retained authority。 |
| `vault-lineage` | Vault evidence contracts / lineage tests | refs-only evidence policy | lineage fixture tests、body-forbidden tests | Vault 只保存 refs / digest / locator，不保存 body，不签 owner answer。 |
| `generated-surface-parity` | generated CLI/MCP/App/status descriptors | domain action catalog / stage control | interface generation tests、direct-hosted parity tests | generated surface 与 direct target 返回同一 accepted answer shape。 |
| `app-cockpit` | Console/App projection contracts | current owner delta + hard gate refs | snapshot / schema tests、manual screenshot when App touched | first screen 不被 L5/audit/evidence tail 淹没。 |
| `production-conformance` | runtime evidence / soak contracts | real owner receipt / typed blocker / human gate / App consumption | repo-native soak reports、owner acceptance refs | 只用真实 evidence 关闭 production claim，不用 conformance pass 代替。 |
| `owner-evidence` | MAS/MAG/RCA/OMA/App/brand owner repos + OPL refs-only intake | current owner delta、owner-route work orders、domain/App/brand owner evidence | domain/App repo-native verification、OPL live readout、owner receipt / typed blocker / human gate / release / long-soak refs | 每个 work order 由对应 owner 给出真实 closing ref 或 typed blocker；OPL 只 intake / verify / project。 |

2026-06-11 foldback：W7 的 domain live progress intake 已落成标准合同。MAS/MAG/RCA/OMA 都通过 `contracts/live_stage_run_progress_evidence.json` 暴露 `domain_live_stage_run_progress_evidence`，并把 owner receipt、typed blocker、human gate、quality/export/review、no-regression 和 long-soak refs 作为 OPL refs-only consumption surface。OPL conformance 只在 surface kind、标准 status、`refs_only=true` 与 OPL 不可签 receipt / 不可创建 typed blocker / 不可声明 ready 的 false-authority flags 同时满足时关闭 live-progress open domain；旧私有 surface 或缺字段合同会保持 `blocked_invalid_domain_live_progress_evidence`。

当前 `owner-evidence` 的 OPL 主入口是：

```bash
rtk opl framework operating-maturity --family-defaults --json
```

阅读顺序是 `.framework_operating_maturity.owner_evidence_intake` -> `.framework_operating_maturity.foundry_agent_os_production_evidence_gate.owner_route_work_orders` -> `.framework_operating_maturity.domain_owner_chain_scaleout.domain_owner_evidence_routes` -> `.framework_operating_maturity.unresolved_owner_gates`。`owner_evidence_intake` 会显示每条 lane 的 `observed_receipt_refs`、`observed_ref_shapes`、`observed_ref_counts` 和 domain owner-chain 的 per-domain `observed_domains`；human gate、quality/export、reviewer 和 long-soak refs 会作为具体 evidence ref 被保留，而不是折成模糊 receipt count。对应 work order 只把 `blocker_state` 从 `owner_route_evidence_missing` 调整为 `owner_route_refs_observed_not_production_claim`，并用 `owner_evidence_closure_state` / `open_count_semantics` 表示缺口仍需要 owner acceptance、真实 closing ref 或 typed blocker。无论 observed refs 是否存在，`closed_by_opl=false`、`production_ready_claim_authorized=false` / `ready_claim_authorized=false` 和 false-authority flags 都必须保持不变。

## 验收门

### Functional / structural gate

- OPL 合同存在 `foundry_agent_os_standard`，并由 validator / tests 约束。
- 十个品牌模块都表达 Agent OS pattern 下的职责、false authority 和 L5 evidence requirements。
- Capability Registry 没有成为第 11 模块，也没有成为 default preflight / default tournament / default memory scan。
- MAS/MAG/RCA/OMA 都有 target delta 或同等级目标架构文档。

### Evidence gate

- Pack compile parity、generated surface parity、current_owner_delta default read、capability fail-open boundary、domain authority false boundary 和 cross-agent adoption 都有 machine-readable evidence class。
- Cross-agent conformance 只能证明 shape / boundary；不能声明 domain ready。
- L5 evidence matrix 是 evidence-required，不是 L5 completion。

### Anti-regression gate

- OPL / Vault / Console / Runway / Pack / Capability Registry 不得签 owner receipt、创建 domain typed blocker、写 domain truth 或授权 quality/export verdict。
- Provider completion、queue completion、descriptor ready、App projection、verified ledger、zero worklist、lineage present 都不能声明 domain completion。
- New capability / external-learning intake 必须绑定 current work unit，并默认 fail open。
- New capability / external-learning intake 不得在 domain 仓新增第二 selector、第二 active backlog、always-on sidecar 或默认 preflight；selector / resolver 归 OPL Capability Registry，domain 仓只声明 refs 消费与 authority 晋级边界。
- App / Console first screen 不能从 audit tail 或 raw worklist 生成 next action。

## 下一步具体工作

1. `MAS`：在当前 owner delta 下给出真实 paper owner receipt、quality gate receipt、typed blocker、human gate 或 route-back evidence；external-learning refs 只能在被 MAS authority kernel 消费并生成 owner evidence 后计入真实进度。
2. `MAG`：用真实 grant stage 返回 grant owner receipt、typed blocker、human gate、quality/export receipt 或 no-regression evidence；OPL generated surface parity 只作为入口一致性 guard。
3. `RCA`：用真实 visual stage 返回 visual owner receipt、review/export receipt、typed blocker、human gate 或 no-regression evidence；同名 MCP descriptor 允许存在，但必须继续通过 source lineage / accepted answer shape disambiguation。
4. `OMA`：用真实 target-agent work order 返回 developer work-order receipt、target-agent typed blocker、promotion/canary receipt 或 no-regression evidence；不得让 OMA 重新形成第二套 Framework。
5. `One Person Lab App`：由 App release owner 给出 release-ready / production-user-path verdict、release typed blocker 或 install/release evidence refs；OPL maturity 只消费这些 refs，不替 App 发布结论。
6. `Brand module owners`：逐模块补真实 L5 evidence，包括 live user path、cross-agent scaleout、long-soak/recovery、operator repair loop、release/install、owner acceptance 和 no-second-truth regression evidence。
7. `Private platform retirement owners`：对 retained wrapper / facade / alias / helper 给出 `physical_delete_authorization_ref`、`keep_as_authority_adapter_ref` 或 `typed_blocker_ref`；OPL 只投影 work order，不代签物理删除授权。
8. `OPL Framework`：维护 W0/W1/W3/W5/W6/W7 机器读面和 regression tests；新增 external-learning / capability refs 时只改 current-delta-bound resolver、fail-open policy 或 owner-route work-order policy，不新建 domain-local selector、always-on sidecar 或第二 active backlog。

## 禁止声明

- 不把 `foundry_agent_os_standard` 写成 domain ready。
- 不把 Pack compile / generated surface parity 写成 quality verdict。
- 不把 capability registry 写成 domain authority。
- 不把 `current_owner_delta` projection 写成 owner answer。
- 不把 Vault ref 写成 owner receipt authority。
- 不把 Runway provider completion 写成 domain completion。
- 不把 Console / App projection 写成 App release ready。
- 不把 L5 evidence matrix 变成 L5 completion。
