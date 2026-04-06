[English](./roadmap.md) | **中文**

# OPL 路线图

## 当前阶段

当前阶段的重点，不是同时启动所有工作流。
而是先冻结 `OPL Gateway` 语言，并把已经真实存在的 domain federation 站稳。

当前已明确的状态：

- `OPL` 是一人课题组的顶层 Gateway 与 federation model
- [`MedAutoScience`](https://github.com/gaofeng21cn/med-autoscience) 是当前 active 的 `Research Ops` domain gateway 与 harness
- [`RedCube AI`](https://github.com/gaofeng21cn/redcube-ai) 是当前 emerging 的视觉交付 domain gateway 与 harness
- `ppt_deck` 是当前最直接映射到 `Presentation Ops` 的 family
- `Grant Ops`、`Thesis Ops`、`Review Ops` 仍处于定义阶段
- `OPL` 顶层的统一目标执行范式是 `Agent-first`，并让 `Auto` 与 `Human-in-the-loop` 运行在同一套基座上；这是一条架构原则，不代表所有 domain surface 已经完成双模式落地

当前阶段不做的事：

- 把所有工作流压进一个 runtime
- 把 domain 项目写成整个 `OPL`
- 把 `OPL` 继续只写成静态蓝图
- 把 planned 的工作流包装成已经实现

## 下一阶段

下一阶段应优先做这些事：

- 冻结 `OPL Gateway -> domain gateway -> domain harness` 这条控制语言
- 保持 `MedAutoScience` 明确为 `Research Ops` 的 domain surface
- 保持 `RedCube AI` 明确为视觉交付的 domain surface
- 把 `Agent-first` 加双模执行这套原则带入后续候选 domain 的定义，而不是逐步漂移成 fixed-code-first 的产品线
- 用清楚的任务边界与交付对象定义下一个候选 domain，并优先沿用当前 `task-topology + candidate-domain-backlog + domain-onboarding` 这条路径，而不是发明一层冗余中间控制面
- 逐步把 `OPL Gateway` 从文档优先表面推进成真实入口

在仍处于定义阶段的几个工作流里，更自然的优先顺序通常是：

- `Grant Ops`
- `Review Ops`
- `Thesis Ops`

这个优先顺序只表示边界定义的先后，不代表 `Grant Ops` 已经变成 `G2` discovery target 或 `G3` routed-action target；在对应 domain-onboarding evidence 出现前，它仍然不是这两类 target。

## 更后续阶段

只有当至少两个 domain surface 真正稳定后，`OPL` 才适合进入更完整的生态表达阶段，例如：

- 更正式的跨 domain 状态维护
- 更强的顶层 gateway 公共入口
- 更清楚的跨 domain 共享协议

进入这一阶段的前提不是“想法很多”，而是“多个 domain surface 边界已经独立清楚”。

关于 gateway 如何逐步落地成真实入口，详见：

- [OPL Gateway 落地路线](opl-gateway-rollout.zh-CN.md)
- [OPL Federation Contract](opl-federation-contract.zh-CN.md)
- [OPL Public Surface Index](opl-public-surface-index.zh-CN.md)
- [OPL Gateway Contracts](../contracts/opl-gateway/README.zh-CN.md)
- [OPL Routed Action Gateway](opl-routed-action-gateway.zh-CN.md)
- [OPL Domain Onboarding Contract](opl-domain-onboarding-contract.zh-CN.md)
- [OPL Candidate Domain Backlog](opl-candidate-domain-backlog.zh-CN.md)
- [OPL Gateway Acceptance Test Spec](opl-gateway-acceptance-test-spec.zh-CN.md)
- [OPL Governance / Audit Operating Surface](opl-governance-audit-operating-surface.zh-CN.md)
- [OPL Publish / Promotion Operating Surface](opl-publish-promotion-operating-surface.zh-CN.md)

如果要查看这些已冻结 layers 如何以 contract-level composition 的方式拼起来，可参考 [OPL Gateway Example Corpus](opl-gateway-example-corpus.zh-CN.md)。

## 当前判断标准

如果要判断 `OPL` 是否在向正确方向推进，可以看这些问题：

- 外界是否能理解 `OPL` 是顶层产品与 gateway 语言，而不只是静态蓝图？
- 外界是否能理解 `OPL` 不是单体 runtime？
- 外界是否能理解 `MedAutoScience` 仍是独立的 `Research Ops` domain gateway 与 harness？
- 外界是否能理解 `RedCube AI` 仍是独立的视觉交付 domain gateway 与 harness？
- 外界是否能理解 `ppt_deck` 直接映射 `Presentation Ops`，而 `xiaohongshu` 不自动等于 `Presentation Ops`？
- 新工作流是否正被定义成 domain surface，而不是零散 feature？
