import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { coerce, gte } from 'semver';

import { FrameworkContractError } from '../../kernel/contract-validation.ts';
import { registerOplManagedMcpServer } from './system-installation/codex-plugin-registry.ts';

const LOCK_PATH = fileURLToPath(new URL('../../../contracts/opl-framework/managed-computer-use.json', import.meta.url));

export const MANAGED_COMPUTER_USE_ACTION_IDS = [
  'settings_request_computer_use_permissions',
  'settings_recheck_computer_use',
  'settings_repair_computer_use',
  'settings_reinstall_computer_use',
] as const;

export type ManagedComputerUseActionId = typeof MANAGED_COMPUTER_USE_ACTION_IDS[number];

export function buildManagedComputerUseActionCatalog() {
  return [
    {
      action_id: 'settings_request_computer_use_permissions',
      label: 'Allow Computer Use permissions',
      surface: 'opl app action execute' as const,
      delegated_surface: 'KimiCU request-permissions',
      payload_fields: [],
      mutates: 'macos_tcc_permission_prompt',
      dry_run_supported: true,
      confirmation_required: false,
      danger_level: 'low',
      impact: 'Opens the macOS Accessibility and Screen Recording permission flow.',
      follow_up_action_ids: ['settings_recheck_computer_use'],
      verify_action_id: 'settings_recheck_computer_use',
    },
    {
      action_id: 'settings_recheck_computer_use',
      label: 'Recheck Computer Use',
      surface: 'opl app action execute' as const,
      delegated_surface: 'KimiCU service-status + xpc-ping + MCP tools/list',
      payload_fields: [],
      mutates: 'none_read_only',
      dry_run_supported: true,
      confirmation_required: false,
      danger_level: 'none',
      impact: 'Reads the managed bundle, service, permissions, and MCP toolset without changing them.',
      follow_up_action_ids: [],
    },
    {
      action_id: 'settings_repair_computer_use',
      label: 'Repair Computer Use',
      surface: 'opl app action execute' as const,
      delegated_surface: 'OPL managed KimiCU reconcile',
      payload_fields: [],
      mutates: 'opl_managed_kimi_cu_bundle_service_and_codex_mcp_registration',
      dry_run_supported: true,
      confirmation_required: false,
      danger_level: 'low',
      impact: 'Repairs the pinned managed companion without changing ordinary Codex state.',
      follow_up_action_ids: ['settings_request_computer_use_permissions', 'settings_recheck_computer_use'],
      verify_action_id: 'settings_recheck_computer_use',
    },
    {
      action_id: 'settings_reinstall_computer_use',
      label: 'Reinstall Computer Use',
      surface: 'opl app action execute' as const,
      delegated_surface: 'OPL managed KimiCU reinstall',
      payload_fields: [],
      mutates: 'opl_managed_kimi_cu_bundle_service_and_codex_mcp_registration',
      dry_run_supported: true,
      confirmation_required: true,
      danger_level: 'medium',
      impact: 'Replaces only the OPL-managed KimiCU bundle with the exact pinned version.',
      follow_up_action_ids: ['settings_request_computer_use_permissions', 'settings_recheck_computer_use'],
      verify_action_id: 'settings_recheck_computer_use',
    },
  ];
}

type JsonRecord = Record<string, unknown>;

export type ManagedComputerUseLock = {
  schema: string;
  owner: string;
  product_identity_source_ref: string;
  product_identity_source_sha256: string;
  provider_id: string;
  product_name: string;
  version: string;
  archive: {
    url: string;
    sha256: string;
    size_bytes: number;
    full_seed_relative_path: string;
  };
  platform: {
    os: string;
    minimum_version: string;
    architectures: string[];
  };
  bundle: {
    bundle_id: string;
    team_id: string;
    target_install_path: string;
    executable: string;
  };
  mcp: {
    server_id: string;
    args: string[];
    required_tools: string[];
    default_enabled: boolean;
  };
  health: {
    service_status_args: string[];
    xpc_ping_args: string[];
    permission_status_args: string[];
    mcp_handshake: string[];
  };
  permission_model: {
    required: string[];
    missing_state: string;
    ready_requires: string[];
  };
  distribution_parity: JsonRecord;
  action_ids: string[];
};

