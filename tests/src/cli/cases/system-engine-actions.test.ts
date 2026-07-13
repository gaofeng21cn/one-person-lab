import { spawnSync } from 'node:child_process';

import {
  assert,
  createFakeCodexFixture,
  fs,
  os,
  parseJsonText,
  path,
  runCli,
  runCliFailure,
  shellSingleQuote,
  test,
} from '../helpers.ts';
import { resolveEngineActionSpec } from '../../../../src/modules/connect/system-installation/engine-helpers.ts';

function parseRuntimeCodexUpdateReceipt(stdout: string) {
  const receiptLine = stdout
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.startsWith('{"opl_runtime_codex_update"'));
  assert.ok(receiptLine, stdout);
  return (parseJsonText(receiptLine) as any).opl_runtime_codex_update;
}

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
      '  printf \'%s\\n\' \'#!/usr/bin/env bash\' \'echo "rg new"\' > "$vendor_root/codex-path/rg"',
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

function createTarball(sourceDir: string, tarballPath: string) {
  const result = spawnSync('tar', ['-czf', tarballPath, '-C', sourceDir, 'package'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
}

function writePreseededCodexTarballs(fixtureRoot: string) {
  const rootPackage = path.join(fixtureRoot, 'root-package');
  const platformPackage = path.join(fixtureRoot, 'platform-package');
  const rootPackageDir = path.join(rootPackage, 'package');
  const platformPackageDir = path.join(platformPackage, 'package');
  const rootTarball = path.join(fixtureRoot, 'openai-codex.tgz');
  const platformTarball = path.join(fixtureRoot, 'openai-codex-darwin-arm64.tgz');

  fs.mkdirSync(path.join(rootPackageDir, 'bin'), { recursive: true });
  fs.writeFileSync(
    path.join(rootPackageDir, 'package.json'),
    JSON.stringify({
      name: '@openai/codex',
      version: '0.141.0',
      optionalDependencies: {
        '@openai/codex-darwin-arm64': 'npm:@openai/codex@0.141.0-darwin-arm64',
      },
      bin: { codex: 'bin/codex.js' },
    }, null, 2),
  );
  fs.writeFileSync(path.join(rootPackageDir, 'bin', 'codex.js'), '#!/usr/bin/env node\n', { mode: 0o755 });

  const vendorRoot = path.join(platformPackageDir, 'vendor', 'aarch64-apple-darwin');
  fs.mkdirSync(path.join(vendorRoot, 'bin'), { recursive: true });
  fs.mkdirSync(path.join(vendorRoot, 'codex-path'), { recursive: true });
  fs.writeFileSync(
    path.join(platformPackageDir, 'package.json'),
    JSON.stringify({
      name: '@openai/codex',
      version: '0.141.0-darwin-arm64',
      os: ['darwin'],
      cpu: ['arm64'],
    }, null, 2),
  );
  fs.writeFileSync(path.join(vendorRoot, 'bin', 'codex'), '#!/usr/bin/env bash\necho "codex-cli 0.141.0"\n', {
    mode: 0o755,
  });
  fs.writeFileSync(path.join(vendorRoot, 'codex-path', 'rg'), '#!/usr/bin/env bash\necho "rg preseeded"\n', {
    mode: 0o755,
  });

  createTarball(rootPackage, rootTarball);
  createTarball(platformPackage, platformTarball);
  return { rootTarball, platformTarball };
}

test('engine action executes env-overridden install commands and returns a structured action surface', () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-engine-action-'));
  const markerPath = path.join(fixtureRoot, 'codex-install.marker');
  const installScript = path.join(fixtureRoot, 'install-codex.sh');
  const codexFixture = createFakeCodexFixture(`
if [[ "$1" == "--version" ]]; then
  echo "codex-cli 0.125.0"
  exit 0
fi
echo "Unsupported codex fixture command: $*" >&2
exit 1
`);

  fs.writeFileSync(
    installScript,
    [
      '#!/usr/bin/env bash',
      'set -euo pipefail',
      `touch ${shellSingleQuote(markerPath)}`,
      'echo "codex install fixture completed"',
      '',
    ].join('\n'),
    { mode: 0o755 },
  );

  try {
    const output = runCli(
      ['engine', 'install', '--engine', 'codex'],
      {
        OPL_CODEX_BIN: codexFixture.codexPath,
        OPL_CODEX_INSTALL_COMMAND: installScript,
      },
    ) as {
      engine_action: {
        engine_id: string;
        action: string;
        status: string;
        command_preview: string[];
        system: {
          surface_id: string;
          core_engines: {
            codex: {
              installed: boolean;
            };
          };
        };
      };
    };

    assert.equal(output.engine_action.engine_id, 'codex');
    assert.equal(output.engine_action.action, 'install');
    assert.equal(output.engine_action.status, 'completed');
    assert.deepEqual(output.engine_action.command_preview, [installScript]);
    assert.equal('system_environment' in output.engine_action, false);
    assert.equal(output.engine_action.system.surface_id, 'opl_system');
    assert.equal(output.engine_action.system.core_engines.codex.installed, true);
    assert.equal(fs.existsSync(markerPath), true);
  } finally {
    fs.rmSync(codexFixture.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('builtin Codex update stages selected OPL runtime binary for restart activation without global npm', () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-engine-runtime-update-'));
  const runtimeHome = path.join(fixtureRoot, 'runtime', 'current');
  const runtimeBin = path.join(runtimeHome, 'bin');
  const fakeBin = path.join(fixtureRoot, 'fake-bin');
  const runtimeCodex = path.join(runtimeBin, 'codex');
  const runtimeRg = path.join(runtimeBin, 'rg');
  const fakeNpm = path.join(fakeBin, 'npm');
  const npmLog = path.join(fixtureRoot, 'npm.log');

  fs.mkdirSync(runtimeBin, { recursive: true });
  fs.mkdirSync(fakeBin, { recursive: true });
  fs.writeFileSync(runtimeCodex, '#!/usr/bin/env bash\necho "codex-cli 0.130.0"\n', { mode: 0o755 });
  fs.writeFileSync(runtimeRg, '#!/usr/bin/env bash\necho "rg old"\n', { mode: 0o755 });
  writeFakeNpmRuntimeInstaller(fakeNpm, npmLog);

  try {
    const output = runCli(
      ['engine', 'update', '--engine', 'codex'],
      {
        HOME: fixtureRoot,
        OPL_CODEX_BIN: runtimeCodex,
        OPL_CODEX_CLI_LATEST_VERSION: '0.134.0',
        SHELL: '/bin/bash',
        PATH: `${fakeBin}:/usr/bin:/bin`,
      },
    ) as {
      engine_action: {
        status: string;
        command_preview: string[];
        note: string | null;
        stdout: string;
        system: {
          core_engines: {
            codex: {
              version: string | null;
              latest_version_status: string;
              update_available: boolean;
              runtime_substrate_updater: {
                global_toolchain_mutation_allowed: boolean;
                latest_version_status: string;
              };
            };
          };
        };
      };
    };

    assert.equal(output.engine_action.status, 'completed');
    assert.equal(output.engine_action.command_preview.includes('-g'), false);
    assert.match(output.engine_action.command_preview.join(' '), /--prefix/);
    assert.match(output.engine_action.note ?? '', /does not modify global Homebrew, npm, or system Codex/);
    assert.equal(output.engine_action.system.core_engines.codex.version, 'codex-cli 0.130.0');
    assert.equal(output.engine_action.system.core_engines.codex.latest_version_status, 'outdated');
    assert.equal(output.engine_action.system.core_engines.codex.update_available, true);
    assert.equal(
      output.engine_action.system.core_engines.codex.runtime_substrate_updater.global_toolchain_mutation_allowed,
      false,
    );
    assert.equal(
      output.engine_action.system.core_engines.codex.runtime_substrate_updater.latest_version_status,
      'outdated',
    );
    assert.match(output.engine_action.stdout, /opl_runtime_substrate_update_receipt/);
    assert.match(output.engine_action.stdout, /codex-darwin-arm64/);
    assert.doesNotMatch(fs.readFileSync(npmLog, 'utf8'), / -g( |$)/);
    assert.match(fs.readFileSync(runtimeCodex, 'utf8'), /0\.130\.0/);
    assert.match(fs.readFileSync(runtimeRg, 'utf8'), /rg old/);
    const receipt = parseRuntimeCodexUpdateReceipt(output.engine_action.stdout);
    assert.equal(receipt.surface_kind, 'opl_runtime_substrate_update_receipt');
    assert.equal(receipt.update_strategy, 'app_owned_stage_verify_restart_activate');
    assert.equal(receipt.staged, true);
    assert.equal(receipt.activated, false);
    assert.equal(receipt.restart_required, true);
    assert.equal(receipt.activation.status, 'pending_restart');
    assert.match(fs.readFileSync(receipt.staged_runtime_binary_path, 'utf8'), /0\.134\.0/);
    assert.match(fs.readFileSync(receipt.staged_runtime_rg_path, 'utf8'), /rg new/);
    assert.equal(fs.existsSync(receipt.pending_metadata_path), true);
    assert.equal(receipt.global_toolchain_mutation_allowed, false);
    assert.equal(receipt.source_kind, 'platform_vendor_binary');
    assert.equal(
      receipt.platform_package_root.endsWith('node_modules/@openai/codex-darwin-arm64'),
      true,
    );
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('builtin Codex install consumes first-run preseeded root and platform tarballs without registry fetch', () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-engine-preseeded-codex-'));
  const codexFixture = createFakeCodexFixture(`
if [[ "$1" == "--version" ]]; then
  echo "codex-cli 0.130.0"
  exit 0
fi
echo "Unsupported codex fixture command: $*" >&2
exit 1
`);
  const runtimeHome = path.join(fixtureRoot, 'runtime', 'current');
  const runtimeBin = path.join(runtimeHome, 'bin');
  const runtimeCodex = path.join(runtimeBin, 'codex');
  const runtimeRg = path.join(runtimeBin, 'rg');
  const fakeBin = path.join(fixtureRoot, 'fake-bin');
  const fakeNpm = path.join(fakeBin, 'npm');
  const npmLog = path.join(fixtureRoot, 'npm.log');
  const { rootTarball, platformTarball } = writePreseededCodexTarballs(fixtureRoot);

  fs.mkdirSync(runtimeBin, { recursive: true });
  fs.mkdirSync(fakeBin, { recursive: true });
  fs.writeFileSync(
    fakeNpm,
    [
      '#!/usr/bin/env bash',
      'set -euo pipefail',
      `printf '%s\\n' "$*" >> ${shellSingleQuote(npmLog)}`,
      'if [[ "$*" == *"@openai/codex@latest"* ]]; then',
      '  echo "registry fetch is forbidden in preseeded fixture" >&2',
      '  exit 47',
      'fi',
      'if [[ "$1" == "install" && "$2" == "--prefix" ]]; then',
      '  prefix="$3"',
      '  mkdir -p "$prefix/node_modules/@openai/codex"',
      '  cp -R "$4" "$prefix/node_modules/@openai/codex/source-tarball.txt"',
      '  echo "installed staged preseeded root package"',
      '  exit 0',
      'fi',
      'echo "Unexpected npm command: $*" >&2',
      'exit 1',
      '',
    ].join('\n'),
    { mode: 0o755 },
  );

  try {
    const output = runCli(
      ['engine', 'install', '--engine', 'codex'],
      {
        HOME: fixtureRoot,
        OPL_RUNTIME_ROOT: path.join(fixtureRoot, 'runtime'),
        OPL_FIRST_RUN_CODEX_PACKAGE_TARBALL: rootTarball,
        OPL_FIRST_RUN_CODEX_PLATFORM_PACKAGE_TARBALL: platformTarball,
        OPL_FIRST_RUN_CODEX_NPM_CACHE_DIR: path.join(fixtureRoot, 'npm-cache'),
        OPL_CODEX_BIN: codexFixture.codexPath,
        OPL_CODEX_CLI_LATEST_VERSION: '0.141.0',
        SHELL: '/bin/bash',
        PATH: `${fakeBin}:/usr/bin:/bin`,
      },
    ) as {
      engine_action: {
        status: string;
        command_preview: string[];
        stdout: string;
      };
    };

    assert.equal(output.engine_action.status, 'completed');
    assert.equal(fs.existsSync(runtimeCodex), true);
    assert.equal(fs.existsSync(runtimeRg), true);
    assert.match(fs.readFileSync(runtimeCodex, 'utf8'), /0\.141\.0/);
    assert.match(fs.readFileSync(runtimeRg, 'utf8'), /rg preseeded/);
    assert.match(output.engine_action.command_preview.join(' '), new RegExp(rootTarball.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.match(output.engine_action.command_preview.join(' '), /--prefer-offline/);
    assert.match(output.engine_action.stdout, /preseeded_platform_package/);
    assert.match(output.engine_action.stdout, /codex-darwin-arm64/);
    assert.doesNotMatch(fs.readFileSync(npmLog, 'utf8'), /@openai\/codex@latest/);
  } finally {
    fs.rmSync(codexFixture.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('builtin Codex install explicitly materializes missing npm platform package', () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-engine-codex-platform-'));
  const runtimeBin = path.join(fixtureRoot, 'runtime', 'current', 'bin');
  const runtimeCodex = path.join(runtimeBin, 'codex');
  const runtimeRg = path.join(runtimeBin, 'rg');
  const fakeBin = path.join(fixtureRoot, 'fake-bin');
  const fakeNpm = path.join(fakeBin, 'npm');
  const npmLog = path.join(fixtureRoot, 'npm.log');

  fs.mkdirSync(runtimeBin, { recursive: true });
  fs.mkdirSync(fakeBin, { recursive: true });
  fs.writeFileSync(
    fakeNpm,
    [
      '#!/usr/bin/env bash',
      'set -euo pipefail',
      `printf '%s\\n' "$*" >> ${shellSingleQuote(npmLog)}`,
      'if [[ "$1" == "install" && "$2" == "--prefix" ]]; then',
      '  prefix="$3"',
      '  if [[ "$4" == "@openai/codex@latest" ]]; then',
      '    package_root="$prefix/node_modules/@openai/codex"',
      '    mkdir -p "$package_root/bin"',
      '    cat > "$package_root/package.json" <<\'JSON\'',
      JSON.stringify({
        name: '@openai/codex',
        version: '0.141.0',
        bin: { codex: 'bin/codex.js' },
        optionalDependencies: {
          '@openai/codex-darwin-arm64': 'npm:@openai/codex@0.141.0-darwin-arm64',
        },
      }),
      'JSON',
      '    printf \'%s\\n\' \'#!/usr/bin/env node\' \'throw new Error("missing optional platform package")\' > "$package_root/bin/codex.js"',
      '    chmod +x "$package_root/bin/codex.js"',
      '    echo "installed root package without optional platform payload"',
      '    exit 0',
      '  fi',
      '  if [[ "$4" == "@openai/codex-darwin-arm64@npm:@openai/codex@0.141.0-darwin-arm64" ]]; then',
      '    vendor_root="$prefix/node_modules/@openai/codex-darwin-arm64/vendor/aarch64-apple-darwin"',
      '    mkdir -p "$vendor_root/bin" "$vendor_root/codex-path"',
      '    printf \'%s\\n\' \'#!/usr/bin/env bash\' \'echo "codex-cli 0.141.0"\' > "$vendor_root/bin/codex"',
      '    printf \'%s\\n\' \'#!/usr/bin/env bash\' \'echo "rg explicit-platform"\' > "$vendor_root/codex-path/rg"',
      '    chmod +x "$vendor_root/bin/codex" "$vendor_root/codex-path/rg"',
      '    echo "installed explicit platform package"',
      '    exit 0',
      '  fi',
      'fi',
      'echo "Unexpected npm command: $*" >&2',
      'exit 1',
      '',
    ].join('\n'),
    { mode: 0o755 },
  );

  try {
    const output = runCli(['engine', 'install', '--engine', 'codex'], {
      HOME: fixtureRoot,
      OPL_RUNTIME_ROOT: path.join(fixtureRoot, 'runtime'),
      OPL_CODEX_CLI_LATEST_VERSION: '0.141.0',
      SHELL: '/bin/bash',
      PATH: `${fakeBin}:/usr/bin:/bin`,
    }) as {
      engine_action: {
        status: string;
        stdout: string;
      };
    };

    assert.equal(output.engine_action.status, 'completed');
    assert.equal(fs.existsSync(runtimeCodex), true);
    assert.equal(fs.existsSync(runtimeRg), true);
    assert.match(fs.readFileSync(runtimeCodex, 'utf8'), /0\.141\.0/);
    assert.match(fs.readFileSync(runtimeRg, 'utf8'), /rg explicit-platform/);
    assert.match(fs.readFileSync(npmLog, 'utf8'), /@openai\/codex@latest/);
    assert.match(
      fs.readFileSync(npmLog, 'utf8'),
      /@openai\/codex-darwin-arm64@npm:@openai\/codex@0\.141\.0-darwin-arm64/,
    );
    const receipt = parseRuntimeCodexUpdateReceipt(output.engine_action.stdout);
    assert.equal(receipt.surface_kind, 'opl_runtime_substrate_update_receipt');
    assert.equal(receipt.update_strategy, 'app_owned_stage_verify_restart_activate');
    assert.equal(receipt.activated, true);
    assert.equal(receipt.restart_required, false);
    assert.equal(receipt.global_toolchain_mutation_allowed, false);
    assert.equal(receipt.source_kind, 'platform_vendor_binary');
    assert.equal(receipt.explicit_platform_install.exit_code, 0);
    assert.match(
      receipt.explicit_platform_install.platform_spec,
      /@openai\/codex-darwin-arm64@npm:@openai\/codex@0\.141\.0-darwin-arm64/,
    );
    assert.equal(
      receipt.platform_package_root.endsWith('node_modules/@openai/codex-darwin-arm64'),
      true,
    );
    assert.equal(receipt.verification.verified, true);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('builtin Codex install materializes Linux arm64 platform package when running in Docker', () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-engine-codex-linux-arm64-'));
  const runtimeBin = path.join(fixtureRoot, 'runtime', 'current', 'bin');
  const runtimeCodex = path.join(runtimeBin, 'codex');
  const runtimeRg = path.join(runtimeBin, 'rg');
  const fakeBin = path.join(fixtureRoot, 'fake-bin');
  const fakeNpm = path.join(fakeBin, 'npm');
  const npmLog = path.join(fixtureRoot, 'npm.log');

  fs.mkdirSync(runtimeBin, { recursive: true });
  fs.mkdirSync(fakeBin, { recursive: true });
  fs.writeFileSync(
    fakeNpm,
    [
      '#!/usr/bin/env bash',
      'set -euo pipefail',
      `printf '%s\\n' "$*" >> ${shellSingleQuote(npmLog)}`,
      'if [[ "$1" == "install" && "$2" == "--prefix" ]]; then',
      '  prefix="$3"',
      '  if [[ "$4" == "@openai/codex@latest" ]]; then',
      '    package_root="$prefix/node_modules/@openai/codex"',
      '    mkdir -p "$package_root/bin"',
      '    cat > "$package_root/package.json" <<\'JSON\'',
      JSON.stringify({
        name: '@openai/codex',
        version: '0.141.0',
        bin: { codex: 'bin/codex.js' },
        optionalDependencies: {
          '@openai/codex-linux-arm64': 'npm:@openai/codex@0.141.0-linux-arm64',
          '@openai/codex-darwin-arm64': 'npm:@openai/codex@0.141.0-darwin-arm64',
        },
      }),
      'JSON',
      '    printf \'%s\\n\' \'#!/usr/bin/env node\' \'throw new Error("missing optional platform package")\' > "$package_root/bin/codex.js"',
      '    chmod +x "$package_root/bin/codex.js"',
      '    echo "installed root package without optional platform payload"',
      '    exit 0',
      '  fi',
      '  if [[ "$4" == "@openai/codex-linux-arm64@npm:@openai/codex@0.141.0-linux-arm64" ]]; then',
      '    vendor_root="$prefix/node_modules/@openai/codex-linux-arm64/vendor/aarch64-unknown-linux-musl"',
      '    mkdir -p "$vendor_root/bin" "$vendor_root/codex-path"',
      '    printf \'%s\\n\' \'#!/usr/bin/env bash\' \'echo "codex-cli 0.141.0"\' > "$vendor_root/bin/codex"',
      '    printf \'%s\\n\' \'#!/usr/bin/env bash\' \'echo "rg linux-arm64"\' > "$vendor_root/codex-path/rg"',
      '    chmod +x "$vendor_root/bin/codex" "$vendor_root/codex-path/rg"',
      '    echo "installed explicit linux arm64 platform package"',
      '    exit 0',
      '  fi',
      'fi',
      'echo "Unexpected npm command: $*" >&2',
      'exit 1',
      '',
    ].join('\n'),
    { mode: 0o755 },
  );

  try {
    const output = runCli(['engine', 'install', '--engine', 'codex'], {
      HOME: fixtureRoot,
      OPL_RUNTIME_ROOT: path.join(fixtureRoot, 'runtime'),
      OPL_CODEX_CLI_LATEST_VERSION: '0.141.0',
      OPL_CODEX_PLATFORM_OVERRIDE: 'linux',
      OPL_CODEX_ARCH_OVERRIDE: 'arm64',
      SHELL: '/bin/bash',
      PATH: `${fakeBin}:/usr/bin:/bin`,
    }) as {
      engine_action: {
        status: string;
        stdout: string;
      };
    };

    assert.equal(output.engine_action.status, 'completed');
    assert.equal(fs.existsSync(runtimeCodex), true);
    assert.equal(fs.existsSync(runtimeRg), true);
    assert.match(fs.readFileSync(runtimeCodex, 'utf8'), /0\.141\.0/);
    assert.match(fs.readFileSync(runtimeRg, 'utf8'), /rg linux-arm64/);
    assert.match(
      fs.readFileSync(npmLog, 'utf8'),
      /@openai\/codex-linux-arm64@npm:@openai\/codex@0\.141\.0-linux-arm64/,
    );
    assert.doesNotMatch(fs.readFileSync(npmLog, 'utf8'), /@openai\/codex-darwin-arm64@npm/);
    const receipt = parseRuntimeCodexUpdateReceipt(output.engine_action.stdout);
    assert.equal(receipt.explicit_platform_install.exit_code, 0);
    assert.match(
      receipt.explicit_platform_install.platform_spec,
      /@openai\/codex-linux-arm64@npm:@openai\/codex@0\.141\.0-linux-arm64/,
    );
    assert.equal(
      receipt.platform_package_root.endsWith('node_modules/@openai/codex-linux-arm64'),
      true,
    );
    assert.equal(receipt.verification.verified, true);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('builtin Codex install reports explicit platform package materialization failures', () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-engine-codex-platform-fail-'));
  const fakeBin = path.join(fixtureRoot, 'fake-bin');
  const fakeNpm = path.join(fakeBin, 'npm');
  const npmLog = path.join(fixtureRoot, 'npm.log');

  fs.mkdirSync(fakeBin, { recursive: true });
  fs.writeFileSync(
    fakeNpm,
    [
      '#!/usr/bin/env bash',
      'set -euo pipefail',
      `printf '%s\\n' "$*" >> ${shellSingleQuote(npmLog)}`,
      'if [[ "$1" == "install" && "$2" == "--prefix" ]]; then',
      '  prefix="$3"',
      '  if [[ "$4" == "@openai/codex@latest" ]]; then',
      '    package_root="$prefix/node_modules/@openai/codex"',
      '    mkdir -p "$package_root/bin"',
      '    cat > "$package_root/package.json" <<\'JSON\'',
      JSON.stringify({
        name: '@openai/codex',
        version: '0.141.0',
        bin: { codex: 'bin/codex.js' },
        optionalDependencies: {
          '@openai/codex-darwin-arm64': 'npm:@openai/codex@0.141.0-darwin-arm64',
        },
      }),
      'JSON',
      '    printf \'%s\\n\' \'#!/usr/bin/env node\' \'throw new Error("missing optional platform package")\' > "$package_root/bin/codex.js"',
      '    chmod +x "$package_root/bin/codex.js"',
      '    echo "installed root package without optional platform payload"',
      '    exit 0',
      '  fi',
      '  if [[ "$4" == "@openai/codex-darwin-arm64@npm:@openai/codex@0.141.0-darwin-arm64" ]]; then',
      '    echo "platform package unavailable" >&2',
      '    exit 42',
      '  fi',
      'fi',
      'echo "Unexpected npm command: $*" >&2',
      'exit 1',
      '',
    ].join('\n'),
    { mode: 0o755 },
  );

  try {
    const failure = runCliFailure(['engine', 'install', '--engine', 'codex'], {
      HOME: fixtureRoot,
      OPL_RUNTIME_ROOT: path.join(fixtureRoot, 'runtime'),
      OPL_CODEX_CLI_LATEST_VERSION: '0.141.0',
      SHELL: '/bin/bash',
      PATH: `${fakeBin}:/usr/bin:/bin`,
    });

    assert.equal(failure.status, 3);
    const update = failure.payload.error.details.runtime_update;
    assert.equal(update.reason, 'codex_platform_package_install_failed');
    assert.equal(update.explicit_platform_install.exit_code, 42);
    assert.match(update.explicit_platform_install.stderr, /platform package unavailable/);
    assert.match(
      update.explicit_platform_install.platform_spec,
      /@openai\/codex-darwin-arm64@npm:@openai\/codex@0\.141\.0-darwin-arm64/,
    );
    assert.match(
      fs.readFileSync(npmLog, 'utf8'),
      /@openai\/codex-darwin-arm64@npm:@openai\/codex@0\.141\.0-darwin-arm64/,
    );
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('engine actions reject retired Hermes target without compatibility action surface', () => {
  const failure = runCliFailure(['engine', 'install', '--engine', 'hermes']);

  assert.equal(failure.status, 2);
  assert.equal(failure.payload.error.code, 'cli_usage_error');
  assert.equal(failure.payload.error.details.engine_id, 'hermes');
  assert.deepEqual(failure.payload.error.details.available_engine_ids, ['codex']);
  assert.deepEqual(failure.payload.error.details.retired_engine_ids, ['hermes']);
  assert.match(
    failure.payload.error.details.retirement_boundary,
    /legacy hermes engine action target is retired/,
  );
  assert.match(
    failure.payload.error.details.retirement_boundary,
    /canonical hermes_agent executor adapter remains available/,
  );
  assert.match(
    failure.payload.error.details.retirement_boundary,
    /explicit AgentExecutionRequest selection/,
  );
});

test('builtin Codex install command bounds npm registry fetches', () => {
  const install = resolveEngineActionSpec('codex', 'install');
  const command = install.command_preview.join(' ');

  assert.equal(install.strategy, 'builtin');
  assert.match(command, /npm install --prefix .* @openai\/codex@latest/);
  assert.doesNotMatch(command, / install -g /);
  assert.match(install.note ?? '', /does not modify global Homebrew, npm, or system Codex/);
  assert.match(command, /--fetch-retries=3/);
  assert.match(command, /--fetch-retry-mintimeout=2000/);
  assert.match(command, /--fetch-retry-maxtimeout=20000/);
  assert.match(command, /--fetch-timeout=60000/);
});
