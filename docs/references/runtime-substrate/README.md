# Runtime Substrate References

Status: `support_reference_index`
Owner: `One Person Lab`
Machine boundary: human-readable index only; machine-readable behavior must use contracts, source, CLI/API behavior, runtime ledgers, generated artifacts, or semantic `human_doc:*` ids.

This directory contains runtime, provider, executor, product-entry, and migration references. It is governed by content lifecycle, not by filenames.

Current owner surfaces:

- [OPL current development lines](../../active/current-development-lines.md): framework-first content-level execution map.
- [OPL development document portfolio](../../active/development-document-portfolio.md): classifies old runtime / product-entry / migration content as merge, retain, downgrade, retire, or archive.
- [OPL stage-led agent framework roadmap](./opl-stage-led-agent-framework-roadmap.zh-CN.md): master entry for the complete stage-led, Agent executor-based agent runtime framework.
- [Temporal family runtime provider plan](./temporal-family-runtime-provider-plan.zh-CN.md): active support plan for the production provider candidate.
- [OPL Runtime Manager target](./opl-runtime-manager-target.md): active support target for provider readiness, native helper, and state index boundaries.

Legacy references in this directory may still mention gateway-first, frontdoor, federation, host-agent, Hermes-first, or older direct-entry plans. Those references are retained for migration review and provenance. They must not override the roadmap, the core five docs, or current machine-readable contracts.

After the 2026-05-11 content-level consolidation, early direct-entry, Hermes-first, host-agent-only, managed-runtime checklist, vertical online-agent platform, and MAS cutover whole documents were moved to [Runtime substrate history archive](../../history/runtime-substrate/README.md). This directory now keeps only current runtime/provider/executor support references and migration/evaluation references that still need to sit near the active roadmap.

Before reusing content from this directory:

1. Classify the paragraph by current content role.
2. If it describes old topology or old plans, treat it as superseded.
3. If it describes current provider-backed stage execution, check it against the roadmap and core five.
4. Do not make tests or scripts depend on prose wording or headings from these files.
