**English** | [中文](./opl-gateway-acceptance-test-spec.zh-CN.md)

# OPL Gateway Acceptance Test Spec

## Purpose

This document freezes the acceptance / test-spec for the current `OPL Gateway` documentation-and-contract stack.

Its role is to make gateway progress checkable without reinterpreting the architecture from scratch each time.

The target is not runtime verification.
The target is contract verification, wording verification, routing-safety verification, and federation-boundary verification.

## Scope

This acceptance spec covers:

- `G1` machine-readable registry and handoff completeness
- `G2` read-only discovery correctness
- `G3` routed action safety
- domain onboarding gate readiness
- `P5.M1` governance / audit operating-surface integrity
- `P5.M2` publish / promotion operating-surface integrity
- `P7` example-corpus integrity
- `P8` public-surface-index integrity
- `P10` routed-safety example integrity
- `P12` operating example integrity
- `P13` operating-record-catalog integrity
- `P14` surface lifecycle map integrity
- `P15` surface authority matrix integrity
- `P16` surface review matrix integrity
- cross-domain wording consistency across public surfaces

## Governing Sources

The acceptance checks below are grounded in:

- [README](../README.md)
- [OPL Federation Contract](./opl-federation-contract.md)
- [OPL Read-Only Discovery Gateway](./opl-read-only-discovery-gateway.md)
- [OPL Routed Action Gateway](./opl-routed-action-gateway.md)
- [OPL Domain Onboarding Contract](./opl-domain-onboarding-contract.md)
- [OPL Governance / Audit Operating Surface](./opl-governance-audit-operating-surface.md)
- [OPL Publish / Promotion Operating Surface](./opl-publish-promotion-operating-surface.md)
- [OPL Public Surface Index](./opl-public-surface-index.md)
- [OPL Routed-Safety Example Corpus](./opl-routed-safety-example-corpus.md)
- [OPL Gateway Rollout](./opl-gateway-rollout.md)
- [OPL Gateway Contracts](../contracts/opl-gateway/README.md)
- [`acceptance-matrix.json`](../contracts/opl-gateway/acceptance-matrix.json)

## Companion Reference Surfaces

- [OPL Gateway Example Corpus](./opl-gateway-example-corpus.md)
- [OPL Operating Example Corpus](./opl-operating-example-corpus.md)
- [OPL Operating Record Catalog](./opl-operating-record-catalog.md)
- [OPL Surface Lifecycle Map](./opl-surface-lifecycle-map.md)
- [OPL Surface Authority Matrix](./opl-surface-authority-matrix.md)
- [OPL Surface Review Matrix](./opl-surface-review-matrix.md)

These companion surfaces are illustrative or reference-only. The gateway corpus shows cross-layer composition; the operating corpus materializes standalone `P5.M1` / `P5.M2` records; the operating-record catalog indexes the frozen record kinds; the lifecycle map exposes the frozen surface dependency/discoverability graph without adding execution semantics; the authority matrix exposes routing/execution/truth/review/publication ownership boundaries without becoming an authorization engine; the review matrix exposes human-review / acceptance / companion-surface / publishability-stage obligations without becoming an approval engine or publish controller. None of them replace the contracts and acceptance gates above.

## A. G1 Registry Completeness

### Acceptance Criteria

`G1` passes only when all of the following are true:

1. `contracts/opl-gateway/workstreams.json` exists and is valid JSON.
2. `contracts/opl-gateway/domains.json` exists and is valid JSON.
3. `contracts/opl-gateway/routing-vocabulary.json` exists and is valid JSON.
4. `contracts/opl-gateway/handoff.schema.json` exists and is valid JSON Schema JSON.
5. The workstream registry explicitly encodes:
   - `research_ops -> medautoscience`
   - `presentation_ops -> redcube`
   - `ppt_deck` as a direct mapping to `presentation_ops`
   - `xiaohongshu` as routable to `redcube` without auto-equating it to `presentation_ops`
6. The domain registry explicitly keeps canonical truth inside domains rather than in `OPL`.
7. The routing vocabulary explicitly includes top-level routing order and special-case family handling.
8. The handoff schema defines the frozen OPL-to-domain gateway payload and does not authorize direct harness targeting.

### Verification

- Parse all JSON / schema files under `contracts/opl-gateway/` with `json.load`.
- Inspect `workstreams.json`, `domains.json`, `routing-vocabulary.json`, and `handoff.schema.json` for the required mapping and boundary fields.
- Confirm contract README positions the directory as machine-readable contract materialization rather than runtime.

## B. G2 Discovery Correctness

### Acceptance Criteria

`G2` passes only when all of the following are true:

1. The discovery contract defines:
   - `list_workstreams`
   - `get_workstream`
   - `list_domains`
   - `get_domain`
   - `resolve_request_surface`
   - `explain_domain_boundary`
2. `G2` discovery is explicitly described as read-only.
3. `G2` explicitly does **not**:
   - create deliverables
   - mutate workspaces
   - start runs
   - bypass domain gateways
   - own canonical runtime truth
4. `resolve_request_surface` is grounded on the frozen G1 registries and routing vocabulary.
5. `xiaohongshu` is allowed to resolve to `redcube` without being automatically labeled as `presentation_ops`.

### Verification

- Check `docs/opl-read-only-discovery-gateway.md` and `.zh-CN.md` for the required operations and non-goals.
- Verify that discovery docs link back to the machine-readable G1 surfaces.
- Verify that discovery wording never upgrades `G2` into a mutation surface.

## C. G3 Routing Safety

### Acceptance Criteria

`G3` passes only when all of the following are true:

