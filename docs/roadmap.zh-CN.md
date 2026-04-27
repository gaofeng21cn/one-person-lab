[English](./roadmap.md) | **中文**

# OPL 路线图

## 当前角色

`OPL` 是 one-person research lab 的 Codex-default session/runtime 层、显式 activation 层，以及 family-level shared modules / contracts / indexes 的归属层。
当前路线图服务家族级边界语言、产品入口与 admitted-domain 协同，domain truth 继续由各个 domain 仓直接持有。

今天的公开 `OPL` 表面已经收口到这几层：

- `Codex CLI` 作为 `opl`、`opl exec` 与 `opl resume` 的默认 executor 路径
- 显式 `OPL` activation 承担 family-level 语义、domain discovery 与 runtime switch
- `MedAutoScience`、`MedAutoGrant`、`RedCube AI` 之上的 shared modules、contracts 与 indexes
- `OPL Runtime Manager` 作为 external `Hermes-Agent` 之上的 product-managed 薄 adapter
- Rust native helper / index 工作只承担 native assistance 与 indexed discovery，不持有 domain truth 或 executor ownership

## 活跃路线

当前活跃路线收口为：

`Codex-default session/runtime -> explicit OPL activation -> selected domain agent entry -> optional product-managed runtime adapter`

这条路线现在聚焦四件事：

1. 保持 `Codex CLI` 作为默认 executor，除非用户显式 activation 到其他 runtime。
2. 把 `OPL` 的当前 truth surface 收口到 family-level sessions、progress、artifacts 与 shared indexes，而不是 web / API 壳。
3. 把 `OPL Runtime Manager` 理解成 external `Hermes-Agent` 之上的薄 adapter，不写成 scheduler、session store、memory owner、domain truth owner 或 concrete executor owner。
4. 保持 public docs、contracts 与 admitted-domain wording 持续对齐真实家族拓扑。

## 近期重点

- 保持旧 gateway / federation wording 只作为 compatibility / reference material，同时把 runtime / activation 语义写成主线
- 保持 `Unified Harness Engineering Substrate`、`Shared Runtime Contract` 与 `Shared Domain Contract` 作为 domain 之上的共享边界
- 保持 upstream `Hermes-Agent` external-kernel ownership 以及 `OPL Runtime Manager` product-managed adapter 语义的诚实表达
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

- [OPL Gateway 落地路线](./references/opl-gateway-rollout.zh-CN.md)
- [OPL Candidate Domain Backlog](./references/opl-candidate-domain-backlog.zh-CN.md)
- [OPL Gateway Acceptance Test Spec](./references/opl-gateway-acceptance-test-spec.zh-CN.md)
- [OPL Governance / Audit Operating Surface](./references/opl-governance-audit-operating-surface.zh-CN.md)
- [OPL Publish / Promotion Operating Surface](./references/opl-publish-promotion-operating-surface.zh-CN.md)
- [生态四仓统一状态总表](./references/ecosystem-status-matrix.md)
- [OPL 垂类在线 Agent 平台演进蓝图](./references/opl-vertical-online-agent-platform-roadmap.md)
- [OPL Gateway Example Corpus](./references/opl-gateway-example-corpus.zh-CN.md)

## 判断标准

这份路线图健康时，读者会立刻理解：

- `OPL` 是整个 family 的 Codex-default session/runtime 层、显式 activation 层，以及 shared modules / contracts / indexes owner
- admitted domain 在这个壳层之下继续持有各自 authority
- 默认 executor 仍是 `Codex CLI`，`OPL Runtime Manager` 只作为 external `Hermes-Agent` 之上的 product-managed 薄 adapter
- 旧 `OPL Gateway`、`opl web`、`Product API` 与 AionUI-first-shell 材料，除非被当前核心文档重新提升，否则按 compatibility 或 reference context 阅读
- 未来 hosted / desktop 工作继续沿同一套 runtime / activation truth 演进
- 新工作线会以边界清楚的 domain surface 进入家族体系
