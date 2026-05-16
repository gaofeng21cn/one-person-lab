import fs from 'node:fs';
import path from 'node:path';

type ScaffoldMode = 'describe' | 'generate' | 'validate';

interface ScaffoldInput {
  targetDir?: string;
  domainId?: string;
  domainLabel?: string;
  force?: boolean;
}

interface ScaffoldValidateInput {
  repoDir: string;
}

interface ScaffoldFile {
  path: string;
  content: string;
}

const REQUIRED_REPO_SOURCE_DIRS = ['agent', 'contracts', 'runtime', 'docs'] as const;
const DOCS_TAXONOMY = [
  'active',
  'public',
  'product',
  'runtime',
  'delivery',
  'source',
  'policies',
  'specs',
  'references',
  'history',
] as const;

const OPL_OWNED_GENERIC_PRIMITIVES = [
  {
    primitive_id: 'scheduler_supervision_cadence',
    owner: 'one-person-lab',
    replacement_surface: 'family_scheduler_replacement',
    domain_policy: 'consume_or_project_refs_only',
  },
  {
    primitive_id: 'provider_slo_and_wakeup_transport',
    owner: 'one-person-lab',
    replacement_surface: 'provider_backed_family_runtime',
    domain_policy: 'return_owner_receipt_or_typed_blocker',
  },
  {
    primitive_id: 'queue_attempt_ledger',
    owner: 'one-person-lab',
    replacement_surface: 'family_runtime_queue',
    domain_policy: 'do_not_own_generic_attempt_ledger',
  },
  {
    primitive_id: 'generic_transition_runner',
    owner: 'one-person-lab',
    replacement_surface: 'family_transition_runner',
    domain_policy: 'own_domain_transition_spec_only',
  },
  {
    primitive_id: 'workspace_source_intake_shell',
    owner: 'one-person-lab',
    replacement_surface: 'workspace_source_intake_projection',
    domain_policy: 'own_source_truth_and_readiness_refs',
  },
  {
    primitive_id: 'memory_locator_writeback_transport',
    owner: 'one-person-lab',
    replacement_surface: 'memory_locator_index_projection',
    domain_policy: 'own_memory_body_accept_reject_and_receipts',
  },
  {
    primitive_id: 'artifact_package_lifecycle_shell',
    owner: 'one-person-lab',
    replacement_surface: 'package_export_lifecycle_projection',
    domain_policy: 'own_artifact_body_package_ready_and_export_verdict',
  },
  {
    primitive_id: 'operator_workbench_drilldown_shell',
    owner: 'one-person-lab',
    replacement_surface: 'stage_attempt_workbench',
    domain_policy: 'project_domain_refs_without_rebuilding_workbench',
  },
  {
    primitive_id: 'observability_repair_projection',
    owner: 'one-person-lab',
    replacement_surface: 'observability_slo_projection',
    domain_policy: 'own_domain_blocker_and_safe_repair_hints',
  },
  {
    primitive_id: 'generic_persistence_store',
    owner: 'one-person-lab',
    replacement_surface: 'family_persistence_policy_and_runtime_store',
    domain_policy: 'own_file_authority_or_refs_only_sidecar_index',
  },
  {
    primitive_id: 'runtime_lifecycle_sqlite_index_contract',
    owner: 'one-person-lab',
    replacement_surface: 'family_runtime_lifecycle_index_contract',
    domain_policy: 'do_not_claim_generic_sqlite_persistence_engine',
  },
  {
    primitive_id: 'native_helper_generic_envelope',
    owner: 'one-person-lab',
    replacement_surface: 'native_helper_contract_and_execution_envelope',
    domain_policy: 'own_helper_implementation_only',
  },
  {
    primitive_id: 'review_repair_transport',
    owner: 'one-person-lab',
    replacement_surface: 'family_conflict_blocker_and_repair_projection',
    domain_policy: 'own_domain_review_export_or_quality_decision',
  },
  {
    primitive_id: 'functional_privatization_audit_read_model',
    owner: 'one-person-lab',
    replacement_surface: 'opl_functional_privatization_audit',
    domain_policy: 'declare_module_boundary_without_owning_generic_runtime',
  },
] as const;

