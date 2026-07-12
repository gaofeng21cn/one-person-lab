import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { FrameworkContractError } from '../../kernel/contract-validation.ts';
import { bootstrapLocalCodexDefaults } from '../../kernel/local-codex-defaults.ts';
import { resolveOplStatePaths } from '../../kernel/runtime-state-paths.ts';
import { syncOplCompanionSkills } from './install-companions.ts';
import {
  materializeLocalCodexPluginMarketplace,
  registerLocalCodexPlugin,
  unregisterLocalCodexPlugin,
} from './system-installation/codex-plugin-registry.ts';
import { runGit } from './system-installation/shared.ts';

type JsonRecord = Record<string, unknown>;

type WorkflowDependency = {
  id: string;
  kind: 'base' | 'codex_skill' | 'cli' | 'runtime_capability';
  offline_bundle: 'none' | 'full';
  online_install_default: boolean;
  activation: 'always' | 'task_routed' | 'explicit';
  source: string;
};

type WorkflowMigration = {
  id: string;
  discovery_ids: string[];
  auto_retire_on_optimize: boolean;
  reason: string;
};

export type OplFlowWorkflowPolicy = {
  schema: 'opl_flow_workflow_policy.v1';
  package: {
    id: 'opl-flow';
    version: string;
    owner: 'opl-flow';
    kind: 'workflow_profile';
  };
  workflow_generation: string;
  requires: WorkflowDependency[];
  recommends: WorkflowDependency[];
  compatible_optional: WorkflowDependency[];
  conflicts: WorkflowMigration[];
  retires: WorkflowMigration[];
  codex_model_policy: {
    authority: 'opl-flow';
    mode_default: 'auto';
    configured_default: { model: string; reasoning_effort: string };
    override_precedence: string[];
    catalog_policy: JsonRecord;
  };
  migration_policy: JsonRecord;
  historical_fingerprints: JsonRecord;
};

export type WorkflowPackageAction = 'install' | 'update' | 'rollback' | 'profile_apply';

export type WorkflowPackageActionInput = {
  packageId: string;
  keep?: string[];
  receiptPath?: string;
  mergePacketPath?: string;
};

const PACKAGE_ID = 'opl-flow';
const MARKETPLACE_ID = 'opl-agent-opl-flow-local';
const PLUGIN_ID = 'opl-flow';
const REPO_URL = 'https://github.com/gaofeng21cn/opl-flow.git';

function readJsonRecord(filePath: string): JsonRecord {
  const value = JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new FrameworkContractError('contract_shape_invalid', `${filePath} must contain a JSON object.`, { file_path: filePath });
  }
  return value as JsonRecord;
}

