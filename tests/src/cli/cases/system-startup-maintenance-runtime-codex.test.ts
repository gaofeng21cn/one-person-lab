import { assert, fs, os, path, runCli, shellSingleQuote, test } from '../helpers.ts';
import { runGitFixtureCommand } from '../helpers-parts/family-fixtures.ts';
import { withCliTimeout } from './system-startup-maintenance-cases/shared.ts';
import { rollbackCodexRuntimeGeneration } from '../../../../src/modules/connect/system-installation/engine-helpers.ts';

function writeFakeNpmRuntimeInstaller(fakeNpm: string, logPath: string) {
  fs.writeFileSync(
    fakeNpm,
    [
      '#!/usr/bin/env bash',
      'set -euo pipefail',
      'for arg in "$@"; do',
      '  if [[ "$arg" == "-g" ]]; then',
      '    echo "global npm mutation is forbidden in this fixture" >&2',
      '    exit 23',
      '  fi',
      'done',
      `printf '%s\\n' "$*" >> ${shellSingleQuote(logPath)}`,
      'if [[ "$1" == "install" && "$2" == "--prefix" ]]; then',
      '  prefix="$3"',
      '  package_root="$prefix/node_modules/@openai/codex"',
      '  vendor_root="$prefix/node_modules/@openai/codex-darwin-arm64/vendor/aarch64-apple-darwin"',
      '  mkdir -p "$package_root"',
      '  mkdir -p "$vendor_root/bin" "$vendor_root/codex-path"',
      '  printf \'%s\\n\' \'#!/usr/bin/env bash\' \'echo "codex-cli 0.134.0"\' > "$vendor_root/bin/codex"',
      '  printf \'%s\\n\' \'#!/usr/bin/env bash\' \'echo "rg staged"\' > "$vendor_root/codex-path/rg"',
      '  chmod +x "$vendor_root/bin/codex" "$vendor_root/codex-path/rg"',
      '  echo "installed staged @openai/codex@latest"',
      '  exit 0',
      'fi',
      'echo "Unexpected npm command: $*" >&2',
      'exit 1',
      '',
    ].join('\n'),
    { mode: 0o755 },
  );
}

