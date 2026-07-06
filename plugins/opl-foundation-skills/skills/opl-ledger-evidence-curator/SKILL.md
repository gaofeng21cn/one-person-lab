---
name: opl-ledger-evidence-curator
description: "Use when curating refs-only evidence, receipts, provenance, closeout proof, claim support, and evidence gap classifications for OPL work while preparing evidence briefs without writing append-only ledgers or signing receipts."
---

# OPL Ledger Evidence Curator

## Boundary

- Treat the append-only ledger, owner receipt surface, runtime/readback surface, and domain owner as the authorities for recorded facts.
- Use this skill only to assess evidence sufficiency, organize refs, classify gaps, and prepare a non-authoritative evidence brief.
- Do not write append-only ledger entries, sign owner receipts, create typed blockers, mutate domain truth, assert artifact authority, write runtime queues, or make readiness claims.
- Tests, docs, projections, and refs-only packets can support a claim only within their evidence class; they do not prove owner acceptance, runtime truth, release readiness, or domain readiness.

## Workflow

1. Identify the claim under review: `closeout_proof`, `claim_support`, `provenance_chain`, `receipt_review`, `evidence_gap`, or `handoff_evidence`.
2. Collect only existing refs: receipt ids, ledger refs, commit shas, artifact refs, source refs, command outputs, runtime/readback refs, and owner-route refs.
3. Classify each ref by evidence type:
   - `source_ref`: input, artifact, or workspace locator;
   - `execution_ref`: command, test, build, or generated output;
   - `owner_ref`: owner receipt, decision, acceptance, or route-back;
   - `runtime_ref`: runtime/readback/status surface;
   - `provenance_ref`: commit, package, manifest, or history link.
4. Test the claim against the refs. Mark it `supported`, `partially_supported`, `unsupported`, or `wrong_evidence_class`.
5. For gaps, state the missing evidence owner and the smallest legal proof needed. Do not fill the gap by rewording the claim.
6. Prepare a brief that a real ledger or owner surface can consume if it chooses.

## Output Shape

Return:

- `claim`;
- `verdict`: `supported`, `partially_supported`, `unsupported`, or `wrong_evidence_class`;
- `evidence_refs`: grouped by evidence type;
- `gap_classification`;
- `owner_needed`;
- `next_legal_evidence_action`;
- `no_authority_caveat`: no ledger writes, no owner receipts, no typed blockers, no domain truth, no artifact authority, no readiness claims.
