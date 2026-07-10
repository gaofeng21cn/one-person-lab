import {
  domainOwnerPayloadSummaryTargetKey,
  listDomainOwnerPayloadSummaryReceipts,
  type DomainOwnerPayloadSummaryReceipt,
} from '../../ledger/index.ts';
import type { JsonRecord } from '../runtime-tray-snapshot-types.ts';
import {
  buildOperatorActionRoute,
  commandRef,
  record,
  recordList,
  runtimeActionExecuteCommand,
  stringList,
  stringValue,
} from './value-utils.ts';

type DomainOwnerPayloadSummaryActionRoute = JsonRecord & {
  ref: string;
  role: 'operator_action_route';
  action_id: string;
  action_kind:
    | 'domain_owner_payload_summary_receipt_record'
    | 'domain_owner_payload_summary_receipt_verify';
  owner: 'opl';
  route_target_kind: 'opl_cli';
  execution_policy: 'opl_safe_action_shell';
  execution_surface: 'opl runtime action execute';
  stage_attempt_id: null;
  domain_id: string | null;
  stage_id: string | null;
  can_execute: false;
};

function routeAuthorityBoundary() {
  return {
    opl: 'domain_owner_payload_summary_ledger_refs_only',
    domain: 'domain_repository_owner_receipt_typed_blocker_truth_quality_and_artifact_authority',
    refs_only: true,
    can_write_domain_truth: false,
    can_write_memory_body: false,
    can_read_memory_body: false,
    can_read_artifact_body: false,
    can_mutate_artifact_body: false,
    can_authorize_quality_or_export: false,
    can_create_owner_receipt: false,
    can_generate_typed_blocker: false,
    can_close_owner_chain: false,
    can_close_expected_receipt_refs: false,
    can_close_monitor_freshness: false,
    can_close_domain_ready: false,
    can_claim_domain_ready: false,
    can_claim_visual_ready: false,
    can_claim_export_ready: false,
    can_claim_production_ready: false,
  };
}

function ownerPayloadTemplate() {
  return {
    domain_owner_receipt_refs: [],
    no_regression_evidence_refs: [],
    owner_chain_refs: [],
    typed_blocker_refs: [],
  };
}

function stagePayloadTemplate() {
  return {
    domain_receipt_refs: [],
    monitor_freshness_refs: [],
    runtime_event_refs: [],
    typed_blocker_refs: [],
  };
}

function ownerPayloadWorkorder(item: JsonRecord) {
  return {
    surface_kind: 'opl_domain_owner_payload_summary_payload_workorder',
    workorder_policy:
      'operator_must_choose_domain_owned_success_refs_path_or_domain_owned_typed_blocker_path_empty_template_blocks',
    payload_owner: 'domain_repository_or_app_live_operator',
    payload_kind: stringValue(item.payload_kind) ?? 'domain_owner_receipt_or_typed_blocker_refs',
    accepted_payload_path_policy:
      'domain_owned_success_refs_or_typed_blocker_path_empty_template_blocks',
    accepted_payload_paths: {
      success_refs_path: {
        required_any_operator_payload_refs: [
          'domain_owner_receipt_refs',
          'no_regression_evidence_refs',
          'owner_chain_refs',
        ],
        typed_blocker_refs_must_be_absent: true,
        closes_owner_chain: false,
        closes_domain_ready: false,
        closes_production_ready: false,
      },
      typed_blocker_path: {
        required_operator_payload_refs: ['typed_blocker_refs'],
        success_claimed: false,
        can_generate_typed_blocker: false,
        closes_owner_chain: false,
        closes_domain_ready: false,
        closes_production_ready: false,
      },
    },
    required_operator_payload_refs: [
      'domain_owner_receipt_refs',
      'no_regression_evidence_refs',
      'owner_chain_refs',
      'typed_blocker_refs',
    ],
    required_return_shapes: [
      'domain_owner_receipt_ref',
      'no_regression_evidence_ref',
      'owner_chain_ref',
      'typed_blocker_ref',
    ],
    payload_template: ownerPayloadTemplate(),
    payload_ref_hints: {
      success_refs_path_payload: record(item.success_refs_path_payload),
      typed_blocker_path_payload: record(item.typed_blocker_path_payload),
      recommended_current_payload_path: stringValue(item.recommended_current_payload_path),
    },
    empty_payload_template_is_success_evidence: false,
    authority_boundary: routeAuthorityBoundary(),
  };
}

