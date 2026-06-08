import { FrameworkContractError } from './contracts.ts';
import { listBrandModuleL5EvidenceReceipts } from './brand-module-l5-evidence-ledger.ts';
import type {
  BrandModuleAuthorityBoundary,
  BrandModuleId,
  BrandModuleL5EvidenceClassId,
  BrandModuleL5OperatingEvidenceEntry,
  FrameworkContracts,
} from './types.ts';

type BrandModuleL5StatusArgs = string[];

const L5_EVIDENCE_CONTRACT_REF = 'contracts/opl-framework/brand-module-l5-operating-evidence.json';

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

function l5Contract(contracts: FrameworkContracts) {
  return contracts.brandModuleL5OperatingEvidence;
}

function l5ModuleOrThrow(
  contracts: FrameworkContracts,
  moduleId: BrandModuleId,
): BrandModuleL5OperatingEvidenceEntry {
  const module = l5Contract(contracts).modules.find((entry) => entry.module_id === moduleId);
  if (!module) {
    throw new FrameworkContractError('cli_usage_error', `Unknown brand module: ${moduleId}.`, {
      module_id: moduleId,
      allowed_module_ids: l5Contract(contracts).modules.map((entry) => entry.module_id),
    });
  }
  return module;
}

function unique(items: string[]) {
  return [...new Set(items)];
}

function parseOptionalModuleArg(
  contracts: FrameworkContracts,
  args: BrandModuleL5StatusArgs,
): BrandModuleId | null {
  if (args.length === 0) {
    return null;
  }

  const moduleIndex = args.indexOf('--module');
  const moduleId = moduleIndex >= 0 ? args[moduleIndex + 1] : undefined;
  const consumed = new Set([moduleIndex, moduleIndex + 1]);
  const unexpectedArgs = args.filter((_, index) => !consumed.has(index));

  if (
    moduleIndex < 0
    || !moduleId
    || moduleId.startsWith('--')
    || unexpectedArgs.length > 0
  ) {
    throw new FrameworkContractError('cli_usage_error', 'brand-modules l5-status accepts only --module <module_id>.', {
      usage: 'opl brand-modules l5-status [--module <module_id>]',
      examples: [
        'opl brand-modules l5-status --json',
        'opl brand-modules l5-status --module runway --json',
      ],
      unexpected_args: unexpectedArgs,
    });
  }

  l5ModuleOrThrow(contracts, moduleId as BrandModuleId);
  return moduleId as BrandModuleId;
}

function evidenceRequiredModuleIds(contracts: FrameworkContracts) {
  return l5Contract(contracts).modules
    .filter((entry) => !entry.l5_can_be_claimed)
    .map((entry) => entry.module_id);
}

function completeModuleIds(contracts: FrameworkContracts) {
  return l5Contract(contracts).modules
    .filter((entry) => entry.l5_can_be_claimed)
    .map((entry) => entry.module_id);
}

type BrandModuleL5EvidenceLedgerReceiptProjection = {
  module_id: BrandModuleId;
  evidence_class_id: BrandModuleL5EvidenceClassId;
  receipt_status: string;
};

function compactModule(
  entry: BrandModuleL5OperatingEvidenceEntry,
  ledgerReceipts: BrandModuleL5EvidenceLedgerReceiptProjection[],
) {
  const satisfied_requirement_count = entry.evidence_requirements
    .filter((requirement) => requirement.current_state === 'satisfied')
    .length;
  const moduleLedgerReceipts = ledgerReceipts.filter((receipt) =>
    receipt.module_id === entry.module_id
  );
  const verifiedModuleLedgerReceipts = moduleLedgerReceipts.filter((receipt) =>
    receipt.receipt_status === 'verified'
  );
  return {
    module_id: entry.module_id,
    brand_name: entry.brand_name,
    current_level: entry.current_level,
    l5_target_level: 'L5_production_operating_maturity',
    l5_completion_status: entry.l5_completion_status,
    l5_can_be_claimed: entry.l5_can_be_claimed,
    evidence_required: !entry.l5_can_be_claimed,
    evidence_requirement_count: entry.evidence_requirements.length,
    satisfied_requirement_count,
    open_requirement_count: entry.evidence_requirements
      .filter((requirement) => requirement.current_state === 'open')
      .length,
    blocked_requirement_count: entry.evidence_requirements
      .filter((requirement) => requirement.current_state === 'blocked')
      .length,
    evidence_ledger: {
      receipt_count: moduleLedgerReceipts.length,
      verified_receipt_count: verifiedModuleLedgerReceipts.length,
      observed_evidence_class_ids: unique(
        moduleLedgerReceipts.map((receipt) => receipt.evidence_class_id),
      ),
      verified_evidence_class_ids: unique(
        verifiedModuleLedgerReceipts.map((receipt) => receipt.evidence_class_id),
      ),
      l5_claim_status: 'ledger_refs_only_not_l5_claimed',
    },
    immediate_enabling_surfaces: entry.immediate_enabling_surfaces,
    evidence_requirements: entry.evidence_requirements,
    not_claims: entry.not_claims,
  };
}

