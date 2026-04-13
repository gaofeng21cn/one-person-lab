import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';

import { GatewayContractError } from './contracts.ts';
import {
  buildFrontDeskEndpoints,
  buildFrontDeskEntryUrl,
  stripFrontDeskBasePath,
} from './frontdesk-paths.ts';
import {
  buildFrontDeskDashboard,
  buildFrontDeskHealth,
  buildFrontDeskManifest,
  buildHostedPilotBundle,
  buildProjectsOverview,
  buildRuntimeStatus,
  buildWorkspaceStatus,
} from './management.ts';
import { buildDomainManifestCatalog } from './domain-manifest.ts';
import { buildHostedPilotPackage } from './hosted-pilot-package.ts';
import { buildLibreChatPilotPackage } from './librechat-pilot-package.ts';
import {
  buildProductEntryHandoffEnvelope,
  runProductEntryAsk,
  runProductEntryLogs,
  runProductEntryResume,
  runProductEntrySessions,
  type ProductEntryCliInput,
} from './product-entry.ts';
import { buildSessionLedger } from './session-ledger.ts';
import {
  activateWorkspaceBinding,
  archiveWorkspaceBinding,
  bindWorkspace,
  buildWorkspaceCatalog,
} from './workspace-registry.ts';
import type { GatewayContracts } from './types.ts';

export interface WebFrontDeskOptions {
  host?: string;
  port?: number;
  workspacePath?: string;
  sessionsLimit?: number;
  basePath?: string;
}

type AskRequestBody = Partial<{
  dryRun: boolean;
  dry_run: boolean;
  goal: string;
  intent: string;
  target: string;
  preferredFamily: string;
  preferred_family: string;
  requestKind: string;
  request_kind: string;
  model: string;
  provider: string;
  workspacePath: string;
  workspace_path: string;
  skills: string[] | string;
}>;

type ResumeRequestBody = Partial<{
  sessionId: string;
  session_id: string;
}>;

type WorkspaceRegistryBody = Partial<{
  projectId: string;
  project_id: string;
  workspacePath: string;
  workspace_path: string;
  label: string;
  entryCommand: string;
  entry_command: string;
  manifestCommand: string;
  manifest_command: string;
  entryUrl: string;
  entry_url: string;
}>;

type HostedPackageRequestBody = Partial<{
  outputDir: string;
  output_dir: string;
  publicOrigin: string;
  public_origin: string;
  host: string;
  port: number | string;
  basePath: string;
  base_path: string;
  sessionsLimit: number | string;
  sessions_limit: number | string;
}>;

type WebFrontDeskStartupPayload = {
  version: 'g2';
  contracts_context: {
    contracts_dir: string;
    contracts_root_source: string;
  };
  web_frontdesk: {
    entry_surface: 'opl_local_web_frontdesk_pilot';
    runtime_substrate: 'external_hermes_kernel';
    mode: 'local_web_frontdesk';
    local_shell_command: 'opl web';
    local_only: true;
    hosted_status: 'librechat_pilot_landed';
    pilot_bundle_status: 'landed';
    librechat_pilot_package_status: 'landed';
    listening: {
      host: string;
      port: number;
      base_url: string;
      entry_url: string;
      base_path: string;
    };
    api: {
      health: string;
      frontdesk_manifest: string;
      domain_manifests: string;
      hosted_bundle: string;
      hosted_package: string;
      librechat_package: string;
      dashboard: string;
      projects: string;
      workspace_status: string;
      workspace_catalog: string;
      workspace_bind: string;
      workspace_activate: string;
      workspace_archive: string;
      runtime_status: string;
      session_ledger: string;
      ask: string;
      handoff_envelope: string;
      sessions: string;
      resume: string;
      logs: string;
    };
    defaults: {
      workspace_path: string;
      sessions_limit: number;
    };
    notes: string[];
  };
};

type WebFrontDeskContext = {
  contracts: GatewayContracts;
  host: string;
  port: number;
  baseUrl: string;
  entryUrl: string;
  basePath: string;
  workspacePath: string;
  sessionsLimit: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeOptionalString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function normalizeSkills(value: unknown) {
  if (Array.isArray(value)) {
    return value
      .filter((entry): entry is string => typeof entry === 'string')
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  if (typeof value === 'string') {
    return value
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  return [];
}

function parsePositiveIntegerOrDefault(value: string | null, fallback: number) {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new GatewayContractError(
      'cli_usage_error',
      'Expected a positive integer query parameter for the requested web front-desk surface.',
      {
        value,
      },
    );
  }

  return parsed;
}

function readRequestBody(request: IncomingMessage) {
  return new Promise<string>((resolve, reject) => {
    let body = '';

    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      body += chunk;
    });
    request.on('end', () => {
      resolve(body);
    });
    request.on('error', reject);
  });
}

async function readJsonBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const rawBody = await readRequestBody(request);
  if (!rawBody.trim()) {
    return {};
  }

  try {
    const parsed = JSON.parse(rawBody) as unknown;
    if (!isRecord(parsed)) {
      throw new GatewayContractError(
        'cli_usage_error',
        'Web front-desk JSON requests must use an object body.',
      );
    }

    return parsed;
  } catch (error) {
    if (error instanceof GatewayContractError) {
      throw error;
    }

    throw new GatewayContractError(
      'cli_usage_error',
      'Web front-desk request body must be valid JSON.',
      {
        cause: error instanceof Error ? error.message : 'Unknown JSON parse failure.',
      },
    );
  }
}

function writeJson(response: ServerResponse<IncomingMessage>, statusCode: number, payload: unknown) {
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  response.end(`${JSON.stringify(payload, null, 2)}\n`);
}

function writeHtml(response: ServerResponse<IncomingMessage>, html: string) {
  response.writeHead(200, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
  });
  response.end(html);
}

function normalizeAskInput(body: AskRequestBody): ProductEntryCliInput {
  const goal = normalizeOptionalString(body.goal);
  if (!goal) {
    throw new GatewayContractError(
      'cli_usage_error',
      'Web front-desk ask requests require a non-empty goal.',
      {
        required: ['goal'],
      },
    );
  }

  return {
    dryRun: Boolean(body.dryRun ?? body.dry_run),
    goal,
    intent: normalizeOptionalString(body.intent) ?? 'create',
    target: normalizeOptionalString(body.target) ?? 'deliverable',
    preferredFamily:
      normalizeOptionalString(body.preferredFamily) ?? normalizeOptionalString(body.preferred_family),
    requestKind:
      normalizeOptionalString(body.requestKind) ?? normalizeOptionalString(body.request_kind),
    model: normalizeOptionalString(body.model),
    provider: normalizeOptionalString(body.provider),
    workspacePath:
      normalizeOptionalString(body.workspacePath) ?? normalizeOptionalString(body.workspace_path),
    skills: normalizeSkills(body.skills),
  };
}

function normalizeResumeSessionId(body: ResumeRequestBody) {
  const sessionId = normalizeOptionalString(body.sessionId) ?? normalizeOptionalString(body.session_id);
  if (!sessionId) {
    throw new GatewayContractError(
      'cli_usage_error',
      'Web front-desk resume requests require a non-empty session_id.',
      {
        required: ['session_id'],
      },
    );
  }

  return sessionId;
}

function normalizeWorkspaceRegistryInput(body: WorkspaceRegistryBody) {
  const projectId = normalizeOptionalString(body.projectId) ?? normalizeOptionalString(body.project_id);
  const workspacePath =
    normalizeOptionalString(body.workspacePath) ?? normalizeOptionalString(body.workspace_path);

  if (!projectId || !workspacePath) {
    throw new GatewayContractError(
      'cli_usage_error',
      'Workspace registry requests require non-empty project_id and workspace_path.',
      {
        required: ['project_id', 'workspace_path'],
      },
    );
  }

  return {
    projectId,
    workspacePath,
    label: normalizeOptionalString(body.label),
    entryCommand:
      normalizeOptionalString(body.entryCommand) ?? normalizeOptionalString(body.entry_command),
    manifestCommand:
      normalizeOptionalString(body.manifestCommand) ?? normalizeOptionalString(body.manifest_command),
    entryUrl: normalizeOptionalString(body.entryUrl) ?? normalizeOptionalString(body.entry_url),
  };
}

