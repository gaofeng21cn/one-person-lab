import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { resolveOplModuleExecCommand } from '../system-installation/modules.ts';

type JsonRecord = Record<string, unknown>;

export type MasOwnerDispatchBridgeResult = {
  status:
    | 'not_mas_default_executor_dispatch'
    | 'authorization_missing'
    | 'stage_packet_not_found'
    | 'stage_packet_identity_missing'
    | 'profile_missing'
    | 'command_unavailable'
    | 'command_completed'
    | 'command_failed';
  command_source?: 'workspace_binding' | 'module_exec_profile';
  command_preview?: string[];
  command_cwd?: string;
  profile_ref?: string;
  study_id?: string;
  action_type?: string;
  exit_code?: number;
  stdout_bytes?: number;
  stderr_bytes?: number;
  stderr_tail?: string[];
  error?: string;
};

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    const candidate = optionalString(value);
    if (candidate) {
      return candidate;
    }
  }
  return null;
}

function readJsonRecordFile(filePath: string): JsonRecord | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown;
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function envValue(env: Record<string, string | undefined>, key: string) {
  return optionalString(env[key]) ?? optionalString(process.env[key]);
}

function stageIdFromAttempt(attempt: JsonRecord) {
  return optionalString(attempt.stage_id) ?? 'stage';
}

function workspaceLocatorFromAttempt(attempt: JsonRecord) {
  return isRecord(attempt.workspace_locator) ? attempt.workspace_locator : {};
}

function stagePacketExportContext(stagePacket: JsonRecord) {
  return isRecord(stagePacket.opl_domain_export_context) ? stagePacket.opl_domain_export_context : {};
}

function stagePacketPayload(stagePacket: JsonRecord) {
  return isRecord(stagePacket.payload) ? stagePacket.payload : {};
}

function domainIdFrom(input: { attempt: JsonRecord; stagePacket: JsonRecord }) {
  const locator = workspaceLocatorFromAttempt(input.attempt);
  const raw = firstString(
    input.attempt.domain_id,
    input.stagePacket.domain_id,
    input.stagePacket.project_id,
    locator.domain_id,
    locator.project_id,
  );
  const normalized = raw?.toLowerCase().replace(/[-_]/g, '');
  return normalized === 'mas' || normalized === 'medautoscience' ? 'medautoscience' : raw;
}

function hasCurrentOplAuthorization(env: Record<string, string | undefined>) {
  const required = [
    'OPL_STAGE_ATTEMPT_ID',
    'OPL_PROVIDER_ATTEMPT_REF',
    'OPL_ATTEMPT_LEASE_REF',
    'OPL_EXECUTION_AUTHORIZATION_DECISION_REF',
    'OPL_SOURCE_FINGERPRINT',
    'OPL_IDEMPOTENCY_KEY',
    'OPL_STAGE_RUN_ID',
    'OPL_STAGE_MANIFEST_REF',
    'OPL_CURRENT_POINTER_REF',
  ];
  return required.every((key) => optionalString(env[key]))
    && optionalString(env.OPL_ATTEMPT_LEASE_STATUS) === 'active';
}

function profileRefFrom(input: {
  env: Record<string, string | undefined>;
  attempt: JsonRecord;
  stagePacket: JsonRecord;
}) {
  const locator = workspaceLocatorFromAttempt(input.attempt);
  const exportContext = stagePacketExportContext(input.stagePacket);
  const payload = stagePacketPayload(input.stagePacket);
  return firstString(
    envValue(input.env, 'OPL_MAS_OWNER_DISPATCH_PROFILE'),
    envValue(input.env, 'OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_PROFILE'),
    locator.profile_ref,
    locator.profile_path,
    locator.profile,
    input.stagePacket.profile_ref,
    input.stagePacket.profile_path,
    input.stagePacket.profile,
    exportContext.profile_ref,
    exportContext.profile_path,
    exportContext.profile,
    payload.profile_ref,
    payload.profile_path,
    payload.profile,
  );
}

function commandCwdFrom(input: {
  env: Record<string, string | undefined>;
  attempt: JsonRecord;
  stagePacket: JsonRecord;
}) {
  const locator = workspaceLocatorFromAttempt(input.attempt);
  const exportContext = stagePacketExportContext(input.stagePacket);
  return firstString(
    envValue(input.env, 'OPL_MAS_OWNER_DISPATCH_CWD'),
    envValue(input.env, 'OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_COMMAND_CWD'),
    locator.command_cwd,
    locator.mas_command_cwd,
    locator.medautoscience_command_cwd,
    locator.domain_command_cwd,
    exportContext.command_cwd,
  );
}

function stagePacketIdentity(input: { attempt: JsonRecord; stagePacket: JsonRecord }) {
  const locator = workspaceLocatorFromAttempt(input.attempt);
  const payload = stagePacketPayload(input.stagePacket);
  return {
    studyId: firstString(input.stagePacket.study_id, payload.study_id, locator.study_id),
    actionType: firstString(input.stagePacket.action_type, payload.action_type, locator.action_type),
  };
}

