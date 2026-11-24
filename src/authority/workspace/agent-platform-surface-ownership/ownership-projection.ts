import path from 'node:path';

import { QUEUE_PROJECTION_VOCABULARY } from '../../../kernel/queue-projection-vocabulary.ts';
import {
  diagnosticRefsForSubdomain,
  explicitForbiddenOwnerClaims,
  hardGateEvidenceRefs,
  normalizeDomainSelection,
  readDeclaredAuthorityBoundary,
  readDomainId,
} from './repo-scan.ts';

export const OPL_OWNED_GENERIC_SUBDOMAINS = [
  {
    subdomain_id: 'generated_cli_mcp_skill_product_shell',
    opl_primitive: 'opl_generated_interface_bundle',
    surface_aliases: ['cli', 'mcp', 'skill', 'product_entry', 'product_entry_manifest'],
    domain_allowed_role: 'domain_handler_target_or_refs_only_adapter',
  },
  {
    subdomain_id: 'generated_domain_handler_dispatch_shell',
    opl_primitive: 'opl_generated_domain_handler_descriptor',
    surface_aliases: [
      'domain_handler',
      'stage_attempt_dispatch_intent',
    ],
    domain_allowed_role: 'domain_handler_target_or_refs_only_adapter',
  },
  {
    subdomain_id: 'generated_action_metadata_command_registration_shell',
    opl_primitive: 'opl_generated_action_metadata_registry',
    surface_aliases: [
      'action_catalog',
      'action_metadata',
      'domain_action_metadata',
      'guarded_action',
      'guarded_actions',
      'guarded_action_catalog',
      'command_registration',
      'mcp_action_scaffold',
    ],
    domain_allowed_role: 'domain_action_ids_handler_refs_or_refs_only_metadata_source',
  },
  {
    subdomain_id: 'status_read_model_and_workbench_shell',
    opl_primitive: 'opl_generated_status_and_hosted_workbench_projection',
    surface_aliases: ['status', 'status_read_model', 'workbench', 'workbench_drilldown', 'portal', 'cockpit'],
    domain_allowed_role: 'refs_only_projection_adapter',
  },
  {
    subdomain_id: 'workspace_source_artifact_memory_locator',
    opl_primitive: 'opl_generic_substrate_projection',
    surface_aliases: ['workspace', 'source', 'artifact', 'memory', 'locator', 'lifecycle'],
    domain_allowed_role: 'opaque_ref_provider',
  },
  {
    subdomain_id: 'stage_attempt_retry_dead_letter',
    opl_primitive: 'opl_provider_backed_family_runtime',
    surface_aliases: ['runtime', 'queue', 'attempt', 'attempt_ledger', 'retry', QUEUE_PROJECTION_VOCABULARY.deadLetter, 'scheduler', 'watch'],
    domain_allowed_role: 'domain_authority_receipt_or_typed_blocker_target',
  },
  {
    subdomain_id: 'ai_selected_stage_route_transport',
    opl_primitive: 'stage_run_ai_route_context_transport',
    surface_aliases: ['route_context', 'stage_scope', 'route_back_hint'],
    domain_allowed_role: 'non_authoritative_route_context_provider',
  },
] as const;

export const RETAINED_DOMAIN_AUTHORITY = [
  'domain_truth',
  'quality_or_export_or_publication_or_visual_verdict',
  'artifact_body_and_mutation_authority',
  'source_readiness_verdict',
  'memory_body_accept_reject',
  'owner_receipt_signing',
  'typed_blocker_materialization',
  'domain_specific_policy_rubric_or_quality_gate',
] as const;

export function buildAgentPlatformSurfaceOwnershipForRepo(repoDir: string, requestedAgentId?: string | null) {
  const resolvedRepoDir = path.resolve(repoDir);
  const domainId = normalizeDomainSelection(readDomainId(resolvedRepoDir, requestedAgentId ?? null));
  const explicitClaims = explicitForbiddenOwnerClaims(resolvedRepoDir);
  const hardEvidenceRefs = hardGateEvidenceRefs(resolvedRepoDir);
  const genericSubdomains = OPL_OWNED_GENERIC_SUBDOMAINS.map((subdomain) => {
    const diagnosticRefs = diagnosticRefsForSubdomain(resolvedRepoDir, subdomain.surface_aliases);
    return {
      subdomain_id: subdomain.subdomain_id,
      owner: 'one-person-lab',
      opl_primitive: subdomain.opl_primitive,
      domain_allowed_role: subdomain.domain_allowed_role,
      status: diagnosticRefs.length > 0
        ? 'advisory_diagnostic_observed'
        : 'available_without_repo_local_declaration',
      hard_gate_evidence_refs: hardEvidenceRefs,
      advisory_diagnostic_refs: diagnosticRefs,
      advisory_diagnostic_policy:
        'filename_contract_text_and_prose_refs_are_diagnostic_only_not_admission_blockers',
      observed_source_refs: diagnosticRefs,
      observed_source_refs_role: 'compatibility_alias_for_advisory_diagnostic_refs',
    };
  });
  const blockers = explicitClaims.map((claim) => (
    `domain_declares_generic_platform_owner:${claim.source_path}:${claim.json_path}`
  ));
  return {
    surface_kind: 'opl_agent_platform_surface_ownership_projection',
    version: 'v1',
    owner: 'one-person-lab',
    repo_dir: resolvedRepoDir,
    domain_id: domainId,
    status: blockers.length === 0 ? 'passed' : 'blocked',
    generic_subdomain_count: genericSubdomains.length,
    generic_subdomains: genericSubdomains,
    explicit_forbidden_owner_claims: explicitClaims,
    blockers,
    hard_gate: {
      status: blockers.length === 0 ? 'passed' : 'blocked',
      source_policy: 'machine_contracts_receipts_and_proofs_only',
      evidence_refs: hardEvidenceRefs,
      blocker_count: blockers.length,
      explicit_forbidden_owner_claims: explicitClaims,
    },
    advisory_diagnostics: {
      status: 'reported_not_blocking',
      source_policy:
        'filename_markdown_prose_and_contract_text_scans_are_for_operator_diagnosis_only',
      can_block_standard_agent_admission: false,
      diagnostic_ref_count: genericSubdomains.reduce(
        (total, subdomain) => total + subdomain.advisory_diagnostic_refs.length,
        0,
      ),
    },
    retained_domain_authority: RETAINED_DOMAIN_AUTHORITY,
    migration_gate: {
      replacement_parity_required: true,
      active_caller_cutover_required: true,
      domain_owner_receipt_or_typed_blocker_required: true,
      no_forbidden_write_proof_required: true,
      descriptor_ready_is_not_production_ready: true,
    },
    declared_authority_boundary: readDeclaredAuthorityBoundary(resolvedRepoDir),
    authority_boundary: {
      opl_owns_generic_platform_surfaces: true,
      opl_can_write_domain_truth: false,
      opl_can_write_memory_body: false,
      opl_can_authorize_quality_or_export: false,
      opl_can_mutate_domain_artifacts: false,
      domain_repos_keep_truth_verdict_artifact_memory_and_receipt_authority: true,
      report_can_claim_domain_ready: false,
      report_can_claim_production_ready: false,
    },
  };
}
