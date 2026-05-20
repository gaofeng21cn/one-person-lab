import type { JsonRecord } from '../runtime-tray-snapshot-types.ts';

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function recordList(value: unknown) {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function uniqueRefs<T extends { ref: string; role?: string | null }>(values: T[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = `${value.role ?? ''}:${value.ref}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function refsOnlyAuthorityBoundary() {
  return {
    opl: 'legacy_cleanup_ledger_apply_shell',
    domain: 'truth_memory_artifact_quality_export_owner',
    provider: 'runtime_slo_receipt_owner',
    can_mark_opl_owned_legacy_refs: true,
    can_write_cleanup_ledger_receipts: true,
    domain_repo_delete_requires_owner_receipt: true,
    can_move_or_delete_domain_repo_files: false,
    can_write_domain_truth: false,
    can_write_memory_body: false,
    can_read_memory_body: false,
    can_read_artifact_body: false,
    can_mutate_artifact: false,
    can_authorize_quality_verdict: false,
    can_authorize_submission_readiness: false,
    can_authorize_export_verdict: false,
    provider_completion_is_domain_ready: false,
  };
}

function buildRoute(plan: JsonRecord, mode: 'apply' | 'verify') {
  const commandDomainId = stringValue(plan.command_domain_id);
  const sourceRef = stringValue(plan.ref);
  if (!commandDomainId || !sourceRef) {
    return null;
  }
  const args = [
    'agents',
    'legacy-cleanup',
    'apply',
    '--domain',
    commandDomainId,
    '--mode',
    mode,
    '--source-ref',
    sourceRef,
  ];
  return {
    ref: `opl ${args.join(' ')}`,
    opl_cli_args: args,
    role: 'operator_action_route',
    action_id: `legacy-cleanup:${commandDomainId}:${mode}`,
    action_kind: `legacy_cleanup_${mode}`,
    owner: 'opl',
    route_target_kind: 'opl_cli',
    execution_policy: 'opl_safe_action_shell',
    execution_surface: 'opl runtime action execute',
    stage_attempt_id: null,
    domain_id: commandDomainId,
    target_domain_id: stringValue(plan.domain_id),
    stage_id: null,
    source_ref: sourceRef,
    plan_status: stringValue(plan.plan_status),
    gate_status: stringValue(plan.gate_status),
    action_count: typeof plan.action_count === 'number' ? plan.action_count : 0,
    opl_cleanup_ledger_ready: plan.opl_cleanup_ledger_ready === true,
    domain_physical_delete_requires_owner_receipt:
      plan.domain_physical_delete_requires_owner_receipt === true,
    domain_physical_delete_can_execute:
      plan.domain_physical_delete_can_execute === true,
    can_execute: false as const,
    authority_boundary: refsOnlyAuthorityBoundary(),
  };
}

export function buildLegacyCleanupActionRoutes(legacyCleanupPlanRefs: JsonRecord) {
  return uniqueRefs(recordList(legacyCleanupPlanRefs.refs)
    .filter((plan) => (
      stringValue(plan.plan_status) === 'ready'
      && plan.opl_cleanup_apply_can_execute === true
    ))
    .flatMap((plan) => [
      buildRoute(plan, 'apply'),
      buildRoute(plan, 'verify'),
    ])
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry)));
}
