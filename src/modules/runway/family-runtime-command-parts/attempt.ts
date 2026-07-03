import { FrameworkContractError } from '../../../kernel/contract-validation.ts';
import type {
  FamilyRuntimeDomainId,
  FamilyRuntimeProviderKind,
  TemporalStageAttemptSignalKind,
} from '../family-runtime-types.ts';
import type { FamilyRuntimeCommandInput } from '../family-runtime-command.ts';
import { assertDomainId, assertProviderKind, assertSignalKind, parsePayloadArg } from './shared.ts';

export function parseAttemptArgs(rest: string[]): FamilyRuntimeCommandInput | undefined {
  if (rest[0] === 'list') {
    return parseAttemptListArgs(rest);
  }
  if (rest[0] === 'inspect') {
    const stageAttemptId = rest[1];
    if (!stageAttemptId || rest.length > 2) {
      throw new FrameworkContractError('cli_usage_error', 'family-runtime attempt inspect requires one attempt id.', {
        usage: 'opl family-runtime attempt inspect <stage_attempt_id>',
      });
    }
    return { mode: 'attempt_inspect', stageAttemptId };
  }
  if (rest[0] === 'start') {
    const stageAttemptId = rest[1];
    if (!stageAttemptId || rest.length > 2) {
      throw new FrameworkContractError('cli_usage_error', 'family-runtime attempt start requires one attempt id.', {
        usage: 'opl family-runtime attempt start <stage_attempt_id>',
      });
    }
    return { mode: 'attempt_start', stageAttemptId };
  }
  if (rest[0] === 'query') {
    const stageAttemptId = rest[1];
    if (!stageAttemptId || rest.length > 2) {
      throw new FrameworkContractError('cli_usage_error', 'family-runtime attempt query requires one attempt id.', {
        usage: 'opl family-runtime attempt query <stage_attempt_id>',
      });
    }
    return { mode: 'attempt_query', stageAttemptId };
  }
  if (rest[0] === 'cancel') {
    return parseAttemptCancelArgs(rest);
  }
  if (rest[0] === 'signal') {
    return parseAttemptSignalArgs(rest);
  }
  if (rest[0] === 'fixture-run') {
    return parseAttemptFixtureRunArgs(rest);
  }
  if (rest[0] === 'create') {
    return parseAttemptCreateArgs(rest);
  }
  return undefined;
}

function parseAttemptListArgs(rest: string[]): FamilyRuntimeCommandInput {
  let domainId: FamilyRuntimeDomainId | undefined;
  let status: string | undefined;
  let studyId: string | undefined;
  let sinceHours: number | undefined;
  let compactTimeline = false;
  let full = false;
  for (let index = 1; index < rest.length; index += 1) {
    const token = rest[index];
    const value = rest[index + 1];
    if (token === '--domain' && value) {
      domainId = assertDomainId(value);
      index += 1;
    } else if (token === '--status' && value) {
      status = value.trim();
      index += 1;
    } else if (token === '--study' && value) {
      studyId = value.trim();
      index += 1;
    } else if (token === '--since-hours' && value) {
      const parsed = Number(value);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new FrameworkContractError('cli_usage_error', 'family-runtime attempt list --since-hours must be a positive number.', {
          option: '--since-hours',
          value,
        });
      }
      sinceHours = parsed;
      index += 1;
    } else if (token === '--compact-timeline') {
      compactTimeline = true;
    } else if (token === '--full') {
      full = true;
    } else {
      throw new FrameworkContractError('cli_usage_error', `Unknown family-runtime attempt list option: ${token}.`, {
        option: token,
        usage: 'opl family-runtime attempt list [--domain <domain>] [--status <status>] [--study <study_id>] [--since-hours <hours>] [--compact-timeline] [--full]',
      });
    }
  }
  if (compactTimeline && full) {
    throw new FrameworkContractError('cli_usage_error', 'family-runtime attempt list cannot combine --compact-timeline and --full.', {
      options: ['--compact-timeline', '--full'],
    });
  }
  return {
    mode: 'attempt_list',
    filters: {
      domainId,
      status,
      studyId,
      sinceHours,
      compactTimeline,
      full,
    },
  };
}

