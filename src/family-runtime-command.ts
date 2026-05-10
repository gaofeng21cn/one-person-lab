import fs from 'node:fs';
import path from 'node:path';

import { GatewayContractError } from './contracts.ts';

export const FAMILY_RUNTIME_DOMAIN_IDS = ['medautoscience', 'medautogrant', 'redcube'] as const;

export type FamilyRuntimeDomainId = typeof FAMILY_RUNTIME_DOMAIN_IDS[number];

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
  | { mode: 'status' | 'doctor' | 'install' | 'repair' | 'notify_list' | 'events_export' | 'queue_list' }
  | { mode: 'tick'; source?: string; limit?: number }
  | { mode: 'enqueue'; input: EnqueueInput }
  | { mode: 'queue_inspect'; taskId: string }
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
    throw new GatewayContractError('cli_usage_error', 'Task payload must be a JSON object.', {
      payload: value,
    });
  }
  return parsed as Record<string, unknown>;
}

function parsePayloadArg(value: string | undefined, payloadFile: string | undefined) {
  if (value && payloadFile) {
    throw new GatewayContractError('cli_usage_error', 'Use either --payload or --payload-file, not both.', {
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
  throw new GatewayContractError('cli_usage_error', 'Unsupported family-runtime domain id.', {
    domain_id: value ?? null,
    allowed_domain_ids: [...FAMILY_RUNTIME_DOMAIN_IDS],
  });
}

export function parseFamilyRuntimeCommand(args: string[]): FamilyRuntimeCommandInput {
  const [mode, ...rest] = args;
  if (!mode || mode === 'status') {
    return { mode: 'status' };
  }
  if (mode === 'doctor' || mode === 'install' || mode === 'repair') {
    if (rest.length > 0) {
      throw new GatewayContractError('cli_usage_error', `family-runtime ${mode} accepts no extra arguments.`, {
        extra_args: rest,
      });
    }
    return { mode };
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
      throw new GatewayContractError('cli_usage_error', 'family-runtime queue inspect requires one task id.', {
        usage: 'opl family-runtime queue inspect <task_id>',
      });
    }
    return { mode: 'queue_inspect', taskId };
  }
  if (mode === 'tick') {
    let source = 'manual';
    let limit = 10;
    for (let index = 0; index < rest.length; index += 1) {
      const token = rest[index];
      const value = rest[index + 1];
      if (token === '--source' && value) {
        source = value;
        index += 1;
      } else if (token === '--limit' && value) {
        limit = Number.parseInt(value, 10);
        index += 1;
      } else {
        throw new GatewayContractError('cli_usage_error', `Unknown family-runtime tick option: ${token}.`, {
          option: token,
        });
      }
    }
    if (!Number.isInteger(limit) || limit <= 0) {
      throw new GatewayContractError('cli_usage_error', 'family-runtime tick --limit must be a positive integer.', {
        limit,
      });
    }
    return { mode: 'tick', source, limit };
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
        throw new GatewayContractError('cli_usage_error', `Unknown family-runtime approve option: ${token}.`, {
          option: token,
        });
      }
    }
    if (!taskId) {
      throw new GatewayContractError('cli_usage_error', 'family-runtime approve requires --task <task_id>.', {
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
        throw new GatewayContractError('cli_usage_error', `Unknown family-runtime enqueue option: ${token}.`, {
          option: token,
        });
      }
    }
    if (!domainId || !taskKind) {
      throw new GatewayContractError(
        'cli_usage_error',
        'family-runtime enqueue requires --domain and --task-kind.',
        { required: ['--domain', '--task-kind'] },
      );
    }
    if (!Number.isInteger(priority)) {
      throw new GatewayContractError('cli_usage_error', 'family-runtime enqueue --priority must be an integer.', {
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
  throw new GatewayContractError('unknown_command', `Unknown family-runtime subcommand: ${mode}.`, {
    usage: 'opl family-runtime status|doctor|install|repair|tick|enqueue|queue list|queue inspect|approve|notify list|events export',
  });
}
