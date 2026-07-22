import { FrameworkContractError } from '../../../kernel/contract-validation.ts';
import type {
  FamilyRuntimeDomainId,
  FamilyRuntimeProviderKind,
  TemporalStageAttemptSignalKind,
} from '../family-runtime-types.ts';
import type { FamilyRuntimeCommandInput } from '../family-runtime-command.ts';
import { assertDomainId, assertProviderKind, assertSignalKind, parseCliOptions, parsePayloadArg } from './shared.ts';

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
  if (rest[0] === 'archive' || rest[0] === 'restore') {
    return parseAttemptArchiveArgs(rest);
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

function parseAttemptArchiveArgs(rest: string[]): FamilyRuntimeCommandInput {
  const action = rest[0] as 'archive' | 'restore';
  const stageAttemptId = rest[1];
  if (!stageAttemptId) {
    throw new FrameworkContractError('cli_usage_error', `family-runtime attempt ${action} requires one attempt id.`, {
      usage: `opl family-runtime attempt ${action} <stage_attempt_id> [--reason <operator_reason>] [--source <source>]`,
    });
  }
  let reason = action === 'archive' ? 'operator_archived' : 'operator_restored';
  let source: string | undefined;
  parseCliOptions(rest, 2, (token, value) => {
    if (token === '--reason' && value) {
      reason = value;
      return true;
    }
    if (token === '--source' && value) {
      source = value;
      return true;
    }
    throw new FrameworkContractError('cli_usage_error', `Unknown family-runtime attempt ${action} option: ${token}.`, {
      option: token,
    });
  });
  return {
    mode: action === 'archive' ? 'attempt_archive' : 'attempt_restore',
    stageAttemptId,
    reason,
    source,
  };
}

function parseAttemptListArgs(rest: string[]): FamilyRuntimeCommandInput {
  let domainId: FamilyRuntimeDomainId | undefined;
  let status: string | undefined;
  let studyId: string | undefined;
  let sinceHours: number | undefined;
  let compactTimeline = false;
  let full = false;
  parseCliOptions(rest, 1, (token, value) => {
    if (token === '--domain' && value) {
      domainId = assertDomainId(value);
      return true;
    } else if (token === '--status' && value) {
      status = value.trim();
      return true;
    } else if (token === '--study' && value) {
      studyId = value.trim();
      return true;
    } else if (token === '--since-hours' && value) {
      const parsed = Number(value);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new FrameworkContractError('cli_usage_error', 'family-runtime attempt list --since-hours must be a positive number.', {
          option: '--since-hours',
          value,
        });
      }
      sinceHours = parsed;
      return true;
    } else if (token === '--compact-timeline') {
      compactTimeline = true;
      return false;
    } else if (token === '--full') {
      full = true;
      return false;
    } else {
      throw new FrameworkContractError('cli_usage_error', `Unknown family-runtime attempt list option: ${token}.`, {
        option: token,
        usage: 'opl family-runtime attempt list [--domain <domain>] [--status <status>] [--study <study_id>] [--since-hours <hours>] [--compact-timeline] [--full]',
      });
    }
  });
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
  parseCliOptions(rest, 2, (token, value) => {
    if (token === '--reason' && value) {
      reason = value;
      return true;
    } else if (token === '--source' && value) {
      source = value;
      return true;
    } else {
      throw new FrameworkContractError('cli_usage_error', `Unknown family-runtime attempt cancel option: ${token}.`, {
        option: token,
      });
    }
  });
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
  parseCliOptions(rest, 2, (token, value) => {
    if (token === '--kind' && value) {
      signalKind = assertSignalKind(value);
      return true;
    } else if (token === '--payload' && value) {
      payload = value;
      return true;
    } else if (token === '--payload-file' && value) {
      payloadFile = value;
      return true;
    } else if (token === '--source' && value) {
      source = value;
      return true;
    } else {
      throw new FrameworkContractError('cli_usage_error', `Unknown family-runtime attempt signal option: ${token}.`, {
        option: token,
      });
    }
  });
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
  parseCliOptions(rest, 2, (token, value) => {
    if (token === '--stage-packet-ref' && value) {
      stagePacketRef = value;
      return true;
    } else if (token === '--checkpoint-ref' && value) {
      checkpointRefs.push(value);
      return true;
    } else if (token === '--closeout-packet' && value) {
      closeoutPacket = value;
      return true;
    } else if (token === '--closeout-packet-file' && value) {
      closeoutPacketFile = value;
      return true;
    } else {
      throw new FrameworkContractError('cli_usage_error', `Unknown family-runtime attempt fixture-run option: ${token}.`, {
        option: token,
      });
    }
  });
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
  let actionId: string | undefined;
  let providerKind: FamilyRuntimeProviderKind | undefined;
  let workspaceLocator: string | undefined;
  let workspaceLocatorFile: string | undefined;
  let scopeKind: 'work_item' | 'domain' | 'system' | undefined;
  let executionScope: string | undefined;
  let executionScopeFile: string | undefined;
  let retryBudget: string | undefined;
  let retryBudgetFile: string | undefined;
  let sourceFingerprint: string | undefined;
  let executorKind: string | undefined;
  let executorBindingRef: string | undefined;
  let invocationMode: 'invocation' | 'authoring' | undefined;
  let boundedEditRef: string | undefined;
  let taskId: string | undefined;
  let blockedReason: string | undefined;
  let newAttempt = false;
  let newStageRun = false;
  let stageRunInvocationId: string | undefined;
  let parentRouteDecisionRef: string | undefined;
  let start = false;
  const checkpointRefs: string[] = [];
  const inputArtifactRefs: string[] = [];
  const inputArtifactHashes: string[] = [];
  const closeoutRefs: string[] = [];
  const humanGateRefs: string[] = [];
  parseCliOptions(rest, 1, (token, value) => {
    if (token === '--new-attempt') {
      newAttempt = true;
      return false;
    } else if (token === '--new-stage-run') {
      newStageRun = true;
      return false;
    } else if (token === '--stage-run-invocation-id' && value) {
      stageRunInvocationId = value;
      return true;
    } else if (token === '--parent-route-decision-ref' && value) {
      parentRouteDecisionRef = value;
      return true;
    } else if (token === '--start') {
      start = true;
      return false;
    } else if (token === '--domain' && value) {
      domainId = assertDomainId(value);
      return true;
    } else if (token === '--stage' && value) {
      stageId = value;
      return true;
    } else if (token === '--action' && value) {
      actionId = value;
      return true;
    } else if (token === '--provider' && value) {
      providerKind = assertProviderKind(value);
      return true;
    } else if (token === '--workspace-locator' && value) {
      workspaceLocator = value;
      return true;
    } else if (token === '--workspace-locator-file' && value) {
      workspaceLocatorFile = value;
      return true;
    } else if (token === '--scope-kind' && value) {
      if (value !== 'work_item' && value !== 'domain' && value !== 'system') {
        throw new FrameworkContractError('cli_usage_error', `Unsupported execution scope kind: ${value}.`, {
          allowed_scope_kinds: ['work_item', 'domain', 'system'],
        });
      }
      scopeKind = value;
      return true;
    } else if (token === '--execution-scope' && value) {
      executionScope = value;
      return true;
    } else if (token === '--execution-scope-file' && value) {
      executionScopeFile = value;
      return true;
    } else if (token === '--retry-budget' && value) {
      retryBudget = value;
      return true;
    } else if (token === '--retry-budget-file' && value) {
      retryBudgetFile = value;
      return true;
    } else if (token === '--source-fingerprint' && value) {
      sourceFingerprint = value;
      return true;
    } else if (token === '--executor-kind' && value) {
      executorKind = value;
      return true;
    } else if (token === '--executor-binding-ref' && value) {
      executorBindingRef = value;
      return true;
    } else if (token === '--invocation-mode' && value) {
      if (value !== 'invocation' && value !== 'authoring') {
        throw new FrameworkContractError('cli_usage_error', `Unsupported family-runtime attempt invocation mode: ${value}.`, {
          allowed_modes: ['invocation', 'authoring'],
        });
      }
      invocationMode = value;
      return true;
    } else if (token === '--bounded-edit-ref' && value) {
      boundedEditRef = value;
      return true;
    } else if (token === '--task' && value) {
      taskId = value;
      return true;
    } else if (token === '--checkpoint-ref' && value) {
      checkpointRefs.push(value);
      return true;
    } else if (token === '--input-artifact-ref' && value) {
      inputArtifactRefs.push(value);
      return true;
    } else if (token === '--input-artifact-sha256' && value) {
      inputArtifactHashes.push(value);
      return true;
    } else if (token === '--closeout-ref' && value) {
      closeoutRefs.push(value);
      return true;
    } else if (token === '--human-gate-ref' && value) {
      humanGateRefs.push(value);
      return true;
    } else if (token === '--blocked-reason' && value) {
      blockedReason = value;
      return true;
    } else {
      throw new FrameworkContractError('cli_usage_error', `Unknown family-runtime attempt create option: ${token}.`, {
        option: token,
      });
    }
  });
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
      actionId,
      providerKind,
      workspaceLocator: parsePayloadArg(workspaceLocator, workspaceLocatorFile),
      scopeKind,
      executionScope: executionScope || executionScopeFile
        ? parsePayloadArg(executionScope, executionScopeFile)
        : undefined,
      sourceFingerprint,
      executorKind,
      executorBindingRef,
      invocationMode,
      boundedEditRef,
      taskId,
      retryBudget: retryBudget || retryBudgetFile ? parsePayloadArg(retryBudget, retryBudgetFile) : undefined,
      checkpointRefs,
      inputArtifactRefs,
      inputArtifactHashes,
      closeoutRefs,
      humanGateRefs,
      blockedReason,
      newAttempt,
      newStageRun,
      stageRunInvocationId,
      parentRouteDecisionRef,
      start,
    },
  };
}
