import type { RpcHandler } from '../server/socket-server.ts';
import type { DaemonRuntime } from '../state/runtime.ts';
import { registerAppRoutes } from './routes/app.ts';
import { registerConnectRoutes } from './routes/connect.ts';
import { registerDaemonRoutes } from './routes/daemon.ts';
import { registerLedgerRoutes } from './routes/ledger.ts';
import { registerPackRoutes } from './routes/pack.ts';
import { registerRunwayRoutes } from './routes/runway.ts';
import { registerWorkspaceRoutes } from './routes/workspace.ts';

export { requireClientContext, requireTrustedHost, resolveSocketSessionId } from './context.ts';

export function createDaemonRpcRouter(runtime: DaemonRuntime): Map<string, RpcHandler> {
  const handlers = new Map<string, RpcHandler>();
  registerConnectRoutes(handlers, runtime);
  registerDaemonRoutes(handlers, runtime);
  registerAppRoutes(handlers, runtime);
  registerWorkspaceRoutes(handlers, runtime);
  registerPackRoutes(handlers, runtime);
  registerRunwayRoutes(handlers, runtime);
  registerLedgerRoutes(handlers, runtime);
  return handlers;
}
