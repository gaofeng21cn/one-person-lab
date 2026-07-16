import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadFrameworkContracts } from '../charter/index.ts';
import { FrameworkContractError } from '../../kernel/contract-validation.ts';
import { parseJsonText } from '../../kernel/json-file.ts';
import {
  buildGeneratedAgentInterfaces,
  buildStandardAgentRepoContractReadout,
  STANDARD_AGENT_STAGE_MANIFEST_REF,
  type StandardAgentRepoContractReadout,
} from '../pack/index.ts';
import { normalizeFamilyActionCatalog } from '../../kernel/family-action-catalog-contract.ts';
import {
  isRecord,
  optionalString,
  readJsonFile,
  stringList,
  unique,
} from '../pack/index.ts';
import type { FrameworkContracts } from '../../kernel/types.ts';

type JsonRecord = Record<string, unknown>;
type ProbeStatus = 'passed' | 'blocked';

export interface FamilyAgentConformanceProbeSourceReport {
  repo_dir: string;
  requested_agent_id: string | null;
  domain_id: string;
  status: string;
  blockers: unknown[];
  [key: string]: unknown;
}

type AdmissionGateContract = {
  surface_kind: string;
  version: string;
  owner: string;
  admission_policy: JsonRecord;
  standard_agent_admission_package: {
    required_gate_ids: string[];
    gates: Array<{
      gate_id: string;
      requirement_kind: string;
      required_for_formal_admission: boolean;
      required_evidence_refs: string[];
      forbidden_claims: string[];
    }>;
  };
  false_authority_boundary: JsonRecord;
  non_readiness_statement: JsonRecord;
};

type ProbeObservation = {
  status: ProbeStatus;
  source_refs: string[];
  blockers: string[];
};

const SOURCE_DIR = path.dirname(fileURLToPath(import.meta.url));
const OPL_REPO_ROOT = path.resolve(SOURCE_DIR, '../../..');
const STANDARD_AGENT_ADMISSION_GATES_REF =
  'contracts/opl-framework/standard-agent-admission-gates.json';

const GATE_OBSERVATION_IDS: Record<string, string[]> = {
  identity: ['scaffold_validation', 'action_catalog', 'stage_plane'],
  domain_truth_owner: [
    'standard_agent_principle_checks',
    'private_surface_checks',
    'platform_surface_ownership_checks',
  ],
  generated_surface_default_entry: [
    'generated_interfaces',
    'action_catalog',
    'stage_plane',
    'generated_surface_handoff_checks',
    'golden_path_default_surface_budget_checks',
  ],
  standard_pack_abi: [
    'pack_compiler_checks',
    'action_catalog',
    'stage_plane',
    'scaffold_validation',
    'standard_agent_principle_checks',
  ],
  stage_artifact_contract: [
    'stage_artifact_kernel_adoption_checks',
    'stage_run_kernel_profile_checks',
    'stage_run_canary_evidence_checks',
  ],
  execution_model: ['stage_operating_principle_checks', 'standard_agent_principle_checks'],
  authority_boundary: [
    'standard_agent_principle_checks',
    'private_surface_checks',
    'legacy_runtime_residue_guard',
    'platform_surface_ownership_checks',
    'generated_interfaces',
    'workspace_norm_checks',
  ],
  owner_receipt_boundary: [
    'stage_run_kernel_profile_checks',
    'stage_artifact_kernel_adoption_checks',
  ],
  typed_blocker_boundary: [
    'stage_run_kernel_profile_checks',
    'stage_operating_principle_checks',
  ],
  human_gate_false_authority: [
    'action_catalog',
    'stage_operating_principle_checks',
  ],
};

