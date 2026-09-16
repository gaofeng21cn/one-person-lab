import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { coerce, gte } from 'semver';

import { FrameworkContractError } from '../../kernel/contract-validation.ts';
import { resolveOplStatePaths } from '../../kernel/runtime-state-paths.ts';
import { registerOplManagedMcpServer } from './system-installation/codex-plugin-registry.ts';

const LOCK_PATH = fileURLToPath(new URL(
  '../../../contracts/opl-framework/managed-browser-automation.json',
  import.meta.url,
));
const require = createRequire(import.meta.url);

export const MANAGED_BROWSER_AUTOMATION_ACTION_IDS = [
  'settings_recheck_browser_automation',
  'settings_repair_browser_automation',
] as const;

export type ManagedBrowserAutomationActionId = typeof MANAGED_BROWSER_AUTOMATION_ACTION_IDS[number];
type JsonRecord = Record<string, unknown>;

export type ManagedBrowserAutomationLock = {
  schema: string;
  owner: string;
  product_policy_source_ref: string;
  product_policy_source_sha256: string;
  provider_id: string;
  product_name: string;
  runtime: {
    package_name: string;
    package_version: string;
    package_integrity: string;
    entrypoint: string;
    node_minimum_version: string;
    dependency_source_ref: string;
    carrier: string;
  };
  mcp: {
    server_id: string;
    args: string[];
    protocol_version: string;
    default_enabled: boolean;
    required_tools: string[];
  };
  browser: {
    mode: string;
    channel: string;
    host_browser_required_for_ready: boolean;
    host_browser_paths: string[];
    output_owner: string;
    existing_chrome_session_reuse: boolean;
    existing_chrome_session_followup: string;
    desktop_visual_fallback_provider: string;
  };
  degradation: JsonRecord;
  authority_boundary: JsonRecord;
  action_ids: string[];
};

export type ManagedBrowserAutomationInspection = {
  surface_kind: 'opl_managed_browser_automation_projection';
  provider_id: string;
  product_name: string;
  version: string;
  owner: string;
  source_ref: string;
  source_sha256: string;
  installed: boolean;
  registered: boolean;
  enabled: boolean;
  permission: 'not_required';
  ready: boolean;
  status: 'ready' | 'not_installed' | 'not_registered' | 'unsupported_runtime' | 'health_not_checked' | 'attention_required';
  available_actions: ManagedBrowserAutomationActionId[];
  runtime: {
    package_name: string;
    package_path: string | null;
    package_version: string | null;
    package_identity_verified: boolean;
    node_executable: string;
    node_version: string;
    node_supported: boolean;
    entrypoint: string | null;
    output_dir: string;
  };
  mcp: {
    server_id: string;
    config_path: string;
    command: string;
    args: string[];
    registered: boolean;
    enabled: boolean;
    initialize_ok: boolean | null;
    protocol_version: string | null;
    server_name: string | null;
    server_version: string | null;
    required_tools: string[];
    observed_tools: string[];
    tools_exact: boolean | null;
    error: string | null;
  };
  browser: {
    mode: string;
    launch_probe: 'not_run_by_state_projection';
    channel: string;
    host_browser_installed: boolean;
    host_browser_executable: string | null;
    existing_chrome_session_reuse: false;
    desktop_visual_fallback_provider: string;
  };
  health_ref: string;
  authority_boundary: {
    lifecycle_owner: 'one-person-lab';
    registry_writer: 'existing_codex_mcp_registry_writer';
    read_does_not_mutate: true;
    provider_failure_blocks_plain_codex: false;
    provider_failure_blocks_kimi_cu: false;
    can_claim_app_release_ready: false;
  };
};

function readJson(filePath: string): JsonRecord {
  const parsed: unknown = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new FrameworkContractError('contract_shape_invalid', `Expected JSON object: ${filePath}.`, {
      file_path: filePath,
    });
  }
  return parsed as JsonRecord;
}

function requireString(value: unknown, label: string) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new FrameworkContractError('contract_shape_invalid', `Managed Browser Automation lock field ${label} is invalid.`, {
      lock_path: LOCK_PATH,
      field: label,
    });
  }
  return value.trim();
}

function requireStringArray(value: unknown, label: string) {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string' || entry.trim() === '')) {
    throw new FrameworkContractError('contract_shape_invalid', `Managed Browser Automation lock field ${label} is invalid.`, {
      lock_path: LOCK_PATH,
      field: label,
    });
  }
  return value.map((entry) => (entry as string).trim());
}

