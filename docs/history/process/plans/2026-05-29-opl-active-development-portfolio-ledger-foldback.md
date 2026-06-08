# 2026-05-29 OPL Active Development Portfolio Ledger Foldback

Owner: `One Person Lab`
Purpose: `compressed_active_development_portfolio_coverage_provenance`
State: `history_provenance_compressed`
Machine boundary: 本文是人读 docs-governance coverage provenance。当前 truth 继续归 `docs/docs_portfolio_consolidation.md`、核心五件套、`docs/active/current-state-vs-ideal-gap.md`、contracts、source、CLI/read-model、runtime ledger、provider receipt、domain-owned manifest、App/workbench projection 和真实验证 evidence。
Date: `2026-05-29T02:20:00+0800`
Compression date: `2026-06-08`

## Foldback Scope

本文件原本从 `docs/active/development-document-portfolio.md` 折回 2026-05 OPL family docs-governance coverage ledger。折回前，active support 文档同时承担当前开发文档组合入口和大量 dated tranche ledger，已经违背 active docs 不保存执行流水的治理规则。

2026-06-08 本文件再次压缩：原文保存约 `175` 个 tranche、`176` 组 date/state 记录和超过 `10000` 行执行流水。那些逐 tranche 原文包含当时的 read-model 计数、branch/worktree 名称、验证命令、next write scope、dirty-state 判断和 closeout 文案。它们已经被当前 owner docs、核心五件套、live contracts/source/tests/read-model、repo-local history ledgers 和后续 compact closeout 取代。

本文件现在只保留主题级 provenance、当前 owner map、覆盖边界和禁止误读规则。不要把本文当作 active queue、当前 readiness oracle、runtime provider contract、App release proof、domain production evidence 或全局 `/goal` 完成证明。

## Current Reading

当前有效入口：

- Docs lifecycle：`docs/docs_portfolio_consolidation.md`
- Active progress/gaps/next baton：`docs/active/current-state-vs-ideal-gap.md`
- Current development lines：`docs/active/current-development-lines.md`
- Core current truth：`docs/project.md`、`docs/status.md`、`docs/architecture.md`、`docs/invariants.md`、`docs/decisions.md`
- Machine truth：contracts、source、tests、CLI/read-model、runtime ledger、provider receipts、domain-owned manifests、App/operator projection 和真实验证 evidence
- Cross-repo current truth：各 repo 的 active truth owner、核心 docs、contracts/source/tests/read-model 和 repo-local history / coverage ledger

`docs/active/development-document-portfolio.md` 只保留当前开发文档组合地图、内容级归位规则、退役/归档规则和历史 ledger 指针。新的 dated coverage 不得回写到 active docs。

## Compressed Coverage Themes

原始 ledger 覆盖的高频主题按当前读法压缩如下：

