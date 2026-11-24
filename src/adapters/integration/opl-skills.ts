import path from 'node:path';

import { FrameworkContractError } from '../../kernel/contract-validation.ts';
import { syncOplCompanionSkills, type OplCompanionSkillApplyMode } from './install-companions.ts';
import {
  listCodexFamilyPluginPackIds,
  registerOplFamilyCodexPlugins,
  type CodexPluginRegistryPackId,
} from './system-installation/codex-plugin-registry.ts';
import {
  resolveDefaultFamilyWorkspaceRoot as resolveDefaultFamilyWorkspaceRootImpl,
  resolveFamilyWorkspaceRootFromRepoRoot as resolveFamilyWorkspaceRootFromRepoRootImpl,
} from '../../authority/workspace/index.ts';
import {
  writeOplMaterializedPluginCarrier,
} from './opl-skills/generated-plugin.ts';
import {
  normalizeOptionalString,
  resolveCodexHome,
} from './opl-skills/paths.ts';
import {
  listFamilySkillPackSpecs,
  normalizeDomainSelection,
  type SkillPackSyncScope,
  type SkillPackSpec,
  type SyncFamilySkillPack,
} from './opl-skills/registry.ts';
import {
  requireSkillSyncTargetRoot,
  resolveSkillSyncTargetRoot,
  runSkillPackInstaller,
  shouldSkipImplicitCapabilitySkillSync,
} from './opl-skills/sync.ts';
import {
  inspectFamilySkillPack,
  inspectFamilySkillPackAtRepoRoot,
} from './opl-skills/inspection.ts';
import {
  STANDARD_AGENT_REGISTRY,
} from '../../kernel/standard-agent-registry.ts';

const FAMILY_REPO_DIRECTORIES = [
  'one-person-lab',
  ...STANDARD_AGENT_REGISTRY.map((entry) => entry.project),
];

export function resolveDefaultFamilyWorkspaceRoot(
  options: Parameters<typeof resolveDefaultFamilyWorkspaceRootImpl>[0] = {},
) {
  return resolveDefaultFamilyWorkspaceRootImpl({
    ...options,
    familyRepoDirectories: FAMILY_REPO_DIRECTORIES,
  });
}

export function resolveFamilyWorkspaceRootFromRepoRoot(repoRoot: string) {
  return resolveFamilyWorkspaceRootFromRepoRootImpl(repoRoot, FAMILY_REPO_DIRECTORIES);
}

type ReadFamilySkillPacksOptions = {
  domains?: string[];
};

type SyncFamilySkillPacksOptions = ReadFamilySkillPacksOptions & {
  home?: string;
  scope?: SkillPackSyncScope;
  targetWorkspace?: string;
  targetQuest?: string;
  targetRoot?: string;
  selectedSkillIds?: string[];
  companionMode?: OplCompanionSkillApplyMode;
  invocation?: 'explicit_legacy_migration';
};

export function syncFamilySkillPackFromRepoRoot(
  domainId: SkillPackSpec['domain_id'],
  repoRoot: string,
  options: Partial<{
    home: string;
    registerPlugin?: boolean;
    scope: SkillPackSyncScope;
    targetRoot: string;
    selectedSkillIds?: string[];
  }> = {},
) {
  const familySkillPackSpecs = listFamilySkillPackSpecs();
  const spec = familySkillPackSpecs.find((entry) => entry.domain_id === domainId);
  if (!spec) {
    throw new FrameworkContractError(
      'cli_usage_error',
      `Unknown skill pack domain: ${domainId}.`,
      {
        domain_id: domainId,
        allowed_domains: familySkillPackSpecs.map((entry) => entry.domain_id),
      },
    );
  }
  const inspected = inspectFamilySkillPackAtRepoRoot(spec, path.resolve(repoRoot));
  const scope = options.scope ?? inspected.skill_sync_policy.default_scope;
  const targetRoot = resolveSkillSyncTargetRoot(scope, {
    targetRoot: options.targetRoot,
  });

  const result = runSkillPackInstaller(
    inspected,
    {
      home: normalizeOptionalString(options.home) ?? undefined,
      scope,
      targetRoot,
      selectedSkillIds: options.selectedSkillIds,
      resolveCodexHome,
      writeMaterializedPluginCarrier: writeOplMaterializedPluginCarrier,
    },
  );
  if (
    scope === 'codex'
    && options.registerPlugin !== false
    && result.sync_status === 'synced'
    && result.registry_repo_root
  ) {
    const codexPluginRegistry = registerOplFamilyCodexPlugins(
      [domainId as CodexPluginRegistryPackId],
      new Map([[domainId as CodexPluginRegistryPackId, result.registry_repo_root]]),
      normalizeOptionalString(options.home) ?? undefined,
    );
    return {
      ...result,
      installer_result: {
        ...(result.installer_result ?? {}),
        codex_plugin_registry: codexPluginRegistry,
      },
    };
  }

  return result;
}

export function readFamilySkillPacks(options: ReadFamilySkillPacksOptions = {}) {
  const selectedDomains = normalizeDomainSelection(options.domains);
  const packs = listFamilySkillPackSpecs()
    .filter((spec) => !selectedDomains || selectedDomains.has(spec.domain_id))
    .map((spec) => inspectFamilySkillPack(spec));

  return {
    version: 'g2',
    skill_catalog: {
      surface_id: 'opl_skill_catalog',
      workspace_root: resolveDefaultFamilyWorkspaceRoot(),
      packs,
      summary: {
        total: packs.length,
        ready_to_sync: packs.filter((entry) => entry.ready_to_sync).length,
        repo_found: packs.filter((entry) => entry.repo_found).length,
      },
    },
  };
}

