import type {
  AgentPackageCodexModelPolicyProjection,
  AgentPackageFlowCapabilityBundle,
  AgentPackageManagedPolicyDependency,
  AgentPackageManagedPolicyDetectedConflict,
  AgentPackageManifest,
} from '../types.ts';

const MIGRATION_SURFACE_KINDS = [
  'plugin',
  'skill',
  'service',
  'config_table',
  'prompt_or_agent',
] as const;

type MigrationSurfaceKind = typeof MIGRATION_SURFACE_KINDS[number];

type MigrationGroup = {
  id: string;
  discovery_ids: string[];
  surface_kinds: MigrationSurfaceKind[];
  auto_retire_on_optimize: boolean;
  reason: string;
};

type HistoricalFingerprints = {
  plugin_ids: string[];
  skill_ids: string[];
  service_ids: string[];
  config_markers: string[];
  legacy_prompt_ids: string[];
};

type OplFlowPolicy = {
  schema: 'opl_flow_workflow_policy.v4';
  package: { id: string; version: string; owner: string; kind: string };
  workflow_generation: string;
  provides: AgentPackageManagedPolicyDependency[];
  requires: AgentPackageManagedPolicyDependency[];
  experience_baseline: AgentPackageManagedPolicyDependency[];
  compatible_optional: AgentPackageManagedPolicyDependency[];
  capability_bundles: AgentPackageFlowCapabilityBundle[];
  conflicts: MigrationGroup[];
  retires: MigrationGroup[];
  migration_policy: Record<string, unknown>;
  historical_fingerprints: HistoricalFingerprints;
  codex_model_policy: Omit<
    AgentPackageCodexModelPolicyProjection,
    'surface_kind' | 'configured_default_role' | 'effective_selection' | 'role'
  >;
};

type InventoryItem = {
  surfaceKind: AgentPackageManagedPolicyDetectedConflict['surface_kind'];
  canonicalId: string;
  aliases: string[];
  physicalRef: string;
};

type ManagedPolicyIdentity = {
  packageId: string;
  packageVersion: string;
  pluginId: string | null;
  activeCarrierIdentity?: string | null;
  requiredSkillIds: string[];
  config: NonNullable<AgentPackageManifest['managed_policy_surface']>;
};

type ClassifiedInventoryItem = {
  item: InventoryItem;
  migrationId: string;
};

type ManagedPolicyInspection = {
  config: ManagedPolicyIdentity['config'];
  policy: OplFlowPolicy;
  policyPath: string;
  schemaPath: string;
  home: string;
  policySha256: string;
  inventoryDigest: string;
  enabledMigrationIds: string[];
  detectedConflicts: AgentPackageManagedPolicyDetectedConflict[];
};

export { MIGRATION_SURFACE_KINDS };
export type {
  AgentPackageManagedPolicyDependency,
  ClassifiedInventoryItem,
  HistoricalFingerprints,
  InventoryItem,
  ManagedPolicyIdentity,
  ManagedPolicyInspection,
  MigrationGroup,
  MigrationSurfaceKind,
  OplFlowPolicy,
};
