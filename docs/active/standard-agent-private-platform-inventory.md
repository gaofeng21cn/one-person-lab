# OPL 标准智能体私有平台化 inventory

Owner: `One Person Lab`
Purpose: `cross_repo_private_platform_inventory`
State: `active_inventory`
Machine boundary: 本文是跨 repo 人读治理台账。机器真相继续归 OPL `contracts/`、CLI/API 行为、provider receipt、domain-owned contracts、sidecar/manifest projection、真实 workspace receipt 与各 domain agent owner receipt。
更新时间：`2026-05-22`

## 文档职责

本文只维护 MAS/MAG/RCA/OPL Meta Agent 中仍可能被误读成 repo-local generic platform 的当前 surface 分类、owner 边界和迁移门。它不再保存逐日拆文件流水账、line-count closeout、commit 过程或长 follow-up 清单。

本轮瘦身前的逐文件拆分过程已归入 [2026-05-22 OPL active ledger consolidation](../history/process/plans/2026-05-22-opl-doc-lifecycle-active-ledger-consolidation.md)。以后新增 private-platform 清理证据时，active 层只更新本文件的分类结论；过程证据进入 `docs/history/**` 或对应 repo 的 status / gap plan。

## 当前 Clean Truth

当前 OPL 标准智能体集合按三层读取：

- `OPL Framework` 持有通用 provider runtime、stage attempt、typed queue、attempt ledger、retry/dead-letter、generic transition runner、workspace/source/artifact/memory locator、generated surface、operator/App workbench shell、Agent Lab 和 lifecycle/projection ledger。
- `MAS`、`MAG`、`RCA` 是 active Foundry Agents，分别持有医学研究、基金申请、视觉交付的 domain truth、quality/export verdict、artifact authority、memory accept/reject、owner receipt、typed blocker 和 direct app skill path。
- `opl-meta-agent` 是 OPL-compatible Foundry Agent / builder agent。它持有 agent-building semantics、candidate package/work-order/proposal materialization refs；OPL Framework 仍持有 registry、Agent Lab、generated interfaces、promotion gate、runtime、queue 和 App shell。

Fresh code scan 显示，OPL 当前已有对应的 generic platform classifier 和 scaffold/conformance surface：`opl agents platform-surfaces --family-defaults --json`、`opl agents conformance --family-defaults --json`、`opl agents legacy-cleanup apply ...`、`standard-domain-agent-conformance*`、`agent-platform-surface-ownership.ts`、`runtime-tray-app-operator-drilldown*` 和 `family-runtime-command-parts/*`。这些是 OPL 的 owner surface；它们只输出 classification、migration gate、read model、cleanup ledger 或 refs-only route，不生成 domain ready、quality verdict、artifact authority 或 production ready。

`opl agents default-callers --family-defaults --json` 是当前 generated/hosted default-caller readiness primitive。它读取 `agents interfaces` 的 active-caller target / cutover proof 和 `agents platform-surfaces` 的 private-owner guard，输出每个标准 agent 的 generated CLI/MCP/Skill/product-entry/status/session/sidecar/workbench surface 是否已具备 OPL replacement / active-caller cutover 结构证据。该 report 只关闭 deletion gate 中的 structural replacement evidence；domain owner receipt 或 stable typed blocker、no-forbidden-write proof、tombstone/provenance refs 和实际物理删除授权仍必须由对应 domain repo owner 提供。当前 report 还为每个 surface 输出 `opl_default_caller_surface_deletion_evidence_worklist`，把 replacement parity、active caller cutover、domain owner receipt / typed blocker、no-forbidden-write proof 与 tombstone/provenance ref 拆成可消费的 per-surface gate；这些 worklist 是 OPL-owned 退役执行读面，不签 domain owner receipt，也不授权 domain repo 物理删除。

同期新增的 `family-runtime intake|tick --hydrate`、domain-dispatch / external-evidence receipt 和 App/operator drilldown 也只属于 refs-only queue、projection 与 evidence accounting 面。它们关闭的是 owner-route handoff、workorder accounting 或读模型入口，不把 MAS/MAG/RCA 的真实 verdict、artifact authority、memory body 或 production soak 迁到 OPL。

当前没有发现应把 MAS/MAG/RCA 的 domain truth 或 quality verdict 迁入 OPL 的 surface。风险集中在仍有 active caller 的大型 repo-local handler / projection / sidecar / script 面容易被误读成私有平台。治理动作是先分类，再按 OPL replacement parity、active caller cutover、domain receipt parity、focused tests、no-forbidden-write proof 和 tombstone/provenance gate 迁移、删除或保留为最小 authority function。

## 分类词表

