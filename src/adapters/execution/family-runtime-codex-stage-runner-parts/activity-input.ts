import type { JsonRecord } from './shared.ts';
import { resolvedStagePacketRef, workspaceRootFromAttempt } from './input-prompt.ts';
import { buildCodexStageRunnerReceipt } from './receipt-builders.ts';
import { codexExecOptionsFromPolicy, codexProjectionRunnerModeFromAttempt, executorPolicyFromAttempt } from './executor-policy.ts';

export function buildCodexStageActivityInput(input: {
  attempt: JsonRecord;
  stagePacketRef?: string | null;
}) {
  const stagePacketRef = resolvedStagePacketRef(input);
  const workspaceRoot = workspaceRootFromAttempt(input.attempt) ?? null;
  const runnerReceipt = buildCodexStageRunnerReceipt({
    attempt: input.attempt,
    stagePacketRef,
    codexExecOptions: codexExecOptionsFromPolicy(executorPolicyFromAttempt(input.attempt)),
    runnerMode: codexProjectionRunnerModeFromAttempt(input.attempt),
  });
  return {
    activity_kind: 'codex_stage_activity',
    executor: 'codex_cli',
    attempt: input.attempt,
    stage_packet_ref: stagePacketRef,
    stage_packet_binding: {
      binding_status: stagePacketRef && stagePacketRef !== 'unavailable' && workspaceRoot
        ? 'bound'
        : workspaceRoot
          ? 'advisory_missing_stage_packet_ref'
          : 'missing_workspace_root',
      stage_packet_ref: stagePacketRef,
      workspace_root: workspaceRoot,
      binding_source: stagePacketRef ? 'stage_attempt_checkpoint_refs' : null,
      stage_may_start_from_declared_context: Boolean(workspaceRoot),
      can_claim_stage_complete: false,
      can_claim_domain_ready: false,
      can_claim_production_ready: false,
    },
    ...runnerReceipt,
    expected_closeout: {
      typed_packet_required_for_progress: false,
      raw_or_free_text_artifact_accepted_for_progress: true,
      framework_derives_progress_envelope: true,
    },
    authority_boundary: {
      opl: 'activity_packet_and_receipt_transport_only',
      codex_cli: 'stage_execution_under_domain_prompt_and_skill',
      domain: 'truth_quality_artifact_gate_owner',
    },
  };
}