1. The routed action contract defines:
   - `route_request`
   - `build_handoff_payload`
   - `audit_routing_decision`
2. `route_request` supports explicit unresolved states:
   - `refused`
   - `unknown_domain`
   - `ambiguous_task`
3. `build_handoff_payload` targets `domain_gateway` only.
4. The routed contract explicitly forbids bypassing the domain gateway and directly calling the harness.
5. The machine-readable routed-action schema stays aligned with the public G3 doc.
6. Routing evidence remains explicit and auditable rather than hidden behind best-effort wording.

### Verification

- Parse `contracts/opl-gateway/routed-actions.schema.json`.
- Check `docs/opl-routed-action-gateway.md` and `.zh-CN.md` for all required operations and failure states.
- Grep for no-bypass wording and confirm it is framed as a hard rule, not a preference.

## D. Domain Onboarding Gate

### Acceptance Criteria

The onboarding gate passes only when all of the following are true:

1. `contracts/opl-gateway/domain-onboarding-readiness.schema.json` exists and is valid JSON Schema JSON.
2. `examples/opl-gateway/domain-onboarding-readiness.json` exists and validates against that schema.
3. The onboarding contract requires complete `G1` registry material for any new domain.
4. The onboarding contract requires explicit public documentation surfaces.
5. The onboarding contract requires explicit truth-ownership declaration.
6. The onboarding contract requires explicit review surfaces.
7. The onboarding contract defines a formal inclusion gate covering:
   - registry complete
   - boundary explicit
   - truth ownership explicit
   - discovery ready
   - routing ready
   - review ready
   - cross-domain wording aligned
8. The onboarding contract remains non-executing, does not auto-admit domains, and does not replace the prose review gate.
9. The onboarding contract explicitly forbids “placeholder first, boundary later”.
10. The onboarding contract explicitly forbids treating future domains as internal `OPL` modules.

### Verification

- Parse `contracts/opl-gateway/domain-onboarding-readiness.schema.json` and validate `examples/opl-gateway/domain-onboarding-readiness.json` against it.
- Check `docs/opl-domain-onboarding-contract.md` and `.zh-CN.md` for each required gate.
- Confirm the onboarding gate stays downstream of G1/G2/G3 rather than replacing them.
- Confirm the onboarding contract does not move canonical truth into `OPL`.

## E. P5.M1 Governance / Audit Operating-Surface Integrity

### Acceptance Criteria

`P5.M1` passes only when all of the following are true:

1. `docs/opl-governance-audit-operating-surface.md` and `.zh-CN.md` exist.
2. `contracts/opl-gateway/governance-audit.schema.json` exists and is valid JSON Schema JSON.
3. The governance / audit surface allows only these top-level record kinds:
   - `routing_audit`
   - `governance_decision`
   - `publish_readiness_signal`
   - `cross_domain_review_index`
4. The governance / audit doc and schema keep `OPL` at the index/signal layer rather than making it runtime truth, review truth, or publish truth owner.
5. `domain_truth_refs` remains mandatory for the machine-readable governance / audit envelope.
6. The governance schema keeps kind-specific records explicit and does not allow `decision_source = opl_gateway`.
7. `publish_readiness_signal` remains explicitly non-equivalent to publication, submission, release, export, or domain approval truth.
8. Governance / audit wording still forbids bypassing the domain gateway to reach the harness.

### Verification

- Parse `contracts/opl-gateway/governance-audit.schema.json`.
- Check `docs/opl-governance-audit-operating-surface.md` and `.zh-CN.md` for the allowed record kinds and the no-truth-shift wording.
- Confirm the schema uses kind-specific discrimination and that `decision_source` excludes `opl_gateway`.
- Confirm governance / audit wording stays downstream of routed action and does not create a new execution runtime.

## F. P5.M2 Publish / Promotion Operating-Surface Integrity

### Acceptance Criteria

`P5.M2` passes only when all of the following are true:

1. `docs/opl-publish-promotion-operating-surface.md` and `.zh-CN.md` exist.
2. `contracts/opl-gateway/publish-promotion.schema.json` exists and is valid JSON Schema JSON.
3. The publish / promotion surface explicitly begins only after a domain-owned publish / release / export / submission outcome already exists.
4. The publish / promotion doc and schema allow only these top-level record kinds:
   - `publish_outcome_index`
   - `promotion_candidate_signal`
   - `promotion_surface_index`
5. The publish / promotion doc and schema keep `OPL` at the index/signal layer rather than making it publish truth, release truth, export truth, submission truth, or public-channel posting truth owner.
6. `domain_truth_refs` remains mandatory for the machine-readable publish / promotion envelope.
7. Publish / promotion wording still forbids direct venue submission, direct export/release, direct public posting, and direct harness bypass.
8. The `P5.M1 -> P5.M2` boundary remains explicit: readiness lives in `P5.M1`; post-publish indexing and promotion signaling live in `P5.M2`.

### Verification

- Parse `contracts/opl-gateway/publish-promotion.schema.json`.
- Check `docs/opl-publish-promotion-operating-surface.md` and `.zh-CN.md` for the post-publish boundary and no-truth-shift wording.
- Confirm the schema keeps kind-specific records explicit and keeps `domain_truth_refs` mandatory.
- Confirm publish / promotion wording does not turn `OPL` into a venue-submission runtime or public-channel posting runtime.

## G. Cross-Domain Wording Consistency

### Acceptance Criteria

The wording-consistency gate passes only when all of the following are true:

