# OPL Documentation Portfolio Consolidation

Status: `active docs governance`
Date: `2026-05-09`
Owner: `One Person Lab`

## Summary

`docs/` is managed as a documentation portfolio, not as a flat file dump.
Every long-lived document must have four explicit signals:

1. `owner`: the repo, domain, or maintainer surface that owns the current truth.
2. `purpose`: public entry, active truth, active contract, support reference, program record, history, or tombstone.
3. `state`: `active_truth`, `active_support`, `support_reference`, `dated_snapshot`, `superseded`, `retired`, or `tombstone`.
4. `machine boundary`: whether code, tests, contracts, or runtime surfaces may consume it.

`README*` and `docs/**` are human-readable surfaces. Machine-readable behavior must use `contracts/`, schemas, source files, generated artifacts, CLI/API behavior, or semantic ids such as `human_doc:*`; it must not pin prose docs paths as stable interfaces.

The family-level rollout rule is recorded in [OPL Family Docs Lifecycle Governance Rollout 2026-05-09](./references/convergence-governance/family-docs-lifecycle-governance-rollout-2026-05-09.zh-CN.md). That rollout turns the MAS full-docs restructuring into an OPL-family standard: repositories must be role-equivalent in lifecycle governance, but they do not need identical directory names.

## Reading Order

1. `README.md` / `README.zh-CN.md`
2. `docs/README.md` / `docs/README.zh-CN.md`
3. Core five: `project.md`, `status.md`, `architecture.md`, `invariants.md`, `decisions.md`
4. Active current docs: `docs/active/`
5. Current public narrative: `docs/public/`
6. Active specs: `docs/specs/`
7. Support references: `docs/references/`
8. Historical archive: `docs/history/`

## Directory Roles

| Directory | Role | Active rule |
| --- | --- | --- |
| `docs/` root | Technical entry and current core truth | Only README, core five, docs governance, and first-level lifecycle directories. |
| `docs/active/` | Current runtime, activation, shared-boundary, and onboarding support docs | Active support for current implementation; still human-readable, not machine authority. |
| `docs/public/` | Public product direction after install/start entry | Bilingual user-facing narrative, roadmap, task map, and operating model. |
| `docs/specs/` | Active runtime / product-boundary specs | Only specs that still define current behavior or current target boundary. |
| `docs/references/current-support/` | Current operational support references | Setup, GUI, release, quality, and install references. |
| `docs/references/runtime-substrate/` | Runtime substrate and product-entry references | Hermes/Runtime Manager/product-entry migration and benchmark material. |
| `docs/references/convergence-governance/` | Cross-repo convergence and docs governance references | Family docs governance, convergence lessons, intake templates, and status matrices. |
| `docs/references/domain-admission/` | Candidate and admitted-domain reference records | Domain backlog, tranche records, phase records, and onboarding-adjacent support. |
| `docs/references/examples-corpora/` | Example corpora and operating records | Historical examples and reference corpora, not current behavior oracle. |
| `docs/references/operating-governance/` | Governance, quality, lifecycle, review, publish, and operator projection references | Support for operator review and audit; no domain truth ownership. |
| `docs/history/compatibility/` | Retired compatibility material | Gateway/federation/routed-action corpus and other compatibility archives. |
| `docs/history/frontdoor-legacy/` | Retired frontdoor-era material | Frontdoor/Product API/UI-adapter era notes and tombstones. |
| `docs/history/process/` | Completed plans, superseded specs, and process drafts | Provenance only; not current implementation contract. |
| `docs/history/omx/` | Retired OMX-era material | Tombstone only. |

## Lifecycle States