test('system startup-maintenance applies staged App-owned runtime Codex update without global npm', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-startup-maintenance-runtime-codex-'));
  const runtimeBin = path.join(homeRoot, 'runtime', 'current', 'bin');
  const runtimeCodex = path.join(runtimeBin, 'codex');
  const runtimeRg = path.join(runtimeBin, 'rg');
  const fakeBin = path.join(homeRoot, 'fake-bin');
  const fakeNpm = path.join(fakeBin, 'npm');
  const npmLog = path.join(homeRoot, 'npm.log');
  const developerCheckout = path.join(homeRoot, 'developer-module-checkout');

  fs.mkdirSync(runtimeBin, { recursive: true });
  fs.mkdirSync(fakeBin, { recursive: true });
  fs.writeFileSync(runtimeCodex, '#!/usr/bin/env bash\necho "codex-cli 0.130.0"\n', { mode: 0o755 });
  fs.writeFileSync(runtimeRg, '#!/usr/bin/env bash\necho "rg old"\n', { mode: 0o755 });
  const fullRuntimeSentinels = new Map([
    ['bin/opl', '#!/usr/bin/env bash\necho "opl full runtime"\n'],
    ['opl/package.json', '{"name":"one-person-lab"}\n'],
    ['python/lib/python3.12/site-packages/opl_framework/source_transport.py', 'FULL_MAG_IMPORT_OK = True\n'],
    ['contracts/framework-contract.json', '{"surface":"framework"}\n'],
    ['modules/mag/opl-runtime-module.json', '{"module_id":"medautogrant"}\n'],
  ]);
  for (const [relativePath, content] of fullRuntimeSentinels) {
    const targetPath = path.join(homeRoot, 'runtime', 'current', relativePath);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, content, relativePath === 'bin/opl' ? { mode: 0o755 } : undefined);
  }
  const sentinelBytes = new Map(
    [...fullRuntimeSentinels.keys()].map((relativePath) => [
      relativePath,
      fs.readFileSync(path.join(homeRoot, 'runtime', 'current', relativePath)),
    ]),
  );
  writeFakeNpmRuntimeInstaller(fakeNpm, npmLog);

  fs.mkdirSync(developerCheckout, { recursive: true });
  runGitFixtureCommand(developerCheckout, ['init', '--initial-branch', 'main']);
  fs.writeFileSync(path.join(developerCheckout, 'README.md'), '# Developer checkout\n', 'utf8');
  runGitFixtureCommand(developerCheckout, ['add', 'README.md']);
  runGitFixtureCommand(developerCheckout, [
    '-c',
    'user.name=OPL Test',
    '-c',
    'user.email=opl@example.test',
    'commit',
    '-m',
    'Initial developer checkout',
  ]);

  try {
    const env = {
      HOME: homeRoot,
      CODEX_HOME: path.join(homeRoot, 'codex-home'),
      OPL_STATE_DIR: path.join(homeRoot, 'opl-state'),
      OPL_MODULES_ROOT: path.join(homeRoot, 'managed-modules'),
      OPL_CODEX_BIN: runtimeCodex,
      OPL_MIN_CODEX_CLI_VERSION: '0.130.0',
      OPL_CODEX_CLI_LATEST_VERSION: '0.134.0',
      OPL_APP_PROCESS_INSTANCE_ID: 'app-instance-before-restart',
      OPL_MODULE_PATH_MEDAUTOSCIENCE: developerCheckout,
      OPL_MODULE_PATH_MEDAUTOGRANT: developerCheckout,
      OPL_MODULE_PATH_REDCUBE: developerCheckout,
      OPL_MODULE_PATH_OPLMETAAGENT: developerCheckout,
      OPL_MODULE_PATH_OPLBOOKFORGE: developerCheckout,
      OPL_MODULE_PATH_SCHOLARSKILLS: developerCheckout,
      PATH: `${fakeBin}:/usr/bin:/bin`,
      ...{ OPL_COMPANION_DISABLE_REMOTE_INSTALL: '1' },
    };
    const output = withCliTimeout('120000', () => runCli(['system', 'startup-maintenance'], env)) as {
      system_action: {
        details: {
          engine_targets: Array<{
            target_id: string;
            status: string;
            reason: string;
            action: string | null;
            result: {
              strategy: string;
              note: string | null;
              command_preview: string[];
              stdout: string;
            } | null;
          }>;
          engine_summary: {
            completed_targets_count: number;
            manual_required_targets_count: number;
          };
          pending_runtime_activation: { status: string };
          refreshed_system_environment: {
            core_engines: {
              codex: {
                version: string | null;
                latest_version_status: string;
                runtime_substrate_updater: {
                  global_toolchain_mutation_allowed: boolean;
                  latest_version_status: string;
                };
              };
            };
          };
        };
      };
    };

    const engineTarget = output.system_action.details.engine_targets[0];
    assert.equal(engineTarget.target_id, 'codex');
    assert.equal(engineTarget.status, 'completed');
    assert.equal(engineTarget.reason, 'codex_cli_latest_outdated');
    assert.equal(engineTarget.action, 'update');
    assert.equal(engineTarget.result?.strategy, 'builtin');
    assert.equal(engineTarget.result?.command_preview.includes('-g'), false);
    assert.match(engineTarget.result?.command_preview.join(' ') ?? '', /--prefix/);
    assert.match(engineTarget.result?.note ?? '', /does not modify global Homebrew, npm, or system Codex/);
    assert.match(engineTarget.result?.stdout ?? '', /opl_runtime_substrate_update_receipt/);
    assert.match(engineTarget.result?.stdout ?? '', /codex-darwin-arm64/);
    assert.equal(output.system_action.details.engine_summary.completed_targets_count, 1);
    assert.equal(output.system_action.details.engine_summary.manual_required_targets_count, 0);
    assert.equal(output.system_action.details.pending_runtime_activation.status, 'no_pending_generation');
    assert.equal(output.system_action.details.refreshed_system_environment.core_engines.codex.version, 'codex-cli 0.130.0');
    assert.equal(
      output.system_action.details.refreshed_system_environment.core_engines.codex.latest_version_status,
      'outdated',
    );
    assert.equal(
      output.system_action.details.refreshed_system_environment.core_engines.codex.runtime_substrate_updater
        .global_toolchain_mutation_allowed,
      false,
    );
    assert.equal(
      output.system_action.details.refreshed_system_environment.core_engines.codex.runtime_substrate_updater
        .latest_version_status,
      'outdated',
    );
    assert.doesNotMatch(fs.readFileSync(npmLog, 'utf8'), / -g( |$)/);
    assert.match(fs.readFileSync(runtimeCodex, 'utf8'), /0\.130\.0/);
    const pendingMetadataPath = path.join(homeRoot, 'runtime', 'pending-codex-generation.json');
    assert.equal(fs.existsSync(pendingMetadataPath), true);
    const pendingBeforeDaily = fs.readFileSync(pendingMetadataPath, 'utf8');
    const pendingGeneration = JSON.parse(pendingBeforeDaily) as { generation_root: string };
    const pendingBin = path.join(pendingGeneration.generation_root, 'bin');
    for (const entry of fs.readdirSync(pendingBin)) {
      if (entry !== 'codex' && entry !== 'rg') {
        fs.rmSync(path.join(pendingBin, entry), { recursive: true, force: true });
      }
    }
    assert.deepEqual(fs.readdirSync(pendingBin).sort(), ['codex', 'rg']);
    const npmLogBeforeDaily = fs.readFileSync(npmLog, 'utf8');

    const daily = withCliTimeout('120000', () => runCli(['system', 'startup-maintenance'], {
      ...env,
      OPL_APP_PROCESS_INSTANCE_ID: 'app-instance-before-restart',
    })) as { system_action: { details: { pending_runtime_activation: { status: string } } } };
    assert.equal(daily.system_action.details.pending_runtime_activation.status, 'deferred_same_app_instance');
    assert.match(fs.readFileSync(runtimeCodex, 'utf8'), /0\.130\.0/);
    assert.equal(fs.readFileSync(pendingMetadataPath, 'utf8'), pendingBeforeDaily);
    assert.equal(fs.readFileSync(npmLog, 'utf8'), npmLogBeforeDaily);

    const activated = withCliTimeout('120000', () => runCli(['system', 'startup-maintenance'], {
      ...env,
      OPL_APP_PROCESS_INSTANCE_ID: 'app-instance-after-restart',
    })) as {
      system_action: { details: { pending_runtime_activation: { status: string } } };
    };
    assert.equal(activated.system_action.details.pending_runtime_activation.status, 'activated');
    assert.match(fs.readFileSync(runtimeCodex, 'utf8'), /0\.134\.0/);
    assert.match(fs.readFileSync(runtimeRg, 'utf8'), /rg staged/);
    for (const [relativePath, expectedBytes] of sentinelBytes) {
      assert.deepEqual(
        fs.readFileSync(path.join(homeRoot, 'runtime', 'current', relativePath)),
        expectedBytes,
        `${relativePath} must survive Codex activation`,
      );
    }

    const previousRuntimeRoot = process.env.OPL_RUNTIME_ROOT;
    process.env.OPL_RUNTIME_ROOT = path.join(homeRoot, 'runtime');
    try {
      for (const failureAt of [2, 3]) {
        let renameCount = 0;
        assert.throws(
          () => rollbackCodexRuntimeGeneration({
            renameSync(from, to) {
              renameCount += 1;
              if (renameCount === failureAt) throw new Error(`injected Codex rollback failure ${failureAt}`);
              fs.renameSync(from, to);
            },
          }),
          /injected Codex rollback failure/,
        );
        assert.match(fs.readFileSync(runtimeCodex, 'utf8'), /0\.134\.0/);
        assert.match(
          fs.readFileSync(path.join(homeRoot, 'runtime', 'previous-toolchain', 'codex'), 'utf8'),
          /0\.130\.0/,
        );
        assert.equal(
          fs.readdirSync(path.join(homeRoot, 'runtime'))
            .some((entry) => entry.startsWith('.rollback-toolchain-swap-')),
          false,
        );
      }
      const rolledBack = rollbackCodexRuntimeGeneration();
      assert.equal(rolledBack.status, 'completed');
      assert.match(fs.readFileSync(runtimeCodex, 'utf8'), /0\.130\.0/);
      assert.match(fs.readFileSync(runtimeRg, 'utf8'), /rg old/);
      for (const [relativePath, expectedBytes] of sentinelBytes) {
        assert.deepEqual(
          fs.readFileSync(path.join(homeRoot, 'runtime', 'current', relativePath)),
          expectedBytes,
          `${relativePath} must survive Codex rollback`,
        );
      }
    } finally {
      if (previousRuntimeRoot === undefined) delete process.env.OPL_RUNTIME_ROOT;
      else process.env.OPL_RUNTIME_ROOT = previousRuntimeRoot;
    }
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});

