import fs from 'node:fs';
import path from 'node:path';

import { FrameworkContractError, isRecord } from '../../../kernel/contract-validation.ts';
import { parseJsonText } from '../../../kernel/json-file.ts';
import { stringValue } from '../../../kernel/json-record.ts';
import {
  agentPackageSkillProjectionFiles,
  agentPackageSkillProjectionFromUnknown,
  assertAgentPackageSkillProjection,
  assertProjectionBytes,
  combinedDigest,
  filesUnder,
  safeSkillId,
  skillDigest,
} from '../../../kernel/agent-package-skill-projection.ts';
import {
  resolveStandardAgent,
  STANDARD_AGENT_SERIES_MEMBERSHIP,
} from '../../../kernel/standard-agent-registry.ts';
import {
  ensureOplStateDir,
  resolveOplStatePaths,
} from '../../../kernel/runtime-state-paths.ts';
import { materializeStandardAgentCapabilityMap } from '../../../authority/packages/index.ts';
import type { CordisConnectDescriptorDiscoveryService } from '../public/descriptor-discovery.ts';
import { inspectOplModule } from '../system-installation/modules.ts';
import { sha256Text } from './shared.ts';
import { resolveAgentPackageEffectiveSourcePolicy } from './source-policy.ts';
import {
  discoverCurrentOwnerPackageDescriptors,
  isProjectLocalCapabilityPackage,
  projectLocalCapabilityDependencyReadiness,
  resolveProjectLocalCapabilitySourceRoot,
  type InstalledPackageManifest,
} from './installed-codex-plugin-directory.ts';
import type {
  AgentPackageSkillProjection,
  AgentPackageWorkspaceSkillRefresh,
} from './types.ts';

export {
  agentPackageSkillProjectionFromUnknown,
  assertAgentPackageSkillProjection,
  agentPackageSkillProjectionFiles as projectionFiles,
} from '../../../kernel/agent-package-skill-projection.ts';

type SkillSource = {
  skillId: string;
  sourceRoot: string;
  sourceRef: string;
  installMode: 'core_required' | 'optional_named_specialty';
};

type CapabilityProviderSource = {
  packageId: string;
  sourceRoot: string;
  sourceRef: string;
  defaultMaterializedSkillIds: string[];
  defaultMaterializationPolicy: 'all_exported_skills' | 'core_skills_only';
  exports: Array<{
    skillId: string;
    installMode: 'core_required' | 'optional_named_specialty';
  }>;
};

type ProjectionPlan = {
  generationId: string;
  sourceBySkillId: Map<string, SkillSource>;
  sourceRefs: string[];
  rootSkillIds: string[];
  coreSkillIds: string[];
  specialtySkillIds: string[];
  skillIds: string[];
  skillDigests: Record<string, string>;
  coreDigest: string;
  fullExportDigest: string;
};

const WORKSPACE_OWNER_KIND_V1 = 'opl_workspace_agent_package_skill_owner.v1';
const WORKSPACE_OWNER_KIND_V2 = 'opl_workspace_agent_package_skill_owner.v2';
const WORKSPACE_MANIFEST_KIND = 'opl_workspace_agent_package_skill_projection.v1';

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
      fs.chmodSync(target, stat.mode & 0o111
        ? 0o755
        : 0o644);
    } else {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'Agent package Skill projection accepts only regular files and directories.',
        { source_path: source, failure_code: 'agent_package_skill_projection_entry_unsupported' },
      );
    }
  }
  fs.chmodSync(targetRoot, 0o755);
}

function makeTreeWritable(root: string) {
  if (!fs.existsSync(root)) return;
  const stat = fs.lstatSync(root);
  if (stat.isDirectory() && !stat.isSymbolicLink()) {
    fs.chmodSync(root, 0o755);
    for (const entry of fs.readdirSync(root)) makeTreeWritable(path.join(root, entry));
  } else if (!stat.isSymbolicLink()) {
    fs.chmodSync(root, 0o644);
  }
}

function removeTree(root: string) {
  if (!fs.existsSync(root)) return;
  makeTreeWritable(root);
  fs.rmSync(root, { recursive: true, force: true });
}


function containedRegularFile(root: string, relativePath: string) {
  const rootReal = fs.realpathSync(root);
  const candidate = path.resolve(root, relativePath);
  if (candidate === root || !candidate.startsWith(`${path.resolve(root)}${path.sep}`)) return null;
  try {
    const stat = fs.lstatSync(candidate);
    const real = fs.realpathSync(candidate);
    return stat.isFile() && !stat.isSymbolicLink() && real.startsWith(`${rootReal}${path.sep}`)
      ? candidate
      : null;
  } catch {
    return null;
  }
}

