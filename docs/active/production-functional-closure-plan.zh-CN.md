# OPL / Foundry Agents 生产功能闭环一步到位计划

Owner: `One Person Lab`
Purpose: 记录排除真实论文、基金、视觉交付长时 soak 这类耗时验收后，OPL 成为完整生产级智能体框架所需的功能性闭环、已落地证据、剩余 production evidence gate，以及 MAS/MAG/RCA 的同一收口口径。
State: `functional_closeout_read_model_evidence_refs_landed`
Machine boundary: 本文是人读 program plan。机器真相继续归 `contracts/`、source code、CLI/API behavior、runtime ledgers、provider receipts、domain-owned manifests、workspace/runtime artifacts 与真实 app evidence。
Date: `2026-05-13`

## 当前真实状态

当前不是“只剩跑真实论文”。OPL 已具备完整生产级智能体框架的控制面骨架；2026-05-13 本轮已经把可直接工程落地的 functional closure 收口到机器可读 surface、focused tests、typed blockers 和跨仓 status/docs。

已落地的部分：

- OPL Framework identity、Codex CLI first-class executor、Agent executor 最小执行单位、Temporal-backed production provider 口径已经写入核心文档、invariants 和 decisions。
- Shared contracts、family action catalog、stage control plane、domain memory descriptor、standard domain-agent skeleton、runtime supervision、persistence / lifecycle / owner-route schema 已落地。
- MAS/MAG/RCA 均已 descriptor-level aligned；OPL 能解析三仓 stage plane、domain memory descriptor 和 artifact locator boundary。
- Temporal provider code、workflow/activity/signal/query、stage attempt ledger、typed queue、typed closeout gate、Codex runner repo/test harness、Aion stage-attempt workbench projection 已落地。
- OPL controlled apply contract 已开放给 MAG/RCA；MAG/RCA 当前 blocker 已从 OPL contract gap 收窄为 domain owner receipt / no-regression evidence 未产出。
- OPL production functional closeout gate 已落地，能够只读聚合 admitted domains、descriptor alignment、provider readiness、memory/lifecycle receipt coverage、legacy residue state 和 typed blockers。
- OPL agents / production-closeout read model 已能聚合 MAS/MAG/RCA domain-owned physical skeleton anchor evidence refs：`physical_skeleton_evidence_observed_count=3`、`physical_skeleton_audit_pending_count=0`。这只表示 repo-source anchor / proof refs 可被 OPL 只读索引，不表示 OPL 执行了 domain repo 物理目录迁移。
- MAS 已有 provider proof ingestion、Stage Review workspace locator proof、publication-route memory Markdown-first library、DM002 route-memory receipt refs、provider guarded apply receipt surface、domain memory/lifecycle/physical skeleton projections，以及拆分后的 provider-ready / progress portal / guarded-apply task surfaces。
- MAG/RCA 已在各自 main 上落地 functional closure proofs：domain owner receipt envelope、domain memory accepted/rejected receipt refs、lifecycle guarded apply refs、physical skeleton proof、controlled soak typed blocker 和文档/status 对齐。

仍未闭合的部分分两类：

- `production evidence gates`：真实长时 Temporal residency、真实 MAS paper-line provider-hosted guarded apply、真实 MAG/RCA production controlled soak。这类需要 live workspace、owner gate、时间和运行成本，不在本文中伪装成短期功能开发。
- `follow-through work`：physical skeleton 的破坏性目录搬迁、legacy residue 的最终物理删除、真实 workspace/runtime memory body migration、RCA review helper 实际拆分，以及长时 provider/operator SLO 校准。physical skeleton anchor evidence refs 已进入 OPL read model；破坏性 path move 与 legacy physical delete 仍按 typed blocker 和证据门槛推进。

## 距理想状态还有多远

工程判断保持：`65-75% framework/control-plane landed`，`25-35% production closure remaining`。如果只看“排除真实论文/真实交付长时 soak 后，可由工程实现闭合的功能性缺口”，本轮后功能性 read-model 缺口已收口为 evidence-ref based 状态；剩余 `5-10%` follow-through 主要是破坏性物理目录迁移与 legacy 物理删除这类必须等 no-active-caller / path parity / provenance proof 的收尾。