function sha256File(filePath: string) {
  return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function writeJson(filePath: string, value: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function timestamp() {
  return new Date().toISOString().replace(/[-:.]/g, '').replace('Z', 'Z');
}

function codexHome(home: string) {
  return process.env.CODEX_HOME?.trim() || path.join(home, '.codex');
}

function workflowPackageRoot() {
  const paths = resolveOplStatePaths();
  const explicit = process.env.OPL_FLOW_REPO_ROOT?.trim();
  const fullRuntime = process.env.OPL_FULL_RUNTIME_HOME?.trim();
  const candidates = [
    explicit || null,
    fullRuntime ? path.join(fullRuntime, 'modules', PACKAGE_ID) : null,
    path.join(paths.state_dir, 'modules', PACKAGE_ID),
    path.resolve(process.cwd(), '..', PACKAGE_ID),
  ].filter((candidate): candidate is string => Boolean(candidate));
  return candidates.find((candidate) => fs.existsSync(path.join(candidate, 'contracts', 'workflow-policy.json')))
    ?? path.join(paths.state_dir, 'modules', PACKAGE_ID);
}

function ensureWorkflowCheckout(action: 'install' | 'update') {
  const root = workflowPackageRoot();
  if (!fs.existsSync(path.join(root, 'contracts', 'workflow-policy.json'))) {
    fs.mkdirSync(path.dirname(root), { recursive: true });
    const clone = runGit(['clone', '--depth', '1', process.env.OPL_FLOW_REPO_URL?.trim() || REPO_URL, root]);
    if (clone.exitCode !== 0) {
      throw new FrameworkContractError('codex_command_failed', 'OPL Flow package checkout could not be installed.', {
        package_id: PACKAGE_ID,
        checkout_path: root,
        stderr: clone.stderr,
      });
    }
    return { root, source_action: 'cloned' as const };
  }
  if (action === 'update' && fs.existsSync(path.join(root, '.git'))) {
    const dirty = runGit(['status', '--porcelain'], root);
    if (dirty.exitCode === 0 && dirty.stdout.trim()) {
      throw new FrameworkContractError('contract_shape_invalid', 'Managed OPL Flow checkout is dirty and cannot be updated automatically.', {
        package_id: PACKAGE_ID,
        checkout_path: root,
      });
    }
    const pull = runGit(['pull', '--ff-only'], root);
    if (pull.exitCode !== 0) {
      throw new FrameworkContractError('codex_command_failed', 'OPL Flow package update failed.', {
        package_id: PACKAGE_ID,
        checkout_path: root,
        stderr: pull.stderr,
      });
    }
    return { root, source_action: 'updated' as const };
  }
  return { root, source_action: 'reused' as const };
}

export function readOplFlowWorkflowPolicy(root = workflowPackageRoot()): OplFlowWorkflowPolicy {
  const policyPath = path.join(root, 'contracts', 'workflow-policy.json');
  if (!fs.existsSync(policyPath)) {
    throw new FrameworkContractError('surface_not_found', 'OPL Flow workflow policy was not found.', {
      package_id: PACKAGE_ID,
      expected_path: policyPath,
    });
  }
  const value = readJsonRecord(policyPath) as unknown as OplFlowWorkflowPolicy;
  if (
    value.schema !== 'opl_flow_workflow_policy.v1'
    || value.package?.id !== PACKAGE_ID
    || value.package?.owner !== PACKAGE_ID
    || value.codex_model_policy?.authority !== PACKAGE_ID
    || !Array.isArray(value.recommends)
    || !Array.isArray(value.conflicts)
    || !Array.isArray(value.retires)
  ) {
    throw new FrameworkContractError('contract_shape_invalid', 'OPL Flow workflow policy has an invalid owner or shape.', {
      package_id: PACKAGE_ID,
      policy_path: policyPath,
    });
  }
  return value;
}

export function resolveOplFlowDependencyClosure(
  policy: OplFlowWorkflowPolicy,
  bundle: 'online' | 'full',
) {
  const selected = [...policy.requires, ...policy.recommends].filter((dependency) => (
    bundle === 'full'
      ? dependency.offline_bundle === 'full'
      : dependency.online_install_default
  ));
  return [...new Map(selected.map((dependency) => [`${dependency.kind}:${dependency.id}`, dependency])).values()];
}

function removeTomlTables(text: string, markers: string[]) {
  const lines = text.split('\n');
  const kept: string[] = [];
  let remove = false;
  let removed = false;
  for (const line of lines) {
    const header = line.trim();
    if (/^\[[^\]]+\]$/.test(header)) {
      remove = markers.some((marker) => header.toLowerCase().includes(marker.toLowerCase()));
      removed ||= remove;
    }
    if (!remove) kept.push(line);
  }
  if (!removed) return text;
  return `${kept.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()}\n`;
}

function legacyPaths(home: string) {
  const cHome = codexHome(home);
  const launchAgents = path.join(home, 'Library', 'LaunchAgents');
  const systemdUser = path.join(home, '.config', 'systemd', 'user');
  const serviceDefinitions = [
    ...(fs.existsSync(launchAgents)
      ? fs.readdirSync(launchAgents)
        .filter((entry) => entry.toLowerCase().includes('codexcont'))
        .map((entry) => path.join(launchAgents, entry))
      : []),
    ...(fs.existsSync(systemdUser)
      ? fs.readdirSync(systemdUser)
        .filter((entry) => entry.toLowerCase().includes('codexcont'))
        .map((entry) => path.join(systemdUser, entry))
      : []),
  ];
  return [
    path.join(home, '.agents', 'skills', 'superpowers'),
    path.join(home, '.agents', 'skills', 'superpowers-lite'),
    path.join(home, '.agents', 'skills', 'systematic-debugging'),
    path.join(home, '.agents', 'skills', 'test-driven-development'),
    path.join(home, '.agents', 'skills', 'verification-before-completion'),
    path.join(home, '.skills-manager', 'skills', 'superpowers-lite'),
    path.join(home, '.skills-manager', 'skills', 'superpowers-local-profile'),
    path.join(cHome, 'skills', 'superpowers'),
    path.join(cHome, 'superpowers'),
    path.join(cHome, '.tmp', 'plugins', 'plugins', 'superpowers'),
    path.join(cHome, 'plugins', 'cache', 'ponytail'),
    path.join(cHome, 'plugins', 'cache', 'ponytail-local'),
    path.join(cHome, 'plugins', 'data', 'ponytail-ponytail'),
    path.join(cHome, 'plugins', 'cache', 'opl-flow-local'),
    path.join(home, '.config', 'ponytail'),
    path.join(home, '.codexcont'),
    ...serviceDefinitions,
    ...['planner', 'executor', 'debugger', 'verifier'].flatMap((id) => [
      path.join(cHome, 'prompts', `${id}.md`),
      path.join(cHome, 'agents', `${id}.md`),
    ]),
  ];
}

function stopLegacyServices(home: string) {
  const actions: JsonRecord[] = [];
  const launchAgents = path.join(home, 'Library', 'LaunchAgents');
  if (fs.existsSync(launchAgents)) {
    for (const name of fs.readdirSync(launchAgents).filter((entry) => entry.toLowerCase().includes('codexcont'))) {
      const plist = path.join(launchAgents, name);
      const result = spawnSync('launchctl', ['bootout', `gui/${process.getuid?.() ?? ''}`, plist], { encoding: 'utf8' });
      actions.push({ service: plist, action: 'bootout', exit_code: result.status });
    }
  }
  const systemdRoot = path.join(home, '.config', 'systemd', 'user');
  if (fs.existsSync(systemdRoot)) {
    for (const name of fs.readdirSync(systemdRoot).filter((entry) => entry.toLowerCase().includes('codexcont'))) {
      const result = spawnSync('systemctl', ['--user', 'disable', '--now', name], { encoding: 'utf8' });
      actions.push({ service: name, action: 'disable_now', exit_code: result.status });
    }
  }
  return actions;
}

function retireLegacyWorkflow(policy: OplFlowWorkflowPolicy, keep: string[], backupRoot: string) {
  const home = resolveOplStatePaths().home_dir;
  const keepSet = new Set(keep);
  const enabledMigrations = [...policy.conflicts, ...policy.retires]
    .filter((entry) => entry.auto_retire_on_optimize && !keepSet.has(entry.id));
  const knownIds = new Set(enabledMigrations.flatMap((entry) => entry.discovery_ids));
  const actions: JsonRecord[] = [];
  const serviceActions = knownIds.has('codexcont') ? stopLegacyServices(home) : [];

  for (const source of legacyPaths(home)) {
    const normalized = source.toLowerCase();
    const relevant = [...knownIds].some((id) => normalized.includes(id.replace('upstream-', '').replaceAll('_', '-')))
      || (normalized.includes('superpowers') && (knownIds.has('superpowers') || knownIds.has('superpowers-lite')))
      || (normalized.includes('ponytail') && knownIds.has('ponytail'))
      || (normalized.includes('codexcont') && knownIds.has('codexcont'))
      || normalized.endsWith('/plugins/cache/opl-flow-local');
    if (!relevant || !fs.existsSync(source)) continue;
    const target = path.join(backupRoot, 'archived', source.replace(/^\/+/, ''));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.renameSync(source, target);
    actions.push({ id: path.basename(source), source, backup: target, action: 'archived_and_removed_from_discovery' });
  }

  const configPath = path.join(codexHome(home), 'config.toml');
  if (fs.existsSync(configPath)) {
    const current = fs.readFileSync(configPath, 'utf8');
    const next = removeTomlTables(current, ['superpowers', 'ponytail', 'codexcont']);
    if (next !== current) {
      const backup = path.join(backupRoot, 'config', 'config.toml');
      fs.mkdirSync(path.dirname(backup), { recursive: true });
      fs.copyFileSync(configPath, backup);
      fs.writeFileSync(configPath, next, 'utf8');
      actions.push({ id: 'codex-config', source: configPath, backup, action: 'legacy_routes_removed' });
    }
  }
  return { migrations: enabledMigrations.map((entry) => entry.id), actions, service_actions: serviceActions };
}

function registerWorkflowPlugin(root: string, home: string) {
  const configPath = path.join(codexHome(home), 'config.toml');
  const marketplaceRoot = path.join(resolveOplStatePaths().state_dir, 'codex-plugin-marketplaces', MARKETPLACE_ID);
  const marketplace = materializeLocalCodexPluginMarketplace({
    marketplace_id: MARKETPLACE_ID,
    plugin_id: PLUGIN_ID,
    display_name: 'OPL Flow',
    category: 'Developer Tools',
  }, root, marketplaceRoot);
  unregisterLocalCodexPlugin(configPath, 'opl-flow-local', PLUGIN_ID);
  registerLocalCodexPlugin(configPath, { marketplace_id: MARKETPLACE_ID, plugin_id: PLUGIN_ID }, marketplace.marketplace_root);
  return {
    plugin_id: `${PLUGIN_ID}@${MARKETPLACE_ID}`,
    config_path: configPath,
    marketplace_root: marketplace.marketplace_root,
    plugin_manifest_path: marketplace.plugin_manifest_path,
  };
}

function profileReceiptPath() {
  return path.join(resolveOplStatePaths().state_dir, 'workflow-packages', PACKAGE_ID, 'profile-receipt.json');
}

function createProfileMergePacket(root: string, home: string, sourceHash: string, targetHash: string | null) {
  const packet = path.join(resolveOplStatePaths().state_dir, 'workflow-packages', PACKAGE_ID, 'profile-merge', timestamp());
  fs.mkdirSync(path.join(packet, 'existing'), { recursive: true });
  fs.mkdirSync(path.join(packet, 'candidate'), { recursive: true });
  fs.mkdirSync(path.join(packet, 'output'), { recursive: true });
  const target = path.join(codexHome(home), 'AGENTS.md');
  if (fs.existsSync(target)) fs.copyFileSync(target, path.join(packet, 'existing', 'AGENTS.md'));
  fs.copyFileSync(path.join(root, 'templates', 'AGENTS.md'), path.join(packet, 'candidate', 'AGENTS.md'));
  fs.copyFileSync(path.join(root, 'templates', 'TASTE.md'), path.join(packet, 'candidate', 'TASTE.md'));
  fs.writeFileSync(path.join(packet, 'prompt.md'), [
    '# OPL Flow profile semantic merge',
    '',
    'Merge existing/AGENTS.md with candidate/AGENTS.md semantically.',
    'Preserve user-specific preferences, keep the result concise, and do not add a development methodology.',
    'Write output/AGENTS.md and output/merge-report.md. TASTE.md is optional.',
  ].join('\n'), 'utf8');
  writeJson(path.join(packet, 'merge-plan.json'), {
    schema: 'opl_flow_framework_profile_merge_packet.v1',
    status: 'requires_codex_semantic_merge',
    package_id: PACKAGE_ID,
    source_hash: sourceHash,
    target_hash: targetHash,
  });
  return packet;
}

function installWorkflowProfile(root: string, home: string, backupRoot: string) {
  const source = path.join(root, 'templates', 'AGENTS.md');
  const target = path.join(codexHome(home), 'AGENTS.md');
  const sourceHash = sha256File(source);
  const targetHash = fs.existsSync(target) ? sha256File(target) : null;
  const receiptPath = profileReceiptPath();
  const receipt = fs.existsSync(receiptPath) ? readJsonRecord(receiptPath) : null;
  const sourceUnchangedUserOverlay = receipt?.source_hash === sourceHash && receipt?.target_hash === targetHash;
  const cleanPreviousInstall = receipt?.source_hash === receipt?.target_hash && receipt?.target_hash === targetHash;
  if (targetHash && targetHash !== sourceHash && !sourceUnchangedUserOverlay && !cleanPreviousInstall) {
    return { status: 'merge_required' as const, merge_packet: createProfileMergePacket(root, home, sourceHash, targetHash) };
  }
  if (targetHash !== sourceHash && !sourceUnchangedUserOverlay) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    if (fs.existsSync(target)) {
      const backup = path.join(backupRoot, 'profile', 'AGENTS.md');
      fs.mkdirSync(path.dirname(backup), { recursive: true });
      fs.copyFileSync(target, backup);
    }
    fs.copyFileSync(source, target);
  }
  const tasteSource = path.join(root, 'templates', 'TASTE.md');
  const tasteTarget = path.join(codexHome(home), 'TASTE.md');
  if (!fs.existsSync(tasteTarget)) fs.copyFileSync(tasteSource, tasteTarget);
  writeJson(receiptPath, {
    schema: 'opl_flow_framework_profile_receipt.v1',
    package_id: PACKAGE_ID,
    source_hash: sourceHash,
    target_hash: sha256File(target),
    recorded_at: new Date().toISOString(),
  });
  return { status: targetHash === sourceHash || sourceUnchangedUserOverlay ? 'current' as const : 'installed' as const, receipt_path: receiptPath };
}

