# OPL Series README 叙事刷新对照记录

Owner: `One Person Lab`
Purpose: `readme_narrative_refresh_comparison`
State: `support_reference`
Machine boundary: 本文只记录 2026-05-30 这一轮 OPL series 根层 README 公开叙事刷新前后的表达差异和视觉资产状态。机器 truth 继续归各仓 contracts、source、tests、CLI/API 行为、runtime ledger、domain-owned manifests、owner receipts 和 App release gates。

## 范围

本轮覆盖六个仓库的根层中文与英文 README：

- `one-person-lab`
- `med-autoscience`
- `med-autogrant`
- `redcube-ai`
- `opl-meta-agent`
- `one-person-lab-app`

目标是把用户入口表达从内部架构叙事，收敛为类似 PilotDeck 中文 README 的直接产品叙事：先说适合谁、解决什么问题、如何开始，再保留技术边界在后半段。本文是对照记录，不进入公开 README 正文。

## 视觉资产

本轮只重绘 OPL 主图、MAS/MAG/RCA overview 图，并保留原图。新图沿用白板手绘风格，图内文字使用英文：

| 项目 | 原图 | 新图 | 状态 |
| --- | --- | --- | --- |
| OPL | `assets/branding/opl-stage-led-delivery-overview.png` | `assets/branding/opl-stage-led-delivery-overview-v2.png` | v2 用作首屏主图；原图保留在 workflow-style agents 对比段 |
| MAS | `assets/branding/medautoscience-overview.png` | `assets/branding/medautoscience-overview-v2.png` | 已在中英文 README 引用 |
| MAG | `assets/branding/medautogrant-overview.png` | `assets/branding/medautogrant-overview-v2.png` | 已在中英文 README 引用 |
| RCA | `assets/branding/redcube-ai-overview.png` | `assets/branding/redcube-ai-overview-v2.png` | 已在中英文 README 引用 |
| OMA | `assets/branding/opl-meta-agent-overview.png` | 未重绘 | 本轮未要求重绘 |
| App | `assets/branding/opl-app-product-map.png` | 未重绘 | 本轮未要求重绘 |

## 文档对照

### `one-person-lab/README.zh-CN.md`

| 项目 | 旧表达 | 新表达 | 变化目的 |
| --- | --- | --- | --- |
| 入口定位 | “面向高价值知识交付的阶段式智能体框架” | “面向复杂知识工作的 AI 智能体框架和工作台”语气 | 降低架构门槛，让用户先理解用途 |
| 问题描述 | 先讲阶段、证据、质量、交付等架构优势 | 先问“多轮之后到哪了、用了哪些材料、哪些文件变化、能否后台继续” | 用用户问题开场，减少内部术语负担 |
| 亮点组织 | `架构优势` | `核心亮点`、`一句话理解`、`三层产品关系` | 更接近产品介绍，而不是技术说明 |
| 技术边界 | 技术说明靠前 | 技术入口折叠到后半段 | 公开入口先服务用户理解，技术细节留给操作者 |
| 图片 | `opl-stage-led-delivery-overview.png` | `opl-stage-led-delivery-overview-v2.png` 首屏主图；原图保留为 workflow-style agents 对比图 | 两张图语义不同，不做简单替换 |

### `one-person-lab/README.md`

| 项目 | 旧表达 | 新表达 | 变化目的 |
| --- | --- | --- | --- |
| Hero | `A stage-led agent framework for high-value knowledge delivery` | `An AI agent framework and workbench for complex knowledge work` | 更自然的英语产品定位，少暴露 stage-led 内部术语 |
| 一句话说明 | `Organize ... into expert stages` | `Move ... through clear stages toward real delivery` | 从系统结构转向用户结果 |
| 开场叙事 | 强调 judgment、authority boundary、deliverable verdict | 强调 long-running work、progress、files、evidence、blockers | 把 technical proof 改成用户能感知的价值 |
| 英文润色 | 偏直译、偏架构 | 更接近 native product copy | 保持准确边界同时提升国际用户可读性 |
| 图片 | `opl-stage-led-delivery-overview.png` | `opl-stage-led-delivery-overview-v2.png` as hero; original retained as workflow-style agents comparison | The two diagrams cover different concepts |

### `med-autoscience/README.zh-CN.md`

