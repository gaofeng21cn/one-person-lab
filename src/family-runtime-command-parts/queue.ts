import { FrameworkContractError } from '../contracts.ts';
import type { FamilyRuntimeDomainId } from '../family-runtime-types.ts';
import type {
  FamilyRuntimeCommandInput,
  FamilyRuntimeDomainProfiles,
  FamilyRuntimeTaskScope,
} from '../family-runtime-command.ts';
import { assertDomainId, parsePayloadArg } from './shared.ts';

export function parseTaskScopeOption(
  scope: FamilyRuntimeTaskScope,
  token: string,
  value: string | undefined,
) {
  if (token === '--domain' && value) {
    scope.domainId = assertDomainId(value);
    return true;
  }
  if ((token === '--study' || token === '--study-id') && value) {
    scope.payloadMatches = [
      ...(scope.payloadMatches ?? []),
      { path: 'study_id', value },
    ];
    return true;
  }
  if (token === '--task-kind' && value) {
    scope.taskKind = value;
    return true;
  }
  if (token === '--payload-match' && value) {
    const separatorIndex = value.indexOf('=');
    const path = value.slice(0, separatorIndex).trim();
    const matchValue = value.slice(separatorIndex + 1).trim();
    if (separatorIndex <= 0 || !path || !matchValue) {
      throw new FrameworkContractError('cli_usage_error', 'family-runtime task scope --payload-match requires path=value.', {
        option: token,
        value,
      });
    }
    scope.payloadMatches = [
      ...(scope.payloadMatches ?? []),
      { path, value: matchValue },
    ];
    return true;
  }
  return false;
}

function normalizedTaskScope(scope: FamilyRuntimeTaskScope) {
  return scope.domainId || scope.taskKind || (scope.payloadMatches?.length ?? 0) > 0 ? scope : undefined;
}

function setDomainProfile(
  profiles: FamilyRuntimeDomainProfiles,
  domainId: FamilyRuntimeDomainId | undefined,
  profile: string,
) {
  const targetDomain = domainId ?? 'medautoscience';
  if (targetDomain !== 'medautoscience') {
    throw new FrameworkContractError('cli_usage_error', 'family-runtime --profile is currently supported only for medautoscience.', {
      domain: targetDomain,
    });
  }
  profiles[targetDomain] = profile;
}

export function parseQueueArgs(rest: string[]): FamilyRuntimeCommandInput | undefined {
  if (rest[0] === 'list') {
    return { mode: 'queue_list' };
  }
  if (rest[0] === 'inspect') {
    const taskId = rest[1];
    if (!taskId || rest.length > 2) {
      throw new FrameworkContractError('cli_usage_error', 'family-runtime queue inspect requires one task id.', {
        usage: 'opl family-runtime queue inspect <task_id>',
      });
    }
    return { mode: 'queue_inspect', taskId };
  }
  if (rest[0] === 'redrive') {
    const taskId = rest[1];
    let reason = '';
    let source: string | undefined;
    if (!taskId) {
      throw new FrameworkContractError('cli_usage_error', 'family-runtime queue redrive requires one task id.', {
        usage: 'opl family-runtime queue redrive <task_id> --reason <operator_reason> [--source <source>]',
      });
    }
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
        throw new FrameworkContractError('cli_usage_error', `Unknown family-runtime queue redrive option: ${token}.`, {
          option: token,
        });
      }
    }
    if (!reason.trim()) {
      throw new FrameworkContractError('cli_usage_error', 'family-runtime queue redrive requires --reason.', {
        usage: 'opl family-runtime queue redrive <task_id> --reason <operator_reason> [--source <source>]',
      });
    }
    return { mode: 'queue_redrive', taskId, reason, source };
  }
  if (rest[0] === 'hold') {
    let reason = '';
    let source: string | undefined;
    const taskScope: FamilyRuntimeTaskScope = {};
    for (let index = 1; index < rest.length; index += 1) {
      const token = rest[index];
      const value = rest[index + 1];
      if (token === '--reason' && value) {
        reason = value;
        index += 1;
      } else if (token === '--source' && value) {
        source = value;
        index += 1;
      } else if (parseTaskScopeOption(taskScope, token, value)) {
        index += 1;
      } else {
        throw new FrameworkContractError('cli_usage_error', `Unknown family-runtime queue hold option: ${token}.`, {
          option: token,
          usage: 'opl family-runtime queue hold --study <study_id> --reason <operator_reason> [--domain <domain>] [--task-kind <kind>] [--payload-match <path=value>] [--source <source>]',
        });
      }
    }
    if (!reason.trim()) {
      throw new FrameworkContractError('cli_usage_error', 'family-runtime queue hold requires --reason.', {
        usage: 'opl family-runtime queue hold --study <study_id> --reason <operator_reason>',
      });
    }
    const normalizedScope = normalizedTaskScope(taskScope);
    if (!normalizedScope) {
      throw new FrameworkContractError('cli_usage_error', 'family-runtime queue hold requires at least one task scope selector.', {
        required_scope_options: ['--domain', '--study', '--task-kind', '--payload-match'],
      });
    }
    return {
      mode: 'queue_hold',
      taskScope: normalizedScope,
      reason,
      source,
    };
  }
  return undefined;
}

