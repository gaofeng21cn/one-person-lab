import fs from 'node:fs';
import path from 'node:path';

import { FrameworkContractError, isRecord } from '../../../../kernel/contract-validation.ts';
import { parseJsonText } from '../../../../kernel/json-file.ts';
import { stringValue } from '../../../../kernel/json-record.ts';
import {
  assertAgentPackageSkillProjection,
  safeSkillId,
  skillDigest,
} from '../../../../kernel/agent-package-skill-projection.ts';
import {
  resolveStandardAgent,
  STANDARD_AGENT_SERIES_MEMBERSHIP,
} from '../../../../kernel/standard-agent-registry.ts';
import type { CordisConnectDescriptorDiscoveryService } from '../../public/descriptor-discovery.ts';
import { inspectOplModule } from '../../system-installation/modules.ts';
import { resolveAgentPackageEffectiveSourcePolicy } from '../source-policy.ts';
import {
  discoverCurrentOwnerPackageDescriptors,
  isProjectLocalCapabilityPackage,
  projectLocalCapabilityDependencyReadiness,
  resolveProjectLocalCapabilitySourceRoot,
  type InstalledPackageManifest,
} from '../installed-codex-plugin-directory.ts';
import type {
  AgentPackageSkillProjection,
  AgentPackageWorkspaceSkillRefresh,
} from '../types.ts';
import {
  assertWorkspaceProjectionPath,
  copySkillTree,
  materializeAgentPackageWorkspaceSkillProjection,
  realDirectory,
  removeTree,
  writeAtomicJson,
} from './materialization.ts';
import { containedRegularFile, type CapabilityProviderSource } from './plan.ts';

const WORKSPACE_OWNER_KIND_V1 = 'opl_workspace_agent_package_skill_owner.v1';
const WORKSPACE_OWNER_KIND_V2 = 'opl_workspace_agent_package_skill_owner.v2';
const WORKSPACE_MANIFEST_KIND = 'opl_workspace_agent_package_skill_projection.v1';

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
