# OPL Documentation Portfolio Consolidation

Status: `active docs governance`
Date: `2026-05-11`
Owner: `One Person Lab`

## Summary

`docs/` is managed as a documentation portfolio, not as a flat file dump.
Every long-lived document must have four explicit signals:

1. `owner`: the repo, domain, or maintainer surface that owns the current truth.
2. `purpose`: public entry, active truth, active contract, support reference, program record, history, or tombstone.
3. `state`: `active_truth`, `active_support`, `support_reference`, `dated_snapshot`, `superseded`, `retired`, or `tombstone`.
4. `machine boundary`: whether code, tests, contracts, or runtime surfaces may consume it.

`README*` and `docs/**` are human-readable surfaces. Machine-readable behavior must use `contracts/`, schemas, source files, generated artifacts, CLI/API behavior, or semantic ids such as `human_doc:*`; it must not pin prose docs paths, headings, sections, or wording as stable interfaces.

Lifecycle decisions are content-level decisions. A document with a current-looking filename can still be historical if its body describes a superseded topology, old development plan, retired gateway/frontdoor/federation route, Hermes-first default, or MDS-default dependency. A document in `docs/references/` can still be active support if its body has a current owner, current purpose, current state, and explicit machine boundary. Maintainers should classify the content before moving, expanding, or deleting the file.

Entry pages should show the current state, hierarchy, old/new relationship, and next reading step before listing supporting material. Old plans, closeout notes, compatibility records, and dated calibrations remain useful as provenance; place them after the current framework roadmap, core five, active specs, and active support docs.

The family-level rollout rule is recorded in [OPL Family Docs Lifecycle Governance Rollout 2026-05-09](./references/convergence-governance/family-docs-lifecycle-governance-rollout-2026-05-09.zh-CN.md). That rollout turns the MAS full-docs restructuring into an OPL-family standard: repositories must be role-equivalent in lifecycle governance, but they do not need identical directory names.

The 2026-05-11 content-level rollout extends that rule across the current
OPL family. The execution order is framework-first: `OPL` owns the shared
Codex-first, stage-led, provider-backed agent framework and docs lifecycle
language; `MAS`, `MAG`, and `RCA` keep their domain truth while migrating their
docs to content-level owner surfaces; `MDS` remains an archive/reference/oracle
surface declared by MAS. The rollout entry is
[OPL Family Content-Level Docs Consolidation 2026-05-11](./references/convergence-governance/family-content-level-docs-consolidation-2026-05-11.zh-CN.md).

## Reading Order

1. `README.md` / `README.zh-CN.md`
2. `docs/README.md` / `docs/README.zh-CN.md`
3. Core five: `project.md`, `status.md`, `architecture.md`, `invariants.md`, `decisions.md`
4. Active current docs: `docs/active/`, especially `current-development-lines*` and `development-document-portfolio*`
5. Current public narrative: `docs/public/`
6. Active specs: `docs/specs/`
7. Support references: `docs/references/`
8. Historical archive: `docs/history/`

## Directory Roles

| Directory | Role | Active rule |
| --- | --- | --- |
| `docs/` root | Technical entry and current core truth | Only README, core five, docs governance, and first-level lifecycle directories. |
| `docs/active/` | Current runtime, activation, shared-boundary, onboarding, current development lines, and development-document portfolio support docs | Active support for current implementation and content-level development-document disposition; still human-readable, not machine authority. |
| `docs/public/` | Public product direction after install/start entry | Bilingual user-facing narrative, roadmap, task map, and operating model. |
| `docs/specs/` | Active runtime / product-boundary specs | Only specs that still define current behavior or current target boundary. |
| `docs/references/current-support/` | Current operational support references | Setup, GUI, release, quality, and install references. |
| `docs/references/runtime-substrate/` | Runtime substrate, provider, executor, and product-entry references | Stage-led framework roadmap, Temporal/provider support, Runtime Manager target, and current migration/evaluation material. |
| `docs/references/convergence-governance/` | Cross-repo convergence and docs governance references | Family docs governance, convergence lessons, intake templates, and status matrices. |
| `docs/references/domain-admission/` | Candidate and admitted-domain reference records | Domain backlog, tranche records, phase records, and onboarding-adjacent support. |
| `docs/references/examples-corpora/` | Example corpora and operating records | Historical examples and reference corpora, not current behavior oracle. |
| `docs/references/operating-governance/` | Governance, quality, lifecycle, review, publish, and operator projection references | Support for operator review and audit; no domain truth ownership. |
| `docs/history/compatibility/` | Retired compatibility material | Gateway/federation/routed-action corpus and other compatibility archives. |
| `docs/history/runtime-substrate/` | Retired runtime-substrate planning material | Absorbed Hermes-first, direct-entry, host-agent-only, managed-runtime checklist, online-agent-platform, and MAS cutover documents. |
| `docs/history/frontdoor-legacy/` | Retired frontdoor-era material | Frontdoor/Product API/UI-adapter era notes and tombstones. |
| `docs/history/process/` | Completed plans, superseded specs, and process drafts | Provenance only; not current implementation contract. |
| `docs/history/omx/` | Retired OMX-era material | Tombstone only. |

