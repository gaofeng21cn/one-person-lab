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
- 当前重点：family-level front desk、hosted runtime hardening 与 domain lightweight direct-entry alignment；`central sync` 只在 admitted-domain 吸收了新 delta 或中央 wording 真实漂移时条件性重开。
- 当前真相：四仓已经不在同一集成深度上。`Med Auto Grant` 已落下真实上游 `Hermes-Agent` substrate，`Med Auto Science` 已完成 external runtime bring-up 并进入 real adapter cutover 前态，`RedCube AI` 已把 route / managed execution 收口到本地 `Codex CLI` host-agent runtime，同时落下 repo-verified 的 `product frontdesk / federated product entry / session continuity / family-orchestration companion` 表面，而 `OPL` 现在已经在顶层 gateway 之上持有本地 direct product-entry shell。
- 当前产品入口真相：`OPL` 现在已经有了以 `opl` 为默认前台的本地 direct product-entry shell；`opl <request...>` 可直接作为 quick ask，而 `opl doctor / ask / chat / resume / sessions / logs / repair-hermes-gateway / frontdesk-manifest / frontdesk-readiness / frontdesk-domain-wiring / frontdesk-hosted-bundle / frontdesk-hosted-package / frontdesk-librechat-package / session-ledger / handoff-envelope / domain-manifests / paperclip-* / frontdesk-service-*` 继续构成显式命令面，并统一运行在外部 Hermes kernel 之上；`opl web` 现在也已经把本地 web front desk pilot 落下来了，并额外暴露 hosted-friendly 的 `/api/frontdesk-readiness` 与 `/api/frontdesk-domain-wiring` 作为 family operator truth surface，其中 `paperclip-*` 仍是可选下游 control-plane bridge，不是运行时必需依赖。
- 当前管理面真相：`opl projects / workspace-status / workspace-catalog / workspace-bind|activate|archive / domain-manifests / runtime-status / session-ledger / dashboard` 已经补上当前顶层管理面，用来观察项目、工作区、会话、handoff 与 runtime；其中 `workspace-catalog` 继续只是 non-executing registry，会带 project-level binding summary、可写 action 提示，以及可选的 domain-owned `manifest_command`；`domain-manifests` 则是并列的执行型发现面，会把当前 active binding 上的 `manifest_command` 解析成 machine-readable 的 product-entry discovery object，并继续带出各 domain 的 `frontdesk_surface`、`operator_loop_surface`、`operator_loop_actions`、`product_entry_shell`、`shared_handoff`、可选的 `family_orchestration.action_graph` 与 recommended command hints；`frontdesk-domain-wiring` 现在也开始承载 domain-scoped binding parity，以及修复 locator parity 所需的 workspace-registry endpoints；`frontdesk-readiness` 现在会把本地 service 状态、hosted pilot readiness 与 domain `product_entry_readiness / preflight` 真相收成单一 operator-facing board；`session-ledger` 现在除了原始事件外也会输出按 session 聚合后的归因视图；`opl web` 则把这层管理面直接带进浏览器入口，同时也暴露了 hosted-friendly 的 `health / manifest / frontdesk-readiness / frontdesk-domain-wiring / domain-manifests / hosted-bundle / hosted-package / librechat-package / sessions / resume / logs / handoff-envelope` 表面。
- 当前 hosted / web 真相：这一层已经有了真实可部署的 `LibreChat-first` hosted shell pilot package，作为最快做出可用 web 前台的路线；长期仍以 `OPL` 自有 web front desk 为准，而不是永久依赖第三方聊天壳；managed hosted runtime 仍未落地。
- 当前家族级产品入口真相：四仓的 product-entry 成熟度仍然不一致。`OPL` 已有 family-level 本地入口壳；三个业务仓现在也都已经有 repo-tracked 的 lightweight direct-entry shell，但成熟度仍不同，而且都还不能被误写成成熟的 hosted 或最终用户前台。
- 当前家族默认执行器：`Codex CLI autonomous` 已冻结为默认执行器 route；家族默认模型与默认 reasoning effort / thinking 统一继承本机 `Codex` 默认配置，而不是在 repo 里固定 pin 某个具体型号；`Hermes-native` 仍只算实验路线，且只有完整的 `Hermes AIAgent` loop 才算成立。
- 当前家族 orchestration 真相：当前正在把 `event envelope`、`checkpoint lineage`、`action graph`、`human gate`、`product-entry manifest v2` 冻结成 contract-first 的 companion surface；这代表吸收 `CrewAI` 一类工具最值得保留的 orchestration 语义，但不把 `CrewAI` 直接引入为 family runtime dependency。
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
- `references/family-executor-adapter-defaults.md`
- `references/hermes-native-executor-proof-lane.md`
- `references/family-orchestration-contract-absorb-crewai.md`
- `references/family-product-entry-and-domain-handoff-architecture.md`
- `references/family-lightweight-direct-entry-rollout-board.md`
- `references/family-user-facing-maturity-roadmap.md`
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

- 文档治理规则现在统一冻结在 [series-doc-governance-checklist.md](./references/series-doc-governance-checklist.md)、docs 核心工作集，以及仓库跟踪的 contract/doc surface 中，而不再只写在 `AGENTS.md`。
- 当前四仓文档对齐快照统一收口在 [four-repo-doc-series-sync-summary-2026-04-14.md](./references/four-repo-doc-series-sync-summary-2026-04-14.md)。
- 可复用的 intake 起手模板现在收口在 [four-repo-doc-intake-template.md](./references/four-repo-doc-intake-template.md)，默认中央漂移审计命令是 `npm run audit:doc-series`。
