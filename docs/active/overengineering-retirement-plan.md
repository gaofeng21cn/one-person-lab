# OPL 过度设计退役与收薄计划

Owner: `One Person Lab`
Purpose: `active_cleanup_plan`
State: `active_plan`
Machine boundary: 本文是人读规划与执行地图。机器真相继续归 `contracts/`、source、CLI/API 行为、runtime ledger、provider receipt、package lock、domain-owned manifest 和 repo-native verification。

## 目标读法

本轮目标不是削弱 OPL，而是把 OPL 收回到标准平台边界：Framework 持有通用 runtime、package lifecycle、generated/hosted surface、projection、receipt 和 refs-only control plane；App 负责 cockpit 与用户操作；domain agent 继续持有领域 truth、quality verdict、artifact authority、owner receipt、typed blocker 和 human gate。

完成口径按功能/结构与证据分账：

- 功能/结构完成：active caller 已迁移、重复 wrapper/facade 已删除或 tombstone、package/runtime/observability/test surface 回到 owner 边界，repo-native tests 通过。
- 后置证据：真实 App release、live provider long-soak、domain owner-chain scaleout、Brand L5、真实 package install/uninstall/rollback evidence 另账验收。docs、contract pass、focused tests 或 dry-run readback 不能声明 release-ready、domain-ready 或 production-ready。

## 模块定位

| 模块 | 保留职责 | 收薄方向 | 禁止承担 |
| --- | --- | --- | --- |
| `OPL Connect` | Agent Package registry / manifest / lock / lifecycle receipt；Skill / connector / external descriptor 分发；provider refs 与 no-authority receipt。 | 保留 Agent Package Manager，但拆成 package core 与 carrier adapter。Package core 只管 `id/version/digest/dependencies/trust/lock/lifecycle receipt/exposure/shortcut`；carrier adapter 只负责 Codex Plugin、OPL App、Capability Pack、MCP/Web/native 等物理投影。 | 不做通用私有 package manager；不写 domain workflow、prompt body、artifact schema、quality verdict、owner receipt 或 runtime authority。 |
| `OPL App` / `OPL Console` | cockpit、安装/更新/回滚操作、权限/审批、read-model 展示、operator action refs。 | 只消费 Framework package/runtime/action refs；缺 ref 时显示不可执行或需要 owner action。 | 不 hard-code MAS/MAG/RCA 语义；不拥有 package truth、domain truth 或 runtime dependency truth。 |
| `OPL Runway` | Temporal-backed durable stage run、attempt、lease、retry/dead-letter、execution authorization、repair/readiness projection。 | Durable lifecycle 只保 Temporal/provider 路径；本地 queue/SQLite 仅做 dev/CI diagnostic、projection 或 readback cache。 | 不保留第二套 scheduler / dedupe / attempt authority。 |
| `OPL Ledger` | refs-only evidence、lineage、receipt/blocker refs、OpenTelemetry-compatible observability projection。 | 观测字段优先映射 OpenTelemetry semantic conventions；只保 OPL authority refs 和 audit packet。 | 不自建独立 observability truth ledger；不把 telemetry clean 写成 ready。 |
| `OPL Stagecraft` / `OPL Pack` | declarative pack、stage prompt policy、capability ABI、generated/hosted surface。 | 删除只为历史 alias 存在的 one-line wrappers；active caller 直连 owner module public entry。 | 不保留兼容 facade 来维持旧路线。 |
| tests / fixtures | 验证 machine-readable contract、CLI/API 行为、runtime projection 与 no-authority guard。 | 超大 narrative / alias / tombstone assertions 合并成 semantic fixtures；删除重复实现细节测试。 | 不用测试固定 prose wording、历史文档章节或兼容 alias。 |

## 落地清单

