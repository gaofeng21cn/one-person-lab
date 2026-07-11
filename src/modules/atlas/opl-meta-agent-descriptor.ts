import fs from 'node:fs';
import path from 'node:path';

import { isRecord } from '../../kernel/contract-validation.ts';
import { optionalString, readJsonPayloadFile } from '../../kernel/json-file.ts';
import { recordList, stringList, type JsonRecord } from '../../kernel/json-record.ts';
import type { StandardDomainAgentRepoInput } from '../../kernel/standard-domain-agent-family-repos.ts';
import { buildStandardAgentRepoContractReadout } from '../pack/index.ts';
import type { DomainManifestCatalog } from './domain-manifest/catalog-builder.ts';
import { normalizeManifest } from './domain-manifest/normalizers.ts';
import type { DomainManifestCatalogEntry } from './domain-manifest/types.ts';
import { defaultStandardDomainAgentRepoInputs } from './standard-domain-agent-family-repos.ts';

const OMA_PROJECT_ID = 'opl-meta-agent';
const OMA_PROJECT = 'opl-meta-agent';
const OMA_CANONICAL_AGENT_ID = 'oma';
const STANDARD_AGENT_STAGE_MANIFEST_REF = 'agent/stages/manifest.json';

const OMA_CONTRACTS = {
  domainDescriptor: 'contracts/domain_descriptor.json',
  actionCatalog: 'contracts/action_catalog.json',
  stageManifest: STANDARD_AGENT_STAGE_MANIFEST_REF,
  generatedSurfaceHandoff: 'contracts/generated_surface_handoff.json',
  functionalPrivatizationAudit: 'contracts/functional_privatization_audit.json',
  packCompilerInput: 'contracts/pack_compiler_input.json',
  memoryDescriptor: 'contracts/memory_descriptor.json',
  artifactLocator: 'contracts/artifact_locator_contract.json',
  ownerReceipt: 'contracts/owner_receipt_contract.json',
  workspaceLifecyclePolicy: 'contracts/workspace_lifecycle_policy.json',
  registration: 'contracts/opl_domain_manifest_registration.json',
  appWorkbenchProjection: 'contracts/app_workbench_projection.json',
  scaleoutEvidence: 'contracts/real_target_agent_scaleout_evidence.json',
} as const;

function readJson(repoDir: string, relativePath: string): JsonRecord | null {
  const filePath = path.join(repoDir, relativePath);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  return readJsonPayloadFile(filePath) as JsonRecord;
}

function ref(refKind: string, refValue: string, role?: string) {
  return {
    ref_kind: refKind,
    ref: refValue,
    ...(role ? { role } : {}),
  };
}

function repoDirFromRegistry(registry: JsonRecord) {
  return optionalString(registry.repo_dir);
}

function registrySummary(registry: JsonRecord) {
  return isRecord(registry.summary) ? registry.summary : {};
}

function domainLabel(domainDescriptor: JsonRecord) {
  return optionalString(domainDescriptor.domain_label) ?? 'OPL Meta Agent';
}

function actionCommandContracts(actionCatalog: JsonRecord) {
  return recordList(actionCatalog.actions).map((action) => {
    const sourceCommand = isRecord(action.source_command) ? action.source_command : {};
    return {
      command: optionalString(sourceCommand.command) ?? optionalString(action.action_id) ?? 'opl-meta-agent-action',
      required_fields: stringList(action.workspace_locator_fields),
      optional_fields: [
        ...stringList(action.human_gate_ids).map((gateId) => `human_gate:${gateId}`),
        'owner_receipt_or_typed_blocker_ref',
      ],
      action_id: optionalString(action.action_id),
      effect: optionalString(action.effect),
    };
  });
}

function locatorSchemaFromActions(actionCatalog: JsonRecord) {
  const fields = new Set<string>();
  for (const action of recordList(actionCatalog.actions)) {
    for (const field of stringList(action.workspace_locator_fields)) {
      fields.add(field);
    }
  }
  return {
    required_fields: [],
    optional_fields: [...fields].sort(),
  };
}

