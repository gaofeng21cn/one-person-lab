import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync, type ChildProcessByStdio } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { PassThrough, type Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';

import {
  GatewayContractError,
  loadGatewayContracts,
  validateGatewayContracts,
} from '../../../src/contracts.ts';
import { buildProjectProgressBrief } from '../../../src/management.ts';
import {
  explainDomainBoundary,
  resolveRequestSurface,
} from '../../../src/resolver.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..', '..');
const cliPath = path.join(repoRoot, 'src', 'cli.ts');
const contractsDir = path.join(repoRoot, 'contracts', 'opl-gateway');
const familyManifestFixtureDir = path.join(repoRoot, 'tests', 'fixtures', 'family-manifests');

function runCli(args: string[], envOverrides: Record<string, string> = {}) {
  return runCliInCwd(args, repoRoot, envOverrides);
}

function runCliRaw(args: string[], envOverrides: Record<string, string> = {}) {
  return runCliRawInCwd(args, repoRoot, envOverrides);
}

function runCliInCwd(
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

  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

function runCliRawInCwd(
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

  assert.equal(result.status, 0, result.stderr);
  return result;
}

function runCliViaEntryPathInCwd(
  entryPath: string,
  args: string[],
  cwd: string,
  envOverrides: Record<string, string> = {},
) {
  const result = spawnSync(
    process.execPath,
    ['--experimental-strip-types', entryPath, ...args],
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

function createFakeCodexFixture(handlerBody: string) {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-codex-fixture-'));
  const codexPath = path.join(fixtureRoot, 'codex');
  fs.writeFileSync(
    codexPath,
    `#!/usr/bin/env bash
set -euo pipefail
${handlerBody}
`,
    { mode: 0o755 },
  );
  return {
    fixtureRoot,
    codexPath,
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

function createCodexConfigFixture(options: {
  model?: string;
  reasoningEffort?: string;
  providerId?: string;
  providerName?: string;
  baseUrl?: string;
  apiKey?: string;
} = {}) {
  const codexHome = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-codex-home-'));
  const configPath = path.join(codexHome, 'config.toml');
  const model = options.model ?? 'gpt-5.4-lab';
  const reasoningEffort = options.reasoningEffort ?? 'xhigh';
  const providerId = options.providerId ?? 'lab';
  const providerName = options.providerName ?? 'lab';
  const baseUrl = options.baseUrl ?? 'https://codex-provider.example.test/v1';
  const apiKey = options.apiKey ?? 'codex-provider-key';

  fs.writeFileSync(
    configPath,
    [
      `model_provider = "${providerId}"`,
      `model = "${model}"`,
      `model_reasoning_effort = "${reasoningEffort}"`,
      '',
      `[model_providers.${providerId}]`,
      `name = "${providerName}"`,
      `base_url = "${baseUrl}"`,
      `experimental_bearer_token = "${apiKey}"`,
      '',
    ].join('\n'),
    'utf8',
  );

  return {
    codexHome,
    configPath,
    model,
    reasoningEffort,
    providerId,
    providerName,
    baseUrl,
    apiKey,
  };
}

function createMasWorkspaceFixture(profileName = 'nfpitnet.workspace.toml') {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-mas-workspace-'));
  const sharedPath = path.join(fixtureRoot, 'ops', 'medautoscience', 'bin', '_shared.sh');
  const profilePath = path.join(fixtureRoot, 'ops', 'medautoscience', 'profiles', profileName);

  fs.mkdirSync(path.dirname(sharedPath), { recursive: true });
  fs.mkdirSync(path.dirname(profilePath), { recursive: true });
  fs.writeFileSync(sharedPath, '#!/usr/bin/env bash\nset -euo pipefail\n', {
    mode: 0o755,
  });
  fs.writeFileSync(
    profilePath,
    [
      '[workspace]',
      'workspace_id = "mas-fixture"',
      '',
    ].join('\n'),
    'utf8',
  );

  return {
    fixtureRoot,
    sharedPath,
    profilePath,
  };
}

function buildManifestCommand(payload: Record<string, unknown>) {
  return `${process.execPath} -e "process.stdout.write(process.argv[1])" ${shellSingleQuote(JSON.stringify(payload))}`;
}

function readJsonFixture<T>(name: string) {
  return JSON.parse(
    fs.readFileSync(path.join(familyManifestFixtureDir, name), 'utf8'),
  ) as T;
}

function loadFamilyManifestFixtures() {
  return {
    medautogrant: readJsonFixture<Record<string, unknown>>('med-autogrant-product-entry-manifest.json'),
    medautoscience: readJsonFixture<Record<string, unknown>>('med-autoscience-product-entry-manifest.json'),
    redcube: readJsonFixture<Record<string, unknown>>('redcube-product-entry-manifest.json'),
  };
}

test('family manifest fixtures expose domain agent entry spec v1', () => {
  const fixtures = loadFamilyManifestFixtures();
  const scienceSpec = (fixtures.medautoscience.domain_entry_contract as Record<string, unknown>).domain_agent_entry_spec as Record<string, unknown>;
  const grantSpec = (fixtures.medautogrant.product_entry_manifest as Record<string, unknown>).domain_entry_contract as Record<string, unknown>;
  const grantEntrySpec = grantSpec.domain_agent_entry_spec as Record<string, unknown>;
  const redcubeSpec = (fixtures.redcube.domain_entry_contract as Record<string, unknown>).domain_agent_entry_spec as Record<string, unknown>;

  assert.equal(scienceSpec.agent_id, 'mas');
  assert.equal(scienceSpec.entry_command, 'product-frontdesk');
  assert.equal(scienceSpec.manifest_command, 'product-entry-manifest');

  assert.equal(grantEntrySpec.agent_id, 'mag');
  assert.equal(grantEntrySpec.entry_command, 'product-frontdesk');
  assert.equal(grantEntrySpec.manifest_command, 'product-entry-manifest');

  assert.equal(redcubeSpec.agent_id, 'rca');
  assert.equal(redcubeSpec.entry_command, 'redcube product frontdesk');
  assert.equal(redcubeSpec.manifest_command, 'redcube product manifest');
});

function assertMagActionGraph(actionGraph: Record<string, unknown>) {
  assert.equal(actionGraph.graph_id, 'mag_critique_to_revision_graph');
  assert.equal(actionGraph.target_domain_id, 'med-autogrant');
  assert.deepEqual(
    (actionGraph.nodes as Array<{ node_id: string }>).map((node) => node.node_id),
    ['route:critique', 'route:revision'],
  );
  assert.deepEqual(actionGraph.entry_nodes, ['route:critique']);
  assert.deepEqual(actionGraph.exit_nodes, ['route:revision']);
  assert.deepEqual(actionGraph.human_gates, [
    {
      gate_id: 'mag_route_gate_revision',
      trigger_nodes: ['route:revision'],
      blocking: true,
    },
  ]);
  assert.deepEqual(actionGraph.checkpoint_policy, {
    mode: 'explicit_nodes',
    checkpoint_nodes: ['route:critique', 'route:revision'],
  });
}

function assertMasActionGraph(actionGraph: Record<string, unknown>) {
  assert.equal(actionGraph.graph_id, 'mas_workspace_frontdoor_study_runtime_graph');
  assert.equal(actionGraph.target_domain_id, 'med-autoscience');
  assert.deepEqual(
    (actionGraph.nodes as Array<{ node_id: string }>).map((node) => node.node_id),
    [
      'frontdoor:open_workspace',
      'study:submit_task',
      'study:launch_or_resume',
      'study:inspect_progress',
    ],
  );
  assert.deepEqual(actionGraph.entry_nodes, ['frontdoor:open_workspace']);
  assert.deepEqual(actionGraph.exit_nodes, ['study:inspect_progress']);
  assert.deepEqual(actionGraph.human_gates, [
    {
      gate_id: 'study_physician_decision_gate',
      trigger_nodes: ['study:inspect_progress'],
      blocking: true,
    },
    {
      gate_id: 'publication_release_gate',
      trigger_nodes: ['study:inspect_progress'],
      blocking: true,
    },
  ]);
  assert.deepEqual(actionGraph.checkpoint_policy, {
    mode: 'explicit_nodes',
    checkpoint_nodes: [
      'study:submit_task',
      'study:launch_or_resume',
      'study:inspect_progress',
    ],
  });
}

function assertRedcubeActionGraph(actionGraph: Record<string, unknown>) {
  assert.equal(actionGraph.graph_id, 'redcube_frontdoor_product_entry_graph');
  assert.equal(actionGraph.target_domain_id, 'redcube_ai');
  assert.deepEqual(
    (actionGraph.nodes as Array<{ node_id: string }>).map((node) => node.node_id),
    [
      'step:open_frontdesk',
      'step:continue_current_loop',
      'step:opl_bridge_handoff',
      'step:inspect_current_progress',
    ],
  );
  assert.deepEqual(actionGraph.entry_nodes, ['step:open_frontdesk']);
  assert.deepEqual(actionGraph.exit_nodes, ['step:inspect_current_progress']);
  assert.deepEqual(actionGraph.human_gates, [
    {
      gate_id: 'redcube_operator_review_gate',
      trigger_nodes: ['step:inspect_current_progress'],
      blocking: true,
    },
  ]);
  assert.deepEqual(actionGraph.checkpoint_policy, {
    mode: 'explicit_nodes',
    checkpoint_nodes: [
      'step:continue_current_loop',
      'step:opl_bridge_handoff',
      'step:inspect_current_progress',
    ],
  });
}

function createFamilyContractsFixtureRoot() {
  return createContractsFixtureRoot((fixtureContractsRoot) => {
    const domainsPath = path.join(fixtureContractsRoot, 'domains.json');
    const payload = JSON.parse(fs.readFileSync(domainsPath, 'utf8')) as {
      version: string;
      domains: Array<Record<string, unknown>>;
    };

    if (!payload.domains.some((domain) => domain.domain_id === 'medautogrant')) {
      payload.domains.push({
        domain_id: 'medautogrant',
        label: 'MedAutoGrant',
        project: 'med-autogrant',
        role: 'grant_ops_gateway',
        gateway_surface: 'Grant Ops Gateway',
        harness_surface: 'Grant Writing Domain Harness OS',
        standalone_allowed: true,
        owned_workstreams: ['grant_ops'],
        non_opl_families: [],
        canonical_truth_owner: [
          'grant_runs',
          'workspace_state',
          'submission_artifacts',
        ],
      });
    }

    fs.writeFileSync(domainsPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  });
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

function runGitFixtureCommand(
  cwd: string,
  args: string[],
  envOverrides: Record<string, string> = {},
) {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      ...envOverrides,
    },
  });

  assert.equal(result.status, 0, `git ${args.join(' ')}\nstdout=${result.stdout}\nstderr=${result.stderr}`);
  return result;
}

function createGitModuleRemoteFixture(moduleName = 'med-autoscience') {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-module-remote-'));
  const sourceRoot = path.join(fixtureRoot, 'source');
  const remoteRoot = path.join(fixtureRoot, `${moduleName}.git`);

  fs.mkdirSync(sourceRoot, { recursive: true });
  runGitFixtureCommand(sourceRoot, ['init']);
  runGitFixtureCommand(sourceRoot, ['checkout', '-b', 'main']);
  runGitFixtureCommand(sourceRoot, ['config', 'user.name', 'OPL Test']);
  runGitFixtureCommand(sourceRoot, ['config', 'user.email', 'opl@example.test']);

  fs.writeFileSync(path.join(sourceRoot, 'README.md'), `# ${moduleName}\n`, 'utf8');
  runGitFixtureCommand(sourceRoot, ['add', 'README.md']);
  runGitFixtureCommand(sourceRoot, ['commit', '-m', 'Initial module snapshot']);

  runGitFixtureCommand(fixtureRoot, ['init', '--bare', remoteRoot]);
  runGitFixtureCommand(sourceRoot, ['remote', 'add', 'origin', remoteRoot]);
  runGitFixtureCommand(sourceRoot, ['push', '-u', 'origin', 'main']);

  return {
    fixtureRoot,
    sourceRoot,
    remoteRoot,
    getHeadSha() {
      return runGitFixtureCommand(sourceRoot, ['rev-parse', 'HEAD']).stdout.trim();
    },
    advance(fileName: string, contents: string, message: string) {
      fs.writeFileSync(path.join(sourceRoot, fileName), contents, 'utf8');
      runGitFixtureCommand(sourceRoot, ['add', fileName]);
      runGitFixtureCommand(sourceRoot, ['commit', '-m', message]);
      runGitFixtureCommand(sourceRoot, ['push', 'origin', 'main']);
      return runGitFixtureCommand(sourceRoot, ['rev-parse', 'HEAD']).stdout.trim();
    },
  };
}

function createFakeShellCommandFixture() {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-shell-command-fixture-'));
  const capturePath = path.join(fixtureRoot, 'shell-command.log');
  const commandPath = path.join(fixtureRoot, 'fake-domain-entry');
  fs.writeFileSync(
    commandPath,
    `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$*" >> "${capturePath}"
`,
    { mode: 0o755 },
  );

  return {
    fixtureRoot,
    commandPath,
    capturePath,
  };
}

function createFamilyLocatorResolverFixture(options: {
  masProfile: string;
  magInput: string;
  redcubeWorkspaceRoot: string;
  masManifest: Record<string, unknown>;
  magManifest: Record<string, unknown>;
  redcubeManifest: Record<string, unknown>;
}) {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-locator-fixture-'));
  const uvPath = path.join(fixtureRoot, 'uv');
  const redcubePath = path.join(fixtureRoot, 'redcube');
  const masManifestPath = path.join(fixtureRoot, 'mas-manifest.json');
  const magManifestPath = path.join(fixtureRoot, 'mag-manifest.json');
  const redcubeManifestPath = path.join(fixtureRoot, 'redcube-manifest.json');

  fs.writeFileSync(masManifestPath, `${JSON.stringify(options.masManifest, null, 2)}\n`, 'utf8');
  fs.writeFileSync(magManifestPath, `${JSON.stringify(options.magManifest, null, 2)}\n`, 'utf8');
  fs.writeFileSync(redcubeManifestPath, `${JSON.stringify(options.redcubeManifest, null, 2)}\n`, 'utf8');

  fs.writeFileSync(
    uvPath,
    `#!/usr/bin/env bash
set -euo pipefail

if [[ "$*" == ${shellSingleQuote(`run python -m med_autoscience.cli product manifest --profile ${path.resolve(options.masProfile)} --format json`)} ]]; then
  cat ${shellSingleQuote(masManifestPath)}
  exit 0
fi

if [[ "$*" == ${shellSingleQuote(`run python -m med_autogrant product manifest --input ${path.resolve(options.magInput)} --format json`)} ]]; then
  cat ${shellSingleQuote(magManifestPath)}
  exit 0
fi

echo "unexpected uv args: $*" >&2
exit 1
`,
    { mode: 0o755 },
  );

  fs.writeFileSync(
    redcubePath,
    `#!/usr/bin/env bash
set -euo pipefail

if [[ "$*" == ${shellSingleQuote(`product manifest --workspace-root ${path.resolve(options.redcubeWorkspaceRoot)}`)} ]]; then
  cat ${shellSingleQuote(redcubeManifestPath)}
  exit 0
fi

echo "unexpected redcube args: $*" >&2
exit 1
`,
    { mode: 0o755 },
  );

  return {
    fixtureRoot,
    uvPath,
    redcubePath,
  };
}

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

async function startFakeOplApiServer() {
  let activeWorkspacePath = repoRoot;
  const requests: Array<{
    method: string;
    path: string;
    query: Record<string, string>;
    body: Record<string, unknown> | null;
  }> = [];
  const server = createServer(async (request: IncomingMessage, response: ServerResponse<IncomingMessage>) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    const body = await readServerJsonBody(request);
    requests.push({
      method: request.method ?? 'GET',
      path: url.pathname,
      query: Object.fromEntries(url.searchParams.entries()),
      body,
    });

    response.setHeader('content-type', 'application/json; charset=utf-8');
    response.setHeader('connection', 'close');

    if (request.method === 'GET' && url.pathname === '/api/status/dashboard') {
      response.statusCode = 200;
      response.end(JSON.stringify({
        dashboard: {
          workspace_path: url.searchParams.get('path'),
          sessions_limit: Number(url.searchParams.get('sessions_limit') ?? '0'),
        },
      }));
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/projects') {
      response.statusCode = 200;
      response.end(JSON.stringify({
        projects: [
          {
            project_id: 'medautoscience',
            label: 'Med Auto Science',
          },
        ],
      }));
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/status/runtime') {
      response.statusCode = 200;
      response.end(JSON.stringify({
        runtime_status: {
          limit: Number(url.searchParams.get('limit') ?? '0'),
          runs: [],
        },
      }));
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/opl/progress') {
      const taskId = url.searchParams.get('task_id');
      response.statusCode = 200;
      response.end(JSON.stringify({
        progress: {
          surface_id: 'opl_progress',
          session_id: taskId ? 'sess-frontdesk-001' : 'sess-progress',
          workspace_path: url.searchParams.get('workspace_path'),
          project_state: 'active_study',
          current_project: {
            project_id: 'medautoscience',
            label: 'med-autoscience',
            workspace_path: url.searchParams.get('workspace_path'),
          },
          headline: '004 论文当前仍在推进证据补强，需要继续补主图和投稿包可审计物。',
          latest_update: '论文主体内容已经完成，当前进入投稿打包收口。',
          next_step: '优先核对 submission package 与 studies 目录中的交付面是否一致。',
          status_summary: '投稿打包阶段已被全局门控放行，可以进入关键路径。',
          study: {
            study_id: '004-invasive-architecture',
            title: 'NF-PitNET invasive phenotype architecture with public-data anatomy and biology anchors',
            story_summary: '当前主线是首术 NF-PitNET 的侵袭表型 architecture：用本地队列重构侵袭、Knosp、视觉压迫与切除负担，并把公开 MRI / omics 作为 anatomy / biology anchors。',
            clinical_question: '首术 NF-PitNET 的侵袭表型如何同时连接影像、临床负担与分子层面的 anatomy / biology anchors。',
            current_stage: 'publication_supervision',
            current_stage_summary: '投稿打包阶段已被全局门控放行，可以进入关键路径。',
            paper_snapshot: {
              main_figure_count: 4,
              supplementary_figure_count: 2,
              main_table_count: 3,
              supplementary_table_count: 1,
              reference_count: 52,
              page_count: 28,
            },
            status_narration_contract: {
              schema_version: 1,
              contract_kind: 'ai_status_narration',
              contract_id: 'study-progress::004-invasive-architecture',
              surface_kind: 'study_progress',
              audience: 'human_user',
              milestone: {},
              stage: {
                current_stage: 'publication_supervision',
                recommended_next_stage: 'bundle_stage_ready',
                checkpoint_status: 'forward_progress',
              },
              readiness: {
                needs_physician_decision: false,
              },
              remaining_scope: {},
              current_blockers: [
                'submission package 仍需补更多主图后再建议用户审阅。',
              ],
              latest_update: '论文主体内容已经完成，当前进入投稿打包收口。',
              next_step: '优先核对 submission package 与 studies 目录中的交付面是否一致。',
              human_gate: {},
              facts: {
                study_id: '004-invasive-architecture',
              },
              narration_policy: {
                mode: 'ai_first',
                legacy_summary_role: 'fallback_only',
                style: 'plain_language',
                answer_checklist: ['current_stage', 'current_blockers', 'next_step'],
              },
            },
          },
          task_cards: {
            running: [
              {
                task_id: 'task-frontdesk-001',
                title: '刷新投稿包',
                status: 'running',
              },
            ],
            waiting: [],
            ready: [],
            delivered: [],
          },
          recent_activity: {
            session_id: 'sess-progress',
            last_active: '2m ago',
            source: 'cli',
            preview: 'study 004 progress refresh',
          },
          inspect_paths: [
            url.searchParams.get('workspace_path'),
            '/tmp/opl-activated-workspace/studies/004-invasive-architecture',
          ],
          attention_items: [
            'submission package 仍需补更多主图后再建议用户审阅。',
          ],
          configured_human_gates: [],
          recommended_commands: {
            progress: 'medautosci study-progress --study 004',
            resume: 'medautosci launch-study --study 004',
            start: null,
          },
          ...(taskId
            ? {
                task: {
                  task_id: taskId,
                  status: 'running',
                  stage: 'writing',
                  summary: '正在补图和整理投稿包',
                  recent_output: '主图更新完成，正在刷新审计目录',
                  session_id: 'sess-frontdesk-001',
                },
              }
            : {}),
        },
      }));
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/opl/sessions') {
      response.statusCode = 200;
      response.end(JSON.stringify({
        sessions: {
          surface_id: 'opl_sessions',
          summary: {
            requested_limit: Number(url.searchParams.get('limit') ?? '0'),
            source_filter: url.searchParams.get('source'),
            listed_sessions_count: 1,
            ledger_sessions_count: 1,
            ledger_entry_count: 1,
          },
          items: [
            {
              session_id: 'sess-frontdesk-001',
              source: 'opl-product-entry',
              preview: 'Resume 004 paper progression',
              last_active: '1m ago',
            },
          ],
          raw_output: 'sess-frontdesk-001 opl-product-entry Resume 004 paper progression',
          ledger: {
            surface_id: 'opl_managed_session_ledger',
            sessions: [
              {
                session_id: 'sess-frontdesk-001',
                resource_totals: {
                  latest_sample_status: 'captured',
                },
              },
            ],
            summary: {
              entry_count: 1,
            },
          },
        },
      }));
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/opl/sessions/logs') {
      response.statusCode = 200;
      response.end(JSON.stringify({
        session_logs: {
          surface_id: 'opl_session_logs',
          mode: 'logs',
          log_name: url.searchParams.get('log_name'),
          lines: Number(url.searchParams.get('lines') ?? '0'),
          session_id: url.searchParams.get('session_id'),
          raw_output: 'runtime heartbeat ok\npaper worker still running',
        },
      }));
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/opl/sessions/resume') {
      response.statusCode = 200;
      response.end(JSON.stringify({
        session_resume: {
          surface_id: 'opl_session_resume',
          mode: 'resume',
          resume: {
            session_id: String(body?.session_id ?? 'sess-frontdesk-001'),
            output: 'RUNTIME RESUME OUTPUT',
          },
        },
      }));
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/status/workspace') {
      response.statusCode = 200;
      response.end(JSON.stringify({
        workspace_status: {
          workspace_path: url.searchParams.get('path'),
        },
      }));
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/domain/manifests') {
      response.statusCode = 200;
      response.end(JSON.stringify({
        domain_manifests: {
          projects: [],
        },
      }));
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/opl/workspaces') {
      response.statusCode = 200;
      response.end(JSON.stringify({
        workspaces: {
          surface_id: 'opl_workspaces',
          action: 'list',
          summary: {
            active_projects_count: 1,
            total_projects_count: 1,
          },
          projects: [
            {
              project_id: 'medautoscience',
              project: 'med-autoscience',
              active_binding: {
                project_id: 'medautoscience',
                project: 'med-autoscience',
                workspace_path: activeWorkspacePath,
                status: 'active',
                direct_entry: {
                  command: null,
                  manifest_command: null,
                  url: 'http://127.0.0.1:8080',
                },
              },
            },
          ],
          bindings: [],
        },
      }));
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/session/ledger') {
      response.statusCode = 200;
      response.end(JSON.stringify({
        session_ledger: {
          surface_id: 'opl_managed_session_ledger',
          limit: Number(url.searchParams.get('limit') ?? '0'),
          sessions: [
            {
              session_id: 'sess-001',
              resource_totals: {
                latest_sample_status: 'captured',
              },
            },
          ],
        },
      }));
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/opl/workspaces/activate') {
      activeWorkspacePath = String(body?.workspace_path ?? activeWorkspacePath);
      response.statusCode = 200;
      response.end(JSON.stringify({
        workspaces: {
          surface_id: 'opl_workspaces',
          action: 'activate',
          binding: {
            project_id: String(body?.project_id ?? 'unknown'),
            workspace_path: activeWorkspacePath,
            status: 'active',
          },
          summary: {
            active_projects_count: 1,
            total_projects_count: 1,
          },
        },
      }));
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/opl/sessions') {
      response.statusCode = 200;
      response.end(JSON.stringify({
        session_create: {
          surface_id: 'opl_session_create',
          request_mode: 'submitted',
          payload: {
            product_entry: {
              entry_surface: 'opl_session_api',
              input: {
                goal: String(body?.goal ?? ''),
              },
              task: {
                task_id: 'task-frontdesk-001',
                status: 'accepted',
                summary: '请求已提交到后台执行队列',
                session_id: null,
              },
            },
          },
        },
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
    throw new Error('Failed to bind fake OPL API server.');
  }

  return {
    server,
    requests,
    apiBaseUrl: `http://127.0.0.1:${address.port}/api`,
  };
}

const jsonLineReadState = new WeakMap<Readable, { bufferedText: string }>();

function getJsonLineReadState(stream: Readable) {
  let state = jsonLineReadState.get(stream);
  if (!state) {
    state = { bufferedText: '' };
    jsonLineReadState.set(stream, state);
  }
  return state;
}

function takeBufferedJsonLine(stream: Readable) {
  const state = getJsonLineReadState(stream);

  while (true) {
    const newlineIndex = state.bufferedText.indexOf('\n');
    if (newlineIndex === -1) {
      return null;
    }

    const line = state.bufferedText.slice(0, newlineIndex).trim();
    state.bufferedText = state.bufferedText.slice(newlineIndex + 1);
    if (line) {
      return line;
    }
  }
}

async function readJsonLine(stream: Readable) {
  const bufferedLine = takeBufferedJsonLine(stream);
  if (bufferedLine) {
    return JSON.parse(bufferedLine) as Record<string, unknown>;
  }

  return await new Promise<Record<string, unknown>>((resolve, reject) => {
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const onClose = () => {
      cleanup();
      reject(new Error('MCP bridge closed before emitting the next JSON line.'));
    };
    const cleanup = () => {
      stream.off('data', onData);
      stream.off('error', onError);
      stream.off('end', onClose);
      stream.off('close', onClose);
    };
    const onData = (chunk: Buffer | string) => {
      const state = getJsonLineReadState(stream);
      state.bufferedText += chunk.toString();
      const line = takeBufferedJsonLine(stream);
      if (!line) {
        return;
      }

      cleanup();
      try {
        resolve(JSON.parse(line) as Record<string, unknown>);
      } catch (error) {
        reject(error);
      }
    };

    stream.on('data', onData);
    stream.once('error', onError);
    stream.once('end', onClose);
    stream.once('close', onClose);
  });
}

function writeJsonLine(stream: NodeJS.WritableStream, payload: Record<string, unknown>) {
  stream.write(`${JSON.stringify(payload)}\n`);
}

async function stopCliPipeChild(
  child: ChildProcessByStdio<NodeJS.WritableStream, Readable, Readable>,
) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  child.stdin.end();
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

export {
  GatewayContractError,
  PassThrough,
  assert,
  buildManifestCommand,
  buildProjectProgressBrief,
  cliPath,
  contractsDir,
  createCodexConfigFixture,
  createContractsFixtureRoot,
  createFakeCodexFixture,
  createFakeHermesFixture,
  createFakeLaunchctlFixture,
  createFakeOpenFixture,
  createFakePsFixture,
  createFakeShellCommandFixture,
  createFamilyContractsFixtureRoot,
  createFamilyLocatorResolverFixture,
  createGitModuleRemoteFixture,
  createMasWorkspaceFixture,
  explainDomainBoundary,
  familyManifestFixtureDir,
  fs,
  loadFamilyManifestFixtures,
  loadGatewayContracts,
  once,
  os,
  path,
  readJsonFixture,
  readJsonLine,
  repoRoot,
  resolveRequestSurface,
  runCli,
  runCliAsync,
  runCliFailure,
  runCliFailureInCwd,
  runCliInCwd,
  runCliRaw,
  runCliViaEntryPathInCwd,
  shellSingleQuote,
  spawn,
  startCliServer,
  startFakeOplApiServer,
  stopCliPipeChild,
  stopCliServer,
  stopHttpServer,
  test,
  validateGatewayContracts,
  writeJsonLine,
  assertContractsContext,
  assertNoContractsProvenance,
  assertMagActionGraph,
  assertMasActionGraph,
  assertRedcubeActionGraph,
};
