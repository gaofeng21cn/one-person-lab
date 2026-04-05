<p align="center">
  <img src="assets/branding/opl-banner.svg" alt="One Person Lab banner" width="100%" />
</p>

<p align="center">
  <a href="./README.md">English</a> | <a href="./README.zh-CN.md"><strong>中文</strong></a>
</p>

<h1 align="center">One Person Lab</h1>

<p align="center"><strong>面向一人课题组、统领各 domain system 的顶层 Gateway</strong></p>
<p align="center">任务版图 · 共享基础结构 · Gateway Federation</p>

<table>
  <tr>
    <td width="33%" valign="top">
      <strong>适用对象</strong><br/>
      研究型个人、PI 与小型课题组
    </td>
    <td width="33%" valign="top">
      <strong>产品角色</strong><br/>
      定义 OPL Gateway、任务语义，以及跨 domain 共享基础结构
    </td>
    <td width="33%" valign="top">
      <strong>联邦状态</strong><br/>
      <code>MedAutoScience</code> 是当前 Active 的 Research Ops surface；<code>RedCube AI</code> 是当前 Emerging 的视觉交付 surface
    </td>
  </tr>
</table>

<p align="center">
  <strong>OPL 总体结构</strong>
</p>

<table>
  <tr>
    <td colspan="5" align="center" valign="top">
      <strong>One Person Lab (OPL)</strong><br/>
      顶层 Gateway 与 federation surface
    </td>
  </tr>
  <tr>
    <td colspan="5" align="center" valign="top">
      <strong>共享基础结构</strong>
    </td>
  </tr>
  <tr>
    <td width="20%" valign="top">
      <strong>资产层</strong><br/>
      数据、文献、模板与交付资产
    </td>
    <td width="20%" valign="top">
      <strong>记忆层</strong><br/>
      选题记忆、评审记忆与场景偏好
    </td>
    <td width="20%" valign="top">
      <strong>治理层</strong><br/>
      继续、停止、改题与门控
    </td>
    <td width="20%" valign="top">
      <strong>交付层</strong><br/>
      审核面、同步规则与正式输出
    </td>
    <td width="20%" valign="top">
      <strong>智能体执行层</strong><br/>
      稳定接口、运行监控与审计回写
    </td>
  </tr>
  <tr>
    <td colspan="5" align="center" valign="top">
      <strong>核心工作流</strong>
    </td>
  </tr>
  <tr>
    <td width="20%" valign="top">
      <strong>Research Ops</strong><br/>
      从数据到论文
    </td>
    <td width="20%" valign="top">
      <strong>Grant Ops</strong><br/>
      基金申请与评审
    </td>
    <td width="20%" valign="top">
      <strong>Thesis Ops</strong><br/>
      学位论文与答辩
    </td>
    <td width="20%" valign="top">
      <strong>Review Ops</strong><br/>
      审稿、回复与修回
    </td>
    <td width="20%" valign="top">
      <strong>Presentation Ops</strong><br/>
      讲课、汇报与答辩材料
    </td>
  </tr>
  <tr>
    <td colspan="5" align="center" valign="top">
      <strong>当前 Domain Carrier</strong>
    </td>
  </tr>
  <tr>
    <td width="20%" valign="top">
      <strong>Research Ops</strong><br/>
      <code>Active</code><br/>
      由 <code>MedAutoScience</code> 承接
    </td>
    <td width="20%" valign="top">
      <strong>Grant Ops</strong><br/>
      <code>Planned</code>
    </td>
    <td width="20%" valign="top">
      <strong>Thesis Ops</strong><br/>
      <code>Planned</code>
    </td>
    <td width="20%" valign="top">
      <strong>Review Ops</strong><br/>
      <code>Planned</code>
    </td>
    <td width="20%" valign="top">
      <strong>Presentation Ops</strong><br/>
      <code>Emerging</code><br/>
      由 <code>RedCube AI</code> 和其 <code>ppt_deck</code> family 先行承接
    </td>
  </tr>
  <tr>
    <td colspan="5" align="center" valign="top">
      <strong>公开入口</strong>
    </td>
  </tr>
  <tr>
    <td width="20%" valign="top">
      <strong>OPL</strong><br/>
      当前仓库<br/>
      顶层 Gateway 的权威公开说明面
    </td>
    <td width="20%" valign="top">
      <strong>MedAutoScience</strong><br/>
      <a href="https://github.com/gaofeng21cn/med-autoscience"><code>仓库</code></a><br/>
      Research Ops domain gateway 与 harness
    </td>
    <td width="20%" valign="top">
      <strong>FengGaoLab</strong><br/>
      <a href="https://fenggaolab.org"><code>网站</code></a><br/>
      公开学术主页
    </td>
    <td width="20%" valign="top">
      <strong>GitHub 主页</strong><br/>
      <a href="https://github.com/gaofeng21cn"><code>GitHub</code></a><br/>
      公开项目入口
    </td>
    <td width="20%" valign="top">
      <strong>RedCube AI</strong><br/>
      <a href="https://github.com/gaofeng21cn/redcube-ai"><code>仓库</code></a><br/>
      视觉交付 domain gateway 与 harness
    </td>
  </tr>
</table>

> `OPL` 是实验室顶层的公开 Gateway 语言。它联邦化地组织 `MedAutoScience`、`RedCube AI` 这类 domain system，而不是取代它们。

## Agent 合同分层

<!-- AGENT-CONTRACT-BASELINE:START -->
- 根目录 `AGENTS.md` 仅用于本仓库开发环境中的 Codex/OMX 协作，不单独承载项目真相合同
- 项目真相合同位于 `contracts/project-truth/AGENTS.md`
- OMX project-scope 编排层位于 `.codex/AGENTS.md`，只供 OMX / CODEX_HOME 会话加载
- 可选本机私有覆盖层约定为 `.omx/local/AGENTS.local.md`，保持未跟踪
- 本地工具运行态目录 `.omx/` 与 `.codex/` 必须保持未跟踪，不进入版本库
<!-- AGENT-CONTRACT-BASELINE:END -->

