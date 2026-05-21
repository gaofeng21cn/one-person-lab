import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  AGENT_PACK_CONTRACT,
  DECLARATIVE_DOMAIN_PACK,
  DOCS_TAXONOMY,
  DOMAIN_RETAINED_THIN_SURFACES_DEPRECATED,
  FORBIDDEN_AGENT_PACK_TEXT,
  FORBIDDEN_DOMAIN_GENERIC_OWNER_ROLES,
  GENERATED_SURFACE_CONTRACT,
  MINIMAL_AUTHORITY_FUNCTIONS,
  OPL_GENERATED_SURFACES,
  OPL_OWNED_GENERIC_PRIMITIVES,
  PACK_COMPILER_CONTRACT,
  PRIVATE_FUNCTIONAL_SURFACE_ADMISSION_POLICY,
  REQUIRED_AGENT_PACK_SECTIONS,
  REQUIRED_CONTRACT_SURFACES,
  REQUIRED_REPO_SOURCE_DIRS,
  REQUIRED_VERIFICATION,
  STANDARD_AGENT_DEFAULT_RUNTIME_POLICY,
  WORKSPACE_FILE_LIFECYCLE_POLICY,
} from './standard-domain-agent-scaffold-constants.ts';
import {
  buildScaffoldFiles,
  type ScaffoldFile,
} from './standard-domain-agent-scaffold-template.ts';
import {
  requiresStagePackV2,
  validateStagePackV2,
} from './standard-domain-agent-stage-pack-v2.ts';

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

function readOptionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => readOptionalString(entry))
    .filter((entry): entry is string => Boolean(entry));
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readRecordArray(value: unknown) {
  return Array.isArray(value) ? value.filter(isPlainRecord) : [];
}

function recordValue(value: unknown): Record<string, unknown> {
  return isPlainRecord(value) ? value : {};
}

function numberValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function refValues(refs: unknown) {
  return readRecordArray(refs).flatMap((ref) => {
    const raw = ref.ref;
    if (Array.isArray(raw)) {
      return readStringArray(raw);
    }
    return readOptionalString(raw) ? [readOptionalString(raw)!] : [];
  });
}

function resolvePackRoot(value: unknown) {
  const rawRoot =
    readOptionalString(value)
    ?? (isPlainRecord(value) ? readOptionalString(value.path) : null)
    ?? 'agent/';
  const withSlash = rawRoot.endsWith('/') ? rawRoot : `${rawRoot}/`;
  return withSlash.replace(/^\.?\//, '');
}

function isInsideRepo(relativePath: string) {
  return relativePath
    && !path.isAbsolute(relativePath)
    && !relativePath.split(/[\\/]+/).includes('..');
}

function readPackFileStatus(repoDir: string, relativePath: string) {
  if (!isInsideRepo(relativePath)) {
    return {
      path: relativePath,
      status: 'blocked_path_outside_repo',
    };
  }
  const absolutePath = path.join(repoDir, relativePath);
  if (!fs.existsSync(absolutePath)) {
    return {
      path: relativePath,
      status: 'missing',
    };
  }
  const stat = fs.statSync(absolutePath);
  if (!stat.isFile()) {
    return {
      path: relativePath,
      status: 'not_file',
    };
  }
  const text = fs.readFileSync(absolutePath, 'utf8').trim();
  if (!text) {
    return {
      path: relativePath,
      status: 'empty',
    };
  }
  if (FORBIDDEN_AGENT_PACK_TEXT.test(text)) {
    return {
      path: relativePath,
      status: 'blocked_placeholder_marker',
    };
  }
  return {
    path: relativePath,
    status: 'ok',
  };
}

function readStageAgentRefStatus(repoDir: string, relativePath: string) {
  if (!isInsideRepo(relativePath)) {
    return {
      path: relativePath,
      status: 'blocked_path_outside_repo',
    };
  }
  const absolutePath = path.join(repoDir, relativePath);
  if (!fs.existsSync(absolutePath)) {
    return {
      path: relativePath,
      status: 'missing',
    };
  }
  const stat = fs.statSync(absolutePath);
  if (stat.isDirectory()) {
    const normalized = relativePath.endsWith('/') ? relativePath : `${relativePath}/`;
    return normalized === 'agent/'
      ? {
        path: relativePath,
        status: 'ok',
        ref_kind: 'pack_root_directory',
      }
      : {
        path: relativePath,
        status: 'not_file',
      };
  }
  return readPackFileStatus(repoDir, relativePath);
}

function listedPackPaths(packCompilerInput: unknown) {
  if (!isPlainRecord(packCompilerInput)) {
    return [];
  }
  const direct = readStringArray(packCompilerInput.required_domain_pack_paths);
  const sourceRefs = isPlainRecord(packCompilerInput.source_refs) ? packCompilerInput.source_refs : {};
  return [...new Set([
    ...direct,
    ...readStringArray(sourceRefs.required_domain_pack_paths),
  ])];
}

function readCanonicalPackRoot(packCompilerInput: unknown) {
  if (!isPlainRecord(packCompilerInput)) {
    return null;
  }
  return readOptionalString(packCompilerInput.canonical_semantic_pack_root);
}

function legacyPackRootFields(packCompilerInput: unknown) {
  if (!isPlainRecord(packCompilerInput)) {
    return [];
  }
  return [
    ['canonical_repo_source_semantic_pack_root', packCompilerInput.canonical_repo_source_semantic_pack_root],
    ['domain_pack_root', packCompilerInput.domain_pack_root],
    ['canonical_repo_source_semantic_pack', packCompilerInput.canonical_repo_source_semantic_pack],
  ]
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([field]) => field);
}

