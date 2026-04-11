# OPL 项目概览

## 项目是什么

`One Person Lab` (`OPL`) 是 one-person research lab 的顶层 gateway 与 federation surface。
它定义 lab workstream 如何映射到 domain gateway 与 `Domain Harness OS`，并冻结跨仓共享的 substrate 语义、公开边界和 contract surface。

## 项目目标

- 作为顶层 gateway，定义 workstream、shared foundation 和 admitted domain 的关系。
- 作为 federation 入口，明确每个 domain 仓在整体体系中的位置与边界。
- 作为公开 contract surface，确保文档、gateway contracts 和 admitted domain 状态一致。

当前关于“真实接入上游 `Hermes-Agent` 的标准是什么、理想形态相对当前状态的优缺点是什么”，统一以参考说明
`docs/references/hermes-agent-truth-reset-and-target-state.md`
为准；核心五件套只负责把当前真相、边界和下一步写清，不再在不同文件里各讲一套版本。

## 作用边界

- `OPL` 负责顶层 gateway / federation 语言，而各 domain 仓继续负责自己的 runtime。
- `OPL` 维护共享边界、任务语义与公开 contract surface。
- 历史 `Codex Host / OMX` 分工保留在历史材料里，不再承担当前主线角色。

## 默认入口

建议阅读顺序：

1. `README.md`
2. `docs/README.md`
3. `docs/status.md`
4. `docs/project.md`
5. `docs/architecture.md`
6. `docs/invariants.md`
7. `contracts/README.md`

## 核心公开面

- 顶层叙事：`docs/roadmap*`、`docs/task-map*`、`docs/gateway-federation*`、`docs/operating-model*`
- 公开合同：`contracts/opl-gateway/*.json` 与配套 README
- 参考与历史：`docs/references/`、`docs/specs/`、`docs/plans/`、`docs/history/omx/`