| 优先级 | 项 | 动作 | 验证 |
| --- | --- | --- | --- |
| P0 | Agent Package Manager 边界 | 保留 `connect agent-packages`，把 docs/source 中的读法改成 `package core + carrier adapters`；Codex Plugin 只是 carrier 之一；OPL App 管理 package，但不拥有 package/domain semantics。 | `npm run test:fast` 或 touched package tests；`./bin/opl connect agent-packages ... --json` shape 不回归；docs/contract 不出现 Codex Plugin-only 读法。 |
| P0 | 一行 wrapper / re-export | 迁移 active imports 后删除无语义 wrapper，例如 Console management/runtime/workspace、stage-run cockpit、runway family runtime id 等只转发文件。 | `rg` 无 active import 指向退役 wrapper；`npm run typecheck`；source-module strict import/cycle gate。 |
| P1 | Runway local scheduler / queue tail | 标记并收薄重复 durable lifecycle；保留 local provider/dev diagnostic，不再和 Temporal 并列为 production lifecycle truth。 | focused runtime tests；readback false-ready flags；不删除仍被 dev/CI 使用的 local diagnostic。 |
| P1 | Ledger observability tail | 将私有 drilldown/ledger 字段收敛到 OTel-compatible event/ref projection；保留 OPL receipt refs。 | focused ledger/observability tests；no domain authority write proof。 |
| P2 | 测试与 fixture surface | 审计完成：active/history docs prose 固定断言已删除；剩余过长测试文件已按行为簇拆分为小型 case modules；MAS activity 中的可变 next-step prose 断言收薄为 route/ref 语义 guard。 | focused P2 tests + `npm test`；`npm run line-budget` 仅剩非 P2 source advisory；不声明 runtime/domain/App release ready。 |

## P0 Agent Package Manager 边界执行记录

- `2026-07-06`：`src/modules/connect/agent-package-registry.ts` 完成 source surface 收薄，主文件只保留 CLI/public runner 编排与 package lock 应用流程；已成簇的类型、常量、manifest/registry 校验、fetch/shared helpers、payload materialize、physical Codex carrier、lock/lifecycle、readback 与 Home shortcut 状态读取迁入 `src/modules/connect/agent-package-registry-parts/`。未新增 package manager 语义、未改 `connect agent-packages` public exports，Codex Plugin 仍只是 carrier adapter。
- `2026-07-06` 验证证据：`node --experimental-strip-types --test tests/src/cli/cases/connect-agent-packages.test.ts` 11/11 通过；`npm run typecheck` 通过；`npm run --silent line-budget -- --list` 不再列出 `src/modules/connect/agent-package-registry.ts`。本记录只证明结构收薄与 focused package behavior 未回归，不声明 App release、runtime currentness、domain owner-chain 或 production readiness。
- `2026-07-06`：Agent Package App/Console action surface 收敛到 `src/modules/connect/agent-package-actions.ts` 的 canonical package action catalog；`action-execute.ts`、Settings Control Center catalog 与 `app_state.actions` 消费同一组 package lifecycle/action refs。保留 OPL App 对 agent packages 的管理能力：refresh、install、update、repair、rollback、uninstall、hide/unhide、enable/disable 与 Home shortcut preference 仍通过 Framework package lock、lifecycle receipt、exposure/shortcut refs 执行；App/Console 不再手写第二套 package lifecycle 文案或把 Codex Plugin carrier 当成 package truth。
- `2026-07-06`：Connect 文档与 modular distribution 文档已固定 `Agent Package Core + carrier adapters + owner route readback`：Codex Plugin/local marketplace、OPL App shortcuts、workflow profile、runtime/app release 都是 carrier 或 owner surfaces；Managed Update 只做 owner route、component receipt、safe action refs 和 readback projection，不是私有 package manager。
- `2026-07-06` 追加验证证据：clean detached verification worktree at `caaee2b29` 上 `node --experimental-strip-types --test tests/src/cli/cases/connect-agent-packages.test.ts tests/src/cli/cases/app-action.test.ts tests/src/cli/cases/app-state-cases/settings-control-center.test.ts tests/src/cli/cases/scholarskills-connect.test.ts` 为 `28/28` 通过；`npm run typecheck` 通过；`npm test` smoke 为 `92/92` 通过；`git diff --check origin/main..HEAD` 通过。该证据只支撑非 live 结构/行为落地，不声明真实 App release、installed-user-path、Codex reload、provider long-soak、owner-chain scaleout 或 production readiness。

