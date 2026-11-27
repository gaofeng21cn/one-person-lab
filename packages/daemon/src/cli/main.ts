import fs from 'node:fs';
import path from 'node:path';
import { resolveStatePaths } from '@opl/core';
import { buildPackage, migrateV1Package, readPackageManifestFromDir, verifyReleaseLock } from '@opl/pack';
import { runDaemonForeground } from '../daemon.ts';
import { prepareGatewayCommand } from './gateway-account.ts';
import { DaemonRpcError, mapErrorToCliExitCode, toJsonRpcError } from '../errors.ts';
import {
  callDaemonRpc,
  getDaemonStatus,
  spawnDetachedDaemon,
  stopDaemonGracefully,
} from './client.ts';
import { discoverCliExtensions, invokeCliExtension } from './extensions.ts';

interface ParsedCliArgs {
  readonly positionals: string[];
  readonly flags: Map<string, string | boolean>;
  readonly extensionStateDir?: string;
  readonly json: boolean;
  readonly quiet: boolean;
  readonly help: boolean;
  readonly version: boolean;
}

const VALUE_FLAGS = new Set([
  '--name',
  '--domain',
  '--workspace',
  '--scope',
  '--adapter',
  '--stage-run',
  '--source',
  '--target',
  '--content',
  '--revision',
  '--intent',
  '--origin',
  '--query',
  '--package',
  '--provider-type',
  '--display-name',
  '--connection-id',
  '--account-label',
  '--secret',
  '--credential-handle',
  '--credential-file',
  '--group-id',
  '--endpoint',
  '--input',
  '--agent',
  '--title',
  '--goal',
  '--status',
  '--reason',
  '--decision',
  '--expected-revision',
  '--notes',
  '--cron',
  '--overlap',
  '--enabled',
  '--kind',
  '--limit',
  '--verdict',
  '--owner',
  '--lines',
  '--capabilities',
  '--id',
  '--publisher',
  '--summary',
  '--pkg-version',
  '--suite',
  '--run-id',
  '--baseline',
  '--candidate',
  '--target-agent-id',
  '--target-domain-id',
  '--version-digest',
  '--to-version',
  '--authority-receipt-ref',
  '--state-dir',
  '--regression-tolerance',
]);

const EXTENSION_BOOLEAN_FLAGS = new Set([
  '--force',
  '--no-codex-sync',
  '--apply',
  '--clean',
  '--dry-run',
  '--detached',
  '--foreground',
  '--yes',
]);

function parseArgs(argv: readonly string[]): ParsedCliArgs {
  const positionals: string[] = [];
  const flags = new Map<string, string | boolean>();
  let json = false;
  let quiet = false;
  let help = false;
  let version = false;
  let extensionStateDir: string | undefined;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (arg === '--json') {
      json = true;
      continue;
    }
    if (arg === '--quiet' || arg === '-q') {
      quiet = true;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      help = true;
      continue;
    }
    if (arg === '--version' || arg === '-V') {
      version = true;
      continue;
    }
    if (arg.startsWith('--')) {
      const eqIdx = arg.indexOf('=');
      if (eqIdx !== -1) {
        const key = arg.slice(0, eqIdx);
        const value = arg.slice(eqIdx + 1);
        flags.set(key, value);
        if (key === '--state-dir' && positionals.length < 2) extensionStateDir = value;
        continue;
      }
      if (VALUE_FLAGS.has(arg) && i + 1 < argv.length) {
        const value = argv[++i]!;
        flags.set(arg, value);
        if (arg === '--state-dir' && positionals.length < 2) extensionStateDir = value;
        continue;
      }
      flags.set(arg, true);
      continue;
    }
    positionals.push(arg);
  }

  return { positionals, flags, extensionStateDir, json, quiet, help, version };
}

function getStringFlag(parsed: ParsedCliArgs, name: string): string | undefined {
  const val = parsed.flags.get(name);
  return typeof val === 'string' && val.length > 0 ? val : undefined;
}

function getBoolFlag(parsed: ParsedCliArgs, name: string): boolean {
  return parsed.flags.get(name) === true;
}

function parseIntegerFlag(
  parsed: ParsedCliArgs,
  name: string,
  options: { readonly min?: number; readonly max?: number } = {},
): number | undefined {
  if (!parsed.flags.has(name)) return undefined;
  const raw = parsed.flags.get(name);
  if (typeof raw !== 'string' || !/^-?\d+$/.test(raw.trim())) {
    throw new DaemonRpcError(-32602, 'INVALID_INPUT', `Flag '${name}' must be a valid integer.`);
  }
  const num = Number(raw.trim());
  if (!Number.isSafeInteger(num)) {
    throw new DaemonRpcError(-32602, 'INVALID_INPUT', `Flag '${name}' is out of safe integer range.`);
  }
  if (options.min !== undefined && num < options.min) {
    throw new DaemonRpcError(-32602, 'INVALID_INPUT', `Flag '${name}' must be >= ${options.min}.`);
  }
  if (options.max !== undefined && num > options.max) {
    throw new DaemonRpcError(-32602, 'INVALID_INPUT', `Flag '${name}' must be <= ${options.max}.`);
  }
  return num;
}

