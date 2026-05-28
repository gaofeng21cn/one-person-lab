# OPL series docs governance tranche ledger part 6

Owner: `One Person Lab`
Purpose: `opl_series_docs_governance_tranche_ledger_part_6`
State: `history_provenance`
Machine boundary: 本文是人读过程归档，不是 current truth、active plan、runtime contract 或机器接口。当前 truth 回到 `docs/active/current-state-vs-ideal-gap.md`、`docs/active/current-development-lines.md`、核心五件套、contracts、source、CLI/API、runtime ledger 和各 repo owner 文档。
Date: `2026-05-29`

## Scope

本轮只处理 OPL repo 内的 active/support 文档生命周期污染：`docs/active/current-development-lines.md` 作为 current execution map，却仍保存大量 dated proof、receipt id、attempt id、单次 CLI 输出、Developer Mode receipt 流水、RCA/MAG/MAS 单次 evidence 细节和旧 closeout 摘要。

MAS 与 RCA root 当前都有未提交改动，按外部 owner lane 保留，不在本轮覆盖或吸收：

- `med-autoscience`: `docs/active/mas-ideal-state-gap-plan.md`、`docs/status.md` dirty，内容跟随 OPL latest domain-dispatch read-model currentness。
- `redcube-ai`: native PPT runtime/test dirty，属于实现/测试 lane。

## Fresh evidence

本轮 live read-model 使用当前嵌套 JSON schema，不再从旧顶层字段读取：

- `opl agents conformance --family-defaults --json` -> `.standard_domain_agent_conformance.summary`：4 repos passed、0 blocked、`structural_conformance_status=passed`、`production_evidence_tail_count=4`。
- `opl agents default-callers --family-defaults --json` -> `.agent_default_caller_readiness.summary`：32 generated/default caller surfaces、0 blocked，owner/typed-blocker、no-forbidden-write、tombstone/provenance 缺口均为 0。
- `opl framework readiness --family-defaults --json` -> `.framework_readiness.summary`：control plane available；framework/stage/pack/compiler hard blocker 均为 0；operator actionable attention tail 为 1，且 payload-required；domain blocked refs-only attention tail 仍存在并按 attention-only 分组读取。
- `opl family-runtime evidence-worklist --family-defaults --provider temporal --executor-kind codex_cli --detail full --json` -> `.family_runtime_evidence_worklist.summary`：1 open worklist item、1 payload-required safe action、0 payload-free safe action、1 domain-dispatch evidence workorder、0 stage receipt freshness workorder、307 closed refs-only items、267 domain-dispatch evidence receipts；`domain_ready_authorized=false`、`production_ready_authorized=false`。
- `opl runtime app-operator-drilldown --json` summary：provider cadence/capability satisfied；domain dispatch current default actionable attempt count 为 1；domain physical delete requires owner receipt 且 cannot execute；App release/user-path、Codex App runtime evidence 和 OMA production-consumption gates 当前无 open gate。上述都只是 refs-only / owner-boundary evidence，不是 release ready、domain ready 或 production ready。

## Changes

- 重写 `docs/active/current-development-lines.md`，把它收回 current execution map 职责。
- 删除 active 文档里的 volatile receipt ids、attempt ids、单次 closeout 叙述、RCA/MAG/MAS 单次 evidence 细节和 Developer Mode ledger 流水。
- 保留稳定内容：framework-first 顺序、live truth 读取入口、当前 read-model schema 位置、owner 边界、production evidence scaleout、strict source purity、domain private residue retirement、App workbench、domain soak、新 domain admission、直接退役优先级、完成信号和文档落点。
- 继续明确：open worklist 只表示有可提交 route；payload 必须来自 domain/App/live owner 的真实 refs 或 typed blocker；OPL 不自造 owner receipt、typed blocker、owner-chain、no-regression、release-ready 或 production-ready 证据。

## Coverage

Reviewed:

- `docs/active/current-development-lines.md`
- `docs/active/README.md`
- `docs/active/development-document-portfolio.md`
- `docs/active/current-state-vs-ideal-gap.md`
- `docs/history/process/plans/README.md`
- `docs/history/process/plans/2026-05-18-opl-family-doc-process-history.md`

Edited:

- `docs/active/current-development-lines.md`
- `docs/history/process/plans/2026-05-29-opl-series-doc-governance-tranche-ledger-part-6.md`
- `docs/history/process/plans/README.md`

Unreviewed docs remain outside this tranche; the global `/goal` stays active.

## Next write scope

- Continue uncovered OPL support-doc paragraph coverage, especially active/reference docs that still carry dated proof or concrete receipt ids outside history.
- Revisit MAS dirty docs only after owner lane is clearly assigned or clean; do not overwrite current MAS owner-surface follow-up.
- Revisit RCA native PPT dirty lane only as RCA implementation work, not as OPL docs-governance cleanup.