function discoverPackFiles(repoDir: string, packRoot: string) {
  const rootPath = path.join(repoDir, packRoot);
  if (!fs.existsSync(rootPath) || !fs.statSync(rootPath).isDirectory()) {
    return [];
  }
  const files: string[] = [];
  const visit = (current: string) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolutePath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        visit(absolutePath);
      } else if (entry.isFile()) {
        files.push(path.relative(repoDir, absolutePath).split(path.sep).join('/'));
      }
    }
  };
  visit(rootPath);
  return files.sort();
}

function validateAgentPackFiles(repoDir: string, packCompilerInput: unknown) {
  const canonicalPackRoot = readCanonicalPackRoot(packCompilerInput);
  const packRoot = resolvePackRoot(canonicalPackRoot);
  const listedPaths = listedPackPaths(packCompilerInput);
  const discoveredPaths = discoverPackFiles(repoDir, packRoot);
  const semanticListedPaths = listedPaths.filter((item) => item.startsWith(packRoot) && !item.endsWith('/README.md'));
  const readmeListedPaths = listedPaths.filter((item) => item.endsWith('/README.md') || item === 'README.md');
  const packFileStatus = listedPaths.map((item) => readPackFileStatus(repoDir, item));
  const sectionStatus = REQUIRED_AGENT_PACK_SECTIONS.map(({ section, prefix }) => {
    const semanticFiles = discoveredPaths.filter((file) => file.startsWith(prefix) && !file.endsWith('/README.md'));
    return {
      section,
      prefix,
      semantic_file_count: semanticFiles.length,
      status: semanticFiles.length > 0 ? 'ok' : 'missing_semantic_file',
    };
  });
  return {
    pack_root: packRoot,
    listed_paths: listedPaths,
    semantic_listed_path_count: semanticListedPaths.length,
    readme_listed_path_count: readmeListedPaths.length,
    discovered_path_count: discoveredPaths.length,
    pack_file_status: packFileStatus,
    section_status: sectionStatus,
    blockers: [
      canonicalPackRoot === 'agent/' ? null : 'pack_compiler_canonical_semantic_pack_root_must_be_agent_slash',
      ...legacyPackRootFields(packCompilerInput).map((field) => `pack_compiler_legacy_pack_root_field:${field}`),
      ...readmeListedPaths.map((item) => `required_domain_pack_path_must_not_be_readme:${item}`),
      fs.existsSync(path.join(repoDir, packRoot)) ? null : `missing_agent_pack_root:${packRoot}`,
      semanticListedPaths.length > 0 ? null : 'missing_required_domain_pack_paths',
      ...packFileStatus
        .filter((item) => item.status !== 'ok')
        .map((item) => `invalid_domain_pack_path:${item.path}:${item.status}`),
      ...sectionStatus
        .filter((item) => item.status !== 'ok')
        .map((item) => `missing_agent_pack_section:${item.section}`),
    ].filter((entry): entry is string => Boolean(entry)),
  };
}