const DOMAIN_RETAINED_THIN_SURFACES = [
  'domain_truth',
  'domain_transition_spec',
  'domain_stage_descriptors',
  'domain_action_metadata',
  'quality_or_export_verdict',
  'artifact_authority',
  'memory_body',
  'owner_receipt',
  'typed_blocker',
  'sidecar_or_projection_adapter',
  'domain_entry_and_tests',
] as const;

const FORBIDDEN_DOMAIN_GENERIC_OWNER_ROLES = [
  'generic_scheduler_owner',
  'generic_daemon_owner',
  'generic_lifecycle_owner',
  'generic_queue_owner',
  'generic_attempt_ledger_owner',
  'generic_state_machine_runner_owner',
  'generic_workspace_source_intake_owner',
  'generic_memory_transport_owner',
  'generic_artifact_gallery_owner',
  'generic_operator_workbench_owner',
  'generic_observability_slo_owner',
  'generic_persistence_engine_owner',
  'generic_sqlite_lifecycle_owner',
  'generic_native_helper_envelope_owner',
  'generic_review_repair_transport_owner',
] as const;

const REQUIRED_CONTRACT_SURFACES = [
  'domain_agent_descriptor',
  'product_entry_manifest',
  'stage_control_plane',
  'family_action_catalog',
  'domain_memory_descriptor_locator',
  'artifact_locator_contract',
  'owner_receipt_contract',
  'quality_or_export_gate_refs',
  'physical_skeleton_follow_through',
  'legacy_retirement_tombstone_proof',
  'functional_privatization_audit',
] as const;

const REQUIRED_VERIFICATION = [
  'direct_skill_path_parity',
  'opl_hosted_path_parity',
  'no_forbidden_write',
  'no_active_generic_owner_caller',
  'replacement_or_no_regression_evidence',
  'receipt_ref_reconciliation',
  'git_diff_check',
  'functional_privatization_audit_no_generic_owner',
] as const;

const SCAFFOLD_MARKER = 'generated_by_opl_standard_domain_agent_scaffold_v1';

function normalizeDomainId(value: string | undefined) {
  return (value || 'new-domain-agent')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'new-domain-agent';
}