## Content-Level State Review 2026-05-11

This review treats document bodies as the source for lifecycle placement. The
current OPL owner split is:

- `OPL`: Codex-first, stage-led framework owner for session/runtime,
  activation, discovery, projection, typed queue, stage attempts, receipts,
  recovery, shared contracts, and shared indexes.
- `Codex CLI`: default minimum execution unit inside a stage unless an
  explicit route selects another executor.
- `MAS`, `MAG`, `RCA`: active domain-agent repos. They own domain truth,
  quality verdicts, runtime details, artifact/package authority, and direct
  app skill paths.
- `MDS`: MAS-declared archive, backend-audit, source-provenance,
  historical-fixture, explicit archive-import, upstream-intake, and parity
  oracle reference only.
- `Hermes-Agent`: external upstream runtime/project. In OPL prose it may only
  appear as `hermes_legacy`, optional provider, explicit executor/proof lane,
  migration context, or historical material unless a current core doc and
  machine-readable contract promote a narrower role.
- `Temporal`: production provider candidate for durable stage-attempt
  substrate. Current docs must keep target state and landed state separate.

### Current Owner Surfaces By Partition

| Partition | Current owner surface | Current role | Absorbed / historical handling |
| --- | --- | --- | --- |
| Root README | `README.md`, `README.zh-CN.md` | User install/start entry and product-family overview | Technical details should point to docs index and core five; stale public links must be corrected immediately. |
| Core five | `docs/project.md`, `docs/status.md`, `docs/architecture.md`, `docs/invariants.md`, `docs/decisions.md` | Active truth for role, boundary, state, hard constraints, and decisions | Reference docs stay subordinate to these files. |
| Docs governance | `docs/docs_portfolio_consolidation.md` | Current documentation lifecycle owner | New long-lived docs must be admitted through this lifecycle map. |
| `docs/active/` | `README*`, current development lines, development-document portfolio, public surface index, domain onboarding, runtime naming, shared foundation/runtime/domain contracts | Active human-readable support for current runtime, activation, onboarding, shared-boundary language, and development-document disposition | Gateway/federation/frontdoor material is referenced only as history or migration background. |
| `docs/public/` | `README*`, roadmap, task map, operating model, UHS narrative | Public product-direction support after the repository home | UHS remains a support narrative; implementation authority lives in active contracts, the core five, and machine-readable contracts. |
| `docs/specs/` | `README*` | Active spec index | The two April 2026 Product API / ACP specs have moved to `docs/history/process/specs/`; when this index is empty, current runtime/product-boundary truth lives in the core five, `docs/active/`, runtime-substrate roadmap, and machine-readable contracts. |
| `docs/references/current-support/` | `README*`, GUI/WebUI/install/release/skill/test support references | Current operational support references | Support commands and deployment notes must stay subordinate to CLI/API/contracts/source truth. |
| `docs/references/runtime-substrate/` | `README*`, stage-led framework roadmap, Temporal provider plan, Runtime Manager target | Runtime/provider/executor support references | Older direct-entry, Hermes-first, host-agent, gateway, and online-platform whole plans have moved to `docs/history/runtime-substrate/`; current references stay subordinate to roadmap and core five. |
| `docs/references/operating-governance/` | `README*`, domain memory governance, quality/operator/incident references, surface matrices | Governance and reviewability support | Gateway-derived surface maps remain derived references over historical compatibility surfaces; current topology lives in the core five and active runtime docs. |
| `docs/references/convergence-governance/` | Family docs lifecycle rollout, convergence lessons, intake templates, external-learning boards | Cross-repo governance and convergence support | Dated rollout boards stay support references; final current truth must be copied into core owner docs or active reference indexes. |
| `docs/references/domain-admission/` | Candidate backlog and admission/phase records | Candidate-domain support and dated admission records | Candidate workstreams remain semantic signals until admission evidence lands. |
| `docs/references/examples-corpora/` | Example corpora and operating records | Examples and evidence corpora | Gateway/routed examples are contract walkthroughs and evidence examples. |
| `docs/history/` | `README*` and child tombstone indexes | Retired, completed, or superseded material | Historical command snippets and acceptance checklists remain provenance. |

