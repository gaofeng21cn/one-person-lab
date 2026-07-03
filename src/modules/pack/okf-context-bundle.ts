import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { FrameworkContractError } from '../charter/index.ts';
import { parseJsonText } from '../../kernel/json-file.ts';
import {
  conceptIdFromFile,
  conceptPathFromId,
  domainPackPathKind,
  domainRepoDefaultMemoryDescriptorPath,
  domainRepoDefaultPackPath,
  extractLinks,
  fileRole,
  forbiddenNativeFrontmatterClaimFields,
  frontmatterRecord,
  frontmatterString,
  linkWarnings,
  normalizeRelativePath,
  okfIndexBody,
  okfLogBody,
  parseFrontmatter,
  readJsonRecordFile,
  resolveSourcePath,
  slugFromDomainPackPath,
  stageJoinKey,
  stringifyFrontmatter,
  titleFromSlug,
  walkMarkdownFiles,
} from './okf-context-bundle-parts/markdown.ts';
import type { OkfJsonRecord as JsonRecord } from './okf-context-bundle-parts/markdown.ts';

export type OkfFileRole = 'concept' | 'index' | 'log';
export type OkfValidationStatus = 'valid' | 'invalid';

interface OkfContextBundleContract {
  surface_kind: string;
  version: string;
  owner: string;
  state: string;
  purpose: string;
  machine_boundary: {
    opl_owns: string[];
    opl_does_not_own: string[];
  };
  bundle_role: string;
  supported_bundle_roles: string[];
  okf_v0_1_source_refs: Array<Record<string, string>>;
  reserved_filenames: string[];
  frontmatter_contract: Record<string, unknown>;
  native_frontmatter_migration_policy: {
    state: string;
    default_bundle_mode: string;
    eligible_path_globs: string[];
    required_fields: string[];
    runtime_consumption_policy: Record<string, false>;
    false_authority_fields: Record<string, false>;
    foldback_docs: string[];
  };
  conformance_policy: Record<string, string[]>;
  authority_boundary: {
    projection_only: true;
    can_write_domain_truth: false;
    can_write_memory_body: false;
    can_accept_or_reject_writeback: false;
    can_apply_memory_writeback: false;
    can_authorize_quality_verdict: false;
    can_authorize_domain_ready: false;
    can_authorize_publication_or_submission_verdict: false;
    can_write_artifacts: false;
    can_sign_owner_receipt: false;
    can_create_typed_blocker: false;
    can_schedule_runtime: false;
  };
  non_authority_flags: Record<string, false>;
}

export interface OkfDiagnostic {
  code: string;
  file: string;
  message: string;
  link?: string;
}

export interface OkfConceptInput {
  id: string;
  type: string;
  title?: string;
  description?: string;
  resource?: string;
  tags?: string[];
  timestamp?: string;
  body?: string;
  frontmatter?: JsonRecord;
}

export interface BuildOkfContextBundleProjectionInput {
  bundleId: string;
  title?: string;
  concepts: OkfConceptInput[];
}

export interface BuildOkfDomainPackProjectionOptions {
  bundleId?: string;
  sourceRootRef?: string;
}

export interface BuildOkfDomainRepoProjectionOptions extends BuildOkfDomainPackProjectionOptions {
  repoRoot: string;
  packPath?: string;
  memoryDescriptorPath?: string;
  includeMemoryLocators?: boolean;
}

export interface InspectOkfNativeFrontmatterOptions {
  repoRoot: string;
  agentRoot?: string;
}

export interface OkfDomainPackCompilerInput {
  domain_id?: string;
  domain_pack_owner?: string;
  canonical_semantic_pack_root?: string;
  required_domain_pack_paths?: unknown;
  source_refs?: unknown;
  authority_boundary?: unknown;
}

export interface OkfMemoryLocatorDescriptor {
  target_domain_id?: string;
  domain_id?: string;
  owner?: string;
  memory_ref_id?: string;
  memory_family?: string;
  memory_body_owner?: string;
  opl_projection_policy?: string;
  memory_pack_ref?: {
    ref?: string;
    ref_kind?: string;
    role?: string;
    workspace_locator?: string;
  };
  canonical_body_ref?: {
    ref?: string;
    ref_kind?: string;
    role?: string;
  };
  writeback_receipt_locator_ref?: {
    ref?: string;
    ref_kind?: string;
    role?: string;
  };
  authority_boundary?: Record<string, unknown>;
}