function buildWorkspaceBindingCommand(input: {
  commandCwd: string;
  profileRef: string;
  studyId: string;
  actionType: string;
}) {
  const runnerPath = path.join(input.commandCwd, 'scripts', 'run-python-clean.sh');
  if (!fs.existsSync(runnerPath) || !fs.statSync(runnerPath).isFile()) {
    return null;
  }
  return {
    command: runnerPath,
    args: [
      '-m',
      'med_autoscience.cli',
      'domain-owner-action-dispatch',
      '--profile',
      input.profileRef,
      '--studies',
      input.studyId,
      '--action-types',
      input.actionType,
      '--mode',
      'developer_apply_safe',
      '--apply',
    ],
    cwd: input.commandCwd,
    source: 'workspace_binding' as const,
  };
}

function buildModuleExecCommand(input: {
  profileRef: string;
  studyId: string;
  actionType: string;
}) {
  const command = resolveOplModuleExecCommand('medautoscience', [
    'domain-owner-action-dispatch',
    '--profile',
    input.profileRef,
    '--studies',
    input.studyId,
    '--action-types',
    input.actionType,
    '--mode',
    'developer_apply_safe',
    '--apply',
  ]);
  return {
    command: command.command,
    args: command.args,
    cwd: command.working_directory,
    source: 'module_exec_profile' as const,
  };
}

function normalizeTimeoutMs(value: unknown, fallback: number) {
  const numeric = typeof value === 'number'
    ? value
    : typeof value === 'string'
      ? Number.parseInt(value, 10)
      : Number.NaN;
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
}

export function runMasOwnerDispatchBridge(input: {
  attempt: JsonRecord;
  stagePacketRef: string;
  workspaceRoot: string;
  env: Record<string, string | undefined>;
}): MasOwnerDispatchBridgeResult {
  const stagePacketPath = path.join(input.workspaceRoot, input.stagePacketRef);
  const stagePacket = readJsonRecordFile(stagePacketPath);
  if (!stagePacket) {
    return { status: 'stage_packet_not_found' };
  }
  if (
    stageIdFromAttempt(input.attempt) !== 'domain_owner/default-executor-dispatch'
    || domainIdFrom({ attempt: input.attempt, stagePacket }) !== 'medautoscience'
  ) {
    return { status: 'not_mas_default_executor_dispatch' };
  }
  if (!hasCurrentOplAuthorization(input.env)) {
    return { status: 'authorization_missing' };
  }

  const { studyId, actionType } = stagePacketIdentity({ attempt: input.attempt, stagePacket });
  if (!studyId || !actionType) {
    return { status: 'stage_packet_identity_missing' };
  }
  const profileRef = profileRefFrom({
    env: input.env,
    attempt: input.attempt,
    stagePacket,
  });
  if (!profileRef) {
    return { status: 'profile_missing', study_id: studyId, action_type: actionType };
  }

  let command: ReturnType<typeof buildWorkspaceBindingCommand> | ReturnType<typeof buildModuleExecCommand>;
  const explicitCommandCwd = commandCwdFrom({
    env: input.env,
    attempt: input.attempt,
    stagePacket,
  });
  if (explicitCommandCwd) {
    command = buildWorkspaceBindingCommand({
      commandCwd: explicitCommandCwd,
      profileRef,
      studyId,
      actionType,
    });
    if (!command) {
      return {
        status: 'command_unavailable',
        command_source: 'workspace_binding',
        command_cwd: explicitCommandCwd,
        profile_ref: profileRef,
        study_id: studyId,
        action_type: actionType,
        error: 'workspace_binding_run_python_clean_missing',
      };
    }
  } else {
    try {
      command = buildModuleExecCommand({ profileRef, studyId, actionType });
    } catch (error) {
      return {
        status: 'command_unavailable',
        command_source: 'module_exec_profile',
        profile_ref: profileRef,
        study_id: studyId,
        action_type: actionType,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  const result = spawnSync(command.command, command.args, {
    cwd: command.cwd,
    env: {
      ...process.env,
      ...input.env,
    },
    encoding: 'utf8',
    timeout: normalizeTimeoutMs(process.env.OPL_MAS_OWNER_DISPATCH_TIMEOUT_MS, 120_000),
    maxBuffer: 16 * 1024 * 1024,
  });
  const exitCode = result.status ?? (result.error ? 1 : 0);
  return {
    status: exitCode === 0 ? 'command_completed' : 'command_failed',
    command_source: command.source,
    command_preview: [command.command, ...command.args],
    command_cwd: command.cwd,
    profile_ref: profileRef,
    study_id: studyId,
    action_type: actionType,
    exit_code: exitCode,
    stdout_bytes: Buffer.byteLength(result.stdout ?? '', 'utf8'),
    stderr_bytes: Buffer.byteLength(result.stderr ?? '', 'utf8'),
    stderr_tail: (result.stderr ?? '').split(/\r?\n/).filter(Boolean).slice(-5),
    ...(result.error ? { error: result.error.message } : {}),
  };
}
