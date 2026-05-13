[English](./roadmap.md) | **中文**

# OPL 路线图

## 当前角色

`OPL` 是 one-person research lab 的 stage-led、以 Agent executor 为最小执行单位的智能体运行框架。
它以 `Codex CLI` 作为 stage 内默认具体执行器，用接近人类专家实施方式的 stage 组织大型任务，并持有 activation、stage attempt、typed queue、wakeup、receipt、recovery、projection、shared modules / contracts / indexes 等框架能力；domain truth 继续由各个 domain 仓直接持有。

今天的公开 `OPL` 表面已经收口到这几层：

- `Codex CLI` 作为 `opl`、`opl exec` 与 `opl resume` 的默认具体 executor 路径
- 显式 `OPL` activation 承担 family-level 语义、domain discovery、stage selection 与 runtime switch
- provider-backed stage runtime 承担 queue、wakeup、attempt、receipt、approval、retry/dead-letter 与 projection
- `MedAutoScience`、`MedAutoGrant`、`RedCube AI` 之上的 shared modules、contracts 与 indexes
- `OPL Runtime Manager` 作为已配置 family runtime provider 之上的产品控制面
- Rust native helper / index 工作只承担 native assistance 与 indexed discovery，不持有 domain truth 或 executor ownership

## 活跃路线

当前活跃路线有两条等价入口：

- direct path：`Codex-default executor -> explicit OPL activation -> selected domain agent entry`
- durable path：`Codex-default executor -> explicit OPL activation / typed family queue -> configured family runtime provider when durable orchestration is needed -> selected domain agent entry`

这条路线现在聚焦四件事：

1. 保持 `Codex CLI` 作为默认 executor，除非用户显式 activation 到其他 runtime。
2. 把 `OPL` 的当前 truth surface 收口到 family-level sessions、progress、artifacts 与 shared indexes，而不是 web / API 壳。
3. 把 `OPL Runtime Manager` 理解成已配置 family runtime provider 之上的产品控制面与 typed dispatch 层，不写成 domain scheduler、domain truth owner、quality owner、artifact owner 或 concrete executor owner。
4. 保持 public docs、contracts 与 admitted-domain wording 持续对齐真实家族拓扑。

当前执行顺序见 [OPL 当前开发线路](../active/current-development-lines.zh-CN.md)：先完成 OPL framework foundation，再用 MAS 真实 paper line 作为第一条 production-closure 验收路径，同时保持 MAS/MAG/RCA descriptor migration 与 direct-skill parity 不退化；旧 operator wording 需要 no-default-caller 证据后退役，随后产品化到 OPL App Runtime Workbench，最后在 MAS owner-chain 证明稳定后推进 MAG/RCA controlled soak 和更宽的 domain acceptance。

排除真实论文、基金和视觉交付长时 soak 后，仍需工程落地的功能性闭环见 [生产功能闭环一步到位计划](../active/production-functional-closure-plan.zh-CN.md)。这份计划把剩余能力拆成 provider readiness、owner receipt、domain memory/lifecycle apply、physical skeleton、legacy retirement、operator workbench 和 closeout gate 七条可并行 lane；每条 lane 要么给出可验证实现，要么给出机器可读 typed blocker。

## 近期重点

- 保持旧 gateway / federation wording 只作为 provenance / reference material，同时把 runtime / activation 语义写成主线
- 保持 `Unified Harness Engineering Substrate`、`Shared Runtime Contract` 与 `Shared Domain Contract` 作为 domain 之上的共享边界
- 保持 provider-backed stage runtime 的诚实表达：Temporal 是 production online runtime 的必需 substrate，`Hermes-Agent` 只作为迁移/proof 语境保留
- 保持 public help、当前文档与 operator-facing guidance 不再展示默认 Hermes/Gateway/frontdoor/local-manager wording；保留旧名时必须显式属于 legacy/provenance/diagnostic/history/fixture
- 保持未来 hosted / desktop 入口继续围绕 Codex-default executor 路径背后的 runtime truth 演进
- 保持 candidate domain 沿定义、审查与 onboarding 路径推进

## 家族形态

当前家族形态已经足够清楚，可以直接指导路线图：

- `MedAutoScience` 持有 `Research Ops` domain entry、workflow、runtime truth 与 harness
- `MedAutoGrant` 持有 admitted 的 `Grant Ops` domain entry、workflow、runtime truth 与 harness
- `RedCube AI` 持有视觉交付 domain entry、workflow、runtime truth 与 harness
- `ppt_deck` 继续是当前最直接映射到 `Presentation Ops` 的 family
- `IP Ops` 继续作为 `IP Foundry` / `Med Auto Patent` 的定义与 onboarding 路径推进
- `Award Ops` 继续作为 `Award Foundry` / `Med Auto Award` 的定义与 onboarding 路径推进
- `Thesis Ops` 继续作为 `Thesis Foundry` / `Med Auto Thesis` 的定义与 onboarding 路径推进
- `Review Ops` 继续作为 `Review Foundry` / `Med Auto Review` 的定义与 onboarding 路径推进

## 历史记录与参考入口

历史 activation package、gateway/federation material、phase freeze、convergence board 与 migration trace 继续留在 `docs/references/` 与 `docs/history/`。
根层 roadmap 只保留当前家族路线，以及活跃读者需要的阅读入口。

需要更深背景时，进入这些参考面：

- [OPL Candidate Domain Backlog](../references/domain-admission/opl-candidate-domain-backlog.zh-CN.md)
- [OPL Governance / Audit Operating Surface](../references/operating-governance/opl-governance-audit-operating-surface.zh-CN.md)
- [OPL Publish / Promotion Operating Surface](../references/operating-governance/opl-publish-promotion-operating-surface.zh-CN.md)
- [生态四仓统一状态总表](../references/convergence-governance/ecosystem-status-matrix.md)
- [Runtime Substrate 历史归档](../history/runtime-substrate/README.zh-CN.md)
- 只有明确需要 provenance 或 diagnostic 时，才进入 `docs/history/compatibility/` 下的 Legacy Gateway/Federation archive

## 判断标准

这份路线图健康时，读者会立刻理解：

- `OPL` 是整个 family 的 stage-led framework owner，并以 Agent executor 为最小执行单位，持有 activation、stage attempt、queue/wakeup、receipt、recovery、projection 与 shared modules / contracts / indexes
- admitted domain 在这个壳层之下继续持有各自 authority
- 默认 executor 仍是 `Codex CLI`，`OPL Runtime Manager` 是已配置 family runtime provider 之上的产品控制面
- Temporal production provider 已有最小可验证闭环：workflow/activity/signal/query、worker lifecycle contract、typed closeout ingestion、fail-closed readiness、`stage_attempt_workbench` 投影，以及 repo-native Temporal test server + real worker residency proof；外部 production service / managed worker 的 `--production` proof 入口已 fail-closed 落地，真实 domain soak 仍是下一阶段验收
- MAS paper-line read-only closeout proof 已落地；provider-hosted guarded apply 和长时 MAS owner-chain proof 仍是下一步 production-closure gate
- 旧 `OPL Gateway`、`opl web`、`Product API`、Hermes default、local-manager 与 AionUI-first-shell 材料，除非被当前核心文档重新提升，否则按 provenance、diagnostic、history 或 fixture context 阅读
- 未来 hosted / desktop 工作继续沿同一套 runtime / activation truth 演进
- 新工作线会以边界清楚的 domain surface 进入家族体系
