import { FrameworkContractError } from '../../kernel/contract-validation.ts';
import {
  readStandardAgentQualityRolePromptFile,
  readStandardAgentStagePromptFile,
} from '../pack/index.ts';
import type { TemporalStageAttemptWorkflowInput } from './family-runtime-temporal.ts';
import {
  revalidateStageRunImmutableSpecContent,
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

export function resolveStageRunAttemptExecutorContent(
  input: TemporalStageAttemptWorkflowInput,
) {
  if (!input.stage_run_content_binding_version && !input.stage_run_id && !input.attempt_role) return {};
  requireStageRunAttemptContentBindingVersion(input as unknown as Record<string, unknown>, {
    allowLegacyUnbound: false,
  });

  const spec = input.stage_run_spec;
  const domainPackRoot = text(input.domain_pack_root);
  const expectedSpecSha256 = text(input.stage_run_spec_sha256);
  const rolePromptRef = text(input.quality_role_prompt_ref);
  if (!input.stage_run_id || !spec || !domainPackRoot || !expectedSpecSha256 || !rolePromptRef) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'StageRun child Attempt requires its immutable spec, current pack root, and role prompt binding.',
      {
        failure_code: 'stage_run_child_content_bindings_missing',
        stage_attempt_id: input.stage_attempt_id,
        stage_run_id: input.stage_run_id ?? null,
      },
    );
  }

  const actualSpecSha256 = stageRunSpecSha256(spec);
  const expectedRolePromptRef = input.attempt_role
    ? spec.role_prompt_refs[input.attempt_role]
    : null;
  if (
    actualSpecSha256 !== expectedSpecSha256
    || spec.domain_id !== input.domain_id
    || spec.stage_id !== input.stage_id
    || expectedRolePromptRef !== rolePromptRef
  ) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'StageRun child Attempt immutable content bindings do not match its parent Run identity.',
      {
        failure_code: 'stage_run_child_spec_identity_mismatch',
        stage_attempt_id: input.stage_attempt_id,
        stage_run_id: input.stage_run_id,
        expected_stage_run_spec_sha256: expectedSpecSha256,
        received_stage_run_spec_sha256: actualSpecSha256,
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
      'StageRun runner prompt hydration must use the exact bytes bound by the parent Run.',
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
