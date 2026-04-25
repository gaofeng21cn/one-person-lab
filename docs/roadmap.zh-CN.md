[English](./roadmap.md) | **中文**

# OPL 路线图

## 当前角色

`OPL` 是 one-person research lab 的顶层 gateway 与 federation 模型。
当前路线图服务家族级控制语言、产品入口与 admitted-domain 协同，domain truth 继续由各个 domain 仓直接持有。

今天的公开 `OPL` 表面已经收口到这几层：

- 稳定的 `TypeScript CLI`-first gateway contract 基线
- 本地 `opl` shell / TUI 作为默认前台入口
- `opl web` pilot 与 `Product API` projection surface
- `AionUI` 作为第一外部壳目标
- `MedAutoScience`、`MedAutoGrant`、`RedCube AI` 三个 admitted domain 的显式 federation

## 活跃路线

当前活跃路线收口为：

`ACP-native session runtime -> local opl shell / TUI -> AionUI first-shell cutover -> hosted / online projection`

这条路线现在聚焦四件事：

1. 保持 `OPL Gateway -> domain gateway -> domain harness` 作为稳定控制语言。
2. 把 `OPL` 的 canonical truth 收口到 family-level session runtime，而不是 API 或 GUI 壳。
3. 先把本地 `opl` shell / TUI 跑成一等入口，再让 `AionUI` 作为第一外部壳验证同一条 runtime。
4. 保持 public docs、contracts 与 admitted-domain wording 持续对齐真实家族拓扑。

## 近期重点

- 保持 gateway / federation wording 冻结，同时把 session-runtime-first 语义写成主线
- 保持 `Unified Harness Engineering Substrate`、`Shared Runtime Contract` 与 `Shared Domain Contract` 作为 domain 之上的共享边界
- 保持 upstream `Hermes-Agent` external-kernel ownership 的诚实表达
- 保持未来 hosted / desktop 入口继续围绕当前 runtime truth 演进
- 保持 candidate domain 沿定义、审查与 onboarding 路径推进

## 家族形态

当前家族形态已经足够清楚，可以直接指导路线图：

- `MedAutoScience` 持有 `Research Ops` domain gateway 与 harness
- `MedAutoGrant` 持有 admitted 的 `Grant Ops` domain gateway 与 harness
- `RedCube AI` 持有视觉交付 domain gateway 与 harness
- `ppt_deck` 继续是当前最直接映射到 `Presentation Ops` 的 family
- `IP Ops` 继续作为 `IP Foundry` / `Med Auto Patent` 的定义与 onboarding 路径推进
- `Award Ops` 继续作为 `Award Foundry` / `Med Auto Award` 的定义与 onboarding 路径推进
- `Thesis Ops` 继续作为 `Thesis Foundry` / `Med Auto Thesis` 的定义与 onboarding 路径推进
- `Review Ops` 继续作为 `Review Foundry` / `Med Auto Review` 的定义与 onboarding 路径推进

## 历史记录与参考入口

历史 activation package、phase freeze、convergence board 与 migration trace 继续留在 `docs/references/` 与 `docs/history/`。
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

- `OPL` 是整个 family 的顶层产品与 gateway language
- admitted domain 在这个壳层之下继续持有各自 authority
- 当前活跃前台是本地 `opl` shell / TUI，`AionUI` 是第一外部壳目标，`opl web` / `Product API` 是 projection surface
- 未来 hosted / desktop 工作继续沿同一套 runtime truth 演进
- 新工作线会以边界清楚的 domain surface 进入家族体系
