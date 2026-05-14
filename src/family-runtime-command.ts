import fs from 'node:fs';
import path from 'node:path';

import { FrameworkContractError } from './contracts.ts';
import {
  FAMILY_RUNTIME_DOMAIN_IDS,
  FAMILY_RUNTIME_PROVIDER_KINDS,
  TEMPORAL_STAGE_ATTEMPT_SIGNAL_KINDS,
  type FamilyRuntimeDomainId,
  type FamilyRuntimeProviderKind,
  type TemporalStageAttemptSignalKind,
} from './family-runtime-types.ts';

export {
  FAMILY_RUNTIME_DOMAIN_IDS,
  type FamilyRuntimeDomainId,
} from './family-runtime-types.ts';

export type EnqueueInput = {
  domainId: FamilyRuntimeDomainId;
  taskKind: string;
  payload: Record<string, unknown>;
  dedupeKey?: string;
  priority?: number;
  source?: string;
  requiresApproval?: boolean;
};

export type FamilyRuntimeCommandInput =
  | {
    mode: 'status' | 'doctor' | 'install' | 'repair';
    providerKind?: FamilyRuntimeProviderKind;
  }
  | {
    mode: 'worker_start' | 'worker_status' | 'worker_stop';
    providerKind?: FamilyRuntimeProviderKind;
    detach?: boolean;
  }
  | {
    mode: 'service_start' | 'service_status' | 'service_stop';
    providerKind?: FamilyRuntimeProviderKind;
    detach?: boolean;
  }
  | { mode: 'residency_proof'; providerKind?: FamilyRuntimeProviderKind; live?: boolean; production?: boolean }
  | { mode: 'notify_list' | 'events_export' | 'queue_list' | 'attempt_list' }
  | { mode: 'tick'; source?: string; limit?: number; hydrate?: boolean }
  | { mode: 'intake'; domainId?: FamilyRuntimeDomainId; source?: string }
  | { mode: 'enqueue'; input: EnqueueInput }
  | { mode: 'queue_inspect'; taskId: string }
  | { mode: 'attempt_inspect'; stageAttemptId: string }
  | { mode: 'attempt_start'; stageAttemptId: string }
  | { mode: 'attempt_query'; stageAttemptId: string }
  | {
    mode: 'attempt_signal';
    stageAttemptId: string;
    signalKind: TemporalStageAttemptSignalKind;
    payload: Record<string, unknown>;
    source?: string;
  }
  | {
    mode: 'attempt_fixture_run';
    stageAttemptId: string;
    stagePacketRef?: string;
    checkpointRefs?: string[];
    closeoutPacket?: Record<string, unknown>;
  }
  | {
    mode: 'attempt_create';
    input: {
      domainId: FamilyRuntimeDomainId;
      stageId: string;
      providerKind?: FamilyRuntimeProviderKind;
      workspaceLocator: Record<string, unknown>;
      sourceFingerprint?: string;
      executorKind?: string;
      taskId?: string;
      retryBudget?: Record<string, unknown>;
      checkpointRefs?: string[];
      closeoutRefs?: string[];
      humanGateRefs?: string[];
      blockedReason?: string;
      newAttempt?: boolean;
      start?: boolean;
    };
  }
  | { mode: 'approve'; taskId: string; decision: 'approve' | 'deny'; reason?: string };

export const DOMAIN_ADAPTERS: Record<FamilyRuntimeDomainId, {
  repo_id: string;
  truth_owner: string;
  dispatch_command: string[];
}> = {
  medautoscience: {
    repo_id: 'med-autoscience',
    truth_owner: 'med-autoscience',
    dispatch_command: ['medautosci', 'sidecar', 'dispatch'],
  },
  medautogrant: {
    repo_id: 'med-autogrant',
    truth_owner: 'med-autogrant',
    dispatch_command: ['medautogrant', 'product', 'sidecar', 'dispatch'],
  },
  redcube: {
    repo_id: 'redcube-ai',
    truth_owner: 'redcube-ai',
    dispatch_command: ['redcube', 'product', 'sidecar', 'dispatch'],
  },
};