| 项目 | 旧表达 | 新表达 | 变化目的 |
| --- | --- | --- | --- |
| 入口定位 | “医学研究 Foundry Agent，也是 built on OPL Framework...” | “医学研究 AI 助手/智能体，帮助真实研究从数据、证据、写作推进到论文交付” | 把用户首先看到的主语从兼容包改为医学研究任务 |
| 问题描述 | 直接列能力和边界 | 先讲数据、初步结果、图表草稿、验证结果分散的问题 | 贴近医生和课题组真实痛点 |
| 快速启动 | 只保留可用 prompt | 保留并前置为用户可直接模仿的启动句 | 降低第一次使用门槛 |
| 技术边界 | OPL/MAS 分工较靠前 | 领域边界保留在 `当前定位与边界` | 不丢 owner truth，又避免首屏过重 |
| 图片 | `medautoscience-overview.png` | `medautoscience-overview-v2.png` | 主图改为同风格英文白板图 |

### `med-autoscience/README.md`

| 项目 | 旧表达 | 新表达 | 变化目的 |
| --- | --- | --- | --- |
| Hero | `A medical research Foundry Agent...` | `An AI research agent for real medical studies...` | 国际用户先看到研究价值，而不是包形态 |
| 副标题 | `Evidence Organization · Analysis Progression` | `Evidence Building · Analysis Support` | 去掉直译感，改为更自然的英语名词 |
| 用户对象 | `preparing studies for manuscript delivery` | `moving studies toward manuscripts` | 更短、更自然 |
| 核心亮点 | `Find paper-worthy questions` | `Identify paper-worthy questions` | 英文 marketing polish |
| 图片 | `medautoscience-overview.png` | `medautoscience-overview-v2.png` | 主图改为同风格英文白板图 |

### `med-autogrant/README.zh-CN.md`

| 项目 | 旧表达 | 新表达 | 变化目的 |
| --- | --- | --- | --- |
| 入口定位 | “Foundry Agent / OPL-compatible package” | “面向医学基金申请书的 AI 写作工作台” | 用户先理解写作场景和交付物 |
| 开场方式 | 以包定位和引用说明为主 | 先讲“基金申请不是填表”，再列多轮写作、批注、版本、补件问题 | 贴近申请人视角 |
| 核心亮点 | 分散在适合处理的工作里 | 独立成 `核心亮点` | 首屏更快抓住产品能力 |
| 边界 | 保留正文写作、形式补件、人类 gate | 保留在 `当前边界` | 保持 grant authority 不被公开文案稀释 |
| 图片 | `medautogrant-overview.png` | `medautogrant-overview-v2.png` | 主图改为同风格英文白板图 |

### `med-autogrant/README.md`

| 项目 | 旧表达 | 新表达 | 变化目的 |
| --- | --- | --- | --- |
| Hero | `A Foundry Agent for medical grant authoring...` | `An AI grant-writing workspace for medical teams...` | 从内部发布形态改为用户任务定位 |
| 用户对象 | `investigator-side grant applications` | `researcher-led medical grant applications` | 消除不自然直译 |
| 亮点标题 | `Reviewer-Style Critique That Leads To Revision` | `Reviewer-Style Critique That Turns Into Revision` | 更像英语产品文案 |
| 补件边界 | `Body Writing And Portal Supplements` | `Scientific Writing And Portal Supplements` | 更准确表达写作主体 |
| 图片 | `medautogrant-overview.png` | `medautogrant-overview-v2.png` | 主图改为同风格英文白板图 |

### `redcube-ai/README.zh-CN.md`

| 项目 | 旧表达 | 新表达 | 变化目的 |
| --- | --- | --- | --- |
| 入口定位 | “正式视觉交付的 AI 创作工作台” | 保留并强化“资料、生成、审阅、回修、导出文件在同一条交付线” | RCA 原本已接近预期风格，本轮主要统一图与首屏结构 |
| 问题描述 | 已用用户问题开场 | 保留该结构 | 继续沿用 PilotDeck-like 问题式表达 |
| 交付对象 | 幻灯片、小红书笔记、海报 | 保留 | 公开用户心智清晰 |
| 技术边界 | 直达路径、OPL 托管路径、RCA authority | 保留在后半段 | 不改 domain truth 或 export authority |
| 图片 | `redcube-ai-overview.png` | `redcube-ai-overview-v2.png` | 主图改为同风格英文白板图 |

### `redcube-ai/README.md`

