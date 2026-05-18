import type { FrameworkContracts } from './types.ts';
import { FrameworkContractError } from './contracts.ts';
import { buildRuntimeTraySnapshot } from './runtime-tray-snapshot.ts';
import { runFamilyRuntime } from './family-runtime.ts';
import type { FamilyRuntimeDomainId } from './family-runtime-command.ts';

type JsonRecord = Record<string, unknown>;

type RuntimeActionExecuteOptions = {
  actionId: string;
  payload: JsonRecord;
  dryRun: boolean;
  approveDomainAction: boolean;
};

function parseJsonObject(value: string, context: string): JsonRecord {
  const parsed = JSON.parse(value);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new FrameworkContractError('cli_usage_error', `${context} must be a JSON object.`, {
      context,
    });
  }
  return parsed as JsonRecord;
}

function parseRuntimeActionExecuteArgs(args: string[]): RuntimeActionExecuteOptions {
  let actionId = '';
  let payload: JsonRecord = {};
  let dryRun = false;
  let approveDomainAction = false;
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    const value = args[index + 1];
    if (token === '--action' && value) {
      actionId = value;
      index += 1;
    } else if (token === '--payload' && value) {
      payload = parseJsonObject(value, '--payload');
      index += 1;
    } else if (token === '--dry-run') {
      dryRun = true;
    } else if (token === '--approve-domain-action') {
      approveDomainAction = true;
    } else {
      throw new FrameworkContractError('cli_usage_error', `Unknown runtime action execute option: ${token}.`, {
        option: token,
        usage: 'opl runtime action execute --action <action_id> [--payload <json>] [--dry-run] [--approve-domain-action]',
      });
    }
  }
  if (!actionId) {
    throw new FrameworkContractError('cli_usage_error', 'runtime action execute requires --action.', {
      required: ['--action'],
    });
  }
  return { actionId, payload, dryRun, approveDomainAction };
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function actionRoutesFromSnapshot(snapshot: JsonRecord) {
  const drilldown = isRecord(snapshot.app_operator_drilldown) ? snapshot.app_operator_drilldown : {};
  const refs = isRecord(drilldown.operator_action_routing_refs)
    && Array.isArray(drilldown.operator_action_routing_refs.refs)
    ? drilldown.operator_action_routing_refs.refs
    : [];
  return refs.filter(isRecord);
}

function providerSignalKind(actionKind: string) {
  if (actionKind === 'provider_signal:resume') {
    return 'resume';
  }
  if (actionKind === 'provider_signal:human_gate') {
    return 'human_gate';
  }
  throw new FrameworkContractError('contract_shape_invalid', 'Unsupported provider signal route.', {
    action_kind: actionKind,
    allowed_action_kinds: ['provider_signal:resume', 'provider_signal:human_gate'],
  });
}

function stageAttemptQueryArgs(commandOrSurfaceRef: string) {
  const match = commandOrSurfaceRef.match(/^opl family-runtime attempt query ([A-Za-z0-9_.:-]+)$/);
  if (!match) {
    throw new FrameworkContractError('contract_shape_invalid', 'Unsupported OPL action command route.', {
      command_or_surface_ref: commandOrSurfaceRef,
      supported_command: 'opl family-runtime attempt query <stage_attempt_id>',
    });
  }
  return ['attempt', 'query', match[1]];
}

function domainIdFromRoute(route: JsonRecord): FamilyRuntimeDomainId {
  const domainId = stringValue(route.domain_id);
  if (domainId === 'medautoscience' || domainId === 'medautogrant' || domainId === 'redcube') {
    return domainId;
  }
  throw new FrameworkContractError('contract_shape_invalid', 'Unsupported domain route id.', {
    domain_id: domainId,
    allowed_domain_ids: ['medautoscience', 'medautogrant', 'redcube'],
  });
}

function executionBoundary() {
  return {
    opl: 'operator_action_execution_shell_and_typed_queue_owner',
    provider: 'provider_signal_receipt_owner',
    domain: 'domain_sidecar_direct_skill_and_truth_owner',
    can_write_domain_truth: false,
    can_read_memory_body: false,
    can_read_artifact_body: false,
    can_authorize_quality_verdict: false,
    can_authorize_export_verdict: false,
    provider_completion_is_domain_ready: false,
  };
}

