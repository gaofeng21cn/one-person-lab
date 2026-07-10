import path from 'node:path';

import {
  buildDomainPackCompilerList,
  buildGeneratedAgentInterfaces,
} from '../../pack/index.ts';
import {
  defaultStandardDomainAgentRepoInputs,
  DEFAULT_STANDARD_DOMAIN_AGENT_REPOS,
} from '../../atlas/index.ts';
import { readJsonPayloadFile } from '../../../kernel/json-file.ts';
import {
  FrameworkContractError,
  expectBoolean,
  expectString,
  expectStringArray,
  isRecord,
} from '../../../kernel/contract-validation.ts';
import type { FrameworkContracts } from '../../../kernel/types.ts';
import type {
  DomainPackCompilerContractSubset,
  DomainPackCompilerFamilyReadback,
  DomainProgressRuntimeFirstSliceContractSubset,
  FamilyReadbackUnavailable,
  GeneratedInterfacesFamilyReadback,
  JsonRecord,
  OperatorCompactReadbackContractSubset,
  RuntimeEnvironmentSubstrateContractSubset,
  SchemaContractIdentity,
} from './shared.ts';

function stringField(record: JsonRecord, key: string, filePath: string): string {
  return expectString(record[key], key, filePath);
}

function booleanField(record: JsonRecord, key: string, filePath: string): boolean {
  return expectBoolean(record[key], key, filePath);
}

function stringArrayField(record: JsonRecord, key: string, filePath: string): string[] {
  const value = expectStringArray(record[key], key, filePath);
  if (value.some((entry) => entry.length === 0)) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      `Contract field "${key}" must not contain empty strings.`,
      { file: filePath, field: key },
    );
  }
  return value;
}

function recordField(record: JsonRecord, key: string, filePath: string): JsonRecord {
  const value = record[key];
  if (!isRecord(value)) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      `Contract field "${key}" must be an object.`,
      { file: filePath, field: key },
    );
  }
  return value;
}

function stringOrNumberField(
  record: JsonRecord,
  key: string,
  filePath: string,
): string | number {
  const value = record[key];
  if (typeof value === 'string' || typeof value === 'number') {
    return value;
  }
  throw new FrameworkContractError(
    'contract_shape_invalid',
    `Contract field "${key}" must be a string or number.`,
    { file: filePath, field: key },
  );
}

export function sameStringSet(left: string[], right: string[]) {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  return left.length === right.length
    && left.every((entry) => rightSet.has(entry))
    && right.every((entry) => leftSet.has(entry));
}

function readJsonObject(filePath: string, label: string): JsonRecord {
  let parsed: unknown;
  try {
    parsed = readJsonPayloadFile(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new FrameworkContractError(
        'contract_file_missing',
        `Required contract file is missing: ${label}.`,
        { file: filePath },
      );
    }
    throw new FrameworkContractError(
      'contract_json_invalid',
      `Contract file contains invalid JSON: ${label}.`,
      {
        file: filePath,
        cause: error instanceof Error ? error.message : 'JSON parsing failed unexpectedly.',
      },
    );
  }
  if (!isRecord(parsed)) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      `${label} must contain an object root.`,
      { file: filePath },
    );
  }
  return parsed;
}

