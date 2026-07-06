---
name: opl-runway-recovery-playbook-writer
description: "Use when writing OPL Runway recovery playbooks for compute/provider failures, failed handoffs, credential or capacity gaps, harvest problems, owner routes, and operator route-back briefs."
---

# OPL Runway Recovery Playbook Writer

Use this skill to write a concise OPL Runway recovery playbook after a compute, provider, handoff, or harvest failure. Keep the playbook advisory: diagnose from refs, route the fix, and name the proof that Runway or Connect must produce.

## OPL Owner Boundary

- Treat Runway, Connect, provider ledgers, endpoint registries, execution receipts, queues, and owning programs as authority for credentials, submit/wait/harvest, execution, receipts, promotion, and readiness truth.
- Treat this Skill as the AI-first playbook writer for failure classification, recovery steps, operator briefing, and route-back.
- Do not sign `owner receipts`, create `typed blockers`, write queues, register endpoints, mutate provider state, or declare `readiness`.
- A recovery playbook is not an execution receipt, provider acceptance, endpoint readiness, runtime readiness, or owner acceptance.

## Workflow

1. Identify the failed Runway path: local shell, SSH, SLURM, Modal, managed endpoint, provider handoff, or harvest.
2. Read available refs: Runway/Connect output, provider receipt candidates, handoff packet, error text, endpoint descriptor, and owner route.
3. Classify the direct cause as `environment`, `credential`, `network`, `provider_capacity`, `submission_contract`, `execution`, `harvest`, `owner_route_gap`, or `authority_gap`.
4. Write the smallest recovery path with owner, command or action to rerun, expected receipt/readback, rollback condition, and stop condition.
5. Keep human or owner decisions explicit; do not convert missing credentials, policy, receipt, or owner acceptance into a typed blocker.

## Output Shape

Return:

- `runway_context_ref`;
- `failure_class` and direct cause;
- `recovery_playbook`: ordered owner actions with expected proof;
- `route_back`: owner decision or missing input if needed;
- `verification`: Runway/Connect/provider readback expected after recovery;
- `authority_boundary`: no owner receipts, no typed blockers, no provider/runtime/readiness claim.
