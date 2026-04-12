[English](./README.md) | **中文**

# OPL 文档索引

这个目录承载 `One Person Lab` 的公开文档与仓库跟踪文档。
为了既让公开主线稳定，又让 AI 和维护者能快速找到项目核心知识，`OPL` 现在同时维护两套视图：

1. AI / 维护者核心工作集
2. 四层公开文档体系

如果你只是想把握当前公开真相与活跃主线，默认停在“核心工作集 + 第一层 + 第二层”即可。
第三层统一通过 [参考级索引](./references/README.zh-CN.md) 进入，不再把参考文档平铺成默认阅读面。

## AI / 维护者核心工作集

在开始改仓库前，AI 和维护者应优先读取这些文件：

- [项目概览](./project.md)
- [当前状态](./status.md)
- [架构](./architecture.md)
- [硬约束](./invariants.md)
- [关键决策](./decisions.md)
- [合同目录说明](../contracts/README.md)

## 当前基线与任务层级

- 当前基线：`OPL` 是顶层 gateway / federation / shared substrate contract surface，而 domain runtime ownership 继续留在已 admitted 的 domain 仓。
- 当前重点：真相重置、central sync、surface authority convergence、admitted-domain state alignment。
- 当前真相：四仓已经不在同一集成深度上。`Med Auto Grant` 已落下真实上游 `Hermes-Agent` substrate，`Med Auto Science` 已完成 external runtime bring-up 并进入 real adapter cutover 前态，`RedCube AI` 仍在 upstream pilot prep，而 `OPL` 现在已经在顶层 gateway 之上持有本地 direct product-entry shell。
- 当前产品入口真相：`OPL` 现在已经有了以 `opl` 为默认前台的本地 direct product-entry shell；`opl <request...>` 可直接作为 quick ask，而 `opl doctor / ask / chat / resume / sessions / logs / repair-hermes-gateway` 继续构成显式命令面，并统一运行在外部 Hermes kernel 之上；`opl web` 现在也已经把本地 web front desk pilot 落下来了。
- 当前管理面真相：`opl projects / workspace-status / runtime-status / dashboard` 已经补上第一版顶层管理面，用来观察项目、工作区、会话与 runtime；`opl web` 则把这层管理面直接带进浏览器入口。
- 当前 hosted / web 真相：这一层的入口选型现已冻结为短期 `LibreChat-first` pilot，目标是最快做出可用 web 前台；长期仍以 `OPL` 自有 web front desk 为准，而不是永久依赖第三方聊天壳。
- 当前家族级产品入口真相：四仓的 product-entry 成熟度仍然不一致。`OPL` 已有 family-level 本地入口壳，而三个业务仓仍主要暴露 operator / agent entry，后续还要继续补齐 lightweight direct entry。
- 当前已冻结的 integration choice：`Hermes Kernel Integration` 采用 `external kernel, managed by OPL product packaging`，而不是长期 fork，也不是把 Hermes 手工安装交给用户自己处理。
- 长线目标：让共享运行层逐步转向上游 `Hermes-Agent`（或经过明确批准的等价 substrate），同时保持 `OPL` 继续承担顶层协调、发现、合同与边界治理。
- 历史执行面：OMX 已退场；相关材料只作迁移/审计参考，不再进入默认阅读面。

## 第一层：默认公开主线

这一层是人类专家第一次理解 `OPL` 时应优先阅读的内容。
它们构成默认公开叙事，因此必须保持中英双语同步。

- [仓库首页](../README.zh-CN.md)
- [路线图](./roadmap.zh-CN.md)
- [任务版图](./task-map.zh-CN.md)
- [Gateway 联邦](./gateway-federation.zh-CN.md)
- [运行模型](./operating-model.zh-CN.md)
- [Unified Harness Engineering Substrate](./unified-harness-engineering-substrate.zh-CN.md)

## 第二层：公开合同与 Gateway 配套文档

这一层仍然是公开文档，但更偏技术合同和边界说明。
它们定义的是 gateway 语义、shared-foundation 边界与正式合同界面，而不是首页叙事本身。

