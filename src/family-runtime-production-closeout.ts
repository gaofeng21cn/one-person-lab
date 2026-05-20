import type { FrameworkContracts } from './types.ts';
import { buildRuntimeTraySnapshot } from './runtime-tray-snapshot.ts';
import type { FamilyRuntimeProviderKind } from './family-runtime-types.ts';
import { buildProductionTailNextActionLedger } from './production-evidence-tail-ledger.ts';

type JsonRecord = Record<string, unknown>;

type ProductionCloseoutInput = {
  familyDefaults: boolean;
  providerKind: FamilyRuntimeProviderKind;
  executorKind: 'codex_cli';
};

const NOT_AUTHORIZED_CLAIMS = [
  'domain_truth_write',
  'domain_ready',
  'domain_ready_verdict',
  'quality_verdict',
  'artifact_authority',
  'artifact_authority_verdict',
  'memory_body_access',
  'production_ready',
  'submission_or_export_readiness_verdict',
];

const CLOSEOUT_ACTION_KINDS = new Set([
  'provider_scheduler_status',
  'provider_scheduler_install',
  'provider_scheduler_trigger',
  'provider_scheduler_tick',
  'stage_production_attempt_request',
  'external_evidence_receipt_verify',
  'evidence_gate_receipt_verify',
  'legacy_cleanup_verify',
]);

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function record(value: unknown): JsonRecord {
  return isRecord(value) ? value : {};
}

function recordList(value: unknown) {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function stringList(value: unknown) {
  return Array.isArray(value)
    ? value.map(stringValue).filter((entry): entry is string => Boolean(entry))
    : [];
}

function commandRef(args: string[]) {
  if (args[0] === 'agents') {
    return `opl ${args.join(' ')}`;
  }
  return `opl family-runtime ${args.join(' ')}`;
}

function firstRef(value: unknown) {
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      if (typeof entry === 'string' && entry.trim()) {
        return entry.trim();
      }
      if (isRecord(entry)) {
        const ref = stringValue(entry.ref) ?? stringValue(entry.source_ref);
        if (ref) {
          return ref;
        }
      }
    }
  }
  return null;
}

function freshnessRef(route: JsonRecord) {
  return stringValue(route.evidence_source_ref)
    ?? stringValue(route.source_ref)
    ?? firstRef(route.monitor_refs)
    ?? firstRef(route.runtime_event_refs)
    ?? firstRef(route.source_scope_refs)
    ?? stringValue(route.schedule_id)
    ?? '/runtime_tray_snapshot/app_operator_drilldown';
}

function readOnlyClaimScope(route: JsonRecord) {
  const actionKind = stringValue(route.action_kind) ?? 'operator_action';
  if (actionKind === 'stage_production_attempt_request') {
    return 'stage_production_caller_request';
  }
  if (actionKind.startsWith('external_evidence')) {
    return 'external_evidence_receipt';
  }
  if (actionKind.startsWith('evidence_gate')) {
    return 'evidence_gate_receipt';
  }
  if (actionKind.startsWith('legacy_cleanup')) {
    return 'legacy_cleanup_ledger';
  }
  if (actionKind.startsWith('provider_scheduler')) {
    return 'provider_scheduler_cadence';
  }
  return actionKind;
}

function readOnlyExpectedRefs(route: JsonRecord) {
  return [
    ...stringList(route.expected_receipt_refs),
    ...stringList(route.missing_production_evidence),
    ...stringList(route.required_evidence_refs),
    ...stringList(route.monitor_refs),
    ...stringList(route.runtime_event_refs),
  ];
}

