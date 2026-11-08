import { createHash } from 'node:crypto';

import {
  runRuntimeOperatorActionExecute,
  type RuntimeTraySnapshotProvider,
  type runFamilyRuntime,
} from '../../adapters/execution/index.ts';
import { canonicalJsonText } from '../../kernel/canonical-json.ts';
import { FrameworkContractError, isRecord } from '../../kernel/contract-validation.ts';
import { record, recordList, stringValue } from '../../kernel/json-record.ts';
import type { FrameworkContracts } from '../../kernel/types.ts';
import { buildWorkItemProjectionV2 } from './work-item-projection/projection.ts';
import type { WorkItemProjectionItem } from './work-item-projection/types.ts';

type JsonRecord = Record<string, unknown>;

export const OPL_RUNTIME_ACTION_REF = 'opl.runtime.v1#action';

const ACTION_LABELS: Record<string, { 'zh-CN': string; 'en-US': string }> = {
  stage_attempt_query: { 'zh-CN': '查看执行状态', 'en-US': 'Read execution state' },
  stage_production_attempt_request: { 'zh-CN': '准备阶段任务', 'en-US': 'Prepare stage work' },
  stage_production_attempt_start: { 'zh-CN': '开始阶段任务', 'en-US': 'Start stage work' },
  'provider_signal:resume': { 'zh-CN': '继续任务', 'en-US': 'Resume work' },
  'provider_signal:human_gate': { 'zh-CN': '提交当前决定', 'en-US': 'Submit decision' },
};

function routeBelongsToItem(route: JsonRecord, item: WorkItemProjectionItem) {
  const attemptId = stringValue(route.stage_attempt_id);
  if (attemptId) {
    return route.action_kind === 'stage_attempt_query'
      ? [item.execution.attempt_id, ...item.execution.attempt_ids].includes(attemptId)
      : item.execution.attempt_id === attemptId;
  }
  const scopeId = stringValue(route.work_item_scope_id);
  if (scopeId) return scopeId === item.identity.work_item_scope_id;
  const workItemId = stringValue(route.work_item_id) ?? stringValue(route.domain_work_item_id);
  if (workItemId) {
    return workItemId === item.identity.work_item_id
      && stringValue(route.project_id) === item.identity.project_id
      && [item.identity.domain_id, item.identity.agent_id]
        .includes(stringValue(route.target_domain_id) ?? stringValue(route.domain_id) ?? '');
  }
  // A domain-wide route is not an item action unless this item's owner names it.
  return [route.action_id, route.ref, route.command_or_surface_ref].includes(item.action.action_ref);
}

function routeRevision(route: JsonRecord, item: WorkItemProjectionItem) {
  const executionFields = [
    'action_id', 'action_kind', 'owner', 'action_owner', 'route_target_kind',
    'ref', 'command_or_surface_ref', 'opl_cli_args', 'stage_attempt_id', 'stage_id',
    'domain_id', 'target_domain_id', 'project_id', 'work_item_id', 'domain_work_item_id',
    'work_item_scope_id', 'payload_template', 'input_schema', 'required_operator_payload_refs',
    'dispatch_identity_key', 'dispatch_identity_fields', 'stage_attempt_source_fingerprint',
  ];
  return createHash('sha256').update(canonicalJsonText({
    item_id: item.item_id,
    work_item_scope_id: item.identity.work_item_scope_id,
    observed_generation: item.lifecycle.observed_generation ?? null,
    current_stage_id: item.lifecycle.current_stage_id ?? null,
    current_attempt_id: item.execution.attempt_id,
    route: JSON.parse(JSON.stringify(Object.fromEntries(executionFields
      .filter((field) => Object.hasOwn(route, field))
      .map((field) => [field, route[field]])))),
  })).digest('hex');
}

export function runtimeActionsForItem(item: WorkItemProjectionItem, snapshot: JsonRecord) {
  const drilldown = record(snapshot.app_operator_drilldown);
  const routes = recordList(record(drilldown.operator_action_routing_refs).refs);
  const safeRoutes = recordList(record(drilldown.app_execution_bridge).safe_action_routes);
  return safeRoutes.flatMap((safe) => {
    if (safe.can_submit_to_safe_action_shell !== true
      || safe.route_status === 'blocked' || String(safe.route_status).startsWith('blocked_by_')
      || String(safe.default_actionability_status).startsWith('blocked_by_')
      || !['opl_cli', 'provider_signal'].includes(String(safe.route_target_kind))) return [];
    const route = routes.find((candidate) => candidate.action_id === safe.action_id);
    if (!route || !routeBelongsToItem(route, item)) return [];
    const actionId = stringValue(route.action_id);
    if (!actionId) return [];
    const title = stringValue(route.title) ?? stringValue(route.label)
      ?? (item.action.action_ref === actionId ? item.action.title : null)
      ?? ACTION_LABELS[String(route.action_kind)]?.['zh-CN']
      ?? stringValue(route.action_kind) ?? actionId;
    const payloadTemplate = record(route.payload_template);
    const inputSchema = isRecord(route.input_schema) ? route.input_schema
      : safe.route_requires_domain_or_app_payload === true || safe.route_target_kind === 'provider_signal'
        ? { type: 'object', title: 'Owner action input', additionalProperties: true }
        : { type: 'object', properties: {}, additionalProperties: false };
    return [{
      command_id: actionId,
      action_id: actionId,
      action_ref: OPL_RUNTIME_ACTION_REF,
      label_i18n: ACTION_LABELS[String(route.action_kind)] ?? { 'zh-CN': title, 'en-US': title },
      title,
      summary: stringValue(route.route_status_detail) ?? stringValue(route.open_reason) ?? '',
      confirmation_required: true,
      input: { item_id: item.item_id, action_id: actionId, route_revision: routeRevision(route, item) },
      input_schema: inputSchema,
      defaults: payloadTemplate,
      target: {
        item_id: item.item_id,
        work_item_id: item.identity.work_item_id,
        stage_attempt_id: stringValue(route.stage_attempt_id),
        stage_id: stringValue(route.stage_id),
        owner: stringValue(route.owner) ?? stringValue(route.action_owner),
      },
    }];
  });
}

