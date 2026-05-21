# Policies 文档

Owner: `One Person Lab`
Purpose: `stable_policy_index`
State: `active_support`
Machine boundary: 人读索引。硬约束仍以核心五件套、contracts、schema、源码和验证行为为准。

本目录承接长期稳定规则、repo-local 运行纪律和 workspace / file lifecycle 政策。跨仓硬约束先进入 [硬约束](../invariants.md) 或机器合同；更细的维护政策可以放在本目录。

当前入口先看：

- [硬约束](../invariants.md)
- [关键决策](../decisions.md)
- [文档组合治理](../docs_portfolio_consolidation.md)

## 内容

| 文件 | 生命周期状态 | 当前 owner | 阅读规则 |
| --- | --- | --- | --- |
| `docs-lifecycle-policy.md` | `active_policy` | OPL docs governance owner | 固定 canonical docs taxonomy、中文 canonical 规则和 direct-retirement 政策；硬约束需要同步上提到核心五件套或机器合同。 |
| `domain-private-functional-surface-policy.md` | `active_policy` | OPL framework governance owner | 固定 OPL-compatible Agent 三层功能审计 taxonomy、authority function ABI、私有平台 residue 准入证据和退役门；新 Agent 默认是 declarative pack + OPL generated/hosted surfaces + standard authority functions。 |
| `github-ci-automation-policy.md` | `active_policy` | OPL maintenance automation owner | 固定 GitHub CI 自动化对 current failure、superseded historical run、queued smoke cleanup 和 App/shell release owner 的分类口径。 |
| `runtime-artifact-hygiene-policy.md` | `active_policy` | OPL framework governance owner | 固定 OPL family workspace / file lifecycle、repo-source 边界、开发 checkout 与运行生成物隔离纪律；具体守门由各仓 clean runner、验证入口、pytest 配置和 repo hygiene 测试承担。 |