function parseJsonFlag(parsed: ParsedCliArgs, name: string): unknown | undefined {
  if (!parsed.flags.has(name)) return undefined;
  const raw = parsed.flags.get(name);
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    throw new DaemonRpcError(-32602, 'INVALID_INPUT', `Flag '${name}' requires a JSON value.`);
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new DaemonRpcError(
      -32602,
      'INVALID_INPUT',
      `Invalid JSON for '${name}': ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

function extractExtensionArgsAndOpts(
  argv: readonly string[],
  namespace: string,
  subcommand: string,
  help: boolean,
): { readonly args: string[]; readonly opts: Record<string, unknown> } {
  const args: string[] = [];
  const opts: Record<string, unknown> = help ? { help: true } : {};
  let seenNs = false;
  let seenSub = false;
  for (let i = 0; i < argv.length; i += 1) {
    const tok = argv[i]!;
    if (
      tok === '--json'
      || tok === '--quiet'
      || tok === '-q'
      || tok === '--help'
      || tok === '-h'
      || tok === '--version'
      || tok === '-V'
    ) {
      continue;
    }
    if (!seenNs) {
      if (tok === '--state-dir') {
        const val = argv[++i];
        if (val !== undefined) opts['state-dir'] = val;
        continue;
      }
      if (tok.startsWith('--state-dir=')) {
        opts['state-dir'] = tok.slice('--state-dir='.length);
        continue;
      }
      if (tok === namespace) seenNs = true;
      continue;
    }
    if (!seenSub) {
      if (tok === subcommand) seenSub = true;
      continue;
    }
    if (tok.startsWith('--')) {
      const eq = tok.indexOf('=');
      if (eq !== -1) {
        opts[tok.slice(2, eq)] = tok.slice(eq + 1);
        continue;
      }
      if (VALUE_FLAGS.has(tok) && i + 1 < argv.length) {
        opts[tok.slice(2)] = argv[++i]!;
        continue;
      }
      if (EXTENSION_BOOLEAN_FLAGS.has(tok)) {
        opts[tok.slice(2)] = true;
        continue;
      }
      args.push(tok);
      if (i + 1 < argv.length && !argv[i + 1]!.startsWith('--')) {
        args.push(argv[++i]!);
      }
      continue;
    }
    args.push(tok);
  }
  return { args, opts };
}

function readCliVersion(): string {
  try {
    const pkgPath = path.resolve(import.meta.dirname, '../../package.json');
    const raw = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as { version?: string };
    return typeof raw.version === 'string' && raw.version.trim() ? raw.version.trim() : '2.0.0';
  } catch {
    return '2.0.0';
  }
}

const NAMESPACE_SUBCOMMANDS: Readonly<Record<string, readonly { name: string; usage: string }[]>> = {
  daemon: [
    { name: 'start', usage: 'start [--detached | --foreground]' },
    { name: 'stop', usage: 'stop' },
    { name: 'restart', usage: 'restart [--detached]' },
    { name: 'status', usage: 'status' },
    { name: 'logs', usage: 'logs [--lines <n>]' },
    { name: 'doctor', usage: 'doctor [--include-first-run]' },
  ],
  workspace: [
    { name: 'init', usage: 'init <path> [--name <name>] [--domain <id>]' },
    { name: 'list', usage: 'list' },
    { name: 'inspect', usage: 'inspect <workspaceId>' },
    { name: 'sources', usage: 'sources <add|list|remove> ...' },
    { name: 'snapshot', usage: 'snapshot --workspace <wsId> --stage-run <srId> [--source <srcId>]' },
    { name: 'writeback', usage: 'writeback <propose|commit> ...' },
  ],
  pack: [
    { name: 'search', usage: 'search [<query>] [--intent <intent>] [--origin <origin>]' },
    { name: 'list', usage: 'list [--intent <intent>] [--origin <origin>] [--query <q>]' },
    { name: 'inspect', usage: 'inspect <packageIdOrDir>' },
    { name: 'install', usage: 'install <source> [--no-codex-sync]' },
    { name: 'update', usage: 'update [<packageId>] [--source <spec>] [--all]' },
    { name: 'uninstall', usage: 'uninstall <packageId>' },
    { name: 'enable', usage: 'enable <packageId>' },
    { name: 'disable', usage: 'disable <packageId>' },
    { name: 'link', usage: 'link <dir> [--no-codex-sync]' },
    { name: 'unlink', usage: 'unlink <packageId>' },
    { name: 'sync', usage: 'sync [codex] [--package <id>]' },
    { name: 'build', usage: 'build [<dir>] [--no-write-lock] [--dry-run]' },
    { name: 'migrate-v1', usage: 'migrate-v1 [<dir>] [--dry-run] [--no-clean]' },
  ],
  connect: [
    { name: 'gateway', usage: 'gateway <status|login|refresh|complete-setup|repair|use-for-model-access|authorize-companion|disconnect> ...' },
    { name: 'list', usage: 'list [--provider-type <t>] [--status <s>]' },
    { name: 'add', usage: 'add --provider-type <t> --display-name <n> [--connection-id <id>] [--secret <s>]' },
    { name: 'check', usage: 'check <connectionId>' },
    { name: 'remove', usage: 'remove <connectionId> [--purge-secret]' },
    { name: 'grants', usage: 'grants <list|approve|deny|revoke> ...' },
    { name: 'channels', usage: 'channels <list|action> ...' },
  ],
  runway: [
    { name: 'start', usage: 'start --workspace <wsId> [--agent <id>] --title <t> --goal <g>' },
    { name: 'list', usage: 'list [--workspace <wsId>] [--status <s>]' },
    { name: 'status', usage: 'status <taskId>' },
    { name: 'logs', usage: 'logs <taskId>' },
    { name: 'pause', usage: 'pause <taskId> [--reason <r>]' },
    { name: 'resume', usage: 'resume <taskId> [--reason <r>]' },
    { name: 'cancel', usage: 'cancel <taskId> [--reason <r>]' },
    { name: 'decide', usage: 'decide <stageRunId> --decision <d> [--expected-revision <n>]' },
    { name: 'executors', usage: 'executors [health]' },
    { name: 'schedules', usage: 'schedules <create|list|toggle|delete> ...' },
  ],
  ledger: [
    { name: 'timeline', usage: 'timeline <taskId> [--kind <k>] [--limit <n>]' },
    { name: 'artifacts', usage: 'artifacts <taskId>' },
    { name: 'receipts', usage: 'receipts <taskId>' },
    { name: 'debts', usage: 'debts <taskId> [--unresolved]' },
    { name: 'review', usage: 'review <taskId> --verdict <v> --owner <id>' },
    { name: 'verify', usage: 'verify <taskId>' },
  ],
};

function renderTopHelp(extensions: readonly { namespace: string; commands: readonly string[] }[]): string {
  const lines = [
    `OPL Framework CLI v${readCliVersion()}`,
    'Usage: opl <namespace> <subcommand> [options]',
    '',
    'Commands:',
  ];
  for (const [ns, subs] of Object.entries(NAMESPACE_SUBCOMMANDS)) {
    lines.push(`  ${ns}: ${subs.map((s) => s.name).join(' · ')}`);
  }
  if (extensions.length > 0) {
    lines.push('');
    lines.push('Extensions:');
    for (const ext of extensions) {
      lines.push(`  ${ext.namespace}: ${ext.commands.length > 0 ? ext.commands.join(' · ') : 'run'}`);
    }
  }
  lines.push('');
  lines.push('Options:');
  lines.push('  --json       Emit machine-readable JSON');
  lines.push('  --quiet, -q  Suppress decorative formatting');
  lines.push('  --help, -h   Show help');
  lines.push('  --version, -V Show version');
  return `${lines.join('\n')}\n`;
}

function renderNamespaceHelp(ns: string): string {
  const subs = NAMESPACE_SUBCOMMANDS[ns];
  if (!subs) return '';
  const lines = [
    `Usage: opl ${ns} <subcommand> [options]`,
    '',
    'Subcommands:',
  ];
  for (const sub of subs) {
    lines.push(`  ${sub.usage}`);
  }
  return `${lines.join('\n')}\n`;
}

function formatTextOutput(data: unknown, quiet: boolean): string {
  if (data === null || data === undefined) return '';
  if (typeof data === 'string') return data.endsWith('\n') ? data : `${data}\n`;
  if (typeof data !== 'object') return `${String(data)}\n`;

  const rec = data as Record<string, unknown>;
  if (Array.isArray(rec.packages)) {
    const rows = rec.packages as Array<Record<string, unknown>>;
    if (rows.length === 0) return quiet ? '' : 'No packages installed.\n';
    return `${rows
      .map((p) => `${String(p.package_id ?? p.id)} ${String(p.version ?? '')} (${String(p.origin ?? '')}/${String(p.intent ?? '')})`)
      .join('\n')}\n`;
  }
  if (Array.isArray(rec.workspaces)) {
    const rows = rec.workspaces as Array<Record<string, unknown>>;
    if (rows.length === 0) return quiet ? '' : 'No workspaces initialized.\n';
    return `${rows.map((w) => `${String(w.workspace_id)} ${String(w.name)} ${String(w.root_path)}`).join('\n')}\n`;
  }
  if (Array.isArray(rec.connections)) {
    const rows = rec.connections as Array<Record<string, unknown>>;
    if (rows.length === 0) return quiet ? '' : 'No connections configured.\n';
    return `${rows.map((c) => `${String(c.connection_id)} ${String(c.provider_type)} ${String(c.status)}`).join('\n')}\n`;
  }
  return `${JSON.stringify(data, null, quiet ? 0 : 2)}\n`;
}

function emitOutput(data: unknown, parsed: ParsedCliArgs): void {
  if (parsed.json) {
    process.stdout.write(`${JSON.stringify(data)}\n`);
  } else {
    process.stdout.write(formatTextOutput(data, parsed.quiet));
  }
}

function emitError(error: unknown, parsed: ParsedCliArgs, explicitExitCode?: number): number {
  const rpcErr = toJsonRpcError(error);
  const exitCode = explicitExitCode ?? mapErrorToCliExitCode(error);
  if (parsed.json) {
    process.stdout.write(
      `${JSON.stringify({
        ok: false,
        code: exitCode,
        error: {
          code: rpcErr.data?.code ?? 'ERROR',
          rpc_code: rpcErr.code,
          message: rpcErr.message,
          ...rpcErr.data,
        },
      })}\n`,
    );
  } else {
    process.stderr.write(`${rpcErr.message}\n`);
  }
  return exitCode;
}

function isTaskPausedOrHumanGate(taskResult: Record<string, unknown>): boolean {
  const taskStatus = String(taskResult.status ?? (taskResult.task as Record<string, unknown> | undefined)?.status ?? '');
  if (taskStatus === 'paused_by_human' || taskStatus === 'awaiting_human') return true;
  const stages = Array.isArray(taskResult.stage_runs)
    ? (taskResult.stage_runs as Array<Record<string, unknown>>)
    : [];
  return stages.some((sr) => sr.status === 'human_gate' || sr.status === 'paused_by_human');
}

export async function runCli(argv: readonly string[] = process.argv.slice(2)): Promise<number> {
  const parsed = parseArgs(argv);

  if (parsed.version && parsed.positionals.length === 0) {
    const ver = readCliVersion();
    if (parsed.json) {
      process.stdout.write(`${JSON.stringify({ version: ver, api_version: '2.0' })}\n`);
    } else {
      process.stdout.write(`${ver}\n`);
    }
    return 0;
  }

  try {
    if (parsed.flags.get('--state-dir') === true) {
      throw new DaemonRpcError(-32602, 'INVALID_INPUT', "Flag '--state-dir' requires a path value.");
    }
    const stateDir = getStringFlag(parsed, '--state-dir');
    const rpc = (method: string, params: Record<string, unknown> = {}) =>
      callDaemonRpc(method, params, stateDir ? { stateDir } : {});

    if (parsed.positionals.length === 0) {
      if (parsed.help) {
        const extensions = await discoverCliExtensions(stateDir);
        process.stdout.write(renderTopHelp(extensions));
        return 0;
      }
      const extensions = await discoverCliExtensions(stateDir);
      process.stdout.write(renderTopHelp(extensions));
      return 2;
    }

    const [ns, sub, ...rest] = parsed.positionals;

    if (parsed.help && ns && ns in NAMESPACE_SUBCOMMANDS) {
      process.stdout.write(renderNamespaceHelp(ns));
      return 0;
    }

    switch (ns) {
      case 'daemon': {
        if (!sub || !(NAMESPACE_SUBCOMMANDS.daemon?.some((c) => c.name === sub))) {
          throw new DaemonRpcError(-32602, 'INVALID_INPUT', `Unknown daemon subcommand '${sub ?? ''}'.`);
        }
        if (sub === 'start') {
          if (getBoolFlag(parsed, '--foreground')) {
            return await runDaemonForeground(stateDir ? { stateDir } : {});
          }
          const paths = resolveStatePaths({ stateDir });
          const sess = await spawnDetachedDaemon(paths);
          emitOutput({ ok: true, started: true, ...sess }, parsed);
          return 0;
        }
        if (sub === 'stop') {
          const out = await stopDaemonGracefully(stateDir);
          emitOutput(out, parsed);
          return 0;
        }
        if (sub === 'restart') {
          await stopDaemonGracefully(stateDir);
          const paths = resolveStatePaths({ stateDir });
          const sess = await spawnDetachedDaemon(paths);
          emitOutput({ ok: true, restarted: true, ...sess }, parsed);
          return 0;
        }
        if (sub === 'status') {
          const status = await getDaemonStatus(stateDir);
          emitOutput(status, parsed);
          return 0;
        }
        if (sub === 'logs') {
          const paths = resolveStatePaths({ stateDir });
          const logPath = path.join(paths.state_dir, 'logs', 'opld.log');
          const linesCount = parseIntegerFlag(parsed, '--lines', { min: 1 }) ?? 100;
          const content = fs.existsSync(logPath) ? fs.readFileSync(logPath, 'utf8') : '';
          const lines = content.split('\n').filter(Boolean).slice(-linesCount);
          emitOutput(parsed.json ? { ok: true, log_path: logPath, lines } : lines.join('\n'), parsed);
          return 0;
        }
        if (sub === 'doctor') {
          const res = await rpc('daemon.doctor', {
            include_first_run: getBoolFlag(parsed, '--include-first-run'),
          });
          emitOutput(res, parsed);
          return 0;
        }
        break;
      }

      case 'workspace': {
        if (!sub || !(NAMESPACE_SUBCOMMANDS.workspace?.some((c) => c.name === sub))) {
          throw new DaemonRpcError(-32602, 'INVALID_INPUT', `Unknown workspace subcommand '${sub ?? ''}'.`);
        }
        if (sub === 'init') {
          const targetPath = rest[0];
          if (!targetPath) {
            throw new DaemonRpcError(-32602, 'INVALID_INPUT', 'opl workspace init requires <path>.');
          }
          const res = await rpc('workspace.init', {
            root_path: targetPath,
            name: getStringFlag(parsed, '--name'),
            domain_id: getStringFlag(parsed, '--domain'),
          });
          emitOutput(res, parsed);
          return 0;
        }
        if (sub === 'list') {
          emitOutput(await rpc('workspace.list', {}), parsed);
          return 0;
        }
        if (sub === 'inspect') {
          const wsId = rest[0];
          if (!wsId) {
            throw new DaemonRpcError(-32602, 'INVALID_INPUT', 'opl workspace inspect requires <workspaceId>.');
          }
          emitOutput(await rpc('workspace.inspect', { workspace_id: wsId }), parsed);
          return 0;
        }
        if (sub === 'sources') {
          const action = rest[0];
          if (action === 'add') {
            const srcPath = rest[1];
            const wsId = getStringFlag(parsed, '--workspace');
            const scope = getStringFlag(parsed, '--scope') ?? 'project_local';
            const adapter = getStringFlag(parsed, '--adapter') ?? 'local_dir';
            if (!srcPath) {
              throw new DaemonRpcError(-32602, 'INVALID_INPUT', 'opl workspace sources add requires <path>.');
            }
            emitOutput(
              await rpc('workspace.sources.bind', {
                workspace_id: wsId,
                scope,
                adapter_kind: adapter,
                root_path: srcPath,
              }),
              parsed,
            );
            return 0;
          }
          if (action === 'list') {
            emitOutput(
              await rpc('workspace.knowledge.list', {
                workspace_id: getStringFlag(parsed, '--workspace'),
              }),
              parsed,
            );
            return 0;
          }
          if (action === 'remove') {
            const sourceId = rest[1];
            if (!sourceId) {
              throw new DaemonRpcError(-32602, 'INVALID_INPUT', 'opl workspace sources remove requires <sourceId>.');
            }
            emitOutput(
              await rpc('workspace.sources.remove', {
                source_id: sourceId,
                workspace_id: getStringFlag(parsed, '--workspace'),
              }),
              parsed,
            );
            return 0;
          }
          throw new DaemonRpcError(-32602, 'INVALID_INPUT', `Unknown workspace sources action '${action ?? ''}'.`);
        }
        if (sub === 'snapshot') {
          const wsId = getStringFlag(parsed, '--workspace');
          const stageRunId = getStringFlag(parsed, '--stage-run');
          const sourceId = getStringFlag(parsed, '--source');
          if (!stageRunId) {
            throw new DaemonRpcError(-32602, 'INVALID_INPUT', 'opl workspace snapshot requires --stage-run.');
          }
          emitOutput(
            await rpc('workspace.snapshots.create', {
              workspace_id: wsId,
              stage_run_id: stageRunId,
              source_id: sourceId,
            }),
            parsed,
          );
          return 0;
        }
        if (sub === 'writeback') {
          const action = rest[0];
          const wsId = getStringFlag(parsed, '--workspace');
          const sourceId = getStringFlag(parsed, '--source');
          const targetPath = getStringFlag(parsed, '--target');
          const content = getStringFlag(parsed, '--content');
          const revision = getStringFlag(parsed, '--revision');
          if (action === 'propose') {
            emitOutput(
              await rpc('workspace.writeback.propose', {
                workspace_id: wsId,
                source_id: sourceId,
                target_path: targetPath,
                content,
                accepted_revision: revision,
              }),
              parsed,
            );
            return 0;
          }
          if (action === 'commit') {
            emitOutput(
              await rpc('workspace.writeback.commit', {
                workspace_id: wsId,
                source_id: sourceId,
                target_path: targetPath,
                content,
                accepted_revision: revision,
              }),
              parsed,
            );
            return 0;
          }
          throw new DaemonRpcError(-32602, 'INVALID_INPUT', `Unknown writeback action '${action ?? ''}'.`);
        }
        break;
      }

      case 'pack': {
        if (!sub || !(NAMESPACE_SUBCOMMANDS.pack?.some((c) => c.name === sub))) {
          throw new DaemonRpcError(-32602, 'INVALID_INPUT', `Unknown pack subcommand '${sub ?? ''}'.`);
        }
        if (sub === 'search' || sub === 'list') {
          const query = sub === 'search' ? rest[0] ?? getStringFlag(parsed, '--query') : getStringFlag(parsed, '--query');
          emitOutput(
            await rpc('pack.list', {
              intent: getStringFlag(parsed, '--intent'),
              origin: getStringFlag(parsed, '--origin'),
              query,
            }),
            parsed,
          );
          return 0;
        }
        if (sub === 'inspect') {
          const target = rest[0];
          if (!target) {
            throw new DaemonRpcError(-32602, 'INVALID_INPUT', 'opl pack inspect requires <packageIdOrDir>.');
          }
          if (fs.existsSync(target) && fs.statSync(target).isDirectory()) {
            const { realRoot, manifest } = readPackageManifestFromDir(target);
            const lockPath = path.join(realRoot, 'opl-release.lock.json');
            const lock = fs.existsSync(lockPath)
              ? verifyReleaseLock(realRoot, undefined, { allowSymlinks: true })
              : null;
            emitOutput({ manifest, dir: realRoot, lock }, parsed);
            return 0;
          }
          emitOutput(await rpc('pack.inspect', { package_id: target }), parsed);
          return 0;
        }
        if (sub === 'build') {
          const dir = rest[0] ?? '.';
          if (!fs.existsSync(dir)) {
            throw new DaemonRpcError(-32602, 'PACK_MISSING_PATH', `Package directory does not exist: ${dir}`);
          }
          const dryRun = getBoolFlag(parsed, '--dry-run');
          const writeLock = !dryRun && !getBoolFlag(parsed, '--no-write-lock');
          const built = buildPackage(dir, { writeLock, dryRun });
          emitOutput(built, parsed);
          return 0;
        }
        if (sub === 'migrate-v1') {
          const repoDir = rest[0] ?? '.';
          if (!fs.existsSync(repoDir)) {
            throw new DaemonRpcError(-32602, 'PACK_MISSING_PATH', `Repository directory does not exist: ${repoDir}`);
          }
          const apply = !getBoolFlag(parsed, '--dry-run');
          const clean = !getBoolFlag(parsed, '--no-clean');
          const migrated = migrateV1Package({ repoDir, apply, clean });
          emitOutput(migrated, parsed);
          return 0;
        }
        if (sub === 'link') {
          const dir = rest[0];
          if (!dir) {
            throw new DaemonRpcError(-32602, 'INVALID_INPUT', 'opl pack link requires <dir>.');
          }
          if (!fs.existsSync(dir)) {
            throw new DaemonRpcError(-32602, 'PACK_MISSING_PATH', `Directory does not exist: ${dir}`);
          }
          if (!fs.existsSync(path.join(dir, 'opl-package.json'))) {
            throw new DaemonRpcError(-32602, 'INVALID_MANIFEST', `Missing opl-package.json in ${dir}`);
          }
          const syncCodex = !getBoolFlag(parsed, '--no-codex-sync');
          emitOutput(await rpc('pack.link', { dir: path.resolve(dir), sync_codex: syncCodex }), parsed);
          return 0;
        }
        if (sub === 'unlink') {
          const packageId = rest[0];
          if (!packageId) {
            throw new DaemonRpcError(-32602, 'INVALID_INPUT', 'opl pack unlink requires <packageId>.');
          }
          emitOutput(await rpc('pack.unlink', { package_id: packageId }), parsed);
          return 0;
        }
        if (sub === 'install') {
          const source = rest[0];
          if (!source) {
            throw new DaemonRpcError(-32602, 'INVALID_INPUT', 'opl pack install requires <source>.');
          }
          const syncCodex = !getBoolFlag(parsed, '--no-codex-sync');
          emitOutput(await rpc('pack.install', { source, sync_codex: syncCodex }), parsed);
          return 0;
        }
        if (sub === 'update') {
          if (getBoolFlag(parsed, '--all')) {
            const method = getBoolFlag(parsed, '--dry-run') ? 'pack.updatePlan' : 'pack.updateAll';
            const result = await rpc(method, { sync_codex: !getBoolFlag(parsed, '--no-codex-sync') }) as { failures?: unknown[] };
            emitOutput(result, parsed);
            return result.failures?.length ? 1 : 0;
          }
          const packageId = rest[0];
          const source = getStringFlag(parsed, '--source') ?? rest[1];
          if (!packageId || !source) {
            throw new DaemonRpcError(-32602, 'INVALID_INPUT', 'opl pack update requires <packageId> --source <spec>.');
          }
          emitOutput(await rpc('pack.update', { package_id: packageId, source }), parsed);
          return 0;
        }
        if (sub === 'uninstall') {
          const packageId = rest[0];
          if (!packageId) {
            throw new DaemonRpcError(-32602, 'INVALID_INPUT', 'opl pack uninstall requires <packageId>.');
          }
          emitOutput(await rpc('pack.uninstall', { package_id: packageId }), parsed);
          return 0;
        }
        if (sub === 'enable' || sub === 'disable') {
          const packageId = rest[0];
          if (!packageId) {
            throw new DaemonRpcError(-32602, 'INVALID_INPUT', `opl pack ${sub} requires <packageId>.`);
          }
          emitOutput(
            await rpc('pack.toggle', { package_id: packageId, enabled: sub === 'enable' }),
            parsed,
          );
          return 0;
        }
        if (sub === 'sync') {
          const packageId = getStringFlag(parsed, '--package');
          emitOutput(
            await rpc('pack.codexSync', {
              ...(packageId ? { package_id: packageId } : {}),
              import_external: true,
            }),
            parsed,
          );
          return 0;
        }
        break;
      }

      case 'connect': {
        if (sub === 'gateway') {
          const { method, params } = await prepareGatewayCommand(rest, parsed.flags);
          emitOutput(await callDaemonRpc(method, params, { stateDir, timeoutMs: 60_000 }), parsed);
          return 0;
        }
        if (!sub || !(NAMESPACE_SUBCOMMANDS.connect?.some((c) => c.name === sub))) {
          throw new DaemonRpcError(-32602, 'INVALID_INPUT', `Unknown connect subcommand '${sub ?? ''}'.`);
        }
        if (sub === 'list') {
          emitOutput(
            await rpc('connect.list', {
              provider_type: getStringFlag(parsed, '--provider-type'),
              status: getStringFlag(parsed, '--status'),
            }),
            parsed,
          );
          return 0;
        }
        if (sub === 'add') {
          const providerType = getStringFlag(parsed, '--provider-type');
          const displayName = getStringFlag(parsed, '--display-name');
          if (!providerType || !displayName) {
            throw new DaemonRpcError(
              -32602,
              'INVALID_INPUT',
              'opl connect add requires --provider-type and --display-name.',
            );
          }
          const capabilities = parseJsonFlag(parsed, '--capabilities');
          emitOutput(
            await rpc('connect.add', {
              connection_id: getStringFlag(parsed, '--connection-id'),
              provider_type: providerType,
              display_name: displayName,
              account_label: getStringFlag(parsed, '--account-label'),
              endpoint: getStringFlag(parsed, '--endpoint'),
              secret: getStringFlag(parsed, '--secret'),
              credential_handle: getStringFlag(parsed, '--credential-handle'),
              ...(capabilities ? { capabilities } : {}),
            }),
            parsed,
          );
          return 0;
        }
        if (sub === 'check') {
          const connId = rest[0];
          if (!connId) {
            throw new DaemonRpcError(-32602, 'INVALID_INPUT', 'opl connect check requires <connectionId>.');
          }
          emitOutput(await rpc('connect.check', { connection_id: connId }), parsed);
          return 0;
        }
        if (sub === 'remove') {
          const connId = rest[0];
          if (!connId) {
            throw new DaemonRpcError(-32602, 'INVALID_INPUT', 'opl connect remove requires <connectionId>.');
          }
          emitOutput(
            await rpc('connect.remove', {
              connection_id: connId,
              purge_secret: getBoolFlag(parsed, '--purge-secret'),
            }),
            parsed,
          );
          return 0;
        }
        if (sub === 'grants') {
          const action = rest[0] ?? 'list';
          if (action === 'list') {
            emitOutput(
              await rpc('connect.grants.list', {
                consumer_package_id: getStringFlag(parsed, '--package'),
                connection_id: getStringFlag(parsed, '--connection-id'),
              }),
              parsed,
            );
            return 0;
          }
          const id = rest[1];
          if (!id) {
            throw new DaemonRpcError(-32602, 'INVALID_INPUT', `opl connect grants ${action} requires <id>.`);
          }
          if (action === 'approve') {
            emitOutput(await rpc('connect.approveRequest', { request_id: id }), parsed);
            return 0;
          }
          if (action === 'deny') {
            emitOutput(await rpc('connect.denyRequest', { request_id: id }), parsed);
            return 0;
          }
          if (action === 'revoke') {
            emitOutput(await rpc('connect.revoke', { grant_id: id }), parsed);
            return 0;
          }
          throw new DaemonRpcError(-32602, 'INVALID_INPUT', `Unknown connect grants action '${action}'.`);
        }
        if (sub === 'channels') {
          const action = rest[0] ?? 'list';
          if (action === 'list') {
            emitOutput(await rpc('connect.channels.list', {}), parsed);
            return 0;
          }
          if (action === 'action') {
            const pkgId = rest[1];
            const ref = rest[2];
            if (!pkgId || !ref) {
              throw new DaemonRpcError(
                -32602,
                'INVALID_INPUT',
                'opl connect channels action requires <packageId> <ref>.',
              );
            }
            const input = (parseJsonFlag(parsed, '--input') as Record<string, unknown> | undefined) ?? {};
            emitOutput(
              await rpc('connect.channels.action', {
                package_id: pkgId,
                ref,
                input,
              }),
              parsed,
            );
            return 0;
          }
          throw new DaemonRpcError(-32602, 'INVALID_INPUT', `Unknown connect channels action '${action}'.`);
        }
        break;
      }

      case 'runway': {
        if (!sub || !(NAMESPACE_SUBCOMMANDS.runway?.some((c) => c.name === sub))) {
          throw new DaemonRpcError(-32602, 'INVALID_INPUT', `Unknown runway subcommand '${sub ?? ''}'.`);
        }
        if (sub === 'start') {
          const wsId = getStringFlag(parsed, '--workspace');
          const agentId = getStringFlag(parsed, '--agent');
          const title = getStringFlag(parsed, '--title');
          const goal = getStringFlag(parsed, '--goal');
          if (!wsId || !title || !goal) {
            throw new DaemonRpcError(
              -32602,
              'INVALID_INPUT',
              'opl runway start requires --workspace, --title, and --goal.',
            );
          }
          const created = (await rpc('runway.task.create', {
            workspace_id: wsId,
            agent_id: agentId,
            title,
            goal_prompt: goal,
            auto_start: true,
          })) as Record<string, unknown>;
          emitOutput(created, parsed);
          return isTaskPausedOrHumanGate(created) ? 4 : 0;
        }
        if (sub === 'list') {
          emitOutput(
            await rpc('runway.task.list', {
              workspace_id: getStringFlag(parsed, '--workspace'),
              status: getStringFlag(parsed, '--status'),
            }),
            parsed,
          );
          return 0;
        }
        if (sub === 'status') {
          const taskId = rest[0];
          if (!taskId) {
            throw new DaemonRpcError(-32602, 'INVALID_INPUT', 'opl runway status requires <taskId>.');
          }
          const res = (await rpc('runway.task.get', { task_id: taskId })) as Record<string, unknown>;
          emitOutput(res, parsed);
          return isTaskPausedOrHumanGate(res) ? 4 : 0;
        }
        if (sub === 'logs') {
          const taskId = rest[0];
          if (!taskId) {
            throw new DaemonRpcError(-32602, 'INVALID_INPUT', 'opl runway logs requires <taskId>.');
          }
          const [taskRes, tlRes] = await Promise.all([
            rpc('runway.task.get', { task_id: taskId }),
            rpc('ledger.timeline', { task_id: taskId }),
          ]);
          emitOutput({ task: taskRes, timeline: tlRes }, parsed);
          return 0;
        }
        if (sub === 'pause' || sub === 'resume' || sub === 'cancel') {
          const taskId = rest[0];
          if (!taskId) {
            throw new DaemonRpcError(-32602, 'INVALID_INPUT', `opl runway ${sub} requires <taskId>.`);
          }
          emitOutput(
            await rpc(`runway.task.${sub}`, {
              task_id: taskId,
              reason: getStringFlag(parsed, '--reason'),
            }),
            parsed,
          );
          return 0;
        }
        if (sub === 'decide') {
          const srId = rest[0];
          const decision = getStringFlag(parsed, '--decision');
          if (!srId || !decision) {
            throw new DaemonRpcError(-32602, 'INVALID_INPUT', 'opl runway decide requires <stageRunId> --decision.');
          }
          const expectedRevision = parseIntegerFlag(parsed, '--expected-revision', { min: 0 });
          emitOutput(
            await rpc('runway.humanGate.resolve', {
              stage_run_id: srId,
              decision,
              ...(expectedRevision !== undefined ? { expected_revision: expectedRevision } : {}),
              notes: getStringFlag(parsed, '--notes'),
            }),
            parsed,
          );
          return 0;
        }
        if (sub === 'executors') {
          const method = rest[0] === 'health' ? 'runway.executors.health' : 'runway.executors.list';
          emitOutput(await rpc(method, {}), parsed);
          return 0;
        }
        if (sub === 'schedules') {
          const action = rest[0] ?? 'list';
          if (action === 'list') {
            emitOutput(
              await rpc('runway.schedule.list', {
                workspace_id: getStringFlag(parsed, '--workspace'),
              }),
              parsed,
            );
            return 0;
          }
          if (action === 'create') {
            const wsId = getStringFlag(parsed, '--workspace');
            const cron = getStringFlag(parsed, '--cron');
            if (!wsId || !cron) {
              throw new DaemonRpcError(
                -32602,
                'INVALID_INPUT',
                'opl runway schedules create requires --workspace and --cron.',
              );
            }
            emitOutput(
              await rpc('runway.schedule.create', {
                workspace_id: wsId,
                agent_id: getStringFlag(parsed, '--agent'),
                cron_expr: cron,
                overlap_policy: getStringFlag(parsed, '--overlap') ?? 'skip',
                payload: {
                  title: getStringFlag(parsed, '--title') ?? 'Scheduled Task',
                  goal_prompt: getStringFlag(parsed, '--goal') ?? 'Scheduled run',
                },
              }),
              parsed,
            );
            return 0;
          }
          if (action === 'toggle') {
            const schedId = rest[1];
            const enabledRaw = getStringFlag(parsed, '--enabled');
            if (!schedId || enabledRaw === undefined) {
              throw new DaemonRpcError(
                -32602,
                'INVALID_INPUT',
                'opl runway schedules toggle requires <scheduleId> --enabled <true|false>.',
              );
            }
            emitOutput(
              await rpc('runway.schedule.toggle', {
                schedule_id: schedId,
                enabled: enabledRaw === 'true',
              }),
              parsed,
            );
            return 0;
          }
          if (action === 'delete') {
            const schedId = rest[1];
            if (!schedId) {
              throw new DaemonRpcError(-32602, 'INVALID_INPUT', 'opl runway schedules delete requires <scheduleId>.');
            }
            emitOutput(await rpc('runway.schedules.delete', { schedule_id: schedId }), parsed);
            return 0;
          }
          throw new DaemonRpcError(-32602, 'INVALID_INPUT', `Unknown runway schedules action '${action}'.`);
        }
        break;
      }

      case 'ledger': {
        if (!sub || !(NAMESPACE_SUBCOMMANDS.ledger?.some((c) => c.name === sub))) {
          throw new DaemonRpcError(-32602, 'INVALID_INPUT', `Unknown ledger subcommand '${sub ?? ''}'.`);
        }
        const taskId = rest[0];
        if (!taskId) {
          throw new DaemonRpcError(-32602, 'INVALID_INPUT', `opl ledger ${sub} requires <taskId>.`);
        }
        if (sub === 'timeline') {
          const limit = parseIntegerFlag(parsed, '--limit', { min: 1 });
          emitOutput(
            await rpc('ledger.timeline', {
              task_id: taskId,
              entry_kind: getStringFlag(parsed, '--kind'),
              ...(limit !== undefined ? { limit } : {}),
            }),
            parsed,
          );
          return 0;
        }
        if (sub === 'artifacts') {
          emitOutput(await rpc('ledger.artifacts', { task_id: taskId }), parsed);
          return 0;
        }
        if (sub === 'receipts') {
          emitOutput(await rpc('ledger.receipts', { task_id: taskId }), parsed);
          return 0;
        }
        if (sub === 'debts') {
          emitOutput(
            await rpc('ledger.debts', {
              task_id: taskId,
              unresolved_only: getBoolFlag(parsed, '--unresolved'),
            }),
            parsed,
          );
          return 0;
        }
        if (sub === 'review') {
          const verdict = getStringFlag(parsed, '--verdict');
          const ownerId = getStringFlag(parsed, '--owner');
          if (!verdict || !ownerId) {
            throw new DaemonRpcError(
              -32602,
              'INVALID_INPUT',
              'opl ledger review requires <taskId> --verdict and --owner.',
            );
          }
          emitOutput(
            await rpc('ledger.review.record', {
              task_id: taskId,
              verdict,
              owner_id: ownerId,
              stage_run_id: getStringFlag(parsed, '--stage-run'),
            }),
            parsed,
          );
          return 0;
        }
        if (sub === 'verify') {
          const res = (await rpc('ledger.verify', {
            task_id: taskId,
            check_file_hashes: true,
          })) as { ok?: boolean };
          emitOutput(res, parsed);
          return res?.ok === true ? 0 : 1;
        }
        break;
      }

      default: {
        // Dynamic CLI extensions lookup (only enabled installed packages)
        // After the extension subcommand, --state-dir belongs to its own arguments
        // (for example, the output directory for "opl foundry eval").
        const extensions = await discoverCliExtensions(parsed.extensionStateDir);
        const match = extensions.find((e) => e.namespace === ns);
        if (!match) {
          throw new DaemonRpcError(
            -32601,
            'METHOD_NOT_FOUND',
            `Unknown or uninstalled command namespace '${ns}'. Run 'opl --help' for available commands.`,
          );
        }
        if (parsed.help && !sub) {
          const helpText = [
            `Usage: opl ${match.namespace} <command> [args]`,
            '',
            'Commands:',
            ...match.commands.map((c) => `  ${c}`),
          ].join('\n');
          process.stdout.write(`${helpText}\n`);
          return 0;
        }
        if (!sub) {
          throw new DaemonRpcError(
            -32602,
            'INVALID_INPUT',
            `Extension '${match.namespace}' requires a command (${match.commands.join(', ')}).`,
          );
        }
        const extParsed = extractExtensionArgsAndOpts(argv, ns!, sub, parsed.help);
        const out = await invokeCliExtension(match, sub, extParsed.args, extParsed.opts, parsed.extensionStateDir);
        if (
          parsed.help
          && !parsed.json
          && out
          && typeof out === 'object'
          && !Array.isArray(out)
          && typeof (out as Record<string, unknown>).help === 'string'
        ) {
          const helpStr = (out as { help: string }).help;
          process.stdout.write(helpStr.endsWith('\n') ? helpStr : `${helpStr}\n`);
          return 0;
        }
        emitOutput(out, parsed);
        if (out && typeof out === 'object' && !Array.isArray(out)) {
          const rec = out as Record<string, unknown>;
          if (rec.ok === false) {
            const exitCode = rec.exit_code;
            return typeof exitCode === 'number' && Number.isInteger(exitCode) && exitCode > 0 ? exitCode : 1;
          }
        }
        return 0;
      }
    }

    throw new DaemonRpcError(-32602, 'INVALID_INPUT', `Unhandled command '${parsed.positionals.join(' ')}'.`);
  } catch (error) {
    return emitError(error, parsed);
  }
}