function readOnlyCloseoutItem(route: JsonRecord, index: number) {
  const actionId = stringValue(route.action_id) ?? `route:${index + 1}`;
  const actionKind = stringValue(route.action_kind) ?? 'operator_action';
  const typedBlockerRefs = stringList(route.typed_blocker_refs);
  const freshnessRefs = [
    ...stringList(route.freshness_refs),
    ...stringList(route.monitor_refs),
  ];
  return {
    item_id: `production-closeout:${actionId}`,
    action_id: actionId,
    action_kind: actionKind,
    claim_scope: readOnlyClaimScope(route),
    owner: stringValue(route.owner) ?? stringValue(route.action_owner) ?? 'opl',
    domain_id: stringValue(route.domain_id) ?? stringValue(route.target_domain_id),
    stage_id: stringValue(route.stage_id),
    mode: actionKind.endsWith('_verify') || actionKind === 'provider_scheduler_status'
      ? 'verify'
      : 'request_or_apply_via_safe_action',
    status: 'open_safe_action_request_route_available',
    closeout_item_is_completion_claim: false,
    route_status: stringValue(route.route_status) ?? 'request_route_available',
    route_semantics: 'open_safe_action_request_apply_verify_route',
    receipt_ref: null,
    receipt_refs: [],
    typed_blocker_ref: typedBlockerRefs[0] ?? null,
    typed_blocker_refs: typedBlockerRefs,
    replay_ref: stringValue(route.ref)
      ?? stringValue(route.action_ref)
      ?? `opl runtime action execute --action ${actionId}`,
    freshness_ref: freshnessRefs[0] ?? freshnessRef(route),
    freshness_refs: freshnessRefs,
    expected_refs: readOnlyExpectedRefs(route),
    blocked_reason: stringValue(route.blocked_reason),
    not_authorized_claims: [...NOT_AUTHORIZED_CLAIMS],
  };
}

function readOnlyRouteMatchesDefaults(route: JsonRecord, input: ProductionCloseoutInput) {
  const actionKind = stringValue(route.action_kind) ?? '';
  const args = stringList(route.opl_cli_args);
  const closeoutKind = actionKind.startsWith('provider_scheduler_')
    || actionKind === 'stage_production_attempt_request'
    || actionKind.startsWith('external_evidence_')
    || actionKind.startsWith('evidence_gate_')
    || actionKind.startsWith('legacy_cleanup_');
  if (!closeoutKind || stringValue(route.owner) !== 'opl') {
    return false;
  }
  if (actionKind.startsWith('provider_scheduler_')) {
    const providerIndex = args.indexOf('--provider');
    return (stringValue(route.provider_kind) ?? args[providerIndex + 1]) === input.providerKind;
  }
  if (actionKind === 'stage_production_attempt_request') {
    const providerIndex = args.indexOf('--provider');
    const executorIndex = args.indexOf('--executor-kind');
    return providerIndex >= 0
      && args[providerIndex + 1] === input.providerKind
      && executorIndex >= 0
      && args[executorIndex + 1] === input.executorKind;
  }
  return true;
}

function authorityBoundary() {
  return {
    opl: 'production_closeout_derived_attention_lens_for_refs_only_safe_action_routes',
    provider: 'temporal_scheduler_and_provider_slo_receipt_owner',
    domain: 'truth_quality_artifact_domain_ready_owner',
    can_write_domain_truth: false,
    can_read_memory_body: false,
    can_read_artifact_body: false,
    can_mutate_artifact: false,
    can_authorize_domain_ready: false,
    can_authorize_quality_verdict: false,
    can_authorize_artifact_or_export_verdict: false,
    can_claim_production_ready: false,
    provider_completion_is_domain_ready: false,
  };
}

