import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { FrameworkContractError } from './contracts.ts';

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
type JsonRecord = Record<string, JsonValue>;

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

const CONTRACT_REF = 'contracts/opl-framework/okf-context-bundle-contract.json';
const CONTRACT_PATH = fileURLToPath(new URL(`../${CONTRACT_REF}`, import.meta.url));
const RESERVED_FILENAMES = new Set(['index.md', 'log.md']);
const MARKDOWN_LINK_RE = /!?\[[^\]]*]\(([^)\s]+)(?:\s+["'][^)"']*["'])?\)/g;
const WIKILINK_RE = /\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?]]/g;

export const OKF_CONTEXT_BUNDLE_CONTRACT = JSON.parse(
  fs.readFileSync(CONTRACT_PATH, 'utf8'),
) as OkfContextBundleContract;

function normalizeRelativePath(filePath: string) {
  return filePath.split(path.sep).join('/');
}

function trimSlashes(value: string) {
  return value.replace(/^\/+/, '').replace(/\/+$/, '');
}

function conceptIdFromFile(relativePath: string) {
  return relativePath.replace(/\.md$/i, '');
}

function conceptPathFromId(conceptId: string) {
  const cleanId = trimSlashes(conceptId.trim());
  if (!cleanId || cleanId.includes('..')) {
    throw new FrameworkContractError('cli_usage_error', 'OKF concept id must be a bundle-relative path without parent traversal.', {
      concept_id: conceptId,
    });
  }
  return cleanId.endsWith('.md') ? cleanId : `${cleanId}.md`;
}

function titleFromSlug(value: string) {
  return value
    .split(/[-_/]+/)
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ''}${part.slice(1)}`)
    .join(' ');
}

function frontmatterString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function frontmatterRecord(value: unknown): JsonRecord | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  return value as JsonRecord;
}

function readJsonRecordFile(filePath: string) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new FrameworkContractError('contract_file_missing', `OKF source JSON file is missing: ${filePath}.`, {
        path: filePath,
      });
    }
    throw error;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new FrameworkContractError('contract_shape_invalid', 'OKF source JSON root must be an object.', {
      path: filePath,
    });
  }
  return parsed as JsonRecord;
}

function resolveSourcePath(repoRoot: string, sourcePath: string) {
  return path.isAbsolute(sourcePath) ? sourcePath : path.resolve(repoRoot, sourcePath);
}

function domainRepoDefaultPackPath(repoRoot: string) {
  return path.join(repoRoot, 'contracts', 'pack_compiler_input.json');
}

function domainRepoDefaultMemoryDescriptorPath(repoRoot: string) {
  return path.join(repoRoot, 'contracts', 'memory_descriptor.json');
}

function domainPackPathKind(relativePath: string) {
  const normalized = relativePath.replaceAll('\\', '/');
  if (normalized.includes('/prompts/')) {
    return 'prompt';
  }
  if (normalized.includes('/stages/')) {
    return 'stage';
  }
  if (normalized.includes('/skills/')) {
    return 'skill';
  }
  if (normalized.includes('/tools/')) {
    return 'tool_affordance';
  }
  if (normalized.includes('/knowledge/')) {
    return 'knowledge';
  }
  if (normalized.includes('/quality_gates/')) {
    return 'quality_gate';
  }
  return 'pack_ref';
}

function slugFromDomainPackPath(relativePath: string) {
  const basename = path.posix.basename(relativePath.replaceAll('\\', '/'));
  return basename.replace(/\.md$/i, '');
}

function stageJoinKey(slug: string) {
  return slug.replace(/-quality-gate$/i, '');
}

function okfIndexBody(input: BuildOkfContextBundleProjectionInput) {
  const title = input.title ?? input.bundleId;
  const conceptLines = input.concepts
    .map((concept) => {
      const filePath = conceptPathFromId(concept.id);
      return `- [${concept.title ?? concept.id}](${filePath})`;
    });
  return [
    `# ${title}`,
    '',
    'This OKF bundle is an OPL-owned context projection. It carries body-free refs and no runtime or domain authority.',
    '',
    '## Concepts',
    '',
    ...conceptLines,
    '',
  ].join('\n');
}

function okfLogBody(bundleId: string) {
  return [
    `# ${bundleId} OKF Log`,
    '',
    '- created_by: one-person-lab',
    '- role: context_bundle_projection',
    '- authority: no_domain_truth_no_runtime_no_verdict',
    '',
  ].join('\n');
}

function fileRole(relativePath: string): OkfFileRole {
  const basename = path.posix.basename(relativePath);
  if (basename === 'index.md') {
    return 'index';
  }
  if (basename === 'log.md') {
    return 'log';
  }
  return 'concept';
}

function scalarToFrontmatter(value: JsonValue): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => scalarToFrontmatter(entry)).join(', ')}]`;
  }
  if (typeof value === 'string') {
    if (!value.trim()) {
      return '""';
    }
    if (/[:#[\]{},&*!|>'"%@`\s]/.test(value)) {
      return JSON.stringify(value);
    }
    return value;
  }
  return JSON.stringify(value);
}

