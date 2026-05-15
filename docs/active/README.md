# 活跃支撑文档

Status: `active_support`
Owner: `One Person Lab`

本目录只收纳当前仍决定执行顺序、差距闭环、开发组合治理和 closeout evidence 的人读支撑文档。

当前真相仍然先看：

- [文档索引](../README.md)
- [项目概览](../project.md)
- [当前状态](../status.md)
- [架构](../architecture.md)
- [硬约束](../invariants.md)
- [关键决策](../decisions.md)
- [合同目录说明](../../contracts/README.md)

这里的文档支持当前模型，但不是机器可读 authority。代码、测试、runtime dashboard 与 contracts 应读取 `contracts/`、schema、source、生成产物、CLI/API 行为或语义化 `human_doc:*` id。

## 内容

- `opl-family-development-reference.md`：OPL 系列项目开发主参考；固定全局计划放 OPL、单仓计划回各 repo、通用能力上收 OPL、过时兼容面直接退役、docs 目录按同名 canonical taxonomy 对齐。
- `current-development-lines.md`：当前 framework-first 内容级开发线路图。
- `one-person-lab-app-repo-split-plan.md`：One Person Lab App 独立产品仓与 AionUI shell 子目录化迁移计划；固定 Framework repo、App repo 和 upstream-backed GUI adapter 的 owner split。
- `production-framework-closure-gap-matrix.md`：当前 OPL 距离完整生产级智能体框架的 production closure 差距矩阵与功能 follow-through owner。
- `current-state-vs-ideal-gap.md`：对照 OPL / Foundry Agents 理想目标态，记录 OPL family-level 当前实际状态、差距和完善顺序；MAS/MAG/RCA 的单仓完善计划回到各自仓库的理想态、status、active、runtime、delivery 或 source 文档。
- `development-document-portfolio.md`：当前开发文档组合整理入口；按内容判断旧文档应吸收、保留、降级、退役还是归档。

当前 runtime 命名与边界说明在 [runtime/](../runtime/README.md)。
Domain onboarding、shared runtime/domain contract 等当前规格支撑在 [specs/](../specs/README.md)。
公开 surface 与 App/workbench 读法在 [product/](../product/README.md)。

已吸收 / 归档材料：

- `shared-foundation*` 和 `shared-foundation-ownership*` 已迁入 `docs/history/process/shared-boundary/`；其中仍有效的 owner split 由 OPL 系列项目开发主参考、公开 operating model 以及当前 shared runtime/domain contracts 承接。
- 2026-05-14 一次性 production functional closure plan 已迁入 `docs/history/process/plans/`；当前 follow-through owner 是 `production-framework-closure-gap-matrix.md`。
