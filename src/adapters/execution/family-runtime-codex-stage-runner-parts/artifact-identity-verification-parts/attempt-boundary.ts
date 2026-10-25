import { stringValue as optionalString } from '../../../../kernel/json-record.ts';
import type {
  FamilyRuntimeExecutionScopeKind,
  WorkItemExecutionScopeSnapshot,
} from '../../family-runtime-execution-scope.ts';
import { verifyFrameworkRawArtifactInput } from '../raw-artifact-identity-verification.ts';
import {
  artifactExecutionIdentity,
  artifactIdentityError,
  exactArtifactPairs,
  verifyCurrentArtifactBytes,
  verifyIdentityReceipt,
} from './transport-receipts.ts';

export function verifyStageQualityArtifactIdentityAtAttemptBoundary(input: {
  artifactRefs: unknown;
  artifactHashes: unknown;
  artifactIdentityReceiptRefs: unknown;
  domainId: string;
  workspaceRoot: string;
  expectedProducingAttemptId: string;
  // Required: the framework-owned raw executor output carries its own physical root, and this
  // Stage id is what admits that root instead of the canonical work-item root. Omitting it
  // silently routes framework raw output through the work-item-root boundary check, which
  // rejects it as an authority violation and strands the StageRun without a route decision.
  expectedProducingStageId: string;
  expectedStageRunId?: string | null;
  expectedScopeKind?: FamilyRuntimeExecutionScopeKind;
  expectedExecutionScope?: WorkItemExecutionScopeSnapshot | null;
}) {
  const expectedProducingAttemptId = optionalString(input.expectedProducingAttemptId);
  if (!expectedProducingAttemptId) {
    throw artifactIdentityError({
      message: 'Stage quality artifact verification requires the exact producing Attempt identity.',
      blockedReason: 'artifact_identity_producing_attempt_missing_authority_violation',
      hardStopClass: 'authority_boundary_violation',
      artifactRef: optionalString(Array.isArray(input.artifactRefs) ? input.artifactRefs[0] : null) ?? 'missing',
    });
  }
  const expectedIdentity = artifactExecutionIdentity({
    runtimeIdentity: {
      domain_id: input.domainId,
      stage_run_id: input.expectedStageRunId ?? null,
      scope_kind: input.expectedScopeKind ?? (input.expectedExecutionScope ? 'work_item' : 'domain'),
      execution_scope: input.expectedExecutionScope ?? null,
    },
    operation: 'verify_stage_quality_artifact_attempt_boundary',
  });
  const pairs = exactArtifactPairs({
    artifactRefs: input.artifactRefs,
    artifactHashes: input.artifactHashes,
    allowEmpty: true,
  });
  if (!Array.isArray(input.artifactIdentityReceiptRefs)
    || input.artifactIdentityReceiptRefs.length !== pairs.length) {
    throw artifactIdentityError({
      message: 'Every Stage quality artifact pair requires exactly one trusted identity receipt.',
      blockedReason: 'artifact_identity_receipt_missing_authority_violation',
      hardStopClass: 'authority_boundary_violation',
      artifactRef: pairs[0]?.artifactRef ?? 'missing',
      details: {
        artifact_pair_count: pairs.length,
        artifact_identity_receipt_count: Array.isArray(input.artifactIdentityReceiptRefs)
          ? input.artifactIdentityReceiptRefs.length
          : null,
      },
    });
  }
  const artifactIdentityReceiptRefs = input.artifactIdentityReceiptRefs;
  const receiptRefs = pairs.map((pair, index) => {
    const receiptRef = optionalString(artifactIdentityReceiptRefs[index]);
    if (!receiptRef) {
      throw artifactIdentityError({
        message: 'Stage quality artifact identity receipt ref must be non-empty.',
        blockedReason: 'artifact_identity_receipt_missing_authority_violation',
        hardStopClass: 'authority_boundary_violation',
        artifactRef: pair.artifactRef,
      });
    }
    const receipt = verifyIdentityReceipt({
      receiptRef,
      workspaceRoot: input.workspaceRoot,
      domainId: input.domainId,
      expectedAttemptId: expectedProducingAttemptId,
      expectedIdentity,
      artifactRef: pair.artifactRef,
      artifactSha256: pair.artifactSha256,
    });
    // Framework-owned raw output has its own physical root, bound to this exact Attempt and scope.
    const rawInput = receipt.surface_kind === 'opl_transport_artifact_identity_receipt'
      && input.expectedProducingStageId
      ? verifyFrameworkRawArtifactInput({
          attemptId: expectedProducingAttemptId,
          stageId: input.expectedProducingStageId,
          domainId: input.domainId,
          artifactRef: pair.artifactRef,
          artifactSha256: pair.artifactSha256,
        })
      : null;
    if (rawInput) return receiptRef;
    verifyCurrentArtifactBytes({
      artifactRef: pair.artifactRef,
      artifactSha256: pair.artifactSha256,
      workspaceRoot: input.workspaceRoot,
      declaredSizeBytes: typeof receipt.size_bytes === 'number' ? receipt.size_bytes : null,
      canonicalWorkItemRoot: expectedIdentity.executionScope?.canonical_work_item_root ?? null,
      canonicalWorkItemRootIdentity:
        expectedIdentity.executionScope?.canonical_work_item_root_identity ?? null,
      scopeWorkspaceRoot: expectedIdentity.executionScope?.workspace_root ?? null,
    });
    return receiptRef;
  });
  return {
    artifact_refs: pairs.map((pair) => pair.artifactRef),
    artifact_hashes: pairs.map((pair) => pair.artifactSha256),
    artifact_identity_receipt_refs: receiptRefs,
  };
}
