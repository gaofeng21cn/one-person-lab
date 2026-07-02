import type { DomainManifestCatalogEntry } from '../../atlas/domain-manifest/types.ts';
import {
  listMagManifestSustainedConsumptionReceipts,
  magManifestSustainedConsumptionTargetKey,
  type MagManifestSustainedConsumptionReceipt,
} from '../../ledger/mag-manifest-sustained-consumption-ledger.ts';
import type { JsonRecord } from '../runtime-tray-snapshot-types.ts';
import { record, recordList, stringList, stringValue } from './value-utils.ts';

type MagManifestSustainedConsumptionRoute = JsonRecord & {
  ref: string;
  role: 'operator_action_route';
  action_id: string;
  action_kind:
    | 'mag_manifest_sustained_consumption_followthrough_receipt_record'
    | 'mag_manifest_sustained_consumption_followthrough_receipt_verify';
  owner: 'opl';
  route_target_kind: 'opl_cli';
  execution_policy: 'opl_safe_action_shell';
  execution_surface: 'opl runtime action execute';
  domain_id: string | null;
  stage_id: null;
  stage_attempt_id: null;
  can_execute: false;
};

const REQUIRED_SUCCESS_REF_FIELDS = [
  'app_operator_consumption_ref',
  'default_caller_consumption_ref',
  'owner_payload_response_ref',
  'workspace_receipt_scaleout_evidence_ref',
  'no_forbidden_write_ref',
  'long_soak_or_typed_blocker_ref',
];

const REQUIRED_PAYLOAD_FIELDS = [
  ...REQUIRED_SUCCESS_REF_FIELDS,
  'typed_blocker_refs',
];

function authorityBoundary() {
  return {
    opl: 'mag_manifest_sustained_consumption_followthrough_projection_and_ledger_refs_only',
    domain: 'med_autogrant_manifest_consumption_payload_authority',
    refs_only: true,
    payload_owner: 'app_operator_or_release_default_caller',
    can_write_domain_truth: false,
    can_write_memory_body: false,
    can_read_memory_body: false,
    can_read_artifact_body: false,
    can_mutate_artifact_body: false,
    can_create_owner_receipt: false,
    can_generate_typed_blocker: false,
    can_submit_operator_payload: false,
    can_declare_app_sustained_consumption_complete: false,
    can_declare_submission_ready: false,
    can_declare_provider_long_soak_complete: false,
    can_claim_sustained_app_consumption_complete: false,
    can_claim_grant_ready: false,
    can_claim_quality_ready: false,
    can_claim_export_ready: false,
    can_claim_submission_ready: false,
    can_claim_provider_long_soak_complete: false,
    can_claim_production_ready: false,
  };
}

function candidateFromManifest(manifest: JsonRecord) {
  const productEntryManifest = record(manifest.product_entry_manifest);
  const candidates: Array<{ source_ref: string; owner_payload_response: JsonRecord }> = [
    {
      source_ref: '/owner_payload_response',
      owner_payload_response: record(manifest.owner_payload_response),
    },
    {
      source_ref: '/product_entry_manifest/owner_payload_response',
      owner_payload_response: record(productEntryManifest.owner_payload_response),
    },
    {
      source_ref: '/mag_opl_owner_payload_response',
      owner_payload_response: record(manifest.mag_opl_owner_payload_response),
    },
    {
      source_ref: '/product_entry_manifest/mag_opl_owner_payload_response',
      owner_payload_response: record(productEntryManifest.mag_opl_owner_payload_response),
    },
  ];
  return candidates
    .map((candidate) => ({
      ...candidate,
      workorder: record(
        record(candidate.owner_payload_response.manifest_consumer_evidence)
          .sustained_consumption_followthrough_workorder,
      ),
    }))
    .find((candidate) =>
      stringValue(candidate.workorder.surface_kind)
        === 'mag_manifest_sustained_consumption_followthrough_workorder'
    ) ?? null;
}

function workspaceScaleoutRef(manifest: JsonRecord) {
  const productEntryManifest = record(manifest.product_entry_manifest);
  if (Object.keys(record(manifest.workspace_receipt_scaleout_evidence)).length > 0) {
    return '/workspace_receipt_scaleout_evidence';
  }
  if (Object.keys(record(productEntryManifest.workspace_receipt_scaleout_evidence)).length > 0) {
    return '/product_entry_manifest/workspace_receipt_scaleout_evidence';
  }
  return null;
}