function normalizeHostedPackageInput(body: HostedPackageRequestBody) {
  const outputDir = normalizeOptionalString(body.outputDir) ?? normalizeOptionalString(body.output_dir);

  if (!outputDir) {
    throw new GatewayContractError(
      'cli_usage_error',
      'Hosted package export requires a non-empty output_dir.',
      {
        required: ['output_dir'],
      },
    );
  }

  const portValue = body.port;
  let port: number | undefined;
  if (typeof portValue === 'number' && Number.isInteger(portValue) && portValue >= 0 && portValue <= 65535) {
    port = portValue;
  } else if (typeof portValue === 'string' && portValue.trim().length > 0) {
    const parsed = Number.parseInt(portValue, 10);
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > 65535) {
      throw new GatewayContractError(
        'cli_usage_error',
        'Hosted package export requires port to be an integer between 0 and 65535.',
        {
          port: portValue,
        },
      );
    }
    port = parsed;
  }

  const sessionsLimitValue = body.sessionsLimit ?? body.sessions_limit;
  let sessionsLimit: number | undefined;
  if (
    typeof sessionsLimitValue === 'number'
    && Number.isInteger(sessionsLimitValue)
    && sessionsLimitValue > 0
  ) {
    sessionsLimit = sessionsLimitValue;
  } else if (typeof sessionsLimitValue === 'string' && sessionsLimitValue.trim().length > 0) {
    const parsed = Number.parseInt(sessionsLimitValue, 10);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new GatewayContractError(
        'cli_usage_error',
        'Hosted package export requires sessions_limit to be a positive integer.',
        {
          sessions_limit: sessionsLimitValue,
        },
      );
    }
    sessionsLimit = parsed;
  }

  return {
    outputDir,
    publicOrigin: normalizeOptionalString(body.publicOrigin) ?? normalizeOptionalString(body.public_origin),
    host: normalizeOptionalString(body.host),
    port,
    basePath: normalizeOptionalString(body.basePath) ?? normalizeOptionalString(body.base_path),
    sessionsLimit,
  };
}

function parsePositiveIntegerOptional(value: string | null) {
  if (!value) {
    return undefined;
  }

  return parsePositiveIntegerOrDefault(value, 1);
}

function normalizeBaseUrlHost(host: string) {
  if (host === '0.0.0.0') {
    return '127.0.0.1';
  }

  if (host === '::') {
    return '[::1]';
  }

  return host.includes(':') && !host.startsWith('[') ? `[${host}]` : host;
}

function buildStartupPayload(context: WebFrontDeskContext): WebFrontDeskStartupPayload {
  const manifest = buildFrontDeskManifest(context.contracts, { basePath: context.basePath });
  const endpoints = buildFrontDeskEndpoints(context.basePath);

  return {
    version: 'g2',
    contracts_context: {
      contracts_dir: context.contracts.contractsDir,
      contracts_root_source: context.contracts.contractsRootSource,
    },
    web_frontdesk: {
      entry_surface: 'opl_local_web_frontdesk_pilot',
      runtime_substrate: 'external_hermes_kernel',
      mode: 'local_web_frontdesk',
      local_shell_command: 'opl web',
      local_only: true,
      hosted_status: 'librechat_pilot_landed',
      pilot_bundle_status: 'landed',
      librechat_pilot_package_status: 'landed',
      listening: {
        host: context.host,
        port: context.port,
        base_url: context.baseUrl,
        entry_url: context.entryUrl,
        base_path: context.basePath,
      },
      api: {
        health: endpoints.health,
        frontdesk_manifest: manifest.frontdesk_manifest.endpoints.manifest,
        domain_manifests: endpoints.domain_manifests,
        hosted_bundle: endpoints.hosted_bundle,
        hosted_package: endpoints.hosted_package,
        librechat_package: endpoints.librechat_package,
        dashboard: endpoints.dashboard,
        projects: endpoints.projects,
        workspace_status: endpoints.workspace_status,
        workspace_catalog: endpoints.workspace_catalog,
        workspace_bind: endpoints.workspace_bind,
        workspace_activate: endpoints.workspace_activate,
        workspace_archive: endpoints.workspace_archive,
        runtime_status: endpoints.runtime_status,
        session_ledger: endpoints.session_ledger,
        ask: endpoints.ask,
        handoff_envelope: endpoints.handoff_envelope,
        sessions: endpoints.sessions,
        resume: endpoints.resume,
        logs: endpoints.logs,
      },
      defaults: {
        workspace_path: context.workspacePath,
        sessions_limit: context.sessionsLimit,
      },
      notes: [
        'This is a local web front-desk pilot layered above the existing OPL CLI-first entry shell.',
        'The real LibreChat-first hosted shell pilot export is now landed alongside the hosted bundle and hosted package.',
        'Managed hosted runtime ownership is still not landed.',
      ],
    },
  };
}

function serializeJsonForHtml(value: unknown) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}

