[English](./shared-foundation-ownership.md) | **中文**

# 共享基础结构归属

## 目的

这份文档用来澄清：在 `OPL` 里，`Shared Foundation` 到底由谁管理。

它要解决一个反复出现的歧义：

- `OPL` 的确负责定义 shared foundation 的顶层语言
- 但这不等于 `OPL` 自动成为所有共享对象的单一 runtime truth store

这是一份归属与边界文档。
它不是新的执行 surface，也不是新的 domain admission contract。

## 核心判断

正确分工是：

- `OPL` 负责 shared-foundation 对象的顶层语义、索引、身份和跨域复用规则
- 各 `domain gateway` 与 `domain harness` 负责 domain-local 对象的 canonical truth、mutation、审计回写与交付真相
- 人类或私有 workspace 仍然可以持有尚未正式进入 domain truth 的源材料

所以，“shared foundation 被统一管理”更准确的意思是：

- 在顶层控制语言层面被统一治理

而不是：

- 在顶层被统一 mutation
- 在顶层被统一 version 成为唯一真相
- 在顶层取代各 domain 自己的 truth store

## Ownership Layers

### `OPL` 负责

在顶层，`OPL` 可以负责：

- 共享对象类别与命名规则
- 顶层标识符与引用形状
- shared asset / memory 的分类
- 跨 domain 的复用预期
- 帮助人类与 Agent 发现可复用对象的 index / catalog surface
- 允许哪些对象被带入 domain 的 handoff expectation

### `Domain gateway + harness` 负责

每个 domain 仍然负责：

- 该工作流内部的 canonical object truth
- domain-local 的 mutation 与版本历史
- runtime writeback 与审计轨迹
- domain-specific 的 review truth
- domain-specific 的 delivery truth

### `Human / private workspace` 可以负责

并不是所有有价值的共享对象都应立刻变成 domain truth。
人类或私有 workspace 仍可以持有：

- 私有笔记
- 尚未进入正式工作流的源文件
- 私有参考资料集合
- 尚未进入正式 domain governance 的草稿材料

## 资产层归属拆分

| 对象类型 | `OPL` 负责 | Domain 负责 | Human/private 可负责 | 默认不应上收到 `OPL` 的部分 |
| --- | --- | --- | --- | --- |
| `data assets` | 顶层身份、分类、引用形状、跨域复用规则 | canonical dataset、study 派生产物、mutation 历史、audit truth | 原始导出、暂存文件、未收录材料 | canonical runtime data truth |
| `references` | shared reference 分类、可复用顶层 reference index、跨域引用语义 | study-local 使用、domain-local 标注、证据组织上下文 | 私有阅读清单、批注、预备资料 | domain-specific evidence truth |
| `templates` | shared template 类型、顶层模板身份、可复用跨域模板索引 | domain 内实例化与 workflow-local 改造 | 正式采用前的草稿模板 | domain 内模板执行 ownership |
| `delivery assets` | 顶层 discoverability、跨域关系提示、delivery-kind 语义 | 正式交付 truth、导出物、submission/publish artifact、reviewable output | 进入正式交付前的草稿文件 | 最终 delivery truth 或 release ownership |

## 记忆层归属拆分

| 记忆类型 | `OPL` 负责 | Domain 负责 | Human/private 可负责 | 默认不应上收到 `OPL` 的部分 |
| --- | --- | --- | --- | --- |
| `topic memory` | 可复用顶层 topic identity、跨工作流 topic index、稳定 topic vocabulary | 绑定 study、run、deliverable 的 domain-local 证据链 | 探索期笔记与早期 framing | domain-local evidence truth |
| `review memory` | 仅在 discoverability 需要时提供跨域 summary / index 语言 | 完整 review history、review state、review decision、domain-specific review writeback | 私有评审笔记、临时批注 | canonical review truth |
| `venue memory` | 最适合做顶层 shared index 与可复用语义 | 绑定具体 work product 的 domain-local venue fit 判断 | 尚未 formalize 的个人偏好笔记 | domain-specific submission truth |

## 与 Domain Gateway 的整合方式

理想流程是：

1. 人类或 Agent 从 `OPL` 顶层发起请求。
2. `OPL` 先在语义层 / 索引层识别哪些 shared-foundation 对象相关。
3. `OPL` 把请求路由到正确的 `domain gateway`，并带过去的是引用，不是顶层 truth 替换。
4. 目标 domain 再去解析自己真正拥有的具体对象。
5. 该 domain 把自己的 runtime truth、review truth 与 delivery truth 写回到 domain-owned surface。
6. `OPL` 可以保留顶层引用、摘要或可审计的 routing signal，但不接管 domain 的 canonical object truth。

例如：

- `OPL` 可以知道一份研究稿件、一个图表包、一个 venue-preference memory 与某个 presentation 请求有关
- 但一旦任务进入 `Presentation Ops`，视觉交付 truth 仍由 `RedCube AI` 持有
- 而上游稿件与研究图表的 research asset truth 仍由 `MedAutoScience` 持有

## 与未来 Shared Index 的关系

当前路线图已经允许未来出现：

- shared asset index
- shared memory index

如果后续真的新增这些 surface，默认解释仍应是：

- index-first
- 除非后续有显式新合同，否则保持 reference-only
- 绝不自动把 canonical truth 从 domain 转移到 `OPL`

这意味着：未来 shared index 可以提升 discoverability 和 reuse，但它仍不应变成：

- 唯一 truth registry
- domain asset 的 mutation owner
- domain review state 的 review owner
- domain deliverable 的 publish / release owner

### 进入当前 public surface 之前的 readiness 条件

未来的 `shared asset index` 或 `shared memory index`，在后续显式合同至少冻结下面这些条件之前，不应出现在当前 `OPL` public surface 里：

- 它究竟允许覆盖哪些 object class 与 identifier
- 每类被索引对象的 owner split 与 governing refs
- reference-only / non-executing 的 control mode
- 显式禁止 truth shift、mutation ownership 转移，以及 review/publication takeover
- public-surface index、supporting boundary surfaces 与 acceptance spec 上的 review / acceptance coverage

在这些 readiness 条件冻结之前，任何 shared-index 提法都只能停留在 roadmap level。
它不是当前 public-entry surface，不是 routed surface，不是 execution surface，也不是 truth-owner surface。

## 非目标与反回归规则

这套 ownership model 不允许：

- 把 `OPL` 做成 shared foundation 的单体 runtime
- 把 `OPL` 做成所有 asset / memory 的单一 truth store
- 把 domain-owned review truth、runtime truth 或 publication truth 上收给 `OPL`
- 让 `shared asset index` 变成 mutation owner
- 让 `shared memory index` 取代 domain review 或 workspace 证据
- 把 `MedAutoScience` 或 `RedCube AI` 降格成 `OPL` 下面的私有实现细节
- 因为顶层 shared object 存在，就绕过 domain gateway

## 当前阶段的实际解读

在当前仓库阶段：

- shared foundation 主要还是以顶层语言与边界文档的形式被冻结
- 当前仓库还没有 materialize 出完整的 shared asset index 或 shared memory index
- 但这不意味着 ownership split 还没定义

所以当前更准确的解读应是：

- `OPL` 已经拥有 shared-foundation 的控制语言
- 各 domain 已经拥有各自的具体 truth surface
- 如果未来增加 shared index，也必须继续服从这套分工，除非后续有新的显式合同重新定义

## 配套 Closeout

- [Shared-Foundation Ownership / Readiness Closeout](./opl-shared-foundation-ownership-readiness-closeout.zh-CN.md)