export function readManagedBrowserAutomationLock(): ManagedBrowserAutomationLock {
  const raw = readJson(LOCK_PATH);
  const runtime = raw.runtime as JsonRecord;
  const mcp = raw.mcp as JsonRecord;
  const browser = raw.browser as JsonRecord;
  return {
    schema: requireString(raw.schema, 'schema'),
    owner: requireString(raw.owner, 'owner'),
    product_policy_source_ref: requireString(raw.product_policy_source_ref, 'product_policy_source_ref'),
    product_policy_source_sha256: requireString(raw.product_policy_source_sha256, 'product_policy_source_sha256'),
    provider_id: requireString(raw.provider_id, 'provider_id'),
    product_name: requireString(raw.product_name, 'product_name'),
    runtime: {
      package_name: requireString(runtime?.package_name, 'runtime.package_name'),
      package_version: requireString(runtime?.package_version, 'runtime.package_version'),
      package_integrity: requireString(runtime?.package_integrity, 'runtime.package_integrity'),
      entrypoint: requireString(runtime?.entrypoint, 'runtime.entrypoint'),
      node_minimum_version: requireString(runtime?.node_minimum_version, 'runtime.node_minimum_version'),
      dependency_source_ref: requireString(runtime?.dependency_source_ref, 'runtime.dependency_source_ref'),
      carrier: requireString(runtime?.carrier, 'runtime.carrier'),
    },
    mcp: {
      server_id: requireString(mcp?.server_id, 'mcp.server_id'),
      args: requireStringArray(mcp?.args, 'mcp.args'),
      protocol_version: requireString(mcp?.protocol_version, 'mcp.protocol_version'),
      default_enabled: mcp?.default_enabled === true,
      required_tools: requireStringArray(mcp?.required_tools, 'mcp.required_tools'),
    },
    browser: {
      mode: requireString(browser?.mode, 'browser.mode'),
      channel: requireString(browser?.channel, 'browser.channel'),
      host_browser_required_for_ready: browser?.host_browser_required_for_ready === true,
      host_browser_paths: requireStringArray(browser?.host_browser_paths, 'browser.host_browser_paths'),
      output_owner: requireString(browser?.output_owner, 'browser.output_owner'),
      existing_chrome_session_reuse: browser?.existing_chrome_session_reuse === true,
      existing_chrome_session_followup: requireString(
        browser?.existing_chrome_session_followup,
        'browser.existing_chrome_session_followup',
      ),
      desktop_visual_fallback_provider: requireString(
        browser?.desktop_visual_fallback_provider,
        'browser.desktop_visual_fallback_provider',
      ),
    },
    degradation: raw.degradation && typeof raw.degradation === 'object'
      ? raw.degradation as JsonRecord
      : {},
    authority_boundary: raw.authority_boundary && typeof raw.authority_boundary === 'object'
      ? raw.authority_boundary as JsonRecord
      : {},
    action_ids: requireStringArray(raw.action_ids, 'action_ids'),
  };
}

export function buildManagedBrowserAutomationActionCatalog() {
  return [
    {
      action_id: 'settings_recheck_browser_automation',
      label: 'Recheck Browser Automation',
      surface: 'opl app action execute' as const,
      delegated_surface: 'Playwright MCP initialize + tools/list',
      payload_fields: [],
      mutates: 'none_read_only',
      dry_run_supported: true,
      confirmation_required: false,
      danger_level: 'none',
      impact: 'Reads the pinned Playwright MCP package, registration, and tool handshake without launching a browser.',
      follow_up_action_ids: [],
    },
    {
      action_id: 'settings_repair_browser_automation',
      label: 'Repair Browser Automation',
      surface: 'opl app action execute' as const,
      delegated_surface: 'OPL managed Playwright MCP registration reconcile',
      payload_fields: [],
      mutates: 'opl_managed_codex_mcp_registration',
      dry_run_supported: true,
      confirmation_required: false,
      danger_level: 'low',
      impact: 'Repairs only the pinned Playwright MCP entry in the existing Codex registry.',
      follow_up_action_ids: ['settings_recheck_browser_automation'],
      verify_action_id: 'settings_recheck_browser_automation',
    },
  ];
}

function resolveCodexConfigPath() {
  const home = process.env.HOME?.trim() || os.homedir();
  const codexHome = process.env.CODEX_HOME?.trim() || path.join(home, '.codex');
  return path.join(codexHome, 'config.toml');
}

