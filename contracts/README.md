# 合同目录

Owner: `OPL Framework`
Purpose: `contract_surface_support_index`
State: `active_support`

本文只帮助维护者找到机器合同。字段、约束和接口行为由对应 JSON Schema、v2 包源码及真实 consumer 定义。

## 核心入口

| 要查的内容 | 入口 |
| --- | --- |
| Package Manifest v2 Schema（Zod SSOT 生成） | [opl-package.v2.schema.json](./opl-package.v2.schema.json) |
| 白皮书构建输入与注册表 | [OPL Profile](./whitepaper_profile.json)、[Framework Profile](./framework-whitepaper_profile.json)、[Public Whitepaper Registry](./opl-framework/public-whitepaper-registry.json) |
| 发布签名公钥与依赖来源配置 | [Dependency Release Sources](./opl-framework/dependency-release-sources.json)、[Signing Keys](./opl-framework/keys/) |

## 维护入口

- `contracts/opl-package.v2.schema.json` 由 `packages/pack/src/manifest/` 的 Zod 定义通过 `node --experimental-strip-types ./scripts/generate-v2-contracts.mjs` 生成与校验。
- 文档的更新、收敛和退役遵循[文档生命周期政策](../docs/policies/docs-lifecycle-policy.md)。
