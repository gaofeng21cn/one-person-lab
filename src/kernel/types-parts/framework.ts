import type {
  AgentWorkspaceNormContract,
  DomainContract,
  PublicSurfaceIndexContract,
  StageSelectionVocabularyContract,
  TaskTopologyContract,
  WorkstreamContract,
} from './core-contracts.ts';
import type {
  BrandCliGovernanceContract,
  BrandModuleL5OperatingEvidenceContract,
  BrandModuleRegistryContract,
  BrandModuleSurfacesContract,
  BrandSystemProfileContract,
  SourceModuleMapContract,
} from './brand-contracts.ts';
import type { PackBundleContract } from './pack-bundle.ts';
import type { PackOsContract } from './pack-os.ts';
import type { TargetOperatingArchitectureContract } from './target-operating-architecture.ts';

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
  agentWorkspaceNorm: AgentWorkspaceNormContract;
  brandModuleRegistry: BrandModuleRegistryContract;
  brandCliGovernance: BrandCliGovernanceContract;
  brandModuleSurfaces: BrandModuleSurfacesContract;
  brandModuleL5OperatingEvidence: BrandModuleL5OperatingEvidenceContract;
  brandSystemProfile: BrandSystemProfileContract;
  sourceModuleMap: SourceModuleMapContract;
  cliCommandRegistry: CliCommandRegistryContract;
  targetOperatingArchitecture: TargetOperatingArchitectureContract;
  observabilitySemanticConventions: ObservabilitySemanticConventionsContract;
  packOs: PackOsContract;
  packBundle: PackBundleContract;
  standardAgentPrinciples: StandardAgentPrinciplesContract;
}

export interface CliCommandRegistryContract {
  contract_kind: string;
  surface_kind: string;
  owner: string;
  purpose: string;
  state: string;
  machine_boundary: string;
  protected_command_prefixes: string[];
  commands: Record<string, unknown>;
}

export interface ObservabilitySemanticConventionsContract {
  schema_version: string;
  surface_kind: string;
  owner: string;
  purpose: string;
  state: string;
  machine_boundary: string;
  fields: Array<{
    id: string;
    otel_attribute: string;
  }>;
  signal_mappings: Record<string, unknown>;
  authority_boundary: Record<string, unknown>;
}

export interface StandardAgentPrinciplesContract {
  surface_kind: string;
  version: string;
  owner: string;
  state: string;
  purpose: string;
  machine_boundary: string;
  principle_ids: string[];
  principles: Array<{
    principle_id: string;
    owner: string;
    summary: string;
  }>;
  module_organization: Record<string, unknown>;
  adoption_contract: Record<string, unknown>;
  false_authority_boundary: Record<string, unknown>;
}

export interface ContractValidationEntry {
  contract_id:
    | 'workstreams'
    | 'domains'
    | 'stage_selection_vocabulary'
    | 'task_topology'
    | 'public_surface_index'
    | 'agent_workspace_norm'
    | 'brand_module_registry'
    | 'brand_cli_governance'
    | 'brand_module_surfaces'
    | 'brand_module_l5_operating_evidence'
    | 'brand_system_profile'
    | 'source_module_map'
    | 'cli_command_registry'
    | 'target_operating_architecture'
    | 'observability_semantic_conventions'
    | 'pack_os'
    | 'pack_bundle'
    | 'standard_agent_principles';
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
