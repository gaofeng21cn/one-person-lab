# OPL 项目概览

## 项目是什么

对外公开时，`One Person Lab` (`OPL`) 是一人课题组的顶层产品运行时与共享接口层。
当前仓库跟踪：

- CLI 产品入口
- 顶层共享运行时
- 执行引擎与模块注册表
- 工作空间、会话、进度、交付物等接口面
- 跨仓共享的机器可读合同

图形界面外壳继续放在独立的界面仓中维护。
各个领域仓继续持有自己的智能体入口、领域逻辑、运行规则与交付物。

## 当前产品层级

`OPL` 当前对外使用三层结构组织产品认知：

1. 产品运行时层
   `OPL` 负责 `system / engines / modules / agents / workspaces / sessions / progress / artifacts` 这组顶层产品资源。
2. 产品家族
   家族定义一类长期稳定的工作，例如 `Research Foundry`、`Grant Foundry`、`Presentation Foundry`、`Thesis Foundry`、`Review Foundry`。
3. 当前实现
   当前实现承接某个家族在特定领域里的能力与仓库真相，例如 `Med Auto Science`、`Med Auto Grant`、`RedCube AI`。

## 项目目标

- 给 GUI 外壳与 CLI 提供稳定一致的 `OPL Product API`
- 统一管理执行引擎、模块、工作空间、会话、进度与交付物
- 明确 `OPL` 与各个领域智能体仓的边界
- 保持公开文档、网关合同与已收录领域状态一致

## 作用边界

- `OPL` 负责顶层共享运行时与产品接口
- `OPL` 不持有领域运行时所有权
- `OPL` 不替代各个领域仓的智能体逻辑
- 外部界面仓负责 GUI 外壳；当前仓库只跟踪产品运行时与接口真相
- `Med Auto Science`、`Med Auto Grant`、`RedCube AI` 等仓继续是独立领域智能体
- 这些领域智能体可以通过 `OPL` 调用，也可以被 `Codex` 直接调用，工作逻辑保持一致

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
- 参考与历史：`docs/references/`、`docs/specs/`、`docs/plans/`、`docs/history/`
