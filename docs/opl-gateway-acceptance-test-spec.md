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
- [OPL Gateway Rollout](./opl-gateway-rollout.md)
- [OPL Gateway Contracts](../contracts/opl-gateway/README.md)
- [`acceptance-matrix.json`](../contracts/opl-gateway/acceptance-matrix.json)

## Companion Reference Examples

- [OPL Gateway Example Corpus](./opl-gateway-example-corpus.md)

This corpus is illustrative and non-governing. It helps humans and agents inspect how the frozen layers compose, but it does not replace the contracts and acceptance gates above.

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

1. The onboarding contract requires complete `G1` registry material for any new domain.
2. The onboarding contract requires explicit public documentation surfaces.
3. The onboarding contract requires explicit truth-ownership declaration.
4. The onboarding contract requires explicit review surfaces.
5. The onboarding contract defines a formal inclusion gate covering:
   - registry complete
   - boundary explicit
   - truth ownership explicit
   - discovery ready
   - routing ready
   - review ready
   - cross-domain wording aligned
6. The onboarding contract explicitly forbids “placeholder first, boundary later”.
7. The onboarding contract explicitly forbids treating future domains as internal `OPL` modules.

### Verification

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

## Standard Verification Commands

```bash
git diff --check
python3 - <<'PY'
import json
from pathlib import Path
for path in sorted(Path('contracts/opl-gateway').glob('*.json')):
    json.load(path.open())
    print('OK', path)
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
rg -n "top-level blueprint only|不是统一运行时入口|本仓库本身不承担运行时角色" \
  README.md README.zh-CN.md \
  docs/gateway-federation.md docs/gateway-federation.zh-CN.md \
  docs/opl-federation-contract.md docs/opl-federation-contract.zh-CN.md \
  docs/opl-read-only-discovery-gateway.md docs/opl-read-only-discovery-gateway.zh-CN.md \
  docs/opl-routed-action-gateway.md docs/opl-routed-action-gateway.zh-CN.md \
  docs/opl-domain-onboarding-contract.md docs/opl-domain-onboarding-contract.zh-CN.md \
  docs/opl-governance-audit-operating-surface.md docs/opl-governance-audit-operating-surface.zh-CN.md \
  docs/opl-publish-promotion-operating-surface.md docs/opl-publish-promotion-operating-surface.zh-CN.md \
  docs/opl-gateway-rollout.md docs/opl-gateway-rollout.zh-CN.md \
  docs/roadmap.md docs/roadmap.zh-CN.md \
  contracts/opl-gateway/README.md contracts/opl-gateway/README.zh-CN.md
```

## Completion Definition

The current OPL gateway documentation-and-contract stack is acceptance-green only when:

- all sections A-G pass
- the linked machine-readable contracts are present and valid
- discovery and routing docs still forbid direct harness bypass
- governance / audit remains index-only
- publish / promotion remains index-only and post-publish only
- domain onboarding remains boundary-first
- cross-domain wording remains stable

If any of these fail, the stack is not yet acceptance-green for the post-P5 operating surface.