1. Public `OPL` surfaces describe `OPL` as the top-level gateway / federation surface.
2. Public `OPL` surfaces do **not** describe `OPL` as:
   - the one place where all runtime behavior lives
   - a replacement for domain gateways
   - a monolithic runtime
3. `MedAutoScience` remains described as the active `Research Ops` domain gateway and harness.
4. `RedCube AI` remains described as the visual-deliverable / `Presentation Ops`-carrying domain gateway and harness.
5. `ppt_deck` remains explicitly mapped to `Presentation Ops`.
6. `xiaohongshu` remains explicitly non-equivalent to `Presentation Ops` at the OPL layer.
7. No public wording turns domain projects into private OPL implementation details.
8. Governance / audit wording remains index-only rather than runtime-owning.
9. Publish / promotion wording remains index-only rather than publish-owning or promotion-owning.

### Verification

- Read `README.md`, `README.zh-CN.md`, `docs/roadmap*.md`, and the linked gateway docs.
- Run targeted `rg` checks for deprecated wording and for the required domain-role wording.
- Cross-check the OPL repository wording against the public READMEs in `med-autoscience`, `redcube-ai`, and `gaofeng21cn`.

## H. P7 Example-Corpus Integrity

### Acceptance Criteria

`P7` passes only when all of the following are true:

1. `docs/opl-gateway-example-corpus.md` and `.zh-CN.md` exist.
2. `examples/opl-gateway/research-ops-submission.json` and `examples/opl-gateway/presentation-ops-publish.json` exist and are valid JSON.
3. The corpus docs explicitly keep the example set illustrative, non-governing, and non-executing.
4. The research example explicitly preserves:
   - `research_ops -> medautoscience`
   - `entry_surface = domain_gateway`
   - schema-governed routing / handoff / governance / publish records aligned with the frozen contracts
5. The presentation example explicitly preserves:
   - `presentation_ops -> redcube`
   - `ppt_deck` as a direct mapping to `presentation_ops`
   - `xiaohongshu` as routable to `redcube` without auto-equating it to `presentation_ops`
6. Example records keep domain truth inside domains rather than moving it into `OPL`.
7. The example corpus does not imply runtime execution, direct harness targeting, or a new governing layer above the frozen contracts.

### Verification

- Parse the example JSON files with `json.load`.
- Validate the schema-governed example sub-objects against the frozen routed-action, governance/audit, and publish/promotion schemas.
- Check the example-corpus docs for illustrative / non-governing / no-runtime wording.
- Confirm the examples preserve the `ppt_deck` / `xiaohongshu` special-case boundary.

## I. P8 Public-Surface-Index Integrity

### Acceptance Criteria

`P8` passes only when all of the following are true:

1. `contracts/opl-gateway/public-surface-index.json` exists and is valid JSON.
2. `docs/opl-public-surface-index.md` and `.zh-CN.md` exist.
3. The public-surface index explicitly remains machine-readable and non-executing.
4. The public-surface index explicitly distinguishes:
   - OPL-owned public-entry / contract / supporting surfaces
   - domain-owned public-entry surfaces
5. The index links domain public-entry surfaces without indexing harness internals, runtime launch surfaces, or domain canonical-truth registries.
6. The index preserves the frozen current mapping:
   - `research_ops -> medautoscience`
   - `presentation_ops -> redcube`
   - `ppt_deck` directly maps to `presentation_ops`
   - `xiaohongshu` may route to `redcube` without auto-equating it to `presentation_ops`
7. Linked README / roadmap / federation / rollout / contract-hub wording does not upgrade the public-surface index into a launcher, runtime registry, or truth-owner surface.

### Verification

- Parse `contracts/opl-gateway/public-surface-index.json`.
- Check structural integrity for category references, `routes_to` targets, and local `repo_path` refs.
- Check `docs/opl-public-surface-index.md` and `.zh-CN.md` for no-runtime / no-truth-shift / no-internal-module wording.
- Verify the linked public OPL surfaces actually point to the public-surface index where intended.

## J. P10 Routed-Safety Example Integrity

### Acceptance Criteria

`P10` passes only when all of the following are true:

1. `docs/opl-routed-safety-example-corpus.md` and `.zh-CN.md` exist.
2. `examples/opl-gateway/ambiguous-task-routing.json`, `unknown-domain-routing.json`, and `refusal-routing.json` exist and are valid JSON.
3. Each routed-safety example stays below the routed boundary:
   - no `build_handoff_payload`
   - no hidden best-effort reroute
   - no domain-truth transfer into `OPL`
4. The ambiguous-task example keeps `candidate_workstreams` / `candidate_domains` explicit and does not invent a resolved owner.
5. The unknown-domain example keeps the unowned workstream explicit and does not force-fit the request into an existing domain.
6. The refusal example keeps the top-level refusal reason explicit and does not soften direct-harness bypass into a routed outcome.
7. Routed-safety docs and linked surfaces keep the corpus illustrative, non-governing, and non-executing.

### Verification

- Parse the routed-safety example JSON files with `json.load`.
- Validate their routed-action and governance-audit sub-objects against the frozen schemas.
- Check `docs/opl-routed-safety-example-corpus.md` and `.zh-CN.md` for no-runtime / no-fallback / no-truth-shift wording.
- Confirm the public-surface index and routed-action docs link to the routed-safety corpus where intended.

## K. P12 Operating Example Integrity

### Acceptance Criteria

`P12` passes only when all of the following are true:

