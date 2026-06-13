import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

import {
  FAMILY_RUNTIME_DOMAIN_IDS,
  type EnqueueInput,
  type FamilyRuntimeDomainProfiles,
  type FamilyRuntimeTaskScope,
  type FamilyRuntimeDomainId,
} from './family-runtime-command.ts';
import {
  familyRuntimePaths,
  insertEvent,
  type taskToPayload,
} from './family-runtime-store.ts';
import {
  runFamilyRuntimeDomainHandlerCommand,
  domainHandlerResultErrorMessage,
} from './family-runtime-domain-handler-process.ts';
import { resolveOplModuleExecCommand } from './system-installation/modules.ts';
import type { ModuleInspection } from './system-installation/shared.ts';
import { payloadMatchesTaskScope } from './family-runtime-task-scope.ts';
import {
  activeMedautoscienceWorkspaceProfile,
  resolveExplicitMedautoscienceDomainProfile,
} from './family-runtime-medautoscience-profile.ts';
import { currentControlProviderAdmissionInputs } from './family-runtime-domain-intake-parts/current-control-provider-admission.ts';
import {
  reconcileCurrentControlExecutableOwners,
  suppressStaleDefaultExecutorInputs,
} from './family-runtime-domain-intake-parts/current-control-reconciliation.ts';
import { toPendingTaskInputs } from './family-runtime-domain-intake-parts/pending-task-inputs.ts';

type DomainExportCommand = {
  argv: string[];
  cwd: string;
  source: 'env_override' | 'module_exec_profile' | 'workspace_binding';
  owner_fingerprint: string;
  module?: ModuleInspection;
};

type EnqueueTaskResult = {
  accepted?: boolean;
  requeued_from_terminal?: boolean;
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
  domainProfiles?: FamilyRuntimeDomainProfiles,
): DomainExportCommand | null {
  const override = process.env[`OPL_FAMILY_RUNTIME_${domainId.toUpperCase()}_EXPORT`]?.trim();
  if (override) {
    return {
      argv: override.split(/\s+/),
      cwd: process.cwd(),
      source: 'env_override',
      owner_fingerprint: `env_override:${override}`,
    };
  }
  if (domainId === 'medautoscience') {
    const profile = resolveExplicitMedautoscienceDomainProfile(domainProfiles);
    if (profile) {
      const command = resolveOplModuleExecCommand('medautoscience', [
        'domain-handler',
        'export',
        '--profile',
        profile,
        ...masProductionProofArgs(paths),
        '--format',
        'json',
      ]);
      return {
        argv: command.command_preview,
        cwd: command.working_directory,
        source: 'module_exec_profile',
        module: command.module,
        owner_fingerprint: [
          'module_exec_profile',
          profile,
          command.module_id,
          command.module.install_origin,
          command.module.git?.head_sha ?? 'unknown-head',
          command.working_directory,
        ].join(':'),
      };
    }

    const workspaceProfile = activeMedautoscienceWorkspaceProfile();
    if (workspaceProfile) {
      const { binding, profileRef } = workspaceProfile;
      return {
        argv: [
          'uv',
          'run',
          'python',
          '-m',
          'med_autoscience.cli',
          'domain-handler',
          'export',
          '--profile',
          profileRef,
          ...masProductionProofArgs(paths),
          '--format',
          'json',
        ],
        cwd: binding.workspace_path,
        source: 'workspace_binding',
        owner_fingerprint: [
          'workspace_binding',
          binding.workspace_path,
          profileRef,
        ].join(':'),
      };
    }
  }
  return null;
}

