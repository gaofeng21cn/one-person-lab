# OPL 标准智能体 Repo 结构审计（2026-07-03）

Owner: `One Person Lab`
Purpose: `standard_agent_repo_structure_audit_history`
State: `history_only`
Machine boundary: 本文保存 2026-07-03 结构审计、当时的本机路径/readback 与迁移建议。当前事实仍以 fresh `opl agents conformance`、各 repo contracts/source/tests、domain owner readback 和真实 runtime evidence 为准。

> 历史读法：本文的路径、计数、advisory 状态和迁移顺序只说明当轮审计，不是当前 backlog 或 currentness oracle。当前 owner 路由回 [active 薄入口](../../../active/standard-agent-repo-structure-audit.md)，当前 gap 与 baton 回 [OPL Family 当前状态与理想目标差距](../../../active/current-state-vs-ideal-gap.md)。

## 审计结论

截至 2026-07-03，本机五个 OPL 标准智能体在 OPL structural conformance 下全部通过：

```text
./bin/opl agents conformance \
  --agent mas=/Users/gaofeng/workspace/med-autoscience \
  --agent mag=/Users/gaofeng/workspace/med-autogrant \
  --agent rca=/Users/gaofeng/workspace/redcube-ai \
  --agent obf=/Users/gaofeng/workspace/opl-bookforge \
  --agent oma=/Users/gaofeng/workspace/opl-meta-agent \
  --json
```

fresh readback 摘要：

| Agent | 结构状态 | Stage Pack v2 | 主要缺口 | 迁移建议 |
| --- | --- | --- | --- | --- |
| MAS | `passed`，blocker 0 | `advisory_missing`，85 条 advisory | `agent/tools` 语义文件缺失；各 stage 缺 tool refs；Stage Pack v2 的 version、ABI、tool boundary、receipt schema、authority function、L4/L5 gate、independent gate 未完整声明。 | 优先补 `agent/tools/domain_affordances.md` 和 stage tool refs，再按医学论文高频 stages 补 Stage Pack v2。 |
| MAG | `passed`，blocker 0 | `advisory_missing`，55 条 advisory | Stage Pack v2 metadata、tool affordance boundary、receipt schema、authority function、L4/L5 gate 仍是 advisory gap。 | 以 grant workflow 的 tools / receipt / gate refs 为核心补 v2；不改变 grant owner authority。 |
| RCA | `passed`，blocker 0 | `advisory_missing`，55 条 advisory | Stage Pack v2 metadata、receipt schema、authority function、L4/L5 gate 仍是 advisory gap。 | 以 visual deliverable stages 和 export / review gates 为核心补 v2。 |
| OBF | `passed`，blocker 0 | `passed`，advisory 0 | 当前是最接近理想结构的样板。 | 作为 MAS/MAG/RCA/OMA Stage Pack v2 迁移参考。 |
| OMA | `passed`，blocker 0 | `advisory_missing`，122 条 advisory | OMA 自身 pack 的 v2 metadata、stage contract requires/ensures、tool boundary、receipt schema、authority function、L4/L5 gate 尚未完全折回。 | OMA 生成 target agent 已走 OPL scaffold / validation；下一步应把 OMA 自身 pack 和生成流程的 v2 要求收紧到同一标准。 |

这说明：标准目录和 conformance 主链已经统一，下一轮优化重点不是再建新模块，而是把 Stage 内资源连接从“可用 / advisory”推进到“完整声明 / 可复用模板”。

## 物理目录检查

本机只读目录检查显示：

| Agent | `agent/principles` | `agent/prompts` | `agent/stages` | `agent/skills` | `agent/tools` | `agent/knowledge` | `agent/quality_gates` | `runtime/authority_functions` |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| MAS | 有 | 有 | 有 | 有 | 缺 | 有 | 有 | 缺 |
| MAG | 有 | 有 | 有 | 有 | 有 | 有 | 有 | 缺 |
| RCA | 有 | 有 | 有 | 有 | 有 | 有 | 有 | 缺 |
| OBF | 有 | 有 | 有 | 有 | 有 | 有 | 有 | 有 |
| OMA | 有 | 有 | 有 | 有 | 有 | 有 | 有 | 有 |

