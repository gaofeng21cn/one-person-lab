import fs from 'node:fs';
import path from 'node:path';

import { FrameworkContractError } from '../../../kernel/contract-validation.ts';
import { nowIso, sha256Text } from './shared.ts';
import type {
  AgentPackageLock,
  AgentPackageLockIndex,
  AgentPackageManifest,
  AgentPackageMaterializationReadiness,
  AgentPackagePackageActionInput,
  AgentPackageScopeMaterialization,
} from './types.ts';

type ScopeInput = Pick<AgentPackagePackageActionInput, 'scope' | 'targetWorkspace' | 'targetQuest'>;

export function packageScopeTarget(input: ScopeInput) {
  if (!input.scope) return null;
  if (input.scope !== 'workspace' && input.scope !== 'quest') {
    throw new FrameworkContractError('cli_usage_error', 'Package materialization scope must be workspace or quest.', {
      scope: input.scope,
      allowed_scopes: ['workspace', 'quest'],
      failure_code: 'agent_package_scope_invalid',
    });
  }
  const target = input.scope === 'workspace' ? input.targetWorkspace : input.targetQuest;
  if (!target) {
    throw new FrameworkContractError('cli_usage_error', `Package ${input.scope} materialization requires a target root.`, {
      scope: input.scope,
      required: [input.scope === 'workspace' ? '--target-workspace <path>' : '--target-quest <path>'],
      failure_code: 'agent_package_scope_target_required',
    });
  }
  return path.resolve(target);
}

function filesUnder(root: string) {
  const files: string[] = [];
  function visit(current: string) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile()) files.push(path.relative(root, absolute));
    }
  }
  if (fs.existsSync(root)) visit(root);
  return files.sort();
}

function skillTreeDigest(root: string, skillIds: string[]) {
  const records = skillIds.flatMap((skillId) => {
    const skillRoot = path.join(root, skillId);
    return filesUnder(skillRoot).map((relativePath) => {
      const bytes = fs.readFileSync(path.join(skillRoot, relativePath));
      return `${skillId}/${relativePath}\0${bytes.toString('base64')}`;
    });
  });
  return `sha256:${sha256Text(records.join('\0'))}`;
}

function coreSkillIds(provider: AgentPackageManifest) {
  return provider.capability_provider?.exports
    .filter((entry) => entry.install_mode === 'core_required')
    .map((entry) => entry.skill_id) ?? [];
}

function specialtySkillIds(provider: AgentPackageManifest) {
  return provider.capability_provider?.exports
    .filter((entry) => entry.install_mode === 'optional_named_specialty')
    .map((entry) => entry.skill_id) ?? [];
}

function skillDigest(root: string, skillId: string) {
  return skillTreeDigest(root, [skillId]);
}

