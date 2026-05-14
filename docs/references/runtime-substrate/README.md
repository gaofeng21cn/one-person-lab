# Runtime Substrate References

Status: `support_reference_index`
Owner: `One Person Lab`
Machine boundary: human-readable index only; machine-readable behavior must use contracts, source, CLI/API behavior, runtime ledgers, generated artifacts, or semantic `human_doc:*` ids.

This directory contains runtime, provider, executor, product-entry, and migration references. Lifecycle state is judged by content role, while durable placement follows the OPL-family canonical docs taxonomy.

Current owner surfaces:

- [OPL current development lines](../../active/current-development-lines.md): framework-first content-level execution map.
- [OPL development document portfolio](../../active/development-document-portfolio.md): classifies old runtime / product-entry / migration content as merge, retain, downgrade, retire, or archive.
- [OPL stage-led agent framework roadmap](./opl-stage-led-agent-framework-roadmap.zh-CN.md): master entry for the complete stage-led runtime framework with Agent executors as the minimum execution unit.
- [OPL Family Development Reference](../../active/opl-family-development-reference.zh-CN.md): main cross-repo development reading order for OPL, MAS, MAG, RCA, and OPL-owned App/workbench targets, including layered planning, generic primitive absorption, same-name docs taxonomy, and direct retirement of stale compatibility surfaces.
- [OPL and Foundry Agents ideal state](./opl-family-agent-ideal-state.zh-CN.md): north-star target boundary for OPL Framework, Foundry Agents, workspace/runtime artifact roots, and the One Person Lab App.
- [Temporal family runtime provider plan](./temporal-family-runtime-provider-plan.zh-CN.md): active support plan for the production provider candidate.
- [OPL Runtime Manager target](./opl-runtime-manager-target.md): active support target for provider readiness, native helper, and state index boundaries.

Legacy evaluation references in this directory may still mention gateway-first, frontdoor, federation, host-agent, Hermes-first, or older direct-entry plans. They are retained only when their current role is explicit and they still need to sit near the active roadmap. They must not override the roadmap, the core five docs, or current machine-readable contracts.

After the 2026-05-11 / 2026-05-14 content-level consolidation, early direct-entry, Hermes-first, host-agent-only, managed-runtime checklist, vertical online-agent platform, Hermes runtime-substrate benchmark, and MAS cutover whole documents were moved to [Runtime substrate history archive](../../history/runtime-substrate/README.md). This directory now keeps only current runtime/provider/executor support references and migration/evaluation references that still need to sit near the active roadmap.

Before reusing content from this directory:

1. Classify the paragraph by current content role.
2. If it describes old topology or old plans, treat it as superseded.
3. If it describes current provider-backed stage execution, check it against the roadmap and core five.
4. Do not make tests or scripts depend on prose wording or headings from these files.
