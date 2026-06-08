# OPL Series Ledger Compression Closeout

Owner: `One Person Lab`
Purpose: `opl_series_ledger_compression_closeout`
State: `history_provenance`
Machine boundary: 本文只记录一次 docs-governance history-compression tranche。当前机器真相继续归 `contracts/`、source、tests、CLI/read-model、runtime ledger、provider receipt、domain-owned manifests、App/workbench projection、repo-local closeout 和 git history；本文不得作为 active plan、test oracle、readiness claim、owner receipt、typed blocker、quality/export verdict、artifact authority、physical delete authorization 或 compatibility surface。

## 本轮覆盖

本轮只治理 OPL 主仓 process history file：

- `docs/history/process/plans/2026-06-06-opl-series-doc-governance-ssot-tranche-ledger.md`

语义主题：跨六仓 OPL Doc tranche 的长历史 ledger、逐条 commit / command / worktree closeout / verification transcript 压缩。

Single Source of Truth：

- 当前 OPL docs lifecycle truth：`docs/docs_portfolio_consolidation.md`
- 当前 OPL active truth：`docs/active/current-state-vs-ideal-gap.md`
- 当前机器 truth：contracts/source/tests/CLI/read-model/runtime ledger/provider receipts/domain-owned manifests/App evidence
- 具体 lane provenance：各 repo-local `docs/history/**` closeout 与 git history
- 历史 process index：`docs/history/process/README.md` 与 `docs/history/process/plans/README.md`

## 处置

- 原文件从 700 行长 ledger 压缩为 compact provenance。
- 删除逐条 lane 的 command transcript、commit 列表、worktree cleanups 和重复 verification longlist。
- 保留默认六仓 scope、support repo extension、covered themes、remaining scope、verification boundary 和 no-resurrection rule。
- 保留原路径，避免破坏 process index 入站链接。
- 更新 process index 对该文件的描述，从“记录两个 SSOT lane 和未覆盖范围”改成“compact provenance”。

## 未覆盖范围

本轮没有治理其他 process history files、active docs、contracts、source、tests、CLI/read-model、runtime state、domain owner receipts、App release evidence 或 repo-local closeouts。

下一轮可继续从 `docs/history/process/plans/**` 中选择仍携带长历史清单、branch/SHA/run command transcript、old route wording 或已经被 newer owner 吸收的 process ledger。

## 验证口径

最小验证应覆盖：

- `git diff --check`
- conflict marker scan over `README* docs contracts`
- `opl-doc-doctor doctor <repo-root> --format json`

这些验证只证明本轮 history-compression tranche 的文档形状正确；不能声明 OPL runtime ready、domain ready、production ready、App release ready、artifact authority ready、owner receipt / typed blocker 已闭合或六仓全局 goal 完成。
