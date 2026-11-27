import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { isRecord } from '@opl/core';
import { resolveCodexBinary } from './binary.ts';

const readVersion = promisify(execFile);
const timeoutMs = 8_000;

type VersionCheck = { signature: string; ready: boolean };
let lastVersionCheck: VersionCheck | undefined;

function binarySignature(binaryPath: string): string | undefined {
  const stat = fs.statSync(binaryPath, { bigint: true, throwIfNoEntry: false });
  if (!stat) return undefined;
  return [binaryPath, stat.dev, stat.ino, stat.size, stat.ctimeNs].join(':');
}

// Page mounts read the last observed version result as long as the selected
// file is unchanged. A first mount can still render before an explicit check.
export function codexStartupReady(env: NodeJS.ProcessEnv = process.env): boolean {
  try {
    const candidate = resolveCodexBinary(undefined, env);
    if (!candidate) return false;
    const signature = binarySignature(candidate.path);
    if (!signature) return false;
    return lastVersionCheck?.signature === signature ? lastVersionCheck.ready : true;
  } catch {
    return false;
  }
}

async function readCodexVersion(binaryPath: string, env: NodeJS.ProcessEnv, cwd: string): Promise<string> {
  const { stdout } = await readVersion(binaryPath, ['--version'], {
    cwd, env, timeout: timeoutMs, killSignal: 'SIGKILL', maxBuffer: 64 * 1024,
  });
  const version = /^codex(?:-cli)?\s+(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)$/.exec(stdout.trim())?.[1];
  if (!version) throw new Error('Codex CLI returned an invalid version.');
  return version;
}

export async function checkCodexExecutable(binaryPath: string, env: NodeJS.ProcessEnv): Promise<boolean> {
  const signature = binarySignature(binaryPath);
  if (!signature) return false;
  let ready = true;
  try {
    await readCodexVersion(binaryPath, env, os.tmpdir());
  } catch {
    ready = false;
  }
  if (binarySignature(binaryPath) !== signature) return false;
  lastVersionCheck = { signature, ready };
  return ready;
}

export async function verifyCodexAppServer(binaryPath: string, sourceEnv: NodeJS.ProcessEnv): Promise<string> {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'opl-codex-protocol-')));
  const codexHome = path.join(root, '.codex');

  // Do not inherit credentials, provider configuration, user skills or project trust.
  const env: NodeJS.ProcessEnv = { HOME: root, USERPROFILE: root, CODEX_HOME: codexHome };
  for (const key of ['PATH', 'SystemRoot', 'SYSTEMROOT', 'WINDIR', 'TMPDIR', 'TEMP', 'TMP']) {
    if (sourceEnv[key]) env[key] = sourceEnv[key];
  }
  try {
    fs.mkdirSync(codexHome);
    const version = await readCodexVersion(binaryPath, env, root);
    await new Promise<void>((resolve, reject) => {
      const child = spawn(binaryPath, ['app-server'], {
        cwd: root, env, stdio: ['pipe', 'pipe', 'pipe'], detached: process.platform !== 'win32',
      });
      let phase: 'initialize' | 'thread_list' | 'complete' = 'initialize';
      let failure: string | null = null;
      let output = '';
      let outputBytes = 0;
      let terminating = false;
      let shutdownTimer: ReturnType<typeof setTimeout> | undefined;
      let killTimer: ReturnType<typeof setTimeout> | undefined;
      const signal = (value: NodeJS.Signals) => {
        try {
          if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, value);
          else child.kill(value);
        } catch { /* The process may already have exited. */ }
      };
      const terminate = () => {
        if (terminating) return;
        terminating = true;
        signal('SIGTERM');
        killTimer = setTimeout(() => signal('SIGKILL'), 200);
      };
      const fail = (reason: string) => {
        failure ??= reason;
        terminate();
      };
      const deadline = setTimeout(() => fail('app_server_timeout'), timeoutMs);
      const send = (frame: object) => child.stdin.write(`${JSON.stringify(frame)}\n`);
      child.stdin.on('error', () => fail('app_server_stdin_failed'));
      child.on('error', () => fail('app_server_spawn_failed'));
      child.stderr.on('data', (chunk: Buffer) => {
        outputBytes += chunk.length;
        if (outputBytes > 1024 * 1024) fail('app_server_output_limit');
      });
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (chunk: string) => {
        if (failure) return;
        outputBytes += Buffer.byteLength(chunk);
        if (outputBytes > 1024 * 1024) return fail('app_server_output_limit');
        output += chunk;
        let newline: number;
        while (!failure && (newline = output.indexOf('\n')) >= 0) {
          const line = output.slice(0, newline).trim();
          output = output.slice(newline + 1);
          if (!line) continue;
          let frame: unknown;
          try { frame = JSON.parse(line); } catch { return fail('app_server_invalid_json'); }
          if (!isRecord(frame)) return fail('app_server_invalid_frame');
          if (!('id' in frame) && typeof frame.method === 'string') continue;
          if ('error' in frame || !isRecord(frame.result)) return fail('app_server_invalid_response');
          if (phase === 'initialize' && frame.id === 1 && typeof frame.result.userAgent === 'string' && frame.result.userAgent.trim()) {
            phase = 'thread_list';
            send({ method: 'initialized', params: {} });
            send({ id: 2, method: 'thread/list', params: { limit: 1 } });
          } else if (phase === 'thread_list' && frame.id === 2 && Array.isArray(frame.result.data)
            && (frame.result.nextCursor === null || typeof frame.result.nextCursor === 'string')) {
            phase = 'complete';
            clearTimeout(deadline);
            child.stdin.end();
            shutdownTimer = setTimeout(terminate, 500);
          } else return fail('app_server_invalid_protocol');
        }
      });
      child.on('close', (code) => {
        clearTimeout(deadline);
        clearTimeout(shutdownTimer);
        clearTimeout(killTimer);
        if (output.trim()) failure ??= 'app_server_incomplete_frame';
        if (phase !== 'complete' || (!terminating && code !== 0)) failure ??= 'app_server_unexpected_exit';
        if (failure) reject(new Error(`Codex App Server verification failed: ${failure}`));
        else resolve();
      });
      send({ id: 1, method: 'initialize', params: { clientInfo: { name: 'opl_runtime_verifier', version: '1' } } });
    });
    return version;
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}