| State | Meaning | Allowed location | Update rule |
| --- | --- | --- | --- |
| `active_truth` | Current product role, architecture, status, invariants, or durable decision. | `docs/` root core five | Update with behavior, public boundary, or admitted-domain status changes. |
| `active_support` | Current human-readable support for active runtime/activation/shared-boundary docs. | `docs/active/`, `docs/public/`, `docs/specs/` | Keep aligned with core truth; do not use as machine authority. |
| `support_reference` | Background, audit, method, or operating support that explains current work but does not own it. | `docs/references/` | Keep indexed by role; do not let it override active truth. |
| `dated_snapshot` | A completed intake, closeout, activation package, or one-time board. | `docs/history/` | Preserve provenance; active owner remains elsewhere. |
| `superseded` | A design or plan replaced by a newer current surface. | `docs/history/` | Add a pointer to the current owner surface. |
| `retired` | A route that is no longer valid. | `docs/history/compatibility/`, `docs/history/frontdoor-legacy/`, `docs/history/omx/` | Keep as audit material only. |
| `tombstone` | A short index telling readers not to revive a retired route. | Relevant `docs/history/**/README*` | Name the retired route and point to current truth. |

## Active Root Allowlist

The root of `docs/` should stay sparse. Tracked files at `docs/` root are limited to:

- `README.md`
- `README.zh-CN.md`
- `project.md`
- `status.md`
- `architecture.md`
- `invariants.md`
- `decisions.md`
- `docs_portfolio_consolidation.md`

All other long-lived docs must live in `active/`, `public/`, `specs/`, `references/`, or `history/`.

## Anti-Pollution Rules

1. Do not keep retired positioning in an active directory for path compatibility.
2. If a machine surface points at a prose doc path, migrate it to a contract/schema/source path or `human_doc:*` semantic id first.
3. Retired gateway/federation/routed-action/frontdoor wording may appear in active docs only as historical context with an explicit current-truth pointer.
4. New docs must be admitted through their lifecycle role before expansion.
5. Directories that accept recurring additions need a README or portfolio entry that says what belongs there and what should be archived.
6. Historical docs may preserve old path examples as provenance, but active and reference indexes must point to current locations.

## External Practice Map

| Source | Practice adopted here |
| --- | --- |
| [Diataxis](https://diataxis.fr/) | Separate explanation, how-to, reference, and learning material by reader intent. |
| [GitLab documentation topic types](https://docs.gitlab.com/development/documentation/topic_types/troubleshooting/) | Keep troubleshooting, task, and reference material in explicit topic boundaries instead of mixing them into default entry pages. |
| [Microsoft Learn style guide](https://learn.microsoft.com/en-us/style-guide/word-choice/use-simple-words-concise-sentences) | Keep entry pages concise, scannable, and terminology-consistent. |
| [Write the Docs: Docs as Code](https://www.writethedocs.org/guide/docs-as-code.html) | Treat documentation changes as reviewed, diffable, verifiable repo work with owners and lifecycle state. |
| [The Good Docs Project IA guide](https://www.thegooddocsproject.dev/tactic/ia-guide) | Design information architecture from reader goals and maintain a clear navigation path. |
| [Red Hat modular docs](https://redhat-documentation.github.io/modular-docs/) | Keep modules independently meaningful and assemble them by user story instead of flat adjacency. |
| [Google developer docs style guide](https://developers.google.cn/style/highlights) | Keep headings, links, dates, and wording scannable and consistent. |

## Family Rollout Rule

Cross-repo docs治理 must follow role-equivalent lifecycle architecture:

- `OPL` owns family documentation language, cross-repo intake templates, shared governance references, and audit checklists.
- `MAS` owns medical research runtime/program/capability truth and remains the reference implementation for deep docs lifecycle restructuring.
- `MAG` owns grant truth; older path-stable specs may remain under `docs/specs/` while README/index layers separate active and historical records.
- `RCA` owns visual-deliverable truth; product, runtime, delivery, source, references, program, policies, and history should be separate reader layers.

When a domain repo cannot safely move historical docs because current-program, audit, or old absolute-path evidence still points at them, the correct move is index-level lifecycle separation first, physical migration later.

## Archive Rule

Before moving or archiving a doc:

1. Classify its `owner`, `purpose`, `state`, and `machine boundary`.
2. Search inbound links with `rg`.
3. Update active/reference links to the new location or current owner surface.
4. Leave historical command snippets alone only when they are clearly provenance.
5. Add or update a README/tombstone for the destination directory.
6. Run `git diff --check` and the repo verification lane required by the change.