export function materializeCapabilityScope(input: {
  provider: AgentPackageManifest;
  scope: 'workspace' | 'quest';
  targetRoot: string;
  transactionId: string;
  providerLockRef: string;
  dryRun: boolean;
  retainTransactionBackup?: boolean;
  previousMaterialization?: AgentPackageScopeMaterialization | null;
}): AgentPackageScopeMaterialization {
  const sourceRoot = input.provider.plugin_source_path;
  const requiredSkillIds = coreSkillIds(input.provider);
  const specialtyIds = specialtySkillIds(input.provider);
  const managedSkillIds = [...requiredSkillIds, ...specialtyIds];
  if (!sourceRoot || requiredSkillIds.length === 0) {
    throw new FrameworkContractError('contract_shape_invalid', 'Capability provider cannot materialize a scope without a physical core-skill source.', {
      provider_package_id: input.provider.package_id,
      plugin_source_path: sourceRoot,
      required_skill_ids: requiredSkillIds,
      failure_code: 'agent_package_scope_provider_source_missing',
    });
  }
  for (const skillId of managedSkillIds) {
    const sourceSkillRoot = path.join(sourceRoot, 'skills', skillId);
    if (!fs.existsSync(path.join(sourceSkillRoot, 'SKILL.md'))) {
      throw new FrameworkContractError('contract_shape_invalid', 'Capability provider core skill is missing from the package source.', {
        provider_package_id: input.provider.package_id,
        skill_id: skillId,
        source_skill_root: sourceSkillRoot,
        failure_code: 'agent_package_scope_core_skill_missing',
      });
    }
  }
  const sourceSkillsRoot = path.join(sourceRoot, 'skills');
  const coreDigest = skillTreeDigest(sourceSkillsRoot, requiredSkillIds);
  const contentDigest = skillTreeDigest(sourceSkillsRoot, managedSkillIds);
  const retiredSkillIds = (input.previousMaterialization?.managed_skill_ids ?? [])
    .filter((skillId) => !managedSkillIds.includes(skillId))
    .filter((skillId) => {
      const previousDigest = input.previousMaterialization?.skill_digests?.[skillId];
      const targetSkill = path.join(input.targetRoot, '.codex', 'skills', skillId);
      return Boolean(previousDigest && fs.existsSync(targetSkill)
        && skillDigest(path.dirname(targetSkill), skillId) === previousDigest);
    });
  const transactionSkillIds = [...managedSkillIds, ...retiredSkillIds];
  if (!input.previousMaterialization) {
    const targetSkillsRoot = path.join(input.targetRoot, '.codex', 'skills');
    const collisions = managedSkillIds.filter((skillId) => fs.existsSync(path.join(targetSkillsRoot, skillId)));
    if (collisions.length > 0) {
      throw new FrameworkContractError('contract_shape_invalid', 'Package scope activation refuses to overwrite unowned local Skills.', {
        provider_package_id: input.provider.package_id,
        target_root: input.targetRoot,
        collision_skill_ids: collisions,
        failure_code: 'agent_package_scope_unowned_skill_collision',
      });
    }
  }
  if (!input.dryRun) {
    const codexRoot = path.join(input.targetRoot, '.codex');
    const targetSkillsRoot = path.join(codexRoot, 'skills');
    const transactionRoot = path.join(codexRoot, '.opl-package-transactions', input.transactionId);
    const stageRoot = path.join(transactionRoot, 'stage');
    const backupRoot = path.join(transactionRoot, 'backup');
    fs.rmSync(transactionRoot, { recursive: true, force: true });
    try {
      for (const skillId of managedSkillIds) {
        fs.mkdirSync(stageRoot, { recursive: true });
        fs.cpSync(path.join(sourceSkillsRoot, skillId), path.join(stageRoot, skillId), { recursive: true });
      }
      if (skillTreeDigest(stageRoot, managedSkillIds) !== contentDigest) {
        throw new Error('staged scope skill digest mismatch');
      }
      fs.mkdirSync(targetSkillsRoot, { recursive: true });
      for (const skillId of transactionSkillIds) {
        const targetSkill = path.join(targetSkillsRoot, skillId);
        const backupSkill = path.join(backupRoot, skillId);
        if (fs.existsSync(targetSkill)) {
          fs.mkdirSync(path.dirname(backupSkill), { recursive: true });
          fs.renameSync(targetSkill, backupSkill);
        }
        if (managedSkillIds.includes(skillId)) fs.renameSync(path.join(stageRoot, skillId), targetSkill);
      }
      if (skillTreeDigest(targetSkillsRoot, managedSkillIds) !== contentDigest) {
        throw new Error('activated scope skill digest mismatch');
      }
      if (!input.retainTransactionBackup) {
        fs.rmSync(transactionRoot, { recursive: true, force: true });
      }
    } catch (error) {
      for (const skillId of transactionSkillIds) {
        const targetSkill = path.join(targetSkillsRoot, skillId);
        const backupSkill = path.join(backupRoot, skillId);
        fs.rmSync(targetSkill, { recursive: true, force: true });
        if (fs.existsSync(backupSkill)) {
          fs.mkdirSync(path.dirname(targetSkill), { recursive: true });
          fs.renameSync(backupSkill, targetSkill);
        }
      }
      fs.rmSync(transactionRoot, { recursive: true, force: true });
      throw error;
    }
  }
  return {
    scope: input.scope,
    target_root: input.targetRoot,
    provider_package_id: input.provider.package_id,
    provider_lock_ref: input.providerLockRef,
    transaction_id: input.transactionId,
    required_skill_ids: requiredSkillIds,
    managed_skill_ids: managedSkillIds,
    specialty_skill_ids: specialtyIds,
    retired_skill_ids: retiredSkillIds,
    skill_digests: Object.fromEntries(managedSkillIds.map((skillId) => [
      skillId,
      skillDigest(sourceSkillsRoot, skillId),
    ])),
    content_digest: contentDigest,
    core_digest: coreDigest,
    full_export_digest: contentDigest,
    materialized_at: nowIso(),
    lifecycle_receipt_ref: 'pending_dependency_transaction',
  };
}

