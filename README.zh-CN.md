<p align="center">
  <img src="assets/branding/opl-banner.svg" alt="One Person Lab banner" width="100%" />
</p>

<p align="center">
  <a href="./README.md">English</a> | <a href="./README.zh-CN.md"><strong>中文</strong></a>
</p>

<h1 align="center">One Person Lab</h1>

<p align="center"><strong>面向高价值知识工作的 Codex-first、stage-led 完整智能体运行框架</strong></p>
<p align="center">让 AI 像人类专家一样推进专业任务：按专家阶段组织大型任务，以 Codex CLI 作为阶段内默认最小执行单元，并交付可审计成果。</p>

<p align="center">
  <img src="assets/branding/opl-workbench-overview.svg" alt="OPL 工作台概览" width="100%" />
</p>

<p align="center">
  <img src="assets/branding/opl-architecture-plan.svg" alt="OPL 架构与产品规划" width="100%" />
</p>

## 为什么是 One Person Lab

大多数智能体框架本质上是 workflow 系统：把任务拆成程序节点、工具调用、函数输入和 activity 输出。这种模式适合软件式自动化，但并不适合高价值知识交付。论文、基金、专利、审稿和高端汇报的难点，往往不是“下一步调用哪个工具”，而是当前处于哪个专家工作阶段、证据是否足够、质量怎么判断、结果能不能进入下一阶段。

One Person Lab 把“专家阶段”作为核心运行单元。每个 stage 都带着目标、材料、质量标准、交接、回执和权威边界；stage 内部由领域智能体完成阅读、推理、写作、计算、审核和修订，再返回该领域持有的判断和交付物。OPL 负责让这些阶段可见、可恢复、可审计，并能继续推进。

这就是 OPL 更适合高价值知识工作的原因：它不是把专业任务压平成机械流程图，而是把人类专家服务的交付逻辑产品化。

## 新手可以直接做什么

- **医学研究**：推进证据整理、数据分析、稿件草稿和交付包。
- **基金申请**：判断申请方向，组织申请书结构，准备修订材料。
- **汇报和 PPT**：准备讲课、组会、汇报、答辩和项目材料。
- **高价值知识工作**：把讨论、文件阅读、文档编辑、进度和交付物放在同一个地方。

## 最快用起来

macOS 桌面用户可以直接下载 App：