function stringifyFrontmatter(frontmatter: JsonRecord) {
  return [
    '---',
    ...Object.entries(frontmatter).map(([key, value]) => `${key}: ${scalarToFrontmatter(value)}`),
    '---',
  ].join('\n');
}

function parseScalar(rawValue: string): JsonValue {
  const value = rawValue.trim();
  if (!value) {
    return '';
  }
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  if (value.startsWith('[') && value.endsWith(']')) {
    const inner = value.slice(1, -1).trim();
    if (!inner) {
      return [];
    }
    return inner.split(',').map((entry) => String(parseScalar(entry)));
  }
  if (value === 'true') {
    return true;
  }
  if (value === 'false') {
    return false;
  }
  if (value === 'null') {
    return null;
  }
  const numberValue = Number(value);
  if (Number.isFinite(numberValue) && /^-?\d+(?:\.\d+)?$/.test(value)) {
    return numberValue;
  }
  return value;
}

function parseFrontmatter(content: string) {
  const normalized = content.replace(/\r\n/g, '\n');
  if (!normalized.startsWith('---\n')) {
    return {
      frontmatter: null,
      body: normalized,
      parseable: false,
    };
  }
  const closingIndex = normalized.indexOf('\n---', 4);
  if (closingIndex < 0) {
    return {
      frontmatter: null,
      body: normalized,
      parseable: false,
    };
  }
  const frontmatterText = normalized.slice(4, closingIndex);
  const afterClosing = normalized.slice(closingIndex + 4).replace(/^\n/, '');
  const frontmatter: JsonRecord = {};
  for (const line of frontmatterText.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const separatorIndex = trimmed.indexOf(':');
    if (separatorIndex < 0) {
      return {
        frontmatter: null,
        body: afterClosing,
        parseable: false,
      };
    }
    const key = trimmed.slice(0, separatorIndex).trim();
    if (!key) {
      return {
        frontmatter: null,
        body: afterClosing,
        parseable: false,
      };
    }
    frontmatter[key] = parseScalar(trimmed.slice(separatorIndex + 1));
  }
  return {
    frontmatter,
    body: afterClosing,
    parseable: true,
  };
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function walkMarkdownFiles(root: string) {
  const files: string[] = [];
  const visit = (directory: string) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === '.git' || entry.name === 'node_modules') {
        continue;
      }
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(entryPath);
        continue;
      }
      if (entry.isFile() && entry.name.endsWith('.md')) {
        files.push(normalizeRelativePath(path.relative(root, entryPath)));
      }
    }
  };
  visit(root);
  return files.sort((left, right) => left.localeCompare(right));
}

function normalizeMarkdownTarget(rawTarget: string, fromFile: string) {
  const target = rawTarget.trim();
  if (!target || /^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('#')) {
    return null;
  }
  const withoutAnchor = target.split('#')[0] ?? '';
  const withoutQuery = withoutAnchor.split('?')[0] ?? '';
  if (!withoutQuery || withoutQuery.endsWith('/')) {
    return null;
  }
  const withExtension = withoutQuery.endsWith('.md') ? withoutQuery : `${withoutQuery}.md`;
  if (withExtension.startsWith('/')) {
    return trimSlashes(path.posix.normalize(withExtension));
  }
  const fromDirectory = path.posix.dirname(fromFile);
  return trimSlashes(path.posix.normalize(path.posix.join(fromDirectory === '.' ? '' : fromDirectory, withExtension)));
}

function extractLinks(body: string) {
  const links: string[] = [];
  for (const match of body.matchAll(MARKDOWN_LINK_RE)) {
    if (match[0].startsWith('!')) {
      continue;
    }
    const target = match[1]?.trim();
    if (target) {
      links.push(target);
    }
  }
  for (const match of body.matchAll(WIKILINK_RE)) {
    const target = match[1]?.trim();
    if (target) {
      links.push(target);
    }
  }
  return links;
}

function linkWarnings(files: Array<{ path: string; links: string[] }>, knownPaths: Set<string>, knownConceptIds: Set<string>) {
  const warnings: OkfDiagnostic[] = [];
  for (const file of files) {
    for (const link of file.links) {
      const directTarget = link.trim().split('#')[0]?.split('?')[0] ?? '';
      const directPath = directTarget.endsWith('.md') ? directTarget : `${directTarget}.md`;
      if (knownConceptIds.has(directTarget) || knownPaths.has(directPath)) {
        continue;
      }
      const markdownTarget = normalizeMarkdownTarget(link, file.path);
      const wikiTarget = !markdownTarget && !link.includes('/') && !link.endsWith('.md') ? `${link}.md` : null;
      const target = markdownTarget ?? wikiTarget;
      if (!target) {
        continue;
      }
      const targetConceptId = conceptIdFromFile(target);
      if (!knownPaths.has(target) && !knownConceptIds.has(targetConceptId)) {
        warnings.push({
          code: 'okf_broken_link',
          file: file.path,
          link,
          message: 'OKF wikilink target is not present in this bundle.',
        });
      }
    }
  }
  return warnings;
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
