import fs from 'node:fs';
import path from 'node:path';

import {
  FORBIDDEN_AGENT_PACK_TEXT,
  REQUIRED_AGENT_PACK_SECTIONS,
} from '../standard-domain-agent-scaffold-constants.ts';
import {
  isPlainRecord,
  readOptionalString,
  readStringArray,
} from './shared.ts';

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

export function readStageAgentRefStatus(repoDir: string, relativePath: string) {
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

export function validateAgentPackFiles(repoDir: string, packCompilerInput: unknown, enforceToolAffordanceBoundary: boolean) {
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
  const sectionFindings = sectionStatus
    .filter((item) => item.status !== 'ok')
    .map((item) => `missing_agent_pack_section:${item.section}`);
  const toolSectionFindings = sectionFindings.filter((item) => item === 'missing_agent_pack_section:tools');
  const nonToolSectionFindings = sectionFindings.filter((item) => item !== 'missing_agent_pack_section:tools');
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
      ...nonToolSectionFindings,
      ...(enforceToolAffordanceBoundary ? toolSectionFindings : []),
    ].filter((entry): entry is string => Boolean(entry)),
    advisory_findings: enforceToolAffordanceBoundary ? [] : toolSectionFindings,
  };
}