export function readDomainPackCompilerContract(contractsDir: string): DomainPackCompilerContractSubset {
  const filePath = path.join(contractsDir, 'domain-pack-compiler-contract.json');
  const parsed = readJsonObject(filePath, 'domain-pack-compiler-contract.json');
  const generated = recordField(parsed, 'generated_interface_bundle', filePath);
  const defaultEntry = recordField(generated, 'default_entry_policy', filePath);
  const lineage = recordField(generated, 'source_of_work_lineage', filePath);
  const noResurrection = recordField(generated, 'generated_default_entry_no_resurrection_gate', filePath);
  const supported = generated.supported_derived_surfaces;
  if (!Array.isArray(supported)) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'domain-pack-compiler-contract.json must contain a supported_derived_surfaces array.',
      { file: filePath, field: 'supported_derived_surfaces' },
    );
  }

  return {
    generated_interface_bundle: {
      generated_surface_owner: stringField(generated, 'generated_surface_owner', filePath),
      domain_repo_can_own_generated_surface: booleanField(generated, 'domain_repo_can_own_generated_surface', filePath),
      default_entry_policy: {
        surface_kind: stringField(defaultEntry, 'surface_kind', filePath),
        status: stringField(defaultEntry, 'status', filePath),
        owner: stringField(defaultEntry, 'owner', filePath),
        domain_repo_wrapper_policy: stringField(defaultEntry, 'domain_repo_wrapper_policy', filePath),
        domain_repo_can_own_default_entry: booleanField(defaultEntry, 'domain_repo_can_own_default_entry', filePath),
        default_entry_surface_ids: stringArrayField(defaultEntry, 'default_entry_surface_ids', filePath),
      },
      source_of_work_lineage: {
        surface_kind: stringField(lineage, 'surface_kind', filePath),
        owner: stringField(lineage, 'owner', filePath),
        source_catalogs: stringArrayField(lineage, 'source_catalogs', filePath),
        derived_surface_policy: stringField(lineage, 'derived_surface_policy', filePath),
        domain_repo_wrapper_policy: stringField(lineage, 'domain_repo_wrapper_policy', filePath),
        authority_boundary: recordField(lineage, 'authority_boundary', filePath),
      },
      generated_default_entry_no_resurrection_gate: {
        surface_kind: stringField(noResurrection, 'surface_kind', filePath),
        owner: stringField(noResurrection, 'owner', filePath),
        release_gate: booleanField(noResurrection, 'release_gate', filePath),
        required_default_entry_surface_ids: stringArrayField(noResurrection, 'required_default_entry_surface_ids', filePath),
        blocked_resurrection_surface_classes: stringArrayField(noResurrection, 'blocked_resurrection_surface_classes', filePath),
        authority_boundary: recordField(noResurrection, 'authority_boundary', filePath),
      },
      supported_derived_surfaces: supported.map((surface) => {
        if (!isRecord(surface)) {
          throw new FrameworkContractError(
            'contract_shape_invalid',
            'Each domain-pack-compiler supported surface must be an object.',
            { file: filePath, field: 'supported_derived_surfaces' },
          );
        }
        return {
          surface_id: stringField(surface, 'surface_id', filePath),
          owner: stringField(surface, 'owner', filePath),
          default_entry: booleanField(surface, 'default_entry', filePath),
          source_catalogs: stringArrayField(surface, 'source_catalogs', filePath),
          domain_repo_role: stringField(surface, 'domain_repo_role', filePath),
          domain_repo_can_own_generated_surface: booleanField(surface, 'domain_repo_can_own_generated_surface', filePath),
        };
      }),
    },
  };
}

export function readOperatorCompactReadbackContract(
  contractsDir: string,
): OperatorCompactReadbackContractSubset {
  const filePath = path.join(contractsDir, 'operator-compact-readback-contract.json');
  const parsed = readJsonObject(filePath, 'operator-compact-readback-contract.json');
  const surfaces = parsed.compact_surfaces;
  if (!Array.isArray(surfaces)) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'operator-compact-readback-contract.json must contain a compact_surfaces array.',
      { file: filePath, field: 'compact_surfaces' },
    );
  }

  return {
    surface_kind: stringField(parsed, 'surface_kind', filePath),
    version: stringField(parsed, 'version', filePath),
    owner: stringField(parsed, 'owner', filePath),
    state: stringField(parsed, 'state', filePath),
    default_full_readback_unchanged:
      booleanField(parsed, 'default_full_readback_unchanged', filePath),
    compact_surfaces: surfaces.map((surface) => {
      if (!isRecord(surface)) {
        throw new FrameworkContractError(
          'contract_shape_invalid',
          'Each operator compact readback surface must be an object.',
          { file: filePath, field: 'compact_surfaces' },
        );
      }
      return {
        surface_id: stringField(surface, 'surface_id', filePath),
        surface_kind: stringField(surface, 'surface_kind', filePath),
        compact_command: stringField(surface, 'compact_command', filePath),
        full_detail_command: stringField(surface, 'full_detail_command', filePath),
        source_surface_ref: stringField(surface, 'source_surface_ref', filePath),
        derived_from_full_readback:
          booleanField(surface, 'derived_from_full_readback', filePath),
        default_full_readback_unchanged:
          booleanField(surface, 'default_full_readback_unchanged', filePath),
        retained_sections: stringArrayField(surface, 'retained_sections', filePath),
        omitted_sections: stringArrayField(surface, 'omitted_sections', filePath),
        authority_boundary: recordField(surface, 'authority_boundary', filePath),
      };
    }),
    operator_use: recordField(parsed, 'operator_use', filePath),
    no_second_truth_guard: recordField(parsed, 'no_second_truth_guard', filePath),
    false_ready_guard: recordField(parsed, 'false_ready_guard', filePath),
    not_authorized_claims: stringArrayField(parsed, 'not_authorized_claims', filePath),
  };
}

