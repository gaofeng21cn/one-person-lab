import {
  buildOperatorActionRoute,
  recordList,
  stringValue,
  uniqueRefs,
} from './value-utils.ts';
import type { JsonRecord } from '../../../kernel/json-record.ts';
import {
  buildAppDrilldownRefsOnlyAuthorityBoundaryCore,
} from './authority-boundary.ts';

function refsOnlyAuthorityBoundary() {
  return {
    opl: 'legacy_cleanup_ledger_apply_shell',
    provider: 'runtime_slo_receipt_owner',
    can_mark_opl_owned_legacy_refs: true,
    can_write_cleanup_ledger_receipts: true,
    domain_repo_delete_requires_owner_receipt: true,
    can_move_or_delete_domain_repo_files: false,
    ...buildAppDrilldownRefsOnlyAuthorityBoundaryCore(),
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
  return buildOperatorActionRoute(args, {
    action_id: `legacy-cleanup:${commandDomainId}:${mode}`,
    action_kind: `legacy_cleanup_${mode}`,
    worklist_attention_class: 'audit_cleanup_lane',
    ordinary_open_safe_action_attention: false,
    default_selected_action_eligible: false,
    default_planning_root_allowed: false,
    domain_id: commandDomainId,
    target_domain_id: stringValue(plan.domain_id),
    source_ref: sourceRef,
    plan_status: stringValue(plan.plan_status),
    gate_status: stringValue(plan.gate_status),
    opl_cleanup_ledger_ready: plan.opl_cleanup_ledger_ready === true,
    domain_physical_delete_requires_owner_receipt:
      plan.domain_physical_delete_requires_owner_receipt !== false,
    domain_physical_delete_can_execute: plan.domain_physical_delete_can_execute === true,
    action_count: typeof plan.action_count === 'number' ? plan.action_count : 0,
    authority_boundary: refsOnlyAuthorityBoundary(),
  }, `opl ${args.join(' ')}`);
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
