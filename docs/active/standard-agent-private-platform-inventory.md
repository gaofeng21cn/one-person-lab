# OPL 标准智能体私有平台化 inventory

Owner: `One Person Lab`
Purpose: `cross_repo_private_platform_inventory`
State: `active_inventory`
Machine boundary: 本文是跨 repo 人读治理总账。机器真相继续归 OPL `contracts/`、CLI/API 行为、provider receipt、domain-owned contracts、sidecar/manifest projection、真实 workspace receipt 与各 domain agent owner receipt。
更新时间：`2026-05-21`

## 当前 clean truth

当前 OPL 标准智能体集合按三层读取：

- `OPL Framework` 持有通用 provider runtime、stage attempt、typed queue、attempt ledger、retry/dead-letter、generic transition runner、workspace/source/artifact/memory locator、generated surface、operator/App workbench shell、Agent Lab 和 lifecycle/projection ledger。
- `MAS`、`MAG`、`RCA` 是 active Foundry Agents，分别持有医学研究、基金申请、视觉交付的 domain truth、quality/export verdict、artifact authority、memory accept/reject、owner receipt、typed blocker 和 direct app skill path。
- `opl-meta-agent` 是 OPL-compatible Foundry Agent / builder agent。它持有 agent-building semantics、candidate package/work-order/proposal materialization refs；OPL Framework 仍持有 registry、Agent Lab、generated interfaces、promotion gate、runtime、queue 和 App shell。

本轮 fresh scan 的结论是：没有发现应立即把 domain truth 或 quality verdict 迁入 OPL 的 surface；真正的风险集中在“仍有 active caller 的大型 repo-local handler / projection / sidecar / script 面容易被误读成 domain 私有平台”。这些 surface 当前必须按 `domain_authority_retained`、`opl_framework_migration_candidate`、`already_thin_adapter` 或 `needs_split_before_migration` 台账化，后续只在 OPL primitive、active caller cutover、owner receipt parity 与 no-forbidden-write proof 齐全后迁移、删除或 tombstone。

## 分类词表

| class | 含义 | 迁移口径 |
| --- | --- | --- |
| `domain_authority_retained` | 必须留在 domain repo 的 truth / verdict / artifact / memory / owner receipt / typed blocker / native helper authority。 | 不迁 OPL；只收窄接口、receipt 和 guard。 |
| `opl_framework_migration_candidate` | 当前由 domain repo 手写，但长期 owner 应是 OPL generated/hosted surface 或 shared runtime primitive。 | 等 OPL replacement parity、active caller cutover、domain receipt parity、focused tests、no-forbidden-write proof 后迁移或删除。 |
| `already_thin_adapter` | 已收薄为 refs-only adapter、diagnostic、projection 或 tombstone，但因 direct/domain/diagnostic caller 暂留。 | 保持不扩写；caller 清零且 OPL parity 成立后 tombstone 或删除。 |
| `needs_split_before_migration` | 同一文件混有 domain authority 与 generic platform shell，迁移前必须先按 owner 子域拆清。 | 先拆成 authority / adapter / projection / generic shell，再分别处理。 |

## High-risk private implementation list