### Key Document Disposition Table

| Document or group | Disposition | Current owner / next hop | Reason |
| --- | --- | --- | --- |
| `docs/project.md`, `docs/status.md`, `docs/architecture.md` | Keep as active truth | Core five | They already state Codex-first, stage-led OPL framework boundaries and domain-agent ownership. |
| `docs/active/current-development-lines*` | Keep as active support | Active docs index plus stage-led framework roadmap | It defines the framework-first content-level execution order. |
| `docs/active/development-document-portfolio*` | Keep as active support | Active docs index plus docs portfolio | It classifies old development content by current role: merge, retain, downgrade, retire, or archive. |
| `docs/active/opl-public-surface-index*` | Keep active support | `docs/active/README*` and core five | It correctly tombstones gateway/federation/routed-action prose and points to current runtime/activation surfaces. |
| `docs/active/opl-domain-onboarding-contract*` | Keep active support | Domain admission contract plus machine-readable OPL framework contracts | Admission remains active, but historical execution-model companions must stay marked as history. |
| `docs/active/shared-*` and `opl-runtime-naming-and-boundary-contract*` | Keep active support | Shared-boundary owner docs | These define shared language as human-readable support. |
| `docs/public/roadmap*`, `task-map*`, `operating-model*` | Keep public support | Public docs index | They describe product direction and task semantics after the install/start entry. |
| `docs/public/unified-harness-engineering-substrate*` | Keep as support narrative | Shared runtime/domain contract docs | It is useful umbrella language, but implementation truth lives in active contracts, core five, and machine-readable contracts. |
| `docs/history/process/specs/2026-04-20-opl-product-api-and-domain-agent-boundary-design.md` | Archived as historical process spec | Core five plus stage-led framework roadmap | Its resource model was absorbed; its Product API / local 8787 / frontdoor-era wording is historical design context. |
| `docs/history/process/specs/2026-04-21-opl-acp-native-runtime-and-shell-projection-design.md` | Archived as historical process spec | Core five plus stage-led framework roadmap | Its session-runtime-first pivot was absorbed; ACP/Product API wording is projection history. |
| `docs/references/current-support/*` | Keep as current support | Current-support index | These docs explain GUI shell, Docker/WebUI, install, release, skill, quality, and test support; none owns runtime truth. |
| `docs/references/runtime-substrate/opl-stage-led-agent-framework-roadmap.zh-CN.md` | Keep as master active support | Runtime-substrate index | It is the current framework roadmap and legacy-surface retirement entry. |
| `docs/references/runtime-substrate/temporal-family-runtime-provider-plan.zh-CN.md` | Keep as active support plan | Stage-led roadmap | It is the Temporal provider technical lane; production Temporal autonomy requires soak evidence. |
| `docs/history/runtime-substrate/**` | Keep as tombstoned history | Runtime-substrate history index | Useful content has been absorbed into active owners; whole documents preserve evaluation and migration context only. |
| `docs/references/operating-governance/family-domain-memory-governance.zh-CN.md` | Keep active support | Operating-governance index | It governs whether domain experience belongs in memory, contracts, or deferred framework work. |
| `docs/references/operating-governance/opl-surface-{authority,lifecycle,review}-matrix*` | Keep as legacy-derived support references | Operating-governance index plus current framework contracts | Their machine artifacts still cover historical gateway-derived IDs; prose should present them as legacy-derived reviewability references. |
| `docs/history/compatibility/gateway-federation/**` | Keep tombstoned | History compatibility index | Retired gateway/federation/routed-action corpus. |
| `docs/history/frontdoor-legacy/**` | Keep tombstoned | Frontdoor legacy index | Retired frontdoor/Product API/bootstrap notes. |
| `docs/history/process/**` | Keep as process archive | Process history index | Completed or superseded implementation plans and generated planning notes. |
| `docs/history/omx/**` | Keep tombstoned | OMX history index | Retired OMX-era workflow material. |

