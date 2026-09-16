import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { assert, fs, os, path, runCli, shellSingleQuote, test } from '../helpers.ts';
import { verifyCodexAppServer } from '../../../../src/adapters/integration/system-installation/codex-app-server-smoke.ts';
import { resolveEngineActionSpec, rollbackCodexRuntimeGeneration } from '../../../../src/adapters/integration/system-installation/engine-helpers.ts';
import { runOplFrameworkSelfUpdate, runOplFrameworkSelfRollback } from '../../../../src/adapters/integration/system-installation/framework-self-update.ts';
import { acquireManagedUpdateLock, managedUpdateLockFilePath } from '../../../../src/adapters/integration/managed-update-lock.ts';
import { activatePendingRuntimeGenerations } from '../../../../src/adapters/integration/system-installation/runtime-activation.ts';
import { codexProtocolFixture } from './system-startup-maintenance-cases/codex-protocol-fixture.ts';

async function environment<T>(values: Record<string, string>, run: () => Promise<T>) {
  const old = new Map(Object.keys(values).map((key) => [key, process.env[key]]));
  Object.assign(process.env, values);
  try { return await run(); } finally {
    for (const [key, value] of old) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
}

async function readLoggedFrames(logPath: string) {
  // The provider writes its first frame as soon as node starts. Under a loaded
  // test lane that can lag behind a short smoke timeout, so wait for the file
  // instead of racing the kill.
  const deadline = Date.now() + 5_000;
  while (!fs.existsSync(logPath) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return fs.readFileSync(logPath, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
}

function executable(file: string, content: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, { mode: 0o755 });
}

test('Codex protocol smoke isolates state, accepts read-only handshake and reaps failures', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-protocol-tests-'));
  try {
    await environment({ OPENAI_API_KEY: 'fixture-credential-must-not-reach-smoke' }, async () => {
      for (const mode of ['normal', 'version_only', 'bad_json', 'bad_initialize', 'bad_list', 'error', 'timeout', 'exit', 'crash_after_list']) {
        const binary = path.join(root, `codex-${mode}`);
        const log = path.join(root, `${mode}.jsonl`);
        executable(binary, codexProtocolFixture('0.141.0', mode, log));
        // Every mode gets the same budget: the timeout mode asserts that a
        // stalled provider is reaped, not that node can boot within one second.
        const result = await verifyCodexAppServer(binary, 3000);
        assert.equal(result.verified, mode === 'normal', `${mode}: ${JSON.stringify(result)}`);
        if (mode === 'timeout') assert.equal(result.reason, 'app_server_timeout');
        const frames = await readLoggedFrames(log);
        const identity = frames[0];
        assert.equal(identity.apiKey, undefined);
        assert.notEqual(identity.home, process.env.HOME);
        assert.equal(identity.cwd, identity.home);
        assert.equal(path.dirname(identity.codexHome), identity.home);
        assert.equal(fs.existsSync(identity.home), false);
        assert.throws(() => process.kill(identity.pid, 0), /ESRCH/);
        if (mode === 'normal') assert.deepEqual(frames.slice(1).map((frame) => frame.method), ['initialize', 'initialized', 'thread/list']);
      }
    });
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

type ActivationOutput = {
  runtime_activation: {
    status: string;
    codex: { status: string; reason?: string; runtime_binary_path?: string | null };
    framework: { status: string; reason?: string };
  };
};

test('offline activate uses verified pending only, defers same instance and preserves rollback', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-activate-tests-'));
  const runtime = path.join(root, 'runtime');
  const codex = path.join(runtime, 'current', 'bin', 'codex');
  const npm = path.join(root, 'bin', 'npm');
  const binarySource = path.join(root, 'new-codex');
  const protocolLog = path.join(root, 'protocol.jsonl');
  const framework = path.join(root, 'framework');
  const sideEffects = path.join(root, 'side-effects');
  const installer = `#!/bin/bash
set -eu
prefix="$3"
mkdir -p "$prefix/node_modules/@openai/codex" "$prefix/node_modules/@openai/codex-darwin-arm64/vendor/aarch64-apple-darwin/bin"
cp ${shellSingleQuote(binarySource)} "$prefix/node_modules/@openai/codex-darwin-arm64/vendor/aarch64-apple-darwin/bin/codex"
`;
  const env = {
    HOME: root, CODEX_HOME: path.join(root, '.codex'), OPL_RUNTIME_ROOT: runtime,
    OPL_STATE_DIR: path.join(root, 'state'), OPL_CODEX_BIN: codex,
    OPL_FRAMEWORK_UPDATE_TARGET_ROOT: framework, OPL_FRAMEWORK_UPDATE_SOURCE: '',
    OPL_CODEX_CLI_LATEST_VERSION: '0.141.0', OPL_APP_PROCESS_INSTANCE_ID: 'before',
    OPL_CODEX_UPDATE_COMMAND: '', OPL_CODEX_INSTALL_COMMAND: '',
    PATH: `${path.join(root, 'bin')}:/usr/bin:/bin`,
  };
  try {
    await environment(env, async () => {
      executable(codex, codexProtocolFixture('0.130.0'));
      executable(npm, installer);
      const old = fs.readFileSync(codex);
      const pendingPath = path.join(runtime, 'pending-codex-generation.json');
      const install = resolveEngineActionSpec('codex', 'update').executable!;
      for (const mode of ['version_only', 'bad_list', 'exit']) {
        executable(binarySource, codexProtocolFixture('0.141.0', mode));
        const rejected = await install();
        assert.equal(rejected.exitCode, 1);
        assert.match(rejected.stderr, /staged_codex_binary_failed_protocol_verification/);
        assert.equal(fs.existsSync(pendingPath), false);
        assert.deepEqual(fs.readFileSync(codex), old);
        assert.deepEqual(fs.readdirSync(path.join(runtime, 'generations')), []);
      }
      executable(binarySource, codexProtocolFixture('0.141.0', 'normal', protocolLog));
      assert.equal((await install()).exitCode, 0);
      const pendingBytes = fs.readFileSync(pendingPath, 'utf8');
      const pending = JSON.parse(pendingBytes);
      assert.equal(pending.protocol_verification.verified, true);
      const originalProtocolLog = fs.readFileSync(protocolLog, 'utf8');

      const archiveSource = path.join(root, 'archive-source');
      for (const directory of [framework, archiveSource]) {
        executable(path.join(directory, 'bin', 'opl'), '#!/bin/bash\nexit 0\n');
        executable(path.join(directory, 'dist', 'entrypoints', 'cli.js'), '// runtime\n');
        fs.writeFileSync(path.join(directory, 'package.json'), '{"name":"opl-framework","version":"0.3.5"}');
      }
      fs.writeFileSync(path.join(framework, 'marker'), 'old');
      fs.writeFileSync(path.join(archiveSource, 'marker'), 'new');
      const archive = path.join(root, 'framework.tgz');
      assert.equal(spawnSync('/usr/bin/tar', ['-czf', archive, '-C', archiveSource, '.']).status, 0);
      const staged = runOplFrameworkSelfUpdate({ targetRoot: framework, sourceArchive: archive,
        sourceArchiveSha256: crypto.createHash('sha256').update(fs.readFileSync(archive)).digest('hex'),
        skipDependencyInstall: true, stageOnly: true });
      assert.equal(staged.reason, 'framework_runtime_artifact_staged_for_restart');
      const frameworkPendingBytes = fs.readFileSync(`${framework}.pending.json`, 'utf8');

      // Any download, installer, native carrier or Temporal invocation would leave evidence.
      for (const command of ['npm', 'curl', 'brew', 'temporal', 'git', 'launchctl', 'codex-plugin']) {
        executable(path.join(root, 'bin', command), `#!/bin/bash\necho ${command} >> ${shellSingleQuote(sideEffects)}\nexit 91\n`);
      }
      const activate = (instance: string) => runCli(['update', 'activate'], {
        ...env, OPL_APP_PROCESS_INSTANCE_ID: instance, OPL_CODEX_PLUGIN_BIN: path.join(root, 'bin', 'codex-plugin'),
      }) as ActivationOutput;
      const deferred = activate('before');
      assert.equal(deferred.runtime_activation.status, 'deferred_same_app_instance');
      assert.equal(deferred.runtime_activation.codex.status, 'deferred_same_app_instance');
      assert.equal(deferred.runtime_activation.framework.status, 'deferred_same_app_instance');
      assert.equal(fs.readFileSync(pendingPath, 'utf8'), pendingBytes);
      assert.equal(fs.readFileSync(`${framework}.pending.json`, 'utf8'), frameworkPendingBytes);

      const lock = acquireManagedUpdateLock({ operation: 'apply', componentId: 'opl_base' });
      try { assert.equal(activate('after').runtime_activation.status, 'lock_contended'); }
      finally { lock.release(); }

      // Negative activation checks run against each owner without consuming the other pending generation.
      await environment({ OPL_APP_PROCESS_INSTANCE_ID: 'after' }, async () => {
        const stagedBinary = path.join(pending.generation_root, 'bin', 'codex');
        const validBinary = fs.readFileSync(stagedBinary);
        fs.appendFileSync(stagedBinary, '\n// modified after validation\n');
        fs.appendFileSync(path.join(`${framework}.pending`, 'marker'), 'modified');
        const corrupt = activatePendingRuntimeGenerations();
        assert.equal(corrupt.runtime_activation.codex.status, 'manual_required');
        assert.equal(corrupt.runtime_activation.framework.status, 'manual_required');
        assert.deepEqual(fs.readFileSync(codex), old);
        assert.equal(fs.readFileSync(path.join(framework, 'marker'), 'utf8'), 'old');
        fs.writeFileSync(stagedBinary, validBinary);
        fs.writeFileSync(path.join(`${framework}.pending`, 'marker'), 'new');
        fs.writeFileSync(pendingPath, JSON.stringify({ ...pending, protocol_verification: undefined }));
        fs.mkdirSync(path.join(framework, '.git'));
        const legacy = activatePendingRuntimeGenerations();
        assert.equal(legacy.runtime_activation.codex.status, 'manual_required');
        assert.equal(legacy.runtime_activation.framework.status, 'manual_required');
        fs.rmSync(path.join(framework, '.git'), { recursive: true });
        fs.writeFileSync(pendingPath, pendingBytes);
      });
      const activated = activate('after');
      assert.equal(activated.runtime_activation.codex.status, 'activated');
      assert.equal(activated.runtime_activation.framework.status, 'activated');
      assert.equal(activated.runtime_activation.status, 'activated');
      assert.equal(activated.runtime_activation.codex.runtime_binary_path, codex);
      assert.equal(fs.existsSync(pendingPath), false);
      assert.equal(fs.existsSync(`${framework}.pending.json`), false);
      assert.equal(fs.readFileSync(path.join(framework, 'marker'), 'utf8'), 'new');
      assert.match(fs.readFileSync(codex, 'utf8'), /0\.141\.0/);
      assert.equal(activate('after').runtime_activation.status, 'no_pending_generation');
      assert.equal(fs.existsSync(sideEffects), false);
      assert.equal(fs.readFileSync(protocolLog, 'utf8'), originalProtocolLog);
      assert.equal(fs.existsSync(managedUpdateLockFilePath()), false);
      assert.equal(rollbackCodexRuntimeGeneration().status, 'completed');
      assert.equal(runOplFrameworkSelfRollback({ targetRoot: framework }).status, 'completed');
      assert.deepEqual(fs.readFileSync(codex), old);
      assert.equal(fs.readFileSync(path.join(framework, 'marker'), 'utf8'), 'old');
    });
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