export type ManagedComputerUseInspection = {
  surface_kind: 'opl_managed_computer_use_projection';
  provider_id: string;
  product_name: string;
  version: string;
  owner: string;
  source_ref: string;
  source_sha256: string;
  platform: {
    current: string;
    current_version: string | null;
    supported: boolean;
    minimum_version: string;
    architectures: string[];
  };
  installed: boolean;
  registered: boolean;
  enabled: boolean;
  permission: 'granted' | 'required' | 'unknown' | 'unsupported';
  ready: boolean;
  status: 'ready' | 'permission_required' | 'not_installed' | 'not_registered' | 'unsupported_platform' | 'health_not_checked' | 'attention_required';
  available_actions: ManagedComputerUseActionId[];
  bundle: {
    path: string;
    executable: string;
    bundle_id: string | null;
    version: string | null;
    team_id: string | null;
    architecture: string | null;
    identity_verified: boolean;
  };
  mcp: {
    server_id: string;
    config_path: string;
    registered: boolean;
    enabled: boolean;
    required_tools: string[];
    observed_tools: string[];
    tools_exact: boolean | null;
  };
  service: {
    registered: boolean | null;
    xpc_ping: 'passed' | 'failed' | 'not_checked';
    output: string | null;
  };
  permissions: {
    accessibility: 'granted' | 'required' | 'unknown';
    screen_recording: 'granted' | 'required' | 'unknown';
  };
  health_ref: string;
  authority_boundary: {
    lifecycle_owner: 'one-person-lab';
    app_role: 'default_policy_projection_and_user_experience';
    read_does_not_mutate: true;
    missing_permission_does_not_block_plain_codex: true;
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
    throw new FrameworkContractError('contract_shape_invalid', `Managed Computer Use lock field ${label} is invalid.`, {
      lock_path: LOCK_PATH,
      field: label,
    });
  }
  return value.trim();
}

function requireStringArray(value: unknown, label: string) {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string' || entry.trim() === '')) {
    throw new FrameworkContractError('contract_shape_invalid', `Managed Computer Use lock field ${label} is invalid.`, {
      lock_path: LOCK_PATH,
      field: label,
    });
  }
  return value.map((entry) => (entry as string).trim());
}

