import { isDeepStrictEqual } from 'node:util';

import {
  FOUNDRY_AGENT_SERIES_CONTRACT_REF,
  STANDARD_DOMAIN_AGENT_SKELETON_CONTRACT_REF,
  canonicalFoundryAgentSeriesPolicy,
} from '../public/foundry-agent-series-policy.ts';
import {
  FOUNDRY_AGENT_SERIES_CONSUMER_KIND,
  FOUNDRY_AGENT_SERIES_CONSUMER_VERSION,
  FOUNDRY_AGENT_SERIES_LEGACY_POLICY_BODY_FIELDS,
  FOUNDRY_AGENT_SERIES_POLICY_EXPORT,
} from '../standard-domain-agent-scaffold-constants.ts';
import { isPlainRecord, readOptionalString } from './shared.ts';

function forbiddenActivePublicFoundryFieldName(key: string) {
  return key === 'public_surface_role'
    || key === 'foundry_public_surface_role'
    || key === 'forbidden_public_surface_roles';
}

function findForbiddenActivePublicFoundryFields(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => findForbiddenActivePublicFoundryFields(entry));
  }
  if (!isPlainRecord(value)) return [];
  return Object.entries(value).flatMap(([key, entry]) => [
    ...(forbiddenActivePublicFoundryFieldName(key)
      ? [`foundry_agent_public_projection_forbidden_role_field:${key}`]
      : []),
    ...findForbiddenActivePublicFoundryFields(entry),
  ]);
}

function falseAuthorityBlockers(authorityBoundary: unknown) {
  if (!isPlainRecord(authorityBoundary)) {
    return ['foundry_agent_series_authority_boundary_missing_or_invalid'];
  }
  const entries = Object.entries(authorityBoundary);
  return [
    entries.length > 0 ? null : 'foundry_agent_series_authority_boundary_empty',
    ...entries.map(([field, value]) => value === false
      ? null
      : `foundry_agent_series_authority_boundary_must_be_false:${field}`),
  ];
}

export function validateFoundryAgentSeriesContract(foundryAgentSeries: unknown) {
  const contract = isPlainRecord(foundryAgentSeries) ? foundryAgentSeries : null;
  const canonicalPolicy = canonicalFoundryAgentSeriesPolicy();
  const sharedPolicyRelease = isPlainRecord(contract?.shared_policy_release)
    ? contract.shared_policy_release
    : null;
  const legacyBodyFields = FOUNDRY_AGENT_SERIES_LEGACY_POLICY_BODY_FIELDS.filter((field) =>
    contract && Object.hasOwn(contract, field)
  );
  const blockers = [
    contract ? null : 'foundry_agent_series_contract_missing_or_invalid',
    readOptionalString(contract?.surface_kind) === FOUNDRY_AGENT_SERIES_CONSUMER_KIND
      ? null
      : 'foundry_agent_series_surface_kind_invalid',
    readOptionalString(contract?.version) === FOUNDRY_AGENT_SERIES_CONSUMER_VERSION
      ? null
      : 'foundry_agent_series_version_invalid',
    readOptionalString(contract?.canonical_policy_export) === FOUNDRY_AGENT_SERIES_POLICY_EXPORT
      ? null
      : 'foundry_agent_series_canonical_policy_export_invalid',
    readOptionalString(contract?.canonical_series_contract_ref) === FOUNDRY_AGENT_SERIES_CONTRACT_REF
      ? null
      : 'foundry_agent_series_canonical_series_contract_ref_invalid',
    readOptionalString(contract?.canonical_skeleton_contract_ref) === STANDARD_DOMAIN_AGENT_SKELETON_CONTRACT_REF
      ? null
      : 'foundry_agent_series_canonical_skeleton_contract_ref_invalid',
    isDeepStrictEqual(sharedPolicyRelease, canonicalPolicy.shared_policy_release)
      ? null
      : 'foundry_agent_series_policy_release_pin_invalid',
    readOptionalString(contract?.domain_id) ? null : 'foundry_agent_series_missing_domain_id',
    readOptionalString(contract?.foundry_agent_id) ? null : 'foundry_agent_series_missing_foundry_agent_id',
    readOptionalString(contract?.authority_owner) ? null : 'foundry_agent_series_missing_authority_owner',
    readOptionalString(contract?.product_layer) === 'foundry_agent'
      ? null
      : 'foundry_agent_series_product_layer_invalid',
    readOptionalString(contract?.stage_manifest_ref) === 'agent/stages/manifest.json'
      ? null
      : 'foundry_agent_series_stage_manifest_ref_invalid',
    readOptionalString(contract?.stage_control_plane_ref) === 'opl-generated:family_stage_control_plane'
      ? null
      : 'foundry_agent_series_generated_stage_control_plane_ref_invalid',
    ...legacyBodyFields.map((field) => `foundry_agent_series_legacy_policy_body_forbidden:${field}`),
    ...falseAuthorityBlockers(contract?.authority_boundary),
    ...findForbiddenActivePublicFoundryFields(contract),
  ].filter((entry): entry is string => Boolean(entry));

  return {
    surface_kind: 'opl_foundry_agent_series_contract_validation',
    contract_ref: 'contracts/foundry_agent_series.json',
    status: blockers.length === 0 ? 'passed' : 'blocked',
    required_for_standard_agent: true,
    canonical_policy_export: FOUNDRY_AGENT_SERIES_POLICY_EXPORT,
    canonical_series_contract_ref: FOUNDRY_AGENT_SERIES_CONTRACT_REF,
    canonical_skeleton_contract_ref: STANDARD_DOMAIN_AGENT_SKELETON_CONTRACT_REF,
    shared_policy_release: sharedPolicyRelease,
    canonical_policy_resolution: {
      status: 'resolved',
      series_design_profile_id: readOptionalString(canonicalPolicy.series_design_profile.profile_id),
      workspace_topology_profile_id: readOptionalString(canonicalPolicy.workspace_topology_profile.profile_id),
    },
    blockers,
    advisory_findings: [],
  };
}
