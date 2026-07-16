import fs from 'node:fs';
import path from 'node:path';

import { isRecord } from '../../kernel/contract-validation.ts';
import {
  optionalString,
  readJsonFileResult,
} from '../../kernel/json-file.ts';
import type { JsonRecord } from '../../kernel/json-file.ts';

interface GeneratedInterfaceTailInput {
  claims_live_soak_complete: boolean;
  claims_domain_ready: boolean;
}

function optionalRefString(value: unknown) {
  if (isRecord(value)) {
    return optionalString(value.ref);
  }
  return optionalString(value);
}

function stringList(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => optionalRefString(entry))
    .filter((entry): entry is string => Boolean(entry));
}

function unique(values: string[]) {
  return [...new Set(values)];
}

function recordList(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(isRecord);
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    const direct = optionalRefString(value);
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

function nestedRecordOrNull(value: unknown, field: string) {
  return isRecord(value) && isRecord(value[field]) ? value[field] : null;
}

function nestedRecord(value: unknown, field: string) {
  return nestedRecordOrNull(value, field) ?? {};
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
    ...extra,
    opl_can_write_domain_truth: false,
    opl_can_write_memory_body: false,
    opl_can_authorize_quality_or_export: false,
    opl_can_authorize_domain_ready: false,
    conformance_report_can_claim_domain_ready: false,
    domain_ready_claimed_by_conformance: false,
  };
}

