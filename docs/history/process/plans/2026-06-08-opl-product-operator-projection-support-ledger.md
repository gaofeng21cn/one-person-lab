# 2026-06-08 OPL Product Operator Projection Support Ledger

Owner: `One Person Lab`
Purpose: `docs_governance_product_operator_projection_support_ledger`
State: `history_provenance`
Machine boundary: 本文是人读 coverage ledger。当前 product/operator projection truth 继续归 `contracts/opl-framework/family-product-operator-projection.json`、source、tests、CLI/read-model、runtime ledger、provider receipt、domain-owned manifests、App-owned release evidence 和真实 operator projection output。

## Scope

本轮延续 OPL Doc Governance `/goal`，只覆盖 OPL `operating-governance` 里的 product/operator projection 主题。全局六仓 README/docs body-level coverage 仍未关闭，本 ledger 不声明 OPL series docs governance complete。

| Item | Handling |
| --- | --- |
| Semantic theme | OPL 如何把 family runtime attempt、domain quality projection 和 incident learning loop 聚合成 operator-readable state，而不把 App/operator projection 变成 action authority、domain truth、quality verdict、artifact authority、App release ready 或 production ready。 |
| Single Source of Truth | 投影字段、source contracts、App runtime boundary、observability export、external stability learning 和 fail-closed non-goals 的机器真相归 `contracts/opl-framework/family-product-operator-projection.json`；覆盖测试归 `tests/src/family-product-operator-projection.test.ts`。 |
| Support doc role | `docs/references/operating-governance/family-product-operator-projection.md` 只做 support reference，解释 currentness policy、source contracts、projection fields、runtime semantics、operator answers、fail-closed rules、external stability learning 和 observability export。 |
| Edited docs | 本 ledger 与 `docs/history/process/plans/README.md`。support doc 本体无需改写：它已经把 fresh read-model truth、App-owned release/user path truth、Codex-default runtime、full drilldown exception 和 no-domain-authority 边界分开。 |

## Reviewed Surfaces

| Area | Reviewed evidence |
| --- | --- |
| Governance inputs | `AGENTS.md`、`TASTE.md`、OPL Doc skill、`docs/docs_portfolio_consolidation.md`、`docs/active/current-state-vs-ideal-gap.md`。 |
| Support references | `docs/references/operating-governance/README.md`、`docs/references/operating-governance/family-product-operator-projection.md`、`docs/references/operating-governance/family-domain-quality-projection-contract.md`、`docs/references/operating-governance/family-incident-learning-loop.md`。 |
| Canonical boundary docs | `docs/status.md`、`docs/architecture.md`、`docs/invariants.md`、`docs/decisions.md`。 |
| Machine contract / tests | `contracts/opl-framework/family-product-operator-projection.json`、`tests/src/family-product-operator-projection.test.ts`、`tests/src/family-domain-quality-projection-contract.test.ts`。 |
| Related consumer surfaces | `opl app state --profile fast --json`、`opl app state --profile full --json`、`opl app action execute ... --json` and `opl runtime app-operator-drilldown --detail full --json` were reviewed through the contract/test boundary; fresh live counters were not frozen into prose. |

## Coverage Result

- The machine contract requires operator projection fields for active item, attempt, quality, incident, blocker, auto-continue, next surface, human gate, source refs, freshness, owner split, control loop, effective current context, stall lineage, usage, resource pressure and observability export.
- The machine contract keeps source contracts limited to family runtime attempt, family domain quality projection and family incident learning loop contracts plus domain-owned refs.
- The App runtime boundary keeps OPL as `gui_ready_state_action_producer_only`, keeps default GUI state on `opl app state --profile fast --json`, routes GUI mutations through `opl app action execute`, and treats full runtime drilldown as an explicit exception, not normal page state.
- Tests guard Codex-default runtime semantics, no local scheduler takeover, App state/action producer-only scope, rejected generic fallback/event bus/runtime adapter semantics, and `test:meta` coverage.
- The support doc already matches that SSOT and carries a currentness policy that points fresh state to read-model commands instead of freezing historical counters.

## Retired / Guarded Stale Readings

| Stale reading | Current handling |
| --- | --- |
| App/operator projection as action authority or domain truth | Guarded by contract `non_goals`, App runtime boundary and support-doc fail-closed rules. |
| Full runtime drilldown as normal GUI page state | Guarded by machine contract and tests; full detail is explicit full-detail / lazy diagnostic only. |
| Generic fallback completion, string-rule retry execution, generic event bus truth, generic runtime adapter success semantics | Rejected by `external_stability_learning_policy`; degraded surfaces cannot mark success. |
| Missing source refs, stale freshness, missing owner split or missing domain proof as completed/passed | Fail-closed by contract and support reference. |
| App release/user path evidence, worklist zero, provider proof or operator counters as App release ready / domain ready / production ready | Guarded by operating-governance index, support-doc currentness policy and core invariants. |

## Uncovered Scope

This tranche did not complete whole-portfolio coverage.

- `one-person-lab`: operating-governance docs beyond this theme, runtime-substrate docs, active support docs, history clusters, root README variants and remaining non-exact-covered docs remain under the global `/goal`.
- `med-autoscience`、`med-autogrant`、`redcube-ai`、`opl-meta-agent`、`one-person-lab-app`: no new body-level audit in this tranche.
- Fresh live `opl runtime app-operator-drilldown` / `framework readiness` / `agents conformance` / `family-runtime evidence-worklist` counters were not captured; this ledger only verifies OPL-side projection vocabulary and authority boundary.

## Next Write Scope

Continue OPL support-reference coverage from fresh live truth, prioritizing remaining operating-governance or runtime-substrate references that can still freeze dynamic counters, provider proof, owner receipt refs, App/operator projection readouts, domain ready claims, quality/export verdict wording, old Gateway/frontdoor vocabulary, generic fallback semantics or stale compatibility promises. Keep source/test/contract retirement tied to no-active-caller, replacement-owner, tombstone/provenance or negative-guard evidence.

## Verification

Minimum verification for this tranche:

- `git diff --check`
- conflict-marker scan over `README* docs`
- focused product/operator projection tests
- OPL Doc doctor JSON output for the OPL repo

This ledger is history/provenance only. It does not close the global `/goal`.