test('system startup-maintenance installs missing App-owned runtime Codex on clean machines', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-startup-maintenance-missing-runtime-codex-'));
  const runtimeBin = path.join(homeRoot, 'runtime', 'current', 'bin');
  const runtimeCodex = path.join(runtimeBin, 'codex');
  const runtimeRg = path.join(runtimeBin, 'rg');
  const fakeBin = path.join(homeRoot, 'fake-bin');
  const fakeNpm = path.join(fakeBin, 'npm');
  const npmLog = path.join(homeRoot, 'npm.log');
  const developerCheckout = path.join(homeRoot, 'developer-module-checkout');

  fs.mkdirSync(fakeBin, { recursive: true });
  writeFakeNpmRuntimeInstaller(fakeNpm, npmLog);

  fs.mkdirSync(developerCheckout, { recursive: true });
  runGitFixtureCommand(developerCheckout, ['init', '--initial-branch', 'main']);
  fs.writeFileSync(path.join(developerCheckout, 'README.md'), '# Developer checkout\n', 'utf8');
  runGitFixtureCommand(developerCheckout, ['add', 'README.md']);
  runGitFixtureCommand(developerCheckout, [
    '-c',
    'user.name=OPL Test',
    '-c',
    'user.email=opl@example.test',
    'commit',
    '-m',
    'Initial developer checkout',
  ]);

  try {
    const output = withCliTimeout('120000', () => runCli(['system', 'startup-maintenance'], {
      HOME: homeRoot,
      CODEX_HOME: path.join(homeRoot, 'codex-home'),
      OPL_STATE_DIR: path.join(homeRoot, 'opl-state'),
      OPL_MODULES_ROOT: path.join(homeRoot, 'managed-modules'),
      OPL_RUNTIME_ROOT: path.join(homeRoot, 'runtime'),
      OPL_CODEX_BIN: '',
      OPL_MIN_CODEX_CLI_VERSION: '0.134.0',
      OPL_CODEX_CLI_LATEST_VERSION: '0.134.0',
      OPL_APP_PROCESS_INSTANCE_ID: 'clean-install-app-instance',
      OPL_MODULE_PATH_MEDAUTOSCIENCE: developerCheckout,
      OPL_MODULE_PATH_MEDAUTOGRANT: developerCheckout,
      OPL_MODULE_PATH_REDCUBE: developerCheckout,
      OPL_MODULE_PATH_OPLMETAAGENT: developerCheckout,
      OPL_MODULE_PATH_OPLBOOKFORGE: developerCheckout,
      OPL_MODULE_PATH_SCHOLARSKILLS: developerCheckout,
      PATH: `${fakeBin}:/usr/bin:/bin`,
      ...{ OPL_COMPANION_DISABLE_REMOTE_INSTALL: '1' },
    })) as {
      system_action: {
        details: {
          engine_targets: Array<{
            target_id: string;
            status: string;
            reason: string;
            action: string | null;
            version_status_before: string;
            latest_version_status_before: string;
            result: {
              strategy: string;
              note: string | null;
              command_preview: string[];
              stdout: string;
            } | null;
          }>;
          engine_summary: {
            completed_targets_count: number;
            manual_required_targets_count: number;
          };
          refreshed_system_environment: {
            core_engines: {
              codex: {
                installed: boolean;
                version: string | null;
                version_status: string;
                latest_version_status: string;
                runtime_substrate_updater: {
                  global_toolchain_mutation_allowed: boolean;
                  current_binary_installed: boolean;
                  latest_version_status: string;
                };
              };
            };
          };
        };
      };
    };

    const engineTarget = output.system_action.details.engine_targets[0];
    assert.equal(engineTarget.target_id, 'codex');
    assert.equal(engineTarget.status, 'completed');
    assert.equal(engineTarget.reason, 'codex_cli_missing');
    assert.equal(engineTarget.action, 'install');
    assert.equal(engineTarget.version_status_before, 'missing');
    assert.equal(engineTarget.latest_version_status_before, 'missing');
    assert.equal(engineTarget.result?.strategy, 'builtin');
    assert.equal(engineTarget.result?.command_preview.includes('-g'), false);
    assert.match(engineTarget.result?.command_preview.join(' ') ?? '', /--prefix/);
    assert.match(engineTarget.result?.note ?? '', /does not modify global Homebrew, npm, or system Codex/);
    assert.match(engineTarget.result?.stdout ?? '', /opl_runtime_substrate_update_receipt/);
    assert.equal(output.system_action.details.engine_summary.completed_targets_count, 1);
    assert.equal(output.system_action.details.engine_summary.manual_required_targets_count, 0);
    assert.equal(output.system_action.details.refreshed_system_environment.core_engines.codex.installed, true);
    assert.equal(
      output.system_action.details.refreshed_system_environment.core_engines.codex.version,
      'codex-cli 0.134.0',
    );
    assert.equal(
      output.system_action.details.refreshed_system_environment.core_engines.codex.version_status,
      'compatible',
    );
    assert.equal(
      output.system_action.details.refreshed_system_environment.core_engines.codex.latest_version_status,
      'current',
    );
    assert.equal(
      output.system_action.details.refreshed_system_environment.core_engines.codex.runtime_substrate_updater
        .global_toolchain_mutation_allowed,
      false,
    );
    assert.equal(
      output.system_action.details.refreshed_system_environment.core_engines.codex.runtime_substrate_updater
        .current_binary_installed,
      true,
    );
    assert.equal(
      output.system_action.details.refreshed_system_environment.core_engines.codex.runtime_substrate_updater
        .latest_version_status,
      'current',
    );
    assert.doesNotMatch(fs.readFileSync(npmLog, 'utf8'), / -g( |$)/);
    assert.match(fs.readFileSync(runtimeCodex, 'utf8'), /0\.134\.0/);
    assert.match(fs.readFileSync(runtimeRg, 'utf8'), /rg staged/);
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});
