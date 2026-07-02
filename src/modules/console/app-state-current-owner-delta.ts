import type { OplStatePaths } from '../runway/runtime-state-paths.ts';
import { readCurrentOwnerDeltaReadModelProjectionCache } from '../ledger/current-owner-delta-read-model-cache.ts';
import {
  buildCurrentOwnerDeltaCacheRefreshRequiredReadModel,
  buildCurrentOwnerDeltaReadModel,
} from '../ledger/current-owner-delta-projection.ts';

const APP_CURRENT_OWNER_DELTA_CACHE_MAX_AGE_MS = 5 * 60 * 1000;

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function ownerDeltaReadModelFromRuntimeActivity(items: JsonRecord[]) {
  const selected = items.find((item) => stringValue(item.lane) === 'attention')
    ?? items.find((item) => stringValue(item.lane) === 'running');
  if (!selected) {
    return buildCurrentOwnerDeltaCacheRefreshRequiredReadModel();
  }
  const domainOwner = stringValue(selected.domain_owner)
    ?? stringValue(selected.project_id)
    ?? 'one-person-lab';
  const actionSummary = stringValue(selected.next_action_summary)
    ?? stringValue(selected.action_summary)
    ?? stringValue(selected.summary)
    ?? 'inspect_runtime_activity_projection';
  return buildCurrentOwnerDeltaReadModel({
    ownerDeltaFirst: {
      next_owner: domainOwner,
      next_required_delta: actionSummary,
      required_return_shapes: [
        'domain_owner_receipt_ref',
        'domain_typed_blocker_ref',
        'typed_blocker_ref',
      ],
    },
    countSummary: {
      openSafeActionCount: items.filter((item) => stringValue(item.lane) === 'attention').length,
      payloadRequiredCount: 0,
      payloadFreeCount: 0,
      blockedRefsOnlyCount: 0,
      evidenceEnvelopeOpenCount: 0,
      evidenceEnvelopeBlockedCount: 0,
      domainDispatchWorkorderCount: 0,
      stageReplayMissingReceiptWorkorderCount: 0,
    },
    fullDetailRefs: {
      framework_readiness_ref: 'opl framework readiness --family-defaults --json',
      evidence_worklist_ref:
        'opl family-runtime evidence-worklist --family-defaults --provider temporal --executor-kind codex_cli --json',
      app_operator_drilldown_ref:
        'opl runtime app-operator-drilldown --detail full --json',
      runtime_activity_ref: '/app_state/operator/workbench/activity_center',
    },
  });
}

function ownerDeltaReadModelFromFullDrilldown(drilldown: JsonRecord | null) {
  if (!drilldown) {
    return null;
  }
  const attentionFirstPayload = isRecord(drilldown.attention_first_payload)
    ? drilldown.attention_first_payload
    : {};
  const readModel = attentionFirstPayload.current_owner_delta_read_model;
  return isRecord(readModel)
    && readModel.surface_kind === 'opl_current_owner_delta_read_model'
    && isRecord(readModel.current_owner_delta)
    ? readModel
    : null;
}

export function selectAppStateCurrentOwnerDeltaReadModel(input: {
  fullRuntimeDrilldown: JsonRecord | null;
  runtimeActivityItems: JsonRecord[];
  statePaths: OplStatePaths;
}) {
  return ownerDeltaReadModelFromFullDrilldown(input.fullRuntimeDrilldown)
    ?? readCurrentOwnerDeltaReadModelProjectionCache({
      paths: input.statePaths,
      acceptedSourceSurfaces: ['framework_readiness'],
      maxAgeMs: APP_CURRENT_OWNER_DELTA_CACHE_MAX_AGE_MS,
    })
    ?? ownerDeltaReadModelFromRuntimeActivity(input.runtimeActivityItems);
}
