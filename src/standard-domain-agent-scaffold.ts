import fs from 'node:fs';
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
  SCAFFOLD_MARKER,
  STARTER_STAGE_ID,
  WORKSPACE_FILE_LIFECYCLE_POLICY,
} from './standard-domain-agent-scaffold-constants.ts';

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
      path: `agent/stages/${STARTER_STAGE_ID}.md`,
      content: `# ${domainLabel} Domain Intake Stage\n\nPurpose: capture the first domain-specific request, source refs, authority boundary, and handoff criteria before any OPL-hosted execution starts.\n\nRequired inputs: user intent, source locator refs, expected deliverable class, domain authority owner, and blocked-scope list.\n\nRequired outputs: intake receipt ref, accepted next-stage ref, typed blocker ref when intent or authority is unclear, and no-forbidden-write evidence ref.\n`,
    },
    {
      path: 'agent/prompts/README.md',
      content: `# ${domainLabel} Prompts\n\nPrompt bodies remain domain-owned. OPL may reference prompt locators but does not copy domain truth or memory body.\n`,
    },
    {
      path: `agent/prompts/${STARTER_STAGE_ID}.md`,
      content: `# ${domainLabel} Domain Intake Prompt\n\nRead the user request, source locators, target deliverable, and known constraints. Return only domain-owned intake refs, an explicit authority boundary, and a next-stage recommendation. Do not write domain truth, memory body, artifacts, quality verdicts, or export verdicts from the OPL generated interface.\n`,
    },
    {
      path: 'agent/skills/README.md',
      content: `# ${domainLabel} Skills\n\nDeclare direct domain skill entry points here and keep direct path parity with OPL-hosted invocation receipts.\n`,
    },
    {
      path: 'agent/skills/domain_execution.md',
      content: `# ${domainLabel} Domain Execution Skill Policy\n\nThe direct domain skill is the owner path for domain execution. OPL-generated CLI, MCP, product-entry, sidecar, status, and workbench surfaces route to declared domain handlers or refs-only adapters and require owner receipts for mutating or verdict-bearing outcomes.\n`,
    },
    {
      path: 'agent/knowledge/README.md',
      content: `# ${domainLabel} Knowledge\n\nStore knowledge locators and policies here. Runtime memory bodies belong in the workspace/runtime memory root, not in OPL state.\n`,
    },
    {
      path: 'agent/knowledge/domain_boundary.md',
      content: `# ${domainLabel} Domain Boundary Knowledge\n\nThis pack owns the domain vocabulary, truth boundaries, source policies, memory-locator semantics, and artifact-authority rules needed by stage execution. OPL consumes these refs for routing and projection only.\n`,
    },
    {
      path: 'agent/quality_gates/README.md',
      content: `# ${domainLabel} Quality Gates\n\nQuality, readiness, and export verdicts are owned by this domain agent. OPL only projects refs and receipts.\n`,
    },
    {
      path: 'agent/quality_gates/domain_acceptance.md',
      content: `# ${domainLabel} Domain Acceptance Gate\n\nA stage may close only with a domain owner receipt, typed blocker, or explicit route-back ref. Mechanical completion, schema completeness, provider completion, or generated-surface readiness cannot declare domain ready, quality accepted, or export approved.\n`,
    },
    {
      path: 'agent/policies/README.md',
      content: `# ${domainLabel} Policies\n\nDeclare policy tables, authority boundaries, and pack compiler inputs here. Generic CLI, MCP, sidecar, status, and workbench shells are generated or hosted by OPL.\n`,
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
      path: 'contracts/pack_compiler_input.json',
      content: json({
        surface_kind: 'opl_domain_pack_compiler_input',
        schema_version: 1,
        domain_id: domainId,
        domain_pack_owner: domainId,
        canonical_semantic_pack_root: 'agent/',
        canonical_semantic_pack_role: 'repo_source_declarative_domain_pack',
        required_domain_pack_paths: [
          `agent/prompts/${STARTER_STAGE_ID}.md`,
          `agent/stages/${STARTER_STAGE_ID}.md`,
          'agent/skills/domain_execution.md',
          'agent/knowledge/domain_boundary.md',
          'agent/quality_gates/domain_acceptance.md',
        ],
        generated_surface_owner: 'one-person-lab',
        declarative_domain_pack: DECLARATIVE_DOMAIN_PACK,
        minimal_authority_functions: MINIMAL_AUTHORITY_FUNCTIONS,
        generated_surfaces_requested: OPL_GENERATED_SURFACES.map((surface) => surface.surface_id),
        domain_repo_can_own_generated_surface: false,
        marker: SCAFFOLD_MARKER,
        authority_boundary: {
          opl_can_write_domain_truth: false,
          opl_can_write_memory_body: false,
          opl_can_authorize_quality_or_export: false,
          domain_can_claim_generated_surface_owner: false,
        },
      }),
    },
    {
      path: 'contracts/generated_surface_handoff.json',
      content: json({
        surface_kind: 'opl_generated_surface_handoff',
        schema_version: 1,
        domain_id: domainId,
        generated_surface_owner: 'one-person-lab',
        domain_repo_can_own_generated_surface: false,
        source_contract_ref: 'contracts/pack_compiler_input.json',
        generated_surfaces: OPL_GENERATED_SURFACES,
        required_domain_handoff: [
          'owner_receipt_schema',
          'typed_blocker_schema',
          'minimal_authority_function_refs',
          'no_forbidden_write_evidence',
        ],
        marker: SCAFFOLD_MARKER,
      }),
    },
    {
      path: 'contracts/stage_control_plane.json',
      content: json({
        surface_kind: 'family_stage_control_plane',
        version: 'family-stage-control-plane.v1',
        plane_id: `${domainId}.stage-control-plane.v1`,
        target_domain_id: domainId,
        owner: domainId,
        domain_id: domainId,
        authority_boundary: {
          domain_truth_owner: domainId,
          opl_role: 'projection_consumer_only',
          opl_can_write_domain_truth: false,
          opl_can_authorize_quality_or_export: false,
        },
        stages: [
          {
            stage_id: STARTER_STAGE_ID,
            stage_kind: 'intake',
            title: 'Domain intake',
            summary: 'Capture domain intent, source refs, authority boundary, and next-stage readiness.',
            goal: 'Produce intake receipt refs and a next-stage recommendation without granting OPL domain truth authority.',
            owner: domainId,
            domain_stage_refs: [STARTER_STAGE_ID],
            inputs: [],
            knowledge_refs: [
              {
                ref_kind: 'repo_path',
                ref: 'agent/knowledge/domain_boundary.md',
                role: 'domain_pack_knowledge',
              },
            ],
            skills: [
              {
                ref_kind: 'repo_path',
                ref: 'agent/skills/domain_execution.md',
                role: 'domain_pack_skill_policy',
              },
            ],
            prompt_refs: [
              {
                ref_kind: 'repo_path',
                ref: `agent/prompts/${STARTER_STAGE_ID}.md`,
                role: 'stage_prompt',
              },
            ],
            allowed_action_refs: [],
            outputs: [
              {
                ref_kind: 'domain_ref',
                ref: ['intake_receipt_ref', 'typed_blocker_ref', 'next_stage_ref'],
                role: 'domain_intake_refs',
              },
            ],
            evaluation: [
              {
                ref_kind: 'repo_path',
                ref: 'agent/quality_gates/domain_acceptance.md',
                role: 'agent_quality_gate',
              },
            ],
            handoff: {
              next_owner: domainId,
              next_stage_refs: [],
            },
            source_refs: [
              {
                ref_kind: 'repo_path',
                ref: `agent/stages/${STARTER_STAGE_ID}.md`,
                role: 'stage_policy',
              },
            ],
            authority_boundary: {
              domain_truth_owner: domainId,
              opl_role: 'projection_consumer_only',
              opl_can_write_domain_truth: false,
              opl_can_authorize_quality_or_export: false,
            },
          },
        ],
        marker: SCAFFOLD_MARKER,
      }),
    },
    {
      path: 'contracts/action_catalog.json',
      content: json({
        surface_kind: 'family_action_catalog',
        version: 'family-action-catalog.v1',
        catalog_id: `${domainId}.action-catalog.v1`,
        target_domain_id: domainId,
        owner: domainId,
        domain_id: domainId,
        authority_boundary: {
          domain_truth_owner: domainId,
          opl_role: 'projection_consumer_only',
          write_policy: 'no_domain_truth_writes',
        },
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
        classification_policy: {
          rule: 'domain_declares_non_knowledge_functional_modules_for_opl_unified_audit',
          accepted_migration_classes: [
            'opl_hosted_surface',
            'opl_generated_surface',
            'declarative_pack',
            'minimal_authority_function',
            'refs_only_domain_adapter',
            'temporary_migration_bridge',
            'diagnostic_cleanup_path',
            'provenance_or_fixture',
          ],
        },
        opl_owned_replacement_surfaces: OPL_OWNED_GENERIC_PRIMITIVES.map((primitive) => primitive.primitive_id),
        opl_generated_surfaces: OPL_GENERATED_SURFACES.map((surface) => surface.surface_id),
        private_functional_surface_admission_policy: PRIVATE_FUNCTIONAL_SURFACE_ADMISSION_POLICY,
        declarative_domain_pack: DECLARATIVE_DOMAIN_PACK,
        minimal_authority_functions: MINIMAL_AUTHORITY_FUNCTIONS,
        domain_retained_thin_surfaces_deprecated: DOMAIN_RETAINED_THIN_SURFACES_DEPRECATED,
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
      path: 'contracts/private_functional_surface_policy.json',
      content: json({
        ...PRIVATE_FUNCTIONAL_SURFACE_ADMISSION_POLICY,
        domain_id: domainId,
        marker: SCAFFOLD_MARKER,
      }),
    },
    {
      path: 'contracts/workspace_lifecycle_policy.json',
      content: json({
        ...WORKSPACE_FILE_LIFECYCLE_POLICY,
        domain_id: domainId,
        marker: SCAFFOLD_MARKER,
      }),
    },
    {
      path: 'runtime/authority_functions/README.md',
      content: `# ${domainLabel} Authority Functions\n\nKeep only minimal domain authority functions here: quality/export verdict authorization, artifact mutation authorization, memory accept/reject decisions, source readiness verdicts, owner receipt signing, or domain-specific native helper implementation. Every retained function needs a cannot-absorb reason, receipt schema, active caller list, and no-forbidden-write evidence.\n`,
    },
    {
      path: 'runtime/native_helpers/README.md',
      content: `# ${domainLabel} Native Helpers\n\nPlace domain-specific helper implementations here only when they cannot be represented as declarative pack inputs. OPL owns the generic helper envelope and execution contract.\n`,
    },
    {
      path: 'runtime/fixtures/README.md',
      content: `# ${domainLabel} Runtime Fixtures\n\nStore focused harness fixtures and expected owner receipts here. Runtime artifacts, memory bodies, and deliverable blobs stay in workspace/runtime roots.\n`,
    },
    {
      path: 'docs/project.md',
      content: `# ${domainLabel}\n\nOwner: \`${domainId}\`\nPurpose: \`domain_agent_project_overview\`\nState: \`scaffolded\`\nMachine boundary: human-readable project overview; machine truth belongs in contracts and runtime receipts.\n`,
    },
    {
      path: 'docs/status.md',
      content: `# ${domainLabel} Status\n\nCurrent state: scaffolded declarative domain pack with minimal authority functions. Production evidence must come from domain-owned receipts and focused OPL-hosted/direct parity verification.\n`,
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
      content: `# ${domainLabel} Decisions\n\n- Adopt OPL standard domain-agent scaffold v1.\n- Keep this repo as a declarative domain pack plus minimal authority functions.\n`,
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
  const agentPackValidation = validateAgentPackFiles(repoDir, packCompilerInput);
  const stageRefValidation = validateStageRefs(repoDir, stageControlPlane);
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
      declarative_domain_pack: DECLARATIVE_DOMAIN_PACK,
      minimal_authority_functions: MINIMAL_AUTHORITY_FUNCTIONS,
      pack_compiler_contract: PACK_COMPILER_CONTRACT,
      generated_surface_contract: GENERATED_SURFACE_CONTRACT,
      agent_pack_contract: AGENT_PACK_CONTRACT,
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
