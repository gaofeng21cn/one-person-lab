import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

import { FrameworkContractError } from '../../kernel/contract-validation.ts';
import { parseJsonText, writeJsonPayloadFile } from '../../kernel/json-file.ts';

type JsonRecord = Record<string, unknown>;

type ModeAction = 'status' | 'enable' | 'disable' | 'repair' | 'uninstall';

const CODEXCONT_SOURCE = 'git+https://github.com/ZhenHuangLab/CodexCont';
const PROXY_HOST = '127.0.0.1';
const PROXY_PORT = 8787;
const PROXY_BASE_URL = `http://${PROXY_HOST}:${PROXY_PORT}/v1`;
const PROXY_RESPONSES_URL = `${PROXY_BASE_URL}/responses`;
const DEFAULT_UPSTREAM_BASE_URL = 'https://gflabtoken.cn/v1';
const RECEIPT_FILE = 'opl-flow-intelligence-enhancement.json';
const SERVICE_LABEL = 'org.onepersonlab.codexcont';
const SERVICE_SCRIPT_FILE = 'opl-flow-codexcont-foreground.sh';

function normalizeOptionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function quoteTomlString(value: string) {
  return JSON.stringify(value);
}

function stripTomlInlineComment(line: string) {
  let inSingleQuote = false;
  let inDoubleQuote = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    const previous = index > 0 ? line[index - 1] : '';
    if (character === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
      continue;
    }
    if (character === '"' && !inSingleQuote && previous !== '\\') {
      inDoubleQuote = !inDoubleQuote;
      continue;
    }
    if (character === '#' && !inSingleQuote && !inDoubleQuote) {
      return line.slice(0, index).trim();
    }
  }
  return line.trim();
}

function parseTomlValue(rawValue: string) {
  const trimmed = rawValue.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return parseJsonText(trimmed) as string;
  }
  if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function normalizeBaseUrl(value: string | null | undefined) {
  return normalizeOptionalString(value)?.replace(/\/+$/, '') ?? null;
}

function responsesUrlFromBase(baseUrl: string | null) {
  const normalized = normalizeBaseUrl(baseUrl) ?? DEFAULT_UPSTREAM_BASE_URL;
  return normalized.endsWith('/responses') ? normalized : `${normalized}/responses`;
}

function baseUrlFromResponsesUrl(url: string | null) {
  const normalized = normalizeBaseUrl(url);
  return normalized?.replace(/\/responses$/, '') ?? null;
}

function timestampSlug(now = new Date()) {
  return now.toISOString().replace(/[-:]/g, '').replace(/\..+$/, 'Z');
}

function resolveHomeDir() {
  return normalizeOptionalString(process.env.HOME) ?? os.homedir();
}

function resolveCodexHome() {
  return normalizeOptionalString(process.env.CODEX_HOME) ?? path.join(resolveHomeDir(), '.codex');
}

function resolveCodexContHome() {
  return normalizeOptionalString(process.env.OPL_CODEXCONT_HOME) ?? path.join(resolveHomeDir(), '.codexcont');
}

function codexConfigPath() {
  return path.join(resolveCodexHome(), 'config.toml');
}

function codexContConfigPath() {
  return path.join(resolveCodexContHome(), 'config.toml');
}

function receiptPath() {
  return path.join(resolveCodexContHome(), RECEIPT_FILE);
}

function serviceScriptPath() {
  return path.join(resolveCodexContHome(), SERVICE_SCRIPT_FILE);
}

function readTextIfFile(filePath: string) {
  return fs.existsSync(filePath) && fs.statSync(filePath).isFile()
    ? fs.readFileSync(filePath, 'utf8')
    : '';
}

function sectionRange(lines: string[], section: string | null) {
  if (!section) {
    const end = lines.findIndex((line) => /^\s*\[[^\]]+\]\s*$/.test(stripTomlInlineComment(line)));
    return { start: 0, end: end === -1 ? lines.length : end };
  }
  const header = `[${section}]`;
  const start = lines.findIndex((line) => stripTomlInlineComment(line) === header);
  if (start === -1) return null;
  const next = lines.findIndex((line, index) => index > start && /^\s*\[[^\]]+\]\s*$/.test(stripTomlInlineComment(line)));
  return { start: start + 1, end: next === -1 ? lines.length : next };
}

