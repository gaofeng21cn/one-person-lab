import type { FrameworkContracts } from '../../kernel/types.ts';

export const REQUIRED_CONTRACT_FILE_NAMES = [
  'workstreams.json',
  'domains.json',
  'stage-selection-vocabulary.json',
  'task-topology.json',
  'public-surface-index.json',
  'agent-workspace-norm-contract.json',
  'brand-module-registry.json',
  'brand-cli-governance.json',
  'brand-module-surfaces.json',
  'brand-module-l5-operating-evidence.json',
  'brand-system-profile.json',
  'source-module-map.json',
  'cli-command-registry.json',
  'target-operating-architecture-contract.json',
  'observability-semantic-conventions-contract.json',
  'standard-agent-principles.json',
  'pack-bundle-contract.json',
  'pack-os-contract.json',
] as const;

export const REQUIRED_CONTRACT_FILES = [
  {
    contract_id: 'workstreams',
    file_name: 'workstreams.json',
    schema_version: (contracts: FrameworkContracts) => contracts.workstreams.version,
  },
  {
    contract_id: 'domains',
    file_name: 'domains.json',
    schema_version: (contracts: FrameworkContracts) => contracts.domains.version,
  },
  {
    contract_id: 'stage_selection_vocabulary',
    file_name: 'stage-selection-vocabulary.json',
    schema_version: (contracts: FrameworkContracts) =>
      contracts.stageSelectionVocabulary.version,
  },
  {
    contract_id: 'task_topology',
    file_name: 'task-topology.json',
    schema_version: (contracts: FrameworkContracts) => contracts.taskTopology.version,
  },
  {
    contract_id: 'public_surface_index',
    file_name: 'public-surface-index.json',
    schema_version: (contracts: FrameworkContracts) => contracts.publicSurfaceIndex.version,
  },
  {
    contract_id: 'agent_workspace_norm',
    file_name: 'agent-workspace-norm-contract.json',
    schema_version: (contracts: FrameworkContracts) => contracts.agentWorkspaceNorm.version,
  },
  {
    contract_id: 'brand_module_registry',
    file_name: 'brand-module-registry.json',
    schema_version: (contracts: FrameworkContracts) => contracts.brandModuleRegistry.version,
  },
  {
    contract_id: 'brand_cli_governance',
    file_name: 'brand-cli-governance.json',
    schema_version: (contracts: FrameworkContracts) => contracts.brandCliGovernance.version,
  },
  {
    contract_id: 'brand_module_surfaces',
    file_name: 'brand-module-surfaces.json',
    schema_version: (contracts: FrameworkContracts) => contracts.brandModuleSurfaces.version,
  },
  {
    contract_id: 'brand_module_l5_operating_evidence',
    file_name: 'brand-module-l5-operating-evidence.json',
    schema_version: (contracts: FrameworkContracts) => contracts.brandModuleL5OperatingEvidence.version,
  },
  {
    contract_id: 'brand_system_profile',
    file_name: 'brand-system-profile.json',
    schema_version: (contracts: FrameworkContracts) => contracts.brandSystemProfile.version,
  },
  {
    contract_id: 'source_module_map',
    file_name: 'source-module-map.json',
    schema_version: (contracts: FrameworkContracts) => contracts.sourceModuleMap.version,
  },
  {
    contract_id: 'cli_command_registry',
    file_name: 'cli-command-registry.json',
    schema_version: (contracts: FrameworkContracts) => contracts.cliCommandRegistry.contract_kind,
  },
  {
    contract_id: 'target_operating_architecture',
    file_name: 'target-operating-architecture-contract.json',
    schema_version: (contracts: FrameworkContracts) => contracts.targetOperatingArchitecture.schema_version,
  },
  {
    contract_id: 'observability_semantic_conventions',
    file_name: 'observability-semantic-conventions-contract.json',
    schema_version: (contracts: FrameworkContracts) => contracts.observabilitySemanticConventions.schema_version,
  },
  {
    contract_id: 'standard_agent_principles',
    file_name: 'standard-agent-principles.json',
    schema_version: (contracts: FrameworkContracts) => contracts.standardAgentPrinciples.version,
  },
  {
    contract_id: 'pack_os',
    file_name: 'pack-os-contract.json',
    schema_version: (contracts: FrameworkContracts) => String(contracts.packOs.schema_version),
  },
  {
    contract_id: 'pack_bundle',
    file_name: 'pack-bundle-contract.json',
    schema_version: (contracts: FrameworkContracts) => String(contracts.packBundle.schema_version),
  },
] as const;
