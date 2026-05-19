import fs from 'node:fs';
import path from 'node:path';

type JsonRecord = Record<string, unknown>;

interface GeneratedInterfaceTailInput {
  claims_live_soak_complete: boolean;
  claims_domain_ready: boolean;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function stringList(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => optionalString(entry))
    .filter((entry): entry is string => Boolean(entry));
}

function recordList(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(isRecord);
}

function readJsonFile(repoDir: string, relativePath: string) {
  const absolutePath = path.join(repoDir, relativePath);
  if (!fs.existsSync(absolutePath)) {
    return {
      status: 'missing',
      payload: null,
      error: null,
    };
  }
  try {
    return {
      status: 'resolved',
      payload: JSON.parse(fs.readFileSync(absolutePath, 'utf8')),
      error: null,
    };
  } catch (error) {
    return {
      status: 'invalid_json',
      payload: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    const direct = optionalString(value);
    if (direct) {
      return direct;
    }
    const list = stringList(value);
    if (list.length > 0) {
      return list[0];
    }
  }
  return null;
}

function nestedRecord(value: unknown, field: string) {
  return isRecord(value) && isRecord(value[field]) ? value[field] : {};
}

function productionAcceptanceFiles(repoDir: string) {
  const directory = path.join(repoDir, 'contracts', 'production_acceptance');
  if (!fs.existsSync(directory)) {
    return [];
  }
  return fs.readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('production-acceptance.json'))
    .map((entry) => `contracts/production_acceptance/${entry.name}`)
    .sort();
}

function conformanceTailAuthorityBoundary(extra: JsonRecord = {}) {
  return {
    opl_can_write_domain_truth: false,
    opl_can_write_memory_body: false,
    opl_can_authorize_quality_or_export: false,
    conformance_report_can_claim_domain_ready: false,
    ...extra,
  };
}

function productionAcceptanceTailItem(
  repoDir: string,
  domainId: string,
  generatedInterfaceCheck: GeneratedInterfaceTailInput,
) {
  const files = productionAcceptanceFiles(repoDir);
  if (files.length === 0) {
    const openItems = [
      generatedInterfaceCheck.claims_live_soak_complete
        ? null
        : 'production_live_soak_not_claimed_by_conformance',
      generatedInterfaceCheck.claims_domain_ready
        ? null
        : 'domain_ready_not_claimed_by_conformance',
    ].filter((entry): entry is string => Boolean(entry));
    return openItems.map((tailItem) => ({
      status: 'open',
      tail_item: tailItem,
      repo_path: repoDir,
      domain_owner: domainId,
      evidence_ref: null,
      doc_ref: null,
      next_verification_command: `opl agents conformance --agent ${domainId}=${repoDir} --json`,
      authority_boundary: conformanceTailAuthorityBoundary({
        evidence_owner: 'domain_repo',
        closure_source: 'missing_domain_owned_production_acceptance_evidence',
      }),
    }));
  }

  return files.map((relativePath) => {
    const file = readJsonFile(repoDir, relativePath);
    const payload = isRecord(file.payload) ? file.payload : {};
    const closureEvidence = nestedRecord(payload, 'closure_evidence');
    const refs = nestedRecord(payload, 'refs');
    const typedBlockers = recordList(payload.typed_blockers);
    const typedBlockerRefs = stringList(payload.typed_blocker_refs)
      .concat(stringList(refs.typed_blocker_refs));
    const evidenceTailStatus = optionalString(payload.evidence_tail_status);
    const acceptedReturnShape = optionalString(closureEvidence.accepted_return_shape);
    const typedBlockerKind = optionalString(closureEvidence.typed_blocker_kind);
    const nextVerificationRef = firstString(
      closureEvidence.next_verification_ref,
      refs.next_verification_refs,
      refs.next_verification_command_refs,
    );
    const status = (
      file.status !== 'resolved'
        ? 'invalid_evidence'
        : evidenceTailStatus === 'closed_by_domain_owned_acceptance_receipt'
          ? 'closed'
          : evidenceTailStatus === 'domain_owned_typed_blocker_with_next_verification_ref'
            ? 'domain_owned_typed_blocker'
            : typedBlockers.length > 0
              || typedBlockerRefs.length > 0
              || optionalString(payload.status) === 'typed_blocker'
              || acceptedReturnShape === 'typed_blocker'
              || Boolean(typedBlockerKind)
          ? 'domain_owned_typed_blocker'
          : firstString(
            payload.evidence_ref,
            payload.receipt_ref,
            payload.owner_receipt_ref,
            payload.evidence_refs,
            payload.receipt_refs,
            payload.owner_receipt_refs,
            refs.owner_receipt_refs,
            refs.acceptance_receipt_refs,
            refs.artifact_receipt_refs,
            refs.evidence_refs,
          ) && firstString(payload.doc_ref, payload.documentation_ref, payload.doc_refs)
            ? 'closed'
            : 'invalid_evidence'
    );
    const authority = isRecord(payload.authority_boundary) ? payload.authority_boundary : {};
    return {
      status,
      tail_item: 'domain_owned_production_acceptance_evidence',
      repo_path: repoDir,
      domain_owner: firstString(payload.domain_owner, payload.owner, payload.domain_id) ?? domainId,
      evidence_ref: firstString(
        payload.evidence_ref,
        payload.receipt_ref,
        payload.owner_receipt_ref,
        refs.owner_receipt_refs,
        refs.acceptance_receipt_refs,
        payload.evidence_refs,
        payload.receipt_refs,
        payload.owner_receipt_refs,
        typedBlockerRefs,
        refs.artifact_receipt_refs,
        nextVerificationRef,
      ),
      doc_ref: firstString(payload.doc_ref, payload.documentation_ref, payload.doc_refs, refs.doc_refs),
      next_verification_command: firstString(
        payload.next_verification_command,
        payload.verification_command,
        refs.next_verification_command_refs,
        payload.next_verification_ref,
        closureEvidence.next_verification_ref,
        refs.next_verification_refs,
      ),
      authority_boundary: conformanceTailAuthorityBoundary({
        evidence_owner: 'domain_repo',
        production_acceptance_ref: relativePath,
        domain_acceptance_status: evidenceTailStatus ?? optionalString(payload.status),
        accepted_return_shape: acceptedReturnShape,
        typed_blocker_kind: typedBlockerKind,
        domain_ready_claimed_by_conformance: false,
        ...authority,
      }),
    };
  });
}

export function buildEvidenceTailClassification(
  repoDir: string,
  domainId: string,
  generatedInterfaceCheck: GeneratedInterfaceTailInput,
) {
  const tail_items = productionAcceptanceTailItem(repoDir, domainId, generatedInterfaceCheck);
  const hasOpen = tail_items.some((entry) => entry.status === 'open' || entry.status === 'invalid_evidence');
  const hasTypedBlocker = tail_items.some((entry) => entry.status === 'domain_owned_typed_blocker');
  const status = tail_items.length === 0
    ? 'no_tail_detected'
    : hasOpen
      ? 'production_evidence_tail_present'
      : hasTypedBlocker
        ? 'domain_owned_typed_blocker_reported'
        : 'closed';
  return {
    status,
    tail_items,
    structural_gate_policy: 'tail_items_are_not_structural_conformance_blockers',
    authority_boundary: conformanceTailAuthorityBoundary({
      evidence_tail_can_claim_domain_ready: false,
    }),
  };
}
