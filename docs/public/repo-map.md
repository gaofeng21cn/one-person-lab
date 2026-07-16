# OPL 系列仓库地图

Owner: `One Person Lab`
Purpose: `public_repo_map`
State: `active_public`
Machine boundary: 本文是公开导航，不是运行时、发布、安装或领域判断的机器真相。机器真相继续归各仓 contracts、source、CLI/API、runtime/readback、release artifacts 和 owner receipts。

这张地图回答一个问题：第一次看到 OPL 系列项目时，应该从哪个仓库进入。

## 一句话总览

`one-person-lab` 是 Framework；`one-person-lab-app` 是普通用户 App；`opl-aion-shell` 是当前主线 GUI shell；`opl-native-workbench` 是开发备选 Workbench；MAS/MAG/RCA/BookForge/OMA 是可替换的专业 agent package；Cloud/Flow/Homebrew/Health 分别承载云产品族、工作流 profile、分发 tap 和医疗行业规划文档。

## 仓库角色

| 仓库 | 公开角色 | 负责什么 | 不负责什么 |
| --- | --- | --- | --- |
| [`one-person-lab`](https://github.com/gaofeng21cn/one-person-lab) | OPL Framework | CLI、runtime、contracts、stage/runway、package/discovery、generated/hosted surfaces、跨 agent 通用能力 | 专业领域 verdict、最终交付质量、App 发布资产 |
| [`one-person-lab-app`](https://github.com/gaofeng21cn/one-person-lab-app) | One Person Lab App | 桌面产品、GUI product truth、first-run、settings、runtime overview、agent package 管理、release 体验 | Framework runtime truth、domain truth、专业 agent 内部行为 |
| [`opl-aion-shell`](https://github.com/gaofeng21cn/opl-aion-shell) | 主线 GUI shell | AionUI implementation carrier，渲染 App/root 暴露的状态、设置和任务入口 | 重新定义产品状态、runtime 状态、package 状态或领域 authority |
| [`opl-native-workbench`](https://github.com/gaofeng21cn/opl-native-workbench) | 开发备选 Workbench | macOS foreground workbench、chat-first 交互、preview、candidate bridge/readback 实验 | active shell adoption、release readiness、runtime/package truth |
| [`med-autoscience`](https://github.com/gaofeng21cn/med-autoscience) | Research Foundry agent package | 医学科研、论文任务、证据组织、稿件准备、paper-mission authority | 通用 OPL runtime、App shell、package manager |
| [`med-autogrant`](https://github.com/gaofeng21cn/med-autogrant) | Grant Foundry agent package | 医学基金方向、申请书、评审和修订准备 | 通用 runtime、generic scheduler、App release |
| [`redcube-ai`](https://github.com/gaofeng21cn/redcube-ai) | Presentation Foundry agent package | 视觉交付、汇报/答辩/讲课材料、layout/review/export verdict | 通用 runtime、非视觉领域 verdict、App shell |
| [`opl-bookforge`](https://github.com/gaofeng21cn/opl-bookforge) | Book Foundry agent package | 书籍写作、章节架构、书稿质量、导出/出版交接边界 | 通用 runtime、publication acceptance、App release |
| [`opl-meta-agent`](https://github.com/gaofeng21cn/opl-meta-agent) | OMA semantic provider | 目标理解、AgentBlueprint / EvalSpec、证据诊断和 EvolutionProposal | FoundryRun/评测/版本/激活、目标 agent 的领域 truth |
| [`one-person-lab-cloud`](https://github.com/gaofeng21cn/one-person-lab-cloud) | OPL Cloud product family | Gateway、Workspace、Console、Fabric、Ledger 的云产品与平台边界 | 替代 OPL Framework 或持有本地 App/domain truth |
| [`opl-flow`](https://github.com/gaofeng21cn/opl-flow) | Workflow/profile distribution | Codex/OPL 工作方式、repo profile、AGENTS/TASTE 模板和本机协作规范分发 | runtime/package/domain truth |
| [`homebrew-one-person-lab`](https://github.com/gaofeng21cn/homebrew-one-person-lab) | Homebrew distribution tap | One Person Lab App 的下游安装分发入口 | App release authority、二进制产物真相 |
| [`opl-health-platform`](https://github.com/gaofeng21cn/opl-health-platform) | Health industry planning docs | 医疗行业平台定位、医院部署、专病模板、医疗能力包规划 | Cloud/App/Framework 的通用实现、运行状态或账单资源调度 |

## 默认阅读顺序

1. 想使用产品：先看 [`one-person-lab-app`](https://github.com/gaofeng21cn/one-person-lab-app)。
2. 想理解框架和 agent 接入：看 [`one-person-lab`](https://github.com/gaofeng21cn/one-person-lab)。
3. 想开发 GUI shell：主线看 [`opl-aion-shell`](https://github.com/gaofeng21cn/opl-aion-shell)，备选实验看 [`opl-native-workbench`](https://github.com/gaofeng21cn/opl-native-workbench)。
4. 想开发专业 agent：从最接近的 Foundry repo 开始，但通用生命周期、package、runtime 和 App 可见面回到 OPL Framework。
5. 想理解线上产品族：看 [`one-person-lab-cloud`](https://github.com/gaofeng21cn/one-person-lab-cloud)；它是云产品实现族，不替代 Framework。
6. 想配置本机协作方式或安装分发：看 [`opl-flow`](https://github.com/gaofeng21cn/opl-flow) 和 [`homebrew-one-person-lab`](https://github.com/gaofeng21cn/homebrew-one-person-lab)。
7. 想看医疗行业平台方向：看 [`opl-health-platform`](https://github.com/gaofeng21cn/opl-health-platform)，当前保持 docs-only / MVP-first。

## 边界原则

- Framework/App/root author state；shell/workbench render state。
- 专业 agent 保留领域 authority；OPL 上收通用 runtime、package、generated/hosted surfaces 和默认调用面。
- Workbench fallback 只能显示 preview、simulated 或 unavailable，不能合成 active/ready/runtime truth。
- Health Platform 在 MVP 试点前保持人读规划文档，不提前加厚机器合同。