export function parseTickArgs(rest: string[]): FamilyRuntimeCommandInput {
  let source = 'manual';
  let limit = 10;
  let hydrate = false;
  const taskScope: FamilyRuntimeTaskScope = {};
  const domainProfiles: FamilyRuntimeDomainProfiles = {};
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    const value = rest[index + 1];
    if (token === '--hydrate') {
      hydrate = true;
    } else if (parseTaskScopeOption(taskScope, token, value)) {
      index += 1;
    } else if (token === '--profile' && value) {
      setDomainProfile(domainProfiles, taskScope.domainId, value);
      index += 1;
    } else if (token === '--source' && value) {
      source = value;
      index += 1;
    } else if (token === '--limit' && value) {
      limit = Number.parseInt(value, 10);
      index += 1;
    } else {
      throw new FrameworkContractError('cli_usage_error', `Unknown family-runtime tick option: ${token}.`, {
        option: token,
      });
    }
  }
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new FrameworkContractError('cli_usage_error', 'family-runtime tick --limit must be a positive integer.', {
      limit,
    });
  }
  return {
    mode: 'tick',
    source,
    limit,
    hydrate,
    taskScope: normalizedTaskScope(taskScope),
    domainProfiles,
  };
}

export function parseIntakeArgs(rest: string[]): FamilyRuntimeCommandInput {
  let domainId: FamilyRuntimeDomainId | undefined;
  let source = 'manual';
  const taskScope: FamilyRuntimeTaskScope = {};
  const domainProfiles: FamilyRuntimeDomainProfiles = {};
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    const value = rest[index + 1];
    if (token === '--domain' && value) {
      domainId = assertDomainId(value);
      index += 1;
    } else if (parseTaskScopeOption(taskScope, token, value)) {
      index += 1;
    } else if (token === '--profile' && value) {
      setDomainProfile(domainProfiles, domainId ?? taskScope.domainId, value);
      index += 1;
    } else if (token === '--source' && value) {
      source = value;
      index += 1;
    } else {
      throw new FrameworkContractError('cli_usage_error', `Unknown family-runtime intake option: ${token}.`, {
        option: token,
      });
    }
  }
  return {
    mode: 'intake',
    domainId: domainId ?? taskScope.domainId,
    source,
    taskScope: normalizedTaskScope(taskScope),
    domainProfiles,
  };
}

export function parseApproveArgs(rest: string[]): FamilyRuntimeCommandInput {
  let taskId = '';
  let decision: 'approve' | 'deny' = 'approve';
  let reason: string | undefined;
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    const value = rest[index + 1];
    if (token === '--task' && value) {
      taskId = value;
      index += 1;
    } else if (token === '--decision' && (value === 'approve' || value === 'deny')) {
      decision = value;
      index += 1;
    } else if (token === '--reason' && value) {
      reason = value;
      index += 1;
    } else {
      throw new FrameworkContractError('cli_usage_error', `Unknown family-runtime approve option: ${token}.`, {
        option: token,
      });
    }
  }
  if (!taskId) {
    throw new FrameworkContractError('cli_usage_error', 'family-runtime approve requires --task <task_id>.', {
      usage: 'opl family-runtime approve --task <task_id> --decision approve',
    });
  }
  return { mode: 'approve', taskId, decision, reason };
}

export function parseEnqueueArgs(rest: string[]): FamilyRuntimeCommandInput {
  let domainId: FamilyRuntimeDomainId | undefined;
  let taskKind = '';
  let payload: string | undefined;
  let payloadFile: string | undefined;
  let dedupeKey: string | undefined;
  let priority = 0;
  let source = 'opl-cli';
  let requiresApproval = false;
  let requireStageAdmission = false;
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    const value = rest[index + 1];
    if (token === '--requires-approval') {
      requiresApproval = true;
    } else if (token === '--require-stage-admission') {
      requireStageAdmission = true;
    } else if (token === '--domain' && value) {
      domainId = assertDomainId(value);
      index += 1;
    } else if (token === '--task-kind' && value) {
      taskKind = value;
      index += 1;
    } else if (token === '--payload' && value) {
      payload = value;
      index += 1;
    } else if (token === '--payload-file' && value) {
      payloadFile = value;
      index += 1;
    } else if (token === '--dedupe-key' && value) {
      dedupeKey = value;
      index += 1;
    } else if (token === '--priority' && value) {
      priority = Number.parseInt(value, 10);
      index += 1;
    } else if (token === '--source' && value) {
      source = value;
      index += 1;
    } else {
      throw new FrameworkContractError('cli_usage_error', `Unknown family-runtime enqueue option: ${token}.`, {
        option: token,
      });
    }
  }
  if (!domainId || !taskKind) {
    throw new FrameworkContractError(
      'cli_usage_error',
      'family-runtime enqueue requires --domain and --task-kind.',
      { required: ['--domain', '--task-kind'] },
    );
  }
  if (!Number.isInteger(priority)) {
    throw new FrameworkContractError('cli_usage_error', 'family-runtime enqueue --priority must be an integer.', {
      priority,
    });
  }
  return {
    mode: 'enqueue',
    input: {
      domainId,
      taskKind,
      payload: parsePayloadArg(payload, payloadFile),
      dedupeKey,
      priority,
      source,
      requiresApproval,
      requireStageAdmission,
    },
  };
}
