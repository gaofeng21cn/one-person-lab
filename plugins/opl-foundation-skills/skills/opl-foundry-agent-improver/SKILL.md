---
name: opl-foundry-agent-improver
description: Interpret OPL FoundryRun, EvidenceBundle, qualification, risk, Owner-gate, canary, activation, and rollback evidence. Use when an operator needs an evidence-bound failure classification or next route for an Agent create, takeover, or improve run.
---

# OPL Foundry Agent Improver

## Boundary

Treat OPL Foundry Kernel as the sole owner of Run state, materialization, evaluation, evidence, versions, canary, activation, and rollback. Treat OMA as the owner of `AgentBlueprint` / `EvalSpec` semantics and `EvolutionProposal` diagnosis.

Use this Skill only to interpret existing Foundry evidence and recommend the next authorized route. Do not create or mutate protocol objects, reveal protected tests, write target-domain truth, change a version or activation pointer, sign an Owner decision, or claim readiness from a scaffold, provider completion, or isolated test pass.

## Review Flow

1. Bind the review to exact `run_id`, revision, target identity, target version ref, blueprint digest, candidate digest, evidence digest, and frozen test-plan digest.
2. Confirm the evaluator/reviewer is independent from the OMA design attempt and that baseline/candidate used the same frozen plan.
3. Classify the current condition:
   - `platform_transient`: retry the failed activity within the platform retry budget; do not consume an evolution generation.
   - `semantic_failure`: route the immutable `EvidenceBundle` to OMA `diagnose` for an `EvolutionProposal`.
   - `evaluation_integrity_failure`: quarantine when tests were removed, protected coverage was reduced, a gate was relaxed, evidence is stale, or provenance/identity is invalid.
   - `owner_gate_required`: preserve the current state and request the exact revision-bound Owner decision required by the risk tier.
   - `canary_regression`: preserve the prior active pointer and use the recorded rollback outcome; do not reinterpret the failed canary as qualification.
   - `terminal_no_improvement`: report budget exhaustion or consecutive no-improvement termination without inventing another generation.
4. Verify the recommended route is one of retry, OMA diagnosis, quarantine, Owner approve/reject, qualify-only closeout, canary, activation, cancel, or exact-version rollback.
5. Separate structural evidence, qualification, active adoption, target-domain acceptance, and production readiness in the conclusion.

## Output

Return:

- exact identities and immutable evidence refs used;
- failure class and concise root cause;
- next authorized route and expected revision when applicable;
- risk tier, Owner gate, canary, and rollback implications;
- missing evidence or authority that prevents a stronger claim.

Never restate protected test bodies or translate a route recommendation into a repo path, command, patch, queue, lease, attempt mutation, or activation write.