function parseAttemptCancelArgs(rest: string[]): FamilyRuntimeCommandInput {
  const stageAttemptId = rest[1];
  if (!stageAttemptId) {
    throw new FrameworkContractError('cli_usage_error', 'family-runtime attempt cancel requires one attempt id.', {
      usage: 'opl family-runtime attempt cancel <stage_attempt_id> --reason <operator_reason> [--source <source>]',
    });
  }
  let reason = '';
  let source: string | undefined;
  for (let index = 2; index < rest.length; index += 1) {
    const token = rest[index];
    const value = rest[index + 1];
    if (token === '--reason' && value) {
      reason = value;
      index += 1;
    } else if (token === '--source' && value) {
      source = value;
      index += 1;
    } else {
      throw new FrameworkContractError('cli_usage_error', `Unknown family-runtime attempt cancel option: ${token}.`, {
        option: token,
      });
    }
  }
  if (!reason.trim()) {
    throw new FrameworkContractError('cli_usage_error', 'family-runtime attempt cancel requires --reason.', {
      usage: 'opl family-runtime attempt cancel <stage_attempt_id> --reason <operator_reason> [--source <source>]',
    });
  }
  return {
    mode: 'attempt_cancel',
    stageAttemptId,
    reason,
    source,
  };
}

function parseAttemptSignalArgs(rest: string[]): FamilyRuntimeCommandInput {
  const stageAttemptId = rest[1];
  if (!stageAttemptId) {
    throw new FrameworkContractError('cli_usage_error', 'family-runtime attempt signal requires one attempt id.', {
      usage: 'opl family-runtime attempt signal <stage_attempt_id> --kind human_gate|owner_receipt|user_instruction|resume --payload <json>',
    });
  }
  let signalKind: TemporalStageAttemptSignalKind | undefined;
  let payload: string | undefined;
  let payloadFile: string | undefined;
  let source: string | undefined;
  for (let index = 2; index < rest.length; index += 1) {
    const token = rest[index];
    const value = rest[index + 1];
    if (token === '--kind' && value) {
      signalKind = assertSignalKind(value);
      index += 1;
    } else if (token === '--payload' && value) {
      payload = value;
      index += 1;
    } else if (token === '--payload-file' && value) {
      payloadFile = value;
      index += 1;
    } else if (token === '--source' && value) {
      source = value;
      index += 1;
    } else {
      throw new FrameworkContractError('cli_usage_error', `Unknown family-runtime attempt signal option: ${token}.`, {
        option: token,
      });
    }
  }
  if (!signalKind) {
    throw new FrameworkContractError('cli_usage_error', 'family-runtime attempt signal requires --kind.', {
      required: ['--kind'],
    });
  }
  return {
    mode: 'attempt_signal',
    stageAttemptId,
    signalKind,
    payload: parsePayloadArg(payload, payloadFile),
    source,
  };
}

function parseAttemptFixtureRunArgs(rest: string[]): FamilyRuntimeCommandInput {
  const stageAttemptId = rest[1];
  if (!stageAttemptId) {
    throw new FrameworkContractError('cli_usage_error', 'family-runtime attempt fixture-run requires one attempt id.', {
      usage: 'opl family-runtime attempt fixture-run <stage_attempt_id> [--closeout-packet <json>]',
    });
  }
  let stagePacketRef: string | undefined;
  let closeoutPacket: string | undefined;
  let closeoutPacketFile: string | undefined;
  const checkpointRefs: string[] = [];
  for (let index = 2; index < rest.length; index += 1) {
    const token = rest[index];
    const value = rest[index + 1];
    if (token === '--stage-packet-ref' && value) {
      stagePacketRef = value;
      index += 1;
    } else if (token === '--checkpoint-ref' && value) {
      checkpointRefs.push(value);
      index += 1;
    } else if (token === '--closeout-packet' && value) {
      closeoutPacket = value;
      index += 1;
    } else if (token === '--closeout-packet-file' && value) {
      closeoutPacketFile = value;
      index += 1;
    } else {
      throw new FrameworkContractError('cli_usage_error', `Unknown family-runtime attempt fixture-run option: ${token}.`, {
        option: token,
      });
    }
  }
  return {
    mode: 'attempt_fixture_run',
    stageAttemptId,
    stagePacketRef,
    checkpointRefs,
    closeoutPacket:
      closeoutPacket || closeoutPacketFile
        ? parsePayloadArg(closeoutPacket, closeoutPacketFile)
        : undefined,
  };
}