## P1 Runway local scheduler / queue tail 执行记录

- `2026-07-06`：完成 active caller proof。`family-runtime scheduler tick` active path 只接受 `--provider temporal`；`runSchedulerTick` / `runSchedulerQueueTick` 仍被 Temporal activity、control-loop、provider-hosted-attempts 与 provider SLO tests 调用，不能删除。`family-runtime-queue-projection-boundary.ts`、`family-runtime-store.ts`、`family-runtime-enqueue.ts`、`existing-dedupe-*` 仍是 active queue intake / projection / idempotency guard，不能物理删除，只能保留为 local projection、dev/CI diagnostic 与 operator readback cache。
- `2026-07-06`：收薄剩余 false-ready readback：`runtime observability-export` 不再把 `local_sqlite` 的 diagnostic readiness 输出成 `opl_provider_ready=1`。JSON readback 保留 `diagnostic_provider_ready=true`，但 `provider_ready=false`、`local_sqlite_counts_as_provider_ready=false`；OpenMetrics 对 `provider_kind="local_sqlite"` 输出 `opl_provider_ready 0`。
- `2026-07-06`：`existing-dedupe-reconcile.ts` 删除重复 current-control admission authority-boundary 字面量，改为单一 helper；不改变 queue/dedupe 行为，只减少本地 queue tail 的重复声明面。该文件退出 `1000` 行 advisory，保留 active idempotency / currentness guard 职责。
- `2026-07-06`：Runway scheduler tick readback 继续收薄：旧 pickup-SLO 式读法改为 `queue_projection_bridge`，Temporal scheduler activity compact receipt 与 payload history policy 同步只保 projection/audit 计数；`opl_scheduler_tick_completed` event 不再落容易被读成 lifecycle progress truth 的 queue 顶层计数字段。`runSchedulerQueueTick` 仍是 Temporal cadence/control-loop 的 active bridge，不能在未迁移 caller 前删除。
- `2026-07-06` 追加验证证据：`family-runtime-provider-slo.test.ts` 11/11、`family-runtime-provider-hosted-attempts-cases/mas-default-executor-queue-projection-bridge.ts` 4/4、`family-runtime-provider-hosted-attempts.test.ts` 117/117、`npm run typecheck`、`git diff --check` 均通过。该证据只证明 scheduler/Temporal readback 收薄与 focused behavior 未回归，不声明 external Temporal production readiness。
- `2026-07-06` 验证证据：`runtime-observability-export.test.ts` 6/6、`family-runtime-cases/provider-repair.ts` + `status-lifecycle.ts` 11/11、`family-runtime-queue-guards.test.ts` 17/17、`family-runtime-provider-slo.test.ts` 11/11、`npm run typecheck`、`git diff --check`、`npm test` smoke 86/86 均通过。
- 当前完成口径：P1 本轮关闭的是 local SQLite/queue 在 observability readback 中被误读为 provider-ready 的剩余安全项；未修改 runtime ledger 数据、provider external state、domain truth 或 App release verdict。local queue/scheduler/dedupe 的 active code 仍承担 dev/CI diagnostic、projection、readback cache 与 idempotency guard，不能在没有替代 caller 的情况下删除。

## P2 执行记录

