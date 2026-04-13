import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync, type ChildProcessByStdio } from 'node:child_process';
import fs from 'node:fs';
import {
  createServer,
  type IncomingHttpHeaders,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import os from 'node:os';
import path from 'node:path';
import type { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';

import {
  GatewayContractError,
  loadGatewayContracts,
  validateGatewayContracts,
} from '../../src/contracts.ts';
import {
  explainDomainBoundary,
  resolveRequestSurface,
} from '../../src/resolver.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const cliPath = path.join(repoRoot, 'src', 'cli.ts');
const contractsDir = path.join(repoRoot, 'contracts', 'opl-gateway');

function runCli(args: string[], envOverrides: Record<string, string> = {}) {
  const result = spawnSync(
    process.execPath,
    ['--experimental-strip-types', cliPath, ...args],
    {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        NODE_NO_WARNINGS: '1',
        ...envOverrides,
      },
    },
  );

  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

function runCliFailure(args: string[], envOverrides: Record<string, string> = {}) {
  return runCliFailureInCwd(args, repoRoot, envOverrides);
}

function runCliFailureInCwd(
  args: string[],
  cwd: string,
  envOverrides: Record<string, string> = {},
) {
  const result = spawnSync(
    process.execPath,
    ['--experimental-strip-types', cliPath, ...args],
    {
      cwd,
      encoding: 'utf8',
      env: {
        ...process.env,
        NODE_NO_WARNINGS: '1',
        ...envOverrides,
      },
    },
  );

  assert.notEqual(result.status, 0);
  return {
    status: result.status ?? 1,
    payload: JSON.parse(result.stderr),
  };
}

async function runCliAsync(args: string[], envOverrides: Record<string, string> = {}) {
  return await new Promise<Record<string, unknown>>((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ['--experimental-strip-types', cliPath, ...args],
      {
        cwd: repoRoot,
        env: {
          ...process.env,
          NODE_NO_WARNINGS: '1',
          ...envOverrides,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code !== 0) {
        reject(new Error(`CLI exited with code ${code}\nstdout=${stdout}\nstderr=${stderr}`));
        return;
      }

      try {
        resolve(JSON.parse(stdout));
      } catch (error) {
        reject(error);
      }
    });
  });
}

function createContractsFixtureRoot(mutator?: (contractsRoot: string) => void) {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-contract-fixture-'));
  const fixtureContractsRoot = path.join(fixtureRoot, 'contracts', 'opl-gateway');
  fs.mkdirSync(fixtureContractsRoot, { recursive: true });
  fs.cpSync(contractsDir, fixtureContractsRoot, {
    recursive: true,
  });
  mutator?.(fixtureContractsRoot);
  return { fixtureRoot, fixtureContractsRoot };
}

function createFakeHermesFixture(handlerBody: string) {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-hermes-fixture-'));
  const hermesPath = path.join(fixtureRoot, 'fake-hermes');
  fs.writeFileSync(
    hermesPath,
    `#!/usr/bin/env bash
set -euo pipefail
${handlerBody}
`,
    { mode: 0o755 },
  );
  return {
    fixtureRoot,
    hermesPath,
  };
}

function createFakePsFixture(output: string) {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-ps-fixture-'));
  const psPath = path.join(fixtureRoot, 'ps');
  fs.writeFileSync(
    psPath,
    `#!/usr/bin/env bash
set -euo pipefail
cat <<'EOF'
${output}
EOF
`,
    { mode: 0o755 },
  );
  return {
    fixtureRoot,
    psPath,
  };
}

function shellSingleQuote(value: string) {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function buildManifestCommand(payload: Record<string, unknown>) {
  return `${process.execPath} -e "process.stdout.write(process.argv[1])" ${shellSingleQuote(JSON.stringify(payload))}`;
}

function createFakeLaunchctlFixture() {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-launchctl-fixture-'));
  const stateDir = path.join(fixtureRoot, 'state');
  fs.mkdirSync(stateDir, { recursive: true });
  const launchctlPath = path.join(fixtureRoot, 'launchctl');
  fs.writeFileSync(
    launchctlPath,
    `#!/usr/bin/env bash
set -euo pipefail
STATE_DIR="${stateDir}"
CALLS="$STATE_DIR/calls.log"
mkdir -p "$STATE_DIR"
printf '%s\\n' "$*" >> "$CALLS"

case "$1" in
  bootstrap)
    touch "$STATE_DIR/loaded"
    exit 0
    ;;
  bootout)
    rm -f "$STATE_DIR/loaded"
    exit 0
    ;;
  kickstart)
    touch "$STATE_DIR/loaded"
    exit 0
    ;;
  print)
    if [ -f "$STATE_DIR/loaded" ]; then
      cat <<'EOF'
service = ai.opl.frontdesk
state = running
EOF
      exit 0
    fi
    echo "service not loaded" >&2
    exit 113
    ;;
esac

echo "unexpected launchctl args: $*" >&2
exit 1
`,
    { mode: 0o755 },
  );

  return {
    fixtureRoot,
    launchctlPath,
    callsPath: path.join(stateDir, 'calls.log'),
  };
}

function createFakeOpenFixture() {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-open-fixture-'));
  const capturePath = path.join(fixtureRoot, 'open.log');
  const openPath = path.join(fixtureRoot, 'open');
  fs.writeFileSync(
    openPath,
    `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$*" > "${capturePath}"
`,
    { mode: 0o755 },
  );

  return {
    fixtureRoot,
    openPath,
    capturePath,
  };
}

type FakePaperclipRequest = {
  method: string;
  path: string;
  headers: IncomingHttpHeaders;
  body: Record<string, unknown> | null;
};

async function readServerJsonBody(request: IncomingMessage) {
  return await new Promise<Record<string, unknown> | null>((resolve, reject) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      body += chunk;
    });
    request.on('end', () => {
      if (!body.trim()) {
        resolve(null);
        return;
      }

      try {
        resolve(JSON.parse(body) as Record<string, unknown>);
      } catch (error) {
        reject(error);
      }
    });
    request.on('error', reject);
  });
}

async function startFakePaperclipServer() {
  const requests: FakePaperclipRequest[] = [];
  const server = createServer(async (request: IncomingMessage, response: ServerResponse<IncomingMessage>) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    const body = await readServerJsonBody(request);
    requests.push({
      method: request.method ?? 'GET',
      path: url.pathname,
      headers: request.headers,
      body,
    });

    response.setHeader('content-type', 'application/json; charset=utf-8');
    response.setHeader('connection', 'close');

    if (request.method === 'POST' && /^\/api\/companies\/[^/]+\/issues$/.test(url.pathname)) {
      const companyId = url.pathname.split('/')[3] ?? 'unknown-company';
      response.statusCode = 201;
      response.end(JSON.stringify({
        id: `issue-${requests.filter((entry) => entry.path.endsWith('/issues')).length}`,
        companyId,
        title: String(body?.title ?? 'Untitled issue'),
        status: String(body?.status ?? 'backlog'),
        priority: String(body?.priority ?? 'medium'),
        projectId: body?.projectId ?? null,
        projectWorkspaceId: body?.projectWorkspaceId ?? null,
        executionWorkspacePreference: body?.executionWorkspacePreference ?? null,
      }));
      return;
    }

    if (request.method === 'POST' && /^\/api\/companies\/[^/]+\/approvals$/.test(url.pathname)) {
      const companyId = url.pathname.split('/')[3] ?? 'unknown-company';
      response.statusCode = 201;
      response.end(JSON.stringify({
        id: `approval-${requests.filter((entry) => entry.path.endsWith('/approvals')).length}`,
        companyId,
        type: body?.type ?? null,
        status: 'pending',
        payload: body?.payload ?? {},
        issueIds: Array.isArray(body?.issueIds) ? body?.issueIds : [],
      }));
      return;
    }

    response.statusCode = 404;
    response.end(JSON.stringify({
      error: 'not_found',
      path: url.pathname,
    }));
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      resolve();
    });
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    server.close();
    throw new Error('Failed to bind fake Paperclip server.');
  }

  return {
    server,
    requests,
    baseUrl: `http://127.0.0.1:${address.port}`,
  };
}

async function stopHttpServer(server: Server) {
  await new Promise<void>((resolve, reject) => {
    server.closeAllConnections?.();
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

async function startCliServer(
  args: string[],
  envOverrides: Record<string, string> = {},
  timeoutMs = 10_000,
): Promise<{
  child: ChildProcessByStdio<null, Readable, Readable>;
  payload: Record<string, unknown>;
  stdout: string;
  stderr: string;
}> {
  return await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ['--experimental-strip-types', cliPath, ...args],
      {
        cwd: repoRoot,
        env: {
          ...process.env,
          NODE_NO_WARNINGS: '1',
          ...envOverrides,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    let stdout = '';
    let stderr = '';

    const finishReject = (message: string) => {
      clearTimeout(timeout);
      child.kill('SIGTERM');
      reject(new Error(`${message}\nstdout=${stdout}\nstderr=${stderr}`));
    };

    const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
      finishReject(`CLI server exited before startup payload was ready (code=${code}, signal=${signal}).`);
    };

    const timeout = setTimeout(() => {
      finishReject('Timed out while waiting for CLI server startup payload.');
    }, timeoutMs);

    child.once('exit', onExit);
    child.stderr.on('data', (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });
    child.stdout.on('data', (chunk: Buffer | string) => {
      stdout += chunk.toString();

      try {
        const payload = JSON.parse(stdout.trim()) as Record<string, unknown>;
        clearTimeout(timeout);
        child.off('exit', onExit);
        resolve({
          child,
          payload,
          stdout,
          stderr,
        });
      } catch {
        // Wait until the full startup payload is written.
      }
    });
  });
}

async function stopCliServer(child: ChildProcessByStdio<null, Readable, Readable>) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  await new Promise<void>((resolve) => {
    const forceKill = setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGKILL');
      }
    }, 2_000);

    child.once('exit', () => {
      clearTimeout(forceKill);
      resolve();
    });
    child.kill('SIGTERM');
  });
}

function assertContractsContext(
  output: { contracts_context?: { contracts_dir: string; contracts_root_source: string } },
  contractsRootSource: string,
  expectedContractsDir = contractsDir,
) {
  assert.deepEqual(output.contracts_context, {
    contracts_dir: expectedContractsDir,
    contracts_root_source: contractsRootSource,
  });
}

function assertNoContractsProvenance(payload: {
  help?: unknown;
  error?: { details?: Record<string, unknown> };
  contracts_context?: unknown;
}) {
  assert.equal(payload.contracts_context, undefined);
  assert.equal(payload.error?.details?.contracts_dir, undefined);
  assert.equal(payload.error?.details?.contracts_root_source, undefined);
}

test('loadGatewayContracts returns the frozen gateway registries', () => {
  const contracts = loadGatewayContracts(repoRoot);

  assert.equal(contracts.contractsRootSource, 'api');
  assert.equal(contracts.workstreams.version, 'g1');
  assert.equal(contracts.domains.version, 'g1');
  assert.equal(contracts.routingVocabulary.version, 'g1');
  assert.equal(contracts.taskTopology.scope, 'opl_task_topology');
  assert.equal(
    contracts.publicSurfaceIndex.scope,
    'opl_public_gateway_surface_index',
  );
});

test('loadGatewayContracts rejects missing files with a stable error', async (t) => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-gateway-missing-'));
  const expectedContractsDir = path.join(tempRoot, 'contracts', 'opl-gateway');

  await t.test('missing contracts directory', () => {
    assert.throws(
      () => loadGatewayContracts(tempRoot),
      (error: unknown) => {
        assert.ok(error instanceof GatewayContractError);
        assert.equal(error.code, 'contract_file_missing');
        assert.equal(error.details?.contracts_dir, expectedContractsDir);
        assert.equal(error.details?.contracts_root_source, 'api');
        return true;
      },
    );
  });
});

test('loadGatewayContracts honors OPL_CONTRACTS_DIR when provided', () => {
  const tempContracts = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-gateway-contracts-'));
  fs.cpSync(contractsDir, tempContracts, {
    recursive: true,
  });

  const workstreamsPath = path.join(tempContracts, 'workstreams.json');
  const workstreams = JSON.parse(fs.readFileSync(workstreamsPath, 'utf8'));
  workstreams.workstreams[0].label = 'Research Ops Override';
  fs.writeFileSync(workstreamsPath, JSON.stringify(workstreams, null, 2));

  const output = runCli(['get-workstream', 'research_ops'], {
    OPL_CONTRACTS_DIR: tempContracts,
  });

  assertContractsContext(output, 'env', tempContracts);
  assert.equal(output.workstream.label, 'Research Ops Override');
});

