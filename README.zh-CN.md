<p align="center">
  <img src="assets/branding/opl-banner.svg" alt="One Person Lab banner" width="100%" />
</p>

<p align="center">
  <a href="./README.md">English</a> | <a href="./README.zh-CN.md"><strong>中文</strong></a>
</p>

<h1 align="center">One Person Lab</h1>

<p align="center"><strong>面向认真研究、基金和汇报工作的统一工作台</strong></p>
<p align="center">从一个入口发起专业工作，持续查看进度，并把交付物收在可信的位置。</p>

## 最快用起来

macOS 桌面用户：

```bash
curl -fsSL https://raw.githubusercontent.com/gaofeng21cn/one-person-lab/main/install.sh | bash
```

安装完成后，打开 `One Person Lab.app`，选择一个工作目录，就可以从同一个界面发起普通任务、医学研究、基金写作和汇报/PPT 工作。

Linux / Docker / 服务器用户：

- CLI 安装仍使用同一条命令。
- 浏览器 WebUI 使用 One Person Lab 品牌的 AionUI WebUI；部署、免登录、中文默认和 Codex 配置注入见 [Docker WebUI 部署参考](./docs/references/opl-docker-webui-deployment.zh-CN.md)。
- 容器或服务器没有现成 Codex 配置时，在安装或启动前注入这些环境变量：

```bash
export CODEX_HOME=/data/codex
export OPL_CODEX_MODEL=gpt-5.5
export OPL_CODEX_REASONING_EFFORT=xhigh
export OPL_CODEX_BASE_URL=https://your-provider.example/v1
export OPL_CODEX_API_KEY=sk-...
curl -fsSL https://raw.githubusercontent.com/gaofeng21cn/one-person-lab/main/install.sh | bash
```

给 Codex Agent 的一句话：

> 安装并配置这个 OPL repo：clone repo，安装 OPL CLI，运行 `opl install`，确认 Codex CLI、Hermes-Agent、MAS/MDS/MAG/RCA、推荐 skills、One Person Lab App 和 WebUI 入口都准备好；如果某一步缺失，直接补齐或报告准确阻塞。

`opl install` 会一揽子准备 OPL CLI、Codex CLI、Hermes-Agent、当前活跃的产品家族模块、Codex skills 和 One Person Lab App。macOS 会优先打开或安装桌面 App；Linux / Docker 通过浏览器 WebUI 使用。

## 新手可以直接做什么

- **医学研究**：让 Research Foundry 帮你推进证据整理、数据分析、论文草稿和交付包。
- **基金申请**：让 Grant Foundry 帮你判断方向、搭建申请书结构、生成修订包。
- **汇报和 PPT**：让 Presentation Foundry 帮你准备讲课、组会、答辩和项目汇报材料。
- **普通长任务**：在同一个工作台里继续讨论、读文件、改文档、看进度和收交付物。

## 安装后常用命令

```bash
opl system initialize   # 查看 Codex、Hermes-Agent、模块、skills、GUI 和工作目录状态
opl modules             # 查看 MAS/MDS/MAG/RCA 等模块是否已安装和健康
opl skill sync          # 把 OPL 家族 skills 同步到 Codex 可见路径
opl help --text         # 查看人类可读帮助；机器可读输出用 opl help --json
```

## 当前产品家族

