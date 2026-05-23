# OPL family 文档过程归档 2026-05

Owner: `One Person Lab`
Purpose: 保存 2026-05 OPL family 文档治理、gap 校准、proof 流水和 closeout 摘要，避免主文档被历史演变污染。
State: `history_provenance`
Machine boundary: 本文是人读过程归档，不是 current truth、active plan、runtime contract 或机器接口。当前事实回到核心五件套、`docs/active/current-state-vs-ideal-gap.md`、`docs/active/production-framework-closure-gap-matrix.md`、contracts、source、CLI/API、runtime ledger 和 domain-owned manifest。

## 读取规则

- 本文只解释过程、来龙去脉和为什么当前文档这样分层。
- 当前状态、当前差距、当前完善顺序不从本文读取。
- 如果本文与 current owner 文档冲突，以 current owner 文档和机器面为准。
- 旧模块、旧接口、旧测试、旧 CLI alias、facade 或 wrapper 被替代后，仍按 direct retirement 处理；本文不构成兼容保留理由。

## 过程摘要

2026-05 中旬，OPL family 文档经历了几轮关键校准：

- OPL 从入口聚合 / runtime support 叙事收敛为完整 stage-led 智能体开发/运行框架。
- MAS/MAG/RCA 从“各自已有运行外壳”重新校准为标准 OPL Agents：`Declarative Domain Pack + OPL generated/hosted surfaces + minimal authority functions`。
- 功能/结构差距与测试/证据差距被拆开：generated surface production consumption、active caller cutover、App/workbench drilldown、lifecycle 对账和 legacy physical cleanup 属于功能/结构差距；真实 domain owner receipt、long soak、memory/artifact receipt 和 SLO 证据属于测试/证据差距。
- Temporal-backed provider 被固定为 OPL production online runtime 的必需 substrate；`local_sqlite` 只保留 dev/CI/offline diagnostic baseline。
- Hermes/Gateway/frontdoor/local-manager/MDS-default 等旧 surface 被降为 history/provenance/diagnostic/fixture/negative guard 语境，不再承担默认 provider、runtime owner、readiness path 或 compatibility promise。
- OPL docs 采用 current-only 原则：主文档只记录当前状态、当前边界、当前 gap 和当前顺序；dated proof、receipt 事件、任务 id、阶段 closeout 和校准流水进入 history/provenance。

## 已迁出的主文档内容类型

以下内容不再放在 `docs/status.md`、`docs/active/current-development-lines.md`、`docs/active/current-state-vs-ideal-gap.md`、`docs/active/production-framework-closure-gap-matrix.md` 或 ideal-state 主参考中展开：

- 具体日期的 closeout 增量说明。
- 单次 CLI fresh run 结果、event count、task id、workflow id、receipt id 和 source fingerprint。
- provider proof 的历史 blocked / recovered 事件细节。
- MAS 单条 paper line 的 read-only closeout 细节、DM002/DM003/Obesity 过程流水。
- MAG/RCA focused proof、fixture、receipt reconciliation 和 no-regression evidence 的单次命令细节。
- Agent Lab、functional harness、generic substrate、transition bridge、observability export 等 surface 的落地流水。
- App repo split、AionUI shell intake、Full DMG packaging 等阶段 closeout 细节。

这些过程仍有追溯价值，但它们不应该在 current docs 里占据结论区。

## 当前主文档分工

- `docs/status.md`：当前公开角色、当前真实状态、当前功能/结构差距、测试/证据差距和禁止误写口径。
- `docs/active/current-state-vs-ideal-gap.md`：family-level 当前 gap、MAS/MAG/RCA 单仓差距摘要和实施顺序。
- `docs/active/current-development-lines.md`：framework-first 的当前开发线路。
- `docs/active/production-framework-closure-gap-matrix.md`：production closure gap matrix。
- `docs/references/runtime-substrate/opl-family-agent-ideal-state.md`：north-star 目标态和长期 owner boundary。
- `docs/docs_portfolio_consolidation.md`：文档生命周期治理规则和台账。

## 历史过程保留范围

历史过程可以保留：

- 解释某个当前边界为什么存在；
- 支撑 direct retirement、no-active-caller、tombstone 或 provenance 判断；
- 帮助复盘一次 production proof、provider readiness、domain owner receipt 或 App packaging 问题；
- 作为 future audit 的证据索引。

历史过程不能保留：

- current truth；
- active backlog；
- 默认 runtime/provider 语义；
- compatibility interface；
- 旧 CLI alias / facade / wrapper 的保留理由；
- domain ready、quality ready、export ready 或 production soak success claim。

## 2026-05-22 new-agent template consumption tranche

