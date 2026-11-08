import {
  agentPackageManifest,
  assert,
  formatJsonPayload,
  fs,
  os,
  path,
  parseJsonText,
  removeFixtureTree,
  repoRoot,
  registryPayload,
  runCli,
  runCliAsync,
  runCliFailure,
  test,
} from './helpers.ts';
import { pathToFileURL } from 'node:url';
import crypto from 'node:crypto';
import { codexNativeReadbackFixture } from '../../helpers-parts/codex-native-readback-fixture.ts';
import { validateJsonSchemaPayload } from '../../../../../src/kernel/schema-registry.ts';
import {
  normalizeAgentPluginName,
  resolveAgentPluginManifest,
} from '../../../../../src/kernel/agent-plugin-manifest.ts';
import {
  createMemoizedCodexPluginListRunner,
  githubArchiveFileSource,
  githubMarketplaceSourceIdentity,
  isTransientConfiguredDownloadFailure,
  runConfiguredDownloadWithTransientRetry,
  runConfiguredCodexPluginCarrier,
  type CodexPluginCommandRunner,
} from '../../../../../src/adapters/integration/agent-package-registry-parts/configured-codex-plugin-carrier.ts';
import { listAgentPackageSettingsActions } from '../../../../../src/adapters/integration/agent-package-actions.ts';
import {
  discoverAvailablePackageDescriptors,
  discoverInstalledPackageDescriptors,
} from '../../../../../src/adapters/integration/agent-package-registry-parts/installed-codex-plugin-directory.ts';
import { listCurrentPackageProjections } from '../../../../../src/kernel/standard-agent-registry.ts';
import { normalizePackageManifest } from '../../../../../src/adapters/integration/agent-package-registry-parts/manifest-normalizers.ts';
import {
  createOplAgentPackageStatusReader,
  runOplAgentPackageBulkUpdate,
} from '../../../../../src/adapters/integration/agent-package-registry.ts';
import {
  configuredCarrierFromDescriptor,
  selectPackageMutationDescriptor,
} from '../../../../../src/adapters/integration/agent-package-registry-parts/registry-status-projection.ts';


export {
  agentPackageManifest,
  assert,
  formatJsonPayload,
  fs,
  os,
  path,
  parseJsonText,
  removeFixtureTree,
  repoRoot,
  registryPayload,
  runCli,
  runCliAsync,
  runCliFailure,
  test,
  pathToFileURL,
  crypto,
  validateJsonSchemaPayload,
  normalizeAgentPluginName,
  resolveAgentPluginManifest,
  createMemoizedCodexPluginListRunner,
  githubArchiveFileSource,
  githubMarketplaceSourceIdentity,
  isTransientConfiguredDownloadFailure,
  runConfiguredDownloadWithTransientRetry,
  runConfiguredCodexPluginCarrier,
  listAgentPackageSettingsActions,
  discoverAvailablePackageDescriptors,
  discoverInstalledPackageDescriptors,
  listCurrentPackageProjections,
  normalizePackageManifest,
  createOplAgentPackageStatusReader,
  runOplAgentPackageBulkUpdate,
  configuredCarrierFromDescriptor,
  selectPackageMutationDescriptor,
};

export type { CodexPluginCommandRunner };

export const packageId = 'third.party.research';

export const pluginSelector = 'third-party-research@fixture-carrier';

export const ownerPackageVersion = '1.2.3';

export const descriptor = {
  packageId,
  carrier: {
    kind: 'codex_plugin_manager' as const,
    pluginId: pluginSelector,
    marketplaceSource: null,
  },
  executor: {
    route: 'codex_cli' as const,
    requiredSkillIds: ['third-party-research'],
  },
  publicationRef: 'oci://example.invalid/third-party-research:latest-stable',
};

