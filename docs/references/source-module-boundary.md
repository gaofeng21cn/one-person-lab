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
src/modules/foundry-lab
src/modules/connect
```

`src/modules/<module_id>/` 是 Framework 源码 owner。`OPL Cloud`、在线 Workspace、Console 页面、Gateway/API 和 `OPL Fabric` 是产品层或 Cloud 层语义，可以组合多个 Framework 模块形成用户可见能力；它们不作为第 11 个源码模块。`OPL Fabric` 的通用资源底座能力由 `Connect`、`Runway`、`Pack`、`Workspace` 和 `Ledger` 协作承接。

## 机器入口

| 入口 | 职责 |
| --- | --- |
| `contracts/opl-framework/source-module-map.json` | 固定十个模块、物理根、public entrypoint、shared kernel 和 source layout。 |
| `contracts/opl-framework/module-dependency-policy.json` | 固定跨模块 import 规则、thin public entry 规则和 forbidden dependency。 |
| `scripts/source-module-boundary.mjs` | 检查模块目录、entrypoint、root-level `src/*.ts`、deep cross-module import 和 forbidden dependency。 |
| `npm run source:modules -- --strict-imports` | 当前维护者默认边界验证命令。 |

当 fresh `source:modules -- --strict-imports` 输出 `status=ok`、十个 module entrypoint 全部存在、root-level `src/*.ts` 为 0、`deep_import_violations.count=0`、`forbidden_dependency_violations.count=0` 时，可以声明“源码模块结构边界已落地”。该声明覆盖源码组织与 import gate，不覆盖 runtime、release、domain readiness、Brand L5 或 production readiness。

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
| `atlas` | Agent / capability / surface / owner / lifecycle catalog。 | 给 Pack、Console、Connect 和 Foundry Lab 提供 refs-only catalog。 |
| `workspace` | Workspace protocol、Project Unit、Stage Artifact Unit 和文件生命周期投影。 | 给 Runway、Console、Ledger 和 domain owner 提供可检查落点。 |
| `pack` | Declarative Domain Pack、Capability Invocation ABI、authority ABI、generated surfaces。 | 给 Stagecraft、Runway、Console、Connect 和 Foundry Lab 提供声明式 ABI。 |
| `stagecraft` | Stage 设计、tool affordance、quality gate refs、handoff 和 route-back。 | 给 Runway 提供 launch/admission 约束，给 Console 提供 stage readiness 投影。 |
| `runway` | Durable execution、typed queue、attempt、lease、retry/dead-letter、human gate 和 reconciler。 | 执行和恢复归 Runway；domain truth、owner receipt 和 quality verdict 回 domain owner。 |
| `ledger` | refs-only evidence、receipt/blocker refs、lineage、restore/no-regression refs。 | 给 Console、Runway、Foundry Lab 和 domain owner 提供可审计证据索引。 |
| `console` | App/operator projection、current owner、next action、governance 和 drilldown。 | 负责展示和治理；需要连接/安装/同步时进入 Connect，运行恢复进入 Runway，证据进入 Ledger。 |
| `foundry-lab` | Agent 创建、测试接管、自进化、work order、canary、promotion/rollback。 | 产出改进 work order 和 handoff；target domain owner 保留采纳/拒绝和 authority verdict。 |
| `connect` | 外部 connector、CLI/MCP/OpenAI/AI SDK/Skill descriptor、install/release distribution。 | 可以被 App、CLI、Runway 或 MAS 等 domain agent 直接调用；Console 是展示和治理面，不是 Connect 的调用前置条件。 |

Console / Runway / Ledger / Connect / Foundry Lab 的边界可按一句话记忆：

- `Console` 负责让人知道当前看什么、做什么、等谁。
- `Runway` 负责把可执行 stage attempt 持续跑起来并安全恢复。
- `Ledger` 负责保存 refs-only evidence、receipt/blocker ref 和 lineage。
- `Connect` 负责外部连接、descriptor 派生、skill/plugin/module sync 和分发。
- `Foundry Lab` 负责从 evidence 生成改进 work order，并把采纳权交给目标 owner。

## 完成度口径

当前源码模块化可以专业表述为：

> 已完成 Framework 十模块的物理归位、public entrypoint 硬门和 deep cross-module import 清零。

这个口径由 `source-module-map.json`、`module-dependency-policy.json` 和 fresh `npm run source:modules -- --strict-imports` 共同支撑。它说明源码 owner、public entrypoint 和 strict import gate 已经进入可执行维护状态。

第一批 owner-alignment 已经把四类容易造成语义穿透的实现归位：

| 调整 | 新 owner |
| --- | --- |
| brand-neutral JSON record / runtime endpoint / system preference helper | `kernel` |
| App release / user-path evidence ledger | `ledger` |
| stage replay missing receipt workorder | `stagecraft` |
| stage-attempt generic projections 与 memory trace projection | `runway` |

2026-07-03 的 Runway -> Console 收薄已移除 Runway 经由 Console public re-export 反向读取自身 generic projection 的调用。剩余 Runway -> Console 依赖集中在 `buildRuntimeTraySnapshot` 的三处 consumer：`family-runtime-evidence-worklist.ts`、`runtime-operator-action-execution.ts` 和 `observability-export.ts`。继续收薄需要先拆分 runtime tray snapshot 的 Console owner 投影与 Runway runtime 输入边界；不要在普通 import cleanup 中整体搬移该 snapshot builder。

`module-dependency-policy.json` 也开始记录第一批方向约束：`ledger -> runway`、`stagecraft -> runway`、`workspace -> console` 与 Charter 对 operator / improvement / connector surfaces 的依赖都不允许出现。该约束用于保护 evidence、stage policy、workspace protocol 与 operator projection 的 owner 边界。

后续治理重点是 public-level 依赖收薄和依赖方向治理。`source:modules` 的 `cross_module_imports.pair_counts` 可以暴露 public API 依赖热点；cycle audit 或人工架构审查可以定位需要调整的依赖方向。此类治理优先通过收窄 public API、拆 thin public entry、移动 brand-neutral primitive 到 `kernel/`、或重新划分调用方向来完成。它们是维护质量和耦合度改进，不改变“十个源码 owner 已归位”的结构结论。当前 dependency cycle 仍按 advisory 读法处理，不能把 strict import pass 外推为模块间已经完全低耦合。

## 维护流程

1. 新源码进入 owning `src/modules/<module_id>/`。
2. 同模块内部使用相对 import，保持 owner 内聚。
3. 跨模块消费先提升目标 public API，再从目标 public index 或 `public/**` thin entry 调用。
4. 新增源码模块时同步更新 `source-module-map.json`、`module-dependency-policy.json`、品牌模块 docs 和 contract support index。
5. 提交前运行 `npm run source:modules -- --strict-imports`；文档-only 变更至少运行 `git diff --check` 和关键术语落点检查。