function frameworkReadbackUnavailable(
  error: unknown,
  sourceCommand: string,
): FamilyReadbackUnavailable {
  return {
    status: 'blocked_unavailable',
    error_code: error instanceof FrameworkContractError ? error.code : 'readback_unavailable',
    error_message: error instanceof Error ? error.message : 'Family-default readback is unavailable.',
    source_command: sourceCommand,
  };
}

export function readDomainPackCompilerFamilyReadback(
  contracts: FrameworkContracts,
): DomainPackCompilerFamilyReadback {
  const sourceCommand = 'opl agents pack-compiler --family-defaults --json';
  try {
    const readback = buildDomainPackCompilerList(contracts, {
      familyDefaults: true,
      familyRepoInputs: defaultStandardDomainAgentRepoInputs(),
      defaultRepoDirectories: DEFAULT_STANDARD_DOMAIN_AGENT_REPOS.map((repo) => repo.directory),
    });
    const packCompiler = recordField(
      readback as unknown as JsonRecord,
      'domain_pack_compiler',
      sourceCommand,
    );
    return {
      status: 'available',
      source_command: sourceCommand,
      source_kind: stringField(packCompiler, 'source_kind', sourceCommand),
      summary: recordField(packCompiler, 'summary', sourceCommand),
      authority_boundary: recordField(packCompiler, 'authority_boundary', sourceCommand),
    };
  } catch (error) {
    return frameworkReadbackUnavailable(error, sourceCommand);
  }
}

function generatedInterfaceReports(readback: JsonRecord, sourceCommand: string) {
  const interfaces = recordField(readback, 'generated_agent_interfaces', sourceCommand);
  const reports = interfaces.reports;
  if (!Array.isArray(reports)) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Generated agent interfaces family readback must contain reports.',
      { file: sourceCommand, field: 'generated_agent_interfaces.reports' },
    );
  }
  return {
    interfaces,
    reports: reports.filter(isRecord),
  };
}

