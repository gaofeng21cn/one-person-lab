# OPL 项目概览

## 项目是什么

`One Person Lab` (`OPL`) 是 one-person research lab 的顶层 gateway 与 federation surface。
它定义 lab workstream 如何映射到 domain gateway 与 `Domain Harness OS`，并冻结跨仓共享的 substrate 语义、公开边界和 contract surface。

## 当前 repo 主任务

- 当前 repo-tracked 主任务：`S1 / shared runtime substrate v1 contract freeze`
- 当前冻结对象：`runtime profile`、`session substrate`、`gateway runtime status`、`memory provider hook`、`delivery / cron substrate`、`approval / interrupt / resume`
- 当前推进边界：只冻结语言、边界、推广顺序与 activation package，不提前宣称统一平台 runtime、托管式 Web runtime 或共享执行内核已经实现

## 项目目标

- 作为顶层 gateway，定义 workstream、shared foundation 和 admitted domain 的关系。
- 作为 federation 入口，明确每个 domain 仓在整体体系中的位置与边界。
- 作为公开 contract surface，确保文档、gateway contracts 和 admitted domain 状态一致。

## 非目标

- 不把 `OPL` 写成某个 domain runtime 的同义词。
- 不把 `OPL` 误写成一个独占执行 runtime。
- 不把历史 `Codex Host / OMX` 分工重新抬升为当前主线。
- 不把 `S1 / shared runtime substrate v1` 提前写成统一平台 runtime 实现。

## 默认入口

建议阅读顺序：

1. `README.md`
2. `docs/README.md`
3. `docs/status.md`
4. `docs/project.md`
5. `docs/architecture.md`
6. `docs/invariants.md`
7. `docs/decisions.md`
8. `docs/operating-model.md`
9. `docs/unified-harness-engineering-substrate.md`
10. `docs/opl-runtime-naming-and-boundary-contract.md`
11. `contracts/README.md`

## 核心公开面

- 顶层叙事：`docs/roadmap*`、`docs/task-map*`、`docs/gateway-federation*`、`docs/operating-model*`
- substrate / runtime contract：`docs/unified-harness-engineering-substrate*`、`docs/opl-runtime-naming-and-boundary-contract*`
- 公开合同：`contracts/opl-gateway/*.json` 与配套 README
- 参考与历史：`docs/references/`、`docs/specs/`、`docs/plans/`、`docs/history/omx/`
