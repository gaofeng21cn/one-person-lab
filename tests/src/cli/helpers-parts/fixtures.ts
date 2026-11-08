import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { parseJsonText } from '../../../../src/kernel/json-file.ts';

import { contractsDir, familyManifestFixtureDir, repoRoot } from './constants.ts';

export function createContractsFixtureRoot(mutator?: (contractsRoot: string) => void) {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-contract-fixture-'));
  const fixtureContractsRoot = path.join(fixtureRoot, 'contracts', 'opl-framework');
  fs.mkdirSync(fixtureContractsRoot, { recursive: true });
  fs.cpSync(contractsDir, fixtureContractsRoot, {
    recursive: true,
  });
  mutator?.(fixtureContractsRoot);
  return { fixtureRoot, fixtureContractsRoot };
}

export function createFakeCodexFixture(handlerBody: string) {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-codex-fixture-'));
  const codexPath = path.join(fixtureRoot, 'codex');
  fs.writeFileSync(
    codexPath,
    `#!/usr/bin/env bash
set -euo pipefail
${handlerBody}
`,
    { mode: 0o755 },
  );
  return {
    fixtureRoot,
    codexPath,
  };
}

export function createFakeCodexPluginManagerFixture(
  fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-codex-plugin-manager-fixture-')),
) {
  fs.mkdirSync(fixtureRoot, { recursive: true });
  const codexPath = path.join(fixtureRoot, 'codex');
  fs.writeFileSync(
    codexPath,
    `#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
if (args.length === 1 && args[0] === '--version') {
  process.stdout.write('codex-cli 0.134.0\\n');
  process.exit(0);
}

const configPath = path.join(process.env.CODEX_HOME || '', 'config.toml');
const config = fs.existsSync(configPath) ? fs.readFileSync(configPath, 'utf8') : '';
const sections = new Map();
let current = null;
for (const line of config.split('\\n')) {
  const header = line.trim().match(/^\\[([^\\]]+)\\]$/);
  if (header) {
    current = header[1];
    sections.set(current, []);
  } else if (current) {
    sections.get(current).push(line);
  }
}
const unquote = (value) => {
  if (value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1).replace(/\\\\"/g, '"').replace(/\\\\\\\\/g, '\\\\');
  }
  return value;
};
const stringValue = (lines, key) => {
  const pattern = new RegExp('^\\\\s*' + key + '\\\\s*=\\\\s*"((?:\\\\\\\\.|[^"\\\\\\\\])*)"\\\\s*$');
  for (const line of lines) {
    const match = line.match(pattern);
    if (match) return match[1].replace(/\\\\"/g, '"').replace(/\\\\\\\\/g, '\\\\');
  }
  return null;
};
const pluginTableSelector = (header) => header.startsWith('plugins.')
  ? unquote(header.slice('plugins.'.length))
  : null;
const removePluginTable = (selector) => {
  if (!fs.existsSync(configPath)) return;
  let omit = false;
  const retained = [];
  for (const line of config.split('\\n')) {
    const header = line.trim().match(/^\\[([^\\]]+)\\]$/);
    if (header) omit = pluginTableSelector(header[1]) === selector;
    if (!omit) retained.push(line);
  }
  fs.writeFileSync(configPath, retained.join('\\n'));
};
const marketplaces = new Map();
for (const [header, lines] of sections) {
  if (!header.startsWith('marketplaces.')) continue;
  const id = unquote(header.slice('marketplaces.'.length));
  const source = stringValue(lines, 'source');
  if (id && source) marketplaces.set(id, source);
}
const stateRoot = process.env.OPL_STATE_DIR || process.env.CODEX_HOME || process.cwd();
const homeKey = crypto.createHash('sha256')
  .update(process.env.CODEX_HOME || process.env.HOME || '')
  .digest('hex');
const statePath = path.join(stateRoot, 'fake-codex-plugin-manager', homeKey + '.json');
const state = fs.existsSync(statePath)
  ? JSON.parse(fs.readFileSync(statePath, 'utf8'))
  : { marketplaces: [], installed: [] };
for (const entry of state.marketplaces) marketplaces.set(entry.id, entry.source);

const writeState = () => {
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, JSON.stringify(state));
};
const localMarketplaceRoot = (source) => {
  try {
    if (source.startsWith('file:')) return fileURLToPath(source);
  } catch {}
  return fs.existsSync(source) ? source : null;
};
const marketplaceId = (source) => {
  const root = localMarketplaceRoot(source);
  const manifestPath = root && path.join(root, '.agents', 'plugins', 'marketplace.json');
  if (manifestPath && fs.existsSync(manifestPath)) {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (typeof manifest.name === 'string' && manifest.name) return manifest.name;
  }
  const withoutRef = source.split('@')[0];
  return path.basename(withoutRef).replace(/\\.git$/, '') || source;
};
const marketplacePluginSourcePath = (source, pluginId) => {
  const root = localMarketplaceRoot(source);
  if (!root) return null;
  const manifestPath = path.join(root, '.agents', 'plugins', 'marketplace.json');
  if (fs.existsSync(manifestPath)) {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const plugin = Array.isArray(manifest.plugins)
      ? manifest.plugins.find((entry) => entry && entry.name === pluginId)
      : null;
    const declaredPath = plugin && plugin.source && typeof plugin.source.path === 'string'
      ? plugin.source.path
      : null;
    if (declaredPath) {
      return path.isAbsolute(declaredPath)
        ? path.normalize(declaredPath)
        : path.resolve(root, declaredPath);
    }
  }
  return path.join(root, 'plugins', pluginId);
};
const configuredInstalled = [];
for (const [header, lines] of sections) {
  if (!header.startsWith('plugins.')) continue;
  const selector = unquote(header.slice('plugins.'.length));
  const separator = selector.lastIndexOf('@');
  if (separator <= 0) continue;
  const pluginId = selector.slice(0, separator);
  const marketplaceId = selector.slice(separator + 1);
  const marketplaceRoot = marketplaces.get(marketplaceId);
  if (!marketplaceRoot) continue;
  const sourcePath = marketplacePluginSourcePath(marketplaceRoot, pluginId);
  if (!sourcePath) continue;
  const manifestPath = path.join(sourcePath, '.codex-plugin', 'plugin.json');
  if (!fs.existsSync(manifestPath)) continue;
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  configuredInstalled.push({
    pluginId: selector,
    version: typeof manifest.version === 'string' ? manifest.version : null,
    installed: true,
    enabled: !lines.some((line) => /^\\s*enabled\\s*=\\s*false\\s*$/.test(line)),
    source: { source: 'local', path: sourcePath },
    marketplaceSource: { sourceType: 'local', source: marketplaceRoot },
  });
}

const installedEntries = () => {
  const installed = new Map();
  for (const entry of [...configuredInstalled, ...state.installed]) installed.set(entry.pluginId, entry);
  for (const entry of installed.values()) {
    const pluginSection = [...sections].find(([header]) => pluginTableSelector(header) === entry.pluginId);
    const lines = pluginSection?.[1] || [];
    entry.enabled = !lines.some((line) => /^\\s*enabled\\s*=\\s*false\\s*$/.test(line));
  }
  return [...installed.values()];
};

const availableEntries = () => {
  const installed = new Set(installedEntries().map((entry) => entry.pluginId));
  const entries = [];
  for (const [id, source] of marketplaces) {
    const root = localMarketplaceRoot(source);
    const manifestPath = root && path.join(root, '.agents', 'plugins', 'marketplace.json');
    if (!manifestPath || !fs.existsSync(manifestPath)) continue;
    let manifest;
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    } catch {
      continue;
    }
    if (!Array.isArray(manifest.plugins)) continue;
    for (const plugin of manifest.plugins) {
      if (!plugin || typeof plugin.name !== 'string') continue;
      const selector = plugin.name + '@' + id;
      if (installed.has(selector)) continue;
      const sourcePath = marketplacePluginSourcePath(source, plugin.name);
      const pluginManifestPath = sourcePath && path.join(sourcePath, '.codex-plugin', 'plugin.json');
      const pluginManifest = pluginManifestPath && fs.existsSync(pluginManifestPath)
        ? JSON.parse(fs.readFileSync(pluginManifestPath, 'utf8'))
        : {};
      entries.push({
        pluginId: selector,
        version: typeof pluginManifest.version === 'string' ? pluginManifest.version : null,
        installed: false,
        enabled: false,
        source: { source: 'local', path: sourcePath },
        marketplaceSource: { sourceType: 'local', source },
      });
    }
  }
  return entries;
};

const command = args.join(' ');
if (command === 'app-server --stdio') {
  readline.createInterface({ input: process.stdin }).on('line', (line) => {
    const frame = JSON.parse(line);
    if (frame.method === 'initialize') {
      process.stdout.write(JSON.stringify({ id: frame.id, result: {} }) + '\\n');
    } else if (frame.method === 'plugin/list') {
      const entries = installedEntries();
      const marketplaces = new Map();
      for (const entry of entries) {
        const separator = entry.pluginId.lastIndexOf('@');
        const name = separator > 0 ? entry.pluginId.slice(separator + 1) : 'default';
        if (!marketplaces.has(name)) marketplaces.set(name, { name, plugins: [] });
        marketplaces.get(name).plugins.push({
          id: entry.pluginId,
          localVersion: entry.version,
          installed: entry.installed === true,
          enabled: entry.enabled === true,
          source: { type: entry.source?.source ?? 'local', path: entry.source?.path ?? null },
        });
      }
      process.stdout.write(JSON.stringify({ id: frame.id, result: {
        marketplaces: [...marketplaces.values()], marketplaceLoadErrors: [],
      } }) + '\\n');
    }
  });
} else if (command === 'plugin marketplace list --json') {
  const entries = [...marketplaces].map(([id, source]) => ({
    name: id,
    marketplaceSource: { sourceType: localMarketplaceRoot(source) ? 'local' : 'remote', source },
  }));
  process.stdout.write(JSON.stringify({ marketplaces: entries }));
} else if (args.length === 5
    && args[0] === 'plugin'
    && args[1] === 'marketplace'
    && args[2] === 'add'
    && args[4] === '--json') {
  const source = args[3];
  const id = marketplaceId(source);
  state.marketplaces = state.marketplaces.filter((entry) => entry.source !== source && entry.id !== id);
  state.marketplaces.push({ id, source });
  writeState();
  process.stdout.write(JSON.stringify({ status: 'ok' }));
} else if (args.length === 5
    && args[0] === 'plugin'
    && args[1] === 'marketplace'
    && args[2] === 'upgrade'
    && args[4] === '--json') {
  const id = args[3];
  if (!state.marketplaces.some((entry) => entry.id === id)) process.exit(2);
  process.stdout.write(JSON.stringify({ status: 'ok' }));
} else if (args.length === 4
    && args[0] === 'plugin'
    && args[1] === 'add'
    && args[3] === '--json') {
  const selector = args[2];
  const separator = selector.lastIndexOf('@');
  const pluginId = selector.slice(0, separator);
  const requestedMarketplace = selector.slice(separator + 1);
  const candidate = state.marketplaces.find((entry) => entry.id === requestedMarketplace)
    || (marketplaces.has(requestedMarketplace)
      ? { id: requestedMarketplace, source: marketplaces.get(requestedMarketplace) }
      : null)
    || (state.marketplaces.length === 1 ? state.marketplaces[0] : null);
  const marketplaceRoot = candidate && localMarketplaceRoot(candidate.source);
  const sourcePath = candidate ? marketplacePluginSourcePath(candidate.source, pluginId) : null;
  const manifestPath = sourcePath && path.join(sourcePath, '.codex-plugin', 'plugin.json');
  const manifest = manifestPath && fs.existsSync(manifestPath)
    ? JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
    : {};
  state.installed = state.installed.filter((entry) => entry.pluginId !== selector);
  state.installed.push({
    pluginId: selector,
    version: typeof manifest.version === 'string' ? manifest.version : null,
    installed: true,
    enabled: true,
    source: { source: 'local', path: sourcePath },
    marketplaceSource: candidate
      ? { sourceType: marketplaceRoot ? 'local' : 'remote', source: candidate.source }
      : null,
  });
  writeState();
  process.stdout.write(JSON.stringify({ status: 'ok' }));
} else if (args.length === 4
    && args[0] === 'plugin'
    && args[1] === 'remove'
    && args[3] === '--json') {
  state.installed = state.installed.filter((entry) => entry.pluginId !== args[2]);
  removePluginTable(args[2]);
  writeState();
  process.stdout.write(JSON.stringify({ status: 'ok' }));
} else if (command === 'plugin list --available --json') {
  process.stdout.write(JSON.stringify({ installed: installedEntries(), available: availableEntries() }));
} else if (command === 'plugin list --json') {
  process.stdout.write(JSON.stringify({ installed: installedEntries(), available: [] }));
} else {
  process.stderr.write('unexpected fake Codex Plugin Manager command: ' + command + '\\n');
  process.exitCode = 2;
}
`,
    { mode: 0o755 },
  );
  return {
    fixtureRoot,
    codexPath,
  };
}

