# OPL Public Roadmap / Legacy Route SSOT Closeout

Owner: `One Person Lab`
Purpose: `opl_public_roadmap_legacy_route_ssot_closeout`
State: `history_provenance`
Machine boundary: 本文是人读 OPL Doc closeout。当前机器真相继续归 `contracts/`、source、tests、CLI/read-model、runtime ledger、provider receipt、domain-owned manifests、App evidence 和核心五件套。

## Semantic Theme

`public_roadmap_legacy_route_boundary`: public roadmap 可以解释 OPL family 的公开方向、当前路线、旧 gateway/frontdoor/Product API/Hermes-default/local-manager 材料的阅读语境和下一跳，但不能维护 runtime/readiness/live proof 当前状态。

## SSOT Owner

Current truth owners:

- Core human truth: `docs/project.md`、`docs/status.md`、`docs/architecture.md`、`docs/invariants.md`、`docs/decisions.md`
- Active plan owner: `docs/active/current-state-vs-ideal-gap.md`
- Owner-map support: `docs/active/current-development-lines.md`
- Machine owners: `contracts/opl-framework/runtime-manager-contract.json`、`contracts/opl-framework/family-executor-adapter-defaults.json`、`contracts/opl-framework/public-surface-index.json`、`contracts/opl-framework/surface-budget-policy.json`
- Live read-model owners: `opl framework readiness --family-defaults --json`、`opl agents conformance --family-defaults --json`、`opl system semantic-hygiene --json`
- History/tombstone owners: `docs/history/compatibility/**`、`docs/history/frontdoor-legacy/**`、`docs/history/runtime-substrate/**`

`docs/public/roadmap.md` remains only `public_roadmap_support`. It does not own provider SLO, Temporal proof, MAS paper-line closeout, domain owner-chain, App release readiness, production readiness, domain readiness, or stale-surface deletion authority.

## Peer Docs Classification

| Peer surface | Classification | Outcome |
| --- | --- | --- |
| `docs/public/roadmap.md` | `more_specific_detail` plus `covered_by_ssot` duplicate | Kept public direction, family shape, history/provenance links and judgment criteria; compressed concrete live proof statements into pointers to core docs, active plan, contracts and CLI/read-model. |
| `docs/project.md` | `covered_by_ssot` | Project role and top-level boundary already state Codex-default, Temporal-backed provider, explicit non-default executor adapter and legacy-route history/provenance boundaries. |
| `docs/status.md` | `covered_by_ssot` | Current status already owns live-state prose for framework/App/domain boundaries and App/shell candidate limits. |
| `docs/architecture.md` | `covered_by_ssot` | Architecture already owns detailed runtime/provider/App/domain split and non-goal boundaries. |
| `docs/invariants.md` | `covered_by_ssot` | Invariants already freeze retired gateway/Product API/Hermes-default/local provider/no-ready-claim rules. |
| `docs/decisions.md` | `history_or_provenance` and active decision owner | Decisions keep exact dated retired `frontdesk` / `opl web` / Product API / StageRun owner rules. |
| `docs/active/current-state-vs-ideal-gap.md` | `covered_by_ssot` | Active plan owns current completion progress, gaps, next prompt and live readout command list. |
| `docs/active/current-development-lines.md` | `covered_by_ssot` | Owner map support owns semantic owner routing and direct retirement readout. |
| `docs/public/README.md` | `out_of_scope` | Thin public support index; no rewrite needed. |
| `docs/history/compatibility/**` | `history_or_provenance` | Retains exact old gateway/federation/routed-action wording as tombstone/provenance; not compatibility surface. |
| `docs/references/governance/series-doc-governance-checklist.md` | `more_specific_detail` | Keeps cross-series docs governance checklist and retired-route guard; no rewrite needed. |

## Content-Level Change

- Rewrote only the `docs/public/roadmap.md` judgment criteria section.
- Removed concrete current proof statements for Temporal provider minimum proof and MAS paper-line proof from the public roadmap support surface.
- Replaced them with explicit pointers: current evidence must come from core docs, active gap plan, contracts and live CLI/read-model.
- Kept old `OPL Gateway`、`opl web`、`Product API`、Hermes default、local-manager and AionUI-first-shell wording only as provenance/diagnostic/history/fixture context.

## Stale-Surface Retirement

No physical source/test deletion was authorized by this lane.

Retired surface posture remains:

- `frontdesk` / `opl web` / 8787 Product API service stay retired.
- Gateway / federation / routed-action material stays in history/tombstone.
- Hermes default and local-manager wording stays legacy/provenance/diagnostic/negative-guard only.
- Public roadmap cannot preserve compatibility aliases, facades, wrappers, old workflow entries or compatibility-only tests.

## Verification

Evidence read before edit:

- `rtk jq '.provider_runtime, .non_goals' contracts/opl-framework/runtime-manager-contract.json`
- `rtk jq '.defaults, .canonical_executor_backends, .stage_level_executor_policy.default_executor_kind, .non_goals' contracts/opl-framework/family-executor-adapter-defaults.json`
- `rtk opl framework readiness --family-defaults --json`
- `rtk opl agents conformance --family-defaults --json`
- `rtk opl system semantic-hygiene --json`

Key readout:

- Framework readiness has `hard_blocker_count=0`, semantic hygiene contract floor `guarded_gate_count=10`, `provider_slo_cadence_window_status=window_cadence_satisfied`, but `can_claim_domain_ready=false` and `can_claim_production_ready=false`.
- Agent conformance has `passed_count=4`, `blocked_count=0`, and `production_evidence_tail_count=4`; controlled canary evidence still has `controlled_fixture_not_live_domain_progress` and cannot claim domain or production ready.
- Semantic hygiene has `gate_count=10`, `guarded_gate_count=10`, `attention_required_gate_count=0`, and `legacy_vocabulary_active_leakage` guarded by active-path residue tests.

Follow-up validation for this docs-only lane should run:

```bash
rtk git diff --check
rtk rg -n "Temporal production provider 已有|MAS paper-line read-only closeout proof 已落地|production-ready|domain ready" docs/public/roadmap.md
rtk opl-doc-doctor doctor . --format json
```

## Residual Scope

This lane closes only the OPL main public-roadmap / legacy-route provenance boundary. It does not close broader OPL docs portfolio coverage, MAS dirty-state governance, App broader docs portfolio, OMA future evidence tails, MAG owner delete/keep/blocker decisions, RedCube broader portfolio, or global six-repo completion.
