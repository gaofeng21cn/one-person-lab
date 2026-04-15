import fs from 'node:fs';
import path from 'node:path';

import { GatewayContractError } from './contracts.ts';
import { normalizeBasePath } from './frontdesk-paths.ts';
import {
  buildHostedPilotPackage,
  type HostedPilotPackageOptions,
} from './hosted-pilot-package.ts';
import { buildHostedRuntimeReadiness } from './management.ts';
import {
  buildFrontDeskLibreChatWelcome,
  buildFrontDeskTitlePrompt,
  OPL_FRONTDOOR_AGENT_LABEL,
  OPL_FRONTDOOR_APP_TITLE,
  OPL_FRONTDOOR_MCP_SERVER_KEY,
} from './frontdesk-librechat-identity.ts';
import {
  readLocalCodexDefaults,
  type LocalCodexDefaults,
} from './local-codex-defaults.ts';
import type { GatewayContracts } from './types.ts';

export type LibreChatPilotPackageOptions = HostedPilotPackageOptions & {
  codexDefaults?: LocalCodexDefaults;
  workspacePath?: string;
  activeProjectLabel?: string | null;
};

type LibreChatPilotPackageAssets = {
  readme: string;
  stack_env_example: string;
  compose_file: string;
  librechat_config: string;
  caddyfile: string;
  run_script: string;
  frontdesk_package_root: string;
  frontdesk_bundle_json: string;
};

function ensureDirectory(directory: string) {
  fs.mkdirSync(directory, { recursive: true });
}

function writeExecutableFile(targetPath: string, contents: string) {
  fs.writeFileSync(targetPath, contents, { mode: 0o755 });
}

function indentBlock(contents: string, spaces = 4) {
  const prefix = ' '.repeat(spaces);
  return contents
    .split('\n')
    .map((line) => `${prefix}${line}`)
    .join('\n');
}

function normalizePublicOrigin(origin?: string) {
  const trimmed = origin?.trim();
  const fallback = 'http://127.0.0.1:8080';
  const candidate = trimmed && trimmed.length > 0 ? trimmed : fallback;

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch (error) {
    throw new GatewayContractError(
      'cli_usage_error',
      'frontdesk-librechat-package requires --public-origin to be an absolute http(s) origin.',
      {
        public_origin: candidate,
        cause: error instanceof Error ? error.message : 'Unknown URL parse failure.',
      },
    );
  }

  if (!/^https?:$/.test(parsed.protocol)) {
    throw new GatewayContractError(
      'cli_usage_error',
      'frontdesk-librechat-package only supports http or https public origins.',
      {
        public_origin: candidate,
      },
    );
  }

  return parsed.origin;
}

function buildCaddySiteLabel(publicOrigin: string) {
  const parsed = new URL(publicOrigin);

  if (parsed.protocol === 'https:' && !parsed.port) {
    return parsed.hostname;
  }

  return `${parsed.protocol}//${parsed.host}`;
}

function buildReadme(options: {
  publicOrigin: string;
  basePath: string;
  frontdeskPort: number;
  sessionsLimit: number;
  frontdeskEntryUrl: string;
}) {
  return `# OPL LibreChat-first Hosted Pilot

This package lands a real self-hostable hosted shell pilot for OPL:

- \`LibreChat\` is the outer hosted shell at ${options.publicOrigin}/
- \`OPL Front Desk\` stays the routed top-level gateway at ${options.frontdeskEntryUrl}
- both are exposed behind one public origin through the shipped reverse-proxy config

What this package lands:

- a complete LibreChat-first pilot stack for the hosted shell layer
- a bundled OPL front-desk package under \`opl-frontdesk/\`
- a same-origin reverse-proxy template that routes \`/\` to LibreChat and \`${options.basePath}/\` to OPL Front Desk
- a shipped MCP stdio bridge that lets LibreChat call the OPL front desk over its existing HTTP API
- a host bring-up guide that keeps Hermes honest as an external kernel dependency

What it does **not** claim:

- managed hosted runtime is still not landed
- multi-tenant platform hosting is still not landed
- full platform-grade product frontdoor hardening is still not landed

## Package layout

- \`opl-frontdesk/\`: the existing OPL front-desk hosted package
- \`librechat-stack/.env.example\`: LibreChat pilot environment template
- \`librechat-stack/docker-compose.yml\`: runnable LibreChat + proxy stack
- \`librechat-stack/librechat.yaml\`: LibreChat pilot branding / welcome config
- \`librechat-stack/Caddyfile\`: same-origin routing for \`/\` and \`${options.basePath}/\`
- \`librechat-stack/scripts/run-librechat-pilot.sh\`: stack launcher

## Bring-up outline

1. Prepare the host with:
   - Node.js 22+
   - a runnable Hermes binary
   - a writable OPL workspace path
   - Docker + Docker Compose
2. Enter \`opl-frontdesk/\`, copy \`config/opl-frontdesk.env.example\` to \`config/opl-frontdesk.env\`, and fill:
   - \`OPL_HERMES_BIN\`
   - \`OPL_FRONTDESK_WORKSPACE\`
3. Start the OPL front desk on the host:
   - via \`sudo scripts/install-systemd-service.sh --enable-now\`, or
   - via \`scripts/run-frontdesk.sh\`
4. Run \`scripts/check-frontdesk-health.sh\` from \`opl-frontdesk/\` before wiring the public shell.
5. Enter \`librechat-stack/\`, copy \`.env.example\` to \`.env\`, and fill provider keys plus any host-specific values.
6. Run \`scripts/run-librechat-pilot.sh\`.
7. Open ${options.publicOrigin}/ for the outer shell and ${options.frontdeskEntryUrl} for the OPL front desk.

## Honest runtime boundary

- Hermes remains an external kernel and is **not** vendored into this package.
- The front desk still runs as an OPL-managed host service.
- LibreChat is the hosted shell for this pilot, not the permanent long-line product identity.

## Defaults frozen in this export

- public origin: ${options.publicOrigin}
- OPL front-desk base path: ${options.basePath}
- OPL front-desk host port: ${options.frontdeskPort}
- OPL managed sessions limit: ${options.sessionsLimit}
`;
}

