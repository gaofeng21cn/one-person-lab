export type ConfiguredCodexPluginCarrierAction =
  | 'list'
  | 'install'
  | 'update'
  | 'repair'
  | 'remove'
  | 'enable'
  | 'disable';

export type CodexPluginListEntry = {
  pluginId: string;
  version: string | null;
  installed: boolean;
  enabled: boolean;
  sourcePath: string | null;
  marketplaceSource: string | null;
};

export type CodexPluginMarketplaceListEntry = {
  name: string | null;
  sourceType: string | null;
  marketplaceSource: string | null;
};


export type ConfiguredCodexPluginCarrierObservedSource = {
  plugin_id: string;
  marketplace_source: string | null;
  installed_version: string | null;
  enabled: boolean;
  plugin_source_path: string | null;
  source_tree_sha256: string | null;
};

export type CodexPluginCommandResult = {
  status: number | null;
  stdout: string;
  stderr: string;
  error: Error | null;
};

export type CodexPluginCommandRunner = (input: {
  binary: string;
  args: string[];
  env: NodeJS.ProcessEnv;
}) => CodexPluginCommandResult;

export type ConfiguredDownloadAttempt = {
  status: number | null;
  stdout: Buffer;
  stderr: string;
  error: Error | null;
};

export type ConfiguredDownloadResult = ConfiguredDownloadAttempt & {
  attemptCount: number;
};

export type ConfiguredCodexPluginCarrierReadback = {
  surface_kind: 'opl_configured_codex_plugin_carrier_readback.v1';
  package_id: string;
  carrier: {
    kind: 'codex_plugin_manager';
    plugin_id: string;
    marketplace_source: string | null;
    observed_sources: ConfiguredCodexPluginCarrierObservedSource[];
    precedence:
      | 'exact_single_source'
      | 'ambiguous_same_plugin_name'
      | 'unexpected_same_plugin_name'
      | 'not_present'
      | 'unavailable';
  };
  executor: {
    route: 'codex_cli';
    required_skill_ids: string[];
    status: 'callable' | 'attention_needed';
  };
  publication_ref: string | null;
  status: 'installed' | 'not_installed' | 'physical_unavailable';
  installed_version: string | null;
  enabled: boolean | null;
  plugin_source_path: string | null;
  operation: ConfiguredCodexPluginCarrierAction;
  native_command: string[];
  native_action_dispatched: boolean;
  reason: string | null;
};