function buildDomainEntryContract(input: {
  actionCatalog: JsonRecord;
  domainDescriptor: JsonRecord;
  canonicalAgentId: string;
}) {
  const commandContracts = actionCommandContracts(input.actionCatalog);
  const supportedCommands = commandContracts.map((contract) => contract.command);
  return {
    entry_adapter: 'opl_hosted_standard_contract_descriptor_adapter',
    service_safe_surface_kind: 'opl_generated_domain_agent_descriptor',
    product_entry_builder_command: 'opl agents descriptor --domain opl-meta-agent',
    supported_commands: supportedCommands,
    command_contracts: commandContracts,
    supported_entry_modes: ['opl-hosted-descriptor', 'generated-interface'],
    product_entry_kind: 'opl_generated_surface',
    domain_agent_entry_spec: {
      surface_kind: 'domain_agent_entry_spec',
      agent_id: input.canonicalAgentId,
      title: domainLabel(input.domainDescriptor),
      description:
        optionalString(input.domainDescriptor.purpose)
        ?? 'Build, test, optimize, and deliver OPL-compatible Foundry Agents.',
      default_engine: 'codex-cli',
      workspace_requirement: 'action_specific_workspace_locator_refs',
      locator_schema: locatorSchemaFromActions(input.actionCatalog),
      codex_entry_strategy:
        'OPL-generated surfaces invoke OMA minimal authority functions and project refs, receipts, and typed blockers only.',
      artifact_conventions:
        'Candidate packages, receipts, and target-agent outputs are external workspace/runtime locator refs, not descriptor body content.',
      progress_conventions:
        'Closeout uses owner receipt or typed blocker refs; provider completion and generated interface readiness are not domain-ready claims.',
      entry_command: 'opl agents descriptor --domain opl-meta-agent',
      manifest_command: 'opl-hosted:standard-contract-descriptor-adapter',
    },
  };
}

function buildSharedHandoff() {
  return {
    opl_handoff_builder: {
      command: 'opl agents descriptor --domain opl-meta-agent',
      entry_mode: 'opl-hosted-descriptor',
      surface_kind: 'opl_domain_agent_descriptor',
    },
    opl_return_surface: {
      surface_kind: 'owner_receipt_or_typed_blocker_ref',
      target_domain_id: OMA_PROJECT_ID,
    },
  };
}

function buildStandardSkeleton(
  repoDir: string,
  generatedSurfaceHandoff: JsonRecord | null,
  canonicalAgentId: string,
) {
  const rootRefs = [
    ['agent', 'agent/knowledge/opl-boundary-policy.md'],
    ['contracts', OMA_CONTRACTS.domainDescriptor],
    ['runtime', 'runtime/authority_functions/meta-agent-authority-functions.json'],
    ['docs', 'docs/status.md'],
  ] as const;
  const physicalRoots = rootRefs
    .filter(([, anchorRef]) => fs.existsSync(path.join(repoDir, anchorRef)))
    .map(([boundaryId, anchorRef]) => ({
      boundary_id: boundaryId,
      anchor_ref: anchorRef,
      status: 'present_with_repo_source_entrypoint',
    }));
  return {
    surface_kind: 'standard_domain_agent_skeleton',
    version: 'standard-domain-agent-skeleton.v1',
    agent_id: canonicalAgentId,
    repo_source_boundary: {
      required_dirs: ['agent', 'contracts', 'runtime', 'docs'],
      forbidden_dirs: ['artifacts', 'workspace', 'workspaces'],
    },
    contracts: {
      descriptor_refs: [
        OMA_CONTRACTS.domainDescriptor,
        OMA_CONTRACTS.actionCatalog,
        OMA_CONTRACTS.stageManifest,
        OMA_CONTRACTS.packCompilerInput,
      ],
      sidecar_refs: [
        OMA_CONTRACTS.generatedSurfaceHandoff,
        OMA_CONTRACTS.registration,
        OMA_CONTRACTS.appWorkbenchProjection,
      ],
      quality_gate_refs: ['agent/quality_gates'],
    },
    artifact_boundary: {
      repo_contains_real_artifacts: false,
      artifact_roots_are_locators: true,
      workspace_artifact_locator_refs: [OMA_CONTRACTS.artifactLocator],
      runtime_artifact_locator_refs: [OMA_CONTRACTS.ownerReceipt, OMA_CONTRACTS.scaleoutEvidence],
    },
    authority_boundary: {
      opl: 'framework_transport_projection_and_generated_surface_owner',
      domain: 'agent_building_semantics_owner',
      opl_can_write_domain_truth: false,
      opl_can_write_memory_body: false,
      opl_can_authorize_quality_or_export: false,
      domain_repo_can_own_generated_surface: generatedSurfaceHandoff?.domain_repo_can_own_generated_surface === true,
    },
    physical_skeleton_follow_through: {
      surface_kind: 'physical_skeleton_follow_through',
      status: 'repo_source_anchor_evidence_observed',
      physical_roots: physicalRoots,
      forbidden_moves: ['workspace_runtime_artifacts', 'receipt_instances', 'memory_content_body'],
      direct_skill_parity_refs: ['contracts/generated_surface_handoff.json#generated_surfaces/skill'],
      opl_hosted_parity_refs: ['contracts/opl_domain_manifest_registration.json#discovery_receipt'],
      replacement_parity_refs: [
        'contracts/functional_privatization_audit.json#default_surface_boundary',
      ],
      provenance_refs: ['docs/status.md', 'docs/architecture.md'],
      legacy_active_path_policy: 'opl_generated_or_history_tombstone_only',
      legacy_active_path_residue: [],
    },
  };
}

