import {
  listStageReplayMissingReceiptReceipts,
  stageReplayMissingReceiptTargetKey,
  type StageReplayMissingReceiptReceipt,
} from '../stage-replay-missing-receipt-ledger.ts';
import { defaultOmaRepoDir } from '../opl-meta-agent-consumption.ts';
import {
  omaProductionAcceptanceStageReplayReceipts,
  readOmaProductionAcceptance,
} from '../opl-meta-agent-production-acceptance.ts';
import {
  record,
  recordList,
  stringList,
  stringValue,
  uniqueStringList,
  type JsonRecord,
} from './json-utils.ts';

function countByString<T>(
  values: T[],
  keyForValue: (value: T) => string | null | undefined,
  outputKey: string,
) {
  const counts = new Map<string, number>();
  for (const value of values) {
    const key = keyForValue(value)?.trim() || 'unknown';
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, count]) => ({
      [outputKey]: key,
      workorder_count: count,
    }));
}

function itemIdPart(value: string | null) {
  return (value ?? 'unknown').replace(/[^a-zA-Z0-9_.:-]+/g, '_');
}

function targetIdentity(domainId: string | null, stageId: string | null, missingRef: string | null) {
  const target = {
    domain_id: domainId,
    stage_id: stageId,
    missing_ref: missingRef,
  };
  const targetKey = stageReplayMissingReceiptTargetKey(target);
  return {
    ...target,
    ...(targetKey ? { target_key: targetKey } : {}),
  };
}

function shellQuoteJson(value: unknown) {
  return `'${JSON.stringify(value).replaceAll("'", "'\\''")}'`;
}

function ledgerRecordPayloads(missingRef: string | null) {
  return {
    success_refs_path: {
      receipt_refs: missingRef ? [missingRef] : [],
    },
    typed_blocker_path: {
      typed_blocker_refs: [],
    },
  };
}

function directLedgerHandoff(
  target: JsonRecord,
  missingRef: string | null,
  typedBlockerRefs: string[],
  typedBlockerReceiptRefs: string[],
) {
  const payloads = ledgerRecordPayloads(missingRef);
  const targetArg = shellQuoteJson(target);
  const successPayloadArg = shellQuoteJson(payloads.success_refs_path);
  const typedBlockerPayloadArg = shellQuoteJson({
    typed_blocker_refs: ['<domain_or_human_gate_owner_typed_blocker_ref>'],
  });
  return {
    surface_kind: 'opl_stage_replay_missing_receipt_direct_ledger_handoff',
    ledger_surface: 'opl runtime stage-replay-missing-receipt',
    target_identity: target,
    record_success_command:
      `opl runtime stage-replay-missing-receipt record --target-identity ${targetArg} --payload ${successPayloadArg}`,
    record_typed_blocker_command:
      `opl runtime stage-replay-missing-receipt record --target-identity ${targetArg} --payload ${typedBlockerPayloadArg}`,
    verify_command: 'opl runtime stage-replay-missing-receipt verify --receipt-ref <receipt_ref>',
    list_command: 'opl runtime stage-replay-missing-receipt list --json',
    record_payload_templates: payloads,
    typed_blocker_refs: typedBlockerRefs,
    typed_blocker_receipt_refs: typedBlockerReceiptRefs,
    can_submit_to_safe_action_shell: false,
    can_execute_domain_action: false,
    can_requery_human: false,
    can_create_owner_receipt: false,
    can_generate_typed_blocker: false,
    can_close_domain_ready: false,
    can_claim_production_ready: false,
  };
}

function defaultNextActionGuidance(directHandoff: ReturnType<typeof directLedgerHandoff>) {
  return {
    action_kind: 'record_payload',
    step_kind: 'record_stage_replay_missing_receipt_payload',
    owner: 'domain_or_human_gate_owner',
    payload_path: 'success_refs_path',
    record_command: directHandoff.record_success_command,
    verify_command: directHandoff.verify_command,
    alternative_action_kinds: [
      'record_typed_blocker_payload',
      'ask_human',
    ],
    can_submit_to_safe_action_shell: false,
    can_execute_domain_action: false,
    can_create_owner_receipt: false,
    can_claim_production_ready: false,
  };
}