function buildStackEnvExample(options: {
  publicOrigin: string;
  frontdeskPort: number;
  basePath: string;
  codexDefaults: LocalCodexDefaults;
}) {
  const parsed = new URL(options.publicOrigin);
  const publicHttpPort =
    parsed.port.length > 0
      ? parsed.port
      : parsed.protocol === 'https:'
        ? '443'
        : '80';

  return `# LibreChat server
HOST=0.0.0.0
PORT=3080
DOMAIN_CLIENT=${options.publicOrigin}
DOMAIN_SERVER=${options.publicOrigin}
TRUST_PROXY=1
NO_INDEX=true
ALLOW_REGISTRATION=true
APP_TITLE=${OPL_FRONTDOOR_APP_TITLE}
CREDS_KEY=replace_with_32_characters_minimum
CREDS_IV=replace_with_16_characters
JWT_SECRET=replace_with_long_random_secret
JWT_REFRESH_SECRET=replace_with_long_random_refresh_secret

# Runtime dependencies
MONGO_URI=mongodb://mongodb:27017/LibreChat
MEILI_MASTER_KEY=change-me
RAG_PORT=8000

# OPL Agent inherits the current Codex operator profile
OPENAI_API_KEY=user_provided
OPENAI_REVERSE_PROXY=${options.codexDefaults.provider_base_url ?? 'user_provided'}
OPENAI_MODELS=${options.codexDefaults.model}
ANTHROPIC_API_KEY=user_provided
GOOGLE_KEY=user_provided

# Container identity on Linux hosts
UID=1000
GID=1000

# Same-origin routing to the host-side OPL front desk
PUBLIC_HTTP_PORT=${publicHttpPort}
OPL_FRONTDESK_UPSTREAM=host.docker.internal:${options.frontdeskPort}
OPL_FRONTDESK_API_BASE_URL=http://host.docker.internal:${options.frontdeskPort}${options.basePath}/api
`;
}

function buildLibreChatConfig(options: {
  publicOrigin: string;
  frontdeskEntryUrl: string;
  codexDefaults: LocalCodexDefaults;
  workspacePath?: string;
  activeProjectLabel?: string | null;
}) {
  const welcome = buildFrontDeskLibreChatWelcome({
    publicOrigin: options.publicOrigin,
    frontdeskEntryUrl: options.frontdeskEntryUrl,
    codexDefaults: options.codexDefaults,
    workspacePath: options.workspacePath,
    activeProjectLabel: options.activeProjectLabel,
  });
  const titlePrompt = buildFrontDeskTitlePrompt();
  const reasoningEffortLine = options.codexDefaults.reasoning_effort
    ? `\n        reasoning_effort: ${options.codexDefaults.reasoning_effort}`
    : '';

  return `version: 1.3.8

cache: true

interface:
  customWelcome: |
${indentBlock(welcome)}
  modelSelect: false
  parameters: false
  presets: false
  bookmarks: true
  multiConvo: true
  prompts:
    use: true
    create: false
    share: false
    public: false
  agents:
    use: true
    create: false
    share: false
    public: false
  mcpServers:
    use: true
    create: false
    share: false
    public: false

endpoints:
  openAI:
    titleConvo: true
    titleModel: ${options.codexDefaults.model}
    titleMethod: completion
    titlePrompt: |
${indentBlock(titlePrompt, 6)}
    modelDisplayLabel: ${OPL_FRONTDOOR_AGENT_LABEL}

modelSpecs:
  enforce: true
  prioritize: true
  list:
    - name: opl_agent
      label: ${OPL_FRONTDOOR_AGENT_LABEL}
      default: true
      description: Unified family front door that inherits the current Codex operator profile.
      mcpServers:
        - ${OPL_FRONTDOOR_MCP_SERVER_KEY}
      preset:
        endpoint: openAI
        model: ${options.codexDefaults.model}
        modelLabel: ${OPL_FRONTDOOR_AGENT_LABEL}${reasoningEffortLine}

registration:
  socialLogins: ['github']

mcpServers:
  ${OPL_FRONTDOOR_MCP_SERVER_KEY}:
    type: stdio
    command: node
    args:
      - /app/opl-frontdesk/dist/cli.js
      - mcp-stdio
      - --api-base-url
      - \${OPL_FRONTDESK_API_BASE_URL}
`;
}