function buildWebFrontDeskHtml(context: WebFrontDeskContext) {
  const bootstrap = buildStartupPayload(context);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>OPL Front Desk</title>
    <style>
      :root {
        --bg: #f3ecdf;
        --bg-deep: #18352e;
        --panel: rgba(252, 248, 240, 0.92);
        --panel-strong: #fffaf0;
        --line: rgba(24, 53, 46, 0.14);
        --ink: #172922;
        --ink-soft: #486056;
        --accent: #b35d2d;
        --accent-strong: #8f4720;
        --accent-cool: #1f5a4e;
        --ok: #2e6b58;
        --warn: #91511c;
        --radius-xl: 28px;
        --radius-lg: 20px;
        --radius-md: 14px;
        --shadow: 0 22px 60px rgba(23, 41, 34, 0.14);
        --font-ui: "Avenir Next", "Segoe UI", "Helvetica Neue", sans-serif;
        --font-display: "Iowan Old Style", "Palatino Linotype", "Book Antiqua", Georgia, serif;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        min-height: 100vh;
        font-family: var(--font-ui);
        color: var(--ink);
        background:
          radial-gradient(circle at top right, rgba(179, 93, 45, 0.18), transparent 32%),
          radial-gradient(circle at bottom left, rgba(31, 90, 78, 0.15), transparent 28%),
          linear-gradient(180deg, #f8f3ea 0%, var(--bg) 46%, #e7dfd2 100%);
      }

      body::before {
        content: "";
        position: fixed;
        inset: 0;
        pointer-events: none;
        background-image:
          linear-gradient(rgba(24, 53, 46, 0.035) 1px, transparent 1px),
          linear-gradient(90deg, rgba(24, 53, 46, 0.035) 1px, transparent 1px);
        background-size: 28px 28px;
        mask-image: linear-gradient(180deg, rgba(0, 0, 0, 0.35), rgba(0, 0, 0, 0));
      }

      .shell {
        width: min(1320px, calc(100vw - 32px));
        margin: 24px auto 40px;
      }

      .hero {
        position: relative;
        overflow: hidden;
        padding: 28px 28px 30px;
        border-radius: var(--radius-xl);
        background:
          linear-gradient(135deg, rgba(24, 53, 46, 0.96), rgba(31, 90, 78, 0.88) 42%, rgba(179, 93, 45, 0.9) 100%);
        color: #f8f3ea;
        box-shadow: var(--shadow);
      }

      .hero::after {
        content: "";
        position: absolute;
        inset: auto -15% -40% auto;
        width: 320px;
        height: 320px;
        border-radius: 50%;
        background: radial-gradient(circle, rgba(255, 245, 232, 0.28), transparent 64%);
      }

      .eyebrow {
        font-size: 0.78rem;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        opacity: 0.78;
      }

      .hero h1 {
        margin: 12px 0 10px;
        font-family: var(--font-display);
        font-size: clamp(2rem, 4vw, 3.4rem);
        line-height: 1.02;
      }

      .hero p {
        max-width: 760px;
        margin: 0;
        color: rgba(248, 243, 234, 0.9);
        line-height: 1.7;
      }

      .hero-strip {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        margin-top: 18px;
      }

      .pill {
        display: inline-flex;
        align-items: center;
        min-height: 44px;
        padding: 10px 14px;
        border: 1px solid rgba(255, 248, 239, 0.22);
        border-radius: 999px;
        background: rgba(255, 248, 239, 0.08);
        font-size: 0.92rem;
      }

      .layout {
        display: grid;
        grid-template-columns: 1.25fr 0.95fr;
        gap: 18px;
        margin-top: 18px;
      }

      .stack {
        display: grid;
        gap: 18px;
      }

      .panel {
        border: 1px solid var(--line);
        border-radius: var(--radius-lg);
        background: var(--panel);
        box-shadow: var(--shadow);
        overflow: hidden;
      }

      .panel-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 20px 22px 0;
      }

      .panel-title {
        margin: 0;
        font-family: var(--font-display);
        font-size: 1.5rem;
      }

      .panel-copy {
        margin: 8px 22px 0;
        color: var(--ink-soft);
        line-height: 1.6;
      }

      .panel-body {
        padding: 20px 22px 22px;
      }

      .field-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 14px;
      }

      label {
        display: grid;
        gap: 8px;
        font-size: 0.95rem;
        color: var(--ink-soft);
      }

      textarea,
      input {
        width: 100%;
        border: 1px solid rgba(24, 53, 46, 0.16);
        border-radius: 14px;
        padding: 13px 14px;
        font: inherit;
        color: var(--ink);
        background: rgba(255, 255, 255, 0.82);
      }

      textarea {
        min-height: 136px;
        resize: vertical;
        line-height: 1.6;
      }

      textarea:focus,
      input:focus,
      button:focus {
        outline: 3px solid rgba(179, 93, 45, 0.22);
        outline-offset: 2px;
      }

      .button-row {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        margin-top: 18px;
      }

      button {
        min-height: 46px;
        border: none;
        border-radius: 999px;
        padding: 0 18px;
        font: inherit;
        font-weight: 600;
        cursor: pointer;
        transition: transform 180ms ease, opacity 180ms ease, box-shadow 180ms ease;
      }

      button:hover {
        transform: translateY(-1px);
      }

      button:disabled {
        cursor: wait;
        opacity: 0.6;
        transform: none;
      }

      .primary {
        color: #fff8f0;
        background: linear-gradient(135deg, var(--accent), var(--accent-strong));
        box-shadow: 0 16px 30px rgba(179, 93, 45, 0.26);
      }

      .secondary {
        color: var(--accent-cool);
        background: rgba(31, 90, 78, 0.1);
        border: 1px solid rgba(31, 90, 78, 0.18);
      }

      .ghost {
        color: var(--ink);
        background: rgba(24, 53, 46, 0.06);
        border: 1px solid rgba(24, 53, 46, 0.1);
      }

      .status-line {
        min-height: 24px;
        margin-top: 12px;
        color: var(--ink-soft);
      }

      .status-line[data-tone="warn"] {
        color: var(--warn);
      }

      .status-line[data-tone="ok"] {
        color: var(--ok);
      }

      .metrics {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 12px;
      }

      .metric {
        padding: 16px;
        border-radius: 16px;
        background: rgba(255, 255, 255, 0.72);
        border: 1px solid rgba(24, 53, 46, 0.08);
      }

      .metric-label {
        font-size: 0.82rem;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: var(--ink-soft);
      }

      .metric-value {
        margin-top: 8px;
        font-family: var(--font-display);
        font-size: 1.8rem;
      }

      .card-list {
        display: grid;
        gap: 12px;
      }

      .card {
        padding: 16px;
        border-radius: 16px;
        background: rgba(255, 255, 255, 0.76);
        border: 1px solid rgba(24, 53, 46, 0.08);
      }

      .card h3 {
        margin: 0 0 8px;
        font-size: 1rem;
      }

      .card p,
      .card li {
        color: var(--ink-soft);
        line-height: 1.6;
      }

      .badge-row {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 10px;
      }

      .badge {
        display: inline-flex;
        align-items: center;
        min-height: 30px;
        padding: 0 10px;
        border-radius: 999px;
        background: rgba(31, 90, 78, 0.1);
        color: var(--accent-cool);
        font-size: 0.84rem;
      }

      .json-view {
        margin: 0;
        min-height: 240px;
        max-height: 480px;
        padding: 16px;
        overflow: auto;
        border-radius: 16px;
        background: #16251f;
        color: #f3ede0;
        font: 0.86rem/1.65 "SFMono-Regular", "Menlo", "Consolas", monospace;
      }

      .split-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
      }

      .footer-note {
        margin-top: 14px;
        color: var(--ink-soft);
        font-size: 0.92rem;
        line-height: 1.7;
      }

      @media (max-width: 1040px) {
        .layout {
          grid-template-columns: 1fr;
        }
      }

      @media (max-width: 720px) {
        .shell {
          width: min(100vw - 18px, 100%);
          margin: 12px auto 24px;
        }

        .hero,
        .panel-body,
        .panel-header {
          padding-left: 16px;
          padding-right: 16px;
        }

        .panel-copy {
          margin-left: 16px;
          margin-right: 16px;
        }

        .field-grid,
        .metrics,
        .split-grid {
          grid-template-columns: 1fr;
        }
      }
    </style>
  </head>
  <body>
    <div class="shell">
      <header class="hero">
        <div class="eyebrow">One Person Lab</div>
        <h1>OPL Front Desk Control Room</h1>
        <p>
          Local web pilot for family routing, workspace inspection, runtime visibility, and quick ask.
          It gives OPL a directly usable front desk without pretending that hosted packaging is already done.
        </p>
        <div class="hero-strip">
          <div class="pill">Local web pilot landed</div>
          <div class="pill">Hosted packaging not landed</div>
          <div class="pill">Hermes stays the external kernel</div>
        </div>
      </header>

      <main class="layout">
        <div class="stack">
          <section class="panel">
            <div class="panel-header">
              <h2 class="panel-title">Quick Ask</h2>
            </div>
            <p class="panel-copy">
              Use preview to inspect routing and handoff truth first. Run ask when you want the pilot to call Hermes for a one-shot response.
            </p>
            <div class="panel-body">
              <form id="ask-form">
                <label>
                  Request
                  <textarea id="goal" name="goal">Prepare a defense-ready slide deck for a thesis committee.</textarea>
                </label>
                <div class="field-grid">
                  <label>
                    Intent
                    <input id="intent" name="intent" value="create" />
                  </label>
                  <label>
                    Target
                    <input id="target" name="target" value="deliverable" />
                  </label>
                  <label>
                    Preferred Family
                    <input id="preferred-family" name="preferred-family" value="ppt_deck" />
                  </label>
                  <label>
                    Request Kind
                    <input id="request-kind" name="request-kind" placeholder="Optional" />
                  </label>
                </div>
                <div class="button-row">
                  <button class="secondary" type="button" id="preview-button">Preview Handoff</button>
                  <button class="primary" type="button" id="ask-button">Run Ask</button>
                </div>
                <div class="status-line" id="ask-status" aria-live="polite"></div>
              </form>
            </div>
          </section>

          <section class="panel">
            <div class="panel-header">
              <h2 class="panel-title">Ask Result</h2>
            </div>
            <p class="panel-copy">
              The panel below shows the current ask outcome, including routing summary, returned session id, and raw machine-readable payload.
            </p>
            <div class="panel-body">
              <div class="split-grid">
                <div class="card">
                  <h3>Result Summary</h3>
                  <div id="ask-summary">No ask has run yet.</div>
                </div>
                <div class="card">
                  <h3>Boundary Notes</h3>
                  <div id="ask-boundary">Preview or run ask to inspect the routed boundary.</div>
                </div>
              </div>
              <div style="height: 12px"></div>
              <pre class="json-view" id="ask-json">{}</pre>
            </div>
          </section>
        </div>

        <div class="stack">
          <section class="panel">
            <div class="panel-header">
              <h2 class="panel-title">Control Room</h2>
              <button class="ghost" type="button" id="refresh-button">Refresh</button>
            </div>
            <p class="panel-copy">
              This view merges project routing, workspace status, and Hermes runtime visibility into one family-level management surface.
            </p>
            <div class="panel-body">
              <div class="metrics">
                <div class="metric">
                  <div class="metric-label">Projects</div>
                  <div class="metric-value" id="metric-projects">-</div>
                </div>
                <div class="metric">
                  <div class="metric-label">Sessions</div>
                  <div class="metric-value" id="metric-sessions">-</div>
                </div>
                <div class="metric">
                  <div class="metric-label">Processes</div>
                  <div class="metric-value" id="metric-processes">-</div>
                </div>
              </div>
              <div class="footer-note" id="runtime-note">
                Loading dashboard...
              </div>
            </div>
          </section>

          <section class="panel">
            <div class="panel-header">
              <h2 class="panel-title">Hosted-Friendly Surface</h2>
            </div>
            <p class="panel-copy">
              These surfaces freeze the local shell contract that a future hosted shell can consume. They improve product-entry interoperability without pretending hosted packaging is already done.
            </p>
            <div class="panel-body">
              <div class="split-grid">
                <div class="card">
                  <h3>Health</h3>
                  <div id="health-summary">Loading health...</div>
                </div>
                <div class="card">
                  <h3>Manifest</h3>
                  <div id="manifest-summary">Loading manifest...</div>
                </div>
              </div>
              <div style="height: 12px"></div>
              <div class="card">
                <h3>Hosted Pilot Bundle</h3>
                <div id="hosted-bundle-summary">Loading hosted pilot bundle...</div>
                <div style="height: 12px"></div>
                <pre class="json-view" id="hosted-bundle-json">{}</pre>
              </div>
              <div style="height: 12px"></div>
              <div class="card">
                <h3>Hosted Pilot Package Export</h3>
                <p class="panel-copy">
                  Export a self-hostable pilot package with runnable app snapshot, env template, service unit, and reverse-proxy files. This is packaging prep, not a claim that the actual hosted runtime is already landed.
                </p>
                <form id="hosted-package-form">
                  <div class="field-grid">
                    <label>
                      Output Directory
                      <input id="hosted-package-output" name="hosted-package-output" placeholder="/tmp/opl-frontdesk-package" />
                    </label>
                    <label>
                      Public Origin
                      <input id="hosted-package-public-origin" name="hosted-package-public-origin" placeholder="https://opl.example.com" />
                    </label>
                  </div>
                  <div class="button-row">
                    <button class="secondary" type="submit">Export Package</button>
                  </div>
                </form>
                <div class="status-line" id="hosted-package-status" aria-live="polite"></div>
                <div style="height: 12px"></div>
                <pre class="json-view" id="hosted-package-json">No hosted package export yet.</pre>
              </div>
              <div style="height: 12px"></div>
              <div class="card">
                <h3>LibreChat-first Hosted Shell Export</h3>
                <p class="panel-copy">
                  Export the actual hosted shell pilot package: LibreChat at the public root, OPL Front Desk at the configured base path, and same-origin reverse-proxy assets that wire them together honestly.
                </p>
                <form id="librechat-package-form">
                  <div class="field-grid">
                    <label>
                      Output Directory
                      <input id="librechat-package-output" name="librechat-package-output" placeholder="/tmp/opl-librechat-pilot" />
                    </label>
                    <label>
                      Public Origin
                      <input id="librechat-package-public-origin" name="librechat-package-public-origin" placeholder="https://opl.example.com" />
                    </label>
                  </div>
                  <div class="button-row">
                    <button class="secondary" type="submit">Export LibreChat Pilot</button>
                  </div>
                </form>
                <div class="status-line" id="librechat-package-status" aria-live="polite"></div>
                <div style="height: 12px"></div>
                <pre class="json-view" id="librechat-package-json">No LibreChat pilot export yet.</pre>
              </div>
              <div style="height: 12px"></div>
              <div class="split-grid">
                <div class="card">
                  <h3>Resume Session</h3>
                  <form id="resume-form">
                    <label>
                      Session ID
                      <input id="resume-session-id" name="resume-session-id" placeholder="sess_..." />
                    </label>
                    <div class="button-row">
                      <button class="secondary" type="submit">Resume</button>
                    </div>
                  </form>
                  <div class="status-line" id="resume-status" aria-live="polite"></div>
                  <pre class="json-view" id="resume-output">No resumed session yet.</pre>
                </div>
                <div class="card">
                  <h3>Gateway Logs</h3>
                  <form id="logs-form">
                    <div class="field-grid">
                      <label>
                        Log Name
                        <input id="log-name" name="log-name" value="gateway" />
                      </label>
                      <label>
                        Lines
                        <input id="log-lines" name="log-lines" value="20" />
                      </label>
                    </div>
                    <div class="button-row">
                      <button class="ghost" type="submit">Load Logs</button>
                    </div>
                  </form>
                  <div class="status-line" id="logs-status" aria-live="polite"></div>
                  <pre class="json-view" id="logs-output">Loading logs...</pre>
                </div>
              </div>
            </div>
          </section>

          <section class="panel">
            <div class="panel-header">
              <h2 class="panel-title">Workspace</h2>
            </div>
            <p class="panel-copy">
              Bind, activate, archive, and inspect project workspaces without leaving the front desk. Optional direct-entry locators let OPL hand off into a domain front desk honestly.
            </p>
            <div class="panel-body">
              <form id="workspace-form">
                <div class="field-grid">
                  <label>
                    Project ID
                    <input id="workspace-project" name="workspace-project" value="redcube" />
                  </label>
                  <label>
                    Workspace Path
                    <input id="workspace-path" name="workspace-path" />
                  </label>
                  <label>
                    Label
                    <input id="workspace-label" name="workspace-label" placeholder="Optional label" />
                  </label>
                  <label>
                    Direct Entry Command
                    <input id="workspace-entry-command" name="workspace-entry-command" placeholder="Optional command" />
                  </label>
                  <label style="grid-column: 1 / -1;">
                    Manifest Command
                    <input id="workspace-manifest-command" name="workspace-manifest-command" placeholder="Optional product-entry manifest command" />
                  </label>
                  <label style="grid-column: 1 / -1;">
                    Direct Entry URL
                    <input id="workspace-entry-url" name="workspace-entry-url" placeholder="Optional URL" />
                  </label>
                </div>
                <div class="button-row">
                  <button class="secondary" type="submit" id="workspace-inspect-button">Inspect Workspace</button>
                  <button class="primary" type="button" id="workspace-bind-button">Bind / Upsert</button>
                  <button class="ghost" type="button" id="workspace-activate-button">Activate</button>
                  <button class="ghost" type="button" id="workspace-archive-button">Archive</button>
                </div>
              </form>
              <div class="status-line" id="workspace-status-line" aria-live="polite"></div>
              <div style="height: 12px"></div>
              <div class="card-list" id="workspace-card-list"></div>
              <div style="height: 12px"></div>
              <div class="card">
                <h3>Workspace Catalog</h3>
                <pre class="json-view" id="workspace-catalog-json">{}</pre>
              </div>
            </div>
          </section>

          <section class="panel">
            <div class="panel-header">
              <h2 class="panel-title">Projects And Sessions</h2>
            </div>
            <div class="panel-body">
              <div class="card-list" id="projects-list"></div>
              <div style="height: 12px"></div>
              <div class="split-grid">
                <div class="card">
                  <h3>Recent Sessions</h3>
                  <div id="sessions-list">Loading recent sessions...</div>
                </div>
                <div class="card">
                  <h3>Managed Session Ledger</h3>
                  <pre class="json-view" id="session-ledger-json">{}</pre>
                </div>
                <div class="card">
                  <h3>Domain Manifests</h3>
                  <pre class="json-view" id="domain-manifest-json">{}</pre>
                </div>
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>

    <script type="application/json" id="opl-bootstrap">${serializeJsonForHtml(bootstrap)}</script>
    <script type="module">
      const bootstrap = JSON.parse(document.getElementById('opl-bootstrap').textContent);
      const state = {
        workspacePath: bootstrap.web_frontdesk.defaults.workspace_path,
        sessionsLimit: bootstrap.web_frontdesk.defaults.sessions_limit,
      };

      const askStatus = document.getElementById('ask-status');
      const askSummary = document.getElementById('ask-summary');
      const askBoundary = document.getElementById('ask-boundary');
      const askJson = document.getElementById('ask-json');
      const projectsList = document.getElementById('projects-list');
      const workspaceCardList = document.getElementById('workspace-card-list');
      const sessionsList = document.getElementById('sessions-list');
      const metricProjects = document.getElementById('metric-projects');
      const metricSessions = document.getElementById('metric-sessions');
      const metricProcesses = document.getElementById('metric-processes');
      const runtimeNote = document.getElementById('runtime-note');
      const healthSummary = document.getElementById('health-summary');
      const manifestSummary = document.getElementById('manifest-summary');
      const hostedBundleSummary = document.getElementById('hosted-bundle-summary');
      const hostedBundleJson = document.getElementById('hosted-bundle-json');
      const hostedPackageOutputInput = document.getElementById('hosted-package-output');
      const hostedPackagePublicOriginInput = document.getElementById('hosted-package-public-origin');
      const hostedPackageStatus = document.getElementById('hosted-package-status');
      const hostedPackageJson = document.getElementById('hosted-package-json');
      const librechatPackageOutputInput = document.getElementById('librechat-package-output');
      const librechatPackagePublicOriginInput = document.getElementById('librechat-package-public-origin');
      const librechatPackageStatus = document.getElementById('librechat-package-status');
      const librechatPackageJson = document.getElementById('librechat-package-json');
      const resumeSessionInput = document.getElementById('resume-session-id');
      const resumeStatus = document.getElementById('resume-status');
      const resumeOutput = document.getElementById('resume-output');
      const logsStatus = document.getElementById('logs-status');
      const logsOutput = document.getElementById('logs-output');
      const logNameInput = document.getElementById('log-name');
      const logLinesInput = document.getElementById('log-lines');
      const workspaceProjectInput = document.getElementById('workspace-project');
      const workspacePathInput = document.getElementById('workspace-path');
      const workspaceLabelInput = document.getElementById('workspace-label');
      const workspaceEntryCommandInput = document.getElementById('workspace-entry-command');
      const workspaceManifestCommandInput = document.getElementById('workspace-manifest-command');
      const workspaceEntryUrlInput = document.getElementById('workspace-entry-url');
      const workspaceStatusLine = document.getElementById('workspace-status-line');
      const workspaceCatalogJson = document.getElementById('workspace-catalog-json');
      const sessionLedgerJson = document.getElementById('session-ledger-json');
      const domainManifestJson = document.getElementById('domain-manifest-json');
      const previewButton = document.getElementById('preview-button');
      const askButton = document.getElementById('ask-button');
      const refreshButton = document.getElementById('refresh-button');
      const workspaceBindButton = document.getElementById('workspace-bind-button');
      const workspaceActivateButton = document.getElementById('workspace-activate-button');
      const workspaceArchiveButton = document.getElementById('workspace-archive-button');

      workspacePathInput.value = state.workspacePath;

      function setAskStatus(message, tone = 'muted') {
        askStatus.textContent = message;
        askStatus.dataset.tone = tone;
      }

      function setButtonBusy(isBusy) {
        previewButton.disabled = isBusy;
        askButton.disabled = isBusy;
        refreshButton.disabled = isBusy;
      }

      function formatList(items) {
        if (!items || items.length === 0) {
          return '<p>No entries yet.</p>';
        }

        return '<div class="card-list">' + items.join('') + '</div>';
      }

      function renderProjects(projects, domainManifestProjects = []) {
        const manifestLookup = new Map(domainManifestProjects.map((entry) => [entry.project_id, entry]));
        projectsList.innerHTML = formatList(projects.map((project) => {
          const badges = [
            project.scope,
            project.gateway_surface || project.direct_entry_surface,
          ].filter(Boolean).map((entry) => '<span class="badge">' + entry + '</span>').join('');
          const activeBinding = project.active_binding;
          const bindingBlock = activeBinding
            ? [
                '<p><strong>Active Workspace:</strong> ' + activeBinding.workspace_path + '</p>',
                activeBinding.label ? '<p><strong>Binding Label:</strong> ' + activeBinding.label + '</p>' : '',
                activeBinding.direct_entry?.command
                  ? '<p><strong>Direct Entry Command:</strong> ' + activeBinding.direct_entry.command + '</p>'
                  : '',
                activeBinding.direct_entry?.manifest_command
                  ? '<p><strong>Manifest Command:</strong> ' + activeBinding.direct_entry.manifest_command + '</p>'
                  : '',
                activeBinding.direct_entry?.url
                  ? '<p><strong>Direct Entry URL:</strong> ' + activeBinding.direct_entry.url + '</p>'
                  : '',
              ].filter(Boolean).join('')
            : '<p><strong>Active Workspace:</strong> none</p>';
          const manifestEntry = manifestLookup.get(project.project_id);
          const manifestBlock = !manifestEntry
            ? ''
            : manifestEntry.status === 'resolved'
              ? [
                  '<p><strong>Manifest Status:</strong> resolved</p>',
                  manifestEntry.manifest?.repo_mainline
                    ? '<p><strong>Mainline Phase:</strong> '
                      + (
                        manifestEntry.manifest.repo_mainline.phase_id
                        || manifestEntry.manifest.repo_mainline.current_program_phase_id
                        || manifestEntry.manifest.repo_mainline.active_phase
                        || 'unknown'
                      )
                      + '</p>'
                    : '',
                  manifestEntry.manifest?.repo_mainline
                    ? '<p><strong>Mainline Tranche:</strong> '
                      + (
                        manifestEntry.manifest.repo_mainline.tranche_id
                        || manifestEntry.manifest.repo_mainline.current_stage_id
                        || manifestEntry.manifest.repo_mainline.active_tranche
                        || 'unknown'
                      )
                      + '</p>'
                    : '',
                  manifestEntry.manifest?.recommended_shell
                    ? '<p><strong>Recommended Shell:</strong> ' + manifestEntry.manifest.recommended_shell + '</p>'
                    : '',
                  manifestEntry.manifest?.recommended_command
                    ? '<p><strong>Recommended Command:</strong> ' + manifestEntry.manifest.recommended_command + '</p>'
                    : '',
                  manifestEntry.manifest?.operator_loop_surface?.shell_key
                    ? '<p><strong>Current Operator Loop:</strong> '
                      + manifestEntry.manifest.operator_loop_surface.shell_key
                      + '</p>'
                    : '',
                  manifestEntry.manifest?.operator_loop_surface?.command
                    ? '<p><strong>Operator Loop Command:</strong> '
                      + manifestEntry.manifest.operator_loop_surface.command
                      + '</p>'
                    : '',
                  manifestEntry.manifest?.operator_loop_surface?.summary
                    ? '<p><strong>Operator Loop Summary:</strong> '
                      + manifestEntry.manifest.operator_loop_surface.summary
                      + '</p>'
                    : '',
                  manifestEntry.manifest?.operator_loop_surface?.continuation_command
                    ? '<p><strong>Operator Loop Continue:</strong> '
                      + manifestEntry.manifest.operator_loop_surface.continuation_command
                      + '</p>'
                    : '',
                  Object.entries(manifestEntry.manifest?.operator_loop_actions || {}).length > 0
                    ? '<div><strong>Operator Loop Actions:</strong><ul>'
                      + Object.entries(manifestEntry.manifest?.operator_loop_actions || {})
                        .map(([actionKey, actionValue]) => {
                          if (!actionValue || typeof actionValue !== 'object') {
                            return '';
                          }
                          const action = actionValue as {
                            command?: string;
                            summary?: string;
                          };
                          return '<li><code>' + actionKey + '</code>: '
                            + String(action.command || '')
                            + (action.summary ? ' - ' + action.summary : '')
                            + '</li>';
                        })
                        .filter(Boolean)
                        .join('')
                      + '</ul></div>'
                    : '',
                  manifestEntry.manifest?.product_entry_status?.summary
                    ? '<p><strong>Entry Status:</strong> ' + manifestEntry.manifest.product_entry_status.summary + '</p>'
                    : '',
                  typeof manifestEntry.manifest?.product_entry_status?.remaining_gaps_count === 'number'
                    ? '<p><strong>Remaining Gaps:</strong> '
                      + String(manifestEntry.manifest.product_entry_status.remaining_gaps_count)
                      + '</p>'
                    : '',
                ].filter(Boolean).join('')
              : '<p><strong>Manifest Status:</strong> ' + manifestEntry.status + '</p>';

          return '<div class="card">'
            + '<h3>' + project.project + '</h3>'
            + '<p><strong>Project ID:</strong> ' + project.project_id + '</p>'
            + '<p><strong>Owned Workstreams:</strong> ' + (project.owned_workstreams || []).join(', ') + '</p>'
            + bindingBlock
            + manifestBlock
            + '<div class="badge-row">' + badges + '</div>'
            + '</div>';
        }));
      }

      function renderWorkspace(workspace) {
        const git = workspace.git || {};
        workspaceCardList.innerHTML = formatList([
          '<div class="card">'
            + '<h3>' + workspace.absolute_path + '</h3>'
            + '<p><strong>Git Branch:</strong> ' + (git.branch || 'not a git worktree') + '</p>'
            + '<p><strong>Upstream:</strong> ' + (git.upstream || 'n/a') + '</p>'
            + '<p><strong>Dirty Summary:</strong> modified ' + (git.modified_count ?? 0)
            + ', staged ' + (git.staged_count ?? 0)
            + ', untracked ' + (git.untracked_count ?? 0) + '</p>'
            + '<div class="badge-row">'
            + '<span class="badge">' + (git.is_clean ? 'clean' : 'dirty') + '</span>'
            + '<span class="badge">' + (git.linked_worktree ? 'linked worktree' : 'root checkout') + '</span>'
            + '</div>'
            + '</div>',
        ]);
      }

      function renderSessions(sessions) {
        if (!sessions || sessions.length === 0) {
          sessionsList.innerHTML = '<p>No recent sessions reported by Hermes.</p>';
          return;
        }

        sessionsList.innerHTML = formatList(sessions.map((session) => (
          '<div class="card">'
          + '<h3>' + session.preview + '</h3>'
          + '<p><strong>Last Active:</strong> ' + session.last_active + '</p>'
          + '<p><strong>Source:</strong> ' + session.source + '</p>'
          + '<p><strong>Session ID:</strong> ' + session.session_id + '</p>'
          + '<div class="button-row"><button class="ghost" type="button" data-session-id="' + session.session_id + '">Load Into Resume</button></div>'
          + '</div>'
        )));
      }

      function renderHealth(payload) {
        const health = payload.health;
        const issues = (health.checks.issues || []).map((issue) => '<li>' + issue + '</li>').join('');
        healthSummary.innerHTML = [
          '<p><strong>Status:</strong> ' + health.status + '</p>',
          '<p><strong>Entry Surface:</strong> ' + health.entry_surface + '</p>',
          '<p><strong>Gateway Service Loaded:</strong> ' + String(health.checks.gateway_service.loaded) + '</p>',
          issues ? '<ul>' + issues + '</ul>' : '<p>No runtime issues reported.</p>',
        ].join('');
      }

      function renderHostedBundle(payload) {
        const bundle = payload.hosted_pilot_bundle;
        hostedBundleSummary.innerHTML = [
          '<p><strong>Pilot Bundle:</strong> ' + bundle.pilot_bundle_status + '</p>',
          '<p><strong>Actual Hosted Runtime:</strong> ' + bundle.actual_hosted_runtime_status + '</p>',
          '<p><strong>Entry URL:</strong> ' + bundle.entry_url + '</p>',
          '<p><strong>API Base:</strong> ' + bundle.api_base_url + '</p>',
        ].join('');
        hostedBundleJson.textContent = JSON.stringify(payload, null, 2);
      }

      function setHostedPackageStatus(message, tone = 'muted') {
        hostedPackageStatus.textContent = message;
        hostedPackageStatus.dataset.tone = tone;
      }

      function renderManifest(payload) {
        const manifest = payload.frontdesk_manifest;
        const endpointList = Object.entries(manifest.endpoints)
          .map(([key, value]) => '<li><strong>' + key + ':</strong> ' + value + '</li>')
          .join('');
        manifestSummary.innerHTML = [
          '<p><strong>Readiness:</strong> ' + manifest.readiness + '</p>',
          '<p><strong>Shell Target:</strong> ' + manifest.shell_integration_target + '</p>',
          '<p><strong>Hosted Packaging:</strong> ' + manifest.hosted_packaging_status + '</p>',
          '<ul>' + endpointList + '</ul>',
        ].join('');
      }

      function renderDashboard(payload) {
        const dashboard = payload.dashboard;
        metricProjects.textContent = String(dashboard.projects.length);
        metricSessions.textContent = String(dashboard.runtime_status.recent_sessions.sessions.length);
        metricProcesses.textContent = String(dashboard.runtime_status.process_usage.summary.process_count);
        runtimeNote.textContent = dashboard.runtime_status.notes.join(' ');
        renderProjects(dashboard.projects, dashboard.domain_manifests.projects);
        renderWorkspace(dashboard.workspace);
        renderWorkspaceCatalog({ workspace_catalog: dashboard.workspace_catalog });
        renderSessionLedger({ session_ledger: dashboard.runtime_status.managed_session_ledger });
        renderDomainManifests({ domain_manifests: dashboard.domain_manifests });
      }

      function renderAskPayload(payload) {
        const entry = payload.product_entry;
        const summaryLines = [
          '<p><strong>Mode:</strong> ' + entry.mode + '</p>',
          '<p><strong>Dry Run:</strong> ' + String(entry.dry_run) + '</p>',
          '<p><strong>Routing:</strong> ' + entry.routing.status + '</p>',
        ];

        if (entry.hermes && entry.hermes.session_id) {
          summaryLines.push('<p><strong>Session:</strong> ' + entry.hermes.session_id + '</p>');
        }

        if (entry.hermes && entry.hermes.response) {
          summaryLines.push('<p><strong>Response:</strong> ' + entry.hermes.response + '</p>');
        }

        askSummary.innerHTML = summaryLines.join('');
        askBoundary.innerHTML = [
          '<p><strong>Boundary Status:</strong> ' + entry.boundary.boundary_status + '</p>',
          '<p><strong>Boundary Reason:</strong> ' + entry.boundary.reason + '</p>',
        ].join('');
        askJson.textContent = JSON.stringify(payload, null, 2);
      }

      function renderWorkspaceCatalog(payload) {
        workspaceCatalogJson.textContent = JSON.stringify(payload, null, 2);
      }

      function renderSessionLedger(payload) {
        sessionLedgerJson.textContent = JSON.stringify(payload, null, 2);
      }

      function renderDomainManifests(payload) {
        domainManifestJson.textContent = JSON.stringify(payload, null, 2);
      }

      function setWorkspaceStatus(message, tone = 'muted') {
        workspaceStatusLine.textContent = message;
        workspaceStatusLine.dataset.tone = tone;
      }

      async function fetchDashboard() {
        const params = new URLSearchParams({
          path: state.workspacePath,
          'sessions-limit': String(state.sessionsLimit),
        });
        const response = await fetch(bootstrap.web_frontdesk.api.dashboard + '?' + params.toString());
        if (!response.ok) {
          throw new Error('Dashboard request failed with status ' + response.status);
        }

        const payload = await response.json();
        renderDashboard(payload);
      }

      async function fetchSessions() {
        const params = new URLSearchParams({
          limit: String(state.sessionsLimit),
        });
        const response = await fetch(bootstrap.web_frontdesk.api.sessions + '?' + params.toString());
        if (!response.ok) {
          throw new Error('Sessions request failed with status ' + response.status);
        }

        const payload = await response.json();
        renderSessions(payload.product_entry.sessions || []);
      }

      async function fetchHostedFriendlySurface() {
        const [healthResponse, manifestResponse, hostedBundleResponse] = await Promise.all([
          fetch(bootstrap.web_frontdesk.api.health),
          fetch(bootstrap.web_frontdesk.api.frontdesk_manifest),
          fetch(bootstrap.web_frontdesk.api.hosted_bundle),
        ]);

        if (!healthResponse.ok) {
          throw new Error('Health request failed with status ' + healthResponse.status);
        }
        if (!manifestResponse.ok) {
          throw new Error('Manifest request failed with status ' + manifestResponse.status);
        }
        if (!hostedBundleResponse.ok) {
          throw new Error('Hosted bundle request failed with status ' + hostedBundleResponse.status);
        }

        renderHealth(await healthResponse.json());
        renderManifest(await manifestResponse.json());
        renderHostedBundle(await hostedBundleResponse.json());
      }

      async function exportHostedPackage() {
        const outputDir = hostedPackageOutputInput.value.trim();
        if (!outputDir) {
          setHostedPackageStatus('Hosted package export requires an output directory.', 'warn');
          return;
        }

        setHostedPackageStatus('Exporting hosted pilot package...', 'muted');

        try {
          const response = await fetch(bootstrap.web_frontdesk.api.hosted_package, {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
            },
            body: JSON.stringify({
              output_dir: outputDir,
              public_origin: hostedPackagePublicOriginInput.value.trim(),
            }),
          });
          const payload = await response.json();

          if (!response.ok) {
            throw new Error(payload.error?.message || 'Hosted package export failed.');
          }

          hostedPackageJson.textContent = JSON.stringify(payload, null, 2);
          setHostedPackageStatus('Hosted pilot package exported.', 'ok');
        } catch (error) {
          setHostedPackageStatus(
            error instanceof Error ? error.message : 'Hosted package export failed.',
            'warn',
          );
        }
      }

      function setLibreChatPackageStatus(message, tone = 'muted') {
        librechatPackageStatus.textContent = message;
        librechatPackageStatus.dataset.tone = tone;
      }

      async function exportLibreChatPackage() {
        const outputDir = librechatPackageOutputInput.value.trim();
        if (!outputDir) {
          setLibreChatPackageStatus('LibreChat pilot export requires an output directory.', 'warn');
          return;
        }

        setLibreChatPackageStatus('Exporting LibreChat-first hosted pilot...', 'muted');

        try {
          const response = await fetch(bootstrap.web_frontdesk.api.librechat_package, {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
            },
            body: JSON.stringify({
              output_dir: outputDir,
              public_origin: librechatPackagePublicOriginInput.value.trim(),
            }),
          });
          const payload = await response.json();

          if (!response.ok) {
            throw new Error(payload.error?.message || 'LibreChat pilot export failed.');
          }

          librechatPackageJson.textContent = JSON.stringify(payload, null, 2);
          setLibreChatPackageStatus('LibreChat-first hosted pilot exported.', 'ok');
        } catch (error) {
          setLibreChatPackageStatus(
            error instanceof Error ? error.message : 'LibreChat pilot export failed.',
            'warn',
          );
        }
      }

      async function fetchWorkspaceCatalog() {
        const response = await fetch(bootstrap.web_frontdesk.api.workspace_catalog);
        if (!response.ok) {
          throw new Error('Workspace catalog request failed with status ' + response.status);
        }

        renderWorkspaceCatalog(await response.json());
      }

      async function fetchSessionLedger() {
        const response = await fetch(
          bootstrap.web_frontdesk.api.session_ledger + '?limit=' + encodeURIComponent(String(state.sessionsLimit)),
        );
        if (!response.ok) {
          throw new Error('Session ledger request failed with status ' + response.status);
        }

        renderSessionLedger(await response.json());
      }

      function setResumeStatus(message, tone = 'muted') {
        resumeStatus.textContent = message;
        resumeStatus.dataset.tone = tone;
      }

      function setLogsStatus(message, tone = 'muted') {
        logsStatus.textContent = message;
        logsStatus.dataset.tone = tone;
      }

      async function submitResume() {
        const sessionId = resumeSessionInput.value.trim();
        if (!sessionId) {
          setResumeStatus('Resume requires a session id.', 'warn');
          return;
        }

        setResumeStatus('Resuming Hermes session...', 'muted');
        try {
          const response = await fetch(bootstrap.web_frontdesk.api.resume, {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
            },
            body: JSON.stringify({
              session_id: sessionId,
            }),
          });
          const payload = await response.json();

          if (!response.ok) {
            throw new Error(payload.error?.message || 'Resume request failed.');
          }

          resumeOutput.textContent = JSON.stringify(payload, null, 2);
          setResumeStatus('Session resumed.', 'ok');
        } catch (error) {
          setResumeStatus(error instanceof Error ? error.message : 'Resume failed.', 'warn');
        }
      }

      async function loadLogs() {
        const params = new URLSearchParams();
        const logName = logNameInput.value.trim();
        const lines = logLinesInput.value.trim();

        if (logName) {
          params.set('log_name', logName);
        }
        if (lines) {
          params.set('lines', lines);
        }

        setLogsStatus('Loading logs...', 'muted');
        try {
          const response = await fetch(bootstrap.web_frontdesk.api.logs + '?' + params.toString());
          const payload = await response.json();

          if (!response.ok) {
            throw new Error(payload.error?.message || 'Logs request failed.');
          }

          logsOutput.textContent = JSON.stringify(payload, null, 2);
          setLogsStatus('Logs updated.', 'ok');
        } catch (error) {
          setLogsStatus(error instanceof Error ? error.message : 'Logs failed.', 'warn');
        }
      }

      async function refreshAll() {
        await Promise.all([
          fetchDashboard(),
          fetchSessions(),
          fetchHostedFriendlySurface(),
          fetchWorkspaceCatalog(),
          fetchSessionLedger(),
        ]);
      }

      async function submitWorkspaceAction(action) {
        const projectId = workspaceProjectInput.value.trim();
        const workspacePath = workspacePathInput.value.trim() || bootstrap.web_frontdesk.defaults.workspace_path;

        state.workspacePath = workspacePath;

        if (action === 'inspect') {
          setWorkspaceStatus('Inspecting workspace...', 'muted');
          try {
            await refreshAll();
            setWorkspaceStatus('Workspace inspection updated.', 'ok');
          } catch (error) {
            setWorkspaceStatus(error instanceof Error ? error.message : 'Workspace inspection failed.', 'warn');
          }
          return;
        }

        const endpoint = action === 'bind'
          ? bootstrap.web_frontdesk.api.workspace_bind
          : action === 'activate'
            ? bootstrap.web_frontdesk.api.workspace_activate
            : bootstrap.web_frontdesk.api.workspace_archive;

        setWorkspaceStatus(
          action === 'bind'
            ? 'Writing workspace binding...'
            : action === 'activate'
              ? 'Activating workspace binding...'
              : 'Archiving workspace binding...',
          'muted',
        );

        try {
          const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
            },
            body: JSON.stringify({
              project_id: projectId,
              workspace_path: workspacePath,
              label: workspaceLabelInput.value,
              entry_command: workspaceEntryCommandInput.value,
              manifest_command: workspaceManifestCommandInput.value,
              entry_url: workspaceEntryUrlInput.value,
            }),
          });
          const payload = await response.json();

          if (!response.ok) {
            throw new Error(payload.error?.message || 'Workspace registry request failed.');
          }

          renderWorkspaceCatalog(payload);
          await refreshAll();
          setWorkspaceStatus(
            action === 'bind'
              ? 'Workspace binding saved.'
              : action === 'activate'
                ? 'Workspace binding activated.'
                : 'Workspace binding archived.',
            'ok',
          );
        } catch (error) {
          setWorkspaceStatus(
            error instanceof Error ? error.message : 'Workspace registry request failed.',
            'warn',
          );
        }
      }

      async function submitAsk(dryRun) {
        setButtonBusy(true);
        setAskStatus(dryRun ? 'Previewing handoff...' : 'Calling Hermes through OPL ask...', 'muted');

        try {
          const response = await fetch(bootstrap.web_frontdesk.api.ask, {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
            },
            body: JSON.stringify({
              dry_run: dryRun,
              goal: document.getElementById('goal').value,
              intent: document.getElementById('intent').value,
              target: document.getElementById('target').value,
              preferred_family: document.getElementById('preferred-family').value,
              request_kind: document.getElementById('request-kind').value,
              workspace_path: workspacePathInput.value.trim() || state.workspacePath,
            }),
          });
          const payload = await response.json();

          if (!response.ok) {
            throw new Error(payload.error?.message || 'Ask request failed.');
          }

          renderAskPayload(payload);
          setAskStatus(dryRun ? 'Preview updated.' : 'Ask completed through Hermes.', 'ok');
        } catch (error) {
          setAskStatus(error instanceof Error ? error.message : 'Unknown ask failure.', 'warn');
        } finally {
          setButtonBusy(false);
        }
      }

      document.getElementById('workspace-form').addEventListener('submit', async (event) => {
        event.preventDefault();
        await submitWorkspaceAction('inspect');
      });

      document.getElementById('resume-form').addEventListener('submit', (event) => {
        event.preventDefault();
        void submitResume();
      });

      document.getElementById('logs-form').addEventListener('submit', (event) => {
        event.preventDefault();
        void loadLogs();
      });

      document.getElementById('hosted-package-form').addEventListener('submit', (event) => {
        event.preventDefault();
        void exportHostedPackage();
      });

      document.getElementById('librechat-package-form').addEventListener('submit', (event) => {
        event.preventDefault();
        void exportLibreChatPackage();
      });

      sessionsList.addEventListener('click', (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) {
          return;
        }

        const button = target.closest('button[data-session-id]');
        if (!(button instanceof HTMLButtonElement)) {
          return;
        }

        resumeSessionInput.value = button.dataset.sessionId || '';
        setResumeStatus('Session id loaded from recent sessions.', 'ok');
      });

      previewButton.addEventListener('click', () => {
        void submitAsk(true);
      });
      askButton.addEventListener('click', () => {
        void submitAsk(false);
      });
      refreshButton.addEventListener('click', () => {
        void refreshAll().catch((error) => {
          runtimeNote.textContent = error instanceof Error ? error.message : 'Refresh failed.';
        });
      });
      workspaceBindButton.addEventListener('click', () => {
        void submitWorkspaceAction('bind');
      });
      workspaceActivateButton.addEventListener('click', () => {
        void submitWorkspaceAction('activate');
      });
      workspaceArchiveButton.addEventListener('click', () => {
        void submitWorkspaceAction('archive');
      });

      void Promise.all([refreshAll(), loadLogs()]).catch((error) => {
        runtimeNote.textContent = error instanceof Error ? error.message : 'Dashboard load failed.';
      });
      window.setInterval(() => {
        void refreshAll().catch(() => {
          // Keep the current UI state if background refresh fails.
        });
      }, 30000);
    </script>
  </body>
