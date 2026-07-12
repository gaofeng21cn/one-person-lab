import {
  commitStageArtifactAttemptRuntime,
  conformanceStageArtifactRuntime,
  explainStageArtifactRuntime,
  gcStageArtifactRuntime,
  openStageArtifactAttemptRuntime,
  promoteStageArtifactRuntime,
  rebuildStageArtifactRuntime,
  restoreStageArtifactRuntime,
  statusStageArtifactRuntime,
  validateStageArtifactRuntime,
  workbenchStageArtifactRuntime,
} from '../stagecraft/index.ts';
import type { FamilyRuntimeCommandInput } from './family-runtime-command.ts';

type StageArtifactInput = Extract<FamilyRuntimeCommandInput, { mode: 'stage_artifact' }>['input'];

export function runFamilyRuntimeStageArtifactCommand(input: StageArtifactInput): Record<string, unknown> {
  if (input.action === 'open') {
    return {
      version: 'g2',
      stage_artifact_runtime: openStageArtifactAttemptRuntime({
        ...input,
        stage_id: input.stage_id ?? '',
        stage_order: input.stage_order,
        attempt_id: input.attempt_id ?? '',
      }),
    };
  }
  if (input.action === 'commit') {
    return {
      version: 'g2',
      stage_artifact_runtime: commitStageArtifactAttemptRuntime({
        ...input,
        stage_id: input.stage_id ?? '',
        stage_order: input.stage_order,
        attempt_id: input.attempt_id ?? '',
        terminal_status: input.terminal_status ?? 'success',
        required_outputs: input.required_outputs ?? [],
        owner_receipt_refs: input.owner_receipt_refs ?? [],
        quality_debt_refs: input.quality_debt_refs ?? [],
        typed_blocker_refs: input.typed_blocker_refs ?? [],
        decision_receipt_refs: input.decision_receipt_refs ?? [],
      }),
    };
  }
  if (input.action === 'status') {
    return {
      version: 'g2',
      stage_artifact_runtime: statusStageArtifactRuntime(input),
    };
  }
  if (input.action === 'explain') {
    return {
      version: 'g2',
      stage_artifact_runtime: explainStageArtifactRuntime(input),
    };
  }
  if (input.action === 'rebuild') {
    return {
      version: 'g2',
      stage_artifact_runtime: rebuildStageArtifactRuntime(input),
    };
  }
  if (input.action === 'promote') {
    return {
      version: 'g2',
      stage_artifact_runtime: promoteStageArtifactRuntime({
        ...input,
        stage_id: input.stage_id ?? '',
        attempt_id: input.attempt_id ?? '',
        artifact_ref: input.artifact_ref ?? '',
      }),
    };
  }
  if (input.action === 'gc') {
    return {
      version: 'g2',
      stage_artifact_runtime: gcStageArtifactRuntime(input),
    };
  }
  if (input.action === 'restore') {
    return {
      version: 'g2',
      stage_artifact_runtime: restoreStageArtifactRuntime({
        ...input,
        stage_id: input.stage_id ?? '',
        attempt_id: input.attempt_id ?? '',
        restore_ref: input.restore_ref ?? '',
      }),
    };
  }
  if (input.action === 'conformance') {
    return {
      version: 'g2',
      stage_artifact_runtime: conformanceStageArtifactRuntime(input),
    };
  }
  if (input.action === 'validate') {
    return {
      version: 'g2',
      stage_artifact_runtime: validateStageArtifactRuntime(input),
    };
  }
  return {
    version: 'g2',
    stage_artifact_runtime: workbenchStageArtifactRuntime(input),
  };
}