function domainLabelFromId(domainId: string, label: string | undefined) {
  return label?.trim() || domainId
    .split(/[-_.]+/)
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() || ''}${part.slice(1)}`)
    .join(' ');
}

function buildScaffoldFiles(domainId: string, domainLabel: string): ScaffoldFile[] {
  const json = (payload: unknown) => `${JSON.stringify(payload, null, 2)}\n`;
  return [
    {
      path: 'agent/stages/README.md',
      content: `# ${domainLabel} Stages\n\nOPL-facing stage descriptors live here. Domain stage semantics, quality gates, and owner receipts stay domain-owned.\n`,
    },
    {
      path: 'agent/prompts/README.md',
      content: `# ${domainLabel} Prompts\n\nPrompt bodies remain domain-owned. OPL may reference prompt locators but does not copy domain truth or memory body.\n`,
    },
    {
      path: 'agent/skills/README.md',
      content: `# ${domainLabel} Skills\n\nDeclare direct domain skill entry points here and keep direct path parity with OPL-hosted invocation receipts.\n`,
    },
    {
      path: 'agent/knowledge/README.md',
      content: `# ${domainLabel} Knowledge\n\nStore knowledge locators and policies here. Runtime memory bodies belong in the workspace/runtime memory root, not in OPL state.\n`,
    },
    {
      path: 'agent/quality_gates/README.md',
      content: `# ${domainLabel} Quality Gates\n\nQuality, readiness, and export verdicts are owned by this domain agent. OPL only projects refs and receipts.\n`,
    },
    {
      path: 'contracts/domain_descriptor.json',
      content: json({
        surface_kind: 'domain_agent_descriptor',
        schema_version: 1,
        domain_id: domainId,
        domain_label: domainLabel,
        marker: SCAFFOLD_MARKER,
        authority_boundary: {
          opl_can_write_domain_truth: false,
          opl_can_write_memory_body: false,
          opl_can_authorize_quality_or_export: false,
          domain_owns_truth_quality_artifact_memory_and_receipts: true,
        },
      }),
    },
    {
      path: 'contracts/stage_control_plane.json',
      content: json({
        surface_kind: 'stage_control_plane',
        schema_version: 1,
        domain_id: domainId,
        stages: [],
        marker: SCAFFOLD_MARKER,
      }),
    },
    {
      path: 'contracts/action_catalog.json',
      content: json({
        surface_kind: 'family_action_catalog',
        schema_version: 1,
        domain_id: domainId,
        actions: [],
        forbidden_generic_owner_roles: FORBIDDEN_DOMAIN_GENERIC_OWNER_ROLES,
        marker: SCAFFOLD_MARKER,
      }),
    },
    {
      path: 'contracts/memory_descriptor.json',
      content: json({
        surface_kind: 'domain_memory_descriptor_locator',
        schema_version: 1,
        domain_id: domainId,
        memory_body_owner: domainId,
        opl_projection_policy: 'locator_and_receipt_refs_only',
        marker: SCAFFOLD_MARKER,
      }),
    },
    {
      path: 'contracts/artifact_locator_contract.json',
      content: json({
        surface_kind: 'artifact_locator_contract',
        schema_version: 1,
        domain_id: domainId,
        canonical_artifact_authority: domainId,
        opl_projection_policy: 'locator_lifecycle_and_receipt_refs_only',
        marker: SCAFFOLD_MARKER,
      }),
    },
    {
      path: 'contracts/owner_receipt_contract.json',
      content: json({
        surface_kind: 'owner_receipt_contract',
        schema_version: 1,
        domain_id: domainId,
        allowed_receipt_classes: [
          'owner_receipt',
          'typed_blocker',
          'no_regression_evidence',
          'memory_writeback_receipt',
          'artifact_lifecycle_receipt',
        ],
        forbidden_claims: [
          'opl_authorized_domain_ready',
          'opl_authorized_quality_or_export_verdict',
          'opl_wrote_domain_truth',
          'opl_wrote_memory_body',
        ],
        marker: SCAFFOLD_MARKER,
      }),
    },
    {
      path: 'contracts/functional_privatization_audit.json',
      content: json({
        surface_kind: 'functional_privatization_audit',
        schema_version: 1,
        domain_id: domainId,
        marker: SCAFFOLD_MARKER,
        classification_policy: 'domain_declares_non_knowledge_functional_modules_for_opl_unified_audit',
        opl_owned_replacement_surfaces: OPL_OWNED_GENERIC_PRIMITIVES.map((primitive) => primitive.primitive_id),
        domain_allowed_roles: DOMAIN_RETAINED_THIN_SURFACES,
        forbidden_generic_owner_roles: FORBIDDEN_DOMAIN_GENERIC_OWNER_ROLES,
        modules: [],
        authority_boundary: {
          opl_can_write_domain_truth: false,
          opl_can_write_memory_body: false,
          opl_can_authorize_quality_or_export: false,
          domain_can_claim_generic_runtime_owner: false,
        },
      }),
    },
    {
      path: 'runtime/sidecar/README.md',
      content: `# ${domainLabel} Runtime Sidecar\n\nExpose thin sidecar/projection adapters here. Do not implement a generic scheduler, daemon, queue, attempt ledger, transition runner, workbench, or memory transport in this repo.\n`,
    },
    {
      path: 'runtime/projection_builders/README.md',
      content: `# ${domainLabel} Projection Builders\n\nBuild domain-owned projections and owner receipt refs for OPL to read. Keep artifact bodies and memory bodies out of OPL state.\n`,
    },
    {
      path: 'runtime/lifecycle_adapters/README.md',
      content: `# ${domainLabel} Lifecycle Adapters\n\nDomain lifecycle adapters return owner receipts or typed blockers. OPL owns the generic lifecycle shell only.\n`,
    },
    {
      path: 'docs/project.md',
      content: `# ${domainLabel}\n\nOwner: \`${domainId}\`\nPurpose: \`domain_agent_project_overview\`\nState: \`scaffolded\`\nMachine boundary: human-readable project overview; machine truth belongs in contracts and runtime receipts.\n`,
    },
    {
      path: 'docs/status.md',
      content: `# ${domainLabel} Status\n\nCurrent state: scaffolded domain authority pack with thin program surface. Production evidence must come from domain-owned receipts and focused OPL-hosted/direct parity verification.\n`,
    },
    {
      path: 'docs/architecture.md',
      content: `# ${domainLabel} Architecture\n\nThis repo owns domain truth, quality/export verdicts, artifact authority, memory body, and owner receipts. OPL owns generic runtime, queue, attempt ledger, transition runner, memory locator transport, artifact lifecycle shell, workbench, and observability projection.\n`,
    },
    {
      path: 'docs/invariants.md',
      content: `# ${domainLabel} Invariants\n\n- Do not store runtime artifacts in repo source.\n- Do not implement generic OPL runtime primitives in this domain repo.\n- Do not let OPL write domain truth, memory body, or quality/export verdicts.\n`,
    },
    {
      path: 'docs/decisions.md',
      content: `# ${domainLabel} Decisions\n\n- Adopt OPL standard domain-agent scaffold v1.\n- Keep this repo as a domain authority pack plus thin program surface.\n`,
    },
  ];
}

