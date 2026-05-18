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