### Merge And Archive Rules From This Review

1. If a retained reference contains a current invariant, copy that invariant
   into the core five, active support owner, or machine-readable contract; do
   keep the dated board as support or history.
2. If a retained reference describes gateway/frontdoor/federation/Hermes-first
   as the active path, prepend or update a lifecycle note that labels it
   `superseded`, `legacy`, or `retired` and points to the current owner.
3. If a file seems to remain in `docs/specs/` only for inbound-link stability,
   move it to `docs/history/process/specs/` after updating inbound prose links
   and name the current owner surface in the archive header.
4. If operating-governance material still names `domain_gateway` or old
   gateway IDs because a machine-readable compatibility artifact still uses
   them, the prose should call that legacy-derived coverage and point to the
   current topology owner.
5. Physical moves should happen only after inbound prose links and
   machine-readable `human_doc:*`/contract references are checked. Until then,
   index-level lifecycle separation is preferred.

## Lifecycle States

| State | Meaning | Allowed location | Update rule |
| --- | --- | --- | --- |
| `active_truth` | Current product role, architecture, status, invariants, or durable decision. | `docs/` root core five | Update with behavior, public boundary, or admitted-domain status changes. |
| `active_support` | Current human-readable support for active runtime/activation/shared-boundary docs. | `docs/active/`, `docs/public/`, `docs/specs/` | Keep aligned with core truth; do not use as machine authority. |
| `support_reference` | Background, audit, method, or operating support that explains current work but does not own it. | `docs/references/` | Keep indexed by role; do not let it override active truth. |
| `dated_snapshot` | A completed intake, closeout, activation package, or one-time board. | `docs/history/` | Preserve provenance; active owner remains elsewhere. |
| `superseded` | A design or plan replaced by a newer current surface. | Prefer `docs/history/`; temporary reference retention is allowed only when the index labels it as superseded and points to the current owner. | Add a pointer to the current owner surface; do not expand it as active planning. |
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
4. Old development plans must be merged into the current owner surface or archived as dated snapshots; do not leave parallel plans that appear to be active only because their filenames still sound current.
5. New docs must be admitted through their lifecycle role before expansion.
6. Directories that accept recurring additions need a README or portfolio entry that says what belongs there and what should be archived.
7. Historical docs may preserve old path examples as provenance, but active and reference indexes must point to current locations.
8. Public README pages must be written for potential users first. Chinese README text should be plain Chinese except for product names, command names, API names, and terms that are intentionally kept in English.
9. Do not add scripts or tests that assert narrative README/docs prose, headings, or status wording. Tests may validate contracts, schemas, CLI/API behavior, generated artifact structure, source paths, or `human_doc:*` ids.

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
- `MDS` is not an admitted OPL domain agent. It is a MAS-declared archive,
  backend-audit, source-provenance, explicit archive-import, upstream-intake,
  diagnostic, and parity-oracle reference.

When a domain repo cannot safely move historical docs because current-program, audit, or old absolute-path evidence still points at them, the correct move is index-level lifecycle separation first, physical migration later.

The current cross-repo rollout is content-level, not file-name-level. Workers
must read document bodies, merge still-valid content into the active owner doc,
adjust outdated sections in place when path stability matters, and archive only
after inbound `human_doc:*`, contract, docs, and history references are checked.

## Root AGENTS Alignment

Root `AGENTS.md` remains a work-method file. It may summarize the active owner split and docs reading order, while project truth stays in `README*`, the core five, active docs, contracts, schemas, source, and generated artifacts. When root `AGENTS.md` wording drifts from this portfolio or the core docs, update it to match the current owner split and keep it as routing guidance.

## Archive Rule

Before moving or archiving a doc:

1. Read the body, not just the path, and classify its `owner`, `purpose`, `state`, and `machine boundary`.
2. Decide whether the live content should be merged into an active owner, reduced to a pointer, archived as a dated snapshot, or tombstoned.
3. Search inbound links with `rg`.
4. Update active/reference links to the new location or current owner surface.
5. Leave historical command snippets alone only when they are clearly provenance.
6. Add or update a README/tombstone for the destination directory.
7. Run `git diff --check` and the repo verification lane required by the change.
