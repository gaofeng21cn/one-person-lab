import { FrameworkContractError } from './contracts.ts';
import type {
  BrandModuleAuthorityBoundary,
  BrandModuleId,
  BrandModuleRegistryContract,
  BrandModuleRegistryEntry,
  FrameworkContracts,
} from './types.ts';

type BrandModuleCommandArgs = string[];

const FALSE_AUTHORITY_BOUNDARY: BrandModuleAuthorityBoundary = {
  can_claim_domain_ready: false,
  can_claim_quality_verdict: false,
  can_claim_artifact_authority: false,
  can_claim_production_ready: false,
  can_write_domain_truth: false,
  can_write_memory_body: false,
  can_mutate_artifact_body: false,
  can_sign_owner_receipt: false,
  can_create_typed_blocker: false,
  can_replace_domain_owner: false,
  can_replace_ai_executor_planning: false,
};

const BRAND_MODULE_DOC_PATHS: Record<BrandModuleId, string> = {
  charter: 'docs/references/brand-modules/charter.md',
  atlas: 'docs/references/brand-modules/atlas.md',
  workspace: 'docs/references/brand-modules/workspace.md',
  stagecraft: 'docs/references/brand-modules/stagecraft.md',
  runway: 'docs/references/brand-modules/runway.md',
  vault: 'docs/references/brand-modules/vault.md',
  console: 'docs/references/brand-modules/console.md',
  'foundry-lab': 'docs/references/brand-modules/foundry-lab.md',
  connect: 'docs/references/brand-modules/connect.md',
};

const HUMAN_DOC_PATHS: Record<string, string> = {
  'human_doc:opl_brand_module_maturity_against_workspace': 'docs/references/brand-modules/current-maturity-against-workspace.md',
  'human_doc:opl_brand_module_l4_rollout_plan': 'docs/active/brand-module-l4-rollout-plan.md',
  'human_doc:opl_status': 'docs/status.md',
  'human_doc:opl_architecture': 'docs/architecture.md',
  'human_doc:opl_stage_native_kernel_rollout_plan': 'docs/active/opl-stage-native-kernel-rollout-plan.md',
  'human_doc:opl_runtime_index': 'docs/runtime/README.md',
  'human_doc:opl_delivery_index': 'docs/delivery/README.md',
  'human_doc:opl_public_surface_index': 'docs/product/opl-public-surface-index.md',
  'human_doc:opl_foundry_agent_target_operating_architecture': 'docs/active/opl-foundry-agent-target-operating-architecture.md',
};

function brandModuleRegistry(contracts: FrameworkContracts) {
  return contracts.brandModuleRegistry;
}

function statusDocPaths(entry: BrandModuleRegistryEntry) {
  return entry.status_doc_refs
    .map((ref) => HUMAN_DOC_PATHS[ref])
    .filter((ref): ref is string => typeof ref === 'string');
}

function compactModule(entry: BrandModuleRegistryEntry) {
  return {
    module_id: entry.module_id,
    brand_name: entry.brand_name,
    owner: entry.owner,
    purpose: entry.purpose,
    state: entry.state,
    module_doc_ref: entry.module_doc_ref,
    module_doc_path: BRAND_MODULE_DOC_PATHS[entry.module_id],
    maturity_level: entry.maturity_level,
    contract_refs: entry.contract_refs,
    cli_surfaces: entry.cli_surfaces,
    app_surfaces: entry.app_surfaces,
    descriptor_surfaces: entry.descriptor_surfaces,
    validation_surfaces: entry.validation_surfaces,
    status_doc_refs: entry.status_doc_refs,
    status_doc_paths: statusDocPaths(entry),
    authority_boundary: entry.authority_boundary,
    forbidden_claims: entry.forbidden_claims,
  };
}

function buildBrandModulesEnvelope(registry: BrandModuleRegistryContract) {
  return {
    surface_kind: 'opl_brand_modules',
    version: registry.version,
    scope: registry.scope,
    owner: registry.owner,
    purpose: registry.purpose,
    state: registry.state,
    machine_boundary: registry.machine_boundary,
    baseline_module_id: registry.baseline_module_id,
    external_reference_principles: registry.external_reference_principles,
  };
}

function parseModuleArg(args: BrandModuleCommandArgs): BrandModuleId {
  const moduleIndex = args.indexOf('--module');
  if (moduleIndex < 0 || !args[moduleIndex + 1] || args[moduleIndex + 1].startsWith('--')) {
    throw new FrameworkContractError('cli_usage_error', 'brand-modules inspect requires --module <module_id>.', {
      usage: 'opl brand-modules inspect --module <module_id>',
      examples: ['opl brand-modules inspect --module workspace --json'],
      required: ['--module'],
    });
  }

  const extraArgs = args.filter((_, index) => index !== moduleIndex && index !== moduleIndex + 1);
  if (extraArgs.length > 0) {
    throw new FrameworkContractError('cli_usage_error', 'brand-modules inspect only accepts --module <module_id>.', {
      usage: 'opl brand-modules inspect --module <module_id>',
      examples: ['opl brand-modules inspect --module workspace --json'],
      unexpected_args: extraArgs,
    });
  }

  return args[moduleIndex + 1] as BrandModuleId;
}

export function buildBrandModulesList(contracts: FrameworkContracts) {
  const registry = brandModuleRegistry(contracts);
  return {
    version: 'g2',
    brand_modules: {
      ...buildBrandModulesEnvelope(registry),
      module_count: registry.modules.length,
      modules: registry.modules.map(compactModule),
    },
  };
}

