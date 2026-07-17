#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

const image = process.env.OPL_BOOTSTRAP_SMOKE_IMAGE || 'node:22-bookworm';

const smokeScript = String.raw`
set -euo pipefail

export CI=1
export OPL_COMPANION_DISABLE_REMOTE_INSTALL=1
export OPL_MODULES_ROOT=/root/.opl/state/modules
export OPL_STATE_DIR=/root/.opl/state
export CODEX_HOME=/root/.codex
mkdir -p "$CODEX_HOME"

node -v
npm -v
git --version

curl -fsSL https://raw.githubusercontent.com/gaofeng21cn/one-person-lab-app/main/install.sh \
  | bash -s -- --headless --modules mas,rca --skip-engines --skip-native-helper-repair --no-online-runtime

opl help --text >/tmp/opl-help.txt
opl system initialize --json >/tmp/opl-system.json
opl connect sync-skills --domain mas --domain rca >/tmp/opl-connect-sync-skills.json
opl connect skills --json >/tmp/opl-connect-skills.json
opl packages install opl-flow --json >/tmp/opl-flow-install.json
opl packages status --package-id opl-flow --json >/tmp/opl-flow-status.json

node <<'NODE'
const fs = require('fs');
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8')); // reuse-first: allow Docker inline smoke JSON boundary.
const list = readJson('/tmp/opl-connect-skills.json');
const packs = list.skill_catalog?.packs ?? [];
const wanted = ['medautoscience', 'redcube'];

for (const id of wanted) {
  const pack = packs.find((entry) => entry.domain_id === id);
  if (!pack) {
    throw new Error('missing skill pack ' + id);
  }
  if (!pack.ready_to_sync) {
    throw new Error('not ready_to_sync ' + id + ': ' + JSON.stringify(pack));
  }
  if (pack.foundry_agent_series?.canonical_command_surface !== 'opl agents run') {
    throw new Error('missing Foundry Agent series command surface for ' + id);
  }
  if (pack.mcp_projection?.mcp_descriptor_must_delegate_to_series_spine !== true) {
    throw new Error('missing Foundry MCP delegate projection for ' + id);
  }
}

const sync = readJson('/tmp/opl-connect-sync-skills.json');
const synced = (sync.skill_sync?.packs ?? [])
  .filter((entry) => wanted.includes(entry.domain_id) && entry.sync_status === 'synced');
if (synced.length !== 2) {
  throw new Error('expected 2 synced packs, got ' + synced.length);
}

const config = fs.readFileSync('/root/.codex/config.toml', 'utf8');
for (const name of ['mas@mas-local', 'rca@rca-local']) {
  if (!config.includes('[plugins."' + name + '"]')) {
    throw new Error('missing plugin config ' + name);
  }
}

const bareMirrors = ['mas', 'rca']
  .filter((name) => fs.existsSync('/root/.codex/skills/' + name + '/SKILL.md'));
if (bareMirrors.length) {
  throw new Error('unexpected bare skill mirrors: ' + bareMirrors.join(','));
}

console.log(JSON.stringify({
  status: 'ok',
  surface: 'opl_mas_rca_bootstrap',
  help_has_opl: fs.readFileSync('/tmp/opl-help.txt', 'utf8').includes('One Person Lab'),
  packs: packs
    .filter((entry) => wanted.includes(entry.domain_id))
    .map((entry) => ({
      domain_id: entry.domain_id,
      ready_to_sync: entry.ready_to_sync,
      repo_root: entry.repo_root,
      plugin_manifest_found: entry.plugin_manifest_found,
      skill_entry_found: entry.skill_entry_found,
      installer_found: entry.installer_found,
    })),
  synced: synced.map((entry) => ({
    domain_id: entry.domain_id,
    registry_repo_root: entry.registry_repo_root,
  })),
  codex_config_has: ['mas@mas-local', 'rca@rca-local']
    .every((name) => config.includes('[plugins."' + name + '"]')),
  no_bare_skill_mirrors: true,
}, null, 2));
NODE

node <<'NODE'
const fs = require('fs');
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8')); // reuse-first: allow Docker inline smoke JSON boundary.
const install = readJson('/tmp/opl-flow-install.json');
const status = readJson('/tmp/opl-flow-status.json');
const packageInstall = install.opl_agent_package_install;
if (packageInstall?.status !== 'installed') {
  throw new Error('opl-flow package install failed: ' + JSON.stringify(install));
}
const profile = packageInstall.physical_surface?.profile_migration;
if (!['installed', 'current'].includes(profile?.status)) {
  throw new Error('opl-flow profile was not installed: ' + JSON.stringify(profile));
}
for (const filePath of [
  '/root/.codex/AGENTS.md',
  '/root/.codex/TASTE.md',
  packageInstall.physical_surface.plugin_manifest_path,
  ...packageInstall.physical_surface.materialized_required_skill_paths,
]) {
  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error('missing opl-flow package surface: ' + filePath);
  }
}

console.log(JSON.stringify({
  status: 'ok',
  surface: 'opl_packages_bootstrap',
  package_status: packageInstall.status,
  profile_status: profile.status,
  plugin_path: packageInstall.physical_surface.codex_plugin_cache_path,
  status_readback: status.opl_agent_package_status?.status,
}, null, 2));
NODE
`;

const result = spawnSync(
  'docker',
  [
    'run',
    '-i',
    '--rm',
    image,
    'bash',
    '-s',
  ],
  {
    input: smokeScript,
    encoding: 'utf8',
    stdio: ['pipe', 'inherit', 'inherit'],
  },
);

process.exit(result.status ?? 1);