function verifiedStageReplaySuccessReceiptForTarget(
  receipts: StageReplayMissingReceiptReceipt[],
  targetKey: string,
  missingRef: string | null,
) {
  if (!targetKey || !missingRef) {
    return null;
  }
  return receipts.find((receipt) =>
    receipt.receipt_status === 'verified'
    && receipt.payload_path === 'success_refs_path'
    && stageReplayMissingReceiptTargetKey(receipt.target_identity) === targetKey
    && receipt.receipt_refs.includes(missingRef)
  ) ?? null;
}

function verifiedStageReplayTypedBlockersForTarget(
  receipts: StageReplayMissingReceiptReceipt[],
  targetKey: string,
) {
  if (!targetKey) {
    return [];
  }
  return receipts.filter((receipt) =>
    receipt.receipt_status === 'verified'
    && receipt.payload_path === 'typed_blocker_path'
    && stageReplayMissingReceiptTargetKey(receipt.target_identity) === targetKey
    && receipt.typed_blocker_refs.length > 0
  );
}

function readinessDomains(stageReadiness: JsonRecord) {
  const domains = recordList(stageReadiness.domains);
  if (domains.length > 0) {
    return domains;
  }
  const nested = record(stageReadiness.family_stage_readiness);
  if (Object.keys(nested).length > 0) {
    return [nested];
  }
  return [stageReadiness];
}

function repoTrackedStageReplayMissingReceiptReceipts() {
  const omaRepoDir = defaultOmaRepoDir();
  if (!omaRepoDir) {
    return [];
  }
  const productionAcceptance = readOmaProductionAcceptance(omaRepoDir);
  if (productionAcceptance.status !== 'resolved') {
    return [];
  }
  return omaProductionAcceptanceStageReplayReceipts(productionAcceptance.payload);
}

function stageReplayMissingReceiptReceipts() {
  return [
    ...listStageReplayMissingReceiptReceipts(),
    ...repoTrackedStageReplayMissingReceiptReceipts(),
  ];
}

