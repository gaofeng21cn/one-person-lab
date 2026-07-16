import {
  isRecord,
  optionalString,
  readJsonFile,
  recordList,
  stringList,
  type JsonRecord,
} from './standard-domain-agent-conformance-utils.ts';

export const STANDARD_AGENT_CONFORMANCE_PROFILE_REF =
  'contracts/standard_agent_conformance_profile.json';

export type StandardAgentConformanceProfile = {
  profile_id: string;
  target_domain_id: string;
  golden_path: {
    required_stage_ids: string[];
    allowed_stage_ids: string[];
    default_stage_id: string;
    forbidden_owner_tokens: string[];
  };
  physical_morphology: {
    scan_roots: string[];
    allowed_residue_prefixes: string[];
    required_surface_ids: string[];
    surface_classifications: JsonRecord[];
    forbidden_name_tokens: string[];
    required_parity_gates: string[];
  };
};

export function readStandardAgentConformanceProfile(repoDir: string) {
  const file = readJsonFile(repoDir, STANDARD_AGENT_CONFORMANCE_PROFILE_REF);
  const payload = isRecord(file.payload) ? file.payload : null;
  const goldenPath = isRecord(payload?.golden_path) ? payload.golden_path : null;
  const morphology = isRecord(payload?.physical_morphology)
    ? payload.physical_morphology
    : null;
  const profile: StandardAgentConformanceProfile | null = payload && goldenPath && morphology
    ? {
        profile_id: optionalString(payload.profile_id) ?? '',
        target_domain_id: optionalString(payload.target_domain_id) ?? '',
        golden_path: {
          required_stage_ids: stringList(goldenPath.required_stage_ids),
          allowed_stage_ids: stringList(goldenPath.allowed_stage_ids),
          default_stage_id: optionalString(goldenPath.default_stage_id) ?? '',
          forbidden_owner_tokens: stringList(goldenPath.forbidden_owner_tokens),
        },
        physical_morphology: {
          scan_roots: stringList(morphology.scan_roots),
          allowed_residue_prefixes: stringList(morphology.allowed_residue_prefixes),
          required_surface_ids: stringList(morphology.required_surface_ids),
          surface_classifications: recordList(morphology.surface_classifications),
          forbidden_name_tokens: stringList(morphology.forbidden_name_tokens),
          required_parity_gates: stringList(morphology.required_parity_gates),
        },
      }
    : null;
  const blockers = [
    file.status === 'resolved' ? null : `standard_agent_conformance_profile_${file.status}`,
    payload ? null : 'standard_agent_conformance_profile_not_declared',
    optionalString(payload?.surface_kind) === 'opl_standard_agent_conformance_profile'
      ? null
      : 'standard_agent_conformance_profile_surface_kind_invalid',
    optionalString(payload?.version) === 'opl.standard-agent-conformance-profile.v1'
      ? null
      : 'standard_agent_conformance_profile_version_invalid',
    profile?.profile_id ? null : 'standard_agent_conformance_profile_id_missing',
    profile?.target_domain_id ? null : 'standard_agent_conformance_profile_target_domain_id_missing',
    profile?.golden_path.required_stage_ids.length
      ? null
      : 'standard_agent_conformance_profile_required_stage_ids_missing',
    profile?.golden_path.allowed_stage_ids.length
      ? null
      : 'standard_agent_conformance_profile_allowed_stage_ids_missing',
    profile?.golden_path.default_stage_id
      ? null
      : 'standard_agent_conformance_profile_default_stage_id_missing',
    profile?.physical_morphology.scan_roots.length
      ? null
      : 'standard_agent_conformance_profile_scan_roots_missing',
    profile?.physical_morphology.required_surface_ids.length
      ? null
      : 'standard_agent_conformance_profile_required_surface_ids_missing',
    profile?.physical_morphology.surface_classifications.length
      ? null
      : 'standard_agent_conformance_profile_surface_classifications_missing',
  ].filter((entry): entry is string => Boolean(entry));
  return {
    status: blockers.length === 0 ? 'resolved' as const : 'blocked' as const,
    source_ref: STANDARD_AGENT_CONFORMANCE_PROFILE_REF,
    profile,
    blockers,
  };
}