export function pluginList(entries: Array<{
  pluginId: string;
  version: string;
  sourcePath: string;
  marketplaceSource: string;
  enabled?: boolean;
}>, marketplaces: unknown[] = []) {
  return JSON.stringify({
    installed: entries.map((entry) => ({
      pluginId: entry.pluginId,
      version: entry.version,
      installed: true,
      enabled: entry.enabled ?? true,
      source: { source: 'local', path: entry.sourcePath },
      marketplaceSource: { sourceType: 'local', source: entry.marketplaceSource },
    })),
    available: [],
    ...(marketplaces.length > 0 ? { marketplaces } : {}),
  });
}
export function writePluginSource(root: string, marker: string, skillsRoot = './skills/') {
  fs.mkdirSync(path.resolve(root, skillsRoot, 'third-party-research'), { recursive: true });
  fs.writeFileSync(
    path.resolve(root, skillsRoot, 'third-party-research', 'SKILL.md'),
    `# Third Party Research\n\n${marker}\n`,
  );
  writePluginManifest(root, '1.0.1', skillsRoot);
}

export function writePluginManifest(root: string, version = '1.0.1', skills = './skills/') {
  fs.mkdirSync(path.join(root, '.codex-plugin'), { recursive: true });
  fs.writeFileSync(path.join(root, '.codex-plugin', 'plugin.json'), formatJsonPayload({
    name: 'third-party-research',
    version,
    description: 'Unknown Package fixture carried by Codex Plugin Manager.',
    skills,
  }));
}

export function installedOwnerDescriptor() {
  return {
    ...agentPackageManifest(),
    presentation: {
      display_name_i18n: { 'en-US': 'Third Party Research' },
      description_i18n: { 'en-US': 'Descriptor-owned Home shortcuts.' },
      session_routing_summary_i18n: { 'en-US': 'Use the native carrier.' },
      home_shortcuts: [{
        shortcut_id: 'research',
        label_i18n: { 'en-US': 'Research' },
        default_visible: true,
        user_configurable: true,
        route: {
          route_kind: 'agent_package_shortcut',
          executor: 'codex_cli',
          codex_visible_entry: 'third-party-research',
        },
      }],
    },
  };
}

export function assertCommandOutputSchema(commandKey: string, payload: unknown) {
  const registry = parseJsonText(fs.readFileSync(
    path.join(repoRoot, 'contracts', 'opl-framework', 'cli-command-registry.json'),
    'utf8',
  )) as any;
  const validation = validateJsonSchemaPayload({
    schemaId: `opl.cli.${commandKey}.configured_carrier`,
    schema: registry.commands[commandKey].output_schema,
    sourceRef: `cli-command-registry.json#/commands/${commandKey}/output_schema`,
  }, payload);
  assert.equal(validation.ok, true, JSON.stringify(validation));
}

