import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { providerWorkerNodeExecutable } from './family-runtime-provider-worker-supervisor-state.ts';

import {
  probeTemporalServer,
  resolveTemporalAddressForPaths,
} from './family-runtime-temporal-service.ts';

const MAX_LOG_BYTES = 10 * 1024 * 1024;
const LOG_BACKUP_COUNT = 4;
const INITIAL_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 30_000;
const HEALTH_INTERVAL_MS = 15_000;
const HEALTH_FAILURE_LIMIT = 4;
const MAX_RESIDENT_SET_BYTES = 1536 * 1024 * 1024;
const MEMORY_FAILURE_LIMIT = 4;

type LauncherPaths = { root: string };

function workerModulePath() {
  const current = fileURLToPath(import.meta.url);
  const extension = path.extname(current) || '.js';
  return path.join(path.dirname(current), `family-runtime-temporal-provider${extension}`);
}

function workerBootstrapModulePath() {
  const current = fileURLToPath(import.meta.url);
  const extension = path.extname(current) || '.js';
  return path.join(
    path.dirname(current),
    '..',
    '..',
    'entrypoints',
    `temporal-worker-bootstrap${extension}`,
  );
}

export function buildTemporalProviderWorkerProcessArgs(
  modulePath = workerModulePath(),
  bootstrapPath = workerBootstrapModulePath(),
) {
  return [
    ...(modulePath.endsWith('.ts') ? ['--experimental-strip-types'] : []),
    '--import',
    pathToFileURL(bootstrapPath).href,
    modulePath,
  ];
}

export function nextTemporalDependencyBackoffMs(attempt: number) {
  const exponent = Math.max(0, Math.min(30, attempt));
  return Math.min(MAX_BACKOFF_MS, INITIAL_BACKOFF_MS * (2 ** exponent));
}

export function rotateBoundedLog(logPath: string, maxBytes = MAX_LOG_BYTES, backups = LOG_BACKUP_COUNT) {
  if (!fs.existsSync(logPath) || fs.statSync(logPath).size < maxBytes) return false;
  const currentSize = fs.statSync(logPath).size;
  fs.rmSync(`${logPath}.${backups}`, { force: true });
  for (let index = backups - 1; index >= 1; index -= 1) {
    const source = `${logPath}.${index}`;
    if (fs.existsSync(source)) fs.renameSync(source, `${logPath}.${index + 1}`);
  }
  if (currentSize > maxBytes) {
    const descriptor = fs.openSync(logPath, 'r');
    try {
      const tail = Buffer.alloc(maxBytes);
      fs.readSync(descriptor, tail, 0, maxBytes, currentSize - maxBytes);
      fs.writeFileSync(`${logPath}.1`, tail);
    } finally {
      fs.closeSync(descriptor);
    }
    fs.rmSync(logPath, { force: true });
  } else {
    fs.renameSync(logPath, `${logPath}.1`);
  }
  return true;
}

export function parseResidentSetBytes(value: string) {
  const kibibytes = Number.parseInt(value.trim(), 10);
  return Number.isSafeInteger(kibibytes) && kibibytes >= 0 ? kibibytes * 1024 : null;
}

function residentSetBytes(pid: number) {
  const result = spawnSync('/bin/ps', ['-o', 'rss=', '-p', String(pid)], { encoding: 'utf8' });
  return result.status === 0 ? parseResidentSetBytes(result.stdout) : null;
}

function appendBoundedLog(logPath: string, chunk: Buffer) {
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  if (fs.existsSync(logPath) && fs.statSync(logPath).size + chunk.length > MAX_LOG_BYTES) {
    rotateBoundedLog(logPath);
  }
  fs.appendFileSync(logPath, chunk);
}

function launcherLogPaths(paths: LauncherPaths) {
  const logs = path.join(paths.root, 'logs');
  return {
    stdout: path.join(logs, 'provider-worker-supervisor.out.log'),
    stderr: path.join(logs, 'provider-worker-supervisor.err.log'),
  };
}

function logJson(logPath: string, payload: Record<string, unknown>) {
  appendBoundedLog(logPath, Buffer.from(`${JSON.stringify(payload)}\n`));
}

export function parseProviderWorkerLauncherRoot(argv: string[]) {
  const index = argv.indexOf('--family-runtime-root');
  const root = index >= 0 ? argv[index + 1]?.trim() : '';
  if (!root || !path.isAbsolute(root)) {
    throw new Error('Provider worker launcher requires an absolute --family-runtime-root.');
  }
  return root;
}

