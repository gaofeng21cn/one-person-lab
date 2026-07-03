import * as fs from 'fs';
import * as path from 'path';
import { spawn, spawnSync } from 'node:child_process';

import { isRecord } from '../../kernel/contract-validation.ts';
import { parseJsonText } from '../../kernel/json-file.ts';
import type {
  JsonRecord,
  MasWorkspaceProjectionRef,
  RuntimeTraySourceRef,
} from './runtime-tray-snapshot-types.ts';
import {
  fileSourceRef,
  firstString,
  nestedRecord,
  optionalString,
  stringList,
  uniqueByRef,
  uniqueStrings,
} from './runtime-tray-snapshot-utils.ts';

const DEFAULT_STUDY_PROGRESS_TIMEOUT_MS = 15_000;

export type MasStudyProgressCurrentWorkUnitReadout = {
  projection: JsonRecord | null;
  source_refs: RuntimeTraySourceRef[];
  diagnostic: JsonRecord;
};

function numberFromEnv(value: unknown, fallback: number) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function refValue(ref: string | RuntimeTraySourceRef | null | undefined) {
  if (!ref) {
    return null;
  }
  if (typeof ref === 'string') {
    return optionalString(ref);
  }
  return optionalString(ref.ref);
}

function authorityBoundary() {
  return {
    mas_truth_owner: true,
    opl_role: 'projection_consumer_only',
    can_execute_domain_action: false,
    can_write_domain_truth: false,
    can_create_owner_receipt: false,
    can_create_typed_blocker: false,
    can_close_owner_chain: false,
    can_close_domain_ready: false,
    can_authorize_quality_or_export: false,
    can_claim_domain_ready: false,
    can_claim_production_ready: false,
    provider_completion_is_domain_ready: false,
  };
}

export function normalizeMasCurrentWorkUnitProjection(input: {
  currentWorkUnit: unknown;
  studyId: string;
  sourceRefs?: Array<string | RuntimeTraySourceRef>;
  sourceProjectionRef: string;
  progressPayload?: JsonRecord | null;
  currentExecutionEnvelope?: unknown;
  currentExecutableOwnerAction?: unknown;
}) {
  const currentWorkUnit = isRecord(input.currentWorkUnit) ? input.currentWorkUnit : null;
  if (!currentWorkUnit) {
    return null;
  }
  const currentnessBasis = nestedRecord(currentWorkUnit, 'currentness_basis')
    ?? nestedRecord(currentWorkUnit, 'owner_route_currentness_basis')
    ?? {};
  const progressPayload = input.progressPayload ?? {};
  const sourceRefs = uniqueStrings([
    ...stringList(currentWorkUnit.source_refs, 24),
    ...stringList(currentWorkUnit.input_refs, 24),
    ...stringList(currentWorkUnit.acceptance_refs, 24),
    ...stringList(nestedRecord(progressPayload, 'current_execution_envelope')?.source_refs, 24),
    ...stringList(nestedRecord(progressPayload, 'current_executable_owner_action')?.acceptance_refs, 24),
    ...(input.sourceRefs ?? []).map(refValue).filter((ref): ref is string => Boolean(ref)),
  ]);
  const workUnitId = firstString(
    currentWorkUnit.work_unit_id,
    currentWorkUnit.next_work_unit,
    nestedRecord(input.currentExecutionEnvelope as JsonRecord, 'state')?.next_work_unit,
  );
  const workUnitFingerprint = firstString(
    currentWorkUnit.work_unit_fingerprint,
    currentWorkUnit.action_fingerprint,
    currentnessBasis.work_unit_fingerprint,
  );
  const currentOwner = firstString(currentWorkUnit.current_owner, currentWorkUnit.owner);
  const status = firstString(currentWorkUnit.status, currentWorkUnit.current_status);
  if (!status && !workUnitId && !workUnitFingerprint && !currentOwner) {
    return null;
  }

  return {
    surface_kind: 'mas_current_work_unit_projection',
    projection_policy: 'refs_only_domain_currentness_projection_no_domain_truth_write',
    domain_id: 'medautoscience',
    study_id: input.studyId,
    status,
    current_owner: currentOwner,
    owner: firstString(currentWorkUnit.owner, currentWorkUnit.current_owner),
    stage_id: firstString(currentWorkUnit.stage_id, currentWorkUnit.stage_ref),
    action_type: firstString(currentWorkUnit.action_type, currentWorkUnit.owner_action_type),
    work_unit_id: workUnitId,
    work_unit_fingerprint: workUnitFingerprint,
    currentness_basis: {
      ...currentnessBasis,
      truth_epoch:
        firstString(currentnessBasis.truth_epoch, progressPayload.truth_epoch) ?? null,
      runtime_health_epoch:
        firstString(currentnessBasis.runtime_health_epoch, progressPayload.runtime_health_epoch) ?? null,
    },
    current_execution_envelope: isRecord(input.currentExecutionEnvelope)
      ? input.currentExecutionEnvelope
      : null,
    current_executable_owner_action: isRecord(input.currentExecutableOwnerAction)
      ? input.currentExecutableOwnerAction
      : null,
    source_refs: sourceRefs,
    source_projection_ref: input.sourceProjectionRef,
    authority_boundary: authorityBoundary(),
  };
}

