import { assert, fs, os, path, runCli, shellSingleQuote, test } from '../helpers.ts';
import { FrameworkContractError } from '../../../../src/contracts.ts';
import {
  familyRuntimePaths,
  inspectTask,
  openQueueDb,
  taskToPayload,
  type FamilyRuntimeTaskRow,
} from '../../../../src/family-runtime-store.ts';
import {
  buildTemporalStageAttemptWorkflowInput,
  requireTemporalStageAttemptWorkflowInputLaunchable,
} from '../../../../src/family-runtime-temporal.ts';
import { enqueueTask } from '../../../../src/family-runtime-enqueue.ts';
import {
  paperMissionRedriveProviderFollowthrough,
} from '../../../../src/family-runtime.ts';
import { redriveFamilyRuntimeTask } from '../../../../src/family-runtime-redrive.ts';
import { dispatchFamilyRuntimeTask } from '../../../../src/family-runtime-task-dispatch.ts';
import { syncStageAttemptFromTemporalTerminalObservation } from '../../../../src/family-runtime-stage-attempts.ts';

export type StageRouteDispatchReadback = {
  status: 'running' | 'blocked';
  reason: string;
  blocker_reason?: string | null;
  stage_run_request: {
    request_status: string;
    stage_run_created: boolean;
    provider_attempt_requested: boolean;
    provider_running: boolean;
  };
  authority_boundary: {
    can_claim_provider_running: boolean;
    can_claim_paper_progress: boolean;
  };
};

export type PaperMissionRedriveReadback = {
  family_runtime_redrive: Record<string, unknown> & {
    task: Record<string, unknown>;
    redriven_stage_attempt: Record<string, any>;
    provider_redrive_started: boolean | null;
    provider_redrive_followthrough: Record<string, unknown>;
    redrive_protocol: Record<string, any>;
    authority_boundary: Record<string, any>;
  };
};

export function familyRuntimeEnv(stateRoot: string, extra: Record<string, string> = {}) {
  const codexHome = extra.CODEX_HOME ?? path.join(stateRoot, 'codex-home');
  if (!extra.CODEX_HOME) {
    writeCodexDefaultConfig(codexHome);
  }
  return {
    OPL_STATE_DIR: stateRoot,
    CODEX_HOME: codexHome,
    ...extra,
  };
}

export function writeDispatchTrap(scriptPath: string, proofPath: string) {
  fs.writeFileSync(
    scriptPath,
    [
      '#!/usr/bin/env bash',
      'set -euo pipefail',
      `touch ${shellSingleQuote(proofPath)}`,
      'echo \'{"accepted":true,"surface_kind":"unexpected_mas_domain_handler_dispatch"}\'',
      '',
    ].join('\n'),
    { mode: 0o755 },
  );
}

export function paperMissionRoutePayload(overrides: Record<string, unknown> = {}) {
  return {
    surface_kind: 'opl_mas_paper_mission_route_runtime_request',
    schema_version: 1,
    runtime_request_status: 'queued_request',
    runtime_request_kind: 'mas_paper_mission_stage_route',
    study_id: '002-dm-china-us-mortality-attribution',
    mission_id: 'paper-mission::002-dm-china-us-mortality-attribution::gate-clearing::auto',
    candidate_ref: 'ops/medautoscience/paper_mission_candidate_package/dm002/candidate.json',
    paper_mission_transaction_ref: 'paper-mission-transaction:dm002:1',
    opl_route_command_ref: 'paper-mission-transaction:dm002:1#opl_route_command',
    command_kind: 'start_next_stage',
    route_target: 'publication_gate_replay',
    route_identity_key: 'paper-mission-transaction:dm002:1::route',
    attempt_idempotency_key: 'dm002:gate-clearing:accepted-candidate::opl-attempt',
    request_idempotency_key: 'dm002:gate-clearing:accepted-candidate::opl-request',
    stage_run_request: {
      request_status: 'requested',
      requested_by: 'mas_paper_mission_route_handoff',
      route_identity_key: 'paper-mission-transaction:dm002:1::route',
      attempt_idempotency_key: 'dm002:gate-clearing:accepted-candidate::opl-attempt',
      stage_run_created: false,
      provider_attempt_requested: false,
    },
    authority_boundary: {
      domain_truth_owner: 'med-autoscience',
      runtime_owner: 'one-person-lab',
      writes_owner_receipt: false,
      writes_typed_blocker: false,
      writes_human_gate: false,
      writes_current_package: false,
      writes_paper_body: false,
      can_claim_provider_running: false,
      can_claim_paper_progress: false,
      can_claim_runtime_ready: false,
    },
    ...overrides,
  };
}

export function paperMissionRoutePayloadWithCarrierIdentityOnly(overrides: Record<string, unknown> = {}) {
  const routeIdentityKey = 'paper-mission-transaction:dm002:1::route';
  const attemptIdempotencyKey = 'dm002:gate-clearing:accepted-candidate::opl-attempt';
  const requestIdempotencyKey = 'dm002:gate-clearing:accepted-candidate::opl-request';
  const payload = paperMissionRoutePayload({
    route_identity_key: undefined,
    attempt_idempotency_key: undefined,
    request_idempotency_key: undefined,
    stage_run_request: {
      request_status: 'requested',
      requested_by: 'mas_paper_mission_route_handoff',
      stage_run_created: false,
      provider_attempt_requested: false,
    },
    opl_route_handoff_record: {
      opl_runtime_carrier: {
        command_kind: 'start_next_stage',
        route_target: 'publication_gate_replay',
        route_identity_key: routeIdentityKey,
        attempt_idempotency_key: attemptIdempotencyKey,
        request_idempotency_key: requestIdempotencyKey,
      },
    },
    ...overrides,
  });
  return payload;
}

