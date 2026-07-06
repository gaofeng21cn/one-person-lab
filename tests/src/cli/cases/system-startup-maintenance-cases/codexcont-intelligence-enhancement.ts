import { assert, fs, os, path, runCli, shellSingleQuote, test } from '../../helpers.ts';

function writeExecutable(filePath: string, contents: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents, { mode: 0o755 });
}

test('system startup-maintenance repairs enabled CodexCont intelligence enhancement in container mode', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-startup-maintenance-codexcont-'));
  const fakeBin = path.join(homeRoot, 'fake-bin');
  const fakeCodex = path.join(fakeBin, 'codex');
  const fakeUvx = path.join(fakeBin, 'uvx');
  const uvxLog = path.join(homeRoot, 'uvx.log');
  const codexHome = path.join(homeRoot, '.codex');
  const codexContHome = path.join(homeRoot, '.codexcont');

  try {
    writeExecutable(fakeCodex, '#!/usr/bin/env bash\necho "codex-cli 0.134.0"\n');
    writeExecutable(
      fakeUvx,
      [
        '#!/usr/bin/env bash',
        'set -euo pipefail',
        `printf '%s\\n' "$*" >> ${shellSingleQuote(uvxLog)}`,
        '',
      ].join('\n'),
    );
    fs.mkdirSync(codexHome, { recursive: true });
    fs.mkdirSync(codexContHome, { recursive: true });
    fs.writeFileSync(
      path.join(codexHome, 'config.toml'),
      [
        'model_provider = "gflab"',
        'model = "gpt-5.5"',
        '',
        '[model_providers.gflab]',
        'name = "gflab"',
        'base_url = "http://127.0.0.1:8787/v1"',
        'wire_api = "responses"',
        '',
      ].join('\n'),
      'utf8',
    );
    fs.writeFileSync(
      path.join(codexContHome, 'config.toml'),
      [
        '[upstream]',
        'url = "https://gflabtoken.cn/v1/responses"',
        'mode = "fixed"',
        '',
      ].join('\n'),
      'utf8',
    );
    fs.writeFileSync(
      path.join(codexContHome, 'opl-flow-intelligence-enhancement.json'),
      JSON.stringify({
        surface_kind: 'opl_flow_intelligence_enhancement_receipt.v1',
        status: 'enabled',
        previous_provider_base_url: 'https://gflabtoken.cn/v1',
      }),
      'utf8',
    );

    const output = runCli(['system', 'startup-maintenance', '--scope', 'runtime_substrate'], {
      HOME: homeRoot,
      CODEX_HOME: codexHome,
      OPL_CODEX_BIN: fakeCodex,
      OPL_CODEX_CLI_LATEST_VERSION: '0.134.0',
      OPL_CODEXCONT_HOME: codexContHome,
      OPL_CODEXCONT_SERVICE_MODE: 'container',
      OPL_CODEXCONT_UVX: fakeUvx,
      OPL_FRAMEWORK_UPDATE_TARGET_ROOT: path.resolve('.'),
      OPL_STATE_DIR: path.join(homeRoot, 'opl-state'),
      PATH: `${fakeBin}:/usr/bin:/bin`,
      ...{ OPL_COMPANION_DISABLE_REMOTE_INSTALL: '1' },
    }) as {
      system_action: {
        status: string;
        details: {
          intelligence_enhancement_summary: {
            completed_targets_count: number;
            manual_required_targets_count: number;
          };
          intelligence_enhancement_targets: Array<{
            target_id: string;
            status: string;
            reason: string;
            action: string | null;
            status_before: {
              enabled: boolean;
              service: {
                mode: string;
              };
            };
            result: {
              action: string;
              status: string;
              service: {
                mode: string;
                definition_path: string;
                script_path: string;
              };
            };
          }>;
        };
      };
    };

    assert.equal(output.system_action.status, 'completed');
    assert.equal(output.system_action.details.intelligence_enhancement_summary.completed_targets_count, 1);
    assert.equal(output.system_action.details.intelligence_enhancement_summary.manual_required_targets_count, 0);

    const target = output.system_action.details.intelligence_enhancement_targets[0];
    assert.equal(target.target_id, 'codexcont');
    assert.equal(target.status, 'completed');
    assert.equal(target.reason, 'container_startup_repair_required');
    assert.equal(target.action, 'repair');
    assert.equal(target.status_before.enabled, true);
    assert.equal(target.status_before.service.mode, 'container');
    assert.equal(target.result.action, 'repair');
    assert.equal(target.result.status, 'completed');
    assert.equal(target.result.service.mode, 'container');
    assert.equal(fs.existsSync(target.result.service.definition_path), true);
    assert.equal(fs.existsSync(target.result.service.script_path), true);
    assert.match(fs.readFileSync(target.result.service.definition_path, 'utf8'), /container_entrypoint_or_opl_system_startup_maintenance_must_call_repair/);
    assert.match(
      fs.readFileSync(path.join(codexHome, 'config.toml'), 'utf8'),
      /base_url = "http:\/\/127\.0\.0\.1:8787\/v1"/,
    );
    assert.deepEqual(fs.readFileSync(uvxLog, 'utf8').trim().split('\n'), [
      '--from git+https://github.com/ZhenHuangLab/CodexCont codexcont install -y',
      '--from git+https://github.com/ZhenHuangLab/CodexCont codexcont restart',
    ]);
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});