## 仓库定位

`One Person Lab`，简称 `OPL`，面向的不是某一个任务或某一个 domain runtime，而是“一人课题组”这个工作对象的顶层组织面。

在架构层面，`OPL` 负责四件事：

- 定义实验室级任务版图
- 定义多个工作流共享的基础层
- 定义把任务路由到正确 domain surface 的 gateway 语义
- 定义当前由哪些 domain gateway 正式承接各工作流

因此，这个仓库承担的是 `OPL Gateway` 的文档优先、契约优先的公开说明面，而不是声称所有运行时能力已经都落在这里。

## 对外一句话理解

对外部读者来说，最简单的理解是：

- 它是“一人课题组如何使用多个 domain system 持续工作”的顶层产品面
- 它定义工作流如何映射到具体 domain system
- 它冻结跨 domain 语义，同时保留每个 domain 独立可用

## 为什么是 Gateway Federation

同一批数据、文献、图表和判断，会在这些任务之间反复复用：

- 研究推进与论文交付
- 基金申请与基金评审
- 学位论文写作与答辩准备
- 审稿、回复和修回
- 讲课、汇报和答辩材料

如果把这些任务拆成彼此孤立的产品，就会重复维护上下文，难以沉淀共享记忆、治理与审核面。

如果又把它们强行压成一个单体 runtime，domain 边界会变糊，后续维护也会变差。

所以更合理的理解是：

- `OPL` 掌握顶层任务语义与共享基础结构
- 每个工作流保留独立的 domain gateway
- 每个 domain gateway 再由自己的 harness 驱动

## 顶层控制链

理想主链应是：

```text
Human / Agent
  -> OPL Gateway
      -> Domain Gateway
          -> Domain Harness OS
              -> Review Surfaces / Deliveries / Audit Truth
```

当前已映射的主线：

- `Research Ops` -> `MedAutoScience`
- `Presentation Ops` -> `RedCube AI` 里的 `ppt_deck`

关键边界：

- `RedCube AI` 不是整个 `Presentation Ops`
- `xiaohongshu` 与 `ppt_deck` 共享同一 harness，但在 OPL 顶层不应直接等同于 `Presentation Ops`
- 未来 `Grant Ops`、`Review Ops`、`Thesis Ops` 也应保留独立 domain 边界，而不是被压进一个单体系统

## 当前 Domain Surface

### MedAutoScience

[`MedAutoScience`](https://github.com/gaofeng21cn/med-autoscience) 是 `OPL` 体系下当前 Active 的 `Research Ops` domain gateway。

它当前承担的是：

- 医学 Research Ops 的正式入口
- 研究工作流的 domain-specific 治理与交付面
- 其 research harness 与受控 runtime 之上的顶层控制面

### RedCube AI

[`RedCube AI`](https://github.com/gaofeng21cn/redcube-ai) 是 `OPL` 体系下当前 Emerging 的视觉交付 domain gateway。

它的正确边界是：

- 视觉交付物的 domain gateway
- 通过 `ppt_deck` 最直接承接 `Presentation Ops` 的 harness surface
- 同时可以承载不与 `Presentation Ops` 完全等同的其他视觉 family

## 当前边界

这个仓库不应被写成：

- 所有 runtime 行为都已经落在这里
- `MedAutoScience` 或 `RedCube AI` 的替代品
- 所有 domain workstream 的同义词
- 所有 planned workstream 已经完成的证明

它应被写成：

- `OPL Gateway` 的权威公开说明面
- 跨 domain 边界先冻结的地方
- 外部读者理解 federation 如何拼起来的入口

## 路线图

当前阶段有四个重点：

- 冻结 `OPL Gateway` 与 domain federation 的表述
- 继续把 `MedAutoScience` 明确为 `Research Ops` 的 domain gateway 与 harness
- 继续把 `RedCube AI` 明确为视觉交付的 domain gateway 与 harness
- 逐步定义 `Grant Ops`、`Review Ops`、`Thesis Ops` 的边界

更细的阶段说明见：

- [OPL 路线图](docs/roadmap.zh-CN.md)
- [OPL Gateway 落地路线](docs/opl-gateway-rollout.zh-CN.md)

## 延伸阅读

- [Gateway Federation](docs/gateway-federation.zh-CN.md)
- [OPL Federation Contract](docs/opl-federation-contract.zh-CN.md)
- [OPL Gateway Contracts](contracts/opl-gateway/README.zh-CN.md)
- [OPL 只读 Discovery Gateway](docs/opl-read-only-discovery-gateway.zh-CN.md)
- [OPL Routed Action Gateway](docs/opl-routed-action-gateway.zh-CN.md)
- [OPL Domain Onboarding Contract](docs/opl-domain-onboarding-contract.zh-CN.md)
- [OPL Gateway Acceptance Test Spec](docs/opl-gateway-acceptance-test-spec.zh-CN.md)
- [OPL Governance / Audit Operating Surface](docs/opl-governance-audit-operating-surface.zh-CN.md)
- [OPL Publish / Promotion Operating Surface](docs/opl-publish-promotion-operating-surface.zh-CN.md)
- [OPL Gateway 落地路线](docs/opl-gateway-rollout.zh-CN.md)
- [OPL 运行模型](docs/operating-model.zh-CN.md)
- [OPL 任务版图](docs/task-map.zh-CN.md)
- [共享基础结构](docs/shared-foundation.zh-CN.md)
- [OPL 路线图](docs/roadmap.zh-CN.md)
