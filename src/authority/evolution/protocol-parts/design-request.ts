import { isRecord } from '../../../kernel/contract-validation.ts';
import { fail, requiredString, requiredUniqueStringList, assertExactKeys, assertNonNegativeNumericMap, requiredUniqueContentRefList } from './validation-values.ts';
import { assertBase } from './semantic-boundary.ts';
import type { BaselineAdoptionRequest, DesignRequest } from './types.ts';

function validateBaselineAdoptionRequest(value: unknown): BaselineAdoptionRequest {
  if (!isRecord(value)) fail('DesignRequest.baseline_adoption must be an object.');
  assertExactKeys(value, 'DesignRequest.baseline_adoption', [
    'surface_kind',
    'version',
    'owner_authorization_ref',
    'evidence_refs',
    'qualification_obligation_refs',
  ]);
  if (
    value.surface_kind !== 'opl_foundry_baseline_adoption_request'
    || value.version !== 'opl-foundry-baseline-adoption-request.v1'
  ) {
    fail('DesignRequest.baseline_adoption identity is invalid.');
  }
  const ownerAuthorizationRef = requiredString(
    value.owner_authorization_ref, 'DesignRequest.baseline_adoption.owner_authorization_ref',
  );
  if (!/^opl:\/\/foundry\/owner-authority-receipts\/sha256:[a-f0-9]{64}$/.test(ownerAuthorizationRef)) {
    fail('DesignRequest.baseline_adoption.owner_authorization_ref must bind an exact OwnerGate receipt.');
  }
  return {
    surface_kind: 'opl_foundry_baseline_adoption_request',
    version: 'opl-foundry-baseline-adoption-request.v1',
    owner_authorization_ref: ownerAuthorizationRef,
    evidence_refs: requiredUniqueContentRefList(value.evidence_refs, 'DesignRequest.baseline_adoption.evidence_refs'),
    qualification_obligation_refs: requiredUniqueContentRefList(
      value.qualification_obligation_refs, 'DesignRequest.baseline_adoption.qualification_obligation_refs',
    ),
  };
}

export function validateDesignRequest(value: unknown): DesignRequest {
  const input = assertBase(value, 'opl_foundry_design_request', 'DesignRequest');
  const requestKeys = [
    'surface_kind',
    'version',
    'request_id',
    'mode',
    'target_agent_id',
    'target_domain_id',
    'target_version_ref',
    'objective',
    'acceptance_criteria',
    'non_goals',
    'source_refs',
    'constraints',
    'delivery_policy',
  ];
  if (Object.hasOwn(input, 'baseline_adoption')) requestKeys.push('baseline_adoption');
  assertExactKeys(input, 'DesignRequest', requestKeys);
  if (!['create', 'takeover', 'improve'].includes(String(input.mode))) fail('DesignRequest.mode is invalid.');
  if (input.mode === 'create' && input.target_version_ref !== null) {
    fail('Create DesignRequest must not bind a target version.');
  }
  if (input.mode !== 'create' && input.target_version_ref === null) {
    fail('Takeover and improve DesignRequest must bind an exact target version digest.');
  }
  requiredString(input.request_id, 'DesignRequest.request_id');
  requiredString(input.objective, 'DesignRequest.objective');
  requiredUniqueStringList(input.acceptance_criteria, 'DesignRequest.acceptance_criteria');
  requiredUniqueStringList(input.non_goals, 'DesignRequest.non_goals');
  requiredUniqueStringList(input.source_refs, 'DesignRequest.source_refs');
  if (!isRecord(input.constraints)) fail('DesignRequest.constraints must be an object.');
  assertExactKeys(input.constraints, 'DesignRequest.constraints', [
    'capability_refs',
    'permission_refs',
    'privacy_requirements',
    'cost_limits',
    'latency_limits',
  ]);
  requiredUniqueStringList(input.constraints.capability_refs, 'DesignRequest.constraints.capability_refs');
  requiredUniqueStringList(input.constraints.permission_refs, 'DesignRequest.constraints.permission_refs');
  requiredUniqueStringList(input.constraints.privacy_requirements, 'DesignRequest.constraints.privacy_requirements');
  assertNonNegativeNumericMap(input.constraints.cost_limits, 'DesignRequest.constraints.cost_limits');
  assertNonNegativeNumericMap(input.constraints.latency_limits, 'DesignRequest.constraints.latency_limits');
  if (!isRecord(input.delivery_policy)) fail('DesignRequest.delivery_policy must be an object.');
  assertExactKeys(input.delivery_policy, 'DesignRequest.delivery_policy', ['activation_mode', 'max_generations']);
  if (!['qualify_only', 'activate'].includes(String(input.delivery_policy.activation_mode))) {
    fail('DesignRequest.delivery_policy.activation_mode is invalid.');
  }
  const maxGenerations = input.delivery_policy.max_generations;
  if (!Number.isInteger(maxGenerations) || Number(maxGenerations) < 1 || Number(maxGenerations) > 5) {
    fail('DesignRequest.delivery_policy.max_generations must be an integer from 1 to 5.');
  }
  if (Object.hasOwn(input, 'baseline_adoption')) {
    if (input.mode !== 'improve') fail('Baseline adoption requires DesignRequest.mode=improve.');
    if (input.target_version_ref === null) fail('Baseline adoption requires an exact target AgentVersion digest.');
    requiredUniqueContentRefList(input.source_refs, 'DesignRequest.source_refs');
    requiredUniqueStringList(input.constraints.permission_refs, 'DesignRequest.constraints.permission_refs', 1);
    input.baseline_adoption = validateBaselineAdoptionRequest(input.baseline_adoption);
  }
  return input as unknown as DesignRequest;
}