function applyProfileMergePacket(packetPath: string) {
  const packet = path.resolve(packetPath);
  const planPath = path.join(packet, 'merge-plan.json');
  const plan = readJsonRecord(planPath);
  if (plan.schema !== 'opl_flow_framework_profile_merge_packet.v1' || plan.status !== 'requires_codex_semantic_merge') {
    throw new FrameworkContractError('contract_shape_invalid', 'OPL Flow profile merge packet is not pending.', { packet_path: packet });
  }
  const output = path.join(packet, 'output', 'AGENTS.md');
  const report = path.join(packet, 'output', 'merge-report.md');
  if (!fs.existsSync(output) || !fs.existsSync(report)) {
    throw new FrameworkContractError('surface_not_found', 'OPL Flow profile merge output is incomplete.', { packet_path: packet });
  }
  const home = resolveOplStatePaths().home_dir;
  const target = path.join(codexHome(home), 'AGENTS.md');
  const currentHash = fs.existsSync(target) ? sha256File(target) : null;
  if (currentHash !== plan.target_hash) {
    throw new FrameworkContractError('contract_shape_invalid', 'User AGENTS.md changed after the merge packet was created.', { packet_path: packet });
  }
  const backupRoot = path.join(resolveOplStatePaths().state_dir, 'workflow-packages', PACKAGE_ID, 'backups', timestamp());
  if (fs.existsSync(target)) {
    fs.mkdirSync(path.join(backupRoot, 'profile'), { recursive: true });
    fs.copyFileSync(target, path.join(backupRoot, 'profile', 'AGENTS.md'));
  }
  fs.copyFileSync(output, target);
  const receiptPath = profileReceiptPath();
  writeJson(receiptPath, {
    schema: 'opl_flow_framework_profile_receipt.v1',
    package_id: PACKAGE_ID,
    source_hash: plan.source_hash,
    target_hash: sha256File(target),
    recorded_at: new Date().toISOString(),
    merge_packet: packet,
  });
  writeJson(planPath, { ...plan, status: 'applied', applied_at: new Date().toISOString(), backup_root: backupRoot });
  return { status: 'applied', merge_packet: packet, receipt_path: receiptPath, backup_root: backupRoot };
}

