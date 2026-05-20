# OPL 当前状态

Owner: `One Person Lab`
Purpose: `status`
State: `active_truth`
Machine boundary: 本文是核心人读真相面。机器真相继续归 `contracts/`、source、CLI/API 行为、runtime ledger、provider receipt、domain-owned manifest 和真实 workspace / App evidence。
更新时间：`2026-05-20`

## 当前公开角色

`OPL` 当前公开认知固定为三层：`OPL Framework -> One Person Lab App -> Foundry Agents`。

- `OPL Framework` 是完整智能体开发/运行框架，持有 Codex-default activation、Temporal-backed provider、typed queue、stage attempt、receipt/projection、shared contracts/indexes、Agent Lab、generated surface、safe action shell 和跨仓治理。
- `One Person Lab App` 是面向人的工作台，消费 framework/provider 状态和 domain-owned projection，展示任务、阶段、阻塞、source refs、artifact refs、memory refs、SLO、repair、workorder 和 owner-aware action。
- `Foundry Agents` 当前包括 `MAS`、`MAG`、`RCA`。它们持有各自的 domain truth、quality/export verdict、artifact authority、memory body / accept-reject decision、owner receipt 和 direct app skill path。

`Codex CLI` 是当前第一公民 executor。Temporal-backed provider 是 production online runtime 的必需 substrate；`local_sqlite` 只允许作为 dev/CI/offline diagnostic baseline。`hermes_agent` 与 `claude_code` 只能作为显式非默认 executor adapter/backend 接入，并以 receipt/audit/fail-closed 证明连接，不承诺行为、质量、工具语义或 resume 等价。

`MDS` 不进入 OPL 顶层 agent 列表。它只作为 MAS 显式声明的 source provenance、historical fixture、explicit archive import、backend audit、upstream intake 或 parity oracle reference。

## 当前真实状态

OPL 已具备 framework 主干：domain descriptor / stage / action / memory discovery、Temporal provider code、service / worker lifecycle、typed family queue、stage attempt ledger、typed closeout、production closeout read model、provider proof / SLO projection、runtime snapshot、OPL-owned provider scheduler cadence/tick surface、safe runtime action shell、lifecycle refs-only SQLite index、external evidence refs-only receipt ledger、App/operator drilldown read model、refs-only `domain_dispatch_evidence` 和 refs-only `stage_production_evidence`。

`runtime app-operator-drilldown` 默认 summary-first，完整 refs/routes 只在 `--detail full` 展开。App execution bridge 统一走 `opl runtime action execute`；OPL CLI route 可创建 provider-backed stage attempt request、执行 provider scheduler safe action、写 OPL cleanup ledger 或记录/验证 refs-only evidence receipt。Domain route 只进入 typed queue / approval，不直接执行 domain action、不写 domain truth、不签 domain owner receipt。

2026-05-20 的 current readout：Temporal provider cadence / capability SLO 已由 provider receipt 关闭；provider scheduler 4 项和 MAS/MAG/RCA legacy cleanup 6 项已由 OPL refs-only ledger receipt 关闭；MAG external evidence request 与 RCA evidence gate 已作为 refs-only verified request/gate accounting 投到 App/operator。`stage_production_caller_tail_open_item_count=0`，但 stage expected receipt / monitor freshness 仍有 18 个 open refs-only record/verify workorder。

本轮 OPL production closeout 增加 `stage_evidence_workorder_packet`：`opl family-runtime production-closeout --family-defaults --provider temporal --executor-kind codex_cli --detail full --json` 会把 open `stage_production_evidence_receipt_record` route 按 domain/stage 聚合，显示 action id、payload owner、空 template、required refs、typed-blocker path 和 authority boundary。Fresh 读数是 `workorder_count=18`、`domain_count=3`、`route_requires_domain_or_app_payload_count=18`、`typed_blocker_path_available_count=18`。该 packet 只是 OPL workorder projection，不生成 domain owner receipt、不生成 monitor freshness、不声明 stage complete、domain ready 或 production ready。

同日 OPL App/operator drilldown 已开始 refs-only 消费 `opl-meta-agent` patch-loop closeout：`runtime app-operator-drilldown --detail full --json` 的 OMA sections 可投影 `blocked_suite_result_ref`、`developer_patch_work_order_ref`、`patch_traceability_matrix_ref`、`target_repo_verification_refs`、`target_runtime_read_model_consumption_ref`、`workspace_environment_proof_ref`、`no_forbidden_write_proof_ref`、`target_owner_receipt_or_typed_blocker_ref`、`patch_absorption_ref`、`worktree_cleanup_ref` 和 `agent_lab_re_evaluation_ref`。这只是 App/workbench 对 OMA work order 与 target owner closeout refs 的展示/审计入口，不写目标 truth、不读取 artifact 或 memory body、不签 owner receipt，也不把 patch-loop projection 写成 domain ready、quality verdict、artifact readiness 或 default promotion。