| Theme | Historical content retained here | Current owner |
| --- | --- | --- |
| Six-repo docs governance hygiene | OPL/MAS/MAG/RCA/OMA/App 的 README/docs body coverage、doctor pass、dirty-state/worktree/branch 判断和下一轮写入范围。 | 各 repo active truth owner、core docs、`docs/docs_portfolio_consolidation.md`、repo-local history coverage ledger、live code/contracts/tests/read-model。 |
| Active ledger and support-doc foldback | active docs 中 dated proof、receipt ledger、worktree closeout、coverage tranche 和 next prompt 的历史折回。 | OPL `docs/active/current-state-vs-ideal-gap.md`、`docs/active/development-document-portfolio.md`、core docs、contracts/source/CLI/read-model。 |
| Default-caller / generated-surface cleanup | default caller, generated wrapper, bridge exit, no-active-caller, physical delete gate 和 owner receipt / typed blocker 的历史检查。 | `contracts/`、source/tests、CLI/read-model、domain owner receipts / typed blockers；OPL projection 不授权 domain repo physical delete。 |
| MAS / MDS / study-runtime cleanup | MAS MDS source provenance、AI reviewer materialization、runtime projection、dispatch regression 和 study/runtime currentness 的历史 coverage。 | MAS active plan、study/runtime contracts/source/tests、domain owner receipts、runtime evidence 和 MAS repo-local history records。 |
| MAG route/spec/product-entry cleanup | MAG specs lifecycle、entry/core index、sustained consumption payload、route/support docs 与 historical spec currentness 的历史 coverage。 | MAG core docs、active plan、spec lifecycle map、`current-program.json`、source/contracts/tests、MAG owner receipts / typed blockers。 |
| RCA delivery/runtime/source/docs cleanup | RCA Phase 2, Hermes proof, route evolution, native PPT, source readiness, review/export, runtimeWatch 和 tombstone prose 的历史 coverage。 | RCA core docs、active plan、delivery/runtime/source owner docs、contracts/source/tests、runtime artifacts、review/export gates。 |
| OMA generated-surface / agent-pack cleanup | OMA README/docs full-body refresh、agent pack support README lifecycle、production consumption 和 OPL-generated surface currentness。 | OMA active gap plan、agent pack contracts/source/tests、OPL-generated surface contracts、App/operator evidence refs。 |
| App release / GUI / packaged skill cleanup | App packaged assistant route smoke、runtime page docs、AG-UI/PilotDeck candidate intake、packaged skill user guide、release evidence and dirty-lane deferrals。 | App repo active plan、App contracts、release workflows/artifacts/evidence manifests, active-shell validation and App-owned tests。 |
| Support repo / skill cleanup | `opl-doc` / support repo install, governance skill naming and doctor/bootstrap role 的历史 checks。 | Support repo owner docs, installer/doctor source, tests, plugin/skill contracts and repo-local history records。 |
| Branch/worktree/session hygiene | Stale worktree, branch, dirty-state, ahead/behind, residual lane and cleanup decisions. | Fresh `git status` / `git worktree list` / remote refs at the time of work; never reuse this ledger as current git truth. |

## Retired Original Surface

Retired surface: the archived per-tranche long-form ledger body inside this file.

The compression removes:

- proof-by-proof command transcripts
- branch/worktree closeout logs
- dated read-model counters
- per-turn next write scopes
- repeated six-repo doctor statements
- temporary dirty-state snapshots
- old prompt / action lists
- exact output snippets that are no longer current evidence

The compression keeps:

- stable file path for inbound historical links
- owner / purpose / state / machine boundary
- the fact that active portfolio ledgers were folded out of active docs
- the major historical themes and current owner map
- no-resurrection and no-current-truth guardrails

## No-Resurrection Rules

- Do not reconstruct the removed 2026-05 per-tranche prose as active docs, active queue, execution checklist, release gate, default-caller proof, runtime truth, domain readiness proof, App release evidence, production readiness proof or `/goal` completion evidence.
- Do not copy historical branch/worktree names, read-model counts, test pass counts, command transcripts or next write scopes into new active prompts without fresh live verification.
- If a historical conclusion still matters, fold the durable rule into the current owner doc, contract, source, test or repo-local history index, then cite this file only as provenance.
- If future work needs detailed proof for a specific old tranche, use git history for this file before the 2026-06-08 compression commit; do not re-expand the long ledger in-place.

## Compression Evidence

Fresh checks before compression:

- `docs/history/process/plans/2026-05-29-opl-active-development-portfolio-ledger-foldback.md` had `10357` lines.
- The original body contained `175` `Tranche:` entries and `176` `Date:` / `State:` records.
- Active navigation already pointed current truth to `docs/docs_portfolio_consolidation.md`, `docs/active/current-state-vs-ideal-gap.md`, core docs, live code/contracts/read-model and repo-local ledgers.
- Inbound references were human-doc / history-navigation references, not source, test, contract or CLI machine consumers.

Verification for this compression should remain docs-only:

```bash
rtk git diff --check
rtk rg -n "^(<<<<<<<|=======|>>>>>>>)" README* docs contracts
rtk opl-doc-doctor doctor /Users/gaofeng/workspace/one-person-lab --format json
```

No source/runtime tests are required for this compression because it changes only historical narrative provenance and does not modify contracts, source, tests, CLI behavior, runtime ledger, provider receipts, App/operator projection or domain-owned manifests.