export function createInstalledPackageCarrierFixture(
  packageRoot: string,
  packageId = 'mas-scholar-skills',
) {
  if (!fs.existsSync(path.join(packageRoot, 'opl-package.json'))) {
    throw new Error(`Installed Package fixture is missing its owner manifest: ${packageRoot}`);
  }
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-installed-package-carrier-fixture-'));
  const marketplaceRoot = path.join(fixtureRoot, 'marketplace');
  const marketplaceId = `${packageId}-test`;
  fs.mkdirSync(path.join(marketplaceRoot, '.agents', 'plugins'), { recursive: true });
  fs.writeFileSync(
    path.join(marketplaceRoot, '.agents', 'plugins', 'marketplace.json'),
    `${JSON.stringify({
      name: marketplaceId,
      plugins: [{
        name: packageId,
        source: { source: 'local', path: packageRoot },
      }],
    }, null, 2)}\n`,
    'utf8',
  );
  const codexHome = path.join(fixtureRoot, 'codex-home');
  fs.mkdirSync(codexHome, { recursive: true });
  fs.writeFileSync(
    path.join(codexHome, 'config.toml'),
    [
      `[marketplaces."${marketplaceId}"]`,
      `source = ${JSON.stringify(marketplaceRoot)}`,
      '',
      `[plugins."${packageId}@${marketplaceId}"]`,
      packageId === 'mas-scholar-skills' ? 'enabled = false' : 'enabled = true',
      '',
    ].join('\n'),
    'utf8',
  );
  return {
    fixtureRoot,
    stateRoot: fixtureRoot,
    codexHome,
    marketplaceRoot,
    packageRoot,
  };
}