function buildComposeFile(options: {
  frontdeskPort: number;
  basePath: string;
}) {
  return `services:
  librechat:
    image: registry.librechat.ai/danny-avila/librechat-dev:latest
    restart: always
    env_file:
      - .env
    extra_hosts:
      - "host.docker.internal:host-gateway"
    environment:
      HOST: 0.0.0.0
      MONGO_URI: mongodb://mongodb:27017/LibreChat
      MEILI_HOST: http://meilisearch:7700
      RAG_PORT: \${RAG_PORT:-8000}
      RAG_API_URL: http://rag_api:\${RAG_PORT:-8000}
      CONFIG_PATH: /app/librechat.yaml
      OPL_FRONTDESK_API_BASE_URL: http://host.docker.internal:${options.frontdeskPort}${options.basePath}/api
    volumes:
      - type: bind
        source: ./librechat.yaml
        target: /app/librechat.yaml
      - ./images:/app/client/public/images
      - ./uploads:/app/uploads
      - ./logs:/app/logs
      - ../opl-frontdesk/app:/app/opl-frontdesk:ro
    depends_on:
      - mongodb
      - rag_api

  mongodb:
    image: mongo:8.0.20
    restart: always
    volumes:
      - mongo_data:/data/db
    command: mongod --noauth

  meilisearch:
    image: getmeili/meilisearch:v1.35.1
    restart: always
    environment:
      MEILI_NO_ANALYTICS: "true"
      MEILI_MASTER_KEY: \${MEILI_MASTER_KEY}
    volumes:
      - meili_data:/meili_data

  vectordb:
    image: pgvector/pgvector:0.8.0-pg15-trixie
    restart: always
    environment:
      POSTGRES_DB: mydatabase
      POSTGRES_USER: myuser
      POSTGRES_PASSWORD: mypassword
    volumes:
      - vector_data:/var/lib/postgresql/data

  rag_api:
    image: registry.librechat.ai/danny-avila/librechat-rag-api-dev-lite:latest
    restart: always
    environment:
      DB_HOST: vectordb
      RAG_PORT: \${RAG_PORT:-8000}
    depends_on:
      - vectordb
    env_file:
      - .env

  caddy:
    image: caddy:2-alpine
    restart: always
    depends_on:
      - librechat
    extra_hosts:
      - "host.docker.internal:host-gateway"
    environment:
      OPL_FRONTDESK_UPSTREAM: \${OPL_FRONTDESK_UPSTREAM}
    ports:
      - "\${PUBLIC_HTTP_PORT:-8080}:\${PUBLIC_HTTP_PORT:-8080}"
    volumes:
      - type: bind
        source: ./Caddyfile
        target: /etc/caddy/Caddyfile
        read_only: true

volumes:
  mongo_data:
  meili_data:
  vector_data:
`;
}

function buildCaddyfile(options: {
  publicOrigin: string;
  basePath: string;
}) {
  return `${buildCaddySiteLabel(options.publicOrigin)} {
  encode zstd gzip

  @opl_frontdesk path ${options.basePath} ${options.basePath}/*
  handle @opl_frontdesk {
    reverse_proxy {$OPL_FRONTDESK_UPSTREAM}
  }

  handle {
    reverse_proxy librechat:3080
  }
}
`;
}

function buildRunScript() {
  return `#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
STACK_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$STACK_ROOT/.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE. Copy .env.example to .env first." >&2
  exit 1
fi

exec docker compose --project-name opl-librechat-pilot --env-file "$ENV_FILE" up -d
`;
}

