# OPL Framework 源码模块边界

Owner: `One Person Lab`
Purpose: `source_module_boundary_reference`
State: `support_reference`
Machine boundary: 本文是维护者人读说明。机器真相继续归 `contracts/opl-framework/source-module-map.json`、`contracts/opl-framework/module-dependency-policy.json`、`scripts/source-module-boundary.mjs`、source、tests 和 fresh CLI/readback。

## 结论

OPL Framework 当前源码边界是十个物理模块：

```text
src/modules/charter
src/modules/atlas
src/modules/workspace
src/modules/pack
src/modules/stagecraft
src/modules/runway
src/modules/ledger
src/modules/console
src/modules/foundry
src/modules/connect
```

`src/modules/<module_id>/` 是 Framework 源码 owner。`OPL Cloud`、在线 Workspace、Console 页面、Gateway/API 和 `OPL Fabric` 是产品层或 Cloud 层语义，可以组合多个 Framework 模块形成用户可见能力；它们不作为第 11 个源码模块。`OPL Fabric` 的通用资源底座能力由 `Connect`、`Runway`、`Pack`、`Workspace` 和 `Ledger` 协作承接。

## 机器入口

| 入口 | 职责 |
| --- | --- |
| `contracts/opl-framework/source-module-map.json` | 固定十个模块、物理根、public entrypoint、shared kernel 和 source layout。 |
| `contracts/opl-framework/module-dependency-policy.json` | 固定跨模块 import 规则、thin public entry 规则和 forbidden dependency。 |
| `scripts/source-module-boundary.mjs` | 检查模块目录、entrypoint、root-level `src/*.ts`、deep cross-module import 和 forbidden dependency。 |
| `npm run source:modules -- --strict-imports --strict-cycles` | 当前维护者默认边界验证命令。 |

当 fresh `source:modules -- --strict-imports --strict-cycles` 输出 `status=ok`、十个 module entrypoint 全部存在、root-level `src/*.ts` 为 0、`deep_import_violations.count=0`、`forbidden_dependency_violations.count=0`、`dependency_cycles.count=0` 时，可以声明“源码模块结构边界已落地”。该声明覆盖源码组织、public import gate 和模块依赖环硬门，不覆盖 runtime、release、domain readiness、Brand L5 或 production readiness。

## 完成度审计面

当前 `scripts/source-module-boundary.mjs` 已覆盖 `--strict-imports`、`--strict-cycles`、deep cross-module import、forbidden dependency 和 pair-count / cycle readback；本轮不新增运行时功能或 Nx / ESLint / Project References。

| 审计项 | 当前状态 | Fresh evidence | 缺口或下一步 |
| --- | --- | --- | --- |
| 十模块物理归位 | `done` | `module_entrypoints.expected_count=10`，且 missing / mismatched / unexpected module roots 为空。 | 新增模块必须先改 `source-module-map.json` 和本 policy。 |
| target source layout | `done` | `src/entrypoints/cli.ts` 存在，root-level `src/*.ts` 为 0。 | root-level `src/*.ts` 不再作为新 owner 接口。 |
| deep cross-module import | `done` | `npm run source:modules -- --strict-imports --strict-cycles` 下 `deep_import_violations.count=0`。 | 只能证明跨模块 import 路由合法，不能证明 public API 已经最小。 |
| 第一批 forbidden dependency | `done` | `forbidden_dependency_violations.count=0`。 | 当前只覆盖 `module-dependency-policy.json` 已列出的方向约束。 |
| dependency cycle | `done` | `npm run source:modules -- --strict-imports --strict-cycles` 下 `dependency_cycles.count=0`。 | 只能证明当前 public-entry graph 无依赖环，不能证明每个 public API 已经最小。 |
| public entrypoint 收薄 | `partial` | `index.ts` / `public/**` 作为合法 public surface 被脚本识别。 | 多个模块 `index.ts` 仍是 broad re-export；下一步是按热点拆 thin public entry 或收窄 re-export。 |
| 下一批 forbidden candidates | `partial` | `module-dependency-policy.json` 的 `next_forbidden_dependency_candidates` 记录候选方向。 | 先用 `pair_counts` 和人工 owner 判断确认迁移路径，再升级为 enforced `forbidden_dependencies`。 |

## Public Interface 规则

模块 public interface 由三类入口组成：

| 入口 | 用途 |
| --- | --- |
| `src/modules/<module_id>/index.ts` | 模块默认 public index。 |
| `src/modules/<module_id>/public/**/*.ts` | 高频、低依赖、容易触发初始化循环的 thin public entry。 |
| `src/modules/index.ts` | 模块身份常量和命名空间聚合，不做无边界大 barrel。 |