function plannedWrites(targetDir: string, files: ScaffoldFile[]) {
  return files.map((file) => {
    const absolute_path = path.resolve(targetDir, file.path);
    return {
      path: file.path,
      absolute_path,
      exists: fs.existsSync(absolute_path),
    };
  });
}

function writeScaffoldFiles(targetDir: string, files: ScaffoldFile[], force: boolean) {
  const writes = [];
  for (const file of files) {
    const targetPath = path.resolve(targetDir, file.path);
    if (fs.existsSync(targetPath) && !force) {
      writes.push({
        path: file.path,
        absolute_path: targetPath,
        status: 'skipped_existing',
      });
      continue;
    }
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, file.content, 'utf8');
    writes.push({
      path: file.path,
      absolute_path: targetPath,
      status: 'written',
    });
  }
  return writes;
}

function buildWriteSummary(writes: Array<{ status: string }>, force: boolean) {
  return {
    written_count: writes.filter((write) => write.status === 'written').length,
    skipped_existing_count: writes.filter((write) => write.status === 'skipped_existing').length,
    force,
  };
}

function readJsonFile(filePath: string) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

export function validateStandardDomainAgentScaffold(input: ScaffoldValidateInput) {
  const repoDir = path.resolve(input.repoDir);
  const missingRequiredDirs = REQUIRED_REPO_SOURCE_DIRS.filter((dir) => !fs.existsSync(path.join(repoDir, dir)));
  const forbiddenPresentDirs = ['artifacts'].filter((dir) => fs.existsSync(path.join(repoDir, dir)));
  const requiredContractFiles = [
    'contracts/domain_descriptor.json',
    'contracts/stage_control_plane.json',
    'contracts/action_catalog.json',
    'contracts/memory_descriptor.json',
    'contracts/artifact_locator_contract.json',
    'contracts/owner_receipt_contract.json',
    'contracts/functional_privatization_audit.json',
  ];
  const missingContractFiles = requiredContractFiles.filter((file) => !fs.existsSync(path.join(repoDir, file)));
  const actionCatalog = readJsonFile(path.join(repoDir, 'contracts/action_catalog.json'));
  const forbiddenRoles = Array.isArray(actionCatalog?.forbidden_generic_owner_roles)
    ? actionCatalog.forbidden_generic_owner_roles
    : [];
  const missingForbiddenRoleGuards = FORBIDDEN_DOMAIN_GENERIC_OWNER_ROLES.filter((role) => !forbiddenRoles.includes(role));
  const descriptor = readJsonFile(path.join(repoDir, 'contracts/domain_descriptor.json'));
  const authority = descriptor?.authority_boundary || {};
  const authorityViolations = [
    authority.opl_can_write_domain_truth === false ? null : 'opl_can_write_domain_truth_must_be_false',
    authority.opl_can_write_memory_body === false ? null : 'opl_can_write_memory_body_must_be_false',
    authority.opl_can_authorize_quality_or_export === false ? null : 'opl_can_authorize_quality_or_export_must_be_false',
  ].filter(Boolean);
  const blockers = [
    ...missingRequiredDirs.map((item) => `missing_required_dir:${item}`),
    ...forbiddenPresentDirs.map((item) => `forbidden_source_dir_present:${item}`),
    ...missingContractFiles.map((item) => `missing_contract:${item}`),
    ...missingForbiddenRoleGuards.map((item) => `missing_forbidden_role_guard:${item}`),
    ...authorityViolations,
  ];
  return {
    version: 'g2',
    standard_domain_agent_scaffold_validation: {
      surface_kind: 'opl_standard_domain_agent_scaffold_validation',
      repo_dir: repoDir,
      status: blockers.length === 0 ? 'passed' : 'blocked',
      scaffold_ref: 'contracts/opl-framework/standard-domain-agent-skeleton-contract.json',
      required_dirs: REQUIRED_REPO_SOURCE_DIRS,
      missing_required_dirs: missingRequiredDirs,
      forbidden_dirs_present: forbiddenPresentDirs,
      required_contract_files: requiredContractFiles,
      missing_contract_files: missingContractFiles,
      missing_forbidden_role_guards: missingForbiddenRoleGuards,
      authority_violations: authorityViolations,
      functional_privatization_audit_required: true,
      blockers,
      authority_boundary: {
        opl_can_write_domain_truth: false,
        opl_can_write_memory_body: false,
        opl_can_authorize_domain_quality_or_export: false,
        opl_can_execute_domain_repo_delete: false,
      },
    },
  };
}

