import type { OplStatePaths } from '../../kernel/runtime-state-paths.ts';
import { isRecord } from '../../kernel/contract-validation.ts';
import { stringList, stringValue, type JsonRecord } from '../../kernel/json-record.ts';
import {
  buildCurrentOwnerDeltaCacheRefreshRequiredReadModel,
  buildCurrentOwnerDeltaReadModel,
  readCurrentOwnerDeltaReadModelProjectionCache,
} from '../ledger/public/app-state.ts';

const APP_CURRENT_OWNER_DELTA_CACHE_MAX_AGE_MS = 5 * 60 * 1000;

function ownerDeltaReadModelFromRuntimeActivity(items: JsonRecord[]) {
  const selected = items.find((item) => stringValue(item.lane) === 'attention')
    ?? items.find((item) => stringValue(item.lane) === 'running');
  if (!selected) {
    return buildCurrentOwnerDeltaCacheRefreshRequiredReadModel();
  }
  const domainOwner = stringValue(selected.domain_owner)
    ?? stringValue(selected.project_id)
    ?? 'one-person-lab';
  const stageAttemptId = stringValue(selected.stage_attempt_id)
    ?? stringList(selected.stage_attempt_ids)[0]
    ?? null;
  const studyId = stringValue(selected.study_id);
  const stageId = stringValue(selected.active_stage_id)
    ?? stringValue(selected.stage_id)
    ?? stringValue(selected.stage_ref);
  const workUnitId = stringValue(selected.item_id)
    ?? stringValue(selected.task_id)
    ?? studyId;
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
      domain_id: stringValue(selected.project_id) ?? domainOwner,
      primary_item: {
        source: 'runtime_activity_projection',
        domain_id: stringValue(selected.project_id) ?? domainOwner,
        study_id: studyId,
        stage_id: stageId,
        stage_attempt_id: stageAttemptId,
        work_unit_id: workUnitId,
        action_type: stringValue(selected.action_type),
        currentness_basis: {
          stage_attempt_id: stageAttemptId,
          stage_id: stageId,
          work_unit_id: workUnitId,
        },
      },
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
