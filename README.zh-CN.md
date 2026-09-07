<p align="center">
  <img src="assets/branding/opl-app-icon.png" alt="One Person Lab 标志" width="128" />
</p>

<p align="center">
  <a href="./README.md">English</a> | <a href="./README.zh-CN.md"><strong>中文</strong></a>
</p>

<h1 align="center">One Person Lab</h1>

<p align="center"><strong>面向高价值知识工作的 AI Agent 工作台与运行框架</strong></p>
<p align="center">让论文、基金、汇报、专利等复杂成果不再停留在一次问答，而是能被持续推进、审阅、修订和交付</p>

<p align="center">
  <img src="assets/branding/opl-stage-delivery-model-v2.png" alt="One Person Lab 从复杂目标到成果交付的用户旅程" width="100%" />
</p>

## 为什么是 One Person Lab

AI 已经很擅长回答一个问题、生成一段代码或润色一份材料。但当任务变成一篇论文、一个基金本子、一套答辩材料或一个长期研究项目时，真正困难的是把工作持续推进到能交付。

这些长周期任务通常会遇到几个问题：

- 做了很多轮之后，当前到底推进到了哪一步？
- 中间用了哪些材料、改了哪些文件、留下了哪些证据？
- 准备、执行、审核、修订和交付能不能各有清楚边界？
- 人离开电脑后，任务能不能继续跑，回来时直接看到进展、阻塞和下一步？
- 多个专业 Agent 能不能共用一套运行、文件、进度和交付体系？

**One Person Lab 正是围绕这些问题设计的。**

它把复杂知识工作拆成一个个能推进的阶段：准备材料、执行创作、质量审核、修订完善、交付收口。每个阶段都围绕一个真实成果增量工作。AI 可以在同一阶段里整理资料、提出候选方案、比较取舍、调用工具、接受审阅并继续修订；用户看到的是进度、文件、证据、阻塞和下一步都被清楚保留下来。

## 核心亮点

<table width="100%">
<tr>
<td width="50%" valign="top">

**把长任务拆成能推进的阶段**

论文、基金、汇报、专利通常需要多轮推进。OPL 让每一轮工作都有明确目标、产出、检查和下一步；AI 可以在阶段内读资料、比较方案、接受审阅并继续修订。

</td>
<td width="50%" valign="top">

**专业 Agent 各司其职**

医学研究、基金写作、视觉汇报、书籍写作和 Agent 构建分别由不同 Foundry Agent 承担。用户看到的是统一工作台，背后每个专业 Agent 保留自己的材料理解、判断标准、审阅方式和交付边界。

</td>
</tr>
<tr>
<td width="50%" valign="top">

**进度、证据、文件全程可追踪**

每次运行用了哪些资料、生成了哪些结果、修改了哪些文件、留下了什么报告，都能回看。任务失败时，也能知道是缺材料、缺人工确认、质量未过，还是运行环境问题。

</td>
<td width="50%" valign="top">

**长任务可托管运行**

OPL 适合需要多轮推进、后台执行、定期检查、失败恢复和人工介入的长周期任务。

</td>
</tr>
</table>

## 一句话理解

**One Person Lab 让 AI Agent 像一个可托管的专业团队一样工作：按阶段推进复杂任务，持续产出文件，留下证据，遇到阻塞能汇报，完成后能交付。**

如果说普通 AI 工具解决的是“这一问怎么答”，One Person Lab 解决的是“这项复杂工作怎么一步步做到能交付”。

## 认知计算，驱动复杂成果推进

普通自动化流程擅长处理固定步骤：先做 A，再做 B，最后输出 C。复杂知识工作需要更强的阶段内判断：写一篇论文、改一个基金本子、做一套正式汇报，过程中经常需要反复判断、比较、推翻、重写和审阅。

这里的核心概念是**认知计算**：让 AI 在一个可观察、可接力的阶段里完成理解、比较、创作、审阅和修订。OPL 把进度、证据、文件和交接边界管理起来，让专业 AI 围绕阶段目标自主组织资料、工具、候选方案和修订节奏。

One Person Lab 的优势在于，它既让用户看得见“现在做到哪一步、下一步是什么、卡在哪里”，又给专业 AI 足够空间在每个阶段里做真正的专家工作：读资料、生成多个方案、比较优劣、根据审阅意见修订，直到形成可检查的下一版成果。

通过这样的设计，OPL 把关注点放在成果推进上：下一版文件是否形成、证据是否清楚、审阅是否完成、交接是否能继续。

## 面向专业团队式推进

普通工作流工具适合确定性任务，例如调用几个工具、填几个字段、生成一个固定输出。高价值知识工作更像一个专业团队在持续推进项目：有人准备材料，有人创作，有人审阅，有人修订，有人收口交付。OPL 把这些角色和阶段组织起来，让 AI 持续形成可检查、可修改、可交付的成果。

## OPL 生态

用户只需理解四个稳定的产品概念：

| 产品 | 用户理解 | 内部权威 |
| --- | --- | --- |
| **OPL Base** | 让长期工作可以运行、恢复和审计的基础。 | `one-person-lab` 实现 OPL Framework，并持有 Framework runtime、Package graph 与 App projection 范围内唯一的 Cordis Host。 |
| **OPL App** | 选择工作、查看进度、打开文件和处理阻塞的本地工作台。 | `one-person-lab-app` 持有产品、GUI ABI、Shell 选择和发布。 |
| **OPL Packages** | 可安装的 Agent、Skill、Tool、Plugin 和 Workflow，为系统增加专业能力。 | 每个 Package owner 持有身份和发布；Framework 发现并投影已安装能力。 |
| **OPL Cloud** | 在线 Workspace、账号治理、托管资源、协作与 Agent 服务。 | `one-person-lab-cloud` 持有 Cloud 产品与服务。 |