1. `docs/opl-operating-example-corpus.md` and `.zh-CN.md` exist.
2. The six standalone operating examples exist and are valid JSON:
   - `examples/opl-gateway/governance-decision-record.json`
   - `examples/opl-gateway/cross-domain-review-index.json`
   - `examples/opl-gateway/publish-readiness-signal.json`
   - `examples/opl-gateway/publish-outcome-index.json`
   - `examples/opl-gateway/promotion-candidate-signal.json`
   - `examples/opl-gateway/promotion-surface-index.json`
3. The governance-side examples validate directly against `contracts/opl-gateway/governance-audit.schema.json`.
4. The publish / promotion examples validate directly against `contracts/opl-gateway/publish-promotion.schema.json`.
5. The operating-example corpus docs explicitly keep the examples illustrative, non-governing, and non-executing.
6. The governance / audit and publish / promotion docs point to the operating-example corpus as the canonical standalone machine-readable example surface.
7. The contract hub, public-surface index, and acceptance surfaces expose the operating-example corpus as a supporting surface rather than a runtime.
8. The examples keep review, publish, and promotion truth inside domains and keep any follow-on action behind `domain_gateway`.
9. The corpus does not authorize direct publish, release, export, submission, or public posting by `OPL`.

### Verification

- Parse the six operating-example JSON files with `json.load`.
- Validate the three governance-side examples against `governance-audit.schema.json` and the three publish-side examples against `publish-promotion.schema.json`.
- Check `docs/opl-operating-example-corpus.md` and `.zh-CN.md` for illustrative / non-governing / non-executing wording.
- Confirm the governance / audit docs, publish / promotion docs, contract README, public-surface index, and acceptance spec all link to the operating-example corpus where intended.

## L. P13 Operating-Record-Catalog Integrity

### Acceptance Criteria

`P13` passes only when all of the following are true:

1. `contracts/opl-gateway/operating-record-catalog.json` exists and is valid JSON.
2. `docs/opl-operating-record-catalog.md` and `.zh-CN.md` exist.
3. The catalog covers all frozen operating record kinds:
   - `routing_audit`
   - `governance_decision`
   - `publish_readiness_signal`
   - `cross_domain_review_index`
   - `publish_outcome_index`
   - `promotion_candidate_signal`
   - `promotion_surface_index`
4. Each catalog entry stays reference-level and carries only derived boundary fields such as `surface_layer`, `stage_boundary`, `truth_mode`, `schema_ref`, `example_refs`, and `follow_on_route_surface`.
5. Every `schema_ref` and every `example_ref` resolves to an existing local artifact.
6. The catalog keeps `domain_gateway` as the only follow-on route surface whenever follow-on domain action exists.
7. The catalog stays non-executing, does not become a runtime manifest, and does not become a second source of truth above the frozen schemas/docs/examples.
8. Contract README, public-surface index, and acceptance surfaces expose the catalog as a supporting/reference surface rather than an execution surface.

### Verification

- Parse `contracts/opl-gateway/operating-record-catalog.json` with `json.load`.
- Confirm the catalog covers exactly the frozen `P5.M1` / `P5.M2` record kinds.
- Check that each `schema_ref` and `example_ref` resolves to an existing local artifact.
- Check `docs/opl-operating-record-catalog.md` and `.zh-CN.md` for non-executing / no-truth-shift / domain_gateway-only wording.
- Confirm the contract hub, public-surface index, governance/publish docs, and acceptance surfaces link to the catalog where intended.

## M. P14 Surface-Lifecycle-Map Integrity

### Acceptance Criteria

`P14` passes only when all of the following are true:

1. `contracts/opl-gateway/surface-lifecycle-map.json` exists and is valid JSON.
2. `docs/opl-surface-lifecycle-map.md` and `.zh-CN.md` exist.
3. The lifecycle map covers exactly these currently frozen surfaces:
   - `opl_gateway_contract_hub`
   - `opl_read_only_discovery_gateway`
   - `opl_routed_action_gateway`
   - `opl_domain_onboarding_contract`
   - `opl_governance_audit_operating_surface`
   - `opl_publish_promotion_operating_surface`
   - `opl_gateway_example_corpus`
   - `opl_routed_safety_example_corpus`
   - `opl_operating_example_corpus`
   - `opl_operating_record_catalog`
   - `opl_public_surface_index_doc`
   - `opl_gateway_acceptance_spec`
4. Each lifecycle entry stays derived/reference-only and carries only surface-boundary fields such as `layer_id`, `control_mode`, `truth_mode`, `requires_surfaces`, `enables_surfaces`, `follow_on_route_surface`, and `governing_refs`.
5. Every `requires_surfaces` and `enables_surfaces` target resolves to another known lifecycle entry.
6. Every `surface_id` covered by the lifecycle map also exists inside `contracts/opl-gateway/public-surface-index.json`.
7. Every `governing_ref` resolves to an existing local artifact.
8. `follow_on_route_surface` is always either `null` or `domain_gateway`.
9. The lifecycle map stays non-executing, does not become a workflow engine, does not become a transition authority, and does not become a second source of truth or runtime manifest.
10. Contract README, public-surface index, operating-record catalog, and acceptance surfaces expose the lifecycle map as a supporting/reference surface rather than an execution surface.

### Verification

- Parse `contracts/opl-gateway/surface-lifecycle-map.json` with `json.load`.
- Confirm the lifecycle map covers exactly the frozen surface set above.
- Check that each `requires_surfaces` / `enables_surfaces` target resolves inside the same map and that each `governing_ref` resolves locally.
- Confirm `follow_on_route_surface in {null, domain_gateway}` for every entry.
- Confirm the contract hub, public-surface index, operating-record catalog, and acceptance surfaces link to the lifecycle map where intended.

## N. P15 Surface-Authority-Matrix Integrity