export interface OkfProjectedFile {
  path: string;
  role: OkfFileRole;
  frontmatter: JsonRecord;
  body: string;
}

export interface OkfContextBundleProjection {
  surface_kind: 'opl_okf_context_bundle_projection';
  version: 'opl-okf-context-bundle-projection.v1';
  bundle_id: string;
  bundle_role: string;
  title: string | null;
  contract_ref: string;
  okf_version: '0.1';
  files: Record<string, OkfProjectedFile>;
  warnings: OkfDiagnostic[];
  authority_boundary: typeof OKF_CONTEXT_BUNDLE_CONTRACT.authority_boundary;
  non_authority_flags: typeof OKF_CONTEXT_BUNDLE_CONTRACT.non_authority_flags;
}

export interface OkfValidatedFile {
  path: string;
  concept_id: string | null;
  role: OkfFileRole;
  frontmatter: JsonRecord;
  links: string[];
}

export interface OkfContextBundleValidation {
  surface_kind: 'opl_okf_context_bundle_validation';
  version: 'opl-okf-context-bundle-validation.v1';
  bundle_path: string;
  bundle_role: string;
  okf_version: '0.1';
  status: OkfValidationStatus;
  files: OkfValidatedFile[];
  errors: OkfDiagnostic[];
  warnings: OkfDiagnostic[];
  contract_ref: string;
  authority_boundary: typeof OKF_CONTEXT_BUNDLE_CONTRACT.authority_boundary;
  non_authority_flags: typeof OKF_CONTEXT_BUNDLE_CONTRACT.non_authority_flags;
}

export interface OkfContextBundleInspection {
  surface_kind: 'opl_okf_context_bundle_inspection';
  version: 'opl-okf-context-bundle-inspection.v1';
  contract: typeof OKF_CONTEXT_BUNDLE_CONTRACT;
  validation: OkfContextBundleValidation;
}

export interface OkfDomainRepoProjectionReadback {
  surface_kind: 'opl_okf_domain_repo_projection_readback';
  version: 'opl-okf-domain-repo-projection-readback.v1';
  repo_root: string;
  pack_path: string;
  memory_descriptor_path: string | null;
  memory_descriptor_status: 'loaded' | 'missing' | 'not_requested';
  memory_locator_count: number;
  domain_id: string;
  domain_pack_owner: string;
  source_root_ref: string;
  projection: OkfContextBundleProjection;
  authority_boundary: typeof OKF_CONTEXT_BUNDLE_CONTRACT.authority_boundary;
  non_authority_flags: typeof OKF_CONTEXT_BUNDLE_CONTRACT.non_authority_flags;
}

export interface OkfNativeFrontmatterFileInspection {
  path: string;
  parseable: boolean;
  has_frontmatter: boolean;
  frontmatter: JsonRecord;
  missing_required_fields: string[];
  forbidden_authority_claim_fields: string[];
  status: 'ready' | 'advisory_gap';
}

export interface OkfNativeFrontmatterInspection {
  surface_kind: 'opl_okf_native_frontmatter_inspection';
  version: 'opl-okf-native-frontmatter-inspection.v1';
  repo_root: string;
  agent_root: string;
  status: 'ready' | 'advisory_gaps' | 'agent_root_missing';
  default_bundle_mode: string;
  eligible_path_globs: string[];
  required_fields: string[];
  files: OkfNativeFrontmatterFileInspection[];
  summary: {
    eligible_file_count: number;
    ready_file_count: number;
    advisory_gap_count: number;
    missing_frontmatter_count: number;
    parse_error_count: number;
    missing_required_field_count: number;
    forbidden_authority_claim_count: number;
  };
  advisory_gaps: OkfDiagnostic[];
  authority_boundary: typeof OKF_CONTEXT_BUNDLE_CONTRACT.authority_boundary;
  non_authority_flags: typeof OKF_CONTEXT_BUNDLE_CONTRACT.non_authority_flags;
}

const CONTRACT_REF = 'contracts/opl-framework/okf-context-bundle-contract.json';
const CONTRACT_PATH = fileURLToPath(new URL(`../../../${CONTRACT_REF}`, import.meta.url));

