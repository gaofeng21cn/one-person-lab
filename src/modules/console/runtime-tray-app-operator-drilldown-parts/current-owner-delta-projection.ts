import { buildCurrentOwnerDeltaReadModel } from '../../ledger/index.ts';
import {
  countValue as numberValue,
  record,
  type JsonRecord,
} from '../../../kernel/json-record.ts';

export function buildAppDrilldownCurrentOwnerDeltaReadModel(input: {
  ownerDeltaFirst: JsonRecord;
  selectedSafeAction: JsonRecord | null;
  evidenceAfterContract: JsonRecord;
  actionCount: number;
}) {
  const evidence = input.evidenceAfterContract;
  const readModel = buildCurrentOwnerDeltaReadModel({
    ownerDeltaFirst: input.ownerDeltaFirst,
    nextSafeAction: input.selectedSafeAction,
    countSummary: {
      openSafeActionCount: input.actionCount,
      payloadRequiredCount: numberValue(evidence.operator_payload_required_attention_count),
      payloadFreeCount: numberValue(evidence.operator_payload_free_attention_count),
      blockedRefsOnlyCount: numberValue(evidence.domain_blocked_attention_count),
      evidenceEnvelopeOpenCount: numberValue(evidence.evidence_envelope_open_count),
      evidenceEnvelopeBlockedCount: numberValue(evidence.evidence_envelope_blocked_count),
      domainDispatchWorkorderCount:
        numberValue(record(evidence.domain_dispatch_evidence_workorder_packet_summary).workorder_count),
    },
    fullDetailRefs: {
      owner_delta_first_ref:
        '/runtime_tray_snapshot/app_operator_drilldown/attention_first_payload/owner_delta_first',
      app_operator_drilldown_ref:
        'opl runtime app-operator-drilldown --detail full --json',
    },
  });
  return readModel;
}