function buildDomainMemoryDescriptor(memoryDescriptor: JsonRecord | null, stageControlPlane: JsonRecord) {
  const stages = recordList(stageControlPlane.stages)
    .map((stage) => optionalString(stage.stage_id))
    .filter((stage): stage is string => Boolean(stage));
  return {
    surface_kind: 'family_domain_memory_ref',
    version: 'family-domain-memory-ref.v1',
    memory_ref_id: 'opl_meta_agent_domain_memory',
    target_domain_id: OMA_PROJECT_ID,
    owner: optionalString(memoryDescriptor?.memory_body_owner) ?? OMA_PROJECT_ID,
    memory_family: 'target_agent_foundry_memory',
    memory_pack_ref: ref('human_doc', 'agent/knowledge/trajectory-learning-policy.md', 'domain_owned_memory_policy'),
    stage_applicability: stages.length > 0 ? stages : ['agent-skeleton-build'],
    retrieval_contract_ref: ref('contract_ref', OMA_CONTRACTS.memoryDescriptor, 'locator_contract'),
    writeback_contract_ref: ref('contract_ref', OMA_CONTRACTS.ownerReceipt, 'owner_receipt_contract'),
    receipt_contract_ref: ref('contract_ref', OMA_CONTRACTS.ownerReceipt, 'owner_receipt_contract'),
    writeback_receipt_locator_ref: ref(
      'workspace_locator',
      'workspace:/opl-meta-agent/memory/writeback-receipts',
      'externalized_receipt_locator',
    ),
    migration_readiness: { status: 'ready_for_refs_only_projection' },
    freshness: { status: 'contract_ref_current' },
    status: 'active',
    authority_boundary: {
      opl_role: 'locator_projection_owner',
      domain_memory_owner: OMA_PROJECT_ID,
      forbidden_opl_authority: [
        'memory_store_owner',
        'domain_truth_owner',
        'quality_verdict_owner',
        'artifact_authority',
      ],
      can_accept_memory_write: false,
      can_write_domain_truth: false,
      can_authorize_quality_verdict: false,
      can_write_artifacts: false,
    },
  };
}

