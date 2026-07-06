---
name: medical-reference-integrity-auditor
description: "Use for MAS medical reference integrity audits: citation truth, claim-citation alignment, PubMed/Crossref/OpenAlex/Semantic Scholar/Crossmark/provider receipts, DOI/PMID mismatch, retracted or corrected article flags, placeholder citation cleanup, and route-back planning. Refs-only candidate audit; no MAS owner receipt, typed blocker, manuscript/reference body mutation, artifact authority, quality verdict, publication readiness, or domain/runtime readiness."
---

# Medical Reference Integrity Auditor

## Boundary

Use this skill to audit medical manuscript references, in-text citations, evidence maps, and provider receipts as refs-only candidate guidance.

This skill may produce citation integrity findings, claim-citation maps, provider receipt inventories, mismatch flags, cleanup candidates, and MAS route-back suggestions.

This skill must not:

- edit manuscript bodies, reference bodies, clinical data, figures, tables, package authority, runtime state, owner receipts, typed blockers, or MAS domain truth;
- issue a MAS owner receipt, typed blocker, reviewer receipt, quality verdict, artifact authority, publication readiness claim, domain readiness claim, or runtime readiness claim;
- treat a provider lookup, clean reference list, citation count, or checklist pass as owner acceptance.

MAS or the consuming domain owner owns manuscript/reference mutation, artifact authority, quality verdicts, owner receipts, typed blockers, and readiness gates.

## Workflow/Checklist

1. Gather refs: manuscript version, reference list, in-text citations, evidence/claim map, journal reference rules, prior audit output, and available provider receipts.
2. Normalize citation inventory without mutating source bodies:
   - in-text citation keys, bibliography entries, DOIs, PMIDs, PMCID/arXiv ids, titles, authors, journal, year, volume, issue, pages, and article type.
   - placeholder or residue entries such as `TODO`, `citation needed`, fake DOI, missing year, missing journal, duplicated key, or unused reference.
3. Check citation truth against source receipts:
   - PubMed for PMID, title, journal, publication type, MeSH, retraction/correction links, and clinical-trial or guideline context.
   - Crossref for DOI, title, authors, journal, date, relation metadata, and update-policy signals.
   - OpenAlex or Semantic Scholar for work identity, venue, concepts, citation context, and duplicate/work-merge hints.
   - Crossmark or publisher pages for current status, correction, expression of concern, retraction, or version-of-record signals.
4. Flag identity mismatches:
   - DOI resolves to a different title/article.
   - PMID and DOI point to different works.
   - title/author/year/journal drift between manuscript and provider receipt.
   - preprint, conference abstract, protocol, guideline, review, or original research type is misrepresented.
5. Check claim-citation alignment:
   - every factual, numeric, methodological, guideline, epidemiologic, causal, predictive, and clinical claim has a supporting citation or an owned data/artifact ref.
   - cited source supports the claim strength and population, not only a related topic.
   - review articles are not used as primary evidence when original evidence is required.
   - retracted, corrected, superseded, or expression-of-concern sources are routed back before use.
6. Classify each finding as `needs_provider_receipt`, `needs_reference_fix`, `needs_citation_fix`, `needs_claim_narrowing`, `needs_source_replacement`, `needs_owner_decision`, or `watch`.
7. Route back only with refs: affected citation/reference, source/provider receipts, claim ref, proposed legal next action, owner surface, and verification/readback expected from the owner lane.

## Output Shape

Return a compact candidate package:

```yaml
reference_integrity_audit_candidate:
  source_refs: []
  provider_receipts:
    - provider: "PubMed|Crossref|OpenAlex|Semantic Scholar|Crossmark|publisher|other"
      citation_or_reference_ref: ""
      receipt_ref: ""
      status: ""
  findings:
    - finding_id: ""
      class: ""
      affected_ref: ""
      evidence_ref: ""
      impact: ""
      proposed_route_back: ""
  claim_citation_map:
    - claim_ref: ""
      citation_ref: ""
      alignment: ""
      caveat: ""
  placeholder_cleanup_candidates:
    - affected_ref: ""
      residue: ""
      owner_action_needed: ""
  route_back_candidate:
    owner_surface: "MAS/domain owner"
    next_legal_actions: []
    required_readback: ""
  no_authority_statement: "refs-only candidate audit; no MAS owner receipt, typed blocker, manuscript/reference body mutation, artifact authority, quality verdict, publication readiness, or domain/runtime readiness"
```
