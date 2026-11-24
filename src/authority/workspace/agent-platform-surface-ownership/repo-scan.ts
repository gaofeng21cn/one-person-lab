import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { resolveStandardAgent } from '../../contracts/index.ts';
import { isRecord } from '../../../kernel/contract-validation.ts';
import { readJsonFileResult } from '../../../kernel/json-file.ts';
import {
  stringValue as optionalString,
  uniqueStringList,
} from '../../../kernel/json-record.ts';

export function readJsonFile(repoDir: string, relativePath: string) {
  const absolutePath = path.join(repoDir, relativePath);
  const result = readJsonFileResult(absolutePath);
  return {
    path: relativePath,
    status: result.status,
    payload: result.payload,
    error: result.error,
  };
}

export function normalizeDomainSelection(value: string) {
  return resolveStandardAgent(value)?.domain_id ?? value.trim().toLowerCase();
}

export function readDomainId(repoDir: string, fallback: string | null) {
  const descriptor = readJsonFile(repoDir, 'contracts/domain_descriptor.json').payload;
  if (!isRecord(descriptor)) {
    return fallback ?? path.basename(repoDir);
  }
  return optionalString(descriptor.domain_id)
    ?? optionalString(descriptor.domain_label)
    ?? fallback
    ?? path.basename(repoDir);
}

export function gitTrackedOrWalkedFiles(repoDir: string) {
  const gitResult = spawnSync('git', ['ls-files'], {
    cwd: repoDir,
    encoding: 'utf8',
  });
  if (gitResult.status === 0 && gitResult.stdout.trim()) {
    return gitResult.stdout.split('\n').filter(Boolean).sort();
  }
  return walkFiles(repoDir).sort();
}

function walkFiles(root: string, current = root): string[] {
  if (!fs.existsSync(current)) {
    return [];
  }
  return fs.readdirSync(current, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name.startsWith('.git') || entry.name === 'node_modules' || entry.name === 'dist') {
      return [];
    }
    const absolutePath = path.join(current, entry.name);
    if (entry.isDirectory()) {
      return walkFiles(root, absolutePath);
    }
    if (!entry.isFile()) {
      return [];
    }
    return [path.relative(root, absolutePath).split(path.sep).join('/')];
  });
}

function codeFile(pathname: string) {
  return /\.(py|ts|tsx|js|mjs|cjs|json)$/i.test(pathname)
    || pathname === 'Makefile'
    || pathname === 'package.json'
    || pathname === 'pyproject.toml';
}

export function activeProgramFiles(repoDir: string) {
  return gitTrackedOrWalkedFiles(repoDir).filter((relativePath) => (
    codeFile(relativePath)
    && !relativePath.startsWith('docs/')
    && !relativePath.startsWith('tests/fixtures/')
    && !relativePath.startsWith('node_modules/')
    && !relativePath.startsWith('dist/')
  ));
}

function proseFile(pathname: string) {
  return /^README(?:\.[\w-]+)?\.md$/i.test(pathname) || (
    pathname.startsWith('docs/')
    && /\.md$/i.test(pathname)
  );
}

function searchableRecords(value: unknown, currentPath = '$'): Array<{ path: string; text: string }> {
  if (typeof value === 'string') {
    return [{ path: currentPath, text: value }];
  }
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => searchableRecords(entry, `${currentPath}[${index}]`));
  }
  if (!isRecord(value)) {
    return [];
  }
  return Object.entries(value).flatMap(([field, fieldValue]) => (
    searchableRecords(fieldValue, `${currentPath}.${field}`)
  ));
}

function scalarRecords(value: unknown, currentPath = '$'): Array<{ path: string; value: unknown }> {
  if (
    typeof value === 'string'
    || typeof value === 'boolean'
    || typeof value === 'number'
    || value === null
  ) {
    return [{ path: currentPath, value }];
  }
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => scalarRecords(entry, `${currentPath}[${index}]`));
  }
  if (!isRecord(value)) {
    return [];
  }
  return Object.entries(value).flatMap(([field, fieldValue]) => (
    scalarRecords(fieldValue, `${currentPath}.${field}`)
  ));
}

export function surfaceTextFromContracts(repoDir: string) {
  const paths = [
    'contracts/functional_privatization_audit.json',
    'contracts/generated_surface_handoff.json',
    'contracts/private_functional_surface_policy.json',
    'contracts/physical_source_morphology_policy.json',
    'contracts/workspace_lifecycle_policy.json',
  ];
  return paths.flatMap((relativePath) => {
    const file = readJsonFile(repoDir, relativePath);
    return searchableRecords(file.payload).map((entry) => ({
      source_path: relativePath,
      json_path: entry.path,
      text: entry.text,
    }));
  });
}

