import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';

import { getActiveWorkspaceBinding } from './workspace-registry.ts';
import {
  FAMILY_RUNTIME_DOMAIN_IDS,
  type EnqueueInput,
  type FamilyRuntimeDomainId,
} from './family-runtime-command.ts';
import {
  familyRuntimePaths,
  insertEvent,
  type taskToPayload,
} from './family-runtime-store.ts';

type DomainExportCommand = {
  argv: string[];
  cwd: string;
  source: 'env_override' | 'env_profile' | 'workspace_binding';
};

type EnqueueTaskResult = {
  accepted?: boolean;
  idempotent_noop?: boolean;
  task?: ReturnType<typeof taskToPayload>;
};

type EnqueueTask = (db: DatabaseSync, input: EnqueueInput) => EnqueueTaskResult;

function masProductionProofArgs(paths?: ReturnType<typeof familyRuntimePaths>) {
  const proofPath = process.env.OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_OPL_PRODUCTION_PROOF?.trim()
    || process.env.OPL_FAMILY_RUNTIME_OPL_PRODUCTION_PROOF?.trim()
    || (
      paths && fs.existsSync(paths.latest_temporal_production_proof)
        ? paths.latest_temporal_production_proof
        : ''
    );
  return proofPath ? ['--opl-production-proof', proofPath] : [];
}

function exportCommandForDomain(
  domainId: FamilyRuntimeDomainId,
  paths?: ReturnType<typeof familyRuntimePaths>,
): DomainExportCommand | null {
  const override = process.env[`OPL_FAMILY_RUNTIME_${domainId.toUpperCase()}_EXPORT`]?.trim();
  if (override) {
    return {
      argv: override.split(/\s+/),
      cwd: process.cwd(),
      source: 'env_override',
    };
  }
  if (domainId === 'medautoscience') {
    const profile = process.env.OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_PROFILE?.trim();
    if (profile) {
      return {
        argv: ['medautosci', 'sidecar', 'export', '--profile', profile, ...masProductionProofArgs(paths), '--format', 'json'],
        cwd: process.cwd(),
        source: 'env_profile',
      };
    }

    const binding = getActiveWorkspaceBinding('medautoscience');
    const workspaceLocator = binding?.direct_entry.workspace_locator;
    const profileRef = workspaceLocator?.surface_kind === 'med_autoscience_workspace_profile'
      ? workspaceLocator.profile_ref
      : null;
    if (binding && profileRef) {
      return {
        argv: [
          'uv',
          'run',
          'python',
          '-m',
          'med_autoscience.cli',
          'sidecar',
          'export',
          '--profile',
          profileRef,
          ...masProductionProofArgs(paths),
          '--format',
          'json',
        ],
        cwd: binding.workspace_path,
        source: 'workspace_binding',
      };
    }
  }
  return null;
}

