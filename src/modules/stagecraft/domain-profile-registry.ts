import {
  buildOwnerAnswerProjectionProfileRegistryReadback,
  type OwnerAnswerProjectionProfile,
} from './domain-owner-answer-projection.ts';
import {
  buildVisualTransitionAdapterProfileRegistryReadback,
} from './family-transition-visual-ingestion.ts';

export function buildStagecraftDomainProfileRegistryReadback(
  profiles?: ReadonlyArray<OwnerAnswerProjectionProfile>,
) {
  const ownerAnswerProjection = buildOwnerAnswerProjectionProfileRegistryReadback(profiles);
  const transitionAdapter = buildVisualTransitionAdapterProfileRegistryReadback();
  return {
    surface_kind: 'opl_stagecraft_domain_profile_registry_readback',
    version: 'stagecraft-domain-profile-registry-readback.v1',
    module_id: 'stagecraft',
    registry_role: 'generic_stagecraft_domain_profile_registry',
    owner_answer_projection: ownerAnswerProjection,
    transition_adapter: transitionAdapter,
    summary: {
      owner_answer_projection_profile_count: ownerAnswerProjection.profile_count,
      owner_answer_projection_compatibility_profile_count:
        ownerAnswerProjection.compatibility_profile_count,
      transition_adapter_profile_count: transitionAdapter.profile_count,
      transition_adapter_compatibility_profile_count:
        transitionAdapter.compatibility_profile_count,
    },
    authority_boundary: {
      surface_kind: 'opl_stagecraft_domain_profile_registry_authority_boundary',
      registry_is_readback_only: true,
      can_write_domain_truth: false,
      can_create_owner_receipt: false,
      can_create_typed_blocker: false,
      can_claim_domain_ready: false,
      can_claim_visual_ready: false,
      can_claim_exportable: false,
      can_mutate_artifacts: false,
      can_claim_production_ready: false,
    },
  };
}