export function paperMissionRoutePayloadWithWorkspace(overrides: Record<string, unknown> = {}) {
  return paperMissionRoutePayload({
    workspace_root: '/tmp/mas-dm-cvd-workspace',
    command_cwd: '/tmp/mas-dm-cvd-workspace',
    opl_domain_export_context: {
      command_source: 'workspace_binding',
      command_cwd: '/tmp/mas-dm-cvd-workspace',
    },
    ...overrides,
  });
}

export function writeCodexDefaultConfig(codexHome: string) {
  fs.mkdirSync(codexHome, { recursive: true });
  fs.writeFileSync(
    path.join(codexHome, 'config.toml'),
    [
      'model_provider = "openai"',
      'model = "gpt-5.5"',
      'model_reasoning_effort = "high"',
      '',
      '[model_providers.openai]',
      'name = "openai"',
      'base_url = "https://api.openai.com/v1"',
      '',
    ].join('\n'),
  );
}

function setEnvValue(key: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
    return;
  }
  process.env[key] = value;
}

export function installDirectDispatchEnv(stateRoot: string, extra: Record<string, string> = {}) {
  const snapshotKeys = new Set(['OPL_STATE_DIR', 'CODEX_HOME', ...Object.keys(extra)]);
  const snapshot = new Map([...snapshotKeys].map((key) => [key, process.env[key]] as const));
  const codexHome = extra.CODEX_HOME ?? path.join(stateRoot, 'codex-home');
  if (!extra.CODEX_HOME) {
    writeCodexDefaultConfig(codexHome);
  }
  process.env.OPL_STATE_DIR = stateRoot;
  process.env.CODEX_HOME = codexHome;
  for (const [key, value] of Object.entries(extra)) {
    process.env[key] = value;
  }
  return () => {
    for (const [key, value] of snapshot) {
      setEnvValue(key, value);
    }
  };
}

export async function redriveWithInjectedTemporalProvider(
  taskId: string,
  input: {
    reason: string;
    source: string;
    firstExecutionRunId: string;
  },
): Promise<PaperMissionRedriveReadback> {
  const { db, paths } = openQueueDb();
  try {
    const redrive = redriveFamilyRuntimeTask(db, {
      taskId,
      reason: input.reason,
      source: input.source,
    });
    const providerFollowthrough = await paperMissionRedriveProviderFollowthrough(db, paths, taskId, redrive, {
      temporalProviderModule: async () => ({
        startTemporalStageAttemptWorkflow: async (attempt) => ({
          surface_kind: 'temporal_stage_attempt_start_receipt',
          provider_kind: 'temporal',
          stage_attempt_id: attempt.stage_attempt_id,
          workflow_id: attempt.workflow_id,
          first_execution_run_id: input.firstExecutionRunId,
        }),
      }),
    });
    const refreshedTaskRow = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(taskId) as
      | FamilyRuntimeTaskRow
      | undefined;
    const redriveRecord = redrive as Record<string, unknown>;
    const stageAttempt = redriveRecord.redriven_stage_attempt as { stage_attempt_id?: unknown } | null | undefined;
    const stageAttemptId = typeof stageAttempt?.stage_attempt_id === 'string'
      ? stageAttempt.stage_attempt_id
      : null;
    const refreshedStageAttempt = stageAttemptId
      ? inspectTask(db, taskId).stage_attempts.find((attempt) => attempt.stage_attempt_id === stageAttemptId)
      : null;
    const providerRedriveStarted = providerFollowthrough.status === 'not_applicable'
      ? Boolean(redriveRecord.provider_redrive_started)
      : providerFollowthrough.provider_started;
    const familyRuntimeRedrive = {
      surface_id: 'opl_family_runtime_redrive',
      ...redrive,
      task: (refreshedTaskRow ? taskToPayload(refreshedTaskRow) : redriveRecord.task) as Record<string, unknown>,
      redriven_stage_attempt: (refreshedStageAttempt ?? redriveRecord.redriven_stage_attempt) as Record<string, any>,
      provider_redrive_started: providerRedriveStarted,
      provider_redrive_followthrough: providerFollowthrough as Record<string, unknown>,
    } as PaperMissionRedriveReadback['family_runtime_redrive'];
    return {
      family_runtime_redrive: familyRuntimeRedrive,
    };
  } finally {
    db.close();
  }
}

export { assert, fs, os, path, runCli, shellSingleQuote, test };
export { FrameworkContractError };
export {
  buildTemporalStageAttemptWorkflowInput,
  requireTemporalStageAttemptWorkflowInputLaunchable,
  enqueueTask,
  dispatchFamilyRuntimeTask,
  inspectTask,
  openQueueDb,
  syncStageAttemptFromTemporalTerminalObservation,
};
export type { FamilyRuntimeTaskRow };