export function buildLibreChatPilotPackage(
  contracts: GatewayContracts,
  options: LibreChatPilotPackageOptions,
) {
  const codexDefaults = options.codexDefaults ?? readLocalCodexDefaults();
  const outputDir = path.resolve(options.outputDir);
  const basePath = normalizeBasePath(options.basePath || '/pilot/opl');

  if (!basePath) {
    throw new GatewayContractError(
      'cli_usage_error',
      'frontdesk-librechat-package requires a non-root --base-path so LibreChat and OPL Front Desk can share one public origin.',
      {
        base_path: options.basePath ?? '/',
      },
    );
  }

  const publicOrigin = normalizePublicOrigin(options.publicOrigin);
  const host = options.host ?? '0.0.0.0';
  const port = options.port ?? 8787;
  const sessionsLimit = options.sessionsLimit ?? 5;
  const frontdeskEntryUrl = `${publicOrigin}${basePath}/`;

  ensureDirectory(outputDir);

  const frontdeskRoot = path.join(outputDir, 'opl-frontdesk');
  const stackRoot = path.join(outputDir, 'librechat-stack');
  const scriptsDir = path.join(stackRoot, 'scripts');
  const readmePath = path.join(outputDir, 'README.md');
  const envExamplePath = path.join(stackRoot, '.env.example');
  const composeFilePath = path.join(stackRoot, 'docker-compose.yml');
  const libreChatConfigPath = path.join(stackRoot, 'librechat.yaml');
  const caddyfilePath = path.join(stackRoot, 'Caddyfile');
  const runScriptPath = path.join(scriptsDir, 'run-librechat-pilot.sh');

  ensureDirectory(stackRoot);
  ensureDirectory(scriptsDir);

  const frontdeskPackage = buildHostedPilotPackage(contracts, {
    ...options,
    outputDir: frontdeskRoot,
    publicOrigin,
    host,
    port,
    basePath,
    sessionsLimit,
  });
  const hostedRuntimeReadiness = buildHostedRuntimeReadiness();

  fs.writeFileSync(
    readmePath,
    buildReadme({
      publicOrigin,
      basePath,
      frontdeskPort: port,
      sessionsLimit,
      frontdeskEntryUrl,
    }),
  );
  fs.writeFileSync(
    envExamplePath,
    buildStackEnvExample({
      publicOrigin,
      frontdeskPort: port,
      basePath,
      codexDefaults,
    }),
  );
  fs.writeFileSync(
    libreChatConfigPath,
    buildLibreChatConfig({
      publicOrigin,
      frontdeskEntryUrl,
      codexDefaults,
      workspacePath: options.workspacePath,
      activeProjectLabel: options.activeProjectLabel,
    }),
  );
  fs.writeFileSync(
    composeFilePath,
    buildComposeFile({
      frontdeskPort: port,
      basePath,
    }),
  );
  fs.writeFileSync(
    caddyfilePath,
    buildCaddyfile({
      publicOrigin,
      basePath,
    }),
  );
  writeExecutableFile(runScriptPath, buildRunScript());

  return {
    version: 'g2',
    contracts_context: {
      contracts_dir: contracts.contractsDir,
      contracts_root_source: contracts.contractsRootSource,
    },
    librechat_pilot_package: {
      surface_id: 'opl_librechat_hosted_shell_pilot_package',
      shell_integration_target: 'librechat_first',
      package_status: 'landed',
      hosted_shell_status: 'landed',
      actual_managed_runtime_status: 'not_landed',
      runtime_substrate: 'external_hermes_kernel',
      hosted_runtime_readiness: hostedRuntimeReadiness,
      public_origin: publicOrigin,
      hosted_shell_entry_url: `${publicOrigin}/`,
      frontdesk_entry_url: frontdeskEntryUrl,
      frontdesk_base_path: basePath,
      frontdesk_runtime_upstream: `host.docker.internal:${port}`,
      defaults: {
        frontdesk_host: host,
        frontdesk_port: port,
        sessions_limit: sessionsLimit,
        librechat_internal_port: 3080,
      },
      assets: {
        readme: readmePath,
        stack_env_example: envExamplePath,
        compose_file: composeFilePath,
        librechat_config: libreChatConfigPath,
        caddyfile: caddyfilePath,
        run_script: runScriptPath,
        frontdesk_package_root: frontdeskRoot,
        frontdesk_bundle_json: frontdeskPackage.hosted_pilot_package.assets.bundle_json,
      } satisfies LibreChatPilotPackageAssets,
      notes: [
        'This package lands a real LibreChat-first hosted shell pilot on top of the OPL front-desk package.',
        'It still keeps Hermes honest as an external kernel dependency and does not claim a managed hosted runtime.',
        'The long-line product identity remains an OPL-owned web front desk rather than permanent third-party shell ownership.',
      ],
    },
  };
}
