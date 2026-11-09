import type {
  FamilyRuntimeExecutionScopeKind,
  WorkItemExecutionScopeSnapshot,
} from '../family-runtime-execution-scope.ts';
import {
  bindArtifact,
  bindManagedPackFile,
  bindManagedRolePrompt,
  containedFile,
  localFileForRef,
  observeArtifactBytes,
  observeStableFile,
  failForWorkItemFileBoundary,
  readStandardAgentQualityRolePromptFile,
  readStableWorkItemFile,
  WorkItemFileBoundaryError,
  verifyTrustedReceipt,
} from './content-binding-observation.ts';
import {
  canonicalStageRunSha256,
  fail,
  requiredText,
  requireStageRunImmutableContentBindings,
} from './content-binding-validation.ts';
import type {
  ArtifactIdentity,
  StageRunContentPurpose,
  StageRunImmutableContentBinding,
} from './content-binding-types.ts';

export {
  canonicalStageRunSha256,
  requireStageRunImmutableContentBindings,
};
export type {
  StageRunContentPurpose,
  StageRunContentVerificationKind,
  StageRunImmutableContentBinding,
} from './content-binding-types.ts';

export function buildStageRunImmutableContentBindings(input: {
  domainId: string;
  domainPackRoot: string;
  workspaceRoot: string | null;
  scopeKind: FamilyRuntimeExecutionScopeKind;
  executionScope: WorkItemExecutionScopeSnapshot | null;
  stageManifest: { ref: string; sha256: string };
  qualityPolicyRef: string;
  stagePromptRef: string;
  rolePromptRefs: string[];
  qualityRubricRefs: string[];
  knowledgeRefs: string[];
  skillRefs: string[];
  policyRefs: string[];
  stageGoalRefs: string[];
  sourceRefs: string[];
  lineageRefs: string[];
  stagePacketRef: string;
  checkpointRefs: string[];
  checkpointArtifacts?: ArtifactIdentity[];
  inputArtifacts: ArtifactIdentity[];
}) {
  const artifacts = new Map(input.inputArtifacts.map((artifact) => [artifact.ref, artifact]));
  const checkpointArtifacts = new Map((input.checkpointArtifacts ?? []).map((artifact) => [artifact.ref, artifact]));
  for (const artifact of checkpointArtifacts.values()) {
    const existing = artifacts.get(artifact.ref);
    if (existing && (
      existing.sha256 !== artifact.sha256
      || existing.identity_receipt_ref !== artifact.identity_receipt_ref
    )) {
      fail('StageRun checkpoint and input artifact identities conflict.', {
        failure_code: 'stage_run_content_binding_conflict',
        ref: artifact.ref,
        existing_sha256: existing.sha256,
        received_sha256: artifact.sha256,
        existing_identity_receipt_ref: existing.identity_receipt_ref,
        received_identity_receipt_ref: artifact.identity_receipt_ref,
      });
    }
  }
  const result: StageRunImmutableContentBinding[] = [];
  const bind = (
    purpose: StageRunContentPurpose,
    ref: string,
    expectedSha256?: string | null,
  ) => {
    // A child keeps the parent's exact decision bytes as checkpoints, while its
    // input artifacts describe only the current producer or review subject.
    const artifact = purpose === 'checkpoint'
      ? checkpointArtifacts.get(ref) ?? artifacts.get(ref)
      : artifacts.get(ref);
    const binding = purpose === 'role_prompt' && !artifact
      ? bindManagedRolePrompt({ domainPackRoot: input.domainPackRoot, ref })
      : artifact
      ? bindArtifact({
          purpose,
          artifact,
          domainId: input.domainId,
          workspaceRoot: input.workspaceRoot,
          scopeKind: input.scopeKind,
          executionScope: input.executionScope,
        })
      : bindManagedPackFile({
          domainPackRoot: input.domainPackRoot,
          purpose,
          ref,
          expectedSha256,
        });
    if (!binding) {
      fail('StageRun executable ref is not bound to managed-pack bytes or an exact artifact receipt.', {
        failure_code: 'stage_run_content_ref_unbound',
        purpose,
        ref,
      });
    }
    const existing = result.find((entry) => entry.purpose === purpose && entry.ref === ref);
    if (existing) {
      if (existing.sha256 !== binding.sha256) {
        fail('StageRun executable ref resolved to conflicting byte identities.', {
          failure_code: 'stage_run_content_binding_conflict',
          purpose,
          ref,
          existing_sha256: existing.sha256,
          received_sha256: binding.sha256,
        });
      }
      return;
    }
    result.push(binding);
  };

  bind('stage_manifest', input.stageManifest.ref, input.stageManifest.sha256);
  bind('quality_policy', input.qualityPolicyRef);
  bind('stage_prompt', input.stagePromptRef);
  input.rolePromptRefs.forEach((ref) => bind('role_prompt', ref));
  input.qualityRubricRefs.forEach((ref) => bind('quality_rubric', ref));
  input.skillRefs.forEach((ref) => bind('skill', ref));
  input.policyRefs.forEach((ref) => bind('policy', ref));
  input.stageGoalRefs.forEach((ref) => bind('stage_goal', ref));
  input.sourceRefs.forEach((ref) => bind('source', ref));
  input.lineageRefs.forEach((ref) => bind('lineage', ref));
  bind('stage_packet', input.stagePacketRef);
  input.checkpointRefs.forEach((ref) => bind('checkpoint', ref));
  input.inputArtifacts.forEach((artifact) => bind('input_artifact', artifact.ref, artifact.sha256));
  return result.sort((left, right) => (
    left.purpose.localeCompare(right.purpose)
    || left.ref.localeCompare(right.ref)
    || left.sha256.localeCompare(right.sha256)
  ));
}