function statusEnvelope(
  contracts: FrameworkContracts,
  modules: BrandModuleL5OperatingEvidenceEntry[],
) {
  const contract = l5Contract(contracts);
  const allCompleteModuleIds = completeModuleIds(contracts);
  const allEvidenceRequiredModuleIds = evidenceRequiredModuleIds(contracts);
  const evidenceLedger = listBrandModuleL5EvidenceReceipts(contracts);
  return {
    surface_kind: 'opl_brand_module_l5_status',
    version: contract.version,
    scope: contract.scope,
    status: allCompleteModuleIds.length === contract.modules.length ? 'complete' : 'evidence_required',
    baseline_level: contract.baseline_level,
    target_level: contract.target_level,
    l5_evidence_contract_ref: L5_EVIDENCE_CONTRACT_REF,
    l5_claim_policy: contract.l5_claim_policy,
    evidence_classes: contract.evidence_classes,
    all_module_count: contract.modules.length,
    module_count: modules.length,
    l5_complete_module_count: allCompleteModuleIds.length,
    l5_complete_module_ids: allCompleteModuleIds,
    evidence_required_module_count: allEvidenceRequiredModuleIds.length,
    evidence_required_module_ids: allEvidenceRequiredModuleIds,
    evidence_ledger: {
      surface_kind: evidenceLedger.surface_kind,
      receipt_count: evidenceLedger.receipt_count,
      verified_receipt_count: evidenceLedger.verified_receipt_count,
      ledger_file: evidenceLedger.ledger_file,
      l5_claim_status: evidenceLedger.l5_claim_status,
    },
    immediate_enabling_surface_count: modules.reduce(
      (count, entry) => count + entry.immediate_enabling_surfaces.length,
      0,
    ),
    modules: modules.map((entry) => compactModule(entry, evidenceLedger.receipts)),
    not_claims: unique(modules.flatMap((entry) => entry.not_claims)),
    authority_boundary: FALSE_AUTHORITY_BOUNDARY,
    machine_boundary: contract.machine_boundary,
  };
}

export function buildBrandModuleL5Status(
  contracts: FrameworkContracts,
  args: BrandModuleL5StatusArgs = [],
) {
  const moduleId = parseOptionalModuleArg(contracts, args);
  const modules = moduleId
    ? [l5ModuleOrThrow(contracts, moduleId)]
    : l5Contract(contracts).modules;
  return {
    version: 'g2',
    brand_module_l5_status: statusEnvelope(contracts, modules),
  };
}

function missingClassIds(entry: BrandModuleL5OperatingEvidenceEntry) {
  const actual = new Set(entry.evidence_requirements.map((requirement) => requirement.class_id));
  return l5ContractClassIds.filter((classId) => !actual.has(classId));
}

const l5ContractClassIds: BrandModuleL5EvidenceClassId[] = [
  'live_user_path',
  'cross_agent_scaleout',
  'long_soak_recovery',
  'release_install_evidence',
  'operator_repair_loop',
  'owner_acceptance',
  'no_second_truth_regression',
];

function hasSatisfiedEvidenceRefs(entry: BrandModuleL5OperatingEvidenceEntry) {
  return entry.evidence_requirements.every((requirement) => (
    requirement.current_state === 'satisfied'
    && Array.isArray(requirement.evidence_refs)
    && requirement.evidence_refs.length > 0
  ));
}

export function buildBrandModuleL5Validation(contracts: FrameworkContracts) {
  const contract = l5Contract(contracts);
  const missingEvidenceClassModules = contract.modules
    .map((entry) => ({
      module_id: entry.module_id,
      missing_class_ids: missingClassIds(entry),
    }))
    .filter((entry) => entry.missing_class_ids.length > 0);
  const falseCompletionViolations = contract.modules
    .filter((entry) => entry.l5_can_be_claimed && !hasSatisfiedEvidenceRefs(entry))
    .map((entry) => entry.module_id);
  const completionStatusViolations = contract.modules
    .filter((entry) => !entry.l5_can_be_claimed && entry.l5_completion_status === 'complete')
    .map((entry) => entry.module_id);
  const l5CompleteModuleIds = completeModuleIds(contracts);

  return {
    version: 'g2',
    brand_module_l5_validation: {
      surface_kind: 'opl_brand_module_l5_validation',
      status: missingEvidenceClassModules.length === 0
        && falseCompletionViolations.length === 0
        && completionStatusViolations.length === 0
        ? 'valid'
        : 'invalid',
      l5_readiness_status: l5CompleteModuleIds.length === contract.modules.length ? 'complete' : 'evidence_required',
      l5_evidence_contract_ref: L5_EVIDENCE_CONTRACT_REF,
      baseline_level: contract.baseline_level,
      target_level: contract.target_level,
      evidence_classes: contract.evidence_classes.map((entry) => entry.class_id),
      validated_module_count: contract.modules.length,
      l5_complete_module_count: l5CompleteModuleIds.length,
      l5_complete_module_ids: l5CompleteModuleIds,
      evidence_required_module_ids: evidenceRequiredModuleIds(contracts),
      missing_evidence_class_modules: missingEvidenceClassModules,
      false_completion_violations: falseCompletionViolations,
      completion_status_violations: completionStatusViolations,
      l5_claim_policy: contract.l5_claim_policy,
      authority_boundary: FALSE_AUTHORITY_BOUNDARY,
      not_claims: [
        'contract_validation_counts_as_l5',
        'docs_foldback_counts_as_l5',
        'provider_completion_counts_as_l5',
        'app_projection_counts_as_l5',
        'conformance_pass_counts_as_l5',
      ],
    },
  };
}

