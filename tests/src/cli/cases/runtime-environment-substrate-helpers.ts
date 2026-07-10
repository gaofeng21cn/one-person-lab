import { fs, os, path } from '../helpers.ts';

export function stateEnv(label: string) {
  return {
    OPL_STATE_DIR: fs.mkdtempSync(path.join(os.tmpdir(), `opl-runtime-env-${label}-`)),
  };
}

export function writeFakeRscript(binDir: string) {
  fs.mkdirSync(binDir, { recursive: true });
  const rscriptPath = path.join(binDir, 'Rscript');
  fs.writeFileSync(
    rscriptPath,
    `#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const expression = process.argv[3] || '';
const libMatch = expression.match(/lib\\.loc\\s*=\\s*"([^"]+)"/)
  || expression.match(/lib\\s*=\\s*"([^"]+)"/)
  || expression.match(/dir\\.exists\\("([^"]+)"\\)/);
const libPath = libMatch ? libMatch[1] : '';
const markerPath = libPath ? path.join(libPath, '.fake-installed-packages.json') : '';
const readPackages = () => {
  if (!markerPath || !fs.existsSync(markerPath)) return [];
  return JSON.parse(fs.readFileSync(markerPath, 'utf8')); // reuse-first: allow embedded Rscript fixture JSON boundary.
};
if (expression.includes('priority = c("base", "recommended")')) {
  process.stdout.write('grid\\n');
  process.exit(0);
}
if (expression.includes('install_github')) {
  fs.mkdirSync(libPath, { recursive: true });
  fs.writeFileSync(markerPath, JSON.stringify(Array.from(new Set([...readPackages(), 'ggconsort']))));
  process.exit(0);
}
if (expression.includes('install.packages')) {
  const packageMatch = expression.match(/install\\.packages\\(c\\(([^)]*)\\)/);
  const packages = packageMatch
    ? packageMatch[1].split(',').map((part) => part.trim().replace(/^"|"$/g, '')).filter(Boolean)
    : [];
  fs.mkdirSync(libPath, { recursive: true });
  fs.writeFileSync(markerPath, JSON.stringify(Array.from(new Set([...readPackages(), ...packages]))));
  process.exit(0);
}
if (expression.includes('installed.packages')) {
  if (libPath) {
    process.stdout.write(readPackages().join('\\n'));
    process.exit(0);
  }
  process.stdout.write('globalOnlyPackage\\n');
  process.exit(0);
}
process.exit(0);
`,
    { mode: 0o755 },
  );
  return rscriptPath;
}

export function writeFakeExecutable(binDir: string, name: string) {
  fs.mkdirSync(binDir, { recursive: true });
  const executablePath = path.join(binDir, name);
  fs.writeFileSync(executablePath, '#!/usr/bin/env sh\nexit 0\n', { mode: 0o755 });
  return executablePath;
}

export function fastLocalEnvDefaultFields(readback: Record<string, any>) {
  const defaultPath = readback.default_current_path ?? {};
  const handoff = readback.standard_tool_handoff ?? {};
  return {
    sandbox_provider: readback.sandbox_provider,
    default_strategy: defaultPath.strategy_id,
    default_path: defaultPath.path_id,
    renv_handoff: (handoff.renv ?? {}).tool,
    uv_handoff: (handoff.uv ?? {}).tool,
    host_environment_fallback_allowed: defaultPath.host_environment_fallback_allowed,
  };
}