function buildRuntimeSurfaces(repoDir: string, registry: JsonRecord, canonicalAgentId: string) {
  const summary = registrySummary(registry);
  const registryStatus = optionalString(registry.status) ?? 'resolved';
  const appWorkbenchSections =
    typeof summary.app_workbench_section_count === 'number'
      ? summary.app_workbench_section_count
      : 0;
  const openGateCount =
    typeof summary.production_consumption_followthrough_open_gate_count === 'number'
      ? summary.production_consumption_followthrough_open_gate_count
      : 0;
  return {
    runtime_inventory: {
      surface_kind: 'runtime_inventory',
      summary: 'OPL hosts the generated OMA descriptor and interface surfaces; OMA keeps domain semantics and refs.',
      runtime_owner: 'one-person-lab',
      domain_owner: OMA_PROJECT_ID,
      executor_owner: 'codex-cli',
      substrate: 'opl_generated_interface_projection',
      availability: registryStatus,
      health_status: openGateCount === 0 ? 'structural_consumption_projected' : 'production_consumption_followthrough_open',
      status_surface: ref('command', 'opl agents descriptor --domain opl-meta-agent'),
      attention_surface: ref('json_pointer', '/opl_meta_agent_registry/production_consumption_followthrough'),
      recovery_surface: ref('command', 'opl system startup-maintenance'),
      workspace_binding: { repo_dir: repoDir, binding_kind: 'opl_hosted_descriptor_adapter' },
      domain_projection: { registry_status: registryStatus, app_workbench_section_count: appWorkbenchSections },
    },
    session_continuity: {
      surface_kind: 'session_continuity',
      summary: 'OMA descriptor continuity is projected through OPL-generated refs-only surfaces.',
      domain_agent_id: canonicalAgentId,
      runtime_owner: 'one-person-lab',
      domain_owner: OMA_PROJECT_ID,
      executor_owner: 'codex-cli',
      status: registryStatus,
      entry_surface: {
        surface_kind: 'opl_domain_agent_descriptor',
        summary: 'Inspect OMA through the OPL-hosted descriptor adapter.',
        command: 'opl agents descriptor --domain opl-meta-agent',
      },
      progress_surface: {
        surface_kind: 'opl_meta_agent_workbench_refs',
        summary: 'Inspect OMA workbench refs and production-consumption gates.',
        command: 'opl app operator drilldown --full --json',
      },
      restore_surface: {
        surface_kind: 'opl_system_startup_maintenance',
        summary: 'Refresh managed OMA install and generated app skill surfaces.',
        command: 'opl system startup-maintenance',
      },
      human_gate_ids: ['oma_production_consumption_followthrough'],
      domain_projection: {
        production_consumption_followthrough: registry.production_consumption_followthrough,
      },
    },
    progress_projection: {
      surface_kind: 'progress_projection',
      headline: 'OMA standard contracts are projected through the unified OPL descriptor index.',
      latest_update: 'OMA descriptor source is read from repo standard contracts by an OPL-hosted adapter.',
      next_step: openGateCount === 0
        ? 'Continue production-consumption evidence collection without upgrading descriptor readiness into domain readiness.'
        : 'Close OMA production-consumption followthrough gates with owner receipts or typed blockers.',
      status_summary: 'Refs-only descriptor projection; no target-domain truth, artifact body, or quality verdict authority.',
      current_status: registryStatus,
      runtime_status: openGateCount === 0 ? 'structural_consumption_projected' : 'followthrough_open',
      progress_surface: {
        surface_kind: 'opl_meta_agent_workbench_refs',
        summary: 'Inspect OMA refs-only workbench status.',
        command: 'opl app operator drilldown --full --json',
      },
      attention_items: openGateCount === 0 ? [] : ['oma_production_consumption_followthrough_open'],
      human_gate_ids: ['oma_production_consumption_followthrough'],
      domain_projection: summary,
    },
    artifact_inventory: {
      surface_kind: 'artifact_inventory',
      workspace_path: repoDir,
      supporting_files: [
        artifactFile('domain_descriptor', OMA_CONTRACTS.domainDescriptor, 'OMA domain descriptor contract.'),
        artifactFile('action_catalog', OMA_CONTRACTS.actionCatalog, 'OMA family action catalog contract.'),
        artifactFile('stage_manifest', OMA_CONTRACTS.stageManifest, 'OMA declarative stage manifest source.'),
        artifactFile('generated_surface_handoff', OMA_CONTRACTS.generatedSurfaceHandoff, 'OPL generated surface handoff contract.'),
      ],
      inspect_paths: Object.values(OMA_CONTRACTS),
      domain_projection: {
        artifact_authority: 'opl-meta-agent',
        descriptor_body_embeds_artifacts: false,
      },
    },
  };
}

function artifactFile(fileId: string, relativePath: string, summary: string) {
  return {
    file_id: fileId,
    label: fileId,
    kind: 'supporting',
    path: relativePath,
    summary,
    ref: ref('path', relativePath, 'repo_contract_ref'),
  };
}

function buildSkillCatalog(actionCatalog: JsonRecord) {
  const actions = recordList(actionCatalog.actions);
  return {
    surface_kind: 'skill_catalog',
    summary: 'OPL-generated skill descriptor command contracts for OMA actions.',
    skills: actions.map((action) => ({
      surface_kind: 'skill_descriptor',
      skill_id: optionalString(action.action_id) ?? 'opl-meta-agent-action',
      title: optionalString(action.title) ?? optionalString(action.action_id) ?? 'OMA Action',
      owner: 'one-person-lab',
      distribution_mode: 'opl_generated_skill_descriptor_surface',
      target_surface_kind: 'opl_generated_skill_contract',
      description: optionalString(action.summary) ?? 'OMA generated skill action descriptor.',
      command: optionalString(isRecord(action.source_command) ? action.source_command.command : null),
      readiness: 'descriptor_source_available',
      tags: ['opl-meta-agent', 'foundry-agent', 'refs-only'],
      domain_projection: {
        domain_owner: OMA_PROJECT_ID,
        command_contract_id: optionalString(isRecord(action.supported_surfaces)
          && isRecord(action.supported_surfaces.skill)
          ? action.supported_surfaces.skill.command_contract_id
          : null),
      },
    })),
    supported_commands: actions
      .map((action) => optionalString(action.action_id))
      .filter((actionId): actionId is string => Boolean(actionId)),
    command_contracts: actionCommandContracts(actionCatalog),
  };
}

