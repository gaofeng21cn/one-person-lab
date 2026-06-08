# 2026-06-08 OPL Quality Projection Support Ledger

Owner: `One Person Lab`
Purpose: `docs_governance_quality_projection_support_ledger`
State: `history_provenance`
Machine boundary: 本文是人读 coverage ledger。当前 family domain quality projection truth 继续归 `contracts/opl-framework/family-domain-quality-projection-contract.json`、source、tests、CLI/read-model、runtime ledger、provider receipt、domain-owned manifests 和真实 domain eval/proof evidence。

## Scope

本轮延续 OPL Doc Governance `/goal`，只覆盖 OPL `operating-governance` 里的 family domain quality projection 主题。全局六仓 README/docs body-level coverage 仍未关闭，本 ledger 不声明 OPL series docs governance complete。

| Item | Handling |
| --- | --- |
| Semantic theme | OPL family 如何投影 MAS/MAG/RCA domain-owned quality gate，而不把投影升级成 generic QA gate、domain ready、quality/export verdict、artifact authority 或 production ready。 |
| Single Source of Truth | 字段、domain mappings 和 forbidden authorities 的机器真相归 `contracts/opl-framework/family-domain-quality-projection-contract.json`；覆盖测试归 `tests/src/family-domain-quality-projection-contract.test.ts`。 |
| Support doc role | `docs/references/operating-governance/family-domain-quality-projection-contract.md` 只做 support reference，解释 owner split、required fields、currentness guard、domain mapping、forbidden authority source 和 failure semantics。 |
| Edited docs | 本 ledger 与 `docs/history/process/plans/README.md`。support doc 本体无需改写：它已经把 `assessment_owner=projection_only` 与 domain-owned eval/proof closure 边界分开。 |

## Reviewed Surfaces

| Area | Reviewed evidence |
| --- | --- |
| Governance inputs | `AGENTS.md`、`TASTE.md`、OPL Doc skill、`docs/docs_portfolio_consolidation.md`、`docs/active/current-state-vs-ideal-gap.md`。 |
| Support references | `docs/references/operating-governance/README.md`、`docs/references/operating-governance/family-domain-quality-projection-contract.md`、`docs/references/operating-governance/family-product-operator-projection.md`。 |
| Canonical boundary docs | `docs/status.md`、`docs/architecture.md`、`docs/invariants.md`、`docs/decisions.md`。 |
| Machine contract / tests | `contracts/opl-framework/family-domain-quality-projection-contract.json`、`tests/src/family-domain-quality-projection-contract.test.ts`、`tests/src/family-product-operator-projection.test.ts`。 |
| Related projection surfaces | `runtime app-operator drilldown` / product-operator projection references were read as consumers only; they do not own quality verdicts. |

## Coverage Result

- The machine contract requires `quality_gate_status`、`evidence_refs`、`review_refs`、`human_gate_reason`、`failure_escalation`、`latest_eval_or_proof_pointer` and `assessment_owner`.
- The machine contract maps quality authority to MAS `study_charter` / evidence / review / AI reviewer / truth-health surfaces, MAG grant review / fundability / authoring / submission surfaces, and RCA content-fit / render / export / visual QA surfaces.
- Tests guard required fields, MAS/MAG/RCA mapping and forbidden authority sources including generic persona QA, claim-only ready, OPL projection without domain-owned eval/proof refs, OPL-only quality verdict, OPL MAS ready verdict and OPL-held publication judgment.
- The support doc already matches that SSOT, so this tranche records lifecycle coverage without creating prose churn in current/support docs.

## Retired / Guarded Stale Readings

| Stale reading | Current handling |
| --- | --- |
| Generic OPL QA gate as a cross-domain quality owner | Retired by contract/test forbidden authority lists and support-doc owner split. |
| `assessment_owner=projection_only` closing quality gates | Forbidden; only domain-owned eval/proof/package pointers can close quality gates. |
| App/operator drilldown, worklist zero, refs-only receipt or OPL read-model as domain ready / production ready | Guarded by core invariants, operating-governance index and quality projection currentness guard. |
| MAS paper closure, MAG fundability / submission readiness, RCA visual/export ready from OPL projection alone | Forbidden; authority remains with the domain-owned evidence/proof surfaces. |
| Chat summary, memory, terminal prose or claim-only ready as quality authority | Listed as forbidden quality authorities in the machine contract and support reference. |

## Uncovered Scope

This tranche did not complete whole-portfolio coverage.

- `one-person-lab`: operating-governance docs beyond this theme, runtime-substrate docs, active support docs, history clusters, root README variants and remaining non-exact-covered docs remain under the global `/goal`.
- `med-autoscience`、`med-autogrant`、`redcube-ai`、`opl-meta-agent`、`one-person-lab-app`: no new body-level audit in this tranche.
- Live MAS/MAG/RCA domain eval/proof availability was not revalidated here; this tranche only verifies OPL-side projection vocabulary and authority boundary.

## Next Write Scope

Continue OPL support-reference coverage from fresh live truth, prioritizing the remaining operating-governance or runtime-substrate references that can still freeze dynamic counters, provider proof, owner receipt refs, App/operator projection readouts, domain ready claims, quality/export verdict wording, old Gateway/frontdoor vocabulary, or stale compatibility promises. Keep source/test/contract retirement tied to no-active-caller, replacement-owner, tombstone/provenance or negative-guard evidence.

## Verification

Minimum verification for this tranche:

- `git diff --check`
- conflict-marker scan over `README* docs`
- focused quality projection contract test
- OPL Doc doctor JSON output for the OPL repo

This ledger is history/provenance only. It does not close the global `/goal`.