function dirtyModuleExportBlock(command: DomainExportCommand) {
  if (command.source !== 'module_exec_profile' || command.module?.health_status !== 'dirty' && command.module?.git?.dirty !== true) {
    return null;
  }
  return {
    status: 'blocked',
    reason: 'dirty_checkout',
    command_preview: command.argv,
    command_cwd: command.cwd,
    command_source: command.source,
    module_id: command.module.module_id,
    module_install_origin: command.module.install_origin,
    module_checkout_path: command.module.checkout_path,
    module_git: command.module.git,
    override_policy: {
      default: 'fail_closed',
      explicit_override_available: false,
      note: 'family-runtime hydrate/export requires a clean module_exec_profile checkout before running the domain handler.',
    },
  };
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

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function canonicalFamilyRuntimeDomainId(value: unknown): FamilyRuntimeDomainId | null {
  const raw = optionalString(value);
  if (!raw) {
    return null;
  }
  const normalized = raw.toLowerCase();
  const aliases: Record<string, FamilyRuntimeDomainId> = {
    mas: 'medautoscience',
    'med-autoscience': 'medautoscience',
    med_autoscience: 'medautoscience',
    medautoscience: 'medautoscience',
    mag: 'medautogrant',
    'med-auto-grant': 'medautogrant',
    'med-autogrant': 'medautogrant',
    med_auto_grant: 'medautogrant',
    med_autogrant: 'medautogrant',
    medautogrant: 'medautogrant',
    rca: 'redcube',
    redcube: 'redcube',
    'redcube-ai': 'redcube',
    redcube_ai: 'redcube',
    oma: 'opl-meta-agent',
    oplmetaagent: 'opl-meta-agent',
    'opl-meta-agent': 'opl-meta-agent',
    opl_meta_agent: 'opl-meta-agent',
  };
  return aliases[normalized] ?? null;
}

function inputMatchesTaskScope(input: EnqueueInput, taskScope?: FamilyRuntimeTaskScope) {
  if (!taskScope) {
    return true;
  }
  if (taskScope.domainId && input.domainId !== taskScope.domainId) {
    return false;
  }
  if (taskScope.taskKind && input.taskKind !== taskScope.taskKind) {
    return false;
  }
  return payloadMatchesTaskScope(input.payload, taskScope);
}

function familyTransitionMatrixResult(output: Record<string, unknown>) {
  const matrix = isRecord(output.family_transition_matrix_result)
    ? output.family_transition_matrix_result
    : output.surface_kind === 'family_transition_matrix_result'
      ? output
      : null;
  if (!matrix) {
    return null;
  }
  return matrix.surface_kind === 'family_transition_matrix_result' ? matrix : null;
}

function ownerRouteOwnerFrom(result: Record<string, unknown>) {
  const ownerRoute = isRecord(result.owner_route) ? result.owner_route : null;
  return optionalString(ownerRoute?.owner);
}

function transitionTaskInputFromMatrixEntry(
  domainId: FamilyRuntimeDomainId,
  matrix: Record<string, unknown>,
  entry: unknown,
  source: string,
): { input?: EnqueueInput; blocked?: { reason: string; task: unknown } } {
  if (!isRecord(entry)) {
    return { blocked: { reason: 'invalid_transition_matrix_entry', task: entry } };
  }
  const result = isRecord(entry.result) ? entry.result : null;
  const specId = optionalString(matrix.spec_id);
  const caseId = optionalString(entry.case_id);
  const transitionId = optionalString(result?.transition_id);
  if (!result || result.surface_kind !== 'family_transition_result' || !specId || !caseId || !transitionId) {
    return { blocked: { reason: 'invalid_transition_matrix_result', task: entry } };
  }
  const declaredDomain = optionalString(result.domain_id);
  const exportedDomain = declaredDomain ? canonicalFamilyRuntimeDomainId(declaredDomain) : domainId;
  if (!exportedDomain || !isFamilyRuntimeDomainId(exportedDomain)) {
    return { blocked: { reason: 'invalid_transition_domain', task: entry } };
  }
  const sourceRef = `family_transition_matrix_result:${specId}:${caseId}`;
  return {
    input: {
      domainId: exportedDomain,
      taskKind: 'family_transition/domain_tick',
      payload: {
        family_transition: result,
        source_refs: [
          {
            role: 'family_transition_matrix_case',
            ref: sourceRef,
          },
        ],
        opl_provider_hosted_stage_attempt: true,
        authority_boundary: {
          opl_can_write_domain_truth: false,
          opl_executes_domain_action: false,
          opl_authorizes_domain_verdict: false,
          domain_transition_owner: ownerRouteOwnerFrom(result) ?? 'domain_agent',
        },
      },
      dedupeKey: `${specId}:${caseId}:${transitionId}`,
      priority: 60,
      source,
    },
  };
}

function transitionTaskInputsFromMatrix(
  domainId: FamilyRuntimeDomainId,
  output: Record<string, unknown>,
  source: string,
) {
  const matrix = familyTransitionMatrixResult(output);
  if (!matrix) {
    return { inputs: [], blocked: [] };
  }
  const entries = Array.isArray(matrix.results) ? matrix.results : [];
  const inputs: EnqueueInput[] = [];
  const blocked: Array<{ reason: string; task: unknown }> = [];
  for (const entry of entries) {
    const result = transitionTaskInputFromMatrixEntry(domainId, matrix, entry, source);
    if (result.input) {
      inputs.push(result.input);
    } else if (result.blocked) {
      blocked.push(result.blocked);
    }
  }
  return { inputs, blocked };
}

function exportedTaskInputs(
  domainId: FamilyRuntimeDomainId,
  output: Record<string, unknown>,
  source: string,
  exportContext: DomainExportCommand,
  taskScope?: FamilyRuntimeTaskScope,
) {
  const pending = toPendingTaskInputs(domainId, output, source, exportContext);
  const currentControlRaw = currentControlProviderAdmissionInputs(domainId, output, exportContext);
  const currentControlInputs = reconcileCurrentControlExecutableOwners(
    currentControlRaw.inputs,
    pending.inputs,
  );
  const pendingAfterCurrentControl = suppressStaleDefaultExecutorInputs(pending.inputs, currentControlInputs);
  const transitions = transitionTaskInputsFromMatrix(domainId, output, source);
  const exportedInputs = [...currentControlInputs, ...pendingAfterCurrentControl.inputs, ...transitions.inputs];
  const inputs = exportedInputs.filter((taskInput) => inputMatchesTaskScope(taskInput, taskScope));
  return {
    inputs,
    blocked: [...currentControlRaw.blocked, ...pending.blocked, ...transitions.blocked],
    filtered_count: exportedInputs.length - inputs.length,
    suppressed_count: pendingAfterCurrentControl.suppressed_count,
  };
}

export function hydrateDomainTasks(
  db: DatabaseSync,
  paths: ReturnType<typeof familyRuntimePaths>,
  input: {
    domainId?: FamilyRuntimeDomainId;
    source: string;
    taskScope?: FamilyRuntimeTaskScope;
    domainProfiles?: FamilyRuntimeDomainProfiles;
  },
  enqueueTask: EnqueueTask,
) {
  const scopedDomainId = input.domainId ?? input.taskScope?.domainId;
  const domains = scopedDomainId ? [scopedDomainId] : [...FAMILY_RUNTIME_DOMAIN_IDS];
  const exports = [];
  let enqueuedCount = 0;
  let requeuedCount = 0;
  let idempotentNoopCount = 0;
  let blockedCount = 0;
  let filteredCount = 0;
  let suppressedCount = 0;
  for (const domainId of domains) {
    const command = exportCommandForDomain(domainId, paths, input.domainProfiles);
    if (!command) {
      exports.push({ domain_id: domainId, status: 'skipped', reason: 'export_command_not_configured' });
      continue;
    }
    const dirtyBlock = dirtyModuleExportBlock(command);
    if (dirtyBlock) {
      blockedCount += 1;
      exports.push({
        domain_id: domainId,
        ...dirtyBlock,
      });
      continue;
    }
    const result = runFamilyRuntimeDomainHandlerCommand(command.argv, {
      cwd: command.cwd,
      env: process.env,
    });
    const stdout = result.stdout ?? '';
    const stderr = result.stderr ?? '';
    const exitCode = result.exit_code;
    if (exitCode !== 0) {
      blockedCount += 1;
      exports.push({
        domain_id: domainId,
        status: result.timed_out ? 'timeout' : 'failed',
        command_preview: command.argv,
        command_cwd: command.cwd,
        command_source: command.source,
        error: domainHandlerResultErrorMessage(result, 'Domain export'),
        ...(result.recovery ? { domain_handler_recovery: result.recovery } : {}),
      });
      continue;
    }
    const output = parseDispatchOutput(stdout);
    const { inputs, blocked, filtered_count, suppressed_count } = exportedTaskInputs(
      domainId,
      output,
      input.source,
      command,
      input.taskScope,
    );
    blockedCount += blocked.length;
    filteredCount += filtered_count;
    suppressedCount += suppressed_count;
    const acceptedTasks = [];
    for (const taskInput of inputs) {
      const resultPayload = enqueueTask(db, taskInput);
      acceptedTasks.push(resultPayload);
      if (resultPayload.accepted) {
        enqueuedCount += 1;
        if (resultPayload.requeued_from_terminal) {
          requeuedCount += 1;
        }
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
      ...(result.recovery ? { domain_handler_recovery: result.recovery } : {}),
      exported_count: inputs.length + blocked.length,
      filtered_count,
      suppressed_count,
      enqueued_count: acceptedTasks.filter((task) => task.accepted).length,
      requeued_count: acceptedTasks.filter((task) => task.requeued_from_terminal).length,
      idempotent_noop_count: acceptedTasks.filter((task) => task.idempotent_noop).length,
      blocked_count: blocked.length,
      blocked,
    });
  }
  insertEvent(db, {
    eventType: 'domain_intake_completed',
    source: input.source,
    payload: {
      enqueued_count: enqueuedCount,
      requeued_count: requeuedCount,
      idempotent_noop_count: idempotentNoopCount,
      blocked_count: blockedCount,
      filtered_count: filteredCount,
      suppressed_count: suppressedCount,
      task_scope: input.taskScope ?? null,
    },
  });
  return {
    source: input.source,
    task_scope: input.taskScope ?? null,
    enqueued_count: enqueuedCount,
    requeued_count: requeuedCount,
    idempotent_noop_count: idempotentNoopCount,
    blocked_count: blockedCount,
    filtered_count: filteredCount,
    suppressed_count: suppressedCount,
    exports,
  };
}
