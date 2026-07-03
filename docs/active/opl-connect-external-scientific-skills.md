# OPL Connect External Scientific Skills

Owner: OPL Connect
State: active connector surface
Machine boundary: machine truth is the CLI surface `opl connect external-skills *`,
`src/modules/connect/opl-connect-external-skills.ts`, and focused CLI tests.
This page is a human-facing operating note.

OPL Connect can expose approved external Agent Skills libraries as discoverable
sources without making them MAS truth or installing them by default.

The first supported source is:

- `kdense-scientific-agent-skills`
- alias: `kdense`
- upstream: `https://github.com/K-Dense-AI/scientific-agent-skills`

## Command Surface

```bash
opl connect external-skills list --source-root <scientific-agent-skills-checkout> --json
opl connect external-skills search --query "single cell RNA-seq" --source kdense --source-root <path> --json
opl connect external-skills inspect --skill scanpy --source kdense --source-root <path> --json
opl connect external-skills sync --skill scanpy --scope workspace --target-workspace <workspace-root> --source-root <path> --json
```

`list`, `search`, and `inspect` are read-only. `sync` writes exactly one selected
external skill to:

```text
<workspace-or-quest>/.codex/skills/<skill-id>/
```

It also writes `.opl-install-receipt.json` in that skill directory.

## MAS Use

MAS should use its default medical-paper professional pack first:

- `medical-manuscript-writing`
- `medical-manuscript-review`
- `medical-figure-design`
- `medical-research-lit`
- `medical-statistical-review`
- `medical-table-design`
- `medical-submission-prep`
- `medical-data-governance`

External skills are for uncommon specialist gaps, for example `scanpy`,
`pydeseq2`, `pathway-enrichment`, `nextflow`, `rdkit`, or `pyhealth`.

Valid triggers:

- the user names a specific external tool, package, database, or workflow;
- a MAS professional skill produces a route-back candidate that the core pack
  does not cover;
- a MAS stage prompt identifies a specialist capability outside the default
  eight skills;
- the task requires external network, cloud compute, sensitive data, or a
  governed environment policy check before execution.

## Boundary

OPL Connect owns source discovery, skill cards, selective sync, and sync
receipts. It does not own MAS stage policy, manuscript truth, reviewer verdicts,
owner receipts, typed blockers, publication readiness, or artifact authority.

The default policy is `selective_sync_only`. Full-library installation stays out
of the MAS hot path.
