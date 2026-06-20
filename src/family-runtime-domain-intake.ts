import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

import {
  type EnqueueInput,
  FAMILY_RUNTIME_DOMAIN_IDS,
  type FamilyRuntimeDomainProfiles,
  type FamilyRuntimeTaskScope,
  type FamilyRuntimeDomainId,
} from './family-runtime-command.ts';
import {
  familyRuntimePaths,
  insertEvent,
  type FamilyRuntimeTaskRow,
  type taskToPayload,
} from './family-runtime-store.ts';
import { listStageAttemptsForTask } from './family-runtime-stage-attempt-ledger.ts';
import {
  runFamilyRuntimeDomainHandlerCommand,
  domainHandlerResultErrorMessage,
} from './family-runtime-domain-handler-process.ts';
import { resolveOplModuleExecCommand } from './system-installation/modules.ts';
import type { ModuleInspection } from './system-installation/shared.ts';
import { taskInputMatchesScope, taskRowMatchesScope } from './family-runtime-task-scope.ts';
import {
  activeMedautoscienceWorkspaceProfile,
  resolveExplicitMedautoscienceDomainProfile,
} from './family-runtime-medautoscience-profile.ts';
import {
  currentControlProviderAdmissionInputs,
  publishExistingCurrentControlProviderAdmissionReadbacks,
  publishCurrentControlProviderAdmissionReadback,
} from './family-runtime-domain-intake-parts/current-control-provider-admission.ts';
import {
  consumePaperAutonomySupervisorDecisionRequests,
} from './family-runtime-domain-intake-parts/paper-autonomy-supervisor-decision.ts';
import {
  reconcileCurrentControlExecutableOwners,
  suppressExistingStaleDefaultExecutorRowsForBlockedCurrentControl,
  suppressStaleDefaultExecutorInputs,
} from './family-runtime-domain-intake-parts/current-control-reconciliation.ts';
import { toPendingTaskInputs } from './family-runtime-domain-intake-parts/pending-task-inputs.ts';
import { transitionTaskInputsFromMatrix } from './family-runtime-domain-intake-parts/transition-task-inputs.ts';

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
  current_control_provider_admission_consumed?: Record<string, unknown>;
  idempotent_noop?: boolean;
  task?: ReturnType<typeof taskToPayload>;
};

type EnqueueTask = (db: DatabaseSync, input: EnqueueInput) => EnqueueTaskResult;

type IntakeBlocked = {
  reason: string;
  task: unknown;
  repair_action?: Record<string, unknown>;
};

function optionalPublicationString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function currentControlPublicationKey(publication: Record<string, unknown>) {
  const studyId = optionalPublicationString(publication.study_id);
  const idempotencyKey = optionalPublicationString(publication.idempotency_key);
  return studyId && idempotencyKey ? `${studyId}::${idempotencyKey}` : null;
}

function currentControlPublicationRank(publication: Record<string, unknown>) {
  const status = optionalPublicationString(publication.status);
  if (status === 'provider_admission_terminal_consumed') {
    return 3;
  }
  if (status === 'transition_non_advancing_apply_recorded') {
    return 2;
  }
  return 1;
}

function mergeCurrentControlReadbackPublications(publications: Array<Record<string, unknown>>) {
  const merged: Array<Record<string, unknown>> = [];
  const indexesByKey = new Map<string, number>();
  for (const publication of publications) {
    const key = currentControlPublicationKey(publication);
    if (!key) {
      merged.push(publication);
      continue;
    }
    const existingIndex = indexesByKey.get(key);
    if (existingIndex === undefined) {
      indexesByKey.set(key, merged.length);
      merged.push(publication);
      continue;
    }
    const existing = merged[existingIndex];
    if (currentControlPublicationRank(publication) >= currentControlPublicationRank(existing)) {
      merged[existingIndex] = publication;
    }
  }
  return merged;
}

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

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function blockedDomainId(
  domainId: FamilyRuntimeDomainId,
  task: Record<string, unknown>,
): FamilyRuntimeDomainId {
  const declared = optionalString(task.domain_id)?.toLowerCase();
  return declared && FAMILY_RUNTIME_DOMAIN_IDS.includes(declared as FamilyRuntimeDomainId)
    ? declared as FamilyRuntimeDomainId
    : domainId;
}