function parsePayload(value: string): Record<string, unknown> {
  const parsed = JSON.parse(value);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new FrameworkContractError('cli_usage_error', 'Task payload must be a JSON object.', {
      payload: value,
    });
  }
  return parsed as Record<string, unknown>;
}

function parsePayloadArg(value: string | undefined, payloadFile: string | undefined) {
  if (value && payloadFile) {
    throw new FrameworkContractError('cli_usage_error', 'Use either --payload or --payload-file, not both.', {
      options: ['--payload', '--payload-file'],
    });
  }
  if (payloadFile) {
    return parsePayload(fs.readFileSync(path.resolve(payloadFile), 'utf8'));
  }
  if (value) {
    return parsePayload(value);
  }
  return {};
}

function assertDomainId(value: string | undefined): FamilyRuntimeDomainId {
  if (FAMILY_RUNTIME_DOMAIN_IDS.includes(value as FamilyRuntimeDomainId)) {
    return value as FamilyRuntimeDomainId;
  }
  throw new FrameworkContractError('cli_usage_error', 'Unsupported family-runtime domain id.', {
    domain_id: value ?? null,
    allowed_domain_ids: [...FAMILY_RUNTIME_DOMAIN_IDS],
  });
}

function assertProviderKind(value: string | undefined): FamilyRuntimeProviderKind {
  if (FAMILY_RUNTIME_PROVIDER_KINDS.includes(value as FamilyRuntimeProviderKind)) {
    return value as FamilyRuntimeProviderKind;
  }
  throw new FrameworkContractError('cli_usage_error', 'Unsupported family-runtime provider kind.', {
    provider_kind: value ?? null,
    allowed_provider_kinds: [...FAMILY_RUNTIME_PROVIDER_KINDS],
  });
}

function assertSignalKind(value: string | undefined): TemporalStageAttemptSignalKind {
  if (TEMPORAL_STAGE_ATTEMPT_SIGNAL_KINDS.includes(value as TemporalStageAttemptSignalKind)) {
    return value as TemporalStageAttemptSignalKind;
  }
  throw new FrameworkContractError('cli_usage_error', 'Unsupported family-runtime attempt signal kind.', {
    signal_kind: value ?? null,
    allowed_signal_kinds: [...TEMPORAL_STAGE_ATTEMPT_SIGNAL_KINDS],
  });
}

function parseProviderOnlyArgs(mode: 'status' | 'doctor' | 'install' | 'repair', args: string[]) {
  let providerKind: FamilyRuntimeProviderKind | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    const value = args[index + 1];
    if (token === '--provider' && value) {
      providerKind = assertProviderKind(value);
      index += 1;
    } else {
      throw new FrameworkContractError('cli_usage_error', `family-runtime ${mode} accepts only --provider.`, {
        extra_args: args,
        usage: `opl family-runtime ${mode} [--provider local_sqlite|temporal]`,
      });
    }
  }
  return { mode, providerKind };
}

