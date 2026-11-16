import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const wrapper = new URL('../../src/kernel/typescript-api.ts', import.meta.url).href;
const quote = (value: string) => `'${value.replace(/'/g, `'"'"'`)}'`;

test('TypeScript native stderr cannot precede a structured CLI error', { skip: process.platform === 'win32' }, async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "opl-typescript noisy'fixture-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const nativePackage = fileURLToPath(import.meta.resolve(`@typescript/typescript-${process.platform}-${process.arch}/package.json`));
  const native = path.join(path.dirname(nativePackage), 'lib', 'tsc');
  const executable = path.join(root, 'noisy-tsc');
  const pidFile = path.join(root, 'compiler.pid');
  const source = path.join(root, 'handler.ts');
  fs.writeFileSync(source, 'export function evaluate() { return 1; }\n');
  fs.writeFileSync(executable, `#!/bin/sh\nprintf 'context canceled\\n' >&2\nprintf '%s' "$$" >${quote(pidFile)}\nexec ${quote(native)} "$@"\n`, { mode: 0o700 });
  const script = `
    import { withTypescriptAPI } from ${JSON.stringify(wrapper)};
    import { FrameworkContractError } from ${JSON.stringify(new URL('../../src/kernel/contract-validation.ts', import.meta.url).href)};
    const source = ${JSON.stringify(source)};
    const configPath = ${JSON.stringify(path.join(root, 'tsconfig.json'))};
    const config = JSON.stringify({ compilerOptions: { noLib: true, types: [] }, files: [source] });
    let name;
    try {
      withTypescriptAPI({ cwd: ${JSON.stringify(root)}, tsserverPath: ${JSON.stringify(executable)}, fs: {
        fileExists: file => file === configPath ? true : undefined,
        readFile: file => file === configPath ? config : undefined,
      } }, api => {
        const snapshot = api.updateSnapshot({ openProjects: [configPath] });
        try {
          name = snapshot.getProject(configPath).program.getSourceFile(source).fileName;
          throw new FrameworkContractError('cli_usage_error', 'Empty evidence template');
        } finally { snapshot.dispose(); }
      });
    } catch (error) {
      if (!(error instanceof FrameworkContractError)) throw error;
      process.stdout.write(JSON.stringify({ source: name }));
      process.stderr.write(JSON.stringify({ error: { code: error.code } }));
    }
  `;
  const result = spawnSync(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e', script], { encoding: 'utf8', timeout: 15_000 });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).source, source);
  assert.deepEqual(JSON.parse(result.stderr), { error: { code: 'cli_usage_error' } });
  const pid = Number(fs.readFileSync(pidFile, 'utf8'));
  const deadline = Date.now() + 1_000;
  while (true) {
    try { process.kill(pid, 0); } catch { break; }
    assert.ok(Date.now() < deadline, 'closing the API must terminate the compiler child');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
});

test('TypeScript native failures retain diagnostics inside the thrown error', { skip: process.platform === 'win32' }, (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-typescript-failure-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const executable = path.join(root, 'failed-tsc');
  fs.writeFileSync(executable, "#!/bin/sh\nprintf 'native compiler unavailable\\n' >&2\nexit 17\n", { mode: 0o700 });
  const script = `
    import { withTypescriptAPI } from ${JSON.stringify(wrapper)};
    try { withTypescriptAPI({ tsserverPath: ${JSON.stringify(executable)} }, api => api.parseConfigFile('tsconfig.json')); }
    catch (error) { process.stderr.write(JSON.stringify({ error: { message: error.message } })); }
  `;
  const result = spawnSync(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e', script], { encoding: 'utf8', timeout: 15_000 });
  assert.equal(result.status, 0, result.stderr);
  const error = JSON.parse(result.stderr).error;
  assert.match(error.message, /TypeScript native diagnostics: native compiler unavailable/);
  assert.equal(result.stdout, '');
});