function receiptProjection(receipt: MagManifestSustainedConsumptionReceipt | undefined) {
  return receipt
    ? {
        receipt_ref: receipt.receipt_ref,
        receipt_status: receipt.receipt_status,
        payload_path: receipt.payload_path,
        typed_blocker_refs: receipt.typed_blocker_refs,
      }
    : null;
}

export function buildMagManifestSustainedConsumptionFollowthroughRefs(input: {
  domainManifestProjects: DomainManifestCatalogEntry[];
}) {
  const receipts = listMagManifestSustainedConsumptionReceipts();
  const receiptsByTarget = new Map<string, MagManifestSustainedConsumptionReceipt>();
  for (const receipt of receipts) {
    const targetKey = magManifestSustainedConsumptionTargetKey(receipt.target_identity);
    if (targetKey && !receiptsByTarget.has(targetKey)) {
      receiptsByTarget.set(targetKey, receipt);
    }
  }
  const domains = input.domainManifestProjects.flatMap((project) => {
    const manifest = project.status === 'resolved' ? record(project.manifest) : {};
    const candidate = candidateFromManifest(manifest);
    if (!candidate) {
      return [];
    }
    const domainId =
      stringValue(project.project_id)
      ?? stringValue(candidate.owner_payload_response.target_domain_id)
      ?? 'medautogrant';
    const targetIdentity = {
      domain_id: domainId,
      project: project.project,
      target_domain_id:
        stringValue(candidate.owner_payload_response.target_domain_id) ?? 'med-autogrant',
      owner: stringValue(candidate.owner_payload_response.owner) ?? 'med-autogrant',
      source_surface: 'mag_manifest_sustained_consumption_followthrough_workorder',
      source_ref:
        `${candidate.source_ref}/manifest_consumer_evidence`
        + '/sustained_consumption_followthrough_workorder',
      workorder_kind: 'manifest_sustained_consumption_followthrough',
    };
    const targetKey = magManifestSustainedConsumptionTargetKey(targetIdentity);
    const receipt = receiptsByTarget.get(targetKey);
    return [{
      domain_id: domainId,
      project: project.project,
      target_domain_id:
        stringValue(candidate.owner_payload_response.target_domain_id) ?? 'med-autogrant',
      owner: stringValue(candidate.owner_payload_response.owner) ?? 'med-autogrant',
      source_surface: 'mag_manifest_sustained_consumption_followthrough_workorder',
      source_ref:
        `${candidate.source_ref}/manifest_consumer_evidence`
        + '/sustained_consumption_followthrough_workorder',
      owner_payload_response_ref: candidate.source_ref,
      workspace_receipt_scaleout_evidence_ref: workspaceScaleoutRef(manifest),
      workorder: {
        ...candidate.workorder,
        authority_boundary: {
          ...record(candidate.workorder.authority_boundary),
          ...authorityBoundary(),
        },
      },
      target_identity: targetIdentity,
      target_key: targetKey,
      ledger_receipt: receiptProjection(receipt),
      operator_payload_submitted: candidate.workorder.operator_payload_submitted === true,
      claims_sustained_app_consumption_complete: false,
      claims_grant_ready: false,
      claims_submission_ready: false,
      claims_provider_long_soak_complete: false,
      authority_boundary: authorityBoundary(),
    }];
  });
  const recordedReceipts = receipts.filter((receipt) => receipt.receipt_status === 'recorded');
  const verifiedReceipts = receipts.filter((receipt) => receipt.receipt_status === 'verified');
  return {
    surface_kind: 'opl_app_drilldown_mag_manifest_sustained_consumption_followthrough_refs',
    projection_policy:
      'refs_only_mag_manifest_sustained_consumption_followthrough_no_payload_generation_or_ready_claim',
    summary: {
      followthrough_domain_count: domains.length,
      workorder_count: domains.length,
      ledger_receipt_ref_count: receipts.length,
      recorded_ledger_receipt_ref_count: recordedReceipts.length,
      verified_ledger_receipt_ref_count: verifiedReceipts.length,
      pending_verify_receipt_ref_count: recordedReceipts.length,
      can_claim_sustained_app_consumption_complete_count: 0,
      can_claim_grant_ready_count: 0,
      can_claim_submission_ready_count: 0,
      can_claim_provider_long_soak_complete_count: 0,
    },
    domains,
    ledger_projection: {
      receipt_refs: receipts.map((receipt) => receipt.receipt_ref),
      recorded_receipt_refs: recordedReceipts.map((receipt) => receipt.receipt_ref),
      verified_receipt_refs: verifiedReceipts.map((receipt) => receipt.receipt_ref),
    },
    authority_boundary: authorityBoundary(),
  };
}

