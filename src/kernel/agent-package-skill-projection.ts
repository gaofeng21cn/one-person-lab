import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

import { FrameworkContractError, isRecord } from './contract-validation.ts';
import { resolveOplStatePaths } from './runtime-state-paths.ts';

function sha256Text(text: string) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

export type AgentPackageSkillProjection = {
  surface_kind: 'opl_agent_package_skill_projection.v1';
  status: 'materialized';
  generation_id: string;
  projection_root: string;
  skills_root: string;
  root_package_id: string;
  source_refs?: string[];
  root_skill_ids: string[];
  core_skill_ids: string[];
  specialty_skill_ids: string[];
  skill_ids: string[];
  skill_digests: Record<string, string>;
  core_digest: string;
  full_export_digest: string;
};

function safeSkillId(value: string) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value) || path.basename(value) !== value) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Agent package Skill projection requires safe single-segment Skill ids.',
      { skill_id: value, failure_code: 'agent_package_skill_projection_id_unsafe' },
    );
  }
  return value;
}

function filesUnder(root: string) {
  const files: string[] = [];
  function visit(current: string) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      const stat = fs.lstatSync(absolute);
      if (stat.isSymbolicLink()) {
        throw new FrameworkContractError(
          'contract_shape_invalid',
          'Agent package Skill projection does not accept symbolic links.',
          { source_path: absolute, failure_code: 'agent_package_skill_projection_symlink_forbidden' },
        );
      }
      if (stat.isDirectory()) visit(absolute);
      else if (stat.isFile()) files.push(path.relative(root, absolute));
      else {
        throw new FrameworkContractError(
          'contract_shape_invalid',
          'Agent package Skill projection accepts only regular files and directories.',
          { source_path: absolute, failure_code: 'agent_package_skill_projection_entry_unsupported' },
        );
      }
    }
  }
  if (fs.existsSync(root)) visit(root);
  return files.sort();
}

function skillDigest(skillsRoot: string, skillId: string, skillRoot = path.join(skillsRoot, skillId)) {
  const records = filesUnder(skillRoot).map((relativePath) => {
    const bytes = fs.readFileSync(path.join(skillRoot, relativePath));
    return `${skillId}/${relativePath}\0${bytes.toString('base64')}`;
  });
  return `sha256:${sha256Text(records.join('\0'))}`;
}

function combinedDigest(skillDigests: Record<string, string>, skillIds: string[]) {
  return `sha256:${sha256Text(JSON.stringify(
    skillIds.map((skillId) => [skillId, skillDigests[skillId]]),
  ))}`;
}

function assertProjectionBytes(
  projection: AgentPackageSkillProjection,
  verifyPersistedLocator = true,
) {
  const projectionParent = path.join(
    resolveOplStatePaths().state_dir,
    'agent-package-skill-projections',
  );
  const expectedProjectionRoot = path.join(projectionParent, projection.generation_id);
  if (!path.isAbsolute(projection.projection_root)
    || !/^[a-f0-9]{64}$/.test(projection.generation_id)
    || (verifyPersistedLocator && projection.projection_root !== expectedProjectionRoot)
    || projection.skills_root !== path.join(projection.projection_root, '.agents', 'skills')) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Agent package Skill projection locator is invalid.',
      {
        projection_root: projection.projection_root,
        skills_root: projection.skills_root,
        failure_code: 'agent_package_skill_projection_locator_invalid',
      },
    );
  }
  for (const skillId of projection.skill_ids) {
    safeSkillId(skillId);
    const entry = path.join(projection.skills_root, skillId, 'SKILL.md');
    if (!fs.existsSync(entry) || !fs.statSync(entry).isFile()) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'Agent package Skill projection is missing a declared Skill entrypoint.',
        { skill_id: skillId, skill_entry: entry, failure_code: 'agent_package_skill_projection_entry_missing' },
      );
    }
    const actual = skillDigest(projection.skills_root, skillId);
    if (actual !== projection.skill_digests[skillId]) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'Agent package Skill projection bytes do not match the bound generation.',
        {
          skill_id: skillId,
          expected_digest: projection.skill_digests[skillId],
          actual_digest: actual,
          failure_code: 'agent_package_skill_projection_digest_mismatch',
        },
      );
    }
  }
  if (combinedDigest(projection.skill_digests, projection.core_skill_ids) !== projection.core_digest
    || combinedDigest(projection.skill_digests, projection.skill_ids) !== projection.full_export_digest) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Agent package Skill projection closure digest is invalid.',
      { failure_code: 'agent_package_skill_projection_closure_mismatch' },
    );
  }
  return projection;
}

export function assertAgentPackageSkillProjection(value: AgentPackageSkillProjection) {
  if (value.surface_kind !== 'opl_agent_package_skill_projection.v1'
    || value.status !== 'materialized') {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Hosted execution requires a materialized Agent package Skill projection.',
      {
        surface_kind: value.surface_kind,
        status: value.status,
        failure_code: 'agent_package_skill_projection_not_materialized',
      },
    );
  }
  return assertProjectionBytes(value);
}

export function agentPackageSkillProjectionFromUnknown(
  value: unknown,
): AgentPackageSkillProjection | null {
  if (value === null || value === undefined) return null;
  if (!isRecord(value)
    || value.surface_kind !== 'opl_agent_package_skill_projection.v1'
    || value.status !== 'materialized'
    || typeof value.generation_id !== 'string'
    || typeof value.projection_root !== 'string'
    || typeof value.skills_root !== 'string'
    || typeof value.root_package_id !== 'string'
    || (value.source_refs !== undefined && !Array.isArray(value.source_refs))
    || !Array.isArray(value.root_skill_ids)
    || !Array.isArray(value.core_skill_ids)
    || !Array.isArray(value.specialty_skill_ids)
    || !Array.isArray(value.skill_ids)
    || !isRecord(value.skill_digests)
    || typeof value.core_digest !== 'string'
    || typeof value.full_export_digest !== 'string') {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Agent package Skill projection binding is malformed.',
      { failure_code: 'agent_package_skill_projection_binding_invalid' },
    );
  }
  const stringLists = [
    value.source_refs ?? [],
    value.root_skill_ids,
    value.core_skill_ids,
    value.specialty_skill_ids,
    value.skill_ids,
  ];
  if (stringLists.some((entries) => entries.some((entry) => typeof entry !== 'string'))
    || Object.values(value.skill_digests).some((digest) => typeof digest !== 'string')) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Agent package Skill projection binding has invalid list or digest values.',
      { failure_code: 'agent_package_skill_projection_binding_invalid' },
    );
  }
  return value as AgentPackageSkillProjection;
}

export function agentPackageSkillProjectionFiles(projection: AgentPackageSkillProjection) {
  assertAgentPackageSkillProjection(projection);
  return projection.skill_ids.flatMap((skillId) => filesUnder(path.join(projection.skills_root, skillId)).map(
    (relativePath) => ({
      relative_path: path.join(skillId, relativePath),
      bytes: fs.readFileSync(path.join(projection.skills_root, skillId, relativePath)),
      executable: Boolean(fs.statSync(path.join(projection.skills_root, skillId, relativePath)).mode & 0o111),
    }),
  ));
}

export { assertProjectionBytes, combinedDigest, filesUnder, safeSkillId, skillDigest };