function readTomlValue(contents: string, section: string | null, key: string) {
  const lines = contents.split(/\r?\n/);
  const range = sectionRange(lines, section);
  if (!range) return null;
  const pattern = new RegExp(`^\\s*${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*=`);
  for (let index = range.start; index < range.end; index += 1) {
    const line = stripTomlInlineComment(lines[index]);
    if (!pattern.test(line)) continue;
    const separatorIndex = line.indexOf('=');
    return parseTomlValue(line.slice(separatorIndex + 1));
  }
  return null;
}

function upsertTomlValue(contents: string, section: string | null, key: string, rawValue: string) {
  const lines = contents ? contents.replace(/\s+$/, '').split(/\r?\n/) : [];
  let range = sectionRange(lines, section);
  if (!range && section) {
    if (lines.length > 0) lines.push('');
    lines.push(`[${section}]`);
    range = { start: lines.length, end: lines.length };
  }
  if (!range) range = { start: 0, end: 0 };

  const pattern = new RegExp(`^\\s*${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*=`);
  for (let index = range.start; index < range.end; index += 1) {
    if (pattern.test(stripTomlInlineComment(lines[index]))) {
      lines[index] = `${key} = ${rawValue}`;
      return `${lines.join('\n')}\n`;
    }
  }

  lines.splice(range.end, 0, `${key} = ${rawValue}`);
  return `${lines.join('\n')}\n`;
}

function readCodexProfile() {
  const configPath = codexConfigPath();
  const contents = readTextIfFile(configPath);
  const providerId = readTomlValue(contents, null, 'model_provider') ?? 'gflab';
  const providerSection = `model_providers.${providerId}`;
  return {
    configPath,
    contents,
    providerId,
    providerSection,
    providerBaseUrl: readTomlValue(contents, providerSection, 'base_url'),
  };
}

function readCodexContUpstreamUrl() {
  return readTomlValue(readTextIfFile(codexContConfigPath()), 'upstream', 'url');
}

function readReceipt() {
  const filePath = receiptPath();
  if (!fs.existsSync(filePath)) return null;
  try {
    const parsed = parseJsonText(fs.readFileSync(filePath, 'utf8'));
    return typeof parsed === 'object' && parsed !== null ? parsed as JsonRecord : null;
  } catch {
    return null;
  }
}

function writeReceipt(payload: JsonRecord) {
  const filePath = receiptPath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  writeJsonPayloadFile(filePath, {
    surface_kind: 'opl_flow_intelligence_enhancement_receipt.v1',
    updated_at: new Date().toISOString(),
    provider: 'codexcont',
    proxy_base_url: PROXY_BASE_URL,
    ...payload,
  });
  return filePath;
}

function resolvePreviousProviderBaseUrl(currentBaseUrl: string | null, upstreamUrl: string | null, receipt: JsonRecord | null) {
  const receiptBase = normalizeBaseUrl(normalizeOptionalString(receipt?.previous_provider_base_url));
  if (receiptBase && receiptBase !== PROXY_BASE_URL) return receiptBase;
  const upstreamBase = baseUrlFromResponsesUrl(upstreamUrl);
  if (upstreamBase && upstreamBase !== PROXY_BASE_URL) return upstreamBase;
  const current = normalizeBaseUrl(currentBaseUrl);
  if (current && current !== PROXY_BASE_URL) return current;
  return DEFAULT_UPSTREAM_BASE_URL;
}

function backupCurrentFiles(action: ModeAction) {
  const backupRoot = path.join(resolveCodexContHome(), 'backup', `${timestampSlug()}-${action}`);
  fs.mkdirSync(backupRoot, { recursive: true });
  const files = [
    { source: codexConfigPath(), target: 'codex.config.toml' },
    { source: codexContConfigPath(), target: 'codexcont.config.toml' },
    { source: receiptPath(), target: RECEIPT_FILE },
  ];
  const copied: string[] = [];
  for (const file of files) {
    if (!fs.existsSync(file.source)) continue;
    fs.copyFileSync(file.source, path.join(backupRoot, file.target));
    copied.push(file.target);
  }
  fs.writeFileSync(
    path.join(backupRoot, 'RESTORE.md'),
    [
      '# OPL Flow intelligence enhancement backup',
      '',
      `action: ${action}`,
      `created_at: ${new Date().toISOString()}`,
      `copied: ${copied.join(', ') || 'none'}`,
      '',
    ].join('\n'),
    'utf8',
  );
  return backupRoot;
}

