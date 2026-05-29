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
| `2026-05-29-opl-series-doc-governance-part-ledger-retirement.md` | OPL series per-part governance ledger retirement。 | `2026-05-29-opl-series-doc-governance-tranche-ledger-part-2.md` through `part-79.md` were deleted after source/contracts/tests scans showed no machine refs; current truth stays in active owner docs, core docs, live source/contracts/tests/read-model, and this compact retirement ledger. |
| `2026-05-30-opl-series-doc-governance-current-support-ledger.md` | OPL current-support release/package wording cleanup ledger。 | 当前 truth 归 package/native-helper contracts、source、tests 和 live CLI/read-model；ledger 只记录 `opl native:repair` stale prose retirement and retained support-doc coverage. |
| `2026-05-30-opl-series-doc-governance-memory-reference-ledger.md` | OPL operating-governance memory reference cleanup ledger。 | 当前 truth 归 domain-memory contracts、source、tests 和 live CLI/read-model；ledger 只记录 stale MAS-only memory proof wording retirement and retained refs-only memory evidence coverage. |
| `2026-05-30-opl-series-doc-governance-directory-governance-ledger.md` | OPL operating-governance directory reference cleanup ledger。 | 当前 truth 归 directory governance support doc、repo hygiene tests、domain-owned manifests 和 live CLI/read-model；ledger 只记录 stale fixed directory-status counters retirement. |
| `2026-05-30-opl-series-doc-governance-structure-advisory-ledger.md` | OPL operating-governance structure advisory workflow cleanup ledger。 | 当前 truth 归 `family:structure-advisory` source/tests、support report 和 fresh generated output；ledger 只记录 stale `med-deepscientist` default scope retirement and OPL-only readout refresh. |
| `2026-05-30-opl-series-doc-governance-operating-index-ledger.md` | OPL operating-governance index foldback ledger。 | 当前 truth 归 operating-governance index and referenced support docs；ledger 只记录 stale structure-advisory lifecycle state foldback. |
| `2026-05-30-opl-series-doc-governance-package-mds-ledger.md` | OPL current-support package/MDS wording cleanup ledger。 | 当前 truth 归 package manifest source/tests/CLI、core MDS boundary docs 和 App-owned release evidence；ledger 只记录 stale MDS provider-adapter wording retirement. |
| `2026-05-30-opl-series-doc-governance-current-support-index-ledger.md` | OPL current-support index and default-skill boundary cleanup ledger。 | 当前 truth 归 current-support index、default-skill ecosystem support doc、companion skill source/CLI 和 family plugin registry source/CLI；ledger 只记录 stale MDS / system-skill index wording retirement. |
| `2026-05-30-opl-series-doc-governance-test-lane-ledger.md` | OPL current-support test lane governance cleanup ledger。 | 当前 truth 归 package scripts、test lane registry、verify scripts 和 GitHub workflows；ledger 只记录 stale lane-table completeness and frozen-state wording retirement. |
| `2026-05-30-opl-series-doc-governance-quality-details-ledger.md` | OPL current-support quality-details cleanup ledger。 | 当前 truth 归 `opl quality details` source/tests, structural gate scripts and GitHub quality-details action/workflows；ledger 只记录 stale fixed finding/action-readiness wording retirement. |
| `2026-05-30-opl-series-doc-governance-docker-webui-ledger.md` | OPL current-support Docker/WebUI cleanup ledger。 | 当前 truth 归 package manifest source/tests/CLI、OPL packages workflow、App release Docker smoke 和 shell Dockerfile/web-cli/web-host；ledger 只记录 stale Docker/WebUI readiness and entrypoint wording retirement. |
| `2026-05-30-opl-series-doc-governance-fresh-install-ledger.md` | OPL current-support fresh-install / GUI first-launch cleanup ledger。 | 当前 truth 归 OPL fresh-install contract/source/tests/CLI 与 App-owned first-run/release contracts/workflows/evidence；ledger 只记录 stale release evidence and `online_management_*` wording retirement. |
| `2026-05-30-opl-series-doc-governance-ai-first-optimization-ledger.md` | OPL runtime-substrate AI-first optimization support-reference cleanup ledger。 | 当前 truth 归 invariants、decisions、active gap plan、live CLI/read-model、App evidence 与 domain owner receipts；ledger 只记录 dated current-assessment / next-action wording retirement. |
| `2026-05-30-opl-series-doc-governance-domain-memory-support-ledger.md` | OPL operating-governance domain-memory support-reference cleanup ledger。 | 当前 truth 归 family-domain-memory contracts/source/CLI read-model、App/operator projection 与 domain owner receipts；ledger 只记录 execution-ledger wording retirement. |
| `2026-05-30-opl-series-doc-governance-stage-led-roadmap-ledger.md` | OPL runtime-substrate stage-led roadmap support-reference cleanup ledger。 | 当前 truth 归 active gap plan、core docs、live CLI/read-model、runtime ledger 与 domain owner receipts；ledger 只记录 fixed completion snapshot / shared SHA / App-Aion proof wording retirement. |
| `2026-05-30-opl-series-doc-governance-provider-route-guard-ledger.md` | OPL provider worker / SLO safe-action route guard absorb ledger。 | 当前 truth 归 runtime action route source/tests、App/operator drilldown read-model、core status/gap/decisions docs and live CLI behavior；ledger 只记录 developer-checkout worker mutation guard and typed-blocker-closed default-action filtering foldback. |
| `2026-05-30-opl-series-doc-governance-queuehold-dispatch-tray-ledger.md` | OPL queuehold dispatch override / tray route-cost projection absorb ledger。 | 当前 truth 归 family-runtime dispatch source/tests、stage attempt tray/workbench source/tests、core decisions doc and live CLI behavior；ledger 只记录 MAS shorthand dispatch override and per-attempt model-route-cost projection foldback. |

## Tombstone Rules

- 本目录不是 active implementation queue、current readiness oracle、runtime provider contract、App release plan 或 domain-agent production gate。
- 历史文件里的 checkbox、命令、验收标准和 `next` 只解释当时计划，不得直接复制为当前 agent prompt。
- 若历史计划中的结论仍有效，先提升到当前 owner doc、policy/spec 或 machine-readable contract，再引用历史来源。
- 旧 `Gateway`、`frontdoor`、`Product API`、`ACP`、`Domain Harness OS`、`Hermes`、`AionUI`、local manager 或 hosted pilot wording 只能作为 provenance / diagnostic / tombstone 阅读，除非 live source、contracts 和 read-model 重新给出当前 owner boundary。
