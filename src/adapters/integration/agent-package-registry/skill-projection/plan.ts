import fs from 'node:fs';
import path from 'node:path';

import { FrameworkContractError, isRecord } from '../../../../kernel/contract-validation.ts';
import { parseJsonText } from '../../../../kernel/json-file.ts';
import { stringValue } from '../../../../kernel/json-record.ts';
import {
  combinedDigest,
  safeSkillId,
  skillDigest,
} from '../../../../kernel/agent-package-skill-projection.ts';
import { materializeStandardAgentCapabilityMap } from '../../../../authority/packages/index.ts';
import { sha256Text } from '../shared.ts';

import type { AgentPackageSkillProjection } from '../../../../kernel/agent-package-skill-projection.ts';

export type SkillSource = {
  skillId: string;
  sourceRoot: string;
  sourceRef: string;
  installMode: 'core_required' | 'optional_named_specialty';
};

export type CapabilityProviderSource = {
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

export type ProjectionPlan = {
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

export function containedRegularFile(root: string, relativePath: string) {
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

function rootProfessionalSkillSources(rootSourceRoot: string, sourceRef: string, rootSkillIds: string[]) {
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
    if (kind === 'primary_skill' && physical?.ref_kind === 'repo_path'
      && relativeSkillFile === 'agent/primary_skill/SKILL.md') {
      const skillFile = containedRegularFile(rootSourceRoot, relativeSkillFile);
      if (!skillFile) {
        throw new FrameworkContractError(
          'contract_shape_invalid',
          'Installed standard Agent is missing its declared primary Skill.',
          { source_root: rootSourceRoot, skill_ref: relativeSkillFile,
            failure_code: 'agent_package_workspace_skill_source_missing' },
        );
      }
      return rootSkillIds.map((skillId) => ({
        skillId: safeSkillId(skillId),
        sourceRoot: path.dirname(skillFile),
        sourceRef: `${sourceRef}#${relativeSkillFile}`,
        installMode: 'core_required' as const,
      }));
    }
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

export function buildProjectionPlan(input: {
  rootPackageId: string;
  rootSkillIds: string[];
  rootSourceRoot: string;
  rootSourceRef: string;
  providers: CapabilityProviderSource[];
  selectedSkillIds?: string[];
}) {
  const selectedSkillIds = new Set((input.selectedSkillIds ?? []).map(safeSkillId));
  const sources = [
    ...rootProfessionalSkillSources(input.rootSourceRoot, input.rootSourceRef, input.rootSkillIds),
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
    const digest = skillDigest(path.dirname(source.sourceRoot), skillId, source.sourceRoot);
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

export function projectionFromPlan(
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
