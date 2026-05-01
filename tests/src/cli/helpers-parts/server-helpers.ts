import assert from 'node:assert/strict';
import { spawn, type ChildProcessByStdio } from 'node:child_process';
import { type Server } from 'node:http';
import { type Readable, type Writable } from 'node:stream';

import { cliPath, contractsDir, repoRoot } from './constants.ts';

const jsonLineReadState = new WeakMap<Readable, { bufferedText: string }>();

function getJsonLineReadState(stream: Readable) {
  let state = jsonLineReadState.get(stream);
  if (!state) {
    state = { bufferedText: '' };
    jsonLineReadState.set(stream, state);
  }
  return state;
}

function takeBufferedJsonLine(stream: Readable) {
  const state = getJsonLineReadState(stream);

  while (true) {
    const newlineIndex = state.bufferedText.indexOf('\n');
    if (newlineIndex === -1) {
      return null;
    }

    const line = state.bufferedText.slice(0, newlineIndex).trim();
    state.bufferedText = state.bufferedText.slice(newlineIndex + 1);
    if (line) {
      return line;
    }
  }
}

export async function readJsonLine(stream: Readable) {
  const bufferedLine = takeBufferedJsonLine(stream);
  if (bufferedLine) {
    return JSON.parse(bufferedLine) as Record<string, unknown>;
  }

  return await new Promise<Record<string, unknown>>((resolve, reject) => {
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const onClose = () => {
      cleanup();
      reject(new Error('MCP bridge closed before emitting the next JSON line.'));
    };
    const cleanup = () => {
      stream.off('data', onData);
      stream.off('error', onError);
      stream.off('end', onClose);
      stream.off('close', onClose);
    };
    const onData = (chunk: Buffer | string) => {
      const state = getJsonLineReadState(stream);
      state.bufferedText += chunk.toString();
      const line = takeBufferedJsonLine(stream);
      if (!line) {
        return;
      }

      cleanup();
      try {
        resolve(JSON.parse(line) as Record<string, unknown>);
      } catch (error) {
        reject(error);
      }
    };

    stream.on('data', onData);
    stream.once('error', onError);
    stream.once('end', onClose);
    stream.once('close', onClose);
  });
}

export function writeJsonLine(stream: NodeJS.WritableStream, payload: Record<string, unknown>) {
  stream.write(`${JSON.stringify(payload)}\n`);
}

export async function stopCliPipeChild(
  child: ChildProcessByStdio<Writable, Readable, Readable>,
) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  child.stdin.end();
  await new Promise<void>((resolve) => {
    const forceKill = setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGKILL');
      }
    }, 2_000);

    child.once('exit', () => {
      clearTimeout(forceKill);
      resolve();
    });
    child.kill('SIGTERM');
  });
}

export async function stopHttpServer(server: Server) {
  await new Promise<void>((resolve, reject) => {
    server.closeAllConnections?.();
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

export async function startCliServer(
  args: string[],
  envOverrides: Record<string, string> = {},
  timeoutMs = 10_000,
): Promise<{
  child: ChildProcessByStdio<null, Readable, Readable>;
  payload: Record<string, unknown>;
  stdout: string;
  stderr: string;
}> {
  return await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ['--experimental-strip-types', cliPath, ...args],
      {
        cwd: repoRoot,
        env: {
          ...process.env,
          NODE_NO_WARNINGS: '1',
          ...envOverrides,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    let stdout = '';
    let stderr = '';

    const finishReject = (message: string) => {
      clearTimeout(timeout);
      child.kill('SIGTERM');
      reject(new Error(`${message}\nstdout=${stdout}\nstderr=${stderr}`));
    };

    const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
      finishReject(`CLI server exited before startup payload was ready (code=${code}, signal=${signal}).`);
    };

    const timeout = setTimeout(() => {
      finishReject('Timed out while waiting for CLI server startup payload.');
    }, timeoutMs);

    child.once('exit', onExit);
    child.stderr.on('data', (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });
    child.stdout.on('data', (chunk: Buffer | string) => {
      stdout += chunk.toString();

      try {
        const payload = JSON.parse(stdout.trim()) as Record<string, unknown>;
        clearTimeout(timeout);
        child.off('exit', onExit);
        resolve({
          child,
          payload,
          stdout,
          stderr,
        });
      } catch {
        // Wait until the full startup payload is written.
      }
    });
  });
}

export async function stopCliServer(child: ChildProcessByStdio<null, Readable, Readable>) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  await new Promise<void>((resolve) => {
    const forceKill = setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGKILL');
      }
    }, 2_000);

    child.once('exit', () => {
      clearTimeout(forceKill);
      resolve();
    });
    child.kill('SIGTERM');
  });
}

export function assertContractsContext(
  output: { contracts_context?: { contracts_dir: string; contracts_root_source: string } },
  contractsRootSource: string,
  expectedContractsDir = contractsDir,
) {
  assert.deepEqual(output.contracts_context, {
    contracts_dir: expectedContractsDir,
    contracts_root_source: contractsRootSource,
  });
}

export function assertNoContractsProvenance(payload: {
  help?: unknown;
  error?: { details?: Record<string, unknown> };
  contracts_context?: unknown;
}) {
  assert.equal(payload.contracts_context, undefined);
  assert.equal(payload.error?.details?.contracts_dir, undefined);
  assert.equal(payload.error?.details?.contracts_root_source, undefined);
}
