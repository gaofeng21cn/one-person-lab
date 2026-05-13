# OPL / Foundry Agents 生产功能闭环一步到位计划

Owner: `One Person Lab`
Purpose: 在排除真实论文、基金、视觉交付长时 soak 这类耗时验收后，记录 OPL 成为完整生产级智能体框架还缺哪些可工程落地的功能闭环，以及 MAS/MAG/RCA 如何按同一目标收口。
State: `active_plan`
Machine boundary: 本文是人读 program plan。机器真相继续归 `contracts/`、source code、CLI/API behavior、runtime ledgers、provider receipts、domain-owned manifests、workspace/runtime artifacts 与真实 app evidence。
Date: `2026-05-13`

## 当前真实状态

当前不是“只剩跑真实论文”。OPL 已具备完整生产级智能体框架的控制面骨架，但仍缺若干可直接实现的功能闭环。

已落地的部分：

- OPL Framework identity、Codex CLI first-class executor、Agent executor 最小执行单位、Temporal-backed production provider 口径已经写入核心文档、invariants 和 decisions。
- Shared contracts、family action catalog、stage control plane、domain memory descriptor、standard domain-agent skeleton、runtime supervision、persistence / lifecycle / owner-route schema 已落地。
- MAS/MAG/RCA 均已 descriptor-level aligned；OPL 能解析三仓 stage plane、domain memory descriptor 和 artifact locator boundary。
- Temporal provider code、workflow/activity/signal/query、stage attempt ledger、typed queue、typed closeout gate、Codex runner repo/test harness、Aion stage-attempt workbench projection 已落地。
- OPL controlled apply contract 已开放给 MAG/RCA；MAG/RCA 当前 blocker 已从 OPL contract gap 收窄为 domain owner receipt / no-regression evidence 未产出。
- MAS 已有 provider proof ingestion、Stage Review workspace locator proof、publication-route memory Markdown-first library 和 DM002 route-memory receipt refs。

仍未闭合的部分分两类：

- `production evidence gaps`：真实长时 Temporal residency、真实 MAS paper-line provider-hosted guarded apply、真实 MAG/RCA production controlled soak。这类需要 live workspace、owner gate、时间和运行成本，不在本文中伪装成短期功能开发。
- `functional closure gaps`：provider install/repair/readiness 一致性、domain owner receipt schema 泛化、memory/lifecycle apply receipt 泛化、physical skeleton path migration plan、legacy active-path deletion proof、operator workbench drilldown、cross-repo verification gates。这些可以并行实现。

## 距理想状态还有多远

工程判断保持：`60-70% framework/control-plane landed`，`30-40% production closure remaining`。如果只看“排除真实论文/真实交付长时 soak 后，可由工程实现闭合的功能性缺口”，当前约有 `20-25%` 还需要落地。

| 理想目标 | 当前距离 |
| --- | --- |
| OPL 成为完整生产级智能体框架 | 控制面、contract、attempt、provider code、workbench 和 descriptor discovery 已落地；仍缺 production provider install/repair/status 一致性、长时 residency 监控、operator repair action 闭环和真实 domain attempt evidence。 |
| 各 repo 完成迁移、分层 | MAS/MAG/RCA 已完成 manifest/descriptor 层迁移；仍缺 repo-source physical skeleton 分层、path compatibility audit、direct skill / OPL-hosted path parity harness 和 no-forbidden-write proof 汇总。 |
| domain repo 目录结构标准化 | OPL 已定义 `agent/ contracts/ runtime/ docs/` skeleton；三仓当前仍主要是 mapping/audit，不是物理重组。仍缺逐仓迁移清单、路径别名退役策略、provenance ref rewrite 和 restore proof。 |
| domain memory 泛化 | 三仓 memory descriptor 均 resolved；MAS publication-route memory 最成熟。仍缺 MAG/RCA accepted/rejected writeback receipt instance 泛化、memory body externalization discipline、operator ref-only grouping。 |
| lifecycle / artifact primitive 泛化 | OPL schema 和 MAS reference pattern 已有；仍缺跨三仓 cleanup/restore/retention guarded apply proof，以及 domain-owned artifact mutation 的 receipt requirement。 |
| legacy residue 退役 | 默认 caller 已离开 Hermes/Gateway/frontdoor/local-manager/MDS default；仍缺最终 no-active-caller scan 后的物理删除或 tombstone。 |

## 一步到位并行计划

这些 lane 可以并行开 worktree，完成后按固定顺序吸收回各自 `main`。真实长时 soak 可作为 typed blocker 或 later evidence，不阻塞功能性闭环。

