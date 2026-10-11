import type {
  AgentPackageConfiguredCodexPluginCarrierDescriptor,
  AgentPackageManifest,
} from './types.ts';

export type InstalledCarrierEntry = {
  pluginId: string;
  version: string | null;
  /** Native list fixtures predating availability readback omit this field; omission means installed. */
  installed?: boolean;
  enabled: boolean;
  sourcePath: string;
  sourceKind: string;
  marketplaceSource: string | null;
};

/**
 * Carrier-neutral installed readback. This is deliberately a read model:
 * carrier lifecycle state is observed here, never recreated in Framework.
 */
export type InstalledPackageCarrierReadback = {
  kind: string;
  identity: string;
  source_ref: string;
  version: string | null;
  enabled: boolean;
  lifecycle_authority: 'carrier_owned';
};

export type InstalledPackageReadiness = {
  installed: boolean;
  physical_status: 'available' | 'unavailable';
  callability: 'callable' | 'disabled';
  projection_callability?: 'callable' | 'disabled';
};

export type InstalledPackageManifest = Pick<
  AgentPackageManifest,
  | 'package_id'
  | 'agent_id'
  | 'package_role'
  | 'display_name'
  | 'publisher'
  | 'version'
  | 'source'
  | 'source_repo'
  | 'codex_surface'
  | 'codex_default_exposure'
  | 'codex_interaction_mode'
  | 'codex_visible_entry'
  | 'entrypoints'
  | 'required_skill_ids'
  | 'optional_skill_refs'
  | 'presentation'
  | 'profile_surface'
  | 'managed_policy_surface'
  | 'capability_dependencies'
  | 'capability_provider'
  | 'runtime_module_bindings'
  | 'content_lock_canonicalization'
  | 'configured_codex_plugin_carrier'
  | 'app_contributions'
> & Partial<Pick<
  AgentPackageManifest,
  | 'source_commit'
  | 'carrier_source_commit'
  | 'plugin_id'
  | 'plugin_payload_manifest_url'
  | 'content_digest'
  | 'content_lock_paths'
>>;

export type InstalledPackageDescriptor = {
  manifest: InstalledPackageManifest;
  manifestPath: string;
  manifest_sha256: string;
  sourcePath: string;
  pluginId: string;
  marketplaceSource: string | null;
  enabled: boolean;
  carrier: AgentPackageConfiguredCodexPluginCarrierDescriptor;
  /** Generic readback used by future carriers; `carrier` remains compatibility data. */
  carrier_readback: InstalledPackageCarrierReadback;
  readiness: InstalledPackageReadiness;
};
