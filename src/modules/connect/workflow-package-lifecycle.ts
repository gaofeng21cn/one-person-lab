import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { FrameworkContractError } from '../../kernel/contract-validation.ts';
import { bootstrapLocalCodexDefaults } from '../../kernel/local-codex-defaults.ts';
import { resolveOplStatePaths } from '../../kernel/runtime-state-paths.ts';
import { resolveCodexBinary } from '../runway/index.ts';
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
  config_markers: string[];
  service_ids: string[];
  auto_retire_on_optimize: boolean;
  reason: string;
};

type WorkflowProfileFingerprints = {
  agents_marker_pairs?: Array<{ start: string; end: string }>;
  agents_legacy_section_headings?: string[];
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
  migration_policy: JsonRecord & {
    discovery_root_ids?: string[];
    profile_optimization?: JsonRecord;
  };
  historical_fingerprints: JsonRecord & WorkflowProfileFingerprints;
};

export type WorkflowPackageAction = 'install' | 'update' | 'optimize' | 'rollback' | 'profile_apply';

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

function sha256Text(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function writeJson(filePath: string, value: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function writeTextAtomic(filePath: string, value: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(temporary, value, 'utf8');
  fs.renameSync(temporary, filePath);
}

function timestamp() {
  return new Date().toISOString().replace(/[-:.]/g, '').replace('Z', 'Z');
}

function codexHome(home: string) {
  return process.env.CODEX_HOME?.trim() || path.join(home, '.codex');
}

function managedWorkflowPackageRoot() {
  return path.join(resolveOplStatePaths().state_dir, 'modules', PACKAGE_ID);
}

function isBundledWorkflowRoot(root: string) {
  const fullRuntime = process.env.OPL_FULL_RUNTIME_HOME?.trim();
  const fullRuntimeRoot = fullRuntime ? path.join(fullRuntime, 'modules', PACKAGE_ID) : null;
  return fs.existsSync(path.join(root, 'opl-runtime-module.json'))
    || Boolean(fullRuntimeRoot && path.resolve(root) === path.resolve(fullRuntimeRoot));
}

function workflowPackageRoot() {
  const explicit = process.env.OPL_FLOW_REPO_ROOT?.trim();
  const fullRuntime = process.env.OPL_FULL_RUNTIME_HOME?.trim();
  const managed = managedWorkflowPackageRoot();
  const packagedExplicit = explicit && (
    fs.existsSync(path.join(explicit, 'opl-runtime-module.json'))
    || Boolean(fullRuntime && path.resolve(explicit) === path.resolve(path.join(fullRuntime, 'modules', PACKAGE_ID)))
  );
  const candidates = [
    packagedExplicit ? null : explicit || null,
    managed,
    packagedExplicit ? explicit : null,
    fullRuntime ? path.join(fullRuntime, 'modules', PACKAGE_ID) : null,
    path.resolve(process.cwd(), '..', PACKAGE_ID),
  ].filter((candidate): candidate is string => Boolean(candidate));
  return candidates.find((candidate) => fs.existsSync(path.join(candidate, 'contracts', 'workflow-policy.json')))
    ?? managed;
}

function cloneWorkflowCheckout(root: string) {
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

function ensureWorkflowCheckout(action: 'install' | 'update' | 'optimize') {
  const root = workflowPackageRoot();
  if (!fs.existsSync(path.join(root, 'contracts', 'workflow-policy.json'))) {
    return cloneWorkflowCheckout(root);
  }
  if (action === 'update' && !fs.existsSync(path.join(root, '.git')) && isBundledWorkflowRoot(root)) {
    const managedRoot = managedWorkflowPackageRoot();
    if (fs.existsSync(managedRoot)) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'Managed OPL Flow package root exists but is not an updateable Git checkout.',
        { package_id: PACKAGE_ID, checkout_path: managedRoot, bundled_source_path: root },
      );
    }
    return cloneWorkflowCheckout(managedRoot);
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
  const migrations = [...(value.conflicts ?? []), ...(value.retires ?? [])];
  if (
    value.schema !== 'opl_flow_workflow_policy.v1'
    || value.package?.id !== PACKAGE_ID
    || value.package?.owner !== PACKAGE_ID
    || value.codex_model_policy?.authority !== PACKAGE_ID
    || !Array.isArray(value.recommends)
    || !Array.isArray(value.conflicts)
    || !Array.isArray(value.retires)
    || migrations.some((entry) => (
      !Array.isArray(entry.discovery_ids)
      || !Array.isArray(entry.config_markers)
      || !Array.isArray(entry.service_ids)
    ))
    || !Array.isArray(value.migration_policy?.discovery_root_ids)
    || value.migration_policy.discovery_root_ids.length === 0
    || value.migration_policy?.profile_optimization?.default_mode !== 'codex_semantic_merge'
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
  const blocks: string[][] = [];
  let current: string[] = [];
  const isTableHeader = (line: string) => /^\[\[?[^\]]+\]\]?\s*$/.test(line.trim());
  for (const line of lines) {
    if (isTableHeader(line) && current.length > 0) {
      blocks.push(current);
      current = [];
    }
    current.push(line);
  }
  if (current.length > 0) blocks.push(current);

  const normalizedMarkers = markers.map((marker) => marker.toLowerCase());
  let removed = false;
  const kept = blocks.flatMap((block) => {
    const header = block[0]?.trim().toLowerCase() ?? '';
    const headerMatch = normalizedMarkers.some((marker) => header.includes(marker));
    const skillPathMatch = header === '[[skills.config]]' && block.some((line) => {
      const pathValue = line.match(/^\s*path\s*=\s*["']([^"']+)["']\s*$/i)?.[1]?.toLowerCase();
      return Boolean(pathValue && normalizedMarkers.some((marker) => pathValue.includes(marker)));
    });
    if (headerMatch || skillPathMatch) {
      removed = true;
      return [];
    }
    return block;
  });
  if (!removed) return text;
  return `${kept.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()}\n`;
}

function listDiscoveryChildren(root: string) {
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) return [];
  return fs.readdirSync(root).map((entry) => path.join(root, entry));
}

function discoveryCandidates(rootId: string, home: string) {
  const cHome = codexHome(home);
  const roots: Record<string, () => string[]> = {
    codex_skills: () => listDiscoveryChildren(path.join(cHome, 'skills')),
    agent_skills: () => listDiscoveryChildren(path.join(home, '.agents', 'skills')),
    skills_manager_skills: () => listDiscoveryChildren(path.join(home, '.skills-manager', 'skills')),
    codex_plugin_cache: () => listDiscoveryChildren(path.join(cHome, 'plugins', 'cache')),
    codex_plugin_staging: () => listDiscoveryChildren(path.join(cHome, '.tmp', 'plugins', 'plugins')),
    codex_plugin_data: () => listDiscoveryChildren(path.join(cHome, 'plugins', 'data')),
    codex_prompts: () => listDiscoveryChildren(path.join(cHome, 'prompts')),
    codex_agents: () => listDiscoveryChildren(path.join(cHome, 'agents')),
    launch_agents: () => listDiscoveryChildren(path.join(home, 'Library', 'LaunchAgents')),
    systemd_user_services: () => listDiscoveryChildren(path.join(home, '.config', 'systemd', 'user')),
    legacy_config_roots: () => [
      path.join(cHome, 'superpowers'),
      path.join(home, '.config', 'ponytail'),
      path.join(home, '.codexcont'),
    ],
  };
  const resolve = roots[rootId];
  if (!resolve) {
    throw new FrameworkContractError('contract_shape_invalid', 'OPL Flow policy declares an unknown discovery root.', {
      discovery_root_id: rootId,
    });
  }
  return resolve();
}

function normalizeDiscoveryId(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\.(?:md|json|plist|service)$/i, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function readCandidateDeclaredIds(candidate: string) {
  const ids = new Set<string>([
    normalizeDiscoveryId(path.basename(candidate)),
    normalizeDiscoveryId(path.parse(candidate).name),
  ]);
  const skillPath = path.join(candidate, 'SKILL.md');
  if (fs.existsSync(skillPath)) {
    const frontmatter = fs.readFileSync(skillPath, 'utf8').slice(0, 4096).match(/^name:\s*["']?([^"'\n]+)["']?\s*$/m);
    if (frontmatter?.[1]) ids.add(normalizeDiscoveryId(frontmatter[1]));
  }
  for (const manifestPath of [path.join(candidate, '.codex-plugin', 'plugin.json'), path.join(candidate, 'plugin.json')]) {
    if (!fs.existsSync(manifestPath)) continue;
    try {
      const name = readJsonRecord(manifestPath).name;
      if (typeof name === 'string') ids.add(normalizeDiscoveryId(name));
    } catch {
      // A malformed legacy manifest remains discoverable by its bounded path identity.
    }
  }
  return ids;
}

function candidateMatchesMigration(candidate: string, migration: WorkflowMigration) {
  const candidateIds = readCandidateDeclaredIds(candidate);
  const discoveryIds = migration.discovery_ids.map(normalizeDiscoveryId);
  if (discoveryIds.some((id) => candidateIds.has(id))) return true;
  const serviceIds = migration.service_ids.map(normalizeDiscoveryId);
  return serviceIds.some((id) => [...candidateIds].some((candidateId) => (
    candidateId === id || candidateId.endsWith(`-${id}`)
  )));
}

function discoverLegacyPaths(policy: OplFlowWorkflowPolicy, migrations: WorkflowMigration[], home: string) {
  const rootIds = policy.migration_policy.discovery_root_ids ?? [];
  const candidates = new Set(rootIds.flatMap((rootId) => discoveryCandidates(rootId, home)));
  return [...candidates]
    .filter((candidate) => fs.existsSync(candidate))
    .map((candidate) => ({
      source: candidate,
      migrations: migrations.filter((migration) => candidateMatchesMigration(candidate, migration)),
    }))
    .filter((entry) => entry.migrations.length > 0)
    .sort((left, right) => left.source.length - right.source.length);
}

function stopLegacyServices(home: string, serviceIds: string[]) {
  const actions: JsonRecord[] = [];
  const normalizedIds = serviceIds.map(normalizeDiscoveryId);
  const matches = (entry: string) => {
    const normalized = normalizeDiscoveryId(entry);
    return normalizedIds.some((id) => normalized === id || normalized.endsWith(`-${id}`));
  };
  const launchAgents = path.join(home, 'Library', 'LaunchAgents');
  if (fs.existsSync(launchAgents)) {
    for (const name of fs.readdirSync(launchAgents).filter(matches)) {
      const plist = path.join(launchAgents, name);
      const result = spawnSync('launchctl', ['bootout', `gui/${process.getuid?.() ?? ''}`, plist], { encoding: 'utf8' });
      actions.push({ service: plist, action: 'bootout', exit_code: result.status });
    }
  }
  const systemdRoot = path.join(home, '.config', 'systemd', 'user');
  if (fs.existsSync(systemdRoot)) {
    for (const name of fs.readdirSync(systemdRoot).filter(matches)) {
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
  const actions: JsonRecord[] = [];
  const serviceIds = [...new Set(enabledMigrations.flatMap((entry) => entry.service_ids))];
  const serviceActions = stopLegacyServices(home, serviceIds);

  for (const { source, migrations } of discoverLegacyPaths(policy, enabledMigrations, home)) {
    if (!fs.existsSync(source)) continue;
    const target = path.join(backupRoot, 'archived', source.replace(/^\/+/, ''));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.renameSync(source, target);
    actions.push({
      id: path.basename(source),
      migration_ids: migrations.map((entry) => entry.id),
      source,
      backup: target,
      action: 'archived_and_removed_from_discovery',
    });
  }

  const configPath = path.join(codexHome(home), 'config.toml');
  if (fs.existsSync(configPath)) {
    const current = fs.readFileSync(configPath, 'utf8');
    const configMarkers = [...new Set(enabledMigrations.flatMap((entry) => entry.config_markers))];
    const next = removeTomlTables(current, configMarkers);
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

type ProfileFileAction = {
  action: 'created' | 'replaced';
  target: string;
  backup: string | null;
  before_hash: string | null;
  after_hash: string;
};

function markerPairs(policy: OplFlowWorkflowPolicy) {
  return (policy.historical_fingerprints.agents_marker_pairs ?? []).filter((pair) => (
    typeof pair.start === 'string' && pair.start.length > 0 && typeof pair.end === 'string' && pair.end.length > 0
  ));
}

function stripKnownMarkerBlocks(text: string, policy: OplFlowWorkflowPolicy) {
  let cleaned = text;
  const removed: string[] = [];
  for (const pair of markerPairs(policy)) {
    let searchFrom = 0;
    while (searchFrom < cleaned.length) {
      const startIndex = cleaned.indexOf(pair.start, searchFrom);
      if (startIndex < 0) break;
      const endIndex = cleaned.indexOf(pair.end, startIndex + pair.start.length);
      if (endIndex < 0) break;
      const removeEnd = endIndex + pair.end.length;
      cleaned = `${cleaned.slice(0, startIndex)}${cleaned.slice(removeEnd)}`;
      removed.push(pair.start);
      searchFrom = startIndex;
    }
  }
  if (removed.length > 0) {
    cleaned = `${cleaned.replace(/\n{3,}/g, '\n\n').trim()}\n`;
  }
  return { text: cleaned, removed_markers: removed };
}

function createProfileMergePacket(
  root: string,
  home: string,
  policy: OplFlowWorkflowPolicy,
  sourceHash: string,
  targetHash: string | null,
  keep: string[],
) {
  const packet = path.join(resolveOplStatePaths().state_dir, 'workflow-packages', PACKAGE_ID, 'profile-merge', timestamp());
  fs.mkdirSync(path.join(packet, 'existing'), { recursive: true });
  fs.mkdirSync(path.join(packet, 'candidate'), { recursive: true });
  fs.mkdirSync(path.join(packet, 'output'), { recursive: true });
  const target = path.join(codexHome(home), 'AGENTS.md');
  let preparedHash: string | null = null;
  let removedMarkers: string[] = [];
  if (fs.existsSync(target)) {
    const existing = fs.readFileSync(target, 'utf8');
    const prepared = stripKnownMarkerBlocks(existing, policy);
    fs.copyFileSync(target, path.join(packet, 'existing', 'AGENTS.original.md'));
    fs.writeFileSync(path.join(packet, 'existing', 'AGENTS.md'), prepared.text, 'utf8');
    preparedHash = sha256Text(prepared.text);
    removedMarkers = prepared.removed_markers;
  }
  fs.copyFileSync(path.join(root, 'templates', 'AGENTS.md'), path.join(packet, 'candidate', 'AGENTS.md'));
  fs.copyFileSync(path.join(root, 'templates', 'TASTE.md'), path.join(packet, 'candidate', 'TASTE.md'));
  fs.writeFileSync(path.join(packet, 'prompt.md'), [
    '# OPL Flow profile semantic merge',
    '',
    'Read existing/AGENTS.md, candidate/AGENTS.md, and merge-plan.json.',
    'Return only the JSON object required by output-schema.json.',
    'Use candidate/AGENTS.md verbatim as the beginning of agents_markdown.',
    'Preserve only distinct user-specific preferences from the existing file after that baseline.',
    'Remove duplicate, conflicting, obsolete, or GPT-5.5-era OPL workflow instructions and the legacy sections listed in merge-plan.json.',
    'Do not add a development methodology, project facts, task routing, guardrails, role state machines, or explanatory prose.',
    'Keep agents_markdown concise. Explain removals and preserved preferences in merge_report.',
  ].join('\n'), 'utf8');
  writeJson(path.join(packet, 'output-schema.json'), {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    additionalProperties: false,
    required: ['agents_markdown', 'merge_report'],
    properties: {
      agents_markdown: { type: 'string', minLength: 1 },
      merge_report: { type: 'string', minLength: 1 },
    },
  });
  writeJson(path.join(packet, 'merge-plan.json'), {
    schema: 'opl_flow_framework_profile_merge_packet.v1',
    status: 'requires_codex_semantic_merge',
    package_id: PACKAGE_ID,
    source_hash: sourceHash,
    target_hash: targetHash,
    prepared_target_hash: preparedHash,
    deterministic_removed_markers: removedMarkers,
    legacy_section_headings: policy.historical_fingerprints.agents_legacy_section_headings ?? [],
    kept_migration_ids: keep,
  });
  return packet;
}

function validateCodexProfileMerge(packet: string, value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Codex profile merge did not return an object.');
  }
  const output = value as JsonRecord;
  const agentsMarkdown = typeof output.agents_markdown === 'string' ? output.agents_markdown.trim() : '';
  const mergeReport = typeof output.merge_report === 'string' ? output.merge_report.trim() : '';
  if (!agentsMarkdown || !mergeReport) {
    throw new Error('Codex profile merge output is missing agents_markdown or merge_report.');
  }
  const candidate = fs.readFileSync(path.join(packet, 'candidate', 'AGENTS.md'), 'utf8').trim();
  if (!agentsMarkdown.startsWith(candidate)) {
    throw new Error('Codex profile merge output does not preserve the candidate baseline verbatim.');
  }
  const plan = readJsonRecord(path.join(packet, 'merge-plan.json'));
  const forbidden = [
    ...(Array.isArray(plan.legacy_section_headings) ? plan.legacy_section_headings : []),
    ...((Array.isArray(plan.deterministic_removed_markers) ? plan.deterministic_removed_markers : [])),
  ].filter((entry): entry is string => typeof entry === 'string' && entry.length > 0);
  const retainedLegacy = forbidden.filter((entry) => agentsMarkdown.includes(entry));
  if (retainedLegacy.length > 0) {
    throw new Error(`Codex profile merge retained legacy profile markers: ${retainedLegacy.join(', ')}`);
  }
  fs.writeFileSync(path.join(packet, 'output', 'AGENTS.md'), `${agentsMarkdown}\n`, 'utf8');
  fs.writeFileSync(path.join(packet, 'output', 'merge-report.md'), `${mergeReport}\n`, 'utf8');
}

function runCodexProfileMerge(packet: string) {
  if (process.env.OPL_FLOW_PROFILE_MERGE_MODE === 'packet') {
    return { status: 'skipped' as const, reason: 'packet_mode_requested' };
  }
  const codex = resolveCodexBinary();
  if (!codex) return { status: 'unavailable' as const, reason: 'codex_binary_missing' };
  const resultPath = path.join(packet, 'codex-result.json');
  const result = spawnSync(codex.path, [
    'exec',
    '--skip-git-repo-check',
    '--sandbox', 'read-only',
    '--ephemeral',
    '--cd', packet,
    '--output-schema', path.join(packet, 'output-schema.json'),
    '--output-last-message', resultPath,
    '-',
  ], {
    cwd: packet,
    encoding: 'utf8',
    env: process.env,
    input: fs.readFileSync(path.join(packet, 'prompt.md'), 'utf8'),
    timeout: Number(process.env.OPL_FLOW_CODEX_MERGE_TIMEOUT_MS ?? 300_000),
  });
  if (result.error || result.status !== 0 || !fs.existsSync(resultPath)) {
    return {
      status: 'failed' as const,
      reason: result.error?.message ?? result.stderr?.trim() ?? `codex_exit_${result.status ?? 1}`,
    };
  }
  try {
    validateCodexProfileMerge(packet, JSON.parse(fs.readFileSync(resultPath, 'utf8')) as unknown);
    return { status: 'completed' as const, codex_binary: codex.path };
  } catch (error) {
    return { status: 'failed' as const, reason: error instanceof Error ? error.message : String(error) };
  }
}

function applyProfileText(
  target: string,
  text: string,
  backupRoot: string,
  expectedTargetHash: string | null,
): ProfileFileAction | null {
  const currentHash = fs.existsSync(target) ? sha256File(target) : null;
  if (currentHash !== expectedTargetHash) {
    throw new FrameworkContractError('contract_shape_invalid', 'User profile changed during OPL Flow optimization.', {
      target,
      expected_target_hash: expectedTargetHash,
      current_target_hash: currentHash,
    });
  }
  const afterHash = sha256Text(text);
  if (currentHash === afterHash) return null;
  let backup: string | null = null;
  if (fs.existsSync(target)) {
    backup = path.join(backupRoot, 'profile', path.basename(target));
    fs.mkdirSync(path.dirname(backup), { recursive: true });
    fs.copyFileSync(target, backup);
  }
  writeTextAtomic(target, text);
  return {
    action: currentHash ? 'replaced' : 'created',
    target,
    backup,
    before_hash: currentHash,
    after_hash: sha256File(target),
  };
}

function writeProfileReceipt(sourceHash: string, target: string, fileActions: ProfileFileAction[], mergePacket?: string) {
  const receiptPath = profileReceiptPath();
  writeJson(receiptPath, {
    schema: 'opl_flow_framework_profile_receipt.v1',
    package_id: PACKAGE_ID,
    source_hash: sourceHash,
    target_hash: sha256File(target),
    recorded_at: new Date().toISOString(),
    file_actions: fileActions,
    ...(mergePacket ? { merge_packet: mergePacket } : {}),
  });
  return receiptPath;
}

function installWorkflowProfile(
  root: string,
  home: string,
  backupRoot: string,
  policy: OplFlowWorkflowPolicy,
  keep: string[],
) {
  const source = path.join(root, 'templates', 'AGENTS.md');
  const target = path.join(codexHome(home), 'AGENTS.md');
  const sourceHash = sha256File(source);
  const targetHash = fs.existsSync(target) ? sha256File(target) : null;
  const receiptPath = profileReceiptPath();
  const receipt = fs.existsSync(receiptPath) ? readJsonRecord(receiptPath) : null;
  const sourceUnchangedUserOverlay = receipt?.source_hash === sourceHash && receipt?.target_hash === targetHash;
  const cleanPreviousInstall = receipt?.source_hash === receipt?.target_hash && receipt?.target_hash === targetHash;
  const sourceText = fs.readFileSync(source, 'utf8');
  const existingText = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : null;
  const prepared = existingText === null ? null : stripKnownMarkerBlocks(existingText, policy);
  const preparedHash = prepared ? sha256Text(prepared.text) : null;
  const deterministicTarget = preparedHash === sourceHash;
  const shouldWriteSource = targetHash === null
    || deterministicTarget
    || (targetHash !== sourceHash && cleanPreviousInstall && !prepared?.removed_markers.length);
  const fileActions: ProfileFileAction[] = [];
  let mergePacket: string | undefined;
  let codexMergeResult: ReturnType<typeof runCodexProfileMerge> | undefined;

  if (shouldWriteSource) {
    const action = applyProfileText(target, sourceText, backupRoot, targetHash);
    if (action) fileActions.push(action);
  } else if (targetHash !== sourceHash && (!sourceUnchangedUserOverlay || prepared?.removed_markers.length)) {
    const packet = createProfileMergePacket(root, home, policy, sourceHash, targetHash, keep);
    const codexMerge = runCodexProfileMerge(packet);
    writeJson(path.join(packet, 'codex-attempt.json'), codexMerge);
    if (codexMerge.status !== 'completed') {
      return {
        status: 'merge_required' as const,
        merge_packet: packet,
        codex_merge: codexMerge,
        file_actions: fileActions,
      };
    }
    let applied: ReturnType<typeof applyProfileMergePacket>;
    try {
      applied = applyProfileMergePacket(packet, backupRoot);
    } catch (error) {
      return {
        status: 'merge_required' as const,
        merge_packet: packet,
        codex_merge: codexMerge,
        apply_error: error instanceof Error ? error.message : String(error),
        next_action: 'rerun_optimize_after_target_drift' as const,
        file_actions: fileActions,
      };
    }
    fileActions.push(...applied.file_actions);
    mergePacket = packet;
    codexMergeResult = codexMerge;
  }

  const tasteSource = path.join(root, 'templates', 'TASTE.md');
  const tasteTarget = path.join(codexHome(home), 'TASTE.md');
  if (!fs.existsSync(tasteTarget)) {
    const tasteText = fs.readFileSync(tasteSource, 'utf8');
    const action = applyProfileText(tasteTarget, tasteText, backupRoot, null);
    if (action) fileActions.push(action);
  }
  const writtenReceiptPath = writeProfileReceipt(sourceHash, target, fileActions, mergePacket);
  return {
    status: fileActions.length === 0 ? 'current' as const : 'optimized' as const,
    receipt_path: writtenReceiptPath,
    file_actions: fileActions,
    ...(mergePacket ? { merge_packet: mergePacket } : {}),
    ...(codexMergeResult ? { codex_merge: codexMergeResult } : {}),
  };
}

function applyProfileMergePacket(packetPath: string, providedBackupRoot?: string) {
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
  const backupRoot = providedBackupRoot
    ?? path.join(resolveOplStatePaths().state_dir, 'workflow-packages', PACKAGE_ID, 'backups', timestamp());
  const outputText = fs.readFileSync(output, 'utf8');
  const action = applyProfileText(target, outputText, backupRoot, currentHash);
  const fileActions = action ? [action] : [];
  const receiptPath = writeProfileReceipt(String(plan.source_hash), target, fileActions, packet);
  writeJson(planPath, { ...plan, status: 'applied', applied_at: new Date().toISOString(), backup_root: backupRoot });
  return {
    status: fileActions.length > 0 ? 'optimized' as const : 'current' as const,
    merge_packet: packet,
    receipt_path: receiptPath,
    backup_root: backupRoot,
    file_actions: fileActions,
  };
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
  const profile = receipt.profile && typeof receipt.profile === 'object' && !Array.isArray(receipt.profile)
    ? receipt.profile as JsonRecord
    : receipt;
  const profileActions = Array.isArray(profile.file_actions) ? profile.file_actions as JsonRecord[] : [];
  const profileRestored: string[] = [];
  const profileDrift: string[] = [];
  for (const action of [...profileActions].reverse()) {
    const target = typeof action.target === 'string' ? action.target : null;
    const afterHash = typeof action.after_hash === 'string' ? action.after_hash : null;
    const backup = typeof action.backup === 'string' ? action.backup : null;
    if (!target || !afterHash) continue;
    const currentHash = fs.existsSync(target) ? sha256File(target) : null;
    if (currentHash !== afterHash) {
      profileDrift.push(target);
      continue;
    }
    if (action.action === 'created') {
      fs.rmSync(target, { force: true });
    } else if (backup && fs.existsSync(backup)) {
      fs.copyFileSync(backup, target);
    } else {
      profileDrift.push(target);
      continue;
    }
    profileRestored.push(target);
  }
  return {
    status: profileDrift.length > 0 ? 'rolled_back_with_profile_drift' : 'rolled_back',
    receipt_path: path.resolve(receiptPath),
    restored,
    profile_restored: profileRestored,
    profile_drift: profileDrift,
  };
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
    const applied = applyProfileMergePacket(input.mergePacketPath);
    const packageReceiptPath = path.join(
      resolveOplStatePaths().state_dir,
      'workflow-packages',
      PACKAGE_ID,
      'receipts',
      `${timestamp()}.json`,
    );
    const packageReceipt = {
      schema: 'opl_workflow_package_receipt.v1',
      package_id: PACKAGE_ID,
      action,
      status: 'completed',
      recorded_at: new Date().toISOString(),
      migration_actions: [],
      profile: applied,
    };
    writeJson(packageReceiptPath, packageReceipt);
    return {
      version: 'g2',
      workflow_package: {
        ...applied,
        profile_receipt_path: applied.receipt_path,
        receipt_path: packageReceiptPath,
      },
    };
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
  const profile = installWorkflowProfile(source.root, paths.home_dir, backupRoot, policy, input.keep ?? []);
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
