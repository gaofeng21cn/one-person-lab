import { assert, cliPath, repoRoot, spawn, test } from '../helpers.ts';

// The watchdog exists to catch a CLI that hangs on a closed pipe, not to assert
// startup latency: a loaded host can spend several seconds booting the
// TypeScript entrypoint. Share the lane's CLI budget instead of hard-coding one.
const exitWatchdogMs = Number.parseInt(process.env.OPL_CLI_TEST_TIMEOUT_MS ?? '', 10) || 30_000;

test('CLI exits cleanly when stdout pipe closes early', async () => {
  const child = spawn(
    process.execPath,
    ['--experimental-strip-types', cliPath, 'help'],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        NODE_NO_WARNINGS: '1',
        OPL_FAMILY_RUNTIME_PROVIDER: 'temporal',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  const stderrChunks: Buffer[] = [];
  child.stderr?.on('data', (chunk: Buffer | string) => {
    stderrChunks.push(Buffer.from(chunk));
  });
  const exit = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => resolve({ code, signal }));
  });
  const timeout = setTimeout(() => {
    child.kill('SIGKILL');
  }, exitWatchdogMs);

  child.stdout?.destroy();

  try {
    const result = await exit;
    const stderr = Buffer.concat(stderrChunks).toString('utf8');
    assert.equal(result.signal, null, stderr);
    assert.equal(result.code, 0, stderr);
  } finally {
    clearTimeout(timeout);
  }
});