| class | 含义 | 迁移口径 |
| --- | --- | --- |
| `domain_authority_retained` | 必须留在 domain repo 的 truth / verdict / artifact / memory / owner receipt / typed blocker / native helper authority。 | 不迁 OPL；只收窄接口、receipt 和 guard。 |
| `opl_framework_migration_candidate` | 当前由 domain repo 手写，但长期 owner 应是 OPL generated/hosted surface 或 shared runtime primitive。 | 等 OPL replacement parity、active caller cutover、domain receipt parity、focused tests、no-forbidden-write proof 后迁移或删除。 |
| `already_thin_adapter` | 已收薄为 refs-only adapter、diagnostic、projection 或 tombstone，但因 direct/domain/diagnostic caller 暂留。 | 保持不扩写；caller 清零且 OPL parity 成立后 tombstone 或删除。 |
| `needs_split_before_migration` | 同一文件混有 domain authority 与 generic platform shell，迁移前必须先按 owner 子域拆清。 | 先拆成 authority / adapter / projection / generic shell，再分别处理。 |

## OPL-Owned Generic Subdomains

| generic subdomain | OPL owner surface | Domain allowed role | 当前治理重点 |
| --- | --- | --- | --- |
| Generated CLI / MCP / Skill / product shell | Pack compiler、generated interface bundle、`agents interfaces`、`agents conformance` | Domain handler target 或 refs-only adapter | 生产默认 caller 和 direct/hosted parity；domain repo 不再扩写手写 wrapper。 |
| Generated / hosted default caller readiness | `agents default-callers`、`opl_default_caller_surface_deletion_evidence_worklist` | Domain handler target 或 refs-only adapter | 只证明 OPL replacement / active caller cutover，并列出 per-surface 删除证据缺口；物理删除还需要 domain receipt、no-forbidden-write 和 tombstone/provenance。 |
| Sidecar dispatch shell | OPL generated sidecar descriptor、typed queue transport、domain-dispatch read model | Domain handler target、owner receipt / typed blocker producer | OPL 只承载 dispatch transport 和 refs-only ledger；domain action 仍在 domain。 |
| Action metadata / command registration | `agent-platform-surface-ownership.ts`、action catalog、stage control plane | Domain action ids、handler refs、forbidden-write policy | 旧 guarded action catalog 只能作为 declarative pack source 或 thin adapter。 |
| Status / workbench / operator shell | App/operator drilldown、runtime tray、generated status surface | Refs-only projection adapter | Domain repo 不再维护 generic workbench owner；只提供 truth refs 和 blockers。 |
| Workspace / source / artifact / memory locator | Generic substrate projection、lifecycle/index primitives | Opaque ref provider、domain body owner | OPL 只管 locator/ref/transport；body、verdict、mutation authority 留 domain。 |
| Stage attempt / queue / retry / dead-letter | Temporal provider、family runtime、attempt ledger | Owner receipt、typed blocker、domain authority callable | Domain repo 不内置 generic scheduler/daemon/attempt loop。 |
| Generic transition runner | Family transition runner、stage graph route runtime | Transition spec 或 oracle ref | OPL 执行 spec/transport；domain owns route truth、guard 和 verdict。 |

## Per-Agent Migration Ledger

| agent | 当前保留 authority | 主要 migration candidates | 当前处置 |
| --- | --- | --- | --- |
| `MAS` | Study truth、publication quality、source readiness、artifact/package authority、AI reviewer judgment、owner receipt、typed blocker。 | CLI/MCP/product wrapper、runtime watch shell、outer-loop generic runner pieces、workspace/source intake shell、status/read-model assembly、runtime transport、lifecycle store、progress portal/workbench、sidecar adapter。 | 继续按 MAS ideal/gap plan 做 physical thinning。Active-path generic residue 必须在 no-active-caller、OPL parity 和 MAS receipt parity 后 delete/archive/tombstone。 |
| `MAG` | Fundability / authoring quality / export verdict、grant strategy memory body / accept-reject、package authority、transition oracle、owner receipt、typed blocker。 | Product-entry/status/sidecar/grouped CLI shell、product user-loop route-command shell、runtime report locator shell、runtime registration、lifecycle/package/memory projection envelope、autonomy loop shell、source-layout/scaffold scan/read-model shell。 | Main 已有 autonomy controller split；后续只迁移 generic shell，不迁 grant verdict、package authority 或 route truth。 |
| `RCA` | Source readiness、visual direction、review/export verdict、artifact authority、visual memory accept/reject、native helper implementation、owner receipt、typed blocker。 | Product-entry/session/status/sidecar/MCP wrapper、guarded action metadata wrapper、runtimeWatch/operator evidence/stability read model、workspace/run envelope、native-helper generic envelope、review/repair transport、artifact gallery/handoff shell。 | Legacy physical cleanup 已闭合；继续做 naming hygiene 与 production evidence tail，旧 `managed` 命名只留 history/tombstone。 |
| `OPL Meta Agent` | Agent-building semantics、candidate package/work-order/proposal materialization refs、target-agent typed blocker refs。 | Script-level materializers、bootstrap contract pack writer、external suite work-order/blocker output assembly。 | 保持为 target-agent generic materializer；Agent Lab runner、registry、promotion gate、App/workbench 与 target-domain owner authority 均留在 OPL 或目标 repo。 |