function resolveNodeExecutable() {
  return process.env.OPL_PLAYWRIGHT_MCP_NODE_PATH?.trim() || process.execPath;
}

function resolvePackageRoot(lock: ManagedBrowserAutomationLock) {
  const explicit = process.env.OPL_PLAYWRIGHT_MCP_PACKAGE_ROOT?.trim();
  if (explicit) return path.resolve(explicit);
  try {
    return path.dirname(require.resolve(`${lock.runtime.package_name}/package.json`));
  } catch {
    return null;
  }
}

function resolveOutputDir() {
  const explicit = process.env.OPL_PLAYWRIGHT_MCP_OUTPUT_DIR?.trim();
  if (explicit) return path.resolve(explicit);
  return path.join(resolveOplStatePaths().state_dir, 'managed-browser-automation', 'output');
}

function resolveHostBrowserExecutable(lock: ManagedBrowserAutomationLock) {
  const explicit = process.env.OPL_PLAYWRIGHT_MCP_BROWSER_PATH?.trim();
  if (explicit) return fs.existsSync(explicit) ? path.resolve(explicit) : null;
  return lock.browser.host_browser_paths.find((candidate) => fs.existsSync(candidate)) ?? null;
}

function runtimeArgs(
  lock: ManagedBrowserAutomationLock,
  outputDir: string,
  hostBrowserExecutable: string | null,
) {
  // System Chrome clones its signed app bundle on every macOS launch so it
  // can survive auto-updates. A killed automation process cannot run the
  // destructor that starts clone cleanup (Chromium crbug.com/379125944).
  // Scope the opt-out to automated system Chrome; ordinary Chrome is untouched.
  const macChromeConfig = process.platform === 'darwin'
    && hostBrowserExecutable
    && /^Google Chrome(?: Canary)?$/.test(path.basename(hostBrowserExecutable))
    ? fileURLToPath(new URL('../../../contracts/opl-framework/playwright-macos.json', import.meta.url))
    : null;
  return [
    ...lock.mcp.args,
    ...(macChromeConfig ? ['--config', macChromeConfig] : []),
    ...(hostBrowserExecutable ? ['--executable-path', hostBrowserExecutable] : []),
    '--output-dir',
    outputDir,
  ];
}

function readPackageVersion(packageRoot: string | null) {
  if (!packageRoot) return null;
  try {
    const manifest = readJson(path.join(packageRoot, 'package.json'));
    return typeof manifest.version === 'string' ? manifest.version : null;
  } catch {
    return null;
  }
}

function readMcpRegistration(input: {
  configPath: string;
  serverId: string;
  command: string;
  args: string[];
}) {
  let text = '';
  try {
    text = fs.readFileSync(input.configPath, 'utf8');
  } catch {
    return { registered: false, enabled: false };
  }
  const headers = [`[mcp_servers.${input.serverId}]`, `[mcp_servers."${input.serverId}"]`];
  const header = headers.find((candidate) => text.includes(candidate));
  if (!header) return { registered: false, enabled: false };
  const start = text.indexOf(header);
  const next = text.slice(start + header.length).search(/\n\[/);
  const body = text.slice(start, next < 0 ? undefined : start + header.length + next);
  const command = body.match(/\ncommand\s*=\s*"([^"]+)"/)?.[1] ?? null;
  const args = body.match(/\nargs\s*=\s*\[([^\]]*)\]/)?.[1]
    ?.split(',')
    .map((entry) => entry.trim().replace(/^"|"$/g, ''))
    .filter(Boolean) ?? [];
  const enabledValue = body.match(/\nenabled\s*=\s*(true|false)/)?.[1];
  return {
    registered: command === input.command && args.join('\0') === input.args.join('\0'),
    enabled: enabledValue ? enabledValue === 'true' : true,
  };
}

