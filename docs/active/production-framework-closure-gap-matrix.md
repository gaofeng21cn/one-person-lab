# OPL 生产级框架闭环差距矩阵

Owner: `One Person Lab`
Purpose: `production_closure_gap_matrix`
State: `active_plan`
Machine boundary: 本文是人读 gap matrix。机器真相继续归 `contracts/`、source code、CLI/API behavior、runtime ledgers、provider receipts、domain-owned manifests 与真实 workspace / App evidence。
Date: `2026-05-24`

## 文档职责

本文只维护 OPL 距离生产级 framework closure 的当前差距矩阵、完成口径和验证入口。它不再保存 provider proof、receipt 事件、workorder 计数、具体命令输出、分支名或 dated closeout 流水。

需要当前动态读数时，直接读取机器面：

- `opl framework readiness --family-defaults --json`
- `opl agents readiness --family-defaults --json`
- `opl agents conformance --family-defaults --json`
- `opl agents interfaces --domain <domain> --json`
- `opl stages readiness --domain <domain> --json`
- `opl runtime app-operator-drilldown --json`
- `opl runtime app-operator-drilldown --detail full --json`
- `opl family-runtime evidence-worklist --family-defaults --provider temporal --executor-kind codex_cli --detail full --json`

过程性 proof、receipt 事件和本文件瘦身前的 active-ledger 读法归入 [2026-05-22 OPL active ledger consolidation](../history/process/plans/2026-05-22-opl-doc-lifecycle-active-ledger-consolidation.md) 与既有过程归档。旧记录只作 provenance，不恢复为 active checklist。

## 当前判断

OPL 当前已经具备生产级智能体框架的主要控制面骨架：Temporal-backed provider、typed queue、stage attempt ledger、retry/dead-letter、human gate transport、safe runtime action shell、external evidence refs-only ledger、stage evidence accounting、App/operator drilldown、generated surface read model、private functional audit、standard conformance、Agent Lab 与 lifecycle/source/artifact/memory refs-only primitives。

当前仍不能写成全量 production ready。闭环尾项集中在五类：

1. App release / real user path evidence。
2. MAS/MAG/RCA 的 domain owner-chain receipts、typed blockers、memory/artifact/lifecycle receipts 与 long-soak scaleout。
3. MAS physical thinning：仍需按 no-active-caller、OPL replacement parity、domain receipt parity、focused tests 与 tombstone/delete gate 清理 active-path generic residue。
4. RCA naming hygiene tail 与 production evidence tail。
5. New Agent / OPL Meta Agent 的真实 production consumption：scaffold cohort 与 OMA structural consumption 已通过；owner receipt scaleout 已可由机器 receipt 计为 observed；managed install/update gate 已能在 OMA 非 clean managed-root checkout 时 fail closed 为 manual-required route，并已观察到 clean managed-root receipt；App live path gate 已有 `opl runtime oma-app-live-path record/list` operator CLI 和 OPL refs-only receipt ledger，可消费真实 App/live evidence，当前本机 ledger receipt 已被 App drilldown 读成 observed；production-consumption gate 已有 `opl runtime oma-production-consumption record/verify/list` operator CLI、`long-soak start|finish` 本地 observation workorder、`oma_production_consumption:opl-meta-agent:record` safe-action route 和 OPL refs-only receipt ledger，可记录/验证真实 OMA long-soak refs、typed blocker refs 和 operator evidence refs；recorded 但未 verify 的 receipt 只进入 pending verify，不关闭 `long_soak_refs` gate，observation workorder 本身不算 verified long-soak ref，当前本机未写入 verified 真实 long-soak evidence。

OPL readiness、provider proof、generated surface proof、legacy cleanup ledger、conformance pass、stage evidence workorder accounting 或 refs-only typed blocker roundtrip，都只能定位控制面和证据缺口。它们不能授权 MAS paper closure、MAG grant readiness、RCA visual ready、App release ready、artifact authority、memory writeback 或 production-ready verdict。