function commandRef(args: string[]) {
  return `opl ${args.map((arg) => (
    arg.includes(' ') || arg.includes('"') ? JSON.stringify(arg) : arg
  )).join(' ')}`;
}

function runtimeActionExecuteCommand(actionId: string) {
  return [
    'runtime',
    'action',
    'execute',
    '--action',
    actionId,
    '--payload-file',
    '<payload.json>',
  ];
}

function verifyRuntimeActionExecuteCommand(actionId: string) {
  return ['runtime', 'action', 'execute', '--action', actionId];
}

function safeActionIdPart(value: string) {
  return encodeURIComponent(value).replaceAll('%2F', '/');
}

function basePayloadWorkorder(domain: JsonRecord) {
  const workorder = record(domain.workorder);
  return {
    surface_kind: 'opl_mag_manifest_sustained_consumption_followthrough_payload_workorder',
    workorder_policy:
      'operator_must_choose_real_app_operator_or_default_caller_success_refs_path_or_typed_blocker_path_empty_template_blocks',
    payload_owner: 'app_operator_or_release_default_caller',
    payload_kind: 'manifest_sustained_consumption_refs_or_typed_blocker',
    mag_authority_command: stringValue(workorder.authority_command),
    mag_authority_command_internal: stringValue(workorder.authority_command_internal),
    accepted_payload_path_policy:
      stringValue(workorder.accepted_payload_path_policy)
      ?? 'real_app_operator_or_default_caller_consumption_refs_or_typed_blocker',
    accepted_payload_paths: record(workorder.accepted_payload_paths),
    required_operator_payload_refs: REQUIRED_PAYLOAD_FIELDS,
    required_return_shapes: [
      'app_operator_consumption_ref',
      'default_caller_consumption_ref',
      'owner_payload_response_ref',
      'workspace_receipt_scaleout_evidence_ref',
      'no_forbidden_write_ref',
      'long_soak_or_typed_blocker_ref',
      'typed_blocker_ref',
    ],
    payload_template: {
      app_operator_consumption_ref: [],
      default_caller_consumption_ref: [],
      owner_payload_response_ref: [],
      workspace_receipt_scaleout_evidence_ref: [],
      no_forbidden_write_ref: [],
      long_soak_or_typed_blocker_ref: [],
      typed_blocker_refs: [],
    },
    payload_ref_hints: {
      owner_payload_response_ref: stringValue(domain.owner_payload_response_ref),
      workspace_receipt_scaleout_evidence_ref:
        stringValue(domain.workspace_receipt_scaleout_evidence_ref),
      recommended_current_payload_path:
        stringValue(workorder.recommended_payload_path) ?? 'typed_blocker_path',
    },
    empty_payload_template_is_success_evidence: false,
    rejects_unknown_operator_payload_fields: true,
    authority_boundary: authorityBoundary(),
  };
}