function scopeTransactionRoot(targetRoot: string, transactionId: string) {
  return path.join(targetRoot, '.codex', '.opl-package-transactions', transactionId);
}

export function assertCapabilityScopeRollbackReady(
  materialization: AgentPackageScopeMaterialization,
) {
  const transactionRoot = scopeTransactionRoot(
    materialization.target_root,
    materialization.transaction_id,
  );
  if (!fs.existsSync(transactionRoot) || !fs.statSync(transactionRoot).isDirectory()) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Package scope rollback backup is missing.',
      {
        provider_package_id: materialization.provider_package_id,
        target_root: materialization.target_root,
        transaction_id: materialization.transaction_id,
        failure_code: 'agent_package_scope_rollback_backup_missing',
      },
    );
  }
  const targetSkillsRoot = path.join(materialization.target_root, '.codex', 'skills');
  for (const skillId of materialization.managed_skill_ids) {
    const targetSkill = path.join(targetSkillsRoot, skillId);
    const expectedDigest = materialization.skill_digests[skillId];
    const actualDigest = fs.existsSync(targetSkill)
      ? skillDigest(targetSkillsRoot, skillId)
      : null;
    if (!expectedDigest || actualDigest !== expectedDigest) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'Package scope rollback target changed after optimization.',
        {
          provider_package_id: materialization.provider_package_id,
          target_root: materialization.target_root,
          skill_id: skillId,
          expected_digest: expectedDigest ?? null,
          actual_digest: actualDigest,
          failure_code: 'agent_package_scope_rollback_conflict',
        },
      );
    }
  }
}

export function finalizeCapabilityScopeTransaction(materialization: AgentPackageScopeMaterialization) {
  fs.rmSync(scopeTransactionRoot(materialization.target_root, materialization.transaction_id), { recursive: true, force: true });
}

export function rollbackCapabilityScopeTransaction(
  materialization: AgentPackageScopeMaterialization,
) {
  const transactionRoot = scopeTransactionRoot(materialization.target_root, materialization.transaction_id);
  const backupRoot = path.join(transactionRoot, 'backup');
  const targetSkillsRoot = path.join(materialization.target_root, '.codex', 'skills');
  for (const skillId of [...materialization.managed_skill_ids, ...materialization.retired_skill_ids]) {
    const targetSkill = path.join(targetSkillsRoot, skillId);
    const backupSkill = path.join(backupRoot, skillId);
    fs.rmSync(targetSkill, { recursive: true, force: true });
    if (fs.existsSync(backupSkill)) {
      fs.mkdirSync(path.dirname(targetSkill), { recursive: true });
      fs.renameSync(backupSkill, targetSkill);
    }
  }
  fs.rmSync(transactionRoot, { recursive: true, force: true });
}

