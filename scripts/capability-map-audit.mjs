#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

import {
  isJsonObject,
  readJsonFile,
  stringList,
} from './script-json-boundary.mjs';

const LOCAL_REF_PREFIXES = ['external_repo:', 'opl-framework:', 'human_doc:', 'runtime:', 'policy:', 'contract:'];

function refPath(ref) {
  const value = String(ref ?? '').trim();
  if (!value || LOCAL_REF_PREFIXES.some((prefix) => value.startsWith(prefix))) return null;
  const withoutAnchor = value.split('#')[0];
  if (!withoutAnchor || withoutAnchor.includes(':')) return null;
  return withoutAnchor;
}

function pathsFor(capability) {
  const physicalSourceRef = isJsonObject(capability.physical_source_ref)
    ? refPath(capability.physical_source_ref.ref)
    : null;
  return [
    ...(physicalSourceRef ? [physicalSourceRef] : []),
    ...stringList(capability.canonical_target_paths),
    ...stringList(capability.canonical_paths),
    ...stringList(capability.canonical_path),
    ...stringList(capability.skill_ref),
  ];
}

function capabilityKind(capability) {
  return capability.capability_kind
    ?? capability.kind
    ?? capability.surface_role
    ?? (capability.module_id ? 'professional_skill' : null);
}

function ownerFor(capability, map) {
  return capability.canonical_owner ?? capability.owner ?? map.canonical_owner ?? map.owner ?? null;
}

function ownerBoundaryFor(capability, map) {
  return capability.owner_closeout_boundary
    ?? capability.owner_closeout_boundary_ref
    ?? map.owner_closeout_boundary
    ?? capability.authority_boundary
    ?? map.authority_boundary
    ?? null;
}

function forbiddenFor(capability, map) {
  const entryForbidden = stringList(capability.forbidden_surfaces);
  if (entryForbidden.length > 0) return entryForbidden;
  const boundary = isJsonObject(capability.authority_boundary) ? capability.authority_boundary : map.authority_boundary;
  if (!isJsonObject(boundary)) return [];
  return Object.entries(boundary)
    .filter(([key, value]) => key.startsWith('can_') && value === false)
    .map(([key]) => key);
}

function capabilitiesFor(map) {
  if (Array.isArray(map.capabilities)) return map.capabilities;
  if (Array.isArray(map.professional_capabilities)) return map.professional_capabilities;
  return [];
}

function verificationRefsFor(capability, map) {
  const explicitRefs = stringList(capability.verification_refs);
  if (explicitRefs.length > 0) return explicitRefs;

  const runtimeProjectionRefs = Array.isArray(capability.runtime_projection_refs)
    ? capability.runtime_projection_refs
      .filter(isJsonObject)
      .map((entry) => (typeof entry.ref === 'string' ? entry.ref : null))
      .filter(Boolean)
    : [];
  if (runtimeProjectionRefs.length > 0) return runtimeProjectionRefs;

  return stringList(map.source_of_truth_refs);
}

function defaultRepos() {
  const workspace = path.resolve(process.cwd(), '..');
  return [
    'opl-meta-agent',
    'med-autoscience',
    'mas-scholar-skills',
    'redcube-ai',
    'med-autogrant',
    'opl-bookforge',
  ]
    .map((name) => path.join(workspace, name))
    .filter((repo) => fs.existsSync(path.join(repo, 'contracts', 'capability_map.json')));
}

function auditRepo(repoDir) {
  const mapPath = path.join(repoDir, 'contracts', 'capability_map.json');
  const repo = path.basename(repoDir);
  if (!fs.existsSync(mapPath)) {
    return { repo, repo_dir: repoDir, status: 'skipped', blockers: [`missing:${mapPath}`], warnings: [] };
  }
  const map = readJsonFile(mapPath);
  const capabilities = capabilitiesFor(map);
  const blockers = [];
  const warnings = [];
  const seenIds = new Set();

  if (capabilities.length === 0) blockers.push('capability_map_has_no_capabilities');

  for (const [index, capability] of capabilities.entries()) {
    if (!isJsonObject(capability)) {
      blockers.push(`capability_${index}:not_object`);
      continue;
    }
    const id = typeof capability.capability_id === 'string' && capability.capability_id.trim()
      ? capability.capability_id.trim()
      : `capability_${index}`;
    if (seenIds.has(id)) blockers.push(`${id}:duplicate_capability_id`);
    seenIds.add(id);

    if (id === `capability_${index}`) blockers.push(`${id}:missing_capability_id`);
    if (!capabilityKind(capability)) blockers.push(`${id}:missing_capability_kind`);
    if (!ownerFor(capability, map)) blockers.push(`${id}:missing_owner`);

    const canonicalPaths = pathsFor(capability);
    if (canonicalPaths.length === 0) blockers.push(`${id}:missing_canonical_paths`);
    for (const candidate of canonicalPaths) {
      const localPath = refPath(candidate);
      if (localPath && !fs.existsSync(path.join(repoDir, localPath))) {
        blockers.push(`${id}:missing_canonical_path:${candidate}`);
      }
    }

    const verificationRefs = verificationRefsFor(capability, map);
    if (verificationRefs.length === 0) blockers.push(`${id}:missing_verification_refs`);
    for (const ref of verificationRefs) {
      const localPath = refPath(ref);
      if (localPath && !fs.existsSync(path.join(repoDir, localPath))) {
        blockers.push(`${id}:missing_verification_ref:${ref}`);
      }
    }

    if (forbiddenFor(capability, map).length === 0) blockers.push(`${id}:missing_forbidden_surfaces`);
    if (!ownerBoundaryFor(capability, map)) blockers.push(`${id}:missing_owner_closeout_boundary`);
  }

  const owners = capabilities.map((capability) => ownerFor(capability, map)).filter(Boolean);
  const duplicateOwners = [...new Set(owners.filter((owner, index) => owners.indexOf(owner) !== index))];
  if (duplicateOwners.length > 0) {
    warnings.push(`duplicate_owner_values:${duplicateOwners.join(',')}`);
  }

  return {
    repo,
    repo_dir: repoDir,
    status: blockers.length === 0 ? 'passed' : 'blocked',
    capability_count: capabilities.length,
    blockers,
    warnings,
  };
}

const args = process.argv.slice(2);
const json = args.includes('--json');
const repos = args.filter((arg) => arg !== '--json').map((arg) => path.resolve(arg));
const targets = repos.length > 0 ? repos : defaultRepos();
const results = targets.map(auditRepo);
const payload = {
  surface_kind: 'opl_capability_map_cross_repo_audit',
  version: 'opl.capability-map-audit.v1',
  status: results.every((result) => result.status === 'passed' || result.status === 'skipped') ? 'passed' : 'blocked',
  checked_repo_count: results.length,
  results,
};

if (json) {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
} else {
  for (const result of results) {
    process.stdout.write(`${result.status}\t${result.repo}\t${result.blockers.join(',')}\n`);
  }
}

process.exit(payload.status === 'passed' ? 0 : 1);