function writeCodexProxyConfig(providerBaseUrl: string) {
  const profile = readCodexProfile();
  let next = profile.contents;
  if (!next) {
    next = [
      'model_provider = "gflab"',
      'model = "gpt-5.5"',
      '',
      '[model_providers.gflab]',
      'name = "gflab"',
      'wire_api = "responses"',
      '',
    ].join('\n');
  }
  next = upsertTomlValue(next, null, 'model_provider', quoteTomlString(profile.providerId));
  next = upsertTomlValue(next, profile.providerSection, 'name', quoteTomlString(profile.providerId));
  next = upsertTomlValue(next, profile.providerSection, 'base_url', quoteTomlString(providerBaseUrl));
  next = upsertTomlValue(next, profile.providerSection, 'wire_api', quoteTomlString('responses'));
  fs.mkdirSync(path.dirname(profile.configPath), { recursive: true });
  fs.writeFileSync(profile.configPath, next, { mode: 0o600 });
  fs.chmodSync(profile.configPath, 0o600);
}

function writeCodexContConfig(upstreamResponsesUrl: string) {
  let next = readTextIfFile(codexContConfigPath());
  if (!next) {
    next = [
      '[server]',
      `host = ${quoteTomlString(PROXY_HOST)}`,
      `port = ${PROXY_PORT}`,
      'listen_paths = ["/v1/responses"]',
      'enable_websocket = true',
      '',
      '[upstream]',
      `url = ${quoteTomlString(upstreamResponsesUrl)}`,
      'mode = "fixed"',
      '',
      '[auth]',
      'mode = "passthrough"',
      'access_token = ""',
      'chatgpt_account_id = ""',
      '',
      '[continue]',
      'enabled = true',
      'truncation_step = 518',
      'max_continue = 3',
      'min_n = 1',
      'max_n = 6',
      'method = "commentary"',
      'marker_text = "Continue thinking..."',
      'forward_marker = true',
      '',
    ].join('\n');
  }
  next = upsertTomlValue(next, 'server', 'host', quoteTomlString(PROXY_HOST));
  next = upsertTomlValue(next, 'server', 'port', String(PROXY_PORT));
  next = upsertTomlValue(next, 'server', 'listen_paths', '["/v1/responses"]');
  next = upsertTomlValue(next, 'upstream', 'url', quoteTomlString(upstreamResponsesUrl));
  next = upsertTomlValue(next, 'upstream', 'mode', quoteTomlString('fixed'));
  fs.mkdirSync(path.dirname(codexContConfigPath()), { recursive: true });
  fs.writeFileSync(codexContConfigPath(), next, { mode: 0o600 });
  fs.chmodSync(codexContConfigPath(), 0o600);
}

function codexContCommand(args: string[]) {
  const command = normalizeOptionalString(process.env.OPL_CODEXCONT_UVX) ?? 'uvx';
  return {
    command,
    args: ['--from', CODEXCONT_SOURCE, 'codexcont', ...args],
    redacted: ['uvx', '--from', CODEXCONT_SOURCE, 'codexcont', ...args],
  };
}

function runCodexContCli(args: string[]) {
  const spec = codexContCommand(args);
  const result = spawnSync(spec.command, spec.args, {
    encoding: 'utf8',
    timeout: 180_000,
    env: process.env,
  });
  const stdout = result.stdout?.trim() ?? '';
  if (result.status !== 0 && !(args[0] === 'install' && stdout.includes('Install complete.'))) {
    throw new FrameworkContractError('codex_command_failed', 'CodexCont command failed.', {
      command: spec.redacted.join(' '),
      exit_code: result.status,
      stderr: result.stderr?.trim() ?? '',
      stdout,
    });
  }
  return {
    command: spec.redacted,
    stdout,
    stderr: result.stderr?.trim() ?? '',
  };
}

function isLinuxContainer() {
  return fs.existsSync('/.dockerenv')
    || normalizeOptionalString(process.env.container) !== null
    || normalizeOptionalString(process.env.OPL_DOCKER_WEBUI) !== null;
}