function structuredTailRefs(input: {
  repoDir: string;
  contractRef: string | null;
  docRef: string | null;
  verificationRef: string | null;
  ownerRef: string | null;
  domainId: string;
}) {
  return {
    repo: { path: input.repoDir },
    contract: input.contractRef ? { ref: input.contractRef } : null,
    doc: input.docRef ? { ref: input.docRef } : null,
    verification: input.verificationRef ? { ref: input.verificationRef } : null,
    owner: {
      domain_id: input.domainId,
      ref: input.ownerRef,
    },
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
      contract_ref: null,
      domain_owner: domainId,
      owner_ref: domainId,
      evidence_ref: null,
      doc_ref: null,
      verification_ref: `opl agents conformance --agent ${domainId}=${repoDir} --json`,
      next_verification_command: `opl agents conformance --agent ${domainId}=${repoDir} --json`,
      tail_refs: structuredTailRefs({
        repoDir,
        contractRef: null,
        docRef: null,
        verificationRef: `opl agents conformance --agent ${domainId}=${repoDir} --json`,
        ownerRef: domainId,
        domainId,
      }),
      authority_boundary: conformanceTailAuthorityBoundary({
        evidence_owner: 'domain_repo',
        closure_source: 'missing_domain_owned_production_acceptance_evidence',
      }),
    }));
  }

  return files.map((relativePath) => {
    const file = readJsonFileResult(path.join(repoDir, relativePath));
    const payload = isRecord(file.payload) ? file.payload : {};
    const closureEvidence = nestedRecord(payload, 'closure_evidence');
    const domainAcceptanceReceipt = nestedRecord(payload, 'domain_acceptance_receipt');
    const evidenceTail = nestedRecord(payload, 'evidence_tail');
    const closureReceipt = nestedRecord(evidenceTail, 'closure_receipt');
    const visualArtifactReceiptChain = nestedRecord(payload, 'visual_artifact_receipt_chain');
    const refs = nestedRecord(payload, 'refs');
    const payloadTypedBlocker = nestedRecordOrNull(payload, 'typed_blocker');
    const evidenceTailTypedBlocker = nestedRecordOrNull(evidenceTail, 'typed_blocker');
    const typedBlockers = recordList(payload.typed_blockers)
      .concat([payloadTypedBlocker, evidenceTailTypedBlocker].filter(isRecord));
    const typedBlockerRefs = stringList(payload.typed_blocker_refs)
      .concat(stringList(refs.typed_blocker_refs))
      .concat(stringList(domainAcceptanceReceipt.typed_blocker_refs))
      .concat(stringList(evidenceTailTypedBlocker?.blocker_refs));
    const evidenceTailStatus = firstString(
      payload.evidence_tail_status,
      payload.acceptance_status,
      evidenceTail.status,
      nestedRecord(payload, 'consumer_contract').current_evidence_tail_status,
    );
    const acceptedReturnShape = firstString(
      closureEvidence.accepted_return_shape,
      closureReceipt.return_shape,
      domainAcceptanceReceipt.receipt_class,
    );
    const typedBlockerKind = firstString(
      closureEvidence.typed_blocker_kind,
      evidenceTailTypedBlocker?.blocker_kind,
    );
    const nextVerificationRef = firstString(
      payload.next_verification_command,
      payload.verification_command,
      payload.next_verification_command_refs,
      domainAcceptanceReceipt.next_verification_command_refs,
      evidenceTailTypedBlocker?.next_verification_command_refs,
      closureEvidence.next_verification_ref,
      refs.next_verification_refs,
      refs.next_verification_command_refs,
    );
    const foundryEvidenceRefs = unique([
      ...stringList(payload.foundry_evidence_refs),
      ...stringList(refs.foundry_evidence_refs),
      ...stringList(evidenceTail.foundry_evidence_refs),
      ...stringList(closureEvidence.foundry_evidence_refs),
    ]);
    const evidenceRef = firstString(
      payload.evidence_ref,
      payload.receipt_ref,
      payload.owner_receipt_ref,
      closureReceipt.receipt_ref,
      domainAcceptanceReceipt.owner_receipt_refs,
      refs.owner_receipt_refs,
      refs.acceptance_receipt_refs,
      payload.evidence_refs,
      payload.receipt_refs,
      payload.owner_receipt_refs,
      typedBlockerRefs,
      evidenceTailTypedBlocker?.blocker_ref,
      refs.artifact_receipt_refs,
      closureReceipt.artifact_receipt_refs,
      visualArtifactReceiptChain.artifact_receipt_refs,
      nextVerificationRef,
    );
    const docRef = firstString(
      payload.doc_ref,
      payload.documentation_ref,
      payload.doc_refs,
      refs.doc_refs,
      domainAcceptanceReceipt.progress_delta_refs,
      closureReceipt.review_export_ref,
      visualArtifactReceiptChain.review_export_gate_refs,
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
          : evidenceRef && docRef
            ? 'closed'
            : 'invalid_evidence'
    );
    const authority = isRecord(payload.authority_boundary) ? payload.authority_boundary : {};
    const domainOwner = firstString(
      payload.domain_owner,
      payload.owner,
      domainAcceptanceReceipt.receipt_owner,
      closureReceipt.owner,
      evidenceTailTypedBlocker?.owner,
      payload.domain_id,
    ) ?? domainId;
    const verificationRef = firstString(
      payload.next_verification_command,
      payload.verification_command,
      payload.next_verification_command_refs,
      domainAcceptanceReceipt.next_verification_command_refs,
      evidenceTailTypedBlocker?.next_verification_command_refs,
      refs.next_verification_command_refs,
      payload.next_verification_ref,
      closureEvidence.next_verification_ref,
      refs.next_verification_refs,
    );
    return {
      status,
      tail_item: 'domain_owned_production_acceptance_evidence',
      repo_path: repoDir,
      contract_ref: relativePath,
      domain_owner: domainOwner,
      owner_ref: domainOwner,
      evidence_ref: evidenceRef,
      doc_ref: docRef,
      verification_ref: verificationRef,
      next_verification_command: verificationRef,
      advisory_refs: {
        foundry_evidence_refs: foundryEvidenceRefs,
      },
      tail_refs: structuredTailRefs({
        repoDir,
        contractRef: relativePath,
        docRef,
        verificationRef,
        ownerRef: domainOwner,
        domainId,
      }),
      authority_boundary: conformanceTailAuthorityBoundary({
        ...authority,
        evidence_owner: 'domain_repo',
        production_acceptance_ref: relativePath,
        domain_acceptance_status: evidenceTailStatus ?? optionalString(payload.status),
        accepted_return_shape: acceptedReturnShape,
        typed_blocker_kind: typedBlockerKind,
        domain_ready_claimed_by_conformance: false,
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