test('global --contracts-dir override uses the explicit contract root', () => {
  const { fixtureRoot, fixtureContractsRoot } = createContractsFixtureRoot((contractsRoot) => {
    const workstreamsPath = path.join(contractsRoot, 'workstreams.json');
    const workstreams = JSON.parse(fs.readFileSync(workstreamsPath, 'utf8'));
    workstreams.workstreams[0].label = 'Research Ops From Flag';
    fs.writeFileSync(workstreamsPath, JSON.stringify(workstreams, null, 2));
  });

  try {
    const output = runCli([
      '--contracts-dir',
      fixtureContractsRoot,
      'get-workstream',
      'research_ops',
    ]);

    assertContractsContext(output, 'cli_flag', fixtureContractsRoot);
    assert.equal(output.workstream.label, 'Research Ops From Flag');
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('global --contracts-dir override takes precedence over OPL_CONTRACTS_DIR', () => {
  const envFixture = createContractsFixtureRoot((contractsRoot) => {
    const workstreamsPath = path.join(contractsRoot, 'workstreams.json');
    const workstreams = JSON.parse(fs.readFileSync(workstreamsPath, 'utf8'));
    workstreams.workstreams[0].label = 'Research Ops From Env';
    fs.writeFileSync(workstreamsPath, JSON.stringify(workstreams, null, 2));
  });
  const flagFixture = createContractsFixtureRoot((contractsRoot) => {
    const workstreamsPath = path.join(contractsRoot, 'workstreams.json');
    const workstreams = JSON.parse(fs.readFileSync(workstreamsPath, 'utf8'));
    workstreams.workstreams[0].label = 'Research Ops From Flag';
    fs.writeFileSync(workstreamsPath, JSON.stringify(workstreams, null, 2));
  });

  try {
    const output = runCli(
      ['--contracts-dir', flagFixture.fixtureContractsRoot, 'get-workstream', 'research_ops'],
      { OPL_CONTRACTS_DIR: envFixture.fixtureContractsRoot },
    );

    assertContractsContext(output, 'cli_flag', flagFixture.fixtureContractsRoot);
    assert.equal(output.workstream.label, 'Research Ops From Flag');
  } finally {
    fs.rmSync(envFixture.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(flagFixture.fixtureRoot, { recursive: true, force: true });
  }
});

test('validateGatewayContracts returns a stable summary for the required contract set', () => {
  const validation = validateGatewayContracts(repoRoot);
  const contracts = loadGatewayContracts(repoRoot);

  assert.deepEqual(validation, {
    status: 'valid',
    contracts_dir: contractsDir,
    contracts_root_source: 'api',
    validated_contracts: [
      {
        contract_id: 'workstreams',
        file: path.join(contractsDir, 'workstreams.json'),
        schema_version: 'g1',
        status: 'valid',
      },
      {
        contract_id: 'domains',
        file: path.join(contractsDir, 'domains.json'),
        schema_version: 'g1',
        status: 'valid',
      },
      {
        contract_id: 'routing_vocabulary',
        file: path.join(contractsDir, 'routing-vocabulary.json'),
        schema_version: 'g1',
        status: 'valid',
      },
      {
        contract_id: 'task_topology',
        file: path.join(contractsDir, 'task-topology.json'),
        schema_version: contracts.taskTopology.version,
        status: 'valid',
      },
      {
        contract_id: 'public_surface_index',
        file: path.join(contractsDir, 'public-surface-index.json'),
        schema_version: contracts.publicSurfaceIndex.version,
        status: 'valid',
      },
    ],
  });
});

test('validate-contracts returns a stable machine-readable contract summary', () => {
  const output = runCli(['validate-contracts']);
  const contracts = loadGatewayContracts(repoRoot);

  assert.deepEqual(output, {
    version: 'g2',
    validation: {
      status: 'valid',
      contracts_dir: contractsDir,
      contracts_root_source: 'cwd',
      validated_contracts: [
        {
          contract_id: 'workstreams',
          file: path.join(contractsDir, 'workstreams.json'),
          schema_version: 'g1',
          status: 'valid',
        },
        {
          contract_id: 'domains',
          file: path.join(contractsDir, 'domains.json'),
          schema_version: 'g1',
          status: 'valid',
        },
        {
          contract_id: 'routing_vocabulary',
          file: path.join(contractsDir, 'routing-vocabulary.json'),
          schema_version: 'g1',
          status: 'valid',
        },
        {
          contract_id: 'task_topology',
          file: path.join(contractsDir, 'task-topology.json'),
          schema_version: contracts.taskTopology.version,
          status: 'valid',
        },
        {
          contract_id: 'public_surface_index',
          file: path.join(contractsDir, 'public-surface-index.json'),
          schema_version: contracts.publicSurfaceIndex.version,
          status: 'valid',
        },
      ],
    },
  });
});

test('doctor reports a ready local product-entry shell when Hermes is available', () => {
  const { fixtureRoot, hermesPath } = createFakeHermesFixture(`
if [ "$1" = "version" ]; then
  echo "Hermes Agent v9.9.9-test"
  exit 0
fi
if [ "$1" = "gateway" ] && [ "$2" = "status" ]; then
  cat <<'EOF'
Launchd plist: /tmp/ai.hermes.gateway.plist
✓ Service definition matches the current Hermes install
✓ Gateway service is loaded
EOF
  exit 0
fi
echo "unexpected fake-hermes args: $*" >&2
exit 1
`);

  try {
    const output = runCli(['doctor'], {
      OPL_HERMES_BIN: hermesPath,
    });

    assert.equal(output.version, 'g2');
    assert.equal(output.product_entry.entry_surface, 'opl_local_product_entry_shell');
    assert.equal(output.product_entry.ready, true);
    assert.equal(output.product_entry.local_entry_ready, true);
    assert.equal(output.product_entry.messaging_gateway_ready, true);
    assert.equal(output.product_entry.hermes.binary.path, hermesPath);
    assert.equal(output.product_entry.hermes.version, 'Hermes Agent v9.9.9-test');
    assert.equal(output.product_entry.hermes.gateway_service.loaded, true);
    assert.deepEqual(output.product_entry.issues, []);
    assert.equal(output.validation.status, 'valid');
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('projects returns the current OPL family project surfaces', () => {
  const output = runCli(['projects']);

  assert.equal(output.version, 'g2');
  assert.equal(output.projects.length, 3);
  assert.equal(output.projects[0].project_id, 'opl');
  assert.equal(output.projects[0].scope, 'family_gateway');
  assert.equal(output.projects[0].direct_entry_surface, 'opl');
  assert.equal(output.projects[1].project_id, 'medautoscience');
  assert.equal(output.projects[2].project_id, 'redcube');
});

test('workspace-status reports git and worktree visibility for one workspace path', () => {
  const output = runCli(['workspace-status', '--path', repoRoot]);

  assert.equal(output.version, 'g2');
  assert.equal(output.workspace.absolute_path, repoRoot);
  assert.equal(output.workspace.kind, 'directory');
  assert.equal(output.workspace.entries.total > 0, true);
  assert.equal(output.workspace.git.inside_work_tree, true);
  assert.equal(output.workspace.git.root, repoRoot);
  assert.equal(typeof output.workspace.git.linked_worktree, 'boolean');
  assert.equal(typeof output.workspace.git.is_clean, 'boolean');
});

test('bare opl command seeds a front-desk session when not attached to a tty', () => {
  const { fixtureRoot, hermesPath } = createFakeHermesFixture(`
if [ "$1" = "chat" ]; then
  cat <<'EOF'
╭─ ⚕ Hermes ───────────────────────────────────────────────────────────────────╮
OPL FRONT DESK READY

session_id: opl-frontdesk-session
EOF
  exit 0
fi
if [ "$1" = "--resume" ] && [ "$2" = "opl-frontdesk-session" ]; then
  cat <<'EOF'
OPL FRONT DESK RESUMED
EOF
  exit 0
fi
echo "unexpected fake-hermes args: $*" >&2
exit 1
`);

  try {
    const output = runCli([], {
      OPL_HERMES_BIN: hermesPath,
    });

    assert.equal(output.version, 'g2');
    assert.equal(output.product_entry.mode, 'frontdesk');
    assert.equal(output.product_entry.interactive, false);
    assert.equal(output.product_entry.seed.session_id, 'opl-frontdesk-session');
    assert.equal(output.product_entry.seed.response, 'OPL FRONT DESK READY');
    assert.equal(output.product_entry.resume.session_id, 'opl-frontdesk-session');
    assert.equal(output.product_entry.resume.output, 'OPL FRONT DESK RESUMED');
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('natural-language fallback routes multi-token input through quick ask', () => {
  const { fixtureRoot, hermesPath } = createFakeHermesFixture(`
if [ "$1" = "chat" ]; then
  cat <<'EOF'
╭─ ⚕ Hermes ───────────────────────────────────────────────────────────────────╮
AUTO ASK READY

session_id: opl-quick-ask-session
EOF
  exit 0
fi
echo "unexpected fake-hermes args: $*" >&2
exit 1
`);

  try {
    const output = runCli(
      ['Plan', 'a', 'medical', 'grant', 'proposal', 'revision', 'loop.'],
      {
        OPL_HERMES_BIN: hermesPath,
      },
    );

    assert.equal(output.product_entry.mode, 'ask');
    assert.equal(output.product_entry.input.goal, 'Plan a medical grant proposal revision loop.');
    assert.equal(output.product_entry.routing.status, 'unknown_domain');
    assert.equal(output.product_entry.routing.candidate_workstream_id, 'grant_ops');
    assert.equal(output.product_entry.hermes.session_id, 'opl-quick-ask-session');
    assert.equal(output.product_entry.hermes.response, 'AUTO ASK READY');
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('ask --dry-run produces a routed Hermes handoff preview from a plain-language request', () => {
  const output = runCli([
    'ask',
    'Prepare a defense-ready slide deck for a thesis committee.',
    '--preferred-family',
    'ppt_deck',
    '--dry-run',
  ]);

  assert.equal(output.version, 'g2');
  assert.equal(output.product_entry.mode, 'ask');
  assert.equal(output.product_entry.dry_run, true);
  assert.equal(output.product_entry.input.goal, 'Prepare a defense-ready slide deck for a thesis committee.');
  assert.equal(output.product_entry.input.intent, 'create');
  assert.equal(output.product_entry.input.target, 'deliverable');
  assert.equal(output.product_entry.routing.status, 'routed');
  assert.equal(output.product_entry.routing.domain_id, 'redcube');
  assert.equal(output.product_entry.routing.workstream_id, 'presentation_ops');
  assert.match(output.product_entry.handoff_prompt_preview, /One Person Lab \(OPL\) Product Entry/);
  assert.match(output.product_entry.handoff_prompt_preview, /presentation_ops/);
  assert.equal(output.product_entry.hermes.command_preview[0], 'hermes');
  assert.ok(output.product_entry.hermes.command_preview.includes('--query'));
});

test('ask runs Hermes through the resolved product-entry handoff and returns the captured response', () => {
  const { fixtureRoot, hermesPath } = createFakeHermesFixture(`
if [ "$1" = "version" ]; then
  echo "Hermes Agent v9.9.9-test"
  exit 0
fi
if [ "$1" = "gateway" ] && [ "$2" = "status" ]; then
  cat <<'EOF'
Launchd plist: /tmp/ai.hermes.gateway.plist
✓ Service definition matches the current Hermes install
✓ Gateway service is loaded
EOF
  exit 0
fi
if [ "$1" = "chat" ]; then
  cat <<'EOF'
╭─ ⚕ Hermes ───────────────────────────────────────────────────────────────────╮
READY FROM OPL

session_id: opl-test-session
EOF
  exit 0
fi
echo "unexpected fake-hermes args: $*" >&2
exit 1
`);

  try {
    const output = runCli(
      [
        'ask',
        'Create a xiaohongshu campaign pack for a lab update.',
        '--preferred-family',
        'xiaohongshu',
      ],
      {
        OPL_HERMES_BIN: hermesPath,
      },
    );

    assert.equal(output.version, 'g2');
    assert.equal(output.product_entry.mode, 'ask');
    assert.equal(output.product_entry.dry_run, false);
    assert.equal(output.product_entry.routing.status, 'domain_boundary');
    assert.equal(output.product_entry.routing.domain_id, 'redcube');
    assert.equal(output.product_entry.hermes.session_id, 'opl-test-session');
    assert.equal(output.product_entry.hermes.response, 'READY FROM OPL');
    assert.equal(output.product_entry.hermes.exit_code, 0);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('resume returns captured session output in non-interactive mode', () => {
  const { fixtureRoot, hermesPath } = createFakeHermesFixture(`
if [ "$1" = "--resume" ] && [ "$2" = "opl-test-session" ]; then
  cat <<'EOF'
RESUMED SESSION BODY
EOF
  exit 0
fi
echo "unexpected fake-hermes args: $*" >&2
exit 1
`);

  try {
    const output = runCli(['resume', 'opl-test-session'], {
      OPL_HERMES_BIN: hermesPath,
    });

    assert.equal(output.product_entry.mode, 'resume');
    assert.equal(output.product_entry.interactive, false);
    assert.equal(output.product_entry.resume.session_id, 'opl-test-session');
    assert.equal(output.product_entry.resume.output, 'RESUMED SESSION BODY');
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('sessions parses the Hermes recent-session table into a product-entry surface', () => {
  const { fixtureRoot, hermesPath } = createFakeHermesFixture(`
if [ "$1" = "sessions" ] && [ "$2" = "list" ]; then
  cat <<'EOF'
Preview                                            Last Active   Src    ID
───────────────────────────────────────────────────────────────────────────────────────────────
Execute the following RedCube service entry enve   10m ago       api_server run_7e2a41
Medical grant revision session                     2m ago        cli    sess_abcd
EOF
  exit 0
fi
echo "unexpected fake-hermes args: $*" >&2
exit 1
`);

  try {
    const output = runCli(['sessions', '--limit', '2'], {
      OPL_HERMES_BIN: hermesPath,
    });

    assert.equal(output.product_entry.mode, 'sessions');
    assert.equal(output.product_entry.sessions.length, 2);
    assert.equal(output.product_entry.sessions[0].session_id, 'run_7e2a41');
    assert.equal(output.product_entry.sessions[0].source, 'api_server');
    assert.equal(output.product_entry.sessions[1].session_id, 'sess_abcd');
    assert.equal(output.product_entry.sessions[1].preview, 'Medical grant revision session');
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('runtime-status reports Hermes runtime health, sessions, and process usage', () => {
  const { fixtureRoot, hermesPath } = createFakeHermesFixture(`
if [ "$1" = "version" ]; then
  echo "Hermes Agent v9.9.9-test"
  exit 0
fi
if [ "$1" = "gateway" ] && [ "$2" = "status" ]; then
  cat <<'EOF'
Launchd plist: /tmp/ai.hermes.gateway.plist
✓ Service definition matches the current Hermes install
✓ Gateway service is loaded
EOF
  exit 0
fi
if [ "$1" = "status" ]; then
  cat <<'EOF'
◆ Environment
  Project:      /tmp/hermes-agent
  Model:        gpt-5.4
◆ Terminal Backend
  Backend:      local
◆ Messaging Platforms
  Telegram      ✓ configured
  Slack         ✗ not configured
◆ Gateway Service
  Status:       ✓ loaded
  Manager:      launchd
◆ Scheduled Jobs
  Jobs:         2
◆ Sessions
  Active:       3
EOF
  exit 0
fi
if [ "$1" = "sessions" ] && [ "$2" = "list" ]; then
  cat <<'EOF'
Preview                                            Last Active   Src    ID
───────────────────────────────────────────────────────────────────────────────────────────────
OPL dashboard session                              1m ago        cli    sess_dash
RedCube active session                             2m ago        api_server sess_redcube
EOF
  exit 0
fi
echo "unexpected fake-hermes args: $*" >&2
exit 1
`);
  const psFixture = createFakePsFixture(`27025 1 0.1 0.2 49616 22:46 /Users/test/.hermes/venv/bin/python -m hermes_cli.main gateway run --replace
27026 27025 5.2 1.1 125000 00:31 /Users/test/.hermes/venv/bin/python -m hermes_cli.main chat --resume sess_dash`);

  try {
    const output = runCli(['runtime-status', '--limit', '2'], {
      OPL_HERMES_BIN: hermesPath,
      PATH: `${psFixture.fixtureRoot}:${process.env.PATH ?? ''}`,
    });

    assert.equal(output.version, 'g2');
    assert.equal(output.runtime_status.runtime_substrate, 'external_hermes_kernel');
    assert.equal(output.runtime_status.hermes.binary.path, hermesPath);
    assert.equal(output.runtime_status.status_report.parsed.summary.active_sessions, 3);
    assert.equal(output.runtime_status.status_report.parsed.summary.scheduled_jobs, 2);
    assert.deepEqual(output.runtime_status.status_report.parsed.summary.configured_messaging_platforms, ['Telegram']);
    assert.equal(output.runtime_status.recent_sessions.sessions.length, 2);
    assert.equal(output.runtime_status.process_usage.summary.process_count, 2);
    assert.equal(output.runtime_status.process_usage.processes[0].role, 'gateway');
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
    fs.rmSync(psFixture.fixtureRoot, { recursive: true, force: true });
  }
});

test('dashboard aggregates front-desk management surfaces into one view', () => {
  const { fixtureRoot, hermesPath } = createFakeHermesFixture(`
if [ "$1" = "version" ]; then
  echo "Hermes Agent v9.9.9-test"
  exit 0
fi
if [ "$1" = "gateway" ] && [ "$2" = "status" ]; then
  cat <<'EOF'
Launchd plist: /tmp/ai.hermes.gateway.plist
✓ Service definition matches the current Hermes install
✓ Gateway service is loaded
EOF
  exit 0
fi
if [ "$1" = "status" ]; then
  cat <<'EOF'
◆ Environment
  Project:      /tmp/hermes-agent
◆ Gateway Service
  Status:       ✓ loaded
  Manager:      launchd
◆ Scheduled Jobs
  Jobs:         0
◆ Sessions
  Active:       1
EOF
  exit 0
fi
if [ "$1" = "sessions" ] && [ "$2" = "list" ]; then
  cat <<'EOF'
Preview                                            Last Active   Src    ID
───────────────────────────────────────────────────────────────────────────────────────────────
OPL dashboard session                              1m ago        cli    sess_dash
EOF
  exit 0
fi
echo "unexpected fake-hermes args: $*" >&2
exit 1
`);
  const psFixture = createFakePsFixture(`27025 1 0.1 0.2 49616 22:46 /Users/test/.hermes/venv/bin/python -m hermes_cli.main gateway run --replace`);

  try {
    const output = runCli(['dashboard', '--path', repoRoot, '--sessions-limit', '1'], {
      OPL_HERMES_BIN: hermesPath,
      PATH: `${psFixture.fixtureRoot}:${process.env.PATH ?? ''}`,
    });

    assert.equal(output.version, 'g2');
    assert.equal(output.dashboard.front_desk.direct_entry_command, 'opl');
    assert.equal(output.dashboard.front_desk.local_web_frontdesk_status, 'pilot_landed');
    assert.equal(output.dashboard.front_desk.hosted_web_status, 'librechat_pilot_landed');
    assert.equal(output.dashboard.front_desk.librechat_pilot_package_status, 'landed');
    assert.equal(output.dashboard.front_desk.recommended_entry_surfaces_count, 0);
    assert.deepEqual(output.dashboard.front_desk.recommended_entry_surfaces, []);
    assert.equal(output.dashboard.projects.length, 3);
    assert.equal(output.dashboard.domain_manifests.summary.total_projects_count, 2);
    assert.equal(output.dashboard.domain_manifests.summary.resolved_count, 0);
    assert.equal(output.dashboard.workspace.absolute_path, repoRoot);
    assert.equal(output.dashboard.runtime_status.recent_sessions.sessions.length, 1);
    assert.deepEqual(output.dashboard.front_desk.rollout_board_refs, [
      'docs/references/opl-frontdesk-delivery-board.md',
      'docs/references/opl-hosted-web-frontdesk-benchmark.md',
      'docs/references/family-lightweight-direct-entry-rollout-board.md',
      'docs/references/mas-top-level-cutover-board.md',
    ]);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
    fs.rmSync(psFixture.fixtureRoot, { recursive: true, force: true });
  }
});

test('help advertises the local web front-desk pilot command surface', () => {
  const output = runCli(['help']);

  assert.ok(
    output.help.commands.some((entry: { command: string }) => entry.command === 'web'),
  );
  assert.ok(
    output.help.commands.some((entry: { command: string }) => entry.command === 'frontdesk-manifest'),
  );

  const scoped = runCli(['web', '--help']);
  assert.equal(scoped.help.command, 'web');
  assert.match(scoped.help.usage, /opl web/);
});

test('frontdesk-manifest exposes the hosted-friendly OPL shell contract without claiming hosted readiness', () => {
  const output = runCli(['frontdesk-manifest']);

  assert.equal(output.version, 'g2');
  assert.equal(output.frontdesk_manifest.surface_id, 'opl_hosted_friendly_frontdesk_manifest');
  assert.equal(output.frontdesk_manifest.entry_surface, 'opl_local_web_frontdesk_pilot');
  assert.equal(output.frontdesk_manifest.shell_integration_target, 'librechat_first');
  assert.equal(output.frontdesk_manifest.readiness, 'hosted_friendly_shell_pilot_landed');
  assert.equal(output.frontdesk_manifest.hosted_packaging_status, 'librechat_pilot_landed');
  assert.deepEqual(output.frontdesk_manifest.handoff_envelope_fields, [
    'target_domain_id',
    'task_intent',
    'entry_mode',
    'workspace_locator',
    'runtime_session_contract',
    'return_surface_contract',
  ]);
  assert.equal(output.frontdesk_manifest.endpoints.manifest, '/api/frontdesk-manifest');
  assert.equal(output.frontdesk_manifest.endpoints.domain_manifests, '/api/domain-manifests');
  assert.equal(output.frontdesk_manifest.endpoints.health, '/api/health');
  assert.equal(output.frontdesk_manifest.endpoints.resume, '/api/resume');
  assert.equal(output.frontdesk_manifest.endpoints.logs, '/api/logs');
});

test('frontdesk-service commands manage the local launchd wrapper for the web pilot', async () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-frontdesk-home-'));
  const launchctlFixture = createFakeLaunchctlFixture();
  const openFixture = createFakeOpenFixture();
  const serviceEnv = {
    HOME: homeRoot,
    OPL_LAUNCHCTL_BIN: launchctlFixture.launchctlPath,
    OPL_OPEN_BIN: openFixture.openPath,
  };
  const configuredPort = 8911;

  try {
    const install = runCli([
      'frontdesk-service-install',
      '--host',
      '127.0.0.1',
      '--port',
      String(configuredPort),
      '--path',
      repoRoot,
      '--sessions-limit',
      '7',
    ], serviceEnv);

    assert.equal(install.frontdesk_service.action, 'install');
    assert.equal(install.frontdesk_service.installed, true);
    assert.equal(install.frontdesk_service.loaded, true);
    assert.equal(install.frontdesk_service.base_url, `http://127.0.0.1:${configuredPort}`);
    assert.equal(install.frontdesk_service.paths.launch_agent_plist.endsWith('.plist'), true);
    assert.equal(fs.existsSync(install.frontdesk_service.paths.launch_agent_plist), true);
    assert.equal(fs.existsSync(install.frontdesk_service.paths.config_file), true);

    const plistText = fs.readFileSync(install.frontdesk_service.paths.launch_agent_plist, 'utf8');
    assert.match(plistText, /<string>web<\/string>/);
    assert.match(plistText, new RegExp(String(configuredPort)));

    const statusWithoutHealth = runCli(['frontdesk-service-status'], serviceEnv);
    assert.equal(statusWithoutHealth.frontdesk_service.action, 'status');
    assert.equal(statusWithoutHealth.frontdesk_service.installed, true);
    assert.equal(statusWithoutHealth.frontdesk_service.loaded, true);
    assert.equal(statusWithoutHealth.frontdesk_service.health.status, 'unreachable');

    const statusWithHealth = runCli(['frontdesk-service-status'], serviceEnv);
    assert.equal(statusWithHealth.frontdesk_service.loaded, true);
    assert.equal(statusWithHealth.frontdesk_service.health.status, 'unreachable');
    assert.equal(
      statusWithHealth.frontdesk_service.health.url,
      `http://127.0.0.1:${configuredPort}/api/health`,
    );

    const openOutput = runCli(['frontdesk-service-open'], serviceEnv);
    assert.equal(openOutput.frontdesk_service.action, 'open');
    assert.match(fs.readFileSync(openFixture.capturePath, 'utf8'), new RegExp(String(configuredPort)));

    const stopOutput = runCli(['frontdesk-service-stop'], serviceEnv);
    assert.equal(stopOutput.frontdesk_service.action, 'stop');
    assert.equal(stopOutput.frontdesk_service.loaded, false);

    const stoppedStatus = runCli(['frontdesk-service-status'], serviceEnv);
    assert.equal(stoppedStatus.frontdesk_service.loaded, false);
    assert.equal(stoppedStatus.frontdesk_service.health.status, 'not_running');

    const startOutput = runCli(['frontdesk-service-start'], serviceEnv);
    assert.equal(startOutput.frontdesk_service.action, 'start');
    assert.equal(startOutput.frontdesk_service.loaded, true);

    const uninstallOutput = runCli(['frontdesk-service-uninstall'], serviceEnv);
    assert.equal(uninstallOutput.frontdesk_service.action, 'uninstall');
    assert.equal(uninstallOutput.frontdesk_service.installed, false);
    assert.equal(fs.existsSync(install.frontdesk_service.paths.launch_agent_plist), false);
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
    fs.rmSync(launchctlFixture.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(openFixture.fixtureRoot, { recursive: true, force: true });
  }
});

test('frontdesk-hosted-bundle exposes a hosted-pilot-ready bundle with base-path aware endpoints', () => {
  const output = runCli([
    'frontdesk-hosted-bundle',
    '--host',
    '0.0.0.0',
    '--port',
    '8787',
    '--base-path',
    '/pilot/opl',
    '--path',
    repoRoot,
    '--sessions-limit',
    '9',
  ]);

  assert.equal(output.version, 'g2');
  assert.equal(output.hosted_pilot_bundle.surface_id, 'opl_hosted_frontdesk_pilot_bundle');
  assert.equal(output.hosted_pilot_bundle.shell_integration_target, 'librechat_first');
  assert.equal(output.hosted_pilot_bundle.pilot_bundle_status, 'landed');
  assert.equal(output.hosted_pilot_bundle.actual_hosted_runtime_status, 'not_landed');
  assert.equal(output.hosted_pilot_bundle.base_path, '/pilot/opl');
  assert.equal(output.hosted_pilot_bundle.entry_url, 'http://127.0.0.1:8787/pilot/opl/');
  assert.equal(output.hosted_pilot_bundle.api_base_url, 'http://127.0.0.1:8787/pilot/opl/api');
  assert.equal(output.hosted_pilot_bundle.endpoints.dashboard, '/pilot/opl/api/dashboard');
  assert.equal(output.hosted_pilot_bundle.defaults.workspace_path, repoRoot);
  assert.equal(output.hosted_pilot_bundle.defaults.sessions_limit, 9);
});

test('frontdesk-hosted-package exports a self-hostable hosted pilot package with runtime and proxy assets', () => {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-hosted-package-'));

  try {
    const output = runCli([
      'frontdesk-hosted-package',
      '--output',
      outputDir,
      '--public-origin',
      'https://opl.example.com',
      '--base-path',
      '/pilot/opl',
      '--host',
      '0.0.0.0',
      '--port',
      '8787',
      '--sessions-limit',
      '9',
    ]);

    assert.equal(output.version, 'g2');
    assert.equal(output.hosted_pilot_package.surface_id, 'opl_hosted_frontdesk_pilot_package');
    assert.equal(output.hosted_pilot_package.shell_integration_target, 'librechat_first');
    assert.equal(output.hosted_pilot_package.package_status, 'landed');
    assert.equal(output.hosted_pilot_package.actual_hosted_runtime_status, 'not_landed');
    assert.equal(output.hosted_pilot_package.public_origin, 'https://opl.example.com');
    assert.equal(output.hosted_pilot_package.entry_url, 'https://opl.example.com/pilot/opl/');
    assert.equal(output.hosted_pilot_package.api_base_url, 'https://opl.example.com/pilot/opl/api');

    const assets = output.hosted_pilot_package.assets;
    assert.equal(fs.existsSync(assets.bundle_json), true);
    assert.equal(fs.existsSync(assets.readme), true);
    assert.equal(fs.existsSync(assets.run_script), true);
    assert.equal(fs.existsSync(assets.systemd_service), true);
    assert.equal(fs.existsSync(assets.caddyfile), true);
    assert.equal(fs.existsSync(assets.env_example), true);
    assert.equal(fs.existsSync(assets.app_dist), true);
    assert.equal(fs.existsSync(path.join(assets.app_dist, 'cli.js')), true);
    assert.equal(fs.existsSync(path.join(assets.app_contracts, 'opl-gateway', 'workstreams.json')), true);

    const readme = fs.readFileSync(assets.readme, 'utf8');
    assert.match(readme, /LibreChat-first/i);
    assert.match(readme, /OPL_HERMES_BIN/);
    assert.match(readme, /actual hosted runtime is still not landed/i);

    const service = fs.readFileSync(assets.systemd_service, 'utf8');
    assert.match(service, /EnvironmentFile=/);
    assert.match(service, /run-frontdesk\.sh/);

    const runScript = fs.readFileSync(assets.run_script, 'utf8');
    assert.match(runScript, /--base-path/);
    assert.match(runScript, /\/pilot\/opl/);
    assert.match(runScript, /OPL_FRONTDESK_WORKSPACE/);

    const caddyfile = fs.readFileSync(assets.caddyfile, 'utf8');
    assert.match(caddyfile, /opl\.example\.com/);
    assert.match(caddyfile, /handle_path \/pilot\/opl\/\*/);
    assert.match(caddyfile, /reverse_proxy 127\.0\.0\.1:8787/);

    const envExample = fs.readFileSync(assets.env_example, 'utf8');
    assert.match(envExample, /OPL_HERMES_BIN=/);
    assert.match(envExample, /OPL_FRONTDESK_WORKSPACE=/);

    const bundleJson = JSON.parse(fs.readFileSync(assets.bundle_json, 'utf8'));
    assert.equal(bundleJson.hosted_pilot_package.entry_url, 'https://opl.example.com/pilot/opl/');
    assert.equal(bundleJson.hosted_pilot_package.base_path, '/pilot/opl');
  } finally {
    fs.rmSync(outputDir, { recursive: true, force: true });
  }
});

test('frontdesk-librechat-package exports a same-origin LibreChat-first hosted shell pilot', () => {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-librechat-package-'));

  try {
    const output = runCli([
      'frontdesk-librechat-package',
      '--output',
      outputDir,
      '--public-origin',
      'https://opl.example.com',
      '--base-path',
      '/pilot/opl',
      '--host',
      '0.0.0.0',
      '--port',
      '8787',
      '--sessions-limit',
      '9',
    ]);

    assert.equal(output.version, 'g2');
    assert.equal(output.librechat_pilot_package.surface_id, 'opl_librechat_hosted_shell_pilot_package');
    assert.equal(output.librechat_pilot_package.shell_integration_target, 'librechat_first');
    assert.equal(output.librechat_pilot_package.package_status, 'landed');
    assert.equal(output.librechat_pilot_package.hosted_shell_status, 'landed');
    assert.equal(output.librechat_pilot_package.actual_managed_runtime_status, 'not_landed');
    assert.equal(output.librechat_pilot_package.hosted_shell_entry_url, 'https://opl.example.com/');
    assert.equal(output.librechat_pilot_package.frontdesk_entry_url, 'https://opl.example.com/pilot/opl/');
    assert.equal(output.librechat_pilot_package.frontdesk_runtime_upstream, 'host.docker.internal:8787');

    const assets = output.librechat_pilot_package.assets;
    assert.equal(fs.existsSync(assets.readme), true);
    assert.equal(fs.existsSync(assets.stack_env_example), true);
    assert.equal(fs.existsSync(assets.compose_file), true);
    assert.equal(fs.existsSync(assets.librechat_config), true);
    assert.equal(fs.existsSync(assets.caddyfile), true);
    assert.equal(fs.existsSync(assets.run_script), true);
    assert.equal(fs.existsSync(assets.frontdesk_package_root), true);
    assert.equal(fs.existsSync(assets.frontdesk_bundle_json), true);

    const readme = fs.readFileSync(assets.readme, 'utf8');
    assert.match(readme, /LibreChat-first Hosted Pilot/i);
    assert.match(readme, /same-origin reverse-proxy/i);
    assert.match(readme, /managed hosted runtime is still not landed/i);

    const composeFile = fs.readFileSync(assets.compose_file, 'utf8');
    assert.match(composeFile, /registry\.librechat\.ai\/danny-avila\/librechat-dev:latest/);
    assert.match(composeFile, /caddy:2-alpine/);
    assert.match(composeFile, /host\.docker\.internal:host-gateway/);

    const caddyfile = fs.readFileSync(assets.caddyfile, 'utf8');
    assert.match(caddyfile, /@opl_frontdesk path \/pilot\/opl \/pilot\/opl\/\*/);
    assert.match(caddyfile, /reverse_proxy \{\$OPL_FRONTDESK_UPSTREAM\}/);

    const librechatConfig = fs.readFileSync(assets.librechat_config, 'utf8');
    assert.match(librechatConfig, /Welcome to the OPL hosted pilot/);
    assert.match(librechatConfig, /https:\/\/opl\.example\.com\/pilot\/opl\//);
  } finally {
    fs.rmSync(outputDir, { recursive: true, force: true });
  }
});

test('workspace registry commands bind activate and archive project workspaces with direct-entry locators', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-state-fixture-'));

  try {
    const bindOutput = runCli([
      'workspace-bind',
      '--project',
      'redcube',
      '--path',
      repoRoot,
      '--label',
      'RedCube Main Workspace',
      '--entry-command',
      'redcube-ai frontdesk',
      '--manifest-command',
      'redcube product manifest --workspace-root /Users/gaofeng/workspace/redcube-ai',
      '--entry-url',
      'http://127.0.0.1:3310/redcube',
    ], {
      OPL_FRONTDESK_STATE_DIR: stateRoot,
    });

    assert.equal(bindOutput.workspace_catalog.action, 'bind');
    assert.equal(bindOutput.workspace_catalog.binding.project_id, 'redcube');
    assert.equal(bindOutput.workspace_catalog.binding.direct_entry.command, 'redcube-ai frontdesk');
    assert.equal(
      bindOutput.workspace_catalog.binding.direct_entry.manifest_command,
      'redcube product manifest --workspace-root /Users/gaofeng/workspace/redcube-ai',
    );
    assert.equal(bindOutput.workspace_catalog.binding.direct_entry.url, 'http://127.0.0.1:3310/redcube');

    const catalogOutput = runCli(['workspace-catalog'], {
      OPL_FRONTDESK_STATE_DIR: stateRoot,
    });
    assert.equal(catalogOutput.workspace_catalog.projects.length, 3);
    assert.equal(catalogOutput.workspace_catalog.projects[2].project_id, 'redcube');
    assert.equal(catalogOutput.workspace_catalog.projects[2].active_binding.workspace_path, repoRoot);
    assert.equal(catalogOutput.workspace_catalog.projects[2].bindings_count.total, 1);
    assert.equal(catalogOutput.workspace_catalog.projects[2].bindings_count.direct_entry_ready, 1);
    assert.equal(catalogOutput.workspace_catalog.projects[2].bindings_count.manifest_ready, 1);
    assert.equal(catalogOutput.workspace_catalog.projects[2].last_updated_at, bindOutput.workspace_catalog.binding.updated_at);
    assert.deepEqual(catalogOutput.workspace_catalog.projects[2].available_actions, ['bind', 'activate', 'archive']);
    assert.equal(catalogOutput.workspace_catalog.summary.active_projects_count, 1);
    assert.equal(catalogOutput.workspace_catalog.summary.direct_entry_ready_projects_count, 1);
    assert.equal(catalogOutput.workspace_catalog.summary.manifest_ready_projects_count, 1);
    assert.equal(catalogOutput.workspace_catalog.summary.last_binding_change_at, bindOutput.workspace_catalog.binding.updated_at);

    const archiveOutput = runCli([
      'workspace-archive',
      '--project',
      'redcube',
      '--path',
      repoRoot,
    ], {
      OPL_FRONTDESK_STATE_DIR: stateRoot,
    });
    assert.equal(archiveOutput.workspace_catalog.action, 'archive');
    assert.equal(archiveOutput.workspace_catalog.binding.status, 'archived');
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('domain-manifests resolves active domain-owned manifest commands while workspace-catalog stays registry-only', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-domain-manifest-state-'));
  const resolvedManifest = {
    surface_kind: 'product_entry_manifest',
    manifest_version: 2,
    manifest_kind: 'redcube_product_entry_manifest',
    target_domain_id: 'redcube_ai',
    formal_entry: {
      default: 'CLI',
      supported_protocols: ['MCP'],
      internal_surface: 'gateway',
    },
    workspace_locator: {
      workspace_root: repoRoot,
    },
    recommended_shell: 'direct',
    recommended_command: 'redcube product invoke',
    frontdesk_surface: {
      shell_key: 'frontdesk',
      command: 'redcube product frontdesk',
      surface_kind: 'product_frontdesk',
      summary: '面向终端用户的 RedCube frontdesk，先给出 direct / federated / session 三类入口。',
    },
    operator_loop_surface: {
      shell_key: 'direct',
      command: 'redcube product invoke',
      surface_kind: 'product_entry',
      summary: '当前 operator loop 仍 anchored on direct product entry；拿到 entry_session_id 后继续通过 session surface 追踪同一交付。',
      continuation_shell_key: 'session',
      continuation_command: 'redcube product session',
    },
    operator_loop_actions: {
      start_deliverable: {
        command: 'redcube product invoke',
        surface_kind: 'product_entry',
        summary: '直接进入当前 deliverable 的 primary operator loop。',
        requires: ['entry_session_id', 'overlay', 'topic_id', 'deliverable_id'],
      },
      continue_session: {
        command: 'redcube product session',
        surface_kind: 'product_entry_session',
        summary: '在已有 entry_session_id 下继续同一交付。',
        requires: ['entry_session_id'],
      },
    },
    repo_mainline: {
      program_id: 'redcube-runtime-program',
      phase_id: 'repo_verified_product_entry_and_opl_federation',
      phase_label: 'Repo-Verified Product Entry And OPL Federation',
      active_baton_id: 'managed_product_entry_hardening',
      active_baton_status: 'closeout_completed',
    },
    product_entry_status: {
      summary: 'Repo-verified product-entry service surface 已 landed，但成熟终端用户前台壳与 managed web productization 仍未 landed。',
      next_focus: [
        '继续把 mature end-user shell 建在已 landed 的 RedCube product-entry service surface 之上。',
      ],
      remaining_gaps_count: 2,
    },
    runtime: {
      runtime_owner: 'upstream_hermes_agent',
    },
    product_entry_shell: {
      frontdesk: {
        command: 'redcube product frontdesk',
        surface_kind: 'product_frontdesk',
      },
      direct: {
        command: 'redcube product invoke',
        surface_kind: 'product_entry',
      },
    },
    shared_handoff: {
      opl_return_surface: {
        surface_kind: 'product_entry',
        target_domain_id: 'redcube_ai',
      },
    },
    product_entry_quickstart: {
      surface_kind: 'product_entry_quickstart',
      recommended_step_id: 'open_frontdesk',
      summary: 'Open the RedCube frontdesk first, then continue the same deliverable or inspect its current session state.',
      steps: [
        {
          step_id: 'open_frontdesk',
          title: 'Open RedCube frontdesk',
          command: 'redcube product frontdesk --workspace-root /tmp/redcube-workspace',
          surface_kind: 'product_frontdesk',
          summary: 'Open the direct RedCube frontdesk for the current workspace.',
          requires: [],
        },
        {
          step_id: 'continue_current_loop',
          title: 'Continue current deliverable loop',
          command: 'redcube product invoke --workspace-root /tmp/redcube-workspace --entry-session-id <entry-session-id> --overlay <overlay-id> --topic-id <topic-id> --deliverable-id <deliverable-id>',
          surface_kind: 'product_entry',
          summary: 'Continue the current deliverable loop once identifiers are known.',
          requires: ['entry_session_id', 'overlay', 'topic_id', 'deliverable_id'],
        },
        {
          step_id: 'inspect_current_progress',
          title: 'Inspect session progress',
          command: 'redcube product session --entry-session-id <entry-session-id>',
          surface_kind: 'product_entry_session',
          summary: 'Inspect the current session progress for the same deliverable.',
          requires: ['entry_session_id'],
        },
      ],
      resume_contract: {
        surface_kind: 'product_entry_session',
        session_locator_field: 'entry_session_id',
        checkpoint_locator_field: 'checkpoint_lineage_id',
      },
      human_gate_ids: ['deliverable_publish_gate'],
    },
    family_orchestration: {
      action_graph_ref: {
        ref_kind: 'repo_path',
        ref: 'contracts/runtime-program/action-graph.json',
        label: 'redcube operator graph',
      },
      human_gates: [
        {
          gate_id: 'deliverable_publish_gate',
          title: 'Deliverable publish gate',
          status: 'requested',
        },
      ],
      resume_contract: {
        surface_kind: 'product_entry_session',
        session_locator_field: 'entry_session_id',
        checkpoint_locator_field: 'checkpoint_lineage_id',
      },
      event_envelope_surface: {
        ref_kind: 'repo_path',
        ref: 'runtime_watch/latest.json',
        label: 'runtime event surface',
      },
      checkpoint_lineage_surface: {
        ref_kind: 'repo_path',
        ref: 'runtime_watch/checkpoints/latest.json',
        label: 'checkpoint lineage surface',
      },
    },
    notes: [],
  };

  try {
    runCli([
      'workspace-bind',
      '--project',
      'redcube',
      '--path',
      repoRoot,
      '--manifest-command',
      buildManifestCommand(resolvedManifest),
    ], {
      OPL_FRONTDESK_STATE_DIR: stateRoot,
    });
    runCli([
      'workspace-bind',
      '--project',
      'medautoscience',
      '--path',
      repoRoot,
      '--manifest-command',
      "printf 'not-json'",
    ], {
      OPL_FRONTDESK_STATE_DIR: stateRoot,
    });

    const catalogOutput = runCli(['workspace-catalog'], {
      OPL_FRONTDESK_STATE_DIR: stateRoot,
    });
    const redcubeCatalog = catalogOutput.workspace_catalog.projects.find((entry: { project_id: string }) => entry.project_id === 'redcube');
    assert.equal(redcubeCatalog?.active_binding?.direct_entry?.manifest_command, buildManifestCommand(resolvedManifest));

    const manifestOutput = runCli(['domain-manifests'], {
      OPL_FRONTDESK_STATE_DIR: stateRoot,
    });
    assert.equal(manifestOutput.domain_manifests.summary.total_projects_count, 2);
    assert.equal(manifestOutput.domain_manifests.summary.manifest_configured_count, 2);
    assert.equal(manifestOutput.domain_manifests.summary.resolved_count, 1);
    assert.equal(manifestOutput.domain_manifests.summary.failed_count, 1);

    const redcube = manifestOutput.domain_manifests.projects.find((entry: { project_id: string }) => entry.project_id === 'redcube');
    const medautoscience = manifestOutput.domain_manifests.projects.find((entry: { project_id: string }) => entry.project_id === 'medautoscience');

    assert.equal(redcube.status, 'resolved');
    assert.equal(redcube.manifest.recommended_shell, 'direct');
    assert.equal(redcube.manifest.recommended_command, 'redcube product invoke');
    assert.equal(redcube.manifest.frontdesk_surface.command, 'redcube product frontdesk');
    assert.equal(redcube.manifest.operator_loop_surface.shell_key, 'direct');
    assert.equal(redcube.manifest.operator_loop_surface.continuation_command, 'redcube product session');
    assert.equal(redcube.manifest.operator_loop_actions.start_deliverable.command, 'redcube product invoke');
    assert.equal(redcube.manifest.operator_loop_actions.continue_session.surface_kind, 'product_entry_session');
    assert.equal(redcube.manifest.repo_mainline.phase_id, 'repo_verified_product_entry_and_opl_federation');
    assert.equal(redcube.manifest.product_entry_status.remaining_gaps_count, 2);
    assert.equal(redcube.manifest.product_entry_quickstart.recommended_step_id, 'open_frontdesk');
    assert.equal(redcube.manifest.product_entry_quickstart.steps[1].step_id, 'continue_current_loop');
    assert.equal(redcube.manifest.product_entry_quickstart.steps[2].surface_kind, 'product_entry_session');
    assert.equal(redcube.manifest.family_orchestration.action_graph_ref.ref, 'contracts/runtime-program/action-graph.json');
    assert.equal(redcube.manifest.family_orchestration.human_gates[0].gate_id, 'deliverable_publish_gate');
    assert.equal(redcube.manifest.family_orchestration.resume_contract.session_locator_field, 'entry_session_id');
    assert.equal(medautoscience.status, 'invalid_json');
    assert.equal(medautoscience.error.code, 'invalid_json');

    const dashboardOutput = runCli(['dashboard', '--path', repoRoot, '--sessions-limit', '1'], {
      OPL_FRONTDESK_STATE_DIR: stateRoot,
    });
    const recommendedEntry = dashboardOutput.dashboard.front_desk.recommended_entry_surfaces.find(
      (entry: { project_id: string }) => entry.project_id === 'redcube',
    );
    assert.equal(recommendedEntry.product_entry_status_summary, resolvedManifest.product_entry_status.summary);
    assert.equal(recommendedEntry.product_entry_remaining_gaps_count, 2);
    assert.equal(recommendedEntry.mainline_phase_id, 'repo_verified_product_entry_and_opl_federation');
    assert.equal(recommendedEntry.frontdesk_surface.command, 'redcube product frontdesk');
    assert.equal(recommendedEntry.operator_loop_shell_key, 'direct');
    assert.equal(recommendedEntry.operator_loop_command, 'redcube product invoke');
    assert.equal(recommendedEntry.operator_loop_actions.start_deliverable.command, 'redcube product invoke');
    assert.equal(recommendedEntry.product_entry_quickstart.recommended_step_id, 'open_frontdesk');
    assert.equal(recommendedEntry.product_entry_quickstart.steps[0].command, 'redcube product frontdesk --workspace-root /tmp/redcube-workspace');
    assert.deepEqual(recommendedEntry.product_entry_quickstart.human_gate_ids, ['deliverable_publish_gate']);
    assert.equal(recommendedEntry.family_orchestration.action_graph_ref.ref, 'contracts/runtime-program/action-graph.json');
    assert.equal(recommendedEntry.family_orchestration.human_gates[0].gate_id, 'deliverable_publish_gate');
    assert.equal(
      recommendedEntry.family_orchestration.resume_contract.session_locator_field,
      'entry_session_id',
    );
    assert.equal(recommendedEntry.manifest_version, 2);
    assert.equal(recommendedEntry.family_human_gate_count, 1);
    assert.deepEqual(recommendedEntry.family_human_gate_ids, ['deliverable_publish_gate']);
    assert.equal(recommendedEntry.family_resume_surface_kind, 'product_entry_session');
    assert.equal(recommendedEntry.family_checkpoint_lineage_ref, 'runtime_watch/checkpoints/latest.json');
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('handoff-envelope returns a machine-readable family handoff bundle aligned with the active workspace binding', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-handoff-state-'));
  const resolvedManifest = {
    surface_kind: 'product_entry_manifest',
    manifest_version: 2,
    manifest_kind: 'redcube_product_entry_manifest',
    target_domain_id: 'redcube_ai',
    formal_entry: {
      default: 'CLI',
      supported_protocols: ['MCP'],
      internal_surface: 'gateway',
    },
    workspace_locator: {
      workspace_root: repoRoot,
    },
    recommended_shell: 'direct',
    recommended_command: 'redcube product invoke',
    frontdesk_surface: {
      shell_key: 'frontdesk',
      command: 'redcube product frontdesk',
      surface_kind: 'product_frontdesk',
      summary: '面向终端用户的 RedCube frontdesk，先给出 direct / federated / session 三类入口。',
    },
    operator_loop_surface: {
      shell_key: 'direct',
      command: 'redcube product invoke',
      surface_kind: 'product_entry',
      summary: '当前 operator loop 仍 anchored on direct product entry；拿到 entry_session_id 后继续通过 session surface 追踪同一交付。',
      continuation_shell_key: 'session',
      continuation_command: 'redcube product session',
    },
    operator_loop_actions: {
      start_deliverable: {
        command: 'redcube product invoke',
        surface_kind: 'product_entry',
        summary: '直接进入当前 deliverable 的 primary operator loop。',
        requires: ['entry_session_id', 'overlay', 'topic_id', 'deliverable_id'],
      },
      continue_session: {
        command: 'redcube product session',
        surface_kind: 'product_entry_session',
        summary: '在已有 entry_session_id 下继续同一交付。',
        requires: ['entry_session_id'],
      },
    },
    repo_mainline: {
      program_id: 'redcube-runtime-program',
      phase_id: 'repo_verified_product_entry_and_opl_federation',
      phase_label: 'Repo-Verified Product Entry And OPL Federation',
      active_baton_id: 'managed_product_entry_hardening',
      active_baton_status: 'closeout_completed',
    },
    product_entry_status: {
      summary: 'Repo-verified product-entry service surface 已 landed，但成熟终端用户前台壳与 managed web productization 仍未 landed。',
      next_focus: [
        '继续把 mature end-user shell 建在已 landed 的 RedCube product-entry service surface 之上。',
      ],
      remaining_gaps_count: 2,
    },
    runtime: {
      runtime_owner: 'upstream_hermes_agent',
    },
    product_entry_shell: {
      frontdesk: {
        command: 'redcube product frontdesk',
        surface_kind: 'product_frontdesk',
      },
      direct: {
        command: 'redcube product invoke',
        surface_kind: 'product_entry',
      },
    },
    shared_handoff: {
      opl_return_surface: {
        surface_kind: 'product_entry',
        target_domain_id: 'redcube_ai',
      },
    },
    product_entry_quickstart: {
      surface_kind: 'product_entry_quickstart',
      recommended_step_id: 'open_frontdesk',
      summary: 'Open the RedCube frontdesk first, then continue the same deliverable or inspect its current session state.',
      steps: [
        {
          step_id: 'open_frontdesk',
          title: 'Open RedCube frontdesk',
          command: 'redcube product frontdesk --workspace-root /tmp/redcube-workspace',
          surface_kind: 'product_frontdesk',
          summary: 'Open the direct RedCube frontdesk for the current workspace.',
          requires: [],
        },
        {
          step_id: 'continue_current_loop',
          title: 'Continue current deliverable loop',
          command: 'redcube product invoke --workspace-root /tmp/redcube-workspace --entry-session-id <entry-session-id> --overlay <overlay-id> --topic-id <topic-id> --deliverable-id <deliverable-id>',
          surface_kind: 'product_entry',
          summary: 'Continue the current deliverable loop once identifiers are known.',
          requires: ['entry_session_id', 'overlay', 'topic_id', 'deliverable_id'],
        },
        {
          step_id: 'inspect_current_progress',
          title: 'Inspect session progress',
          command: 'redcube product session --entry-session-id <entry-session-id>',
          surface_kind: 'product_entry_session',
          summary: 'Inspect the current session progress for the same deliverable.',
          requires: ['entry_session_id'],
        },
      ],
      resume_contract: {
        surface_kind: 'product_entry_session',
        session_locator_field: 'entry_session_id',
        checkpoint_locator_field: 'checkpoint_lineage_id',
      },
      human_gate_ids: ['deliverable_publish_gate'],
    },
    family_orchestration: {
      action_graph_ref: {
        ref_kind: 'repo_path',
        ref: 'contracts/runtime-program/action-graph.json',
        label: 'redcube operator graph',
      },
      human_gates: [
        {
          gate_id: 'deliverable_publish_gate',
          title: 'Deliverable publish gate',
          status: 'requested',
        },
      ],
      resume_contract: {
        surface_kind: 'product_entry_session',
        session_locator_field: 'entry_session_id',
        checkpoint_locator_field: 'checkpoint_lineage_id',
      },
      event_envelope_surface: {
        ref_kind: 'repo_path',
        ref: 'runtime_watch/latest.json',
        label: 'runtime event surface',
      },
      checkpoint_lineage_surface: {
        ref_kind: 'repo_path',
        ref: 'runtime_watch/checkpoints/latest.json',
        label: 'checkpoint lineage surface',
      },
    },
    notes: [],
  };

  try {
    runCli([
      'workspace-bind',
      '--project',
      'redcube',
      '--path',
      repoRoot,
      '--entry-command',
      'redcube-ai frontdesk',
      '--manifest-command',
      buildManifestCommand(resolvedManifest),
      '--entry-url',
      'http://127.0.0.1:3310/redcube',
    ], {
      OPL_FRONTDESK_STATE_DIR: stateRoot,
    });

    const output = runCli([
      'handoff-envelope',
      'Prepare',
      'a',
      'defense-ready',
      'slide',
      'deck',
      'for',
      'a',
      'thesis',
      'committee.',
      '--preferred-family',
      'ppt_deck',
      '--workspace-path',
      repoRoot,
    ], {
      OPL_FRONTDESK_STATE_DIR: stateRoot,
    });

    assert.equal(output.handoff_bundle.target_domain_id, 'redcube');
    assert.equal(output.handoff_bundle.task_intent, 'create');
    assert.equal(output.handoff_bundle.entry_mode, 'product_entry_handoff');
    assert.equal(output.handoff_bundle.workspace_locator.absolute_path, repoRoot);
    assert.equal(output.handoff_bundle.runtime_session_contract.runtime_substrate, 'external_hermes_kernel');
    assert.equal(output.handoff_bundle.return_surface_contract.opl.resume_command, 'opl resume <session_id>');
    assert.equal(output.handoff_bundle.domain_direct_entry.command, 'redcube-ai frontdesk');
    assert.equal(
      output.handoff_bundle.domain_direct_entry.manifest_command,
      buildManifestCommand(resolvedManifest),
    );
    assert.equal(output.handoff_bundle.domain_direct_entry.url, 'http://127.0.0.1:3310/redcube');
    assert.equal(output.handoff_bundle.domain_manifest_recommendation.status, 'resolved');
    assert.equal(output.handoff_bundle.domain_manifest_recommendation.recommended_shell, 'direct');
    assert.equal(output.handoff_bundle.domain_manifest_recommendation.recommended_command, 'redcube product invoke');
    assert.equal(output.handoff_bundle.domain_manifest_recommendation.frontdesk_surface.command, 'redcube product frontdesk');
    assert.equal(output.handoff_bundle.domain_manifest_recommendation.operator_loop_surface.shell_key, 'direct');
    assert.equal(
      output.handoff_bundle.domain_manifest_recommendation.operator_loop_surface.continuation_command,
      'redcube product session',
    );
    assert.equal(
      output.handoff_bundle.domain_manifest_recommendation.operator_loop_actions.start_deliverable.command,
      'redcube product invoke',
    );
    assert.equal(output.handoff_bundle.domain_manifest_recommendation.manifest_target_domain_id, 'redcube_ai');
    assert.equal(
      output.handoff_bundle.domain_manifest_recommendation.product_entry_status.summary,
      resolvedManifest.product_entry_status.summary,
    );
    assert.equal(
      output.handoff_bundle.domain_manifest_recommendation.product_entry_quickstart.recommended_step_id,
      'open_frontdesk',
    );
    assert.equal(
      output.handoff_bundle.domain_manifest_recommendation.product_entry_quickstart.steps[2].command,
      'redcube product session --entry-session-id <entry-session-id>',
    );
    assert.equal(
      output.handoff_bundle.domain_manifest_recommendation.repo_mainline.phase_id,
      'repo_verified_product_entry_and_opl_federation',
    );
    assert.equal(
      output.handoff_bundle.domain_manifest_recommendation.family_orchestration.resume_contract.checkpoint_locator_field,
      'checkpoint_lineage_id',
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('session-ledger captures OPL-managed session events with honest resource samples', () => {
  const { fixtureRoot, hermesPath } = createFakeHermesFixture(`
if [ "$1" = "chat" ]; then
  cat <<'EOF'
╭─ ⚕ Hermes ───────────────────────────────────────────────────────────────────╮
SESSION LEDGER ASK RESPONSE

session_id: sess_ledger
EOF
  exit 0
fi
if [ "$1" = "sessions" ] && [ "$2" = "list" ]; then
  cat <<'EOF'
Preview                                            Last Active   Src    ID
───────────────────────────────────────────────────────────────────────────────────────────────
Ledger session                                     1m ago        cli    sess_ledger
EOF
  exit 0
fi
if [ "$1" = "version" ]; then
  echo "Hermes Agent v9.9.9-test"
  exit 0
fi
if [ "$1" = "gateway" ] && [ "$2" = "status" ]; then
  cat <<'EOF'
Launchd plist: /tmp/ai.hermes.gateway.plist
✓ Service definition matches the current Hermes install
✓ Gateway service is loaded
EOF
  exit 0
fi
if [ "$1" = "status" ]; then
  cat <<'EOF'
◆ Environment
  Project:      /tmp/hermes-agent
◆ Gateway Service
  Status:       ✓ loaded
  Manager:      launchd
◆ Scheduled Jobs
  Jobs:         1
◆ Sessions
  Active:       1
EOF
  exit 0
fi
echo "unexpected fake-hermes args: $*" >&2
exit 1
`);
  const psFixture = createFakePsFixture(`27025 1 0.2 0.4 49616 00:46 /Users/test/.hermes/venv/bin/python -m hermes_cli.main gateway run --replace
27026 27025 4.2 1.1 125000 00:31 /Users/test/.hermes/venv/bin/python -m hermes_cli.main chat --resume sess_ledger`);
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-ledger-state-'));

  try {
    const askOutput = runCli([
      'ask',
      'Prepare',
      'a',
      'defense-ready',
      'slide',
      'deck.',
      '--preferred-family',
      'ppt_deck',
      '--workspace-path',
      repoRoot,
    ], {
      OPL_HERMES_BIN: hermesPath,
      OPL_FRONTDESK_STATE_DIR: stateRoot,
      PATH: `${psFixture.fixtureRoot}:${process.env.PATH ?? ''}`,
    });
    assert.equal(askOutput.product_entry.hermes.session_id, 'sess_ledger');

    const ledgerOutput = runCli(['session-ledger', '--limit', '5'], {
      OPL_HERMES_BIN: hermesPath,
      OPL_FRONTDESK_STATE_DIR: stateRoot,
      PATH: `${psFixture.fixtureRoot}:${process.env.PATH ?? ''}`,
    });

    assert.equal(ledgerOutput.session_ledger.summary.entry_count, 1);
    assert.equal(ledgerOutput.session_ledger.entries[0].session_id, 'sess_ledger');
    assert.equal(ledgerOutput.session_ledger.entries[0].domain_id, 'redcube');
    assert.equal(ledgerOutput.session_ledger.entries[0].resource_sample.process_count, 2);
    assert.equal(ledgerOutput.session_ledger.sessions.length, 1);
    assert.equal(ledgerOutput.session_ledger.sessions[0].session_id, 'sess_ledger');
    assert.equal(ledgerOutput.session_ledger.sessions[0].event_count, 1);
    assert.equal(ledgerOutput.session_ledger.sessions[0].domain_id, 'redcube');
    assert.deepEqual(ledgerOutput.session_ledger.sessions[0].modes, ['ask']);
    assert.equal(ledgerOutput.session_ledger.sessions[0].resource_totals.samples_captured, 1);
    assert.equal(ledgerOutput.session_ledger.sessions[0].resource_totals.latest_process_count, 2);
    assert.equal(ledgerOutput.session_ledger.summary.session_aggregate_count, 1);

    const runtimeOutput = runCli(['runtime-status', '--limit', '2'], {
      OPL_HERMES_BIN: hermesPath,
      OPL_FRONTDESK_STATE_DIR: stateRoot,
      PATH: `${psFixture.fixtureRoot}:${process.env.PATH ?? ''}`,
    });
    assert.equal(runtimeOutput.runtime_status.managed_session_ledger.summary.entry_count, 1);
    assert.equal(runtimeOutput.runtime_status.managed_session_ledger.summary.session_aggregate_count, 1);
    assert.equal(runtimeOutput.runtime_status.managed_session_ledger.sessions[0].session_id, 'sess_ledger');
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
    fs.rmSync(psFixture.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('web starts a local front-desk pilot and serves dashboard plus ask surfaces', async () => {
  const { fixtureRoot, hermesPath } = createFakeHermesFixture(`
if [ "$1" = "version" ]; then
  echo "Hermes Agent v9.9.9-test"
  exit 0
fi
if [ "$1" = "gateway" ] && [ "$2" = "status" ]; then
  cat <<'EOF'
Launchd plist: /tmp/ai.hermes.gateway.plist
✓ Service definition matches the current Hermes install
✓ Gateway service is loaded
EOF
  exit 0
fi
if [ "$1" = "status" ]; then
  cat <<'EOF'
◆ Environment
  Project:      /tmp/hermes-agent
◆ Gateway Service
  Status:       ✓ loaded
  Manager:      launchd
◆ Scheduled Jobs
  Jobs:         1
◆ Sessions
  Active:       2
EOF
  exit 0
fi
if [ "$1" = "sessions" ] && [ "$2" = "list" ]; then
  cat <<'EOF'
Preview                                            Last Active   Src    ID
───────────────────────────────────────────────────────────────────────────────────────────────
Web pilot session                                  1m ago        cli    sess_web
EOF
  exit 0
fi
if [ "$1" = "--resume" ] && [ "$2" = "sess_web" ]; then
  cat <<'EOF'
WEB PILOT RESUME OUTPUT
EOF
  exit 0
fi
if [ "$1" = "logs" ] && [ "$2" = "gateway" ]; then
  cat <<'EOF'
[INFO] gateway boot
[INFO] hosted-friendly front desk ready
EOF
  exit 0
fi
if [ "$1" = "chat" ]; then
  cat <<'EOF'
╭─ ⚕ Hermes ───────────────────────────────────────────────────────────────────╮
WEB PILOT ASK RESPONSE

session_id: web-ask-session
EOF
  exit 0
fi
echo "unexpected fake-hermes args: $*" >&2
exit 1
`);
  const psFixture = createFakePsFixture(`27025 1 0.1 0.2 49616 22:46 /Users/test/.hermes/venv/bin/python -m hermes_cli.main gateway run --replace`);

  let child: ChildProcessByStdio<null, Readable, Readable> | null = null;

  try {
    const startup = await startCliServer(
      ['web', '--host', '127.0.0.1', '--port', '0', '--path', repoRoot, '--sessions-limit', '1'],
      {
        OPL_HERMES_BIN: hermesPath,
        PATH: `${psFixture.fixtureRoot}:${process.env.PATH ?? ''}`,
      },
    );
    child = startup.child;

    const webFrontdesk = startup.payload.web_frontdesk as {
      entry_surface: string;
      hosted_status: string;
      api: {
        librechat_package: string;
      };
      listening: {
        base_url: string;
      };
    };

    assert.equal(startup.payload.version, 'g2');
    assert.equal(webFrontdesk.entry_surface, 'opl_local_web_frontdesk_pilot');
    assert.equal(webFrontdesk.hosted_status, 'librechat_pilot_landed');
    assert.equal(webFrontdesk.api.librechat_package, '/api/librechat-package');

    const baseUrl = String(webFrontdesk.listening.base_url);
    const page = await fetch(baseUrl);
    assert.equal(page.status, 200);
    const pageHtml = await page.text();
    assert.match(pageHtml, /OPL Front Desk/);
    assert.match(pageHtml, /Control Room/);
    assert.match(pageHtml, /Hosted-Friendly Surface/);

    const dashboardResponse = await fetch(`${baseUrl}/api/dashboard`);
    const dashboardPayload = await dashboardResponse.json();
    assert.equal(dashboardPayload.dashboard.front_desk.local_web_frontdesk_status, 'pilot_landed');
    assert.equal(dashboardPayload.dashboard.projects.length, 3);
    assert.equal(dashboardPayload.dashboard.domain_manifests.summary.total_projects_count, 2);

    const healthResponse = await fetch(`${baseUrl}/api/health`);
    const healthPayload = await healthResponse.json();
    assert.equal(healthPayload.health.entry_surface, 'opl_local_web_frontdesk_pilot');
    assert.equal(healthPayload.health.status, 'ok');
    assert.equal(healthPayload.health.checks.gateway_service.loaded, true);

    const manifestResponse = await fetch(`${baseUrl}/api/frontdesk-manifest`);
    const manifestPayload = await manifestResponse.json();
    assert.equal(manifestPayload.frontdesk_manifest.shell_integration_target, 'librechat_first');
    assert.equal(manifestPayload.frontdesk_manifest.endpoints.sessions, '/api/sessions');

    const domainManifestResponse = await fetch(`${baseUrl}/api/domain-manifests`);
    const domainManifestPayload = await domainManifestResponse.json();
    assert.equal(domainManifestPayload.domain_manifests.summary.total_projects_count, 2);

    const hostedPackageOutput = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-web-hosted-package-'));
    try {
      const hostedPackageResponse = await fetch(`${baseUrl}/api/hosted-package`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          output_dir: hostedPackageOutput,
          public_origin: 'https://opl.example.com',
        }),
      });
      const hostedPackagePayload = await hostedPackageResponse.json();
      assert.equal(hostedPackagePayload.hosted_pilot_package.surface_id, 'opl_hosted_frontdesk_pilot_package');
      assert.equal(hostedPackagePayload.hosted_pilot_package.public_origin, 'https://opl.example.com');
      assert.equal(hostedPackagePayload.hosted_pilot_package.entry_url, 'https://opl.example.com/pilot/opl/');
      assert.equal(fs.existsSync(hostedPackagePayload.hosted_pilot_package.assets.bundle_json), true);
      assert.equal(fs.existsSync(hostedPackagePayload.hosted_pilot_package.assets.run_script), true);
    } finally {
      fs.rmSync(hostedPackageOutput, { recursive: true, force: true });
    }

    const librechatPackageOutput = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-web-librechat-package-'));
    try {
      const librechatPackageResponse = await fetch(`${baseUrl}/api/librechat-package`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          output_dir: librechatPackageOutput,
          public_origin: 'https://opl.example.com',
        }),
      });
      const librechatPackagePayload = await librechatPackageResponse.json();
      assert.equal(
        librechatPackagePayload.librechat_pilot_package.surface_id,
        'opl_librechat_hosted_shell_pilot_package',
      );
      assert.equal(librechatPackagePayload.librechat_pilot_package.hosted_shell_status, 'landed');
      assert.equal(
        librechatPackagePayload.librechat_pilot_package.frontdesk_entry_url,
        'https://opl.example.com/pilot/opl/',
      );
      assert.equal(fs.existsSync(librechatPackagePayload.librechat_pilot_package.assets.compose_file), true);
      assert.equal(fs.existsSync(librechatPackagePayload.librechat_pilot_package.assets.caddyfile), true);
    } finally {
      fs.rmSync(librechatPackageOutput, { recursive: true, force: true });
    }

    const sessionsResponse = await fetch(`${baseUrl}/api/sessions?limit=1`);
    const sessionsPayload = await sessionsResponse.json();
    assert.equal(sessionsPayload.product_entry.mode, 'sessions');
    assert.equal(sessionsPayload.product_entry.sessions.length, 1);
    assert.equal(sessionsPayload.product_entry.sessions[0].session_id, 'sess_web');

    const resumeResponse = await fetch(`${baseUrl}/api/resume`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        session_id: 'sess_web',
      }),
    });
    const resumePayload = await resumeResponse.json();
    assert.equal(resumePayload.product_entry.mode, 'resume');
    assert.match(resumePayload.product_entry.resume.output, /WEB PILOT RESUME OUTPUT/);

    const logsResponse = await fetch(`${baseUrl}/api/logs?log_name=gateway&lines=20`);
    const logsPayload = await logsResponse.json();
    assert.equal(logsPayload.product_entry.mode, 'logs');
    assert.equal(logsPayload.product_entry.log_name, 'gateway');
    assert.match(logsPayload.product_entry.raw_output, /hosted-friendly front desk ready/);

    const previewResponse = await fetch(`${baseUrl}/api/ask`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        goal: 'Prepare a defense-ready slide deck for a thesis committee.',
        preferred_family: 'ppt_deck',
        dry_run: true,
      }),
    });
    const previewPayload = await previewResponse.json();
    assert.equal(previewPayload.product_entry.dry_run, true);
    assert.equal(previewPayload.product_entry.routing.domain_id, 'redcube');

    const askResponse = await fetch(`${baseUrl}/api/ask`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        goal: 'Prepare a defense-ready slide deck for a thesis committee.',
        preferred_family: 'ppt_deck',
      }),
    });
    const askPayload = await askResponse.json();
    assert.equal(askPayload.product_entry.dry_run, false);
    assert.equal(askPayload.product_entry.hermes.session_id, 'web-ask-session');
    assert.match(askPayload.product_entry.hermes.response, /WEB PILOT ASK RESPONSE/);
  } finally {
    if (child) {
      await stopCliServer(child);
    }
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
    fs.rmSync(psFixture.fixtureRoot, { recursive: true, force: true });
  }
});

test('paperclip config and bindings persist into a control-plane status surface', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-paperclip-state-'));

  try {
    const configured = runCli([
      'paperclip-config',
      '--base-url',
      'http://127.0.0.1:4321',
      '--auth-header-env',
      'OPL_PAPERCLIP_AUTH_HEADER',
      '--control-company-id',
      'company-opl-control',
    ], {
      OPL_FRONTDESK_STATE_DIR: stateRoot,
      OPL_PAPERCLIP_AUTH_HEADER: 'Bearer demo-token',
    });

    assert.equal(configured.paperclip_control_plane.action, 'config');
    assert.equal(configured.paperclip_control_plane.connection.base_url, 'http://127.0.0.1:4321');
    assert.equal(configured.paperclip_control_plane.connection.auth.header_env, 'OPL_PAPERCLIP_AUTH_HEADER');
    assert.equal(configured.paperclip_control_plane.connection.auth.header_present, true);
    assert.equal(configured.paperclip_control_plane.connection.control_company_id, 'company-opl-control');

    const bound = runCli([
      'paperclip-bind',
      '--project',
      'redcube',
      '--company-id',
      'company-redcube',
      '--paperclip-project-id',
      'project-redcube',
      '--project-workspace-id',
      'workspace-redcube',
      '--execution-workspace',
      'shared_workspace',
    ], {
      OPL_FRONTDESK_STATE_DIR: stateRoot,
      OPL_PAPERCLIP_AUTH_HEADER: 'Bearer demo-token',
    });

    assert.equal(bound.paperclip_control_plane.action, 'bind');
    assert.equal(bound.paperclip_control_plane.project_bindings.length, 1);
    assert.equal(bound.paperclip_control_plane.project_bindings[0].project_id, 'redcube');
    assert.equal(bound.paperclip_control_plane.project_bindings[0].company_id, 'company-redcube');

    const status = runCli(['paperclip-status', '--path', repoRoot, '--sessions-limit', '1'], {
      OPL_FRONTDESK_STATE_DIR: stateRoot,
      OPL_PAPERCLIP_AUTH_HEADER: 'Bearer demo-token',
    });

    assert.equal(status.paperclip_control_plane.action, 'status');
    assert.equal(status.paperclip_control_plane.readiness, 'configured');
    assert.equal(status.paperclip_control_plane.connection.base_url, 'http://127.0.0.1:4321');
    assert.equal(status.paperclip_control_plane.summary.project_bindings_count, 1);
    assert.equal(status.paperclip_control_plane.summary.bound_projects[0], 'redcube');
    assert.equal(status.paperclip_control_plane.gateway.dashboard.front_desk.paperclip_control_plane_status, 'configured');
    assert.equal(status.paperclip_control_plane.gateway.surface.endpoints.control_plane, '/api/paperclip/control-plane');
    assert.equal(
      status.paperclip_control_plane.gateway.surface.contract_refs.family_human_gate,
      'contracts/family-orchestration/family-human-gate.schema.json',
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('paperclip-open-task creates a routed Paperclip issue using the bound domain mapping', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-paperclip-open-task-'));
  const fakePaperclip = await startFakePaperclipServer();

  try {
    runCli([
      'paperclip-config',
      '--base-url',
      fakePaperclip.baseUrl,
      '--auth-header-env',
      'OPL_PAPERCLIP_AUTH_HEADER',
      '--control-company-id',
      'company-opl-control',
    ], {
      OPL_FRONTDESK_STATE_DIR: stateRoot,
      OPL_PAPERCLIP_AUTH_HEADER: 'Bearer integration-token',
    });
    runCli([
      'paperclip-bind',
      '--project',
      'redcube',
      '--company-id',
      'company-redcube',
      '--paperclip-project-id',
      'project-redcube',
      '--project-workspace-id',
      'workspace-redcube',
      '--execution-workspace',
      'shared_workspace',
    ], {
      OPL_FRONTDESK_STATE_DIR: stateRoot,
      OPL_PAPERCLIP_AUTH_HEADER: 'Bearer integration-token',
    });

    const output = await runCliAsync([
      'paperclip-open-task',
      'Prepare a defense-ready slide deck for a thesis committee.',
      '--preferred-family',
      'ppt_deck',
      '--workspace-path',
      repoRoot,
      '--priority',
      'high',
    ], {
      OPL_FRONTDESK_STATE_DIR: stateRoot,
      OPL_PAPERCLIP_AUTH_HEADER: 'Bearer integration-token',
    }) as {
      paperclip_control_plane: {
        action: string;
      };
      paperclip_task: {
        issue: {
          companyId: string;
          priority: string;
        };
        handoff_bundle: {
          target_domain_id: string;
        };
        project_binding: {
          project_id: string;
        };
      };
    };

    assert.equal(output.paperclip_control_plane.action, 'open_task');
    assert.equal(output.paperclip_task.issue.companyId, 'company-redcube');
    assert.equal(output.paperclip_task.issue.priority, 'high');
    assert.equal(output.paperclip_task.handoff_bundle.target_domain_id, 'redcube');
    assert.equal(output.paperclip_task.project_binding.project_id, 'redcube');

    assert.equal(fakePaperclip.requests.length, 1);
    const issueRequest = fakePaperclip.requests[0];
    assert.equal(issueRequest.method, 'POST');
    assert.equal(issueRequest.path, '/api/companies/company-redcube/issues');
    assert.equal(issueRequest.headers.authorization, 'Bearer integration-token');
    assert.equal(issueRequest.body?.projectId, 'project-redcube');
    assert.equal(issueRequest.body?.projectWorkspaceId, 'workspace-redcube');
    assert.equal(issueRequest.body?.executionWorkspacePreference, 'shared_workspace');
    assert.equal(issueRequest.body?.priority, 'high');
    assert.equal(issueRequest.body?.title, 'Prepare a defense-ready slide deck for a thesis committee.');
    assert.match(String(issueRequest.body?.description ?? ''), /opl_family_handoff_bundle/);
    assert.match(String(issueRequest.body?.description ?? ''), /redcube/);
  } finally {
    await stopHttpServer(fakePaperclip.server);
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('paperclip-open-gate creates a control-company issue and linked board approval payload', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-paperclip-open-gate-'));
  const fakePaperclip = await startFakePaperclipServer();

  try {
    runCli([
      'paperclip-config',
      '--base-url',
      fakePaperclip.baseUrl,
      '--auth-header-env',
      'OPL_PAPERCLIP_AUTH_HEADER',
      '--control-company-id',
      'company-opl-control',
    ], {
      OPL_FRONTDESK_STATE_DIR: stateRoot,
      OPL_PAPERCLIP_AUTH_HEADER: 'Bearer integration-token',
    });

    const output = await runCliAsync([
      'paperclip-open-gate',
      'Prepare a defense-ready slide deck for a thesis committee.',
      '--preferred-family',
      'ppt_deck',
      '--workspace-path',
      repoRoot,
      '--gate-kind',
      'publish_readiness',
    ], {
      OPL_FRONTDESK_STATE_DIR: stateRoot,
      OPL_PAPERCLIP_AUTH_HEADER: 'Bearer integration-token',
    }) as {
      paperclip_control_plane: {
        action: string;
      };
      paperclip_gate: {
        issue: {
          companyId: string;
        };
        approval: {
          companyId: string;
          type: string;
        };
        family_human_gate: {
          target_domain_id: string;
          gate_kind: string;
          decision_options: string[];
        };
      };
    };

    assert.equal(output.paperclip_control_plane.action, 'open_gate');
    assert.equal(output.paperclip_gate.issue.companyId, 'company-opl-control');
    assert.equal(output.paperclip_gate.approval.companyId, 'company-opl-control');
    assert.equal(output.paperclip_gate.approval.type, 'request_board_approval');
    assert.equal(output.paperclip_gate.family_human_gate.target_domain_id, 'redcube');
    assert.equal(output.paperclip_gate.family_human_gate.gate_kind, 'publish_readiness');
    assert.deepEqual(output.paperclip_gate.family_human_gate.decision_options, [
      'approve',
      'request_changes',
      'reject',
    ]);

    assert.equal(fakePaperclip.requests.length, 2);
    const issueRequest = fakePaperclip.requests[0];
    const approvalRequest = fakePaperclip.requests[1];
    assert.equal(issueRequest.path, '/api/companies/company-opl-control/issues');
    assert.equal(approvalRequest.path, '/api/companies/company-opl-control/approvals');
    assert.equal(issueRequest.headers.authorization, 'Bearer integration-token');
    assert.equal(approvalRequest.headers.authorization, 'Bearer integration-token');
    assert.equal(approvalRequest.body?.type, 'request_board_approval');
    assert.deepEqual(approvalRequest.body?.issueIds, ['issue-1']);

    const approvalPayload = approvalRequest.body?.payload as Record<string, unknown>;
    const familyHumanGate = approvalPayload.family_human_gate as Record<string, unknown>;
    assert.equal(familyHumanGate.version, 'family-human-gate.v1');
    assert.equal(familyHumanGate.target_domain_id, 'redcube');
    assert.equal(familyHumanGate.gate_kind, 'publish_readiness');
    assert.deepEqual(familyHumanGate.decision_options, ['approve', 'request_changes', 'reject']);
    assert.deepEqual(familyHumanGate.evidence_refs, [
      {
        ref_kind: 'json_pointer',
        ref: '/handoff_bundle',
        label: 'opl family handoff bundle',
      },
    ]);
  } finally {
    await stopHttpServer(fakePaperclip.server);
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('web front-desk exposes the Paperclip control-plane aggregate surface', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-paperclip-web-state-'));
  let child: ChildProcessByStdio<null, Readable, Readable> | null = null;

  try {
    runCli([
      'paperclip-config',
      '--base-url',
      'http://127.0.0.1:4321',
      '--auth-header-env',
      'OPL_PAPERCLIP_AUTH_HEADER',
      '--control-company-id',
      'company-opl-control',
    ], {
      OPL_FRONTDESK_STATE_DIR: stateRoot,
      OPL_PAPERCLIP_AUTH_HEADER: 'Bearer web-token',
    });
    runCli([
      'paperclip-bind',
      '--project',
      'redcube',
      '--company-id',
      'company-redcube',
    ], {
      OPL_FRONTDESK_STATE_DIR: stateRoot,
      OPL_PAPERCLIP_AUTH_HEADER: 'Bearer web-token',
    });

    const startup = await startCliServer(
      ['web', '--host', '127.0.0.1', '--port', '0', '--path', repoRoot, '--sessions-limit', '1'],
      {
        OPL_FRONTDESK_STATE_DIR: stateRoot,
        OPL_PAPERCLIP_AUTH_HEADER: 'Bearer web-token',
      },
    );
    child = startup.child;

    const webFrontdesk = startup.payload.web_frontdesk as {
      api: {
        paperclip_control_plane: string;
      };
      listening: {
        base_url: string;
      };
    };

    assert.equal(webFrontdesk.api.paperclip_control_plane, '/api/paperclip/control-plane');

    const response = await fetch(`${webFrontdesk.listening.base_url}/api/paperclip/control-plane`);
    const payload = await response.json() as {
      paperclip_control_plane: {
        readiness: string;
        connection: {
          base_url: string;
        };
        summary: {
          project_bindings_count: number;
        };
      };
    };
    assert.equal(payload.paperclip_control_plane.readiness, 'configured');
    assert.equal(payload.paperclip_control_plane.connection.base_url, 'http://127.0.0.1:4321');
    assert.equal(payload.paperclip_control_plane.summary.project_bindings_count, 1);
  } finally {
    if (child) {
      await stopCliServer(child);
    }
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('logs returns a structured wrapper over Hermes log output', () => {
  const { fixtureRoot, hermesPath } = createFakeHermesFixture(`
if [ "$1" = "logs" ] && [ "$2" = "gateway" ]; then
  cat <<'EOF'
[INFO] gateway boot
[INFO] domain handoff ready
EOF
  exit 0
fi
echo "unexpected fake-hermes args: $*" >&2
exit 1
`);

  try {
    const output = runCli(['logs', 'gateway', '--lines', '20'], {
      OPL_HERMES_BIN: hermesPath,
    });

    assert.equal(output.product_entry.mode, 'logs');
    assert.equal(output.product_entry.log_name, 'gateway');
    assert.equal(output.product_entry.lines, 20);
    assert.match(output.product_entry.raw_output, /gateway boot/);
    assert.ok(output.product_entry.command_preview.includes('gateway'));
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('repair-hermes-gateway reinstalls and rechecks the gateway service', () => {
  const { fixtureRoot, hermesPath } = createFakeHermesFixture(`
if [ "$1" = "gateway" ] && [ "$2" = "install" ]; then
  cat <<'EOF'
↻ Updated gateway launchd service definition to match the current Hermes install
✓ Service definition updated
EOF
  exit 0
fi
if [ "$1" = "gateway" ] && [ "$2" = "status" ]; then
  cat <<'EOF'
Launchd plist: /tmp/ai.hermes.gateway.plist
✓ Service definition matches the current Hermes install
✓ Gateway service is loaded
EOF
  exit 0
fi
echo "unexpected fake-hermes args: $*" >&2
exit 1
`);

  try {
    const output = runCli(['repair-hermes-gateway'], {
      OPL_HERMES_BIN: hermesPath,
    });

    assert.equal(output.product_entry.mode, 'repair_hermes_gateway');
    assert.match(output.product_entry.install_output, /Service definition updated/);
    assert.equal(output.product_entry.gateway_service.loaded, true);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('chat --dry-run prepares a seeding query and a resume command for Hermes', () => {
  const output = runCli([
    'chat',
    'Plan a medical grant proposal revision loop.',
    '--dry-run',
  ]);

  assert.equal(output.version, 'g2');
  assert.equal(output.product_entry.mode, 'chat');
  assert.equal(output.product_entry.dry_run, true);
  assert.equal(output.product_entry.routing.status, 'unknown_domain');
  assert.equal(output.product_entry.routing.candidate_workstream_id, 'grant_ops');
  assert.equal(output.product_entry.hermes.seed_command_preview[0], 'hermes');
  assert.ok(output.product_entry.hermes.seed_command_preview.includes('--query'));
  assert.deepEqual(output.product_entry.hermes.resume_command_preview, [
    'hermes',
    '--resume',
    '<session_id>',
  ]);
});

test('validate-contracts exposes env contract-root provenance', () => {
  const { fixtureRoot, fixtureContractsRoot } = createContractsFixtureRoot(() => {});

  try {
    const output = runCli(['validate-contracts'], {
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });

    assert.equal(output.validation.contracts_dir, fixtureContractsRoot);
    assert.equal(output.validation.contracts_root_source, 'env');
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('validate-contracts exposes cli-flag contract-root provenance', () => {
  const { fixtureRoot, fixtureContractsRoot } = createContractsFixtureRoot(() => {});

  try {
    const output = runCli([
      '--contracts-dir',
      fixtureContractsRoot,
      'validate-contracts',
    ]);

    assert.equal(output.validation.contracts_dir, fixtureContractsRoot);
    assert.equal(output.validation.contracts_root_source, 'cli_flag');
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('validate-contracts surfaces stable missing-file errors with cwd provenance', () => {
  const { fixtureRoot, fixtureContractsRoot } = createContractsFixtureRoot((contractsRoot) => {
    fs.rmSync(path.join(contractsRoot, 'task-topology.json'));
  });

  try {
    const { status, payload } = runCliFailureInCwd(['validate-contracts'], fixtureRoot);

    assert.equal(payload.version, 'g2');
    assert.equal(payload.error.code, 'contract_file_missing');
    assert.equal(payload.error.exit_code, 3);
    assert.equal(status, 3);
    assert.match(payload.error.message, /task-topology\.json/i);
    assert.equal(payload.error.details.contracts_dir, fs.realpathSync.native(fixtureContractsRoot));
    assert.equal(payload.error.details.contracts_root_source, 'cwd');
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('validate-contracts surfaces stable invalid-json errors', () => {
  const { fixtureRoot, fixtureContractsRoot } = createContractsFixtureRoot((contractsRoot) => {
    fs.writeFileSync(path.join(contractsRoot, 'domains.json'), '{ invalid json\n');
  });

  try {
    const { status, payload } = runCliFailure(['validate-contracts'], {
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });

    assert.equal(payload.version, 'g2');
    assert.equal(payload.error.code, 'contract_json_invalid');
    assert.equal(payload.error.exit_code, 3);
    assert.equal(status, 3);
    assert.match(payload.error.message, /domains\.json/i);
    assert.equal(payload.error.details.contracts_dir, fixtureContractsRoot);
    assert.equal(payload.error.details.contracts_root_source, 'env');
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('validate-contracts surfaces stable shape-invalid errors with cli-flag provenance', () => {
  const { fixtureRoot, fixtureContractsRoot } = createContractsFixtureRoot((contractsRoot) => {
    const workstreamsPath = path.join(contractsRoot, 'workstreams.json');
    const workstreams = JSON.parse(fs.readFileSync(workstreamsPath, 'utf8'));
    delete workstreams.workstreams[0].label;
    fs.writeFileSync(workstreamsPath, JSON.stringify(workstreams, null, 2));
  });

  try {
    const { status, payload } = runCliFailure([
      '--contracts-dir',
      fixtureContractsRoot,
      'validate-contracts',
    ]);

    assert.equal(payload.version, 'g2');
    assert.equal(payload.error.code, 'contract_shape_invalid');
    assert.equal(payload.error.exit_code, 3);
    assert.equal(status, 3);
    assert.match(payload.error.message, /label/i);
    assert.equal(payload.error.details.contracts_dir, fixtureContractsRoot);
    assert.equal(payload.error.details.contracts_root_source, 'cli_flag');
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('missing value for global --contracts-dir returns a usage error with exit code 2', () => {
  const { status, payload } = runCliFailure(['--contracts-dir']);

  assert.equal(payload.version, 'g2');
  assert.equal(payload.error.code, 'cli_usage_error');
  assert.equal(payload.error.exit_code, 2);
  assert.equal(status, 2);
  assert.match(payload.error.message, /contracts-dir/i);
});

test('global --contracts-dir expects an exact contract root', () => {
  const { status, payload } = runCliFailure([
    '--contracts-dir',
    repoRoot,
    'validate-contracts',
  ]);

  assert.equal(payload.version, 'g2');
  assert.equal(payload.error.code, 'contract_file_missing');
  assert.equal(payload.error.exit_code, 3);
  assert.equal(status, 3);
});

test('list-workstreams returns admitted workstream summaries', () => {
  const output = runCli(['list-workstreams']);

  assert.deepEqual(output, {
    version: 'g2',
    contracts_context: {
      contracts_dir: contractsDir,
      contracts_root_source: 'cwd',
    },
    workstreams: [
      {
        workstream_id: 'research_ops',
        label: 'Research Ops',
        status: 'active',
        domain_id: 'medautoscience',
      },
      {
        workstream_id: 'presentation_ops',
        label: 'Presentation Ops',
        status: 'emerging',
        domain_id: 'redcube',
      },
    ],
  });
});

test('get-workstream returns the full registered workstream meaning', () => {
  const output = runCli(['get-workstream', 'presentation_ops']);

  assert.equal(output.version, 'g2');
  assertContractsContext(output, 'cwd');
  assert.equal(output.workstream.workstream_id, 'presentation_ops');
  assert.equal(output.workstream.domain_id, 'redcube');
  assert.deepEqual(output.workstream.primary_families, ['ppt_deck']);
});

test('list-domains returns the registered domain gateway summaries', () => {
  const output = runCli(['list-domains']);

  assert.deepEqual(output, {
    version: 'g2',
    contracts_context: {
      contracts_dir: contractsDir,
      contracts_root_source: 'cwd',
    },
    domains: [
      {
        domain_id: 'medautoscience',
        gateway_surface: 'Research Ops Gateway',
        owned_workstreams: ['research_ops'],
      },
      {
        domain_id: 'redcube',
        gateway_surface: 'Visual Deliverable Gateway',
        owned_workstreams: ['presentation_ops'],
      },
    ],
  });
});

test('list-surfaces returns the public gateway surface summaries', () => {
  const output = runCli(['list-surfaces']);

  assert.equal(output.version, 'g2');
  assertContractsContext(output, 'cwd');
  assert.ok(Array.isArray(output.surfaces));
  assert.ok(output.surfaces.length > 10);
  assert.deepEqual(output.surfaces[0], {
    surface_id: 'opl_public_readme',
    category_id: 'opl_public_entry',
    surface_kind: 'readme',
    owner_scope: 'opl',
  });
  assert.ok(
    output.surfaces.some(
      (surface: {
        surface_id: string;
        category_id: string;
        surface_kind: string;
        owner_scope: string;
      }) =>
        surface.surface_id === 'redcube_public_gateway'
        && surface.category_id === 'domain_public_entry'
        && surface.owner_scope === 'domain',
    ),
  );
});

test('get-domain returns the full registered domain meaning', () => {
  const output = runCli(['get-domain', 'redcube']);

  assert.equal(output.version, 'g2');
  assertContractsContext(output, 'cwd');
  assert.equal(output.domain.domain_id, 'redcube');
  assert.equal(output.domain.project, 'redcube-ai');
  assert.deepEqual(output.domain.non_opl_families, ['xiaohongshu']);
});

test('get-surface returns the full registered public surface meaning', () => {
  const output = runCli(['get-surface', 'opl_read_only_discovery_gateway']);

  assert.equal(output.version, 'g2');
  assertContractsContext(output, 'cwd');
  assert.equal(output.surface.surface_id, 'opl_read_only_discovery_gateway');
  assert.equal(output.surface.category_id, 'opl_contract_surface');
  assert.deepEqual(output.surface.routes_to, [
    'medautoscience_public_gateway',
    'redcube_public_gateway',
  ]);
});

test('resolveRequestSurface routes research delivery to medautoscience', () => {
  const resolution = resolveRequestSurface(
    {
      intent: 'submission_delivery',
      target: 'publication',
      goal: 'Prepare the manuscript package for journal review.',
    },
    loadGatewayContracts(repoRoot),
  );

  assert.equal(resolution.status, 'routed');
  assert.equal(resolution.workstream_id, 'research_ops');
  assert.equal(resolution.domain_id, 'medautoscience');
});

test('resolveRequestSurface routes presentation delivery to redcube', () => {
  const resolution = resolveRequestSurface(
    {
      intent: 'presentation_delivery',
      target: 'deliverable',
      goal: 'Prepare a defense-ready slide deck for a thesis committee.',
    },
    loadGatewayContracts(repoRoot),
  );

  assert.equal(resolution.status, 'routed');
  assert.equal(resolution.request_kind, 'discover');
  assert.equal(resolution.workstream_id, 'presentation_ops');
  assert.equal(resolution.domain_id, 'redcube');
  assert.equal(resolution.entry_surface, 'domain_gateway');
  assert.equal(resolution.recommended_family, 'ppt_deck');
});

test('resolveRequestSurface keeps ppt_deck mapped to presentation_ops', () => {
  const output = runCli([
    'resolve-request-surface',
    '--intent',
    'presentation_delivery',
    '--target',
    'deliverable',
    '--goal',
    'Create the committee deck.',
    '--preferred-family',
    'ppt_deck',
  ]);

  assert.equal(output.version, 'g2');
  assertContractsContext(output, 'cwd');
  assert.equal(output.resolution.status, 'routed');
  assert.equal(output.resolution.workstream_id, 'presentation_ops');
  assert.equal(output.resolution.domain_id, 'redcube');
});

test('resolveRequestSurface keeps xiaohongshu at the redcube family boundary', () => {
  const output = runCli([
    'resolve-request-surface',
    '--intent',
    'create',
    '--target',
    'deliverable',
    '--goal',
    'Prepare a xiaohongshu campaign pack.',
    '--preferred-family',
    'xiaohongshu',
  ]);

  assertContractsContext(output, 'cwd');
  assert.equal(output.resolution.status, 'domain_boundary');
  assert.equal(output.resolution.domain_id, 'redcube');
  assert.equal(output.resolution.workstream_id, null);
});

test('resolveRequestSurface returns unknown_domain for under-definition workstreams', () => {
  const output = runCli([
    'resolve-request-surface',
    '--intent',
    'plan',
    '--target',
    'deliverable',
    '--goal',
    'Build a formal grant proposal operating lane from the supplied topic brief.',
  ]);

  assertContractsContext(output, 'cwd');
  assert.equal(output.resolution.status, 'unknown_domain');
  assert.equal(output.resolution.candidate_workstream_id, 'grant_ops');
});

test('resolveRequestSurface returns ambiguous_task with explicit boundary evidence when the primary deliverable is unclear', () => {
  const output = runCli([
    'resolve-request-surface',
    '--intent',
    'create',
    '--target',
    'deliverable',
    '--goal',
    'Package the study for submission and also turn it into a defense-ready deck.',
  ]);

  assertContractsContext(output, 'cwd');
  assert.equal(output.resolution.status, 'ambiguous_task');
  assert.deepEqual(output.resolution.candidate_workstreams, [
    'research_ops',
    'presentation_ops',
  ]);
  assert.deepEqual(output.resolution.candidate_domains, [
    'medautoscience',
    'redcube',
  ]);
  assert.deepEqual(output.resolution.required_clarification, [
    'Is the primary goal a formal research deliverable or a presentation deliverable?',
    'If visual delivery is primary, should the family be ppt_deck or another RedCube family?',
  ]);
  assert.deepEqual(output.resolution.routing_evidence, [
    'research delivery semantics',
    'presentation delivery semantics',
    'missing primary deliverable',
  ]);
});

test('explainDomainBoundary explains admitted presentation routing', () => {
  const explanation = explainDomainBoundary(
    {
      intent: 'presentation_delivery',
      target: 'deliverable',
      goal: 'Prepare a defense-ready slide deck for a thesis committee.',
    },
    loadGatewayContracts(repoRoot),
  );

  assert.equal(explanation.boundary_status, 'routed');
  assert.equal(explanation.resolved_domain, 'redcube');
  assert.equal(explanation.resolved_workstream_id, 'presentation_ops');
  assert.equal(explanation.rejected_domains[0]?.domain_id, 'medautoscience');
  assert.match(explanation.rejected_domains[0]?.reason ?? '', /research evidence/i);
  assert.match(explanation.reason, /visual deliverable/i);
});

test('explain-domain-boundary explains xiaohongshu non-equivalence', () => {
  const output = runCli([
    'explain-domain-boundary',
    '--intent',
    'create',
    '--target',
    'deliverable',
    '--goal',
    'Prepare a xiaohongshu campaign pack.',
    '--preferred-family',
    'xiaohongshu',
  ]);

  assertContractsContext(output, 'cwd');
  assert.equal(output.boundary_explanation.resolved_domain, 'redcube');
  assert.equal(output.boundary_explanation.resolved_workstream_id, null);
  assert.match(output.boundary_explanation.reason, /not automatically equal presentation ops/i);
});

test('explain-domain-boundary explains under-definition requests', () => {
  const output = runCli([
    'explain-domain-boundary',
    '--intent',
    'plan',
    '--target',
    'deliverable',
    '--goal',
    'Build a thesis defense preparation pack from the current papers.',
  ]);

  assertContractsContext(output, 'cwd');
  assert.equal(output.boundary_explanation.resolved_domain, null);
  assert.equal(output.boundary_explanation.candidate_workstream_id, 'thesis_ops');
  assert.match(output.boundary_explanation.reason, /under definition/i);
});

test('help returns command discovery and runnable examples', () => {
  const output = runCli(['help']);

  assertNoContractsProvenance(output);
  assert.equal(output.version, 'g2');
  assert.equal(output.help.command, null);
  assert.equal(output.help.usage, 'opl [command|request...] [args]');
  assert.ok(
    ['list-workstreams', 'get-workstream', 'list-domains', 'get-domain', 'list-surfaces', 'get-surface', 'resolve-request-surface', 'explain-domain-boundary'].every((command) =>
      output.help.commands.some((entry: { command: string }) => entry.command === command),
    ),
  );
  assert.ok(
    output.help.commands.some((entry: { command: string }) => entry.command === 'validate-contracts'),
  );
  assert.ok(
    ['frontdesk-service-install', 'frontdesk-service-status', 'frontdesk-service-open'].every((command) =>
      output.help.commands.some((entry: { command: string }) => entry.command === command),
    ),
  );
  assert.ok(
    output.help.commands.some((entry: { command: string }) => entry.command === 'frontdesk-hosted-package'),
  );
  assert.ok(
    output.help.commands.some((entry: { command: string }) => entry.command === 'frontdesk-librechat-package'),
  );
  assert.ok(
    output.help.commands.some(
      (entry: { command: string; examples: string[] }) =>
        entry.command === 'validate-contracts'
        && entry.examples.includes('opl validate-contracts'),
    ),
  );
  assert.ok(output.help.examples.includes('opl get-workstream presentation_ops'));
  assert.ok(
    output.help.examples.includes(
      'opl explain-domain-boundary --intent create --target deliverable --goal "Prepare a xiaohongshu campaign pack." --preferred-family xiaohongshu',
    ),
  );
});

test('root --help returns the same machine-readable help payload', () => {
  const output = runCli(['--help']);

  assertNoContractsProvenance(output);
  assert.equal(output.version, 'g2');
  assert.equal(output.help.command, null);
  assert.equal(output.help.usage, 'opl [command|request...] [args]');
  assert.ok(
    output.help.commands.some((entry: { command: string }) => entry.command === 'get-domain'),
  );
});

test('command --help returns command-scoped usage and examples', () => {
  const output = runCli(['get-domain', '--help']);

  assertNoContractsProvenance(output);
  assert.equal(output.version, 'g2');
  assert.equal(output.help.command, 'get-domain');
  assert.equal(output.help.usage, 'opl get-domain <domain_id>');
  assert.ok(output.help.examples.includes('opl get-domain redcube'));
});

test('frontdesk-service-install --help returns command-scoped usage and examples', () => {
  const output = runCli(['frontdesk-service-install', '--help']);

  assertNoContractsProvenance(output);
  assert.equal(output.version, 'g2');
  assert.equal(output.help.command, 'frontdesk-service-install');
  assert.match(output.help.usage, /opl frontdesk-service-install/);
  assert.ok(output.help.examples.includes('opl frontdesk-service-install --port 8787'));
});

test('help <command> returns the same payload as command --help', () => {
  const viaHelp = runCli(['help', 'get-domain']);
  const viaFlag = runCli(['get-domain', '--help']);

  assert.deepEqual(viaHelp, viaFlag);
});

test('explain-domain-boundary --help advertises the xiaohongshu family-boundary example', () => {
  const output = runCli(['explain-domain-boundary', '--help']);

  assertNoContractsProvenance(output);
  assert.equal(output.version, 'g2');
  assert.equal(output.help.command, 'explain-domain-boundary');
  assert.ok(
    output.help.examples.includes(
      'opl explain-domain-boundary --intent create --target deliverable --goal "Prepare a xiaohongshu campaign pack." --preferred-family xiaohongshu',
    ),
  );
});

test('command help literal returns a usage error instead of command-scoped help', () => {
  const { status, payload } = runCliFailure(['get-domain', 'help']);

  assert.equal(payload.version, 'g2');
  assert.equal(payload.error.code, 'cli_usage_error');
  assert.equal(payload.error.exit_code, 2);
  assert.equal(status, 2);
  assert.equal(payload.error.details.help_usage, 'opl get-domain --help');
});

test('CLI usage errors expose machine-readable usage guidance', () => {
  const { status, payload } = runCliFailure(['get-domain']);

  assertNoContractsProvenance(payload);
  assert.equal(payload.version, 'g2');
  assert.equal(payload.error.code, 'cli_usage_error');
  assert.equal(payload.error.exit_code, 2);
  assert.equal(status, 2);
  assert.equal(payload.error.details.usage, 'opl get-domain <domain_id>');
  assert.ok(Array.isArray(payload.error.details.examples));
  assert.ok(payload.error.details.examples.includes('opl get-domain redcube'));
});

test('CLI returns stable JSON errors for unknown ids', () => {
  const { status, payload } = runCliFailure(['get-domain', 'unknown']);

  assert.equal(payload.version, 'g2');
  assert.equal(payload.error.code, 'domain_not_found');
  assert.equal(payload.error.exit_code, 4);
  assert.equal(status, 4);
});

test('CLI returns stable JSON errors for unknown surface ids', () => {
  const { status, payload } = runCliFailure(['get-surface', 'unknown_surface']);

  assert.equal(payload.version, 'g2');
  assert.equal(payload.error.code, 'surface_not_found');
  assert.equal(payload.error.exit_code, 4);
  assert.equal(status, 4);
  assert.deepEqual(payload.error.details, { surface_id: 'unknown_surface' });
});

test('CLI returns machine-readable JSON errors for unknown commands with available command discovery', () => {
  const { status, payload } = runCliFailure(['unknown-command']);

  assertNoContractsProvenance(payload);
  assert.equal(payload.version, 'g2');
  assert.equal(payload.error.code, 'unknown_command');
  assert.equal(payload.error.exit_code, 2);
  assert.equal(status, 2);
  assert.ok(Array.isArray(payload.error.details.commands));
  assert.ok(payload.error.details.commands.includes('validate-contracts'));
  assert.equal(payload.error.details.command, 'unknown-command');
  assert.equal(payload.error.details.usage, 'opl help');
});
