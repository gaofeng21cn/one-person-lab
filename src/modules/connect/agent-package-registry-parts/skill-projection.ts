import fs from 'node:fs';
import path from 'node:path';

import { FrameworkContractError } from '../../../kernel/contract-validation.ts';
import {
  ensureOplStateDir,
  resolveOplStatePaths,
} from '../../../kernel/runtime-state-paths.ts';
import {
  assertSafePersistedPackagePath,
  removeSafePersistedPackagePath,
} from './persisted-path-safety.ts';
import { sha256Text } from './shared.ts';
import type {
  AgentPackageLock,
  AgentPackageSkillProjection,
} from './types.ts';
import { assertDeveloperCheckoutPluginCacheGeneration } from './physical-surface.ts';

type SkillSource = {
  skillId: string;
  sourceRoot: string;
  packageLockRef: string;
  installMode: 'root_required' | 'core_required' | 'optional_named_specialty';
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function safeSkillId(value: string) {
  if (!value || value === '.' || value === '..' || path.basename(value) !== value) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Agent package Skill projection requires safe single-segment Skill ids.',
      {
        skill_id: value,
        failure_code: 'agent_package_skill_projection_id_unsafe',
      },
    );
  }
  return value;
}

function pluginSourceRoot(lock: AgentPackageLock) {
  const physical = lock.physical_surface;
  const root = lock.source_kind === 'developer_checkout_override'
    ? physical?.codex_plugin_cache_path ?? physical?.plugin_source_path
    : physical?.plugin_source_path ?? physical?.codex_plugin_cache_path;
  if (!root || !path.isAbsolute(root)) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Agent package Skill projection requires an immutable physical package source.',
      {
        package_id: lock.package_id,
        package_lock_ref: lock.lock_ref,
        failure_code: 'agent_package_skill_projection_source_missing',
      },
    );
  }
  const resolved = path.resolve(root);
  if (lock.source_kind === 'developer_checkout_override') {
    if (!lock.developer_checkout_source) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'Developer package Skill projection requires its captured package source identity.',
        {
          package_id: lock.package_id,
          package_lock_ref: lock.lock_ref,
          failure_code: 'agent_package_skill_projection_source_invalid',
        },
      );
    }
    assertDeveloperCheckoutPluginCacheGeneration({
      packageId: lock.package_id,
      cachePath: resolved,
      source: lock.developer_checkout_source,
    });
  }
  return resolved;
}

function skillSources(lock: AgentPackageLock, rootPackage: boolean): SkillSource[] {
  const sourceRoot = pluginSourceRoot(lock);
  const exports = lock.capability_provider?.exports ?? [];
  if (exports.length > 0) {
    return exports.map((entry) => ({
      skillId: safeSkillId(entry.skill_id),
      sourceRoot,
      packageLockRef: lock.lock_ref,
      installMode: entry.install_mode,
    }));
  }
  return (lock.bundled_required_skill_ids ?? []).map((skillId) => ({
    skillId: safeSkillId(skillId),
    sourceRoot,
    packageLockRef: lock.lock_ref,
    installMode: rootPackage ? 'root_required' : 'core_required',
  }));
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
          {
            source_path: absolute,
            failure_code: 'agent_package_skill_projection_symlink_forbidden',
          },
        );
      }
      if (stat.isDirectory()) visit(absolute);
      else if (stat.isFile()) files.push(path.relative(root, absolute));
      else {
        throw new FrameworkContractError(
          'contract_shape_invalid',
          'Agent package Skill projection accepts only regular files and directories.',
          {
            source_path: absolute,
            failure_code: 'agent_package_skill_projection_entry_unsupported',
          },
        );
      }
    }
  }
  if (fs.existsSync(root)) visit(root);
  return files.sort();
}