当前直接清理原则是：production closure 只接受目标态 owner surface 上的真实证据。旧模块、旧接口、旧测试、旧 CLI alias、compat wrapper、facade、历史 gateway/frontdoor/Hermes-first 文案和已替代文档入口，不作为“兼容性资产”保留；一旦 active caller 已迁出且 replacement / no-active-caller / owner receipt 或 tombstone proof 成立，直接删除、archive 或 tombstone。无法立即删除的 retained adapter 必须写清 active caller、唯一角色、不能上收原因和退役门，不能被写成长期合理私有平台。

## Closure Gap Matrix

| gap | 当前已落地 | 未闭合内容 | 完成口径 |
| --- | --- | --- | --- |
| `framework_control_plane` | Provider-backed stage runtime、typed queue、attempt ledger、safe action shell、App/operator drilldown 与 evidence worklist read model 已形成统一控制面。 | 需要持续保持同源读面，避免新增命令、App 卡片或文档自行推断 readiness / owner / production status。 | 默认 summary 和 drilldown 均消费同一机器 payload；新增 surface 只作派生投影，不制造第二真相。 |
| `semantic_hygiene_guard_surface` | Provider readiness single truth、generated surface gate、summary-first App drilldown、family-runtime parser split、stage launch guarantee clarity、legacy vocabulary hygiene、expert-judgment floor 和 functional privatization explicit semantic-equivalence refs 已有守门面。 | 后续 surface 容易重新把 descriptor/readiness/proof 写成 domain ready，或把 domain 未给出 explicit semantic-equivalence refs 的 adapter 直接按文字启发式放行。 | Focused tests、contracts 和文档同时阻断 `proof/readiness = domain verdict` 的误读；semantic-equivalence closeout 只能来自 domain-owned explicit status / evidence / typed-blocker / no-regression refs，OPL fallback heuristic 只用于发现 review-required。 |
| `provider_slo_long_window` | Temporal 是 production required provider；local provider 只作 dev/CI/offline diagnostic baseline。 | 仍需长期 provider cadence/capability evidence，并证明 domain owner-chain dispatch 不退化。 | Provider window 持续 satisfied，且 domain/App/live evidence 继续返回 owner receipt、typed blocker 或 no-regression refs。 |
| `app_release_user_path` | App/operator drilldown 已能消费 provider cadence、domain evidence、stage evidence、cleanup plan 和 safe action route；默认 `app_release_user_path_evidence` gate 会把 release package、screenshot、reload prompt user path、provider state linkage 和 long operator evidence 五类 required refs 投给 App/live operator 或 release owner，并可通过 `runtime action execute` 的 App release/user-path evidence record/verify route 写入 OPL refs-only evidence ledger，消费真实 refs 或 typed blocker refs，同时保持 false authority flags。record route、App `evidence_next_steps` 和 framework review action 现在携带 `opl_app_release_user_path_evidence_payload_workorder`，把真实同 cohort App release/user-path refs path 与 release-owner typed blocker path 明确为机器字段，且声明这两个 path 都不能关闭 release ready、production ready 或 App release/user path。recorded refs 会先进入 `verify_pending` 接力且不参与 gate closure，verify 后才读成 refs observed。read model 现在要求单一 release/user-path cohort，当前 verified `26.5.19` package/provider refs 关闭同 cohort release package 与 provider state linkage gate；同 cohort 真实已安装 App 窗口截图 receipt已 verified 并关闭 screenshot gate；同 cohort startup-maintenance / first-run reload-check receipt 已 verified 并关闭 reload-check gate；跨版本 refs 会保持 `cohort_ambiguous`。 | 同 cohort 长时 operator evidence 未闭合；gate open 只说明 payload 缺口可见，ledger refs observed / verified、selected cohort 或部分 gate observed 也只说明对应 refs 已进入读面，不等于 App release/user path 已关闭。first-run `already-prepared` 日志只证明 reload-check / GUI preparation user path 已检查，不证明实际 reload 发生。 | App release artifact、截图、reload prompt、provider state linkage 与真实用户路径在同一 release/user-path cohort 下可重复证明；App/OPL 只展示 refs/action/typed blocker route，不写 domain truth、owner receipt、release-ready verdict 或 production verdict。 |
| `domain_owner_chain_scaleout` | MAS/MAG/RCA 的 owner receipt refs、typed blocker refs、no-regression refs 可进入 OPL refs-only ledger。 | 多条真实 paper/grant/visual stage 仍需 owner receipt、typed blocker、human gate、quality/export/review receipt 或 long-soak evidence。 | Domain-owned receipt 或 typed blocker 关闭对应 stage / transition / owner-chain 缺口；OPL 只承载 transport、ledger 和 projection。 |
| `generated_surface_production_consumption` | Descriptor、stage/action/memory metadata、pack compiler、interfaces/conformance/readiness 均可被 OPL 识别和投影。 | 生产默认 caller、App/default consumption、direct/hosted parity 和 release/dist evidence 仍需 scaleout。 | MAS/MAG/RCA 生产入口使用 OPL generated/hosted surfaces；repo-local wrapper 退成 domain handler、refs-only adapter、diagnostic 或 tombstone。 |
| `MAS physical thinning` | MAS generic runtime owner 已通过 handoff/projection 归 OPL；部分 runner/status/workbench/SQLite writer 已收成 bridge 或 migration input。 | Active-path residue 的物理 delete/archive/tombstone 尚未按完整 gate 关闭。 | no-active-caller、OPL replacement parity、MAS owner receipt parity、focused tests、no-forbidden-write 和 provenance/tombstone refs 同时成立。 |
| `MAG wrapper_and_runtime_shell_retirement` | MAG repo-side handler / refs-only / authority boundary 已闭合，但 product-entry、domain_runtime、runtime registration、sidecar、lifecycle 和 status/user-loop shell 仍是 active migration inputs。 | 生产默认 caller、App/default consumption、direct/hosted parity、owner receipt roundtrip 与 no-active-caller proof 仍需 scaleout。 | OPL generated product/status/workbench/sidecar shell 成为 default 后，MAG 只保留 grant authority functions；旧 local journal、attempt ledger、scheduler/probe、flat alias、patch bridge 和 compat tests 删除或 tombstone。 |
| `MAG controlled soak` | MAG transition oracle、owner receipt contract、refs-only handoff 与 grant authority boundary 已清晰。 | 真实 OPL-hosted grant-stage attempt、持续 owner receipt / typed blocker / no-regression evidence 和 long soak 未闭合。 | MAG 返回 grant-owned receipt、typed blocker 或 no-regression evidence；fundability/export authority 仍归 MAG。 |
| `RCA controlled soak_and_naming` | RCA generated/hosted shell、legacy cleanup 和 visual authority boundary 已清晰。 | 真实 artifact-producing owner receipt、visual memory reuse、workspace receipt scaleout、long visual-stage no-regression evidence 与 naming hygiene tail 未闭合。 | RCA 返回 visual-owned receipt、typed blocker、artifact-producing receipt 或 no-regression evidence；旧 `managed` 命名只留 provenance/tombstone。 |
| `memory_artifact_lifecycle_apply` | OPL 已持 locator/index/retention/restore refs-only primitives，domain repos 暴露 descriptor、proposal 或 receipt refs。 | 真实 memory body retrieval/writeback、accepted/rejected receipt、artifact mutation receipt 和 cleanup/restore/retention 对账仍需 scaleout。 | Domain-owned surface 产生真实 memory/artifact/lifecycle receipts；OPL 不保存 body、不判定 verdict。 |
| `new_domain_admission` | Standard agent skeleton、pack compiler、conformance/readiness 和 template consumption cohort 已有基础；scaffold consumption cohort 已通过，`opl-meta-agent` 真实仓已通过 scaffold validation、generated interface、conformance 和 readiness structural consumption；App/framework 默认读面已把 OMA production-consumption follow-through 固定成 managed install/update、App live path、owner receipt / typed blocker scaleout 和 long-soak 四类 gate，并会把已观测到的 OPL-managed `oplmetaagent` install/update receipt、OPL refs-only App live path receipt 与 target owner receipt / typed blocker scaleout refs 计为 observed。若没有 clean managed-root receipt，且 OMA module inspection 显示 developer/sibling/dirty/ahead 等不能自动维护的状态，managed install/update gate 会投影 manual-required blocker 与 review action。当前本机 App drilldown 已观察到 managed install/update、App live path 和 owner receipt / typed blocker scaleout refs，open gate 只剩真实 verified `long_soak_refs` evidence；`oma-production-consumption` 还提供本地 long-soak observation workorder commands，方便默认 caller 产出 hash-bound manifest 与 record payload。 | OPL Meta Agent long-soak refs 仍需生产证据；`oma-production-consumption` ledger 只记录/验证 refs，不启动长时运行、不生成 owner receipt、不写 OMA truth；`long-soak start|finish` 只物化本地 observation manifest 和 payload，不直接写 ledger；recorded 但未 verify 的 receipt 只进入 pending verify，不关闭 gate；typed blocker refs 只说明 owner 显式阻塞，operator evidence refs 只保留审计/监控引用，不能替代 verified long-soak ref。App live path receipt 只能关闭 `app_live_path_refs`，owner receipt / typed blocker scaleout 仍需持续扩大到后续 target cohort，不能因当前 manual-required route、managed install/update receipt、App live path receipt、production-consumption intake surface、observation manifest 或两条 target refs 已 observed 而声明 production ready。 | 新 Agent 通过 scaffold validation、pack compiler、conformance/readiness、private surface policy 和 focused tests；production closure 只按 owner receipt / typed blocker / App live evidence / managed install-update / verified long-soak refs 报告。 |