export function parseFamilyRuntimeCommand(args: string[]): FamilyRuntimeCommandInput {
  const [mode, ...rest] = args;
  if (!mode || mode === 'status') {
    return parseProviderOnlyArgs('status', rest);
  }
  if (mode === 'doctor' || mode === 'install' || mode === 'repair') {
    return parseProviderOnlyArgs(mode, rest);
  }
  if (mode === 'worker') {
    const action = rest[0];
    if (action !== 'start' && action !== 'status' && action !== 'stop') {
      throw new FrameworkContractError('cli_usage_error', 'family-runtime worker requires start, status, or stop.', {
        usage: 'opl family-runtime worker start|status|stop [--provider temporal] [--foreground]',
      });
    }
    let providerKind: FamilyRuntimeProviderKind | undefined;
    let detach = true;
    for (let index = 1; index < rest.length; index += 1) {
      const token = rest[index];
      const value = rest[index + 1];
      if (token === '--provider' && value) {
        providerKind = assertProviderKind(value);
        index += 1;
      } else if (token === '--foreground') {
        detach = false;
      } else {
        throw new FrameworkContractError('cli_usage_error', `Unknown family-runtime worker ${action} option: ${token}.`, {
          option: token,
          usage: 'opl family-runtime worker start|status|stop [--provider temporal] [--foreground]',
        });
      }
    }
    return {
      mode: action === 'start'
        ? 'worker_start'
        : action === 'status'
          ? 'worker_status'
          : 'worker_stop',
      providerKind,
      detach,
    };
  }
  if (mode === 'service') {
    const action = rest[0];
    if (action !== 'start' && action !== 'status' && action !== 'stop') {
      throw new FrameworkContractError('cli_usage_error', 'family-runtime service requires start, status, or stop.', {
        usage: 'opl family-runtime service start|status|stop [--provider temporal] [--foreground]',
      });
    }
    let providerKind: FamilyRuntimeProviderKind | undefined;
    let detach = true;
    for (let index = 1; index < rest.length; index += 1) {
      const token = rest[index];
      const value = rest[index + 1];
      if (token === '--provider' && value) {
        providerKind = assertProviderKind(value);
        index += 1;
      } else if (token === '--foreground') {
        detach = false;
      } else {
        throw new FrameworkContractError('cli_usage_error', `Unknown family-runtime service ${action} option: ${token}.`, {
          option: token,
          usage: 'opl family-runtime service start|status|stop [--provider temporal] [--foreground]',
        });
      }
    }
    return {
      mode: action === 'start'
        ? 'service_start'
        : action === 'status'
          ? 'service_status'
          : 'service_stop',
      providerKind,
      detach,
    };
  }
  if (mode === 'residency' && rest[0] === 'proof') {
    let providerKind: FamilyRuntimeProviderKind | undefined;
    let live = false;
    let production = false;
    for (let index = 1; index < rest.length; index += 1) {
      const token = rest[index];
      const value = rest[index + 1];
      if (token === '--provider' && value) {
        providerKind = assertProviderKind(value);
        index += 1;
      } else if (token === '--live') {
        live = true;
      } else if (token === '--production') {
        production = true;
      } else {
        throw new FrameworkContractError('cli_usage_error', `Unknown family-runtime residency proof option: ${token}.`, {
          option: token,
          usage: 'opl family-runtime residency proof --provider temporal [--live|--production]',
        });
      }
    }
    if (live && production) {
      throw new FrameworkContractError('cli_usage_error', 'Use only one Temporal residency proof mode.', {
        mutually_exclusive: ['--live', '--production'],
      });
    }
    return { mode: 'residency_proof', providerKind, live, production };
  }
  if (mode === 'notify' && rest[0] === 'list') {
    return { mode: 'notify_list' };
  }
  if (mode === 'events' && rest[0] === 'export') {
    return { mode: 'events_export' };
  }
  if (mode === 'queue' && rest[0] === 'list') {
    return { mode: 'queue_list' };
  }
  if (mode === 'queue' && rest[0] === 'inspect') {
    const taskId = rest[1];
    if (!taskId || rest.length > 2) {
      throw new FrameworkContractError('cli_usage_error', 'family-runtime queue inspect requires one task id.', {
        usage: 'opl family-runtime queue inspect <task_id>',
      });
    }
    return { mode: 'queue_inspect', taskId };
  }
  if (mode === 'attempt' && rest[0] === 'list') {
    if (rest.length > 1) {
      throw new FrameworkContractError('cli_usage_error', 'family-runtime attempt list accepts no extra arguments.', {
        extra_args: rest.slice(1),
      });
    }
    return { mode: 'attempt_list' };
  }
  if (mode === 'attempt' && rest[0] === 'inspect') {
    const stageAttemptId = rest[1];
    if (!stageAttemptId || rest.length > 2) {
      throw new FrameworkContractError('cli_usage_error', 'family-runtime attempt inspect requires one attempt id.', {
        usage: 'opl family-runtime attempt inspect <stage_attempt_id>',
      });
    }
    return { mode: 'attempt_inspect', stageAttemptId };
  }
  if (mode === 'attempt' && rest[0] === 'start') {
    const stageAttemptId = rest[1];
    if (!stageAttemptId || rest.length > 2) {
      throw new FrameworkContractError('cli_usage_error', 'family-runtime attempt start requires one attempt id.', {
        usage: 'opl family-runtime attempt start <stage_attempt_id>',
      });
    }
    return { mode: 'attempt_start', stageAttemptId };
  }
  if (mode === 'attempt' && rest[0] === 'query') {
    const stageAttemptId = rest[1];
    if (!stageAttemptId || rest.length > 2) {
      throw new FrameworkContractError('cli_usage_error', 'family-runtime attempt query requires one attempt id.', {
        usage: 'opl family-runtime attempt query <stage_attempt_id>',
      });
    }
    return { mode: 'attempt_query', stageAttemptId };
  }
  if (mode === 'attempt' && rest[0] === 'signal') {
    const stageAttemptId = rest[1];
    if (!stageAttemptId) {
      throw new FrameworkContractError('cli_usage_error', 'family-runtime attempt signal requires one attempt id.', {
        usage: 'opl family-runtime attempt signal <stage_attempt_id> --kind human_gate|user_instruction|resume --payload <json>',
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
  if (mode === 'attempt' && rest[0] === 'fixture-run') {
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
  if (mode === 'attempt' && rest[0] === 'create') {
    let domainId: FamilyRuntimeDomainId | undefined;
    let stageId = '';
    let providerKind: FamilyRuntimeProviderKind | undefined;
    let workspaceLocator: string | undefined;
    let workspaceLocatorFile: string | undefined;
    let retryBudget: string | undefined;
    let retryBudgetFile: string | undefined;
    let sourceFingerprint: string | undefined;
    let executorKind: string | undefined;
    let taskId: string | undefined;
    let blockedReason: string | undefined;
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
        taskId,
        retryBudget: retryBudget || retryBudgetFile ? parsePayloadArg(retryBudget, retryBudgetFile) : undefined,
        checkpointRefs,
        closeoutRefs,
        humanGateRefs,
        blockedReason,
        newAttempt,
        start,
      },
    };
  }
  if (mode === 'tick') {
    let source = 'manual';
    let limit = 10;
    let hydrate = false;
    for (let index = 0; index < rest.length; index += 1) {
      const token = rest[index];
      const value = rest[index + 1];
      if (token === '--hydrate') {
        hydrate = true;
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
    return { mode: 'tick', source, limit, hydrate };
  }
  if (mode === 'intake') {
    let domainId: FamilyRuntimeDomainId | undefined;
    let source = 'manual';
    for (let index = 0; index < rest.length; index += 1) {
      const token = rest[index];
      const value = rest[index + 1];
      if (token === '--domain' && value) {
        domainId = assertDomainId(value);
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
    return { mode: 'intake', domainId, source };
  }
  if (mode === 'approve') {
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
  if (mode === 'enqueue') {
    let domainId: FamilyRuntimeDomainId | undefined;
    let taskKind = '';
    let payload: string | undefined;
    let payloadFile: string | undefined;
    let dedupeKey: string | undefined;
    let priority = 0;
    let source = 'opl-cli';
    let requiresApproval = false;
    for (let index = 0; index < rest.length; index += 1) {
      const token = rest[index];
      const value = rest[index + 1];
      if (token === '--requires-approval') {
        requiresApproval = true;
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
      },
    };
  }
  throw new FrameworkContractError('unknown_command', `Unknown family-runtime subcommand: ${mode}.`, {
    usage: 'opl family-runtime status|doctor|install|repair|service start|service status|service stop|worker start|worker status|worker stop|intake|tick|enqueue|attempt create|attempt start|attempt list|attempt inspect|attempt query|attempt signal|attempt fixture-run|queue list|queue inspect|approve|notify list|events export',
  });
}