- `2026-07-06`：`tests/src/active-path-residue-scan.test.ts` 从 broad active-doc narrative scan 收薄为 source/help 语义 guard；不再把 active docs wording、章节链接、volatile read-model counter 固定为测试接口。
- `2026-07-06`：`tests/src/stale-compat-retirement-guard.test.ts` 删除 docs/history/examples/admission prose 负向断言，保留 compatibility alias、Hermes provider/runtime、contract backend set、Agent Lab authority flag 与 retired helper export 的 machine/source guard。
- `2026-07-06`：`tests/src/cli/cases/connect-agent-packages.test.ts`、`tests/src/cli/cases/app-state-cases/mas-activity.test.ts`、`tests/src/cli/cases/package-distribution.test.ts` 拆为 wrapper + case modules，所有 test/fixture 文件回到 `1000` 行以内；`mas-activity` 删除对可变 next-step 英文/中文 prose 的固定断言，仅保留状态、authority、attempt identity 与 route/ref token guard。
- `2026-07-06`：`app-state-parts/action-execute.ts` 将 dry-run preview builder、settings manual/dry-run builder 与 package/action payload parser 移到邻近 part 文件；执行入口从 `1145` 行降到 `760` 行并退出 line-budget advisory。该拆分只改变文件组织，保留 App action execute 路由、Connect package action 与 Runway dry-run behavior。
- `2026-07-06`：`agent-lab-developer-mode.ts` 删除多行 import 包装后回到 `1000` 行边界；这是纯格式/结构减法，不改变 Agent Lab developer-mode authority policy。
- 当前完成口径：P2 属于测试/fixture surface 结构收薄并已审计完成；验证只能证明本 lane 未降低保留的 machine/source guard，不能证明 live provider、domain owner-chain、App release 或 production readiness。
- 新鲜证据：`npm run --silent line-budget -- --list` 只列出 `src/modules/connect/developer-mode.ts`、`src/entrypoints/cli/cases/public-command-specs-parts/connect.ts` 两个 source advisory，无剩余 over-budget test/fixture 文件；focused P2 wrapper tests 为 `30/30` 通过。
- `2026-07-06`：非 package/update 的 App operator projection 测试继续收薄：summary/OMA/lifecycle/evidence worklist/App release user-path/route-support 测试删除或合并重复 `drilldown` vocabulary、command arrays、局部 projection wrappers 和重复字段链；真实 CLI 命令、route support guard、refs-only authority false-ready guard、runtime protocol fixture 字段保留。
- 当前 scan 证据：`node scripts/reuse-first-scan.mjs --summary` 为 `finding_count=534`、`hard_gate_finding_count=210`、`advisory_finding_count=324`、`undecisioned_finding_count=0`、`phase10-test-and-fixture-projections=387`；剩余 phase10 findings 全部为 `allowed_projection_boundary`，主要是真实 CLI/schema/projection 名、runtime queue protocol fixture 或用户排除的 package/update 项；`node scripts/test-lanes.mjs assert-coverage` 为 `387` 个 active test files assigned；`npm run typecheck` 与 `git diff --check` 通过。

## Test lane registry 收薄执行记录

- `2026-07-06`：删除重复 full-test 并发 wrapper `scripts/run-parallel-test-lanes.sh`、`test:fast:parallel` npm script 和 `fast-parallel` lane。`test:full` 现在直接走 `scripts/test-lanes.mjs run full`，由唯一 test lane registry 顺序调用 fast、fresh-install、structure、typecheck、lint、read-model-gates、meta、regression、integration、artifact 与 native。
- 该收薄只改变本地 full gate 编排方式，不改变各 lane 的验证内容、不声明 release-ready，也不触碰 Managed Update、Agent Packages owner-route 或 package lifecycle 动词面。
- 维护口径同步到 `docs/references/current-support/opl-test-lane-governance.md`：机器真相只剩 `scripts/test-lanes.mjs`、`scripts/verify.sh`、`package.json` 与 GitHub workflow，不再维护第二套 shell wrapper。

## 2026-07-07 overengineering cleanup 执行记录

