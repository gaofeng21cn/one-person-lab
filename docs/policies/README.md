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

## 入口政策读法

runtime / product 文档入口新增或上提 surface 时，先按下面顺序归位：

1. 是否改变 stage currentness、owner delta、terminal state 或 closeout truth：若是，必须回到 Stage Transition Authority、Stage Folder / manifest / owner receipt / typed blocker 和核心五件套；普通文档、App、Agent Lab、read-model projection 或 telemetry 不能直接持有。
2. 是否属于 standard OPL Agent 形态：Domain repo 默认只保留 declarative Domain Pack、authority ABI、domain handler / native helper 和 direct skill path；CLI/MCP/App/status/workbench/default-caller shell 应由 OPL generated/hosted surface 或 App product contract 承担。
3. 是否应该进入默认 surface：先过 surface budget。只有影响 launch safety、authority boundary、evidence / replay / audit / route-back，或被 App / runtime 反复消费的能力，才允许进入普通 help、默认 docs 入口或 App Console 默认页。
4. 是否只是 telemetry / diagnostic / history / cleanup：默认进入 Atlas / Ledger refs、full drilldown、diagnostic lane、cleanup lane 或 history/tombstone，不生成默认 next action。

当前 active gap owner 仍是 [OPL Family 当前状态与理想目标差距](../active/current-state-vs-ideal-gap.md)。本目录只冻结长期政策和迁移门，不维护 live counter、执行顺序或 closeout ledger。

## 内容

| 文件 | 生命周期状态 | 当前 owner | 阅读规则 |
| --- | --- | --- | --- |
| `docs-lifecycle-policy.md` | `active_policy` | OPL docs governance owner | 固定 canonical docs taxonomy、中文 canonical 规则和 direct-retirement 政策；硬约束需要同步上提到核心五件套或机器合同。 |
| `domain-private-functional-surface-policy.md` | `active_policy` | OPL framework governance owner | 固定 OPL-compatible Agent 三层功能审计 taxonomy、authority function ABI、私有平台 residue 准入证据和退役门；新 Agent 默认是 declarative pack + OPL generated/hosted surfaces + minimal authority functions。 |
| `github-ci-automation-policy.md` | `active_policy` | OPL maintenance automation owner | 固定 GitHub CI 自动化对 current failure、superseded historical run、queued smoke cleanup 和 App/shell release owner 的分类口径。 |
| `runtime-artifact-hygiene-policy.md` | `active_policy` | OPL framework governance owner | 固定 OPL family workspace / file lifecycle、repo-source 边界、开发 checkout 与运行生成物隔离纪律；具体守门由各仓 clean runner、验证入口、pytest 配置和 repo hygiene 测试承担。 |
| `reuse-first-governance-policy.md` | `active_policy` | OPL framework governance owner | 固定复用优先治理经验、strict diff gate 语义、沉淀路线和 forbidden ready claims；可执行守门仍归 reuse-first contract / scan script / verify entry。 |
| `standard-agent-capability-management-policy.md` | `active_policy` | OPL framework governance owner | 固定标准智能体能力分层、外置门、同步策略和 MAS / ScholarSkills 当前 capability owner 边界。 |
| `standard-agent-repo-structure.md` | `active_policy` | OPL framework governance owner | 固定标准 OPL 智能体 repo 的理想目录、Stage 内资源连接、workspace projection 和 OMA 生成 target agent 的目录边界。 |
| `stage-pack-v2-migration-checklist.md` | `active_policy` | OPL framework governance owner | 固定 Stage Pack v2 从 OBF 样板迁移到 MAS/MAG/RCA/OMA 的最小字段清单、tool affordance 边界和验收命令。 |
