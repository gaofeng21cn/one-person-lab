import { FrameworkContractError } from '../../kernel/contract-validation.ts';
import { buildGeneratedAgentInterfaces } from '../pack/index.ts';
import {
  isRecord,
  optionalString,
  stringList,
} from '../pack/index.ts';
import type { FrameworkContracts } from '../../kernel/types.ts';

const GENERATED_DEFAULT_ENTRY_SURFACE_IDS = [
  'cli',
  'mcp',
  'openai_tool',
  'ai_sdk',
  'skill_plugin',
  'app_action',
  'status_read_model',
  'workbench',
] as const;

const CANONICAL_SOURCE_OF_WORK_POLICY =
  'derive_cli_mcp_openai_ai_sdk_skill_app_status_workbench_from_single_catalog';

export function buildGeneratedInterfaceCheck(repoDir: string) {
  try {
    const result = buildGeneratedAgentInterfaces({} as FrameworkContracts, ['--repo-dir', repoDir]);
    const bundle = result.generated_agent_interfaces;
    const wrapperBundle = isRecord(bundle.generated_wrapper_bundle) ? bundle.generated_wrapper_bundle : null;
    const targetProof = isRecord(bundle.active_caller_target_proof) ? bundle.active_caller_target_proof : null;
    const cutoverProof = isRecord(bundle.active_caller_cutover_proof) ? bundle.active_caller_cutover_proof : null;
    const defaultEntryPolicy = isRecord(bundle.default_entry_policy) ? bundle.default_entry_policy : {};
    const sourceOfWorkLineage = isRecord(bundle.source_of_work_lineage) ? bundle.source_of_work_lineage : {};
    const productStatus = isRecord(bundle.product_status) ? bundle.product_status : {};
    const workbench = isRecord(bundle.workbench) ? bundle.workbench : {};
    const generatedDirectParity = isRecord(bundle.generated_direct_parity)
      ? bundle.generated_direct_parity
      : null;
    const generatedDirectParityBoundary = isRecord(generatedDirectParity?.authority_boundary)
      ? generatedDirectParity.authority_boundary
      : {};
    const roundtripEntries = Array.isArray(generatedDirectParity?.accepted_answer_shape_roundtrip)
      ? generatedDirectParity.accepted_answer_shape_roundtrip.filter(isRecord)
      : [];
    const roundtripActionIds = roundtripEntries
      .map((entry) => optionalString(entry.action_id))
      .filter((entry): entry is string => Boolean(entry));
    const defaultEntrySurfaceIds = stringList(defaultEntryPolicy.default_entry_surface_ids);
    const lineageSurfaceIds = stringList(sourceOfWorkLineage.derived_surface_ids);
    const missingDefaultEntrySurfaceIds = GENERATED_DEFAULT_ENTRY_SURFACE_IDS
      .filter((surfaceId) => !defaultEntrySurfaceIds.includes(surfaceId));
    const missingLineageSurfaceIds = GENERATED_DEFAULT_ENTRY_SURFACE_IDS
      .filter((surfaceId) => !lineageSurfaceIds.includes(surfaceId));
    const sourceOfWorkBoundary = isRecord(sourceOfWorkLineage.authority_boundary)
      ? sourceOfWorkLineage.authority_boundary
      : {};
    const sourceOfWorkBlockers = [
      optionalString(defaultEntryPolicy.status) === 'generated_surfaces_are_default_entry_baseline'
        ? null
        : `default_entry_policy_status_invalid:${optionalString(defaultEntryPolicy.status) ?? 'missing'}`,
      defaultEntryPolicy.domain_repo_can_own_default_entry === false
        ? null
        : 'default_entry_policy_domain_repo_can_own_default_entry_must_be_false',
      optionalString(defaultEntryPolicy.domain_repo_wrapper_policy)
        === 'handler_target_refs_only_adapter_or_tombstone_candidate'
        ? null
        : 'default_entry_policy_domain_repo_wrapper_policy_not_canonical',
      ...missingDefaultEntrySurfaceIds.map((surfaceId) => `default_entry_surface_missing:${surfaceId}`),
      optionalString(sourceOfWorkLineage.status) === 'ready_from_family_action_catalog'
        ? null
        : `source_of_work_lineage_status_not_ready:${optionalString(sourceOfWorkLineage.status) ?? 'missing'}`,
      optionalString(sourceOfWorkLineage.derived_surface_policy) === CANONICAL_SOURCE_OF_WORK_POLICY
        ? null
        : 'source_of_work_lineage_derived_surface_policy_not_canonical',
      optionalString(sourceOfWorkLineage.domain_repo_wrapper_policy)
        === 'handler_target_refs_only_adapter_or_tombstone_candidate'
        ? null
        : 'source_of_work_lineage_domain_repo_wrapper_policy_not_canonical',
      ...missingLineageSurfaceIds.map((surfaceId) => `source_of_work_lineage_surface_missing:${surfaceId}`),
      sourceOfWorkBoundary.lineage_can_write_domain_truth === false
        ? null
        : 'source_of_work_lineage_can_write_domain_truth_must_be_false',
      sourceOfWorkBoundary.lineage_can_claim_domain_ready === false
        ? null
        : 'source_of_work_lineage_can_claim_domain_ready_must_be_false',
      sourceOfWorkBoundary.lineage_can_claim_production_ready === false
        ? null
        : 'source_of_work_lineage_can_claim_production_ready_must_be_false',
      isRecord(productStatus.source_of_work_lineage)
        ? null
        : 'product_status_missing_source_of_work_lineage',
      isRecord(workbench.source_of_work_lineage)
        ? null
        : 'workbench_missing_source_of_work_lineage',
    ].filter((entry): entry is string => Boolean(entry));
    const blockers = [
      optionalString(bundle.status) === 'ready'
        ? null
        : `generated_interfaces_status_not_ready:${optionalString(bundle.status) ?? 'missing'}`,
      optionalString(bundle.owner) === 'one-person-lab'
        ? null
        : `generated_interfaces_owner_not_opl:${optionalString(bundle.owner) ?? 'missing'}`,
      bundle.domain_repo_can_own_generated_surface === false
        ? null
        : 'generated_interfaces_domain_repo_can_own_generated_surface_must_be_false',
      optionalString(wrapperBundle?.status) === 'ready'
        ? null
        : `generated_wrapper_bundle_status_not_ready:${optionalString(wrapperBundle?.status) ?? 'missing'}`,
      optionalString(targetProof?.status) === 'ready'
        ? null
        : `active_caller_target_proof_status_not_ready:${optionalString(targetProof?.status) ?? 'missing'}`,
      optionalString(cutoverProof?.status) === 'cutover_to_opl_generated_or_domain_handler_targets'
        ? null
        : `active_caller_cutover_proof_status_not_ready:${optionalString(cutoverProof?.status) ?? 'missing'}`,
      optionalString(generatedDirectParity?.status) === 'aligned'
        ? null
        : `generated_direct_parity_status_not_aligned:${optionalString(generatedDirectParity?.status) ?? 'missing'}`,
      roundtripEntries.length > 0
        ? null
        : 'generated_direct_parity_roundtrip_missing',
      roundtripEntries.every((entry) =>
        optionalString(entry.roundtrip_status) === 'accepted_answer_shape_aligned'
      )
        ? null
        : 'generated_direct_parity_roundtrip_not_aligned',
      generatedDirectParityBoundary.parity_proof_can_write_domain_truth === false
        ? null
        : 'generated_direct_parity_can_write_domain_truth_must_be_false',
      generatedDirectParityBoundary.parity_proof_can_sign_owner_receipt === false
        ? null
        : 'generated_direct_parity_can_sign_owner_receipt_must_be_false',
      generatedDirectParityBoundary.parity_proof_can_create_typed_blocker === false
        ? null
        : 'generated_direct_parity_can_create_typed_blocker_must_be_false',
      generatedDirectParityBoundary.parity_proof_can_claim_domain_ready === false
        ? null
        : 'generated_direct_parity_can_claim_domain_ready_must_be_false',
      generatedDirectParityBoundary.parity_proof_can_claim_production_ready === false
        ? null
        : 'generated_direct_parity_can_claim_production_ready_must_be_false',
      ...sourceOfWorkBlockers,
    ].filter((entry): entry is string => Boolean(entry));
    return {
      status: blockers.length === 0 ? 'passed' : 'blocked',
      generated_interfaces_status: optionalString(bundle.status),
      generated_surface_owner: optionalString(bundle.generated_surface_owner),
      domain_repo_can_own_generated_surface: bundle.domain_repo_can_own_generated_surface,
      generated_wrapper_bundle_status: optionalString(wrapperBundle?.status),
      active_caller_target_proof_status: optionalString(targetProof?.status),
      active_caller_cutover_proof_status: optionalString(cutoverProof?.status),
      generated_direct_parity_status: optionalString(generatedDirectParity?.status),
      generated_direct_roundtrip_action_ids: roundtripActionIds,
      generated_direct_parity_authority_boundary: {
        can_write_domain_truth: generatedDirectParityBoundary.parity_proof_can_write_domain_truth === true,
        can_sign_owner_receipt: generatedDirectParityBoundary.parity_proof_can_sign_owner_receipt === true,
        can_create_typed_blocker: generatedDirectParityBoundary.parity_proof_can_create_typed_blocker === true,
        can_claim_domain_ready: generatedDirectParityBoundary.parity_proof_can_claim_domain_ready === true,
        can_claim_production_ready: generatedDirectParityBoundary.parity_proof_can_claim_production_ready === true,
      },
      claims_live_soak_complete: cutoverProof?.claims_live_soak_complete === true,
      claims_domain_ready: cutoverProof?.claims_domain_ready === true,
      default_entry_source_of_work_gate: {
        surface_kind: 'opl_generated_default_entry_source_of_work_gate',
        status: sourceOfWorkBlockers.length === 0 ? 'passed' : 'blocked',
        source_catalogs: stringList(defaultEntryPolicy.source_catalogs),
        default_entry_surface_ids: defaultEntrySurfaceIds,
        source_of_work_lineage_status: optionalString(sourceOfWorkLineage.status),
        source_of_work_lineage_derived_surface_ids: lineageSurfaceIds,
        missing_default_entry_surface_ids: missingDefaultEntrySurfaceIds,
        missing_lineage_surface_ids: missingLineageSurfaceIds,
        product_status_consumes_lineage: isRecord(productStatus.source_of_work_lineage),
        workbench_consumes_lineage: isRecord(workbench.source_of_work_lineage),
        domain_repo_can_own_default_entry: defaultEntryPolicy.domain_repo_can_own_default_entry,
        domain_repo_wrapper_policy:
          optionalString(defaultEntryPolicy.domain_repo_wrapper_policy)
          ?? optionalString(sourceOfWorkLineage.domain_repo_wrapper_policy),
        descriptor_pass_can_claim_domain_ready: false,
        authority_boundary: {
          can_write_domain_truth: false,
          can_claim_domain_ready: false,
          can_claim_production_ready: false,
          generated_default_entry_is_domain_authority: false,
        },
        blockers: sourceOfWorkBlockers,
      },
      blocker_reasons: Array.isArray(bundle.blocker_reasons)
        ? bundle.blocker_reasons.filter((entry): entry is string => typeof entry === 'string')
        : [],
      blockers,
    };
  } catch (error) {
    const code = error instanceof FrameworkContractError ? error.code : 'generated_interfaces_error';
    return {
      status: 'blocked',
      generated_interfaces_status: 'error',
      generated_surface_owner: null,
      domain_repo_can_own_generated_surface: null,
      generated_wrapper_bundle_status: null,
      active_caller_target_proof_status: null,
      active_caller_cutover_proof_status: null,
      claims_live_soak_complete: false,
      claims_domain_ready: false,
      default_entry_source_of_work_gate: {
        surface_kind: 'opl_generated_default_entry_source_of_work_gate',
        status: 'blocked',
        source_catalogs: [],
        default_entry_surface_ids: [],
        source_of_work_lineage_status: 'error',
        source_of_work_lineage_derived_surface_ids: [],
        missing_default_entry_surface_ids: [...GENERATED_DEFAULT_ENTRY_SURFACE_IDS],
        missing_lineage_surface_ids: [...GENERATED_DEFAULT_ENTRY_SURFACE_IDS],
        product_status_consumes_lineage: false,
        workbench_consumes_lineage: false,
        domain_repo_can_own_default_entry: null,
        domain_repo_wrapper_policy: null,
        descriptor_pass_can_claim_domain_ready: false,
        authority_boundary: {
          can_write_domain_truth: false,
          can_claim_domain_ready: false,
          can_claim_production_ready: false,
          generated_default_entry_is_domain_authority: false,
        },
        blockers: [`generated_interfaces_error:${code}`],
      },
      blocker_reasons: [],
      blockers: [`generated_interfaces_error:${code}`],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