| 项目 | 旧表达 | 新表达 | 变化目的 |
| --- | --- | --- | --- |
| Hero | `An AI creation workspace... generation, review, repair...` | `An AI workspace... drafts, review, revisions...` | 用更自然的 visual-deliverable 语言替代内部 repair 口径 |
| 开场 | `the whole workflow` | `the full workflow` | 英文润色 |
| 流程描述 | `review repair` | `review, revision` | 对外更清楚，避免让用户以为是低层修复工具 |
| 亮点标题 | `Traceable Review And Repair` | `Traceable Review And Revision` | 更适合公开宣传 |
| 图片 | `redcube-ai-overview.png` | `redcube-ai-overview-v2.png` | 主图改为同风格英文白板图 |

### `opl-meta-agent/README.zh-CN.md`

| 项目 | 旧表达 | 新表达 | 变化目的 |
| --- | --- | --- | --- |
| 入口定位 | “用于开发、测试和持续优化新智能体的元智能体” | “把专业工作流变成可测试、可接入 OPL、可持续改进的 AI 智能体” | 从内部元智能体概念转向用户想要的产物 |
| 问题描述 | 以能力清单和技术边界为主 | 增加“为什么存在”：prompt 不等于可交付智能体 | 用户能快速理解它解决的缺口 |
| 核心亮点 | 分散在适合处理的工作中 | 独立列出蓝图、边界、测试、改进、接管测试 | 产品价值更可扫读 |
| 技术边界 | Foundry Kernel、proposal-only、refs-only | 保留在后半段 | 不弱化 target domain owner 边界 |
| 图片 | `opl-meta-agent-overview.png` | 未改 | 本轮未要求重绘 |

### `opl-meta-agent/README.md`

| 项目 | 旧表达 | 新表达 | 变化目的 |
| --- | --- | --- | --- |
| Hero | `A Foundry Agent for building...` | `Turn a professional workflow into a testable, OPL-ready AI agent...` | 从分类说明改成用户结果 |
| 副标题 | `From idea to agent baseline` | `From idea to tested baseline` | 更直接说明产物 |
| 问题陈述 | `A new agent should be more than a prompt` | `A new agent needs more than a prompt` | 更自然的英语语气 |
| Summary | `practical agent baseline` | `practical baseline` | 减少重复 |
| 图片 | `opl-meta-agent-overview.png` | 未改 | 本轮未要求重绘 |

### `one-person-lab-app/README.zh-CN.md`

| 项目 | 旧表达 | 新表达 | 变化目的 |
| --- | --- | --- | --- |
| 入口定位 | “One Person Lab 的桌面工作台” | “复杂知识工作的桌面 AI 工作台” | 从项目内名词转成用户类别 |
| 开场 | 直接进入安装 | 增加 `为什么需要它`、`核心亮点` | 用户先理解产品价值，再下载安装 |
| 用户路径 | 安装步骤和运行状态细节混在一起 | 增加用户路径，并把技术状态留在后半段 | 降低非技术用户阅读负担 |
| 产品边界 | App/Framework/domain 分工仍保留 | 保留在 `产品边界` | 不改变 App-owned product truth |
| 图片 | `opl-app-product-map.png` | 未改 | 本轮未要求重绘 |

### `one-person-lab-app/README.md`

| 项目 | 旧表达 | 新表达 | 变化目的 |
| --- | --- | --- | --- |
| Hero | `The desktop workbench for One Person Lab` | `The desktop AI workbench for complex knowledge work` | 从项目内部定位转向用户类别 |
| 副标题 | `Package One Person Lab...` | `Start research, grants, presentations... track progress...` | 更直接说明用户动作 |
| 开场 | 先下载与安装 | 先说明为什么存在，再下载 | 更符合产品 README 首屏逻辑 |
| 英文润色 | `First install as a product experience` | `First install feels like a product` | native marketing polish |
| 图片 | `opl-app-product-map.png` | 未改 | 本轮未要求重绘 |

## 非目标

- 不把 PilotDeck AGPL 代码、文案或图片复制进 OPL series。
- 不修改 contracts、source、runtime ledger、domain truth、quality verdict、owner receipt 或 App release gate。
- 不把本文档作为机器接口或测试断言对象。
- 不宣称 App、MAS、MAG、RCA、OMA 已获得新的 runtime readiness、domain readiness、quality verdict 或 production release 结论。