export function shellSingleQuote(value: string) {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function createCodexConfigFixture(options: {
  model?: string;
  reasoningEffort?: string;
  providerId?: string;
  providerName?: string;
  baseUrl?: string;
  apiKey?: string;
} = {}) {
  const codexHome = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-codex-home-'));
  const configPath = path.join(codexHome, 'config.toml');
  const model = options.model ?? 'gpt-5.4-lab';
  const reasoningEffort = options.reasoningEffort ?? 'xhigh';
  const providerId = options.providerId ?? 'lab';
  const providerName = options.providerName ?? 'lab';
  const baseUrl = options.baseUrl ?? 'https://codex-provider.example.test/v1';
  const apiKey = options.apiKey ?? 'codex-provider-key';

  fs.writeFileSync(
    configPath,
    [
      `model_provider = "${providerId}"`,
      `model = "${model}"`,
      `model_reasoning_effort = "${reasoningEffort}"`,
      '',
      `[model_providers.${providerId}]`,
      `name = "${providerName}"`,
      `base_url = "${baseUrl}"`,
      `experimental_bearer_token = "${apiKey}"`,
      '',
    ].join('\n'),
    'utf8',
  );

  return {
    codexHome,
    configPath,
    model,
    reasoningEffort,
    providerId,
    providerName,
    baseUrl,
    apiKey,
  };
}

export function createMasWorkspaceFixture(profileName = 'nfpitnet.workspace.toml') {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-mas-workspace-'));
  const sharedPath = path.join(fixtureRoot, 'ops', 'medautoscience', 'bin', '_shared.sh');
  const profilePath = path.join(fixtureRoot, 'ops', 'medautoscience', 'profiles', profileName);

  fs.mkdirSync(path.dirname(sharedPath), { recursive: true });
  fs.mkdirSync(path.dirname(profilePath), { recursive: true });
  fs.writeFileSync(sharedPath, '#!/usr/bin/env bash\nset -euo pipefail\n', {
    mode: 0o755,
  });
  fs.writeFileSync(
    profilePath,
    [
      '[workspace]',
      'workspace_id = "mas-fixture"',
      '',
    ].join('\n'),
    'utf8',
  );

  return {
    fixtureRoot,
    sharedPath,
    profilePath,
  };
}

export function buildManifestCommand(payload: Record<string, unknown>) {
  return `${process.execPath} -e "process.stdout.write(process.argv[1])" ${shellSingleQuote(JSON.stringify(payload))}`;
}

export function readJsonFixture<T>(name: string) {
  return parseJsonText(
    fs.readFileSync(path.join(familyManifestFixtureDir, name), 'utf8'),
  ) as T;
}