### Acceptance Criteria

`P15` passes only when all of the following are true:

1. `contracts/opl-gateway/surface-authority-matrix.json` exists and is valid JSON.
2. `docs/opl-surface-authority-matrix.md` and `.zh-CN.md` exist.
3. The authority matrix covers exactly these current authority-review surfaces:
   - `opl_gateway_contract_hub`
   - `opl_read_only_discovery_gateway`
   - `opl_routed_action_gateway`
   - `opl_domain_onboarding_contract`
   - `opl_governance_audit_operating_surface`
   - `opl_publish_promotion_operating_surface`
   - `opl_gateway_example_corpus`
   - `opl_routed_safety_example_corpus`
   - `opl_operating_example_corpus`
   - `opl_operating_record_catalog`
   - `opl_surface_lifecycle_map`
   - `opl_public_surface_index_doc`
   - `opl_gateway_acceptance_spec`
   - `medautoscience_public_gateway`
   - `redcube_public_gateway`
4. Each matrix entry stays derived/reference-only and carries only authority-boundary fields such as `owner_scope`, `surface_role`, `route_authority`, `execution_authority`, `truth_authority`, `review_authority`, `publication_authority`, `allowed_follow_on_surface`, `forbidden_actions`, and `governing_refs`.
5. Every `governing_ref` resolves to an existing local artifact.
6. Every `surface_id` covered by the authority matrix also exists inside `contracts/opl-gateway/public-surface-index.json`.
7. For every OPL-owned entry, `execution_authority`, `truth_authority`, `review_authority`, and `publication_authority` all remain `none`.
8. Linked domain public-entry surfaces remain `owner_scope = domain` and keep domain-local routing/execution/truth/review/publication authority.
9. `allowed_follow_on_surface` is always either `null` or `domain_gateway`.
10. Contract README, lifecycle map docs, public-surface index, and acceptance surfaces expose the authority matrix as a supporting/reference surface rather than an authorization or execution surface.

### Verification

- Parse `contracts/opl-gateway/surface-authority-matrix.json` with `json.load`.
- Confirm the authority matrix covers exactly the frozen surface set above.
- Check that each `governing_ref` resolves locally and that each `surface_id` is present in the public-surface index.
- Confirm every OPL-owned entry keeps `execution_authority = truth_authority = review_authority = publication_authority = none`.
- Confirm linked domain public-entry entries remain domain-owned and that `allowed_follow_on_surface in {null, domain_gateway}` for every entry.
- Confirm the contract hub, lifecycle map docs, public-surface index, and acceptance surfaces link to the authority matrix where intended.

## O. P16 Surface-Review-Matrix Integrity

### Acceptance Criteria

`P16` passes only when all of the following are true:

1. `contracts/opl-gateway/surface-review-matrix.json` exists and is valid JSON.
2. `docs/opl-surface-review-matrix.md` and `.zh-CN.md` exist.
3. The surface review matrix covers exactly these current human-review surfaces:
   - `opl_public_readme`
   - `opl_roadmap`
   - `opl_gateway_rollout`
   - `opl_federation_contract`
   - `opl_gateway_contract_hub`
   - `opl_read_only_discovery_gateway`
   - `opl_routed_action_gateway`
   - `opl_domain_onboarding_contract`
   - `opl_governance_audit_operating_surface`
   - `opl_publish_promotion_operating_surface`
   - `opl_gateway_example_corpus`
   - `opl_routed_safety_example_corpus`
   - `opl_operating_example_corpus`
   - `opl_operating_record_catalog`
   - `opl_surface_lifecycle_map`
   - `opl_surface_authority_matrix`
   - `opl_public_surface_index_doc`
   - `opl_gateway_acceptance_spec`
4. Each review entry stays derived/reference-only and carries only review-boundary fields such as `owner_scope`, `surface_role`, `human_review_required`, `required_acceptance_gates`, `required_companion_surfaces`, `cross_domain_wording_check`, `publishability_stage`, and `governing_refs`.
5. Every `required_acceptance_gate` resolves inside `contracts/opl-gateway/acceptance-matrix.json`.
6. Every `required_companion_surface` resolves inside `contracts/opl-gateway/public-surface-index.json`.
7. Every `surface_id` covered by the review matrix also exists inside `contracts/opl-gateway/public-surface-index.json`.
8. Every `governing_ref` resolves to an existing local artifact.
9. Every `human_review_required` value remains `true` for the covered OPL-owned surfaces.
10. The review matrix stays non-executing, does not become an approval engine, does not become a publish controller or release engine, and does not transfer domain review or publication authority into `OPL`.
11. Contract README, public-surface index, lifecycle map docs, authority matrix docs, and acceptance surfaces expose the review matrix as a supporting/reference surface rather than as an approval or execution surface.

### Verification

- Parse `contracts/opl-gateway/surface-review-matrix.json` with `json.load`.
- Confirm the review matrix covers exactly the frozen surface set above.
- Check that each `required_acceptance_gate` resolves in the current acceptance matrix, each `required_companion_surface` resolves in the current public-surface index, and each `governing_ref` resolves locally.
- Confirm every covered OPL surface keeps `human_review_required = true`.
- Confirm the contract hub, public-surface index, lifecycle map docs, authority matrix docs, and acceptance surfaces link to the review matrix where intended.

## Standard Verification Commands