</html>`;
}

function writeApiError(response: ServerResponse<IncomingMessage>, error: unknown) {
  if (error instanceof GatewayContractError) {
    writeJson(response, error.exitCode === 2 ? 400 : 500, error.toJSON());
    return;
  }

  const unexpected = new GatewayContractError(
    'hermes_command_failed',
    error instanceof Error ? error.message : 'Unexpected web front-desk failure.',
  );
  writeJson(response, 500, unexpected.toJSON());
}

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse<IncomingMessage>,
  context: WebFrontDeskContext,
) {
  const method = request.method ?? 'GET';
  const url = new URL(request.url ?? '/', context.baseUrl);
  const routedPath = stripFrontDeskBasePath(url.pathname, context.basePath);

  try {
    if (routedPath === null) {
      writeJson(response, 404, {
        version: 'g2',
        error: {
          code: 'unknown_command',
          message: `Unknown web front-desk route: ${method} ${url.pathname}`,
          exit_code: 2,
        },
      });
      return;
    }

    if (method === 'GET' && routedPath === '/') {
      writeHtml(response, buildWebFrontDeskHtml(context));
      return;
    }

    if (method === 'GET' && routedPath === '/api/health') {
      writeJson(response, 200, buildFrontDeskHealth(context.contracts, { basePath: context.basePath }));
      return;
    }

    if (method === 'GET' && routedPath === '/api/frontdesk-manifest') {
      writeJson(response, 200, buildFrontDeskManifest(context.contracts, { basePath: context.basePath }));
      return;
    }

    if (method === 'GET' && routedPath === '/api/hosted-bundle') {
      writeJson(
        response,
        200,
        buildHostedPilotBundle(context.contracts, {
          host: context.host,
          port: context.port,
          workspacePath: context.workspacePath,
          sessionsLimit: context.sessionsLimit,
          basePath: context.basePath,
        }),
      );
      return;
    }

    if (method === 'POST' && routedPath === '/api/hosted-package') {
      writeJson(
        response,
        200,
        buildHostedPilotPackage(context.contracts, {
          ...normalizeHostedPackageInput((await readJsonBody(request)) as HostedPackageRequestBody),
          host: context.host,
          port: context.port,
          basePath: context.basePath,
          sessionsLimit: context.sessionsLimit,
        }),
      );
      return;
    }

    if (method === 'POST' && routedPath === '/api/librechat-package') {
      writeJson(
        response,
        200,
        buildLibreChatPilotPackage(context.contracts, {
          ...normalizeHostedPackageInput((await readJsonBody(request)) as HostedPackageRequestBody),
          host: context.host,
          port: context.port,
          basePath: context.basePath,
          sessionsLimit: context.sessionsLimit,
        }),
      );
      return;
    }

    if (method === 'GET' && routedPath === '/api/projects') {
      writeJson(response, 200, buildProjectsOverview(context.contracts));
      return;
    }

    if (method === 'GET' && routedPath === '/api/workspace-status') {
      writeJson(
        response,
        200,
        buildWorkspaceStatus({
          workspacePath: url.searchParams.get('path') ?? context.workspacePath,
        }),
      );
      return;
    }

    if (method === 'GET' && routedPath === '/api/workspace-catalog') {
      writeJson(response, 200, buildWorkspaceCatalog(context.contracts));
      return;
    }

    if (method === 'GET' && routedPath === '/api/domain-manifests') {
      writeJson(response, 200, buildDomainManifestCatalog(context.contracts));
      return;
    }

    if (method === 'POST' && routedPath === '/api/workspace-bind') {
      writeJson(response, 200, bindWorkspace(context.contracts, normalizeWorkspaceRegistryInput(await readJsonBody(request))));
      return;
    }

    if (method === 'POST' && routedPath === '/api/workspace-activate') {
      writeJson(
        response,
        200,
        activateWorkspaceBinding(context.contracts, normalizeWorkspaceRegistryInput(await readJsonBody(request))),
      );
      return;
    }

    if (method === 'POST' && routedPath === '/api/workspace-archive') {
      writeJson(
        response,
        200,
        archiveWorkspaceBinding(context.contracts, normalizeWorkspaceRegistryInput(await readJsonBody(request))),
      );
      return;
    }

    if (method === 'GET' && routedPath === '/api/runtime-status') {
      writeJson(
        response,
        200,
        buildRuntimeStatus({
          sessionsLimit: parsePositiveIntegerOrDefault(url.searchParams.get('limit'), context.sessionsLimit),
        }),
      );
      return;
    }

    if (method === 'GET' && routedPath === '/api/session-ledger') {
      writeJson(
        response,
        200,
        buildSessionLedger(parsePositiveIntegerOptional(url.searchParams.get('limit')) ?? context.sessionsLimit),
      );
      return;
    }

    if (method === 'GET' && routedPath === '/api/dashboard') {
      writeJson(
        response,
        200,
        buildFrontDeskDashboard(context.contracts, {
          workspacePath: url.searchParams.get('path') ?? context.workspacePath,
          sessionsLimit: parsePositiveIntegerOrDefault(
            url.searchParams.get('sessions-limit'),
            context.sessionsLimit,
          ),
          basePath: context.basePath,
        }),
      );
      return;
    }

    if (method === 'POST' && routedPath === '/api/ask') {
      const body = (await readJsonBody(request)) as AskRequestBody;
      writeJson(response, 200, runProductEntryAsk(normalizeAskInput(body), context.contracts));
      return;
    }

    if (method === 'POST' && routedPath === '/api/handoff-envelope') {
      const body = (await readJsonBody(request)) as AskRequestBody;
      writeJson(response, 200, buildProductEntryHandoffEnvelope(normalizeAskInput(body), context.contracts));
      return;
    }

    if (method === 'GET' && routedPath === '/api/sessions') {
      writeJson(
        response,
        200,
        runProductEntrySessions({
          limit: parsePositiveIntegerOptional(url.searchParams.get('limit')) ?? context.sessionsLimit,
          source: normalizeOptionalString(url.searchParams.get('source')),
        }),
      );
      return;
    }

    if (method === 'POST' && routedPath === '/api/resume') {
      const body = (await readJsonBody(request)) as ResumeRequestBody;
      writeJson(response, 200, runProductEntryResume(normalizeResumeSessionId(body)));
      return;
    }

    if (method === 'GET' && routedPath === '/api/logs') {
      writeJson(
        response,
        200,
        runProductEntryLogs({
          logName: normalizeOptionalString(url.searchParams.get('log_name')),
          lines: parsePositiveIntegerOptional(url.searchParams.get('lines')),
          since: normalizeOptionalString(url.searchParams.get('since')),
          level: normalizeOptionalString(url.searchParams.get('level')),
          component: normalizeOptionalString(url.searchParams.get('component')),
          sessionId:
            normalizeOptionalString(url.searchParams.get('session_id'))
            ?? normalizeOptionalString(url.searchParams.get('session')),
        }),
      );
      return;
    }

    writeJson(response, 404, {
      version: 'g2',
      error: {
        code: 'unknown_command',
        message: `Unknown web front-desk route: ${method} ${url.pathname}`,
        exit_code: 2,
      },
    });
  } catch (error) {
    writeApiError(response, error);
  }
}

export async function startWebFrontDeskServer(
  contracts: GatewayContracts,
  options: WebFrontDeskOptions = {},
) {
  const requestedHost = options.host ?? '127.0.0.1';
  const requestedPort = options.port ?? 8787;
  const workspacePath = options.workspacePath ?? process.cwd();
  const sessionsLimit = options.sessionsLimit ?? 5;
  const basePath = options.basePath ?? '';
  let actualPort = requestedPort;

  const listening = await new Promise<{ server: Server; port: number }>((resolve, reject) => {
    const server = createServer((request, response) => {
      const baseUrl = `http://${normalizeBaseUrlHost(requestedHost)}:${actualPort}`;
      const context: WebFrontDeskContext = {
        contracts,
        host: requestedHost,
        port: actualPort,
        baseUrl,
        entryUrl: buildFrontDeskEntryUrl(baseUrl, basePath),
        basePath,
        workspacePath,
        sessionsLimit,
      };

      void handleRequest(request, response, context);
    });

    server.once('error', reject);

    server.listen(requestedPort, requestedHost, () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(
          new GatewayContractError(
            'hermes_command_failed',
            'Web front-desk server did not expose a usable TCP address.',
          ),
        );
        return;
      }

      actualPort = address.port;
      resolve({
        server,
        port: address.port,
      });
    });
  });

  const resolvedPort = listening.port;
  const baseUrl = `http://${normalizeBaseUrlHost(requestedHost)}:${resolvedPort}`;
  const context: WebFrontDeskContext = {
    contracts,
    host: requestedHost,
    port: resolvedPort,
    baseUrl,
    entryUrl: buildFrontDeskEntryUrl(baseUrl, basePath),
    basePath,
    workspacePath,
    sessionsLimit,
  };

  return {
    server: listening.server,
    startupPayload: buildStartupPayload(context),
  };
}

export function attachWebFrontDeskShutdown(server: Server) {
  let closing = false;

  const shutdown = () => {
    if (closing) {
      return;
    }
    closing = true;

    server.close(() => {
      process.exit(0);
    });
  };

  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);

  return shutdown;
}