export function materializeCapabilityScopeFromLock(input: {
  provider: AgentPackageLock;
  scope: 'workspace' | 'quest';
  targetRoot: string;
  transactionId: string;
  dryRun: boolean;
  retainTransactionBackup?: boolean;
  previousMaterialization?: AgentPackageScopeMaterialization | null;
}) {
  return materializeCapabilityScope({
    ...input,
    providerLockRef: input.provider.lock_ref,
    provider: {
      package_id: input.provider.package_id,
      agent_id: input.provider.agent_id,
      display_name: input.provider.display_name,
      publisher: input.provider.publisher,
      version: input.provider.package_version,
      owner_language_version: input.provider.owner_language_version,
      source: '',
      codex_surface: {},
      skill_packs: [],
      entrypoints: [],
      health_check: {},
      permissions: [],
      distribution_payload: null,
      update_channel: '',
      rollback_ref: input.provider.rollback_ref,
      codex_visible_entry: input.provider.codex_visible_entry,
      required_skill_ids: input.provider.bundled_required_skill_ids,
      optional_skill_refs: input.provider.optional_skill_refs,
      plugin_id: input.provider.physical_surface?.plugin_id ?? null,
      plugin_source_path: input.provider.physical_surface?.plugin_source_path ?? null,
      plugin_payload_manifest_url: input.provider.physical_surface?.plugin_payload_manifest_url ?? null,
      plugin_payload_manifest_sha256: input.provider.physical_surface?.plugin_payload_manifest_sha256 ?? null,
      plugin_payload_cache_path: input.provider.physical_surface?.plugin_payload_cache_path ?? null,
      profile_surface: null,
    managed_policy_surface: null,
      runtime_source_carrier: null,
      managed_update_source: input.provider.managed_update_source,
      capability_dependencies: input.provider.capability_dependencies,
      capability_provider: input.provider.capability_provider,
      content_digest: input.provider.content_digest,
      content_lock_paths: input.provider.content_lock_paths,
    },
  });
}