本轮 fresh proof 选择新 Agent 模板消费作为 production evidence tail 的推进 lane。`opl agents scaffold --consumption-evidence` 对 `award-foundry`、`thesis-foundry`、`review-foundry` 三个临时样本执行 generate -> validate -> cleanup，三样本均 `passed`；每个样本写入 30 个模板文件、消费 5 个 pack path、观察 1 个默认 `codex_cli` executor binding、解析 1 个 quality gate ref，且临时目录已删除。另用真实 OPL-compatible `opl-meta-agent` 仓执行 `opl agents scaffold --validate /Users/gaofeng/workspace/opl-meta-agent`、`opl agents interfaces --repo-dir /Users/gaofeng/workspace/opl-meta-agent --json`、`opl agents conformance --repo-dir /Users/gaofeng/workspace/opl-meta-agent --json` 和 `opl agents readiness --repo-dir /Users/gaofeng/workspace/opl-meta-agent --json`；结果分别显示 scaffold / conformance `passed`、generated interface bundle `ready`、readiness `passed_with_production_evidence_tail`。

该 tranche 关闭的是 structural / refs-only consumption 证据：OPL scaffold、pack compiler、generated interfaces、conformance 和 readiness 能重复消费临时新 Agent 样本和真实 OMA repo。它不声明 OMA managed install/update、App live rendering、owner receipt scaleout、domain ready、artifact authority、production ready 或 long-soak 完成。

## 2026-05-22 domain-dispatch refs-only ledger tranche

本轮 OPL domain-dispatch workorder 从逐条 route 列表，收敛到 group-first、identity-guarded、refs-only ledger consumption：

- MAS：`paper_autonomy/guarded-apply`、`domain_route/reconcile-apply`、`publication_aftercare/reviewer-refresh` 和 `domain_owner/default-executor-dispatch` 多批真实 workspace payload 被 OPL safe-action shell 消费；record preflight 要求目标 attempt identity 与 payload identity 匹配，不匹配时 fail closed 为 `domain_dispatch_evidence_receipt_conflict`。这些 receipt / typed blocker 只证明 MAS owner refs 或 stable blocker 可进入 OPL ledger，不执行 guarded apply、runtime redrive、reviewer refresh 或 writer fix，也不写 MAS study truth、paper、package、memory body 或 artifact body。
- MAG：grant-stage、package lifecycle 和遗留 guarded-run route-back payload 被 OPL refs-only ledger 消费；旧 `autonomy-controller/guarded-run` route-back 明确退役为 typed blocker 语境。该 tranche 只关闭 dispatch accounting 与 legacy route-back，不声明 fundability-ready、quality/export-ready、submission-ready、App user path、真实 grant workspace scaleout 或 Temporal long-soak。
- RCA：controlled visual-stage typed blocker payload 可被 OPL safe-action shell 消费；它只表示 controlled-soak 仍等待 provider restart、re-query、retry/dead-letter、owner receipt 或 no-regression success evidence，不声明 visual ready、exportable、handoffable、artifact-producing owner receipt 或 App release/user path。

本轮过程暴露的 attempt id、receipt ref、worklist 数字和具体命令输出只作为 OPL external evidence ledger 与提交历史中的可追溯证据读取，不再复制到 `docs/status.md` 或 `docs/active/current-state-vs-ideal-gap.md`。当前 active 文档只保留结论：refs-only transport、identity preflight 和 ledger accounting 可用；MAS/MAG/RCA 的 owner-chain success、memory/artifact/lifecycle receipt scaleout、App release/user path 和 long-soak evidence 仍是 open production evidence gate。

## 2026-05-23 Developer Mode direct-fix closeout tranche

本轮选择 Developer Mode live direct-fix 作为 evidence tail 推进 lane。真实修复提交为 `38ccb4bb4320e0429d43dd46faf755c03d45f95e`，内容是给 `family-runtime intake|tick|scheduler tick` 增加 top-level `--task-kind` hydrate / dispatch scope，并同步 focused test 与 current docs。该提交已推送到 `gaofeng21cn/one-person-lab` 的 `main`，远端 `refs/heads/main` 指向同一 SHA，GitHub REST 可读到该提交的 owner-visible URL。

本轮使用 `opl runtime developer-mode-closeout record|verify` 记录并验证 direct-fix refs-only receipt：`opl://developer-mode-closeout/one-person-lab/patrol-observation-ref%3Aone-person-lab%2Ffamily-runtime-task-kind-scope%2F2026-05-23`。payload 包含 route eligibility、patrol observation ref、diff ref、focused / full verification refs、no-forbidden-write ref、commit ref 和 `external-owner-ref:github:gaofeng21cn/one-person-lab:main@38ccb4bb4320e0429d43dd46faf755c03d45f95e`。Agent Lab 当前读面为 `verified_direct_fix_closeout_refs_observed`，`live_ledger_closeout_ready_count=1`，且 `verified_fork_pr_ledger_receipt_ref_count=0`。

该 tranche 关闭的是一个真实 direct-fix closeout refs intake 与 Agent Lab consumption 证据。它不生成 owner receipt、不写 domain truth、不修改 managed runtime、不声明 Developer Mode global closeout、不关闭 non-owner fork/PR owner acceptance，也不证明 App release/user path、domain owner-chain、memory/artifact/lifecycle receipt scaleout、OMA long-soak 或 family production ready。
