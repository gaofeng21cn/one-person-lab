# Process Plans History

Owner: `One Person Lab`
Purpose: `process_plans_history_index`
State: `historical_archive`
Machine boundary: 本目录只保留人读 implementation-plan / closeout provenance。机器 truth 继续归 `contracts/`、source、CLI/API 行为、runtime ledger、provider receipt、domain-owned manifest、App/workbench projection 和 `human_doc:*` 语义标识。

本目录收纳已经完成、被取代或退出 active path 的一次性实施计划、planning freeze、closeout note 和过程归档。正文中的 `current`、`当前`、`next`、`下一棒`、`Goal`、`Architecture`、checkbox task、验收条件和命令都按文件日期附近的历史计划语境阅读。

当前有效入口回到：

- [项目概览](../../../project.md)
- [当前状态](../../../status.md)
- [架构](../../../architecture.md)
- [硬约束](../../../invariants.md)
- [关键决策](../../../decisions.md)
- [OPL 当前开发线路](../../../active/current-development-lines.md)
- [OPL Family 当前状态与理想目标差距](../../../active/current-state-vs-ideal-gap.md)
- [OPL 与 Foundry Agents 理想目标态](../../../references/runtime-substrate/opl-family-agent-ideal-state.md)

## Historical Plans

| File | Historical role | Current owner |
| --- | --- | --- |
| `2026-04-02-bilingual-homepage-and-core-docs-implementation.md` | 早期 bilingual homepage / public docs rollout 计划。 | 当前公开入口归 root `README*`、`docs/README.md`、`docs/public/` 和核心五件套。 |
| `2026-04-07-g2-release-closeout-note.md` | G2 public baseline closeout 记录。 | 当前 release / runtime / domain 边界归核心五件套、contracts 和 live read-model。 |
| `2026-04-07-g3-thin-handoff-planning-brief.md` | G3 thin handoff planning freeze 记录。 | 当前 handoff / domain activation 归 stage-led framework、domain onboarding 和 runtime boundary。 |
| `2026-04-07-g3-thin-handoff-planning-closeout-note.md` | G3 planning freeze closeout 记录。 | 当前 routed-action / gateway-first wording 已进入 history / compatibility / tombstone 语境。 |
| `2026-04-07-unified-harness-engineering-substrate-doc-alignment.md` | UHS / OPL Gateway / Domain Harness OS family doc alignment 计划。 | 当前统一读法归 `OPL Framework -> One Person Lab App -> Foundry Agents` 和 standard domain-agent skeleton。 |
| `2026-04-12-opl-frontdoor-and-family-entry-implementation.md` | frontdoor / family entry implementation slice。 | 当前入口归 `opl`、Codex-default runtime、activation layer、provider-backed runtime 和 App projection。 |
| `2026-04-12-opl-hosted-entry-and-control-room-hardening.md` | hosted frontdoor / control room hardening outline。 | 当前 long-running hosted path 归 Temporal-backed provider、typed queue、App/operator drilldown。 |
| `2026-04-13-family-executor-adapter-next-phase.md` | family executor adapter contract-first follow-up。 | 当前 executor policy 归 stage pack admission、Codex-first default 和 explicit non-default adapter receipts。 |
| `2026-04-18-family-reuse-full-landing.md` | family shared-surface landing 计划。 | 当前 shared primitives 归 OPL contracts/helpers/generated surfaces，domain truth 归各 domain repo。 |
| `2026-04-20-opl-product-api-reset-implementation.md` | Product API reset implementation plan。 | 当前 product model 只作为历史形成过程；active model 归核心五件套和 runtime / product docs。 |
| `2026-04-21-opl-acp-native-runtime-first-implementation.md` | ACP-native runtime / shell projection implementation plan。 | 当前 session/runtime/App/shell boundary 归 core docs、runtime naming boundary 和 App repo contracts。 |
| `2026-05-14-production-functional-closure-plan.md` | production functional closure closeout / absorbed plan。 | 当前 gaps 归 active gap plan、production closure matrix 和 live read-model。 |
| `2026-05-15-one-person-lab-app-repo-split-closeout.md` | App repo split closeout。 | 当前 App product truth 归 `one-person-lab-app` repo、OPL product docs 和 release evidence ledger。 |
| `2026-05-18-opl-family-doc-process-history.md` | 2026-05 OPL family docs process / proof archive。 | 当前 docs truth 归 active owner docs；本文只作 process provenance。 |
| `2026-05-22-opl-doc-lifecycle-active-ledger-consolidation.md` | active ledger consolidation closeout。 | 当前 docs lifecycle policy 归 docs portfolio / active gap plan / docs lifecycle policy。 |
| `2026-05-26-opl-doc-governance-tranche-ledger.md` | OPL docs governance tranche coverage ledger。 | 当前 truth 归 active gap plan、core docs 和 live CLI/read-model；ledger 只记录本轮覆盖范围与未覆盖范围。 |
| `2026-05-28-opl-series-doc-governance-tranche-ledger.md` | OPL series docs governance / stale-lane cleanup tranche ledger。 | 当前 truth 归各 repo active truth owner、core docs 和 live code/contracts/tests/read-model；ledger 只记录本轮覆盖、验证、阻塞与下一轮写入范围。 |
| `2026-05-29-opl-active-development-portfolio-ledger-foldback.md` | OPL active development portfolio coverage ledger foldback。 | 当前 truth 归 docs portfolio、active gap plan、核心五件套和 live code/contracts/read-model；ledger 只作 history provenance。 |
| `2026-05-29-opl-series-doc-governance-tranche-ledger.md` | OPL series branch/worktree/doc governance tranche ledger。 | 当前 truth 归各 repo active truth owner、core docs 和 live code/contracts/tests/read-model；ledger 只记录本轮六仓盘点、保留理由、OMA 覆盖复核和下一轮写入范围。 |
| `2026-05-29-opl-series-doc-governance-tranche-ledger-part-2.md` | OPL series branch/worktree/doc governance tranche ledger part 2。 | 当前 truth 归各 repo active truth owner、core docs 和 live code/contracts/tests/read-model；ledger 只记录本轮六仓盘点、MAG P3/P4 history coverage、stale lane 清理与下一轮写入范围。 |
| `2026-05-29-opl-series-doc-governance-tranche-ledger-part-3.md` | OPL series branch/worktree/doc governance tranche ledger part 3。 | 当前 truth 归各 repo active truth owner、core docs 和 live code/contracts/tests/read-model；ledger 只记录本轮六仓盘点、MAS stage-surface semantic refresh、验证、保留理由和下一轮写入范围。 |
| `2026-05-29-opl-series-doc-governance-tranche-ledger-part-4.md` | OPL series branch/worktree/doc governance tranche ledger part 4。 | 当前 truth 归各 repo active truth owner、core docs 和 live code/contracts/tests/read-model；ledger 只记录本轮 stale worktree 清理、active CLI/help 示例退役、验证、保留理由和下一轮写入范围。 |
| `2026-05-29-opl-series-doc-governance-tranche-ledger-part-5.md` | OPL series branch/worktree/doc governance tranche ledger part 5。 | 当前 truth 归各 repo active truth owner、core docs 和 live code/contracts/tests/read-model；ledger 只记录本轮 MAS domain-dispatch read-model currentness 修正、验证、保留理由和下一轮写入范围。 |
| `2026-05-29-opl-series-doc-governance-tranche-ledger-part-6.md` | OPL series branch/worktree/doc governance tranche ledger part 6。 | 当前 truth 归 active execution map、核心五件套和 live CLI/read-model；ledger 只记录本轮 `current-development-lines.md` active-support 瘦身、fresh schema 读取、保留的外部 dirty lane 和下一轮写入范围。 |
| `2026-05-29-opl-series-doc-governance-tranche-ledger-part-7.md` | OPL series branch/worktree/doc governance tranche ledger part 7。 | 当前 truth 归 runtime-substrate roadmap、active execution map、核心五件套和 live CLI/read-model；ledger 只记录本轮 `opl-stage-led-agent-framework-roadmap.md` dated proof 瘦身、fresh schema 读取、保留的外部 dirty lane 和下一轮写入范围。 |
| `2026-05-29-opl-series-doc-governance-tranche-ledger-part-8.md` | OPL series branch/worktree/doc governance tranche ledger part 8。 | 当前 truth 归 Agent Lab runtime support、active execution map、核心五件套和 live CLI/read-model；ledger 只记录本轮 `opl-agent-lab-control-plane.md` dated calibration 瘦身、fresh Agent Lab read-model 读取、保留的外部 dirty lane 和下一轮写入范围。 |
| `2026-05-29-opl-series-doc-governance-tranche-ledger-part-9.md` | OPL series branch/worktree/doc governance tranche ledger part 9。 | 当前 truth 归 shared runtime active spec、active execution map、核心五件套和 live CLI/read-model；ledger 只记录本轮 `shared-runtime-contract.md` dated current-state note 瘦身、fresh framework/conformance/default-caller/App read-model 读取、保留的外部 dirty lane 和下一轮写入范围。 |
| `2026-05-29-opl-series-doc-governance-tranche-ledger-part-10.md` | OPL series branch/worktree/doc governance tranche ledger part 10。 | 当前 truth 归 Temporal provider active support、runtime-substrate roadmap、核心五件套和 live CLI/read-model；ledger 只记录本轮 `temporal-family-runtime-provider-plan.md` dated proof/counter 瘦身、fresh provider/read-model 读取、保留的外部 dirty lane 和下一轮写入范围。 |
| `2026-05-29-opl-series-doc-governance-tranche-ledger-part-11.md` | OPL series branch/worktree/doc governance tranche ledger part 11。 | 当前 truth 归 AI-first / executor-first support reference、active gap plan、核心五件套和 live CLI/read-model；ledger 只记录本轮 `ai-first-executor-first-long-horizon-optimization.md` dated read-model counter 瘦身、fresh framework/conformance/worklist/App read-model 读取、保留的外部 dirty lane 和下一轮写入范围。 |
| `2026-05-29-opl-series-doc-governance-tranche-ledger-part-12.md` | OPL series branch/worktree/doc governance tranche ledger part 12。 | 当前 truth 归 managed runtime three-layer machine contract、active gap plan、核心五件套和 live CLI/read-model；ledger 只记录本轮 `opl-managed-runtime-three-layer-contract.md` dated current-state note 与 prose-contract authority 瘦身、fresh conformance/readiness/worklist/App read-model 读取、保留的外部 dirty lane 和下一轮写入范围。 |
| `2026-05-29-opl-series-doc-governance-tranche-ledger-part-13.md` | OPL series branch/worktree/doc governance tranche ledger part 13。 | 当前 truth 归 stage graph / route-as-transition runtime support、active gap plan、核心五件套和 live CLI/read-model；ledger 只记录本轮 `stage-graph-route-transition-runtime.md` dated proof/read-model snapshot 瘦身、fresh conformance/readiness/worklist/App read-model 读取、保留的外部 dirty lane 和下一轮写入范围。 |
| `2026-05-29-opl-series-doc-governance-tranche-ledger-part-14.md` | OPL series branch/worktree/doc governance tranche ledger part 14。 | 当前 truth 归 executor adapter machine contract、agent-executor source、stage launch gate、active gap plan、核心五件套和 live CLI/read-model；ledger 只记录本轮 `family-executor-adapter-defaults.md` dated current-state note 与 repo-state mapping 瘦身、fresh executor doctor/conformance 读取、保留的外部 dirty lane 和下一轮写入范围。 |
| `2026-05-29-opl-series-doc-governance-tranche-ledger-part-15.md` | OPL series branch/worktree/doc governance tranche ledger part 15。 | 当前 truth 归 Runtime Manager / attempt contracts、active gap plan、核心五件套和 live CLI/read-model；ledger 只记录本轮 `opl-runtime-manager-target.md` 与 `family-runtime-attempt-contract.md` currentness / dynamic evidence wording 瘦身、fresh readiness/worklist/App drilldown 读取、保留的外部 dirty lane 和下一轮写入范围。 |
| `2026-05-29-opl-series-doc-governance-tranche-ledger-part-16.md` | OPL series branch/worktree/doc governance tranche ledger part 16。 | 当前 truth 归 executor adapter machine contract、Runtime Manager contract、agent-executor source、stage launch gate、active gap plan、核心五件套和 live CLI/read-model；ledger 只记录本轮 Hermes truth reset / executor evaluation support references 的 dated anchor 与 repo-state snapshot 瘦身、fresh executor doctor/conformance/readiness 读取、保留的外部 dirty lane 和下一轮写入范围。 |
| `2026-05-29-opl-series-doc-governance-tranche-ledger-part-17.md` | OPL series branch/worktree/doc governance tranche ledger part 17。 | 当前 truth 归 family orchestration contracts、Stage Kernel / Derived Diagnostic Lenses、active gap plan、核心五件套和 live CLI/read-model；ledger 只记录本轮 CrewAI absorption support reference 的 dated adoption 顺序瘦身、fresh stages readiness/framework readiness/conformance/App read-model 读取、保留的外部 dirty lane 和下一轮写入范围。 |
| `2026-05-29-opl-series-doc-governance-tranche-ledger-part-18.md` | OPL series branch/worktree/doc governance tranche ledger part 18。 | 当前 truth 归 Stage Kernel / Readiness / Derived Diagnostic Lenses、GraphFlow/GFL negative boundary、active gap plan、核心五件套和 live CLI/read-model；ledger 只记录本轮 GraphFlow/GFL support reference 的 live machine-entry currentness 补齐、fresh stages readiness/framework readiness/conformance/App read-model 读取、保留的外部 dirty lane 和下一轮写入范围。 |
| `2026-05-29-opl-series-doc-governance-tranche-ledger-part-19.md` | OPL series branch/worktree/doc governance tranche ledger part 19。 | 当前 truth 归 OPL family active gap plan、核心五件套、contracts/source/tests 和 live CLI/read-model；ledger 只记录本轮 north-star ideal-state support reference 的 fixed-date/current-anchor 瘦身、fresh framework/conformance/default-caller/worklist/App read-model 读取、保留的外部 dirty lane 和下一轮写入范围。 |
| `2026-05-29-opl-series-doc-governance-tranche-ledger-part-20.md` | OPL series branch/worktree/doc governance tranche ledger part 20。 | 当前 truth 归 OPL family active gap plan、runtime-substrate roadmap、核心五件套、contracts/source/tests 和 live CLI/read-model；ledger 只记录本轮 roadmap fixed-date/current-anchor 瘦身、旧 `3 aligned` 和 MDS active-scope 误读清理、fresh framework/conformance/default-caller 读取、保留的外部 dirty lane 和下一轮写入范围。 |
| `2026-05-29-opl-series-doc-governance-tranche-ledger-part-21.md` | OPL series branch/worktree/doc governance tranche ledger part 21。 | 当前 truth 归 OPL family active gap plan、status、contracts/source/tests 和 live CLI/read-model；ledger 只记录本轮 OMA / New Agent template-consumption 第三条 verified replay receipt 折回、fresh standard-agent-template-consumption/App/framework 读取、保留的外部 dirty lane 和下一轮写入范围。 |
| `2026-05-29-opl-series-doc-governance-tranche-ledger-part-22.md` | OPL series branch/worktree/doc governance tranche ledger part 22。 | 当前 truth 归 OPL operating-governance support references、核心五件套、contracts/source/tests 和 live CLI/read-model；ledger 只记录本轮 App/operator projection 与 operating-governance index fixed-counter 快照瘦身、fresh framework/App/conformance/worklist 读取和下一轮写入范围。 |
| `2026-05-29-opl-series-doc-governance-tranche-ledger-part-23.md` | OPL series branch/worktree/doc governance tranche ledger part 23。 | 当前 truth 归 OPL domain-memory operating-governance support reference、核心五件套、contracts/source/tests 和 live CLI/read-model；ledger 只记录本轮 domain-memory fixed-counter 快照瘦身、fresh domain-memory/App/framework/worklist 读取和下一轮写入范围。 |

## Tombstone Rules

- 本目录不是 active implementation queue、current readiness oracle、runtime provider contract、App release plan 或 domain-agent production gate。
- 历史文件里的 checkbox、命令、验收标准和 `next` 只解释当时计划，不得直接复制为当前 agent prompt。
- 若历史计划中的结论仍有效，先提升到当前 owner doc、policy/spec 或 machine-readable contract，再引用历史来源。
- 旧 `Gateway`、`frontdoor`、`Product API`、`ACP`、`Domain Harness OS`、`Hermes`、`AionUI`、local manager 或 hosted pilot wording 只能作为 provenance / diagnostic / tombstone 阅读，除非 live source、contracts 和 read-model 重新给出当前 owner boundary。