export const OKF_CONTEXT_BUNDLE_CONTRACT = parseJsonText(
  fs.readFileSync(CONTRACT_PATH, 'utf8'),
) as OkfContextBundleContract;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function buildOkfContextBundleProjection(
  input: BuildOkfContextBundleProjectionInput,
): OkfContextBundleProjection {
  const files: Record<string, OkfProjectedFile> = {
    'index.md': {
      path: 'index.md',
      role: 'index',
      frontmatter: {
        okf_version: '0.1',
        bundle_id: input.bundleId,
        bundle_role: OKF_CONTEXT_BUNDLE_CONTRACT.bundle_role,
      },
      body: okfIndexBody(input),
    },
    'log.md': {
      path: 'log.md',
      role: 'log',
      frontmatter: {
        okf_version: '0.1',
        bundle_id: input.bundleId,
      },
      body: okfLogBody(input.bundleId),
    },
  };
  for (const concept of input.concepts) {
    const relativePath = conceptPathFromId(concept.id);
    const frontmatter: JsonRecord = {
      ...concept.frontmatter,
      type: concept.type,
      ...(concept.title ? { title: concept.title } : {}),
      ...(concept.description ? { description: concept.description } : {}),
      ...(concept.resource ? { resource: concept.resource } : {}),
      ...(concept.tags ? { tags: concept.tags } : {}),
      ...(concept.timestamp ? { timestamp: concept.timestamp } : {}),
    };
    files[relativePath] = {
      path: relativePath,
      role: 'concept',
      frontmatter,
      body: concept.body ?? '',
    };
  }
  const knownPaths = new Set(Object.keys(files));
  const knownConceptIds = new Set(Object.keys(files).map((filePath) => conceptIdFromFile(filePath)));
  const warnings = linkWarnings(
    Object.values(files).map((file) => ({ path: file.path, links: extractLinks(file.body) })),
    knownPaths,
    knownConceptIds,
  );

  return {
    surface_kind: 'opl_okf_context_bundle_projection',
    version: 'opl-okf-context-bundle-projection.v1',
    bundle_id: input.bundleId,
    bundle_role: OKF_CONTEXT_BUNDLE_CONTRACT.bundle_role,
    title: input.title ?? null,
    contract_ref: CONTRACT_REF,
    okf_version: '0.1',
    files,
    warnings,
    authority_boundary: OKF_CONTEXT_BUNDLE_CONTRACT.authority_boundary,
    non_authority_flags: OKF_CONTEXT_BUNDLE_CONTRACT.non_authority_flags,
  };
}

export function renderOkfProjectedFile(file: OkfProjectedFile) {
  return `${stringifyFrontmatter(file.frontmatter)}\n\n${file.body}`;
}

export function writeOkfContextBundleProjection(
  projection: OkfContextBundleProjection,
  outputPath: string,
) {
  const bundlePath = path.resolve(outputPath);
  for (const file of Object.values(projection.files)) {
    const filePath = path.join(bundlePath, file.path);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, renderOkfProjectedFile(file), 'utf8');
  }
  return {
    surface_kind: 'opl_okf_context_bundle_write',
    version: 'opl-okf-context-bundle-write.v1',
    bundle_path: bundlePath,
    written_files: Object.keys(projection.files).sort(),
    authority_boundary: projection.authority_boundary,
    non_authority_flags: projection.non_authority_flags,
  };
}

