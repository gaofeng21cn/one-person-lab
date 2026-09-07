# OPL Framework 源码导航

Owner: `OPL Framework`
Purpose: `source_topology_physical_index`
State: `active_support`

本文只帮助维护者定位源码。文件归属和公开入口由 [source-module-map.json](../contracts/opl-framework/source-module-map.json) 定义；依赖方向由 [module-dependency-policy.json](../contracts/opl-framework/module-dependency-policy.json) 定义。

| 路径 | 查找内容 |
| --- | --- |
| [authority](./authority/) | contracts、workspace、packages、stages、evidence 和 evolution 的 Framework authority 实现。 |
| [adapters](./adapters/) | execution 与 integration 的 executor、provider、carrier 和外部协议适配。 |
| [read-models](./read-models/) | catalog/discovery 与 operator/product 投影。 |
| [host](./host/) | Framework Host composition、profiles 和 plugin contributions。 |
| [entrypoints](./entrypoints/) | CLI、App 和 runtime 接线；CLI 从 [cli.ts](./entrypoints/cli.ts) 进入。 |
| [kernel](./kernel/) | 共享 types、ports 和基础 primitive。 |

workspace Package 的源码入口由各自 manifest 的 exports 定义：
[cordis-abi](../packages/cordis-abi/package.json) 与 [package-host](../packages/package-host/package.json)。
它们与 source unit、plugin contribution 的关系见 [package-topology.json](../contracts/opl-framework/package-topology.json)。

结构与 owner 分工见[架构](../docs/architecture.md)；新增文件、调整 import 或切换 caller 的操作和验证见[源码模块边界](../docs/references/source-module-boundary.md)。
Package 拆分与发布条件见[项目定位](../docs/project.md)，本文不记录分支、发布或安装状态。
