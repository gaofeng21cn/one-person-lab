# 2026-06-08 OPL Incident Learning Support Ledger

Owner: `One Person Lab`
Purpose: `docs_governance_incident_learning_support_ledger`
State: `history_provenance`
Machine boundary: 本文是人读 coverage ledger。当前 family incident learning truth 继续归 `contracts/opl-framework/family-incident-learning-loop.json`、source、tests、CLI/read-model、runtime ledger、provider receipt、domain-owned manifests 和 domain-owned closure refs。

## Scope

本轮延续 OPL Doc Governance `/goal`，只覆盖 OPL `operating-governance` 里的 family incident learning loop 主题。全局六仓 README/docs body-level coverage 仍未关闭，本 ledger 不声明 OPL series docs governance complete。

| Item | Handling |
| --- | --- |
| Semantic theme | OPL family 如何把可复现或可分类的失败回流成 durable follow-up asset，而不让聊天总结、memory、terminal prose、OPL-only 投影或无 source refs 的记录关闭 incident。 |
| Single Source of Truth | incident taxonomy、required fields、allowed follow-up assets、closure rules 和 OPL projection role 的机器真相归 `contracts/opl-framework/family-incident-learning-loop.json`；覆盖测试归 `tests/src/family-incident-learning-loop.test.ts`。 |
| Support doc role | `docs/references/operating-governance/family-incident-learning-loop.md` 只做 support reference，解释 owner split、incident taxonomy、required follow-up asset、record minimum、stop rules 和 product projection 边界。 |
| Edited docs | 本 ledger 与 `docs/history/process/plans/README.md`。support doc 本体无需改写：它已经把 family-level incident taxonomy、domain-owned repair/closure 和 OPL Runtime Manager projection 边界分开。 |

## Reviewed Surfaces

| Area | Reviewed evidence |
| --- | --- |
| Governance inputs | `AGENTS.md`、`TASTE.md`、OPL Doc skill、`docs/docs_portfolio_consolidation.md`、`docs/active/current-state-vs-ideal-gap.md`。 |
| Support references | `docs/references/operating-governance/README.md`、`docs/references/operating-governance/family-incident-learning-loop.md`、`docs/references/operating-governance/family-domain-quality-projection-contract.md`、`docs/references/operating-governance/family-product-operator-projection.md`。 |
| Canonical boundary docs | `docs/status.md`、`docs/architecture.md`、`docs/invariants.md`、`docs/decisions.md`。 |
| Machine contract / tests | `contracts/opl-framework/family-incident-learning-loop.json`、`tests/src/family-incident-learning-loop.test.ts`、`tests/src/family-product-operator-projection.test.ts`。 |
| Peer doc inventory | `README*`、`docs/**/*.md`、`contracts/**` and `tests/**` theme search for incident / source refs / chat-only closure wording showed this theme's active support owner is the operating-governance reference plus machine contract/test pair. |

## Coverage Result

- The machine contract defines eight incident kinds: `stalled_run`、`status_drift`、`missing_projection`、`quality_reopen`、`install_sync_drift`、`runtime_owner_mismatch`、`artifact_proof_missing` and `human_gate_blocked`.
- The machine contract requires incident records to carry `incident_id`、`domain_id`、`incident_kind`、`detected_at`、`source_refs`、`owner_repo`、`impact`、`follow_up_asset` and `closure_ref`.
- Allowed durable follow-up assets are `guard`、`test`、`contract`、`runbook`、`taxonomy_update` and `operator_projection`.
- Closure rules require source refs, reject chat / memory / terminal-prose-only closure, require a follow-up asset, and require domain-owned closure refs for domain-specific failures.
- The support doc already matches that SSOT and frames OPL projection as surfacing incident status, freshness, source refs, owner split and next gate without replacing domain runtime or quality authority.

## Retired / Guarded Stale Readings

| Stale reading | Current handling |
| --- | --- |
| Chat summary, memory note or terminal prose as incident closure | Rejected by machine closure rules and support-doc stop rules. |
| Incident record without `source_refs` | Rejected by machine closure rules; cannot be closed. |
| Incident record without durable follow-up asset | Rejected by allowed follow-up asset contract and stop rules. |
| OPL-only repair declaration for domain-specific failure | Rejected by `domain_specific_failure_requires_domain_owned_closure_ref`; closure must return to the owning domain repo. |
| Operator projection as proof of repair success, domain truth or quality authority | Guarded by support-doc owner split, product projection boundary and core invariants. |
| `hermes_agent` or runtime owner mismatch wording as default provider fallback | Guarded as `runtime_owner_mismatch`; non-default executor adapters remain explicit and cannot become compatibility fallback. |

## Uncovered Scope

This tranche did not complete whole-portfolio coverage.

- `one-person-lab`: operating-governance docs beyond this exact incident-learning theme, runtime-substrate docs, active support docs, history clusters, root README variants and remaining non-exact-covered docs remain under the global `/goal`.
- `med-autoscience`、`med-autogrant`、`redcube-ai`、`opl-meta-agent`、`one-person-lab-app`: no new body-level audit in this tranche.
- Live incident records across MAS/MAG/RCA/OMA were not revalidated here; this tranche only verifies OPL-side taxonomy, follow-up asset and closure-rule vocabulary.
- External repo state, including any dirty/conflict checkout, was left untouched and must be refreshed before selecting a future write lane.

## Next Write Scope

Continue OPL support-reference coverage from fresh live truth, prioritizing remaining operating-governance or runtime-substrate references that can still freeze dynamic counters, provider proof, owner receipt refs, App/operator projection readouts, domain ready claims, quality/export verdict wording, old Gateway/frontdoor vocabulary, generic fallback semantics or stale compatibility promises. Keep source/test/contract retirement tied to no-active-caller, replacement-owner, tombstone/provenance or negative-guard evidence.

## Verification

Minimum verification for this tranche:

- `git diff --check`
- conflict-marker scan over `README* docs`
- focused incident learning loop tests
- OPL Doc doctor JSON output for the OPL repo

This ledger is history/provenance only. It does not close the global `/goal`.