function buildOkfDomainPackConcepts(
  packInput: OkfDomainPackCompilerInput,
  options: BuildOkfDomainPackProjectionOptions = {},
) {
  const domainId = frontmatterString(packInput.domain_id) ?? 'unknown-domain';
  const owner = frontmatterString(packInput.domain_pack_owner) ?? domainId;
  const requiredPaths = Array.isArray(packInput.required_domain_pack_paths)
    ? packInput.required_domain_pack_paths.filter((entry): entry is string => typeof entry === 'string')
    : [];
  const conceptIdsByKindAndJoinKey = new Map<string, string>();
  const pathEntries = requiredPaths.map((resourcePath) => {
    const kind = domainPackPathKind(resourcePath);
    const slug = slugFromDomainPackPath(resourcePath);
    const joinKey = stageJoinKey(slug);
    const conceptId = `${domainId}/${kind}/${slug}`;
    conceptIdsByKindAndJoinKey.set(`${kind}:${joinKey}`, conceptId);
    return { resourcePath, kind, slug, joinKey, conceptId };
  });

  const concepts: OkfConceptInput[] = pathEntries.map((entry) => {
    const links: string[] = [];
    if (entry.kind === 'stage') {
      for (const linkedKind of ['prompt', 'skill', 'quality_gate']) {
        const target = conceptIdsByKindAndJoinKey.get(`${linkedKind}:${entry.joinKey}`);
        if (target) {
          links.push(`[[${target}]]`);
        }
      }
    }
    return {
      id: entry.conceptId,
      type: entry.kind,
      title: `${titleFromSlug(entry.slug)} ${titleFromSlug(entry.kind)}`.trim(),
      description: `Body-free ${owner} domain pack ref for ${entry.resourcePath}.`,
      resource: `${options.sourceRootRef ?? `repo:${owner}`}:${entry.resourcePath}`,
      tags: ['opl', 'okf', 'body-free-ref', entry.kind],
      body: [
        `# ${titleFromSlug(entry.slug)}`,
        '',
        `Resource ref: \`${entry.resourcePath}\``,
        '',
        links.length > 0 ? `Related refs: ${links.join(', ')}` : 'Related refs: none declared in this projection.',
        '',
        'This concept intentionally carries no prompt, skill, knowledge, quality gate, artifact, or memory body.',
        '',
      ].join('\n'),
      frontmatter: {
        domain_id: domainId,
        domain_pack_owner: owner,
        source_root_ref: options.sourceRootRef ?? `repo:${owner}`,
        resource_body_mode: 'body_free_ref',
        source_refs: frontmatterRecord(packInput.source_refs) ?? {},
        authority_boundary: {
          ...(frontmatterRecord(packInput.authority_boundary) ?? {}),
          opl_can_write_domain_truth: false,
          opl_can_write_memory_body: false,
          opl_can_authorize_quality_or_export: false,
          concept_can_claim_progress: false,
          concept_can_claim_domain_ready: false,
        },
      },
    };
  });

  return {
    concepts,
    domainId,
    owner,
    sourceRootRef: options.sourceRootRef ?? `repo:${owner}`,
  };
}

export function buildOkfContextBundleFromDomainPack(
  packInput: OkfDomainPackCompilerInput,
  options: BuildOkfDomainPackProjectionOptions = {},
) {
  const pack = buildOkfDomainPackConcepts(packInput, options);
  return buildOkfContextBundleProjection({
    bundleId: options.bundleId ?? `okf:${pack.domainId}:domain-pack`,
    title: `${pack.owner} Domain Pack OKF Context Bundle`,
    concepts: pack.concepts,
  });
}

function collectOkfMemoryLocatorDescriptors(value: unknown): OkfMemoryLocatorDescriptor[] {
  if (Array.isArray(value)) {
    return value
      .map((entry) => frontmatterRecord(entry))
      .filter((entry): entry is JsonRecord => Boolean(entry))
      .map((entry) => entry as unknown as OkfMemoryLocatorDescriptor);
  }
  const record = frontmatterRecord(value);
  if (!record) {
    return [];
  }
  if (Array.isArray(record.descriptors)) {
    return collectOkfMemoryLocatorDescriptors(record.descriptors);
  }
  return [record as unknown as OkfMemoryLocatorDescriptor];
}