function refIncludesRepoPack(refs: unknown, prefix: string) {
  return refValues(refs).some((value) => value.startsWith(prefix));
}

function validateStageRefs(repoDir: string, stageControlPlane: unknown) {
  const stages = isPlainRecord(stageControlPlane) ? readRecordArray(stageControlPlane.stages) : [];
  const stageStatuses = stages.map((stage) => {
    const stageId = readOptionalString(stage.stage_id) ?? 'unknown_stage';
    const checks = [
      {
        field: 'prompt_refs',
        status: refIncludesRepoPack(stage.prompt_refs, 'agent/prompts/') ? 'ok' : 'missing_agent_prompt_ref',
      },
      {
        field: 'skills',
        status: refValues(stage.skills).length > 0 ? 'ok' : 'missing_skill_ref',
      },
      {
        field: 'knowledge_refs',
        status: refIncludesRepoPack(stage.knowledge_refs, 'agent/knowledge/') ? 'ok' : 'missing_agent_knowledge_ref',
      },
      {
        field: 'evaluation',
        status: refIncludesRepoPack(stage.evaluation, 'agent/quality_gates/') ? 'ok' : 'missing_agent_quality_gate_ref',
      },
    ];
    const referencedAgentFiles = [
      ...refValues(stage.prompt_refs),
      ...refValues(stage.skills),
      ...refValues(stage.knowledge_refs),
      ...refValues(stage.evaluation),
      ...refValues(stage.source_refs),
    ].filter((value) => value.startsWith('agent/'));
    const fileStatuses = [...new Set(referencedAgentFiles)]
      .map((item) => readStageAgentRefStatus(repoDir, item));
    return {
      stage_id: stageId,
      checks,
      referenced_agent_files: referencedAgentFiles,
      file_status: fileStatuses,
      blockers: [
        ...checks
          .filter((check) => check.status !== 'ok')
          .map((check) => `stage_missing_${check.field}:${stageId}:${check.status}`),
        ...fileStatuses
          .filter((item) => item.status !== 'ok')
          .map((item) => `stage_invalid_agent_ref:${stageId}:${item.path}:${item.status}`),
      ],
    };
  });
  return {
    stage_count: stages.length,
    stage_statuses: stageStatuses,
    blockers: [
      stages.length > 0 ? null : 'missing_stage_control_plane_stages',
      ...stageStatuses.flatMap((stage) => stage.blockers),
    ].filter((entry): entry is string => Boolean(entry)),
  };
}

