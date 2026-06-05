import { buildCurrentOwnerDeltaTopline } from '../current-owner-delta-topline.ts';
import type { JsonRecord } from '../runtime-tray-snapshot-types.ts';

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function record(value: unknown): JsonRecord {
  return isRecord(value) ? value : {};
}

export function buildAppOperatorOwnerDeltaTopline(input: {
  attentionFirstPayload: JsonRecord;
}) {
  const readModel = record(input.attentionFirstPayload.current_owner_delta_read_model);
  const topline = buildCurrentOwnerDeltaTopline({
    currentOwnerDeltaReadModel: readModel,
  });
  return {
    ...topline,
    operator: {
      current_owner_delta: topline.current_owner_delta,
      current_owner_delta_read_model: readModel,
      stage_run_cockpit: topline.stage_run_cockpit,
    },
    workbench: {
      current_owner_delta: topline.current_owner_delta,
      current_owner_delta_read_model: readModel,
      stage_run_cockpit: topline.stage_run_cockpit,
    },
    owner_delta_topline_authority_boundary: {
      refs_only: true,
      can_write_domain_truth: false,
      can_read_memory_body: false,
      can_read_artifact_body: false,
      can_create_owner_receipt: false,
      can_create_typed_blocker: false,
      can_write_owner_receipt: false,
      can_generate_typed_blocker: false,
      can_authorize_quality_or_export: false,
      can_close_domain_ready: false,
      can_claim_domain_ready: false,
      can_claim_app_release_ready: false,
      can_claim_production_ready: false,
      read_model_counts_as_closeout: false,
      provider_completion_counts_as_closeout: false,
    },
  };
}
