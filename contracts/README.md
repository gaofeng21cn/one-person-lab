# 合同目录

Owner: `OPL Framework`
Purpose: `contract_surface_support_index`
State: `active_support`

本文只帮助维护者找到机器合同。字段、约束和接口行为由对应 JSON / schema、源码及真实 consumer 定义；运行状态由当前 readback 和 owner receipt 证明。

## 按问题进入

| 要查的内容 | 入口 |
| --- | --- |
| Framework、Package、Workspace、StageRun、App 投影和发布接口 | [Framework 合同导航](./opl-framework/README.zh-CN.md) |
| 领域 Package 与 Framework 之间的发现、action、Stage、memory 和 receipt 交换 | [Family orchestration 合同导航](./family-orchestration/README.zh-CN.md) |
| 跨领域运行分工 | [共享运行合同](../docs/specs/shared-runtime-contract.md) |
| 领域 owner 与 Framework consumer 的行为边界 | [共享领域合同](../docs/specs/shared-domain-contract.md) |
| 公开 surface 的机器定位 | [Public surface index](./opl-framework/public-surface-index.json) |
| 白皮书构建输入 | [OPL Profile](./whitepaper_profile.json)、[Framework Profile](./framework-whitepaper_profile.json)，维护方式见[白皮书源文档入口](../docs/whitepapers/README.md) |

## 维护入口

修改接口时，从对应合同及源码 consumer 开始；生成文件按其声明的 source 和生成器更新。
合同导航不维护完整文件清单、安装成员清单、运行状态或历史变更记录。

产品定位、架构和实现证据从[文档入口](../docs/README.md)分别进入。
文档的更新、收敛和退役遵循[文档生命周期政策](../docs/policies/docs-lifecycle-policy.md)。