export function buildStandardDomainAgentScaffoldValidation(input: ScaffoldValidateInput) {
  const validation = validateStandardDomainAgentScaffold(input).standard_domain_agent_scaffold_validation;
  return {
    version: 'g2',
    standard_domain_agent_scaffold: {
      surface_kind: 'opl_standard_domain_agent_scaffold',
      version: 'standard-domain-agent-scaffold.v1',
      scaffold_id: 'opl.standard_domain_agent.scaffold.v1',
      owner: 'one-person-lab',
      state: validation.status === 'passed' ? 'validated' : 'validation_blocked',
      mode: 'validate' as ScaffoldMode,
      validation,
      authority_boundary: {
        opl: 'framework_runtime_development_primitives_contracts_read_models_projection_and_checklist_owner',
        domain_agent: 'domain_truth_quality_export_artifact_memory_body_and_owner_receipt_authority',
        opl_can_write_domain_truth: false,
        opl_can_write_memory_body: false,
        opl_can_authorize_domain_quality_or_export: false,
        domain_can_own_generic_scheduler_or_queue: false,
      },
    },
  };
}

function buildGenericPrimitiveCompletion() {
  return {
    surface_kind: 'opl_framework_generic_primitive_completion',
    owner: 'one-person-lab',
    status: 'functional_surfaces_available_production_evidence_pending',
    completed_functional_surfaces: OPL_OWNED_GENERIC_PRIMITIVES.map((primitive) => ({
      ...primitive,
      completion_state: 'framework_surface_available',
    })),
    remaining_evidence_gates: [
      'long_running_provider_slo_window',
      'real_domain_owner_chain_scaleout',
      'accepted_rejected_memory_writeback_receipts_at_scale',
      'artifact_lifecycle_receipts_at_scale',
      'operator_app_drilldown_production_use',
    ],
    authority_boundary: {
      framework_surface_complete_does_not_authorize_domain_ready: true,
      opl_can_write_domain_truth: false,
      opl_can_write_memory_body: false,
      opl_can_authorize_quality_or_export: false,
    },
  };
}

