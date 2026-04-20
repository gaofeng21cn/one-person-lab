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
import type { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';

import {
  GatewayContractError,
  loadGatewayContracts,
  validateGatewayContracts,
} from '../../src/contracts.ts';
import { buildProjectProgressBrief } from '../../src/management.ts';
import {
  explainDomainBoundary,
  resolveRequestSurface,
} from '../../src/resolver.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const cliPath = path.join(repoRoot, 'src', 'cli.ts');
const contractsDir = path.join(repoRoot, 'contracts', 'opl-gateway');
const familyManifestFixtureDir = path.join(repoRoot, 'tests', 'fixtures', 'family-manifests');

function runCli(args: string[], envOverrides: Record<string, string> = {}) {
  return runCliInCwd(args, repoRoot, envOverrides);
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

async function readJsonLine(stream: Readable) {
  return await new Promise<Record<string, unknown>>((resolve, reject) => {
    let buffer = '';
    const onData = (chunk: Buffer | string) => {
      buffer += chunk.toString();
      const newlineIndex = buffer.indexOf('\n');
      if (newlineIndex === -1) {
        return;
      }

      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);
      stream.off('data', onData);
      if (!line) {
        reject(new Error('Received empty JSON line from MCP bridge.'));
        return;
      }

      try {
        resolve(JSON.parse(line) as Record<string, unknown>);
      } catch (error) {
        reject(error);
      }
    };

    stream.on('data', onData);
    stream.once('error', reject);
  });
}

function writeJsonLine(stream: NodeJS.WritableStream, payload: Record<string, unknown>) {
  stream.write(`${JSON.stringify(payload)}\n`);
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
  workstreams.workstreams.find((entry: { workstream_id: string }) => entry.workstream_id === 'research_ops').label = 'Research Ops Override';
  fs.writeFileSync(workstreamsPath, JSON.stringify(workstreams, null, 2));

  const output = runCli(['contract', 'workstream', 'research_ops'], {
    OPL_CONTRACTS_DIR: tempContracts,
  });

  assertContractsContext(output, 'env', tempContracts);
  assert.equal(output.workstream.label, 'Research Ops Override');
});