function rootProfessionalSkillSources(rootSourceRoot: string, sourceRef: string) {
  const capabilityMapPath = containedRegularFile(rootSourceRoot, 'contracts/capability_map.json');
  if (!capabilityMapPath) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Installed standard Agent source does not carry its capability map.',
      {
        source_root: rootSourceRoot,
        failure_code: 'agent_package_workspace_skill_capability_map_missing',
      },
    );
  }
  const payload = parseJsonText(fs.readFileSync(capabilityMapPath, 'utf8'));
  const materialized = materializeStandardAgentCapabilityMap(rootSourceRoot, payload);
  if (materialized.blockers.length > 0 || !isRecord(materialized.capabilityMap)) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Installed standard Agent capability map could not be materialized.',
      {
        source_root: rootSourceRoot,
        blockers: materialized.blockers,
        failure_code: 'agent_package_workspace_skill_capability_map_invalid',
      },
    );
  }
  const capabilities = Array.isArray(materialized.capabilityMap.capabilities)
    ? materialized.capabilityMap.capabilities.filter(isRecord)
    : [];
  return capabilities.flatMap((capability): SkillSource[] => {
    const kind = stringValue(capability.capability_kind) ?? stringValue(capability.surface_role);
    const physical = isRecord(capability.physical_source_ref) ? capability.physical_source_ref : null;
    const relativeSkillFile = stringValue(physical?.ref);
    if (kind !== 'professional_skill'
      || physical?.ref_kind !== 'repo_path'
      || !relativeSkillFile
      || !/^agent\/professional_skills\/[^/]+\/SKILL\.md$/.test(relativeSkillFile)) return [];
    const skillFile = containedRegularFile(rootSourceRoot, relativeSkillFile);
    if (!skillFile) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'Installed standard Agent is missing a declared professional Skill.',
        {
          source_root: rootSourceRoot,
          skill_ref: relativeSkillFile,
          failure_code: 'agent_package_workspace_skill_source_missing',
        },
      );
    }
    const skillId = safeSkillId(path.basename(path.dirname(relativeSkillFile)));
    return [{
      skillId,
      sourceRoot: path.dirname(skillFile),
      sourceRef: `${sourceRef}#${relativeSkillFile}`,
      installMode: 'core_required',
    }];
  });
}

function buildProjectionPlan(input: {
  rootPackageId: string;
  rootSkillIds: string[];
  rootSourceRoot: string;
  rootSourceRef: string;
  providers: CapabilityProviderSource[];
  selectedSkillIds?: string[];
}) {
  const selectedSkillIds = new Set((input.selectedSkillIds ?? []).map(safeSkillId));
  const sources = [
    ...rootProfessionalSkillSources(input.rootSourceRoot, input.rootSourceRef),
    ...input.providers.flatMap((provider) => provider.exports
      .filter((entry) => (
        (entry.installMode === 'core_required'
          && provider.defaultMaterializedSkillIds.includes(entry.skillId))
        || provider.defaultMaterializationPolicy === 'all_exported_skills'
        || selectedSkillIds.has(entry.skillId)
      ))
      .map((entry): SkillSource => ({
        skillId: safeSkillId(entry.skillId),
        sourceRoot: path.join(provider.sourceRoot, 'skills', entry.skillId),
        sourceRef: `${provider.sourceRef}#skills/${entry.skillId}`,
        installMode: entry.installMode,
      }))),
  ];
  const sourceBySkillId = new Map<string, SkillSource>();
  const skillDigests: Record<string, string> = {};
  for (const source of sources) {
    const skillId = safeSkillId(source.skillId);
    if (!containedRegularFile(source.sourceRoot, 'SKILL.md')) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'Agent package Workspace Skill projection source is missing a declared Skill.',
        {
          skill_id: skillId,
          source_skill_root: source.sourceRoot,
          source_ref: source.sourceRef,
          failure_code: 'agent_package_workspace_skill_source_missing',
        },
      );
    }
    const digest = skillDigest(path.dirname(source.sourceRoot), skillId);
    const previous = sourceBySkillId.get(skillId);
    if (previous && skillDigests[skillId] !== digest) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'Agent package Workspace Skill projection has conflicting providers for one Skill id.',
        {
          skill_id: skillId,
          source_refs: [previous.sourceRef, source.sourceRef],
          failure_code: 'agent_package_workspace_skill_provider_conflict',
        },
      );
    }
    sourceBySkillId.set(skillId, previous ?? source);
    skillDigests[skillId] = digest;
  }
  const rootSkillIds = [...new Set(input.rootSkillIds.map(safeSkillId))].sort();
  const coreSkillIds = [...new Set(sources
    .filter((source) => source.installMode === 'core_required')
    .map((source) => source.skillId))].sort();
  const specialtySkillIds = [...new Set(sources
    .filter((source) => source.installMode === 'optional_named_specialty')
    .map((source) => source.skillId))].sort();
  const skillIds = [...new Set([...coreSkillIds, ...specialtySkillIds])].sort();
  if (skillIds.length === 0) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Installed standard Agent does not expose any required professional Skills.',
      {
        package_id: input.rootPackageId,
        failure_code: 'agent_package_workspace_skill_closure_empty',
      },
    );
  }
  const sourceRefs = [...new Set([
    input.rootSourceRef,
    ...sources.map((source) => source.sourceRef),
  ])].sort();
  const coreDigest = combinedDigest(skillDigests, coreSkillIds);
  const fullExportDigest = combinedDigest(skillDigests, skillIds);
  const generationId = sha256Text(JSON.stringify({
    surface_kind: 'opl_agent_package_skill_projection.v1',
    root_package_id: input.rootPackageId,
    root_skill_ids: rootSkillIds,
    core_skill_ids: coreSkillIds,
    specialty_skill_ids: specialtySkillIds,
    skill_digests: skillIds.map((skillId) => [skillId, skillDigests[skillId]]),
  }));
  return {
    generationId,
    sourceBySkillId,
    sourceRefs,
    rootSkillIds,
    coreSkillIds,
    specialtySkillIds,
    skillIds,
    skillDigests: Object.fromEntries(skillIds.map((skillId) => [skillId, skillDigests[skillId]])),
    coreDigest,
    fullExportDigest,
  } satisfies ProjectionPlan;
}

