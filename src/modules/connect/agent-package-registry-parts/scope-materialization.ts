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

export function materializeCapabilityScope(input: {
  provider: AgentPackageManifest;
  scope: 'workspace' | 'quest';
  targetRoot: string;
  transactionId: string;
  providerLockRef: string;
  dryRun: boolean;
  retainTransactionBackup?: boolean;
}): AgentPackageScopeMaterialization {
  const sourceRoot = input.provider.plugin_source_path;
  const requiredSkillIds = coreSkillIds(input.provider);
  if (!sourceRoot || requiredSkillIds.length === 0) {
    throw new FrameworkContractError('contract_shape_invalid', 'Capability provider cannot materialize a scope without a physical core-skill source.', {
      provider_package_id: input.provider.package_id,
      plugin_source_path: sourceRoot,
      required_skill_ids: requiredSkillIds,
      failure_code: 'agent_package_scope_provider_source_missing',
    });
  }
  for (const skillId of requiredSkillIds) {
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
  const contentDigest = skillTreeDigest(sourceSkillsRoot, requiredSkillIds);
  if (!input.dryRun) {
    const codexRoot = path.join(input.targetRoot, '.codex');
    const targetSkillsRoot = path.join(codexRoot, 'skills');
    const transactionRoot = path.join(codexRoot, '.opl-package-transactions', input.transactionId);
    const stageRoot = path.join(transactionRoot, 'stage');
    const backupRoot = path.join(transactionRoot, 'backup');
    fs.rmSync(transactionRoot, { recursive: true, force: true });
    try {
      for (const skillId of requiredSkillIds) {
        fs.mkdirSync(stageRoot, { recursive: true });
        fs.cpSync(path.join(sourceSkillsRoot, skillId), path.join(stageRoot, skillId), { recursive: true });
      }
      if (skillTreeDigest(stageRoot, requiredSkillIds) !== contentDigest) {
        throw new Error('staged scope skill digest mismatch');
      }
      fs.mkdirSync(targetSkillsRoot, { recursive: true });
      for (const skillId of requiredSkillIds) {
        const targetSkill = path.join(targetSkillsRoot, skillId);
        const backupSkill = path.join(backupRoot, skillId);
        if (fs.existsSync(targetSkill)) {
          fs.mkdirSync(path.dirname(backupSkill), { recursive: true });
          fs.renameSync(targetSkill, backupSkill);
        }
        fs.renameSync(path.join(stageRoot, skillId), targetSkill);
      }
      if (skillTreeDigest(targetSkillsRoot, requiredSkillIds) !== contentDigest) {
        throw new Error('activated scope skill digest mismatch');
      }
      if (!input.retainTransactionBackup) {
        fs.rmSync(transactionRoot, { recursive: true, force: true });
      }
    } catch (error) {
      for (const skillId of requiredSkillIds) {
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
    content_digest: contentDigest,
    materialized_at: nowIso(),
    lifecycle_receipt_ref: 'pending_dependency_transaction',
  };
}

function scopeTransactionRoot(targetRoot: string, transactionId: string) {
  return path.join(targetRoot, '.codex', '.opl-package-transactions', transactionId);
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
  for (const skillId of materialization.required_skill_ids) {
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
    };
  }
  const record = (lock.scope_materializations ?? []).find((entry) =>
    entry.scope === scope && entry.target_root === targetRoot);
  const provider = record
    ? index.packages.find((entry) => entry.package_id === record.provider_package_id)
    : null;
  const requiredSkillIds = record?.required_skill_ids
    ?? provider?.capability_provider?.exports.filter((entry) => entry.install_mode === 'core_required').map((entry) => entry.skill_id)
    ?? [];
  const targetSkillsRoot = path.join(targetRoot, '.codex', 'skills');
  const materializedSkillIds = requiredSkillIds.filter((skillId) =>
    fs.existsSync(path.join(targetSkillsRoot, skillId, 'SKILL.md')));
  const actualDigest = materializedSkillIds.length === requiredSkillIds.length
    ? skillTreeDigest(targetSkillsRoot, requiredSkillIds)
    : null;
  const status = !record || materializedSkillIds.length !== requiredSkillIds.length
    ? 'missing'
    : actualDigest !== record.content_digest
      || !record.lifecycle_receipt_ref
      || record.lifecycle_receipt_ref === 'pending_dependency_transaction'
      || !provider
      || record.provider_lock_ref !== provider.lock_ref
      ? 'incompatible'
      : 'current';
  const targetFlag = scope === 'workspace' ? '--target-workspace' : '--target-quest';
  return {
    status,
    scope,
    target_root: targetRoot,
    required_skill_ids: requiredSkillIds,
    materialized_skill_ids: materializedSkillIds,
    expected_digest: record?.content_digest ?? null,
    actual_digest: actualDigest,
    repair_command: `opl packages repair --package-id ${lock.package_id} --scope ${scope} ${targetFlag} ${targetRoot}`,
    lifecycle_receipt_ref: record?.lifecycle_receipt_ref ?? null,
  };
}