## 统一口径

可以写成：

OPL 已具备 production framework control plane 的基础面，并能 refs-only 承载 MAS/MAG/RCA 的 descriptor、stage/action/memory metadata、owner receipt refs、typed blocker refs、provider receipt 和 App/operator drilldown。这个状态是继续收敛到标准 OPL Agent 的基础，不是三仓 production closure。

不能写成：

- OPL 已全量生产可用。
- MAS paper closure、MAG grant-stage soak、RCA visual-stage soak 已完成。
- Provider/SLO、generated surface、conformance、legacy cleanup 或 refs-only ledger verified 等于 App release/user path、domain owner-chain receipts、artifact/memory authority 或 long-soak 完成。
- Private functional audit 分类完成等于 domain repo 物理代码路径清零。
- Developer Mode repair route read model 等于真实 repo direct-fix / fork-PR owner acceptance closeout。
- 为兼容保留旧模块、旧接口、旧测试、旧 CLI alias、facade 或 wrapper；active caller 迁走后直接删除或进入 history/tombstone。

## 验证入口

Docs-only 治理只需 `git diff --check`、冲突标记扫描和 stale wording spot-check。涉及 contracts/source/runtime/App 的变更，按触及面补跑：

- `rtk ./scripts/verify.sh`
- `rtk npm run test:fast`
- `rtk npm run test:meta`
- `rtk npm run test:artifact`
- `rtk opl agents interfaces --domain mas --json`
- `rtk opl agents interfaces --domain mag --json`
- `rtk opl agents interfaces --domain rca --json`
- `rtk opl stages proof-bundle --domain mas --json`
- `rtk opl stages proof-bundle --domain mag --json`
- `rtk opl stages proof-bundle --domain rca --json`
- `rtk opl family-runtime status --json`
- `rtk opl runtime app-operator-drilldown --json`
- `rtk opl runtime app-operator-drilldown --detail full --json`
- `rtk git status --short`
- `rtk git worktree list`
