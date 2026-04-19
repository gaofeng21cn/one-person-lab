# OPL 项目概览

## 项目是什么

对外公开时，`One Person Lab` (`OPL`) 是一人课题组的 GUI 产品壳与模块管理器。
在家族内部技术语义里，`OPL` 继续承担顶层 gateway 与 federation surface，负责把工作类型映射到 domain gateway 与 `Domain Harness OS`，并冻结跨仓共享的 substrate 语义、公开边界和 contract surface。

## 产品层级

`OPL` 当前对外使用三层结构组织产品认知：

1. 产品壳
   `OPL` 自己负责 GUI、工作模式、进度与文件视图、设置、模块管理、升级和入口治理。
2. 产品家族
   家族定义一类长期稳定的工作，例如 `Research Foundry`、`Grant Foundry`、`Presentation Foundry`、`Thesis Foundry`、`Review Foundry`。
3. 当前实现
   当前实现承接某个家族在特定领域里的能力与仓库真相，例如 `MAS / Med Auto Science`、`MAG / Med Auto Grant`、`RCA / RedCube AI`。

当前家族与实现的对应关系：

| 产品家族 | 当前实现 | 当前领域落点 |
| --- | --- | --- |
| `Research Foundry` | `MAS / Med Auto Science` | 医学科研 |
| `Grant Foundry` | `MAG / Med Auto Grant` | 医学基金与申请书 |
| `Presentation Foundry` | `RCA / RedCube AI` | 汇报、幻灯片、视觉交付 |
| `Thesis Foundry` | Planned | 学位论文与答辩 |
| `Review Foundry` | Planned | 审稿、回复与修回 |

## 项目目标

- 作为产品壳，给用户提供统一的 GUI 入口、模块管理和产品家族视图。
- 作为顶层 gateway，定义 workstream、shared foundation 和 admitted domain 的关系。
- 作为 federation 入口，明确每个 domain 仓在整体体系中的位置与边界。
- 作为公开 contract surface，确保文档、gateway contracts 和 admitted domain 状态一致。

当前关于“真实接入上游 `Hermes-Agent` 的标准是什么、理想形态相对当前状态的优缺点是什么”，统一以参考说明
`docs/references/hermes-agent-truth-reset-and-target-state.md`
为准；核心五件套只负责把当前真相、边界和下一步写清，不再在不同文件里各讲一套版本。

## 作用边界

- `OPL` 负责产品壳、产品家族目录、顶层 gateway / federation 语言，而各 domain 仓继续负责自己的 runtime。
- 产品家族负责表达一类工作，不直接替代具体实现仓。
- 当前实现负责专业能力、领域真相、交付边界和运行时状态。
- `OPL` 维护共享边界、任务语义与公开 contract surface。
- `OPL` 统一的是 runtime substrate、gateway/handoff envelope 与 authority 边界，不强制三个 domain 仓共享同一种具体执行器。
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