export function syncFamilySkillPacks(options: SyncFamilySkillPacksOptions = {}) {
  const selectedDomains = normalizeDomainSelection(options.domains);
  const selectedSkillIds = [...new Set((options.selectedSkillIds ?? [])
    .map((skillId) => skillId.trim())
    .filter(Boolean))];
  if (selectedSkillIds.length > 0
    && (!selectedDomains || selectedDomains.size !== 1 || !selectedDomains.has('scholarskills'))) {
    throw new FrameworkContractError(
      'cli_usage_error',
      'Selected ScholarSkills require --domain scholarskills.',
      {
        required: ['--domain scholarskills'],
        selected_skill_ids: selectedSkillIds,
      },
    );
  }
  const resolvedHome = normalizeOptionalString(options.home) ?? null;
  const inspectedPacks = listFamilySkillPackSpecs()
    .filter((spec) => !selectedDomains || selectedDomains.has(spec.domain_id))
    .map((spec) => ({ spec, inspected: inspectFamilySkillPack(spec) }));
  const explicitTargetRoot = resolveSkillSyncTargetRoot(options.scope ?? 'workspace', {
    targetWorkspace: options.targetWorkspace,
    targetQuest: options.targetQuest,
    targetRoot: options.targetRoot,
  });
  for (const { inspected } of inspectedPacks) {
    if (shouldSkipImplicitCapabilitySkillSync(inspected, options)) {
      continue;
    }
    const scope = options.scope ?? inspected.skill_sync_policy.default_scope;
    if ((scope === 'workspace' || scope === 'quest') && !inspected.skill_sync_policy.allowed_scopes.includes(scope)) {
      throw new FrameworkContractError(
        'cli_usage_error',
        `Workspace/quest-local skill sync is unsupported for ${inspected.domain_id}.`,
        {
          domain_id: inspected.domain_id,
          requested_scope: scope,
          allowed_scopes: inspected.skill_sync_policy.allowed_scopes,
        },
      );
    }
    requireSkillSyncTargetRoot(
      scope,
      resolveSkillSyncTargetRoot(scope, {
        targetWorkspace: options.targetWorkspace,
        targetQuest: options.targetQuest,
        targetRoot: options.targetRoot,
      }),
    );
  }
  const packs = inspectedPacks.map(({ inspected }) => runSkillPackInstaller(inspected, {
    home: resolvedHome ?? undefined,
    ...(() => {
      if (shouldSkipImplicitCapabilitySkillSync(inspected, options)) {
        return {
          scope: inspected.skill_sync_policy.default_scope,
          targetRoot: null,
        };
      }
      const scope = options.scope ?? inspected.skill_sync_policy.default_scope;
      return {
        scope,
        targetRoot: resolveSkillSyncTargetRoot(scope, {
          targetWorkspace: options.targetWorkspace,
          targetQuest: options.targetQuest,
          targetRoot: explicitTargetRoot ?? undefined,
        }),
        selectedSkillIds,
      };
    })(),
    resolveCodexHome,
    writeMaterializedPluginCarrier: writeOplMaterializedPluginCarrier,
  }));
  const codexPluginPackIds = new Set(listCodexFamilyPluginPackIds());
  const syncedFamilyPluginPacks = packs.filter((pack): pack is SyncFamilySkillPack & { domain_id: CodexPluginRegistryPackId } => (
    pack.sync_status === 'synced'
    && pack.sync_scope === 'codex'
    && codexPluginPackIds.has(pack.domain_id)
    && Boolean(pack.registry_repo_root)
  ));
  const codex_plugin_registry = syncedFamilyPluginPacks.length > 0
    ? registerOplFamilyCodexPlugins(
        syncedFamilyPluginPacks.map((pack) => pack.domain_id as CodexPluginRegistryPackId),
        new Map(syncedFamilyPluginPacks.map((pack) => [
          pack.domain_id as CodexPluginRegistryPackId,
          pack.registry_repo_root ?? pack.repo_root,
        ])),
        resolvedHome ?? undefined,
      )
    : null;
  const companion_skills = syncOplCompanionSkills(resolvedHome ?? undefined, {
    mode: options.companionMode ?? 'observe',
  });

  return {
    version: 'g2',
    skill_sync: {
      surface_id: 'opl_skill_sync',
      compatibility_boundary: options.invocation === 'explicit_legacy_migration'
        ? {
            mode: 'explicit_legacy_migration',
            automatic_invocation_allowed: false,
            steady_state_authority: 'opl_package_lifecycle',
          }
        : null,
      workspace_root: resolveDefaultFamilyWorkspaceRoot(),
      home: resolvedHome ?? process.env.HOME ?? null,
      packs,
      codex_plugin_registry,
      companion_skills,
      summary: {
        total: packs.length,
        synced: packs.filter((entry) => entry.sync_status === 'synced').length,
        skipped: packs.filter((entry) => entry.sync_status === 'skipped').length,
      },
    },
  };
}
