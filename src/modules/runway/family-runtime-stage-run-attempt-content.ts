import { FrameworkContractError } from '../../kernel/contract-validation.ts';
import { canonicalJsonText } from '../../kernel/canonical-json.ts';
import {
  readStandardAgentQualityRolePromptFile,
  readStandardAgentStagePromptFile,
} from '../pack/index.ts';
import type { TemporalStageAttemptWorkflowInput } from './family-runtime-temporal.ts';
import {
  canonicalStageAttemptDeclaredStageIds,
  immutablePackageClosureFromWorkspaceLocator,
  revalidateStageRunImmutableSpecContent,
  stageAttemptExecutionContentBindingSha256,
  stageRunSpecSha256,
} from './family-runtime-stage-run-identity.ts';
import {
  requireStageRunAttemptContentBindingVersion,
  STAGE_RUN_ATTEMPT_CONTENT_BINDING_VERSION,
} from './family-runtime-stage-quality-attempt-boundary.ts';

export { STAGE_RUN_ATTEMPT_CONTENT_BINDING_VERSION };

function text(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function artifactPairs(refs: unknown, hashes: unknown) {
  const artifactRefs = Array.isArray(refs) ? refs : [];
  const artifactHashes = Array.isArray(hashes) ? hashes : [];
  return artifactRefs.map((ref, index) => ({
    ref,
    sha256: artifactHashes[index],
  })).sort((left, right) => canonicalJsonText(left).localeCompare(canonicalJsonText(right)));
}

export function resolveStageRunAttemptExecutorContent(
  input: TemporalStageAttemptWorkflowInput,
) {
  if (!input.stage_run_content_binding_version && !input.stage_run_id && !input.attempt_role) return {};
  requireStageRunAttemptContentBindingVersion(input as unknown as Record<string, unknown>, {
    allowLegacyUnbound: false,
  });

  const parentSpec = input.stage_run_spec;
  const domainPackRoot = text(input.domain_pack_root);
  const expectedParentSpecSha256 = text(input.stage_run_spec_sha256);
  const rolePromptRef = text(input.quality_role_prompt_ref);
  if (!input.stage_run_id || !parentSpec || !domainPackRoot || !expectedParentSpecSha256 || !rolePromptRef) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'StageRun child Attempt requires its historical parent spec, current pack root, and role prompt binding.',
      {
        failure_code: 'stage_run_child_content_bindings_missing',
        stage_attempt_id: input.stage_attempt_id,
        stage_run_id: input.stage_run_id ?? null,
      },
    );
  }

  const actualParentSpecSha256 = stageRunSpecSha256(parentSpec);
  if (
    actualParentSpecSha256 !== expectedParentSpecSha256
    || parentSpec.domain_id !== input.domain_id
    || parentSpec.stage_id !== input.stage_id
  ) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'StageRun child Attempt historical parent identity is invalid.',
      {
        failure_code: 'stage_run_child_parent_spec_identity_mismatch',
        stage_attempt_id: input.stage_attempt_id,
        stage_run_id: input.stage_run_id,
        expected_stage_run_spec_sha256: expectedParentSpecSha256,
        received_stage_run_spec_sha256: actualParentSpecSha256,
      },
    );
  }

  const executionBinding = input.execution_content_binding;
  let spec = parentSpec;
  if (executionBinding) {
    const actualExecutionSpecSha256 = stageRunSpecSha256(executionBinding.spec);
    const canonicalDeclaredStageIds = canonicalStageAttemptDeclaredStageIds(
      executionBinding.declared_stage_ids,
    );
    const actualExecutionBindingSha256 = stageAttemptExecutionContentBindingSha256({
      parent_stage_run_spec_sha256: executionBinding.parent_stage_run_spec_sha256,
      use_boundary_id: executionBinding.use_boundary_id,
      spec_sha256: executionBinding.spec_sha256,
      spec: executionBinding.spec,
      declared_stage_ids: canonicalDeclaredStageIds,
    });
    const executionUseBoundaryId = text(executionBinding.use_boundary_id);
    const locatorUseBinding = input.workspace_locator.package_use_binding;
    const locatorUseBoundaryId = locatorUseBinding && typeof locatorUseBinding === 'object'
      ? text((locatorUseBinding as Record<string, unknown>).use_boundary_id)
      : null;
    const currentPackageClosure = immutablePackageClosureFromWorkspaceLocator(input.workspace_locator);
    const stableParentAxes = {
      domain_id: parentSpec.domain_id,
      stage_id: parentSpec.stage_id,
      action_id: parentSpec.action_id,
      task_id: parentSpec.task_id,
      workspace_identity: parentSpec.workspace_identity,
      source_fingerprint: parentSpec.source_fingerprint,
      executor_kind: parentSpec.executor_kind,
      stage_attempt_executor_policy: parentSpec.stage_attempt_executor_policy,
      parent_route_decision_ref: parentSpec.parent_route_decision_ref,
    };
    const stableExecutionAxes = {
      domain_id: executionBinding.spec.domain_id,
      stage_id: executionBinding.spec.stage_id,
      action_id: executionBinding.spec.action_id,
      task_id: executionBinding.spec.task_id,
      workspace_identity: executionBinding.spec.workspace_identity,
      source_fingerprint: executionBinding.spec.source_fingerprint,
      executor_kind: executionBinding.spec.executor_kind,
      stage_attempt_executor_policy: executionBinding.spec.stage_attempt_executor_policy,
      parent_route_decision_ref: executionBinding.spec.parent_route_decision_ref,
    };
    if (
      executionBinding.surface_kind !== 'opl_stage_attempt_execution_content_binding'
      || executionBinding.version !== 'opl-stage-attempt-execution-content-binding.v1'
      || executionBinding.parent_stage_run_spec_sha256 !== expectedParentSpecSha256
      || executionBinding.spec_sha256 !== actualExecutionSpecSha256
      || executionBinding.binding_sha256 !== actualExecutionBindingSha256
      || canonicalJsonText(executionBinding.declared_stage_ids) !== canonicalJsonText(canonicalDeclaredStageIds)
      || !canonicalDeclaredStageIds.includes(input.stage_id)
      || !executionUseBoundaryId
      || (locatorUseBoundaryId !== null && executionUseBoundaryId !== locatorUseBoundaryId)
      || canonicalJsonText(stableExecutionAxes) !== canonicalJsonText(stableParentAxes)
      || !currentPackageClosure
      || canonicalJsonText(executionBinding.spec.package_closure) !== canonicalJsonText(currentPackageClosure)
    ) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'StageRun child Attempt execution content binding is not linked to its parent identity and current package use.',
        {
          failure_code: 'stage_attempt_execution_content_binding_mismatch',
          stage_attempt_id: input.stage_attempt_id,
          stage_run_id: input.stage_run_id,
          parent_stage_run_spec_sha256: expectedParentSpecSha256,
          execution_content_spec_sha256: actualExecutionSpecSha256,
          execution_content_binding_sha256: actualExecutionBindingSha256,
          use_boundary_id: executionUseBoundaryId,
          locator_use_boundary_id: locatorUseBoundaryId,
        },
      );
    }
    spec = executionBinding.spec;
  }

  const expectedRolePromptRef = input.attempt_role
    ? spec.role_prompt_refs[input.attempt_role]
    : null;
  if (
    expectedRolePromptRef !== rolePromptRef
    || canonicalJsonText(spec.quality_rubric_refs) !== canonicalJsonText(input.quality_rubric_refs ?? [])
    || spec.stage_packet_ref !== input.stage_packet_ref
    || canonicalJsonText(spec.checkpoint_refs) !== canonicalJsonText(input.checkpoint_refs ?? [])
    || canonicalJsonText(spec.input_artifacts.map((artifact) => ({
      ref: artifact.ref,
      sha256: artifact.sha256,
    }))) !== canonicalJsonText(artifactPairs(input.input_artifact_refs, input.reviewed_artifact_hashes))
  ) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'StageRun child Attempt envelope does not match its current execution content binding.',
      {
        failure_code: 'stage_attempt_execution_content_envelope_mismatch',
        stage_attempt_id: input.stage_attempt_id,
        stage_run_id: input.stage_run_id,
        expected_role_prompt_ref: expectedRolePromptRef,
        received_role_prompt_ref: rolePromptRef,
      },
    );
  }

  revalidateStageRunImmutableSpecContent({
    spec,
    domainPackRoot,
    workspaceLocator: input.workspace_locator,
  });

  const expectedStagePrompt = spec.content_bindings.find((entry) => entry.purpose === 'stage_prompt');
  const stagePromptFile = readStandardAgentStagePromptFile(domainPackRoot, expectedStagePrompt?.ref ?? '');
  const stagePrompt = {
    status: 'hydrated' as const,
    stage_id: input.stage_id,
    source_manifest_ref: spec.stage_manifest.ref,
    source_ref: stagePromptFile.ref,
    layer: stagePromptFile.layer,
    sha256: stagePromptFile.sha256,
    size_bytes: stagePromptFile.size_bytes,
    content: stagePromptFile.content,
  };
  const rolePrompt = readStandardAgentQualityRolePromptFile(domainPackRoot, rolePromptRef);
  const expectedRolePrompt = spec.content_bindings.find((entry) => (
    entry.purpose === 'role_prompt' && entry.ref === rolePromptRef
  ));
  const stagePromptDigest = stagePrompt.sha256 ? `sha256:${stagePrompt.sha256}` : null;
  const rolePromptFileDigest = `sha256:${rolePrompt.source_file_sha256}`;
  const rolePromptEffectiveDigest = `sha256:${rolePrompt.sha256}`;
  if (
    stagePrompt.status !== 'hydrated'
    || stagePrompt.source_ref !== expectedStagePrompt?.ref
    || stagePromptDigest !== expectedStagePrompt.sha256
    || rolePrompt.ref !== expectedRolePrompt?.ref
    || rolePromptFileDigest !== expectedRolePrompt.sha256
    || rolePrompt.source_file_size_bytes !== expectedRolePrompt.byte_size
    || rolePromptEffectiveDigest !== expectedRolePrompt.effective_content_sha256
    || rolePrompt.size_bytes !== expectedRolePrompt.effective_content_byte_size
  ) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'StageRun runner prompt hydration must use the exact bytes bound for the current child Attempt.',
      {
        failure_code: 'stage_run_runner_prompt_binding_mismatch',
        stage_attempt_id: input.stage_attempt_id,
        stage_run_id: input.stage_run_id,
        expected_stage_prompt: expectedStagePrompt ?? null,
        received_stage_prompt: {
          ref: stagePrompt.source_ref,
          sha256: stagePromptDigest,
          status: stagePrompt.status,
        },
        expected_role_prompt: expectedRolePrompt ?? null,
        received_role_prompt: {
          ref: rolePrompt.ref,
          source_file_ref: rolePrompt.source_file_ref,
          source_file_sha256: rolePromptFileDigest,
          source_file_size_bytes: rolePrompt.source_file_size_bytes,
          effective_section_sha256: rolePromptEffectiveDigest,
          effective_section_size_bytes: rolePrompt.size_bytes,
        },
      },
    );
  }

  return {
    effectiveStagePrompt: stagePrompt,
    effectiveQualityRolePrompt: rolePrompt,
  };
}