function probeTimeoutMs() {
  return numberFromEnv(
    process.env.OPL_MAS_STUDY_PROGRESS_PROBE_TIMEOUT_MS,
    DEFAULT_STUDY_PROGRESS_TIMEOUT_MS,
  );
}

function studyProgressScriptPath(workspace: MasWorkspaceProjectionRef) {
  return path.join(
    workspace.workspace_root,
    'ops',
    'medautoscience',
    'bin',
    'study-progress',
  );
}

function studyProgressSourceRefs(scriptPath: string) {
  return uniqueByRef([
    fileSourceRef(scriptPath, 'mas_study_progress_probe', 'MAS study-progress wrapper'),
  ]);
}

function unavailableReadout(
  scriptPath: string,
  sourceRefs: RuntimeTraySourceRef[],
): MasStudyProgressCurrentWorkUnitReadout {
  return {
    projection: null,
    source_refs: sourceRefs,
    diagnostic: {
      status: 'unavailable',
      reason: 'study_progress_wrapper_missing',
      script_path: scriptPath,
    },
  };
}

function failedReadout(input: {
  sourceRefs: RuntimeTraySourceRef[];
  status: string;
  reason: string;
  exitStatus?: number | null;
  signal?: string | null;
  timeoutMs?: number;
  stderr?: string;
  stdout?: string;
}): MasStudyProgressCurrentWorkUnitReadout {
  return {
    projection: null,
    source_refs: input.sourceRefs,
    diagnostic: {
      status: input.status,
      reason: input.reason,
      exit_status: input.exitStatus,
      signal: input.signal,
      timeout_ms: input.timeoutMs,
      stderr_excerpt: input.stderr?.slice(0, 500),
      stdout_excerpt: input.stdout?.slice(0, 500),
    },
  };
}

function parseStudyProgressPayload(
  stdout: string,
  sourceRefs: RuntimeTraySourceRef[],
): { payload: JsonRecord } | MasStudyProgressCurrentWorkUnitReadout {
  try {
    const parsed = parseJsonText(stdout);
    if (!isRecord(parsed)) {
      throw new Error('study_progress_stdout_not_object');
    }
    return { payload: parsed };
  } catch (error) {
    return failedReadout({
      sourceRefs,
      status: 'failed',
      reason: error instanceof Error ? error.message : 'invalid_json',
      stdout,
    });
  }
}

function freshReadoutFromPayload(input: {
  payload: JsonRecord;
  studyId: string;
  sourceRefs: RuntimeTraySourceRef[];
  timeout: number;
}): MasStudyProgressCurrentWorkUnitReadout {
  return {
    projection: normalizeMasCurrentWorkUnitProjection({
      currentWorkUnit: input.payload.current_work_unit,
      studyId: input.studyId,
      sourceRefs: input.sourceRefs,
      sourceProjectionRef: 'mas_study_progress/current_work_unit',
      progressPayload: input.payload,
      currentExecutionEnvelope: input.payload.current_execution_envelope,
      currentExecutableOwnerAction: input.payload.current_executable_owner_action,
    }),
    source_refs: input.sourceRefs,
    diagnostic: {
      status: 'fresh',
      generated_at: firstString(input.payload.generated_at),
      truth_epoch: firstString(input.payload.truth_epoch),
      runtime_health_epoch: firstString(input.payload.runtime_health_epoch),
      timeout_ms: input.timeout,
    },
  };
}