| lane | repo owner | 目标产物 | 完成门槛 |
| --- | --- | --- | --- |
| `provider-readiness-operator-closure` | OPL | Temporal install / repair / service / worker / status / proof read model 一致化；operator repair action 可复制执行；production proof、status、runtime snapshot 使用同一 managed state。 | `family-runtime service status`、`worker status`、`residency proof --production`、`runtime snapshot` 对同一 Temporal address/worker state 给出一致状态；未就绪时 typed platform blocker 带 repair command。 |
| `owner-receipt-contract-generalization` | OPL + MAS/MAG/RCA | 统一 domain owner receipt envelope：`domain_receipt | typed_blocker | no_regression_evidence`，含 owner、source refs、attempt refs、forbidden-write proof、artifact/memory/lifecycle mutation declaration。 | 三仓 sidecar/product manifest 暴露同构 receipt ref；OPL attempt ledger 只保存 refs，不保存 domain truth。 |
| `domain-memory-apply-generalization` | MAS/MAG/RCA | MAS publication-route、MAG grant strategy、RCA visual pattern memory 都能产出 accepted/rejected receipt fixture 或 live typed blocker；OPL/Aion 只展示 locator、freshness、receipt refs。 | 每仓有 focused test 覆盖 consumed refs、proposal refs、accept/reject projection、forbidden memory body write、missing receipt blocker。 |
| `lifecycle-guarded-apply-generalization` | OPL + MAS/MAG/RCA | cleanup/restore/retention 的 OPL-owned ledger/locator apply 与 domain-owned artifact mutation receipt requirement。 | OPL-owned metadata 可 apply；domain artifact 删除/重写必须返回 domain receipt requirement 或 typed blocker。 |
| `physical-skeleton-follow-through` | MAS/MAG/RCA | `agent/ contracts/ runtime/ docs/` physical layout 迁移计划和第一批低风险 path moves；workspace artifacts、receipt instances、memory body 不进 repo source。 | direct skill path、CLI/API、manifest、OPL `agents inspect`、provenance refs 和 focused tests 通过；旧路径要么 thin wrapper，要么 history/tombstone。 |
| `legacy-active-path-final-retirement` | OPL + domains | Hermes/Gateway/frontdoor/local-manager/MDS default vocabulary 的 no-active-caller scan、replacement proof、delete/tombstone patch。 | active help/docs/CLI/product status 不再出现默认旧路径；fixture/provenance/history 保留项都有语境标签。 |
| `operator-workbench-drilldown` | OPL App / OPL | Aion/OPL runtime workbench 按 provider、domain、stage、blocker、memory refs、receipt refs 分组；safe action 只发 provider signal 或 domain handoff，不写 domain truth。 | Workbench 能解释 provider completion、domain owner receipt、human gate、dead-letter、rejected writeback 五轴；缺 owner receipt 时显示 typed blocker。 |
| `cross-repo-production-closeout-gate` | OPL + all domains | 一个只读 closeout command/report，聚合四仓 status、worktree、descriptor alignment、provider readiness、memory/lifecycle receipt coverage、legacy residue state。 | 不运行长时 soak也能给出当前功能闭环报告；真实 live evidence 缺失时列 typed blocker，不写 success。 |

## 吸收顺序

1. OPL provider readiness / operator closure。
2. owner receipt contract generalization。
3. MAS/MAG/RCA memory + lifecycle apply receipt 泛化。
4. physical skeleton follow-through。
5. legacy active-path final retirement。
6. operator workbench drilldown。
7. cross-repo production closeout gate 和文档/status 收口。

这个顺序的原因是：没有统一 provider/readiness 和 receipt envelope，后面的 memory、lifecycle、soak 和 workbench 都会继续各说各话；没有 physical skeleton 和 legacy retirement，OPL 仍会长期依赖 adapter mapping 和旧语汇。

## 非目标

- 不把真实论文质量、基金 fundability、视觉质量或 artifact authority 迁到 OPL。
- 不把真实 paper/grant/visual 长时 soak 写成已完成。
- 不把 MAS `append-block` 主 stage 独立 skill surface 纳入本计划。
- 不移动 workspace/runtime artifacts、receipt instances、memory body 或真实输出包到 repo-source skeleton。
- 不把 Hermes/Gateway/local provider 重新写成 production required substrate。

## 验收口径

每条 lane 的有效结果只有三类：

- repo/source/contract/CLI/app surface 通过 focused verification；
- domain owner receipt / no-regression evidence 证明可用；
- 来自 provider readiness、owner guard、authorization gate、live gate 或 domain contract gap 的 typed blocker。

`typed blocker` 是真实完成结果，前提是它来自机器可读 owner surface，并附带 source refs、owner、repair/next action 和 forbidden-write proof。