test('global --contracts-dir override uses the explicit contract root', () => {
  const { fixtureRoot, fixtureContractsRoot } = createContractsFixtureRoot((contractsRoot) => {
    const workstreamsPath = path.join(contractsRoot, 'workstreams.json');
    const workstreams = JSON.parse(fs.readFileSync(workstreamsPath, 'utf8'));
    workstreams.workstreams.find((entry: { workstream_id: string }) => entry.workstream_id === 'research_ops').label = 'Research Ops From Flag';
    fs.writeFileSync(workstreamsPath, JSON.stringify(workstreams, null, 2));
  });

  try {
    const output = runCli([
      '--contracts-dir',
      fixtureContractsRoot,
      'contract',
      'workstream',
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
    workstreams.workstreams.find((entry: { workstream_id: string }) => entry.workstream_id === 'research_ops').label = 'Research Ops From Env';
    fs.writeFileSync(workstreamsPath, JSON.stringify(workstreams, null, 2));
  });
  const flagFixture = createContractsFixtureRoot((contractsRoot) => {
    const workstreamsPath = path.join(contractsRoot, 'workstreams.json');
    const workstreams = JSON.parse(fs.readFileSync(workstreamsPath, 'utf8'));
    workstreams.workstreams.find((entry: { workstream_id: string }) => entry.workstream_id === 'research_ops').label = 'Research Ops From Flag';
    fs.writeFileSync(workstreamsPath, JSON.stringify(workstreams, null, 2));
  });

  try {
    const output = runCli(
      ['--contracts-dir', flagFixture.fixtureContractsRoot, 'contract', 'workstream', 'research_ops'],
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

test('contract validate returns a stable machine-readable contract summary', () => {
  const output = runCli(['contract', 'validate']);
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

test('workspace projects returns the current OPL family project surfaces', () => {
  const output = runCli(['workspace', 'projects']);

  assert.equal(output.version, 'g2');
  assert.equal(output.projects.length, 4);
  assert.equal(output.projects[0].project_id, 'opl');
  assert.equal(output.projects[0].scope, 'family_gateway');
  assert.equal(output.projects[0].direct_entry_surface, 'opl');
  assert.equal(output.projects[1].project_id, 'medautogrant');
  assert.equal(output.projects[2].project_id, 'medautoscience');
  assert.equal(output.projects[3].project_id, 'redcube');
});

test('status workspace reports git and worktree visibility for one workspace path', () => {
  const output = runCli(['status', 'workspace', '--path', repoRoot]);

  assert.equal(output.version, 'g2');
  assert.equal(output.workspace.absolute_path, repoRoot);
  assert.equal(output.workspace.kind, 'directory');
  assert.equal(output.workspace.entries.total > 0, true);
  assert.equal(output.workspace.git.inside_work_tree, true);
  assert.equal(output.workspace.git.root, repoRoot);
  assert.equal(typeof output.workspace.git.linked_worktree, 'boolean');
  assert.equal(typeof output.workspace.git.is_clean, 'boolean');
});

test('bare opl command seeds a product-entry session when not attached to a tty', () => {
  const { fixtureRoot, hermesPath } = createFakeHermesFixture(`
if [ "$1" = "chat" ]; then
  cat <<'EOF'
╭─ ⚕ Hermes ───────────────────────────────────────────────────────────────────╮
OPL FRONT DESK READY

session_id: opl-session-seed
EOF
  exit 0
fi
if [ "$1" = "--resume" ] && [ "$2" = "opl-session-seed" ]; then
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
    assert.equal(output.product_entry.mode, 'session_seed');
    assert.doesNotMatch(output.product_entry.mode, /frontdesk/i);
    assert.equal(output.product_entry.interactive, false);
    assert.doesNotMatch(output.product_entry.handoff_prompt_preview, /front[- ]?desk/i);
    assert.equal(output.product_entry.seed.session_id, 'opl-session-seed');
    assert.equal(output.product_entry.seed.command_preview.includes('opl-frontdesk'), false);
    assert.equal(output.product_entry.seed.command_preview.includes('opl-session-seed'), true);
    assert.equal(output.product_entry.seed.response, 'OPL FRONT DESK READY');
    assert.equal(output.product_entry.resume.session_id, 'opl-session-seed');
    assert.equal(output.product_entry.resume.output, 'OPL FRONT DESK RESUMED');
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('natural-language fallback routes multi-token input through the default Codex quick ask path', () => {
  const { fixtureRoot, codexPath } = createFakeCodexFixture(`
if [ "$1" = "exec" ]; then
  cat <<'EOF'
{"type":"thread.started","thread_id":"opl-quick-ask-session"}
{"type":"turn.started"}
{"item":{"type":"agent_message","text":"AUTO ASK READY"}}
EOF
  exit 0
fi
echo "unexpected fake-codex args: $*" >&2
exit 1
`);

  try {
    const output = runCli(
      ['Plan', 'a', 'medical', 'grant', 'proposal', 'revision', 'loop.'],
      {
        OPL_CODEX_BIN: codexPath,
      },
    );

    assert.equal(output.product_entry.mode, 'ask');
    assert.equal(output.product_entry.input.goal, 'Plan a medical grant proposal revision loop.');
    assert.equal(output.product_entry.routing.status, 'routed');
    assert.equal(output.product_entry.routing.domain_id, 'medautogrant');
    assert.equal(output.product_entry.routing.workstream_id, 'grant_ops');
    assert.equal(output.product_entry.executor_backend, 'codex');
    assert.equal(output.product_entry.codex.session_id, 'opl-quick-ask-session');
    assert.equal(output.product_entry.codex.response, 'AUTO ASK READY');
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('ask --dry-run produces a routed Codex handoff preview from a plain-language request', () => {
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
  assert.equal(output.product_entry.executor_backend, 'codex');
  assert.match(output.product_entry.handoff_prompt_preview, /One Person Lab \(OPL\) Product Entry/);
  assert.match(output.product_entry.handoff_prompt_preview, /presentation_ops/);
  assert.equal(output.product_entry.codex.command_preview[0], 'codex');
  assert.ok(output.product_entry.codex.command_preview.includes('--json'));
});

test('ask runs Codex through the resolved product-entry handoff and returns the captured response', () => {
  const { fixtureRoot, codexPath } = createFakeCodexFixture(`
if [ "$1" = "exec" ]; then
  cat <<'EOF'
{"type":"thread.started","thread_id":"opl-test-session"}
{"type":"turn.started"}
{"item":{"type":"command_execution","command":"npm test","status":"completed","aggregated_output":"2 passed"}}
{"item":{"type":"agent_message","text":"READY FROM OPL"}}
{"type":"turn.completed"}
EOF
  exit 0
fi
echo "unexpected fake-codex args: $*" >&2
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
        OPL_CODEX_BIN: codexPath,
      },
    );

    assert.equal(output.version, 'g2');
    assert.equal(output.product_entry.mode, 'ask');
    assert.equal(output.product_entry.dry_run, false);
    assert.equal(output.product_entry.executor_backend, 'codex');
    assert.equal(output.product_entry.routing.status, 'domain_boundary');
    assert.equal(output.product_entry.routing.domain_id, 'redcube');
    assert.equal(output.product_entry.codex.session_id, 'opl-test-session');
    assert.equal(output.product_entry.codex.response, 'READY FROM OPL');
    assert.equal(output.product_entry.codex.exit_code, 0);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('ask --executor hermes keeps the Hermes fallback lane available', () => {
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
        '--executor',
        'hermes',
      ],
      {
        OPL_HERMES_BIN: hermesPath,
      },
    );

    assert.equal(output.version, 'g2');
    assert.equal(output.product_entry.mode, 'ask');
    assert.equal(output.product_entry.dry_run, false);
    assert.equal(output.product_entry.executor_backend, 'hermes');
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
    const output = runCli(['session', 'resume', 'opl-test-session'], {
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
    const output = runCli(['session', 'list', '--limit', '2'], {
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

test('status runtime reports Hermes runtime health, sessions, and process usage', () => {
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
    const output = runCli(['status', 'runtime', '--limit', '2'], {
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

test('status dashboard aggregates front-desk management surfaces into one view', () => {
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
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-dashboard-state-'));

  try {
    const output = runCli(['status', 'dashboard', '--path', repoRoot, '--sessions-limit', '1'], {
      OPL_FRONTDESK_STATE_DIR: stateRoot,
      OPL_HERMES_BIN: hermesPath,
      PATH: `${psFixture.fixtureRoot}:${process.env.PATH ?? ''}`,
    });

    assert.equal(output.version, 'g2');
    assert.equal(output.dashboard.product_api.direct_entry_command, 'opl');
    assert.equal(output.dashboard.product_api.local_web_status, 'pilot_landed');
    assert.equal(output.dashboard.product_api.desktop_shell_status, 'not_repo_tracked');
    assert.equal(output.dashboard.product_api.desktop_default_entry_status, 'external_overlay_required');
    assert.equal(output.dashboard.product_api.recommended_entry_surfaces_count, 0);
    assert.deepEqual(output.dashboard.product_api.recommended_entry_surfaces, []);
    assert.equal(output.dashboard.product_api.hosted_runtime_readiness.desktop_shell_landed, false);
    assert.equal('hosted_web_status' in output.dashboard.product_api, false);
    assert.equal('librechat_pilot_package_status' in output.dashboard.product_api, false);
    assert.equal('frontdesk_librechat_status_surface' in output.dashboard.product_api, false);
    assert.equal(output.dashboard.projects.length, 4);
    assert.equal(output.dashboard.domain_manifests.summary.total_projects_count, 3);
    assert.equal(output.dashboard.domain_manifests.summary.resolved_count, 0);
    assert.equal(output.dashboard.workspace.absolute_path, repoRoot);
    assert.equal(output.dashboard.runtime_status.recent_sessions.sessions.length, 1);
    assert.deepEqual(output.dashboard.product_api.rollout_board_refs, [
      'docs/references/opl-frontdesk-delivery-board.md',
      'docs/references/opl-hosted-web-frontdesk-benchmark.md',
      'docs/references/family-lightweight-direct-entry-rollout-board.md',
      'docs/references/mas-top-level-cutover-board.md',
    ]);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
    fs.rmSync(psFixture.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('help advertises the local web front-desk pilot command surface', () => {
  const output = runCli(['help']);

  assert.ok(
    output.help.commands.some((entry: { command: string }) => entry.command === 'web'),
  );
  assert.ok(
    output.help.commands.some((entry: { command: string }) => entry.command === 'system'),
  );
  assert.ok(
    output.help.commands.some((entry: { command: string }) => entry.command === 'system initialize'),
  );
  assert.ok(
    output.help.commands.some((entry: { command: string }) => entry.command === 'service install'),
  );
  assert.ok(
    output.help.commands.some((entry: { command: string }) => entry.command === 'modules'),
  );
  assert.ok(
    output.help.commands.some((entry: { command: string }) => entry.command === 'domain launch'),
  );

  const scoped = runCli(['web', '--help']);
  assert.equal(scoped.help.command, 'web');
  assert.match(scoped.help.usage, /opl web/);
});

test('help advertises initialize and environment management command surfaces', () => {
  const output = runCli(['help']);
  const commands = output.help.commands.map((entry: { command: string }) => entry.command);

  assert.equal(commands.includes('system initialize'), true);
  assert.equal(commands.includes('engine install'), true);
  assert.equal(commands.includes('system repair'), true);
  assert.equal(commands.includes('system reinstall-support'), true);
  assert.equal(commands.includes('system update-channel'), true);
  assert.equal(commands.includes('modules'), true);
  assert.equal(commands.includes('module install'), true);
  assert.equal(commands.includes('workspace root'), true);
  assert.equal(commands.includes('workspace root set'), true);
  assert.equal(commands.includes('workspace root doctor'), true);
});

test('legacy frontdesk command surfaces are retired from the public CLI', () => {
  for (const args of [
    ['frontdesk', 'manifest'],
    ['frontdesk', 'entry-guide'],
    ['frontdesk', 'domain-wiring'],
    ['frontdesk', 'readiness'],
  ]) {
    const { status, payload } = runCliFailure(args);
    assert.equal(status, 2);
    assert.equal(payload.error.code, 'unknown_command');
    assert.equal(payload.error.details.command, 'frontdesk');
    assert.ok(Array.isArray(payload.error.details.commands));
    assert.equal(payload.error.details.commands.includes('frontdesk manifest'), false);
  }
});

test('service commands manage the local launchd wrapper for the web pilot', async () => {
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
      'service',
      'install',
      '--host',
      '127.0.0.1',
      '--port',
      String(configuredPort),
      '--path',
      repoRoot,
      '--sessions-limit',
      '7',
    ], serviceEnv);

    assert.equal(install.service.action, 'install');
    assert.equal(install.service.installed, true);
    assert.equal(install.service.loaded, true);
    assert.equal(install.service.base_url, `http://127.0.0.1:${configuredPort}`);
    assert.equal(install.service.paths.launch_agent_plist.endsWith('.plist'), true);
    assert.equal(fs.existsSync(install.service.paths.launch_agent_plist), true);
    assert.equal(fs.existsSync(install.service.paths.config_file), true);

    const plistText = fs.readFileSync(install.service.paths.launch_agent_plist, 'utf8');
    assert.match(plistText, /<string>web<\/string>/);
    assert.match(plistText, new RegExp(String(configuredPort)));

    const statusWithoutHealth = runCli(['service', 'status'], serviceEnv);
    assert.equal(statusWithoutHealth.service.action, 'status');
    assert.equal(statusWithoutHealth.service.installed, true);
    assert.equal(statusWithoutHealth.service.loaded, true);
    assert.equal(statusWithoutHealth.service.health.status, 'unreachable');

    const statusWithHealth = runCli(['service', 'status'], serviceEnv);
    assert.equal(statusWithHealth.service.loaded, true);
    assert.equal(statusWithHealth.service.health.status, 'unreachable');
    assert.equal(
      statusWithHealth.service.health.url,
      `http://127.0.0.1:${configuredPort}/api/health`,
    );

    const openOutput = runCli(['service', 'open'], serviceEnv);
    assert.equal(openOutput.service.action, 'open');
    assert.match(fs.readFileSync(openFixture.capturePath, 'utf8'), new RegExp(String(configuredPort)));

    const stopOutput = runCli(['service', 'stop'], serviceEnv);
    assert.equal(stopOutput.service.action, 'stop');
    assert.equal(stopOutput.service.loaded, false);

    const stoppedStatus = runCli(['service', 'status'], serviceEnv);
    assert.equal(stoppedStatus.service.loaded, false);
    assert.equal(stoppedStatus.service.health.status, 'not_running');

    const startOutput = runCli(['service', 'start'], serviceEnv);
    assert.equal(startOutput.service.action, 'start');
    assert.equal(startOutput.service.loaded, true);

    const uninstallOutput = runCli(['service', 'uninstall'], serviceEnv);
    assert.equal(uninstallOutput.service.action, 'uninstall');
    assert.equal(uninstallOutput.service.installed, false);
    assert.equal(fs.existsSync(install.service.paths.launch_agent_plist), false);
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
    fs.rmSync(launchctlFixture.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(openFixture.fixtureRoot, { recursive: true, force: true });
  }
});

test('web bundle exposes an OPL web bundle with base-path aware product API endpoints', () => {
  const output = runCli([
    'web',
    'bundle',
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
  assert.equal(output.web_bundle.surface_id, 'opl_web_bundle');
  assert.equal(output.web_bundle.shell_integration_target, 'external_gui_overlay');
  assert.equal(output.web_bundle.bundle_status, 'landed');
  assert.equal(output.web_bundle.hosted_runtime_status, 'not_landed');
  assert.equal(output.web_bundle.base_path, '/pilot/opl');
  assert.equal(output.web_bundle.entry_url, 'http://127.0.0.1:8787/pilot/opl/');
  assert.equal(output.web_bundle.api_base_url, 'http://127.0.0.1:8787/pilot/opl/api');
  assert.equal(output.web_bundle.opl_api.resources.system, '/pilot/opl/api/opl/system');
  assert.equal(output.web_bundle.opl_api.actions.web_bundle, '/pilot/opl/api/opl/web/bundle');
  assert.equal(output.web_bundle.opl_api.debug.dashboard, '/pilot/opl/api/status/dashboard');
  assert.equal(output.web_bundle.defaults.workspace_path, repoRoot);
  assert.equal(output.web_bundle.defaults.sessions_limit, 9);
  assert.equal(
    output.web_bundle.hosted_runtime_readiness.surface_kind,
    'opl_hosted_runtime_readiness',
  );
  assert.equal(output.web_bundle.hosted_runtime_readiness.status, 'pilot_ready_not_managed');
  assert.equal(
    output.web_bundle.hosted_runtime_readiness.web_bundle_landed,
    true,
  );
  assert.equal(
    output.web_bundle.hosted_runtime_readiness.self_hostable_web_package_landed,
    true,
  );
});

test('web package exports a self-hostable OPL web package with runtime and proxy assets', () => {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-hosted-package-'));

  try {
    const output = runCli([
      'web',
      'package',
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
    assert.equal(output.web_package.surface_id, 'opl_web_package');
    assert.equal(output.web_package.shell_integration_target, 'external_gui_overlay');
    assert.equal(output.web_package.package_status, 'landed');
    assert.equal(output.web_package.hosted_runtime_status, 'not_landed');
    assert.equal(output.web_package.public_origin, 'https://opl.example.com');
    assert.equal(output.web_package.entry_url, 'https://opl.example.com/pilot/opl/');
    assert.equal(output.web_package.api_base_url, 'https://opl.example.com/pilot/opl/api');
    assert.equal(output.web_package.opl_api.resources.system, '/pilot/opl/api/opl/system');
    assert.equal(output.web_package.opl_api.actions.web_package, '/pilot/opl/api/opl/web/package');
    assert.equal(
      output.web_package.hosted_runtime_readiness.surface_kind,
      'opl_hosted_runtime_readiness',
    );
    assert.equal(
      output.web_package.hosted_runtime_readiness.status,
      'pilot_ready_not_managed',
    );
    assert.equal(
      output.web_package.hosted_runtime_readiness.self_hostable_web_package_landed,
      true,
    );
    assert.equal(
      output.web_package.hosted_runtime_readiness.service_safe_local_packaging_landed,
      true,
    );

    const assets = output.web_package.assets;
    assert.equal(fs.existsSync(assets.bundle_json), true);
    assert.equal(fs.existsSync(assets.readme), true);
    assert.equal(fs.existsSync(assets.launch_script), true);
    assert.equal(fs.existsSync(assets.service_unit), true);
    assert.equal(fs.existsSync(assets.service_install_script), true);
    assert.equal(fs.existsSync(assets.healthcheck_script), true);
    assert.equal(fs.existsSync(assets.reverse_proxy_template), true);
    assert.equal(fs.existsSync(assets.environment_template), true);
    assert.equal(fs.existsSync(assets.app_dist), true);
    assert.equal(fs.existsSync(path.join(assets.app_dist, 'cli.js')), true);
    assert.equal(fs.existsSync(path.join(assets.app_contracts, 'opl-gateway', 'workstreams.json')), true);

    assert.equal(output.web_package.operations.systemd.unit_name, 'opl-web.service');
    assert.equal(
      output.web_package.operations.systemd.install_script,
      assets.service_install_script,
    );
    assert.equal(
      output.web_package.operations.healthcheck.script,
      assets.healthcheck_script,
    );
    assert.equal(
      output.web_package.operations.healthcheck.local_url,
      'http://127.0.0.1:8787/pilot/opl/api/health',
    );
    assert.equal(
      output.web_package.operations.healthcheck.public_url,
      'https://opl.example.com/pilot/opl/api/health',
    );

    const readme = fs.readFileSync(assets.readme, 'utf8');
    assert.match(readme, /OPL Web Package/i);
    assert.match(readme, /OPL_HERMES_BIN/);
    assert.match(readme, /actual hosted runtime is still not landed/i);
    assert.match(readme, /install-systemd-service\.sh/);
    assert.match(readme, /check-opl-web-health\.sh/);
    assert.match(readme, /https:\/\/opl\.example\.com\/pilot\/opl\/api\/health/);

    const service = fs.readFileSync(assets.service_unit, 'utf8');
    assert.match(service, /EnvironmentFile=/);
    assert.match(service, /run-opl-web\.sh/);

    const runScript = fs.readFileSync(assets.launch_script, 'utf8');
    assert.match(runScript, /--base-path/);
    assert.match(runScript, /\/pilot\/opl/);
    assert.match(runScript, /OPL_WEB_WORKSPACE/);

    const caddyfile = fs.readFileSync(assets.reverse_proxy_template, 'utf8');
    assert.match(caddyfile, /opl\.example\.com/);
    assert.match(caddyfile, /handle_path \/pilot\/opl\/\*/);
    assert.match(caddyfile, /reverse_proxy 127\.0\.0\.1:8787/);

    const envExample = fs.readFileSync(assets.environment_template, 'utf8');
    assert.match(envExample, /OPL_HERMES_BIN=/);
    assert.match(envExample, /OPL_WEB_WORKSPACE=/);

    const installScript = fs.readFileSync(assets.service_install_script, 'utf8');
    assert.match(installScript, /SYSTEMCTL_BIN/);
    assert.match(installScript, /daemon-reload/);
    assert.match(installScript, /opl-web\.service/);
    assert.match(installScript, /run-opl-web\.sh/);

    const healthcheckScript = fs.readFileSync(assets.healthcheck_script, 'utf8');
    assert.match(healthcheckScript, /api\/health/);
    assert.match(healthcheckScript, /node -e/);

    const bundleJson = JSON.parse(fs.readFileSync(assets.bundle_json, 'utf8'));
    assert.equal(bundleJson.web_package.entry_url, 'https://opl.example.com/pilot/opl/');
    assert.equal(bundleJson.web_package.base_path, '/pilot/opl');
    assert.equal(bundleJson.web_package.operations.systemd.unit_name, 'opl-web.service');
  } finally {
    fs.rmSync(outputDir, { recursive: true, force: true });
  }
});

test('mcp-stdio lists OPL tools and proxies session/workspace calls through the configured OPL product API', async () => {
  const fakeApi = await startFakeOplApiServer();
  const activatedWorkspacePath = '/tmp/opl-activated-workspace';

  try {
    const child = spawn(
      process.execPath,
      [
        '--experimental-strip-types',
        cliPath,
        'mcp-stdio',
        '--api-base-url',
        fakeApi.apiBaseUrl,
        '--workspace-path',
        repoRoot,
        '--sessions-limit',
        '7',
      ],
      {
        cwd: repoRoot,
        env: {
          ...process.env,
          NODE_NO_WARNINGS: '1',
        },
        stdio: ['pipe', 'pipe', 'pipe'],
      },
    );

    try {
      writeJsonLine(child.stdin, {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-03-26',
          capabilities: {},
          clientInfo: {
            name: 'opl-test-client',
            version: '0.0.0-test',
          },
        },
      });
      const initialize = await readJsonLine(child.stdout);
      assert.equal(initialize.jsonrpc, '2.0');
      assert.equal(initialize.id, 1);
      assert.equal(
        (initialize.result as { capabilities: { tools: object } }).capabilities.tools !== undefined,
        true,
      );

      writeJsonLine(child.stdin, {
        jsonrpc: '2.0',
        method: 'notifications/initialized',
      });

      writeJsonLine(child.stdin, {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
      });
      const toolsList = await readJsonLine(child.stdout);
      const tools = (toolsList.result as {
        tools: Array<{ name: string; description?: string }>;
      }).tools;
      assert.deepEqual(
        tools.map((tool) => tool.name).sort(),
        [
          'opl_execute_request',
          'opl_project_progress',
          'opl_session',
          'opl_task_status',
          'opl_workspace',
        ],
      );
      assert.match(
        tools.find((tool) => tool.name === 'opl_project_progress')?.description ?? '',
        /哪篇论文|讲什么故事/,
      );
      assert.match(
        tools.find((tool) => tool.name === 'opl_task_status')?.description ?? '',
        /任务|进度|阶段/,
      );

      writeJsonLine(child.stdin, {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
          name: 'opl_workspace',
          arguments: {
            action: 'activate',
            project_id: 'medautoscience',
            workspace_path: activatedWorkspacePath,
          },
        },
      });
      const activateCall = await readJsonLine(child.stdout);
      const activateContent = (activateCall.result as {
        content: Array<{ type: string; text: string }>;
      }).content;
      assert.equal(activateContent[0].type, 'text');
      assert.match(activateContent[0].text, /已切换工作区/);
      assert.match(activateContent[0].text, /medautoscience/);

      writeJsonLine(child.stdin, {
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: {
          name: 'opl_project_progress',
          arguments: {},
        },
      });
      const progressCall = await readJsonLine(child.stdout);
      const progressContent = (progressCall.result as {
        content: Array<{ type: string; text: string }>;
      }).content;
      assert.equal(progressContent[0].type, 'text');
      assert.match(progressContent[0].text, /当前工作区：opl-activated-workspace/);
      assert.match(progressContent[0].text, /当前论文：004-invasive-architecture/);
      assert.match(progressContent[0].text, /论文题目：NF-PitNET invasive phenotype architecture/);
      assert.match(progressContent[0].text, /论文主线：当前主线是首术 NF-PitNET 的侵袭表型 architecture/);
      assert.match(progressContent[0].text, /当前阶段：论文主体内容已经完成，当前进入投稿打包收口。/);
      assert.match(progressContent[0].text, /系统下一步：优先核对 submission package 与 studies 目录中的交付面是否一致。/);
      assert.match(progressContent[0].text, /当前进度：004 论文当前仍在推进证据补强/);
      assert.match(progressContent[0].text, /最近活动：2m ago/);
      assert.match(progressContent[0].text, /当前卡点：submission package 仍需补更多主图后再建议用户审阅/);
      assert.match(progressContent[0].text, /查看位置：/);
      assert.doesNotMatch(progressContent[0].text, /entry_parity_status/);
      assert.doesNotMatch(progressContent[0].text, /continue bundle stage/i);
      assert.doesNotMatch(progressContent[0].text, /current_stage_summary|next_system_action|contract/i);

      writeJsonLine(child.stdin, {
        jsonrpc: '2.0',
        id: 5,
        method: 'tools/call',
        params: {
          name: 'opl_workspace',
          arguments: {},
        },
      });
      const projectsCall = await readJsonLine(child.stdout);
      const projectsContent = (projectsCall.result as {
        content: Array<{ type: string; text: string }>;
      }).content;
      assert.equal(projectsContent[0].type, 'text');
      assert.match(projectsContent[0].text, /medautoscience/);

      writeJsonLine(child.stdin, {
        jsonrpc: '2.0',
        id: 6,
        method: 'tools/call',
        params: {
          name: 'opl_session',
          arguments: {
            action: 'list',
            limit: 3,
          },
        },
      });
      const sessionsCall = await readJsonLine(child.stdout);
      const sessionsContent = (sessionsCall.result as {
        content: Array<{ type: string; text: string }>;
      }).content;
      assert.equal(sessionsContent[0].type, 'text');
      assert.match(sessionsContent[0].text, /最近会话：1 条/);
      assert.match(sessionsContent[0].text, /sess-frontdesk-001/);

      writeJsonLine(child.stdin, {
        jsonrpc: '2.0',
        id: 7,
        method: 'tools/call',
        params: {
          name: 'opl_session',
          arguments: {
            action: 'logs',
            lines: 10,
          },
        },
      });
      const runtimeLogsCall = await readJsonLine(child.stdout);
      const runtimeLogsContent = (runtimeLogsCall.result as {
        content: Array<{ type: string; text: string }>;
      }).content;
      assert.equal(runtimeLogsContent[0].type, 'text');
      assert.match(runtimeLogsContent[0].text, /runtime heartbeat ok/);

      writeJsonLine(child.stdin, {
        jsonrpc: '2.0',
        id: 8,
        method: 'tools/call',
        params: {
          name: 'opl_task_status',
          arguments: {
            task_id: 'task-frontdesk-001',
          },
        },
      });
      const toolCall = await readJsonLine(child.stdout);
      const content = (toolCall.result as {
        content: Array<{ type: string; text: string }>;
      }).content;
      assert.equal(content[0].type, 'text');
      assert.match(content[0].text, /任务状态：运行中/);
      assert.match(content[0].text, /当前阶段：撰写中/);
      assert.doesNotMatch(content[0].text, /任务状态：running/);
      assert.doesNotMatch(content[0].text, /当前阶段：writing/);
      assert.equal(fakeApi.requests.some((request) =>
        request.path === '/api/opl/workspaces/activate'
        && request.body?.project_id === 'medautoscience'
        && request.body?.workspace_path === activatedWorkspacePath
      ), true);
      assert.equal(fakeApi.requests.some((request) =>
        request.path === '/api/opl/sessions'
        && request.query.limit === '3'
      ), true);
      assert.equal(fakeApi.requests.some((request) =>
        request.path === '/api/opl/sessions/logs'
        && request.query.lines === '10'
      ), true);
      assert.equal(fakeApi.requests.some((request) =>
        request.path === '/api/opl/progress'
        && request.query.task_id === 'task-frontdesk-001'
      ), true);
    } finally {
      child.kill('SIGTERM');
      await once(child, 'exit');
    }
  } finally {
    await stopHttpServer(fakeApi.server);
  }
});

test('mcp-stdio defaults to the current shell protocol version when the client does not negotiate one', async () => {
  const fakeApi = await startFakeOplApiServer();

  try {
    const child = spawn(
      process.execPath,
      [
        '--experimental-strip-types',
        cliPath,
        'mcp-stdio',
        '--api-base-url',
        fakeApi.apiBaseUrl,
      ],
      {
        cwd: repoRoot,
        env: {
          ...process.env,
          NODE_NO_WARNINGS: '1',
        },
        stdio: ['pipe', 'pipe', 'pipe'],
      },
    );

    try {
      writeJsonLine(child.stdin, {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          capabilities: {},
          clientInfo: {
            name: 'opl-test-client',
            version: '0.0.0-test',
          },
        },
      });
      const initialize = await readJsonLine(child.stdout);
      assert.equal((initialize.result as { protocolVersion: string }).protocolVersion, '2025-03-26');
    } finally {
      child.kill('SIGTERM');
      await once(child, 'exit');
    }
  } finally {
    await stopHttpServer(fakeApi.server);
  }
});

test('help keeps the repo-tracked GUI lane on web adapter and service surfaces', () => {
  const output = runCli(['help']);
  const web = output.help.commands.find((entry: { command: string }) => entry.command === 'web');

  assert.ok(web);
  assert.match(web.summary, /service/i);
  assert.match(web.summary, /GUI/i);
  assert.ok(
    output.help.commands.some((entry: { command: string }) => entry.command === 'service install'),
  );
  assert.ok(
    output.help.commands.some((entry: { command: string }) => entry.command === 'web bundle'),
  );
  assert.ok(
    output.help.commands.some((entry: { command: string }) => entry.command === 'web package'),
  );
  assert.equal(
    output.help.commands.some((entry: { command: string }) => entry.command === 'frontdesk bootstrap'),
    false,
  );
  assert.equal(
    output.help.commands.some((entry: { command: string }) => entry.command === 'frontdesk manifest'),
    false,
  );
});

test('system exposes user-facing engine and managed-path status from OPL defaults', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-environment-home-'));
  const codexConfigFixture = createCodexConfigFixture({
    model: 'gpt-5.4-opl',
    reasoningEffort: 'high',
    baseUrl: 'https://codex-opl.example.test/v1',
    apiKey: 'codex-opl-key',
  });
  const hermesFixture = createFakeHermesFixture(`
if [[ "$1" == "version" ]]; then
  echo "Hermes 1.2.3"
  exit 0
fi
if [[ "$1" == "gateway" && "$2" == "status" ]]; then
  echo "Gateway service is loaded"
  exit 0
fi
echo "Unsupported hermes fixture command: $*" >&2
exit 1
`);
  const codexFixture = createFakeCodexFixture(`
if [[ "$1" == "--version" ]]; then
  echo "codex 0.42.0"
  exit 0
fi
echo "Unsupported codex fixture command: $*" >&2
exit 1
`);

  try {
    const output = runCli(
      ['system'],
      {
        HOME: homeRoot,
        CODEX_HOME: codexConfigFixture.codexHome,
        OPL_HERMES_BIN: hermesFixture.hermesPath,
        PATH: `${codexFixture.fixtureRoot}:${hermesFixture.fixtureRoot}:${process.env.PATH ?? ''}`,
      },
    ) as {
      system: {
        surface_id: string;
        overall_status: string;
        core_engines: {
          codex: {
            installed: boolean;
            version: string | null;
            config_path: string | null;
            default_model: string | null;
            default_reasoning_effort: string | null;
            provider_base_url: string | null;
            health_status: string;
          };
          hermes: {
            installed: boolean;
            version: string | null;
            gateway_loaded: boolean;
            health_status: string;
          };
        };
        local_service: {
          service_installed: boolean;
          service_loaded: boolean;
          service_health: string;
          gui_shell_strategy: string;
        };
        managed_paths: {
          state_dir: string;
          modules_root: string;
          runtime_modes_file: string;
          workspace_registry_file: string;
        };
      };
    };

    assert.equal(output.system.surface_id, 'opl_system');
    assert.equal(output.system.overall_status, 'ready');
    assert.equal(output.system.core_engines.codex.installed, true);
    assert.equal(output.system.core_engines.codex.version, 'codex 0.42.0');
    assert.equal(
      output.system.core_engines.codex.config_path,
      codexConfigFixture.configPath,
    );
    assert.equal(output.system.core_engines.codex.default_model, 'gpt-5.4-opl');
    assert.equal(output.system.core_engines.codex.default_reasoning_effort, 'high');
    assert.equal(
      output.system.core_engines.codex.provider_base_url,
      'https://codex-opl.example.test/v1',
    );
    assert.equal(output.system.core_engines.codex.health_status, 'ready');
    assert.equal(output.system.core_engines.hermes.installed, true);
    assert.equal(output.system.core_engines.hermes.version, 'Hermes 1.2.3');
    assert.equal(output.system.core_engines.hermes.gateway_loaded, true);
    assert.equal(output.system.core_engines.hermes.health_status, 'ready');
    assert.equal(output.system.local_service.service_installed, false);
    assert.equal(output.system.local_service.service_loaded, false);
    assert.equal(output.system.local_service.service_health, 'not_installed');
    assert.equal(output.system.local_service.gui_shell_strategy, 'external_overlay');
    assert.match(
      output.system.managed_paths.state_dir,
      /Library\/Application Support\/OPL\/frontdesk$/,
    );
    assert.match(
      output.system.managed_paths.modules_root,
      /Library\/Application Support\/OPL\/frontdesk\/modules$/,
    );
    assert.match(
      output.system.managed_paths.runtime_modes_file,
      /runtime-modes\.json$/,
    );
    assert.match(
      output.system.managed_paths.workspace_registry_file,
      /workspace-registry\.json$/,
    );
  } finally {
    fs.rmSync(codexConfigFixture.codexHome, { recursive: true, force: true });
    fs.rmSync(codexFixture.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(hermesFixture.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});

test('system initialize aggregates environment modules settings workspace and system surfaces', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-initialize-home-'));
  const stateDir = path.join(homeRoot, 'opl-state');
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-workspace-root-'));
  const codexConfigFixture = createCodexConfigFixture({
    model: 'gpt-5.4-opl',
    reasoningEffort: 'high',
    baseUrl: 'https://codex-opl.example.test/v1',
    apiKey: 'codex-opl-key',
  });
  const hermesFixture = createFakeHermesFixture(`
if [[ "$1" == "version" ]]; then
  echo "Hermes 1.2.3"
  exit 0
fi
if [[ "$1" == "gateway" && "$2" == "status" ]]; then
  echo "Gateway service is loaded"
  exit 0
fi
echo "Unsupported hermes fixture command: $*" >&2
exit 1
`);
  const codexFixture = createFakeCodexFixture(`
if [[ "$1" == "--version" ]]; then
  echo "codex 0.42.0"
  exit 0
fi
echo "Unsupported codex fixture command: $*" >&2
exit 1
`);

  try {
    const output = runCli(
      ['system', 'initialize'],
      {
        HOME: homeRoot,
        CODEX_HOME: codexConfigFixture.codexHome,
        OPL_HERMES_BIN: hermesFixture.hermesPath,
        OPL_FRONTDESK_STATE_DIR: stateDir,
        OPL_WORKSPACE_ROOT: workspaceRoot,
        PATH: `${codexFixture.fixtureRoot}:${hermesFixture.fixtureRoot}:${process.env.PATH ?? ''}`,
      },
    ) as {
      system_initialize: {
        surface_id: string;
        overall_state: string;
        core_engines: {
          codex: { installed: boolean };
          hermes: { installed: boolean };
        };
        checklist: Array<{
          item_id: string;
          required: boolean;
          blocking: boolean;
        }>;
        domain_modules: {
          summary: {
            installed_modules_count: number;
            total_modules_count: number;
          };
          modules_root: string;
          notes: string[];
          modules: Array<{ module_id: string }>;
        };
        settings: {
          interaction_mode: string;
          execution_mode: string;
        };
        workspace_root: {
          selected_path: string | null;
          health_status: string;
        };
        system: {
          update_channel: string;
          local_service: {
            service_health: string;
          };
        };
        endpoints: {
          system_initialize: string;
          system: string;
          modules: string;
          settings: string;
          engine_action: string;
          workspace_root: string;
          system_action: string;
        };
        recommended_next_action: {
          action_id: string;
          label: string;
          method: string;
          request_fields: string[];
        };
      };
    };

    assert.equal(output.system_initialize.surface_id, 'opl_system_initialize');
    assert.match(output.system_initialize.overall_state, /ready|attention_needed/);
    assert.equal(output.system_initialize.core_engines.codex.installed, true);
    assert.equal(output.system_initialize.core_engines.hermes.installed, true);
    assert.equal(
      output.system_initialize.checklist.some((entry) => entry.item_id === 'workspace_root' && entry.required),
      true,
    );
    assert.equal(
      output.system_initialize.checklist.some((entry) => entry.item_id === 'codex' && entry.required),
      true,
    );
    assert.equal(
      output.system_initialize.checklist.some((entry) => entry.item_id === 'domain_modules' && !entry.required),
      true,
    );
    assert.equal(output.system_initialize.domain_modules.summary.total_modules_count >= 4, true);
    assert.equal(
      output.system_initialize.domain_modules.summary.total_modules_count,
      output.system_initialize.domain_modules.modules.length,
    );
    assert.equal(output.system_initialize.domain_modules.summary.installed_modules_count >= 0, true);
    assert.equal(output.system_initialize.domain_modules.modules.length >= 4, true);
    assert.equal(output.system_initialize.settings.interaction_mode, 'codex');
    assert.equal(output.system_initialize.settings.execution_mode, 'codex');
    assert.equal(output.system_initialize.workspace_root.selected_path, workspaceRoot);
    assert.equal(output.system_initialize.workspace_root.health_status, 'ready');
    assert.equal(output.system_initialize.system.update_channel, 'stable');
    assert.equal(output.system_initialize.system.local_service.service_health, 'not_installed');
    assert.match(output.system_initialize.endpoints.system_initialize, /\/api\/opl\/system\/initialize$/);
    assert.match(output.system_initialize.endpoints.system, /\/api\/opl\/system$/);
    assert.match(output.system_initialize.endpoints.modules, /\/api\/opl\/modules$/);
    assert.match(output.system_initialize.endpoints.settings, /\/api\/opl\/system\/settings$/);
    assert.match(output.system_initialize.endpoints.engine_action, /\/api\/opl\/engines\/actions$/);
    assert.match(output.system_initialize.endpoints.workspace_root, /\/api\/opl\/workspaces\/root$/);
    assert.match(output.system_initialize.endpoints.system_action, /\/api\/opl\/system\/actions$/);
    assert.ok(output.system_initialize.recommended_next_action.action_id.length > 0);
    assert.ok(output.system_initialize.recommended_next_action.label.length > 0);
    assert.equal(output.system_initialize.recommended_next_action.method, 'GET');
    assert.deepEqual(output.system_initialize.recommended_next_action.request_fields, []);
  } finally {
    fs.rmSync(codexConfigFixture.codexHome, { recursive: true, force: true });
    fs.rmSync(codexFixture.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(hermesFixture.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(homeRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test('system initialize exposes first-run blocker metadata and actionable payload hints', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-initialize-first-run-home-'));
  const stateDir = path.join(homeRoot, 'opl-state');

  try {
    const output = runCli(
      ['system', 'initialize'],
      {
        HOME: homeRoot,
        OPL_FRONTDESK_STATE_DIR: stateDir,
        PATH: '/usr/bin:/bin',
      },
    ) as {
      system_initialize: {
        overall_state: string;
        checklist: Array<{
          item_id: string;
          required: boolean;
          blocking: boolean;
          action: {
            action_id: string;
            method: string;
            request_fields: string[];
          } | null;
        }>;
        recommended_next_action: {
          action_id: string;
          method: string;
          request_fields: string[];
        };
        workspace_root: {
          selected_path: string | null;
          health_status: string;
        };
      };
    };

    assert.equal(output.system_initialize.overall_state, 'attention_needed');
    assert.equal(output.system_initialize.workspace_root.selected_path, null);
    assert.equal(output.system_initialize.workspace_root.health_status, 'missing');
    assert.equal(output.system_initialize.recommended_next_action.action_id, 'set_workspace_root');
    assert.equal(output.system_initialize.recommended_next_action.method, 'POST');
    assert.deepEqual(output.system_initialize.recommended_next_action.request_fields, ['path']);

    const workspaceRootItem = output.system_initialize.checklist.find((entry) => entry.item_id === 'workspace_root');
    const codexItem = output.system_initialize.checklist.find((entry) => entry.item_id === 'codex');

    assert.ok(workspaceRootItem);
    assert.ok(codexItem);
    assert.equal(workspaceRootItem.required, true);
    assert.equal(workspaceRootItem.blocking, true);
    assert.equal(workspaceRootItem.action?.action_id, 'set_workspace_root');
    assert.equal(workspaceRootItem.action?.method, 'POST');
    assert.deepEqual(workspaceRootItem.action?.request_fields, ['path']);
    assert.equal(codexItem.required, true);
    assert.equal(codexItem.blocking, true);
    assert.equal(codexItem.action?.action_id, 'install_or_configure_codex');
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});

test('engine action executes env-overridden install commands and returns a structured action surface', () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-engine-action-'));
  const markerPath = path.join(fixtureRoot, 'codex-install.marker');
  const installScript = path.join(fixtureRoot, 'install-codex.sh');

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
    assert.equal('frontdesk_environment' in output.engine_action, false);
    assert.equal(output.engine_action.system.surface_id, 'opl_system');
    assert.equal(output.engine_action.system.core_engines.codex.installed, true);
    assert.equal(fs.existsSync(markerPath), true);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('workspace root set persists the selected root and workspace root reads it back', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-workspace-root-home-'));
  const stateDir = path.join(homeRoot, 'opl-state');
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-workspace-root-selected-'));

  try {
    const setOutput = runCli(
      ['workspace', 'root', 'set', '--path', workspaceRoot],
      {
        HOME: homeRoot,
        OPL_FRONTDESK_STATE_DIR: stateDir,
      },
    ) as {
      workspace_root: {
        selected_path: string | null;
        health_status: string;
      };
    };

    assert.equal(setOutput.workspace_root.selected_path, workspaceRoot);
    assert.equal(setOutput.workspace_root.health_status, 'ready');

    const readOutput = runCli(
      ['workspace', 'root'],
      {
        HOME: homeRoot,
        OPL_FRONTDESK_STATE_DIR: stateDir,
      },
    ) as {
      workspace_root: {
        selected_path: string | null;
        health_status: string;
      };
    };

    assert.equal(readOutput.workspace_root.selected_path, workspaceRoot);
    assert.equal(readOutput.workspace_root.health_status, 'ready');
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test('system update-channel reports and persists the selected release channel', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-update-channel-home-'));
  const stateDir = path.join(homeRoot, 'opl-state');

  try {
    const initial = runCli(
      ['system', 'update-channel'],
      {
        HOME: homeRoot,
        OPL_FRONTDESK_STATE_DIR: stateDir,
      },
    ) as {
      system_action: {
        action: string;
        update_channel: string;
        status: string;
      };
    };
    assert.equal(initial.system_action.action, 'update_channel');
    assert.equal(initial.system_action.update_channel, 'stable');
    assert.equal(initial.system_action.status, 'ready');

    const updated = runCli(
      ['system', 'update-channel', '--channel', 'preview'],
      {
        HOME: homeRoot,
        OPL_FRONTDESK_STATE_DIR: stateDir,
      },
    ) as {
      system_action: {
        action: string;
        update_channel: string;
        status: string;
      };
    };
    assert.equal(updated.system_action.action, 'update_channel');
    assert.equal(updated.system_action.update_channel, 'preview');
    assert.equal(updated.system_action.status, 'completed');
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});
test('modules and module actions manage OPL-owned domain module installs and updates', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-modules-home-'));
  const modulesRoot = path.join(homeRoot, 'managed-modules');
  const medAutoScienceRemote = createGitModuleRemoteFixture('med-autoscience');
  const env = {
    HOME: homeRoot,
    OPL_MODULES_ROOT: modulesRoot,
    OPL_MODULE_REPO_URL_MEDAUTOSCIENCE: medAutoScienceRemote.remoteRoot,
  };

  try {
    const initial = runCli(['modules'], env) as {
      modules: {
        summary: {
          total_modules_count: number;
          installed_modules_count: number;
        };
        items: Array<{
          module_id: string;
          installed: boolean;
          install_origin: string;
          available_actions: string[];
        }>;
      };
    };
    assert.equal(initial.modules.summary.total_modules_count >= 4, true);
    const initialMas = initial.modules.items.find((entry) => entry.module_id === 'medautoscience');
    assert.ok(initialMas);
    assert.equal(initialMas.installed, false);
    assert.equal(initialMas.install_origin, 'missing');
    assert.equal(initialMas.available_actions.includes('install'), true);

    const install = runCli(
      ['module', 'install', '--module', 'medautoscience'],
      env,
    ) as {
      module_action: {
        action: string;
        status: string;
        module: {
          module_id: string;
          installed: boolean;
          install_origin: string;
          checkout_path: string;
          git: {
            head_sha: string | null;
          };
        };
      };
    };
    assert.equal(install.module_action.action, 'install');
    assert.equal(install.module_action.status, 'completed');
    assert.equal(install.module_action.module.module_id, 'medautoscience');
    assert.equal(install.module_action.module.installed, true);
    assert.equal(install.module_action.module.install_origin, 'managed_root');
    assert.equal(
      install.module_action.module.git.head_sha,
      medAutoScienceRemote.getHeadSha(),
    );
    assert.equal(
      fs.existsSync(path.join(install.module_action.module.checkout_path, 'README.md')),
      true,
    );

    const nextSha = medAutoScienceRemote.advance(
      'CHANGELOG.md',
      '# Changelog\n\n- Added module update test\n',
      'Advance module remote',
    );
    const update = runCli(
      ['module', 'update', '--module', 'medautoscience'],
      env,
    ) as {
      module_action: {
        action: string;
        status: string;
        module: {
          git: {
            head_sha: string | null;
          };
        };
      };
    };
    assert.equal(update.module_action.action, 'update');
    assert.equal(update.module_action.status, 'completed');
    assert.equal(update.module_action.module.git.head_sha, nextSha);

    const remove = runCli(
      ['module', 'remove', '--module', 'medautoscience'],
      env,
    ) as {
      module_action: {
        action: string;
        status: string;
        module: {
          installed: boolean;
          checkout_path: string;
        };
      };
    };
    assert.equal(remove.module_action.action, 'remove');
    assert.equal(remove.module_action.status, 'completed');
    assert.equal(remove.module_action.module.installed, false);
    assert.equal(fs.existsSync(remove.module_action.module.checkout_path), false);
  } finally {
    fs.rmSync(medAutoScienceRemote.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});

test('help keeps web adapter and service commands as the default GUI lane', () => {
  const output = runCli(['help']);
  const web = output.help.commands.find((entry: { command: string }) => entry.command === 'web');

  assert.ok(web);
  assert.match(web.summary, /service/i);
  assert.match(web.summary, /GUI/i);
  assert.ok(
    output.help.commands.some((entry: { command: string }) => entry.command === 'service install'),
  );
  assert.ok(
    output.help.commands.some((entry: { command: string }) => entry.command === 'web bundle'),
  );
  assert.ok(
    output.help.commands.some((entry: { command: string }) => entry.command === 'web package'),
  );
  assert.equal(
    output.help.commands.some((entry: { command: string }) => entry.command === 'frontdesk bootstrap'),
    false,
  );
  assert.equal(
    output.help.commands.some((entry: { command: string }) => entry.command === 'frontdesk manifest'),
    false,
  );
});

test('workspace registry commands bind activate and archive project workspaces with direct-entry locators', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-state-fixture-'));

  try {
    const bindOutput = runCli([
      'workspace',
      'bind',
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

    const catalogOutput = runCli(['workspace', 'list'], {
      OPL_FRONTDESK_STATE_DIR: stateRoot,
    });
    assert.equal(catalogOutput.workspace_catalog.projects.length, 4);
    assert.equal(catalogOutput.workspace_catalog.projects[3].project_id, 'redcube');
    assert.equal(catalogOutput.workspace_catalog.projects[3].active_binding.workspace_path, repoRoot);
    assert.equal(catalogOutput.workspace_catalog.projects[3].bindings_count.total, 1);
    assert.equal(catalogOutput.workspace_catalog.projects[3].bindings_count.direct_entry_ready, 1);
    assert.equal(catalogOutput.workspace_catalog.projects[3].bindings_count.manifest_ready, 1);
    assert.equal(catalogOutput.workspace_catalog.projects[3].last_updated_at, bindOutput.workspace_catalog.binding.updated_at);
    assert.deepEqual(catalogOutput.workspace_catalog.projects[3].available_actions, ['bind', 'activate', 'archive', 'launch']);
    assert.equal(
      catalogOutput.workspace_catalog.projects[3].binding_contract.surface_id,
      'opl_project_workspace_binding_contract',
    );
    assert.deepEqual(
      catalogOutput.workspace_catalog.projects[3].binding_contract.required_locator_fields,
      [],
    );
    assert.deepEqual(
      catalogOutput.workspace_catalog.projects[3].binding_contract.optional_locator_fields,
      ['workspace_root'],
    );
    assert.equal(
      catalogOutput.workspace_catalog.projects[3].binding_contract.derived_entry_command_template,
      'redcube product frontdesk --workspace-root <workspace_root>',
    );
    assert.equal(
      catalogOutput.workspace_catalog.projects[3].binding_contract.derived_manifest_command_template,
      'redcube product manifest --workspace-root <workspace_root>',
    );
    assert.equal(catalogOutput.workspace_catalog.summary.active_projects_count, 1);
    assert.equal(catalogOutput.workspace_catalog.summary.direct_entry_ready_projects_count, 1);
    assert.equal(catalogOutput.workspace_catalog.summary.manifest_ready_projects_count, 1);
    assert.equal(catalogOutput.workspace_catalog.summary.last_binding_change_at, bindOutput.workspace_catalog.binding.updated_at);

    const archiveOutput = runCli([
      'workspace',
      'archive',
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

test('domain manifests resolves real family manifest fixtures while workspace list stays registry-only', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-domain-manifest-state-'));
  const fixtures = loadFamilyManifestFixtures();
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const env = {
    OPL_FRONTDESK_STATE_DIR: stateRoot,
    OPL_CONTRACTS_DIR: fixtureContractsRoot,
  };

  try {
    runCli([
      'workspace',
      'bind',
      '--project',
      'medautogrant',
      '--path',
      repoRoot,
      '--manifest-command',
      buildManifestCommand(fixtures.medautogrant),
    ], env);
    runCli([
      'workspace',
      'bind',
      '--project',
      'medautoscience',
      '--path',
      repoRoot,
      '--manifest-command',
      buildManifestCommand(fixtures.medautoscience),
    ], env);
    runCli([
      'workspace',
      'bind',
      '--project',
      'redcube',
      '--path',
      repoRoot,
      '--entry-command',
      'redcube-ai frontdesk',
      '--manifest-command',
      buildManifestCommand(fixtures.redcube),
      '--entry-url',
      'http://127.0.0.1:3310/redcube',
    ], env);

    const catalogOutput = runCli(['workspace', 'list'], env);
    const magCatalog = catalogOutput.workspace_catalog.projects.find((entry: { project_id: string }) => entry.project_id === 'medautogrant');
    const masCatalog = catalogOutput.workspace_catalog.projects.find((entry: { project_id: string }) => entry.project_id === 'medautoscience');
    const redcubeCatalog = catalogOutput.workspace_catalog.projects.find((entry: { project_id: string }) => entry.project_id === 'redcube');
    assert.equal(magCatalog?.active_binding?.direct_entry?.manifest_command, buildManifestCommand(fixtures.medautogrant));
    assert.equal(masCatalog?.active_binding?.direct_entry?.manifest_command, buildManifestCommand(fixtures.medautoscience));
    assert.equal(redcubeCatalog?.active_binding?.direct_entry?.manifest_command, buildManifestCommand(fixtures.redcube));

    const manifestOutput = runCli(['domain', 'manifests'], env);
    assert.equal(manifestOutput.domain_manifests.summary.total_projects_count, 3);
    assert.equal(manifestOutput.domain_manifests.summary.manifest_configured_count, 3);
    assert.equal(manifestOutput.domain_manifests.summary.resolved_count, 3);
    assert.equal(manifestOutput.domain_manifests.summary.failed_count, 0);
    assert.ok(
      manifestOutput.domain_manifests.notes.some((note: string) =>
        note.includes('opl workspace list') && note.includes('opl domain manifests'),
      ),
    );

    const medautogrant = manifestOutput.domain_manifests.projects.find((entry: { project_id: string }) => entry.project_id === 'medautogrant');
    const redcube = manifestOutput.domain_manifests.projects.find((entry: { project_id: string }) => entry.project_id === 'redcube');
    const medautoscience = manifestOutput.domain_manifests.projects.find((entry: { project_id: string }) => entry.project_id === 'medautoscience');

    assert.equal(medautogrant.status, 'resolved');
    assert.equal(medautogrant.manifest.recommended_shell, 'grant_user_loop');
    assert.equal(medautogrant.manifest.frontdesk_surface.shell_key, 'product_frontdesk');
    assert.equal(medautogrant.manifest.operator_loop_surface.shell_key, 'grant_user_loop');
    assert.equal(medautogrant.manifest.product_entry_shell.grant_cockpit.surface_kind, 'grant_cockpit');
    assert.equal(medautogrant.manifest.shared_handoff.opl_handoff_builder.entry_mode, 'opl-handoff');
    assert.equal(medautogrant.manifest.family_orchestration.action_graph_ref.ref, '/family_orchestration/action_graph');
    assertMagActionGraph(medautogrant.manifest.family_orchestration.action_graph);
    assert.equal(medautogrant.manifest.family_orchestration.human_gates[0].gate_id, 'mag_route_gate_revision');
    assert.equal(medautogrant.manifest.family_orchestration.resume_contract.surface_kind, 'grant_user_loop');
    assert.equal(medautogrant.manifest.family_orchestration.event_envelope_surface.ref, '/product_entry_manifest/recommended_command');
    assert.equal(medautogrant.manifest.product_entry_readiness.verdict, 'agent_assisted_ready_not_product_grade');
    assert.equal(medautogrant.manifest.product_entry_readiness.usable_now, true);
    assert.equal(medautogrant.manifest.product_entry_readiness.recommended_loop_command, 'uv run python -m med_autogrant grant-user-loop --input /fixtures/med-autogrant/nsfc_workspace_p2c_critique.json --task-intent <describe-task-intent> --format json');
    assert.equal(medautogrant.manifest.grant_authoring_readiness.surface_kind, 'grant_authoring_readiness');
    assert.equal(medautogrant.manifest.grant_authoring_readiness.workflow_coverage[0].step_id, 'accumulation_direction_screening');
    assert.equal(medautogrant.manifest.product_entry_preflight.surface_kind, 'product_entry_preflight');
    assert.equal(medautogrant.manifest.product_entry_preflight.ready_to_try_now, true);
    assert.equal(medautogrant.manifest.runtime_inventory.surface_kind, 'runtime_inventory');
    assert.equal(medautogrant.manifest.runtime_inventory.runtime_owner, 'upstream_hermes_agent');
    assert.equal(medautogrant.manifest.runtime_inventory.availability, 'ready');
    assert.equal(medautogrant.manifest.task_lifecycle.surface_kind, 'task_lifecycle');
    assert.equal(medautogrant.manifest.task_lifecycle.resume_surface.surface_kind, 'grant_user_loop');
    assert.equal(medautogrant.manifest.task_lifecycle.checkpoint_summary.status, 'critique');
    assert.equal(medautogrant.manifest.skill_catalog.surface_kind, 'skill_catalog');
    assert.equal(medautogrant.manifest.skill_catalog.skills.length, 2);
    assert.equal(medautogrant.manifest.skill_catalog.supported_commands[1], 'grant-user-loop');
    assert.equal(medautogrant.manifest.automation.surface_kind, 'automation');
    assert.equal(medautogrant.manifest.automation.automations[0].target_surface_kind, 'grant_user_loop');
    assert.equal(
      medautogrant.manifest.product_entry_preflight.recommended_check_command,
      'uv run python -m med_autogrant validate-workspace --input /fixtures/med-autogrant/nsfc_workspace_p2c_critique.json --format json',
    );
    assert.equal(medautogrant.manifest.product_entry_start.surface_kind, 'product_entry_start');
    assert.equal(medautogrant.manifest.product_entry_start.recommended_mode_id, 'open_frontdesk');
    assert.equal(medautogrant.manifest.product_entry_start.modes[1].mode_id, 'continue_grant_loop');

    assert.equal(medautoscience.status, 'resolved');
    assert.equal(medautoscience.manifest.recommended_shell, 'workspace_cockpit');
    assert.equal(medautoscience.manifest.frontdesk_surface.shell_key, 'product_frontdesk');
    assert.equal(medautoscience.manifest.operator_loop_actions.submit_task.requires[0], 'study_id');
    assert.match(medautoscience.manifest.product_entry_shell.launch_study.command, /launch-study/);
    assert.equal(medautoscience.manifest.shared_handoff.direct_entry_builder.entry_mode, 'direct');
    assert.equal(
      medautoscience.manifest.family_orchestration.action_graph_ref.ref,
      '/family_orchestration/action_graph',
    );
    assertMasActionGraph(medautoscience.manifest.family_orchestration.action_graph);
    assert.equal(medautoscience.manifest.family_orchestration.human_gates[0].gate_id, 'study_physician_decision_gate');
    assert.equal(medautoscience.manifest.family_orchestration.human_gates[1].gate_id, 'publication_release_gate');
    assert.equal(medautoscience.manifest.family_orchestration.resume_contract.surface_kind, 'launch_study');
    assert.equal(
      medautoscience.manifest.family_orchestration.event_envelope_surface.ref,
      'studies/<study_id>/artifacts/runtime_watch/latest.json',
    );
    assert.equal(medautoscience.manifest.product_entry_readiness.verdict, 'runtime_ready_not_standalone_product');
    assert.equal(medautoscience.manifest.product_entry_readiness.good_to_use_now, false);
    assert.equal(medautoscience.manifest.product_entry_readiness.recommended_start_surface, 'product_frontdesk');
    assert.equal(medautoscience.manifest.product_entry_guardrails.surface_kind, 'product_entry_guardrails');
    assert.equal(medautoscience.manifest.product_entry_guardrails.guardrail_classes[0].guardrail_id, 'workspace_supervision_gap');
    assert.equal(medautoscience.manifest.phase3_clearance_lane.surface_kind, 'phase3_host_clearance_lane');
    assert.equal(medautoscience.manifest.phase4_backend_deconstruction.surface_kind, 'phase4_backend_deconstruction_lane');
    assert.equal(medautoscience.manifest.phase5_platform_target.surface_kind, 'phase5_platform_target');
    assert.equal(medautoscience.manifest.product_entry_preflight.surface_kind, 'product_entry_preflight');
    assert.equal(medautoscience.manifest.product_entry_preflight.ready_to_try_now, true);
    assert.equal(medautoscience.manifest.runtime_inventory.surface_kind, 'runtime_inventory');
    assert.equal(medautoscience.manifest.runtime_inventory.executor_owner, 'med_deepscientist');
    assert.equal(medautoscience.manifest.task_lifecycle.surface_kind, 'task_lifecycle');
    assert.equal(medautoscience.manifest.task_lifecycle.resume_surface.surface_kind, 'launch_study');
    assert.equal(medautoscience.manifest.task_lifecycle.human_gate_ids.length, 2);
    assert.equal(medautoscience.manifest.skill_catalog.surface_kind, 'skill_catalog');
    assert.equal(medautoscience.manifest.skill_catalog.supported_commands[0], 'product-frontdesk');
    assert.equal(medautoscience.manifest.skill_catalog.skills[1].skill_id, 'medautoscience_workspace_cockpit');
    assert.equal(medautoscience.manifest.automation.surface_kind, 'automation');
    assert.equal(medautoscience.manifest.automation.automations[0].readiness_status, 'automation_ready');
    assert.equal(
      medautoscience.manifest.product_entry_preflight.recommended_check_command,
      'uv run python -m med_autoscience.cli doctor --profile /fixtures/med-autoscience/profile.local.toml',
    );
    assert.equal(medautoscience.manifest.product_entry_start.surface_kind, 'product_entry_start');
    assert.equal(medautoscience.manifest.product_entry_start.recommended_mode_id, 'open_frontdesk');
    assert.equal(medautoscience.manifest.product_entry_start.modes[2].mode_id, 'continue_study');

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
    assert.equal(redcube.manifest.product_entry_shell.session.surface_kind, 'product_entry_session');
    assert.equal(redcube.manifest.shared_handoff.opl_return_surface.surface_kind, 'product_entry');
    assert.equal(redcube.manifest.product_entry_overview.summary, redcube.manifest.product_entry_status.summary);
    assert.equal(redcube.manifest.product_entry_overview.progress_surface.command, 'redcube product session --entry-session-id <entry-session-id>');
    assert.equal(
      redcube.manifest.product_entry_overview.resume_surface.checkpoint_locator_field,
      'continuation_snapshot.latest_managed_run_id',
    );
    assert.equal(redcube.manifest.family_orchestration.action_graph_ref.ref, '/family_orchestration/action_graph');
    assertRedcubeActionGraph(redcube.manifest.family_orchestration.action_graph);
    assert.equal(redcube.manifest.family_orchestration.human_gates[0].gate_id, 'redcube_operator_review_gate');
    assert.equal(
      redcube.manifest.family_orchestration.resume_contract.session_locator_field,
      'entry_session_contract.entry_session_id',
    );
    assert.equal(redcube.manifest.runtime_inventory.surface_kind, 'runtime_inventory');
    assert.equal(redcube.manifest.runtime_inventory.health_status, 'healthy');
    assert.equal(redcube.manifest.task_lifecycle.surface_kind, 'task_lifecycle');
    assert.equal(redcube.manifest.task_lifecycle.resume_surface.surface_kind, 'product_entry_session');
    assert.equal(redcube.manifest.task_lifecycle.checkpoint_summary.status, 'operator_review_requested');
    assert.equal(redcube.manifest.skill_catalog.surface_kind, 'skill_catalog');
    assert.equal(redcube.manifest.skill_catalog.supported_commands[3], 'product-session');
    assert.equal(redcube.manifest.automation.surface_kind, 'automation');
    assert.equal(redcube.manifest.automation.automations[0].automation_id, 'redcube_autopilot_continuation');
    assert.equal(redcube.manifest.product_entry_readiness.verdict, 'service_surface_ready_not_managed_product');
    assert.equal(redcube.manifest.product_entry_readiness.usable_now, true);
    assert.equal(redcube.manifest.product_entry_readiness.recommended_start_command, 'redcube product frontdesk');
    assert.equal(redcube.manifest.product_entry_preflight.surface_kind, 'product_entry_preflight');
    assert.equal(redcube.manifest.product_entry_preflight.ready_to_try_now, true);
    assert.equal(
      redcube.manifest.product_entry_preflight.recommended_check_command,
      'redcube workspace doctor --workspace-root /fixtures/redcube/workspace',
    );
    assert.equal(redcube.manifest.product_entry_start.surface_kind, 'product_entry_start');
    assert.equal(redcube.manifest.product_entry_start.recommended_mode_id, 'open_frontdesk');
    assert.equal(redcube.manifest.product_entry_start.modes[2].mode_id, 'opl_bridge_handoff');
    assert.equal(redcube.manifest.product_entry_start.modes[3].mode_id, 'resume_session');

    const dashboardOutput = runCli(['status', 'dashboard', '--path', repoRoot, '--sessions-limit', '1'], env);
    assert.equal(dashboardOutput.dashboard.product_api.recommended_entry_surfaces_count, 3);
    assert.equal(
      dashboardOutput.dashboard.product_api.hosted_runtime_readiness.surface_kind,
      'opl_hosted_runtime_readiness',
    );
    assert.equal(
      dashboardOutput.dashboard.product_api.hosted_runtime_readiness.status,
      'pilot_ready_not_managed',
    );
    assert.equal(
      dashboardOutput.dashboard.product_api.domain_entry_parity.summary.total_projects_count,
      3,
    );
    assert.equal(
      dashboardOutput.dashboard.product_api.domain_entry_parity.summary.aligned_projects_count,
      1,
    );
    assert.equal(
      dashboardOutput.dashboard.product_api.domain_entry_parity.summary.partial_projects_count,
      2,
    );
    assert.equal(
      dashboardOutput.dashboard.product_api.domain_entry_parity.summary.blocked_projects_count,
      0,
    );
    assert.equal(
      dashboardOutput.dashboard.product_api.domain_entry_parity.summary.direct_entry_locator_ready_projects_count,
      1,
    );
    assert.equal(
      dashboardOutput.dashboard.product_api.domain_entry_parity.summary.domain_entry_contract_ready_count,
      3,
    );
    assert.equal(
      dashboardOutput.dashboard.product_api.domain_entry_parity.summary.gateway_interaction_contract_ready_count,
      3,
    );
    assert.equal(
      dashboardOutput.dashboard.product_api.domain_entry_parity.summary.ready_for_opl_start_count,
      3,
    );
    assert.equal(
      dashboardOutput.dashboard.product_api.domain_entry_parity.summary.ready_for_domain_handoff_count,
      3,
    );
    const grantParity = dashboardOutput.dashboard.product_api.domain_entry_parity.projects.find(
      (entry: { project_id: string }) => entry.project_id === 'medautogrant',
    );
    const scienceParity = dashboardOutput.dashboard.product_api.domain_entry_parity.projects.find(
      (entry: { project_id: string }) => entry.project_id === 'medautoscience',
    );
    const redcubeParity = dashboardOutput.dashboard.product_api.domain_entry_parity.projects.find(
      (entry: { project_id: string }) => entry.project_id === 'redcube',
    );
    assert.equal(grantParity.entry_parity_status, 'partial');
    assert.equal(grantParity.direct_entry_locator_status, 'missing');
    assert.equal(grantParity.ready_for_opl_start, true);
    assert.equal(grantParity.ready_for_domain_handoff, true);
    assert.equal(grantParity.product_entry_readiness_verdict, 'agent_assisted_ready_not_product_grade');
    assert.equal(grantParity.domain_entry_contract_status, 'ready');
    assert.equal(grantParity.gateway_interaction_contract_status, 'ready');
    assert.equal(scienceParity.entry_parity_status, 'partial');
    assert.equal(scienceParity.direct_entry_locator_status, 'missing');
    assert.equal(scienceParity.ready_for_opl_start, true);
    assert.equal(scienceParity.ready_for_domain_handoff, true);
    assert.equal(scienceParity.product_entry_readiness_verdict, 'runtime_ready_not_standalone_product');
    assert.equal(scienceParity.domain_entry_contract_status, 'ready');
    assert.equal(scienceParity.gateway_interaction_contract_status, 'ready');
    assert.equal(redcubeParity.entry_parity_status, 'aligned');
    assert.equal(redcubeParity.direct_entry_locator_status, 'ready');
    assert.equal(redcubeParity.ready_for_opl_start, true);
    assert.equal(redcubeParity.ready_for_domain_handoff, true);
    assert.equal(redcubeParity.product_entry_readiness_verdict, 'service_surface_ready_not_managed_product');
    assert.equal(redcubeParity.domain_entry_contract_status, 'ready');
    assert.equal(redcubeParity.gateway_interaction_contract_status, 'ready');
    assert.equal(redcubeParity.recommended_start_command, 'redcube product frontdesk');
    assert.equal(
      redcubeParity.recommended_check_command,
      'redcube workspace doctor --workspace-root /fixtures/redcube/workspace',
    );
    const grantEntry = dashboardOutput.dashboard.product_api.recommended_entry_surfaces.find(
      (entry: { project_id: string }) => entry.project_id === 'medautogrant',
    );
    const scienceEntry = dashboardOutput.dashboard.product_api.recommended_entry_surfaces.find(
      (entry: { project_id: string }) => entry.project_id === 'medautoscience',
    );
    const recommendedEntry = dashboardOutput.dashboard.product_api.recommended_entry_surfaces.find(
      (entry: { project_id: string }) => entry.project_id === 'redcube',
    );
    assert.equal(grantEntry.product_entry_shell.grant_user_loop.surface_kind, 'grant_user_loop');
    assert.equal(grantEntry.shared_handoff.direct_entry_builder.entry_mode, 'direct');
    assert.equal(grantEntry.family_action_graph_ref, '/family_orchestration/action_graph');
    assert.equal(grantEntry.family_action_graph_node_count, 2);
    assert.equal(grantEntry.family_action_graph_edge_count, 1);
    assert.equal(grantEntry.product_entry_readiness_verdict, 'agent_assisted_ready_not_product_grade');
    assert.equal(grantEntry.product_entry_readiness_usable_now, true);
    assert.equal(grantEntry.product_entry_readiness_start_command, 'uv run python -m med_autogrant product-frontdesk --input /fixtures/med-autogrant/nsfc_workspace_p2c_critique.json --format json');
    assert.equal(grantEntry.product_entry_preflight.ready_to_try_now, true);
    assert.equal(grantEntry.product_entry_start.surface_kind, 'product_entry_start');
    assert.equal(grantEntry.product_entry_start.recommended_mode_id, 'open_frontdesk');
    assert.equal(grantEntry.product_entry_start_resume_surface_kind, 'grant_user_loop');
    assert.equal(grantEntry.product_entry_start_mode_ids[2], 'build_direct_entry');
    assert.equal(grantEntry.active_binding_locator_status, 'missing');
    assert.equal(grantEntry.active_binding_locator.command, null);
    assert.equal(grantEntry.active_binding_locator.url, null);
    assert.equal(
      grantEntry.product_entry_preflight.recommended_check_command,
      'uv run python -m med_autogrant validate-workspace --input /fixtures/med-autogrant/nsfc_workspace_p2c_critique.json --format json',
    );
    assert.deepEqual(grantEntry.product_entry_preflight_blocking_check_ids, []);
    assert.equal(grantEntry.product_entry_preflight_checks_count, 4);
    assert.equal(grantEntry.product_entry_overview.summary, grantEntry.product_entry_status_summary);
    assert.equal(grantEntry.product_entry_overview.progress_surface.surface_kind, 'grant_progress');
    assert.equal(grantEntry.product_entry_overview.resume_surface.surface_kind, 'grant_user_loop');
    assert.equal(grantEntry.runtime_inventory.surface_kind, 'runtime_inventory');
    assert.equal(grantEntry.runtime_inventory_runtime_owner, 'upstream_hermes_agent');
    assert.equal(grantEntry.runtime_inventory_availability, 'ready');
    assert.equal(grantEntry.task_lifecycle.surface_kind, 'task_lifecycle');
    assert.equal(grantEntry.task_lifecycle_status, 'resumable');
    assert.equal(grantEntry.task_lifecycle_resume_surface_kind, 'grant_user_loop');
    assert.deepEqual(grantEntry.task_lifecycle_human_gate_ids, ['mag_route_gate_revision']);
    assert.equal(grantEntry.skill_catalog.surface_kind, 'skill_catalog');
    assert.equal(grantEntry.skill_catalog_skill_count, 2);
    assert.equal(grantEntry.skill_catalog_supported_commands[1], 'grant-user-loop');
    assert.equal(grantEntry.domain_entry_contract.entry_adapter, 'MedAutoGrantDomainEntry');
    assert.equal(grantEntry.gateway_interaction_contract.frontdoor_owner, 'opl_gateway_or_domain_gui');
    assert.equal(grantEntry.automation.surface_kind, 'automation');
    assert.equal(grantEntry.automation_count, 2);
    assert.equal(
      grantEntry.automation_readiness_summary,
      'Revision route follow-up 已 ready，submission-ready export 继续保持 tracked follow-on。',
    );
    assert.equal(scienceEntry.product_entry_shell.workspace_cockpit.purpose.includes('workspace'), true);
    assert.equal(scienceEntry.shared_handoff.opl_handoff_builder.entry_mode, 'opl-handoff');
    assert.equal(scienceEntry.product_entry_overview.summary, scienceEntry.product_entry_status_summary);
    assert.equal(scienceEntry.product_entry_overview.progress_surface.surface_kind, 'study_progress');
    assert.equal(scienceEntry.product_entry_overview.resume_surface.surface_kind, 'launch_study');
    assert.equal(scienceEntry.runtime_inventory.surface_kind, 'runtime_inventory');
    assert.equal(scienceEntry.runtime_inventory_runtime_owner, 'upstream_hermes_agent');
    assert.equal(scienceEntry.task_lifecycle.surface_kind, 'task_lifecycle');
    assert.equal(scienceEntry.task_lifecycle_resume_surface_kind, 'launch_study');
    assert.deepEqual(
      scienceEntry.task_lifecycle_human_gate_ids,
      ['study_physician_decision_gate', 'publication_release_gate'],
    );
    assert.equal(scienceEntry.skill_catalog.surface_kind, 'skill_catalog');
    assert.equal(scienceEntry.skill_catalog_skill_count, 2);
    assert.equal(scienceEntry.skill_catalog_supported_commands[0], 'product-frontdesk');
    assert.equal(scienceEntry.domain_entry_contract.entry_adapter, 'MedAutoScienceDomainEntry');
    assert.equal(scienceEntry.gateway_interaction_contract.shared_downstream_entry, 'MedAutoScienceDomainEntry');
    assert.equal(scienceEntry.automation.surface_kind, 'automation');
    assert.equal(scienceEntry.automation_count, 2);
    assert.equal(scienceEntry.product_entry_readiness_verdict, 'runtime_ready_not_standalone_product');
    assert.equal(scienceEntry.product_entry_readiness_good_to_use_now, false);
    assert.equal(scienceEntry.product_entry_readiness_loop_command, 'uv run python -m med_autoscience.cli workspace-cockpit --profile /fixtures/med-autoscience/profile.local.toml');
    assert.equal(scienceEntry.active_binding_locator_status, 'missing');
    assert.equal(scienceEntry.active_binding_locator.command, null);
    assert.equal(scienceEntry.active_binding_locator.url, null);
    assert.equal(scienceEntry.product_entry_preflight.ready_to_try_now, true);
    assert.equal(scienceEntry.product_entry_start.surface_kind, 'product_entry_start');
    assert.equal(scienceEntry.product_entry_start.recommended_mode_id, 'open_frontdesk');
    assert.equal(scienceEntry.product_entry_start_resume_surface_kind, 'launch_study');
    assert.equal(scienceEntry.product_entry_start_mode_ids[1], 'submit_task');
    assert.equal(
      scienceEntry.product_entry_preflight.recommended_check_command,
      'uv run python -m med_autoscience.cli doctor --profile /fixtures/med-autoscience/profile.local.toml',
    );
    assert.deepEqual(scienceEntry.product_entry_preflight_blocking_check_ids, []);
    assert.equal(scienceEntry.product_entry_preflight_checks_count, 7);
    assert.equal(scienceEntry.family_action_graph_ref, '/family_orchestration/action_graph');
    assert.equal(scienceEntry.family_action_graph_node_count, 4);
    assert.equal(scienceEntry.family_action_graph_edge_count, 5);
    assert.equal(scienceEntry.family_resume_surface_kind, 'launch_study');
    assert.equal(
      scienceEntry.family_event_envelope_ref,
      'studies/<study_id>/artifacts/runtime_watch/latest.json',
    );
    assert.equal(
      recommendedEntry.product_entry_status_summary,
      'Repo-verified product-entry service surface 已 landed，但成熟终端用户前台壳与 managed web productization 仍未 landed。',
    );
    assert.equal(recommendedEntry.product_entry_remaining_gaps_count, 2);
    assert.equal(recommendedEntry.mainline_phase_id, 'repo_verified_product_entry_and_opl_federation');
    assert.equal(recommendedEntry.frontdesk_surface.command, 'redcube product frontdesk');
    assert.equal(recommendedEntry.operator_loop_shell_key, 'direct');
    assert.equal(recommendedEntry.operator_loop_command, 'redcube product invoke');
    assert.equal(recommendedEntry.product_entry_readiness_verdict, 'service_surface_ready_not_managed_product');
    assert.equal(recommendedEntry.product_entry_readiness_summary, '当前可以作为 RedCube 的 direct frontdesk / CLI product-entry 主线使用，但还不是成熟的最终用户前台或托管 Web 产品。');
    assert.equal(recommendedEntry.product_entry_readiness_start_command, 'redcube product frontdesk');
    assert.equal(recommendedEntry.product_entry_readiness_loop_command, 'redcube product invoke');
    assert.equal(recommendedEntry.product_entry_preflight.ready_to_try_now, true);
    assert.equal(recommendedEntry.active_binding_locator_status, 'ready');
    assert.equal(recommendedEntry.active_binding_locator.command, 'redcube-ai frontdesk');
    assert.equal(recommendedEntry.active_binding_locator.url, 'http://127.0.0.1:3310/redcube');
    assert.equal(
      recommendedEntry.active_binding_locator.manifest_command,
      buildManifestCommand(fixtures.redcube),
    );
    assert.equal(recommendedEntry.product_entry_start.surface_kind, 'product_entry_start');
    assert.equal(recommendedEntry.product_entry_start.recommended_mode_id, 'open_frontdesk');
    assert.equal(recommendedEntry.product_entry_start_resume_surface_kind, 'product_entry_session');
    assert.equal(recommendedEntry.product_entry_start_mode_ids[2], 'opl_bridge_handoff');
    assert.equal(
      recommendedEntry.product_entry_preflight.recommended_check_command,
      'redcube workspace doctor --workspace-root /fixtures/redcube/workspace',
    );
    assert.deepEqual(recommendedEntry.product_entry_preflight_blocking_check_ids, []);
    assert.equal(recommendedEntry.product_entry_preflight_checks_count, 4);
    assert.equal(recommendedEntry.operator_loop_actions.start_deliverable.command, 'redcube product invoke');
    assert.equal(recommendedEntry.product_entry_overview.summary, recommendedEntry.product_entry_status_summary);
    assert.equal(recommendedEntry.product_entry_overview.progress_surface.surface_kind, 'product_entry_session');
    assert.equal(recommendedEntry.runtime_inventory.surface_kind, 'runtime_inventory');
    assert.equal(recommendedEntry.runtime_inventory_runtime_owner, 'upstream_hermes_agent');
    assert.equal(recommendedEntry.runtime_inventory_health_status, 'healthy');
    assert.equal(recommendedEntry.task_lifecycle.surface_kind, 'task_lifecycle');
    assert.equal(recommendedEntry.task_lifecycle_resume_surface_kind, 'product_entry_session');
    assert.deepEqual(recommendedEntry.task_lifecycle_human_gate_ids, ['redcube_operator_review_gate']);
    assert.equal(recommendedEntry.skill_catalog.surface_kind, 'skill_catalog');
    assert.equal(recommendedEntry.skill_catalog_skill_count, 2);
    assert.equal(recommendedEntry.skill_catalog_supported_commands[3], 'product-session');
    assert.equal(recommendedEntry.domain_entry_contract.entry_adapter, 'RedCubeDomainEntry');
    assert.equal(recommendedEntry.gateway_interaction_contract.frontdoor_owner, 'opl_gateway_or_domain_gui');
    assert.equal(recommendedEntry.automation.surface_kind, 'automation');
    assert.equal(recommendedEntry.automation_count, 2);
    assert.equal(
      recommendedEntry.automation_readiness_summary,
      'Continuation automation 继续保持 tracked follow-on，review state sync 保持 operator-gated。',
    );
    assert.equal(
      recommendedEntry.product_entry_overview.resume_surface.checkpoint_locator_field,
      'continuation_snapshot.latest_managed_run_id',
    );
    assert.equal(recommendedEntry.product_entry_shell.opl_bridge.surface_kind, 'federated_product_entry');
    assert.equal(recommendedEntry.shared_handoff.opl_return_surface.target_domain_id, 'redcube_ai');
    assert.equal(recommendedEntry.family_orchestration.action_graph_ref.ref, '/family_orchestration/action_graph');
    assert.equal(recommendedEntry.family_action_graph_ref, '/family_orchestration/action_graph');
    assert.equal(recommendedEntry.family_action_graph_node_count, 4);
    assert.equal(recommendedEntry.family_action_graph_edge_count, 4);
    assert.equal(recommendedEntry.family_orchestration.human_gates[0].gate_id, 'redcube_operator_review_gate');
    assert.equal(
      recommendedEntry.family_orchestration.resume_contract.session_locator_field,
      'entry_session_contract.entry_session_id',
    );
    assert.equal(recommendedEntry.manifest_version, 2);
    assert.equal(recommendedEntry.family_human_gate_count, 1);
    assert.deepEqual(recommendedEntry.family_human_gate_ids, ['redcube_operator_review_gate']);
    assert.equal(recommendedEntry.family_resume_surface_kind, 'product_entry_session');
    assert.equal(recommendedEntry.family_checkpoint_lineage_ref, 'runtime_watch/checkpoints/latest.json');

    const retiredGuide = runCliFailure(['frontdesk', 'entry-guide'], env);
    assert.equal(retiredGuide.status, 2);
    assert.equal(retiredGuide.payload.error.code, 'unknown_command');

    const retiredWiring = runCliFailure(['frontdesk', 'domain-wiring'], env);
    assert.equal(retiredWiring.status, 2);
    assert.equal(retiredWiring.payload.error.code, 'unknown_command');

    const retiredReadiness = runCliFailure(['frontdesk', 'readiness', '--path', repoRoot, '--sessions-limit', '1'], env);
    assert.equal(retiredReadiness.status, 2);
    assert.equal(retiredReadiness.payload.error.code, 'unknown_command');
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('project-progress promotes current MAS study into a paper-facing summary instead of stopping at project-level wording', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-project-progress-state-'));
  const fixtures = loadFamilyManifestFixtures();
  const { fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const masWorkspace = createMasWorkspaceFixture();
  const studyId = '004-invasive-architecture';
  const studyRoot = path.join(masWorkspace.fixtureRoot, 'studies', studyId);
  const controllerDir = path.join(studyRoot, 'artifacts', 'controller');
  const paperDir = path.join(studyRoot, 'paper');
  const questRoot = path.join(
    masWorkspace.fixtureRoot,
    'ops',
    'med-deepscientist',
    'runtime',
    'quests',
    '004-invasive-architecture-managed-20260408',
  );
  const questPaperDir = path.join(questRoot, 'paper');
  const questPaperBuildDir = path.join(questPaperDir, 'build');
  const questPaperFiguresDir = path.join(questPaperDir, 'figures');
  const questPaperTablesDir = path.join(questPaperDir, 'tables');

  fs.mkdirSync(controllerDir, { recursive: true });
  fs.mkdirSync(paperDir, { recursive: true });
  fs.mkdirSync(questPaperBuildDir, { recursive: true });
  fs.mkdirSync(questPaperFiguresDir, { recursive: true });
  fs.mkdirSync(questPaperTablesDir, { recursive: true });
  fs.writeFileSync(
    path.join(controllerDir, 'study_charter.json'),
    `${JSON.stringify({
      study_id: studyId,
      title: 'NF-PitNET invasive phenotype architecture with public-data anatomy and biology anchors',
      publication_objective:
        '在首术 NF-PitNET 中，重构由侵袭负担、Knosp、视觉压迫与切除负担组成的 clinically interpretable invasive phenotype architecture，并把公开 MRI / omics 用作 anatomy / biology anchors。',
      paper_framing_summary:
        'The paper-facing route is a first-surgery NF-PitNET invasive phenotype architecture study rather than a generic workflow summary.',
    }, null, 2)}\n`,
    'utf8',
  );
  fs.writeFileSync(
    path.join(paperDir, 'paper_experiment_matrix.json'),
    `${JSON.stringify({
      current_judgment: {
        current_judgment:
          'EXP-001 confirmed a deterministic Knosp split for invasiveness, EXP-002 stayed negative beyond Knosp, and EXP-003 preserved a bounded secondary non-GTR extension.',
      },
      rows: [
        {
          exp_id: 'EXP-001',
          status: 'first_compute_completed',
          title: 'Local phenotype architecture map',
        },
        {
          exp_id: 'EXP-002',
          status: 'negative_compute_completed',
          title: 'Beyond-Knosp invasiveness audit',
        },
        {
          exp_id: 'EXP-003',
          status: 'first_compute_completed',
          title: 'Non-GTR bounded extension audit',
          key_metrics: {
            auroc: 0.7999,
            delta_brier_vs_knosp_only: -0.011845,
          },
        },
      ],
    }, null, 2)}\n`,
    'utf8',
  );
  fs.writeFileSync(
    path.join(questPaperBuildDir, 'review_manuscript.md'),
    [
      '---',
      'title: "Clinically Interpretable Invasive Phenotype Architecture in First-Surgery NF-PitNET"',
      'bibliography: ../references.bib',
      '---',
      '',
      '## Abstract',
      '',
      '**Objective:** To reconstruct the local invasive phenotype architecture around the prespecified Knosp boundary in first-surgery NF-PitNET.\\',
      '**Results:** Knosp remained the dominant structural organizer, beyond-Knosp stayed negative, and the bounded non-GTR extension reached AUROC 0.7999 with delta Brier -0.011845.\\',
    ].join('\n'),
    'utf8',
  );
  fs.writeFileSync(
    path.join(questPaperDir, 'reference_coverage_report.json'),
    `${JSON.stringify({
      record_count: 32,
    }, null, 2)}\n`,
    'utf8',
  );
  fs.writeFileSync(
    path.join(questPaperBuildDir, 'compile_report.json'),
    `${JSON.stringify({
      page_count: 12,
      proofing_summary: 'Compiled manuscript refreshed into a 12-page reviewer-facing PDF.',
    }, null, 2)}\n`,
    'utf8',
  );
  fs.writeFileSync(
    path.join(questPaperDir, 'paper_bundle_manifest.json'),
    `${JSON.stringify({
      title: 'Clinically Interpretable Invasive Phenotype Architecture in First-Surgery NF-PitNET',
      summary:
        'The current reviewer bundle keeps main-text figures F1-F3, one supplementary figure S1, main tables T1-T2, and appendix table TA1 in sync.',
    }, null, 2)}\n`,
    'utf8',
  );
  fs.writeFileSync(
    path.join(questPaperFiguresDir, 'figure_catalog.json'),
    `${JSON.stringify({
      figures: [
        { figure_id: 'F1', paper_role: 'main_text' },
        { figure_id: 'F2', paper_role: 'main_text' },
        { figure_id: 'F3', paper_role: 'main_text' },
        { figure_id: 'S1', paper_role: 'supplementary' },
      ],
    }, null, 2)}\n`,
    'utf8',
  );
  fs.writeFileSync(
    path.join(questPaperTablesDir, 'table_catalog.json'),
    `${JSON.stringify({
      tables: [
        { table_id: 'T1', paper_role: 'main_text' },
        { table_id: 'T2', paper_role: 'main_text' },
        { table_id: 'TA1', paper_role: 'supplementary' },
      ],
    }, null, 2)}\n`,
    'utf8',
  );

  const workspaceCockpitPayload = {
    schema_version: 1,
    workspace_root: masWorkspace.fixtureRoot,
    studies: [
      {
        study_id: studyId,
        current_stage: 'publication_supervision',
        current_stage_summary: '投稿打包阶段已被全局门控放行，可以进入关键路径。',
        current_blockers: [
          '当前论文交付目录与注册/合同约定不一致，需要先修正交付面。',
        ],
        next_system_action: 'continue bundle stage',
        status_narration_contract: {
          schema_version: 1,
          contract_kind: 'ai_status_narration',
          contract_id: `study-progress::${studyId}`,
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
            '当前论文交付目录与注册/合同约定不一致，需要先修正交付面。',
          ],
          latest_update: '论文主体内容已经完成，当前进入投稿打包收口。',
          next_step: '优先核对 submission package 与 studies 目录中的交付面是否一致。',
          human_gate: {},
          facts: {
            study_id: studyId,
            quest_id: '004-invasive-architecture-managed-20260408',
          },
          narration_policy: {
            mode: 'ai_first',
            legacy_summary_role: 'fallback_only',
            style: 'plain_language',
            answer_checklist: ['current_stage', 'current_blockers', 'next_step'],
          },
        },
        needs_physician_decision: false,
        monitoring: {
          browser_url: 'http://127.0.0.1:21001',
          quest_session_api_url: 'http://127.0.0.1:21001/api/quests/004/session',
          active_run_id: 'run-884e2a72',
          health_status: 'live',
          supervisor_tick_status: 'fresh',
        },
        task_intake: null,
        progress_freshness: {
          status: 'fresh',
          required: true,
          summary: '最近 12 小时内仍有明确研究推进记录。',
          latest_progress_at: '2026-04-15T11:24:35+00:00',
          latest_progress_time_label: '2026-04-15 11:24 UTC',
          latest_progress_source: 'publication_eval',
          latest_progress_summary: '投稿打包阶段已被全局门控放行，可以进入关键路径。',
        },
        commands: {
          progress: `${process.execPath} -e "process.stdout.write(process.argv[1])" ${shellSingleQuote(
            [
              '# 研究进度',
              '',
              `- study_id: \`${studyId}\``,
              '- 当前阶段: 论文可发表性监管',
              '- 阶段摘要: 投稿打包阶段已被全局门控放行，可以进入关键路径。',
            ].join('\n'),
          )}`,
        },
      },
      {
        study_id: '003-endocrine-burden-followup',
        current_stage: 'managed_runtime_recovering',
        current_stage_summary: '系统正在推进托管运行进入可监督的在线状态。',
        current_blockers: ['仍有主线阻塞。'],
        next_system_action: '等待下一次巡检确认 worker 已重新上线并恢复 live。',
        needs_physician_decision: false,
        monitoring: {
          browser_url: null,
          quest_session_api_url: null,
          active_run_id: null,
          health_status: 'recovering',
          supervisor_tick_status: 'fresh',
        },
        task_intake: null,
        progress_freshness: {
          status: 'fresh',
          required: true,
          summary: '最近 12 小时内仍有明确研究推进记录。',
          latest_progress_at: '2026-04-15T11:20:00+00:00',
          latest_progress_time_label: '2026-04-15 11:20 UTC',
          latest_progress_source: 'publication_eval',
          latest_progress_summary: '论文包雏形已经存在，但当前硬阻塞仍在论文可发表性面。',
        },
        commands: {
          progress: buildManifestCommand({
            study_id: '003-endocrine-burden-followup',
          }),
        },
      },
    ],
    attention_queue: [],
    workspace_supervision: {
      summary: '4 个 study；当前监管心跳新鲜。',
    },
  };

  const manifest = structuredClone(fixtures.medautoscience) as Record<string, any>;
  manifest.workspace_locator.workspace_root = masWorkspace.fixtureRoot;
  manifest.workspace_locator.profile_ref = masWorkspace.profilePath;
  manifest.recommended_command = buildManifestCommand(workspaceCockpitPayload);
  manifest.product_entry_shell.workspace_cockpit.command = buildManifestCommand(workspaceCockpitPayload);
  manifest.operator_loop_surface.command = buildManifestCommand(workspaceCockpitPayload);
  manifest.product_entry_overview.recommended_command = buildManifestCommand(workspaceCockpitPayload);
  manifest.product_entry_overview.operator_loop_command = buildManifestCommand(workspaceCockpitPayload);
  manifest.product_entry_overview.progress_surface.command = buildManifestCommand({
    study_id: studyId,
    study_root: studyRoot,
    quest_id: '004-invasive-architecture-managed-20260408',
    quest_root: questRoot,
    current_stage: 'publication_supervision',
    current_stage_summary: '投稿打包阶段已被全局门控放行，可以进入关键路径。',
    paper_stage: 'bundle_stage_ready',
    paper_stage_summary: '论文当前建议推进到投稿打包阶段。',
    current_blockers: [
      '当前论文交付目录与注册/合同约定不一致，需要先修正交付面。',
    ],
    next_system_action: 'continue bundle stage',
    status_narration_contract: {
      schema_version: 1,
      contract_kind: 'ai_status_narration',
      contract_id: `study-progress::${studyId}`,
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
        '当前论文交付目录与注册/合同约定不一致，需要先修正交付面。',
      ],
      latest_update: '论文主体内容已经完成，当前进入投稿打包收口。',
      next_step: '优先核对 submission package 与 studies 目录中的交付面是否一致。',
      human_gate: {},
      facts: {
        study_id: studyId,
        quest_id: '004-invasive-architecture-managed-20260408',
      },
      narration_policy: {
        mode: 'ai_first',
        legacy_summary_role: 'fallback_only',
        style: 'plain_language',
        answer_checklist: ['current_stage', 'current_blockers', 'next_step'],
      },
    },
    progress_freshness: {
      latest_progress_time_label: '2026-04-15 11:24 UTC',
      latest_progress_summary: '投稿打包阶段已被全局门控放行，可以进入关键路径。',
      latest_progress_source: 'publication_eval',
    },
    supervision: {
      browser_url: 'http://127.0.0.1:21001',
      active_run_id: 'run-884e2a72',
      health_status: 'live',
    },
    latest_events: [
      {
        time_label: '2026-04-15 11:24 UTC',
        title: '发表可行性评估更新',
        summary: '投稿打包阶段已被全局门控放行，可以进入关键路径。',
      },
    ],
    refs: {
      publication_eval_path: path.join(studyRoot, 'artifacts', 'publication_eval', 'latest.json'),
    },
  });
  manifest.operator_loop_actions.open_loop.command = buildManifestCommand(workspaceCockpitPayload);
  manifest.operator_loop_actions.inspect_progress.command = buildManifestCommand({
    study_id: '<study_id>',
  });

  try {
    runCli([
      'workspace',
      'bind',
      '--project',
      'medautoscience',
      '--path',
      masWorkspace.fixtureRoot,
      '--manifest-command',
      buildManifestCommand(manifest),
    ], {
      OPL_FRONTDESK_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });

    const contracts = loadGatewayContracts({ contractsDir: fixtureContractsRoot });
    const originalArgv1 = process.argv[1];
    const originalStateDir = process.env.OPL_FRONTDESK_STATE_DIR;
    const originalContractsDir = process.env.OPL_CONTRACTS_DIR;
    let payload: Awaited<ReturnType<typeof buildProjectProgressBrief>>;
    try {
      process.argv[1] = cliPath;
      process.env.OPL_FRONTDESK_STATE_DIR = stateRoot;
      process.env.OPL_CONTRACTS_DIR = fixtureContractsRoot;
      payload = await buildProjectProgressBrief(contracts, {
        workspacePath: masWorkspace.fixtureRoot,
        sessionsLimit: 1,
      });
    } finally {
      process.argv[1] = originalArgv1;
      if (originalStateDir === undefined) {
        delete process.env.OPL_FRONTDESK_STATE_DIR;
      } else {
        process.env.OPL_FRONTDESK_STATE_DIR = originalStateDir;
      }
      if (originalContractsDir === undefined) {
        delete process.env.OPL_CONTRACTS_DIR;
      } else {
        process.env.OPL_CONTRACTS_DIR = originalContractsDir;
      }
    }

    const currentStudy = payload.project_progress.current_study;
    assert.ok(currentStudy);
    const storySummary = currentStudy.story_summary;
    assert.ok(storySummary);
    const paperSnapshot = currentStudy.paper_snapshot;
    assert.ok(paperSnapshot);
    const currentEffectSummary = paperSnapshot.current_effect_summary;
    assert.ok(currentEffectSummary);

    assert.equal(currentStudy.study_id, studyId);
    assert.equal(
      currentStudy.title,
      'NF-PitNET invasive phenotype architecture with public-data anatomy and biology anchors',
    );
    assert.match(storySummary, /侵袭负担.*Knosp.*公开 MRI \/ omics/);
    assert.equal(currentStudy.current_stage, 'publication_supervision');
    assert.equal(currentStudy.monitoring.health_status, 'live');
    assert.equal(paperSnapshot.main_figure_count, 3);
    assert.equal(paperSnapshot.supplementary_figure_count, 1);
    assert.equal(paperSnapshot.main_table_count, 2);
    assert.equal(paperSnapshot.supplementary_table_count, 1);
    assert.equal(paperSnapshot.reference_count, 32);
    assert.equal(paperSnapshot.page_count, 12);
    assert.ok(currentEffectSummary.includes('AUROC 0.7999'));
    assert.match(currentEffectSummary, /negative/i);
    assert.match(payload.project_progress.progress_summary, /004-invasive-architecture/);
    assert.match(payload.project_progress.progress_summary, /3 张主图/);
    assert.match(payload.project_progress.progress_summary, /32 篇参考文献/);
    assert.ok(currentStudy.status_narration_contract);
    assert.equal(currentStudy.status_narration_contract.latest_update, '论文主体内容已经完成，当前进入投稿打包收口。');
    assert.equal(payload.project_progress.progress_feedback.current_status, 'publication_supervision');
    assert.equal(payload.project_progress.progress_feedback.runtime_status, 'live');
    assert.equal(payload.project_progress.progress_feedback.headline, '论文主体内容已经完成，当前进入投稿打包收口。');
    assert.match(payload.project_progress.progress_feedback.latest_update, /2026-04-15 11:24 UTC/);
    assert.equal(
      payload.project_progress.progress_feedback.next_step,
      '优先核对 submission package 与 studies 目录中的交付面是否一致。',
    );
    assert.equal(payload.project_progress.workspace_inbox.summary.known_task_count, 3);
    assert.equal(payload.project_progress.workspace_inbox.summary.running_count, 1);
    assert.equal(payload.project_progress.workspace_inbox.summary.waiting_count, 1);
    assert.equal(payload.project_progress.workspace_inbox.summary.ready_count, 0);
    assert.equal(payload.project_progress.workspace_inbox.summary.delivered_count, 1);
    assert.equal(payload.project_progress.workspace_inbox.summary.active_task_id, studyId);
    assert.equal(payload.project_progress.workspace_inbox.sections.running[0].task_id, studyId);
    assert.equal(
      payload.project_progress.workspace_inbox.sections.running[0].summary,
      '当前状态：论文可发表性监管；下一阶段：投稿打包就绪；当前卡点：当前论文交付目录与注册/合同约定不一致，需要先修正交付面。',
    );
    assert.ok(
      payload.project_progress.workspace_inbox.sections.waiting.some(
        (entry: { task_id: string }) => entry.task_id === '003-endocrine-burden-followup',
      ),
    );
    assert.equal(payload.project_progress.workspace_inbox.sections.delivered[0].deliverable_count, 3);
    assert.ok(payload.project_progress.user_options.includes('展开当前论文的详细进度'));
    assert.ok(payload.project_progress.inspect_paths.includes(studyRoot));
    assert.equal(payload.project_progress.workspace_files.deliverable_files.length, 3);
    assert.equal(payload.project_progress.workspace_files.supporting_files.length, 4);
    assert.equal(payload.project_progress.workspace_files.deliverable_files[0].file_id, 'review_manuscript');
    assert.equal(payload.project_progress.workspace_files.deliverable_files[0].kind, 'deliverable');
    assert.match(
      payload.project_progress.workspace_files.deliverable_files[0].path,
      /paper\/build\/review_manuscript\.md$/,
    );
    assert.ok(
      payload.project_progress.workspace_files.supporting_files.some(
        (entry: { file_id: string }) => entry.file_id === 'figure_catalog',
      ),
    );
    assert.equal(
      payload.project_progress.recommended_commands.progress,
      workspaceCockpitPayload.studies[0].commands.progress,
    );
    assert.doesNotMatch(
      payload.project_progress.recommended_commands.progress,
      /--format json/,
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(masWorkspace.fixtureRoot, { recursive: true, force: true });
  }
});

test('workspace-bind derives family direct-entry locators from structured project locators', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-binding-state-'));
  const fixtures = loadFamilyManifestFixtures();
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const locatorRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-binding-locators-'));
  const masWorkspacePath = path.join(locatorRoot, 'medautoscience-workspace');
  const magWorkspacePath = path.join(locatorRoot, 'medautogrant-workspace');
  const redcubeWorkspacePath = path.join(locatorRoot, 'redcube-workspace');
  const masProfilePath = path.join(locatorRoot, 'profile.local.toml');
  const magInputPath = path.join(locatorRoot, 'workspace.json');
  const commandFixture = createFamilyLocatorResolverFixture({
    masProfile: masProfilePath,
    magInput: magInputPath,
    redcubeWorkspaceRoot: redcubeWorkspacePath,
    masManifest: fixtures.medautoscience,
    magManifest: fixtures.medautogrant,
    redcubeManifest: fixtures.redcube,
  });

  fs.mkdirSync(masWorkspacePath, { recursive: true });
  fs.mkdirSync(magWorkspacePath, { recursive: true });
  fs.mkdirSync(redcubeWorkspacePath, { recursive: true });
  fs.writeFileSync(masProfilePath, '[workspace]\nname = "fixture"\n', 'utf8');
  fs.writeFileSync(magInputPath, '{}\n', 'utf8');

  const env = {
    OPL_FRONTDESK_STATE_DIR: stateRoot,
    OPL_CONTRACTS_DIR: fixtureContractsRoot,
    PATH: `${commandFixture.fixtureRoot}:${process.env.PATH ?? ''}`,
  };

  try {
    const magBind = runCli([
      'workspace',
      'bind',
      '--project',
      'medautogrant',
      '--path',
      magWorkspacePath,
      '--input',
      magInputPath,
    ], env);
    const masBind = runCli([
      'workspace',
      'bind',
      '--project',
      'medautoscience',
      '--path',
      masWorkspacePath,
      '--profile',
      masProfilePath,
    ], env);
    const redcubeBind = runCli([
      'workspace',
      'bind',
      '--project',
      'redcube',
      '--path',
      redcubeWorkspacePath,
    ], env);

    assert.equal(
      magBind.workspace_catalog.binding.direct_entry.command,
      `uv run python -m med_autogrant product frontdesk --input ${path.resolve(magInputPath)}`,
    );
    assert.equal(
      magBind.workspace_catalog.binding.direct_entry.manifest_command,
      `uv run python -m med_autogrant product manifest --input ${path.resolve(magInputPath)} --format json`,
    );
    assert.deepEqual(magBind.workspace_catalog.binding.direct_entry.workspace_locator, {
      surface_kind: 'med_autogrant_workspace_input',
      workspace_root: path.resolve(magWorkspacePath),
      profile_ref: null,
      input_path: path.resolve(magInputPath),
    });

    assert.equal(
      masBind.workspace_catalog.binding.direct_entry.command,
      `uv run python -m med_autoscience.cli product frontdesk --profile ${path.resolve(masProfilePath)}`,
    );
    assert.equal(
      masBind.workspace_catalog.binding.direct_entry.manifest_command,
      `uv run python -m med_autoscience.cli product manifest --profile ${path.resolve(masProfilePath)} --format json`,
    );
    assert.deepEqual(masBind.workspace_catalog.binding.direct_entry.workspace_locator, {
      surface_kind: 'med_autoscience_workspace_profile',
      workspace_root: path.resolve(masWorkspacePath),
      profile_ref: path.resolve(masProfilePath),
      input_path: null,
    });

    assert.equal(
      redcubeBind.workspace_catalog.binding.direct_entry.command,
      `redcube product frontdesk --workspace-root ${path.resolve(redcubeWorkspacePath)}`,
    );
    assert.equal(
      redcubeBind.workspace_catalog.binding.direct_entry.manifest_command,
      `redcube product manifest --workspace-root ${path.resolve(redcubeWorkspacePath)}`,
    );
    assert.deepEqual(redcubeBind.workspace_catalog.binding.direct_entry.workspace_locator, {
      surface_kind: 'redcube_workspace',
      workspace_root: path.resolve(redcubeWorkspacePath),
      profile_ref: null,
      input_path: null,
    });

    const catalogOutput = runCli(['workspace', 'list'], env);
    assert.equal(catalogOutput.workspace_catalog.summary.direct_entry_ready_projects_count, 3);
    assert.equal(catalogOutput.workspace_catalog.summary.manifest_ready_projects_count, 3);
    const magProject = catalogOutput.workspace_catalog.projects.find(
      (entry: { project_id: string }) => entry.project_id === 'medautogrant',
    );
    const masProject = catalogOutput.workspace_catalog.projects.find(
      (entry: { project_id: string }) => entry.project_id === 'medautoscience',
    );
    const redcubeProject = catalogOutput.workspace_catalog.projects.find(
      (entry: { project_id: string }) => entry.project_id === 'redcube',
    );
    assert.deepEqual(magProject.binding_contract.required_locator_fields, ['input_path']);
    assert.equal(
      magProject.binding_contract.workspace_locator_surface_kind,
      'med_autogrant_workspace_input',
    );
    assert.equal(
      magProject.binding_contract.derived_entry_command_template,
      'uv run python -m med_autogrant product frontdesk --input <input_path>',
    );
    assert.deepEqual(masProject.binding_contract.required_locator_fields, ['profile_ref']);
    assert.equal(
      masProject.binding_contract.workspace_locator_surface_kind,
      'med_autoscience_workspace_profile',
    );
    assert.equal(
      masProject.binding_contract.derived_manifest_command_template,
      'uv run python -m med_autoscience.cli product manifest --profile <profile_ref> --format json',
    );
    assert.deepEqual(redcubeProject.binding_contract.optional_locator_fields, ['workspace_root']);
    assert.equal(
      redcubeProject.binding_contract.quick_bind_hint,
      '可只给 workspace_path；若额外提供 workspace_root，则 redcube direct entry 会优先指向它。',
    );

    const manifestOutput = runCli(['domain', 'manifests'], env);
    assert.equal(manifestOutput.domain_manifests.summary.resolved_count, 3);
    assert.equal(
      manifestOutput.domain_manifests.projects.find((entry: { project_id: string }) => entry.project_id === 'medautogrant')?.manifest_command,
      `uv run python -m med_autogrant product manifest --input ${path.resolve(magInputPath)} --format json`,
    );
    assert.equal(
      manifestOutput.domain_manifests.projects.find((entry: { project_id: string }) => entry.project_id === 'medautoscience')?.manifest_command,
      `uv run python -m med_autoscience.cli product manifest --profile ${path.resolve(masProfilePath)} --format json`,
    );
    assert.equal(
      manifestOutput.domain_manifests.projects.find((entry: { project_id: string }) => entry.project_id === 'redcube')?.manifest_command,
      `redcube product manifest --workspace-root ${path.resolve(redcubeWorkspacePath)}`,
    );

    const dashboardOutput = runCli(['status', 'dashboard', '--path', repoRoot, '--sessions-limit', '1'], env);
    assert.equal(
      dashboardOutput.dashboard.product_api.domain_entry_parity.summary.aligned_projects_count,
      3,
    );
    assert.equal(
      dashboardOutput.dashboard.product_api.domain_entry_parity.summary.partial_projects_count,
      0,
    );
    assert.equal(
      dashboardOutput.dashboard.product_api.domain_entry_parity.summary.direct_entry_locator_ready_projects_count,
      3,
    );
    assert.equal(
      dashboardOutput.dashboard.product_api.domain_entry_parity.projects.find(
        (entry: { project_id: string }) => entry.project_id === 'medautogrant',
      )?.direct_entry_locator_status,
      'ready',
    );
    assert.equal(
      dashboardOutput.dashboard.product_api.domain_entry_parity.projects.find(
        (entry: { project_id: string }) => entry.project_id === 'medautoscience',
      )?.direct_entry_locator_status,
      'ready',
    );
  } finally {
    fs.rmSync(commandFixture.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(locatorRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('domain manifests executes manifest_command with a bash-compatible shell', () => {
  const fixtures = loadFamilyManifestFixtures();
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-domain-manifest-bash-state-'));
  const workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-domain-manifest-bash-workspace-'));
  const profilePath = path.join(workspacePath, 'ops', 'medautoscience', 'profiles', 'nfpitnet.workspace.toml');
  const shellGuardPath = path.join(workspacePath, 'manifest-shell-guard.sh');
  const commandFixture = createFamilyLocatorResolverFixture({
    masProfile: profilePath,
    magInput: path.join(workspacePath, 'unused.input.json'),
    redcubeWorkspaceRoot: path.join(workspacePath, 'unused-redcube'),
    masManifest: fixtures.medautoscience,
    magManifest: fixtures.medautogrant,
    redcubeManifest: fixtures.redcube,
  });
  const workspaceRegistryPath = path.join(stateRoot, 'workspace-registry.json');
  const now = new Date().toISOString();

  fs.mkdirSync(path.dirname(profilePath), { recursive: true });
  fs.writeFileSync(profilePath, '[workspace]\nname = "fixture"\n', 'utf8');
  fs.writeFileSync(
    shellGuardPath,
    '#!/usr/bin/env bash\nset -euo pipefail\n: "${BASH_SOURCE[0]}"\n',
    { mode: 0o755 },
  );
  fs.writeFileSync(
    workspaceRegistryPath,
    `${JSON.stringify({
      version: 'g2',
      bindings: [
        {
          binding_id: 'mas-binding',
          project_id: 'medautoscience',
          project: 'med-autoscience',
          workspace_path: workspacePath,
          label: null,
          status: 'active',
          direct_entry: {
            command: null,
            manifest_command:
              `source ${shellSingleQuote(shellGuardPath)} && `
              + `uv run python -m med_autoscience.cli product manifest --profile ${path.resolve(profilePath)} --format json`,
            url: null,
            workspace_locator: {
              surface_kind: 'med_autoscience_workspace_profile',
              workspace_root: workspacePath,
              profile_ref: path.resolve(profilePath),
              input_path: null,
            },
          },
          created_at: now,
          updated_at: now,
          archived_at: null,
        },
      ],
    }, null, 2)}\n`,
    'utf8',
  );

  try {
    const output = runCli(['domain', 'manifests'], {
      OPL_FRONTDESK_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      PATH: `${commandFixture.fixtureRoot}:${process.env.PATH ?? ''}`,
    });
    const medautoscienceEntry = output.domain_manifests.projects.find(
      (entry: { project_id: string }) => entry.project_id === 'medautoscience',
    );
    assert.equal(medautoscienceEntry?.status, 'resolved');
    assert.equal(medautoscienceEntry?.manifest?.target_domain_id, 'med-autoscience');
  } finally {
    fs.rmSync(commandFixture.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(workspacePath, { recursive: true, force: true });
  }
});

test('start returns the routed family start surface for a bound project', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-start-state-'));
  const fixtures = loadFamilyManifestFixtures();
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const env = {
    OPL_FRONTDESK_STATE_DIR: stateRoot,
    OPL_CONTRACTS_DIR: fixtureContractsRoot,
  };

  try {
    runCli([
      'workspace',
      'bind',
      '--project',
      'redcube',
      '--path',
      repoRoot,
      '--entry-command',
      'redcube-ai frontdesk',
      '--manifest-command',
      buildManifestCommand(fixtures.redcube),
      '--entry-url',
      'http://127.0.0.1:3310/redcube',
    ], env);

    const output = runCli(['start', '--project', 'redcube'], env);
    assert.equal(output.product_entry_start.surface_kind, 'opl_product_entry_start');
    assert.equal(output.product_entry_start.project_id, 'redcube');
    assert.equal(output.product_entry_start.target_domain_id, 'redcube_ai');
    assert.equal(output.product_entry_start.recommended_mode_id, 'open_frontdesk');
    assert.equal(output.product_entry_start.selected_mode_id, 'open_frontdesk');
    assert.equal(output.product_entry_start.selected_mode.mode_id, 'open_frontdesk');
    assert.equal(output.product_entry_start.selected_mode.command, 'redcube product frontdesk');
    assert.equal(output.product_entry_start.available_modes[2].mode_id, 'opl_bridge_handoff');
    assert.equal(output.product_entry_start.resume_surface.surface_kind, 'product_entry_session');
    assert.deepEqual(output.product_entry_start.human_gate_ids, ['redcube_operator_review_gate']);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('domain manifests reports invalid json when a bound manifest command is malformed', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-domain-manifest-invalid-json-state-'));

  try {
    runCli([
      'workspace',
      'bind',
      '--project',
      'medautoscience',
      '--path',
      repoRoot,
      '--manifest-command',
      "printf 'not-json'",
    ], {
      OPL_FRONTDESK_STATE_DIR: stateRoot,
    });

    const manifestOutput = runCli(['domain', 'manifests'], {
      OPL_FRONTDESK_STATE_DIR: stateRoot,
    });
    const medautoscience = manifestOutput.domain_manifests.projects.find((entry: { project_id: string }) => entry.project_id === 'medautoscience');

    assert.equal(medautoscience.status, 'invalid_json');
    assert.equal(medautoscience.error.code, 'invalid_json');
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('handoff-envelope returns a machine-readable family handoff bundle aligned with the active workspace binding', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-handoff-state-'));
  const resolvedManifest = loadFamilyManifestFixtures().redcube;

  try {
    runCli([
      'workspace',
      'bind',
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
      'contract',
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
    assert.equal(output.handoff_bundle.return_surface_contract.opl.resume_command, 'opl session resume <session_id>');
    assert.equal(
      output.handoff_bundle.return_surface_contract.opl.logs_command,
      'opl session logs gateway --session <session_id>',
    );
    assert.equal(output.handoff_bundle.return_surface_contract.opl.dashboard_command, 'opl status dashboard');
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
      output.handoff_bundle.domain_manifest_recommendation.product_entry_shell.opl_bridge.surface_kind,
      'federated_product_entry',
    );
    assert.equal(
      output.handoff_bundle.domain_manifest_recommendation.shared_handoff.opl_return_surface.target_domain_id,
      'redcube_ai',
    );
    assert.equal(
      output.handoff_bundle.domain_manifest_recommendation.product_entry_status.summary,
      'Repo-verified product-entry service surface 已 landed，但成熟终端用户前台壳与 managed web productization 仍未 landed。',
    );
    assert.equal(
      output.handoff_bundle.domain_manifest_recommendation.runtime_inventory.surface_kind,
      'runtime_inventory',
    );
    assert.equal(
      output.handoff_bundle.domain_manifest_recommendation.runtime_inventory.runtime_owner,
      'upstream_hermes_agent',
    );
    assert.equal(
      output.handoff_bundle.domain_manifest_recommendation.task_lifecycle.surface_kind,
      'task_lifecycle',
    );
    assert.equal(
      output.handoff_bundle.domain_manifest_recommendation.task_lifecycle.resume_surface.surface_kind,
      'product_entry_session',
    );
    assert.equal(
      output.handoff_bundle.domain_manifest_recommendation.skill_catalog.surface_kind,
      'skill_catalog',
    );
    assert.equal(
      output.handoff_bundle.domain_manifest_recommendation.skill_catalog.skills.length,
      2,
    );
    assert.equal(
      output.handoff_bundle.domain_manifest_recommendation.automation.surface_kind,
      'automation',
    );
    assert.equal(
      output.handoff_bundle.domain_manifest_recommendation.automation.automations[0].automation_id,
      'redcube_autopilot_continuation',
    );
    assert.equal(
      output.handoff_bundle.domain_manifest_recommendation.product_entry_readiness.verdict,
      'service_surface_ready_not_managed_product',
    );
    assert.equal(
      output.handoff_bundle.domain_manifest_recommendation.product_entry_readiness.recommended_start_command,
      'redcube product frontdesk',
    );
    assert.equal(
      output.handoff_bundle.domain_manifest_recommendation.product_entry_preflight.surface_kind,
      'product_entry_preflight',
    );
    assert.equal(
      output.handoff_bundle.domain_manifest_recommendation.product_entry_preflight.recommended_check_command,
      'redcube workspace doctor --workspace-root /fixtures/redcube/workspace',
    );
    assert.equal(
      output.handoff_bundle.domain_manifest_recommendation.product_entry_preflight.ready_to_try_now,
      true,
    );
    assert.equal(
      output.handoff_bundle.domain_manifest_recommendation.product_entry_start.surface_kind,
      'product_entry_start',
    );
    assert.equal(
      output.handoff_bundle.domain_manifest_recommendation.product_entry_start.recommended_mode_id,
      'open_frontdesk',
    );
    assert.equal(
      output.handoff_bundle.domain_manifest_recommendation.product_entry_start.modes[2].mode_id,
      'opl_bridge_handoff',
    );
    assert.equal(
      output.handoff_bundle.domain_manifest_recommendation.product_entry_overview.progress_surface.command,
      'redcube product session --entry-session-id <entry-session-id>',
    );
    assert.equal(
      output.handoff_bundle.domain_manifest_recommendation.product_entry_overview.resume_surface.checkpoint_locator_field,
      'continuation_snapshot.latest_managed_run_id',
    );
    assert.equal(
      output.handoff_bundle.domain_manifest_recommendation.repo_mainline.phase_id,
      'repo_verified_product_entry_and_opl_federation',
    );
    assert.equal(
      output.handoff_bundle.domain_manifest_recommendation.family_orchestration.action_graph_ref.ref,
      '/family_orchestration/action_graph',
    );
    assert.equal(output.handoff_bundle.domain_entry_parity.summary.total_projects_count, 3);
    assert.equal(output.handoff_bundle.domain_entry_parity.summary.aligned_projects_count, 1);
    assert.equal(output.handoff_bundle.domain_entry_parity.summary.runtime_inventory_ready_count, 1);
    assert.equal(output.handoff_bundle.domain_entry_parity.summary.task_lifecycle_ready_count, 1);
    assert.equal(output.handoff_bundle.domain_entry_parity.summary.skill_catalog_ready_count, 1);
    assert.equal(output.handoff_bundle.domain_entry_parity.summary.automation_ready_count, 1);
    assert.equal(
      output.handoff_bundle.domain_entry_parity.summary.direct_entry_locator_ready_projects_count,
      1,
    );
    const routedParity = output.handoff_bundle.domain_entry_parity.projects.find(
      (entry: { project_id: string }) => entry.project_id === 'redcube',
    );
    assert.equal(routedParity.entry_parity_status, 'aligned');
    assert.equal(routedParity.direct_entry_locator_status, 'ready');
    assert.equal(routedParity.ready_for_opl_start, true);
    assert.equal(routedParity.ready_for_domain_handoff, true);
    assert.equal(routedParity.runtime_inventory_status, 'ready');
    assert.equal(routedParity.task_lifecycle_status, 'ready');
    assert.equal(routedParity.skill_catalog_status, 'ready');
    assert.equal(routedParity.automation_status, 'ready');
    assertRedcubeActionGraph(
      output.handoff_bundle.domain_manifest_recommendation.family_orchestration.action_graph,
    );
    assert.equal(
      output.handoff_bundle.domain_manifest_recommendation.family_orchestration.resume_contract.checkpoint_locator_field,
      'continuation_snapshot.latest_managed_run_id',
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('domain launch resolves a bound direct-entry locator into an honest launcher surface', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-domain-launch-state-'));
  const openFixture = createFakeOpenFixture();
  const shellFixture = createFakeShellCommandFixture();

  try {
    runCli([
      'workspace',
      'bind',
      '--project',
      'redcube',
      '--path',
      repoRoot,
      '--entry-command',
      `${shellFixture.commandPath} --workspace ${repoRoot}`,
      '--entry-url',
      'http://127.0.0.1:3310/redcube',
    ], {
      OPL_FRONTDESK_STATE_DIR: stateRoot,
    });

    const preview = runCli([
      'domain',
      'launch',
      '--project',
      'redcube',
      '--dry-run',
    ], {
      OPL_FRONTDESK_STATE_DIR: stateRoot,
      OPL_OPEN_BIN: openFixture.openPath,
    });

    assert.equal(preview.domain_entry_launch.surface_id, 'opl_domain_direct_entry_launch');
    assert.equal(preview.domain_entry_launch.project_id, 'redcube');
    assert.equal(preview.domain_entry_launch.dry_run, true);
    assert.equal(preview.domain_entry_launch.selected_strategy, 'open_url');
    assert.equal(preview.domain_entry_launch.launch_status, 'preview_only');
    assert.equal(preview.domain_entry_launch.workspace_locator.absolute_path, repoRoot);
    assert.equal(preview.domain_entry_launch.available_strategies[0], 'open_url');
    assert.equal(preview.domain_entry_launch.available_strategies[1], 'spawn_command');
    assert.equal(preview.domain_entry_launch.direct_entry_locator.url, 'http://127.0.0.1:3310/redcube');
    assert.equal(preview.domain_entry_launch.direct_entry_locator.command.includes(shellFixture.commandPath), true);
    assert.equal(preview.domain_entry_launch.action.command_preview[0], openFixture.openPath);

    const openResult = runCli([
      'domain',
      'launch',
      '--project',
      'redcube',
    ], {
      OPL_FRONTDESK_STATE_DIR: stateRoot,
      OPL_OPEN_BIN: openFixture.openPath,
    });

    assert.equal(openResult.domain_entry_launch.selected_strategy, 'open_url');
    assert.equal(openResult.domain_entry_launch.launch_status, 'launched');
    assert.equal(openResult.domain_entry_launch.action.kind, 'open_url');
    assert.equal(fs.readFileSync(openFixture.capturePath, 'utf8').trim(), 'http://127.0.0.1:3310/redcube');

    const spawnResult = runCli([
      'domain',
      'launch',
      '--project',
      'redcube',
      '--strategy',
      'spawn_command',
    ], {
      OPL_FRONTDESK_STATE_DIR: stateRoot,
      OPL_OPEN_BIN: openFixture.openPath,
    });

    assert.equal(spawnResult.domain_entry_launch.selected_strategy, 'spawn_command');
    assert.equal(spawnResult.domain_entry_launch.launch_status, 'launched');
    assert.equal(spawnResult.domain_entry_launch.action.kind, 'spawn_command');
    assert.equal(typeof spawnResult.domain_entry_launch.action.pid, 'number');

    for (let attempt = 0; attempt < 20; attempt += 1) {
      if (fs.existsSync(shellFixture.capturePath)) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    assert.equal(fs.existsSync(shellFixture.capturePath), true);
    assert.match(fs.readFileSync(shellFixture.capturePath, 'utf8'), new RegExp(repoRoot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(openFixture.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(shellFixture.fixtureRoot, { recursive: true, force: true });
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
if [ "$1" = "--resume" ] && [ "$2" = "sess_ledger" ]; then
  cat <<'EOF'
╭─ ⚕ Hermes ───────────────────────────────────────────────────────────────────╮
SESSION LEDGER RESUME RESPONSE

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
      '--executor',
      'hermes',
      '--workspace-path',
      repoRoot,
    ], {
      OPL_HERMES_BIN: hermesPath,
      OPL_FRONTDESK_STATE_DIR: stateRoot,
      PATH: `${psFixture.fixtureRoot}:${process.env.PATH ?? ''}`,
    });
    assert.equal(askOutput.product_entry.hermes.session_id, 'sess_ledger');

    const resumeOutput = runCli(['session', 'resume', 'sess_ledger'], {
      OPL_HERMES_BIN: hermesPath,
      OPL_FRONTDESK_STATE_DIR: stateRoot,
      PATH: `${psFixture.fixtureRoot}:${process.env.PATH ?? ''}`,
    });
    assert.equal(resumeOutput.product_entry.mode, 'resume');

    const ledgerOutput = runCli(['session', 'ledger', '--limit', '5'], {
      OPL_HERMES_BIN: hermesPath,
      OPL_FRONTDESK_STATE_DIR: stateRoot,
      PATH: `${psFixture.fixtureRoot}:${process.env.PATH ?? ''}`,
    });

    assert.equal(ledgerOutput.session_ledger.summary.entry_count, 2);
    assert.equal(ledgerOutput.session_ledger.summary.mode_counts.ask, 1);
    assert.equal(ledgerOutput.session_ledger.summary.mode_counts.resume, 1);
    assert.equal(ledgerOutput.session_ledger.summary.domain_counts.redcube, 2);
    assert.equal(ledgerOutput.session_ledger.summary.workspace_binding_count, 1);
    assert.equal(ledgerOutput.session_ledger.entries[0].session_id, 'sess_ledger');
    assert.equal(ledgerOutput.session_ledger.entries[0].mode, 'resume');
    assert.equal(ledgerOutput.session_ledger.entries[0].domain_id, 'redcube');
    assert.equal(ledgerOutput.session_ledger.entries[0].workspace_locator.absolute_path, repoRoot);
    assert.equal(ledgerOutput.session_ledger.entries[1].mode, 'ask');
    assert.equal(ledgerOutput.session_ledger.sessions.length, 1);
    assert.equal(ledgerOutput.session_ledger.sessions[0].session_id, 'sess_ledger');
    assert.equal(ledgerOutput.session_ledger.sessions[0].event_count, 2);
    assert.equal(ledgerOutput.session_ledger.sessions[0].domain_id, 'redcube');
    assert.deepEqual(ledgerOutput.session_ledger.sessions[0].modes, ['resume', 'ask']);
    assert.equal(ledgerOutput.session_ledger.sessions[0].resource_totals.samples_captured, 2);
    assert.equal(ledgerOutput.session_ledger.sessions[0].resource_totals.latest_sample_status, 'captured');
    assert.equal(ledgerOutput.session_ledger.sessions[0].resource_totals.latest_process_count, 2);
    assert.equal(ledgerOutput.session_ledger.sessions[0].resource_totals.latest_total_rss_kb, 174616);
    assert.equal(ledgerOutput.session_ledger.sessions[0].resource_totals.latest_total_cpu_percent, 4.4);
    assert.equal(ledgerOutput.session_ledger.sessions[0].workspace_locator.absolute_path, repoRoot);
    assert.equal(ledgerOutput.session_ledger.summary.session_aggregate_count, 1);

    const runtimeOutput = runCli(['status', 'runtime', '--limit', '2'], {
      OPL_HERMES_BIN: hermesPath,
      OPL_FRONTDESK_STATE_DIR: stateRoot,
      PATH: `${psFixture.fixtureRoot}:${process.env.PATH ?? ''}`,
    });
    assert.equal(runtimeOutput.runtime_status.managed_session_ledger.summary.entry_count, 2);
    assert.equal(runtimeOutput.runtime_status.managed_session_ledger.summary.session_aggregate_count, 1);
    assert.equal(runtimeOutput.runtime_status.managed_session_ledger.summary.domain_counts.redcube, 2);
    assert.equal(runtimeOutput.runtime_status.managed_session_ledger.sessions[0].session_id, 'sess_ledger');
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
    fs.rmSync(psFixture.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('web starts a local front-desk adapter and serves JSON root plus ask surfaces', async () => {
  const codexFixture = createCodexConfigFixture({
    model: 'gpt-5.4-web',
    reasoningEffort: 'xhigh',
  });
  const engineActionFixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-web-engine-action-'));
  const engineMarkerPath = path.join(engineActionFixtureRoot, 'codex-install.marker');
  const installScript = path.join(engineActionFixtureRoot, 'install-codex.sh');
  fs.writeFileSync(
    installScript,
    [
      '#!/usr/bin/env bash',
      'set -euo pipefail',
      `touch ${shellSingleQuote(engineMarkerPath)}`,
      'echo "web codex install fixture completed"',
      '',
    ].join('\n'),
    { mode: 0o755 },
  );
  const { fixtureRoot: codexRuntimeFixtureRoot, codexPath } = createFakeCodexFixture(`
if [ "$1" = "exec" ]; then
  cat <<'EOF'
{"type":"thread.started","thread_id":"web-ask-session"}
{"type":"turn.started"}
{"item":{"type":"command_execution","command":"opl handoff","status":"in_progress"}}
{"item":{"type":"agent_message","text":"WEB PILOT ASK RESPONSE"}}
{"type":"turn.completed"}
EOF
  exit 0
fi
echo "unexpected fake-codex args: $*" >&2
exit 1
`);
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
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-web-home-'));
  const stateDir = path.join(homeRoot, 'opl-state');
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-web-workspace-root-'));

  let child: ChildProcessByStdio<null, Readable, Readable> | null = null;

  try {
    const startup = await startCliServer(
      ['web', '--host', '127.0.0.1', '--port', '0', '--path', repoRoot, '--sessions-limit', '1'],
      {
        HOME: homeRoot,
        CODEX_HOME: codexFixture.codexHome,
        OPL_CODEX_BIN: codexPath,
        OPL_CODEX_INSTALL_COMMAND: installScript,
        OPL_HERMES_BIN: hermesPath,
        OPL_FRONTDESK_STATE_DIR: stateDir,
        PATH: `${psFixture.fixtureRoot}:${process.env.PATH ?? ''}`,
      },
    );
    child = startup.child;

    const oplApi = startup.payload.opl_api as {
      surface_id: string;
      entry_surface: string;
      runtime_modes: {
        interaction_mode: string;
        execution_mode: string;
      };
      resources: {
        system: string;
        engines: string;
        modules: string;
        agents: string;
        workspaces: string;
        sessions: string;
        progress: string;
        artifacts: string;
      };
      actions: {
        system: string;
        engines: string;
        modules: string;
        workspace_root: string;
        session_create: string;
        session_resume: string;
        session_logs: string;
      };
      debug: {
        dashboard: string;
        health: string;
      };
      listening: {
        base_url: string;
      };
    };

    assert.equal(startup.payload.version, 'g2');
    assert.equal(oplApi.surface_id, 'opl_product_api_bootstrap');
    assert.equal(oplApi.entry_surface, 'opl_product_api');
    assert.equal(oplApi.resources.system, '/api/opl/system');
    assert.equal(oplApi.resources.engines, '/api/opl/engines');
    assert.equal(oplApi.resources.modules, '/api/opl/modules');
    assert.equal(oplApi.resources.agents, '/api/opl/agents');
    assert.equal(oplApi.resources.workspaces, '/api/opl/workspaces');
    assert.equal(oplApi.resources.sessions, '/api/opl/sessions');
    assert.equal(oplApi.resources.progress, '/api/opl/progress');
    assert.equal(oplApi.resources.artifacts, '/api/opl/artifacts');
    assert.equal(oplApi.actions.system, '/api/opl/system/actions');
    assert.equal(oplApi.actions.engines, '/api/opl/engines/actions');
    assert.equal(oplApi.actions.modules, '/api/opl/modules/actions');
    assert.equal(oplApi.actions.workspace_root, '/api/opl/workspaces/root');
    assert.equal(oplApi.actions.session_create, '/api/opl/sessions');
    assert.equal(oplApi.actions.session_resume, '/api/opl/sessions/resume');
    assert.equal(oplApi.actions.session_logs, '/api/opl/sessions/logs');
    assert.equal(oplApi.runtime_modes.interaction_mode, 'codex');
    assert.equal(oplApi.runtime_modes.execution_mode, 'codex');

    const baseUrl = String(oplApi.listening.base_url);
    const page = await fetch(baseUrl);
    assert.equal(page.status, 200);
    assert.match(page.headers.get('content-type') ?? '', /application\/json/i);
    const rootPayload = await page.json() as {
      opl_api: {
        surface_id: string;
        mode: string;
        shell_integration_target: string;
        summary: string;
        recommended_gui_overlay: string;
        resources: {
          system: string;
          agents: string;
          sessions: string;
          progress: string;
          artifacts: string;
        };
        notes: string[];
      };
    };
    assert.equal(rootPayload.opl_api.surface_id, 'opl_product_api_root');
    assert.equal(rootPayload.opl_api.mode, 'api_only');
    assert.equal(rootPayload.opl_api.shell_integration_target, 'external_gui_overlay');
    assert.equal(rootPayload.opl_api.recommended_gui_overlay, 'opl-onyx-shell');
    assert.equal(rootPayload.opl_api.resources.system, '/api/opl/system');
    assert.equal(rootPayload.opl_api.resources.agents, '/api/opl/agents');
    assert.equal(rootPayload.opl_api.resources.sessions, '/api/opl/sessions');
    assert.equal(rootPayload.opl_api.resources.progress, '/api/opl/progress');
    assert.equal(rootPayload.opl_api.resources.artifacts, '/api/opl/artifacts');
    assert.match(rootPayload.opl_api.summary, /product API resources/i);
    assert.equal(rootPayload.opl_api.notes.includes('OPL main repo now stays headless and contract-first.'), true);

    const dashboardResponse = await fetch(`${baseUrl}/api/status/dashboard`);
    const dashboardPayload = await dashboardResponse.json();
    assert.equal(dashboardPayload.dashboard.product_api.local_web_status, 'pilot_landed');
    assert.equal(dashboardPayload.dashboard.projects.length, 4);
    assert.equal(dashboardPayload.dashboard.domain_manifests.summary.total_projects_count, 3);
    assert.equal(
      dashboardPayload.dashboard.product_api.hosted_runtime_readiness.status,
      'pilot_ready_not_managed',
    );
    assert.equal(
      dashboardPayload.dashboard.product_api.domain_entry_parity.summary.total_projects_count,
      3,
    );

    const healthResponse = await fetch(`${baseUrl}/api/health`);
    const healthPayload = await healthResponse.json();
    assert.equal(healthPayload.health.entry_surface, 'opl_local_web_product_api');
    assert.equal(healthPayload.health.status, 'ok');
    assert.equal(healthPayload.health.checks.gateway_service.loaded, true);

    const systemResponse = await fetch(`${baseUrl}/api/opl/system`);
    const systemPayload = await systemResponse.json();
    assert.equal(systemPayload.system.surface_id, 'opl_system');
    assert.equal(systemPayload.system.runtime_modes.interaction_mode, 'codex');
    assert.equal(systemPayload.system.workspace_root.health_status, 'missing');
    assert.equal(systemPayload.system.endpoints.engines, '/api/opl/engines');

    const enginesResponse = await fetch(`${baseUrl}/api/opl/engines`);
    const enginesPayload = await enginesResponse.json();
    assert.equal(enginesPayload.engines.surface_id, 'opl_engines');
    assert.equal(enginesPayload.engines.items.some((entry: { engine_id: string }) => entry.engine_id === 'codex'), true);
    assert.equal(enginesPayload.engines.items.some((entry: { engine_id: string }) => entry.engine_id === 'hermes'), true);

    const modulesResponse = await fetch(`${baseUrl}/api/opl/modules`);
    const modulesPayload = await modulesResponse.json();
    assert.equal(modulesPayload.modules.surface_id, 'opl_modules');
    assert.equal(
      modulesPayload.modules.items.some((entry: { module_id: string }) => entry.module_id === 'medautoscience'),
      true,
    );

    const agentsResponse = await fetch(`${baseUrl}/api/opl/agents`);
    const agentsPayload = await agentsResponse.json();
    assert.equal(agentsPayload.agents.surface_id, 'opl_agents');
    assert.equal(agentsPayload.agents.items.some((entry: { agent_id: string }) => entry.agent_id === 'general-chat'), true);
    assert.equal(agentsPayload.agents.items.some((entry: { agent_id: string }) => entry.agent_id === 'general-task'), true);
    const masAgent = agentsPayload.agents.items.find((entry: { agent_id: string }) => entry.agent_id === 'mas');
    assert.equal(masAgent?.requires_workspace, true);
    assert.deepEqual(masAgent?.locator_fields.required, ['cwd', 'profile_ref']);

    const workspacesResponse = await fetch(`${baseUrl}/api/opl/workspaces`);
    const workspacesPayload = await workspacesResponse.json();
    assert.equal(workspacesPayload.workspaces.surface_id, 'opl_workspaces');
    assert.equal(workspacesPayload.workspaces.summary.total_projects_count, 4);

    const systemInitializeResponse = await fetch(`${baseUrl}/api/opl/system/initialize`);
    const systemInitializePayload = await systemInitializeResponse.json();
    assert.equal(systemInitializePayload.system_initialize.surface_id, 'opl_system_initialize');
    assert.equal(systemInitializePayload.system_initialize.settings.interaction_mode, 'codex');
    assert.equal(systemInitializePayload.system_initialize.endpoints.system, '/api/opl/system');
    assert.equal(systemInitializePayload.system_initialize.endpoints.settings, '/api/opl/system/settings');

    const settingsResponse = await fetch(`${baseUrl}/api/opl/system/settings`);
    const settingsPayload = await settingsResponse.json();
    assert.equal(settingsPayload.system_settings.surface_id, 'opl_system_settings');
    assert.equal(settingsPayload.system_settings.interaction_mode, 'codex');
    assert.equal(settingsPayload.system_settings.execution_mode, 'codex');

    const settingsUpdateResponse = await fetch(`${baseUrl}/api/opl/system/settings`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        interaction_mode: 'hermes',
        execution_mode: 'codex',
      }),
    });
    const settingsUpdatePayload = await settingsUpdateResponse.json();
    assert.equal(settingsUpdatePayload.system_settings.interaction_mode, 'hermes');
    assert.equal(settingsUpdatePayload.system_settings.execution_mode, 'codex');

    const workspaceRootSetResponse = await fetch(`${baseUrl}/api/opl/workspaces/root`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        path: workspaceRoot,
      }),
    });
    const workspaceRootSetPayload = await workspaceRootSetResponse.json();
    assert.equal(workspaceRootSetPayload.workspace_root.selected_path, workspaceRoot);
    assert.equal(workspaceRootSetPayload.workspace_root.health_status, 'ready');

    const workspaceRootResponse = await fetch(`${baseUrl}/api/opl/workspaces/root`);
    const workspaceRootPayload = await workspaceRootResponse.json();
    assert.equal(workspaceRootPayload.workspace_root.selected_path, workspaceRoot);
    assert.equal(workspaceRootPayload.workspace_root.health_status, 'ready');

    const systemActionResponse = await fetch(`${baseUrl}/api/opl/system/actions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        action: 'update_channel',
        channel: 'preview',
      }),
    });
    const systemActionPayload = await systemActionResponse.json();
    assert.equal(systemActionPayload.system_action.action, 'update_channel');
    assert.equal(systemActionPayload.system_action.update_channel, 'preview');
    assert.equal(systemActionPayload.system_action.status, 'completed');

    const engineActionResponse = await fetch(`${baseUrl}/api/opl/engines/actions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        action: 'install',
        engine_id: 'codex',
      }),
    });
    const engineActionPayload = await engineActionResponse.json();
    assert.equal(engineActionPayload.engine_action.engine_id, 'codex');
    assert.equal(engineActionPayload.engine_action.action, 'install');
    assert.equal(engineActionPayload.engine_action.status, 'completed');
    assert.equal('frontdesk_environment' in engineActionPayload.engine_action, false);
    assert.equal(engineActionPayload.engine_action.system.surface_id, 'opl_system');
    assert.equal(engineActionPayload.engine_action.system.core_engines.codex.installed, true);
    assert.equal(fs.existsSync(engineMarkerPath), true);

    const progressResponse = await fetch(
      `${baseUrl}/api/opl/progress?workspace_path=${encodeURIComponent(repoRoot)}`,
    );
    const progressPayload = await progressResponse.json();
    assert.equal(progressPayload.progress.surface_id, 'opl_progress');
    assert.equal(progressPayload.progress.current_project.workspace_path, repoRoot);
    assert.ok(Array.isArray(progressPayload.progress.inspect_paths));
    assert.ok(Array.isArray(progressPayload.progress.task_cards.running));
    assert.ok(Array.isArray(progressPayload.progress.task_cards.waiting));
    assert.ok(Array.isArray(progressPayload.progress.task_cards.delivered));
    assert.equal(typeof progressPayload.progress.headline, 'string');
    assert.equal('study' in progressPayload.progress, true);
    const domainManifestResponse = await fetch(`${baseUrl}/api/domain/manifests`);
    const domainManifestPayload = await domainManifestResponse.json();
    assert.equal(domainManifestPayload.domain_manifests.summary.total_projects_count, 3);

    const hostedPackageOutput = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-web-hosted-package-'));
    try {
      const hostedBundleResponse = await fetch(`${baseUrl}/api/opl/web/bundle`);
      const hostedBundlePayload = await hostedBundleResponse.json();
      assert.equal(hostedBundlePayload.web_bundle.surface_id, 'opl_web_bundle');
      assert.equal(hostedBundlePayload.web_bundle.api_base_url, `${baseUrl}/api`);
      assert.equal(hostedBundlePayload.web_bundle.opl_api.resources.agents, '/api/opl/agents');

      const hostedPackageResponse = await fetch(`${baseUrl}/api/opl/web/package`, {
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
      assert.equal(hostedPackagePayload.web_package.surface_id, 'opl_web_package');
      assert.equal(hostedPackagePayload.web_package.public_origin, 'https://opl.example.com');
      assert.equal(hostedPackagePayload.web_package.entry_url, 'https://opl.example.com/pilot/opl/');
      assert.equal(fs.existsSync(hostedPackagePayload.web_package.assets.bundle_json), true);
      assert.equal(fs.existsSync(hostedPackagePayload.web_package.assets.launch_script), true);
    } finally {
      fs.rmSync(hostedPackageOutput, { recursive: true, force: true });
    }

    const sessionsResponse = await fetch(`${baseUrl}/api/opl/sessions?limit=1`);
    const sessionsPayload = await sessionsResponse.json();
    assert.equal(sessionsPayload.sessions.surface_id, 'opl_sessions');
    assert.equal(sessionsPayload.sessions.items.length, 1);
    assert.equal(sessionsPayload.sessions.items[0].session_id, 'sess_web');

    const oplProgressResponse = await fetch(`${baseUrl}/api/opl/progress?workspace_path=${encodeURIComponent(repoRoot)}`);
    const oplProgressPayload = await oplProgressResponse.json();
    assert.equal(oplProgressPayload.progress.surface_id, 'opl_progress');
    assert.equal(oplProgressPayload.progress.workspace_path, repoRoot);
    assert.equal(typeof oplProgressPayload.progress.headline, 'string');
    assert.equal(Array.isArray(oplProgressPayload.progress.task_cards.running), true);
    assert.equal(Array.isArray(oplProgressPayload.progress.task_cards.delivered), true);
    assert.equal(typeof oplProgressPayload.progress.recent_activity.preview, 'string');

    const oplArtifactsResponse = await fetch(`${baseUrl}/api/opl/artifacts?workspace_path=${encodeURIComponent(repoRoot)}`);
    const oplArtifactsPayload = await oplArtifactsResponse.json();
    assert.equal(oplArtifactsPayload.artifacts.surface_id, 'opl_artifacts');
    assert.equal(oplArtifactsPayload.artifacts.workspace_path, repoRoot);
    assert.equal(Array.isArray(oplArtifactsPayload.artifacts.deliverable_files), true);
    assert.equal(Array.isArray(oplArtifactsPayload.artifacts.supporting_files), true);
    assert.equal(
      oplArtifactsPayload.artifacts.summary.total_files_count,
      oplArtifactsPayload.artifacts.deliverable_files.length + oplArtifactsPayload.artifacts.supporting_files.length,
    );

    const resumeResponse = await fetch(`${baseUrl}/api/opl/sessions/resume`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        session_id: 'sess_web',
      }),
    });
    const resumePayload = await resumeResponse.json();
    assert.equal(resumePayload.session_resume.mode, 'resume');
    assert.match(resumePayload.session_resume.resume.output, /WEB PILOT RESUME OUTPUT/);

    const logsResponse = await fetch(`${baseUrl}/api/opl/sessions/logs?log_name=gateway&lines=20`);
    const logsPayload = await logsResponse.json();
    assert.equal(logsPayload.session_logs.mode, 'logs');
    assert.equal(logsPayload.session_logs.log_name, 'gateway');
    assert.match(logsPayload.session_logs.raw_output, /hosted-friendly front desk ready/);

    const previewResponse = await fetch(`${baseUrl}/api/opl/sessions`, {
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
    assert.equal(previewPayload.session_create.request_mode, 'dry_run');
    assert.equal(previewPayload.session_create.payload.product_entry.dry_run, true);
    assert.equal(previewPayload.session_create.payload.product_entry.executor_backend, 'hermes');
    assert.equal(previewPayload.session_create.payload.product_entry.routing.domain_id, 'redcube');

    const askResponse = await fetch(`${baseUrl}/api/opl/sessions`, {
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
    assert.equal(askPayload.session_create.request_mode, 'submitted');
    assert.equal(askPayload.session_create.payload.product_entry.entry_surface, 'opl_session_api');
    assert.doesNotMatch(askPayload.session_create.payload.product_entry.entry_surface, /frontdesk/i);
    assert.equal(askPayload.session_create.payload.product_entry.mode, 'ask');
    assert.equal(askPayload.session_create.payload.product_entry.dry_run, false);
    assert.equal(askPayload.session_create.payload.product_entry.execution_mode, 'async_accept');
    assert.equal(askPayload.session_create.payload.product_entry.executor_backend, 'hermes');
    assert.match(askPayload.session_create.payload.product_entry.task.task_id, /^task_/);
    assert.equal(askPayload.session_create.payload.product_entry.task.status, 'accepted');
    assert.equal(askPayload.session_create.payload.product_entry.task.executor_backend, 'hermes');
    assert.match(askPayload.session_create.payload.product_entry.task.summary, /后台|受理|执行/);

    const taskStatusResponse = await fetch(
      `${baseUrl}/api/opl/progress?task_id=${encodeURIComponent(String(askPayload.session_create.payload.product_entry.task.task_id))}&workspace_path=${encodeURIComponent(repoRoot)}`,
    );
    const taskStatusPayload = await taskStatusResponse.json();
    assert.equal(taskStatusPayload.progress.surface_id, 'opl_progress');
    assert.equal(taskStatusPayload.progress.task.task_id, askPayload.session_create.payload.product_entry.task.task_id);
    assert.equal(taskStatusPayload.progress.task.executor_backend, 'hermes');
    assert.match(taskStatusPayload.progress.task.status, /accepted|running|succeeded|failed/);
    assert.equal(typeof taskStatusPayload.progress.task.recent_output, 'string');

    const retiredAskResponse = await fetch(`${baseUrl}/api/ask`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        goal: 'retired route probe',
      }),
    });
    assert.equal(retiredAskResponse.status, 404);

    const retiredTaskStatusResponse = await fetch(`${baseUrl}/api/task-status?task_id=retired-task`);
    assert.equal(retiredTaskStatusResponse.status, 404);
  } finally {
    if (child) {
      await stopCliServer(child);
    }
    fs.rmSync(codexRuntimeFixtureRoot, { recursive: true, force: true });
    fs.rmSync(codexFixture.codexHome, { recursive: true, force: true });
    fs.rmSync(engineActionFixtureRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
    fs.rmSync(psFixture.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(homeRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test('web front-desk keeps a minimal machine surface while start api stays available for resolved domain manifests', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-web-start-state-'));
  const fixtures = loadFamilyManifestFixtures();
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const { fixtureRoot: hermesFixtureRoot, hermesPath } = createFakeHermesFixture(`
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
if [ "$1" = "sessions" ] && [ "$2" = "list" ]; then
  cat <<'EOF'
Preview                                            Last Active   Src    ID
───────────────────────────────────────────────────────────────────────────────────────────────
Resolved start session                             1m ago        cli    sess_start
EOF
  exit 0
fi
echo "unexpected fake-hermes args: $*" >&2
exit 1
`);
  const psFixture = createFakePsFixture(`27025 1 0.1 0.2 49616 22:46 /Users/test/.hermes/venv/bin/python -m hermes_cli.main gateway run --replace`);

  let child: ChildProcessByStdio<null, Readable, Readable> | null = null;

  try {
    runCli([
      'workspace',
      'bind',
      '--project',
      'redcube',
      '--path',
      repoRoot,
      '--entry-command',
      'redcube-ai frontdesk',
      '--manifest-command',
      buildManifestCommand(fixtures.redcube),
      '--entry-url',
      'http://127.0.0.1:3310/redcube',
    ], {
      OPL_FRONTDESK_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });

    const startup = await startCliServer(
      ['web', '--host', '127.0.0.1', '--port', '0', '--path', repoRoot, '--sessions-limit', '1'],
      {
        OPL_CONTRACTS_DIR: fixtureContractsRoot,
        OPL_FRONTDESK_STATE_DIR: stateRoot,
        OPL_HERMES_BIN: hermesPath,
        PATH: `${psFixture.fixtureRoot}:${process.env.PATH ?? ''}`,
      },
    );
    child = startup.child;

    const baseUrl = String((startup.payload.opl_api as { listening: { base_url: string } }).listening.base_url);
    const page = await fetch(baseUrl);
    assert.equal(page.status, 200);
    assert.match(page.headers.get('content-type') ?? '', /application\/json/i);
    const rootPayload = await page.json() as {
      opl_api: {
        surface_id: string;
        mode: string;
        shell_integration_target: string;
        recommended_gui_overlay: string;
        resources: {
          system: string;
        };
        actions: {
          start: string;
        };
      };
    };
    assert.equal(rootPayload.opl_api.surface_id, 'opl_product_api_root');
    assert.equal(rootPayload.opl_api.mode, 'api_only');
    assert.equal(rootPayload.opl_api.shell_integration_target, 'external_gui_overlay');
    assert.equal(rootPayload.opl_api.recommended_gui_overlay, 'opl-onyx-shell');
    assert.equal(rootPayload.opl_api.resources.system, '/api/opl/system');
    assert.equal(rootPayload.opl_api.actions.start, '/api/opl/start');

    const startResponse = await fetch(`${baseUrl}/api/opl/start?project=redcube`);
    assert.equal(startResponse.status, 200);
    const startPayload = await startResponse.json();
    assert.equal(startPayload.product_entry_start.surface_kind, 'opl_product_entry_start');
    assert.equal(startPayload.product_entry_start.project_id, 'redcube');
    assert.equal(startPayload.product_entry_start.recommended_mode_id, 'open_frontdesk');
    assert.equal(startPayload.product_entry_start.selected_mode_id, 'open_frontdesk');
    assert.equal(startPayload.product_entry_start.selected_mode.command, 'redcube product frontdesk');
    assert.deepEqual(startPayload.product_entry_start.human_gate_ids, ['redcube_operator_review_gate']);

    const modeResponse = await fetch(`${baseUrl}/api/opl/start?project=redcube&mode=opl_bridge_handoff`);
    assert.equal(modeResponse.status, 200);
    const modePayload = await modeResponse.json();
    assert.equal(modePayload.product_entry_start.selected_mode_id, 'opl_bridge_handoff');
    assert.equal(modePayload.product_entry_start.selected_mode.command, 'redcube product federate');

    const launchResponse = await fetch(`${baseUrl}/api/opl/domain-launch`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        project_id: 'redcube',
        dry_run: true,
      }),
    });
    assert.equal(launchResponse.status, 200);
    const launchPayload = await launchResponse.json();
    assert.equal(launchPayload.domain_entry_launch.project_id, 'redcube');
    assert.equal(launchPayload.domain_entry_launch.selected_strategy, 'open_url');
    assert.equal(launchPayload.domain_entry_launch.launch_status, 'preview_only');
    assert.equal(launchPayload.domain_entry_launch.direct_entry_locator.url, 'http://127.0.0.1:3310/redcube');
  } finally {
    if (child) {
      child.kill('SIGTERM');
      await once(child, 'exit');
    }
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
    fs.rmSync(hermesFixtureRoot, { recursive: true, force: true });
    fs.rmSync(psFixture.fixtureRoot, { recursive: true, force: true });
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
    const output = runCli(['session', 'logs', 'gateway', '--lines', '20'], {
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

test('runtime repair-gateway reinstalls and rechecks the gateway service', () => {
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
    const output = runCli(['runtime', 'repair-gateway'], {
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
  assert.equal(output.product_entry.routing.status, 'routed');
  assert.equal(output.product_entry.routing.domain_id, 'medautogrant');
  assert.equal(output.product_entry.routing.workstream_id, 'grant_ops');
  assert.equal(output.product_entry.hermes.seed_command_preview[0], 'hermes');
  assert.ok(output.product_entry.hermes.seed_command_preview.includes('--query'));
  assert.deepEqual(output.product_entry.hermes.resume_command_preview, [
    'hermes',
    '--resume',
    '<session_id>',
  ]);
});

test('contract validate exposes env contract-root provenance', () => {
  const { fixtureRoot, fixtureContractsRoot } = createContractsFixtureRoot(() => {});

  try {
    const output = runCli(['contract', 'validate'], {
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });

    assert.equal(output.validation.contracts_dir, fixtureContractsRoot);
    assert.equal(output.validation.contracts_root_source, 'env');
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('contract validate exposes cli-flag contract-root provenance', () => {
  const { fixtureRoot, fixtureContractsRoot } = createContractsFixtureRoot(() => {});

  try {
    const output = runCli([
      '--contracts-dir',
      fixtureContractsRoot,
      'contract',
      'validate',
    ]);

    assert.equal(output.validation.contracts_dir, fixtureContractsRoot);
    assert.equal(output.validation.contracts_root_source, 'cli_flag');
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('contract validate falls back to the active CLI repo contracts when cwd has no contract root', () => {
  const unrelatedCwd = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-cli-entry-cwd-'));

  try {
    const output = runCliInCwd(['contract', 'validate'], unrelatedCwd);

    assert.equal(output.validation.contracts_dir, contractsDir);
    assert.equal(output.validation.contracts_root_source, 'cli_entry');
  } finally {
    fs.rmSync(unrelatedCwd, { recursive: true, force: true });
  }
});

test('contract validate resolves repo contracts through a symlinked CLI entry path', () => {
  const unrelatedCwd = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-cli-entry-link-cwd-'));
  const linkedCliRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-cli-entry-link-'));
  const linkedCliPath = path.join(linkedCliRoot, 'opl-linked.ts');

  try {
    fs.symlinkSync(cliPath, linkedCliPath);
    const output = runCliViaEntryPathInCwd(linkedCliPath, ['contract', 'validate'], unrelatedCwd);

    assert.equal(output.validation.contracts_dir, contractsDir);
    assert.equal(output.validation.contracts_root_source, 'cli_entry');
  } finally {
    fs.rmSync(unrelatedCwd, { recursive: true, force: true });
    fs.rmSync(linkedCliRoot, { recursive: true, force: true });
  }
});

test('contract validate surfaces stable missing-file errors with cwd provenance', () => {
  const { fixtureRoot, fixtureContractsRoot } = createContractsFixtureRoot((contractsRoot) => {
    fs.rmSync(path.join(contractsRoot, 'task-topology.json'));
  });

  try {
    const { status, payload } = runCliFailureInCwd(['contract', 'validate'], fixtureRoot);

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

test('contract validate surfaces stable invalid-json errors', () => {
  const { fixtureRoot, fixtureContractsRoot } = createContractsFixtureRoot((contractsRoot) => {
    fs.writeFileSync(path.join(contractsRoot, 'domains.json'), '{ invalid json\n');
  });

  try {
    const { status, payload } = runCliFailure(['contract', 'validate'], {
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

test('contract validate surfaces stable shape-invalid errors with cli-flag provenance', () => {
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
      'contract',
      'validate',
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
    'contract',
    'validate',
  ]);

  assert.equal(payload.version, 'g2');
  assert.equal(payload.error.code, 'contract_file_missing');
  assert.equal(payload.error.exit_code, 3);
  assert.equal(status, 3);
});

test('list-workstreams returns admitted workstream summaries', () => {
  const output = runCli(['contract', 'workstreams']);

  assert.deepEqual(output, {
    version: 'g2',
    contracts_context: {
      contracts_dir: contractsDir,
      contracts_root_source: 'cwd',
    },
    workstreams: [
      {
        workstream_id: 'grant_ops',
        label: 'Grant Ops',
        status: 'emerging',
        domain_id: 'medautogrant',
      },
      {
        workstream_id: 'research_ops',
        label: 'Research Foundry',
        status: 'active',
        domain_id: 'medautoscience',
      },
      {
        workstream_id: 'presentation_ops',
        label: 'Presentation Foundry',
        status: 'emerging',
        domain_id: 'redcube',
      },
    ],
  });
});

test('contract workstream returns the full registered workstream meaning', () => {
  const output = runCli(['contract', 'workstream', 'presentation_ops']);

  assert.equal(output.version, 'g2');
  assertContractsContext(output, 'cwd');
  assert.equal(output.workstream.workstream_id, 'presentation_ops');
  assert.equal(output.workstream.domain_id, 'redcube');
  assert.deepEqual(output.workstream.primary_families, ['ppt_deck']);
});

test('contract domains returns the registered domain gateway summaries', () => {
  const output = runCli(['contract', 'domains']);

  assert.deepEqual(output, {
    version: 'g2',
    contracts_context: {
      contracts_dir: contractsDir,
      contracts_root_source: 'cwd',
    },
    domains: [
      {
        domain_id: 'medautogrant',
        gateway_surface: 'Grant Ops Gateway',
        owned_workstreams: ['grant_ops'],
      },
      {
        domain_id: 'medautoscience',
        gateway_surface: 'Research Foundry Gateway',
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

test('contract surfaces returns the public gateway surface summaries', () => {
  const output = runCli(['contract', 'surfaces']);

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

test('contract domain returns the full registered domain meaning', () => {
  const output = runCli(['contract', 'domain', 'redcube']);

  assert.equal(output.version, 'g2');
  assertContractsContext(output, 'cwd');
  assert.equal(output.domain.domain_id, 'redcube');
  assert.equal(output.domain.project, 'redcube-ai');
  assert.deepEqual(output.domain.non_opl_families, ['xiaohongshu']);
});

test('contract surface returns the full registered public surface meaning', () => {
  const output = runCli(['contract', 'surface', 'opl_gateway_contract_hub']);

  assert.equal(output.version, 'g2');
  assertContractsContext(output, 'cwd');
  assert.equal(output.surface.surface_id, 'opl_gateway_contract_hub');
  assert.equal(output.surface.category_id, 'opl_contract_surface');
  assert.match(output.surface.boundary_role, /contract_hub|machine_readable_contract_hub/);
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
    'domain',
    'resolve-request',
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
    'domain',
    'resolve-request',
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

test('resolveRequestSurface routes grant work to medautogrant', () => {
  const output = runCli([
    'domain',
    'resolve-request',
    '--intent',
    'plan',
    '--target',
    'deliverable',
    '--goal',
    'Build a formal grant proposal operating lane from the supplied topic brief.',
  ]);

  assertContractsContext(output, 'cwd');
  assert.equal(output.resolution.status, 'routed');
  assert.equal(output.resolution.domain_id, 'medautogrant');
  assert.equal(output.resolution.workstream_id, 'grant_ops');
  assert.equal(output.resolution.entry_surface, 'domain_gateway');
});

test('resolveRequestSurface returns ambiguous_task with explicit boundary evidence when the primary deliverable is unclear', () => {
  const output = runCli([
    'domain',
    'resolve-request',
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

test('domain explain-boundary explains xiaohongshu non-equivalence', () => {
  const output = runCli([
    'domain',
    'explain-boundary',
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
  assert.match(output.boundary_explanation.reason, /not automatically equal presentation foundry/i);
});

test('domain explain-boundary explains under-definition requests', () => {
  const output = runCli([
    'domain',
    'explain-boundary',
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
  assert.equal(output.help.usage, 'opl [command ...|request...] [args]');
  assert.ok(
    ['contract workstreams', 'contract workstream', 'contract domains', 'contract domain', 'contract surfaces', 'contract surface', 'domain resolve-request', 'domain explain-boundary'].every((command) =>
      output.help.commands.some((entry: { command: string }) => entry.command === command),
    ),
  );
  assert.ok(
    output.help.commands.some((entry: { command: string }) => entry.command === 'contract validate'),
  );
  assert.ok(
    ['service install', 'service status', 'service open'].every((command) =>
      output.help.commands.some((entry: { command: string }) => entry.command === command),
    ),
  );
  assert.equal(
    output.help.commands.some((entry: { command: string }) => entry.command === 'frontdesk bootstrap'),
    false,
  );
  assert.ok(
    output.help.commands.some((entry: { command: string }) => entry.command === 'system'),
  );
  assert.ok(
    output.help.commands.some(
      (entry: { command: string; examples: string[] }) =>
        entry.command === 'contract validate'
        && entry.examples.includes('opl contract validate'),
    ),
  );
  assert.ok(output.help.examples.includes('opl contract handoff-envelope "Prepare a defense-ready slide deck." --preferred-family ppt_deck'));
  assert.ok(
    output.help.examples.includes(
      'opl domain explain-boundary --intent create --target deliverable --goal "Prepare a xiaohongshu campaign pack." --preferred-family xiaohongshu',
    ),
  );
});

test('root --help returns the same machine-readable help payload', () => {
  const output = runCli(['--help']);

  assertNoContractsProvenance(output);
  assert.equal(output.version, 'g2');
  assert.equal(output.help.command, null);
  assert.equal(output.help.usage, 'opl [command ...|request...] [args]');
  assert.ok(
    output.help.commands.some((entry: { command: string }) => entry.command === 'contract domain'),
  );
});

test('command --help returns command-scoped usage and examples', () => {
  const output = runCli(['contract', 'domain', '--help']);

  assertNoContractsProvenance(output);
  assert.equal(output.version, 'g2');
  assert.equal(output.help.command, 'contract domain');
  assert.equal(output.help.usage, 'opl contract domain <domain_id>');
  assert.ok(output.help.examples.includes('opl contract domain redcube'));
});

test('service install --help returns command-scoped usage and examples', () => {
  const output = runCli(['service', 'install', '--help']);

  assertNoContractsProvenance(output);
  assert.equal(output.version, 'g2');
  assert.equal(output.help.command, 'service install');
  assert.match(output.help.usage, /opl service install/);
  assert.ok(output.help.examples.includes('opl service install --port 8787'));
});

test('help <command> returns the same payload as command --help', () => {
  const viaHelp = runCli(['help', 'contract', 'domain']);
  const viaFlag = runCli(['contract', 'domain', '--help']);

  assert.deepEqual(viaHelp, viaFlag);
});

test('domain explain-boundary --help advertises the xiaohongshu family-boundary example', () => {
  const output = runCli(['domain', 'explain-boundary', '--help']);

  assertNoContractsProvenance(output);
  assert.equal(output.version, 'g2');
  assert.equal(output.help.command, 'domain explain-boundary');
  assert.ok(
    output.help.examples.includes(
      'opl domain explain-boundary --intent create --target deliverable --goal "Prepare a xiaohongshu campaign pack." --preferred-family xiaohongshu',
    ),
  );
});

test('command help literal returns a usage error instead of command-scoped help', () => {
  const { status, payload } = runCliFailure(['contract', 'domain', 'help']);

  assert.equal(payload.version, 'g2');
  assert.equal(payload.error.code, 'cli_usage_error');
  assert.equal(payload.error.exit_code, 2);
  assert.equal(status, 2);
  assert.equal(payload.error.details.help_usage, 'opl contract domain --help');
});

test('CLI usage errors expose machine-readable usage guidance', () => {
  const { status, payload } = runCliFailure(['contract', 'domain']);

  assertNoContractsProvenance(payload);
  assert.equal(payload.version, 'g2');
  assert.equal(payload.error.code, 'cli_usage_error');
  assert.equal(payload.error.exit_code, 2);
  assert.equal(status, 2);
  assert.equal(payload.error.details.usage, 'opl contract domain <domain_id>');
  assert.ok(Array.isArray(payload.error.details.examples));
  assert.ok(payload.error.details.examples.includes('opl contract domain redcube'));
});

test('CLI returns stable JSON errors for unknown ids', () => {
  const { status, payload } = runCliFailure(['contract', 'domain', 'unknown']);

  assert.equal(payload.version, 'g2');
  assert.equal(payload.error.code, 'domain_not_found');
  assert.equal(payload.error.exit_code, 4);
  assert.equal(status, 4);
});

test('CLI returns stable JSON errors for unknown surface ids', () => {
  const { status, payload } = runCliFailure(['contract', 'surface', 'unknown_surface']);

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
  assert.ok(payload.error.details.commands.includes('contract validate'));
  assert.equal(payload.error.details.command, 'unknown-command');
  assert.equal(payload.error.details.usage, 'opl help');
});
