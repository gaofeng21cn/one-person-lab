# OPL Framework 源码模块

Owner: `OPL Framework`
Purpose: `source_module_physical_index`
State: `active_source_index`
Machine boundary: 本目录是 OPL Framework 十大品牌模块的真实物理入口。runtime truth、domain truth、artifact body、owner receipt、typed blocker 和 production readiness 继续归各自 runtime、domain、contract 或 ledger surface。

## 读法

维护 Framework 源码时先区分三层：

| 层 | 路径 | 作用 | 不拥有 |
| --- | --- | --- | --- |
| Framework modules | `src/modules/<module_id>/` | 十个品牌模块的源码 owner、public index、薄 public entry 和 contract ref。 | App / Cloud 产品包装、domain truth、runtime receipt body。 |
| Entrypoints | `src/entrypoints/` | CLI / product / adapter 启动面，把请求路由到模块 public exports。 | 独立品牌 owner、domain authority。 |
| Kernel | `src/kernel/` | brand-neutral shared runtime primitive、types 和 helper。 | 产品语义、模块语义重解释。 |

维护模块代码时先定位 owning module：

1. 选择对应的品牌模块目录。
2. 读取该模块的 `index.ts`；它是模块 public interface 和 contract ref 的默认入口。
3. 新增代码放入 owning module，例如 `src/modules/<module_id>/` 下的 `parts/`、`cases/`、`types/` 或本模块已有子目录。
4. 模块内依赖优先使用相对 import，保持同一 owner 下的代码高聚合。
5. 跨模块依赖从目标 owning module 的 `index.ts`、`public/**` 薄入口或 `src/modules/index.ts` public exports 进入。
6. 跨模块内部文件 import 是 strict boundary violation；需要公开的符号先进入目标模块 `index.ts` 或 `public/**` 薄入口，再从 public entry 调用。
7. root-level `src/*.ts` 不接受新 owner；CLI / product / adapter 启动面进入 `src/entrypoints/`，共享 runtime primitive 进入 `src/kernel/`，模块语义进入对应 `src/modules/<module_id>/`。

`contracts/opl-framework/source-module-map.json` 是机器归属校验和历史 root 文件 readback，不是 `src/modules/` 的替代组织。

App / Cloud 产品语义可以把多个模块包装成用户可见能力，但不重划源码 owner：在线 `OPL Workspace` 产品体验不等同 `workspace` 模块，`OPL Fabric` 是 Cloud / Product 层资源底座语义，由 `connect`、`runway`、`pack`、`workspace` 和 `ledger` 协作承接；`console` 是管理 / 投影集成面，`connect` 是可独立调用连接能力，`ledger` 持有 evidence / receipt refs。

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
| `foundry` | `src/modules/foundry` | agent creation, conformance, evaluation, promotion. | MAS/MAG/RCA domain authority. |
| `connect` | `src/modules/connect` | directly callable connectors, adapters, install/update, plugin/skill sync. | Console-only backend, semantic authority, domain verdict. |