function serviceMode() {
  const override = normalizeOptionalString(process.env.OPL_CODEXCONT_SERVICE_MODE);
  if (override === 'manual' || override === 'launchd' || override === 'systemd' || override === 'container') {
    return override;
  }
  if (process.platform === 'darwin') return 'launchd';
  if (process.platform === 'linux') return isLinuxContainer() ? 'container' : 'systemd';
  return 'manual';
}

function serviceDefinitionPath(mode = serviceMode()) {
  if (mode === 'launchd') {
    return path.join(resolveHomeDir(), 'Library', 'LaunchAgents', `${SERVICE_LABEL}.plist`);
  }
  if (mode === 'systemd') {
    return path.join(resolveHomeDir(), '.config', 'systemd', 'user', `${SERVICE_LABEL}.service`);
  }
  return path.join(resolveCodexContHome(), 'opl-flow-service.json');
}

function writeServiceScript() {
  const scriptPath = serviceScriptPath();
  const spec = codexContCommand(['start', '-f']);
  fs.mkdirSync(path.dirname(scriptPath), { recursive: true });
  fs.writeFileSync(
    scriptPath,
    [
      '#!/bin/sh',
      'set -eu',
      `export HOME=${quoteTomlString(resolveHomeDir())}`,
      `export CODEX_HOME=${quoteTomlString(resolveCodexHome())}`,
      `export OPL_CODEXCONT_HOME=${quoteTomlString(resolveCodexContHome())}`,
      `export PATH=${quoteTomlString(process.env.PATH ?? '/usr/local/bin:/usr/bin:/bin')}`,
      `exec ${[spec.command, ...spec.args].map((part) => `'${part.replace(/'/g, "'\\''")}'`).join(' ')}`,
      '',
    ].join('\n'),
    { mode: 0o755 },
  );
  fs.chmodSync(scriptPath, 0o755);
  return scriptPath;
}

function runServiceCommand(command: string, args: string[]) {
  if (process.env.OPL_CODEXCONT_SERVICE_SKIP === '1') {
    return { command: [command, ...args], skipped: true, stdout: '', stderr: '' };
  }
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    timeout: 60_000,
    env: process.env,
  });
  if (result.status !== 0) {
    return {
      command: [command, ...args],
      skipped: false,
      status: result.status,
      stdout: result.stdout?.trim() ?? '',
      stderr: result.stderr?.trim() ?? '',
    };
  }
  return {
    command: [command, ...args],
    skipped: false,
    status: result.status,
    stdout: result.stdout?.trim() ?? '',
    stderr: result.stderr?.trim() ?? '',
  };
}

function installServiceDefinition() {
  const mode = serviceMode();
  const scriptPath = writeServiceScript();
  const definitionPath = serviceDefinitionPath(mode);
  fs.mkdirSync(path.dirname(definitionPath), { recursive: true });

  if (mode === 'launchd') {
    fs.writeFileSync(
      definitionPath,
      [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
        '<plist version="1.0">',
        '<dict>',
        '  <key>Label</key>',
        `  <string>${SERVICE_LABEL}</string>`,
        '  <key>ProgramArguments</key>',
        '  <array>',
        '    <string>/bin/sh</string>',
        `    <string>${scriptPath}</string>`,
        '  </array>',
        '  <key>RunAtLoad</key>',
        '  <true/>',
        '  <key>KeepAlive</key>',
        '  <true/>',
        '  <key>StandardOutPath</key>',
        `  <string>${path.join(resolveCodexContHome(), 'launchd.out.log')}</string>`,
        '  <key>StandardErrorPath</key>',
        `  <string>${path.join(resolveCodexContHome(), 'launchd.err.log')}</string>`,
        '</dict>',
        '</plist>',
        '',
      ].join('\n'),
      'utf8',
    );
    const uid = typeof process.getuid === 'function' ? process.getuid() : null;
    const domain = uid === null ? null : `gui/${uid}`;
    return {
      mode,
      script_path: scriptPath,
      definition_path: definitionPath,
      commands: [
        ...(domain ? [runServiceCommand('launchctl', ['bootout', domain, definitionPath])] : []),
        ...(domain ? [runServiceCommand('launchctl', ['bootstrap', domain, definitionPath])] : []),
        ...(domain ? [runServiceCommand('launchctl', ['kickstart', '-k', `${domain}/${SERVICE_LABEL}`])] : []),
      ],
    };
  }

  if (mode === 'systemd') {
    fs.writeFileSync(
      definitionPath,
      [
        '[Unit]',
        'Description=OPL Flow CodexCont local proxy',
        '',
        '[Service]',
        'Type=simple',
        `ExecStart=/bin/sh ${scriptPath}`,
        'Restart=always',
        'RestartSec=3',
        `Environment=HOME=${resolveHomeDir()}`,
        `Environment=CODEX_HOME=${resolveCodexHome()}`,
        `Environment=OPL_CODEXCONT_HOME=${resolveCodexContHome()}`,
        '',
        '[Install]',
        'WantedBy=default.target',
        '',
      ].join('\n'),
      'utf8',
    );
    return {
      mode,
      script_path: scriptPath,
      definition_path: definitionPath,
      commands: [
        runServiceCommand('systemctl', ['--user', 'daemon-reload']),
        runServiceCommand('systemctl', ['--user', 'enable', '--now', `${SERVICE_LABEL}.service`]),
      ],
    };
  }

  writeJsonPayloadFile(definitionPath, {
    surface_kind: 'opl_flow_codexcont_container_service_manifest.v1',
    mode,
    service_label: SERVICE_LABEL,
    script_path: scriptPath,
    command: ['opl', 'app', 'action', 'execute', '--action', 'intelligence_enhancement_repair', '--json'],
    startup_policy: mode === 'container'
      ? 'container_entrypoint_or_opl_system_startup_maintenance_must_call_repair'
      : 'manual_repair_action',
  });
  return {
    mode,
    script_path: scriptPath,
    definition_path: definitionPath,
    commands: [] as Array<ReturnType<typeof runServiceCommand>>,
  };
}