| 产品家族 | 当前产品 | 适合问题 | 常见交付物 |
| --- | --- | --- | --- |
| `Research Foundry` | [`Med Auto Science`](https://github.com/gaofeng21cn/med-autoscience) + [`Med Deep Scientist`](https://github.com/gaofeng21cn/med-deepscientist) | 医学研究、证据整理、稿件准备、深度分析 | 分析包、证据包、稿件 |
| `Grant Foundry` | [`Med Auto Grant`](https://github.com/gaofeng21cn/med-autogrant) | 基金方向判断、申请书写作、修订工作 | 申请书、提纲、修订包 |
| `Presentation Foundry` | [`RedCube AI`](https://github.com/gaofeng21cn/redcube-ai) | 讲课、组会、汇报、答辩材料 | 幻灯片、讲稿、汇报材料 |
| `Thesis Foundry` | 规划中 | 学位论文装配与答辩准备 | 章节草稿、答辩材料 |
| `Review Foundry` | 规划中 | 审稿、回复和修回 | 评审意见、回复草稿、修回计划 |

## 这套工作台怎么组织

- 普通工作：讨论、阅读、规划和通用任务。
- 基于目录的工作：需要真实文件目录和持续上下文的任务。
- 专业产品家族：面向特定领域的专门工作流。
- 进度与文件视图：持续挂在任务旁边，方便恢复和交付。
- 环境与模块管理：统一查看安装状态、版本和健康情况。

<p align="center">
  <img src="assets/branding/opl-workbench-overview.svg" alt="OPL workbench overview" width="100%" />
</p>

## 架构与产品规划

展示 OPL 工作台、活跃 Foundry 与共享可信表面的高层结构。

<p align="center">
  <img src="assets/branding/opl-architecture-plan.svg" alt="OPL architecture and product plan" width="100%" />
</p>

## 这个仓库跟踪什么

这个仓库跟踪 OPL 的共享工作台层，不是专业 domain agent 的实现仓。它负责让产品家族保持一致：

- 提供发起和恢复专业工作的共同入口。
- 提供模块安装、skill 同步、service 配置和健康检查面。
- 提供工作空间、会话、进度与交付物的发现和组织能力。
- 提供共享合同，让 Research、Grant 和 Presentation Foundry 能在同一个工作台里被看见。

桌面 GUI 由 [`opl-aion-shell`](https://github.com/gaofeng21cn/opl-aion-shell) 作为 OPL 品牌 App 外壳维护。用户从这个仓库的 GitHub Releases 获取 One Person Lab App 包；这个仓库提供 App 和 Codex 共同消费的共享合同与产品表面。

## 这个仓库怎么读

1. 用户先读当前首页和上面的 `opl install` 路径。
2. 技术规划、架构判断和方向同步，继续读 [文档索引](./docs/README.zh-CN.md)，再读 [项目概览](./docs/project.md)、[当前状态](./docs/status.md)、[架构](./docs/architecture.md)、[硬约束](./docs/invariants.md)、[关键决策](./docs/decisions.md)。
3. 开发者和维护者，继续读 [合同目录说明](./contracts/README.md)、[参考级索引](./docs/references/README.zh-CN.md)，以及 `docs/specs/`、`docs/plans/` 和 [历史归档索引](./docs/history/README.zh-CN.md) 下的跟踪材料。

## 给 Agent 和技术操作者的快速入口

<details>
  <summary><strong>如果你准备把 OPL 直接交给 Codex 或其他通用 Agent，先看这里</strong></summary>

- 先读 [文档索引](./docs/README.zh-CN.md)。这里已经把当前产品模型、技术工作集、合同入口和文档分层收口好了。
- 再读 [项目概览](./docs/project.md)、[当前状态](./docs/status.md)、[架构](./docs/architecture.md)、[硬约束](./docs/invariants.md) 和 [关键决策](./docs/decisions.md)。这是恢复顶层边界、Codex-default runtime 合同、显式激活层与 admitted domains 的最快路径。
- 默认前门是 `opl`、`opl exec` 和 `opl resume`。除非显式切换 runtime 或显式激活 domain agent，这几个入口都继承 Codex-default 语义。`MCP` 继续是支持协议层，`controller` 继续只是 internal surface。
- 当前主线交互路径以 Codex-default 为先：本地 `opl`、直接 `Codex` 使用，以及未来外部壳都消费同一套 session/runtime truth。`opl skill sync` 现在默认会按 workspace 布局自动发现 sibling family repo，worktree 场景不再需要额外设置 `OPL_FAMILY_WORKSPACE_ROOT` 才能把家族 skill pack 装进 Codex。
- 如果某个 admitted domain repo 还没落地到本机，运行 `opl module install --module <module_id>`。这条安装线现在是闭环：先 clone 到 OPL-managed modules root，再执行仓库自己的 bootstrap、同步对应 Codex skill pack，最后跑仓库健康检查。
- 默认本地状态目录是 `~/Library/Application Support/OPL/state`。如果需要改到其他本地状态根目录，直接设置 `OPL_STATE_DIR`。
- 当前 active domain agents 是 [`Med Auto Science`](https://github.com/gaofeng21cn/med-autoscience)、[`Med Deep Scientist`](https://github.com/gaofeng21cn/med-deepscientist)、[`Med Auto Grant`](https://github.com/gaofeng21cn/med-autogrant) 和 [`RedCube AI`](https://github.com/gaofeng21cn/redcube-ai)。它们分别承接医学研究、深度分析、基金写作和视觉交付，并把本地 CLI、程序/脚本与 repo-tracked contract 暴露成稳定 capability surface；家族映射与公开入口可继续从 [当前状态](./docs/status.md)、[架构](./docs/architecture.md) 和 [OPL 公开界面索引](./docs/opl-public-surface-index.zh-CN.md) 进入。
- 当任务需要顶层 session/runtime 路径、共享 `workspaces / sessions / progress / artifacts` surface 或显式 domain activation 时，从 `OPL` 进入；当任务已经明确落在某个 domain 上时，继续进入对应仓库首页和 `docs/README*`，按该仓自己的 CLI/脚本/contract 边界执行。

</details>

## 延伸阅读

- [路线图](./docs/roadmap.zh-CN.md)
- [任务版图](./docs/task-map.zh-CN.md)
- [运行模型](./docs/operating-model.zh-CN.md)
- [统一工程基座](./docs/unified-harness-engineering-substrate.zh-CN.md)
- [文档索引](./docs/README.zh-CN.md)
- [项目概览](./docs/project.md)
- [当前状态](./docs/status.md)
- [合同目录说明](./contracts/README.md)
