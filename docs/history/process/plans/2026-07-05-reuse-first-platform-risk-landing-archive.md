# Reuse-first 平台风险落地过程归档

Owner: `One Person Lab`
Purpose: `reuse_first_platform_risk_landing_archive`
State: `historical_archive`
Machine boundary: 本文只保留 2026-07-03 到 2026-07-05 reuse-first 平台风险落地过程的历史摘要。机器 truth 继续归 `contracts/`、source、CLI/API 行为、runtime ledger、provider receipt、domain-owned manifest、App/workbench projection、各 domain repo owner surface 和 git history。本文不声明 release-ready、production-ready、domain ready、owner acceptance、Brand L5 或 physical delete authorized。

## 当前读法

本归档从已退役的 reuse-first active 落地计划压缩而来。原文档曾逐批记录 JSON boundary、CLI registry、source owner、Runway Temporal-first、managed update、Pack/Workspace、observability、App/Aion 和 domain tail 的 lane closeout evidence。那些记录现在只作为 provenance 阅读；当前治理规则回 `docs/policies/reuse-first-governance-policy.md`，当前 gap 和完成口径回 `docs/active/current-state-vs-ideal-gap.md`。

## 归档范围

归档内容包括：

- 2026-07-03 到 2026-07-05 的 batch / lane foldback 摘要。
- 每类切片证明过什么，以及没有证明什么。
- 当前仍 open 的 owner/live evidence gaps。

归档内容不包括：

- 逐条 worktree、branch、patch-id、commit list 和全部 focused test 输出。
- release/currentness/domain-ready/owner-acceptance 结论。
- Managed Update + Agent Packages owner-route 和 package lifecycle verb surfaces 的后续 ledger；这些另由对应 owner/session 处理。

## 历史批次摘要

| 批次 | 历史动作 | 当时证明 | 未证明 |
| --- | --- | --- | --- |
| Runtime / Update / Observability residual owner-route worklist | 将 full scan 剩余 runtime queue、update/package、observability hits 分类为 allowed projection boundary，并列出 5 个 owner-live evidence preflight。 | scanner findings 已有分类，active src migration item 在若干类别降为 0。 | external Temporal durable lifecycle、App release owner route、package lifecycle owner receipt、OTLP live endpoint、domain owner acceptance。 |
| Phase 1/2 JSON and CLI boundary tranches | 多轮把 entrypoint/runtime/Atlas/Charter/Console/Connect/Ledger/Runway/Foundry/Stagecraft/scripts 的局部 JSON helper 收回 shared boundary，把部分 CLI command 收到 registry。 | shared JSON/schema/registry 路径能承接大量重复 helper；focused tests/typecheck/diff gate 可守住行为保持。 | 全量 schema boundary 完成、全部 command parser 统一、runtime readiness。 |
| Source module owner alignment | 将 source refs、runtime snapshot provider、family action catalog、contract error vocabulary、workspace topology、owner id、product entry handoff、developer-mode ledger、Pack bundle builder、Charter validators 等归回实际 owner。 | import direction 和 source owner boundary 收薄；source-module gate 可发现 deep import / forbidden dependency。 | strict cycles 全部完成、domain ready、App release ready、production ready。 |
| Runway Temporal-first and reconciler folds | 增加 Temporal-first contract/readback、durable lifecycle projection、queue vocabulary handoff、safe-action source convergence、Temporal local/test-server residency proof。 | local/test-server code path、projection boundary、fail-closed readback 可执行。 | external Temporal workflow history/query、managed worker、真实 Codex executor closeout、owner/domain refs。 |
| Managed update / package structure folds | 将 managed update owner boundary、owner execution boundary、agent package registry、physical Codex surface reuse、owner-route readback 和 lifecycle command projection落成结构读回。 | package/update surface 更明确 owner route、descriptor/digest/lock/materializer/no-package-manager boundary。 | App release/currentness owner receipt、package lifecycle owner receipt、真实 Codex reload acceptance。 |
| Pack / Workspace standardization | 增加 OCI/content-addressed lock policy、workspace shared-resource content addressing、hard-blocker precedence。 | descriptor/digest/lock/provenance projection 能表达复现边界。 | package lifecycle ready、artifact/export owner acceptance、workspace 对 domain truth 的授权。 |
| Observability semantic folds | 增加 evidence envelope semantic convention、App operator drilldown convention、exporter boundary contract、collector config readback、HTTP metrics endpoint、collector smoke、OTLP exporter owner-route structural readback。 | trace/metric/log/event vocabulary 和 bounded diagnostic endpoint 可执行。 | OTLP/OpenTelemetry SDK exporter live endpoint、external collector consumption、production observability ready。 |
| Test and line-budget cleanups | 拆分超线测试 baseline、修复 test lane registry、清理 test JSON boundary 和 fixture boundary。 | 测试结构更薄，reuse-first diff gate 不再被历史 fixture 噪声污染。 | 产品行为、runtime readiness 或 owner acceptance。 |
| Cross-repo structural follow-ups | App/Aion refresh-only contract、BookForge private tail mapping、RCA/MAG structural tail reductions 等被吸收回各 owner repo。 | 若干非 live 结构面重复造轮子风险降低。 | App release ready、domain ready、publication ready、owner acceptance、physical delete authorization。 |

## Owner Live Evidence Gaps

截至归档时，以下 5 项不能靠 OPL Framework 本仓 docs、scan、readback 或 focused tests 关闭：

| Gap | 需要的 owner evidence | Forbidden completion evidence |
| --- | --- | --- |
| `external_temporal_durable_lifecycle` | external Temporal history/query、managed worker、真实 Codex executor closeout、owner/domain refs。 | Temporal SDK、local/test-server proof、SQLite projection、strict diff pass。 |
| `app_release_owner_route` | App release owner receipt、release/currentness source ref、managed update receipt 被 App truth 消费。 | Framework docs、App contract text、focused tests、active-shell quick pass。 |
| `capability_package_channel_owner_route` | Pack / Connect owner receipt 或 typed blocker、真实 package lifecycle currentness、安全审计、真实 reload acceptance。 | `owner_route_readback`、descriptor、digest、lock、manifest validation、lifecycle verb presence。 |
| `otlp_exporter_live_endpoint` | OTLP/OpenTelemetry SDK exporter、live endpoint、external collector consumption、trace/metric/log/event production chain。 | OpenMetrics smoke、collector config readback、diagnostic drilldown、semantic convention contract。 |
| `domain_tail_owner_acceptance` | domain owner acceptance / owner decision / typed blocker、no-active-caller、replacement primitive、tombstone/provenance。 | OPL refs-only matrix、source cleanup、focused tests、scan decisioned。 |

## Tombstone Rules

- 本归档不是 active implementation queue、current readiness oracle、runtime provider contract、App release plan 或 domain-agent production gate。
- 历史段落里的 `fresh evidence`、`current count`、commit sha、branch、worktree、next action 都按 2026-07-03 到 2026-07-05 附近的过程语境阅读。
- 若历史结论仍有当前价值，必须先提升到 reuse-first policy、当前 gap owner、contract、source 或 test，再引用本归档。
- 后续 reuse-first 过程细节只进入 `docs/history/**` 或对应 owner repo provenance，不再新建 active 扫描 ledger。
