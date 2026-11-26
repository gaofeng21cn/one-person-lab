import { toErrorMessage } from '@opl/core';
import { createDaemonRpcRouter } from './rpc/router.ts';
import { OpldSocketServer, type DaemonSessionFilePayload } from './server/socket-server.ts';
import { DaemonRuntime } from './state/runtime.ts';

export interface StartedDaemonServer {
  readonly runtime: DaemonRuntime;
  readonly server: OpldSocketServer;
  readonly session: DaemonSessionFilePayload;
  readonly shutdown: () => Promise<void>;
  readonly waitUntilClosed: () => Promise<void>;
}

export async function startDaemonServer(options: {
  readonly stateDir?: string;
  readonly registerSignalHandlers?: boolean;
} = {}): Promise<StartedDaemonServer> {
  let serverRef: OpldSocketServer | null = null;
  let closingPromise: Promise<void> | null = null;
  let resolveClosed: (() => void) | null = null;
  const closedPromise = new Promise<void>((resolve) => {
    resolveClosed = resolve;
  });

  const runtime = DaemonRuntime.start({
    stateDir: options.stateDir,
    onEvent: (method, params) => {
      serverRef?.broadcast(method, params);
    },
  });

  const shutdown = async () => {
    if (closingPromise) return closingPromise;
    closingPromise = (async () => {
      try {
        await serverRef?.close();
      } finally {
        await runtime.shutdown();
        resolveClosed?.();
      }
    })();
    return closingPromise;
  };

  const handlers = createDaemonRpcRouter(runtime);
  const server = new OpldSocketServer({
    runtime,
    handlers,
    onRequestShutdown: shutdown,
  });
  serverRef = server;

  let session: DaemonSessionFilePayload;
  try {
    await runtime.initializeAsync();
    session = await server.listen();
  } catch (error) {
    await runtime.shutdown();
    throw error;
  }

  if (options.registerSignalHandlers) {
    const onSignal = () => {
      void shutdown().then(() => process.exit(0));
    };
    process.once('SIGTERM', onSignal);
    process.once('SIGINT', onSignal);
  }

  return {
    runtime,
    server,
    session,
    shutdown,
    waitUntilClosed: () => closedPromise,
  };
}

function formatStartupError(error: unknown): string {
  if (error instanceof Error) {
    const code =
      'code' in error && typeof (error as { code?: unknown }).code === 'string'
        ? (error as { code: string }).code
        : 'errorCode' in error && typeof (error as { errorCode?: unknown }).errorCode === 'string'
          ? (error as { errorCode: string }).errorCode
          : null;
    if (code && !error.message.includes(code)) {
      return `${code}: ${error.message}`;
    }
    return error.message;
  }
  return toErrorMessage(error);
}

export async function runDaemonForeground(options: { readonly stateDir?: string } = {}): Promise<number> {
  try {
    const started = await startDaemonServer({
      stateDir: options.stateDir,
      registerSignalHandlers: true,
    });
    await started.waitUntilClosed();
    return 0;
  } catch (error) {
    process.stderr.write(`opld failed to start: ${formatStartupError(error)}\n`);
    process.exitCode = 1;
    return 1;
  }
}