function parseDispatchOutput(stdout: string) {
  const trimmed = stdout.trim();
  if (!trimmed) {
    return {};
  }
  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    return { raw_stdout: trimmed };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFamilyRuntimeDomainId(value: string): value is FamilyRuntimeDomainId {
  return FAMILY_RUNTIME_DOMAIN_IDS.includes(value as FamilyRuntimeDomainId);
}

function taskPayloadFrom(item: Record<string, unknown>) {
  return isRecord(item.payload) ? item.payload : {};
}

function taskPayloadBlockedByForbiddenWrite(payload: Record<string, unknown>) {
  return payload.domain_truth_write === true || payload.artifact_gate_override === true;
}

function pendingTaskInputFrom(
  domainId: FamilyRuntimeDomainId,
  item: Record<string, unknown>,
  source: string,
): { input?: EnqueueInput; blocked?: { reason: string; task: unknown } } {
  const exportedDomain = typeof item.domain_id === 'string' ? item.domain_id : domainId;
  const taskKind = typeof item.task_kind === 'string' ? item.task_kind.trim() : '';
  const payload = taskPayloadFrom(item);
  if (!isFamilyRuntimeDomainId(exportedDomain) || !taskKind) {
    return { blocked: { reason: 'invalid_domain_or_task_kind', task: item } };
  }
  if (taskPayloadBlockedByForbiddenWrite(payload)) {
    return { blocked: { reason: 'domain_forbidden_write', task: item } };
  }
  return {
    input: {
      domainId: exportedDomain,
      taskKind,
      payload: {
        ...payload,
        ...(Array.isArray(item.source_refs) ? { source_refs: item.source_refs } : {}),
        ...(typeof item.dispatch_owner === 'string' ? { dispatch_owner: item.dispatch_owner } : {}),
        ...(typeof item.profile_name === 'string' ? { profile_name: item.profile_name } : {}),
      },
      dedupeKey: typeof item.dedupe_key === 'string' ? item.dedupe_key : undefined,
      priority: Number.isInteger(item.priority) ? item.priority as number : 0,
      source: typeof item.source === 'string' ? item.source : source,
      requiresApproval: item.requires_approval === true,
    },
  };
}

function toPendingTaskInputs(
  domainId: FamilyRuntimeDomainId,
  output: Record<string, unknown>,
  source: string,
) {
  const tasks = Array.isArray(output.pending_family_tasks) ? output.pending_family_tasks : [];
  const inputs: EnqueueInput[] = [];
  const blocked: Array<{ reason: string; task: unknown }> = [];
  for (const task of tasks) {
    if (!isRecord(task)) {
      blocked.push({ reason: 'invalid_pending_task', task });
      continue;
    }
    const result = pendingTaskInputFrom(domainId, task, source);
    if (result.input) {
      inputs.push(result.input);
    } else if (result.blocked) {
      blocked.push(result.blocked);
    }
  }
  return { inputs, blocked };
}

export function hydrateDomainTasks(
  db: DatabaseSync,
  paths: ReturnType<typeof familyRuntimePaths>,
  input: { domainId?: FamilyRuntimeDomainId; source: string },
  enqueueTask: EnqueueTask,
) {
  const domains = input.domainId ? [input.domainId] : [...FAMILY_RUNTIME_DOMAIN_IDS];
  const exports = [];
  let enqueuedCount = 0;
  let idempotentNoopCount = 0;
  let blockedCount = 0;
  for (const domainId of domains) {
    const command = exportCommandForDomain(domainId, paths);
    if (!command) {
      exports.push({ domain_id: domainId, status: 'skipped', reason: 'export_command_not_configured' });
      continue;
    }
    const result = spawnSync(command.argv[0], command.argv.slice(1), {
      cwd: command.cwd,
      encoding: 'utf8',
      env: process.env,
    });
    const stdout = result.stdout ?? '';
    const stderr = result.stderr ?? '';
    const exitCode = result.status ?? (result.error ? 127 : 1);
    if (exitCode !== 0) {
      blockedCount += 1;
      exports.push({
        domain_id: domainId,
        status: 'failed',
        command_preview: command.argv,
        command_cwd: command.cwd,
        command_source: command.source,
        error: result.error?.message || stderr || stdout || `Domain export exited ${exitCode}.`,
      });
      continue;
    }
    const output = parseDispatchOutput(stdout);
    const { inputs, blocked } = toPendingTaskInputs(domainId, output, input.source);
    blockedCount += blocked.length;
    const acceptedTasks = [];
    for (const taskInput of inputs) {
      const resultPayload = enqueueTask(db, taskInput);
      acceptedTasks.push(resultPayload);
      if (resultPayload.accepted) {
        enqueuedCount += 1;
      } else if (resultPayload.idempotent_noop) {
        idempotentNoopCount += 1;
      }
    }
    exports.push({
      domain_id: domainId,
      status: 'completed',
      command_preview: command.argv,
      command_cwd: command.cwd,
      command_source: command.source,
      exported_count: inputs.length + blocked.length,
      enqueued_count: acceptedTasks.filter((task) => task.accepted).length,
      idempotent_noop_count: acceptedTasks.filter((task) => task.idempotent_noop).length,
      blocked_count: blocked.length,
      blocked,
    });
  }
  insertEvent(db, {
    eventType: 'domain_intake_completed',
    source: input.source,
    payload: { enqueued_count: enqueuedCount, idempotent_noop_count: idempotentNoopCount, blocked_count: blockedCount },
  });
  return {
    source: input.source,
    enqueued_count: enqueuedCount,
    idempotent_noop_count: idempotentNoopCount,
    blocked_count: blockedCount,
    exports,
  };
}
