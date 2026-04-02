<p align="center">
  <img src="assets/branding/opl-banner.svg" alt="One Person Lab banner" width="100%" />
</p>

<p align="center">
  <a href="./README.md">English</a> | <a href="./README.zh-CN.md"><strong>中文</strong></a>
</p>

<h1 align="center">One Person Lab</h1>

<p align="center"><strong>面向一人课题组正式工作体系的顶层说明</strong></p>
<p align="center">任务版图 · 共享基础结构 · 工作流状态</p>

<table>
  <tr>
    <td width="33%" valign="top">
      <strong>适用对象</strong><br/>
      研究型个人、PI 与小型课题组
    </td>
    <td width="33%" valign="top">
      <strong>说明范围</strong><br/>
      研究、写作、评审、答辩与教学等正式任务面
    </td>
    <td width="33%" valign="top">
      <strong>当前参考实现面</strong><br/>
      顶层总集；<code>MedAutoScience</code> 为当前已成形实现面
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
      面向一人课题组的顶层蓝图
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
      <strong>当前已成形工作流</strong><br/>
      <a href="https://github.com/gaofeng21cn/med-autoscience"><code>MedAutoScience</code></a>
    </td>
  </tr>
  <tr>
    <td colspan="5" align="center" valign="top">
      <strong>工作流状态</strong>
    </td>
  </tr>
  <tr>
    <td width="20%" valign="top">
      <strong>Research Ops</strong><br/>
      <code>Active</code><br/>
      由 <code>MedAutoScience</code> 实现
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
      <code>Planned</code>
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
      顶层总集
    </td>
    <td width="20%" valign="top">
      <strong>MedAutoScience</strong><br/>
      <a href="https://github.com/gaofeng21cn/med-autoscience"><code>仓库</code></a><br/>
      当前已成形的研究主线实现
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
      <strong>后续方向</strong><br/>
      <code>Grant / Review / Thesis / Presentation</code><br/>
      后续拓展面
    </td>
  </tr>
</table>

> 本仓库用于说明 `OPL` 的任务版图、共享基础结构与各任务面的关系；它不是统一运行时入口，也不是单一产品仓库。

## 仓库定位

`One Person Lab`，简称 `OPL`，面向的不是某一个具体任务，而是“一人课题组”这个工作对象。

这里所说的一人课题组，指的是研究型个人或极小团队，在 `Agent` 协助下持续承担正式科研工作，并保留清楚的人类审核面。`OPL` 关注的是这类工作的组织方式，而不是单个任务的临时自动化。

从这个角度看，`OPL` 的职责是：

- 定义实验室级任务版图
- 说明不同任务共享什么基础层
- 标明当前已经形成实现面的工作流，以及仍在定义中的后续方向

本仓库本身不承担运行时角色，也不直接充当单个工作流的入口仓库。

## 为什么采用顶层总集形式

研究型个人或小型课题组实际承担的工作，通常不止论文生产。

同一批数据、文献、图表和研究判断，会在这些任务之间反复复用：

- 研究推进与论文交付
- 基金申请与基金评审
- 学位论文写作与答辩准备
- 审稿、回复和修回
- 讲课、汇报和答辩材料

如果这些任务被分别实现为彼此孤立的工具链，就会重复维护上下文、重复组织材料，也很难沉淀共享记忆和统一审核面。

因此，`OPL` 采用的是“顶层总集 + 工作流状态 + 共享底座”的组织方式，而不是在单个产品仓库中持续叠加异质功能。

## 当前公开实践与适用范围

当前最成熟的公开实践首先形成于医学研究场景，因为最先成形的工作流正是在这一环境中发展出来的。

这个参考实现就是 [`MedAutoScience`](https://github.com/gaofeng21cn/med-autoscience)，它聚焦医学自动科研主线，从数据治理推进到论文与投稿交付。

但 `OPL` 的组织方式并不限于医学，也可以由其他学科领域的 `PI` 按各自研究对象加以扩展。

## 核心工作流

`OPL` 当前把核心任务版图划分为五类并列工作流：

- `Research Ops`
  从数据治理、研究推进、证据组织到论文与投稿交付
- `Grant Ops`
  从基金方向判断、申请书组织到基金申请评审
- `Thesis Ops`
  从学位论文结构化写作到答辩准备
- `Review Ops`
  从审稿、评审到回复与修回组织
- `Presentation Ops`
  从讲课、组会到汇报和答辩幻灯片

这里的拆分是任务边界划分，不是产品数量承诺。

## 共享基础结构

`OPL` 当前把共享底座概括为五层：

| 层级 | 主要对象 | 作用 |
| --- | --- | --- |
| `资产层` | 数据、文献、模板、图表、交付物 | 提供跨任务复用的事实底座 |
| `记忆层` | 选题记忆、评审记忆、期刊与基金偏好 | 提供跨任务复用的结构化认知 |
| `治理层` | 门控、止损、改题、继续条件 | 决定何时允许进入正式执行 |
| `交付层` | 审核面、交付目录、同步与打包规则 | 把过程性产物收束为正式输出 |
| `智能体执行层` | 稳定接口、运行监控、审计回写 | 让 Agent 成为可控执行层 |

延伸阅读：

- [OPL 运行模型](docs/operating-model.zh-CN.md)
- [OPL 任务版图](docs/task-map.zh-CN.md)
- [共享基础结构](docs/shared-foundation.zh-CN.md)

## 当前工作流状态

| 工作流 / 实现面 | 负责什么 | 当前状态 |
| --- | --- | --- |
| [`MedAutoScience`](https://github.com/gaofeng21cn/med-autoscience) | 医学自动科研主线，从数据到论文交付 | Active |
| `Grant Ops` | 基金申请与基金评审工作流 | Planned |
| `Thesis Ops` | 学位论文与答辩工作流 | Planned |
| `Review Ops` | 审稿、评审与回复工作流 | Planned |
| `Presentation Ops` | 讲课、汇报与答辩材料工作流 | Planned |

`Planned` 表示这些任务面已经被纳入正式蓝图，但当前仍处于定义阶段，尚未形成独立、成熟的实现面。

## 当前已成形工作流：MedAutoScience

[`MedAutoScience`](https://github.com/gaofeng21cn/med-autoscience) 是 `OPL` 体系下当前已成形的研究主线实现。

它当前已经形成了较清楚的实现边界：

- 专病级 workspace 组织
- 数据资产治理
- 研究推进与运行监控
- 证据组织
- 论文与投稿交付

如果当前关注点是“如何把一批医学研究数据持续推进到论文级交付”，`MedAutoScience` 是当前最直接的实现面。

## 当前边界

当前这个仓库主要承担顶层说明职责，不承担以下角色：

- 不作为统一运行时入口
- 不作为所有任务的实现仓库
- 不把尚未成形的任务面包装成已完成产品

它的作用是让外部读者先理解总目标，再根据任务需要进入相应实现面。

## 路线图

当前阶段的重点是两件事：

- 继续推进 `MedAutoScience` 这个已经成形的研究主线实现
- 逐步把 `Grant Ops`、`Review Ops`、`Thesis Ops`、`Presentation Ops` 的任务边界和共享协议写清楚

更详细的阶段说明见：

- [OPL 路线图](docs/roadmap.zh-CN.md)

## 延伸阅读

- [OPL 运行模型](docs/operating-model.zh-CN.md)
- [OPL 任务版图](docs/task-map.zh-CN.md)
- [共享基础结构](docs/shared-foundation.zh-CN.md)
- [OPL 路线图](docs/roadmap.zh-CN.md)
