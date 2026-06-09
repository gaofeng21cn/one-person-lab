# OPL Decisions Runtime History Compression Closeout

Owner: `One Person Lab`
Purpose: `decisions_runtime_history_compression_closeout`
State: `history_provenance`
Machine boundary: 本文只记录一次 OPL Doc docs-governance tranche 的人读 SSOT 决策、覆盖范围和验证边界。当前 runtime truth 继续归核心五件套、`contracts/`、source/tests、CLI/read-model、runtime ledger、provider receipts 和 App/domain owner evidence；本文不是 readiness oracle、provider proof、owner receipt、typed blocker、compatibility surface 或 production-ready 证据。

## SSOT Decision

语义主题：`docs/decisions.md` 中已被 Temporal-backed provider supersede 的 Hermes / Gateway / online-management readiness 历史决策。

Single Source of Truth:

- 当前 active truth / baton: `docs/active/current-state-vs-ideal-gap.md`
- 核心人读真相: `docs/status.md`、`docs/architecture.md`、`docs/invariants.md`、`docs/decisions.md`
- Runtime boundary support: `docs/runtime/opl-runtime-naming-and-boundary-contract.md`
- Runtime substrate references: `docs/references/runtime-substrate/README.md`、`docs/references/runtime-substrate/temporal-family-runtime-provider-plan.md`
- History owner: `docs/history/runtime-substrate/README.md`、`docs/history/process/plans/README.md`

当前读法固定为：Temporal-backed provider 是 production online runtime 的必需 substrate；`Codex CLI` 是默认第一公民 executor；`hermes_agent`、`claude_code`、`antigravity_cli` 只作为显式非默认 executor adapter/backend。旧 Hermes online runtime、Gateway、provider/readiness、cron/webhook bridge、Full package Hermes payload、online-management 首屏层级和 hybrid provider compatibility 只保留 history / provenance / diagnostic / negative guard。

## Covered Peer Set

- `docs/decisions.md` 的 2026-05-10 Temporal-backed provider 决策、2026-05-08 Hermes-first / hosted adapter 历史决策、2026-05-02 首启 readiness 历史决策、2026-04-26 Runtime Manager 决策。
- `docs/status.md` 当前公开角色、runtime/provider 和 live truth 入口。
- `docs/architecture.md` runtime、provider、App/operator 和 domain boundary。
- `docs/invariants.md` production online substrate 与 fail-closed readiness 不变量。
- `docs/runtime/opl-runtime-naming-and-boundary-contract.md` runtime naming / owner split support。
- `docs/history/runtime-substrate/README.md` 与 `docs/history/process/plans/README.md` 的 history / tombstone 入口。
- `docs/history/process/plans/2026-06-09-opl-runtime-substrate-roadmap-ssot-closeout.md` 的 runtime-substrate 支撑参考 closeout。

## Content Disposition

| Content | Disposition |
| --- | --- |
| 2026-05-08 Hermes-first online substrate rationale and impact long list | Compressed in `docs/decisions.md` into provenance plus current no-resurrection boundary. |
| Hermes hosted/runtime adapter rollback notes | Compressed into a middle-state provenance paragraph; current install/readiness comes from Temporal-backed provider and App release owners. |
| 2026-05-02 online-management first-run readiness bullets | Compressed into historical first-run layering provenance; current first-run readiness cannot restore Hermes gateway / online-management surface. |
| Valid typed queue / hydrate semantic residue | Kept only as current OPL/Temporal provider owned path, not Hermes cron/webhook compatibility. |
| `hermes_agent` executor adapter | Retained as explicit non-default adapter/backend; this tranche does not delete it. |

## Edited Docs

- `docs/decisions.md`
  - Replaced three superseded Hermes/Gateway/readiness impact bullet lists with compact current-reading paragraphs.
  - Preserved the effective 2026-05-10 Temporal-backed provider decision as the active SSOT.
  - Preserved historical provenance while removing active-looking install/readiness/worklist detail.
- `docs/history/process/plans/2026-06-09-opl-decisions-runtime-history-compression-closeout.md`
  - Records this topic-level closeout instead of adding another dated proof/checklist chain to active docs.

## Remaining Series Scope

This tranche does not claim full six-repo paragraph coverage. Remaining work:

- OPL root: continue one semantic SSOT lane at a time for active/support/reference/history docs that still risk stale current-truth duplication, dated proof freeze, dynamic counter freeze, old surface resurrection, or compatibility promises.
- MAS: keep docs/source/test mutation out of this write set while concurrent currentness / owner-route worktrees remain, unless a fresh docs-only non-overlapping lane is proven.
- MAG/RCA/OMA/App: reopen only for precise SSOT conflict, uncompressed current rule, or concrete stale module/interface/test/workflow/entrypoint retirement candidate with replacement-owner and no-active-caller evidence.

## Verification Boundary

Minimum verification for this docs-only tranche:

```bash
rtk git diff --check
rtk rg -n '^(<<<<<<<|=======|>>>>>>>)' README* docs
rtk rg -n 'Hermes gateway 未 loaded|Hermes online runtime ready|Hybrid optional Hermes provider adapter|Hermes cron/webhook 唤醒|Hermes cron 注册|默认安装/复用 `Codex CLI`、Hermes online runtime|Full 首次安装包曾要求携带 Hermes payload' README* docs/README.md docs/project.md docs/status.md docs/architecture.md docs/invariants.md docs/decisions.md docs/active docs/runtime docs/references docs/product docs/specs
rtk opl-doc-doctor doctor . --format json
```

Passing these checks proves only documentation hygiene and that this tranche did not reintroduce active-looking Hermes/Gateway readiness wording in guarded docs. It does not prove OPL runtime ready, any domain ready, App release ready, production ready, owner-chain closure, Temporal long-soak, Brand L5 or physical delete authorization.