| repo | surface | lines | class | active caller | 当前实际职责 | 必须保留的 authority | 可迁往 OPL 的 generic 子域 | 迁移/退役门槛 | 推荐验证入口 |
| --- | --- | ---: | --- | --- | --- | --- | --- | --- | --- |
| MAS | `src/med_autoscience/cli.py` | 1391 | `opl_framework_migration_candidate` | MAS direct CLI、MCP lazy controller、product/runtime/source/delivery command dispatch | 手写 CLI 聚合器与 direct domain command router | MAS direct skill target、domain handler dispatch、AI-first validator、owner receipt / typed blocker reader | generated CLI/MCP/Skill/product-entry/status/workbench shell | OPL generated shell default 化；direct MAS receipt parity；无旧 alias/facade active caller；no-forbidden-write proof | `scripts/verify.sh`；CLI / product-entry focused tests |
| MAS | `src/med_autoscience/controllers/study_outer_loop.py` | 1188 | `needs_split_before_migration` | study outer loop / runtime status / controller transition tests | paper autonomy outer-loop、publication gate、controller work-unit route | study truth、publication gate、AI reviewer routeback、artifact authority refs | generic stage loop shell、attempt/queue/retry/dead-letter、operator progress shell | domain transition table parity、owner receipt parity、OPL stage attempt parity、focused tests | `tests/test_study_outer_loop*.py` |
| MAS | `src/med_autoscience/controllers/workspace_init.py` | 1182 | `opl_framework_migration_candidate` | workspace init CLI/MCP/product setup | workspace/source intake 与 repo/workspace lifecycle bootstrap | source readiness verdict、study charter/source truth interpretation | generic workspace locator/source intake/lifecycle shell | OPL locator/index parity；MAS source-readiness authority tests；no checkout artifact pollution | `tests/test_workspace_init.py` |
| MAS | `src/med_autoscience/controllers/mainline_status.py` | 1085 | `needs_split_before_migration` | mainline status action、product-entry/status projection | status/read-model 聚合，混合 study/runtime/domain route refs | study/runtime truth refs、publication route/readiness authority refs | generic status shell、App/operator read-model projection | split authority refs from generic projection shell；OPL App parity；focused status tests | mainline/status focused tests |
| MAS | `src/med_autoscience/controllers/runtime_live_console_ui.py` | 999 | `opl_framework_migration_candidate` | runtime live console / operator UI | repo-local console/workbench display | MAS runtime health interpretation、safe action refs | App/workbench display shell、operator UI | OPL App/workbench live parity；no active generic display caller | runtime live console tests / App drilldown proof |
| MAS | `src/med_autoscience/controllers/sidecar_family_adapter.py` | 994 | `already_thin_adapter` | sidecar export/dispatch、OPL handoff | refs-only sidecar/domain dispatch adapter | owner receipt、typed blocker、domain handler target | generated sidecar wrapper、typed queue transport | OPL generated sidecar default；MAS receipt parity；no forbidden writes | `tests/test_cli_cases/sidecar_family_adapter_command.py` |
| MAS | `src/med_autoscience/runtime_transport/mas_runtime_core_turns.py` | 993 | `already_thin_adapter` | runtime transport diagnostic/domain receipt caller | turn runner / owner receipt bridge | MAS owner receipt adapter、guarded apply / typed blocker bridge | worker residency、stage attempt transport、retry/dead-letter | active caller 0 或 migrated; OPL provider parity; real paper-line receipt parity | `tests/test_runtime_transport_mas_runtime_core.py` |
| MAS | `src/med_autoscience/runtime_protocol/runtime_lifecycle_store.py` | 985 | `already_thin_adapter` | lifecycle CLI/read model/sidecar projection | SQLite/file lifecycle refs sidecar | restore/retention receipt refs、locator refs | generic persistence/lifecycle index | OPL lifecycle index parity；domain receipt parity；focused lifecycle tests | `tests/test_runtime_lifecycle_store.py` |
| MAG | `src/med_autogrant/product_entry_parts/manifest_builder.py` | 987 | `needs_split_before_migration` | product-entry manifest/status/direct entry | product/status/workbench/sidecar/runtime registration manifest assembly | grant truth refs、quality/export/package authority refs、owner receipt refs | generated manifest/status/workbench shell | split manifest assembly from grant authority refs; OPL generated caller evidence; direct/hosted parity | product-entry manifest/status tests |
| MAG | `src/med_autogrant/grant_autonomy_controller.py` | 961 | `needs_split_before_migration` | grant autonomy controller, sidecar guarded action | route/budget/reselection/rollback/autonomy loop policy | grant route truth、typed blocker、budget policy、owner receipt | scheduler/watch/loop shell, generic attempt lifecycle | AI-first review evidence; no scheduler owner claim; active caller cutover before deletion | `tests/test_grant_autonomy_controller.py` |
| MAG | `src/med_autogrant/product_entry_parts/sidecar.py` | 911 | `opl_framework_migration_candidate` | `product sidecar export|dispatch` | sidecar export、guarded dispatch、stage/memory/lifecycle receipt dispatch | package authority、memory accept/reject receipt、owner receipt、typed blocker | generated sidecar wrapper、typed queue dispatch shell | OPL sidecar wrapper default；owner receipt roundtrip；no-active compatibility alias | `tests/product_entry_cases/test_sidecar.py` |
| MAG | `src/med_autogrant/product_entry_parts/consumer_thinning*.py` | 954 / 909 / 901 | `already_thin_adapter` | product manifest/sidecar/audit contracts | consumer-thinning / functional privatization read model | retained grant authority taxonomy | OPL functional audit projection shell | keep refs-only; no expansion into runtime owner | `make test-meta` |
| MAG | `src/med_autogrant/cli.py` | 620 | `opl_framework_migration_candidate` | direct MAG CLI | grouped CLI dispatch | direct domain entry / handler target | generated CLI/MCP/product shell | generated caller parity；no old alias/facade | `tests/product_entry_cases/test_cli_dispatch.py` |
| RCA | `packages/redcube-gateway/src/actions/product-sidecar-guarded-actions.ts` | 1121 | `needs_split_before_migration` | product sidecar guarded actions | owner receipt、memory/lifecycle、visual transition、operator evidence、stability projection | visual owner receipt、artifact mutation authorization、memory/lifecycle receipt、typed blocker | generated sidecar dispatch shell、generic lifecycle/review transport | split guarded visual authority from generic sidecar action assembly; OPL sidecar parity | `npm run test:fast` focused sidecar/action tests |
| RCA | `packages/redcube-gateway/src/actions/product-sidecar.ts` | 1008 | `opl_framework_migration_candidate` | product sidecar export/dispatch | refs-only sidecar export and dispatch surface | visual action metadata、domain handler target、owner receipt refs | generated sidecar wrapper、typed queue transport | OPL wrapper default; RCA receipt roundtrip; no compat alias | `tests/product-entry-cases/runtime-and-sidecar-surfaces.test.ts` |
| RCA | `packages/redcube-gateway/src/actions/get-product-entry-manifest.ts` | 943 | `opl_framework_migration_candidate` | product-entry manifest/status/projection | product-entry/generate manifest aggregation | route truth refs、visual authority refs | generated product/status/workbench manifest shell | generated shell production/default caller; direct route parity | product-entry manifest tests |
| RCA | `packages/redcube-gateway/src/actions/standard-domain-agent-skeleton.ts` | 940 | `already_thin_adapter` | OPL pack / skeleton contract tests | skeleton mapping / descriptor projection | RCA semantic pack refs | OPL scaffold/generator owner | keep as current contract mapping until OPL source fully owns generated skeleton | `tests/opl-agent-pack-contracts.test.ts` |
| RCA | `packages/redcube-runtime-protocol/src/executor-runtime.ts` | 722 | `opl_framework_migration_candidate` | executor runtime protocol / route tests | executor adapter and runtime protocol contract | selected executor route refs, service-safe domain entry | generic executor adapter envelope | OPL executor adapter parity; no behavior equivalence claim | runtime protocol tests |
| RCA | Python native helpers under `python/redcube_ai/native_helpers/ppt_deck/*.py` | 804-881 | `domain_authority_retained` | native PPT/review/export route | PPT/native screenshot/layout/export implementation | native helper implementation, visual review/export support | generic native-helper envelope only | do not migrate implementation; only envelope can move to OPL | native helper tests |
| OMA | `scripts/agent-evidence-takeover.ts` | 1075 | `needs_split_before_migration` | `npm run agent:evidence` | target-agent production evidence suite/work-order/proposal materializer | agent-building work-order materialization refs | Agent Lab runner, promotion gate, queue/attempt ledger | split reusable work-order policy; keep script as materializer; no target truth writes | `npm test`, `npm run typecheck` |
| OMA | `scripts/improve-from-agent-lab-suite.ts` | 1069 | `needs_split_before_migration` | `npm run improve:external-suite` | external suite -> work order/candidate/proposal materializer | target-agent source patch work-order refs | Agent Lab runner, promotion gate, App/workbench shell | split shared policy; no domain-specific command family; independent reviewer gate | `npm test`, `npm run typecheck` |
| OMA | `scripts/bootstrap-sample-agent.ts` | 746 | `already_thin_adapter` | `npm run bootstrap:sample` | sample/real-target smoke helper | candidate package / baseline receipt refs | scaffold/generator, Agent Lab runner | keep as smoke/materializer; migrate policy to pack/contracts when stable | bootstrap loop tests |