function replayMissingReceiptWorkorderItems(stageReadiness: JsonRecord) {
  const seen = new Set<string>();
  const receipts = stageReplayMissingReceiptReceipts();
  return readinessDomains(stageReadiness).flatMap((domain) => {
    const warnings = [
      ...recordList(domain.hard_blockers),
      ...recordList(domain.warnings),
    ];
    const domainId = stringValue(domain.target_domain_id) ?? stringValue(domain.project_id);
    return warnings.flatMap((warning) => {
      const workorder = record(warning.payload_workorder);
      if (workorder.surface_kind !== 'opl_stage_replay_missing_receipt_workorder') {
        return [];
      }
      const stageId = stringValue(workorder.stage_id) ?? stringValue(warning.stage_id);
      const missingRef = stringValue(workorder.missing_ref);
      const target = targetIdentity(domainId, stageId, missingRef);
      const targetKey = stageReplayMissingReceiptTargetKey(target);
      const successReceipt = verifiedStageReplaySuccessReceiptForTarget(
        receipts,
        targetKey,
        missingRef,
      );
      if (successReceipt) {
        return [];
      }
      const typedBlockerReceipts = verifiedStageReplayTypedBlockersForTarget(receipts, targetKey);
      const typedBlockerRefs = uniqueStringList(
        typedBlockerReceipts.flatMap((receipt) => receipt.typed_blocker_refs),
      );
      const typedBlockerReceiptRefs = uniqueStringList(
        typedBlockerReceipts.map((receipt) => receipt.receipt_ref),
      );
      const dedupeKey = `${domainId ?? 'domain'}:${stageId ?? 'stage'}:${missingRef ?? 'missing_ref'}`;
      if (seen.has(dedupeKey)) {
        return [];
      }
      seen.add(dedupeKey);
      const directHandoff = directLedgerHandoff(
        target,
        missingRef,
        typedBlockerRefs,
        typedBlockerReceiptRefs,
      );
      return [{
        item_id:
          `stage-replay-missing-receipt-workorder:${itemIdPart(domainId)}:${itemIdPart(stageId)}:${itemIdPart(missingRef)}`,
        domain_id: domainId,
        project_id: stringValue(domain.project_id),
        project: stringValue(domain.project),
        plane_id: stringValue(domain.plane_id),
        stage_id: stageId,
        code: stringValue(warning.code),
        source_ref: stringValue(warning.source_ref),
        missing_ref: missingRef,
        missing_ref_kind: stringValue(workorder.missing_ref_kind),
        payload_owner: stringValue(workorder.payload_owner),
        payload_path_policy: stringValue(workorder.payload_path_policy),
        required_success_ref: stringValue(workorder.required_success_ref),
        required_return_shapes: stringList(workorder.required_return_shapes),
        payload_template: record(workorder.payload_template),
        accepted_payload_paths: record(workorder.accepted_payload_paths),
        payload_workorder: workorder,
        target_identity: target,
        stage_replay_missing_receipt_target_key: targetKey,
        stage_replay_missing_receipt_ledger_status:
          typedBlockerRefs.length > 0
            ? 'verified_typed_blocker_recorded_still_blocked'
            : 'no_verified_success_receipt_ref',
        typed_blocker_refs: typedBlockerRefs,
        typed_blocker_receipt_refs: typedBlockerReceiptRefs,
        status: typedBlockerRefs.length > 0
          ? 'blocked_by_domain_owned_typed_blocker_ref'
          : 'blocked_by_missing_replay_receipt_ref',
        route_semantics: 'refs_only_stage_replay_missing_receipt_attention_not_safe_action',
        direct_ledger_handoff: directHandoff,
        default_next_action_guidance: defaultNextActionGuidance(directHandoff),
        worklist_item_is_completion_claim: false,
        action_execution_surface: null,
        next_safe_action_ref: null,
        authority_boundary: {
          ...record(workorder.authority_boundary),
          can_execute_domain_action: false,
          can_requery_human: false,
          can_write_domain_truth: false,
          can_create_owner_receipt: false,
          can_write_owner_receipt: false,
          can_authorize_quality_or_export: false,
          can_close_domain_ready: false,
          can_claim_production_ready: false,
        },
      }];
    });
  });
}

export function buildStageReplayMissingReceiptWorkorderPacket(stageReadiness: JsonRecord) {
  const receipts = stageReplayMissingReceiptReceipts();
  const verifiedSuccessReceiptCount = receipts.filter((receipt) =>
    receipt.receipt_status === 'verified' && receipt.payload_path === 'success_refs_path'
  ).length;
  const verifiedTypedBlockerReceiptCount = receipts.filter((receipt) =>
    receipt.receipt_status === 'verified' && receipt.payload_path === 'typed_blocker_path'
  ).length;
  const workorders = replayMissingReceiptWorkorderItems(stageReadiness);
  const domainIds = uniqueStringList(workorders.map((item) => item.domain_id));
  const stageIds = uniqueStringList(workorders.map((item) =>
    item.domain_id && item.stage_id ? `${item.domain_id}:${item.stage_id}` : null
  ));
  return {
    surface_kind: 'opl_stage_replay_missing_receipt_workorder_packet',
    packet_policy:
      'refs_only_operator_attention_for_stage_replay_missing_receipts_without_safe_action_or_receipt_generation',
    source_ref: '/family_stage_readiness/domains/warnings/payload_workorder',
    source_command: 'opl stages readiness --family-defaults --detail full --json',
    action_execution_surface: null,
    summary: {
      workorder_count: workorders.length,
      domain_count: domainIds.length,
      stage_count: stageIds.length,
      missing_ref_count: workorders.length,
      human_gate_missing_ref_count:
        workorders.filter((item) => item.missing_ref_kind === 'human_gate_ref').length,
      owner_receipt_missing_ref_count:
        workorders.filter((item) => item.missing_ref_kind === 'owner_receipt_ref').length,
      domain_receipt_missing_ref_count:
        workorders.filter((item) => item.missing_ref_kind === 'domain_receipt_ref').length,
      typed_blocker_recorded_count: verifiedTypedBlockerReceiptCount,
      success_receipt_verified_count: verifiedSuccessReceiptCount,
      domain_ids: domainIds,
      payload_owner: 'domain_or_human_gate_owner',
      workorders_are_safe_actions: false,
    },
    workorders,
    authority_boundary: {
      refs_only: true,
      can_execute_domain_action: false,
      can_requery_human: false,
      can_write_domain_truth: false,
      can_create_owner_receipt: false,
      can_write_owner_receipt: false,
      can_authorize_quality_or_export: false,
      can_close_domain_ready: false,
      can_claim_production_ready: false,
      closes_replay_receipt_ref: false,
      closes_domain_ready: false,
      closes_production_ready: false,
    },
  };
}

