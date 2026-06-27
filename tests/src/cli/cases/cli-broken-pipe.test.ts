import { assert, cliPath, repoRoot, spawn, test } from '../helpers.ts';

test('CLI exits cleanly when stdout pipe closes early', async () => {
  const child = spawn(
    process.execPath,
    ['--experimental-strip-types', cliPath, 'help'],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        NODE_NO_WARNINGS: '1',
        OPL_FAMILY_RUNTIME_PROVIDER: 'local_sqlite',
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
  }, 5_000);

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
