[English](./roadmap.md) | **中文**

# OPL 路线图

## 当前阶段

当前阶段的重点不是同时启动所有工作流，而是先把总蓝图和当前已成形的参考实现站稳。

当前已明确的状态：

- `OPL` 作为顶层总集，负责定义一人课题组的任务版图与共享底座
- [`MedAutoScience`](https://github.com/gaofeng21cn/med-autoscience) 已经是 `OPL` 体系下当前已成形的参考实现
- [`RedCube AI`](https://github.com/gaofeng21cn/redcube-ai) 已经成为 `Presentation Ops` 的 emerging 实现面，其中 `ppt_deck` 是当前最直接承接的 family
- `Grant Ops`、`Thesis Ops`、`Review Ops` 仍处于工作流定义阶段

当前阶段不做的事：

- 不为尚未清楚边界的任务面创建空壳实现
- 不把所有任务都强行塞进 `MedAutoScience`
- 不把 `RedCube AI` 误写成整个 `Presentation Ops` 或整个 `OPL`
- 不把 `OPL` 伪装成已经完整实现的一体化体系

## 下一阶段

下一阶段应优先做这些事：

- 把 `RedCube AI` 的 `ppt_deck family -> profile pack -> deliverable contract` 边界继续收敛清楚
- 把 `OPL` 的共享底座继续写实，尤其是记忆、治理和交付层
- 继续保持 `MedAutoScience` 作为医学自动科研主线的独立边界
- 继续选择下一个最适合作为明确边界对象的工作流，优先确定任务边界和交付对象

在仍处于纯定义阶段的几个候选方向里，较自然的优先顺序通常会是：

- `Grant Ops`
- `Review Ops`
- `Thesis Ops`

原因是前两者与研究主链的复用面更直接；而 `Presentation Ops` 已经开始通过 `RedCube AI` 进入实现面收敛阶段。

## 更后续阶段

当第二个工作流边界足够稳定后，`OPL` 才适合进入更完整的生态表达阶段，例如：

- 增加更正式的工作流状态维护方式
- 建立组织主页或文档站作为统一入口
- 补齐跨任务共享协议

进入这一阶段的前提不是“想法很多”，而是至少有两个工作流已经形成清楚、可独立说明的实现面。当前 `Research Ops` 已经达到这一点，`Presentation Ops` 则正在通过 `RedCube AI` 接近这一门槛。

## 当前判断标准

如果要判断 `OPL` 是否在向正确方向推进，可以用这几条检查：

- 外界是否能清楚理解 `OPL` 是总蓝图而不是单产品
- 外界是否能清楚理解 `MedAutoScience` 只是其中一个实现面
- 外界是否能清楚理解 `RedCube AI` 是 `Presentation Ops` 的实现面，而不是整个 `Presentation Ops`
- 外界是否能清楚理解 `ppt_deck` 与 `xiaohongshu` 可以共享 runtime，但不必属于同一个 `OPL` 任务面
- 新任务面是否被定义成正式工作流，而不是零散功能需求
- 共享底座是否越来越清楚，而不是停留在概念口号层面
