import type {
  FunctionalPrivatizationAudit,
  FunctionalPrivatizationAuditItem,
} from '../functional-privatization-audit-types.ts';
import { unique } from './json-record-helpers.ts';

export const EMPTY_SUMMARY = {
  total_module_count: 0,
  opl_owned_replacement_count: 0,
  opl_hosted_surface_count: 0,
  opl_generated_surface_count: 0,
  declarative_pack_count: 0,
  minimal_authority_function_count: 0,
  refs_only_domain_adapter_count: 0,
  temporary_migration_bridge_count: 0,
  diagnostic_cleanup_path_count: 0,
  provenance_or_fixture_count: 0,
  domain_authority_count: 0,
  retire_tombstone_count: 0,
  active_private_generic_residue_count: 0,
  blocker_count: 0,
  default_watchlist_count: 0,
  default_hidden_cleared_count: 0,
  default_watchlist_module_ids: [],
  standard_domain_pack_inventory_count: 0,
  authority_function_inventory_count: 0,
  private_platform_residue_inventory_count: 0,
  standard_domain_pack_module_ids: [],
  authority_function_module_ids: [],
  private_platform_residue_module_ids: [],
  semantic_equivalence_review_count: 0,
  semantic_equivalence_cleared_count: 0,
  semantic_equivalence_review_module_ids: [],
} satisfies FunctionalPrivatizationAudit['summary'];

export function summarize(items: FunctionalPrivatizationAuditItem[]) {
  const blockers = unique(items.map((item) => item.blocker).filter((entry): entry is string => Boolean(entry)));
  const activePrivateGenericResidueCount = items.filter((item) =>
    item.migration_class === 'opl_owned_replacement'
    || item.migration_class === 'temporary_migration_bridge'
  ).length;
  const watchlistItems = items.filter((item) => item.audit_visibility === 'attention_required');
  const semanticEquivalenceReviewItems = items.filter((item) =>
    item.semantic_equivalence_status === 'review_required'
  );
  const standardDomainPackItems = items.filter((item) =>
    item.standardization_layer === 'standard_domain_pack_inventory'
  );
  const authorityFunctionItems = items.filter((item) =>
    item.standardization_layer === 'authority_function_inventory'
  );
  const privatePlatformResidueItems = items.filter((item) =>
    item.standardization_layer === 'private_platform_residue_inventory'
  );
  return {
    summary: {
      total_module_count: items.length,
      opl_owned_replacement_count: items.filter((item) => item.migration_class === 'opl_owned_replacement').length,
      opl_hosted_surface_count: items.filter((item) => item.migration_class === 'opl_hosted_surface').length,
      opl_generated_surface_count: items.filter((item) => item.migration_class === 'opl_generated_surface').length,
      declarative_pack_count: items.filter((item) => item.migration_class === 'declarative_pack').length,
      minimal_authority_function_count: items.filter((item) => item.migration_class === 'minimal_authority_function').length,
      refs_only_domain_adapter_count: items.filter((item) => item.migration_class === 'refs_only_domain_adapter').length,
      temporary_migration_bridge_count: items.filter((item) => item.migration_class === 'temporary_migration_bridge').length,
      diagnostic_cleanup_path_count: items.filter((item) => item.migration_class === 'diagnostic_cleanup_path').length,
      provenance_or_fixture_count: items.filter((item) => item.migration_class === 'provenance_or_fixture').length,
      domain_authority_count: items.filter((item) => item.migration_class === 'domain_authority').length,
      retire_tombstone_count: items.filter((item) => item.migration_class === 'retire_tombstone').length,
      active_private_generic_residue_count: activePrivateGenericResidueCount,
      blocker_count: blockers.length,
      default_watchlist_count: watchlistItems.length,
      default_hidden_cleared_count: items.length - watchlistItems.length,
      default_watchlist_module_ids: watchlistItems.map((item) => item.module_id),
      standard_domain_pack_inventory_count: standardDomainPackItems.length,
      authority_function_inventory_count: authorityFunctionItems.length,
      private_platform_residue_inventory_count: privatePlatformResidueItems.length,
      standard_domain_pack_module_ids: standardDomainPackItems.map((item) => item.module_id),
      authority_function_module_ids: authorityFunctionItems.map((item) => item.module_id),
      private_platform_residue_module_ids: privatePlatformResidueItems.map((item) => item.module_id),
      semantic_equivalence_review_count: semanticEquivalenceReviewItems.length,
      semantic_equivalence_cleared_count: items.length - semanticEquivalenceReviewItems.length,
      semantic_equivalence_review_module_ids: semanticEquivalenceReviewItems.map((item) => item.module_id),
    },
    blockers,
    standardDomainPackItems,
    authorityFunctionItems,
    privatePlatformResidueItems,
  };
}