| 理想目标 | 当前距离 |
| --- | --- |
| OPL 成为完整生产级智能体框架 | 控制面、contract、attempt、provider code、workbench、descriptor discovery、controlled apply projection 和 production closeout gate 已落地；剩余距离主要是真实 production residency、长时 operator SLO 和真实 domain attempt evidence。 |
| 各 repo 完成迁移、分层 | MAS/MAG/RCA 已完成 manifest/descriptor/receipt 层迁移和 functional closure proof；后续物理迁移必须先通过 path compatibility、direct skill / OPL-hosted path parity、restore/provenance proof 和 no-forbidden-write proof。 |
| domain repo 目录结构标准化 | OPL 已定义 `agent/ contracts/ runtime/ docs/` skeleton；三仓 physical skeleton anchor evidence refs 已可被 `opl agents` / `framework production-closeout` 聚合。完整物理重组仍是 follow-through，workspace artifacts、memory body 和 receipt instances 不进 repo source。 |
| domain memory 泛化 | 三仓 memory descriptor、accepted/rejected receipt refs 和 OPL ref-only projection 已落地；真实 memory body migration / retrieval / writeback apply 仍归 domain runtime/workspace evidence gate。 |
| lifecycle / artifact primitive 泛化 | cleanup/restore/retention guarded apply refs 已跨仓对齐；OPL 只 apply OPL-owned metadata，domain artifact mutation 继续要求 domain receipt 或 typed blocker。 |
| legacy residue 退役 | 默认 caller 已离开 Hermes/Gateway/frontdoor/local-manager/MDS default；当前以 no-active-default-caller / tombstone proof 管理，最终物理删除仍需 no-active-caller 与 provenance 保留证据同时成立。 |

## 一步到位并行计划与落地状态

这些 lane 已按并行 worktree / 分支推进并吸收回各自 `main`。真实长时 soak 继续作为 typed blocker 或 later evidence，不阻塞功能性闭环。

| lane | repo owner | 当前状态 | 证据 / 下一跳 |
| --- | --- | --- | --- |
| `provider-readiness-operator-closure` | OPL | `landed` | Managed provider state、service/worker/proof projection 与 production closeout gate 已落地；真实长时 residency 仍需 live evidence。 |
| `owner-receipt-contract-generalization` | OPL + MAS/MAG/RCA | `landed` | 三仓使用 `domain_receipt | typed_blocker | no_regression_evidence` 口径；OPL attempt/closeout gate 保存 refs，不保存 domain truth。 |
| `domain-memory-apply-generalization` | MAS/MAG/RCA | `landed_as_refs` | MAS/MAG/RCA 都暴露 descriptor、accepted/rejected receipt refs 或 typed blocker；真实 memory body 和 writeback truth 仍归 domain owner。 |
| `lifecycle-guarded-apply-generalization` | OPL + MAS/MAG/RCA | `landed_as_guarded_refs` | cleanup/restore/retention 已形成 OPL-owned metadata apply 与 domain-owned artifact mutation receipt requirement。 |
| `physical-skeleton-follow-through` | MAS/MAG/RCA | `evidence_refs_aggregated` | 三仓已有 physical skeleton audit/proof，OPL read model 只读聚合 anchor evidence refs；破坏性 path move 后续按 parity/provenance/no-forbidden-write 证据推进。 |
| `legacy-active-path-final-retirement` | OPL + domains | `no_active_caller_evidence_observed_delete_blocked` | 默认旧面已失去 authority；OPL 只把 no-active-caller/tombstone evidence 投影成 typed blocker，最终 delete 仍需 full no-active-caller 与 fixture/provenance 保留证据同时成立。 |
| `operator-workbench-drilldown` | OPL App / OPL | `landed` | Workbench/closeout gate 能展示 provider completion、domain owner receipt、human gate、dead-letter、rejected writeback 和 typed blockers。 |
| `cross-repo-production-closeout-gate` | OPL + all domains | `landed` | OPL `production functional closeout gate` 聚合四仓当前状态；真实 live evidence 缺失时列 typed blocker，不写 success。 |

## 吸收顺序

本轮吸收顺序已经完成：OPL provider/closeout gate 先落地，MAG/RCA functional closure proofs 已吸收到各自 `main`，MAS functional closure 和结构拆分在 MAS `main` 收口，最后由 OPL 文档记录当前统一口径。后续不再需要新建平行大计划，直接按 typed blocker 的 owner surface 推进真实 evidence gate。

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

## 当前剩余项

剩余项只应写成 evidence gate 或 follow-through，不应写成“还缺基础功能”：

- `temporal_long_residency_evidence`：需要真实本机/外部 managed Temporal service + worker 的长时 residency、restart/re-query、signal/history 和 operator repair loop 证据。
- `mas_live_paper_owner_chain`：DM002、DM003、Obesity 仍需真实 provider-hosted guarded apply 进入 MAS owner receipt chain，产出 artifact/gate/reviewer/route/human-gate/stop-loss evidence 或 owner typed blocker。
- `mag_rca_live_controlled_soak`：MAG/RCA 仍需真实 grant/visual stage attempt 的 domain owner receipt 或 no-regression evidence。
- `physical_path_migration`：三仓 physical skeleton anchor evidence refs 已可聚合；完整物理 `agent/ contracts/ runtime/ docs/` 目录迁移仍需 direct skill path、OPL-hosted path、restore/provenance proof 和 no-forbidden-write proof。
- `legacy_physical_delete`：旧 Hermes/Gateway/frontdoor/local-manager/MDS/default-compat residue 的物理删除只保留真实 no-active-caller / provenance typed blocker；历史、fixture、provenance 引用继续保留语境标签。
