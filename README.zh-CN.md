<p align="center">
  <img src="assets/branding/opl-banner.svg" alt="One Person Lab banner" width="100%" />
</p>

<p align="center">
  <a href="./README.md">English</a> | <a href="./README.zh-CN.md"><strong>中文</strong></a>
</p>

<h1 align="center">One Person Lab</h1>

<p align="center"><strong>一个面向严肃研究、基金申请和汇报交付的统一工作台</strong></p>
<p align="center">从一个可信入口发起专业工作、查看进展，并持续收集交付物。</p>

<p align="center">
  <img src="assets/branding/opl-workbench-overview.svg" alt="OPL 工作台概览" width="100%" />
</p>

<p align="center">
  <img src="assets/branding/opl-architecture-plan.svg" alt="OPL 架构与产品规划" width="100%" />
</p>

## 新手可以直接做什么

- **医学研究**：推进证据整理、数据分析、稿件草稿和交付包。
- **基金申请**：判断申请方向，组织申请书结构，准备修订材料。
- **汇报和 PPT**：准备讲课、组会、汇报、答辩和项目材料。
- **长期通用工作**：把讨论、文件阅读、文档编辑、进度和交付物放在同一个地方。

## 最快用起来

macOS 桌面用户可以直接下载 App：

[下载 One Person Lab for macOS](https://github.com/gaofeng21cn/one-person-lab/releases/latest)

打开 `One Person Lab.app` 后，首次启动会准备本机环境，并帮助配置 Codex、模块、skills、桌面工作台和受支持的 Hermes 外部运行基座，不额外打开服务窗口。只要 Codex 与已准入 domain 模块已经就绪，核心工作和 domain 工作就应先可用；Hermes online-management gateway 可以继续渐进就绪。

如果你更习惯从终端安装：

```bash
curl -fsSL https://raw.githubusercontent.com/gaofeng21cn/one-person-lab/main/install.sh | bash
```

安装后打开 `One Person Lab.app`，选择工作目录，就可以在同一个界面里开始通用工作、医学研究、基金写作或汇报/PPT 工作。App 会复用 `opl install` 已完成的设置，包括本机已有的受支持 Hermes runtime；只有核心依赖无法自动安装或识别时才提示用户处理。

需要 Docker、Linux 或服务器部署时，跳转到 [Docker 与浏览器部署参考](./docs/references/opl-docker-webui-deployment.md)。

## 当前产品家族

| 产品家族 | 当前产品 | 适合什么工作 | 典型交付物 |
| --- | --- | --- | --- |
| `Research Foundry` | [`Med Auto Science`](https://github.com/gaofeng21cn/med-autoscience) | 医学研究、证据整理、稿件准备、深度分析 | 分析包、证据包、稿件 |
| `Grant Foundry` | [`Med Auto Grant`](https://github.com/gaofeng21cn/med-autogrant) | 基金方向判断、申请书写作、修订工作 | 申请书、提纲、修订包 |
| `Presentation Foundry` | [`RedCube AI`](https://github.com/gaofeng21cn/redcube-ai) | 讲课、组会、汇报、答辩材料 | 幻灯片、讲稿、汇报材料 |
| `IP Foundry` | `Med Auto Patent` 规划中 | 专利申请、技术交底、权利要求、实施例整理 | 技术交底书、专利申请书、权利要求书 |
| `Award Foundry` | `Med Auto Award` 规划中 | 科技进步奖、自然科学奖、成果奖和荣誉材料 | 报奖书、成果总结、佐证材料包 |
| `Thesis Foundry` | `Med Auto Thesis` 规划中 | 学位论文装配与答辩准备 | 章节草稿、答辩材料 |
| `Review Foundry` | `Med Auto Review` 规划中 | 审稿、回复和修回 | 评审意见、回复草稿、修回计划 |

## 这套工作台怎么组织

- 普通工作：讨论、阅读、规划和通用任务。
- 基于目录的工作：需要真实文件目录和持续上下文的任务。
- 专业产品家族：面向特定领域的专门工作流。
- 进度与文件视图：持续挂在任务旁边，方便恢复和交付。
- 环境与模块管理：统一查看安装状态、版本、Hermes online-management gateway 和健康情况。

## 给 Agent 和技术操作者的快速入口

<details>
  <summary><strong>展开技术入口</strong></summary>

### 交给 Codex Agent 的一句话

> 安装并配置这个 OPL 仓库：clone 仓库、安装 OPL CLI、运行 `opl install`，并确保 Codex CLI、受管 Hermes runtime/gateway 状态、MAS/MDS/MAG/RCA、推荐 skills、One Person Lab App 和浏览器入口都可用；如果缺任何东西，直接修复或报告精确阻塞点。不要仅因 Hermes online-management gateway 尚未完成加载，就把首屏核心工作或 domain 工作写成不可用。

### 安装后常用命令

```bash
opl system initialize   # 检查 Codex 版本策略、受管 Hermes runtime/gateway 状态、模块、skills、GUI 和工作目录状态
opl modules             # 查看 MAS/MDS/MAG/RCA 模块安装和健康情况
opl skill sync          # 把 OPL 家族 skills 同步到 Codex 可见路径
opl help --text         # 人类可读帮助；机器读取使用 opl help --json
```

### 这个仓库跟踪什么

这个仓库跟踪 OPL 的共享工作台层，不是专业 domain agent 的实现仓。它负责让产品家族保持一致：

- 提供发起和恢复专业工作的共同入口。
- 提供模块安装、skill 同步、service 配置和健康检查面。
- 提供工作空间、会话、进度与交付物的发现和组织能力。
- 提供共享合同，让 Research、Grant 和 Presentation Foundry 能在同一个工作台里被看见。

桌面 GUI 由 [`opl-aion-shell`](https://github.com/gaofeng21cn/opl-aion-shell) 作为 OPL 品牌 App 外壳维护。用户从这个仓库的 GitHub Releases 获取 One Person Lab App 包；macOS arm64 新用户可选择带 MAS/Hermes/MDS runtime payload 的 `One-Person-Lab-Full-<version>-mac-arm64.dmg` 首次安装资产，App 内更新继续只使用标准 App 资产和 `latest*.yml` metadata。这个仓库提供 App 和 Codex 共同消费的共享合同与产品表面。

### 这个仓库怎么读

1. 用户先读当前首页和上面的 App / `opl install` 路径。
2. 技术规划、架构判断和方向同步，继续读 [文档索引](./docs/README.zh-CN.md)，再读 [项目概览](./docs/project.md)、[当前状态](./docs/status.md)、[架构](./docs/architecture.md)、[硬约束](./docs/invariants.md)、[关键决策](./docs/decisions.md)。
3. 开发者和维护者，继续读 [合同目录说明](./contracts/README.md)、[参考级索引](./docs/references/README.zh-CN.md)，以及 `docs/specs/`、`docs/plans/` 和 [历史归档索引](./docs/history/README.zh-CN.md) 下的跟踪材料。

### 运行说明

- 默认前门是 `opl`、`opl exec` 和 `opl resume`。除非显式切换 runtime 或显式激活 domain agent，这几个入口都继承 Codex-default 语义。
- OPL 会把 `Codex CLI` 作为受管运行依赖检查：`opl system` 会报告实际选中的 binary、版本、最低版本策略和 PATH 诊断。健康状态以选中 binary 为准；非选中的 PATH 候选只作为诊断信息，不阻塞兼容的 Codex CLI。
- `opl install` 会安装或复用受支持的外部 Hermes runtime substrate。Hermes online-management gateway 是由 Hermes installer/gateway command 管理的系统服务；OPL 负责触发安装、检查就绪并报告状态，不接管这项服务的生命周期实现。
- 首次启动把核心/domain 就绪与 online-management 就绪分开判断。Codex 和已准入 domain 模块就绪时，用户可以先开始工作；Hermes gateway 仍在 pending 或 starting 状态时，只作为在线管理能力渐进就绪来展示。
- 如果某个 admitted domain repo 还没落地到本机，运行 `opl module install --module <module_id>`。
- 默认本地状态目录是 `~/Library/Application Support/OPL/state`。如果需要改到其他本地状态根目录，直接设置 `OPL_STATE_DIR`。
- 当前 active domain agents 是 [`Med Auto Science`](https://github.com/gaofeng21cn/med-autoscience)、[`Med Auto Grant`](https://github.com/gaofeng21cn/med-autogrant) 和 [`RedCube AI`](https://github.com/gaofeng21cn/redcube-ai)。
- [`Med Deep Scientist`](https://github.com/gaofeng21cn/med-deepscientist) 继续作为 `Med Auto Science` 之下的受控 runtime/backend companion 存在；OPL 安装与环境管理会把它作为 MAS 依赖维护，但它不作为 OPL 顶层 domain agent。
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
