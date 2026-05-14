# 活跃支撑文档

Status: `active_support`
Owner: `One Person Lab`

本目录收纳当前 OPL runtime、activation、shared-boundary 与 domain onboarding 模型的活跃人读支撑文档。

当前真相仍然先看：

- [文档索引](../README.zh-CN.md)
- [项目概览](../project.md)
- [当前状态](../status.md)
- [架构](../architecture.md)
- [硬约束](../invariants.md)
- [关键决策](../decisions.md)
- [合同目录说明](../../contracts/README.md)

这里的文档支持当前模型，但不是机器可读 authority。代码、测试、runtime dashboard 与 contracts 应读取 `contracts/`、schema、source、生成产物、CLI/API 行为或语义化 `human_doc:*` id。

## 内容

- `opl-family-development-reference.zh-CN.md`：OPL 系列项目开发主参考；固定全局计划放 OPL、单仓计划回各 repo、通用能力上收 OPL、过时兼容面直接退役、docs 目录按同名 canonical taxonomy 对齐。
- `current-development-lines*`：当前 framework-first 内容级开发线路图。
- `production-framework-closure-gap-matrix.zh-CN.md`：当前 OPL 距离完整生产级智能体框架的 production closure 差距矩阵。
- `current-state-vs-ideal-gap.zh-CN.md`：对照 OPL / Foundry Agents 理想目标态，记录 OPL family-level 当前实际状态、差距和完善顺序；MAS/MAG/RCA 的单仓完善计划回到各自仓库的理想态或 status/program 文档。
- `development-document-portfolio*`：当前开发文档组合整理入口；按内容判断旧文档应吸收、保留、降级、退役还是归档。
- `opl-public-surface-index*`：当前公开 surface 地图。
- `opl-domain-onboarding-contract*`：候选 domain onboarding 审阅支撑。
- `opl-runtime-naming-and-boundary-contract*`：runtime 命名与边界支撑。
- `shared-foundation*`、`shared-foundation-ownership*`、`shared-runtime-contract*`、`shared-domain-contract*`：当前 shared-boundary 支撑。
