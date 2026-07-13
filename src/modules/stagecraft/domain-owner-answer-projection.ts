import {
  resolveDomainOwnerAnswerProjectionProfiles,
  type DomainOwnerAnswerProjectionProfile,
} from '../../kernel/domain-owner-answer-projection-profile.ts';

export const OWNER_ANSWER_PROJECTION_REGISTRY_SURFACE_KIND =
  'opl_domain_owner_answer_projection_profile_registry';
const OWNER_ANSWER_PROJECTION_POLICY =
  'generic_domain_owner_answer_refs_only_no_domain_truth_or_readiness_claim';
const OWNER_ANSWER_PROJECTION_REGISTRY_READBACK_SURFACE_KIND =
  'opl_domain_owner_answer_projection_profile_registry_readback';

export type OwnerAnswerProjectionProfile = DomainOwnerAnswerProjectionProfile;

export function buildOwnerAnswerProjectionProfileRegistryReadback(
  profiles: ReadonlyArray<OwnerAnswerProjectionProfile> = resolveDomainOwnerAnswerProjectionProfiles(),
) {
  const entries = profiles.map((profile) => {
    const projectionRole = profileProjectionRole(profile);
    return {
      profile_id: profile.profileId,
      profile_role: profile.profileRole,
      projection_role: projectionRole,
      domain_id: profile.domainId,
      binding_project_id: profile.bindingProjectId,
      source_owner: profile.sourceOwner,
      compatibility_projection: profile.profileRole === 'compatibility',
      studies_dir_name: profile.studiesDirName,
      projection_relative_path: profile.projectionRelativePath,
    };
  });
  return {
    surface_kind: OWNER_ANSWER_PROJECTION_REGISTRY_READBACK_SURFACE_KIND,
    version: 'owner-answer-projection-profile-registry-readback.v1',
    registry_surface_kind: OWNER_ANSWER_PROJECTION_REGISTRY_SURFACE_KIND,
    registry_role: 'generic_domain_owner_answer_projection_profile_registry',
    projection_policy: OWNER_ANSWER_PROJECTION_POLICY,
    profile_count: entries.length,
    compatibility_profile_count: entries.filter((entry) => entry.profile_role === 'compatibility').length,
    domain_profile_count: entries.filter((entry) => entry.profile_role === 'registry').length,
    profiles: entries,
    authority_boundary: {
      surface_kind: 'opl_domain_owner_answer_projection_registry_authority_boundary',
      registry_surface_kind: OWNER_ANSWER_PROJECTION_REGISTRY_SURFACE_KIND,
      refs_only: true,
      consumer_owner: 'one-person-lab',
      can_write_domain_truth: false,
      can_create_owner_receipt: false,
      can_create_typed_blocker: false,
      can_claim_domain_ready: false,
      can_claim_production_ready: false,
    },
  };
}

function profileProjectionRole(profile: OwnerAnswerProjectionProfile) {
  return profile.profileRole === 'compatibility'
    ? 'compatibility_projection'
    : 'domain_profile_projection';
}