function projectionFromPlan(
  rootPackageId: string,
  projectionRoot: string,
  plan: ProjectionPlan,
): AgentPackageSkillProjection {
  return {
    surface_kind: 'opl_agent_package_skill_projection.v1',
    status: 'materialized',
    generation_id: plan.generationId,
    projection_root: projectionRoot,
    skills_root: path.join(projectionRoot, '.agents', 'skills'),
    root_package_id: rootPackageId,
    source_refs: plan.sourceRefs,
    root_skill_ids: plan.rootSkillIds,
    core_skill_ids: plan.coreSkillIds,
    specialty_skill_ids: plan.specialtySkillIds,
    skill_ids: plan.skillIds,
    skill_digests: plan.skillDigests,
    core_digest: plan.coreDigest,
    full_export_digest: plan.fullExportDigest,
  };
}

export function materializeAgentPackageWorkspaceSkillProjection(input: {
  rootPackageId: string;
  rootSkillIds: string[];
  rootSourceRoot: string;
  rootSourceRef: string;
  providers?: CapabilityProviderSource[];
  selectedSkillIds?: string[];
  dryRun?: boolean;
}) {
  const plan = buildProjectionPlan({
    ...input,
    providers: input.providers ?? [],
  });
  if (input.dryRun) {
    return {
      status: 'planned_no_write' as const,
      writes_performed: false,
      generation_id: plan.generationId,
      root_skill_ids: plan.rootSkillIds,
      skill_ids: plan.skillIds,
      projection: null,
    };
  }
  const projectionParent = path.join(
    ensureOplStateDir().state_dir,
    'agent-package-skill-projections',
  );
  fs.mkdirSync(projectionParent, { recursive: true });
  const projectionRoot = path.join(projectionParent, plan.generationId);
  const projection = projectionFromPlan(input.rootPackageId, projectionRoot, plan);
  if (fs.existsSync(projectionRoot)) {
    return {
      status: 'unchanged' as const,
      writes_performed: false,
      generation_id: plan.generationId,
      root_skill_ids: plan.rootSkillIds,
      skill_ids: plan.skillIds,
      projection: assertProjectionBytes(projection),
    };
  }
  const stageRoot = fs.mkdtempSync(path.join(projectionParent, '.staging-'));
  try {
    const stageSkillsRoot = path.join(stageRoot, '.agents', 'skills');
    for (const skillId of plan.skillIds) {
      copySkillTree(
        plan.sourceBySkillId.get(skillId)!.sourceRoot,
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
      { mode: 0o644 },
    );
    try {
      fs.renameSync(stageRoot, projectionRoot);
    } catch (error) {
      if (!fs.existsSync(projectionRoot)) throw error;
      removeTree(stageRoot);
    }
    return {
      status: 'materialized' as const,
      writes_performed: true,
      generation_id: plan.generationId,
      root_skill_ids: plan.rootSkillIds,
      skill_ids: plan.skillIds,
      projection: assertProjectionBytes(projection),
    };
  } catch (error) {
    removeTree(stageRoot);
    throw error;
  }
}

function realDirectory(candidate: string | null) {
  if (!candidate || !path.isAbsolute(candidate)) return null;
  try {
    const stat = fs.lstatSync(candidate);
    return stat.isDirectory() && !stat.isSymbolicLink() ? fs.realpathSync(candidate) : null;
  } catch {
    return null;
  }
}

function invalidWorkspaceProjectionPath(workspaceRoot: string, candidate: string): never {
  throw new FrameworkContractError(
    'contract_shape_invalid',
    'Workspace Skill projection refuses symbolic links or paths outside the Workspace.',
    {
      target_workspace: workspaceRoot,
      projection_path: candidate,
      failure_code: 'agent_package_workspace_skill_projection_path_invalid',
    },
  );
}

function assertWorkspaceProjectionPath(workspaceRoot: string, candidate: string) {
  const resolved = path.resolve(candidate);
  if (resolved === workspaceRoot || !resolved.startsWith(`${workspaceRoot}${path.sep}`)) {
    invalidWorkspaceProjectionPath(workspaceRoot, candidate);
  }
  let current = resolved;
  while (current !== workspaceRoot) {
    try {
      const stat = fs.lstatSync(current);
      if (stat.isSymbolicLink()) invalidWorkspaceProjectionPath(workspaceRoot, candidate);
      const real = fs.realpathSync(current);
      if (real !== workspaceRoot && !real.startsWith(`${workspaceRoot}${path.sep}`)) {
        invalidWorkspaceProjectionPath(workspaceRoot, candidate);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    current = path.dirname(current);
  }
}

function ancestors(candidate: string) {
  const values: string[] = [];
  let current = path.resolve(candidate);
  for (let depth = 0; depth < 8; depth += 1) {
    values.push(current);
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return values;
}

function selectedAgentModuleSourceRoot(packageId: string) {
  const agent = resolveStandardAgent(packageId);
  if (!agent || agent.series_membership !== STANDARD_AGENT_SERIES_MEMBERSHIP) return null;
  try {
    const selected = inspectOplModule(agent.module_id, { profile: 'fast' });
    return selected.installed && selected.health_status !== 'invalid_checkout'
      ? realDirectory(selected.checkout_path)
      : null;
  } catch {
    return null;
  }
}

function installedAgentSourceRoot(packageId: string, descriptor: {
  sourcePath: string;
  marketplaceSource: string | null;
}) {
  const sourcePolicy = resolveAgentPackageEffectiveSourcePolicy(packageId);
  if (sourcePolicy.desired_source_kind === 'developer_checkout_override'
    && sourcePolicy.configured_by !== 'native_git_checkout') {
    const selectedRoot = sourcePolicy.developer_checkout_available
      ? realDirectory(sourcePolicy.developer_checkout_path)
      : null;
    return selectedRoot && containedRegularFile(selectedRoot, 'contracts/capability_map.json')
      ? selectedRoot
      : null;
  }
  const candidates = [
    realDirectory(descriptor.marketplaceSource),
    ...ancestors(descriptor.sourcePath).map((candidate) => realDirectory(candidate)),
    selectedAgentModuleSourceRoot(packageId),
  ].filter((candidate): candidate is string => candidate !== null);
  return [...new Set(candidates)].find((candidate) => (
    containedRegularFile(candidate, 'contracts/capability_map.json') !== null
  )) ?? null;
}

function installedProviderSourceRoot(
  descriptor: {
    sourcePath: string;
    marketplaceSource: string | null;
    manifest: Pick<
      InstalledPackageManifest,
      'package_role' | 'codex_default_exposure' | 'codex_interaction_mode' | 'capability_provider'
    >;
  },
  skillIds: string[],
  moduleId: string,
) {
  const candidates = [
    realDirectory(descriptor.sourcePath),
    realDirectory(descriptor.marketplaceSource),
    ...ancestors(descriptor.sourcePath).map((candidate) => realDirectory(candidate)),
  ].filter((candidate): candidate is string => candidate !== null);
  const installedSource = [...new Set(candidates)].find((candidate) => skillIds.every((skillId) => (
    containedRegularFile(candidate, `skills/${safeSkillId(skillId)}/SKILL.md`) !== null
  ))) ?? null;
  if (installedSource) return installedSource;
  return isProjectLocalCapabilityPackage(descriptor.manifest)
    ? resolveProjectLocalCapabilitySourceRoot(moduleId, skillIds)
    : null;
}

function attentionRefresh(packageId: string, reason: string, targetWorkspace: string | null) {
  return {
    surface_kind: 'opl_agent_package_workspace_skill_refresh.v1' as const,
    package_id: packageId,
    status: 'attention_needed' as const,
    reason,
    generation_id: null,
    root_skill_ids: [],
    skill_ids: [],
    target_workspace: targetWorkspace,
    workspace_skills_root: targetWorkspace ? path.join(targetWorkspace, '.agents', 'skills') : null,
    writes_performed: false,
    projection: null,
  } satisfies AgentPackageWorkspaceSkillRefresh;
}

function notInstalledRefresh(packageId: string, targetWorkspace: string | null) {
  return {
    ...attentionRefresh(packageId, 'package_not_installed', targetWorkspace),
    status: 'not_installed' as const,
  } satisfies AgentPackageWorkspaceSkillRefresh;
}

function readJsonRecord(filePath: string) {
  try {
    const stat = fs.lstatSync(filePath);
    if (!stat.isFile() || stat.isSymbolicLink()) return null;
    const value = parseJsonText(fs.readFileSync(filePath, 'utf8'));
    return isRecord(value) ? value : null;
  } catch {
    return null;
  }
}

function writeAtomicJson(filePath: string, value: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o644 });
  fs.renameSync(temporary, filePath);
}

type WorkspaceSkillOwner = {
  skillId: string;
  skillDigest: string;
  owners: Map<string, string>;
};

function workspaceSkillOwnerFromRecord(
  value: Record<string, unknown> | null,
  expectedSkillId: string,
): WorkspaceSkillOwner | null {
  if (!value) return null;
  const skillId = stringValue(value.skill_id);
  const skillDigestValue = stringValue(value.skill_digest);
  if (skillId !== expectedSkillId || !skillDigestValue?.match(/^sha256:[a-f0-9]{64}$/)) return null;

  if (value.surface_kind === WORKSPACE_OWNER_KIND_V1) {
    const packageId = stringValue(value.package_id);
    const generationId = stringValue(value.generation_id);
    if (!packageId || !generationId) return null;
    return {
      skillId,
      skillDigest: skillDigestValue,
      owners: new Map([[packageId, generationId]]),
    };
  }
  if (value.surface_kind !== WORKSPACE_OWNER_KIND_V2 || !Array.isArray(value.owners)) return null;

  const owners = new Map<string, string>();
  for (const entry of value.owners) {
    if (!isRecord(entry)) return null;
    const packageId = stringValue(entry.package_id);
    const generationId = stringValue(entry.generation_id);
    if (!packageId || !generationId || owners.has(packageId)) return null;
    owners.set(packageId, generationId);
  }
  return owners.size > 0
    ? { skillId, skillDigest: skillDigestValue, owners }
    : null;
}

function workspaceSkillOwnerPayload(
  skillId: string,
  skillDigestValue: string,
  owners: Map<string, string>,
) {
  return {
    surface_kind: WORKSPACE_OWNER_KIND_V2,
    skill_id: skillId,
    skill_digest: skillDigestValue,
    owners: [...owners.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([packageId, generationId]) => ({
        package_id: packageId,
        generation_id: generationId,
      })),
  };
}

export function syncAgentPackageSkillProjectionToWorkspace(
  projection: AgentPackageSkillProjection,
  targetWorkspace: string,
) {
  assertAgentPackageSkillProjection(projection);
  const workspaceRoot = realDirectory(path.resolve(targetWorkspace));
  if (!workspaceRoot) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Workspace Skill projection requires an existing real Workspace directory.',
      {
        target_workspace: targetWorkspace,
        failure_code: 'agent_package_workspace_skill_target_invalid',
      },
    );
  }
  const codexRoot = path.join(workspaceRoot, '.codex');
  const skillsRoot = path.join(workspaceRoot, '.agents', 'skills');
  const legacySkillsRoot = path.join(codexRoot, 'skills');
  const ownersRoot = path.join(codexRoot, 'opl-agent-package-skill-owners');
  const manifestsRoot = path.join(codexRoot, 'opl-agent-package-skill-projections');
  const transactionsRoot = path.join(codexRoot, '.opl-skill-projection-transactions');
  for (const managedRoot of [codexRoot, skillsRoot, ownersRoot, manifestsRoot, transactionsRoot]) {
    assertWorkspaceProjectionPath(workspaceRoot, managedRoot);
  }
  const manifestPath = path.join(manifestsRoot, `${projection.root_package_id}.json`);
  const previous = readJsonRecord(manifestPath);
  const previousSkillIds = previous?.surface_kind === WORKSPACE_MANIFEST_KIND
    && previous.package_id === projection.root_package_id
    && Array.isArray(previous.skill_ids)
    ? previous.skill_ids.filter((entry): entry is string => typeof entry === 'string')
    : [];
  const affectedSkillIds = [...new Set([...projection.skill_ids, ...previousSkillIds])].sort();
  const ownerPaths = new Map(affectedSkillIds.map((skillId) => [
    skillId,
    path.join(ownersRoot, `${safeSkillId(skillId)}.json`),
  ]));
  const legacySkillPathsToRemove: string[] = [];
  for (const skillId of affectedSkillIds) {
    const legacySkill = path.join(legacySkillsRoot, skillId);
    if (!fs.existsSync(legacySkill)) continue;
    const owner = workspaceSkillOwnerFromRecord(
      readJsonRecord(path.join(ownersRoot, `${safeSkillId(skillId)}.json`)),
      skillId,
    );
    if (!owner || skillDigest(legacySkillsRoot, skillId) !== owner.skillDigest) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'Workspace Skill migration refuses to remove an unmanaged or drifted legacy Skill directory.',
        {
          package_id: projection.root_package_id,
          skill_id: skillId,
          target_skill_root: legacySkill,
          failure_code: 'agent_package_workspace_skill_legacy_unowned_collision',
        },
      );
    }
    legacySkillPathsToRemove.push(legacySkill);
  }
  const states = new Map<string, {
    skillId: string;
    targetSkill: string;
    ownerPath: string;
    owner: WorkspaceSkillOwner | null;
    targetExists: boolean;
    actualDigest: string | null;
    previousContains: boolean;
    nextContains: boolean;
    nextDigest: string | null;
  }>();
  for (const skillId of affectedSkillIds) {
    const targetSkill = path.join(skillsRoot, skillId);
    const ownerPath = ownerPaths.get(skillId)!;
    const ownerRecord = readJsonRecord(ownerPath);
    const owner = workspaceSkillOwnerFromRecord(ownerRecord, skillId);
    const targetExists = fs.existsSync(targetSkill);
    const actualDigest = targetExists ? skillDigest(skillsRoot, skillId) : null;
    const previousContains = previousSkillIds.includes(skillId);
    const nextContains = projection.skill_ids.includes(skillId);
    const nextDigest = nextContains ? projection.skill_digests[skillId] : null;
    const currentOwns = owner?.owners.has(projection.root_package_id) === true;
    const otherOwnerPackageIds = owner
      ? [...owner.owners.keys()].filter((packageId) => packageId !== projection.root_package_id)
      : [];

    states.set(skillId, {
      skillId,
      targetSkill,
      ownerPath,
      owner,
      targetExists,
      actualDigest,
      previousContains,
      nextContains,
      nextDigest,
    });

    if ((ownerRecord && !owner) || (targetExists && (!owner || actualDigest !== owner.skillDigest))) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'Workspace Skill projection refuses to overwrite an unmanaged or drifted Skill directory.',
        {
          package_id: projection.root_package_id,
          skill_id: skillId,
          target_skill_root: targetSkill,
          failure_code: 'agent_package_workspace_skill_unowned_collision',
        },
      );
    }
    if (previousContains && owner && !currentOwns) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'Workspace Skill projection manifest and owner marker disagree.',
        {
          package_id: projection.root_package_id,
          skill_id: skillId,
          owner_package_ids: [...owner.owners.keys()].sort(),
          failure_code: 'agent_package_workspace_skill_owner_conflict',
        },
      );
    }
    if (!fs.existsSync(targetSkill)) {
      if (owner && (otherOwnerPackageIds.length > 0 || (nextContains && !currentOwns))) {
        throw new FrameworkContractError(
          'contract_shape_invalid',
          'Workspace Skill owner marker belongs to another package while its managed directory is missing.',
          {
            skill_id: skillId,
            owner_package_ids: [...owner.owners.keys()].sort(),
            failure_code: 'agent_package_workspace_skill_owner_conflict',
          },
        );
      }
      continue;
    }
    if (nextContains && actualDigest !== nextDigest && (!currentOwns || otherOwnerPackageIds.length > 0)) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'Workspace Skill projection refuses to replace bytes still owned by another package.',
        {
          package_id: projection.root_package_id,
          skill_id: skillId,
          target_skill_root: targetSkill,
          owner_package_ids: [...owner!.owners.keys()].sort(),
          current_digest: actualDigest,
          requested_digest: nextDigest,
          failure_code: 'agent_package_workspace_skill_owner_conflict',
        },
      );
    }
  }
  const alreadyCurrent = previous?.surface_kind === WORKSPACE_MANIFEST_KIND
    && previous.package_id === projection.root_package_id
    && previous.generation_id === projection.generation_id
    && projection.skill_ids.every((skillId) => (
      fs.existsSync(path.join(skillsRoot, skillId))
      && skillDigest(skillsRoot, skillId) === projection.skill_digests[skillId]
      && states.get(skillId)?.owner?.owners.get(projection.root_package_id) === projection.generation_id
    ));
  if (alreadyCurrent) {
    return { status: 'unchanged' as const, writes_performed: false, workspaceSkillsRoot: skillsRoot };
  }

  fs.mkdirSync(skillsRoot, { recursive: true });
  fs.mkdirSync(ownersRoot, { recursive: true });
  fs.mkdirSync(manifestsRoot, { recursive: true });
  fs.mkdirSync(transactionsRoot, { recursive: true });
  const transactionRoot = fs.mkdtempSync(path.join(transactionsRoot, `${projection.root_package_id}-`));
  const stageRoot = path.join(transactionRoot, 'stage');
  const backupRoot = path.join(transactionRoot, 'backup');
  const previousOwnerBytes = new Map<string, Buffer | null>();
  const previousManifestBytes = fs.existsSync(manifestPath) ? fs.readFileSync(manifestPath) : null;
  const desiredOwners = new Map<string, Map<string, string>>();
  const replaceSkillIds = new Set<string>();
  const removeSkillIds = new Set<string>();
  for (const state of states.values()) {
    const owners = new Map(state.owner?.owners ?? []);
    if (state.previousContains && !state.nextContains) owners.delete(projection.root_package_id);
    if (state.nextContains) owners.set(projection.root_package_id, projection.generation_id);
    desiredOwners.set(state.skillId, owners);
    if (state.nextContains && (!state.targetExists || state.actualDigest !== state.nextDigest)) {
      replaceSkillIds.add(state.skillId);
    } else if (state.previousContains && !state.nextContains && owners.size === 0 && state.targetExists) {
      removeSkillIds.add(state.skillId);
    }
  }
  try {
    for (const skillId of replaceSkillIds) {
      copySkillTree(
        path.join(projection.skills_root, skillId),
        path.join(stageRoot, skillId),
      );
    }
    for (const skillId of affectedSkillIds) {
      const ownerPath = ownerPaths.get(skillId)!;
      previousOwnerBytes.set(skillId, fs.existsSync(ownerPath) ? fs.readFileSync(ownerPath) : null);
      const targetSkill = path.join(skillsRoot, skillId);
      if ((replaceSkillIds.has(skillId) || removeSkillIds.has(skillId)) && fs.existsSync(targetSkill)) {
        fs.mkdirSync(backupRoot, { recursive: true });
        fs.renameSync(targetSkill, path.join(backupRoot, skillId));
      }
    }
    for (const skillId of replaceSkillIds) {
      fs.renameSync(path.join(stageRoot, skillId), path.join(skillsRoot, skillId));
    }
    for (const state of states.values()) {
      const owners = desiredOwners.get(state.skillId)!;
      const ownerPath = ownerPaths.get(state.skillId)!;
      if (owners.size === 0) {
        if (fs.existsSync(ownerPath)) fs.unlinkSync(ownerPath);
        continue;
      }
      const desiredDigest = state.nextDigest ?? state.owner?.skillDigest;
      if (!desiredDigest) {
        throw new FrameworkContractError(
          'contract_shape_invalid',
          'Workspace Skill projection could not determine the managed Skill digest.',
          {
            package_id: projection.root_package_id,
            skill_id: state.skillId,
            failure_code: 'agent_package_workspace_skill_owner_conflict',
          },
        );
      }
      writeAtomicJson(
        ownerPath,
        workspaceSkillOwnerPayload(state.skillId, desiredDigest, owners),
      );
    }
    for (const skillId of previousSkillIds.filter((skillId) => !projection.skill_ids.includes(skillId))) {
      const ownerPath = ownerPaths.get(skillId)!;
      if (desiredOwners.get(skillId)?.size === 0 && fs.existsSync(ownerPath)) fs.unlinkSync(ownerPath);
    }
    writeAtomicJson(manifestPath, {
      surface_kind: WORKSPACE_MANIFEST_KIND,
      package_id: projection.root_package_id,
      generation_id: projection.generation_id,
      root_skill_ids: projection.root_skill_ids,
      skill_ids: projection.skill_ids,
      skill_digests: projection.skill_digests,
    });
    for (const legacySkill of legacySkillPathsToRemove) {
      removeTree(legacySkill);
    }
    removeTree(transactionRoot);
    return { status: 'materialized' as const, writes_performed: true, workspaceSkillsRoot: skillsRoot };
  } catch (error) {
    for (const skillId of [...replaceSkillIds, ...removeSkillIds]) {
      removeTree(path.join(skillsRoot, skillId));
    }
    for (const skillId of affectedSkillIds) {
      const backup = path.join(backupRoot, skillId);
      if (fs.existsSync(backup)) fs.renameSync(backup, path.join(skillsRoot, skillId));
      const ownerPath = ownerPaths.get(skillId)!;
      const ownerBytes = previousOwnerBytes.get(skillId);
      if (ownerBytes) fs.writeFileSync(ownerPath, ownerBytes);
      else if (fs.existsSync(ownerPath)) fs.unlinkSync(ownerPath);
    }
    if (previousManifestBytes) fs.writeFileSync(manifestPath, previousManifestBytes);
    else if (fs.existsSync(manifestPath)) fs.unlinkSync(manifestPath);
    removeTree(transactionRoot);
    throw error;
  }
}

