import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const testDir = path.dirname(new URL(import.meta.url).pathname);
const pythonClientDir = path.resolve(testDir, '..');
const repoRoot = path.resolve(pythonClientDir, '..', '..');
const oplCliBin = path.join(repoRoot, 'packages', 'daemon', 'bin', 'opl');

let baseTmp = os.tmpdir();
// macOS AF_UNIX sun_path max is 104 bytes; keep opld.sock < 96 bytes
const worstCaseSockProbe = path.join(baseTmp, 'opl-py-opld-e2e-XXXXXX', 'state', 'run', 'opld.sock');
if (process.platform !== 'win32' && Buffer.byteLength(worstCaseSockProbe, 'utf8') >= 96 && fs.existsSync('/tmp')) {
  baseTmp = '/tmp';
}

const tmpRoot = fs.mkdtempSync(path.join(baseTmp, 'opl-py-opld-e2e-'));
const stateDir = path.join(tmpRoot, 'state');
const oplHome = path.join(tmpRoot, 'opl-home');
const workspaceDir = path.join(tmpRoot, 'workspace');
fs.mkdirSync(stateDir, { recursive: true });
fs.mkdirSync(oplHome, { recursive: true });
fs.mkdirSync(workspaceDir, { recursive: true });

const env = {
  ...process.env,
  OPL_STATE_DIR: stateDir,
  OPL_HOME: oplHome,
  OPL_CODEX_HOME: path.join(tmpRoot, 'codex-home'),
  OPL_ALLOW_ENV_STUBS: '1',
};

const sessionPath = path.join(stateDir, 'run', 'opld.session.json');
let daemonProc = null;

function runCliJson(args) {
  const res = spawnSync(oplCliBin, [...args, '--json'], {
    cwd: repoRoot,
    env,
    encoding: 'utf8',
  });
  assert.equal(res.status, 0, `opl ${args.join(' ')} failed (${res.status}):\n${res.stdout}\n${res.stderr}`);
  return JSON.parse(res.stdout.trim());
}

try {
  daemonProc = spawn(oplCliBin, ['daemon', 'start', '--foreground'], {
    cwd: repoRoot,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline && !fs.existsSync(sessionPath)) {
    await new Promise((r) => setTimeout(r, 50));
  }
  assert.equal(fs.existsSync(sessionPath), true, 'Expected opld.session.json to appear');

  const wsInit = runCliJson(['workspace', 'init', workspaceDir, '--name', 'Python Real opld WS']);
  const workspaceId = wsInit.workspace_id ?? wsInit.workspace?.workspace_id;
  assert.ok(workspaceId);

  const vaultDir = path.join(tmpRoot, 'vault');
  fs.mkdirSync(path.join(vaultDir, 'notes'), { recursive: true });
  fs.writeFileSync(path.join(vaultDir, 'notes', 'protocol.md'), '# Protocol\nRefs-only test note.\n', 'utf8');
  runCliJson([
    'workspace',
    'sources',
    'add',
    vaultDir,
    '--workspace',
    workspaceId,
    '--scope',
    'long_term_topic',
    '--adapter',
    'obsidian_vault',
  ]);

  const pyScript = `
import json, time
from opl_client import OplClient, OplRpcError

with OplClient(session_file=${JSON.stringify(sessionPath)}, client_kind="opl_app") as app_cli:
    created = app_cli.runway_task_create(
        ${JSON.stringify(workspaceId)},
        "mas",
        "Python Real opld E2E",
        "Verify Python SDK against real opld",
        auto_start=False,
    )
    task_id = created.get("task_id") or (created.get("task") or {}).get("task_id")
    assert isinstance(task_id, str) and len(task_id) > 0

with OplClient(session_file=${JSON.stringify(sessionPath)}, client_kind="sdk_python") as cli:
    assert str(cli.server_info.get("api_version", "")).startswith("2.")
    assert isinstance(cli.server_info.get("session_id"), str) and len(cli.server_info["session_id"]) > 0

    try:
        cli.call("connect.approveRequest", {"request_id": "req-e2e-probe"})
        raise AssertionError("Expected -32003 TRUSTED_HOST_REQUIRED")
    except OplRpcError as exc:
        assert exc.code == -32003, f"Expected -32003, got {exc.code}"

    snap = cli.knowledge_snapshot(${JSON.stringify(workspaceId)}, "sr-e2e-py")
    assert isinstance(snap, dict) and "snapshots" in snap

    r1 = cli.append_ledger(task_id, "artifact_ref", "mas", {"path": "report.md", "sha256": "${'a'.repeat(64)}"})
    r2 = cli.append_ledger(task_id, "quality_debt", "mas", {"debt_id": "d-1", "code": "check_table", "blocks_submission": False})
    events = cli.drain_events()
    ledger_evs = [e for e in events if e.get("method") == "event.ledger.appended"]
    assert len(ledger_evs) >= 2, f"Expected >=2 event.ledger.appended events, got {events}"

    tl = cli.ledger_timeline(task_id)
    entries = tl if isinstance(tl, list) else tl.get("entries", [])
    assert len(entries) >= 2

    times = []
    for _ in range(50):
        t0 = time.perf_counter()
        cli.ledger_timeline(task_id)
        times.append((time.perf_counter() - t0) * 1000.0)
    times.sort()
    print(json.dumps({"ok": True, "p50_ms": round(times[25], 3), "events": len(ledger_evs), "entries": len(entries)}))
`;

  const pyRes = spawnSync('python3', ['-c', pyScript], {
    cwd: workspaceDir,
    env: {
      ...env,
      PYTHONPATH: path.join(pythonClientDir, 'src'),
    },
    encoding: 'utf8',
  });
  assert.equal(pyRes.status, 0, `Python E2E failed:\n${pyRes.stdout}\n${pyRes.stderr}`);
  const out = JSON.parse(pyRes.stdout.trim());
  assert.equal(out.ok, true);

  const auditMod = await import(pathToFileURL(path.join(repoRoot, 'tests', 'e2e', 'lib', 'redline-audit.mjs')).href);
  const audit = auditMod.auditPythonStdlibAndBudget(pythonClientDir, { maxLines: 1500 });
  assert.equal(audit.ok, true, `Python budget/stdlib check failed: ${JSON.stringify(audit.violations)}`);

  console.log(`[PASS] Real opld + Python SDK E2E passed (p50=${out.p50_ms}ms, lines=${audit.lineCount}/1500)`);
} finally {
  spawnSync(oplCliBin, ['daemon', 'stop'], { cwd: repoRoot, env, encoding: 'utf8' });
  if (daemonProc && daemonProc.exitCode === null) {
    daemonProc.kill('SIGKILL');
  }
  fs.rmSync(tmpRoot, { recursive: true, force: true });
}