[下载 One Person Lab for macOS](https://github.com/gaofeng21cn/one-person-lab/releases/latest)

打开 `One Person Lab.app` 后，首次启动会准备本机环境，并帮助配置 Codex / Codex CLI、已配置的 OPL 家族运行时提供者、领域模块、技能、`officecli` 这类配套命令行工具和桌面工作台，不额外打开服务窗口。完整就绪需要核心环境、领域模块、已配置的家族运行时提供者三层都通过。生产目标是由 Temporal 支撑的运行时提供者承接可恢复的阶段尝试；当前 Hermes/local provider 路径只作为迁移期或历史实现信号。

如果你更习惯从终端安装：

```bash
curl -fsSL https://raw.githubusercontent.com/gaofeng21cn/one-person-lab/main/install.sh | bash
```

安装后打开 `One Person Lab.app`，选择工作目录，就可以在同一个界面里开始通用工作、医学研究、基金写作或汇报/PPT 工作。App 会复用 `opl install` 已完成的设置；只有核心依赖无法自动安装或识别时才提示用户处理。

需要 Docker、Linux 或服务器部署时，跳转到 [Docker 与浏览器部署参考](./docs/references/current-support/opl-docker-webui-deployment.md)。

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
- 阶段推进执行：OPL 把领域阶段作为可观察、可编排的工作单元，把 `Codex CLI` 作为阶段内默认最小执行单元，并把目标、证据、审核、回执、恢复和权威边界都挂到阶段上。
- 进度与文件视图：持续挂在任务旁边，方便恢复和交付。
- 环境与模块管理：统一查看 Codex CLI 默认执行器、OPL 家族运行时提供者、模块、技能、图形界面和健康情况。

## 给 Agent 和技术操作者的快速入口

<details>
  <summary><strong>展开技术入口</strong></summary>

### 交给 Codex Agent 的一句话

> 安装并配置这个 OPL 仓库：clone 仓库、安装 OPL CLI、运行 `opl install`，并确保 Codex CLI、已配置的 OPL 家族运行时提供者、MAS/MAG/RCA、推荐技能、`officecli` 这类必要配套命令行工具、One Person Lab App 和浏览器入口都可用；如果缺任何东西，直接修复或报告精确阻塞点。当前默认执行器是 Codex CLI。Temporal-backed provider 是 durable stage attempt、human-gate signal、retry、query 和 workflow history 的生产 substrate 候选；Hermes-Agent 在迁移期只作为 legacy/optional provider 或 executor/proof lane，MAS/MAG/RCA 继续持有各自 domain truth。

### 安装后常用命令

```bash
opl system initialize   # 检查 Codex 策略、family runtime provider、模块、skills、GUI 和工作目录状态
opl family-runtime status
opl family-runtime repair
opl family-runtime attempt create --domain medautoscience --stage scout --provider local_sqlite --workspace-locator '{"workspace_root":"/path/to/workspace"}'
opl family-runtime attempt list
opl modules             # 查看 MAS/MAG/RCA 模块，以及 MAS 声明的可选 companion diagnostic
opl skill sync          # 把 OPL 家族 skills 同步到 Codex 可见路径
opl help --text         # 人类可读帮助；机器读取使用 opl help --json
```

### 这个仓库跟踪什么

这个仓库跟踪 OPL 的框架层，不是专业 domain agent 的实现仓。它负责让产品家族保持一致：

- 提供发起和恢复专业工作的共同入口。
- 提供模块安装、技能同步、服务配置和健康检查面。
- 提供工作空间、会话、阶段尝试、进度与交付物的发现和组织能力。
- 提供共享合同，让 Research、Grant 和 Presentation Foundry 能在同一个工作台里被看见。

架构上，OPL 是面向高价值知识交付的 Codex-first、stage-led 完整家族智能体运行框架。它可以使用外部运行时提供者和具体执行器，但 `Codex CLI` 是 stage 内默认最小执行单元，OPL 持有的框架边界是 activation、typed family queue、durable session/runtime 支撑、stage attempt ledger、wakeup/retry/approval transport、shared discovery 和 projection。各 domain agent 持有自己的 stage 语义、prompt、skill、质量 gate、truth reducer 与交付 authority。这样 OPL 能支撑 MAS/MAG/RCA，并以高价值知识工作的全自动交付为目标，但不会变成它们的领域大脑。

在 MAS v2 alignment 下，`Med Auto Science` 继续是独立医学科研 domain agent，并通过单一 domain app skill 被 Codex 与 OPL 消费。OPL 持有统一定义、shared contract/index 注册、模块发现和 projection 消费层；它不变成 MAS runtime kernel，不恢复 MAS standalone release / install 通道，也不把 MAS projection 写成 OPL 自己持有的 ready verdict 或投稿/发表裁决。

桌面 GUI 由 [`opl-aion-shell`](https://github.com/gaofeng21cn/opl-aion-shell) 作为 OPL 品牌 App 外壳维护。用户从这个仓库的 GitHub Releases 获取 One Person Lab App 包；macOS arm64 新用户可选择带 MAS/MAG/RCA、当前 family runtime provider payload、`officecli` 以及推荐 companion skill payload 的 `One-Person-Lab-Full-<version>-mac-arm64.dmg` 首次安装资产，App 内更新继续只使用标准 App 资产和 `latest*.yml` metadata。这个仓库提供 App 和 Codex 共同消费的共享合同与产品表面。

### 这个仓库怎么读

1. 用户先读当前首页和上面的 App / `opl install` 路径。
2. 技术规划、架构判断和方向同步，继续读 [文档索引](./docs/README.zh-CN.md)，再读 [项目概览](./docs/project.md)、[当前状态](./docs/status.md)、[架构](./docs/architecture.md)、[硬约束](./docs/invariants.md)、[关键决策](./docs/decisions.md)。
3. 开发者和维护者，继续读 [合同目录说明](./contracts/README.md)、[规格索引](./docs/specs/README.zh-CN.md)、[参考级索引](./docs/references/README.zh-CN.md)，以及 [历史归档索引](./docs/history/README.zh-CN.md) 下的过程归档材料。

### 运行说明

- 默认入口是 `opl`、`opl exec` 和 `opl resume`。除非显式切换运行时或显式激活 domain agent，这几个入口都继承 Codex 默认语义。
- OPL 的编排单元是领域阶段。大型任务应按接近人类专家的方式推进：界定目标、准备材料、执行、审核、修订和收口。stage descriptor、handoff envelope、receipt 和 projection metadata 属于 family framework 层，stage 内部执行仍由 domain 持有并交给 Codex 执行。
- OPL 会把 `Codex CLI` 作为受管运行依赖检查：`opl system` 会报告实际选中的 binary、版本、最低版本策略和 PATH 诊断。健康状态以选中 binary 为准；非选中的 PATH 候选只作为诊断信息，不阻塞兼容的 Codex CLI。
- OPL family runtime 正在收敛为 provider-backed。Temporal 是 durable stage-attempt workflow、activity retry/timeout、human-gate signal、status query 与 execution history 的首选生产 substrate 候选。Hermes-Agent 在迁移期保留为 legacy/optional provider 或显式 executor/proof lane；Temporal provider 落地后，它不再是目标长期 session/wakeup substrate。
- `Codex CLI` 仍是默认具体执行器，除非 route 显式选择其他 executor。family runtime provider 不成为 MAS/MAG/RCA 的 domain truth、质量 authority、artifact authority 或 publication/package gate。
- 使用 `opl family-runtime status|doctor|repair|intake|tick|enqueue|attempt create|attempt list|attempt inspect|queue list|approve|notify list|events export` 操作 OPL family runtime bridge 与 stage attempt ledger。`opl install --no-online-runtime` 与 provider-disable 环境开关只用于开发/离线诊断，并输出 degraded Full readiness。
- 首次启动需要 Core ready、Domain modules ready、已配置的 family runtime provider ready 三层都通过，Full readiness 才算完整。迁移期本地 CLI/status/manifest 仍可能暴露 Hermes/local provider 状态作为 legacy readiness signal。
- 如果某个 admitted domain repo 还没落地到本机，运行 `opl module install --module <module_id>`。
- 默认本地状态目录是 `~/Library/Application Support/OPL/state`。如果需要改到其他本地状态根目录，直接设置 `OPL_STATE_DIR`。
- 当前 active domain agents 是 [`Med Auto Science`](https://github.com/gaofeng21cn/med-autoscience)、[`Med Auto Grant`](https://github.com/gaofeng21cn/med-autogrant) 和 [`RedCube AI`](https://github.com/gaofeng21cn/redcube-ai)。
- `Med Auto Science` 对 OPL/Codex 只暴露一个 MAS domain app skill。OPL 同步并消费这个 skill 以及 MAS-owned projection 作为共享工作台 surface；医学科研 runtime、controller truth、质量 authority 和 publication gate 继续由 MAS 持有。
- [`Med Deep Scientist`](https://github.com/gaofeng21cn/med-deepscientist) 不再是 OPL 默认安装的 MAS 运行依赖。`Med Auto Science` 仍可显式暴露可选 backend audit、legacy restore/import diagnostic、upstream intake 和 parity oracle 引用；OPL 只把它们作为 MAS 声明的 companion diagnostic 消费，不把 MDS 写成顶层 domain agent 或默认模块。
- 当任务需要顶层 session/runtime 路径、共享 `workspaces / sessions / progress / artifacts` surface 或显式 domain activation 时，从 `OPL` 进入；当任务已经明确落在某个 domain 上时，继续进入对应仓库首页和 `docs/README*`，按该仓自己的 CLI/脚本/contract 边界执行。

</details>

## 延伸阅读

- [路线图](./docs/public/roadmap.zh-CN.md)
- [任务版图](./docs/public/task-map.zh-CN.md)
- [运行模型](./docs/public/operating-model.zh-CN.md)
- [统一工程基座](./docs/public/unified-harness-engineering-substrate.zh-CN.md)
- [文档索引](./docs/README.zh-CN.md)
- [项目概览](./docs/project.md)
- [当前状态](./docs/status.md)
- [合同目录说明](./contracts/README.md)
