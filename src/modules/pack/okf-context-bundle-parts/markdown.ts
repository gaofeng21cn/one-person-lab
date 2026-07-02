import fs from 'node:fs';
import path from 'node:path';

import { FrameworkContractError } from '../../charter/contracts.ts';

export type OkfJsonPrimitive = string | number | boolean | null;
export type OkfJsonValue = OkfJsonPrimitive | OkfJsonValue[] | { [key: string]: OkfJsonValue };
export type OkfJsonRecord = Record<string, OkfJsonValue>;

type OkfFileRole = 'concept' | 'index' | 'log';

interface OkfIndexBodyInput {
  bundleId: string;
  title?: string;
  concepts: Array<{
    id: string;
    title?: string;
  }>;
}

interface OkfDiagnosticShape {
  code: string;
  file: string;
  message: string;
  link?: string;
}

export interface ParsedOkfFrontmatter {
  frontmatter: OkfJsonRecord | null;
  body: string;
  parseable: boolean;
}

const MARKDOWN_LINK_RE = /!?\[[^\]]*]\(([^)\s]+)(?:\s+["'][^)"']*["'])?\)/g;
const WIKILINK_RE = /\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?]]/g;
const NATIVE_FRONTMATTER_FORBIDDEN_TRUE_FIELDS = [
  'native_frontmatter_authorizes_domain_truth',
  'native_frontmatter_authorizes_memory_body_write',
  'native_frontmatter_authorizes_owner_receipt',
  'native_frontmatter_authorizes_typed_blocker',
  'native_frontmatter_authorizes_quality_or_export_verdict',
  'native_frontmatter_authorizes_artifact_authority',
  'native_frontmatter_authorizes_runtime_scheduling',
  'native_frontmatter_authorizes_readiness',
  'opl_owns_domain_truth',
  'opl_owns_domain_memory_body',
  'opl_accepts_or_rejects_domain_memory_writeback',
  'opl_applies_domain_memory_writeback',
  'opl_authorizes_quality_verdict',
  'opl_authorizes_domain_ready',
  'opl_authorizes_publication_or_submission_verdict',
  'opl_owns_artifact_authority',
  'opl_schedules_runtime_from_okf',
  'opl_can_write_domain_truth',
  'opl_can_write_memory_body',
  'opl_can_accept_or_reject_writeback',
  'opl_can_apply_memory_writeback',
  'opl_can_authorize_quality_verdict',
  'opl_can_authorize_domain_ready',
  'opl_can_authorize_publication_or_submission_verdict',
  'opl_can_write_artifacts',
  'opl_can_sign_owner_receipt',
  'opl_can_create_typed_blocker',
  'opl_can_schedule_runtime',
] as const;

export function normalizeRelativePath(filePath: string) {
  return filePath.split(path.sep).join('/');
}

function trimSlashes(value: string) {
  return value.replace(/^\/+/, '').replace(/\/+$/, '');
}

export function conceptIdFromFile(relativePath: string) {
  return relativePath.replace(/\.md$/i, '');
}

export function conceptPathFromId(conceptId: string) {
  const cleanId = trimSlashes(conceptId.trim());
  if (!cleanId || cleanId.includes('..')) {
    throw new FrameworkContractError('cli_usage_error', 'OKF concept id must be a bundle-relative path without parent traversal.', {
      concept_id: conceptId,
    });
  }
  return cleanId.endsWith('.md') ? cleanId : `${cleanId}.md`;
}

export function titleFromSlug(value: string) {
  return value
    .split(/[-_/]+/)
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ''}${part.slice(1)}`)
    .join(' ');
}

export function frontmatterString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

export function frontmatterRecord(value: unknown): OkfJsonRecord | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  return value as OkfJsonRecord;
}

export function readJsonRecordFile(filePath: string) {
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
  return parsed as OkfJsonRecord;
}

export function resolveSourcePath(repoRoot: string, sourcePath: string) {
  return path.isAbsolute(sourcePath) ? sourcePath : path.resolve(repoRoot, sourcePath);
}

export function domainRepoDefaultPackPath(repoRoot: string) {
  return path.join(repoRoot, 'contracts', 'pack_compiler_input.json');
}

export function domainRepoDefaultMemoryDescriptorPath(repoRoot: string) {
  return path.join(repoRoot, 'contracts', 'memory_descriptor.json');
}

export function domainPackPathKind(relativePath: string) {
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

export function slugFromDomainPackPath(relativePath: string) {
  const basename = path.posix.basename(relativePath.replaceAll('\\', '/'));
  return basename.replace(/\.md$/i, '');
}

export function stageJoinKey(slug: string) {
  return slug.replace(/-quality-gate$/i, '');
}

export function okfIndexBody(input: OkfIndexBodyInput) {
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

export function okfLogBody(bundleId: string) {
  return [
    `# ${bundleId} OKF Log`,
    '',
    '- created_by: one-person-lab',
    '- role: context_bundle_projection',
    '- authority: no_domain_truth_no_runtime_no_verdict',
    '',
  ].join('\n');
}

export function fileRole(relativePath: string): OkfFileRole {
  const basename = path.posix.basename(relativePath);
  if (basename === 'index.md') {
    return 'index';
  }
  if (basename === 'log.md') {
    return 'log';
  }
  return 'concept';
}

function scalarToFrontmatter(value: OkfJsonValue): string {
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

export function stringifyFrontmatter(frontmatter: OkfJsonRecord) {
  return [
    '---',
    ...Object.entries(frontmatter).map(([key, value]) => `${key}: ${scalarToFrontmatter(value)}`),
    '---',
  ].join('\n');
}

function parseScalar(rawValue: string): OkfJsonValue {
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

export function parseFrontmatter(content: string): ParsedOkfFrontmatter {
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
  const frontmatter: OkfJsonRecord = {};
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

export function walkMarkdownFiles(root: string) {
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

function fieldClaimsTrue(value: unknown) {
  return value === true || value === 'true';
}

export function forbiddenNativeFrontmatterClaimFields(frontmatter: OkfJsonRecord) {
  return NATIVE_FRONTMATTER_FORBIDDEN_TRUE_FIELDS.filter((field) => fieldClaimsTrue(frontmatter[field]));
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

export function extractLinks(body: string) {
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

export function linkWarnings(
  files: Array<{ path: string; links: string[] }>,
  knownPaths: Set<string>,
  knownConceptIds: Set<string>,
): OkfDiagnosticShape[] {
  const warnings: OkfDiagnosticShape[] = [];
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