export function revalidateStageRunImmutableContentBindings(input: {
  domainId: string;
  domainPackRoot: string;
  workspaceRoot: string | null;
  scopeKind: FamilyRuntimeExecutionScopeKind;
  executionScope: WorkItemExecutionScopeSnapshot | null;
  bindings: StageRunImmutableContentBinding[];
  skipManagedPackBytes?: boolean;
}) {
  const bindings = requireStageRunImmutableContentBindings(input.bindings);
  const seen = new Set<string>();
  for (const binding of bindings) {
    const key = `${binding.purpose}\0${binding.ref}`;
    if (seen.has(key)) {
      fail('StageRun immutable content bindings must be unique by purpose and ref.', {
        failure_code: 'stage_run_content_binding_duplicate',
        purpose: binding.purpose,
        ref: binding.ref,
      });
    }
    seen.add(key);
    const sha256 = canonicalStageRunSha256(binding.sha256, `content_bindings.${binding.purpose}.sha256`);
    if (binding.purpose === 'role_prompt') {
      if (binding.verification_kind !== 'managed_pack_file_bytes') {
        fail('StageRun role prompt binding must resolve from managed package bytes.', {
          failure_code: 'stage_run_role_prompt_binding_authority_mismatch',
          ref: binding.ref,
          verification_kind: binding.verification_kind,
        });
      }
      const effectiveSha256 = canonicalStageRunSha256(
        binding.effective_content_sha256,
        'content_bindings.role_prompt.effective_content_sha256',
      );
      if (!Number.isSafeInteger(binding.effective_content_byte_size) || binding.effective_content_byte_size! < 1) {
        fail('StageRun role prompt binding requires a positive effective content byte size.', {
          failure_code: 'stage_run_role_prompt_effective_size_invalid',
          ref: binding.ref,
          effective_content_byte_size: binding.effective_content_byte_size,
        });
      }
      if (input.skipManagedPackBytes) continue;
      const observedPrompt = readStandardAgentQualityRolePromptFile(input.domainPackRoot, binding.ref);
      const observedFileSha256 = `sha256:${observedPrompt.source_file_sha256}`;
      const observedEffectiveSha256 = `sha256:${observedPrompt.sha256}`;
      if (
        observedFileSha256 !== sha256
        || observedPrompt.source_file_size_bytes !== binding.byte_size
        || observedEffectiveSha256 !== effectiveSha256
        || observedPrompt.size_bytes !== binding.effective_content_byte_size
      ) {
        fail('StageRun role prompt source file or effective section changed after the spec was created.', {
          failure_code: 'stage_run_role_prompt_content_binding_stale',
          ref: binding.ref,
          expected_source_file_sha256: sha256,
          observed_source_file_sha256: observedFileSha256,
          expected_source_file_byte_size: binding.byte_size,
          observed_source_file_byte_size: observedPrompt.source_file_size_bytes,
          expected_effective_content_sha256: effectiveSha256,
          observed_effective_content_sha256: observedEffectiveSha256,
          expected_effective_content_byte_size: binding.effective_content_byte_size,
          observed_effective_content_byte_size: observedPrompt.size_bytes,
        });
      }
      continue;
    }
    if (binding.effective_content_sha256 !== null || binding.effective_content_byte_size !== null) {
      fail('Only role prompt bindings may declare an effective content digest.', {
        failure_code: 'stage_run_effective_content_binding_purpose_invalid',
        purpose: binding.purpose,
        ref: binding.ref,
      });
    }
    if (binding.verification_kind === 'trusted_artifact_identity_receipt') {
      if (
        binding.scope_kind !== input.scopeKind
        || binding.work_item_scope_id !== (input.executionScope?.work_item_scope_id ?? null)
        || binding.scope_digest !== (input.executionScope?.scope_digest ?? null)
      ) {
        fail('StageRun artifact binding execution scope no longer matches its runtime authority.', {
          failure_code: 'stage_run_artifact_scope_binding_mismatch',
          ref: binding.ref,
          expected_scope_kind: input.scopeKind,
          actual_scope_kind: binding.scope_kind ?? null,
          expected_work_item_scope_id: input.executionScope?.work_item_scope_id ?? null,
          actual_work_item_scope_id: binding.work_item_scope_id ?? null,
          expected_scope_digest: input.executionScope?.scope_digest ?? null,
          actual_scope_digest: binding.scope_digest ?? null,
        });
      }
      const receipt = verifyTrustedReceipt({
        receiptRef: requiredText(binding.identity_receipt_ref, 'content_binding.identity_receipt_ref'),
        workspaceRoot: input.workspaceRoot,
        domainId: input.domainId,
        scopeKind: input.scopeKind,
        executionScope: input.executionScope,
        artifact: {
          ref: binding.ref,
          sha256,
          identity_receipt_ref: binding.identity_receipt_ref,
        },
      });
      if (
        receipt.producingStageRunRef !== binding.producing_stage_run_ref
        || receipt.producingAttemptRef !== binding.producing_attempt_ref
        || receipt.byteSize !== binding.byte_size
      ) {
        fail('StageRun trusted receipt lineage no longer matches its immutable content binding.', {
          failure_code: 'stage_run_artifact_identity_receipt_binding_mismatch',
          ref: binding.ref,
          expected_producing_stage_run_ref: binding.producing_stage_run_ref,
          actual_producing_stage_run_ref: receipt.producingStageRunRef,
          expected_producing_attempt_ref: binding.producing_attempt_ref,
          actual_producing_attempt_ref: receipt.producingAttemptRef,
          expected_byte_size: binding.byte_size,
          actual_byte_size: receipt.byteSize,
        });
      }
      const localFilePath = localFileForRef(binding.ref, input.workspaceRoot);
      if (localFilePath) {
        const observed = observeArtifactBytes({
          phase: 'revalidate',
          filePath: localFilePath,
          artifactRef: binding.ref,
          executionScope: input.executionScope,
        });
        if (
          observed.sha256 !== sha256
          || (binding.byte_size !== null && observed.byteSize !== binding.byte_size)
        ) {
          fail('StageRun receipt-bound local artifact bytes changed after the spec was created.', {
            failure_code: 'stage_run_content_binding_stale',
            purpose: binding.purpose,
            ref: binding.ref,
            expected_sha256: sha256,
            observed_sha256: observed.sha256,
            expected_byte_size: binding.byte_size,
            observed_byte_size: observed.byteSize,
          });
        }
      }
      continue;
    }
    if (input.skipManagedPackBytes && binding.verification_kind === 'managed_pack_file_bytes') {
      continue;
    }
    const filePath = binding.verification_kind === 'managed_pack_file_bytes'
      ? containedFile(input.domainPackRoot, binding.ref)
      : localFileForRef(binding.ref, input.workspaceRoot);
    if (!filePath) {
      fail('StageRun immutable content binding can no longer resolve its file.', {
        failure_code: 'stage_run_content_ref_unreadable',
        purpose: binding.purpose,
        ref: binding.ref,
      });
    }
    const canonicalWorkItemRoot = input.executionScope?.canonical_work_item_root ?? null;
    if (
      binding.verification_kind === 'workspace_file_bytes'
      && (
        binding.scope_kind !== input.scopeKind
        || binding.work_item_scope_id !== (input.executionScope?.work_item_scope_id ?? null)
        || binding.scope_digest !== (input.executionScope?.scope_digest ?? null)
        || (input.executionScope && !canonicalWorkItemRoot)
      )
    ) {
      fail('StageRun workspace artifact binding crossed its canonical work-item root or execution scope.', {
        failure_code: 'stage_run_artifact_scope_binding_mismatch',
        ref: binding.ref,
        resolved_path: filePath,
        canonical_work_item_root: input.executionScope?.canonical_work_item_root ?? null,
      });
    }
    let observedSha256: string;
    let observedByteSize: number;
    if (binding.verification_kind === 'workspace_file_bytes' && input.executionScope) {
      try {
        const observed = readStableWorkItemFile({
          workspaceRoot: input.executionScope.workspace_root,
          canonicalWorkItemRoot: canonicalWorkItemRoot!,
          expectedRootIdentity: input.executionScope.canonical_work_item_root_identity!,
          filePath,
          ref: binding.ref,
        });
        observedSha256 = observed.sha256;
        observedByteSize = observed.byte_size;
      } catch (error) {
        if (!(error instanceof WorkItemFileBoundaryError)) throw error;
        failForWorkItemFileBoundary({
          error,
          phase: 'revalidate',
          ref: binding.ref,
          resolvedPath: filePath,
          canonicalWorkItemRoot: canonicalWorkItemRoot!,
          workItemScopeId: input.executionScope.work_item_scope_id,
        });
      }
    } else {
      const observed = observeStableFile({ filePath, ref: binding.ref });
      observedSha256 = observed.sha256;
      observedByteSize = observed.byteSize;
    }
    if (observedSha256 !== sha256 || observedByteSize !== binding.byte_size) {
      fail('StageRun immutable content bytes changed after the spec was created.', {
        failure_code: 'stage_run_content_binding_stale',
        purpose: binding.purpose,
        ref: binding.ref,
        expected_sha256: sha256,
        observed_sha256: observedSha256,
        expected_byte_size: binding.byte_size,
        observed_byte_size: observedByteSize,
      });
    }
  }
  return bindings;
}