同模块内部保持高聚合，优先使用相对 import 连接该 owner 下的 parts / cases / helpers。跨模块调用只进入目标模块的 public index 或 thin public entry。需要让内部符号被其他模块消费时，先把该符号提升到目标模块 public entry，再迁移调用方。

`entrypoints/` 和 `kernel/` 是非品牌技术层。`entrypoints/` 承接 CLI、product 和 adapter 启动面；`kernel/` 承接 brand-neutral shared primitive。二者服务十个模块，不形成独立品牌模块或产品 truth。

## 模块协作边界

| 模块 | 源码 owner 重点 | 主要协作关系 |
| --- | --- | --- |
| `charter` | 命名、合同、术语、authority matrix 和品牌治理。 | 为所有模块固定语言和 forbidden claim 边界。 |
| `atlas` | Agent / capability / surface / owner / lifecycle catalog。 | 给 Pack、Console、Connect 和 Foundry Kernel 提供 refs-only catalog。 |
| `workspace` | Workspace protocol、Project Unit、Stage Artifact Unit 和文件生命周期投影。 | 给 Runway、Console、Ledger 和 domain owner 提供可检查落点。 |
| `pack` | Declarative Domain Pack、Capability Invocation ABI、authority ABI、generated surfaces。 | 给 Stagecraft、Runway、Console、Connect 和 Foundry Kernel 提供声明式 ABI。 |
| `stagecraft` | Stage 设计、tool affordance、quality gate refs、handoff 和 route-back。 | 给 Runway 提供 launch/admission 约束，给 Console 提供 stage readiness 投影。 |
| `runway` | Durable execution、stage-attempt request/projection、attempt、lease、retry/dead-letter、human gate 和 reconciler。 | 执行和恢复归 Runway；domain truth、owner receipt 和 quality verdict 回 domain owner。 |
| `ledger` | refs-only evidence、receipt/blocker refs、lineage、restore/no-regression refs。 | 给 Console、Runway、Foundry Kernel 和 domain owner 提供可审计证据索引。 |
| `console` | App/operator projection、current owner、next action、governance 和 drilldown。 | 负责展示和治理；需要连接/安装/同步时进入 Connect，运行恢复进入 Runway，证据进入 Ledger。 |
| `foundry` | Agent 创建、接管、自进化、FoundryRun、评测证据、版本、canary、activation/rollback。 | 编排 OMA semantic provider、Pack/Runway/Ledger 与 Owner gate；target domain owner 保留保护测试、质量接受和生产采用。 |
| `connect` | 外部 connector、CLI/MCP/OpenAI/AI SDK/Skill descriptor、install/release distribution。 | 可以被 App、CLI、Runway 或 MAS 等 domain agent 直接调用；Console 是展示和治理面，不是 Connect 的调用前置条件。 |

Console / Runway / Ledger / Connect / Foundry Kernel 的边界可按一句话记忆：

- `Console` 负责让人知道当前看什么、做什么、等谁。
- `Runway` 负责把可执行 stage attempt 持续跑起来并安全恢复。
- `Ledger` 负责保存 refs-only evidence、receipt/blocker ref 和 lineage。
- `Connect` 负责外部连接、descriptor 派生、skill/plugin/module sync 和分发。
- `Foundry Kernel` 负责把 exact-version evidence 交给 OMA 诊断，再物化、评测和版本化完整下一版 blueprint；目标 owner 保留质量接受、权限授权与生产采用决定。

## 完成度口径

当前源码模块化可以专业表述为：

> 已完成 Framework 十模块的物理归位、public entrypoint 硬门、deep cross-module import 清零和 strict dependency cycle 清零。

这个口径由 `source-module-map.json`、`module-dependency-policy.json` 和 fresh `npm run source:modules -- --strict-imports --strict-cycles` 共同支撑。它说明源码 owner、public entrypoint、strict import gate 和 dependency-cycle gate 已经进入可执行维护状态。

第一批 owner-alignment 已经把四类容易造成语义穿透的实现归位：

| 调整 | 新 owner |
| --- | --- |
| brand-neutral JSON record / runtime endpoint / system preference helper | `kernel` |
| source-ref normalization helper | `kernel` |
| App release / user-path evidence ledger | `ledger` |
| App release user-path evidence payload/workorder projection | `ledger` |
| stage replay missing receipt workorder | `stagecraft` |
| stage-attempt generic projections 与 memory trace projection | `runway` |
| family action catalog contract 与 shared schema normalization | `kernel` |
| `FrameworkContractError` 与合同错误 vocabulary | `kernel` |

