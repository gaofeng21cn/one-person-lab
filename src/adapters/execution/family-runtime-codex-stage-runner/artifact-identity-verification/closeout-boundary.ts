import { stringValue as optionalString } from '../../../../kernel/json-record.ts';
import type { TypedStageCloseoutPacket } from '../closeout-normalization.ts';
import { verifyFrameworkRawProgressEnvelope } from '../raw-artifact-identity-verification.ts';
import { isRecord, readAgentRefList, type JsonRecord } from '../shared.ts';
import {
  artifactExecutionIdentity,
  artifactIdentityError,
  canonicalSha256,
  type OplTransportArtifactIdentityReceipt,
} from './identity-contract.ts';
import {
  exactArtifactPairs,
  prepareTransportIdentityReceipt,
  verifyCurrentArtifactBytes,
  verifyIdentityReceipt,
} from './transport-receipts.ts';

function artifactMetadata(metadata: JsonRecord[], ref: string) {
  // A producer may locate the same file twice: the closeout-relative `ref` and
  // the full `uri`. A consumable ref can equal either exact locator of this
  // entry; the lookup never crosses entries, and the byte, containment, scope
  // and receipt gates below still decide the identity.
  return metadata.find((entry) => optionalString(entry.ref) === ref || optionalString(entry.uri) === ref);
}

