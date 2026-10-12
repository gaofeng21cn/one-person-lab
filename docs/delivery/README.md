# OPL Delivery

Delivery 文档只解释源码之外的可交付 artifact 和发布责任。

- [Artifact / Package lifecycle boundary](./artifact-package-lifecycle-boundary.md)
- [Foundry 构建验收](./foundry-package-construction-acceptance.md)
- [白皮书交付证据](./whitepapers/README.md)

Package 拓扑选择见 [项目概览](../project.md#package-拓扑)。真实 publication、签名、安装和 release readback 归各 artifact owner。

App Release Bundle 的 `prepared_notes.source` 支持 `prepared_ai` 与 `prepared_mechanical`。写作模型全部失败时，App 可以提交明确标为机械生成的正文；Framework 不生成或改写说明，仍将正文与证据纳入冻结 Bundle 摘要。模型可用性不代替签名、公证、安装资格或公开资产身份校验。对应 Schema 为 `release-bundle-freeze-request.schema.json` 和 `release-bundle.schema.json`。
