# OPL 项目概览

## 项目是什么

对外公开时，`One Person Lab` (`OPL`) 是一人课题组的 `Codex-default session runtime`、显式 `domain-agent activation` 层，以及可选 GUI/API shells 背后的 shared projection/contract 层。
当前仓库跟踪：

- `opl` / `opl exec` / `opl resume` 这组 CLI / shell 前门
- Codex-default session/runtime 路径
- domain-agent activation / dispatch 规格
- `OPL Runtime Manager` 薄管理层：负责把受支持的外部 `Hermes-Agent` runtime substrate / online-management gateway 纳入 OPL 产品级安装、profile、任务注册、诊断和状态投影
- 执行引擎与模块注册表
- 工作空间、会话、进度、交付物等接口面
- 跨仓共享的模块、机器可读合同与可发现索引
- OPL-branded AionUI GUI/WebUI 使用的 runtime/release surface

图形界面外壳继续放在独立的界面仓中维护。
各个领域仓继续作为独立 `domain agent` 仓，持有自己的智能体入口、领域逻辑、运行规则与交付物真相。

## 当前产品层级

`OPL` 当前对外使用三层结构组织产品认知：

1. 默认运行时层
   `OPL` 以 `Codex-default session runtime` 组织 `system / engines / modules / agents / workspaces / sessions / progress / artifacts` 这组顶层产品资源。
2. 显式激活层
   `OPL` 负责 family skill pack 注册与同步、shared dispatch、family-level shared surfaces，以及把调用映射到各个 admitted domain 仓的稳定 capability surface。
3. 可选外壳与投影层
   GUI shell 与其他兼容层继续围绕同一套 runtime/activation truth 做展示与投影，而不是重新定义默认交互合同。

其中 `OPL Runtime Manager` 位于默认运行时层与显式激活层之间。它是产品级管理/投影层，不是新的 runtime kernel：`Hermes-Agent` 继续持有长期在线 session、scheduler、wakeup、interrupt/resume、memory、delivery/cron 与 online-management gateway；`OPL Runtime Manager` 只负责把这个外部 kernel 的受支持版本、profile、domain task registration、诊断、恢复入口、可选 native helper 与高频状态索引统一投影进 `sessions / progress / artifacts / attention queue`。

## 项目目标

- 给 `opl`、`opl exec`、`opl resume`、直接 `Codex` 使用和外部壳提供稳定一致的 Codex-default session/runtime 合同
- 冻结 `OPL Runtime Manager` 的薄管理层合同，让 OPL 能管理外部 `Hermes-Agent` runtime substrate，而不复制一套 scheduler/session/memory kernel
- 让 `opl install` 默认安装或复用受支持的 Hermes runtime，同时把 Hermes gateway 作为渐进就绪的 online-management 能力呈现，避免阻塞首启核心/domain 工作
- 以 contract-first 方式规划 `OPL native helper` 与高频文件/状态索引：只做系统探测、artifact discovery、状态投影加速，不替代 domain-owned durable truth
- 把 domain app 以可同步的 skill pack 与稳定 contract 接入统一 activation layer
- 统一管理执行引擎、模块、工作空间、会话、进度与交付物
- 维护 family-level shared modules、shared contracts 与 shared indexes
- 让 OPL-branded AionUI GUI/WebUI 作为用户可见外壳，复用同一套 runtime/activation truth
- 明确 `OPL` 与各个独立 `domain agent` 仓的边界
- 保持公开文档、网关合同与已收录领域状态一致

## 作用边界

- `OPL` 负责 Codex-default session/runtime、activation layer、release distribution surface，以及 shared modules / contracts / indexes
- `OPL Runtime Manager` 负责产品级 runtime provisioning、profile wiring、task registration hydration、diagnostics、status projection、native helper catalog 与 state index catalog
- `OPL Runtime Manager` 不拥有 scheduler、session store、memory store、domain truth 或 concrete executor
- Hermes online-management gateway 是系统服务，由 Hermes installer/gateway command 管理；OPL 只在安装和首启中触发、检查并报告该 gateway 的 readiness
- `OPL` 的默认 runtime 只有一个：`Codex`
- `Hermes-Agent` 保留为外部 runtime substrate / online-management gateway；执行语义只在显式切换或长跑托管语境中进入
- Hermes gateway 未 loaded 只表示 online-management readiness 尚未完成；当 Codex 和已准入 domain 模块 ready 时，它不应成为首屏核心/domain blocker
- `OPL` 不持有领域运行时所有权
- `OPL` 不替代各个领域仓的智能体逻辑
- 外部界面仓负责 GUI 外壳；当前仓库只跟踪产品运行时与接口真相
- `Med Auto Science`、`Med Auto Grant`、`RedCube AI` 等仓继续是独立 `domain agent`
- 这些 `domain agent` 通过本地 CLI、程序/脚本与 repo-tracked contract 暴露稳定 capability surface；它们既可以通过 `OPL` activation 调用，也可以被 `Codex` 直接调用，工作逻辑保持一致
- `gateway / harness` 继续作为各 domain 仓内部的边界层语言存在，但不再是顶层公开主语

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
- 参考与历史：`docs/references/`、`docs/specs/` 下的当前规格、`docs/history/`