export function verifyStageQualityCloseoutArtifactIdentity(input: {
  closeoutPacket: TypedStageCloseoutPacket | null;
  attempt: JsonRecord;
  workspaceRoot: string;
}) {
  const closeoutPacket = input.closeoutPacket;
  const attemptRole = optionalString(input.attempt.attempt_role);
  if (!closeoutPacket || (attemptRole !== 'producer' && attemptRole !== 'repairer')) {
    return closeoutPacket;
  }
  const routeImpact = isRecord(closeoutPacket.route_impact) ? closeoutPacket.route_impact : {};
  const qualityEnvelope = isRecord(routeImpact.stage_quality_cycle) ? routeImpact.stage_quality_cycle : {};
  const metadata = [...(closeoutPacket.closeout_ref_metadata ?? [])];
  const rawProgress = optionalString(closeoutPacket.authority_boundary.opl)
    === 'raw_executor_output_progress_envelope_only'
    ? verifyFrameworkRawProgressEnvelope({
        closeoutPacket,
        attempt: input.attempt,
        routeImpact,
        closeoutMetadata: metadata,
      })
    : null;
  // Producers already declare which outputs are consumable. When neither identity
  // array was supplied, verify those same refs using their closeout byte metadata.
  const rawConsumableRefs = !rawProgress
    && !Object.hasOwn(qualityEnvelope, 'artifact_refs')
    && !Object.hasOwn(qualityEnvelope, 'artifact_hashes')
    && Array.isArray(routeImpact.consumable_artifact_refs)
    ? routeImpact.consumable_artifact_refs
    : null;
  const consumableRefs = rawConsumableRefs
    ? readAgentRefList(rawConsumableRefs, 'consumable_artifact_refs')
    : [];
  if (rawConsumableRefs && rawConsumableRefs.length !== consumableRefs.length) {
    throw artifactIdentityError({
      message: 'Consumable artifact refs must not contain duplicates when deriving Review identity.',
      blockedReason: 'artifact_byte_identity_mismatch',
      artifactRef: consumableRefs[0] ?? 'missing',
    });
  }
  const consumableHashes = consumableRefs.map((ref) => optionalString(artifactMetadata(metadata, ref)?.sha256));
  const bindConsumableIdentity = consumableRefs.length > 0
    && consumableRefs.every((ref) => closeoutPacket.closeout_refs.includes(ref))
    && consumableHashes.every(Boolean);
  const declaredRefs = rawProgress
    ? [rawProgress.artifactRef]
    : Array.isArray(qualityEnvelope.artifact_refs)
      ? qualityEnvelope.artifact_refs
      : bindConsumableIdentity ? consumableRefs : [];
  const declaredHashes = rawProgress
    ? [rawProgress.artifactSha256]
    : Array.isArray(qualityEnvelope.artifact_hashes)
      ? qualityEnvelope.artifact_hashes
      : bindConsumableIdentity ? consumableHashes : [];
  if (declaredRefs.length === 0 && declaredHashes.length === 0) {
    // The receipt list names OPL-owned transport identity. Even with no
    // artifacts, an explicit (empty) artifact list means the canonical receipt
    // list is empty too; a declared model echo is never trusted.
    if (isRecord(routeImpact.stage_quality_cycle) && Array.isArray(qualityEnvelope.artifact_refs)) {
      return {
        ...closeoutPacket,
        route_impact: {
          ...routeImpact,
          stage_quality_cycle: {
            ...qualityEnvelope,
            artifact_identity_receipt_refs: [],
          },
        },
      };
    }
    return closeoutPacket;
  }
  const pairs = exactArtifactPairs({ artifactRefs: declaredRefs, artifactHashes: declaredHashes });
  const domainId = optionalString(input.attempt.domain_id) ?? 'unknown-domain';
  const attemptId = optionalString(input.attempt.stage_attempt_id) ?? 'unknown-attempt';
  const executionIdentity = artifactExecutionIdentity({
    runtimeIdentity: input.attempt,
    operation: 'verify_stage_quality_closeout_artifact_identity',
  });

  const nextMetadata = pairs.map(({ artifactRef, artifactSha256 }) => {
    const metadataIndex = metadata.findIndex((entry) => entry.ref === artifactRef || entry.uri === artifactRef);
    const entry = metadataIndex >= 0 ? metadata[metadataIndex] : null;
    if (!entry || canonicalSha256(entry.sha256, 'closeout_ref_metadata.sha256') !== artifactSha256) {
      throw artifactIdentityError({
        message: 'Stage quality artifact identity must match closeout metadata before transport verification.',
        blockedReason: 'artifact_byte_identity_mismatch',
        artifactRef,
      });
    }

    const observed = rawProgress && artifactRef === rawProgress.artifactRef
      ? rawProgress.observed
      : verifyCurrentArtifactBytes({
          artifactRef,
          artifactSourceRef: optionalString(entry.uri),
          artifactSha256,
          workspaceRoot: input.workspaceRoot,
          declaredSizeBytes: typeof entry.size_bytes === 'number' ? entry.size_bytes : null,
          canonicalWorkItemRoot: executionIdentity.executionScope?.canonical_work_item_root ?? null,
          canonicalWorkItemRootIdentity:
            executionIdentity.executionScope?.canonical_work_item_root_identity ?? null,
          scopeWorkspaceRoot: executionIdentity.executionScope?.workspace_root ?? null,
          containInWorkspace: bindConsumableIdentity,
        });
    if (observed) {
      const receiptInput: OplTransportArtifactIdentityReceipt = {
        surface_kind: 'opl_transport_artifact_identity_receipt',
        version: 'opl-transport-artifact-identity-receipt.v1',
        domain_id: domainId,
        stage_attempt_id: attemptId,
        stage_run_id: executionIdentity.stageRunId,
        scope_kind: executionIdentity.scopeKind,
        work_item_scope_id: executionIdentity.executionScope?.work_item_scope_id ?? null,
        scope_digest: executionIdentity.executionScope?.scope_digest ?? null,
        artifact_ref: artifactRef,
        ...(!rawProgress && 'sourceRef' in observed && observed.sourceRef
          ? { artifact_source_ref: observed.sourceRef }
          : {}),
        sha256: observed.sha256,
        size_bytes: observed.sizeBytes,
      };
      const receiptRef = rawProgress && artifactRef === rawProgress.artifactRef
        ? rawProgress.finalizeIdentityReceipt(() => prepareTransportIdentityReceipt(receiptInput))
        : prepareTransportIdentityReceipt(receiptInput).commit().receiptRef;
      return {
        ...entry,
        ...(bindConsumableIdentity && !entry.kind ? { kind: 'stage_attempt_artifact' } : {}),
        ref: artifactRef,
        sha256: observed.sha256,
        size_bytes: observed.sizeBytes,
        artifact_identity_receipt_ref: receiptRef,
      };
    }

    const receiptRef = optionalString(entry.artifact_identity_receipt_ref);
    if (!receiptRef) {
      throw artifactIdentityError({
        message: 'External Stage quality artifact requires an independent domain authority identity receipt.',
        blockedReason: 'artifact_identity_receipt_missing_authority_violation',
        hardStopClass: 'authority_boundary_violation',
        artifactRef,
      });
    }
    verifyIdentityReceipt({
      receiptRef,
      workspaceRoot: input.workspaceRoot,
      domainId,
      expectedAttemptId: attemptId,
      expectedIdentity: executionIdentity,
      artifactRef,
      artifactSha256,
    });
    return entry;
  });

  for (let index = 0; index < pairs.length; index += 1) {
    const metadataIndex = metadata.findIndex(
      (entry) => entry.ref === pairs[index].artifactRef || entry.uri === pairs[index].artifactRef,
    );
    metadata[metadataIndex] = nextMetadata[index];
  }
  // Canonicalize the OPL-owned receipt list from the verified metadata, in
  // declared artifact_refs order. Whatever the model declared is discarded:
  // the only authoritative value is the one this verification just produced
  // or validated. Live ingest, derivation, recovery and projection all read
  // this canonical list and therefore converge by construction.
  const canonicalReceiptRefs = pairs.map(({ artifactRef }, index) => {
    const receiptRef = optionalString(nextMetadata[index]?.artifact_identity_receipt_ref);
    if (!receiptRef) {
      throw artifactIdentityError({
        message: 'Transport verification must produce exactly one identity receipt per declared artifact.',
        blockedReason: 'artifact_identity_receipt_missing_authority_violation',
        artifactRef,
      });
    }
    return receiptRef;
  });
  return {
    ...closeoutPacket,
    closeout_ref_metadata: metadata,
    ...(!rawProgress && (isRecord(routeImpact.stage_quality_cycle) || bindConsumableIdentity)
      ? {
          route_impact: {
            ...routeImpact,
            stage_quality_cycle: {
              ...qualityEnvelope,
              artifact_refs: pairs.map((pair) => pair.artifactRef),
              artifact_hashes: pairs.map((pair) => pair.artifactSha256),
              artifact_identity_receipt_refs: canonicalReceiptRefs,
            },
          },
        }
      : {}),
  };
}