MAS、MAG、RCA、OMA、Book Forge 等 Foundry Agents 是通过 OPL Packages 交付的专业
authority domain。它们继续持有自己的质量、产物与交付判断；它们不是第五个产品层，
也不因为被 Framework 托管就天然等于 Cordis plugin。

Studio 实现可以为 DSH profile、插件生命周期、原生 Codex 后端和 delivery transport
运行独立的 DeepSeek Harness/Cordis Application Host。它只消费 Framework/App 公开
合同，不创建第二套 OPL runtime、Package registry/currentness、App state/action、产品
或发布 authority。机器边界见
[`cordis-architecture-profile.json`](./contracts/opl-framework/cordis-architecture-profile.json)。

如果只是使用产品，不需要理解仓库分工。对开发者来说：`one-person-lab` 维护
Base/Framework，`one-person-lab-app` 维护 App 产品与发布体验，各 Package 仓维护可安装
能力，`one-person-lab-cloud` 负责正在落地的云端产品；用户可以按项目需要使用相应的在线能力。

完整仓库分工见 [OPL 系列仓库地图](./docs/public/repo-map.md)。

桌面产品沿用 Codex App 的交互形态，把 MAS、MAG、RCA 及后续 Foundry Agents 呈现为内置任务入口。普通用户不需要选择底层执行器或界面实现；这些细节只出现在开发者诊断和验证材料里。

## 当前产品线

| 产品线 | 当前智能体 | 适合的工作 | 典型交付物 |
| --- | --- | --- | --- |
| 智能体工坊 | [`OPL Meta Agent`](https://github.com/gaofeng21cn/opl-meta-agent) | 通过 `engineer-agent` 把新建、接管和改进意图转成智能体设计与证据驱动演进语义 | `AgentBlueprint`、`EvalSpec`、`EvolutionProposal` |
| 研究工坊 | [`Med Auto Science`](https://github.com/gaofeng21cn/med-autoscience) | 医学研究、证据整理、数据分析、稿件准备 | 分析包、证据包、稿件 |
| 基金工坊 | [`Med Auto Grant`](https://github.com/gaofeng21cn/med-autogrant) | 基金方向判断、申请书写作、修订准备 | 申请书、提纲、修订包 |
| 汇报工坊 | [`RedCube AI`](https://github.com/gaofeng21cn/redcube-ai) | 讲课、组会、汇报、答辩和项目材料 | 幻灯片、讲稿、汇报材料 |
| 图书工坊 | [`OPL Book Forge`](https://github.com/gaofeng21cn/opl-bookforge) | 图书、长篇书稿、章节架构和风格控制 | 故事线、章节草稿、图表计划、DOCX/PDF 交接包 |

## 如何开始

日常用户可以直接下载桌面工作台：

[下载 One Person Lab App](https://github.com/gaofeng21cn/one-person-lab-app/releases/latest)

桌面产品的一键安装、完整首次安装包、Docker/WebUI 入口、GitHub Release 和用户教程由 App 仓维护。本仓维护这些入口背后的命令行、初始化流程、运行时、合同、模块管理和 App 可消费机器接口。

开发新的领域智能体、调试命令行或接入运行时，请展开下方技术入口。

## 给 Codex / Agent

在新机器上，让 Codex 按 [新机器 Codex 全家桶安装入口](docs/references/current-support/opl-new-machine-codex-bootstrap.md) 自动安装配置 OPL runtime、MAS/MAG/RCA/OMA/Book Forge 智能体可见面、包含 `$software-development` 文档治理工作流的 OPL Flow 和推荐 companion tools：

```text
请按 One Person Lab 官方新机器指南，帮我完成这台机器的 OPL 智能体运行环境和 Codex 工作流全家桶安装配置。
真相来源：https://github.com/gaofeng21cn/one-person-lab/blob/main/docs/references/current-support/opl-new-machine-codex-bootstrap.md
```

长期方向见 [公开路线图](./docs/public/roadmap.md)，具体实现断点见 [当前差距](./docs/active/current-state-vs-ideal-gap.md)。

## 技术入口

<details>
  <summary><strong>展开开发者与智能体说明</strong></summary>

### 常用命令

本仓源码开发入口：

```bash
git clone https://github.com/gaofeng21cn/one-person-lab.git
cd one-person-lab
npm install
npm link
```

常用框架命令：

```bash
opl help --text
opl connect modules
opl connect exec --module medautoscience -- doctor entry-modes
opl connect sync-skills
opl family-runtime status
opl family-runtime repair
opl family-runtime provider repair --provider temporal
opl family-runtime attempt list
```

自动化集成应优先读取 `opl help --json`、`contracts/` 下的机器可读合同，以及各领域智能体导出的投影数据。

Framework 持有通用运行、Package 发现和 App 投影；领域仓持有专业事实与裁决，App 持有 GUI 和发布事实。具体分工见 [架构](./docs/architecture.md)，执行语义见 [Runtime](./docs/runtime/README.md)。

### 文档

- [文档索引](./docs/README.md)
- [公开文档入口](./docs/public/README.md)
- [OPL 系列仓库地图](./docs/public/repo-map.md)
- [OPL 白皮书系列](https://gaofeng21cn.github.io/one-person-lab/latest/whitepapers/)
- [项目概览](./docs/project.md)
- [当前状态](./docs/status.md)
- [架构](./docs/architecture.md)
- [硬约束](./docs/invariants.md)
- [关键决策](./docs/decisions.md)
- [合同目录说明](./contracts/README.md)
- [公开路线图](./docs/public/roadmap.md)

</details>