export function refreshInstalledAgentPackageWorkspaceSkills(input: {
  packageId: string;
  packageStatus?: any;
  targetWorkspace?: string | null;
  dryRun?: boolean;
  selectedSkillIds?: string[];
  descriptorDiscovery?: Pick<CordisConnectDescriptorDiscoveryService, 'discover'>;
}): AgentPackageWorkspaceSkillRefresh {
  const packageId = input.packageId.trim();
  const targetWorkspace = stringValue(input.targetWorkspace);
  const status = input.packageStatus;
  if ((status?.installed_package_count ?? 0) === 0) {
    return notInstalledRefresh(packageId, targetWorkspace);
  }
  if (status?.launch_allowed === false) {
    return attentionRefresh(
      packageId,
      stringValue(status.launch_blocked_reason) ?? 'package_not_operational',
      targetWorkspace,
    );
  }
  if (!input.descriptorDiscovery) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Workspace Skill projection requires the Cordis Connect descriptor discovery service.',
      { failure_code: 'cordis_connect_descriptor_discovery_service_required' },
    );
  }
  const descriptors = new Map(input.descriptorDiscovery.discover());
  for (const [packageId, descriptor] of discoverCurrentOwnerPackageDescriptors()) {
    if (!descriptors.has(packageId)) descriptors.set(packageId, descriptor);
  }
  const root = descriptors.get(packageId);
  if (!root || root.manifest.package_role !== 'standard_agent') {
    return notInstalledRefresh(packageId, targetWorkspace);
  }
  const rootSourceRoot = installedAgentSourceRoot(packageId, root);
  if (!rootSourceRoot) {
    return attentionRefresh(packageId, 'installed_agent_capability_source_unavailable', targetWorkspace);
  }
  const providers: CapabilityProviderSource[] = [];
  for (const dependency of root.manifest.capability_dependencies.filter((entry) => entry.required)) {
    const provider = descriptors.get(dependency.package_id);
    const projectLocalReadiness = provider
      && isProjectLocalCapabilityPackage(provider.manifest)
      ? projectLocalCapabilityDependencyReadiness(provider, dependency)
      : null;
    const nativeProviderReady = provider
      && provider.manifest.package_role === 'capability_package'
      && provider.readiness.installed === true
      && provider.readiness.physical_status === 'available'
      && (provider.readiness.projection_callability ?? provider.readiness.callability) === 'callable'
      && Boolean(provider.manifest.capability_provider);
    if (!provider
      || provider.manifest.package_role !== 'capability_package'
      || (!nativeProviderReady && projectLocalReadiness?.status !== 'current')
      || !provider.manifest.capability_provider) {
      return attentionRefresh(
        packageId,
        `required_capability_provider_unavailable:${dependency.package_id}`,
        targetWorkspace,
      );
    }
    const exports = provider.manifest.capability_provider.exports.map((entry) => ({
      skillId: entry.skill_id,
      installMode: entry.install_mode === 'optional_named_specialty'
        ? 'optional_named_specialty' as const
        : 'core_required' as const,
    }));
    const providerSourceRoot = installedProviderSourceRoot(
      provider,
      exports.filter((entry) => entry.skillId !== dependency.package_id).map((entry) => entry.skillId),
      dependency.module_id,
    );
    if (!providerSourceRoot) {
      return attentionRefresh(
        packageId,
        `required_capability_provider_skills_unavailable:${dependency.package_id}`,
        targetWorkspace,
      );
    }
    providers.push({
      packageId: dependency.package_id,
      sourceRoot: providerSourceRoot,
      sourceRef: provider.manifestPath,
      defaultMaterializedSkillIds: provider.manifest.capability_provider.default_materialized_skill_ids,
      defaultMaterializationPolicy: provider.manifest.capability_provider.default_materialization_policy
        ?? (provider.manifest.codex_surface.optional_install_policy === 'core_skills_only'
          ? 'core_skills_only'
          : 'all_exported_skills'),
      exports,
    });
  }
  const materialized = materializeAgentPackageWorkspaceSkillProjection({
    rootPackageId: packageId,
    rootSkillIds: root.manifest.required_skill_ids,
    rootSourceRoot,
    rootSourceRef: root.manifestPath,
    providers,
    selectedSkillIds: input.selectedSkillIds,
    dryRun: input.dryRun,
  });
  if (!materialized.projection) {
    return {
      surface_kind: 'opl_agent_package_workspace_skill_refresh.v1',
      package_id: packageId,
      status: 'planned_no_write',
      reason: null,
      generation_id: materialized.generation_id,
      root_skill_ids: materialized.root_skill_ids,
      skill_ids: materialized.skill_ids,
      target_workspace: targetWorkspace,
      workspace_skills_root: targetWorkspace ? path.join(targetWorkspace, '.agents', 'skills') : null,
      writes_performed: false,
      projection: null,
    };
  }
  const workspaceSync = targetWorkspace
    ? syncAgentPackageSkillProjectionToWorkspace(materialized.projection, targetWorkspace)
    : null;
  return {
    surface_kind: 'opl_agent_package_workspace_skill_refresh.v1',
    package_id: packageId,
    status: workspaceSync?.status ?? materialized.status,
    reason: null,
    generation_id: materialized.generation_id,
    root_skill_ids: materialized.root_skill_ids,
    skill_ids: materialized.skill_ids,
    target_workspace: targetWorkspace,
    workspace_skills_root: workspaceSync?.workspaceSkillsRoot ?? null,
    writes_performed: materialized.writes_performed || workspaceSync?.writes_performed === true,
    projection: materialized.projection,
  };
}
