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

## P1 Runway local scheduler / queue tail 执行记录

- `2026-07-06`：完成 active caller proof。`family-runtime scheduler tick` active path 只接受 `--provider temporal`；`runSchedulerTick` / `runSchedulerQueueTick` 仍被 Temporal activity、control-loop、provider-hosted-attempts 与 provider SLO tests 调用，不能删除。`family-runtime-queue-projection-boundary.ts`、`family-runtime-store.ts`、`family-runtime-enqueue.ts`、`existing-dedupe-*` 仍是 active queue intake / projection / idempotency guard，不能物理删除，只能保留为 local projection、dev/CI diagnostic 与 operator readback cache。
- `2026-07-06`：收薄剩余 false-ready readback：`runtime observability-export` 不再把 `local_sqlite` 的 diagnostic readiness 输出成 `opl_provider_ready=1`。JSON readback 保留 `diagnostic_provider_ready=true`，但 `provider_ready=false`、`local_sqlite_counts_as_provider_ready=false`；OpenMetrics 对 `provider_kind="local_sqlite"` 输出 `opl_provider_ready 0`。
- `2026-07-06` 验证证据：`runtime-observability-export.test.ts` 6/6、`family-runtime-cases/provider-repair.ts` + `status-lifecycle.ts` 11/11、`family-runtime-queue-guards.test.ts` 17/17、`family-runtime-provider-slo.test.ts` 11/11、`npm run typecheck`、`git diff --check`、`npm test` smoke 86/86 均通过。
- 当前完成口径：P1 本轮关闭的是 local SQLite/queue 在 observability readback 中被误读为 provider-ready 的剩余安全项；未修改 runtime ledger 数据、provider external state、domain truth 或 App release verdict。local queue/scheduler/dedupe 的 active code 仍承担 dev/CI diagnostic、projection、readback cache 与 idempotency guard，不能在没有替代 caller 的情况下删除。

## P2 执行记录

- `2026-07-06`：`tests/src/active-path-residue-scan.test.ts` 从 broad active-doc narrative scan 收薄为 source/help 语义 guard；不再把 active docs wording、章节链接、volatile read-model counter 固定为测试接口。
- `2026-07-06`：`tests/src/stale-compat-retirement-guard.test.ts` 删除 docs/history/examples/admission prose 负向断言，保留 compatibility alias、Hermes provider/runtime、contract backend set、Agent Lab authority flag 与 retired helper export 的 machine/source guard。
- `2026-07-06`：`tests/src/cli/cases/connect-agent-packages.test.ts`、`tests/src/cli/cases/app-state-cases/mas-activity.test.ts`、`tests/src/cli/cases/package-distribution.test.ts` 拆为 wrapper + case modules，所有 test/fixture 文件回到 `1000` 行以内；`mas-activity` 删除对可变 next-step 英文/中文 prose 的固定断言，仅保留状态、authority、attempt identity 与 route/ref token guard。
- 当前完成口径：P2 属于测试/fixture surface 结构收薄并已审计完成；验证只能证明本 lane 未降低保留的 machine/source guard，不能证明 live provider、domain owner-chain、App release 或 production readiness。
- 新鲜证据：`npm run --silent line-budget -- --list` 只列出 `src/modules/connect/agent-package-registry.ts`、`src/modules/connect/developer-mode.ts`、`src/entrypoints/cli/cases/public-command-specs-parts/connect.ts`、`src/modules/console/app-state-parts/action-execute.ts`、`src/modules/runway/family-runtime-enqueue-parts/existing-dedupe-reconcile.ts`、`src/modules/foundry-lab/agent-lab-developer-mode.ts`，无剩余 over-budget test/fixture 文件；focused P2 wrapper tests 为 `30/30` 通过。

## 停止条件

- 若 active caller、source of truth 或 authority owner 不清，先停在 typed blocker，不能靠兼容 wrapper 掩盖。
- 若真实 App install/rollback、provider long-soak 或 owner-chain evidence 未跑，只能声明结构 landed，不能声明 ready。
- 若 root checkout 或 sibling repo 有同写集脏改，必须先保留对方变更，在隔离 worktree 中完成后再由主线吸收。