## Per-agent migration candidates

MAS candidates: CLI/MCP/product wrapper, runtime watch shell, outer-loop generic runner pieces, workspace/source intake shell, status/read-model assembly, runtime transport, lifecycle store, progress portal/workbench and sidecar adapter. MAS retains study truth, publication quality, source readiness, artifact/package authority, owner receipt and typed blocker.

MAG candidates: product-entry/status/sidecar/grouped CLI shell, runtime registration, lifecycle/package/memory projection envelope, autonomy loop shell, domain runtime substrate naming and control-plane projection. MAG retains fundability/quality/export verdict, grant strategy memory body/accept-reject, package authority, transition oracle, owner receipt and typed blocker.

RCA candidates: product-entry/session/status/sidecar/MCP wrapper, runtimeWatch/operator evidence/stability read model, workspace/run envelope, native-helper generic envelope, review/repair transport and artifact gallery/handoff shell. RCA retains source readiness, visual direction, review/export verdict, artifact authority, visual memory accept/reject, native helper implementation, owner receipt and typed blocker.

OMA candidates: large script-level materializers should keep only developer work-order / candidate / proposal authority refs. Agent Lab runner, registry, generated interface, promotion gate, App/workbench and target-domain owner authority stay outside the repo.

## Immediate thinning items