function stopServiceDefinition() {
  const mode = serviceMode();
  const definitionPath = serviceDefinitionPath(mode);
  if (mode === 'launchd') {
    const uid = typeof process.getuid === 'function' ? process.getuid() : null;
    const domain = uid === null ? null : `gui/${uid}`;
    return {
      mode,
      definition_path: definitionPath,
      commands: domain ? [runServiceCommand('launchctl', ['bootout', domain, definitionPath])] : [],
    };
  }
  if (mode === 'systemd') {
    return {
      mode,
      definition_path: definitionPath,
      commands: [
        runServiceCommand('systemctl', ['--user', 'disable', '--now', `${SERVICE_LABEL}.service`]),
        runServiceCommand('systemctl', ['--user', 'daemon-reload']),
      ],
    };
  }
  return { mode, definition_path: definitionPath, commands: [] as Array<ReturnType<typeof runServiceCommand>> };
}

function serviceStatus() {
  const mode = serviceMode();
  const definitionPath = serviceDefinitionPath(mode);
  return {
    service_label: SERVICE_LABEL,
    mode,
    definition_path: definitionPath,
    script_path: serviceScriptPath(),
    definition_installed: fs.existsSync(definitionPath),
    script_installed: fs.existsSync(serviceScriptPath()),
    persistence_policy: mode === 'launchd'
      ? 'macos_launch_agent_run_at_load_keep_alive'
      : mode === 'systemd'
        ? 'linux_systemd_user_enable_now_restart_always'
        : mode === 'container'
          ? 'container_entrypoint_or_startup_maintenance_repair'
          : 'manual_start_only',
  };
}

function serviceUsesExternalSupervisor(mode: string) {
  return mode === 'launchd' || mode === 'systemd';
}