export function readManagedComputerUseLock(): ManagedComputerUseLock {
  const raw = readJson(LOCK_PATH);
  const archive = raw.archive as JsonRecord;
  const platform = raw.platform as JsonRecord;
  const bundle = raw.bundle as JsonRecord;
  const mcp = raw.mcp as JsonRecord;
  const health = raw.health as JsonRecord;
  const permissionModel = raw.permission_model as JsonRecord;
  const lock: ManagedComputerUseLock = {
    schema: requireString(raw.schema, 'schema'),
    owner: requireString(raw.owner, 'owner'),
    product_identity_source_ref: requireString(raw.product_identity_source_ref, 'product_identity_source_ref'),
    product_identity_source_sha256: requireString(raw.product_identity_source_sha256, 'product_identity_source_sha256'),
    provider_id: requireString(raw.provider_id, 'provider_id'),
    product_name: requireString(raw.product_name, 'product_name'),
    version: requireString(raw.version, 'version'),
    archive: {
      url: requireString(archive?.url, 'archive.url'),
      sha256: requireString(archive?.sha256, 'archive.sha256'),
      size_bytes: Number(archive?.size_bytes),
      full_seed_relative_path: requireString(archive?.full_seed_relative_path, 'archive.full_seed_relative_path'),
    },
    platform: {
      os: requireString(platform?.os, 'platform.os'),
      minimum_version: requireString(platform?.minimum_version, 'platform.minimum_version'),
      architectures: requireStringArray(platform?.architectures, 'platform.architectures'),
    },
    bundle: {
      bundle_id: requireString(bundle?.bundle_id, 'bundle.bundle_id'),
      team_id: requireString(bundle?.team_id, 'bundle.team_id'),
      target_install_path: requireString(bundle?.target_install_path, 'bundle.target_install_path'),
      executable: requireString(bundle?.executable, 'bundle.executable'),
    },
    mcp: {
      server_id: requireString(mcp?.server_id, 'mcp.server_id'),
      args: requireStringArray(mcp?.args, 'mcp.args'),
      required_tools: requireStringArray(mcp?.required_tools, 'mcp.required_tools'),
      default_enabled: mcp?.default_enabled === true,
    },
    health: {
      service_status_args: requireStringArray(health?.service_status_args, 'health.service_status_args'),
      xpc_ping_args: requireStringArray(health?.xpc_ping_args, 'health.xpc_ping_args'),
      permission_status_args: requireStringArray(health?.permission_status_args, 'health.permission_status_args'),
      mcp_handshake: requireStringArray(health?.mcp_handshake, 'health.mcp_handshake'),
    },
    permission_model: {
      required: requireStringArray(permissionModel?.required, 'permission_model.required'),
      missing_state: requireString(permissionModel?.missing_state, 'permission_model.missing_state'),
      ready_requires: requireStringArray(permissionModel?.ready_requires, 'permission_model.ready_requires'),
    },
    distribution_parity: (raw.distribution_parity && typeof raw.distribution_parity === 'object'
      ? raw.distribution_parity
      : {}) as JsonRecord,
    action_ids: requireStringArray(raw.action_ids, 'action_ids'),
  };
  if (!Number.isSafeInteger(lock.archive.size_bytes) || lock.archive.size_bytes <= 0) {
    throw new FrameworkContractError('contract_shape_invalid', 'Managed Computer Use archive size is invalid.', {
      lock_path: LOCK_PATH,
    });
  }
  return lock;
}

function resolveCurrentPlatform() {
  return process.env.OPL_COMPUTER_USE_PLATFORM?.trim() || `${process.platform}-${process.arch}`;
}

function resolveInstallPath(lock: ManagedComputerUseLock) {
  return process.env.OPL_KIMI_CU_INSTALL_PATH?.trim() || lock.bundle.target_install_path;
}

function resolveExecutable(lock: ManagedComputerUseLock, installPath: string) {
  return process.env.OPL_KIMI_CU_EXECUTABLE_PATH?.trim()
    || path.join(installPath, 'Contents', 'MacOS', path.basename(lock.bundle.executable));
}

function resolveCodexConfigPath() {
  const home = process.env.HOME?.trim() || os.homedir();
  const codexHome = process.env.CODEX_HOME?.trim() || path.join(home, '.codex');
  return path.join(codexHome, 'config.toml');
}

function parsePlistValues(plistPath: string) {
  if (!fs.existsSync(plistPath)) return {};
  let text = '';
  try {
    text = fs.readFileSync(plistPath, 'utf8');
  } catch {
    try {
      text = execFileSync('/usr/bin/plutil', ['-convert', 'xml1', '-o', '-', '--', plistPath], { encoding: 'utf8' });
    } catch {
      return {};
    }
  }
  const value = (key: string) => {
    const match = text.match(new RegExp(`<key>${key}</key>\\s*<string>([^<]+)</string>`));
    return match?.[1]?.trim() || null;
  };
  return {
    bundle_id: value('CFBundleIdentifier'),
    version: value('CFBundleShortVersionString') || value('CFBundleVersion'),
  };
}

function runCommand(executable: string, args: string[]) {
  try {
    const result = spawnSync(executable, args, { encoding: 'utf8', timeout: 4000 });
    return {
      ok: result.status === 0,
      output: `${result.stdout ?? ''}${result.stderr ?? ''}`.trim() || null,
    };
  } catch (error) {
    return { ok: false, output: error instanceof Error ? error.message : String(error) };
  }
}