function stagePayloadWorkorder(stage: JsonRecord) {
  return {
    surface_kind: 'opl_domain_owner_payload_summary_payload_workorder',
    workorder_policy:
      'operator_must_choose_domain_owned_stage_receipt_or_monitor_refs_path_or_typed_blocker_path_empty_template_blocks',
    payload_owner: 'domain_repository_or_app_live_operator',
    payload_kind: stringValue(stage.payload_kind) ?? 'stage_expected_receipt_or_monitor_freshness_refs',
    accepted_payload_path_policy:
      'domain_owned_stage_success_refs_or_typed_blocker_path_empty_template_blocks',
    accepted_payload_paths: {
      success_refs_path: {
        required_any_operator_payload_refs: [
          'domain_receipt_refs',
          'monitor_freshness_refs',
          'runtime_event_refs',
        ],
        typed_blocker_refs_must_be_absent: true,
        closes_expected_receipt_refs: false,
        closes_monitor_freshness: false,
        closes_domain_ready: false,
        closes_production_ready: false,
      },
      typed_blocker_path: {
        required_operator_payload_refs: ['typed_blocker_refs'],
        success_claimed: false,
        can_generate_typed_blocker: false,
        closes_expected_receipt_refs: false,
        closes_monitor_freshness: false,
        closes_domain_ready: false,
        closes_production_ready: false,
      },
    },
    required_operator_payload_refs: [
      'domain_receipt_refs',
      'monitor_freshness_refs',
      'runtime_event_refs',
      'typed_blocker_refs',
    ],
    required_return_shapes: [
      'domain_receipt_ref',
      'monitor_freshness_ref',
      'runtime_event_ref',
      'typed_blocker_ref',
    ],
    payload_template: stagePayloadTemplate(),
    payload_ref_hints: {
      success_refs_path_payload: record(stage.success_refs_path_payload),
      typed_blocker_path_payload: record(stage.typed_blocker_path_payload),
      recommended_current_payload_path: stringValue(stage.recommended_current_payload_path),
    },
    empty_payload_template_is_success_evidence: false,
    authority_boundary: routeAuthorityBoundary(),
  };
}

function baseTargetIdentity(domain: JsonRecord) {
  return {
    domain_id: stringValue(domain.domain_id),
    project: stringValue(domain.project),
    target_domain_id: stringValue(domain.target_domain_id),
    owner: stringValue(domain.owner),
    source_surface: stringValue(domain.source_surface),
    source_ref: stringValue(domain.source_ref),
  };
}

function ownerPayloadTargets(domain: JsonRecord) {
  const summary = record(domain.owner_payload_item_summary);
  return recordList(summary.work_items).map((item) => ({
    domain,
    target_identity: {
      ...baseTargetIdentity(domain),
      summary_kind: 'owner_payload_item',
      item_id: stringValue(item.item_id),
      payload_kind: stringValue(item.payload_kind)
        ?? stringValue(summary.payload_kind)
        ?? 'domain_owner_receipt_or_typed_blocker_refs',
      workorder_item_ref: stringValue(item.workorder_item_ref),
    },
    payload_workorder: ownerPayloadWorkorder(item),
    payload_template: ownerPayloadTemplate(),
    required_operator_payload_refs: [
      'domain_owner_receipt_refs',
      'no_regression_evidence_refs',
      'owner_chain_refs',
      'typed_blocker_refs',
    ],
    required_return_shapes: stringList(summary.required_return_shapes),
  }));
}

function stagePayloadTargets(domain: JsonRecord) {
  const summary = record(domain.stage_expected_receipt_payload_summary);
  return recordList(summary.stages).map((stage) => ({
    domain,
    target_identity: {
      ...baseTargetIdentity(domain),
      summary_kind: 'stage_expected_receipt',
      stage_id: stringValue(stage.stage_id),
      payload_kind: stringValue(stage.payload_kind)
        ?? stringValue(summary.payload_kind)
        ?? 'stage_expected_receipt_or_monitor_freshness_refs',
    },
    payload_workorder: stagePayloadWorkorder(stage),
    payload_template: stagePayloadTemplate(),
    required_operator_payload_refs: [
      'domain_receipt_refs',
      'monitor_freshness_refs',
      'runtime_event_refs',
      'typed_blocker_refs',
    ],
    required_return_shapes: stringList(summary.required_return_shapes),
  }));
}

function targetEntries(projection: JsonRecord) {
  return recordList(projection.domains).flatMap((domain) => [
    ...ownerPayloadTargets(domain),
    ...stagePayloadTargets(domain),
  ]);
}

function safeActionIdPart(value: string) {
  return encodeURIComponent(value).replaceAll('%2F', '/');
}

