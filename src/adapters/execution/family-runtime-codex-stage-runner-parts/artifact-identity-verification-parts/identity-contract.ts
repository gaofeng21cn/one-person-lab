import { FrameworkContractError } from '../../../../kernel/contract-validation.ts';
import { stringValue as optionalString } from '../../../../kernel/json-record.ts';
import {
  requireFamilyRuntimeExecutionScope,
  type FamilyRuntimeExecutionScopeKind,
  type WorkItemExecutionScopeSnapshot,
} from '../../family-runtime-execution-scope.ts';
import { isRecord, type JsonRecord } from '../shared.ts';

const SHA256_PATTERN = /^(?:sha256:)?([a-f0-9]{64})$/i;

export type OplTransportArtifactIdentityReceipt = {
  surface_kind: 'opl_transport_artifact_identity_receipt';
  version: 'opl-transport-artifact-identity-receipt.v1';
  domain_id: string;
  stage_attempt_id: string;
  stage_run_id: string | null;
  scope_kind: FamilyRuntimeExecutionScopeKind;
  work_item_scope_id: string | null;
  scope_digest: string | null;
  artifact_ref: string;
  sha256: string;
  size_bytes: number | null;
};

export type ArtifactExecutionIdentity = {
  stageRunId: string | null;
  scopeKind: FamilyRuntimeExecutionScopeKind;
  executionScope: WorkItemExecutionScopeSnapshot | null;
};

export function canonicalSha256(value: unknown, field: string) {
  const normalized = optionalString(value);
  const match = normalized?.match(SHA256_PATTERN);
  if (!match) {
    throw new FrameworkContractError('contract_shape_invalid', `${field} must be a canonical SHA-256 digest.`, {
      field,
      hard_stop_class: 'stale_or_mismatched_stage_identity',
      blocked_reason: 'artifact_byte_identity_mismatch',
    });
  }
  return match[1].toLowerCase();
}

export function artifactIdentityError(input: {
  message: string;
  blockedReason: string;
  hardStopClass?: 'authority_boundary_violation' | 'stale_or_mismatched_stage_identity';
  artifactRef: string;
  details?: Record<string, unknown>;
}) {
  return new FrameworkContractError('contract_shape_invalid', input.message, {
    hard_stop_class: input.hardStopClass ?? 'stale_or_mismatched_stage_identity',
    blocked_reason: input.blockedReason,
    artifact_ref: input.artifactRef,
    ...(input.details ?? {}),
  });
}

export function artifactExecutionIdentity(input: {
  runtimeIdentity: JsonRecord;
  operation: string;
}): ArtifactExecutionIdentity {
  const identityState = optionalString(input.runtimeIdentity.identity_state);
  if (
    identityState === 'identity_unresolved'
    || identityState === 'quarantined'
    || input.runtimeIdentity.scope_kind === 'identity_unresolved'
  ) {
    throw artifactIdentityError({
      message: 'Identity-unresolved or quarantined Attempts cannot issue artifact identity receipts.',
      blockedReason: 'artifact_identity_runtime_scope_unresolved_authority_violation',
      hardStopClass: 'authority_boundary_violation',
      artifactRef: optionalString(input.runtimeIdentity.stage_attempt_id) ?? 'missing',
      details: {
        identity_state: identityState ?? 'identity_unresolved',
        scope_kind: input.runtimeIdentity.scope_kind ?? 'identity_unresolved',
        operation: input.operation,
      },
    });
  }
  const workspaceLocator = isRecord(input.runtimeIdentity.workspace_locator)
    ? input.runtimeIdentity.workspace_locator
    : null;
  const scope = requireFamilyRuntimeExecutionScope({
    scopeKind: input.runtimeIdentity.scope_kind,
    executionScope: input.runtimeIdentity.execution_scope,
    workspaceLocator,
    domainId: optionalString(input.runtimeIdentity.domain_id),
    operation: input.operation,
    requireWorkspaceTransportCopy: false,
  });
  const stageRunId = optionalString(input.runtimeIdentity.stage_run_id);
  if (scope.scopeKind === 'work_item' && !stageRunId) {
    throw artifactIdentityError({
      message: 'Work-item artifact identity requires an exact producing StageRun.',
      blockedReason: 'artifact_identity_stage_run_missing_authority_violation',
      hardStopClass: 'authority_boundary_violation',
      artifactRef: optionalString(input.runtimeIdentity.stage_attempt_id) ?? 'missing',
      details: { operation: input.operation },
    });
  }
  if (scope.executionScope && !optionalString(scope.executionScope.canonical_work_item_root)) {
    throw artifactIdentityError({
      message: 'Work-item artifact identity requires a canonical work-item root.',
      blockedReason: 'artifact_identity_work_item_root_missing_authority_violation',
      hardStopClass: 'authority_boundary_violation',
      artifactRef: optionalString(input.runtimeIdentity.stage_attempt_id) ?? 'missing',
      details: { operation: input.operation },
    });
  }
  return {
    stageRunId,
    scopeKind: scope.scopeKind,
    executionScope: scope.executionScope,
  };
}