export function writeFakeCodex(binary: string, installedVersion = '1.0.1') {
  fs.writeFileSync(binary, `#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
const args = process.argv.slice(2);
const stateFile = process.env.FIXTURE_PLUGIN_STATE;
const sourcePath = process.env.FIXTURE_PLUGIN_SOURCE;
let state = fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, 'utf8')) : { installed: false, version: '1.0.0', marketplaceSource: null };
const configPath = path.join(process.env.CODEX_HOME, 'config.toml');
const enabled = !fs.existsSync(configPath) || !/\\[plugins\\."third-party-research@fixture-carrier"\\][\\s\\S]*?enabled = false/.test(fs.readFileSync(configPath, 'utf8'));
if (args.join(' ') === 'plugin marketplace list --json') {
  process.stdout.write(JSON.stringify({
    marketplaces: state.marketplaceSource ? [{
      marketplaceSource: { sourceType: 'local', source: state.marketplaceSource },
    }] : [],
  }));
} else if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'add') {
  state = { ...state, marketplaceSource: args[3] };
  fs.writeFileSync(stateFile, JSON.stringify(state));
  process.stdout.write(JSON.stringify({ status: 'ok' }));
} else if (args[0] === 'plugin' && args[1] === 'add') {
  if (!state.marketplaceSource) process.exitCode = 3;
  state = { ...state, installed: true, version: state.version === '1.0.0' ? ${JSON.stringify(installedVersion)} : state.version };
  fs.writeFileSync(stateFile, JSON.stringify(state));
  process.stdout.write(JSON.stringify({ status: 'ok' }));
} else if (args[0] === 'plugin' && args[1] === 'remove') {
  state = { ...state, installed: false };
  fs.writeFileSync(stateFile, JSON.stringify(state));
  process.stdout.write(JSON.stringify({ status: 'ok' }));
} else if (args.join(' ') === 'plugin list --available --json') {
  const entry = {
    pluginId: '${pluginSelector}',
    version: state.version,
    enabled,
    source: { source: 'local', path: sourcePath },
    marketplaceSource: { sourceType: 'local', source: 'fixture-carrier' },
  };
  process.stdout.write(JSON.stringify({
    installed: state.installed ? [{ ...entry, installed: true }] : [],
    available: state.installed ? [] : [{ ...entry, installed: false, enabled: false }],
  }));
} else if (args.join(' ') === 'plugin list --json') {
  process.stdout.write(JSON.stringify({
    installed: state.installed ? [{
      pluginId: '${pluginSelector}',
      version: state.version,
      installed: true,
      enabled,
      source: { source: 'local', path: sourcePath },
      marketplaceSource: { sourceType: 'local', source: 'fixture-carrier' },
    }] : [],
    available: [],
  }));
} else {
  process.exitCode = 2;
}
`);
  fs.chmodSync(binary, 0o755);
  const commands = `${binary}.commands.mjs`;
  fs.renameSync(binary, commands);
  fs.copyFileSync(codexNativeReadbackFixture(path.dirname(binary), commands).OPL_CODEX_PLUGIN_BIN, binary);
}

export function writeDiscoveryThenUnavailableCodex(binary: string, counterPath: string) {
  fs.writeFileSync(binary, `#!/usr/bin/env node
import fs from 'node:fs';
const args = process.argv.slice(2);
const counterPath = ${JSON.stringify(counterPath)};
const callCount = fs.existsSync(counterPath)
  ? Number(fs.readFileSync(counterPath, 'utf8'))
  : 0;
fs.writeFileSync(counterPath, String(callCount + 1));
if (callCount > 0 || args.join(' ') !== 'plugin list --json') {
  process.exitCode = 1;
} else {
  process.stdout.write(JSON.stringify({
    installed: [{
      pluginId: ${JSON.stringify(pluginSelector)},
      version: '1.0.1',
      installed: true,
      enabled: true,
      source: { source: 'local', path: process.env.FIXTURE_PLUGIN_SOURCE },
      marketplaceSource: { sourceType: 'local', source: 'fixture-carrier' },
    }],
    available: [],
  }));
}
`);
  fs.chmodSync(binary, 0o755);
}

export function writeUnavailableCodex(binary: string) {
  fs.writeFileSync(binary, `#!/usr/bin/env node
if (process.argv.slice(2).join(' ') === 'plugin list --json') {
  process.stderr.write('native list unavailable');
  process.exitCode = 23;
} else {
  process.exitCode = 2;
}
`);
  fs.chmodSync(binary, 0o755);
}

export function writeNativeMarketplace(root: string, version: string) {
  const pluginRoot = path.join(root, 'plugins', 'third-party-research');
  fs.mkdirSync(path.join(root, '.agents', 'plugins'), { recursive: true });
  writePluginSource(pluginRoot, 'callable');
  fs.writeFileSync(path.join(root, '.agents', 'plugins', 'marketplace.json'), formatJsonPayload({
    name: 'fixture-carrier',
    plugins: [{
      name: 'third-party-research',
      source: { source: 'local', path: './plugins/third-party-research' },
      policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' },
    }],
  }));
  writePluginManifest(pluginRoot, version);
}

export function unavailableCodexRunner(): CodexPluginCommandRunner {
  return () => ({
    status: null,
    stdout: '',
    stderr: '',
    error: Object.assign(new Error('spawnSync codex ENOENT'), { code: 'ENOENT' }),
  });
}
