# 2026-05-22 OPL Active Ledger Consolidation

Owner: `One Person Lab`
Purpose: `docs_lifecycle_closeout`
State: `history_provenance`
Machine boundary: 本文是人读过程归档。机器真相继续归 `contracts/`、source、CLI/API 行为、runtime ledger、provider receipt、domain-owned manifests 与真实 workspace / App evidence。
Date: `2026-05-22`

## 背景

本轮治理以 OPL family 的理想态与 gap plan 为主参考，审计 `docs/**` 中仍把当前计划、过程 proof、receipt 流水和历史增量清单混写在一起的 active 文档。

OPL 本轮发现的主要污染点是：

- `docs/active/production-framework-closure-gap-matrix.md` 同时承担 gap matrix、runtime proof ledger、App drilldown receipt history、safe-action route 说明和验证清单。
- `docs/active/standard-agent-private-platform-inventory.md` 同时承担当前 private platform 分类台账、逐文件拆分流水、line-count closeout 和下一轮实施计划。
- 索引和治理文档已经要求 dated proof / closeout 进入 history，但 active 文档本身仍容易继续按增量方式追加。

## 处置

- `production-framework-closure-gap-matrix.md` 收敛为当前 production closure gap matrix：只保留当前判断、差距表、统一口径和验证入口，不保存 workorder 计数、receipt 事件、分支名或 dated command proof。
- `standard-agent-private-platform-inventory.md` 收敛为当前 private-platform 分类台账：只保留 OPL-owned generic subdomains、per-agent migration ledger、high-risk surface groups、primitive gaps 和 forbidden claims，不保存逐日拆文件流水。
- `docs/README.md`、`docs/active/README.md`、`docs/docs_portfolio_consolidation.md`、`docs/policies/docs-lifecycle-policy.md` 与 `docs/history/process/README.md` 同步写明：active 文档只能保存当前 owner、当前 gap、完成口径和下一跳；过程 proof、receipt 事件、具体命令输出、line-count closeout 和阶段流水进入 history/provenance。

## 归档后读法

当前 production closure truth 继续回到：

- `docs/active/current-state-vs-ideal-gap.md`
- `docs/active/production-framework-closure-gap-matrix.md`
- `docs/references/runtime-substrate/opl-family-agent-ideal-state.md`
- `opl framework readiness --family-defaults --json`
- `opl runtime app-operator-drilldown --json`
- `opl runtime app-operator-drilldown --detail full --json`
- `opl family-runtime evidence-worklist --family-defaults --provider temporal --executor-kind codex_cli --detail full --json`

当前 private platform cleanup truth 继续回到：

- `docs/active/standard-agent-private-platform-inventory.md`
- `opl agents platform-surfaces --family-defaults --json`
- `opl agents conformance --family-defaults --json`
- 各 domain repo 自己的 ideal-state / gap / status 文档与 repo-native verification

## 不再恢复

- 不在 active 文档里追加某次 provider tick、某条 refs-only receipt、某个 workorder open count、某次 line-count split 或某条 branch/worktree closeout。
- 不把 `provider proof`、`generated surface ready`、`conformance passed`、`legacy cleanup ledger verified`、`stage evidence accounting closed` 写成 domain ready 或 production ready。
- 不为了历史兼容保留旧模块、旧接口、旧测试、旧 CLI alias、facade、wrapper 或旧文档入口；active caller 迁出并且替代证据成立后，直接删除、archive 或 tombstone。

## 验证

本轮是 docs-only 生命周期治理。验证入口：

- `git diff --check`
- `rg -n '<<<<<<<|>>>>>>>' docs`
- stale wording scan for old Gateway/frontdoor/Hermes-default wording outside history, and for active docs that claim proof/readiness as domain ready
