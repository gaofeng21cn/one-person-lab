[English](./README.md) | **中文**

# OPL 文档索引

这个目录承载 `One Person Lab` 的公开文档与仓库跟踪文档。
为了让公开主线稳定，也为了避免参考材料反向挤占主线叙事，`OPL` 固定采用一套四层文档体系。

## 第一层：默认公开主线

这一层是人类专家第一次理解 `OPL` 时应优先阅读的内容。
它们构成默认公开叙事，因此必须保持中英双语同步。

- [仓库首页](../README.zh-CN.md)
- [路线图](./roadmap.zh-CN.md)
- [任务版图](./task-map.zh-CN.md)
- [Gateway 联邦](./gateway-federation.zh-CN.md)
- [运行模型](./operating-model.zh-CN.md)
- [Unified Harness Engineering Substrate](./unified-harness-engineering-substrate.zh-CN.md)

## 第二层：公开合同与 Gateway 配套文档

这一层仍然是公开文档，但更偏技术合同和边界说明。
它们定义的是 gateway 语义、shared-foundation 边界与正式合同界面，而不是首页叙事本身。

- [OPL 联邦合同](./opl-federation-contract.zh-CN.md)
- [共享基础结构](./shared-foundation.zh-CN.md)
- [共享基础结构归属](./shared-foundation-ownership.zh-CN.md)
- [OPL 只读 Discovery Gateway](./opl-read-only-discovery-gateway.zh-CN.md)
- [OPL Routed Action Gateway](./opl-routed-action-gateway.zh-CN.md)
- [OPL Domain Onboarding Contract](./opl-domain-onboarding-contract.zh-CN.md)
- [OPL 公开界面索引](./opl-public-surface-index.zh-CN.md)
- [OPL Gateway 合同](../contracts/opl-gateway/README.zh-CN.md)

## 第三层：参考级配套文档

这一层继续保留在仓库中，但只承担审核、验收、示例、索引或边界检查作用。
它们不能反过来改写 `OPL` 的默认公开主线。

- `opl-gateway-rollout*`
- `opl-gateway-acceptance-test-spec*`
- `opl-candidate-domain-backlog*`
- `opl-candidate-workstream-tranche-closeout*`
- `opl-gateway-example-corpus*`
- `opl-routed-safety-example-corpus*`
- `opl-operating-example-corpus*`
- `opl-operating-record-catalog*`
- `opl-surface-lifecycle-map*`
- `opl-surface-authority-matrix*`
- `opl-surface-review-matrix*`
- `opl-governance-audit-operating-surface*`
- `opl-publish-promotion-operating-surface*`

## 第四层：历史规格与计划

这一层是内部设计与计划记录。
它们可以解释某次冻结为什么发生，但不应被当作仓库当前状态的活文档真相面。

- `docs/specs/`
- `docs/plans/`

## 文档规则

- 第一层和第二层属于公开文档，因此必须同时提供英文 `.md` 与中文 `.zh-CN.md` 镜像，并保持同步更新。
- 第三层允许继续公开或仓库跟踪，但始终属于参考级文档，不应继续挤占根 README 的默认阅读路径。
- 第四层属于内部工作历史，默认只保留中文；除非有明确理由，不再额外扩成双语公开面。
- 避免无意义的中英混写：叙述尽量保持单一语言，英文只保留给固定术语、文件路径、命令名、schema 与代码标识符。

## 治理说明

- [文档治理规则](./documentation-governance.md)