export function readMasStudyProgressCurrentWorkUnit(input: {
  workspace: MasWorkspaceProjectionRef;
  studyId: string;
}): MasStudyProgressCurrentWorkUnitReadout {
  const scriptPath = studyProgressScriptPath(input.workspace);
  const sourceRefs = studyProgressSourceRefs(scriptPath);
  if (!fs.existsSync(scriptPath)) {
    return unavailableReadout(scriptPath, sourceRefs);
  }

  const timeout = probeTimeoutMs();
  const result = spawnSync(
    scriptPath,
    [input.studyId, '--format', 'json'],
    {
      cwd: input.workspace.workspace_root,
      encoding: 'utf8',
      timeout,
      env: {
        ...process.env,
        PYTHONDONTWRITEBYTECODE: '1',
      },
    },
  );
  if (result.error || result.status !== 0) {
    return failedReadout({
      sourceRefs,
      status: result.error?.message === 'spawnSync ETIMEDOUT' ? 'timeout' : 'failed',
      reason: result.error?.message ?? 'study_progress_failed',
      exitStatus: result.status,
      signal: result.signal,
      timeoutMs: timeout,
      stderr: result.stderr,
    });
  }

  const parsed = parseStudyProgressPayload(result.stdout, sourceRefs);
  if ('projection' in parsed) {
    return parsed;
  }

  return freshReadoutFromPayload({
    payload: parsed.payload,
    studyId: input.studyId,
    sourceRefs,
    timeout,
  });
}

export function readMasStudyProgressCurrentWorkUnitAsync(input: {
  workspace: MasWorkspaceProjectionRef;
  studyId: string;
}): Promise<MasStudyProgressCurrentWorkUnitReadout> {
  const scriptPath = studyProgressScriptPath(input.workspace);
  const sourceRefs = studyProgressSourceRefs(scriptPath);
  if (!fs.existsSync(scriptPath)) {
    return Promise.resolve(unavailableReadout(scriptPath, sourceRefs));
  }

  const timeout = probeTimeoutMs();
  return new Promise((resolve) => {
    const child = spawn(
      scriptPath,
      [input.studyId, '--format', 'json'],
      {
        cwd: input.workspace.workspace_root,
        env: {
          ...process.env,
          PYTHONDONTWRITEBYTECODE: '1',
        },
      },
    );
    let stdout = '';
    let stderr = '';
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const finish = (readout: MasStudyProgressCurrentWorkUnitReadout) => {
      if (settled) {
        return;
      }
      settled = true;
      if (timer) {
        clearTimeout(timer);
      }
      resolve(readout);
    };
    timer = setTimeout(() => {
      child.kill('SIGTERM');
      finish(failedReadout({
        sourceRefs,
        status: 'timeout',
        reason: 'study_progress_timeout',
        signal: 'SIGTERM',
        timeoutMs: timeout,
        stderr,
        stdout,
      }));
    }, timeout);

    child.stdout?.setEncoding('utf8');
    child.stderr?.setEncoding('utf8');
    child.stdout?.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr?.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', (error) => {
      finish(failedReadout({
        sourceRefs,
        status: 'failed',
        reason: error.message,
        timeoutMs: timeout,
        stderr,
        stdout,
      }));
    });
    child.on('close', (code, signal) => {
      if (code !== 0) {
        finish(failedReadout({
          sourceRefs,
          status: 'failed',
          reason: 'study_progress_failed',
          exitStatus: code,
          signal,
          timeoutMs: timeout,
          stderr,
          stdout,
        }));
        return;
      }
      const parsed = parseStudyProgressPayload(stdout, sourceRefs);
      if ('projection' in parsed) {
        finish(parsed);
        return;
      }
      finish(freshReadoutFromPayload({
        payload: parsed.payload,
        studyId: input.studyId,
        sourceRefs,
        timeout,
      }));
    });
  });
}
