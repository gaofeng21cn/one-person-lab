import type { FamilyStageDescriptor } from './family-stage-control-plane-contract.ts';

export type FamilyStageGuaranteeMode =
  | 'static_admission_only'
  | 'runtime_enforced'
  | 'domain_owned_judgment'
  | 'observability_only';

type JsonRecord = Record<string, unknown>;

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readBoolean(record: JsonRecord, key: string) {
  return typeof record[key] === 'boolean' ? record[key] as boolean : null;
}

export function buildFamilyStageGuaranteeProjection(stage: FamilyStageDescriptor) {
  const trust = stage.trust_boundary;
  const oplRole = optionalString(stage.authority_boundary.opl_role);
  const runtimeEnforced = trust?.effect_boundary === true
    || trust?.runtime_guard_required === true
    || ['ai_decision', 'human_gate', 'external_system'].includes(trust?.lane ?? '');
  const domainOwnedJudgment = trust?.owner_receipt_required === true
    || trust?.human_gate_required === true
    || readBoolean(stage.authority_boundary, 'no_quality_verdict') === true
    || readBoolean(stage.authority_boundary, 'can_authorize_quality_verdict') === false
    || readBoolean(stage.authority_boundary, 'can_write_domain_truth') === false;
  const observabilityOnly = trust?.lane === 'app_projection'
    || oplRole === 'projection_consumer_only'
    || oplRole === 'descriptor_only'
    || oplRole === 'discovery_only';
  const modes: FamilyStageGuaranteeMode[] = [
    runtimeEnforced ? 'runtime_enforced' : 'static_admission_only',
    ...(domainOwnedJudgment ? ['domain_owned_judgment' as const] : []),
    ...(observabilityOnly ? ['observability_only' as const] : []),
  ];
  return {
    primary_mode: modes[0],
    modes: [...new Set(modes)],
    runtime_enforced: runtimeEnforced,
    domain_owned_judgment: domainOwnedJudgment,
    observability_only: observabilityOnly,
    authority_boundary: 'projection_only_no_domain_verdict_authority',
  };
}