`runtime/authority_functions` 缺失在当前 conformance 中不是 blocking structural failure，但在理想结构和 Stage Pack v2 中应逐步补齐为最小 authority function 声明或源文件位置，避免 authority refs 悬空。

## OMA 生成流程检查

OMA 的公开入口现在只提交 `engineer-agent` 意图，实际生成链路由 OPL Foundry Kernel 编排：

1. OPL 将 create/takeover/improve 目标、exact target version、验收条件、source refs 与约束固化为 `DesignRequest`。
2. OPL 通过内部 `design` StageRun 调用 OMA；OMA 返回完整 `AgentBlueprint` 与内嵌 `EvalSpec`，不接触 repo path、worktree、命令或保护测试正文。
3. OPL Pack 以 blueprint 做确定性物化和 scaffold validation；Runway/Evaluation Runtime 使用冻结测试计划与独立 evaluator 生成 `EvidenceBundle`。
4. 失败时 OPL 通过内部 `diagnose` StageRun 调用 OMA；OMA 返回绑定 exact blueprint/evidence digest 的 `EvolutionProposal` 和完整 `next_blueprint`。
5. OPL 在 generation budget 内重新物化和评测，通过后写入不可变 `AgentVersion`，再按风险进入 Owner gate、canary、ActivationPointer CAS 或 `qualify_only` 终态。

判断：目录形态、文件物化、评测、证据、版本、canary、activation 与 rollback 都属于 OPL；OMA 只拥有 Agent 工程语义。公开 scaffold 命令和 OMA 本地执行代理已经退役，不存在第二套 target repo 标准或生命周期状态。

持续防回归点：

- OMA 保持一个公开 action、两个内部 provider operation、八个语义 Stage，并拒绝协议中的物理路径、执行字段、patch、版本或晋级状态。
- Pack scaffold 是 OPL 内部 API；相同 blueprint 必须生成相同 bytes，并拒绝 path traversal、symlink escape、active version 原地修改与 forbidden write。
- 正式 verdict 必须来自独立 evaluator/reviewer；OMA 只能看到聚合 evidence，不能删除、修改或读取保护测试。
- 新 target Agent 只输出 observation/improvement signal，不安装自进化 daemon，也不能修改自身版本、评测、权限或 active pointer。

## 迁移顺序

推荐顺序：

1. **以 OBF 为模板固化 Stage Pack v2 写法**：先抽出稳定字段和文档读法，不新增运行时。
2. **MAS 优先补 tool affordance catalog**：MAS 是当前最重要的医学论文智能体，先补文献、统计、绘图、写作、审稿、投稿、数据治理等 tool refs 与 no-authority boundary。
3. **OMA 自身 pack v2 化**：让 OMA 作为生成标准智能体的 agent，自身也完整表达 requires/ensures、receipt schema、authority refs 和 L4/L5 gate。
4. **MAG/RCA 跟进 v2 advisory**：按 grant / visual deliverable 的真实 owner gates 补齐。
5. **把 OMA 生成目标的 v2 缺口变成 delivery gate blocker**：当 OPL scaffold v2 字段足够稳定后，生成 target agent 时不再只把 v2 缺口作为 advisory。

## 禁止升级的声明

本次审计只支持以下结论：

- 五个标准智能体的 structural conformance 当前通过。
- OBF 的 Stage Pack v2 当前最完整。
- MAS/MAG/RCA/OMA 仍有 v2 advisory migration gap。
- OMA 的生成流程方向符合 OPL scaffold / validation / generated interface owner split。

本次审计不支持声明 domain ready、live stage progress complete、production ready、quality / export ready、App release ready、owner accepted、真实用户路径完成或 Brand L5。
