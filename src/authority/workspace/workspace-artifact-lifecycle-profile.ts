import fs from 'node:fs';
import path from 'node:path';

import { isRecord } from '../../kernel/contract-validation.ts';
import { readStandardAgentDescriptorForDomainFromPackagePort } from '../../kernel/agent-package-readiness-port.ts';
import { readJsonPayloadFile } from '../../kernel/json-file.ts';
import { resolveContainedRepoJsonFile } from '../../kernel/repo-contained-json-file.ts';

export const ARTIFACT_LIFECYCLE_PROFILE_REF = 'control/opl/artifact_lifecycle/artifact_lifecycle_profile.json';

export type ArtifactOutputGroup = { ref: string; role: string };

export function artifactOutputGroups(value: unknown, projectRoot: string): ArtifactOutputGroup[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error('output_groups must be an array of project-relative refs and roles.');
  const roots = new Set<string>();
  return value.map((entry) => {
    if (!isRecord(entry) || typeof entry.ref !== 'string' || typeof entry.role !== 'string'
      || !entry.role.trim() || !entry.ref || entry.ref.includes('\\') || entry.ref.includes('\0')
      || path.isAbsolute(entry.ref) || /^[a-z][a-z0-9+.-]*:/i.test(entry.ref)
      || entry.ref.split('/').some((segment) => !segment || segment === '.' || segment === '..')
      || roots.has(entry.ref)) {
      throw new Error('output_groups require unique canonical project-relative refs and non-empty roles.');
    }
    roots.add(entry.ref);
    const absolute = path.join(projectRoot, entry.ref);
    if (fs.existsSync(absolute)) {
      const relative = path.relative(fs.realpathSync(projectRoot), fs.realpathSync(absolute));
      if (relative.startsWith('..') || path.isAbsolute(relative)) {
        throw new Error(`output_groups ref escapes its project: ${entry.ref}`);
      }
    }
    return { ref: entry.ref, role: entry.role.trim() };
  });
}

export function initializeArtifactLifecycleProfile(projectRoot: string, agentId: string): string | null {
  const target = path.join(projectRoot, ARTIFACT_LIFECYCLE_PROFILE_REF);
  if (fs.existsSync(target)) return null;
  const descriptor = readStandardAgentDescriptorForDomainFromPackagePort(agentId);
  if (!descriptor) return null;
  const source = readJsonPayloadFile(path.join(descriptor.repo_dir, 'contracts/domain_descriptor.json'));
  const refs = isRecord(source) && isRecord(source.standard_contract_refs) ? source.standard_contract_refs : {};
  const profileRef = refs.artifact_lifecycle_profile;
  if (profileRef === undefined) return null;
  if (typeof profileRef !== 'string') throw new Error('artifact_lifecycle_profile must be a repo-relative JSON ref.');
  const resolved = resolveContainedRepoJsonFile(descriptor.repo_dir, profileRef, 'Artifact lifecycle profile');
  const profile = readJsonPayloadFile(resolved.real_path);
  if (!isRecord(profile)) throw new Error('Artifact lifecycle profile must be a JSON object.');
  artifactOutputGroups(profile.output_groups, projectRoot);
  let existingParent = path.dirname(target);
  while (!fs.existsSync(existingParent)) existingParent = path.dirname(existingParent);
  const relativeParent = path.relative(fs.realpathSync(projectRoot), fs.realpathSync(existingParent));
  if (relativeParent.startsWith('..') || path.isAbsolute(relativeParent)) {
    throw new Error('Artifact lifecycle profile target escapes its project.');
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(profile, null, 2)}\n`, { flag: 'wx' });
  return target;
}