export function scopeMaterializationReadiness(
  lock: AgentPackageLock,
  index: AgentPackageLockIndex,
  input: ScopeInput,
): AgentPackageMaterializationReadiness {
  if ((lock.capability_dependencies ?? []).length === 0) {
    return {
      status: 'not_required',
      scope: input.scope ?? null,
      target_root: null,
      required_skill_ids: [],
      materialized_skill_ids: [],
      expected_digest: null,
      actual_digest: null,
      repair_command: null,
      lifecycle_receipt_ref: null,
      core_readiness: { status: 'not_required', required_skill_ids: [], materialized_skill_ids: [] },
      specialty_exposure: { status: 'not_required', declared_skill_ids: [], materialized_skill_ids: [], missing_skill_ids: [] },
    };
  }
  const scope = input.scope ?? null;
  const targetRoot = scope
    ? path.resolve(scope === 'workspace' ? input.targetWorkspace ?? '' : input.targetQuest ?? '')
    : null;
  if (!scope || !targetRoot || targetRoot === path.resolve('')) {
    return {
      status: 'scope_required',
      scope,
      target_root: null,
      required_skill_ids: [],
      materialized_skill_ids: [],
      expected_digest: null,
      actual_digest: null,
      repair_command: `opl packages repair --package-id ${lock.package_id} --scope workspace --target-workspace <path>`,
      lifecycle_receipt_ref: null,
      core_readiness: { status: 'missing', required_skill_ids: [], materialized_skill_ids: [] },
      specialty_exposure: { status: 'not_required', declared_skill_ids: [], materialized_skill_ids: [], missing_skill_ids: [] },
    };
  }
  const records = (lock.scope_materializations ?? []).filter((entry) =>
    entry.scope === scope && entry.target_root === targetRoot);
  const targetSkillsRoot = path.join(targetRoot, '.codex', 'skills');
  const providerReadiness = lock.capability_dependencies.map((dependency) => {
    const record = records.find((entry) => entry.provider_package_id === dependency.package_id) ?? null;
    const provider = index.packages.find((entry) => entry.package_id === dependency.package_id) ?? null;
    const requiredSkillIds = record?.required_skill_ids
      ?? provider?.capability_provider?.exports
        .filter((entry) => entry.install_mode === 'core_required')
        .map((entry) => entry.skill_id)
      ?? [];
    const specialtyIds = record?.specialty_skill_ids
      ?? provider?.capability_provider?.exports
        .filter((entry) => entry.install_mode === 'optional_named_specialty')
        .map((entry) => entry.skill_id)
      ?? [];
    const managedSkillIds = [...requiredSkillIds, ...specialtyIds];
    const materializedSkillIds = requiredSkillIds.filter((skillId) =>
      fs.existsSync(path.join(targetSkillsRoot, skillId, 'SKILL.md')));
    const materializedSpecialtyIds = specialtyIds.filter((skillId) =>
      fs.existsSync(path.join(targetSkillsRoot, skillId, 'SKILL.md')));
    const coreActualDigest = materializedSkillIds.length === requiredSkillIds.length
      ? skillTreeDigest(targetSkillsRoot, requiredSkillIds)
      : null;
    const fullActualDigest = materializedSkillIds.length === requiredSkillIds.length
      && materializedSpecialtyIds.length === specialtyIds.length
      ? skillTreeDigest(targetSkillsRoot, managedSkillIds)
      : null;
    const status = !record || materializedSkillIds.length !== requiredSkillIds.length
      ? 'missing'
      : coreActualDigest !== (record.core_digest ?? record.content_digest)
        || !record.lifecycle_receipt_ref
        || record.lifecycle_receipt_ref === 'pending_dependency_transaction'
        || !provider
        || record.provider_lock_ref !== provider.lock_ref
        ? 'incompatible'
        : 'current';
    return {
      record,
      requiredSkillIds,
      specialtyIds,
      materializedSkillIds,
      materializedSpecialtyIds,
      actualDigest: coreActualDigest,
      fullActualDigest,
      status,
    };
  });
  const requiredSkillIds = [...new Set(providerReadiness.flatMap((entry) => entry.requiredSkillIds))];
  const materializedSkillIds = requiredSkillIds.filter((skillId) =>
    fs.existsSync(path.join(targetSkillsRoot, skillId, 'SKILL.md')));
  const status = providerReadiness.some((entry) => entry.status === 'missing')
    ? 'missing'
    : providerReadiness.some((entry) => entry.status === 'incompatible')
      ? 'incompatible'
      : 'current';
  const expectedDigest = providerReadiness.length === 1
    ? providerReadiness[0].record?.core_digest ?? providerReadiness[0].record?.content_digest ?? null
    : `sha256:${sha256Text(JSON.stringify(providerReadiness.map((entry) => ({
        provider_package_id: entry.record?.provider_package_id ?? null,
        content_digest: entry.record?.content_digest ?? null,
      }))))}`;
  const actualDigest = providerReadiness.some((entry) => entry.actualDigest === null)
    ? null
    : providerReadiness.length === 1
      ? providerReadiness[0].actualDigest
      : `sha256:${sha256Text(JSON.stringify(providerReadiness.map((entry) => entry.actualDigest)))}`;
  const lifecycleReceiptRefs = [...new Set(records.map((entry) => entry.lifecycle_receipt_ref))];
  const specialtyIds = [...new Set(providerReadiness.flatMap((entry) => entry.specialtyIds))];
  const materializedSpecialtyIds = specialtyIds.filter((skillId) =>
    fs.existsSync(path.join(targetSkillsRoot, skillId, 'SKILL.md')));
  const targetFlag = scope === 'workspace' ? '--target-workspace' : '--target-quest';
  return {
    status,
    scope,
    target_root: targetRoot,
    required_skill_ids: requiredSkillIds,
    materialized_skill_ids: materializedSkillIds,
    expected_digest: expectedDigest,
    actual_digest: actualDigest,
    repair_command: `opl packages repair --package-id ${lock.package_id} --scope ${scope} ${targetFlag} ${targetRoot}`,
    lifecycle_receipt_ref: lifecycleReceiptRefs.length === 1 ? lifecycleReceiptRefs[0] : null,
    core_readiness: {
      status: status === 'current' ? 'current' : status,
      required_skill_ids: requiredSkillIds,
      materialized_skill_ids: materializedSkillIds,
    },
    specialty_exposure: {
      status: specialtyIds.length === 0
        ? 'not_required'
        : materializedSpecialtyIds.length === specialtyIds.length
          ? 'current'
          : 'degraded',
      declared_skill_ids: specialtyIds,
      materialized_skill_ids: materializedSpecialtyIds,
      missing_skill_ids: specialtyIds.filter((skillId) => !materializedSpecialtyIds.includes(skillId)),
    },
  };
}