export function buildStandardDomainAgentScaffold(input: ScaffoldInput = {}) {
  const domainId = normalizeDomainId(input.domainId);
  const domainLabel = domainLabelFromId(domainId, input.domainLabel);
  const templateFiles = buildScaffoldFiles(domainId, domainLabel);
  const targetDir = input.targetDir ? path.resolve(input.targetDir) : null;
  const mode: ScaffoldMode = targetDir ? 'generate' : 'describe';
  const writePlan = targetDir ? plannedWrites(targetDir, templateFiles) : [];
  const writes = targetDir ? writeScaffoldFiles(targetDir, templateFiles, input.force === true) : [];
  return {
    version: 'g2',
    standard_domain_agent_scaffold: {
      surface_kind: 'opl_standard_domain_agent_scaffold',
      version: 'standard-domain-agent-scaffold.v1',
      scaffold_id: 'opl.standard_domain_agent.scaffold.v1',
      owner: 'one-person-lab',
      state: targetDir ? 'template_generated' : 'template_contract_available',
      contract_ref: 'contracts/opl-framework/standard-domain-agent-skeleton-contract.json',
      generation_policy: {
        scaffold_command_is_read_only: targetDir === null,
        creates_files: targetDir !== null,
        default_mode: 'describe_without_target_dir',
        write_requires_explicit_target_dir: true,
        template_source_of_truth: 'contracts/opl-framework/standard-domain-agent-skeleton-contract.json',
        copy_existing_domain_repo_as_template: false,
      },
      mode,
      target_dir: targetDir,
      domain_id: domainId,
      domain_label: domainLabel,
      repo_source_boundary: {
        required_dirs: REQUIRED_REPO_SOURCE_DIRS,
        forbidden_dirs: ['artifacts'],
        runtime_artifacts_live_in_source_repo: false,
        real_artifact_roots_are_locators: true,
      },
      docs_taxonomy: DOCS_TAXONOMY,
      required_contract_surfaces: REQUIRED_CONTRACT_SURFACES,
      opl_owned_generic_primitives: OPL_OWNED_GENERIC_PRIMITIVES,
      domain_retained_thin_surfaces: DOMAIN_RETAINED_THIN_SURFACES,
      forbidden_domain_generic_owner_roles: FORBIDDEN_DOMAIN_GENERIC_OWNER_ROLES,
      retirement_gate: {
        surface_kind: 'opl_legacy_retirement_gate_checklist',
        required_evidence: [
          'replacement_contract_available',
          'active_callers_migrated',
          'no_active_default_caller',
          'direct_and_opl_hosted_parity',
          'provenance_or_history_tombstone',
          'no_retained_legacy_compatibility_entry',
        ],
        delete_policy: 'delete_or_history_tombstone_only',
        opl_can_execute_domain_repo_delete: false,
      },
      functional_privatization_audit_contract: {
        surface_kind: 'opl_functional_privatization_audit_contract',
        version: 'opl-functional-privatization-audit.v1',
        owner: 'one-person-lab',
        accepted_source_fields: [
          'functional_privatization_audit',
          'privatized_functional_module_audit',
          'functional_consumer_boundary',
          'mag_consumer_thinning_contract.privatized_functional_module_audit',
          'runtime_framework.rca_thin_surface_policy.privatized_functional_module_audit',
        ],
        migration_classes: [
          'opl_owned_replacement',
          'domain_thin_adapter',
          'domain_authority',
          'retire_tombstone',
        ],
        audit_policy: 'OPL indexes module boundaries and replacement expectations without taking domain truth authority.',
      },
      required_verification: REQUIRED_VERIFICATION,
      template_files: templateFiles.map((file) => file.path),
      write_plan: writePlan,
      writes,
      write_summary: buildWriteSummary(writes, input.force === true),
      generic_primitive_completion: buildGenericPrimitiveCompletion(),
      authority_boundary: {
        opl: 'framework_runtime_development_primitives_contracts_read_models_projection_and_checklist_owner',
        domain_agent: 'domain_truth_quality_export_artifact_memory_body_and_owner_receipt_authority',
        opl_can_write_domain_truth: false,
        opl_can_write_memory_body: false,
        opl_can_authorize_domain_quality_or_export: false,
        domain_can_own_generic_scheduler_or_queue: false,
      },
    },
  };
}
