import { assert, fs, os, path, runCli, shellSingleQuote, test } from '../../helpers.ts';

function writeExecutable(filePath: string, contents: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents, { mode: 0o755 });
}

test('startup maintenance repairs the enabled CodexCont container service through OPL Flow', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-startup-codexcont-'));
  const fakeBin = path.join(homeRoot, 'bin');
  const codexHome = path.join(homeRoot, '.codex');
  const codexContHome = path.join(homeRoot, '.codexcont');
  const uvxLog = path.join(homeRoot, 'uvx.log');
  const scriptPath = path.join(homeRoot, 'plugins', 'opl-flow', 'scripts', 'intelligence_enhancement.py');
  const installerPath = path.join(homeRoot, 'opl-state', 'modules', 'opl-flow', 'scripts', 'install_local_plugin.py');

  try {
    writeExecutable(path.join(fakeBin, 'codex'), '#!/usr/bin/env bash\necho "codex-cli 0.134.0"\n');
    writeExecutable(
      path.join(fakeBin, 'uvx'),
      `#!/usr/bin/env bash\nset -euo pipefail\nprintf '%s\\n' "$*" >> ${shellSingleQuote(uvxLog)}\n`,
    );
    writeExecutable(
      scriptPath,
      [
        '#!/usr/bin/env python3',
        'import json, os, pathlib, subprocess, sys',
        'action = sys.argv[1] if len(sys.argv) > 1 else "status"',
        'root = pathlib.Path(os.environ["OPL_CODEXCONT_HOME"])',
        'if action == "status":',
        '  print(json.dumps({"opl_flow_intelligence_enhancement": {"enabled": True, "proxy_running": False, "service": {"mode": "container", "definition_installed": False, "script_installed": False}}}))',
        'elif action == "repair":',
        '  subprocess.run([os.environ["OPL_CODEXCONT_UVX"], "--from", "git+https://github.com/ZhenHuangLab/CodexCont", "codexcont", "install", "-y"], check=True)',
        '  definition = root / "container-service.json"',
        '  entrypoint = root / "container-entrypoint.sh"',
        '  definition.write_text("container startup repair\\n")',
        '  entrypoint.write_text("#!/bin/sh\\nexec codexcont start\\n")',
        '  print(json.dumps({"opl_flow_intelligence_enhancement_action": {"action": "repair", "status": "completed", "service": {"mode": "container", "definition_path": str(definition), "script_path": str(entrypoint)}}}))',
        'else: raise SystemExit(2)',
      ].join('\n'),
    );
    fs.mkdirSync(path.dirname(installerPath), { recursive: true });
    fs.writeFileSync(
      installerPath,
      'import json\nprint(json.dumps({"surface_kind":"opl_flow_plugin_install_receipt.v1","status":"installed"}))\n',
      'utf8',
    );
    fs.mkdirSync(codexHome, { recursive: true });
    fs.mkdirSync(codexContHome, { recursive: true });
    fs.writeFileSync(path.join(codexHome, 'config.toml'), 'model_provider = "gflab"\n', 'utf8');
    fs.writeFileSync(
      path.join(codexContHome, 'opl-flow-intelligence-enhancement.json'),
      JSON.stringify({ status: 'enabled' }),
      'utf8',
    );

    const output = runCli(['system', 'startup-maintenance', '--scope', 'runtime_substrate'], {
      HOME: homeRoot,
      CODEX_HOME: codexHome,
      OPL_CODEX_BIN: path.join(fakeBin, 'codex'),
      OPL_CODEX_CLI_LATEST_VERSION: '0.134.0',
      OPL_CODEXCONT_HOME: codexContHome,
      OPL_CODEXCONT_SERVICE_MODE: 'container',
      OPL_CODEXCONT_UVX: path.join(fakeBin, 'uvx'),
      OPL_FLOW_INTELLIGENCE_SCRIPT: scriptPath,
      OPL_FRAMEWORK_UPDATE_TARGET_ROOT: path.resolve('.'),
      OPL_STATE_DIR: path.join(homeRoot, 'opl-state'),
      PATH: `${fakeBin}:/usr/bin:/bin`,
      OPL_COMPANION_DISABLE_REMOTE_INSTALL: '1',
    }) as any;
    const target = output.system_action.details.intelligence_enhancement_targets[0];

    assert.equal(target.target_id, 'codexcont');
    assert.equal(target.status, 'completed', JSON.stringify(target));
    assert.equal(target.reason, 'container_startup_repair_required');
    assert.equal(target.result.status, 'completed');
    assert.equal(fs.existsSync(target.result.service.definition_path), true);
    assert.match(fs.readFileSync(uvxLog, 'utf8'), /codexcont install -y/);
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});