export function validateStandardDomainAgentScaffold(input: ScaffoldValidateInput) {
  const repoDir = path.resolve(input.repoDir);
  const missingRequiredDirs = REQUIRED_REPO_SOURCE_DIRS.filter((dir) => !fs.existsSync(path.join(repoDir, dir)));
  const forbiddenPresentDirs = ['artifacts'].filter((dir) => fs.existsSync(path.join(repoDir, dir)));
  const requiredContractFiles = [
    'contracts/domain_descriptor.json',
    'contracts/pack_compiler_input.json',
    'contracts/generated_surface_handoff.json',
    'contracts/stage_control_plane.json',
    'contracts/action_catalog.json',
    'contracts/memory_descriptor.json',
    'contracts/artifact_locator_contract.json',
    'contracts/owner_receipt_contract.json',
    'contracts/functional_privatization_audit.json',
    'contracts/private_functional_surface_policy.json',
    'contracts/workspace_lifecycle_policy.json',
  ];
  const missingContractFiles = requiredContractFiles.filter((file) => !fs.existsSync(path.join(repoDir, file)));
  const actionCatalog = readJsonFile(path.join(repoDir, 'contracts/action_catalog.json'));
  const forbiddenRoles = Array.isArray(actionCatalog?.forbidden_generic_owner_roles)
    ? actionCatalog.forbidden_generic_owner_roles
    : [];
  const missingForbiddenRoleGuards = FORBIDDEN_DOMAIN_GENERIC_OWNER_ROLES.filter((role) => !forbiddenRoles.includes(role));
  const descriptor = readJsonFile(path.join(repoDir, 'contracts/domain_descriptor.json'));
  const authority = descriptor?.authority_boundary || {};
  const packCompilerInput = readJsonFile(path.join(repoDir, 'contracts/pack_compiler_input.json'));
  const generatedSurfaceHandoff = readJsonFile(path.join(repoDir, 'contracts/generated_surface_handoff.json'));
  const stageControlPlane = readJsonFile(path.join(repoDir, 'contracts/stage_control_plane.json'));
  const stagePackV2Required = requiresStagePackV2(packCompilerInput, stageControlPlane);
  const agentPackValidation = validateAgentPackFiles(repoDir, packCompilerInput);
  const stageRefValidation = validateStageRefs(repoDir, stageControlPlane);
  const stagePackV2Validation = validateStagePackV2(stageControlPlane, packCompilerInput, stagePackV2Required);
  const authorityViolations = [
    authority.opl_can_write_domain_truth === false ? null : 'opl_can_write_domain_truth_must_be_false',
    authority.opl_can_write_memory_body === false ? null : 'opl_can_write_memory_body_must_be_false',
    authority.opl_can_authorize_quality_or_export === false ? null : 'opl_can_authorize_quality_or_export_must_be_false',
    packCompilerInput?.generated_surface_owner === 'one-person-lab'
      ? null
      : 'pack_compiler_generated_surface_owner_must_be_opl',
    packCompilerInput?.domain_repo_can_own_generated_surface === false
      ? null
      : 'pack_compiler_domain_repo_generated_surface_owner_must_be_false',
    generatedSurfaceHandoff?.generated_surface_owner === 'one-person-lab'
      ? null
      : 'generated_surface_handoff_owner_must_be_opl',
    generatedSurfaceHandoff?.domain_repo_can_own_generated_surface === false
      ? null
      : 'generated_surface_handoff_domain_owner_must_be_false',
  ].filter(Boolean);
  const blockers = [
    ...missingRequiredDirs.map((item) => `missing_required_dir:${item}`),
    ...forbiddenPresentDirs.map((item) => `forbidden_source_dir_present:${item}`),
    ...missingContractFiles.map((item) => `missing_contract:${item}`),
    ...missingForbiddenRoleGuards.map((item) => `missing_forbidden_role_guard:${item}`),
    ...authorityViolations,
    ...agentPackValidation.blockers,
    ...stageRefValidation.blockers,
    ...stagePackV2Validation.blockers,
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
      agent_pack_validation: agentPackValidation,
      stage_ref_validation: stageRefValidation,
      stage_pack_v2_validation: stagePackV2Validation,
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

function countStageChecks(stageRefValidation: unknown, field: string) {
  return readRecordArray(recordValue(stageRefValidation).stage_statuses)
    .filter((stage) => readRecordArray(stage.checks)
      .some((check) => check.field === field && check.status === 'ok'))
    .length;
}

function countStagePackBindings(stagePackV2Validation: unknown, predicate: (stage: Record<string, unknown>) => boolean) {
  return readRecordArray(recordValue(stagePackV2Validation).stage_statuses)
    .filter(predicate)
    .length;
}

function buildScaffoldConsumptionRefs(input: {
  mode: ScaffoldMode | 'consumption_evidence';
  domainId: string;
  targetDir?: string | null;
  templateFileCount?: number;
  writtenCount?: number;
  validation?: Record<string, unknown> | null;
  ephemeralTargetRemoved?: boolean;
}) {
  const validation = input.validation ?? null;
  const agentPackValidation = validation ? recordValue(validation.agent_pack_validation) : {};
  const stageRefValidation = validation ? recordValue(validation.stage_ref_validation) : {};
  const stagePackV2Validation = validation ? recordValue(validation.stage_pack_v2_validation) : {};
  const blockers = validation ? readStringArray(validation.blockers) : [];
  const validationStatus = validation ? readOptionalString(validation.status) : null;
  const status = validation
    ? (validationStatus === 'passed' ? 'validated_template_consumed' : 'validation_blocked')
    : input.mode === 'generate'
      ? 'generated_template_pending_validation'
      : 'describe_only_no_generated_repo_consumed';
  const selectedExecutorBindingObservedCount = countStagePackBindings(
    stagePackV2Validation,
    (stage) => Boolean(readOptionalString(stage.selected_executor_kind)),
  );
  const defaultCodexExecutorBindingCount = countStagePackBindings(
    stagePackV2Validation,
    (stage) =>
      readOptionalString(stage.selected_executor_kind) === 'codex_cli'
      && readOptionalString(stage.executor_binding_ref) === 'default_codex_cli',
  );

  return {
    surface_kind: 'opl_standard_agent_template_consumption_refs',
    owner: 'one-person-lab',
    evidence_role: 'refs_only_new_agent_template_consumption',
    status,
    mode: input.mode,
    domain_id: input.domainId,
    scaffold_ref: 'contracts/opl-framework/standard-domain-agent-skeleton-contract.json',
    source_command:
      input.mode === 'consumption_evidence'
        ? 'opl agents scaffold --consumption-evidence'
        : input.mode === 'validate'
          ? 'opl agents scaffold --validate <repo-dir>'
          : input.mode === 'generate'
            ? 'opl agents scaffold --target-dir <target-dir>'
            : 'opl agents scaffold',
    next_verification_command: input.ephemeralTargetRemoved === true
      ? 'opl agents scaffold --consumption-evidence'
      : input.targetDir
        ? `opl agents scaffold --validate ${input.targetDir}`
        : 'opl agents scaffold --target-dir <tmp-new-agent> && opl agents scaffold --validate <tmp-new-agent>',
    target_dir_ref: input.targetDir ?? null,
    target_dir_policy: input.ephemeralTargetRemoved === true
      ? 'ephemeral_generated_repo_removed_after_validation'
      : input.targetDir
        ? 'explicit_user_target_dir'
        : 'no_target_dir_in_describe_mode',
    generated_template_file_count: input.templateFileCount ?? 0,
    generated_written_file_count: input.writtenCount ?? 0,
    validation_consumed_generated_repo: Boolean(validation),
    validation_status: validationStatus,
    blocker_count: blockers.length,
    blockers,
    consumed_pack_path_count: numberValue(agentPackValidation.semantic_listed_path_count),
    consumed_pack_discovered_path_count: numberValue(agentPackValidation.discovered_path_count),
    consumed_stage_count: numberValue(stageRefValidation.stage_count),
    prompt_ref_resolved_stage_count: countStageChecks(stageRefValidation, 'prompt_refs'),
    skill_ref_resolved_stage_count: countStageChecks(stageRefValidation, 'skills'),
    knowledge_ref_resolved_stage_count: countStageChecks(stageRefValidation, 'knowledge_refs'),
    quality_gate_ref_resolved_stage_count: countStageChecks(stageRefValidation, 'evaluation'),
    selected_executor_binding_observed_count: selectedExecutorBindingObservedCount,
    default_codex_executor_binding_count: defaultCodexExecutorBindingCount,
    generated_surface_owner_verified: validation
      ? !readStringArray(validation.authority_violations).some((violation) =>
        violation.includes('generated_surface')
      )
      : false,
    private_surface_policy_guarded: validation
      ? readStringArray(validation.missing_forbidden_role_guards).length === 0
      : false,
    stage_pack_v2_status: readOptionalString(stagePackV2Validation.status),
    app_operator_consumable: true,
    app_operator_projection_ref: '/app_operator_drilldown/standard_agent_template_consumption_refs',
    claim_policy:
      'template_generation_and_validation_evidence_only_no_domain_ready_artifact_authority_or_production_ready_claim',
    authority_boundary: {
      refs_only: true,
      opl_can_write_domain_truth: false,
      opl_can_write_memory_body: false,
      opl_can_mutate_domain_artifact_body: false,
      opl_can_authorize_quality_or_export: false,
      scaffold_validation_can_claim_domain_ready: false,
      scaffold_validation_can_claim_artifact_authority: false,
      scaffold_validation_can_claim_production_ready: false,
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
      declarative_domain_pack: DECLARATIVE_DOMAIN_PACK,
      minimal_authority_functions: MINIMAL_AUTHORITY_FUNCTIONS,
      pack_compiler_contract: PACK_COMPILER_CONTRACT,
      generated_surface_contract: GENERATED_SURFACE_CONTRACT,
      agent_pack_contract: AGENT_PACK_CONTRACT,
      default_runtime_policy: STANDARD_AGENT_DEFAULT_RUNTIME_POLICY,
      opl_generated_surfaces: OPL_GENERATED_SURFACES,
      domain_retained_thin_surfaces: DOMAIN_RETAINED_THIN_SURFACES_DEPRECATED,
      domain_retained_thin_surfaces_deprecated: DOMAIN_RETAINED_THIN_SURFACES_DEPRECATED,
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
        executable_plan_surface: 'family_runtime_lifecycle_apply',
        executable_when: [
          'full_no_active_caller',
          'replacement_parity',
          'provenance_proof',
          'history_or_tombstone',
          'no_retained_legacy_entry',
        ],
        allowed_opl_apply_scopes: [
          'opl_owned_runtime_ref',
          'opl_owned_index_ref',
          'opl_owned_provenance_ref',
          'opl_owned_tombstone_ref',
        ],
        forbidden_apply_scopes: [
          'domain_truth',
          'memory_body',
          'artifact_body',
          'source_repo_active_file',
        ],
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
        module_inventory_fields: [
          'module_id',
          'classification',
          'code_paths',
          'active_callers',
          'active_caller_status',
          'migration_action',
          'retention_reason',
          'cannot_absorb_reason',
          'standardization_layer',
          'standardization_layer_reason',
        ],
        standardization_layers: [
          'standard_domain_pack_inventory',
          'authority_function_inventory',
          'private_platform_residue_inventory',
        ],
        migration_classes: [
          'opl_hosted_surface',
          'opl_generated_surface',
          'declarative_pack',
          'minimal_authority_function',
          'refs_only_domain_adapter',
          'temporary_migration_bridge',
          'diagnostic_cleanup_path',
          'provenance_or_fixture',
        ],
        audit_policy: 'OPL defaults to the attention_required watchlist from structured blockers, migration classes, and active-caller flags; cleared/stable boundary entries stay in the full module inventory for traceability.',
      },
      private_functional_surface_admission_policy: PRIVATE_FUNCTIONAL_SURFACE_ADMISSION_POLICY,
      workspace_file_lifecycle_policy: WORKSPACE_FILE_LIFECYCLE_POLICY,
      required_verification: REQUIRED_VERIFICATION,
      template_files: templateFiles.map((file) => file.path),
      write_plan: writePlan,
      writes,
      write_summary: buildWriteSummary(writes, input.force === true),
      scaffold_consumption_refs: buildScaffoldConsumptionRefs({
        mode,
        domainId,
        targetDir,
        templateFileCount: templateFiles.length,
        writtenCount: writes.filter((write) => write.status === 'written').length,
      }),
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

export function buildStandardDomainAgentTemplateConsumptionReadModel() {
  return {
    surface_kind: 'opl_standard_agent_template_consumption_read_model',
    owner: 'one-person-lab',
    status: 'explicit_proof_command_available',
    projection_policy: 'refs_only_operator_projection_no_implicit_temp_generation',
    proof_command: ['agents', 'scaffold', '--consumption-evidence'],
    proof_command_shell: 'opl agents scaffold --consumption-evidence',
    consumed_surface_refs: [
      'contracts/opl-framework/standard-domain-agent-skeleton-contract.json',
      'contracts/pack_compiler_input.json',
      'contracts/generated_surface_handoff.json',
      'contracts/stage_control_plane.json',
      'agent/prompts/domain_intake.md',
      'agent/skills/domain_execution.md',
      'agent/knowledge/domain_boundary.md',
      'agent/quality_gates/domain_acceptance.md',
    ],
    expected_evidence_fields: [
      'generated_written_file_count',
      'validation_status',
      'consumed_pack_path_count',
      'consumed_stage_count',
      'selected_executor_binding_observed_count',
      'quality_gate_ref_resolved_stage_count',
      'generated_surface_owner_verified',
      'private_surface_policy_guarded',
      'stage_pack_v2_status',
    ],
    summary: {
      proof_command_count: 1,
      app_operator_consumable_ref_count: 1,
      domain_ready_claim_count: 0,
      production_ready_claim_count: 0,
      artifact_authority_claim_count: 0,
    },
    authority_boundary: {
      refs_only: true,
      can_write_domain_truth: false,
      can_write_memory_body: false,
      can_mutate_domain_artifact_body: false,
      can_authorize_quality_or_export: false,
      can_claim_domain_ready: false,
      can_claim_artifact_authority: false,
      can_claim_production_ready: false,
    },
  };
}

export function buildStandardDomainAgentScaffoldConsumptionEvidence(input: ScaffoldInput = {}) {
  const domainId = normalizeDomainId(input.domainId);
  const domainLabel = domainLabelFromId(domainId, input.domainLabel);
  const targetDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-standard-agent-consumption-'));
  try {
    const generated = buildStandardDomainAgentScaffold({
      targetDir,
      domainId,
      domainLabel,
      force: true,
    }).standard_domain_agent_scaffold;
    const validation =
      validateStandardDomainAgentScaffold({ repoDir: targetDir }).standard_domain_agent_scaffold_validation;
    const refs = buildScaffoldConsumptionRefs({
      mode: 'consumption_evidence',
      domainId,
      targetDir,
      templateFileCount: Array.isArray(generated.template_files) ? generated.template_files.length : 0,
      writtenCount: numberValue(recordValue(generated.write_summary).written_count),
      validation,
      ephemeralTargetRemoved: true,
    });
    return {
      version: 'g2',
      standard_domain_agent_template_consumption_evidence: {
        surface_kind: 'opl_standard_agent_template_consumption_evidence',
        owner: 'one-person-lab',
        status: validation.status === 'passed' ? 'passed' : 'blocked',
        proof_kind: 'ephemeral_generate_then_validate_new_agent_skeleton',
        domain_id: domainId,
        scaffold_ref: 'contracts/opl-framework/standard-domain-agent-skeleton-contract.json',
        generated_repo_dir_ref: targetDir,
        generated_repo_dir_policy: 'ephemeral_removed_after_validation',
        generation_summary: {
          generated_written_file_count: refs.generated_written_file_count,
          generated_template_file_count: refs.generated_template_file_count,
        },
        validation_summary: {
          validation_status: refs.validation_status,
          blocker_count: refs.blocker_count,
          consumed_pack_path_count: refs.consumed_pack_path_count,
          consumed_stage_count: refs.consumed_stage_count,
          selected_executor_binding_observed_count: refs.selected_executor_binding_observed_count,
          default_codex_executor_binding_count: refs.default_codex_executor_binding_count,
          quality_gate_ref_resolved_stage_count: refs.quality_gate_ref_resolved_stage_count,
          generated_surface_owner_verified: refs.generated_surface_owner_verified,
          private_surface_policy_guarded: refs.private_surface_policy_guarded,
          stage_pack_v2_status: refs.stage_pack_v2_status,
        },
        scaffold_consumption_refs: refs,
        non_goals: [
          'does_not_claim_domain_ready',
          'does_not_claim_artifact_authority',
          'does_not_claim_production_ready',
          'does_not_authorize_quality_or_export',
        ],
        authority_boundary: refs.authority_boundary,
      },
    };
  } finally {
    fs.rmSync(targetDir, { recursive: true, force: true });
  }
}
