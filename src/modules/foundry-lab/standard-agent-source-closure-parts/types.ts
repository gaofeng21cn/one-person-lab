export type SourceClosureLanguage = 'typescript' | 'python';

export type SourceClosureEntrypoint = {
  entrypoint_id: string;
  source_kind:
    | 'package_bin'
    | 'package_export'
    | 'pyproject_script'
    | 'action_catalog'
    | 'handler_registry'
    | 'native_helper_descriptor'
    | 'generated_entry';
  declared_ref: string;
  language: SourceClosureLanguage | null;
  file: string | null;
  module_name: string | null;
  symbol: string | null;
  action_id: string | null;
  hosted_by_opl: boolean;
  resolution_status:
    | 'resolved'
    | 'unresolved'
    | 'hosted_declaration_unverified';
  resolved_symbol_id: string | null;
};

export type SourceClosureSymbol = {
  symbol_id: string;
  language: SourceClosureLanguage;
  file: string;
  module_name: string | null;
  symbol: string;
  line: number;
};

export type SourceClosureCallEdge = {
  from_symbol: string;
  to_symbol: string;
  file: string;
  line: number;
  edge_kind: 'call' | 'static_import';
};

export type SourceClosureUnresolvedEdge = {
  from_symbol: string;
  file: string;
  line: number;
  reason: string;
  expression: string;
  sensitive: boolean;
};

export type SourceClosureObservedCall = {
  symbol_id: string;
  file: string;
  line: number;
  callee: string;
  source_text: string;
  literal_arguments: string[];
  argument_expressions: string[];
};

export type SourceClosureGraphScan = {
  scan_complete: boolean;
  symbols: SourceClosureSymbol[];
  call_edges: SourceClosureCallEdge[];
  unresolved_edges: SourceClosureUnresolvedEdge[];
  observed_calls: SourceClosureObservedCall[];
  diagnostics: string[];
  pyproject_scripts?: Record<string, string>;
};

export type SourceClosureEffectKind =
  | 'process_spawn'
  | 'executor_invoke'
  | 'filesystem_write'
  | 'database_write'
  | 'network_access'
  | 'runtime_state_mutation';

export type SourceClosureObservedEffect = {
  effect_id: string;
  effect_kind: SourceClosureEffectKind;
  file: string;
  symbol: string;
  line: number;
  callee: string;
  target: string | null;
  source_digest: string;
  reachable: boolean;
  audit_status:
    | 'allowed_exact'
    | 'developer_tool_exact'
    | 'native_helper_carrier_exact'
    | 'unapproved';
  private_generic_effect: boolean;
};

export type SourceClosureAuditEntry = {
  file: string;
  symbol: string;
  source_digest: string;
  allowed_effects: SourceClosureEffectKind[];
  role: 'minimal_authority_function' | 'developer_tool' | 'native_helper_carrier';
  allowed_targets: string[];
  allowed_unresolved_edge_reasons: string[];
  carrier_descriptor_ref: string | null;
  carrier_slot_id: string | null;
  target_policy:
    | 'literal_allowlist'
    | 'declared_command_set'
    | 'declared_artifact_write_slot'
    | null;
};

export type SourceClosureAuditMismatch = {
  mismatch_kind:
    | 'audit_shape_invalid'
    | 'audit_path_not_exact'
    | 'audit_file_missing'
    | 'audit_symbol_missing'
    | 'audit_digest_mismatch'
    | 'audit_role_effect_forbidden'
    | 'native_helper_source_closure_invalid'
    | 'native_helper_effect_slot_invalid'
    | 'audit_effect_stale'
    | 'effect_not_allowed'
    | 'effect_target_not_allowed'
    | 'entrypoint_unresolved'
    | 'hosted_entry_unverified';
  file: string | null;
  symbol: string | null;
  effect_kind: SourceClosureEffectKind | null;
  detail: string;
};

export type SourceClosureEffectContract = {
  surface_kind: 'standard_agent_source_closure_effect_contract';
  version: 'standard-agent-source-closure-effect-contract.v1';
  audit_contract_path: string;
  active_source: {
    extensions: string[];
    excluded_path_segments: string[];
    excluded_file_patterns: string[];
  };
  effect_kinds: Record<SourceClosureEffectKind, {
    callee_patterns: string[];
    private_generic_by_default: boolean;
  }>;
  audit_contract: {
    globally_forbidden_effects: SourceClosureEffectKind[];
    minimal_authority_forbidden_effects: SourceClosureEffectKind[];
    target_allowlist_required_effects: SourceClosureEffectKind[];
    allowed_unresolved_edge_reasons: string[];
    native_helper_carrier_allowed_effects: SourceClosureEffectKind[];
    native_helper_carrier_target_policies: string[];
  };
};

export type SourceClosureRepoReport = {
  repo_dir: string;
  requested_agent_id: string | null;
  domain_id: string;
  status: 'passed' | 'blocked';
  scan_complete: boolean;
  entrypoints: SourceClosureEntrypoint[];
  reachable_symbols: SourceClosureSymbol[];
  call_edges: SourceClosureCallEdge[];
  unresolved_edges: SourceClosureUnresolvedEdge[];
  excluded_developer_tool_edges: SourceClosureUnresolvedEdge[];
  observed_effects: SourceClosureObservedEffect[];
  unreachable_sensitive_residue: SourceClosureObservedEffect[];
  audit_mismatches: SourceClosureAuditMismatch[];
  source_digests: Record<string, string>;
  closure_digest: string;
  blockers: string[];
};