function blockedTaskKind(task: Record<string, unknown>) {
  const explicitTaskKind = optionalString(task.task_kind) ?? optionalString(task.recommended_task_kind);
  if (explicitTaskKind) {
    return explicitTaskKind;
  }
  if (
    optionalString(task.status) === 'provider_admission_pending'
    || optionalString(task.provider_admission_schema_source)
    || isRecord(task.current_control_command_outbox_record)
    || isRecord(task.opl_domain_progress_transition_request)
  ) {
    return 'domain_owner/default-executor-dispatch';
  }
  const result = isRecord(task.result) ? task.result : task;
  if (optionalString(result.surface_kind) === 'family_transition_result') {
    return 'family_transition/domain_tick';
  }
  return null;
}

function blockedScopeInput(
  domainId: FamilyRuntimeDomainId,
  blocked: IntakeBlocked,
) {
  if (!isRecord(blocked.task)) {
    return null;
  }
  const taskKind = blockedTaskKind(blocked.task);
  if (!taskKind) {
    return null;
  }
  return {
    domainId: blockedDomainId(domainId, blocked.task),
    taskKind,
    payload: isRecord(blocked.task.payload) ? blocked.task.payload : blocked.task,
  };
}

function blockedMatchesScope(
  domainId: FamilyRuntimeDomainId,
  blocked: IntakeBlocked,
  taskScope?: FamilyRuntimeTaskScope,
) {
  if (!taskScope) {
    return true;
  }
  if (taskScope.domainId && taskScope.domainId !== domainId) {
    return false;
  }
  const scopeInput = blockedScopeInput(domainId, blocked);
  if (scopeInput) {
    return taskInputMatchesScope(scopeInput, taskScope);
  }
  return !taskScope.taskKind && !taskScope.payloadMatches?.length;
}

function exportedTaskInputs(
  domainId: FamilyRuntimeDomainId,
  output: Record<string, unknown>,
  source: string,
  exportContext: DomainExportCommand,
  taskScope?: FamilyRuntimeTaskScope,
) {
  const pending = toPendingTaskInputs(domainId, output, source, exportContext);
  const currentControlRaw = currentControlProviderAdmissionInputs(domainId, output, exportContext, pending.inputs);
  const currentControlInputs = reconcileCurrentControlExecutableOwners(
    currentControlRaw.inputs,
    pending.inputs,
  );
  const pendingAfterCurrentControl = suppressStaleDefaultExecutorInputs(
    pending.inputs,
    currentControlInputs,
    currentControlRaw.blocked,
  );
  const transitions = transitionTaskInputsFromMatrix(domainId, output, source);
  const exportedInputs = [...currentControlInputs, ...pendingAfterCurrentControl.inputs, ...transitions.inputs];
  const inputs = exportedInputs.filter((taskInput) => taskInputMatchesScope(taskInput, taskScope));
  const blocked = [...currentControlRaw.blocked, ...pending.blocked, ...transitions.blocked]
    .filter((entry) => blockedMatchesScope(domainId, entry, taskScope));
  return {
    inputs,
    blocked,
    current_control_readback_publications: currentControlRaw.current_control_readback_publications,
    filtered_count: exportedInputs.length - inputs.length,
    suppressed_count: pendingAfterCurrentControl.suppressed_count,
  };
}

function rowsForCurrentControlExistingRowSuppression(
  db: DatabaseSync,
  taskScope?: FamilyRuntimeTaskScope,
) {
  return (db.prepare('SELECT * FROM tasks').all() as FamilyRuntimeTaskRow[])
    .filter((row) => taskRowMatchesScope(row, taskScope));
}

function rowsForExistingCurrentControlReadbackPublication(
  db: DatabaseSync,
  taskScope?: FamilyRuntimeTaskScope,
) {
  return (db.prepare('SELECT * FROM tasks').all() as FamilyRuntimeTaskRow[])
    .filter((row) => taskRowMatchesScope(row, taskScope))
    .filter((row) => row.domain_id === 'medautoscience'
      && row.task_kind === 'domain_owner/default-executor-dispatch'
      && ['succeeded', 'completed'].includes(row.status));
}