function pidRunning() {
  const pidPath = path.join(resolveCodexContHome(), 'codexcont.pid');
  if (!fs.existsSync(pidPath)) return false;
  const pid = Number.parseInt(fs.readFileSync(pidPath, 'utf8').trim(), 10);
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function tcpReachable(host: string, port: number, timeoutMs = 500) {
  return new Promise<boolean>((resolve) => {
    const socket = net.createConnection({ host, port });
    const finish = (value: boolean) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });
}

async function buildStatus() {
  const codexProfile = readCodexProfile();
  const providerBaseUrl = normalizeBaseUrl(codexProfile.providerBaseUrl);
  const upstreamUrl = normalizeBaseUrl(readCodexContUpstreamUrl());
  const receipt = readReceipt();
  const proxyReachable = await tcpReachable(PROXY_HOST, PROXY_PORT);
  const codexWiredToProxy = providerBaseUrl === PROXY_BASE_URL;
  const codexContConfigured = upstreamUrl !== null;
  return {
    opl_flow_intelligence_enhancement: {
      surface_kind: 'opl_flow_intelligence_enhancement_status.v1',
      provider: 'codexcont',
      status: codexWiredToProxy && proxyReachable
        ? 'enabled_running'
        : codexWiredToProxy
          ? 'enabled_proxy_not_reachable'
          : 'disabled',
      enabled: codexWiredToProxy,
      proxy_running: proxyReachable,
      pid_running: pidRunning(),
      proxy_base_url: PROXY_BASE_URL,
      codex_config_path: codexProfile.configPath,
      codex_model_provider: codexProfile.providerId,
      codex_provider_base_url: providerBaseUrl,
      codexcont_home: resolveCodexContHome(),
      codexcont_config_path: codexContConfigPath(),
      codexcont_configured: codexContConfigured,
      service: serviceStatus(),
      upstream_responses_url: upstreamUrl,
      previous_provider_base_url: resolvePreviousProviderBaseUrl(providerBaseUrl, upstreamUrl, receipt),
      receipt_path: fs.existsSync(receiptPath()) ? receiptPath() : null,
      action_ids: {
        status: 'intelligence_enhancement_status',
        enable: 'intelligence_enhancement_enable',
        disable: 'intelligence_enhancement_disable',
        repair: 'intelligence_enhancement_repair',
        uninstall: 'intelligence_enhancement_uninstall',
      },
      authority_boundary: {
        owner: 'opl_flow',
        app_shell_role: 'switch_invokes_action_only',
        mutates_codex_config: true,
        mutates_codexcont_config: true,
        writes_domain_truth: false,
      },
    },
  };
}

function dryRunResult(action: ModeAction, payload: JsonRecord) {
  return {
    opl_flow_intelligence_enhancement_action: {
      surface_kind: 'opl_flow_intelligence_enhancement_action_preflight.v1',
      action,
      status: 'dry_run',
      requested: payload,
      provider: 'codexcont',
      proxy_base_url: PROXY_BASE_URL,
      command_preview: action === 'status'
        ? ['opl', 'app', 'action', 'execute', '--action', 'intelligence_enhancement_status', '--json']
        : codexContCommand(
          action === 'enable' || action === 'repair'
            ? ['install', '-y']
            : action === 'disable'
              ? ['stop']
              : ['stop'],
        ).redacted,
      write_targets: action === 'status'
        ? []
        : [
            codexConfigPath(),
            codexContConfigPath(),
            receiptPath(),
          ],
      authority_boundary: {
        owner: 'opl_flow',
        can_write_domain_truth: false,
        can_authorize_release_ready: false,
        shell_must_not_edit_configs_directly: true,
      },
    },
  };
}

async function enableMode() {
  const codexProfile = readCodexProfile();
  const upstreamUrl = readCodexContUpstreamUrl();
  const previousBaseUrl = resolvePreviousProviderBaseUrl(codexProfile.providerBaseUrl, upstreamUrl, readReceipt());
  const backupPath = backupCurrentFiles('enable');
  const install = runCodexContCli(['install', '-y']);
  writeCodexContConfig(responsesUrlFromBase(previousBaseUrl));
  writeCodexProxyConfig(PROXY_BASE_URL);
  const targetServiceMode = serviceMode();
  const stopBackground = serviceUsesExternalSupervisor(targetServiceMode) ? runCodexContCli(['stop']) : null;
  const service = installServiceDefinition();
  const receipt = writeReceipt({
    status: 'enabled',
    previous_provider_base_url: previousBaseUrl,
    upstream_responses_url: responsesUrlFromBase(previousBaseUrl),
    backup_path: backupPath,
    service,
  });
  const start = serviceUsesExternalSupervisor(service.mode) ? null : runCodexContCli(['restart']);
  return {
    opl_flow_intelligence_enhancement_action: {
      surface_kind: 'opl_flow_intelligence_enhancement_action_result.v1',
      action: 'enable',
      status: 'completed',
      backup_path: backupPath,
      receipt_path: receipt,
      commands: [install.command, ...(stopBackground ? [stopBackground.command] : []), ...(start ? [start.command] : [])],
      service,
      status_readback: (await buildStatus()).opl_flow_intelligence_enhancement,
    },
  };
}

async function repairMode() {
  const statusBefore = (await buildStatus()).opl_flow_intelligence_enhancement;
  const upstream = responsesUrlFromBase(statusBefore.previous_provider_base_url);
  const install = runCodexContCli(['install', '-y']);
  writeCodexContConfig(upstream);
  if (statusBefore.enabled) {
    writeCodexProxyConfig(PROXY_BASE_URL);
  }
  const targetServiceMode = serviceMode();
  const stopBackground = serviceUsesExternalSupervisor(targetServiceMode) ? runCodexContCli(['stop']) : null;
  const service = installServiceDefinition();
  const start = serviceUsesExternalSupervisor(service.mode) ? null : runCodexContCli(['restart']);
  const receipt = writeReceipt({
    status: statusBefore.enabled ? 'enabled' : 'repaired_disabled',
    previous_provider_base_url: statusBefore.previous_provider_base_url,
    upstream_responses_url: upstream,
    service,
  });
  return {
    opl_flow_intelligence_enhancement_action: {
      surface_kind: 'opl_flow_intelligence_enhancement_action_result.v1',
      action: 'repair',
      status: 'completed',
      receipt_path: receipt,
      commands: [install.command, ...(stopBackground ? [stopBackground.command] : []), ...(start ? [start.command] : [])],
      service,
      status_readback: (await buildStatus()).opl_flow_intelligence_enhancement,
    },
  };
}

async function disableMode() {
  const codexProfile = readCodexProfile();
  const previousBaseUrl = resolvePreviousProviderBaseUrl(
    codexProfile.providerBaseUrl,
    readCodexContUpstreamUrl(),
    readReceipt(),
  );
  const backupPath = backupCurrentFiles('disable');
  const service = stopServiceDefinition();
  const stop = serviceUsesExternalSupervisor(service.mode) ? null : runCodexContCli(['stop']);
  writeCodexProxyConfig(previousBaseUrl);
  const receipt = writeReceipt({
    status: 'disabled',
    previous_provider_base_url: previousBaseUrl,
    backup_path: backupPath,
    service,
  });
  return {
    opl_flow_intelligence_enhancement_action: {
      surface_kind: 'opl_flow_intelligence_enhancement_action_result.v1',
      action: 'disable',
      status: 'completed',
      backup_path: backupPath,
      receipt_path: receipt,
      commands: stop ? [stop.command] : [],
      service,
      status_readback: (await buildStatus()).opl_flow_intelligence_enhancement,
    },
  };
}

async function uninstallMode(payload: JsonRecord) {
  const confirmation = normalizeOptionalString(payload.confirmation);
  if (confirmation !== 'uninstall_codexcont') {
    throw new FrameworkContractError('cli_usage_error', 'intelligence_enhancement_uninstall requires payload.confirmation.', {
      action_id: 'intelligence_enhancement_uninstall',
      required: { confirmation: 'uninstall_codexcont' },
    });
  }
  const disabled = await disableMode();
  const sourceHome = resolveCodexContHome();
  const archiveRoot = path.join(resolveHomeDir(), '.codexcont-uninstalled', timestampSlug());
  if (fs.existsSync(sourceHome)) {
    fs.mkdirSync(path.dirname(archiveRoot), { recursive: true });
    fs.renameSync(sourceHome, archiveRoot);
  }
  return {
    opl_flow_intelligence_enhancement_action: {
      surface_kind: 'opl_flow_intelligence_enhancement_action_result.v1',
      action: 'uninstall',
      status: 'completed',
      archive_path: fs.existsSync(archiveRoot) ? archiveRoot : null,
      disable_result: disabled.opl_flow_intelligence_enhancement_action,
      status_readback: (await buildStatus()).opl_flow_intelligence_enhancement,
    },
  };
}

export async function runOplFlowIntelligenceEnhancementAction(
  action: ModeAction,
  payload: JsonRecord,
  dryRun: boolean,
) {
  if (dryRun && action !== 'status') {
    return dryRunResult(action, payload);
  }
  if (action === 'status') return buildStatus();
  if (action === 'enable') return enableMode();
  if (action === 'disable') return disableMode();
  if (action === 'repair') return repairMode();
  return uninstallMode(payload);
}