export function buildOkfContextBundleFromDomainRepo(
  options: BuildOkfDomainRepoProjectionOptions,
): OkfDomainRepoProjectionReadback {
  const repoRoot = path.resolve(options.repoRoot);
  const packPath = resolveSourcePath(repoRoot, options.packPath ?? domainRepoDefaultPackPath(repoRoot));
  const packInput = readJsonRecordFile(packPath) as unknown as OkfDomainPackCompilerInput;
  const pack = buildOkfDomainPackConcepts(packInput, options);

  const includeMemoryLocators = options.includeMemoryLocators ?? true;
  const defaultMemoryDescriptorPath = domainRepoDefaultMemoryDescriptorPath(repoRoot);
  const memoryDescriptorPath = options.memoryDescriptorPath
    ? resolveSourcePath(repoRoot, options.memoryDescriptorPath)
    : defaultMemoryDescriptorPath;
  const memoryDescriptorExists = fs.existsSync(memoryDescriptorPath);
  const memoryDescriptors = includeMemoryLocators && memoryDescriptorExists
    ? collectOkfMemoryLocatorDescriptors(readJsonRecordFile(memoryDescriptorPath))
    : [];
  const memoryConcepts = memoryDescriptors.map((descriptor) => buildOkfMemoryLocatorConcept(descriptor));
  const bundleId = options.bundleId ?? `okf:${pack.domainId}:domain-repo`;
  const projection = buildOkfContextBundleProjection({
    bundleId,
    title: `${pack.owner} Domain Repo OKF Context Bundle`,
    concepts: [...pack.concepts, ...memoryConcepts],
  });

  return {
    surface_kind: 'opl_okf_domain_repo_projection_readback',
    version: 'opl-okf-domain-repo-projection-readback.v1',
    repo_root: repoRoot,
    pack_path: packPath,
    memory_descriptor_path: includeMemoryLocators ? memoryDescriptorPath : null,
    memory_descriptor_status: includeMemoryLocators
      ? (memoryDescriptorExists ? 'loaded' : 'missing')
      : 'not_requested',
    memory_locator_count: memoryConcepts.length,
    domain_id: pack.domainId,
    domain_pack_owner: pack.owner,
    source_root_ref: pack.sourceRootRef,
    projection,
    authority_boundary: OKF_CONTEXT_BUNDLE_CONTRACT.authority_boundary,
    non_authority_flags: OKF_CONTEXT_BUNDLE_CONTRACT.non_authority_flags,
  };
}

export function buildOkfMemoryLocatorConcept(
  descriptor: OkfMemoryLocatorDescriptor,
): OkfConceptInput {
  const domainId = descriptor.target_domain_id ?? descriptor.domain_id ?? 'unknown-domain';
  const memoryRefId = descriptor.memory_ref_id ?? 'memory';
  const owner = descriptor.owner ?? descriptor.memory_body_owner ?? domainId;
  const resourceRef = descriptor.memory_pack_ref?.ref ?? descriptor.canonical_body_ref?.ref ?? memoryRefId;
  return {
    id: `${domainId}/memory_locator/${memoryRefId}`,
    type: 'memory_locator',
    title: titleFromSlug(memoryRefId),
    description: `Body-free memory locator for ${domainId}.`,
    resource: resourceRef,
    tags: ['opl', 'okf', 'memory-locator', 'body-free-ref'],
    body: [
      `# ${titleFromSlug(memoryRefId)}`,
      '',
      `Memory locator ref: \`${resourceRef}\``,
      '',
      descriptor.writeback_receipt_locator_ref?.ref
        ? `Writeback receipt locator: \`${descriptor.writeback_receipt_locator_ref.ref}\``
        : 'Writeback receipt locator: not declared',
      '',
      'The domain owner keeps the memory body and writeback accept/reject authority.',
      '',
    ].join('\n'),
    frontmatter: {
      domain_id: domainId,
      memory_ref_id: memoryRefId,
      memory_family: descriptor.memory_family ?? memoryRefId,
      body_owner: owner,
      resource_body_mode: 'body_free_locator',
      opl_projection_policy: descriptor.opl_projection_policy ?? 'locator_and_receipt_refs_only',
      memory_pack_ref: (descriptor.memory_pack_ref ?? {}) as JsonRecord,
      canonical_body_ref: (descriptor.canonical_body_ref ?? {}) as JsonRecord,
      writeback_receipt_locator_ref: (descriptor.writeback_receipt_locator_ref ?? {}) as JsonRecord,
      authority_boundary: {
        ...((descriptor.authority_boundary ?? {}) as JsonRecord),
        domain_owns_body: true,
        body_owner: owner,
        memory_body_authority: 'domain_owns_body',
        opl_can_write_memory_body: false,
        opl_can_write_domain_truth: false,
        opl_can_accept_or_reject_writeback: false,
        opl_can_authorize_quality_or_export: false,
      },
    },
  };
}