function readTeamId(bundlePath: string) {
  const result = runCommand('/usr/bin/codesign', ['-dv', '--verbose=4', bundlePath]);
  const match = result.output?.match(/TeamIdentifier=([^\s\n]+)/);
  return match?.[1] ?? null;
}

function readArchitecture(executable: string) {
  const result = runCommand('/usr/bin/file', [executable]);
  const output = result.output ?? '';
  if (output.includes('arm64')) return 'arm64';
  if (output.includes('x86_64')) return 'x86_64';
  return null;
}

function resolveMacosVersion(currentPlatform: string) {
  if (!['darwin-arm64', 'macos-arm64'].includes(currentPlatform)) return null;
  const configured = process.env.OPL_COMPUTER_USE_OS_VERSION?.trim();
  if (configured) return configured;
  return runCommand('/usr/bin/sw_vers', ['-productVersion']).output;
}

function macosVersionSupported(currentVersion: string | null, minimumVersion: string) {
  const current = currentVersion ? coerce(currentVersion) : null;
  const minimum = coerce(minimumVersion);
  return Boolean(current && minimum && gte(current, minimum));
}

function readMcpRegistration(lock: ManagedComputerUseLock, configPath: string) {
  let text = '';
  try {
    text = fs.readFileSync(configPath, 'utf8');
  } catch {
    return { registered: false, enabled: false };
  }
  const headers = [
    `[mcp_servers.${lock.mcp.server_id}]`,
    `[mcp_servers."${lock.mcp.server_id}"]`,
  ];
  const header = headers.find((candidate) => text.includes(candidate));
  if (!header) return { registered: false, enabled: false };
  const start = text.indexOf(header);
  if (start < 0) return { registered: false, enabled: false };
  const next = text.slice(start + header.length).search(/\n\[/);
  const body = text.slice(start, next < 0 ? undefined : start + header.length + next);
  const command = body.match(/\ncommand\s*=\s*"([^"]+)"/)?.[1] ?? null;
  const args = body.match(/\nargs\s*=\s*\[([^\]]*)\]/)?.[1]
    ?.split(',')
    .map((entry) => entry.trim().replace(/^"|"$/g, ''))
    .filter(Boolean) ?? [];
  const expectedExecutable = process.env.OPL_KIMI_CU_EXECUTABLE_PATH?.trim()
    || path.join(resolveInstallPath(lock), 'Contents', 'MacOS', path.basename(lock.bundle.executable));
  const enabledValue = body.match(/\nenabled\s*=\s*(true|false)/)?.[1];
  return {
    registered: command === expectedExecutable && args.join('\0') === lock.mcp.args.join('\0'),
    enabled: enabledValue ? enabledValue === 'true' : true,
  };
}

function observeMcpTools(lock: ManagedComputerUseLock, executable: string) {
  const fixture = process.env.OPL_KIMI_CU_MCP_TOOLS?.trim();
  if (fixture) return fixture.split(',').map((entry) => entry.trim()).filter(Boolean);
  if (!fs.existsSync(executable)) return [];
  const request = [
    JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'opl-framework', version: '0.3.5' } } }),
    JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} }),
    JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }),
  ].join('\n') + '\n';
  const result = spawnSync(executable, lock.mcp.args, { input: request, encoding: 'utf8', timeout: 5000 });
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  const tools: string[] = [];
  for (const line of output.split(/\r?\n/)) {
    try {
      const parsed = JSON.parse(line) as JsonRecord;
      const resultValue = parsed.result as JsonRecord | undefined;
      const list = resultValue?.tools;
      if (Array.isArray(list)) {
        for (const tool of list) {
          if (tool && typeof tool === 'object' && typeof (tool as JsonRecord).name === 'string') {
            tools.push((tool as JsonRecord).name as string);
          }
        }
      }
    } catch {
      // KimiCU may emit diagnostics beside JSON-RPC frames; ignore non-frames.
    }
  }
  return [...new Set(tools)];
}