export function buildBrandModuleInspect(contracts: FrameworkContracts, args: BrandModuleCommandArgs) {
  const registry = brandModuleRegistry(contracts);
  const moduleId = parseModuleArg(args);
  const module = registry.modules.find((entry) => entry.module_id === moduleId);

  if (!module) {
    throw new FrameworkContractError('cli_usage_error', `Unknown brand module: ${moduleId}.`, {
      usage: 'opl brand-modules inspect --module <module_id>',
      module_id: moduleId,
      allowed_module_ids: registry.modules.map((entry) => entry.module_id),
    });
  }

  return {
    version: 'g2',
    brand_module: {
      ...compactModule(module),
      machine_boundary: module.machine_boundary,
      l4_gates: module.l4_gates,
    },
  };
}

export function buildBrandModuleMaturity(contracts: FrameworkContracts) {
  const registry = brandModuleRegistry(contracts);
  const belowBaselineModuleIds = registry.modules
    .filter((entry) => entry.maturity_level !== 'L4_structural_baseline')
    .map((entry) => entry.module_id);

  return {
    version: 'g2',
    brand_module_maturity: {
      surface_kind: 'opl_brand_module_maturity',
      version: registry.version,
      baseline_module_id: registry.baseline_module_id,
      module_count: registry.modules.length,
      l4_structural_baseline_count: registry.modules.length - belowBaselineModuleIds.length,
      below_baseline_module_ids: belowBaselineModuleIds,
      maturity_model: registry.maturity_model,
      modules: registry.modules.map((entry) => ({
        module_id: entry.module_id,
        brand_name: entry.brand_name,
        maturity_level: entry.maturity_level,
        l4_gate_count: entry.l4_gates.length,
        missing_l4_gates: [],
      })),
    },
  };
}

export function buildBrandModuleValidation(contracts: FrameworkContracts) {
  const registry = brandModuleRegistry(contracts);
  const requiredGates = registry.maturity_model[0]?.required_gates ?? [];
  const missingL4GateModules = registry.modules
    .map((entry) => ({
      module_id: entry.module_id,
      missing_gates: requiredGates.filter((gate) => !entry.l4_gates.includes(gate)),
    }))
    .filter((entry) => entry.missing_gates.length > 0);
  const authorityBoundaryViolations = registry.modules
    .flatMap((entry) => Object.entries(entry.authority_boundary).filter(([, value]) => value !== false).map(([field]) => ({
      module_id: entry.module_id,
      field,
    })));

  return {
    version: 'g2',
    brand_module_validation: {
      surface_kind: 'opl_brand_module_validation',
      status: missingL4GateModules.length === 0 && authorityBoundaryViolations.length === 0 ? 'valid' : 'invalid',
      registry_ref: 'contracts/opl-framework/brand-module-registry.json',
      validated_module_count: registry.modules.length,
      required_gates: requiredGates,
      missing_l4_gate_modules: missingL4GateModules,
      authority_boundary_violations: authorityBoundaryViolations,
      forbidden_claim_gate: {
        status: registry.modules.every((entry) => entry.forbidden_claims.length > 0) ? 'valid' : 'invalid',
        module_ids: registry.modules.map((entry) => entry.module_id),
      },
    },
  };
}

export function buildBrandModuleInterfaces(contracts: FrameworkContracts) {
  const registry = brandModuleRegistry(contracts);
  return {
    version: 'g2',
    brand_module_interfaces: {
      surface_kind: 'opl_brand_module_interface_bundle',
      version: registry.version,
      module_count: registry.modules.length,
      registry_ref: 'contracts/opl-framework/brand-module-registry.json',
      cli: {
        commands: [
          'opl brand-modules list --json',
          'opl brand-modules inspect --module <module_id> --json',
          'opl brand-modules maturity --json',
          'opl brand-modules validate --json',
          'opl brand-modules interfaces --json',
        ],
      },
      app: {
        descriptors: [
          {
            action_id: 'brand_modules_list',
            command: 'opl brand-modules list --json',
            mutation: false,
            descriptor_only: true,
          },
          {
            action_id: 'brand_modules_inspect',
            command: 'opl brand-modules inspect --module <module_id> --json',
            mutation: false,
            descriptor_only: true,
          },
          {
            action_id: 'brand_modules_maturity',
            command: 'opl brand-modules maturity --json',
            mutation: false,
            descriptor_only: true,
          },
        ],
      },
      descriptor: {
        delegates: [
          {
            delegate_id: 'brand_modules_registry',
            ref: 'contracts/opl-framework/brand-module-registry.json',
            execution: 'descriptor_only',
          },
          {
            delegate_id: 'brand_modules_cli_bundle',
            ref: 'opl brand-modules interfaces --json',
            execution: 'descriptor_only',
          },
        ],
      },
      validation: {
        commands: [
          'opl brand-modules validate --json',
          'opl contract validate --json',
        ],
      },
      modules: registry.modules.map((entry) => ({
        module_id: entry.module_id,
        brand_name: entry.brand_name,
        cli_surfaces: entry.cli_surfaces,
        app_surfaces: entry.app_surfaces,
        descriptor_surfaces: entry.descriptor_surfaces,
        validation_surfaces: entry.validation_surfaces,
      })),
      authority_boundary: FALSE_AUTHORITY_BOUNDARY,
      forbidden_claims: [
        'domain_ready',
        'quality_verdict',
        'artifact_authority',
        'production_ready',
        'domain_truth_write',
        'owner_receipt_signed_by_opl',
      ],
    },
  };
}
