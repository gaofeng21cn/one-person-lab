import { runCli } from './main.ts';

const BROKEN_PIPE_GUARD_KEY = Symbol.for('opl.cli.brokenPipeGuardInstalled');

function isBrokenPipeError(err: unknown): boolean {
  const code = (err as NodeJS.ErrnoException | null | undefined)?.code;
  return code === 'EPIPE' || code === 'ERR_STREAM_DESTROYED';
}

function installBrokenPipeGuard(stream: NodeJS.WriteStream): void {
  if (!stream || typeof stream.on !== 'function') return;
  const tagged = stream as NodeJS.WriteStream & { [BROKEN_PIPE_GUARD_KEY]?: boolean };
  if (tagged[BROKEN_PIPE_GUARD_KEY]) return;
  tagged[BROKEN_PIPE_GUARD_KEY] = true;
  stream.on('error', (err: unknown) => {
    if (isBrokenPipeError(err)) return;
    throw err;
  });
}

function flushStream(stream: NodeJS.WriteStream): Promise<void> {
  return new Promise((resolve) => {
    if (
      !stream
      || stream.destroyed
      || !stream.writable
      || stream.writableEnded
      || stream.errored
    ) {
      resolve();
      return;
    }
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      stream.off('error', finish);
      stream.off('close', finish);
      resolve();
    };
    stream.once('error', finish);
    stream.once('close', finish);
    try {
      stream.write('', () => {
        finish();
      });
    } catch {
      finish();
    }
  });
}

installBrokenPipeGuard(process.stdout);
installBrokenPipeGuard(process.stderr);

const code = await runCli(process.argv.slice(2));
await Promise.all([flushStream(process.stdout), flushStream(process.stderr)]);
process.exit(code);
