#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

const image = process.env.OPL_BOOTSTRAP_SMOKE_IMAGE || 'node:22-bookworm';
const includeOplDoc = process.argv.includes('--include-opl-doc');

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
  if (pack.foundry_agent_series?.canonical_command_surface !== 'opl agents foundry') {
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

export HOME=/tmp/opl-flow-home
export CODEX_HOME=$HOME/.codex
mkdir -p "$HOME" "$CODEX_HOME"
git clone https://github.com/gaofeng21cn/opl-flow.git /tmp/opl-flow
cd /tmp/opl-flow
python3 scripts/install_local_plugin.py >/tmp/opl-flow-install.json
python3 scripts/install_local_plugin.py --verify-only >/tmp/opl-flow-verify.json
python3 scripts/verify.py >/tmp/opl-flow-repo-verify.txt

node <<'NODE'
const fs = require('fs');
const path = require('path');
const home = '/tmp/opl-flow-home';
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8')); // reuse-first: allow Docker inline smoke JSON boundary.
const install = readJson('/tmp/opl-flow-install.json');
const verify = readJson('/tmp/opl-flow-verify.json');
if (!verify.ok) {
  throw new Error('opl-flow verify failed: ' + JSON.stringify(verify));
}

const required = [
  'plugins/opl-flow/.codex-plugin/plugin.json',
  'plugins/opl-flow/skills/opl-flow/SKILL.md',
  '.codex/AGENTS.md',
  '.codex/TASTE.md',
  '.codex/prompts/planner.md',
  '.codex/prompts/executor.md',
  '.codex/prompts/debugger.md',
  '.codex/prompts/verifier.md',
  '.agents/plugins/marketplace.json',
];
const missing = required
  .map((rel) => path.join(home, rel))
  .filter((filePath) => !fs.existsSync(filePath));
if (missing.length) {
  throw new Error('missing opl-flow installed files: ' + missing.join(', '));
}

const marketplace = readJson(path.join(home, '.agents/plugins/marketplace.json'));
if (!(marketplace.plugins ?? []).some((entry) => entry.name === 'opl-flow')) {
  throw new Error('marketplace missing opl-flow');
}

console.log(JSON.stringify({
  status: 'ok',
  surface: 'opl_flow_bootstrap',
  plugin_path: install.plugin_path,
  marketplace_ok: verify.marketplace_ok,
  profile_file_count: required.length,
  repo_verify: fs.readFileSync('/tmp/opl-flow-repo-verify.txt', 'utf8').trim(),
}, null, 2));
NODE
`;

const docSmoke = String.raw`
if [ "\${OPL_INCLUDE_OPL_DOC:-0}" = "1" ]; then
  export HOME=/tmp/opl-doc-home
  export CODEX_HOME=$HOME/.codex
  mkdir -p "$HOME" "$CODEX_HOME"
  git clone https://github.com/gaofeng21cn/opl-doc.git /tmp/opl-doc
  cd /tmp/opl-doc
  python3 scripts/install_local_plugin.py >/tmp/opl-doc-install.json
  python3 scripts/install_local_plugin.py --verify-only >/tmp/opl-doc-verify.json
fi
`;

const result = spawnSync(
  'docker',
  [
    'run',
    '-i',
    '--rm',
    '-e',
    `OPL_INCLUDE_OPL_DOC=${includeOplDoc ? '1' : '0'}`,
    image,
    'bash',
    '-s',
  ],
  {
    input: smokeScript + docSmoke,
    encoding: 'utf8',
    stdio: ['pipe', 'inherit', 'inherit'],
  },
);

process.exit(result.status ?? 1);