function readJsonAt(filePath: string) {
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new FrameworkContractError('contract_file_missing', `Missing JSON contract: ${filePath}`, {
        file: filePath,
      });
    }
    throw error;
  }
  try {
    return parseJsonText(raw);
  } catch (error) {
    throw new FrameworkContractError('contract_json_invalid', `Could not read JSON contract: ${filePath}`, {
      file: filePath,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function readAdmissionGateContract(): AdmissionGateContract {
  const value = readJsonAt(path.join(OPL_REPO_ROOT, STANDARD_AGENT_ADMISSION_GATES_REF));
  if (!isRecord(value)) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'standard-agent-admission-gates.json must contain an object root.',
      { contract_ref: STANDARD_AGENT_ADMISSION_GATES_REF },
    );
  }
  const packageValue = isRecord(value.standard_agent_admission_package)
    ? value.standard_agent_admission_package
    : null;
  const gates = Array.isArray(packageValue?.gates)
    ? packageValue.gates.filter(isRecord)
    : [];
  const requiredGateIds = stringList(packageValue?.required_gate_ids);
  if (
    optionalString(value.surface_kind) !== 'opl_standard_agent_admission_gates'
    || !optionalString(value.version)
    || !packageValue
    || gates.length === 0
    || requiredGateIds.length === 0
  ) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'standard-agent-admission-gates.json is missing the active gate package.',
      { contract_ref: STANDARD_AGENT_ADMISSION_GATES_REF },
    );
  }

  return {
    surface_kind: 'opl_standard_agent_admission_gates',
    version: optionalString(value.version)!,
    owner: optionalString(value.owner) ?? 'one-person-lab',
    admission_policy: isRecord(value.admission_policy) ? value.admission_policy : {},
    standard_agent_admission_package: {
      required_gate_ids: requiredGateIds,
      gates: gates.map((gate) => ({
        gate_id: optionalString(gate.gate_id) ?? 'unknown_gate',
        requirement_kind: optionalString(gate.requirement_kind) ?? 'unknown',
        required_for_formal_admission: gate.required_for_formal_admission === true,
        required_evidence_refs: stringList(gate.required_evidence_refs),
        forbidden_claims: stringList(gate.forbidden_claims),
      })),
    },
    false_authority_boundary: isRecord(value.false_authority_boundary)
      ? value.false_authority_boundary
      : {},
    non_readiness_statement: isRecord(value.non_readiness_statement)
      ? value.non_readiness_statement
      : {},
  };
}

function statusFromBlockers(blockers: string[]): ProbeStatus {
  return blockers.length === 0 ? 'passed' : 'blocked';
}

function blockersFrom(value: unknown) {
  return isRecord(value) ? stringList(value.blockers) : [];
}

function observationFromReport(
  report: FamilyAgentConformanceProbeSourceReport,
  field: string,
): ProbeObservation {
  const value = isRecord(report[field]) ? report[field] : null;
  const blockers = blockersFrom(value).map((blocker) => `${field}:${blocker}`);
  const status = optionalString(value?.status) === 'passed' || optionalString(value?.status) === 'ready'
    ? statusFromBlockers(blockers)
    : 'blocked';
  return {
    status,
    source_refs: [`standard_domain_agent_conformance.reports[].${field}`],
    blockers: status === 'passed' ? [] : blockers.length > 0 ? blockers : [`${field}:status_not_passed`],
  };
}

