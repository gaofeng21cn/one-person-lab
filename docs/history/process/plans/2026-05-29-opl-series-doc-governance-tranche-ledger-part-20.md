# OPL series docs governance tranche ledger part 20

Owner: `One Person Lab`
Purpose: `opl_series_docs_governance_tranche_ledger_part_20`
State: `history_provenance`
Machine boundary: 本文是人读过程归档，不是 current truth、runtime contract、provider readiness oracle、App/operator read model 或 domain authority。当前 truth 回到 `docs/active/current-state-vs-ideal-gap.md`、核心五件套、contracts、source、CLI/API、runtime ledger、provider receipt 和各 repo owner 文档。
Date: `2026-05-29`

## Scope

本轮只处理 OPL repo 内一个 runtime-substrate support reference：

- `docs/references/runtime-substrate/opl-stage-led-agent-framework-roadmap.md`

目标是把 roadmap 从旧 active execution queue 收回为 support reference / implementation provenance，清理固定日期、旧 `3 aligned` 当前锚点、MDS active-domain 误读风险、OPL App visibility 过时句子，以及已经落地的 Stage descriptor / attempt ledger / handoff / human gate / operator projection 被继续写成 open structural gap 的污染。

## Fresh Evidence

本轮 live evidence：

- `AGENTS.md` 与 `TASTE.md`：当前工作纪律仍要求 OPL 作为 stage-led framework，`Codex CLI` 为第一公民 executor，Temporal-backed provider 为 production online runtime 必需 substrate，MAS/MAG/RCA 持有 domain truth / quality verdict / artifact authority / owner receipt。
- `docs/active/current-state-vs-ideal-gap.md`：当前 active owner 已承接完成进度、功能/结构差距、证据差距和下一轮 Agent prompt；roadmap 不应保存 process closeout 或 volatile counters。
- `opl framework readiness --family-defaults --json`：framework control plane available with blocked refs-only attention；hard blocker 0；provider cadence/capability SLO satisfied；authority boundary forbids domain ready、production ready、artifact authority 和 quality/export verdict。
- `opl stages readiness --family-defaults --json`：4 domains，19 stages admitted，0 hard blockers；stage readiness is aggregate/admission summary only and cannot execute stage、write domain truth、claim domain ready、artifact authority or production ready。
- `opl runtime app-operator-drilldown --json`：App/operator drilldown available，projection policy 为 refs-only，不读取 domain truth、memory body、artifact body 或 verdict；safe action / stage evidence / provider SLO counters are dynamic read-model facts.
- `opl agents conformance --family-defaults --json`：4 repos passed，0 blocked，structural conformance passed；production evidence tail reported separately.
- `opl agents default-callers --family-defaults --json`：32 generated/default caller surfaces，0 blocked surfaces，0 missing owner/typed-blocker，0 missing no-forbidden-write，0 missing tombstone/provenance refs；physical delete remains not authorized by this OPL projection.
- `./scripts/verify.sh`：38 tests passed，0 failed，在 part20 worktree 变更前作为 baseline。

## Changes

- `opl-stage-led-agent-framework-roadmap.md`
  - Removed the fixed `Date` metadata and added a currentness rule pointing to the active gap plan, core docs, contracts/source/tests and live CLI/read-model.
  - Added `stages readiness` to the live read-model command set and made stage admission counters dynamic.
  - Replaced stale `opl agents list` / `3 aligned` currentness wording with conformance/default-caller read-model semantics: 4 repos passed / 0 blocked, 32 generated/default caller surfaces / 0 blocked, no physical delete authority.
  - Reframed MDS / DeepScientist as archive / diagnostic / upstream-intake reference outside active conformance/default-caller/production evidence scope.
  - Replaced old open structural-gap list with current roadmap-level gaps: production Temporal deployment/SLO, MAS guarded apply scaleout, MAG/RCA long soak, domain memory/artifact authority, and physical cleanup gates.
  - Marked the old master/lane plan section as implementation roadmap/provenance rather than active execution queue.
  - Updated Lane 2 so App/operator read-model projection is no longer described as a future visibility lane.

## Coverage

Reviewed:

- `AGENTS.md`
- `TASTE.md`
- `docs/active/current-state-vs-ideal-gap.md`
- `docs/status.md`
- `docs/references/runtime-substrate/opl-stage-led-agent-framework-roadmap.md`
- `docs/references/runtime-substrate/opl-family-agent-ideal-state.md`
- fresh framework readiness / stage readiness / App operator / conformance / default-caller CLI outputs

Edited:

- `docs/references/runtime-substrate/opl-stage-led-agent-framework-roadmap.md`
- `docs/history/process/plans/2026-05-29-opl-series-doc-governance-tranche-ledger-part-20.md`
- `docs/history/process/plans/README.md`

No docs were archived, tombstoned, or deleted in this tranche.

Unreviewed docs remain outside this tranche; the global `/goal` stays active.

## Remaining stale / retire candidates

- Continue scanning `docs/references/runtime-substrate/*`, `docs/references/current-support/*`, `docs/references/operating-governance/*`, `docs/runtime/*`, and active/support docs for fixed dates, receipt ids, local-machine proof snapshots, branch/SHA state, stale current anchors, old provider status, or compatibility promises.
- The roadmap still contains a long historical master/lane plan. This tranche added a provenance guard and fixed high-risk currentness drift, but did not section-by-section rewrite every historical lane.
- RCA dirty native-PPT lane remains external owner work and was not touched.

## Next tranche write scope

- Continue support-reference cleanup in small slices with fresh contract/source/tests/read-model evidence.
- Candidate areas: remaining roadmap subsections after `Master P0`, current-support references, operating-governance references, and any support docs still mixing durable target state with dated proof snapshots.
- Before editing any support doc that mentions provider readiness, App/operator projection, stage production evidence, default-caller deletion, Temporal provider, Runtime Manager, executor adapters, Hermes, CrewAI, GraphFlow/GFL or family ideal state, re-run fresh CLI/read-model commands and keep dynamic counters out of stable target text.