export function compactStageReplayMissingReceiptWorkorderAttentionItems(
  packet: ReturnType<typeof buildStageReplayMissingReceiptWorkorderPacket>,
  limit = 10,
) {
  return packet.workorders.slice(0, limit).map((item) => ({
    item_id: item.item_id,
    domain_id: item.domain_id,
    project_id: item.project_id,
    project: item.project,
    plane_id: item.plane_id,
    stage_id: item.stage_id,
    missing_ref: item.missing_ref,
    missing_ref_kind: item.missing_ref_kind,
    required_success_ref: item.required_success_ref,
    required_return_shapes: item.required_return_shapes,
    target_identity: item.target_identity,
    stage_replay_missing_receipt_target_key: item.stage_replay_missing_receipt_target_key,
    stage_replay_missing_receipt_ledger_status:
      item.stage_replay_missing_receipt_ledger_status,
    typed_blocker_refs: item.typed_blocker_refs,
    typed_blocker_receipt_refs: item.typed_blocker_receipt_refs,
    direct_ledger_handoff: item.direct_ledger_handoff,
    default_next_action_guidance: item.default_next_action_guidance,
    payload_owner: item.payload_owner,
    payload_path_policy: item.payload_path_policy,
    status: item.status,
    route_semantics: item.route_semantics,
    worklist_item_is_completion_claim: false,
    next_safe_action_ref: null,
  }));
}

export function compactStageReplayMissingReceiptWorkorderAttentionSummary(
  packet: ReturnType<typeof buildStageReplayMissingReceiptWorkorderPacket>,
  limit = 10,
) {
  const selected = packet.workorders.slice(0, limit);
  const omitted = packet.workorders.slice(limit);
  return {
    surface_kind: 'opl_stage_replay_missing_receipt_workorder_attention_summary',
    attention_policy:
      'compact_attention_lists_first_items_full_packet_remains_authoritative_omitted_tail_grouped_for_operator_visibility',
    attention_item_limit: limit,
    attention_item_count: selected.length,
    total_workorder_count: packet.workorders.length,
    omitted_workorder_count: omitted.length,
    omitted_domain_count:
      uniqueStringList(omitted.map((item) => item.domain_id)).length,
    omitted_domain_counts:
      countByString(omitted, (item) => item.domain_id, 'domain_id'),
    omitted_status_counts:
      countByString(omitted, (item) => item.status, 'status'),
    omitted_missing_ref_kind_counts:
      countByString(omitted, (item) => item.missing_ref_kind, 'missing_ref_kind'),
    full_packet_ref:
      '/family_runtime_evidence_worklist/stage_replay_missing_receipt_workorder_packet',
    full_detail_args: ['--detail', 'full'],
    authority_boundary: {
      refs_only: true,
      can_execute_domain_action: false,
      can_requery_human: false,
      can_write_domain_truth: false,
      can_create_owner_receipt: false,
      can_write_owner_receipt: false,
      can_authorize_quality_or_export: false,
      can_close_domain_ready: false,
      can_claim_production_ready: false,
    },
  };
}