## High-Risk Surface Groups

| group | examples | class | migration gate |
| --- | --- | --- | --- |
| MAS runtime / watch / outer loop | `study_outer_loop*`、`runtime_transport/*`、runtime watch / SLO projection | `opl_framework_migration_candidate` / `already_thin_adapter` | OPL provider/queue parity、real paper-line receipt parity、no-forbidden-write proof；MAS 只保 owner receipt / typed blocker bridge。 |
| MAS status / portal / workbench | `study_progress*`、`progress_portal_parts/*`、`product_entry_parts/manifest*` | `opl_framework_migration_candidate` | OPL App/status/workbench default caller parity；不读取 review body，不生成 publication/source/artifact verdict。 |
| MAS workspace/source intake | `workspace_init*` | `opl_framework_migration_candidate` | OPL workspace/source/lifecycle primitive parity；MAS 保留 source readiness 与 workspace policy authority。 |
| MAG product / user-loop / status shell | `product_entry_parts/*`、`loop_contracts*`、`consumer_thinning*` | `already_thin_adapter` with migration gate | OPL generated/default caller parity、owner receipt / typed blocker roundtrip、no-forbidden-write proof；grant route truth 和 quality/export authority 不迁。 |
| MAG autonomy loop shell | `grant_autonomy_controller*`、`grant_autonomy_loop*` | `needs_split_before_migration` until thin | Direct handler 保持薄；generic attempt lifecycle / operator report shell 是 OPL candidate；grant route policy 和 verdict 留 MAG。 |
| RCA sidecar / manifest / guarded actions | `product-sidecar*`、manifest/status builders | `already_thin_adapter` / `opl_framework_migration_candidate` | OPL generated sidecar/default caller parity；RCA 只保 visual authority action ids 和 domain handler refs。 |
| RCA skeleton / locator / native helper | `standard-domain-agent-skeleton*`、native PPT helpers | mixed | Generic skeleton / locator / controlled attempt shell 可上收；visual memory accept/reject、native PPT implementation 和 review/export verdict 留 RCA。 |
| OMA script materializers | `scripts/*agent*`、`scripts/lib/*materializer*`、bootstrap pack writers | `already_thin_adapter` | OPL Agent Lab work-order readiness、target-owner return、promotion gate read model parity 后再删除或 fixture 化；不写 target truth。 |

## Current Primitive Gaps

- Generated CLI/MCP/Skill/product-entry/status/workbench caller must become production/default caller with direct/hosted parity evidence, not just descriptor readiness. `opl agents default-callers --family-defaults --json` now provides OPL-owned structural replacement evidence and per-surface deletion evidence worklists, but it still does not authorize physical deletion without domain receipts, typed blockers, no-forbidden-write proof and tombstone/provenance refs.
- Generic sidecar dispatch shell and typed queue transport need domain owner receipt roundtrip and no-forbidden-write proof across MAS/MAG/RCA.
- Generic App/workbench stage-review, executor conversation and status projection lanes must consume refs without reading bodies or generating domain verdicts.
- Generic workspace/source/artifact/memory locator must provide same-ref parity while leaving body and verdict in domain repos.
- Generic private-platform cleanup-gate registry must consume the default-caller per-surface deletion evidence worklists and domain owner receipts without claiming physical deletion before owner authorization.
- Generic scaffold/source-layout and legacy active-path scan primitive must not turn descriptor readiness into production/domain readiness.
- Agent Lab / OMA handoff vocabulary must remain target-agent generic; domain-specific suite/command families belong in target owner refs or history.

## Verification

Docs-only inventory updates:

- `git diff --check`
- `rg -n '<<<<<<<|>>>>>>>' docs`
- targeted stale wording scan for `compatibility alias`、`provider proof = ready`、`generated surface = domain ready` and old Gateway/frontdoor/Hermes-default wording outside `docs/history/**`

When this inventory drives code or contract changes, use the owning repo verification rather than Markdown wording tests:

- OPL: `npm run test:fast`, `npm run test:meta`, focused conformance/platform-surface tests.
- MAS: `scripts/verify.sh` or focused tests listed in MAS repo-local gap plan.
- MAG: `scripts/verify.sh`, `make test-meta`, focused product-entry/autonomy tests.
- RCA: `npm run test:fast` or focused product-entry/sidecar/native helper tests.
- OMA: `npm test`, `npm run typecheck`.

## Forbidden Claims

- Descriptor ready, conformance passed, generated bundle ready, queue completion, suite pass, file existence or test pass cannot be written as domain quality verdict.
- OPL ledger receipt, stage evidence workorder, provider proof or App drilldown projection cannot be written as MAS paper closure, MAG grant-ready, RCA visual-ready or OMA default promotion.
- The same executor cannot execute and then self-review to close an AI-first quality gate.
- Active caller not migrated means OPL has not fully taken over that surface, even if a replacement descriptor exists.