function parseAttemptCreateArgs(rest: string[]): FamilyRuntimeCommandInput {
  let domainId: FamilyRuntimeDomainId | undefined;
  let stageId = '';
  let providerKind: FamilyRuntimeProviderKind | undefined;
  let workspaceLocator: string | undefined;
  let workspaceLocatorFile: string | undefined;
  let retryBudget: string | undefined;
  let retryBudgetFile: string | undefined;
  let sourceFingerprint: string | undefined;
  let executorKind: string | undefined;
  let executorBindingRef: string | undefined;
  let invocationMode: 'invocation' | 'authoring' | undefined;
  let boundedEditRef: string | undefined;
  let taskId: string | undefined;
  let blockedReason: string | undefined;
  let requireStageAdmission = false;
  let newAttempt = false;
  let start = false;
  const checkpointRefs: string[] = [];
  const closeoutRefs: string[] = [];
  const humanGateRefs: string[] = [];
  for (let index = 1; index < rest.length; index += 1) {
    const token = rest[index];
    const value = rest[index + 1];
    if (token === '--new-attempt') {
      newAttempt = true;
    } else if (token === '--start') {
      start = true;
    } else if (token === '--require-stage-admission') {
      requireStageAdmission = true;
    } else if (token === '--domain' && value) {
      domainId = assertDomainId(value);
      index += 1;
    } else if (token === '--stage' && value) {
      stageId = value;
      index += 1;
    } else if (token === '--provider' && value) {
      providerKind = assertProviderKind(value);
      index += 1;
    } else if (token === '--workspace-locator' && value) {
      workspaceLocator = value;
      index += 1;
    } else if (token === '--workspace-locator-file' && value) {
      workspaceLocatorFile = value;
      index += 1;
    } else if (token === '--retry-budget' && value) {
      retryBudget = value;
      index += 1;
    } else if (token === '--retry-budget-file' && value) {
      retryBudgetFile = value;
      index += 1;
    } else if (token === '--source-fingerprint' && value) {
      sourceFingerprint = value;
      index += 1;
    } else if (token === '--executor-kind' && value) {
      executorKind = value;
      index += 1;
    } else if (token === '--executor-binding-ref' && value) {
      executorBindingRef = value;
      index += 1;
    } else if (token === '--invocation-mode' && value) {
      if (value !== 'invocation' && value !== 'authoring') {
        throw new FrameworkContractError('cli_usage_error', `Unsupported family-runtime attempt invocation mode: ${value}.`, {
          allowed_modes: ['invocation', 'authoring'],
        });
      }
      invocationMode = value;
      index += 1;
    } else if (token === '--bounded-edit-ref' && value) {
      boundedEditRef = value;
      index += 1;
    } else if (token === '--task' && value) {
      taskId = value;
      index += 1;
    } else if (token === '--checkpoint-ref' && value) {
      checkpointRefs.push(value);
      index += 1;
    } else if (token === '--closeout-ref' && value) {
      closeoutRefs.push(value);
      index += 1;
    } else if (token === '--human-gate-ref' && value) {
      humanGateRefs.push(value);
      index += 1;
    } else if (token === '--blocked-reason' && value) {
      blockedReason = value;
      index += 1;
    } else {
      throw new FrameworkContractError('cli_usage_error', `Unknown family-runtime attempt create option: ${token}.`, {
        option: token,
      });
    }
  }
  if (!domainId || !stageId) {
    throw new FrameworkContractError(
      'cli_usage_error',
      'family-runtime attempt create requires --domain and --stage.',
      { required: ['--domain', '--stage'] },
    );
  }
  if (!workspaceLocator && !workspaceLocatorFile) {
    throw new FrameworkContractError(
      'cli_usage_error',
      'family-runtime attempt create requires --workspace-locator or --workspace-locator-file.',
      { required: ['--workspace-locator', '--workspace-locator-file'] },
    );
  }
  return {
    mode: 'attempt_create',
    input: {
      domainId,
      stageId,
      providerKind,
      workspaceLocator: parsePayloadArg(workspaceLocator, workspaceLocatorFile),
      sourceFingerprint,
      executorKind,
      executorBindingRef,
      invocationMode,
      boundedEditRef,
      taskId,
      retryBudget: retryBudget || retryBudgetFile ? parsePayloadArg(retryBudget, retryBudgetFile) : undefined,
      checkpointRefs,
      closeoutRefs,
      humanGateRefs,
      blockedReason,
      requireStageAdmission,
      newAttempt,
      start,
    },
  };
}
