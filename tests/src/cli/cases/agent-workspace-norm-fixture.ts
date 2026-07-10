export { MINIMAL_PACK_BUNDLE_CONTRACT } from './agent-workspace-norm-fixture-cases/pack-bundle.ts';
export { MINIMAL_PACK_OS_CONTRACT } from './agent-workspace-norm-fixture-cases/pack-os.ts';
export { MINIMAL_STANDARD_AGENT_PRINCIPLES_CONTRACT } from './agent-workspace-norm-fixture-cases/standard-agent-principles.ts';
export { MINIMAL_TARGET_OPERATING_ARCHITECTURE_CONTRACT } from './agent-workspace-norm-fixture-cases/target-operating-architecture.ts';
export { MINIMAL_AGENT_WORKSPACE_NORM_CONTRACT } from './agent-workspace-norm-fixture-cases/workspace-norm.ts';
export {
  MINIMAL_BRAND_CLI_GOVERNANCE_CONTRACT,
  MINIMAL_BRAND_MODULE_L5_OPERATING_EVIDENCE_CONTRACT,
  MINIMAL_BRAND_MODULE_REGISTRY_CONTRACT,
  MINIMAL_BRAND_MODULE_SURFACES_CONTRACT,
  MINIMAL_BRAND_SYSTEM_PROFILE_CONTRACT,
  MINIMAL_SOURCE_MODULE_MAP_CONTRACT,
} from './agent-workspace-norm-fixture-cases/brand-contracts.ts';

export const MINIMAL_CLI_COMMAND_REGISTRY_CONTRACT = {
  contract_kind: 'opl_cli_command_registry.v1',
  surface_kind: 'opl_cli_command_registry',
  owner: 'one-person-lab',
  purpose: 'fixture',
  state: 'active_contract',
  machine_boundary: 'fixture',
  protected_command_prefixes: [],
  commands: {},
};

export const MINIMAL_OBSERVABILITY_SEMANTIC_CONVENTIONS_CONTRACT = {
  schema_version: 'opl_observability_semantic_conventions.v1',
  surface_kind: 'opl_observability_semantic_conventions_contract',
  owner: 'OPL Ledger',
  purpose: 'fixture',
  state: 'active_contract',
  machine_boundary: 'fixture',
  fields: [],
  signal_mappings: {},
  authority_boundary: {},
};