async function waitForTemporalDependency(input: {
  address: string;
  stderrPath: string;
  shutdownRequested: () => boolean;
}) {
  let attempt = 0;
  while (!input.shutdownRequested()) {
    if (await probeTemporalServer(input.address, 2_000)) return true;
    const delayMs = nextTemporalDependencyBackoffMs(attempt);
    if (attempt === 0 || delayMs === MAX_BACKOFF_MS) {
      logJson(input.stderrPath, {
        event: 'temporal_dependency_wait',
        address: input.address,
        retry_in_ms: delayMs,
      });
    }
    attempt += 1;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return false;
}

function forwardSignal(child: ChildProcess | null, signal: NodeJS.Signals) {
  if (child?.pid) child.kill(signal);
}

export async function runProviderWorkerLauncher(argv = process.argv.slice(2)) {
  const nodeExecutable = providerWorkerNodeExecutable();
  const paths = { root: parseProviderWorkerLauncherRoot(argv) };
  const logs = launcherLogPaths(paths);
  rotateBoundedLog(logs.stdout);
  rotateBoundedLog(logs.stderr);
  const resolved = resolveTemporalAddressForPaths(paths);
  if (!resolved.address) {
    throw new Error('Provider worker launcher requires a managed Temporal address.');
  }

  let shutdownRequested = false;
  let child: ChildProcess | null = null;
  const requestShutdown = (signal: NodeJS.Signals) => {
    shutdownRequested = true;
    forwardSignal(child, signal);
  };
  const onSigterm = () => requestShutdown('SIGTERM');
  const onSigint = () => requestShutdown('SIGINT');
  process.once('SIGTERM', onSigterm);
  process.once('SIGINT', onSigint);
  try {
    const ready = await waitForTemporalDependency({
      address: resolved.address,
      stderrPath: logs.stderr,
      shutdownRequested: () => shutdownRequested,
    });
    if (!ready) return 0;

    const modulePath = workerModulePath();
    child = spawn(nodeExecutable, [
      ...buildTemporalProviderWorkerProcessArgs(modulePath),
      '--temporal-worker-foreground',
      '--family-runtime-root',
      paths.root,
    ], {
      env: {
        ...process.env,
        OPL_TEMPORAL_ADDRESS: resolved.address,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout?.on('data', (chunk: Buffer) => appendBoundedLog(logs.stdout, chunk));
    child.stderr?.on('data', (chunk: Buffer) => appendBoundedLog(logs.stderr, chunk));

    let consecutiveHealthFailures = 0;
    let consecutiveMemoryFailures = 0;
    const monitor = setInterval(() => {
      void probeTemporalServer(resolved.address!, 2_000).then((reachable) => {
        consecutiveHealthFailures = reachable ? 0 : consecutiveHealthFailures + 1;
        if (consecutiveHealthFailures >= HEALTH_FAILURE_LIMIT && child?.pid) {
          logJson(logs.stderr, {
            event: 'temporal_dependency_unavailable',
            address: resolved.address,
            consecutive_failures: consecutiveHealthFailures,
            action: 'restart_worker_through_launchd',
          });
          child.kill('SIGTERM');
        }
      });
      const rssBytes = child?.pid ? residentSetBytes(child.pid) : null;
      consecutiveMemoryFailures = rssBytes !== null && rssBytes > MAX_RESIDENT_SET_BYTES
        ? consecutiveMemoryFailures + 1
        : 0;
      if (consecutiveMemoryFailures >= MEMORY_FAILURE_LIMIT && child?.pid) {
        logJson(logs.stderr, {
          event: 'provider_worker_memory_ceiling_exceeded',
          rss_bytes: rssBytes,
          ceiling_bytes: MAX_RESIDENT_SET_BYTES,
          consecutive_samples: consecutiveMemoryFailures,
          action: 'restart_worker_through_launchd',
        });
        child.kill('SIGTERM');
      }
    }, HEALTH_INTERVAL_MS);
    monitor.unref();

    return await new Promise<number>((resolve, reject) => {
      child!.once('error', reject);
      child!.once('exit', (code, signal) => {
        clearInterval(monitor);
        if (shutdownRequested || signal === 'SIGTERM' || signal === 'SIGINT') {
          resolve(0);
          return;
        }
        resolve(code ?? 1);
      });
    });
  } finally {
    process.off('SIGTERM', onSigterm);
    process.off('SIGINT', onSigint);
  }
}

if (process.argv[2] === '--provider-worker-launcher') {
  void runProviderWorkerLauncher(process.argv.slice(3)).then(
    (code) => { process.exitCode = code; },
    (error) => {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 1;
    },
  );
}
