import { FrameworkContractError, isRecord } from '../../kernel/contract-validation.ts';
import { stableId } from '../../kernel/stable-id.ts';
import {
  normalizeFamilyStageControlPlane,
  type FamilyStageControlPlane,
} from './family-stage-control-plane-contract.ts';
import {
  STAGE_RUN_CANONICAL_LAUNCH_OWNER,
  STAGE_RUN_CANONICAL_RUNNER_REF,
  type StageRunCycleManifest,
} from './stage-run-orchestration-types.ts';

const ALLOWED_INPUT_FIELDS = new Set([
  'stage_control_plane',
  'target_agent_ref',
  'descriptor_ref',
  'run_ref',
  'input_refs',
  'max_cycles',
  'max_attempts_per_cycle',
]);

export type StageRunControlPlaneManifestInput = {
  stage_control_plane: FamilyStageControlPlane;
  target_agent_ref: string;
  descriptor_ref: string;
  run_ref: string;
  input_refs: string[];
  max_cycles: number;
  max_attempts_per_cycle: number;
};

type StageRunCycleManifestIdentityInput = Pick<
  StageRunCycleManifest,
  | 'target_agent_ref'
  | 'descriptor_ref'
  | 'run_ref'
  | 'input_refs'
  | 'stage_bindings'
  | 'max_cycles'
  | 'max_attempts_per_cycle'
>;

export function buildStageRunCycleManifestId(input: StageRunCycleManifestIdentityInput) {
  return stableId('stage_run_manifest', [
    input.target_agent_ref,
    input.descriptor_ref,
    input.run_ref,
    input.input_refs,
    input.stage_bindings,
    input.max_cycles,
    input.max_attempts_per_cycle,
  ]);
}

function contractError(message: string, details: Record<string, unknown> = {}): never {
  throw new FrameworkContractError('contract_shape_invalid', message, details);
}

function requiredRef(value: unknown, field: string) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    contractError(`StageRun control-plane adapter requires ${field}.`, { field });
  }
  return value.trim();
}

function positiveInteger(value: unknown, field: string) {
  if (!Number.isInteger(value) || Number(value) < 1) {
    contractError(`StageRun control-plane adapter requires positive integer ${field}.`, { field });
  }
  return Number(value);
}

function uniqueRefs(value: unknown, field: string) {
  if (!Array.isArray(value) || value.length === 0) {
    contractError(`StageRun control-plane adapter requires non-empty ${field}.`, { field });
  }
  return [...new Set(value.map((entry) => requiredRef(entry, field)))];
}

export function buildStageRunCycleManifestFromControlPlane(
  input: StageRunControlPlaneManifestInput,
): StageRunCycleManifest {
  if (!isRecord(input)) {
    contractError('StageRun control-plane adapter requires an input object.');
  }
  const unexpectedFields = Object.keys(input).filter((field) => !ALLOWED_INPUT_FIELDS.has(field));
  if (unexpectedFields.length > 0) {
    contractError('StageRun control-plane adapter owns runner and launch identity.', {
      unexpected_fields: unexpectedFields,
    });
  }
  let plane: FamilyStageControlPlane | null = null;
  try {
    plane = normalizeFamilyStageControlPlane(
      input.stage_control_plane,
      'stage_run_control_plane',
    );
  } catch (error) {
    contractError('StageRun control-plane adapter rejected an invalid generated control plane.', {
      reason: error instanceof Error ? error.message : 'unknown_contract_error',
    });
  }
  if (!plane) contractError('StageRun control-plane adapter requires a generated stage control plane.');
  const targetAgentRef = requiredRef(input.target_agent_ref, 'target_agent_ref');
  const descriptorRef = requiredRef(input.descriptor_ref, 'descriptor_ref');
  const runRef = requiredRef(input.run_ref, 'run_ref');
  const manifestIdentity = {
    target_agent_ref: targetAgentRef,
    descriptor_ref: descriptorRef,
    run_ref: runRef,
    input_refs: uniqueRefs(input.input_refs, 'input_refs'),
    stage_bindings: plane.stages.map((stage) => ({
      stage_ref: stage.stage_id,
      runner_ref: STAGE_RUN_CANONICAL_RUNNER_REF,
    })),
    max_cycles: positiveInteger(input.max_cycles, 'max_cycles'),
    max_attempts_per_cycle: positiveInteger(
      input.max_attempts_per_cycle,
      'max_attempts_per_cycle',
    ),
  };
  return {
    surface_kind: 'opl_stage_run_cycle_manifest',
    version: 'stage-run-cycle.v1',
    manifest_id: buildStageRunCycleManifestId(manifestIdentity),
    ...manifestIdentity,
    launch_owner: STAGE_RUN_CANONICAL_LAUNCH_OWNER,
  };
}