function stageAttemptsForExistingCurrentControlRows(
  db: DatabaseSync,
  rows: FamilyRuntimeTaskRow[],
) {
  const byTask = new Map<string, ReturnType<typeof listStageAttemptsForTask>>();
  for (const row of rows) {
    byTask.set(row.task_id, listStageAttemptsForTask(db, row.task_id));
  }
  return byTask;
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
  let paperAutonomySupervisorDecisionConsumedCount = 0;
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
    const {
      inputs,
      blocked,
      current_control_readback_publications,
      filtered_count,
      suppressed_count,
    } = exportedTaskInputs(
      domainId,
      output,
      input.source,
      command,
      input.taskScope,
    );
    const supervisorDecisionRequests = consumePaperAutonomySupervisorDecisionRequests({
      inputs,
      paths,
    });
    const existingSuppressedCount = suppressExistingStaleDefaultExecutorRowsForBlockedCurrentControl(
      db,
      rowsForCurrentControlExistingRowSuppression(db, input.taskScope),
      [...blocked, ...supervisorDecisionRequests.blocked],
      input.source,
    );
    blockedCount += blocked.length + supervisorDecisionRequests.blocked.length;
    paperAutonomySupervisorDecisionConsumedCount += supervisorDecisionRequests.consumed.length;
    filteredCount += filtered_count;
    suppressedCount += suppressed_count + existingSuppressedCount;
    const acceptedTasks = [];
    const currentControlReadbackPublications: Array<Record<string, unknown>> = [
      ...current_control_readback_publications,
    ];
    for (const consumed of supervisorDecisionRequests.consumed) {
      insertEvent(db, {
        domainId,
        eventType: 'paper_autonomy_supervisor_decision_request_consumed',
        source: input.source,
        payload: consumed,
      });
    }
    for (const taskInput of supervisorDecisionRequests.inputs) {
      const resultPayload = enqueueTask(db, taskInput);
      acceptedTasks.push(resultPayload);
      const published = publishCurrentControlProviderAdmissionReadback({
        output,
        taskInput,
        taskResult: resultPayload,
      });
      if (published.published) {
        currentControlReadbackPublications.push(published);
      }
      if (resultPayload.accepted) {
        enqueuedCount += 1;
        if (resultPayload.requeued_from_terminal) {
          requeuedCount += 1;
        }
      } else if (resultPayload.idempotent_noop) {
        idempotentNoopCount += 1;
      }
    }
    const existingCurrentControlRows = rowsForExistingCurrentControlReadbackPublication(db, input.taskScope);
    currentControlReadbackPublications.push(
      ...publishExistingCurrentControlProviderAdmissionReadbacks({
        output,
        existingTasks: existingCurrentControlRows,
        stageAttemptsByTask: stageAttemptsForExistingCurrentControlRows(db, existingCurrentControlRows),
      }),
    );
    const mergedCurrentControlReadbackPublications = mergeCurrentControlReadbackPublications(
      currentControlReadbackPublications,
    );
    exports.push({
      domain_id: domainId,
      status: 'completed',
      command_preview: command.argv,
      command_cwd: command.cwd,
      command_source: command.source,
      ...(result.recovery ? { domain_handler_recovery: result.recovery } : {}),
      exported_count: inputs.length + blocked.length,
      filtered_count,
      suppressed_count: suppressed_count + existingSuppressedCount,
      enqueued_count: acceptedTasks.filter((task) => task.accepted).length,
      requeued_count: acceptedTasks.filter((task) => task.requeued_from_terminal).length,
      idempotent_noop_count: acceptedTasks.filter((task) => task.idempotent_noop).length,
      blocked_count: blocked.length + supervisorDecisionRequests.blocked.length,
      paper_autonomy_supervisor_decision_request_consumed_count: supervisorDecisionRequests.consumed.length,
      paper_autonomy_supervisor_decision_request_consumed: supervisorDecisionRequests.consumed,
      current_control_readback_publication_count: mergedCurrentControlReadbackPublications.length,
      current_control_readback_publications: mergedCurrentControlReadbackPublications,
      blocked: [...blocked, ...supervisorDecisionRequests.blocked],
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
      paper_autonomy_supervisor_decision_request_consumed_count: paperAutonomySupervisorDecisionConsumedCount,
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
    paper_autonomy_supervisor_decision_request_consumed_count: paperAutonomySupervisorDecisionConsumedCount,
    exports,
  };
}
