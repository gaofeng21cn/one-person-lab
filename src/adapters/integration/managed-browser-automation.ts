import { resolveDependencyReleaseSync } from './dependency-release-resolution-sync.ts';
import { compareDependencyVersions, type ResolvedDependencyRelease } from './dependency-release-resolution.ts';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { coerce, gte } from 'semver';

import { readMcpServerConfigFromToml } from '../../kernel/codex-toml-document.ts';
import { FrameworkContractError } from '../../kernel/contract-validation.ts';
import { resolveOplStatePaths } from '../../kernel/runtime-state-paths.ts';
import { probeStdioMcpServer } from './managed-mcp-probe.ts';
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
      package_version: typeof runtime?.package_version === 'string' ? runtime.package_version : '',
      package_integrity: typeof runtime?.package_integrity === 'string' ? runtime.package_integrity : '',
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
      impact: 'Repairs only the managed Playwright MCP entry in the existing Codex registry.',
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
    const managed = path.join(resolveOplStatePaths().state_dir, 'managed-browser-automation', 'runtime', 'node_modules', '@playwright', 'mcp');
    if (fs.existsSync(path.join(managed, lock.runtime.entrypoint))) return managed;
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
  const config = readMcpServerConfigFromToml(text, input.serverId);
  if (!config.present) return { registered: false, enabled: false };
  return {
    registered: config.command === input.command && config.args.join('\0') === input.args.join('\0'),
    enabled: config.enabled,
  };
}

async function probeMcp(input: {
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
  const probe = await probeStdioMcpServer({
    command: input.nodeExecutable,
    args: [input.entrypoint, ...input.args],
    protocolVersion: input.protocolVersion,
    timeoutMs: 8000,
  });
  return {
    initialize_ok: probe.initialize_ok,
    protocol_version: probe.protocol_version,
    server_name: probe.server_name,
    server_version: probe.server_version,
    observed_tools: probe.observed_tools,
    error: probe.initialize_ok && probe.observed_tools.length > 0
      ? null
      : probe.error || 'Playwright MCP probe failed.',
  };
}

export async function inspectManagedBrowserAutomation(
  options: { runExternalChecks?: boolean } = {},
): Promise<ManagedBrowserAutomationInspection> {
  const lock = readManagedBrowserAutomationLock();
  const nodeExecutable = resolveNodeExecutable();
  const nodeVersion = process.env.OPL_PLAYWRIGHT_MCP_NODE_VERSION?.trim() || process.versions.node;
  const currentNode = coerce(nodeVersion);
  const minimumNode = coerce(lock.runtime.node_minimum_version);
  const nodeSupported = Boolean(currentNode && minimumNode && gte(currentNode, minimumNode));
  const packageRoot = resolvePackageRoot(lock);
  const packageVersion = readPackageVersion(packageRoot);
  const entrypoint = packageRoot ? path.join(packageRoot, lock.runtime.entrypoint) : null;
  const packageIdentityVerified = Boolean(coerce(packageVersion ?? ''))
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
    ? await probeMcp({
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
;
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
    version: packageVersion ?? lock.runtime.package_version,
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

export async function planManagedBrowserAutomationUpdate(options: {
  resolveRelease?: () => ResolvedDependencyRelease;
} = {}) {
  const before = await inspectManagedBrowserAutomation({ runExternalChecks: false });
  if (before.status === 'unsupported_runtime') return { before, target: null, update_available: false };
  // An explicit operator root is an external carrier and is never auto-replaced.
  if (process.env.OPL_PLAYWRIGHT_MCP_PACKAGE_ROOT?.trim()) return { before, target: null, update_available: false };
  const target = options.resolveRelease?.() ?? resolveDependencyReleaseSync('playwright-mcp', { verifyArchive: false });
  return { before, target, update_available: !before.installed
    || compareDependencyVersions(before.runtime.package_version ?? '', target.version) < 0 };
}

export async function reconcileManagedBrowserAutomation(actionId: ManagedBrowserAutomationActionId, options: {
  target?: ResolvedDependencyRelease; refreshLatest?: boolean;
} = {}): Promise<ManagedBrowserAutomationInspection> {
  if (actionId === 'settings_recheck_browser_automation') return await inspectManagedBrowserAutomation();
  let before = await inspectManagedBrowserAutomation({ runExternalChecks: false });
  const target = options.target ?? (options.refreshLatest ? (await planManagedBrowserAutomationUpdate()).target : null);
  if (target && !process.env.OPL_PLAYWRIGHT_MCP_PACKAGE_ROOT?.trim()
    && (!before.installed || compareDependencyVersions(before.runtime.package_version ?? '', target.version) < 0)) {
    const prefix = path.join(resolveOplStatePaths().state_dir, 'managed-browser-automation', 'runtime');
    fs.mkdirSync(prefix, { recursive: true });
    const installed = spawnSync('npm', ['install', '--prefix', prefix, `@playwright/mcp@${target.version}`, '--no-audit', '--no-fund'], {
      encoding: 'utf8', stdio: 'pipe', timeout: 300_000,
    });
    if (installed.status !== 0) throw new Error(installed.stderr || 'Managed Playwright MCP installation failed.');
    before = await inspectManagedBrowserAutomation({ runExternalChecks: false });
    if (before.runtime.package_version !== target.version) throw new Error('Managed Playwright MCP version verification failed.');
  }
  if (!before.installed || !before.runtime.entrypoint) return before;
  registerOplManagedMcpServer({
    configPath: before.mcp.config_path,
    serverId: before.mcp.server_id,
    command: before.runtime.node_executable,
    args: before.mcp.args,
    enabled: true,
  });
  return await inspectManagedBrowserAutomation();
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
    inspect: async (input?: { runExternalChecks?: boolean }) => await inspectManagedBrowserAutomation({
      runExternalChecks: input?.runExternalChecks,
    }) as unknown as Record<string, unknown>,
    reconcile: async (input: { action_id: string }) => {
      if (!MANAGED_BROWSER_AUTOMATION_ACTION_IDS.includes(input.action_id as ManagedBrowserAutomationActionId)) {
        throw new FrameworkContractError('cli_usage_error', `Unknown Browser Automation action: ${input.action_id}.`, {
          action_id: input.action_id,
        });
      }
      return await reconcileManagedBrowserAutomation(input.action_id as ManagedBrowserAutomationActionId) as unknown as Record<string, unknown>;
    },
    dispose: () => undefined,
  });
}