export function validateOkfContextBundle(input: { bundlePath: string }): OkfContextBundleValidation {
  const bundlePath = path.resolve(input.bundlePath);
  if (!fs.existsSync(bundlePath) || !fs.statSync(bundlePath).isDirectory()) {
    throw new FrameworkContractError('cli_usage_error', 'okf bundle path must be an existing directory.', {
      bundle_path: input.bundlePath,
    });
  }

  const files: OkfValidatedFile[] = [];
  const errors: OkfDiagnostic[] = [];
  const markdownFiles = walkMarkdownFiles(bundlePath);
  for (const relativePath of markdownFiles) {
    const role = fileRole(relativePath);
    const content = fs.readFileSync(path.join(bundlePath, relativePath), 'utf8');
    const parsed = parseFrontmatter(content);
    if (role === 'concept') {
      if (!parsed.parseable || !parsed.frontmatter) {
        errors.push({
          code: 'okf_frontmatter_required',
          file: relativePath,
          message: 'OKF concept document requires a parseable YAML frontmatter block.',
        });
      } else if (!isNonEmptyString(parsed.frontmatter.type)) {
        errors.push({
          code: 'okf_frontmatter_type_required',
          file: relativePath,
          message: 'OKF concept document frontmatter requires a non-empty type field.',
        });
      }
    } else if (parsed.frontmatter && isNonEmptyString(parsed.frontmatter.type)) {
      errors.push({
        code: 'okf_reserved_filename_for_concept',
        file: relativePath,
        message: 'OKF reserved filenames index.md and log.md must not be used for concept documents.',
      });
    }
    files.push({
      path: relativePath,
      concept_id: role === 'concept' ? conceptIdFromFile(relativePath) : null,
      role,
      frontmatter: parsed.frontmatter ?? {},
      links: extractLinks(parsed.body),
    });
  }

  const knownPaths = new Set(files.map((file) => file.path));
  const knownConceptIds = new Set(
    files
      .map((file) => file.concept_id)
      .filter((conceptId): conceptId is string => Boolean(conceptId)),
  );
  const warnings = linkWarnings(files, knownPaths, knownConceptIds);

  return {
    surface_kind: 'opl_okf_context_bundle_validation',
    version: 'opl-okf-context-bundle-validation.v1',
    bundle_path: bundlePath,
    bundle_role: OKF_CONTEXT_BUNDLE_CONTRACT.bundle_role,
    okf_version: '0.1',
    status: errors.length === 0 ? 'valid' : 'invalid',
    files,
    errors,
    warnings,
    contract_ref: CONTRACT_REF,
    authority_boundary: OKF_CONTEXT_BUNDLE_CONTRACT.authority_boundary,
    non_authority_flags: OKF_CONTEXT_BUNDLE_CONTRACT.non_authority_flags,
  };
}

export function inspectOkfContextBundle(input: { bundlePath: string }): OkfContextBundleInspection {
  return {
    surface_kind: 'opl_okf_context_bundle_inspection',
    version: 'opl-okf-context-bundle-inspection.v1',
    contract: OKF_CONTEXT_BUNDLE_CONTRACT,
    validation: validateOkfContextBundle(input),
  };
}