function parsePermissionStatus(
  output: string | null,
  label: 'Accessibility' | 'Screen Recording',
  commandPassed: boolean,
): 'granted' | 'required' | 'unknown' {
  if (commandPassed) return 'granted';
  const line = output?.split(/\r?\n/).find((entry) => entry.toLowerCase().includes(label.toLowerCase()));
  if (!line) return 'unknown';
  if (
    line.includes('\u274c')
    || /not granted|missing|denied|failed|required/i.test(line)
  ) {
    return 'required';
  }
  if (line.includes('\u2705') || /granted|passed|ready|\bok\b/i.test(line)) return 'granted';
  return 'unknown';
}

export function inspectManagedComputerUse(options: { runExternalChecks?: boolean } = {}): ManagedComputerUseInspection {
  const lock = readManagedComputerUseLock();
  const currentPlatform = resolveCurrentPlatform();
  const currentVersion = resolveMacosVersion(currentPlatform);
  const supportedPlatform = ['darwin-arm64', 'macos-arm64'].includes(currentPlatform)
    && macosVersionSupported(currentVersion, lock.platform.minimum_version);
  const installPath = resolveInstallPath(lock);
  const executable = resolveExecutable(lock, installPath);
  const plist = parsePlistValues(path.join(installPath, 'Contents', 'Info.plist'));
  const bundleExists = fs.existsSync(installPath);
  const executableExists = fs.existsSync(executable);
  const teamId = process.env.OPL_KIMI_CU_TEAM_ID?.trim() || readTeamId(installPath);
  const architecture = process.env.OPL_KIMI_CU_ARCHITECTURE?.trim() || readArchitecture(executable);
  const identityVerified = bundleExists
    && plist.bundle_id === lock.bundle.bundle_id
    && plist.version === lock.version
    && teamId === lock.bundle.team_id
    && lock.platform.architectures.includes(architecture ?? '')
    && executableExists;
  const configPath = resolveCodexConfigPath();
  const mcpRegistration = readMcpRegistration(lock, configPath);
  const shouldProbe = options.runExternalChecks !== false;
  const service = shouldProbe && executableExists
    ? runCommand(executable, lock.health.service_status_args)
    : { ok: false, output: null };
  const xpc = shouldProbe && executableExists
    ? runCommand(executable, lock.health.xpc_ping_args)
    : { ok: false, output: null };
  const permissionStatus = shouldProbe && executableExists
    ? runCommand(executable, lock.health.permission_status_args)
    : { ok: false, output: null };
  const observedTools = shouldProbe && executableExists ? observeMcpTools(lock, executable) : [];
  const toolsExact = observedTools.length > 0
    && lock.mcp.required_tools.every((tool) => observedTools.includes(tool))
    && observedTools.every((tool) => lock.mcp.required_tools.includes(tool));
  const registered = mcpRegistration.registered && identityVerified;
  const serviceRegistered = service.output?.includes('status=1') === true;
  const accessibilityPermission = shouldProbe && executableExists
    ? parsePermissionStatus(permissionStatus.output, 'Accessibility', permissionStatus.ok)
    : 'unknown';
  const screenRecordingPermission = shouldProbe && executableExists
    ? parsePermissionStatus(permissionStatus.output, 'Screen Recording', permissionStatus.ok)
    : 'unknown';
  const permissionGranted = accessibilityPermission === 'granted'
    && screenRecordingPermission === 'granted';
  const permissionRequired = accessibilityPermission === 'required'
    || screenRecordingPermission === 'required';
  const permission = !supportedPlatform
    ? 'unsupported'
    : !shouldProbe
      ? 'unknown'
    : permissionGranted
      ? 'granted'
      : permissionRequired
        ? 'required'
        : 'unknown';
  const ready = supportedPlatform
    && identityVerified
    && registered
    && mcpRegistration.enabled
    && serviceRegistered
    && xpc.ok
    && permissionGranted
    && toolsExact;
  const status: ManagedComputerUseInspection['status'] = !supportedPlatform
    ? 'unsupported_platform'
    : !shouldProbe && identityVerified && registered
      ? 'health_not_checked'
    : ready
      ? 'ready'
      : !identityVerified
        ? 'not_installed'
        : !registered || !serviceRegistered
          ? 'not_registered'
          : permission !== 'granted'
            ? 'permission_required'
            : 'attention_required';
  return {
    surface_kind: 'opl_managed_computer_use_projection',
    provider_id: lock.provider_id,
    product_name: lock.product_name,
    version: lock.version,
    owner: lock.owner,
    source_ref: lock.product_identity_source_ref,
    source_sha256: lock.product_identity_source_sha256,
    platform: {
      current: currentPlatform,
      current_version: currentVersion,
      supported: supportedPlatform,
      minimum_version: lock.platform.minimum_version,
      architectures: lock.platform.architectures,
    },
    installed: identityVerified,
    registered,
    enabled: registered && mcpRegistration.enabled,
    permission,
    ready,
    status,
    available_actions: [...MANAGED_COMPUTER_USE_ACTION_IDS],
    bundle: {
      path: installPath,
      executable,
      bundle_id: plist.bundle_id ?? null,
      version: plist.version ?? null,
      team_id: teamId,
      architecture,
      identity_verified: identityVerified,
    },
    mcp: {
      server_id: lock.mcp.server_id,
      config_path: configPath,
      registered: mcpRegistration.registered,
      enabled: mcpRegistration.enabled,
      required_tools: lock.mcp.required_tools,
      observed_tools: observedTools,
      tools_exact: shouldProbe ? toolsExact : null,
    },
    service: {
      registered: shouldProbe ? Boolean(serviceRegistered) : null,
      xpc_ping: !shouldProbe || !executableExists ? 'not_checked' : xpc.ok ? 'passed' : 'failed',
      output: service.output || xpc.output,
    },
    permissions: {
      accessibility: accessibilityPermission,
      screen_recording: screenRecordingPermission,
    },
    health_ref: `opl://managed-companions/${lock.provider_id}/health`,
    authority_boundary: {
      lifecycle_owner: 'one-person-lab',
      app_role: 'default_policy_projection_and_user_experience',
      read_does_not_mutate: true,
      missing_permission_does_not_block_plain_codex: true,
    },
  };
}