2026-07-03 的 Runway -> Console 收薄已分两步完成：先移除 Runway 经由 Console public re-export 反向读取自身 generic projection 的调用，再通过 `runtime-tray-snapshot-provider.ts` 把 `family-runtime-evidence-worklist.ts`、`runtime-operator-action-execution.ts` 和 `observability-export.ts` 改成由 CLI/App/Console caller 显式注入 Console-owned `buildRuntimeTraySnapshot`。当前 fresh `source:modules` readback 中 `runway -> console` pair 已消失。该口径只证明源码依赖方向更清楚，不改变 Console 仍拥有 App/operator snapshot projection 的事实，也不声明 runtime ready、Temporal live migration、domain ready 或 production readiness。

2026-07-03 的 Foundry Kernel -> Console 收薄继续沿用 provider injection：`framework readiness`、`framework readiness --detail compact` 和 `framework operating-maturity` 不再直接 import Console 的 runtime tray snapshot builder；public CLI caller 显式注入 Console-owned `buildRuntimeTraySnapshot`。App release user-path evidence 的 payload / workorder projection 迁入 Ledger public surface，Foundry Kernel 的 readiness next-safe-action 直接消费 Ledger payload helper 和 runtime snapshot 中的 refs-only evidence。当前 fresh `source:modules -- --strict-imports` readback 中 `foundry -> console` pair 已消失，Console 也不再进入 dependency-cycle SCC；剩余 SCC 覆盖 `atlas`、`charter`、`connect`、`foundry`、`ledger`、`pack`、`runway`、`stagecraft`、`workspace` 九个模块，edge_count 为 47。该口径只证明 Foundry Kernel 不再把 Console implementation 当作前置依赖，不改变 Console 作为 App/operator projection owner 的事实，也不声明 owner acceptance、App release ready、domain ready 或 production readiness。

2026-07-03 的 family action catalog 收薄已把 action catalog contract 从 Console 实现面迁到 `src/kernel/family-action-catalog-contract.ts`。Console 只保留 thin re-export facade；Atlas、Connect、Foundry Kernel、Pack 和 Stagecraft 等消费者直接从 kernel shared contract 读取。该口径只证明 shared contract owner 与 import direction 更清楚，不改变 domain truth、owner receipt、typed blocker、runtime DB/provider queues 或 release artifacts。

2026-07-03 的 Charter error boundary 收薄把跨模块常用的 `FrameworkContractError` 调整为 `src/kernel/contract-validation.ts` 的 brand-neutral shared primitive。模块实现不再为了抛出统一合同 / CLI 错误而依赖 `charter` public index；`charter` 仍保留对外 re-export，服务旧的 public import surface 和 contract loader 语义。当前 fresh `source:modules -- --strict-imports` readback 中 `stagecraft -> charter`、`workspace -> charter`、`pack -> charter` 这些仅由错误类型造成的 pair 已消失，剩余 SCC edge_count 从 47 收薄到 44。该口径只证明错误 vocabulary 不再放大模块依赖图，不改变 `Charter` 对合同语言与 forbidden claim 的 owner 身份，也不声明 strict cycle 已完成。

2026-07-03 的 Workspace topology 收薄把 `workspace_topology_profile` 从 Foundry Agent series 内联常量迁回 Workspace owner，Foundry Kernel 只消费 Workspace public contract。Owner id normalization 也从 Connect public entrypoint 收回到 `kernel` shared primitive，Ledger / Foundry Kernel 不再为了通用 owner alias normalization 依赖 Connect。该历史 readback 只证明 Workspace topology / Project Unit / Stage Artifact Unit 的合同 owner 回到 Workspace、通用 owner id vocabulary 回到 kernel；2026-07-16 hard cut 后，scaffold/conformance 归 Pack，Foundry Kernel 持有 FoundryRun、评测证据、版本、canary、activation 与 rollback。

