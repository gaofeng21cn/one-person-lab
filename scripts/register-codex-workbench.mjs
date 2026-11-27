import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const server = 'opl-apps';
const command = process.env.OPL_CODEX_BIN || 'codex';
const home = os.homedir();
const opl = process.argv[2];
// GUI hosts may lack Node on PATH. Prefer the installer's stable executable
// path (for example Homebrew's bin symlink) over a versioned Cellar path.
const node = process.argv[3] || process.execPath;
const args = [opl, 'connect', 'mcp-app-stdio'];

function codexMcp(...options) {
  return execFileSync(command, ['mcp', ...options], {
    cwd: home, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 10_000,
  });
}

try {
  if (!path.isAbsolute(opl) || !path.isAbsolute(node)) throw new Error('Missing installed executable path');
  if (process.env.CODEX_HOME) {
    mkdirSync(process.env.CODEX_HOME, { recursive: true, mode: 0o700 });
  }
  // Native readback includes explicitly disabled servers. Leave their settings
  // and any user-selected transport intact, including on reinstall.
  const configured = JSON.parse(codexMcp('list', '--json'));
  if (!configured.some(entry => entry.name === server)) {
    const stateKey = process.env.OPL_STATE_DIR ? 'OPL_STATE_DIR' : 'OPL_DATA_DIR';
    const location = process.env[stateKey];
    const envArgs = location ? ['--env', `${stateKey}=${path.resolve(location)}`] : [];
    codexMcp('add', server, ...envArgs, '--', node, ...args);
    const { transport } = JSON.parse(codexMcp('get', server, '--json'));
    if (transport?.command !== node || JSON.stringify(transport.args) !== JSON.stringify(args)
        || (location && transport.env?.[stateKey] !== path.resolve(location))) {
      throw new Error('Codex did not retain the selected workbench command');
    }
    console.log('Registered OPL Apps in Codex.');
  }
} catch {
  // Other MCP entries or diagnostics can include private configuration.
  process.exitCode = 1;
}