function buildGeneratedInterfacesObservation(
  repoDir: string,
  contracts: FrameworkContracts,
): ProbeObservation & JsonRecord {
  try {
    const bundle = buildGeneratedAgentInterfaces(contracts, ['--repo-dir', repoDir])
      .generated_agent_interfaces as JsonRecord;
    const status = optionalString(bundle.status);
    const blockers = [
      status === 'ready' ? null : `generated_interfaces_status_not_ready:${status ?? 'missing'}`,
      bundle.domain_repo_can_own_generated_surface === false
        ? null
        : 'generated_interfaces_domain_repo_can_own_generated_surface_must_be_false',
      ...stringList(bundle.blocker_reasons).map((blocker) => `generated_interfaces:${blocker}`),
    ].filter((entry): entry is string => Boolean(entry));
    return {
      status: statusFromBlockers(blockers),
      source_refs: ['opl agents interfaces --repo-dir <repo_dir> --json'],
      generated_interfaces_status: status,
      source_kind: optionalString(bundle.source_kind),
      generated_surface_owner: optionalString(bundle.generated_surface_owner) ?? optionalString(bundle.owner),
      domain_repo_can_own_generated_surface: bundle.domain_repo_can_own_generated_surface,
      selected_format: optionalString(bundle.selected_format),
      blockers,
    };
  } catch (error) {
    const code = error instanceof FrameworkContractError ? error.code : 'generated_interfaces_error';
    return {
      status: 'blocked',
      source_refs: ['opl agents interfaces --repo-dir <repo_dir> --json'],
      generated_interfaces_status: 'error',
      blockers: [`generated_interfaces_error:${code}`],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function buildActionCatalogObservation(repoDir: string): ProbeObservation & JsonRecord {
  const readout = readJsonFile(repoDir, 'contracts/action_catalog.json');
  if (readout.status !== 'resolved') {
    return {
      status: 'blocked',
      source_refs: ['contracts/action_catalog.json'],
      contract_status: readout.status,
      catalog_id: null,
      target_domain_id: null,
      action_count: 0,
      action_ids: [],
      blockers: [`action_catalog_${readout.status}`],
      error: readout.error,
    };
  }
  try {
    const catalog = normalizeFamilyActionCatalog(readout.payload);
    const blockers = [
      catalog ? null : 'action_catalog_missing_or_invalid',
    ].filter((entry): entry is string => Boolean(entry));
    return {
      status: statusFromBlockers(blockers),
      source_refs: ['contracts/action_catalog.json'],
      contract_status: readout.status,
      catalog_id: catalog?.catalog_id ?? null,
      target_domain_id: catalog?.target_domain_id ?? null,
      owner: catalog?.owner ?? null,
      action_count: catalog?.actions.length ?? 0,
      action_ids: catalog?.actions.map((action) => action.action_id) ?? [],
      blockers,
    };
  } catch (error) {
    return {
      status: 'blocked',
      source_refs: ['contracts/action_catalog.json'],
      contract_status: 'invalid_shape',
      catalog_id: null,
      target_domain_id: null,
      action_count: 0,
      action_ids: [],
      blockers: ['action_catalog_invalid_shape'],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function buildStagePlaneObservation(
  repoDir: string,
  providedReadout?: StandardAgentRepoContractReadout,
): ProbeObservation & JsonRecord {
  const readout = providedReadout ?? buildStandardAgentRepoContractReadout(repoDir);
  const stagePlane = readout.stage_control_plane;
  if (readout.status !== 'resolved' || !stagePlane) {
    return {
      status: 'blocked',
      source_refs: [STANDARD_AGENT_STAGE_MANIFEST_REF],
      contract_status: readout.status,
      plane_id: null,
      target_domain_id: null,
      stage_count: 0,
      stage_ids: [],
      blockers: readout.blockers.length > 0 ? readout.blockers : [`stage_plane_${readout.status}`],
      error: readout.error,
    };
  }
  return {
    status: 'passed',
    source_refs: [STANDARD_AGENT_STAGE_MANIFEST_REF],
    contract_status: 'compiled_from_standard_agent_stage_manifest',
    plane_id: stagePlane.plane_id,
    target_domain_id: stagePlane.target_domain_id,
    owner: stagePlane.owner,
    stage_pack_conformance_version: stagePlane.stage_pack_conformance_version ?? null,
    stage_count: stagePlane.stages.length,
    stage_ids: stagePlane.stages.map((stage) => stage.stage_id),
    blockers: [],
  };
}

function buildObservations(
  report: FamilyAgentConformanceProbeSourceReport,
  contracts: FrameworkContracts,
  repoContractReadout?: StandardAgentRepoContractReadout,
) {
  return {
    scaffold_validation: observationFromReport(report, 'scaffold_validation'),
    pack_compiler_checks: observationFromReport(report, 'pack_compiler_checks'),
    generated_surface_handoff_checks: observationFromReport(report, 'generated_surface_handoff_checks'),
    private_surface_checks: observationFromReport(report, 'private_surface_checks'),
    legacy_runtime_residue_guard: observationFromReport(report, 'legacy_runtime_residue_guard'),
    platform_surface_ownership_checks: observationFromReport(report, 'platform_surface_ownership_checks'),
    physical_morphology_checks: observationFromReport(report, 'physical_morphology_checks'),
    workspace_file_lifecycle_checks: observationFromReport(report, 'workspace_file_lifecycle_checks'),
    stage_artifact_kernel_adoption_checks: observationFromReport(report, 'stage_artifact_kernel_adoption_checks'),
    stage_run_kernel_profile_checks: observationFromReport(report, 'stage_run_kernel_profile_checks'),
    stage_run_canary_evidence_checks: observationFromReport(report, 'stage_run_canary_evidence_checks'),
    stage_operating_principle_checks: observationFromReport(report, 'stage_operating_principle_checks'),
    standard_agent_principle_checks: observationFromReport(report, 'standard_agent_principle_checks'),
    state_index_kernel_adoption_checks: observationFromReport(report, 'state_index_kernel_adoption_checks'),
    golden_path_default_surface_budget_checks: observationFromReport(report, 'golden_path_default_surface_budget_checks'),
    workspace_norm_checks: observationFromReport(report, 'workspace_norm_checks'),
    generated_interfaces: buildGeneratedInterfacesObservation(report.repo_dir, contracts),
    action_catalog: buildActionCatalogObservation(report.repo_dir),
    stage_plane: buildStagePlaneObservation(report.repo_dir, repoContractReadout),
  };
}

function buildGateResults(
  report: FamilyAgentConformanceProbeSourceReport,
  admissionContract: AdmissionGateContract,
  observations: Record<string, ProbeObservation>,
) {
  return admissionContract.standard_agent_admission_package.gates.map((gate) => {
    const observationIds = GATE_OBSERVATION_IDS[gate.gate_id] ?? [];
    const blockers = unique(observationIds.flatMap((id) =>
      observations[id]?.status === 'passed'
        ? []
        : observations[id]?.blockers ?? [`${id}:missing_probe_observation`]
    ));
    return {
      gate_id: gate.gate_id,
      requirement_kind: gate.requirement_kind,
      required_for_formal_admission: gate.required_for_formal_admission,
      status: statusFromBlockers(blockers),
      observed_source_refs: unique([
        ...gate.required_evidence_refs,
        ...observationIds.flatMap((id) => observations[id]?.source_refs ?? []),
      ]),
      observed_probe_inputs: observationIds,
      forbidden_claims: gate.forbidden_claims,
      blockers,
      authority_boundary: {
        gate_probe_can_admit_domain: false,
        gate_probe_can_claim_domain_ready: false,
        gate_probe_can_claim_production_ready: false,
      },
    };
  }).filter((gate) =>
    admissionContract.standard_agent_admission_package.required_gate_ids.includes(gate.gate_id)
  );
}

function falseAuthorityBoundary(admissionContract: AdmissionGateContract) {
  return {
    ...admissionContract.false_authority_boundary,
    conformance_probe_can_admit_domain: false,
    conformance_probe_can_claim_domain_ready: false,
    conformance_probe_can_claim_production_ready: false,
    conformance_probe_can_write_domain_truth: false,
    conformance_probe_can_create_owner_receipt: false,
    conformance_probe_can_create_typed_blocker: false,
    domain_ready_authorized: false,
    production_ready_authorized: false,
  };
}

function buildDomainProbe(
  report: FamilyAgentConformanceProbeSourceReport,
  contracts: FrameworkContracts,
  admissionContract: AdmissionGateContract,
  repoContractReadout?: StandardAgentRepoContractReadout,
) {
  const observations = buildObservations(report, contracts, repoContractReadout);
  const gateResults = buildGateResults(report, admissionContract, observations);
  const blockers = unique([
    ...stringList(report.blockers),
    ...gateResults.flatMap((gate) => gate.blockers),
  ]);
  return {
    surface_kind: 'opl_family_live_conformance_probe_domain',
    owner: 'one-person-lab',
    domain_id: report.domain_id,
    requested_agent_id: report.requested_agent_id,
    repo_dir: report.repo_dir,
    status: statusFromBlockers(blockers),
    standard_admission_gate_contract: {
      contract_ref: STANDARD_AGENT_ADMISSION_GATES_REF,
      version: admissionContract.version,
      required_gate_ids: admissionContract.standard_agent_admission_package.required_gate_ids,
      formal_domain_admission_requires_all_gates:
        admissionContract.admission_policy.formal_domain_admission_requires_all_gates === true,
      conformance_or_scaffold_signal_can_claim_domain_ready:
        admissionContract.admission_policy.conformance_or_scaffold_signal_can_claim_domain_ready === true,
      production_readiness_claim_allowed:
        admissionContract.admission_policy.production_readiness_claim_allowed === true,
    },
    live_inputs: {
      generated_interfaces: observations.generated_interfaces,
      action_catalog: observations.action_catalog,
      stage_plane: observations.stage_plane,
    },
    gate_results: gateResults,
    passed_gate_count: gateResults.filter((gate) => gate.status === 'passed').length,
    blocked_gate_count: gateResults.filter((gate) => gate.status === 'blocked').length,
    blockers,
    false_authority_boundary: falseAuthorityBoundary(admissionContract),
  };
}

export function buildFamilyAgentLiveConformanceProbe(
  reports: FamilyAgentConformanceProbeSourceReport[],
  contracts: FrameworkContracts = loadFrameworkContracts(),
  repoContractReadouts: ReadonlyMap<string, StandardAgentRepoContractReadout> = new Map(),
) {
  const admissionContract = readAdmissionGateContract();
  const domains = reports.map((report) => buildDomainProbe(
    report,
    contracts,
    admissionContract,
    repoContractReadouts.get(path.resolve(report.repo_dir)),
  ));
  const passedCount = domains.filter((domain) => domain.status === 'passed').length;
  const blockedCount = domains.length - passedCount;
  return {
    surface_kind: 'opl_family_live_conformance_probe',
    version: 'family-live-conformance-probe.v1',
    owner: 'one-person-lab',
    status: blockedCount === 0 ? 'passed' : 'blocked',
    source_command: 'opl agents conformance --family-defaults --json',
    source_contract_ref: STANDARD_AGENT_ADMISSION_GATES_REF,
    total_domain_count: domains.length,
    passed_domain_count: passedCount,
    blocked_domain_count: blockedCount,
    domain_ids: domains.map((domain) => domain.domain_id),
    domains,
    false_authority_boundary: falseAuthorityBoundary(admissionContract),
  };
}