export function buildBrandModuleL5Interfaces(contracts: FrameworkContracts) {
  const contract = l5Contract(contracts);
  return {
    version: 'g2',
    brand_module_l5_interfaces: {
      surface_kind: 'opl_brand_module_l5_interface_bundle',
      version: contract.version,
      l5_evidence_contract_ref: L5_EVIDENCE_CONTRACT_REF,
      baseline_level: contract.baseline_level,
      target_level: contract.target_level,
      cli: {
        commands: [
          'opl brand-modules l5-status --json',
          'opl brand-modules l5-status --module <module_id> --json',
          'opl brand-modules l5-validate --json',
          'opl brand-modules l5-interfaces --json',
          'opl runtime brand-module-l5-evidence record --payload <json> --json',
          'opl runtime brand-module-l5-evidence verify --receipt-ref <ref> --json',
          'opl runtime brand-module-l5-evidence list --module <module_id> --json',
          ...contract.modules.map((entry) => `opl ${entry.module_id} l5-status --json`),
        ],
      },
      app: {
        descriptors: [
          {
            action_id: 'brand_modules_l5_status',
            command: 'opl brand-modules l5-status --json',
            mutation: false,
            descriptor_only: true,
          },
          {
            action_id: 'brand_modules_l5_validate',
            command: 'opl brand-modules l5-validate --json',
            mutation: false,
            descriptor_only: true,
          },
          {
            action_id: 'brand_modules_l5_evidence_record',
            command: 'opl runtime brand-module-l5-evidence record --payload <json> --json',
            mutation: true,
            descriptor_only: true,
          },
        ],
      },
      descriptor: {
        refs: [
          L5_EVIDENCE_CONTRACT_REF,
          'opl brand-modules l5-interfaces --json',
        ],
      },
      validation: {
        commands: [
          'opl brand-modules l5-validate --json',
          'opl runtime brand-module-l5-evidence verify --receipt-ref <ref> --json',
          'opl contract validate --json',
        ],
      },
      modules: contract.modules.map((entry) => ({
        module_id: entry.module_id,
        brand_name: entry.brand_name,
        command: `opl ${entry.module_id} l5-status --json`,
        l5_completion_status: entry.l5_completion_status,
        l5_can_be_claimed: entry.l5_can_be_claimed,
      })),
      l5_claim_policy: contract.l5_claim_policy,
      authority_boundary: FALSE_AUTHORITY_BOUNDARY,
    },
  };
}

export function buildBrandModuleL5ModuleStatus(
  contracts: FrameworkContracts,
  moduleId: BrandModuleId,
) {
  const module = l5ModuleOrThrow(contracts, moduleId);
  const key = `opl_${moduleId.replace(/-/g, '_')}_l5_status`;
  return {
    version: 'g2',
    brand_module_l5_status: statusEnvelope(contracts, [module]),
    [key]: {
      surface_kind: key,
      module_id: module.module_id,
      brand_name: module.brand_name,
      status: module.l5_can_be_claimed ? 'complete' : module.l5_completion_status,
      current_level: module.current_level,
      target_level: 'L5_production_operating_maturity',
      l5_can_be_claimed: module.l5_can_be_claimed,
      l5_evidence_contract_ref: `${L5_EVIDENCE_CONTRACT_REF}#modules.${module.module_id}`,
      evidence_requirement_count: module.evidence_requirements.length,
      evidence_requirements: module.evidence_requirements,
      immediate_enabling_surfaces: module.immediate_enabling_surfaces,
      not_claims: module.not_claims,
      authority_boundary: FALSE_AUTHORITY_BOUNDARY,
      machine_boundary: 'Read-only L5 operating evidence status; does not create owner receipts, typed blockers, App release truth, long-soak proof, domain readiness, or production readiness.',
    },
  };
}