function skillDigest(skillsRoot: string, skillId: string) {
  const skillRoot = path.join(skillsRoot, skillId);
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

function copySkillTree(sourceRoot: string, targetRoot: string) {
  fs.mkdirSync(targetRoot, { recursive: true, mode: 0o755 });
  for (const entry of fs.readdirSync(sourceRoot, { withFileTypes: true })) {
    const source = path.join(sourceRoot, entry.name);
    const target = path.join(targetRoot, entry.name);
    const stat = fs.lstatSync(source);
    if (stat.isSymbolicLink()) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'Agent package Skill projection does not accept symbolic links.',
        { source_path: source, failure_code: 'agent_package_skill_projection_symlink_forbidden' },
      );
    }
    if (stat.isDirectory()) copySkillTree(source, target);
    else if (stat.isFile()) {
      fs.copyFileSync(source, target, fs.constants.COPYFILE_FICLONE);
      fs.chmodSync(target, stat.mode & 0o111 ? 0o555 : 0o444);
    } else {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'Agent package Skill projection accepts only regular files and directories.',
        { source_path: source, failure_code: 'agent_package_skill_projection_entry_unsupported' },
      );
    }
  }
  fs.chmodSync(targetRoot, 0o555);
}

function makeTreeWritable(root: string) {
  if (!fs.existsSync(root)) return;
  const stat = fs.lstatSync(root);
  if (stat.isDirectory()) {
    fs.chmodSync(root, 0o755);
    for (const entry of fs.readdirSync(root)) makeTreeWritable(path.join(root, entry));
  } else if (!stat.isSymbolicLink()) {
    fs.chmodSync(root, 0o644);
  }
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
        {
          skill_id: skillId,
          skill_entry: entry,
          failure_code: 'agent_package_skill_projection_entry_missing',
        },
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

export function assertAgentPackageSkillProjection(
  value: AgentPackageSkillProjection,
) {
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
    || (value.status !== 'materialized' && value.status !== 'planned_no_write')
    || typeof value.generation_id !== 'string'
    || typeof value.projection_root !== 'string'
    || typeof value.skills_root !== 'string'
    || typeof value.root_package_id !== 'string'
    || !Array.isArray(value.package_lock_refs)
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
    value.package_lock_refs,
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

export function projectionFiles(projection: AgentPackageSkillProjection) {
  assertAgentPackageSkillProjection(projection);
  return projection.skill_ids.flatMap((skillId) => filesUnder(path.join(projection.skills_root, skillId)).map(
    (relativePath) => ({
      relative_path: path.join(skillId, relativePath),
      bytes: fs.readFileSync(path.join(projection.skills_root, skillId, relativePath)),
      executable: Boolean(fs.statSync(path.join(projection.skills_root, skillId, relativePath)).mode & 0o111),
    }),
  ));
}

export function materializeAgentPackageSkillProjection(input: {
  root: AgentPackageLock;
  providers: AgentPackageLock[];
  dryRun: boolean;
}): AgentPackageSkillProjection | null {
  const sources = [
    ...skillSources(input.root, true),
    ...input.providers.flatMap((provider) => skillSources(provider, false)),
  ];
  if (sources.length === 0) return null;

  const sourceBySkillId = new Map<string, SkillSource>();
  const skillDigests: Record<string, string> = {};
  for (const source of sources) {
    const sourceSkillRoot = path.join(source.sourceRoot, 'skills', source.skillId);
    if (!fs.existsSync(path.join(sourceSkillRoot, 'SKILL.md'))) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'Agent package Skill projection source is missing a declared Skill.',
        {
          package_lock_ref: source.packageLockRef,
          skill_id: source.skillId,
          source_skill_root: sourceSkillRoot,
          failure_code: 'agent_package_skill_projection_source_skill_missing',
        },
      );
    }
    const digest = skillDigest(path.join(source.sourceRoot, 'skills'), source.skillId);
    const previous = sourceBySkillId.get(source.skillId);
    if (previous && skillDigests[source.skillId] !== digest) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'Agent package Skill projection has conflicting providers for one Skill id.',
        {
          skill_id: source.skillId,
          package_lock_refs: [previous.packageLockRef, source.packageLockRef],
          failure_code: 'agent_package_skill_projection_provider_conflict',
        },
      );
    }
    sourceBySkillId.set(source.skillId, previous ?? source);
    skillDigests[source.skillId] = digest;
  }

  const rootSkillIds = [...new Set(sources
    .filter((source) => source.installMode === 'root_required')
    .map((source) => source.skillId))].sort();
  const coreSkillIds = [...new Set(sources
    .filter((source) => source.installMode !== 'optional_named_specialty')
    .map((source) => source.skillId))].sort();
  const specialtySkillIds = [...new Set(sources
    .filter((source) => source.installMode === 'optional_named_specialty')
    .map((source) => source.skillId))].sort();
  const skillIds = [...new Set([...coreSkillIds, ...specialtySkillIds])].sort();
  const packageLockRefs = [input.root, ...input.providers]
    .map((lock) => lock.lock_ref)
    .sort();
  const coreDigest = combinedDigest(skillDigests, coreSkillIds);
  const fullExportDigest = combinedDigest(skillDigests, skillIds);
  const generationId = sha256Text(JSON.stringify({
    surface_kind: 'opl_agent_package_skill_projection.v1',
    root_package_id: input.root.package_id,
    package_lock_refs: packageLockRefs,
    core_digest: coreDigest,
    full_export_digest: fullExportDigest,
  }));
  const state = input.dryRun ? resolveOplStatePaths() : ensureOplStateDir();
  const projectionParent = path.join(state.state_dir, 'agent-package-skill-projections');
  if (!input.dryRun) fs.mkdirSync(projectionParent, { recursive: true });
  const projectionRoot = assertSafePersistedPackagePath({
    candidatePath: path.join(projectionParent, generationId),
    allowedRoots: [projectionParent],
    pathKind: 'agent_package_skill_projection.generation_root',
  });
  const projection: AgentPackageSkillProjection = {
    surface_kind: 'opl_agent_package_skill_projection.v1',
    status: input.dryRun ? 'planned_no_write' : 'materialized',
    generation_id: generationId,
    projection_root: projectionRoot,
    skills_root: path.join(projectionRoot, '.agents', 'skills'),
    root_package_id: input.root.package_id,
    package_lock_refs: packageLockRefs,
    root_skill_ids: rootSkillIds,
    core_skill_ids: coreSkillIds,
    specialty_skill_ids: specialtySkillIds,
    skill_ids: skillIds,
    skill_digests: Object.fromEntries(skillIds.map((skillId) => [skillId, skillDigests[skillId]])),
    core_digest: coreDigest,
    full_export_digest: fullExportDigest,
  };
  if (input.dryRun) return projection;
  if (fs.existsSync(projectionRoot)) return assertProjectionBytes(projection);

  const stageRoot = fs.mkdtempSync(path.join(projectionParent, '.staging-'));
  try {
    const stageSkillsRoot = path.join(stageRoot, '.agents', 'skills');
    for (const skillId of skillIds) {
      const source = sourceBySkillId.get(skillId)!;
      copySkillTree(
        path.join(source.sourceRoot, 'skills', skillId),
        path.join(stageSkillsRoot, skillId),
      );
    }
    const stagedProjection = {
      ...projection,
      projection_root: stageRoot,
      skills_root: stageSkillsRoot,
    };
    assertProjectionBytes(stagedProjection, false);
    fs.writeFileSync(
      path.join(stageRoot, 'projection.json'),
      `${JSON.stringify(projection, null, 2)}\n`,
      { mode: 0o444 },
    );
    fs.chmodSync(stageSkillsRoot, 0o555);
    fs.chmodSync(path.join(stageRoot, '.agents'), 0o555);
    fs.chmodSync(stageRoot, 0o555);
    try {
      fs.renameSync(stageRoot, projectionRoot);
    } catch (error) {
      if (!fs.existsSync(projectionRoot)) throw error;
      makeTreeWritable(stageRoot);
      removeSafePersistedPackagePath({
        candidatePath: stageRoot,
        allowedRoots: [projectionParent],
        pathKind: 'agent_package_skill_projection.raced_stage_root',
        recursive: true,
      });
    }
    return assertProjectionBytes(projection);
  } catch (error) {
    if (fs.existsSync(stageRoot)) {
      makeTreeWritable(stageRoot);
      removeSafePersistedPackagePath({
        candidatePath: stageRoot,
        allowedRoots: [projectionParent],
        pathKind: 'agent_package_skill_projection.failed_stage_root',
        recursive: true,
      });
    }
    throw error;
  }
}
