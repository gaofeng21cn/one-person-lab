# OPL Framework 源码模块

Owner: `OPL Framework`
Purpose: `source_module_physical_index`
State: `active_source_index`
Machine boundary: 本目录是 OPL Framework 十大品牌模块的真实物理入口。runtime truth、domain truth、artifact body、owner receipt、typed blocker 和 production readiness 继续归各自 runtime、domain、contract 或 ledger surface。

## 读法

维护 Framework 源码时先区分三层：

| 层 | 路径 | 作用 | 不拥有 |
| --- | --- | --- | --- |
| Framework modules | `src/modules/<module_id>/` | 十个品牌模块的源码 owner、public index 和 contract ref。 | App / Cloud 产品包装、domain truth、runtime receipt body。 |
| Entrypoints | `src/entrypoints/` | CLI / product / adapter 启动面，把请求路由到模块 public exports。 | 独立品牌 owner、domain authority。 |
| Kernel | `src/kernel/` | brand-neutral shared runtime primitive、types 和 helper。 | 产品语义、模块语义重解释。 |

维护模块代码时先定位 owning module：

1. 选择对应的品牌模块目录。
2. 读取该模块的 `index.ts`；它是模块 public index 和 contract ref 的入口。
3. 新增模块代码放入 `src/modules/<module_id>/`。
4. 跨模块依赖从 owning module 的 `index.ts` 或 `src/modules/index.ts` public exports 进入。
5. root-level `src/*.ts` 不再作为新入口或扩展点。

`contracts/opl-framework/source-module-map.json` 是机器归属校验和历史 root 文件 readback，不是 `src/modules/` 的替代组织。

App / Cloud 产品语义可以把多个模块包装成用户可见能力，但不重划源码 owner：在线 `OPL Workspace` 产品体验不等同 `workspace` 模块，`Console` 是管理 / 投影集成面，`Connect` 是可独立调用连接能力，`Ledger` 只持有 evidence / receipt refs。

## Modules

| Module | Physical owner | Owns | Does not own |
| --- | --- | --- | --- |
| `charter` | `src/modules/charter` | contracts, naming, governance, shared type spine. | runtime truth, domain truth, release verdict. |
| `atlas` | `src/modules/atlas` | descriptors, catalogs, domain discovery, metadata graph. | execution, receipt signing, domain verdict. |
| `workspace` | `src/modules/workspace` | workspace protocol, project topology, files, validation. | online OPL Workspace product truth, artifact body, quality verdict. |
| `pack` | `src/modules/pack` | domain packs, capability ABI, generated surfaces, skills. | domain handler implementation, owner verdict. |
| `stagecraft` | `src/modules/stagecraft` | stages, cognitive computation, policies, handoff. | durable provider, domain quality verdict. |
| `runway` | `src/modules/runway` | runtime execution, queues, providers, recovery. | domain truth, owner receipt, production readiness. |
| `ledger` | `src/modules/ledger` | refs-only evidence, receipts, provenance, lineage. | memory/artifact body, domain verdict. |
| `console` | `src/modules/console` | App/operator projections, actions, drilldown, management surface. | Connect private backend, runtime truth, owner answer. |
| `foundry-lab` | `src/modules/foundry-lab` | agent creation, conformance, evaluation, promotion. | MAS/MAG/RCA domain authority. |
| `connect` | `src/modules/connect` | directly callable connectors, adapters, install/update, plugin/skill sync. | Console-only backend, semantic authority, domain verdict. |
