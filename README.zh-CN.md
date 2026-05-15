<p align="center">
  <img src="assets/branding/opl-app-icon.svg" alt="One Person Lab logo" width="128" />
</p>

<p align="center">
  <a href="./README.md">English</a> | <a href="./README.zh-CN.md"><strong>中文</strong></a>
</p>

<h1 align="center">One Person Lab Framework</h1>

<p align="center"><strong>面向高价值知识交付的 stage-led 智能体框架。</strong></p>
<p align="center">开发 OPL-compatible 领域智能体，运行可恢复的专家阶段，并让领域 truth 留在对应 agent 仓。</p>

<p align="center">
  <img src="assets/branding/opl-framework-ecosystem-map.png" alt="OPL Framework、App 与 Foundry Agent 关系图" width="100%" />
</p>

## 这个仓库是什么

`one-person-lab` 是 OPL Framework 仓库，不是桌面 App 产品仓。

大多数智能体框架把工作建模成图节点、工具调用、函数输入和 activity 输出。OPL 把“专家阶段”作为核心运行单元。每个 stage 都带着目标、材料、质量标准、交接、回执和 owner boundary；stage 内部由领域智能体完成阅读、推理、写作、计算、审核和修订，再返回该领域持有的判断。

Framework 负责让这些阶段可见、可恢复、可审计，并能继续推进。

## 三层关系

| 层级 | 仓库 / owner | 职责 |
| --- | --- | --- |
| **OPL Framework** | `gaofeng21cn/one-person-lab` | CLI、activation、stage control、runtime/provider bridge、typed queue、contracts、模块发现、skill sync、runtime snapshot 与 projection consumption。 |
| **One Person Lab App** | [`gaofeng21cn/one-person-lab-app`](https://github.com/gaofeng21cn/one-person-lab-app) | 面向终端用户的桌面工作台、打包、发布资产、updater metadata、首启检查、GUI page-state 测试、截图和用户文档。 |
| **Foundry Agents** | MAS / MAG / RCA 仓库 | Domain truth、quality verdict、artifact authority、stage 语义、prompt、skill 与交付 gate。 |

App 只消费 Framework 持有的机器可读 surface 和 domain-owned projection。App 不持有 OPL runtime truth、provider 实现、MAS/MAG/RCA domain truth 或 artifact authority。

## Framework 负责什么

这个仓库提供 OPL-compatible agent 可以依赖的框架层：

- `opl` CLI：安装、初始化、执行、恢复、诊断和修复入口。
- 显式 activation、stage control、handoff、receipt、human gate 和 recovery surface。
- Provider-backed family runtime、typed queue、stage attempt ledger、runtime snapshot 与 projection consumption。
- `contracts/` 下的机器可读合同。
- 模块发现与 `opl module exec`，确保 MAS/MAG/RCA 命令从解析出的当前 checkout 运行。
- OPL family skill pack 的同步能力。

Temporal-backed provider 是 production online runtime substrate。Local provider 只用于 dev/CI/offline diagnostics。Codex CLI 是当前第一公民 Agent executor；Hermes-Agent、Claude Code 等同类工具只能作为显式 executor adapter 进入，并必须有回执和审计面。

## 当前 Foundry Agents

| Foundry 产品线 | Domain agent | 适合什么工作 | 权威边界 |
| --- | --- | --- | --- |
| `Research Foundry` | [`Med Auto Science`](https://github.com/gaofeng21cn/med-autoscience) | 医学研究、证据整理、稿件准备、深度分析 | 医学科研 runtime、controller truth、质量 authority、publication/package gates。 |
| `Grant Foundry` | [`Med Auto Grant`](https://github.com/gaofeng21cn/med-autogrant) | 基金方向判断、申请书写作、修订工作 | 基金 domain memory、proposal quality、package authority、reviewer/revision decisions。 |
| `Presentation Foundry` | [`RedCube AI`](https://github.com/gaofeng21cn/redcube-ai) | 讲课、组会、汇报、答辩材料 | 视觉交付 runtime、deck/package authority、设计与 artifact quality gates。 |

后续规划中的 Foundry 包括 Patent、Award、Thesis 和 Review agents。它们应以 OPL-compatible repository/package 发布，而不是各自内嵌一份 OPL runtime。

## Framework 快速开始

需要开发者 / 技术操作者 framework 时，从这个仓库安装：

```bash
curl -fsSL https://raw.githubusercontent.com/gaofeng21cn/one-person-lab/main/install.sh | bash
opl system initialize
```

常用 framework 命令：

```bash
opl help --text
opl modules
opl module exec --module medautoscience -- doctor entry-modes
opl skill sync
opl family-runtime status
opl family-runtime repair
opl family-runtime attempt list
```

自动化应优先读取 `opl help --json` 和合同文件这类稳定机器可读 surface。

## 使用桌面 App

如果你想要桌面产品，而不是 framework 仓，请进入 [`one-person-lab-app`](https://github.com/gaofeng21cn/one-person-lab-app)，并从它的 Releases 下载 One Person Lab App：

[下载 One Person Lab App](https://github.com/gaofeng21cn/one-person-lab-app/releases/latest)

这个 Framework 仓只在必要位置保留 App release discovery 和兼容参考。App 截图、首启说明、updater metadata、打包细节、GUI 测试和用户教程都归 App 仓维护。

## 文档入口

- [文档索引](./docs/README.md)
- [项目概览](./docs/project.md)
- [当前状态](./docs/status.md)
- [架构](./docs/architecture.md)
- [硬约束](./docs/invariants.md)
- [关键决策](./docs/decisions.md)
- [合同目录说明](./contracts/README.md)
- [公开路线图](./docs/public/roadmap.md)