- [OPL 联邦合同](./opl-federation-contract.zh-CN.md)
- [共享基础结构](./shared-foundation.zh-CN.md)
- [共享基础结构归属](./shared-foundation-ownership.zh-CN.md)
- [Shared Runtime Contract](./shared-runtime-contract.zh-CN.md)
- [Shared Domain Contract](./shared-domain-contract.zh-CN.md)
- [OPL Runtime 命名与边界合同](./opl-runtime-naming-and-boundary-contract.zh-CN.md)
- [OPL 只读 Discovery Gateway](./opl-read-only-discovery-gateway.zh-CN.md)
- [OPL Routed Action Gateway](./opl-routed-action-gateway.zh-CN.md)
- [OPL Domain Onboarding Contract](./opl-domain-onboarding-contract.zh-CN.md)
- [OPL 公开界面索引](./opl-public-surface-index.zh-CN.md)
- [OPL Gateway 合同](../contracts/opl-gateway/README.zh-CN.md)

## 第三层：参考级配套文档

这一层继续保留在仓库中，承担审核、验收、示例、索引或边界检查作用。
`OPL` 的默认公开主线继续收口在核心工作集、第一层与第二层。
为了让 `docs/` 根目录保持可读，这一层的文档统一收拢到 `docs/references/`，并由单独索引入口管理。

### 默认入口

- [参考级索引](./references/README.zh-CN.md)
- `references/contract-convergence-v1-execution-board.md`
- `references/ecosystem-status-matrix.md`
- `references/hermes-agent-runtime-substrate-benchmark.md`
- `references/hermes-agent-truth-reset-and-target-state.md`
- `references/family-product-entry-and-domain-handoff-architecture.md`
- `references/family-lightweight-direct-entry-rollout-board.md`
- `references/mas-top-level-cutover-board.md`
- `references/opl-frontdesk-delivery-board.md`
- `references/opl-hosted-web-frontdesk-benchmark.md`
- `references/opl-product-entry-and-hermes-kernel-integration.md`
- `references/opl-phase-2-central-reference-sync-board.md`
- `references/opl-phase-2-admitted-domain-delta-intake-refresh.md`

### 常用参考束

- `references/opl-gateway-rollout*`
- `references/opl-gateway-acceptance-test-spec*`
- `references/opl-candidate-domain-backlog*`
- `references/opl-candidate-workstream-tranche-closeout*`
- `references/opl-surface-lifecycle-map*`
- `references/opl-surface-authority-matrix*`
- `references/opl-surface-review-matrix*`
- `references/opl-governance-audit-operating-surface*`
- `references/opl-publish-promotion-operating-surface*`
- `references/opl-gateway-example-corpus*`
- `references/opl-routed-safety-example-corpus*`
- `references/opl-operating-example-corpus*`
- `references/opl-operating-record-catalog*`
- `references/managed-runtime-migration-readiness-checklist.md`
- `references/contract-convergence-v1-decision-note.md`
- `references/opl-phase2-ecosystem-sync-owner-line.md`
- `references/opl-vertical-online-agent-platform-roadmap.md`

### 历史迁移归档

- [OMX 历史资料索引](history/omx/README.zh-CN.md)（仅历史参考）
- `references/development-operating-model.md`
- `references/runtime-alignment-taskboard.md`

## 第四层：历史规格与计划

这一层是内部设计与计划记录。
它们可以解释某次冻结为什么发生，但不应被当作仓库当前状态的活文档真相面。

- `docs/specs/`
- `docs/plans/`

## 文档规则

- AI / 维护者核心工作集用于快速回答项目目标、当前状态、边界与关键决策，避免每次都从整套公开面重新爬梳。
- 第一层和第二层属于公开文档，因此必须同时提供英文 `.md` 与中文 `.zh-CN.md` 镜像，并保持同步更新。
- 第三层允许继续公开或仓库跟踪，但始终属于参考级文档，不应继续挤占根 README 或 `docs/README*` 的默认阅读路径。
- 历史迁移参考可以保留，但不得再被写成当前默认 workflow。
- 与退役执行面相关的历史 runbook、提示词模板和 worktree 规程，只能从 `docs/history/omx/` 进入，不再作为第三层默认入口。
- 第四层属于内部工作历史，默认只保留中文；除非有明确理由，不再额外扩成双语公开面。
- 避免无意义的中英混写：叙述尽量保持单一语言，英文只保留给固定术语、文件路径、命令名、schema 与代码标识符。

## 治理说明

- 文档治理规则统一收口在 [AGENTS.md](../AGENTS.md) 与 docs 核心工作集。