function rollbackWorkflowPackage(receiptPath: string) {
  const receipt = readJsonRecord(path.resolve(receiptPath));
  if (receipt.schema !== 'opl_workflow_package_receipt.v1' || receipt.package_id !== PACKAGE_ID) {
    throw new FrameworkContractError('contract_shape_invalid', 'Workflow package rollback receipt is invalid.', { receipt_path: receiptPath });
  }
  const actions = Array.isArray(receipt.migration_actions) ? receipt.migration_actions as JsonRecord[] : [];
  const restored: string[] = [];
  for (const action of [...actions].reverse()) {
    const source = typeof action.source === 'string' ? action.source : null;
    const backup = typeof action.backup === 'string' ? action.backup : null;
    if (!source || !backup || !fs.existsSync(backup)) continue;
    fs.mkdirSync(path.dirname(source), { recursive: true });
    if (action.action === 'legacy_routes_removed') {
      fs.copyFileSync(backup, source);
    } else {
      if (fs.existsSync(source)) continue;
      fs.renameSync(backup, source);
    }
    restored.push(source);
  }
  return { status: 'rolled_back', receipt_path: path.resolve(receiptPath), restored };
}

export function runWorkflowPackageAction(action: WorkflowPackageAction, input: WorkflowPackageActionInput) {
  if (input.packageId !== PACKAGE_ID) {
    throw new FrameworkContractError('surface_not_found', `Unknown workflow package: ${input.packageId}.`, {
      package_id: input.packageId,
      available: [PACKAGE_ID],
    });
  }
  if (action === 'profile_apply') {
    if (!input.mergePacketPath) throw new FrameworkContractError('contract_shape_invalid', 'Profile apply requires a merge packet.', {});
    return { version: 'g2', workflow_package: applyProfileMergePacket(input.mergePacketPath) };
  }
  if (action === 'rollback') {
    if (!input.receiptPath) throw new FrameworkContractError('contract_shape_invalid', 'Workflow package rollback requires a receipt.', {});
    return { version: 'g2', workflow_package: rollbackWorkflowPackage(input.receiptPath) };
  }

  const source = ensureWorkflowCheckout(action);
  const policy = readOplFlowWorkflowPolicy(source.root);
  const paths = resolveOplStatePaths();
  const backupRoot = path.join(paths.state_dir, 'workflow-packages', PACKAGE_ID, 'backups', timestamp());
  const migration = retireLegacyWorkflow(policy, input.keep ?? [], backupRoot);
  const plugin = registerWorkflowPlugin(source.root, paths.home_dir);
  const closure = resolveOplFlowDependencyClosure(policy, 'online');
  const skillIds = closure.filter((entry) => entry.kind === 'codex_skill').map((entry) => entry.id);
  const toolIds = closure.filter((entry) => entry.kind === 'cli' && (entry.id === 'officecli' || entry.id === 'mineru-open-api'))
    .map((entry) => entry.id as 'officecli' | 'mineru-open-api');
  const dependencies = syncOplCompanionSkills(paths.home_dir, {
    mode: 'managed',
    skillIds,
    toolIds,
  });
  const profile = installWorkflowProfile(source.root, paths.home_dir, backupRoot);
  const codexConfig = bootstrapLocalCodexDefaults();
  const policyPath = path.join(source.root, 'contracts', 'workflow-policy.json');
  const receiptPath = path.join(paths.state_dir, 'workflow-packages', PACKAGE_ID, 'receipts', `${timestamp()}.json`);
  const receipt = {
    schema: 'opl_workflow_package_receipt.v1',
    package_id: PACKAGE_ID,
    package_version: policy.package.version,
    action,
    status: profile.status === 'merge_required' ? 'profile_merge_required' : 'completed',
    recorded_at: new Date().toISOString(),
    source_root: source.root,
    source_action: source.source_action,
    policy_path: policyPath,
    policy_sha256: sha256File(policyPath),
    dependency_closure: closure,
    dependency_sync: dependencies,
    migration_ids: migration.migrations,
    migration_actions: migration.actions,
    service_actions: migration.service_actions,
    backup_root: backupRoot,
    plugin,
    profile,
    codex_config: codexConfig,
    restart_required: true,
  };
  writeJson(receiptPath, receipt);
  return {
    version: 'g2',
    workflow_package: {
      ...receipt,
      receipt_path: receiptPath,
    },
  };
}