`opl agents scaffold --validate <repo>` 与 `opl agents conformance --family-defaults --json` 负责标准 OPL Agent 的结构 gate：`agent/` 必须持有真实 prompt/stage/skill/knowledge/quality gate 语义文件，generated surface owner、private generic-owner guard、physical morphology policy 和 active path scan 必须可被 OPL 审计。Conformance / readiness 的动态计数不在本文冻结；当前 truth 入口是 `opl framework readiness --family-defaults --json`，专题 drilldown 继续使用 `opl agents readiness --family-defaults --json`、`opl agents interfaces --domain <domain> --json`、`opl agents pack-compiler --json`、`opl stages readiness --domain <domain> --json` 和 App/operator drilldown。

## 当前差距

OPL family 当前不能写成整体 production closure。剩余缺口集中在五类：

- App release / user path：发布包、截图、reload prompt 真实用户路径、provider state 联动和长时 operator evidence。
- Stage evidence tail：真实 expected receipt instance、monitor freshness、owner receipt、typed blocker、memory/artifact/lifecycle receipt 或 long-soak refs 需要由 MAS/MAG/RCA 或 App/live operator 回填到 OPL workorder。
- Domain owner-chain receipts：MAS/MAG/RCA 在真实 workspace 中持续产出 owner receipt、typed blocker、no-regression evidence、memory writeback receipt 和 no-forbidden-write proof。
- MAS physical thinning：retained runtime transport / SQLite / runner / workbench sidecar 只在 no-active-caller、OPL parity、domain receipt parity、focused tests 与 provenance/tombstone refs 同时成立后删除、archive 或 tombstone。
- RCA naming hygiene tail：历史 `managed` / runtime / gateway / session / sidecar 命名继续降到 provenance、semantic-id 或 tombstone，不恢复 compatibility alias。

## 当前默认入口

- 默认前门是 `opl`；`opl exec` 负责一次性请求，`opl resume` 负责续接会话。
- `opl install` 是当前一键安装入口，负责安装或复用 Codex CLI、Temporal-backed family runtime provider、MAS、MAG、RCA、OPL Meta Agent、推荐 skills 和 App 入口。
- `opl system` / `opl system initialize` / `opl system startup-maintenance` 管理 Codex CLI、provider profile/readiness、module install/update、skill sync、managed environment freshness、plugin cache freshness、reload prompt 和 local runtime state。
- `opl framework readiness --family-defaults --json` 是 family readiness 动态真相入口；它只输出 framework/operator 读面，不授权 domain ready、artifact authority 或 production ready。
- `opl runtime app-operator-drilldown --json` 与 `opl runtime app-operator-drilldown --detail full --json` 是 App/operator drilldown 入口。
- `opl family-runtime production-closeout --family-defaults --provider temporal --executor-kind codex_cli --detail full --json` 是 production closeout 与 stage evidence workorder packet 入口。

## 当前不能声明

- 不能声明 OPL 已全量生产可用。
- 不能声明 Temporal provider proof 等于 MAS paper closure、MAG grant readiness 或 RCA visual ready。
- 不能把 `stage_evidence_workorder_packet`、refs-only receipt verified、provider/SLO satisfied 或 tail item closed 写成 domain owner-chain、App 用户路径、release/dist、artifact authority、expected receipt instance、monitor freshness 或 long-soak evidence 已全部闭合。
- 不能声明 private functional audit 分类完成就等于物理代码路径清零。
- 不能把 `agents legacy-cleanup apply` 的 dry-run / apply / verify ready 状态写成 OPL 已删除 domain repo 文件或 production evidence 已闭合。
- 不能为了兼容保留旧模块、旧接口、旧测试、旧 CLI alias、facade 或 wrapper；active caller 迁走后直接删除或进入 history/tombstone。

## 参考入口

- [文档索引](./README.md)
- [项目概览](./project.md)
- [架构](./architecture.md)
- [硬约束](./invariants.md)
- [关键决策](./decisions.md)
- [OPL Family 当前状态与理想目标差距](./active/current-state-vs-ideal-gap.md)
- [OPL 与 Foundry Agents 理想目标态](./references/runtime-substrate/opl-family-agent-ideal-state.md)