- `Temporal test-server proof`：`src/modules/runway/family-runtime-temporal-residency-proof.ts` 不再直接 import `@temporalio/testing`。Temporal test-server proof 被移到 `tests/src/runway/temporal-residency-proof-dev-diagnostic.ts`，生产代码只在显式 `OPL_TEMPORAL_TEST_SERVER_PROOF_MODULE` 配置时加载 dev diagnostic module；未配置时 fail-closed 返回 `dev_diagnostic_module_not_configured`。这只关闭 dev/test substrate 进入生产 `src/**` 的过度设计风险，不声明 external Temporal production readiness。
- `JSON receipt ledger`：`src/kernel/json-file.ts` 增加共享 `JsonReceiptLedger` / read / write / upsert helper；brand L5、managed install update、Connect package registry store、App release user-path evidence ledger 改用同一 refs-only receipt ledger 模板，删除重复 read-modify-write 样板。该 helper 只抽取文件型 JSON receipt ledger 机械逻辑，不改变 receipt schema、domain authority 或 owner receipt shape。
- `family-runtime CLI option parsing`：Runway family-runtime queue / scheduler 命令的局部分散 option loop 收到邻近 `parseCliOptions` thin helper。该 helper 保留现有 unknown option 与 error payload 行为；未引入新 CLI framework，也未把业务语义藏入 parser abstraction。
- `oversize tests`：`family-runtime-codex-stage-runner`、`family-runtime-temporal-provider` 和 `app-action` 的超长测试按行为簇拆出 case modules。`node ./scripts/line-budget.mjs --format json` 新鲜读回为 `oversize_count=0`。这只证明 repo-tracked source/test 文件全部回到默认 1000 行结构预算以内，不声明 runtime/domain/App release ready。
- `forbidden write set`：未触碰既有 Pack/brand dirty lane、runtime DB/provider state、domain truth、owner receipts、typed blockers 或 release/currentness claim。

## 2026-07-07 overengineering second-pass 执行记录

- `fallow entrypoint / cycle hygiene`：`.fallowrc.json` 的 stale entrypoint 从旧 `src/cli.ts` / `src/agent-lab.ts` 形态收回真实 `src/entrypoints/**` 与 `src/modules/**` 路径，避免 `hygiene:fallow` 把仍有入口的 source 误报成 dead files；`foreground-paths.ts` 不再 import `family-runtime-store.ts`，改从 `resolveOplStatePaths()` 推导 foreground state path，切断 Runway Temporal provider 的一条薄 wrapper / cycle 尾巴。
- `family-runtime CLI parser tail`：在前序 queue / scheduler 基础上，attempt、provider、service-worker、lifecycle、paper-autonomy、evidence-worklist、stage-artifact 命令也改用既有 `parseCliOptions` helper，删除手写 token loop / index 自增 / unknown option 分散逻辑。`family-runtime-command-parser.test.ts` 覆盖 payload shape 与 unknown option 行为；未引入 commander/yargs 等新框架。
- `JSON scalar helper`：Atlas domain manifest、kernel default caller gates、foundry-lab caller gates 与 Runway continuous proof 改为直接复用 `src/kernel/json-record.ts` 的 `stringValue` / `JsonRecord`。`family-runtime-codex-stage-runner-parts/shared.ts` 删除本地 `optionalString` re-export，stage runner callers 直接从 kernel scalar helper 取值；`json-file.ts` 仅保留 legacy `optionalString` alias 以支撑现有 public imports。
- `scope guard`：本 second pass 只关闭结构/源码层过度设计尾巴；`hygiene:fallow` 仍可能因真实动态入口、exports-only surface、package/update sibling lane 或历史 provenance 报非零，不能把 fallow 全绿当作本轮硬门，也不能按旧 466 dead-files 读数直接物理删除。

## 完成度审计

