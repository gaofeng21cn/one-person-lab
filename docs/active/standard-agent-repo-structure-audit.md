# OPL 标准智能体 Repo 结构审计

Owner: `One Person Lab`
Purpose: `standard_agent_repo_structure_audit`
State: `active_support`
Machine boundary: 本文记录一次结构审计和迁移建议。当前事实仍以 fresh `opl agents conformance`、各 repo contracts/source/tests、domain owner readback 和真实 runtime evidence 为准。

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

OMA 的 `build-agent-baseline` 当前走正确 owner split：

1. 调用 `opl agents scaffold --target-dir ... --domain-id ... --domain-label ... --json` 生成标准目录。
2. 写入最小领域 pack / morphology fixture，并通过 stage-decomposition materializer 写入目标 agent 的 stage / prompt / skill / quality / knowledge refs。
3. 调用 `opl agents scaffold --validate <targetAgentDir> --json` 做 scaffold validation。
4. 调用 `opl agents interfaces --repo-dir <targetAgentDir> --json` 生成统一接口。
5. 进入 Agent Lab suite、independent reviewer、delivery gate、owner receipt / typed blocker / developer work order 收口。

判断：OMA 没有另起私有 target repo 目录标准。它以 OPL scaffold 为目录来源，以 OMA stage-decomposition 为领域语义来源，以 OPL validation / interfaces / Agent Lab 为机器消费和收口来源，符合标准方向。

当前优化点：

- OMA 文档需要明确：生成 target agent 时，目录标准属于 OPL scaffold；OMA 只提供 domain semantics、stage decomposition、candidate package 和 owner-gated closeout refs。
- OMA 自身 pack 的 Stage Pack v2 advisory 应逐步折回，尤其是 `stage_contract.requires/ensures`、tool affordance boundary、receipt schema refs、authority function refs、L4/L5 entry gate 和 stage completion policy。
- `writeMinimalAgentDomainPack` 写入的 README 只做人读索引，不能被理解为 semantic pack source；真实 semantic source 必须来自非 README pack files 和 stage-decomposition closeout。

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