export async function runFamilyRuntimeProductionCloseout(
  contracts: FrameworkContracts,
  input: ProductionCloseoutInput,
) {
  const snapshot = await buildRuntimeTraySnapshot(contracts, {
    appOperatorDrilldownDetailLevel: 'full',
    providerKind: input.providerKind,
  });
  const drilldown = record(snapshot.runtime_tray_snapshot.app_operator_drilldown);
  const bridge = record(drilldown.app_execution_bridge);
  const routes = recordList(bridge.safe_action_routes).filter((route) =>
    readOnlyRouteMatchesDefaults(route, input)
  );
  const closeoutItems = routes.map(readOnlyCloseoutItem);
  const openItems = closeoutItems.filter((item) =>
    item.status === 'open_safe_action_request_route_available'
  );
  const closedItems = closeoutItems.filter((item) =>
    item.status !== 'open_safe_action_request_route_available'
  );
  const nextActionLedger = buildProductionTailNextActionLedger({
    surfaceKind: 'opl_family_runtime_production_tail_next_action_ledger',
    sourceTailSummary: {
      tail_item_count: closeoutItems.length,
      open_tail_item_count: openItems.length,
      typed_blocker_tail_item_count:
        closeoutItems.filter((item) => item.status === 'closed_by_domain_owned_typed_blocker').length,
      closed_tail_item_count: closedItems.length,
    },
    tailItems: closeoutItems,
    sourceRef: '/family_runtime_production_closeout/closeout_items',
  });
  return {
    version: 'g2',
    family_runtime_production_closeout: {
      surface_kind: 'opl_family_runtime_production_closeout',
      surface_role: 'derived_operator_attention_lens',
      lens_policy: 'derived_attention_lens_over_open_safe_action_request_apply_verify_routes',
      closeout_mode: 'dry_run_summary',
      family_defaults: input.familyDefaults === true,
      selected_provider: input.providerKind,
      effective_provider: stringValue(record(snapshot.runtime_tray_snapshot.runtime_health).provider_kind)
        ?? input.providerKind,
      selected_executor_kind: input.executorKind,
      route_source: 'opl runtime app-operator-drilldown --detail full',
      action_execution_surface: 'opl runtime action execute',
      orchestration_policy:
        'reads_app_operator_safe_action_routes_and_reports_refs_only_closure_without_domain_authority',
      apply_supported: false,
      apply_policy:
        'batch_apply_is_not_supported_here; execute individual refs-only safe action routes through opl runtime action execute',
      summary: {
        closeout_item_count: closeoutItems.length,
        closed_item_count: closedItems.length,
        open_safe_action_item_count: openItems.length,
        production_closeout_open_safe_action_item_count: openItems.length,
        next_action_item_count: nextActionLedger.summary.next_action_item_count,
        next_action_group_count: nextActionLedger.summary.next_action_group_count,
        provider_scheduler_item_count: closeoutItems.filter((item) =>
          item.claim_scope === 'provider_scheduler_cadence'
        ).length,
        stage_production_caller_item_count: closeoutItems.filter((item) =>
          item.claim_scope === 'stage_production_caller_request'
        ).length,
        external_evidence_item_count: closeoutItems.filter((item) =>
          item.claim_scope === 'external_evidence_receipt'
        ).length,
        evidence_gate_item_count: closeoutItems.filter((item) =>
          item.claim_scope === 'evidence_gate_receipt'
        ).length,
        legacy_cleanup_item_count: closeoutItems.filter((item) =>
          item.claim_scope === 'legacy_cleanup_ledger'
        ).length,
        domain_ready_authorized: false,
        production_ready_authorized: false,
        not_authorized_claims: [...NOT_AUTHORIZED_CLAIMS],
      },
      production_closeout_open_safe_action_item_count: openItems.length,
      closeout_items: closeoutItems,
      attention_queue: openItems.map((item) => ({
        item_id: item.item_id,
        owner: item.owner,
        domain_id: item.domain_id,
        stage_id: item.stage_id,
        claim_scope: item.claim_scope,
        next_safe_action_ref: item.replay_ref,
        missing_or_expected_refs: item.expected_refs,
      })),
      next_action_ledger: nextActionLedger,
      source_refs: {
        app_operator_drilldown_ref: '/runtime_tray_snapshot/app_operator_drilldown',
        app_execution_bridge_ref: '/runtime_tray_snapshot/app_operator_drilldown/app_execution_bridge',
      },
      authority_boundary: authorityBoundary(),
      not_authorized_claims: [...NOT_AUTHORIZED_CLAIMS],
    },
  };
}
