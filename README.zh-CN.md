<p align="center">
  <img src="assets/branding/opl-app-icon.png" alt="One Person Lab 标志" width="128" />
</p>

<p align="center">
  <a href="./README.md">English</a> | <a href="./README.zh-CN.md"><strong>中文</strong></a>
</p>

<h1 align="center">One Person Lab</h1>

<p align="center"><strong>面向高价值知识交付的阶段式智能体框架。</strong></p>
<p align="center">用接近人类专家服务的方式组织智能体工作：界定目标、准备证据、执行、审核、修订，并交付可追踪成果。</p>

<p align="center">
  <img src="assets/branding/opl-stage-led-delivery-overview.png" alt="One Person Lab 阶段式交付模型" width="100%" />
</p>

## 为什么是 One Person Lab

论文、基金、专利、审稿、报奖和高端汇报这类工作，核心难点在于判断当前处于哪个专家阶段、证据是否足够、质量是否达标、成果是否可以进入下一阶段。

One Person Lab 把“专家阶段”作为智能体运行的核心单元。每个阶段都带着目标、材料、质量标准、交接信息、回执和权威边界；阶段内部由领域智能体完成阅读、推理、写作、计算、审核和修订，再返回该领域持有的判断和交付物。框架负责把这些阶段组织成可见、可恢复、可审计、可持续推进的工作链路。

这套架构的优势在于：它把专业知识服务的交付逻辑产品化，让智能体围绕“阶段、证据、质量和交付物”工作。

## 架构优势

- **以专家阶段为核心**：任务按“定义、准备、执行、审核、修订、交付”推进，适合论文、基金、汇报等需要反复判断质量的工作。
- **把质量判断放进流程**：每个阶段都有目标、材料、标准和回执，系统可以追踪为什么进入下一步，也可以回到明确的位置修订。
- **领域智能体保留专业权威**：医学研究、基金写作、视觉交付等专业判断由对应领域智能体负责，One Person Lab 提供统一的运行、发现、恢复和呈现能力。
- **运行过程可恢复、可审计**：阶段尝试、交接、回执、进度和产物都被组织成可追踪信息，长任务可以继续推进，也可以被技术操作者审查。
- **同一框架扩展多条产品线**：研究工坊、基金工坊、汇报工坊使用同一套阶段式框架，后续专利、报奖、论文、审稿等产品线可以以相同方式接入。

<p align="center">
  <img src="assets/branding/opl-framework-ecosystem-map.png" alt="One Person Lab 开发领域智能体并打包成桌面产品" width="100%" />
</p>

## 三层产品关系

One Person Lab 在技术上指这个阶段式智能体框架，在产品上指围绕这个框架形成的一组应用和领域智能体：

| 层级 | 面向对象 | 作用 |
| --- | --- | --- |
| **One Person Lab** | 开发者、技术操作者、产品集成 | 提供命令行、激活、阶段控制、运行时提供者、队列、合同、模块发现、技能同步、运行快照和进度投影。 |
| **领域智能体** | 专业工作场景 | MAS、MAG、RCA 等智能体负责各自领域的专业判断、质量裁决、阶段语义和交付物。 |
| **One Person Lab App** | 终端用户 | 把框架、领域智能体和配套工具打包成桌面工作台，提供下载、首启检查、进度、文件、运行状态和更新体验。 |

这三层形成一条清晰链路：用 One Person Lab 开发和运行领域智能体，再把框架与智能体打包成面向用户的桌面产品。

## 当前产品线

| 产品线 | 当前智能体 | 适合的工作 | 典型交付物 |
| --- | --- | --- | --- |
| 研究工坊 | [`Med Auto Science`](https://github.com/gaofeng21cn/med-autoscience) | 医学研究、证据整理、数据分析、稿件准备 | 分析包、证据包、稿件 |
| 基金工坊 | [`Med Auto Grant`](https://github.com/gaofeng21cn/med-autogrant) | 基金方向判断、申请书写作、修订准备 | 申请书、提纲、修订包 |
| 汇报工坊 | [`RedCube AI`](https://github.com/gaofeng21cn/redcube-ai) | 讲课、组会、汇报、答辩和项目材料 | 幻灯片、讲稿、汇报材料 |
| 专利工坊 | 规划中 | 专利申请、技术交底、权利要求和实施例整理 | 技术交底书、专利申请书、权利要求书 |
| 报奖工坊 | 规划中 | 科技奖励、成果总结和佐证材料组织 | 报奖书、成果总结、佐证材料包 |
| 论文工坊 | 规划中 | 学位论文装配和答辩准备 | 章节草稿、答辩材料 |
| 审稿工坊 | 规划中 | 审稿、回复和修回 | 评审意见、回复草稿、修回计划 |

## 如何开始

如果你想直接使用桌面产品，请进入 App 仓库下载 One Person Lab App：

[下载 One Person Lab App](https://github.com/gaofeng21cn/one-person-lab-app/releases/latest)

如果你希望安装框架、运行命令行或开发新的领域智能体，可以从本仓库安装：

```bash
curl -fsSL https://raw.githubusercontent.com/gaofeng21cn/one-person-lab/main/install.sh | bash
opl system initialize
```

安装后可以通过 App 进入通用工作、医学研究、基金写作和汇报材料准备，也可以通过命令行管理模块、技能、运行时和阶段尝试。

## 后续开发计划

- 完善桌面 App 的首次安装包、更新通道和跨平台发布流程。
- 继续增强阶段式运行时，让长任务具备更完整的恢复、重试、人工确认和进度投影能力。
- 推进 Research、Grant、Presentation 三条产品线的稳定交付体验。
- 将 Patent、Award、Thesis、Review 等高价值知识工作纳入同一产品家族。
- 统一领域智能体的安装、模块发现、技能同步、产物浏览和工作区恢复体验。

## 技术入口

<details>
  <summary><strong>展开开发者与 Agent 说明</strong></summary>

### 常用命令

```bash
opl help --text
opl modules
opl module exec --module medautoscience -- doctor entry-modes
opl skill sync
opl family-runtime status
opl family-runtime repair
opl family-runtime attempt list
```

自动化集成应优先读取 `opl help --json`、`contracts/` 下的机器可读合同，以及各领域智能体导出的投影数据。

### 框架职责

本仓库维护 One Person Lab 的框架层，负责：

- 命令行入口、安装、初始化、诊断和修复。
- 显式激活、阶段控制、交接、回执、人工确认和恢复。
- 运行时提供者、类型化队列、阶段尝试记录、运行快照和投影消费。
- 机器可读合同、模块发现、`opl module exec` 和技能同步。

生产在线运行目标由 Temporal 支撑的运行时提供者承接；本地提供者用于开发、测试和离线诊断。Codex CLI 是当前第一公民执行器；Hermes-Agent、Claude Code 等工具可以作为显式执行器适配器接入，并通过回执与审计信息证明运行过程。

### 文档

- [文档索引](./docs/README.md)
- [项目概览](./docs/project.md)
- [当前状态](./docs/status.md)
- [架构](./docs/architecture.md)
- [硬约束](./docs/invariants.md)
- [关键决策](./docs/decisions.md)
- [合同目录说明](./contracts/README.md)
- [公开路线图](./docs/public/roadmap.md)

</details>
