---
name: opl-runway-compute-operator
description: Use when operating or debugging OPL Runway compute support, including environment setup diagnosis, SSH or SLURM access, Modal or managed endpoint selection, provider receipt review, Runway handoff briefing, and provider failure classification. Helps choose a compute/provider route and prepare operator handoff/debug notes without claiming provider, live runtime, endpoint, queue, or readiness authority.
---

# OPL Runway Compute Operator

Use this skill to diagnose compute setup and prepare contract-light Runway handoff notes. Keep judgment AI-first: inspect the user's goal, environment signals, provider constraints, and existing receipts before suggesting the smallest viable route.

Optional helper: `kernel.py` provides deterministic provider/endpoint/env normalization, failure classification, handoff skeleton, and forbidden-claim lint helpers.
It is stdlib-only, writes nothing, performs no network or subprocess calls, and does not submit jobs, manage endpoints, or claim provider/live readiness.

## Authority Boundary

- Treat Runway / Connect as the programmatic authority for credentials, submit/wait/harvest, endpoint registration, execution receipt, queue state, and provider readback.
- Do not write runtime queues, owner receipts, typed blockers, domain truth, provider ledgers, or readiness claims.
- Do not state `provider ready`, `live ready`, `runtime ready`, `endpoint registered`, or `execution accepted` unless fresh Runway / Connect JSON output or a provider receipt explicitly proves that exact claim.
- Use this skill for diagnosis, provider-choice advice, failure classification, and handoff/receipt briefing only.

## Workflow

1. Identify the requested compute path: local shell, SSH host, SLURM cluster, Modal job, managed endpoint, or Runway-selected provider.
2. Read available context first: workspace instructions, Runway/Connect command output, environment variables intentionally exposed by the user, previous provider receipts, and handoff refs.
3. Prefer contract-light evidence:
   - `opl runway ... --json` for attempts, handoff refs, provider observations, and execution/readback surfaces.
   - `opl connect ... --json` for credential/resource discovery, endpoint descriptors, and connector receipts.
   - Native provider tools only when Runway/Connect output points there or the user asks for direct provider debugging.
4. Classify failures before proposing fixes:
   - `environment`: missing binary, Python/Node/runtime mismatch, missing module, bad working directory.
   - `credential`: absent, expired, wrong scope, wrong account, denied host/key/token.
   - `network`: DNS, proxy, firewall, SSH reachability, provider API timeout.
   - `provider_capacity`: quota, partition unavailable, GPU/CPU shape unavailable, rate limit.
   - `submission_contract`: malformed payload, missing artifact/input, invalid endpoint descriptor.
   - `execution`: remote job crashed, nonzero exit, timeout, OOM, dependency failure.
   - `harvest`: output path missing, receipt incomplete, artifact not retrievable.
   - `authority_gap`: a human or owning program must provide credential, policy, owner receipt, or domain decision.
5. Give the next action with owner and evidence: what to run, who owns the fix, what JSON/receipt would prove progress, and what claim remains forbidden.

## Handoff Shape

When preparing a Runway handoff/debug brief, include:

- Goal and requested compute route.
- Observed evidence refs, command names, and relevant receipt IDs if present.
- Failure class and direct cause, separating symptoms from authority gaps.
- Recommended provider route and why it is the smallest viable option.
- Exact next Runway/Connect command to obtain fresh readback, if known.
- Forbidden claims still not proven by evidence.

Keep the brief concise. If the only safe answer is that Runway/Connect must submit, wait, harvest, register, or sign the receipt, say that directly and stop.