export function diagnosticRefsForSubdomain(repoDir: string, aliases: readonly string[]) {
  const normalizedAliases = aliases.map((alias) => alias.toLowerCase());
  const filenameRefs = activeProgramFiles(repoDir)
    .filter((relativePath) => normalizedAliases.some((alias) => (
      relativePath.toLowerCase().includes(alias.replace(/_/g, '-'))
      || relativePath.toLowerCase().includes(alias)
    )))
    .slice(0, 12);
  const contractRefs = surfaceTextFromContracts(repoDir)
    .filter((entry) => normalizedAliases.some((alias) => entry.text.toLowerCase().includes(alias)))
    .map((entry) => `${entry.source_path}${entry.json_path === '$' ? '' : `#${entry.json_path}`}`);
  const proseRefs = gitTrackedOrWalkedFiles(repoDir)
    .filter(proseFile)
    .filter((relativePath) => {
      try {
        const text = fs.readFileSync(path.join(repoDir, relativePath), 'utf8').toLowerCase();
        return normalizedAliases.some((alias) => text.includes(alias.replace(/_/g, ' '))
          || text.includes(alias.replace(/_/g, '-'))
          || text.includes(alias));
      } catch {
        return false;
      }
    })
    .slice(0, 12);
  return uniqueStringList([
    ...filenameRefs.slice(0, 8),
    ...contractRefs.slice(0, 8),
    ...proseRefs.slice(0, 8),
  ]);
}

export function hardGateEvidenceRefs(repoDir: string) {
  const audit = readJsonFile(repoDir, 'contracts/functional_privatization_audit.json');
  const auditMorphology = isRecord(audit.payload)
    && isRecord(audit.payload.physical_source_morphology_policy)
    && isRecord(audit.payload.physical_source_morphology_policy.authority_boundary);
  return [
    audit.status === 'resolved'
      ? 'contracts/functional_privatization_audit.json#authority_boundary'
      : null,
    auditMorphology
      ? 'contracts/functional_privatization_audit.json#/physical_source_morphology_policy/authority_boundary'
      : null,
    'contracts/private_functional_surface_policy.json#authority_boundary',
    'contracts/physical_source_morphology_policy.json#authority_boundary',
  ].filter((ref): ref is string => (
    typeof ref === 'string' && fs.existsSync(path.join(repoDir, ref.split('#')[0]))
  ));
}

export function explicitForbiddenOwnerClaims(repoDir: string) {
  const files = [
    readJsonFile(repoDir, 'contracts/functional_privatization_audit.json'),
    readJsonFile(repoDir, 'contracts/private_functional_surface_policy.json'),
    readJsonFile(repoDir, 'contracts/physical_source_morphology_policy.json'),
  ];
  return files.flatMap((file) => {
    const values = scalarRecords(file.payload);
    return values.flatMap((entry) => {
      const field = entry.path.toLowerCase();
      const text = String(entry.value).toLowerCase();
      const fieldClaimsGeneric =
        field.includes('domain_can_claim_generic_runtime_owner')
        || field.includes('domain_repo_can_own_generated_surface')
        || field.includes('can_own_generic_runtime')
        || field.includes('can_own_generated_wrapper')
        || field.includes('generated_surface_owner_in_domain_repo')
        || field.includes('generic_runtime_owner');
      const textClaimsGeneric = [
        'generic_runtime_owner:true',
        'generated_surface_owner_in_domain_repo:true',
        'domain repo owns generated wrapper',
        'domain_repo_can_own_generated_surface:true',
        'can own generic runtime:true',
      ].some((token) => text.includes(token));
      if (!fieldClaimsGeneric && !textClaimsGeneric) {
        return [];
      }
      if (entry.value === false || entry.value === 0 || entry.value === null) {
        return [];
      }
      const rawValue = String(entry.value).trim();
      if (!rawValue || rawValue === 'false' || rawValue === '0') {
        return [];
      }
      return [{
        source_path: file.path,
        json_path: entry.path,
        value: rawValue,
      }];
    });
  });
}

export function readDeclaredAuthorityBoundary(repoDir: string) {
  const audit = readJsonFile(repoDir, 'contracts/functional_privatization_audit.json');
  const auditAuthority = isRecord(audit.payload) && isRecord(audit.payload.authority_boundary)
    ? audit.payload.authority_boundary
    : {};
  const workspacePolicy = readJsonFile(repoDir, 'contracts/workspace_lifecycle_policy.json');
  const workspaceAuthority = isRecord(workspacePolicy.payload) && isRecord(workspacePolicy.payload.authority_boundary)
    ? workspacePolicy.payload.authority_boundary
    : {};
  return {
    domain_can_claim_generic_runtime_owner:
      auditAuthority.domain_can_claim_generic_runtime_owner ?? null,
    domain_repo_can_own_generated_surface:
      auditAuthority.domain_repo_can_own_generated_surface ?? null,
    opl_can_write_domain_truth:
      auditAuthority.opl_can_write_domain_truth ?? workspaceAuthority.opl_can_write_domain_truth ?? null,
    opl_can_write_memory_body:
      auditAuthority.opl_can_write_memory_body ?? workspaceAuthority.opl_can_write_memory_body ?? null,
    opl_can_authorize_quality_or_export:
      auditAuthority.opl_can_authorize_quality_or_export ?? workspaceAuthority.opl_can_authorize_quality_or_export ?? null,
    opl_can_mutate_domain_artifact_body:
      workspaceAuthority.opl_can_mutate_domain_artifact_body ?? null,
  };
}