async function executeRoute(route: JsonRecord, options: RuntimeActionExecuteOptions) {
  const actionKind = stringValue(route.action_kind) ?? '';
  const owner = stringValue(route.owner) ?? stringValue(route.action_owner) ?? '';
  const targetKind = stringValue(route.route_target_kind) ?? '';
  const commandOrSurfaceRef = stringValue(route.ref) ?? stringValue(route.command_or_surface_ref) ?? '';
  const stageAttemptId = stringValue(route.stage_attempt_id) ?? '';

  if (targetKind === 'app_surface') {
    return {
      execution_status: 'projected',
      execution_kind: 'app_surface_projection',
      route_ref: commandOrSurfaceRef,
      action_kind: actionKind,
      executed_runtime_command: null,
    };
  }

  if (owner === 'opl' && targetKind === 'opl_cli') {
    const runtimeArgs = stageAttemptQueryArgs(commandOrSurfaceRef);
    return {
      execution_status: options.dryRun ? 'dry_run' : 'executed',
      execution_kind: 'opl_cli_internal',
      route_ref: commandOrSurfaceRef,
      action_kind: actionKind,
      executed_runtime_command: `opl family-runtime ${runtimeArgs.join(' ')}`,
      result: options.dryRun ? null : await runFamilyRuntime(runtimeArgs),
    };
  }

  if (owner === 'provider' && targetKind === 'provider_signal') {
    if (!stageAttemptId) {
      throw new FrameworkContractError('contract_shape_invalid', 'Provider signal route requires a stage attempt id.', {
        action_id: options.actionId,
      });
    }
    const signalKind = providerSignalKind(actionKind);
    const runtimeArgs = [
      'attempt',
      'signal',
      stageAttemptId,
      '--kind',
      signalKind,
      '--payload',
      JSON.stringify({
        route_ref: commandOrSurfaceRef,
        action_id: options.actionId,
        ...options.payload,
      }),
      '--source',
      'app_operator_action_execute',
    ];
    return {
      execution_status: options.dryRun ? 'dry_run' : 'executed',
      execution_kind: 'provider_signal',
      route_ref: commandOrSurfaceRef,
      action_kind: actionKind,
      executed_runtime_command: `opl family-runtime ${runtimeArgs.join(' ')}`,
      result: options.dryRun ? null : await runFamilyRuntime(runtimeArgs),
    };
  }

  if (owner === 'domain' && (targetKind === 'domain_sidecar' || targetKind === 'direct_skill')) {
    const domainId = domainIdFromRoute(route);
    const taskPayload = {
      action: actionKind,
      action_id: options.actionId,
      route_target_kind: targetKind,
      command_or_surface_ref: commandOrSurfaceRef,
      stage_attempt_id: stageAttemptId || null,
      stage_id: stringValue(route.stage_id),
      operator_payload: options.payload,
      authority_boundary: executionBoundary(),
    };
    const runtimeArgs = [
      'enqueue',
      '--domain',
      domainId,
      '--task-kind',
      actionKind || targetKind,
      '--payload',
      JSON.stringify(taskPayload),
      '--dedupe-key',
      `operator-action:${options.actionId}`,
      '--source',
      'app_operator_action_execute',
      ...(options.approveDomainAction ? [] : ['--requires-approval']),
    ];
    return {
      execution_status: options.dryRun ? 'dry_run' : 'queued',
      execution_kind: 'domain_action_typed_queue_handoff',
      route_ref: commandOrSurfaceRef,
      action_kind: actionKind,
      approval_policy: options.approveDomainAction ? 'queued_without_extra_approval' : 'queued_waiting_approval',
      executed_runtime_command: `opl family-runtime ${runtimeArgs.join(' ')}`,
      result: options.dryRun ? null : await runFamilyRuntime(runtimeArgs),
    };
  }

  throw new FrameworkContractError('contract_shape_invalid', 'Unsupported operator action route.', {
    action_id: options.actionId,
    owner,
    route_target_kind: targetKind,
    action_kind: actionKind,
  });
}

export async function runRuntimeOperatorActionExecute(
  contracts: FrameworkContracts,
  args: string[],
) {
  const options = parseRuntimeActionExecuteArgs(args);
  const snapshotEnvelope = await buildRuntimeTraySnapshot(contracts);
  const snapshot = snapshotEnvelope.runtime_tray_snapshot as JsonRecord;
  const route = actionRoutesFromSnapshot(snapshot).find((candidate) => (
    stringValue(candidate.action_id) === options.actionId
  ));
  if (!route) {
    throw new FrameworkContractError('cli_usage_error', 'Operator action route not found in current runtime snapshot.', {
      action_id: options.actionId,
    });
  }

  const execution = await executeRoute(route, options);
  return {
    runtime_operator_action_execution: {
      surface_kind: 'opl_runtime_operator_action_execution',
      action_id: options.actionId,
      dry_run: options.dryRun,
      route,
      execution,
      authority_boundary: executionBoundary(),
      non_goals: [
        'does_not_write_domain_truth',
        'does_not_read_or_store_memory_body',
        'does_not_read_or_mutate_artifact_body',
        'does_not_authorize_quality_readiness_or_export_verdict',
      ],
    },
  };
}