2026-07-03 的后续 source owner 收薄把 product-entry handoff bundle 从 Ledger 迁到 Console / Product Entry owner、developer-mode closeout ledger 从 Connect 迁到 Foundry Kernel owner、repo generated-interface bundle 组装收回 Pack owner，并把 contract loader 使用的 domain / workspace / pack / ScholarSkills contract validators 迁回 Charter `contract-validators/`。当前 fresh `source:modules` readback 仍为 `status=ok`、`deep_import_violations=0`、`forbidden_dependency_violations=0`，dependency-cycle SCC 不含 Console / Workspace，edge_count 稳定为 31。该口径只证明这些实现的源码 owner 更贴近实际语义，不改变 Ledger evidence vocabulary、Connect connector authority、Pack descriptor authority、Workspace protocol、domain truth、owner receipt、typed blocker、runtime truth、release/currentness claim 或 Brand L5 状态。

2026-07-04 的 strict cycle 收薄把三类反向依赖拆开：Atlas 只消费 manifest / descriptor 字段，不再读取 Runway provider closure；Runway 通过 entrypoint / Connect caller 注入 OPL module exec resolver 和 Foundry scaffold builder，不再直接 import Connect 或 Foundry Kernel；local Codex defaults 与 managed runtime contract 下沉到 brand-neutral `kernel/`。当前 fresh `source:modules -- --strict-imports --strict-cycles` readback 为 `status=ok`、`deep_import_violations=0`、`forbidden_dependency_violations=0`、`dependency_cycles.count=0`。该口径只证明源码依赖图已无 public-entry-level 环，不改变 Connect connector authority、Foundry Kernel agent scaffold owner、Runway runtime owner、domain truth、owner receipt、typed blocker、runtime truth、release/currentness claim 或 Brand L5 状态。

2026-07-04 的模块内聚收薄继续处理三个高风险长文件族：Console 把 Settings Control Center 静态 catalog、action payload 解析和 App state view sections 拆入 Console-owned parts；Connect 把 managed update kernel 的 installation carrier 与 runtime substrate projection 拆入 `managed-update-kernel-parts/`；Runway 把 paper-mission route handoff、runtime approval 和 observability export shared projection 拆入 Runway-owned parts。当前 formerly targeted 文件均降到 1000 行以内，且 fresh `source:modules -- --strict-imports --strict-cycles`、focused Console / Connect / Runway tests、`npm test`、`typecheck` 和 `build` 仍作为吸收证据。该口径只证明模块内部文件边界更清楚、维护面更薄，不改变 runtime/live evidence、release readiness、domain readiness、owner receipt 或 Brand L5 状态。

2026-07-04 的后续内聚收薄曾把剩余超 1000 行的 `src/modules/**/*.ts` 文件按当时 owner 边界拆分；其中旧执行 IO、readiness diagnostic 和 capability map 归属已经被 2026-07-16 hard cut 取代。当前 owner 是：Foundry 只持状态机/协议/风险/端口编排，Pack 持 scaffold/conformance，Runway 持执行，Ledger 持证据/版本，Console 持 operator projection。历史行数 readback 不代表当前 public API、runtime/live evidence、release readiness、domain readiness、owner receipt 或 Brand L5 状态。

`module-dependency-policy.json` 也开始记录第一批方向约束：`ledger -> runway`、`stagecraft -> runway`、`workspace -> console`、`foundry -> console` 与 Charter 对 operator / improvement / connector surfaces 的依赖都不允许出现。该约束用于保护 evidence、stage policy、workspace protocol、Foundry improvement readout 与 operator projection 的 owner 边界。

后续治理重点是 public API 收薄和依赖方向治理。`source:modules` 的 `cross_module_imports.pair_counts` 可以暴露 public API 依赖热点；cycle audit 或人工架构审查可以定位需要调整的依赖方向。此类治理优先通过收窄 public API、拆 thin public entry、移动 brand-neutral primitive 到 `kernel/`、或重新划分调用方向来完成。它们是维护质量和耦合度改进，不改变“十个源码 owner 已归位且 strict cycle 清零”的结构结论。当前 public entrypoint 仍是合法性边界，不是最小 API 证明：模块 `index.ts` 可以是 broad re-export，只有迁移到更薄的 `public/**` 或明确 owner API 后，才能把对应依赖方向升级为更严格 forbidden policy。

## 维护流程

1. 新源码进入 owning `src/modules/<module_id>/`。
2. 同模块内部使用相对 import，保持 owner 内聚。
3. 跨模块消费先提升目标 public API，再从目标 public index 或 `public/**` thin entry 调用。
4. 新增源码模块时同步更新 `source-module-map.json`、`module-dependency-policy.json`、品牌模块 docs 和 contract support index。
5. 提交前运行 `npm run source:modules -- --strict-imports --strict-cycles`；文档-only 变更至少运行 `git diff --check` 和关键术语落点检查。
