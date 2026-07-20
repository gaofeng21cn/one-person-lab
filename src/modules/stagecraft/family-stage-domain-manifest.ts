import type { FamilyActionCatalog } from '../../kernel/family-action-catalog-contract.ts';
import type { FamilyStageControlPlane } from './family-stage-control-plane-contract.ts';

export type FamilyStageDomainManifest = {
  target_domain_id: string;
  family_action_catalog: FamilyActionCatalog | null;
  family_stage_control_plane?: FamilyStageControlPlane | null;
  domain_entry_contract?: {
    domain_agent_entry_spec?: {
      agent_id?: string | null;
    } | null;
  } | null;
};

export type FamilyStageDomainManifestCatalogEntry = {
  project_id: string;
  project: string;
  binding_id: string | null;
  workspace_path?: string | null;
  manifest_command?: string | null;
  status: string;
  manifest?: FamilyStageDomainManifest | null;
  standard_agent_identity?: Record<string, unknown> | null;
  standard_agent_contract_resolution?: Record<string, unknown> | null;
  legacy_workspace_manifest_diagnostic?: Record<string, unknown> | null;
  error?: unknown;
  currentness_owner_action_packet?: Record<string, unknown> | null;
  manifest_cache?: Record<string, unknown> | null;
};

export type FamilyStageDomainManifestCatalog = {
  summary: {
    total_projects_count: number;
    resolved_count: number;
    [key: string]: unknown;
  };
  projects: FamilyStageDomainManifestCatalogEntry[];
  notes: string[];
  [key: string]: unknown;
};

export type ManifestCommandTimeoutPolicy = 'env_or_default' | 'fixed';
