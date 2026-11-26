# OPL Runtime

Runtime 文档只解释当前运行对象和运维边界。

- [Runtime 命名与边界](./opl-runtime-naming-and-boundary-contract.md)
- [Stage graph 与 AI route](./stage-graph-route-transition-runtime.md)
- [Foundry Kernel control plane](./opl-foundry-kernel-control-plane.md)

动态 provider、worker、Attempt 和 health 状态从 fresh CLI readback 读取。依赖发布解析、冻结归档获取与缓存校验由 [`scripts/resolve-dependency-releases.mjs`](../../scripts/resolve-dependency-releases.mjs) 与 [`dependency-release-resolution.ts`](../../src/adapters/integration/dependency-release-resolution.ts) 负责，归档解包与发布交付边界见 [Artifact 与 Package Delivery 边界](../delivery/artifact-package-lifecycle-boundary.md)。外部框架调研、迁移计划和已完成 adoption 过程不属于本目录。
