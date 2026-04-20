import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { GatewayContractError } from './contracts.ts';
import {
  buildFrontDeskApiBaseUrl,
  buildFrontDeskEntryUrl,
  normalizeBasePath,
} from './frontdesk-paths.ts';
import { buildHostedRuntimeReadiness } from './management.ts';
import { buildOplApiCatalog } from './opl-api-paths.ts';
import type { GatewayContracts } from './types.ts';

export type HostedPilotPackageOptions = {
  outputDir: string;
  publicOrigin?: string;
  host?: string;
  port?: number;
  basePath?: string;
  sessionsLimit?: number;
};

type HostedPilotPackageAssets = {
  bundle_json: string;
  readme: string;
  environment_template: string;
  launch_script: string;
  service_unit: string;
  service_install_script: string;
  healthcheck_script: string;
  reverse_proxy_template: string;
  app_root: string;
  app_dist: string;
  app_contracts: string;
  app_package_json: string;
};

function resolveProjectRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
}

function ensureDirectory(directory: string) {
  fs.mkdirSync(directory, { recursive: true });
}

function normalizePublicOrigin(origin?: string) {
  const trimmed = origin?.trim();
  if (!trimmed) {
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch (error) {
    throw new GatewayContractError(
      'cli_usage_error',
      'web package requires --public-origin to be an absolute http(s) origin.',
      {
        public_origin: trimmed,
        cause: error instanceof Error ? error.message : 'Unknown URL parse failure.',
      },
    );
  }

  if (!/^https?:$/.test(parsed.protocol)) {
    throw new GatewayContractError(
      'cli_usage_error',
      'web package only supports http or https public origins.',
      {
        public_origin: trimmed,
      },
    );
  }

  return parsed.origin;
}

function copyTrackedTree(source: string, destination: string) {
  if (!fs.existsSync(source)) {
    throw new GatewayContractError(
      'contract_file_missing',
      'Expected repo-tracked source directory is missing while building the hosted pilot package.',
      {
        source,
      },
    );
  }

  fs.cpSync(source, destination, { recursive: true });
}

function buildAppSnapshot(projectRoot: string, destination: string) {
  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const result = spawnSync(
    npmCommand,
    ['run', 'build', '--', '--outDir', destination],
    {
      cwd: projectRoot,
      encoding: 'utf8',
      env: process.env,
    },
  );

  if ((result.status ?? 1) !== 0) {
    throw new GatewayContractError(
      'build_command_failed',
      'Failed to build a runnable OPL app snapshot while exporting the hosted pilot package.',
      {
        command: [npmCommand, 'run', 'build', '--', '--outDir', destination],
        cwd: projectRoot,
        stdout: result.stdout ?? '',
        stderr: result.stderr ?? '',
      },
    );
  }

  const cliEntrypoint = path.join(destination, 'cli.js');
  if (!fs.existsSync(cliEntrypoint)) {
    throw new GatewayContractError(
      'contract_file_missing',
      'Hosted pilot package build completed without emitting dist/cli.js.',
      {
        source: cliEntrypoint,
      },
    );
  }
}

function writeExecutableFile(targetPath: string, contents: string) {
  fs.writeFileSync(targetPath, contents, { mode: 0o755 });
}

function buildReadme(options: {
  publicOrigin: string;
  basePath: string;
  publicHealthUrl: string;
  port: number;
  sessionsLimit: number;
}) {
  return `# OPL Web Package

This package exports a self-hostable web package for the OPL Product API.

What it lands:

- a runnable snapshot of the current OPL web app
- a host-side run script
- a rendered \`systemd\` unit plus an install helper
- a host-side healthcheck helper
- a \`Caddy\` reverse-proxy template
- a machine-readable web package contract

What it does **not** claim:

- actual hosted runtime is still not landed
- multi-tenant platform hosting is still not landed
- Hermes is still an external kernel and must be provided on the host

## Target shape

- shell target: external GUI overlay consuming OPL adapter surfaces
- public origin: ${options.publicOrigin}
- base path: ${options.basePath || '/'}
- internal web port: ${options.port}
- sessions limit: ${options.sessionsLimit}

## Required host dependencies

- Node.js 22+ (or an equivalent runtime that can run \`node app/dist/cli.js\`)
- a runnable Hermes binary exposed through \`OPL_HERMES_BIN\`
- a writable workspace path exposed through \`OPL_WEB_WORKSPACE\`
- a reverse proxy such as Caddy or Nginx

## Files

- \`app/\`: exported OPL app snapshot
- \`config/opl-web.env.example\`: host environment template
- \`scripts/run-opl-web.sh\`: host launch script
- \`scripts/install-systemd-service.sh\`: install/render the packaged \`systemd\` unit on the target host
- \`scripts/check-opl-web-health.sh\`: verify the packaged web entry exposes \`/api/health\`
- \`systemd/opl-web.service\`: rendered \`systemd\` unit preview
- \`caddy/Caddyfile\`: reverse-proxy template
- \`web-package.json\`: machine-readable deployment bundle

## Bring-up outline

1. Copy this package to the target host.
2. Duplicate \`config/opl-web.env.example\` to \`config/opl-web.env\` and fill in:
   - \`OPL_HERMES_BIN\`
   - \`OPL_WEB_WORKSPACE\`
3. Run \`sudo scripts/install-systemd-service.sh --enable-now\` to install and start the packaged service, or use \`scripts/run-opl-web.sh\` for a foreground bring-up.
4. Run \`scripts/check-opl-web-health.sh\` and confirm the local web entry is healthy before wiring the public reverse-proxy endpoint at \`${options.publicHealthUrl}\`.
5. Load \`caddy/Caddyfile\` (or adapt it to your reverse proxy) so ${options.publicOrigin}${options.basePath || '/'} points at the local OPL web entry.

## Notes

- This package is honest hostedization-prep and self-hostable pilot packaging.
- It is designed to let a future OPL x Onyx overlay or equivalent shell consume the OPL web package contract without pretending the full hosted platform already exists.
`;
}

function buildEnvExample(options: {
  host: string;
  port: number;
  basePath: string;
  sessionsLimit: number;
}) {
  return `# Required external runtime dependency
OPL_HERMES_BIN=/usr/local/bin/hermes

# Required writable workspace path on the target host
OPL_WEB_WORKSPACE=/srv/opl/workspaces/default

# Optional web runtime settings
OPL_WEB_HOST=${options.host}
OPL_WEB_PORT=${options.port}
OPL_WEB_BASE_PATH=${options.basePath}
OPL_WEB_SESSIONS_LIMIT=${options.sessionsLimit}
`;
}

function buildRunScript() {
  return `#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
PACKAGE_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
APP_ROOT="$PACKAGE_ROOT/app"
ENV_FILE="\${OPL_WEB_ENV_FILE:-$PACKAGE_ROOT/config/opl-web.env}"

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
fi

: "\${OPL_HERMES_BIN:?Set OPL_HERMES_BIN to a runnable Hermes binary.}"
: "\${OPL_WEB_WORKSPACE:?Set OPL_WEB_WORKSPACE to a writable workspace path.}"

HOST="\${OPL_WEB_HOST:-0.0.0.0}"
PORT="\${OPL_WEB_PORT:-8787}"
BASE_PATH="\${OPL_WEB_BASE_PATH:-/pilot/opl}"
SESSIONS_LIMIT="\${OPL_WEB_SESSIONS_LIMIT:-5}"

export OPL_HERMES_BIN

exec node "$APP_ROOT/dist/cli.js" web \\
  --host "$HOST" \\
  --port "$PORT" \\
  --path "$OPL_WEB_WORKSPACE" \\
  --sessions-limit "$SESSIONS_LIMIT" \\
  --base-path "$BASE_PATH"
`;
}

function buildRenderedSystemdService(packageRoot: string) {
  return `[Unit]
Description=OPL Web Package Service
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory="${packageRoot}"
EnvironmentFile="${packageRoot}/config/opl-web.env"
ExecStart=/usr/bin/env bash "${packageRoot}/scripts/run-opl-web.sh"
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
`;
}

function buildInstallServiceScript() {
  return `#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
PACKAGE_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
UNIT_DIR="\${OPL_WEB_SYSTEMD_UNIT_DIR:-/etc/systemd/system}"
UNIT_NAME="opl-web.service"
SYSTEMCTL_BIN="\${OPL_WEB_SYSTEMCTL_BIN:-systemctl}"
ENABLE_NOW=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --unit-dir)
      UNIT_DIR="$2"
      shift 2
      ;;
    --enable-now)
      ENABLE_NOW=1
      shift
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

mkdir -p "$UNIT_DIR"
TARGET="$UNIT_DIR/$UNIT_NAME"

cat >"$TARGET" <<EOF
[Unit]
Description=OPL Web Package Service
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory="$PACKAGE_ROOT"
EnvironmentFile="$PACKAGE_ROOT/config/opl-web.env"
ExecStart=/usr/bin/env bash "$PACKAGE_ROOT/scripts/run-opl-web.sh"
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

"$SYSTEMCTL_BIN" daemon-reload

if [[ "$ENABLE_NOW" -eq 1 ]]; then
  "$SYSTEMCTL_BIN" enable --now "$UNIT_NAME"
else
  echo "Installed $TARGET"
  echo "Run: sudo $SYSTEMCTL_BIN enable --now $UNIT_NAME"
fi
`;
}

function buildHealthcheckScript(options: { host: string; port: number; basePath: string }) {
  const defaultHost = options.host === '0.0.0.0' || options.host === '::'
    ? '127.0.0.1'
    : options.host;

  return `#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
PACKAGE_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="\${OPL_WEB_ENV_FILE:-$PACKAGE_ROOT/config/opl-web.env}"

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
fi

HOST="\${OPL_WEB_HEALTH_HOST:-\${OPL_WEB_HOST:-${defaultHost}}}"
if [[ "$HOST" == "0.0.0.0" || "$HOST" == "::" ]]; then
  HOST="127.0.0.1"
fi

PORT="\${OPL_WEB_PORT:-${options.port}}"
BASE_PATH="\${OPL_WEB_BASE_PATH:-${options.basePath}}"
URL="http://$HOST:$PORT$BASE_PATH/api/health"

node -e "const url = process.argv[1]; fetch(url).then(async (response) => { const text = (await response.text()).trim(); if (!response.ok) { console.error(text || ('Healthcheck failed: ' + response.status)); process.exit(1); } console.log(text || 'ok'); }).catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exit(1); });" "$URL"
`;
}

function buildCaddyfile(options: { publicOrigin: string; basePath: string; port: number }) {
  const origin = new URL(options.publicOrigin);
  const siteLabel = origin.host;
  const normalizedBasePath = options.basePath || '/';

  return `${siteLabel} {
  handle_path ${normalizedBasePath}/* {
    reverse_proxy 127.0.0.1:${options.port}
  }
}
`;
}

export function buildHostedPilotPackage(
  contracts: GatewayContracts,
  options: HostedPilotPackageOptions,
) {
  const outputDir = path.resolve(options.outputDir);
  const basePath = normalizeBasePath(options.basePath || '/pilot/opl');
  const host = options.host ?? '0.0.0.0';
  const port = options.port ?? 8787;
  const sessionsLimit = options.sessionsLimit ?? 5;
  const publicOrigin = normalizePublicOrigin(options.publicOrigin) ?? `http://127.0.0.1:${port}`;
  const oplApi = buildOplApiCatalog(basePath);
  const entryUrl = buildFrontDeskEntryUrl(publicOrigin, basePath);
  const apiBaseUrl = buildFrontDeskApiBaseUrl(publicOrigin, basePath);

  ensureDirectory(outputDir);

  const appRoot = path.join(outputDir, 'app');
  const appDist = path.join(appRoot, 'dist');
  const appContracts = path.join(appRoot, 'contracts');
  const configDir = path.join(outputDir, 'config');
  const scriptsDir = path.join(outputDir, 'scripts');
  const systemdDir = path.join(outputDir, 'systemd');
  const caddyDir = path.join(outputDir, 'caddy');
  const bundleJsonPath = path.join(outputDir, 'web-package.json');
  const readmePath = path.join(outputDir, 'README.md');
  const envExamplePath = path.join(configDir, 'opl-web.env.example');
  const runScriptPath = path.join(scriptsDir, 'run-opl-web.sh');
  const installServiceScriptPath = path.join(scriptsDir, 'install-systemd-service.sh');
  const healthcheckScriptPath = path.join(scriptsDir, 'check-opl-web-health.sh');
  const systemdPath = path.join(systemdDir, 'opl-web.service');
  const caddyfilePath = path.join(caddyDir, 'Caddyfile');
  const packageJsonPath = path.join(appRoot, 'package.json');

  ensureDirectory(appRoot);
  ensureDirectory(configDir);
  ensureDirectory(scriptsDir);
  ensureDirectory(systemdDir);
  ensureDirectory(caddyDir);

  const projectRoot = resolveProjectRoot();
  buildAppSnapshot(projectRoot, appDist);
  copyTrackedTree(path.join(projectRoot, 'contracts'), appContracts);
  fs.copyFileSync(path.join(projectRoot, 'package.json'), packageJsonPath);

  fs.writeFileSync(
    readmePath,
    buildReadme({
      publicOrigin,
      basePath,
      publicHealthUrl: `${publicOrigin}${oplApi.debug.health}`,
      port,
      sessionsLimit,
    }),
  );
  fs.writeFileSync(
    envExamplePath,
    buildEnvExample({
      host,
      port,
      basePath,
      sessionsLimit,
    }),
  );
  writeExecutableFile(runScriptPath, buildRunScript());
  writeExecutableFile(installServiceScriptPath, buildInstallServiceScript());
  writeExecutableFile(
    healthcheckScriptPath,
    buildHealthcheckScript({
      host,
      port,
      basePath,
    }),
  );
  fs.writeFileSync(systemdPath, buildRenderedSystemdService(outputDir));
  fs.writeFileSync(caddyfilePath, buildCaddyfile({ publicOrigin, basePath, port }));

  const localHealthHost = host === '0.0.0.0' || host === '::' ? '127.0.0.1' : host;
  const localHealthUrl = `http://${localHealthHost}:${port}${oplApi.debug.health}`;
  const publicHealthUrl = `${publicOrigin}${oplApi.debug.health}`;
  const hostedRuntimeReadiness = buildHostedRuntimeReadiness();

  const payload = {
    version: 'g2',
    contracts_context: {
      contracts_dir: contracts.contractsDir,
      contracts_root_source: contracts.contractsRootSource,
    },
    web_package: {
      surface_id: 'opl_web_package',
      shell_integration_target: 'external_gui_overlay',
      package_status: 'landed',
      hosted_runtime_status: 'not_landed',
      runtime_substrate: 'external_hermes_kernel',
      hosted_runtime_readiness: hostedRuntimeReadiness,
      public_origin: publicOrigin,
      host,
      port,
      base_path: basePath,
      entry_url: entryUrl,
      api_base_url: apiBaseUrl,
      opl_api: oplApi,
      defaults: {
        sessions_limit: sessionsLimit,
        runtime_workspace_env: 'OPL_WEB_WORKSPACE',
        hermes_binary_env: 'OPL_HERMES_BIN',
      },
      operations: {
        systemd: {
          unit_name: 'opl-web.service',
          rendered_unit_path: systemdPath,
          install_script: installServiceScriptPath,
          install_command: `sudo bash ${installServiceScriptPath} --enable-now`,
        },
        healthcheck: {
          script: healthcheckScriptPath,
          local_url: localHealthUrl,
          public_url: publicHealthUrl,
          command: `bash ${healthcheckScriptPath}`,
        },
      },
      assets: {
        bundle_json: bundleJsonPath,
        readme: readmePath,
        environment_template: envExamplePath,
        launch_script: runScriptPath,
        service_unit: systemdPath,
        service_install_script: installServiceScriptPath,
        healthcheck_script: healthcheckScriptPath,
        reverse_proxy_template: caddyfilePath,
        app_root: appRoot,
        app_dist: appDist,
        app_contracts: appContracts,
        app_package_json: packageJsonPath,
      } satisfies HostedPilotPackageAssets,
      notes: [
        'This package is a self-hostable web package for the OPL Product API.',
        'It still requires an external Hermes binary on the host and does not claim that the actual hosted runtime is landed.',
        'The package now carries service-install and healthcheck helpers so host-side bring-up does not depend on hand-edited service paths.',
        'The immediate shell target is an external OPL x Onyx overlay, while the long-line product identity remains an OPL-owned adapter surface.',
      ],
    },
  };

  fs.writeFileSync(bundleJsonPath, `${JSON.stringify(payload, null, 2)}\n`);

  return payload;
}
