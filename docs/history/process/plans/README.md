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
| `2026-05-29-opl-series-doc-governance-tranche-ledger.md` | OPL series branch/worktree/doc governance tranche ledger。 | 当前 truth 归各 repo active truth owner、core docs 和 live code/contracts/tests/read-model；ledger 只记录本轮六仓盘点、保留理由、OMA 覆盖复核和下一轮写入范围。 |
| `2026-05-29-opl-series-doc-governance-tranche-ledger-part-2.md` | OPL series branch/worktree/doc governance tranche ledger part 2。 | 当前 truth 归各 repo active truth owner、core docs 和 live code/contracts/tests/read-model；ledger 只记录本轮六仓盘点、MAG P3/P4 history coverage、stale lane 清理与下一轮写入范围。 |

## Tombstone Rules

- 本目录不是 active implementation queue、current readiness oracle、runtime provider contract、App release plan 或 domain-agent production gate。
- 历史文件里的 checkbox、命令、验收标准和 `next` 只解释当时计划，不得直接复制为当前 agent prompt。
- 若历史计划中的结论仍有效，先提升到当前 owner doc、policy/spec 或 machine-readable contract，再引用历史来源。
- 旧 `Gateway`、`frontdoor`、`Product API`、`ACP`、`Domain Harness OS`、`Hermes`、`AionUI`、local manager 或 hosted pilot wording 只能作为 provenance / diagnostic / tombstone 阅读，除非 live source、contracts 和 read-model 重新给出当前 owner boundary。
