export interface WorkstreamContract {
  workstream_id: string;
  label: string;
  status: string;
  description: string;
  domain_id: string;
  entry_mode: string;
  primary_families: string[];
  top_level_intents: string[];
  notes: string;
}

export interface DomainContract {
  domain_id: string;
  label: string;
  project: string;
  independent_domain_agent: {
    agent_id: string;
    status: string;
    authority_scope: string;
    opl_top_level_domain_agent: boolean;
  };
  single_app_skill: {
    skill_id: string;
    plugin_name: string;
    activation_kind: string;
    entry_command: string;
    manifest_command: string;
  };
  domain_truth_owner: string[];
  opl_projection_role: string[];
  runtime_dependency_boundary: {
    domain_runtime_owner: string;
    opl_dependency: string;
    opl_truth_write_policy: string;
    backend_companions: Array<{
      project: string;
      role: string;
      controlled_by: string;
      opl_top_level_domain_agent: boolean;
    }>;
  };
  standalone_allowed: boolean;
  owned_workstreams: string[];
  non_opl_families: string[];
}

export interface StageSelectionSpecialCase {
  family: string;
  direct_workstream?: string;
  domain_id: string;
  auto_workstream?: string | null;
  notes: string;
}

export interface StageSelectionVocabularyContract {
  version: string;
  intent_id: string[];
  workstream_id: string[];
  domain_id: string[];
  request_kind: string[];
  target_kind: string[];
  delivery_kind: string[];
  review_kind: string[];
  entry_mode: string[];
  selection_rules: string[];
  special_cases: StageSelectionSpecialCase[];
}

export interface TaskTopologyWorkstream {
  workstream_id: string;
  label: string;
  boundary_state: string;
  registry_state: string;
  selection_state: string;
  current_domain_id: string | null;
  entry_surface: string | null;
  formal_domain_required: boolean;
  delivery_objects: string[];
  typical_tasks: string[];
  reuse_dependencies: string[];
  family_boundary_notes: Array<{
    family_id: string;
    relation: string;
  }>;
  notes: string;
}

export interface TaskTopologyContract {
  version: string;
  scope: string;
  description: string;
  non_goals: string[];
  topology_rules: string[];
  shared_foundation_reuse: string[];
  workstreams: TaskTopologyWorkstream[];
}

export interface PublicSurfaceCategory {
  category_id: string;
  owner_scope: string;
  description: string;
}

export interface PublicSurfaceRef {
  ref_kind: string;
  ref: string;
  language?: string;
}

export interface PublicSurfaceContractEntry {
  surface_id: string;
  category_id: string;
  surface_kind: string;
  boundary_role: string;
  owner_scope: string;
  truth_mode: string;
  workstream_ids: string[];
  domain_ids: string[];
  refs: PublicSurfaceRef[];
  routes_to: string[];
  notes: string[];
}

export interface PublicSurfaceIndexContract {
  version: string;
  scope: string;
  description: string;
  non_goals: string[];
  ownership_rules: string[];
  surface_categories: PublicSurfaceCategory[];
  surfaces: PublicSurfaceContractEntry[];
}

export interface WorkstreamsRegistry {
  version: string;
  workstreams: WorkstreamContract[];
}

export interface DomainsRegistry {
  version: string;
  domains: DomainContract[];
}

export type ContractsRootSource = 'cwd' | 'env' | 'cli_flag' | 'api' | 'cli_entry';

export interface FrameworkContractsLoadOptions {
  searchFrom?: string;
  contractsDir?: string;
  source?: ContractsRootSource;
}

export interface FrameworkContracts {
  contractsDir: string;
  contractsRootSource: ContractsRootSource;
  workstreams: WorkstreamsRegistry;
  domains: DomainsRegistry;
  stageSelectionVocabulary: StageSelectionVocabularyContract;
  taskTopology: TaskTopologyContract;
  publicSurfaceIndex: PublicSurfaceIndexContract;
}

export interface ContractValidationEntry {
  contract_id:
    | 'workstreams'
    | 'domains'
    | 'stage_selection_vocabulary'
    | 'task_topology'
    | 'public_surface_index';
  file: string;
  schema_version: string;
  status: 'valid';
}

export interface ContractValidationSummary {
  status: 'valid';
  contracts_dir: string;
  contracts_root_source: ContractsRootSource;
  validated_contracts: ContractValidationEntry[];
}

export interface DomainAgentSelectionInput {
  intent: string;
  target: string;
  goal: string;
  preferredFamily?: string;
  requestKind?: string;
}

export type ResolutionResult =
  | {
      status: 'selected_domain_agent_entry';
      request_kind: string;
      workstream_id: string;
      domain_id: string;
      entry_surface: 'domain_agent_entry';
      recommended_family: string | null;
      confidence: 'medium' | 'high';
      reason: string;
      selection_evidence: string[];
    }
  | {
      status: 'domain_boundary';
      request_kind: string;
      domain_id: string;
      workstream_id: null;
      recommended_family: string | null;
      reason: string;
      selection_evidence: string[];
    }
  | {
      status: 'unknown_domain';
      request_kind: string;
      candidate_workstream_id: string;
      reason: string;
      selection_evidence: string[];
    }
  | {
      status: 'ambiguous_task';
      request_kind: string;
      candidate_workstreams: string[];
      candidate_domains: string[];
      reason: string;
      selection_evidence: string[];
      required_clarification: string[];
    };

export interface BoundaryExplanation {
  request_summary: string;
  boundary_status: ResolutionResult['status'];
  boundary_evidence: string[];
  resolved_domain: string | null;
  resolved_workstream_id: string | null;
  candidate_workstream_id?: string;
  candidate_workstreams?: string[];
  candidate_domains?: string[];
  reason: string;
  required_clarification?: string[];
  rejected_domains: Array<{
    domain_id: string;
    reason: string;
  }>;
}

export type ResolveRequestInput = DomainAgentSelectionInput;