```bash
git diff --check
python3 - <<'PY'
import json
from pathlib import Path
for path in sorted(list(Path('contracts/opl-gateway').glob('*.json')) + list(Path('examples/opl-gateway').glob('*.json'))):
    json.load(path.open())
    print('OK', path)
PY
python3 - <<'PY'
import json
from pathlib import Path
from jsonschema import Draft202012Validator, FormatChecker, RefResolver

contracts = Path('contracts/opl-gateway')
routed_schema_path = contracts / 'routed-actions.schema.json'
handoff_schema_path = contracts / 'handoff.schema.json'
gov_schema_path = contracts / 'governance-audit.schema.json'
pub_schema_path = contracts / 'publish-promotion.schema.json'

routed_schema = json.loads(routed_schema_path.read_text())
handoff_schema = json.loads(handoff_schema_path.read_text())
gov_schema = json.loads(gov_schema_path.read_text())
pub_schema = json.loads(pub_schema_path.read_text())

store = {
    routed_schema['$id']: routed_schema,
    handoff_schema['$id']: handoff_schema,
    str(handoff_schema_path.resolve().as_uri()): handoff_schema,
    './handoff.schema.json': handoff_schema,
    'handoff.schema.json': handoff_schema,
}
resolver = RefResolver.from_schema(routed_schema, store=store)

routed = Draft202012Validator(
    routed_schema,
    resolver=resolver,
    format_checker=FormatChecker(),
)
gov = Draft202012Validator(gov_schema, format_checker=FormatChecker())
pub = Draft202012Validator(pub_schema, format_checker=FormatChecker())

for rel in [
    'examples/opl-gateway/research-ops-submission.json',
    'examples/opl-gateway/presentation-ops-publish.json',
    'examples/opl-gateway/ambiguous-task-routing.json',
    'examples/opl-gateway/unknown-domain-routing.json',
    'examples/opl-gateway/refusal-routing.json',
]:
    data = json.loads(Path(rel).read_text())
    routed.validate(data['route_request'])
    routed.validate(data['audit_routing_decision'])
    if 'build_handoff_payload' in data:
        routed.validate(data['build_handoff_payload'])
    gov.validate(data['governance_audit_record'])
    if 'publish_promotion_record' in data:
        pub.validate(data['publish_promotion_record'])
    print('examples schema OK', rel)

for rel in [
    'examples/opl-gateway/governance-decision-record.json',
    'examples/opl-gateway/cross-domain-review-index.json',
    'examples/opl-gateway/publish-readiness-signal.json',
]:
    gov.validate(json.loads(Path(rel).read_text()))
    print('governance example OK', rel)

for rel in [
    'examples/opl-gateway/publish-outcome-index.json',
    'examples/opl-gateway/promotion-candidate-signal.json',
    'examples/opl-gateway/promotion-surface-index.json',
]:
    pub.validate(json.loads(Path(rel).read_text()))
    print('publish example OK', rel)
PY
python3 - <<'PY'
import json
from pathlib import Path
from jsonschema import Draft202012Validator, FormatChecker

schema = json.loads(Path('contracts/opl-gateway/domain-onboarding-readiness.schema.json').read_text())
Draft202012Validator.check_schema(schema)
example = json.loads(Path('examples/opl-gateway/domain-onboarding-readiness.json').read_text())
Draft202012Validator(schema, format_checker=FormatChecker()).validate(example)
print('onboarding readiness schema OK')
PY
python3 - <<'PY'
import json
from pathlib import Path

catalog = json.loads(Path('contracts/opl-gateway/operating-record-catalog.json').read_text())
expected = {
    'routing_audit',
    'governance_decision',
    'publish_readiness_signal',
    'cross_domain_review_index',
    'publish_outcome_index',
    'promotion_candidate_signal',
    'promotion_surface_index',
}
found = {entry['record_kind'] for entry in catalog['record_kinds']}
assert found == expected, (found, expected)
for entry in catalog['record_kinds']:
    assert entry['follow_on_route_surface'] == 'domain_gateway', entry
    schema_path = Path(entry['schema_ref'])
    assert schema_path.exists(), schema_path
    for ref in entry['example_refs']:
        path = Path(ref.split('#', 1)[0])
        assert path.exists(), (entry['record_kind'], ref)
print('operating record catalog OK')
PY
python3 - <<'PY'
import json
from pathlib import Path

lifecycle = json.loads(Path('contracts/opl-gateway/surface-lifecycle-map.json').read_text())
idx = json.loads(Path('contracts/opl-gateway/public-surface-index.json').read_text())

expected = {
    'opl_gateway_contract_hub',
    'opl_read_only_discovery_gateway',
    'opl_routed_action_gateway',
    'opl_domain_onboarding_contract',
    'opl_governance_audit_operating_surface',
    'opl_publish_promotion_operating_surface',
    'opl_gateway_example_corpus',
    'opl_routed_safety_example_corpus',
    'opl_operating_example_corpus',
    'opl_operating_record_catalog',
    'opl_public_surface_index_doc',
    'opl_gateway_acceptance_spec',
}
surface_ids = {entry['surface_id'] for entry in lifecycle['surfaces']}
assert surface_ids == expected, (surface_ids, expected)
assert set(lifecycle['covered_surface_ids']) == expected, lifecycle['covered_surface_ids']
public_surface_ids = {surface['surface_id'] for surface in idx['surfaces']}
assert 'opl_surface_lifecycle_map' in public_surface_ids, public_surface_ids
assert surface_ids <= public_surface_ids, (surface_ids - public_surface_ids)
for entry in lifecycle['surfaces']:
    for key in ['requires_surfaces', 'enables_surfaces']:
        for target in entry[key]:
            assert target in surface_ids, (entry['surface_id'], key, target)
    assert entry['follow_on_route_surface'] in (None, 'domain_gateway'), entry
    for ref in entry['governing_refs']:
        assert Path(ref).exists(), (entry['surface_id'], ref)
print('surface lifecycle map OK')
PY
python3 - <<'PY'
import json
from pathlib import Path

matrix = json.loads(Path('contracts/opl-gateway/surface-authority-matrix.json').read_text())
idx = json.loads(Path('contracts/opl-gateway/public-surface-index.json').read_text())

expected = {
    'opl_gateway_contract_hub',
    'opl_read_only_discovery_gateway',
    'opl_routed_action_gateway',
    'opl_domain_onboarding_contract',
    'opl_governance_audit_operating_surface',
    'opl_publish_promotion_operating_surface',
    'opl_gateway_example_corpus',
    'opl_routed_safety_example_corpus',
    'opl_operating_example_corpus',
    'opl_operating_record_catalog',
    'opl_surface_lifecycle_map',
    'opl_public_surface_index_doc',
    'opl_gateway_acceptance_spec',
    'medautoscience_public_gateway',
    'redcube_public_gateway',
}
surface_ids = {entry['surface_id'] for entry in matrix['authority_entries']}
assert surface_ids == expected, (surface_ids, expected)
assert set(matrix['covered_surface_ids']) == expected, matrix['covered_surface_ids']
public_surface_ids = {surface['surface_id'] for surface in idx['surfaces']}
assert 'opl_surface_authority_matrix' in public_surface_ids, public_surface_ids
assert surface_ids <= public_surface_ids, (surface_ids - public_surface_ids)
for entry in matrix['authority_entries']:
    if entry['owner_scope'] == 'opl':
        for key in ['execution_authority', 'truth_authority', 'review_authority', 'publication_authority']:
            assert entry[key] == 'none', (entry['surface_id'], key, entry[key])
    else:
        assert entry['owner_scope'] == 'domain', entry
    assert entry['allowed_follow_on_surface'] in (None, 'domain_gateway'), entry
    for ref in entry['governing_refs']:
        assert Path(ref).exists(), (entry['surface_id'], ref)
print('surface authority matrix OK')
PY
python3 - <<'PY'
import json
from pathlib import Path

review = json.loads(Path('contracts/opl-gateway/surface-review-matrix.json').read_text())
acceptance = json.loads(Path('contracts/opl-gateway/acceptance-matrix.json').read_text())
idx = json.loads(Path('contracts/opl-gateway/public-surface-index.json').read_text())

expected = {
    'opl_public_readme',
    'opl_roadmap',
    'opl_gateway_rollout',
    'opl_federation_contract',
    'opl_gateway_contract_hub',
    'opl_read_only_discovery_gateway',
    'opl_routed_action_gateway',
    'opl_domain_onboarding_contract',
    'opl_governance_audit_operating_surface',
    'opl_publish_promotion_operating_surface',
    'opl_gateway_example_corpus',
    'opl_routed_safety_example_corpus',
    'opl_operating_example_corpus',
    'opl_operating_record_catalog',
    'opl_surface_lifecycle_map',
    'opl_surface_authority_matrix',
    'opl_public_surface_index_doc',
    'opl_gateway_acceptance_spec',
}
surface_ids = {entry['surface_id'] for entry in review['review_entries']}
assert surface_ids == expected, (surface_ids, expected)
assert set(review['covered_surface_ids']) == expected, review['covered_surface_ids']
acceptance_gate_ids = {gate['gate_id'] for gate in acceptance['gates']}
public_surface_ids = {surface['surface_id'] for surface in idx['surfaces']}
assert 'opl_surface_review_matrix' in public_surface_ids, public_surface_ids
assert surface_ids <= public_surface_ids, (surface_ids - public_surface_ids)
for entry in review['review_entries']:
    assert entry['owner_scope'] == 'opl', entry
    assert entry['human_review_required'] is True, entry
    assert entry['cross_domain_wording_check'] in {'shared_gate_required', 'local_review_required'}, entry
    assert entry['publishability_stage'] in {
        'top_level_positioning_aligned',
        'contract_boundary_aligned',
        'supporting_reference_aligned',
        'acceptance_reference_aligned',
    }, entry
    for gate_id in entry['required_acceptance_gates']:
        assert gate_id in acceptance_gate_ids, (entry['surface_id'], gate_id)
    for companion in entry['required_companion_surfaces']:
        assert companion in public_surface_ids, (entry['surface_id'], companion)
    for ref in entry['governing_refs']:
        assert Path(ref).exists(), (entry['surface_id'], ref)
print('surface review matrix OK')
PY
python3 - <<'PY'
import json
from pathlib import Path

idx = json.loads(Path('contracts/opl-gateway/public-surface-index.json').read_text())
category_ids = {category['category_id'] for category in idx['surface_categories']}
surface_ids = [surface['surface_id'] for surface in idx['surfaces']]
surface_id_set = set(surface_ids)
assert len(surface_ids) == len(surface_id_set), 'duplicate surface_id'
for surface in idx['surfaces']:
    assert surface['category_id'] in category_ids
    for ref in surface['refs']:
        if ref['ref_kind'] == 'repo_path':
            assert Path(ref['ref']).exists(), ref
        elif ref['ref_kind'] == 'external_url':
            assert ref['ref'].startswith('https://'), ref
        else:
            raise AssertionError(ref)
    # routes_to only requires the target to exist somewhere in the index.
    # Declaration order is irrelevant.
    for target in surface['routes_to']:
        assert target in surface_id_set, (surface['surface_id'], target)
print('public surface index OK')
PY
python3 - <<'PY'
import re
from pathlib import Path
files = [
    Path('README.md'),
    Path('README.zh-CN.md'),
    Path('docs/roadmap.md'),
    Path('docs/roadmap.zh-CN.md'),
    Path('docs/opl-federation-contract.md'),
    Path('docs/opl-federation-contract.zh-CN.md'),
    Path('docs/opl-read-only-discovery-gateway.md'),
    Path('docs/opl-read-only-discovery-gateway.zh-CN.md'),
    Path('docs/opl-routed-action-gateway.md'),
    Path('docs/opl-routed-action-gateway.zh-CN.md'),
    Path('docs/opl-domain-onboarding-contract.md'),
    Path('docs/opl-domain-onboarding-contract.zh-CN.md'),
    Path('docs/opl-governance-audit-operating-surface.md'),
    Path('docs/opl-governance-audit-operating-surface.zh-CN.md'),
    Path('docs/opl-publish-promotion-operating-surface.md'),
    Path('docs/opl-publish-promotion-operating-surface.zh-CN.md'),
    Path('docs/opl-gateway-example-corpus.md'),
    Path('docs/opl-gateway-example-corpus.zh-CN.md'),
    Path('docs/opl-routed-safety-example-corpus.md'),
    Path('docs/opl-routed-safety-example-corpus.zh-CN.md'),
    Path('docs/opl-operating-example-corpus.md'),
    Path('docs/opl-operating-example-corpus.zh-CN.md'),
    Path('docs/opl-operating-record-catalog.md'),
    Path('docs/opl-operating-record-catalog.zh-CN.md'),
    Path('docs/opl-surface-lifecycle-map.md'),
    Path('docs/opl-surface-lifecycle-map.zh-CN.md'),
    Path('docs/opl-surface-authority-matrix.md'),
    Path('docs/opl-surface-authority-matrix.zh-CN.md'),
    Path('docs/opl-surface-review-matrix.md'),
    Path('docs/opl-surface-review-matrix.zh-CN.md'),
    Path('docs/opl-public-surface-index.md'),
    Path('docs/opl-public-surface-index.zh-CN.md'),
    Path('docs/opl-gateway-acceptance-test-spec.md'),
    Path('docs/opl-gateway-acceptance-test-spec.zh-CN.md'),
    Path('contracts/opl-gateway/README.md'),
    Path('contracts/opl-gateway/README.zh-CN.md'),
]
link_re = re.compile(r'\[[^\]]+\]\(([^)]+)\)')
for path in files:
    text = path.read_text()
    for raw in link_re.findall(text):
        if raw.startswith(('http://', 'https://', 'mailto:', '#')):
            continue
        target = (path.parent / raw.split('#', 1)[0]).resolve()
        if not target.exists():
            raise SystemExit(f'missing link: {path} -> {raw}')
print('links OK')
PY
rg -n "top-level blueprint only|不是统一运行时入口|本仓库本身不承担运行时角色"           README.md README.zh-CN.md           docs/gateway-federation.md docs/gateway-federation.zh-CN.md           docs/opl-federation-contract.md docs/opl-federation-contract.zh-CN.md           docs/opl-read-only-discovery-gateway.md docs/opl-read-only-discovery-gateway.zh-CN.md           docs/opl-routed-action-gateway.md docs/opl-routed-action-gateway.zh-CN.md           docs/opl-domain-onboarding-contract.md docs/opl-domain-onboarding-contract.zh-CN.md           docs/opl-governance-audit-operating-surface.md docs/opl-governance-audit-operating-surface.zh-CN.md           docs/opl-publish-promotion-operating-surface.md docs/opl-publish-promotion-operating-surface.zh-CN.md           docs/opl-gateway-example-corpus.md docs/opl-gateway-example-corpus.zh-CN.md           docs/opl-routed-safety-example-corpus.md docs/opl-routed-safety-example-corpus.zh-CN.md           docs/opl-operating-example-corpus.md docs/opl-operating-example-corpus.zh-CN.md           docs/opl-operating-record-catalog.md docs/opl-operating-record-catalog.zh-CN.md           docs/opl-surface-lifecycle-map.md docs/opl-surface-lifecycle-map.zh-CN.md           docs/opl-surface-authority-matrix.md docs/opl-surface-authority-matrix.zh-CN.md           docs/opl-surface-review-matrix.md docs/opl-surface-review-matrix.zh-CN.md           docs/opl-public-surface-index.md docs/opl-public-surface-index.zh-CN.md           docs/opl-gateway-rollout.md docs/opl-gateway-rollout.zh-CN.md           docs/roadmap.md docs/roadmap.zh-CN.md           contracts/opl-gateway/README.md contracts/opl-gateway/README.zh-CN.md
```

## Completion Definition

The current OPL gateway documentation-and-contract stack is acceptance-green only when:

- all sections A-O pass
- the linked machine-readable contracts are present and valid
- discovery and routing docs still forbid direct harness bypass
- governance / audit remains index-only
- publish / promotion remains index-only and post-publish only
- the example corpus remains illustrative and schema-aligned
- the routed-safety corpus remains illustrative and explicitly unresolved where required
- the operating example corpus remains illustrative and directly schema-validated
- the operating-record catalog remains reference-only and resolves all schema/example refs
- the surface lifecycle map remains derived, reference-only, and non-executing
- the surface authority matrix remains derived, reference-only, and non-executing
- the surface review matrix remains derived, reference-only, and non-executing
- the public-surface index remains discoverability-only
- domain onboarding remains boundary-first
- cross-domain wording remains stable

If any of these fail, the stack is not yet acceptance-green for the post-P16 review/discoverability surface.