function collectGeneratedInterfaceReadbackDetails(reports: JsonRecord[]) {
  const consumptionBundles = reports
    .map((report) => (
      isRecord(report.generated_agent_interfaces)
        ? recordField(report.generated_agent_interfaces, 'generated_surface_consumption_bundle', 'generated_agent_interfaces')
        : null
    ))
    .filter((entry): entry is JsonRecord => Boolean(entry));
  const countRecords = consumptionBundles
    .map((bundle) => recordField(bundle, 'consumption_status_counts', 'generated_surface_consumption_bundle'));
  const consumerSurfaceIds = [
    ...new Set(consumptionBundles.flatMap((bundle) =>
      stringArrayField(bundle, 'consumer_surface_ids', 'generated_surface_consumption_bundle')
    )),
  ];
  const generatedInterfaceRecords = reports
    .map((report) => (
      isRecord(report.generated_agent_interfaces) ? report.generated_agent_interfaces : null
    ))
    .filter((entry): entry is JsonRecord => Boolean(entry));
  const activeCallerCutoverStatuses = [
    ...new Set(generatedInterfaceRecords
      .map((record) => {
        const proof = isRecord(record.active_caller_cutover_proof)
          ? record.active_caller_cutover_proof
          : null;
        return typeof proof?.status === 'string' ? proof.status : null;
      })
      .filter((entry): entry is string => Boolean(entry))),
  ];
  const generatedWrapperBundleStatuses = [
    ...new Set(generatedInterfaceRecords
      .map((record) => {
        const bundle = isRecord(record.generated_wrapper_bundle)
          ? record.generated_wrapper_bundle
          : null;
        return typeof bundle?.status === 'string' ? bundle.status : null;
      })
      .filter((entry): entry is string => Boolean(entry))),
  ];

  return {
    consumption_status_counts: {
      selected: countRecords.reduce((total, counts) =>
        total + Number(counts.selected ?? 0), 0),
      ready: countRecords.reduce((total, counts) =>
        total + Number(counts.ready ?? 0), 0),
      blocked: countRecords.reduce((total, counts) =>
        total + Number(counts.blocked ?? 0), 0),
    },
    consumer_surface_ids: consumerSurfaceIds,
    active_caller_cutover_statuses: activeCallerCutoverStatuses,
    generated_wrapper_bundle_statuses: generatedWrapperBundleStatuses,
    domain_generated_surface_owner_claim_count: generatedInterfaceRecords.filter((record) =>
      record.domain_repo_can_own_generated_surface === true
    ).length,
  };
}

export function readGeneratedInterfacesFamilyReadback(
  contracts: FrameworkContracts,
): GeneratedInterfacesFamilyReadback {
  const sourceCommand = 'opl agents interfaces --family-defaults --json';
  try {
    const readback = buildGeneratedAgentInterfaces(contracts, ['--family-defaults'], {
      familyRepoInputs: defaultStandardDomainAgentRepoInputs(),
      defaultRepoDirectories: DEFAULT_STANDARD_DOMAIN_AGENT_REPOS.map((repo) => repo.directory),
    });
    const { interfaces, reports } = generatedInterfaceReports(
      readback as unknown as JsonRecord,
      sourceCommand,
    );
    return {
      status: 'available',
      source_command: sourceCommand,
      selected_format: stringField(interfaces, 'selected_format', sourceCommand),
      summary: recordField(interfaces, 'summary', sourceCommand),
      ...collectGeneratedInterfaceReadbackDetails(reports),
      authority_boundary: recordField(interfaces, 'authority_boundary', sourceCommand),
    };
  } catch (error) {
    return frameworkReadbackUnavailable(error, sourceCommand);
  }
}

