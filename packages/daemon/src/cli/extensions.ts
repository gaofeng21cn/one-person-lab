import fs from 'node:fs';
import { isRecord, openSqliteStore, resolveStatePaths } from '@opl/core';
import { parsePackageManifestV2, type ModuleOrCommandEntrypoint } from '@opl/pack';
import { DaemonRpcError } from '../errors.ts';
import { runCliEntrypoint, runEsmEntrypoint } from '../utils/subprocess-esm.ts';
import { callDaemonRpc, probeSocket } from './client.ts';

export interface CliExtensionDescriptor {
  readonly package_id: string;
  readonly namespace: string;
  readonly install_path: string;
  readonly entrypoint: ModuleOrCommandEntrypoint;
  readonly commands: readonly string[];
  readonly description: string | null;
}

interface RawInstalledPkg {
  readonly package_id: string;
  readonly install_path: string;
  readonly enabled: boolean | number;
  readonly manifest?: Record<string, unknown>;
  readonly manifest_json?: string;
}

async function listInstalledEnabledPackages(stateDir?: string): Promise<RawInstalledPkg[]> {
  const paths = resolveStatePaths({ stateDir });
  if (fs.existsSync(paths.session_file)) {
    try {
      const sess = JSON.parse(fs.readFileSync(paths.session_file, 'utf8')) as { socket_path?: string };
      if (sess.socket_path && (await probeSocket(sess.socket_path, 150))) {
        const res = (await callDaemonRpc(
          'pack.list',
          { enabled_only: true },
          { stateDir, autoStart: false },
        )) as { packages?: RawInstalledPkg[] };
        if (Array.isArray(res?.packages)) {
          return res.packages;
        }
      }
    } catch {
      // fall through to read-only SQLite probe
    }
  }

  if (!fs.existsSync(paths.db_file)) {
    return [];
  }

  const db = openSqliteStore(paths.db_file, { readOnly: true });
  try {
    const rows = db
      .prepare('SELECT package_id, install_path, enabled, manifest_json FROM installed_packages WHERE enabled = 1')
      .all() as Array<{ package_id: string; install_path: string; enabled: number; manifest_json: string }>;
    return rows;
  } catch {
    return [];
  } finally {
    db.close();
  }
}

export async function discoverCliExtensions(stateDir?: string): Promise<CliExtensionDescriptor[]> {
  let pkgs = await listInstalledEnabledPackages(stateDir);
  if (pkgs.length === 0 && stateDir) {
    pkgs = await listInstalledEnabledPackages(undefined);
  }
  const discovered: CliExtensionDescriptor[] = [];

  for (const pkg of pkgs) {
    if (pkg.enabled === false || pkg.enabled === 0) continue;
    let manifestRaw: unknown = pkg.manifest;
    if (!manifestRaw && typeof pkg.manifest_json === 'string') {
      try {
        manifestRaw = JSON.parse(pkg.manifest_json);
      } catch {
        continue;
      }
    }
    let cliExts: Array<{ namespace: string; entrypoint: ModuleOrCommandEntrypoint }> = [];
    if (isRecord(manifestRaw)) {
      try {
        const parsed = parsePackageManifestV2(manifestRaw);
        cliExts = [...(parsed.provides?.cli_extensions ?? [])];
      } catch {
        const rawProvides = isRecord(manifestRaw.provides) ? manifestRaw.provides : null;
        if (rawProvides && Array.isArray(rawProvides.cli_extensions)) {
          cliExts = rawProvides.cli_extensions as Array<{
            namespace: string;
            entrypoint: ModuleOrCommandEntrypoint;
          }>;
        }
      }
    } else {
      const topProvides = (pkg as unknown as Record<string, unknown>).provides;
      if (isRecord(topProvides) && Array.isArray(topProvides.cli_extensions)) {
        cliExts = topProvides.cli_extensions as Array<{
          namespace: string;
          entrypoint: ModuleOrCommandEntrypoint;
        }>;
      } else {
        continue;
      }
    }

    for (const ext of cliExts) {
      if (!ext || typeof ext.namespace !== 'string' || !ext.entrypoint) continue;
      let commands: string[] = [];
      let description: string | null = null;
      try {
        if (ext.entrypoint.kind === 'esm_module') {
          const probed = (await runEsmEntrypoint(pkg.install_path, ext.entrypoint, 'probe_cli_ext', {
            package_id: pkg.package_id,
            namespace: ext.namespace,
          })) as Record<string, unknown>;
          if (Array.isArray(probed.commands)) {
            commands = probed.commands.filter((c): c is string => typeof c === 'string');
          }
          if (typeof probed.description === 'string') {
            description = probed.description;
          }
        }
      } catch {
        // Keep descriptor discoverable even if optional probe fails
      }

      discovered.push({
        package_id: pkg.package_id,
        namespace: ext.namespace,
        install_path: pkg.install_path,
        entrypoint: ext.entrypoint,
        commands,
        description,
      });
    }
  }

  return discovered;
}

export async function invokeCliExtension(
  ext: CliExtensionDescriptor,
  command: string,
  args: readonly string[],
  options: Record<string, unknown>,
): Promise<unknown> {
  const callerCwd = process.cwd();
  if (ext.entrypoint.kind === 'cli') {
    return runCliEntrypoint(
      ext.install_path,
      ext.entrypoint,
      {
        context: { package_id: ext.package_id, namespace: ext.namespace, caller_cwd: callerCwd },
        command,
        args: [...args],
        options,
      },
      {
        extraArgs: [command, ...args],
        env: { ...process.env, OPL_CALLER_CWD: callerCwd },
      },
    );
  }

  if (ext.commands.length > 0 && !ext.commands.includes(command)) {
    throw new DaemonRpcError(
      -32602,
      'INVALID_INPUT',
      `Unknown '${ext.namespace}' command '${command}'. Available: ${ext.commands.join(', ')}`,
    );
  }

  return runEsmEntrypoint(ext.install_path, ext.entrypoint, 'invoke_cli_ext', {
    context: { package_id: ext.package_id, namespace: ext.namespace, caller_cwd: callerCwd },
    command,
    args: [...args],
    options,
  });
}