export function buildMagManifestSustainedConsumptionFollowthroughActionRoutes(
  projection: JsonRecord,
): MagManifestSustainedConsumptionRoute[] {
  const routes: MagManifestSustainedConsumptionRoute[] = [];
  for (const domain of recordList(projection.domains)) {
    const targetIdentity = record(domain.target_identity);
    const targetKey = stringValue(domain.target_key)
      ?? magManifestSustainedConsumptionTargetKey(targetIdentity);
    if (!targetKey) {
      continue;
    }
    const existingReceipt = record(domain.ledger_receipt);
    const common = {
      role: 'operator_action_route' as const,
      owner: 'opl' as const,
      route_target_kind: 'opl_cli' as const,
      execution_policy: 'opl_safe_action_shell' as const,
      execution_surface: 'opl runtime action execute' as const,
      stage_attempt_id: null,
      stage_id: null,
      domain_id: stringValue(domain.domain_id),
      target_domain_id: stringValue(domain.target_domain_id),
      project_id: stringValue(domain.project),
      request_id: `mag_manifest_sustained_consumption_followthrough:${targetKey}`,
      request_pack_id: 'one_person_lab.mag_manifest_sustained_consumption_followthrough',
      request_scope: 'opl_owned_refs_only_mag_manifest_sustained_consumption_followthrough_receipt',
      evidence_route_kind: 'mag_manifest_sustained_consumption_followthrough',
      evidence_source_ref:
        '/runtime_tray_snapshot/app_operator_drilldown/'
        + 'mag_manifest_sustained_consumption_followthrough_refs',
      target_identity: targetIdentity,
      target_key: targetKey,
      payload_owner: 'app_operator_or_release_default_caller',
      creates_domain_action: false,
      creates_owner_receipt: false,
      owner_receipt_refs: [],
      can_execute: false as const,
      can_write_domain_truth: false,
      can_create_owner_receipt: false,
      can_generate_typed_blocker: false,
      can_submit_operator_payload: false,
      can_claim_sustained_app_consumption_complete: false,
      can_claim_grant_ready: false,
      can_claim_submission_ready: false,
      can_claim_provider_long_soak_complete: false,
      payload_body_allowed: false,
      authority_boundary: authorityBoundary(),
    };
    if (stringValue(existingReceipt.receipt_status) === 'verified') {
      continue;
    }
    if (stringValue(existingReceipt.receipt_status) === 'recorded') {
      const actionId =
        `mag_manifest_sustained_consumption_followthrough:${safeActionIdPart(targetKey)}:verify`;
      routes.push({
        ...common,
        ref: commandRef(verifyRuntimeActionExecuteCommand(actionId)),
        opl_cli_args: [
          'runtime',
          'mag-manifest-sustained-consumption',
          'verify',
          '--receipt-ref',
          stringValue(existingReceipt.receipt_ref),
        ].filter((entry): entry is string => Boolean(entry)),
        action_id: actionId,
        action_kind: 'mag_manifest_sustained_consumption_followthrough_receipt_verify',
        route_status: 'verify_route_available',
        route_status_detail:
          'recorded_mag_manifest_sustained_consumption_followthrough_receipt_waiting_for_verify',
        route_requires_domain_or_app_payload: false,
        can_close_without_domain_or_app_payload: true,
        required_operator_payload_refs: [],
        required_evidence_refs: [],
        required_return_shapes: [],
        required_receipt_shapes: [
          'mag_manifest_sustained_consumption_followthrough_verified_receipt_ref',
        ],
        receipt_ref: stringValue(existingReceipt.receipt_ref),
        typed_blocker_refs: stringList(existingReceipt.typed_blocker_refs),
        open_reason:
          'recorded_mag_manifest_sustained_consumption_followthrough_receipt_requires_verify',
        payload_requirement: null,
        payload_template: null,
        payload_ref_hints: null,
        payload_workorder: null,
        payload_template_policy: null,
        copyable_runtime_action_execute_commands: {
          verify: verifyRuntimeActionExecuteCommand(actionId),
        },
      });
      continue;
    }
    const actionId =
      `mag_manifest_sustained_consumption_followthrough:${safeActionIdPart(targetKey)}:record`;
    const payloadWorkorder = basePayloadWorkorder(domain);
    routes.push({
      ...common,
      ref: commandRef(runtimeActionExecuteCommand(actionId)),
      opl_cli_args: ['runtime', 'mag-manifest-sustained-consumption', 'record'],
      action_id: actionId,
      action_kind: 'mag_manifest_sustained_consumption_followthrough_receipt_record',
      route_status: 'record_route_available',
      route_status_detail:
        'mag_manifest_sustained_consumption_followthrough_waiting_for_real_app_or_default_caller_refs_payload',
      route_requires_domain_or_app_payload: true,
      can_close_without_domain_or_app_payload: false,
      required_operator_payload_refs: REQUIRED_PAYLOAD_FIELDS,
      required_evidence_refs: [],
      required_return_shapes: payloadWorkorder.required_return_shapes,
      required_receipt_shapes: ['mag_manifest_sustained_consumption_followthrough_receipt_ref'],
      typed_blocker_refs: [],
      open_reason:
        'real_app_operator_or_default_caller_sustained_consumption_refs_or_typed_blocker_refs_required',
      payload_requirement:
        'app_operator_or_release_default_caller_refs_payload_required_to_record_mag_manifest_sustained_consumption_followthrough',
      payload_template: payloadWorkorder.payload_template,
      payload_ref_hints: payloadWorkorder.payload_ref_hints,
      payload_workorder: payloadWorkorder,
      accepted_payload_paths: payloadWorkorder.accepted_payload_paths,
      payload_template_policy:
        'template_is_empty_by_design_replace_with_real_app_or_default_caller_refs_or_typed_blocker_before_submit',
      empty_payload_template_is_success_evidence: false,
      copyable_runtime_action_execute_commands: {
        record_with_payload: runtimeActionExecuteCommand(actionId),
      },
    });
  }
  return routes;
}