export function readDomainProgressRuntimeFirstSliceContract(
  contractsDir: string,
): DomainProgressRuntimeFirstSliceContractSubset {
  const filePath = path.join(contractsDir, 'stage-route-scheduler-contract.json');
  const parsed = readJsonObject(filePath, 'stage-route-scheduler-contract.json');
  const arbiter = recordField(parsed, 'stage_route_arbiter_substrate_contract', filePath);
  const slice = recordField(arbiter, 'domain_progress_transition_runtime_first_slice', filePath);
  const physicalPersistence = recordField(slice, 'physical_persistence_refs', filePath);
  const policyAdapter = recordField(slice, 'policy_adapter_contract', filePath);

  return {
    contract_kind: stringField(parsed, 'contract_kind', filePath),
    owner: stringField(parsed, 'owner', filePath),
    surface_kind: stringField(slice, 'surface_kind', filePath),
    schema_version: stringOrNumberField(slice, 'schema_version', filePath),
    status: stringField(slice, 'status', filePath),
    purpose: stringField(slice, 'purpose', filePath),
    implementation_refs: recordField(slice, 'implementation_refs', filePath),
    physical_persistence_refs: physicalPersistence,
    runtime_live_readback_contract:
      recordField(physicalPersistence, 'runtime_live_readback_contract', filePath),
    brand_module_partition: recordField(slice, 'brand_module_partition', filePath),
    allowed_transition_decisions:
      stringArrayField(slice, 'allowed_transition_decisions', filePath),
    decision_surface_policy: recordField(slice, 'decision_surface_policy', filePath),
    not_complete_claims: stringArrayField(slice, 'not_complete_claims', filePath),
    policy_adapter_contract: {
      surface_kind: stringField(policyAdapter, 'surface_kind', filePath),
      runtime_id: stringField(policyAdapter, 'runtime_id', filePath),
      runtime_owner: stringField(policyAdapter, 'runtime_owner', filePath),
      adapter_role: stringField(policyAdapter, 'adapter_role', filePath),
      first_consumer: stringField(policyAdapter, 'first_consumer', filePath),
      accepted_request_surfaces:
        stringArrayField(policyAdapter, 'accepted_request_surfaces', filePath),
      normalized_request_surface:
        stringField(policyAdapter, 'normalized_request_surface', filePath),
      required_fields: stringArrayField(policyAdapter, 'required_fields', filePath),
      fail_closed_reasons:
        stringArrayField(policyAdapter, 'fail_closed_reasons', filePath),
      forbidden_domain_adapter_outputs:
        stringArrayField(policyAdapter, 'forbidden_domain_adapter_outputs', filePath),
      authority_boundary: recordField(policyAdapter, 'authority_boundary', filePath),
    },
    stage_route_false_authority_flags:
      recordField(arbiter, 'false_authority_flags', filePath),
  };
}

export function readRuntimeEnvironmentSubstrateContract(
  contractsDir: string,
): RuntimeEnvironmentSubstrateContractSubset {
  const filePath = path.join(contractsDir, 'runtime-environment-substrate-contract.json');
  const parsed = readJsonObject(filePath, 'runtime-environment-substrate-contract.json');
  const ordinaryPath = recordField(parsed, 'ordinary_path', filePath);

  return {
    contract_id: stringField(parsed, 'contract_id', filePath),
    schema_version: stringField(parsed, 'schema_version', filePath),
    owner: stringField(parsed, 'owner', filePath),
    state: stringField(parsed, 'state', filePath),
    implementation_status: stringField(parsed, 'implementation_status', filePath),
    target_planned: booleanField(parsed, 'target_planned', filePath),
    ordinary_path: {
      input: stringField(ordinaryPath, 'input', filePath),
      steps: stringArrayField(ordinaryPath, 'steps', filePath),
      default_mode: stringField(ordinaryPath, 'default_mode', filePath),
      domain_agents_declare_dependency_intent_only: booleanField(
        ordinaryPath,
        'domain_agents_declare_dependency_intent_only',
        filePath,
      ),
    },
    materialization_policy: recordField(parsed, 'materialization_policy', filePath),
    cache_policy: recordField(parsed, 'cache_policy', filePath),
    cache_inventory_policy: recordField(parsed, 'cache_inventory_policy', filePath),
    dependency_prepare_policy: recordField(parsed, 'dependency_prepare_policy', filePath),
    run_context_consumer_policy: recordField(parsed, 'run_context_consumer_policy', filePath),
    authority_boundary: recordField(parsed, 'authority_boundary', filePath),
    required_readback_claim_fields: stringArrayField(parsed, 'required_readback_claim_fields', filePath),
    readback_commands: stringArrayField(parsed, 'readback_commands', filePath),
    forbidden_claims: stringArrayField(parsed, 'forbidden_claims', filePath),
    live_evidence_deferred: stringArrayField(parsed, 'live_evidence_deferred', filePath),
  };
}

export function schemaIdentityFromContract(
  filePath: string,
  label: string,
  constFields: string[],
): SchemaContractIdentity {
  const parsed = readJsonObject(filePath, label);
  const required = stringArrayField(parsed, 'required', filePath);
  const properties = recordField(parsed, 'properties', filePath);
  const consts = Object.fromEntries(constFields.map((field) => {
    const property = recordField(properties, field, filePath);
    return [field, stringField(property, 'const', filePath)];
  }));
  return {
    required,
    consts,
  };
}