function buildTransitionDescriptor() {
  return {
    surface_kind: 'family_transition_spec_descriptor',
    descriptor_id: 'opl-meta-agent.transition.descriptor',
    target_domain_id: OMA_PROJECT_ID,
    owner: OMA_PROJECT_ID,
    spec_ref: `${STANDARD_AGENT_STAGE_MANIFEST_REF}#stages`,
    matrix_cases_ref: 'contracts/real_target_agent_scaleout_evidence.json#multi_target_scaleout_closeout',
    authority_boundary: {
      domain_transition_owner: OMA_PROJECT_ID,
      opl_role: 'descriptor_projection_only',
      opl_interprets_domain_quality: false,
      opl_executes_domain_action: false,
      opl_writes_domain_truth: false,
    },
  };
}

function buildRawManifest(repoDir: string, registry: JsonRecord) {
  const domainDescriptor = readJson(repoDir, OMA_CONTRACTS.domainDescriptor) ?? {};
  const actionCatalog = readJson(repoDir, OMA_CONTRACTS.actionCatalog);
  const repoContractReadout = buildStandardAgentRepoContractReadout(repoDir);
  const stageControlPlane = repoContractReadout.stage_control_plane as unknown as JsonRecord | null;
  const repoDescriptor = repoContractReadout.repo_contract_descriptor?.descriptor;
  const canonicalAgentId = repoContractReadout.canonical_agent_id;
  const targetDomainId = repoContractReadout.target_domain_id;
  const generatedSurfaceHandoff = isRecord(repoDescriptor?.generated_surface_handoff_contract)
    ? repoDescriptor.generated_surface_handoff_contract
    : null;
  const functionalPrivatizationAudit = isRecord(repoDescriptor?.functional_privatization_audit)
    ? repoDescriptor.functional_privatization_audit
    : null;
  if (
    !actionCatalog
    || repoContractReadout.status !== 'resolved'
    || !stageControlPlane
    || canonicalAgentId !== OMA_CANONICAL_AGENT_ID
    || targetDomainId !== OMA_PROJECT_ID
    || !generatedSurfaceHandoff
    || !functionalPrivatizationAudit
    || functionalPrivatizationAudit.status === 'missing'
  ) {
    return null;
  }
  const memoryDescriptor = readJson(repoDir, OMA_CONTRACTS.memoryDescriptor);
  const runtimeSurfaces = buildRuntimeSurfaces(repoDir, registry, canonicalAgentId);
  return {
    surface_kind: 'product_entry_manifest',
    manifest_kind: 'opl_hosted_standard_contract_descriptor_adapter',
    manifest_version: 1,
    target_domain_id: OMA_PROJECT_ID,
    formal_entry: {
      default: 'opl-hosted-descriptor',
      supported_protocols: ['cli', 'mcp', 'skill', 'product_entry', 'openai', 'ai-sdk'],
      internal_surface: 'opl_meta_agent_standard_contract_descriptor_adapter',
    },
    workspace_locator: {
      repo_dir: repoDir,
      source_kind: 'standard_agent_repo_contracts',
    },
    product_entry_shell: {
      opl_hosted_descriptor: {
        command: 'opl agents descriptor --domain opl-meta-agent',
        surface_kind: 'opl_domain_agent_descriptor',
      },
    },
    product_entry_surface: {
      shell_key: 'opl_hosted_descriptor',
      command: 'opl agents descriptor --domain opl-meta-agent',
      surface_kind: 'opl_domain_agent_descriptor',
      summary: 'OPL-hosted OMA descriptor projection from standard repo contracts.',
    },
    recommended_shell: 'opl_hosted_descriptor',
    domain_entry_contract: buildDomainEntryContract({
      actionCatalog,
      domainDescriptor,
      canonicalAgentId,
    }),
    shared_handoff: buildSharedHandoff(),
    family_action_catalog: actionCatalog,
    family_stage_control_plane: stageControlPlane,
    family_transition_spec_descriptor: buildTransitionDescriptor(),
    domain_memory_descriptor: buildDomainMemoryDescriptor(memoryDescriptor, stageControlPlane),
    standard_domain_agent_skeleton: buildStandardSkeleton(
      repoDir,
      generatedSurfaceHandoff,
      canonicalAgentId,
    ),
    generated_surface_handoff: generatedSurfaceHandoff,
    functional_privatization_audit: functionalPrivatizationAudit,
    skill_catalog: buildSkillCatalog(actionCatalog),
    ...runtimeSurfaces,
    source_provenance: {
      surface_kind: 'source_provenance',
      summary: 'OMA descriptor entry is generated by OPL from standard repo contracts, not by a repo-owned wrapper.',
      source_provenance_ref: ref('path', OMA_CONTRACTS.registration, 'registration_contract'),
      historical_fixture_ref: null,
      explicit_archive_import_ref: null,
      parity_oracle_ref: null,
      authority_boundary: ['opl_descriptor_projection_only', 'domain_truth_stays_with_opl_meta_agent'],
      capability_classification: 'opl_hosted_refs_only_descriptor_adapter',
      recommended_audit_command: 'opl agents descriptor --domain opl-meta-agent --json',
    },
    notes: [
      'OMA joins the unified descriptor index through an OPL-hosted standard-contract adapter.',
      'The adapter does not create or require a repo-owned generic manifest CLI, MCP, skill, product-entry, status, or workbench wrapper.',
    ],
  };
}