export async function executeFrameworkMcpAppAction(input: {
  ref: string;
  input: JsonRecord;
  confirmed: boolean;
}, services: {
  contracts: FrameworkContracts;
  runtimeSnapshotProvider: RuntimeTraySnapshotProvider;
  familyRuntime: typeof runFamilyRuntime;
  projectionProvider?: typeof buildWorkItemProjectionV2;
}) {
  const itemId = stringValue(input.input.item_id);
  const actionId = stringValue(input.input.action_id);
  const revision = stringValue(input.input.route_revision);
  if (input.ref !== OPL_RUNTIME_ACTION_REF || !itemId || !actionId || !revision) {
    throw new FrameworkContractError('cli_usage_error', 'Select a current work-item action before executing it.', {
      failure_code: 'runtime_app_action_identity_required',
    });
  }
  if (!input.confirmed) {
    throw new FrameworkContractError('cli_usage_error', 'Confirm the current work-item action and input.', {
      failure_code: 'runtime_app_action_confirmation_required',
    });
  }
  const payload = input.input.payload ?? {};
  if (!isRecord(payload)) {
    throw new FrameworkContractError('cli_usage_error', 'Runtime action payload must be an object.');
  }
  if (Object.hasOwn(payload, 'action_id') || Object.hasOwn(payload, 'route_ref')) {
    throw new FrameworkContractError('cli_usage_error', 'Runtime action identity is supplied by its current route.');
  }
  let dispatched = false;
  const familyRuntime: typeof runFamilyRuntime = async (args, options) => {
    dispatched = true;
    return services.familyRuntime(args, options);
  };
  // This callback validates the very snapshot the existing executor will use.
  // No cached UI route, command text or caller-supplied target is executed.
  const checkedSnapshot: RuntimeTraySnapshotProvider = async (contracts, options) => {
    const snapshot = await services.runtimeSnapshotProvider(contracts, options);
    const projection = (services.projectionProvider ?? buildWorkItemProjectionV2)({ profile: 'full' });
    const item = projection.items.find((candidate) => candidate.item_id === itemId
      && candidate.visibility.state === 'visible');
    const action = item && runtimeActionsForItem(item, snapshot.runtime_tray_snapshot)
      .find((candidate) => candidate.action_id === actionId);
    if (!action || action.input.route_revision !== revision) {
      throw new FrameworkContractError('cli_usage_error', 'The work-item action changed. Refresh before confirming again.', {
        failure_code: 'runtime_app_action_changed', item_id: itemId, action_id: actionId,
      });
    }
    return snapshot;
  };
  let result: JsonRecord;
  try {
    result = await runRuntimeOperatorActionExecute(services.contracts, [
      '--action', actionId, '--payload', JSON.stringify(payload),
    ], { runtimeSnapshotProvider: checkedSnapshot, familyRuntime });
  } catch (error) {
    if (!dispatched) throw error;
    throw new FrameworkContractError('cli_usage_error',
      'The runtime call did not return a confirmed result. Read current task state before retrying.', {
        failure_code: 'runtime_app_action_outcome_unknown',
        dispatch_status: 'unknown_after_dispatch', item_id: itemId, action_id: actionId,
        readback_ref: 'opl.runtime.v1#item',
        ...(error instanceof FrameworkContractError ? { cause_code: error.code } : {}),
      });
  }
  const execution = record(record(result.runtime_operator_action_execution).execution);
  return {
    opl_app_contribution: {
      surface_kind: 'opl_app_package_contribution.v1',
      package_id: 'opl-runtime', ref: input.ref, operation: 'execute', confirmation_required: true,
      response: {
        schema_version: 'opl-package-app-contribution-response.v1',
        ok: true, ref: input.ref, operation: 'execute',
        result: {
          item_id: itemId,
          action_id: actionId,
          execution_status: execution.execution_status,
          ...result,
        },
      },
    },
  };
}