1. `opl-meta-agent` script policy split: extract shared target-agent work-order policy and machine closeout refs from large scripts into a named helper module. This reduces duplicate policy gravity without changing target domain authority.
2. MAS `status_and_decision` / `mainline_status` next pass: split domain authority interpretation from generic status/projection assembly before any migration claim.
3. MAG `manifest_builder` / `sidecar` next pass: split manifest aggregation from grant authority refs and keep sidecar dispatch as handler target until OPL generated sidecar is default.
4. RCA `product-sidecar-guarded-actions` next pass: split visual authority actions from generic sidecar/operator evidence assembly; do not touch native helper implementation.

## OPL framework primitive gaps

- Generated CLI/MCP/Skill/product-entry/status/workbench caller must become production/default caller with direct/hosted parity evidence, not just descriptor readiness.
- Generic sidecar dispatch shell and typed queue transport need domain owner receipt roundtrip and no-forbidden-write proof across MAS/MAG/RCA.
- Generic status/read-model and App workbench shell need refs-only consumption of domain status without verdict generation.
- Generic lifecycle/session/artifact/source locator must provide parity for workspace/source/artifact/memory refs while leaving body and verdict in domain repos.
- Generic transition/state-machine runner must consume domain transition specs/cases without executing domain action or declaring quality readiness.
- Agent Lab / OMA handoff vocabulary must remain target-agent generic; domain-specific suite/command families belong in target owner refs or history only.

## Recommended worktree implementation plan

1. Create isolated worktrees per repo from current `main`; do not use shared root checkout for implementation.
2. Land inventory docs first: OPL cross-repo total, then MAS/MAG/RCA/OMA repo-local tables.
3. Make one low-risk natural split only where policy is duplicated and not business truth: OMA shared work-order policy helper.
4. Run docs/meta/focused verification per repo: OPL `npm run test:fast` or focused conformance if code changes; MAS `git diff --check` for docs-only and `scripts/verify.sh` if code/contract changes; MAG `scripts/verify.sh` / `make test-meta` if machine surface changes; RCA `scripts/verify.sh` or focused product-entry/sidecar tests; OMA `npm test` and `npm run typecheck`.
5. Merge each worktree back to its repo `main`, then remove worktree and branch. Do not push or claim production readiness without explicit fresh evidence.

## Forbidden claims

- Descriptor ready, conformance passed, generated bundle ready, queue completion, suite pass, file existence or test pass cannot be written as domain quality verdict.
- OPL ledger receipt, stage evidence workorder, provider proof or App drilldown projection cannot be written as MAS paper closure, MAG grant-ready, RCA visual-ready or OMA default promotion.
- The same executor cannot execute and then self-review to close an AI-first quality gate.
- Active caller not migrated means OPL has not fully taken over that surface, even if a replacement descriptor exists.