function reconcileMcpRegistration(lock: ManagedComputerUseLock, executable: string) {
  const configPath = resolveCodexConfigPath();
  return registerOplManagedMcpServer({
    configPath,
    serverId: lock.mcp.server_id,
    command: executable,
    args: lock.mcp.args,
    enabled: lock.mcp.default_enabled,
  }).config_path;
}

function sha256(filePath: string) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function resolveArchiveSource(lock: ManagedComputerUseLock) {
  const explicit = process.env.OPL_KIMI_CU_ARCHIVE_PATH?.trim();
  if (explicit) return path.resolve(explicit);
  const fullSeed = process.env.OPL_FULL_RUNTIME_HOME?.trim();
  if (fullSeed) {
    const seedPath = path.join(fullSeed, lock.archive.full_seed_relative_path);
    if (fs.existsSync(seedPath)) return seedPath;
  }
  return null;
}

function materializeArchive(lock: ManagedComputerUseLock, targetPath: string) {
  const stageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-kimi-cu-'));
  try {
    const archivePath = resolveArchiveSource(lock) ?? path.join(stageRoot, 'KimiCU.app.zip');
    if (!fs.existsSync(archivePath)) {
      try {
        execFileSync('/usr/bin/curl', [
          '--fail', '--location', '--silent', '--show-error',
          '--retry', '2', '--output', archivePath, lock.archive.url,
        ], { stdio: 'pipe' });
      } catch (error) {
        throw new FrameworkContractError('build_command_failed', 'Failed to download the pinned KimiCU archive.', {
          archive_url: lock.archive.url,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    const actualSha256 = sha256(archivePath);
    if (actualSha256 !== lock.archive.sha256) {
      throw new FrameworkContractError('contract_shape_invalid', 'KimiCU archive SHA-256 does not match the Framework build lock.', {
        expected_sha256: lock.archive.sha256,
        actual_sha256: actualSha256,
        archive_path: archivePath,
      });
    }
    execFileSync('/usr/bin/ditto', ['-x', '-k', archivePath, stageRoot], { stdio: 'pipe' });
    const app = path.join(stageRoot, 'KimiCU.app');
    if (!fs.existsSync(app)) {
      throw new FrameworkContractError('build_command_failed', 'KimiCU archive did not contain KimiCU.app.', {
        archive_path: archivePath,
      });
    }
    const stagedPlist = parsePlistValues(path.join(app, 'Contents', 'Info.plist'));
    const stagedExecutable = path.join(app, 'Contents', 'MacOS', path.basename(lock.bundle.executable));
    const stagedTeamId = readTeamId(app);
    const stagedArchitecture = readArchitecture(stagedExecutable);
    const codesign = runCommand('/usr/bin/codesign', ['--verify', '--deep', '--strict', app]);
    const gatekeeper = runCommand('/usr/sbin/spctl', ['--assess', '--type', 'execute', '--verbose=2', app]);
    if (
      stagedPlist.bundle_id !== lock.bundle.bundle_id
      || stagedPlist.version !== lock.version
      || stagedTeamId !== lock.bundle.team_id
      || !lock.platform.architectures.includes(stagedArchitecture ?? '')
      || !codesign.ok
      || !gatekeeper.ok
    ) {
      throw new FrameworkContractError('contract_shape_invalid', 'KimiCU staged bundle failed identity or trust verification.', {
        expected_bundle_id: lock.bundle.bundle_id,
        actual_bundle_id: stagedPlist.bundle_id ?? null,
        expected_version: lock.version,
        actual_version: stagedPlist.version ?? null,
        expected_team_id: lock.bundle.team_id,
        actual_team_id: stagedTeamId,
        architecture: stagedArchitecture,
        codesign_verified: codesign.ok,
        gatekeeper_accepted: gatekeeper.ok,
      });
    }
    const stagedTarget = `${targetPath}.opl-staged-${process.pid}`;
    const backupTarget = `${targetPath}.opl-backup-${process.pid}`;
    fs.rmSync(stagedTarget, { recursive: true, force: true });
    fs.rmSync(backupTarget, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    execFileSync('/usr/bin/ditto', [app, stagedTarget], { stdio: 'pipe' });
    try {
      if (fs.existsSync(targetPath)) fs.renameSync(targetPath, backupTarget);
      fs.renameSync(stagedTarget, targetPath);
      fs.rmSync(backupTarget, { recursive: true, force: true });
    } catch (error) {
      fs.rmSync(stagedTarget, { recursive: true, force: true });
      if (!fs.existsSync(targetPath) && fs.existsSync(backupTarget)) {
        fs.renameSync(backupTarget, targetPath);
      }
      throw error;
    }
  } finally {
    fs.rmSync(stageRoot, { recursive: true, force: true });
  }
}

export function reconcileManagedComputerUse(actionId: ManagedComputerUseActionId): ManagedComputerUseInspection {
  const lock = readManagedComputerUseLock();
  if (actionId === 'settings_recheck_computer_use') return inspectManagedComputerUse();
  const installPath = resolveInstallPath(lock);
  const executable = resolveExecutable(lock, installPath);
  if (actionId === 'settings_request_computer_use_permissions') {
    if (!fs.existsSync(executable)) return inspectManagedComputerUse();
    runCommand(executable, ['request-permissions']);
    return inspectManagedComputerUse();
  }
  const before = inspectManagedComputerUse({ runExternalChecks: false });
  if (actionId === 'settings_reinstall_computer_use' && fs.existsSync(executable)) {
    runCommand(executable, ['uninstall']);
  }
  if (!before.installed || actionId === 'settings_reinstall_computer_use') materializeArchive(lock, installPath);
  runCommand(executable, ['install']);
  reconcileMcpRegistration(lock, executable);
  return inspectManagedComputerUse();
}