function buildOplMetaAgentDescriptorEntry(
  repoDir: string,
  registry: JsonRecord,
): DomainManifestCatalogEntry {
  const rawManifest = buildRawManifest(repoDir, registry);
  if (!rawManifest) {
    return {
      project_id: OMA_PROJECT_ID,
      project: OMA_PROJECT,
      binding_id: 'opl_hosted_standard_contract_descriptor_adapter',
      workspace_path: repoDir,
      manifest_command: null,
      status: 'invalid_manifest',
      manifest: null,
      error: {
        code: 'invalid_manifest',
        message: 'OPL Meta Agent standard descriptor contracts are incomplete.',
        stdout: null,
        stderr: null,
      },
    };
  }
  return {
    project_id: OMA_PROJECT_ID,
    project: OMA_PROJECT,
    binding_id: 'opl_hosted_standard_contract_descriptor_adapter',
    workspace_path: repoDir,
    manifest_command: null,
    status: 'resolved',
    manifest: normalizeManifest(rawManifest),
    error: null,
  };
}

function resolveOplMetaAgentRepoDir(
  catalog: DomainManifestCatalog,
  repoInputs: StandardDomainAgentRepoInput[],
) {
  return repoDirFromRegistry(catalog.opl_meta_agent_registry ?? {})
    ?? repoInputs.find((entry) => entry.requested_agent_id === OMA_CANONICAL_AGENT_ID)?.repo_dir
    ?? null;
}

export function withOplMetaAgentDescriptorEntry<T extends DomainManifestCatalog>(
  catalog: T,
  repoInputs: StandardDomainAgentRepoInput[] = defaultStandardDomainAgentRepoInputs(),
): T {
  if (catalog.projects.some((entry) =>
    entry.project_id === OMA_PROJECT_ID
    || entry.project === OMA_PROJECT
    || entry.manifest?.target_domain_id === OMA_PROJECT_ID
    || entry.manifest?.domain_entry_contract?.domain_agent_entry_spec?.agent_id === OMA_PROJECT_ID
    || entry.manifest?.domain_entry_contract?.domain_agent_entry_spec?.agent_id === OMA_CANONICAL_AGENT_ID
  )) {
    return catalog;
  }

  const repoDir = resolveOplMetaAgentRepoDir(catalog, repoInputs);
  if (!repoDir) {
    return catalog;
  }
  const registry = catalog.opl_meta_agent_registry ?? {
    repo_dir: repoDir,
    status: 'standard_repo_contracts_resolved',
    summary: {},
  };
  const entry = buildOplMetaAgentDescriptorEntry(repoDir, registry);

  return {
    ...catalog,
    summary: {
      ...catalog.summary,
      total_projects_count: catalog.summary.total_projects_count + 1,
      resolved_count: catalog.summary.resolved_count + (entry.status === 'resolved' ? 1 : 0),
      failed_count: catalog.summary.failed_count + (entry.status === 'resolved' ? 0 : 1),
    },
    projects: [...catalog.projects, entry],
    notes: [
      ...catalog.notes,
      'OPL Meta Agent descriptor is generated from standard repo contracts by an OPL-hosted refs-only descriptor adapter.',
    ],
  };
}