function probeMcp(input: {
  nodeExecutable: string;
  entrypoint: string;
  args: string[];
  protocolVersion: string;
}) {
  const fixtureTools = process.env.OPL_PLAYWRIGHT_MCP_TOOLS?.trim();
  if (fixtureTools) {
    return {
      initialize_ok: true,
      protocol_version: input.protocolVersion,
      server_name: 'Playwright',
      server_version: process.env.OPL_PLAYWRIGHT_MCP_SERVER_VERSION?.trim() || null,
      observed_tools: fixtureTools.split(',').map((entry) => entry.trim()).filter(Boolean),
      error: null,
    };
  }
  const request = [
    JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: input.protocolVersion,
        capabilities: {},
        clientInfo: { name: 'opl-framework', version: '0.3.5' },
      },
    }),
    JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} }),
    JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }),
  ].join('\n') + '\n';
  const result = spawnSync(input.nodeExecutable, [input.entrypoint, ...input.args], {
    input: request,
    encoding: 'utf8',
    timeout: 8000,
  });
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  let initializeOk = false;
  let protocolVersion: string | null = null;
  let serverName: string | null = null;
  let serverVersion: string | null = null;
  const observedTools: string[] = [];
  for (const line of output.split(/\r?\n/)) {
    try {
      const frame = JSON.parse(line) as JsonRecord;
      const response = frame.result as JsonRecord | undefined;
      if (frame.id === 1 && response) {
        initializeOk = true;
        protocolVersion = typeof response.protocolVersion === 'string' ? response.protocolVersion : null;
        const serverInfo = response.serverInfo as JsonRecord | undefined;
        serverName = typeof serverInfo?.name === 'string' ? serverInfo.name : null;
        serverVersion = typeof serverInfo?.version === 'string' ? serverInfo.version : null;
      }
      if (frame.id === 2 && Array.isArray(response?.tools)) {
        for (const tool of response.tools) {
          if (tool && typeof tool === 'object' && typeof (tool as JsonRecord).name === 'string') {
            observedTools.push((tool as JsonRecord).name as string);
          }
        }
      }
    } catch {
      // The package can emit diagnostics beside JSON-RPC frames.
    }
  }
  const spawnError = result.error instanceof Error ? result.error.message : null;
  return {
    initialize_ok: initializeOk,
    protocol_version: protocolVersion,
    server_name: serverName,
    server_version: serverVersion,
    observed_tools: [...new Set(observedTools)],
    error: initializeOk && observedTools.length > 0
      ? null
      : spawnError || output.trim() || `Playwright MCP exited with status ${result.status ?? 'unknown'}.`,
  };
}