export function buildDomainOwnerPayloadSummaryActionRoutes(
  projection: JsonRecord,
): DomainOwnerPayloadSummaryActionRoute[] {
  const receipts = listDomainOwnerPayloadSummaryReceipts();
  const receiptsByTarget = new Map<string, DomainOwnerPayloadSummaryReceipt>();
  for (const receipt of receipts) {
    const targetKey = domainOwnerPayloadSummaryTargetKey(receipt.target_identity);
    if (targetKey && !receiptsByTarget.has(targetKey)) {
      receiptsByTarget.set(targetKey, receipt);
    }
  }
  const routes: DomainOwnerPayloadSummaryActionRoute[] = [];
  for (const entry of targetEntries(projection)) {
    const targetKey = domainOwnerPayloadSummaryTargetKey(entry.target_identity);
    if (!targetKey) {
      continue;
    }
    const targetIdentity = record(entry.target_identity);
    const existingReceipt = receiptsByTarget.get(targetKey);
    const common = {
      domain_id: stringValue(targetIdentity.domain_id),
      target_domain_id: stringValue(targetIdentity.target_domain_id),
      project_id: stringValue(targetIdentity.project),
      stage_id: stringValue(targetIdentity.stage_id),
      request_id: `domain_owner_payload_summary:${targetKey}`,
      request_pack_id: 'one_person_lab.domain_owner_payload_summary',
      request_scope: 'opl_owned_refs_only_domain_owner_payload_summary_receipt',
      evidence_route_kind: 'domain_owner_payload_summary',
      evidence_source_ref: '/runtime_tray_snapshot/app_operator_drilldown/domain_owner_payload_summary_refs',
      target_identity: targetIdentity,
      target_key: targetKey,
      payload_owner: 'domain_repository_or_app_live_operator',
      creates_domain_action: false,
      creates_owner_receipt: false,
      owner_receipt_refs: [],
      can_write_domain_truth: false,
      can_create_owner_receipt: false,
      can_generate_typed_blocker: false,
      can_close_owner_chain: false,
      can_close_domain_ready: false,
      can_claim_production_ready: false,
      payload_body_allowed: false,
      authority_boundary: routeAuthorityBoundary(),
    };
    if (existingReceipt?.receipt_status === 'verified') {
      continue;
    }
    if (existingReceipt?.receipt_status === 'recorded') {
      const args = [
        'runtime',
        'domain-owner-payload-summary',
        'verify',
        '--receipt-ref',
        existingReceipt.receipt_ref,
      ];
      const actionId = `domain_owner_payload_summary:${safeActionIdPart(targetKey)}:verify`;
      routes.push(buildOperatorActionRoute(args, {
        ...common,
        action_id: actionId,
        action_kind: 'domain_owner_payload_summary_receipt_verify',
        route_status: 'verify_route_available',
        route_status_detail: 'recorded_domain_owner_payload_summary_receipt_waiting_for_verify',
        route_requires_domain_or_app_payload: false,
        can_close_without_domain_or_app_payload: true,
        required_operator_payload_refs: [],
        required_evidence_refs: [],
        required_return_shapes: [],
        required_receipt_shapes: ['domain_owner_payload_summary_verified_receipt_ref'],
        receipt_ref: existingReceipt.receipt_ref,
        typed_blocker_refs: existingReceipt.typed_blocker_refs,
        open_reason: 'recorded_domain_owner_payload_summary_receipt_requires_verify',
        payload_requirement: null,
        payload_template: null,
        payload_ref_hints: null,
        payload_workorder: null,
        payload_template_policy: null,
        copyable_runtime_action_execute_commands: {
          verify: runtimeActionExecuteCommand(actionId, false),
        },
      }, commandRef(runtimeActionExecuteCommand(actionId, false))));
      continue;
    }
    const args = ['runtime', 'domain-owner-payload-summary', 'record'];
    const actionId = `domain_owner_payload_summary:${safeActionIdPart(targetKey)}:record`;
    routes.push(buildOperatorActionRoute(args, {
      ...common,
      action_id: actionId,
      action_kind: 'domain_owner_payload_summary_receipt_record',
      route_status: 'record_route_available',
      route_status_detail: 'domain_owner_payload_summary_waiting_for_domain_owned_refs_payload',
      route_requires_domain_or_app_payload: true,
      can_close_without_domain_or_app_payload: false,
      required_operator_payload_refs: entry.required_operator_payload_refs,
      required_evidence_refs: [],
      required_return_shapes: entry.required_return_shapes,
      required_receipt_shapes: ['domain_owner_payload_summary_receipt_ref'],
      typed_blocker_refs: [],
      open_reason: 'domain_owner_payload_summary_refs_or_typed_blocker_refs_required',
      payload_requirement:
        'domain_repository_or_app_live_operator_refs_payload_required_to_record_domain_owner_payload_summary_or_typed_blocker',
      payload_template: entry.payload_template,
      payload_ref_hints: record(entry.payload_workorder).payload_ref_hints,
      payload_workorder: entry.payload_workorder,
      accepted_payload_paths: record(entry.payload_workorder).accepted_payload_paths ?? {},
      payload_template_policy:
        'template_is_empty_by_design_replace_with_real_domain_owned_refs_or_typed_blocker_refs_before_submit',
      empty_payload_template_is_success_evidence: false,
      copyable_runtime_action_execute_commands: {
        record_with_payload: runtimeActionExecuteCommand(actionId),
      },
    }, commandRef(runtimeActionExecuteCommand(actionId))));
  }
  return routes;
}
