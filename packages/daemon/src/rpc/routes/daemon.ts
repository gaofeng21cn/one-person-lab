import type { RpcHandler } from '../../server/socket-server.ts';
import type { DaemonRuntime } from '../../state/runtime.ts';
import { pickBoolean } from '../../utils/normalize.ts';
import { requireTrustedHost } from '../context.ts';

export function registerDaemonRoutes(handlers: Map<string, RpcHandler>, runtime: DaemonRuntime): void {
  handlers.set('daemon.health', () => ({
    ok: true,
    status: 'healthy',
    pid: process.pid,
    version: runtime.version,
    api_version: '2.0',
    started_at: runtime.startedAt,
    db_ok: true,
  }));

  handlers.set('daemon.info', () => ({
    ok: true,
    pid: process.pid,
    version: runtime.version,
    api_version: '2.0',
    base_version: runtime.version,
    started_at: runtime.startedAt,
    state_dir: runtime.paths.state_dir,
    db_file: runtime.paths.db_file,
    socket_path: runtime.paths.socket_path,
    session_file: runtime.paths.session_file,
    marketplace_root: runtime.marketplaceRoot,
  }));

  handlers.set('daemon.doctor', async (params) => {
    const includeFirstRun = pickBoolean(params, 'include_first_run', 'includeFirstRun') ?? false;
    if (includeFirstRun) await runtime.waitForInitialPackageDiscovery();
    return runtime.doctor(includeFirstRun);
  });

  handlers.set('daemon.shutdown', (_params, conn) => {
    requireTrustedHost(conn, 'daemon.shutdown');
    return {
      ok: true,
      shutting_down: true,
    };
  });
}