export function inspectOkfNativeFrontmatter(
  options: InspectOkfNativeFrontmatterOptions,
): OkfNativeFrontmatterInspection {
  const repoRoot = path.resolve(options.repoRoot);
  const agentRoot = resolveSourcePath(repoRoot, options.agentRoot ?? 'agent');
  const policy = OKF_CONTEXT_BUNDLE_CONTRACT.native_frontmatter_migration_policy;
  const requiredFields = policy.required_fields;
  const eligiblePathGlobs = [
    ...policy.eligible_path_globs,
    'agent/**/*.md',
  ].filter((entry, index, entries) => entries.indexOf(entry) === index);

  if (!fs.existsSync(agentRoot) || !fs.statSync(agentRoot).isDirectory()) {
    return {
      surface_kind: 'opl_okf_native_frontmatter_inspection',
      version: 'opl-okf-native-frontmatter-inspection.v1',
      repo_root: repoRoot,
      agent_root: agentRoot,
      status: 'agent_root_missing',
      default_bundle_mode: policy.default_bundle_mode,
      eligible_path_globs: eligiblePathGlobs,
      required_fields: requiredFields,
      files: [],
      summary: {
        eligible_file_count: 0,
        ready_file_count: 0,
        advisory_gap_count: 1,
        missing_frontmatter_count: 0,
        parse_error_count: 0,
        missing_required_field_count: 0,
        forbidden_authority_claim_count: 0,
      },
      advisory_gaps: [
        {
          code: 'okf_native_agent_root_missing',
          file: normalizeRelativePath(path.relative(repoRoot, agentRoot)) || 'agent',
          message: 'OKF native frontmatter inspection is advisory and found no domain-owned agent markdown root.',
        },
      ],
      authority_boundary: OKF_CONTEXT_BUNDLE_CONTRACT.authority_boundary,
      non_authority_flags: OKF_CONTEXT_BUNDLE_CONTRACT.non_authority_flags,
    };
  }

  const files = walkMarkdownFiles(agentRoot).map((relativeToAgentRoot): OkfNativeFrontmatterFileInspection => {
    const relativePath = normalizeRelativePath(path.join(path.relative(repoRoot, agentRoot), relativeToAgentRoot));
    const content = fs.readFileSync(path.join(agentRoot, relativeToAgentRoot), 'utf8');
    const parsed = parseFrontmatter(content);
    const missingRequiredFields = parsed.parseable && parsed.frontmatter
      ? requiredFields.filter((field) => !isNonEmptyString(parsed.frontmatter?.[field]))
      : requiredFields;
    const forbiddenAuthorityClaimFields = parsed.frontmatter
      ? forbiddenNativeFrontmatterClaimFields(parsed.frontmatter)
      : [];
    const hasGap = !parsed.parseable || !parsed.frontmatter || missingRequiredFields.length > 0 || forbiddenAuthorityClaimFields.length > 0;
    return {
      path: relativePath,
      parseable: parsed.parseable,
      has_frontmatter: Boolean(parsed.frontmatter),
      frontmatter: parsed.frontmatter ?? {},
      missing_required_fields: missingRequiredFields,
      forbidden_authority_claim_fields: forbiddenAuthorityClaimFields,
      status: hasGap ? 'advisory_gap' : 'ready',
    };
  });

  const advisoryGaps: OkfDiagnostic[] = [];
  for (const file of files) {
    if (!file.parseable || !file.has_frontmatter) {
      advisoryGaps.push({
        code: 'okf_native_frontmatter_missing_or_unparseable',
        file: file.path,
        message: 'Native OKF frontmatter is absent or unparseable; this is advisory and does not block ordinary progress.',
      });
    }
    for (const field of file.missing_required_fields) {
      advisoryGaps.push({
        code: 'okf_native_required_field_missing',
        file: file.path,
        message: `Native OKF frontmatter advisory field is missing: ${field}.`,
      });
    }
    for (const field of file.forbidden_authority_claim_fields) {
      advisoryGaps.push({
        code: 'okf_native_forbidden_authority_claim',
        file: file.path,
        message: `Native OKF frontmatter must not claim OPL runtime, readiness, truth, receipt, blocker, artifact, or verdict authority: ${field}.`,
      });
    }
  }

  const summary = {
    eligible_file_count: files.length,
    ready_file_count: files.filter((file) => file.status === 'ready').length,
    advisory_gap_count: files.filter((file) => file.status === 'advisory_gap').length,
    missing_frontmatter_count: files.filter((file) => !file.has_frontmatter).length,
    parse_error_count: files.filter((file) => !file.parseable).length,
    missing_required_field_count: files.filter((file) => file.missing_required_fields.length > 0).length,
    forbidden_authority_claim_count: files.filter((file) => file.forbidden_authority_claim_fields.length > 0).length,
  };

  return {
    surface_kind: 'opl_okf_native_frontmatter_inspection',
    version: 'opl-okf-native-frontmatter-inspection.v1',
    repo_root: repoRoot,
    agent_root: agentRoot,
    status: advisoryGaps.length === 0 ? 'ready' : 'advisory_gaps',
    default_bundle_mode: policy.default_bundle_mode,
    eligible_path_globs: eligiblePathGlobs,
    required_fields: requiredFields,
    files,
    summary,
    advisory_gaps: advisoryGaps,
    authority_boundary: OKF_CONTEXT_BUNDLE_CONTRACT.authority_boundary,
    non_authority_flags: OKF_CONTEXT_BUNDLE_CONTRACT.non_authority_flags,
  };
}