| 条目 | 状态 | 完成度 | 新鲜证据口径 | 剩余缺口 |
| --- | --- | ---: | --- | --- |
| Agent Package Manager 边界 | done | 100% | package registry source split、canonical package action catalog、Settings/App action readback、Connect docs 与 modular distribution docs 已进入 `main`；clean verification worktree 上 focused Agent Package/App/Settings/ScholarSkills tests `28/28`、`npm run typecheck`、`npm test` smoke `92/92`、`git diff --check origin/main..HEAD` 均通过。 | Live App installed-user-path、Codex reload、real install/uninstall/rollback、release currentness 与 owner-chain scaleout 仍是后置证据 lane，不能由本结构证据替代。 |
| 一行 wrapper / re-export | done | 100% | `Merge OPL wrapper cleanup` / `refactor: retire OPL wrapper re-exports` 已进入 `main`；后续 verification 以 `npm run typecheck`、source-module strict gate 和 active import readback 为准。 | 无本会话继续项；production/live evidence 不适用。 |
| Runway local scheduler / queue tail | done | 100% | 本文 P1 记录的 focused runtime tests、`npm run typecheck`、`git diff --check`、`npm test` 证明 local SQLite 只保 diagnostic/provider false-ready guard；`2026-07-07` 追加把 Temporal test-server proof 移出生产 `src/**`，`rg "@temporalio/testing" src ...` 只剩 package 与 test diagnostic module。 | local queue/scheduler/dedupe active code 仍是 dev/CI diagnostic 与 projection/readback cache，不能无替代 caller 物理删除；Temporal test-server proof 不等于 external production Temporal readiness。 |
| JSON receipt ledger templates | done | 100% | `2026-07-07` 共享 `src/kernel/json-file.ts` receipt ledger helper 后，brand L5、managed install update、Connect package store、App release user-path evidence ledger 复用同一文件型 refs-only JSON receipt ledger。 | 只关闭重复模板，不改变 receipt authority、owner route 或 domain truth。 |
| JSON scalar helper 合并 | done | 100% | `2026-07-07` second pass 后，Atlas / Foundry / Runway touched callers 直接复用 `json-record.ts` canonical scalar helper；stage runner shared helper 不再 re-export `optionalString`。 | `json-file.ts` 的 `optionalString` legacy alias 仍保留给现有 public imports；后续只能随 caller 迁移逐步删除，不为清零 duplicate name 破坏 public surface。 |
| CLI parser tail | done | 100% | `2026-07-07` family-runtime queue / scheduler / attempt / provider / service-worker / lifecycle / paper-autonomy / evidence-worklist / stage-artifact option parsing 收到邻近 thin helper，focused parser tests 与 typecheck 作为行为证据。 | 仍需继续按新增 diff 守住 command registry；不为统一指标引入新 CLI framework。 |
| Fallow entrypoint / dead-export / cycle hygiene | partial | 85% | `.fallowrc.json` stale entrypoint 已纠正，`foreground-paths.ts` cycle tail 已切断；`hygiene:fallow` 的 dead-file 误报从旧 466 量级降到个位数候选。 | fallow 仍是 advisory cleanup gate，不是 physical delete authority；剩余 dead exports / clone groups 要按 active caller 和 owner route 分批处理，不能批量删除。 |
| Ledger observability tail | done | 100% | `Thin observability projection vocabulary` 与 P1 observability-export false-ready guard 已落在 `main`；focused runtime-observability tests 覆盖 local_sqlite 不计 provider-ready。 | OTel-compatible projection 不等于 provider/live readiness。 |
| 测试与 fixture surface | done | 100% | P2 wrapper tests、line-budget readback、focused App drilldown/App release/evidence worklist tests、family-runtime provider-hosted-attempts tests、`test-lanes assert-coverage` 和 `reuse-first-scan --summary` 证明已删除一批重复 prose/assertion/projection surface；`2026-07-07` 追加拆分 oversize tests 后 `node ./scripts/line-budget.mjs --format json` 为 `oversize_count=0`；剩余 `phase10-test-and-fixture-projections=388` 全部为 `allowed_projection_boundary`，不是未分类 backlog。 | residual watch-only：package/update 相关项由另会话处理，runtime protocol fixture 保留真实 queue 语义，真实 CLI/schema/projection 名不为清零 scan 而重命名。不声明 runtime/domain/App release ready。 |
| Test lane registry / full gate wrapper | done | 100% | `package.json`、`scripts/test-lanes.mjs`、`tests/src/verification-test-governance.test.ts` 和 `docs/references/current-support/opl-test-lane-governance.md` 同步到单一 registry；active command/test/reference surface 不再暴露被删并发 wrapper。 | full gate 改为顺序执行；如将来需要性能并发，应放在 CI job matrix 或显式 runner 需求中重新设计。 |

## 停止条件

- 若 active caller、source of truth 或 authority owner 不清，先停在 typed blocker，不能靠兼容 wrapper 掩盖。
- 若真实 App install/rollback、provider long-soak 或 owner-chain evidence 未跑，只能声明结构 landed，不能声明 ready。
- 若 root checkout 或 sibling repo 有同写集脏改，必须先保留对方变更，在隔离 worktree 中完成后再由主线吸收。