export function inspectManagedBrowserAutomation(
  options: { runExternalChecks?: boolean } = {},
): ManagedBrowserAutomationInspection {
  const lock = readManagedBrowserAutomationLock();
  const nodeExecutable = resolveNodeExecutable();
  const nodeVersion = process.env.OPL_PLAYWRIGHT_MCP_NODE_VERSION?.trim() || process.versions.node;
  const currentNode = coerce(nodeVersion);
  const minimumNode = coerce(lock.runtime.node_minimum_version);
  const nodeSupported = Boolean(currentNode && minimumNode && gte(currentNode, minimumNode));
  const packageRoot = resolvePackageRoot(lock);
  const packageVersion = readPackageVersion(packageRoot);
  const entrypoint = packageRoot ? path.join(packageRoot, lock.runtime.entrypoint) : null;
  const packageIdentityVerified = packageVersion === lock.runtime.package_version
    && Boolean(entrypoint && fs.existsSync(entrypoint));
  const outputDir = resolveOutputDir();
  const hostBrowserExecutable = resolveHostBrowserExecutable(lock);
  const hostBrowserInstalled = Boolean(hostBrowserExecutable);
  const args = runtimeArgs(lock, outputDir, hostBrowserExecutable);
  const configPath = resolveCodexConfigPath();
  const registration = readMcpRegistration({
    configPath,
    serverId: lock.mcp.server_id,
    command: nodeExecutable,
    args: entrypoint ? [entrypoint, ...args] : args,
  });
  const installed = fs.existsSync(nodeExecutable) && nodeSupported && packageIdentityVerified;
  const registered = installed && registration.registered;
  const shouldProbe = options.runExternalChecks !== false;
  const health = shouldProbe && installed && entrypoint
    ? probeMcp({
      nodeExecutable,
      entrypoint,
      args,
      protocolVersion: lock.mcp.protocol_version,
    })
    : {
      initialize_ok: false,
      protocol_version: null,
      server_name: null,
      server_version: null,
      observed_tools: [] as string[],
      error: null,
    };
  const toolsExact = health.observed_tools.length > 0
    && lock.mcp.required_tools.every((tool) => health.observed_tools.includes(tool))
    && health.observed_tools.every((tool) => lock.mcp.required_tools.includes(tool));
  const ready = installed
    && registered
    && registration.enabled
    && health.initialize_ok
    && health.protocol_version === lock.mcp.protocol_version
    && (!lock.browser.host_browser_required_for_ready || hostBrowserInstalled)
    && toolsExact;
  const status: ManagedBrowserAutomationInspection['status'] = !nodeSupported
    ? 'unsupported_runtime'
    : !installed
      ? 'not_installed'
      : !registered
        ? 'not_registered'
        : !shouldProbe
          ? 'health_not_checked'
          : ready
            ? 'ready'
            : 'attention_required';
  return {
    surface_kind: 'opl_managed_browser_automation_projection',
    provider_id: lock.provider_id,
    product_name: lock.product_name,
    version: lock.runtime.package_version,
    owner: lock.owner,
    source_ref: lock.product_policy_source_ref,
    source_sha256: lock.product_policy_source_sha256,
    installed,
    registered,
    enabled: registered && registration.enabled,
    permission: 'not_required',
    ready,
    status,
    available_actions: [...MANAGED_BROWSER_AUTOMATION_ACTION_IDS],
    runtime: {
      package_name: lock.runtime.package_name,
      package_path: packageRoot,
      package_version: packageVersion,
      package_identity_verified: packageIdentityVerified,
      node_executable: nodeExecutable,
      node_version: nodeVersion,
      node_supported: nodeSupported,
      entrypoint,
      output_dir: outputDir,
    },
    mcp: {
      server_id: lock.mcp.server_id,
      config_path: configPath,
      command: nodeExecutable,
      args: entrypoint ? [entrypoint, ...args] : args,
      registered: registration.registered,
      enabled: registration.enabled,
      initialize_ok: shouldProbe ? health.initialize_ok : null,
      protocol_version: health.protocol_version,
      server_name: health.server_name,
      server_version: health.server_version,
      required_tools: lock.mcp.required_tools,
      observed_tools: health.observed_tools,
      tools_exact: shouldProbe ? toolsExact : null,
      error: health.error,
    },
    browser: {
      mode: lock.browser.mode,
      launch_probe: 'not_run_by_state_projection',
      channel: lock.browser.channel,
      host_browser_installed: hostBrowserInstalled,
      host_browser_executable: hostBrowserExecutable,
      existing_chrome_session_reuse: false,
      desktop_visual_fallback_provider: lock.browser.desktop_visual_fallback_provider,
    },
    health_ref: `opl://managed-companions/${lock.provider_id}/health`,
    authority_boundary: {
      lifecycle_owner: 'one-person-lab',
      registry_writer: 'existing_codex_mcp_registry_writer',
      read_does_not_mutate: true,
      provider_failure_blocks_plain_codex: false,
      provider_failure_blocks_kimi_cu: false,
      can_claim_app_release_ready: false,
    },
  };
}

export function reconcileManagedBrowserAutomation(
  actionId: ManagedBrowserAutomationActionId,
): ManagedBrowserAutomationInspection {
  if (actionId === 'settings_recheck_browser_automation') return inspectManagedBrowserAutomation();
  const before = inspectManagedBrowserAutomation({ runExternalChecks: false });
  if (!before.installed || !before.runtime.entrypoint) return before;
  registerOplManagedMcpServer({
    configPath: before.mcp.config_path,
    serverId: before.mcp.server_id,
    command: before.runtime.node_executable,
    args: before.mcp.args,
    enabled: true,
  });
  return inspectManagedBrowserAutomation();
}

/**
 * Host-facing adapter for the Framework automation ABI. The carrier
 * implementation stays behind the ABI while the Cordis Host owns selection
 * and lifecycle.
 */
export function createManagedBrowserAutomationProvider() {
  const lock = readManagedBrowserAutomationLock();
  return Object.freeze({
    provider_id: lock.provider_id,
    automation_kind: 'browser_automation' as const,
    buildActionCatalog: () => buildManagedBrowserAutomationActionCatalog(),
    inspect: (input?: { runExternalChecks?: boolean }) => inspectManagedBrowserAutomation({
      runExternalChecks: input?.runExternalChecks,
    }) as unknown as Record<string, unknown>,
    reconcile: (input: { action_id: string }) => {
      if (!MANAGED_BROWSER_AUTOMATION_ACTION_IDS.includes(input.action_id as ManagedBrowserAutomationActionId)) {
        throw new FrameworkContractError('cli_usage_error', `Unknown Browser Automation action: ${input.action_id}.`, {
          action_id: input.action_id,
        });
      }
      return reconcileManagedBrowserAutomation(input.action_id as ManagedBrowserAutomationActionId) as unknown as Record<string, unknown>;
    },
    dispose: () => undefined,
  });
}
