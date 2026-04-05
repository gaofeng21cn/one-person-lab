[English](./shared-foundation.md) | **中文**

# 共享基础结构

`OPL` 之所以能把多个工作流纳入同一体系，不只是因为它们都能让 Agent 参与，而是因为它们通过 federation model 复用同一套基础层。

共享基础结构不等于单体 runtime。
它的含义是：不同 domain gateway 必须使用兼容的资产、记忆、治理、交付与执行语言。
这种兼容性并不让 `OPL` 自动变成所有共享对象的 canonical truth store；canonical truth 仍然留在 domain-owned surface，或留在尚未进入 formal domain admission 的 human/private 材料里。

## 资产层

`资产层` 承载会被多个工作流反复消费的对象：

- 数据资产
- 文献与参考资料
- 图表与模板
- 已完成的正式交付物

如果没有这一层，每个工作流都会复制自己的事实底座。

## 记忆层

`记忆层` 承载不应只停留在即时会话中的结构化判断：

- 选题记忆
- 数据问题映射
- 期刊偏好
- 基金方偏好
- 评审经验
- 教学素材结构

它的目的不是保存所有对话，而是保存可复用判断。

## 治理层

`治理层` 回答的是：什么时候允许继续，什么时候应该停下来。

它覆盖：

- continue / stop gate
- 证据是否充足
- 是否需要改题或改路线
- 何时允许进入正式交付

没有这一层，执行过程就会失去明确控制。

## 交付层

`交付层` 把过程性产物收束为正式输出。

它定义：

- 哪些文件构成交付包
- 人类应该审核哪些表面
- 上游资产如何同步到下游正式材料

不同工作流的交付协议可以不同，但交付层本身必须存在。

## 智能体执行层

`智能体执行层` 让 Agent 成为可控执行者，而不是自由漂移的聊天接口。

它关注：

- 稳定入口
- route / controller
- 运行监控
- 审计回写

这一层不是为了拿掉人类，而是为了让人类只看关键输出，不必盯住底层执行细节。

## 联邦消费方式

在理想的 `OPL` 结构里：

- `OPL Gateway` 负责声明共享基础结构语言
- 每个 `domain gateway` 把这套语言水化到自己的工作流
- 每个 `domain harness` 再按 domain 规则执行、落盘、审计与交付

这就是为什么共享基础结构应位于任何单一 domain 仓库之上。

## 当前已经清楚的部分

今天，`Research Ops` 上这五层最清楚的具象化是：

- `MedAutoScience` 作为 active 的 research domain gateway 与 harness

视觉交付上最清楚的 emerging 具象化是：

- `RedCube AI` 作为视觉交付 domain gateway 与 harness，其中 `ppt_deck` 是最直接映射到 `Presentation Ops` 的 family

也正因为如此，`OPL` 已经不只是概念层。
它已经有一个 active 的 domain surface，和一个正在收敛的第二 surface。

## 延伸阅读

- [共享基础结构归属](./shared-foundation-ownership.zh-CN.md)
