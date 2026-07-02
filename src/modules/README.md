# OPL Framework 源码模块

Owner: `OPL Framework`
Purpose: `source_module_physical_index`
State: `active_source_index`
Machine boundary: 本目录是 OPL Framework 十大品牌模块的真实物理入口。runtime truth、domain truth、artifact body、owner receipt、typed blocker 和 production readiness 继续归各自 runtime、domain、contract 或 ledger surface。

## 读法

维护 Framework 源码时先定位 owning module：

1. 选择对应的品牌模块目录。
2. 读取该模块的 `index.ts`；它是模块 public index 和 contract ref 的入口。
3. 新增模块代码放入 `src/modules/<module_id>/`。
4. 跨模块依赖从 owning module 的 `index.ts` 或 `src/modules/index.ts` public exports 进入。
5. root-level `src/*.ts` 不再作为新入口或扩展点。

`contracts/opl-framework/source-module-map.json` 是机器归属校验和历史 root 文件 readback，不是 `src/modules/` 的替代组织。

`entrypoints/` 和 `kernel/` 属于非品牌技术层。`entrypoints/` 承接 CLI / product / adapter 启动面，`kernel/` 承接共享 runtime primitive；它们服务十大模块，不拥有独立 brand owner。

## Modules

- `charter`: contracts, naming, governance, shared type spine.
- `atlas`: descriptors, catalogs, domain discovery, metadata graph.
- `workspace`: project topology, files, workspace validation.
- `pack`: domain packs, capability ABI, generated surfaces, skills.
- `stagecraft`: stages, cognitive computation, policies, handoff.
- `runway`: runtime execution, queues, providers, recovery.
- `ledger`: refs-only evidence, receipts, provenance, lineage.
- `console`: App/operator projections, actions, drilldown.
- `foundry-lab`: agent creation, conformance, evaluation, promotion.
- `connect`: adapters, connectors, install/update, plugin/skill sync.
