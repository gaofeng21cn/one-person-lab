# OPL 文档索引

本目录只解释当前 OPL Framework。机器真相依次以 `contracts/`、源码和真实调用者、测试与 fresh `opl ... --json` readback 为准；文档不得复制这些表面的动态计数或充当第二状态库。

## 核心文档

| 文档 | 唯一职责 |
| --- | --- |
| [项目概览](./project.md) | 产品定位、产品分层和 Package 拓扑选择 |
| [当前状态](./status.md) | 已实现能力、当前验证边界和动态读面 |
| [架构](./architecture.md) | 静态分层、owner、依赖方向和运行链路 |
| [硬约束](./invariants.md) | 实现和演进不得破坏的规则 |
| [关键决策](./decisions.md) | 当前仍有效、且无法仅从代码读出的选择 |
| [当前差距](./active/current-state-vs-ideal-gap.md) | 唯一 active gap owner |

核心文档互不记录执行流水、完成清单、测试计数、分支、receipt 或历史方案。

根 README 是使用与开发入口；本页只做导航。专题中的背景摘要可以链接核心文档，
但不另行定义产品、实现状态或全家族规则。各仓各自维护自己的内容，跨仓入口见
[仓库地图](./public/repo-map.md)。

## 专题文档

- [Policies](./policies/README.md)：跨实现长期生效的治理规则。
- [Specs](./specs/README.md)：人读接口和跨 owner 行为合同。
- [Runtime](./runtime/README.md)：运行时对象、控制链和运维边界。
- [Source](./source/README.md)：源码与 workspace 输入边界。
- [Delivery](./delivery/README.md)：artifact、Package 和发布边界。
- [Product](./product/README.md)：App 与用户界面的产品边界。
- [Public](./public/README.md)：面向外部读者的稳定叙事。
- [References](./references/README.md)：不会决定状态或架构的维护参考。
- [Whitepapers](./whitepapers/README.md)：白皮书源文件。
- [Site](./site/README.md)：由白皮书源生成的发布产物。

## 权威顺序

发生冲突时按以下顺序处理：

1. 用户当前目标和产品选择；
2. machine-readable contract、schema 和 owner descriptor；
3. 源码、真实 caller 与运行时 readback；
4. 核心文档；
5. 专题文档；
6. 参考材料。

发现冲突后必须修改唯一 owner 并删除旧说法，不能在另一份文档里追加解释。具体生命周期规则见 [文档生命周期政策](./policies/docs-lifecycle-policy.md)。

## 历史

已完成计划、迁移记录、兼容说明和审计快照不保留在当前文档树。需要追溯时使用 Git commit、blame、tag 和 release artifact；不得从历史文本恢复已删除的模块、接口、测试或兼容面。
