import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync, type ChildProcessByStdio } from 'node:child_process';
import { once } from 'node:events';
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
      'step:federated_handoff',
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
      'step:federated_handoff',
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

function createFakeDockerFixture() {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-docker-fixture-'));
  const stateDir = path.join(fixtureRoot, 'state');
  fs.mkdirSync(stateDir, { recursive: true });
  const dockerPath = path.join(fixtureRoot, 'docker');
  fs.writeFileSync(
    dockerPath,
    `#!/usr/bin/env bash
set -euo pipefail
STATE_DIR="${stateDir}"
CALLS="$STATE_DIR/calls.log"
mkdir -p "$STATE_DIR"
printf '%s\\n' "$*" >> "$CALLS"

if [[ "$1" != "compose" ]]; then
  echo "unexpected docker args: $*" >&2
  exit 1
fi

if [[ "$*" == *" up "* ]]; then
  touch "$STATE_DIR/running"
  exit 0
fi

if [[ "$*" == *" down"* ]]; then
  rm -f "$STATE_DIR/running"
  exit 0
fi

if [[ "$*" == *" ps "* ]]; then
  if [[ -f "$STATE_DIR/running" ]]; then
    cat <<'EOF'
[{"Service":"librechat","State":"running","Status":"Up 5 seconds"},{"Service":"mongodb","State":"running","Status":"Up 5 seconds"},{"Service":"meilisearch","State":"running","Status":"Up 5 seconds"},{"Service":"rag_api","State":"running","Status":"Up 5 seconds"},{"Service":"caddy","State":"running","Status":"Up 5 seconds"}]
EOF
  else
    echo '[]'
  fi
  exit 0
fi

echo "unexpected docker compose args: $*" >&2
exit 1
`,
    { mode: 0o755 },
  );

  return {
    fixtureRoot,
    dockerPath,
    callsPath: path.join(stateDir, 'calls.log'),
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

type FakePaperclipRequest = {
  method: string;
  path: string;
  headers: IncomingHttpHeaders;
  body: Record<string, unknown> | null;
};

type FakePaperclipIssue = {
  id: string;
  companyId: string;
  title: string;
  status: string;
  priority: string;
  projectId: unknown;
  projectWorkspaceId: unknown;
  executionWorkspacePreference: unknown;
};

type FakePaperclipApproval = {
  id: string;
  companyId: string;
  type: unknown;
  status: string;
  decision: string | null;
  decidedAt: string | null;
  payload: Record<string, unknown>;
  issueIds: string[];
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
  const issues = new Map<string, FakePaperclipIssue>();
  const approvals = new Map<string, FakePaperclipApproval>();
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
      const issue: FakePaperclipIssue = {
        id: `issue-${requests.filter((entry) => entry.path.endsWith('/issues')).length}`,
        companyId,
        title: String(body?.title ?? 'Untitled issue'),
        status: String(body?.status ?? 'backlog'),
        priority: String(body?.priority ?? 'medium'),
        projectId: body?.projectId ?? null,
        projectWorkspaceId: body?.projectWorkspaceId ?? null,
        executionWorkspacePreference: body?.executionWorkspacePreference ?? null,
      };
      issues.set(issue.id, issue);
      response.statusCode = 201;
      response.end(JSON.stringify(issue));
      return;
    }

    if (request.method === 'GET' && /^\/api\/companies\/[^/]+\/issues\/[^/]+$/.test(url.pathname)) {
      const issueId = url.pathname.split('/')[5] ?? 'unknown-issue';
      const issue = issues.get(issueId);
      if (!issue) {
        response.statusCode = 404;
        response.end(JSON.stringify({
          error: 'not_found',
          path: url.pathname,
          issueId,
        }));
        return;
      }

      response.statusCode = 200;
      response.end(JSON.stringify(issue));
      return;
    }

    if (request.method === 'POST' && /^\/api\/companies\/[^/]+\/approvals$/.test(url.pathname)) {
      const companyId = url.pathname.split('/')[3] ?? 'unknown-company';
      const approval: FakePaperclipApproval = {
        id: `approval-${requests.filter((entry) => entry.path.endsWith('/approvals')).length}`,
        companyId,
        type: body?.type ?? null,
        status: 'pending',
        decision: null,
        decidedAt: null,
        payload:
          body?.payload && typeof body.payload === 'object' && !Array.isArray(body.payload)
            ? body.payload as Record<string, unknown>
            : {},
        issueIds: Array.isArray(body?.issueIds) ? body.issueIds.map((value) => String(value)) : [],
      };
      approvals.set(approval.id, approval);
      response.statusCode = 201;
      response.end(JSON.stringify(approval));
      return;
    }

    if (request.method === 'GET' && /^\/api\/companies\/[^/]+\/approvals\/[^/]+$/.test(url.pathname)) {
      const approvalId = url.pathname.split('/')[5] ?? 'unknown-approval';
      const approval = approvals.get(approvalId);
      if (!approval) {
        response.statusCode = 404;
        response.end(JSON.stringify({
          error: 'not_found',
          path: url.pathname,
          approvalId,
        }));
        return;
      }

      response.statusCode = 200;
      response.end(JSON.stringify(approval));
      return;
    }

    if (request.method === 'POST' && /^\/api\/companies\/[^/]+\/issues\/[^/]+\/comments$/.test(url.pathname)) {
      const companyId = url.pathname.split('/')[3] ?? 'unknown-company';
      const issueId = url.pathname.split('/')[5] ?? 'unknown-issue';
      response.statusCode = 201;
      response.end(JSON.stringify({
        id: `comment-${requests.filter((entry) => entry.path.endsWith('/comments')).length}`,
        companyId,
        issueId,
        body: body?.body ?? null,
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
    issues,
    approvals,
    baseUrl: `http://127.0.0.1:${address.port}`,
    setIssueStatus(issueId: string, status: string) {
      const issue = issues.get(issueId);
      assert.ok(issue);
      issue.status = status;
    },
    setApprovalDecision(
      approvalId: string,
      status: string,
      decision: string,
      decidedAt = '2026-04-13T12:00:00.000Z',
    ) {
      const approval = approvals.get(approvalId);
      assert.ok(approval);
      approval.status = status;
      approval.decision = decision;
      approval.decidedAt = decidedAt;
    },
  };
}

async function startFakePaperclipPilotServer(options: {
  companyId?: string;
  companyName?: string;
  projectId?: string;
  projectName?: string;
  workspaceId?: string;
  workspaceName?: string;
  workspacePath?: string;
} = {}) {
  const requests: FakePaperclipRequest[] = [];
  const companyId = options.companyId ?? 'company-local-pilot';
  const projectId = options.projectId ?? 'project-mas';
  const workspaceId = options.workspaceId ?? 'workspace-pituitary';
  const workspacePath = options.workspacePath ?? repoRoot;
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

    if (request.method === 'GET' && url.pathname === '/api/health') {
      response.statusCode = 200;
      response.end(JSON.stringify({
        status: 'ok',
        deploymentMode: 'local_trusted',
        deploymentExposure: 'private',
        authReady: true,
      }));
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/companies') {
      response.statusCode = 200;
      response.end(JSON.stringify([
        {
          id: companyId,
          name: options.companyName ?? 'FengGao Lab',
        },
      ]));
      return;
    }

    if (request.method === 'GET' && url.pathname === `/api/companies/${companyId}/projects`) {
      response.statusCode = 200;
      response.end(JSON.stringify([
        {
          id: projectId,
          companyId,
          name: options.projectName ?? 'Med Auto Science Papers',
          primaryWorkspace: {
            id: 'workspace-mas-core',
            cwd: '/Users/gaofeng/workspace/med-autoscience',
          },
        },
      ]));
      return;
    }

    if (request.method === 'GET' && url.pathname === `/api/projects/${projectId}/workspaces`) {
      response.statusCode = 200;
      response.end(JSON.stringify([
        {
          id: 'workspace-mas-core',
          name: 'Med Auto Science Core',
          cwd: '/Users/gaofeng/workspace/med-autoscience',
        },
        {
          id: workspaceId,
          name: options.workspaceName ?? 'Pituitary Workspace',
          cwd: workspacePath,
        },
      ]));
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
    throw new Error('Failed to bind fake Paperclip pilot server.');
  }

  return {
    server,
    requests,
    baseUrl: `http://127.0.0.1:${address.port}`,
    companyId,
    projectId,
    workspaceId,
  };
}

async function startFakeFrontDeskApiServer() {
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

    if (request.method === 'GET' && url.pathname === '/api/dashboard') {
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

    if (request.method === 'GET' && url.pathname === '/api/runtime-status') {
      response.statusCode = 200;
      response.end(JSON.stringify({
        runtime_status: {
          limit: Number(url.searchParams.get('limit') ?? '0'),
          runs: [],
        },
      }));
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/frontdesk-readiness') {
      response.statusCode = 200;
      response.end(JSON.stringify({
        frontdesk_readiness: {
          workspace_path: url.searchParams.get('path'),
          sessions_limit: Number(url.searchParams.get('sessions_limit') ?? '0'),
        },
      }));
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/workspace-status') {
      response.statusCode = 200;
      response.end(JSON.stringify({
        workspace_status: {
          workspace_path: url.searchParams.get('path'),
        },
      }));
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/paperclip/control-plane') {
      response.statusCode = 200;
      response.end(JSON.stringify({
        paperclip_control_plane: {
          workspace_path: url.searchParams.get('path'),
          sessions_limit: Number(url.searchParams.get('sessions_limit') ?? '0'),
        },
      }));
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/domain-manifests') {
      response.statusCode = 200;
      response.end(JSON.stringify({
        domain_manifests: {
          projects: [],
        },
      }));
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/workspace-catalog') {
      response.statusCode = 200;
      response.end(JSON.stringify({
        workspace_catalog: {
          summary: {
            active_projects_count: 1,
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
        },
      }));
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/workspace-activate') {
      activeWorkspacePath = String(body?.workspace_path ?? activeWorkspacePath);
      response.statusCode = 200;
      response.end(JSON.stringify({
        workspace_catalog: {
          action: 'activate',
          binding: {
            project_id: String(body?.project_id ?? 'unknown'),
            workspace_path: activeWorkspacePath,
            status: 'active',
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
    throw new Error('Failed to bind fake frontdesk API server.');
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
  assert.ok(
    output.help.commands.some((entry: { command: string }) => entry.command === 'frontdesk-domain-wiring'),
  );
  assert.ok(
    output.help.commands.some((entry: { command: string }) => entry.command === 'frontdesk-readiness'),
  );
  assert.ok(
    output.help.commands.some((entry: { command: string }) => entry.command === 'launch-domain'),
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
  assert.equal(
    output.frontdesk_manifest.hosted_runtime_readiness.surface_kind,
    'opl_hosted_runtime_readiness',
  );
  assert.equal(output.frontdesk_manifest.hosted_runtime_readiness.status, 'pilot_ready_not_managed');
  assert.equal(
    output.frontdesk_manifest.hosted_runtime_readiness.shell_integration_target,
    'librechat_first',
  );
  assert.equal(
    output.frontdesk_manifest.hosted_runtime_readiness.managed_hosted_runtime_landed,
    false,
  );
  assert.equal(
    output.frontdesk_manifest.hosted_runtime_readiness.hosted_pilot_bundle_landed,
    true,
  );
  assert.equal(
    output.frontdesk_manifest.hosted_runtime_readiness.librechat_pilot_package_landed,
    true,
  );
  assert.equal(output.frontdesk_manifest.domain_wiring_surface.surface_id, 'opl_frontdesk_domain_wiring');
  assert.equal(output.frontdesk_manifest.domain_wiring_surface.endpoint, '/api/frontdesk-domain-wiring');
  assert.equal(output.frontdesk_manifest.domain_wiring_surface.summary.total_projects_count, 2);
  assert.equal(output.frontdesk_manifest.domain_wiring_surface.summary.recommended_entry_surfaces_count, 0);
  assert.equal(output.frontdesk_manifest.frontdesk_readiness_surface.surface_id, 'opl_frontdesk_readiness');
  assert.equal(output.frontdesk_manifest.frontdesk_readiness_surface.endpoint, '/api/frontdesk-readiness');
});

test('frontdesk-domain-wiring exposes a dedicated hosted-friendly family wiring surface', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-domain-wiring-state-'));

  try {
    const output = runCli(['frontdesk-domain-wiring'], {
      OPL_FRONTDESK_STATE_DIR: stateRoot,
    });

    assert.equal(output.version, 'g2');
    assert.equal(output.frontdesk_domain_wiring.surface_id, 'opl_frontdesk_domain_wiring');
    assert.equal(output.frontdesk_domain_wiring.entry_surface, 'opl_local_web_frontdesk_pilot');
    assert.equal(output.frontdesk_domain_wiring.runtime_substrate, 'external_hermes_kernel');
    assert.equal(output.frontdesk_domain_wiring.hosted_runtime_readiness.surface_kind, 'opl_hosted_runtime_readiness');
    assert.equal(output.frontdesk_domain_wiring.domain_entry_parity.surface_kind, 'opl_domain_entry_parity');
    assert.equal(output.frontdesk_domain_wiring.domain_binding_parity.surface_kind, 'opl_domain_binding_parity');
    assert.equal(output.frontdesk_domain_wiring.summary.total_projects_count, 2);
    assert.equal(output.frontdesk_domain_wiring.domain_entry_parity.summary.blocked_projects_count, 2);
    assert.equal(output.frontdesk_domain_wiring.domain_binding_parity.summary.total_projects_count, 2);
    assert.equal(output.frontdesk_domain_wiring.domain_binding_parity.summary.active_projects_count, 0);
    assert.equal(output.frontdesk_domain_wiring.domain_binding_parity.summary.manifest_ready_projects_count, 0);
    assert.equal(output.frontdesk_domain_wiring.summary.recommended_entry_surfaces_count, 0);
    assert.equal(output.frontdesk_domain_wiring.endpoints.workspace_catalog, '/api/workspace-catalog');
    assert.equal(output.frontdesk_domain_wiring.endpoints.workspace_bind, '/api/workspace-bind');
    assert.equal(output.frontdesk_domain_wiring.endpoints.workspace_activate, '/api/workspace-activate');
    assert.equal(output.frontdesk_domain_wiring.endpoints.workspace_archive, '/api/workspace-archive');
    assert.deepEqual(output.frontdesk_domain_wiring.recommended_entry_surfaces, []);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('frontdesk-readiness exposes one operator-facing readiness surface for local service and domain entry state', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-frontdesk-readiness-home-'));
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
OPL readiness session                              1m ago        cli    sess_ready
EOF
  exit 0
fi
echo "unexpected fake-hermes args: $*" >&2
exit 1
`);
  const psFixture = createFakePsFixture(`27025 1 0.1 0.2 49616 22:46 /Users/test/.hermes/venv/bin/python -m hermes_cli.main gateway run --replace`);

  try {
    const output = runCli(['frontdesk-readiness', '--path', repoRoot, '--sessions-limit', '1'], {
      HOME: homeRoot,
      OPL_HERMES_BIN: hermesPath,
      PATH: `${psFixture.fixtureRoot}:${process.env.PATH ?? ''}`,
    });

    assert.equal(output.version, 'g2');
    assert.equal(output.frontdesk_readiness.surface_id, 'opl_frontdesk_readiness');
    assert.equal(output.frontdesk_readiness.runtime_substrate, 'external_hermes_kernel');
    assert.equal(output.frontdesk_readiness.local_service.installed, false);
    assert.equal(output.frontdesk_readiness.local_service.loaded, false);
    assert.equal(output.frontdesk_readiness.local_service.health.status, 'not_installed');
    assert.equal(output.frontdesk_readiness.hosted_runtime_readiness.status, 'pilot_ready_not_managed');
    assert.equal(output.frontdesk_readiness.summary.total_projects_count, 2);
    assert.equal(output.frontdesk_readiness.summary.usable_now_projects_count, 0);
    assert.equal(output.frontdesk_readiness.summary.good_to_use_now_projects_count, 0);
    assert.equal(output.frontdesk_readiness.summary.fully_automatic_projects_count, 0);
    assert.equal(output.frontdesk_readiness.summary.ready_to_try_now_projects_count, 0);
    assert.equal(output.frontdesk_readiness.summary.ready_for_opl_start_count, 0);
    assert.equal(output.frontdesk_readiness.summary.ready_for_domain_handoff_count, 0);
    assert.equal(output.frontdesk_readiness.endpoints.frontdesk_readiness, '/api/frontdesk-readiness');
    assert.equal(output.frontdesk_readiness.endpoints.frontdesk_domain_wiring, '/api/frontdesk-domain-wiring');
    assert.equal(output.frontdesk_readiness.projects[0].manifest_status, 'not_bound');
    assert.equal(output.frontdesk_readiness.projects[0].entry_parity_status, 'blocked');
    assert.equal(output.frontdesk_readiness.projects[0].usable_now, false);
    assert.equal(output.frontdesk_readiness.projects[0].recommended_start_command, null);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
    fs.rmSync(psFixture.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
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
  assert.equal(
    output.hosted_pilot_bundle.hosted_runtime_readiness.surface_kind,
    'opl_hosted_runtime_readiness',
  );
  assert.equal(output.hosted_pilot_bundle.hosted_runtime_readiness.status, 'pilot_ready_not_managed');
  assert.equal(
    output.hosted_pilot_bundle.hosted_runtime_readiness.hosted_pilot_bundle_landed,
    true,
  );
  assert.equal(
    output.hosted_pilot_bundle.hosted_runtime_readiness.self_hostable_pilot_package_landed,
    true,
  );
  assert.equal(output.hosted_pilot_bundle.domain_wiring_surface.surface_id, 'opl_frontdesk_domain_wiring');
  assert.equal(output.hosted_pilot_bundle.domain_wiring_surface.endpoint, '/pilot/opl/api/frontdesk-domain-wiring');
  assert.equal(output.hosted_pilot_bundle.domain_wiring_surface.summary.total_projects_count, 2);
  assert.equal(output.hosted_pilot_bundle.domain_wiring_surface.summary.recommended_entry_surfaces_count, 0);
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
    assert.equal(
      output.hosted_pilot_package.hosted_runtime_readiness.surface_kind,
      'opl_hosted_runtime_readiness',
    );
    assert.equal(
      output.hosted_pilot_package.hosted_runtime_readiness.status,
      'pilot_ready_not_managed',
    );
    assert.equal(
      output.hosted_pilot_package.hosted_runtime_readiness.self_hostable_pilot_package_landed,
      true,
    );
    assert.equal(
      output.hosted_pilot_package.hosted_runtime_readiness.service_safe_local_packaging_landed,
      true,
    );

    const assets = output.hosted_pilot_package.assets;
    assert.equal(fs.existsSync(assets.bundle_json), true);
    assert.equal(fs.existsSync(assets.readme), true);
    assert.equal(fs.existsSync(assets.run_script), true);
    assert.equal(fs.existsSync(assets.systemd_service), true);
    assert.equal(fs.existsSync(assets.install_service_script), true);
    assert.equal(fs.existsSync(assets.healthcheck_script), true);
    assert.equal(fs.existsSync(assets.caddyfile), true);
    assert.equal(fs.existsSync(assets.env_example), true);
    assert.equal(fs.existsSync(assets.app_dist), true);
    assert.equal(fs.existsSync(path.join(assets.app_dist, 'cli.js')), true);
    assert.equal(fs.existsSync(path.join(assets.app_contracts, 'opl-gateway', 'workstreams.json')), true);

    assert.equal(output.hosted_pilot_package.operations.systemd.unit_name, 'opl-frontdesk.service');
    assert.equal(
      output.hosted_pilot_package.operations.systemd.install_script,
      assets.install_service_script,
    );
    assert.equal(
      output.hosted_pilot_package.operations.healthcheck.script,
      assets.healthcheck_script,
    );
    assert.equal(
      output.hosted_pilot_package.operations.healthcheck.local_url,
      'http://127.0.0.1:8787/pilot/opl/api/health',
    );
    assert.equal(
      output.hosted_pilot_package.operations.healthcheck.public_url,
      'https://opl.example.com/pilot/opl/api/health',
    );

    const readme = fs.readFileSync(assets.readme, 'utf8');
    assert.match(readme, /LibreChat-first/i);
    assert.match(readme, /OPL_HERMES_BIN/);
    assert.match(readme, /actual hosted runtime is still not landed/i);
    assert.match(readme, /install-systemd-service\.sh/);
    assert.match(readme, /check-frontdesk-health\.sh/);
    assert.match(readme, /https:\/\/opl\.example\.com\/pilot\/opl\/api\/health/);

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

    const installScript = fs.readFileSync(assets.install_service_script, 'utf8');
    assert.match(installScript, /SYSTEMCTL_BIN/);
    assert.match(installScript, /daemon-reload/);
    assert.match(installScript, /opl-frontdesk\.service/);
    assert.match(installScript, /run-frontdesk\.sh/);

    const healthcheckScript = fs.readFileSync(assets.healthcheck_script, 'utf8');
    assert.match(healthcheckScript, /api\/health/);
    assert.match(healthcheckScript, /node -e/);

    const bundleJson = JSON.parse(fs.readFileSync(assets.bundle_json, 'utf8'));
    assert.equal(bundleJson.hosted_pilot_package.entry_url, 'https://opl.example.com/pilot/opl/');
    assert.equal(bundleJson.hosted_pilot_package.base_path, '/pilot/opl');
    assert.equal(bundleJson.hosted_pilot_package.operations.systemd.unit_name, 'opl-frontdesk.service');
  } finally {
    fs.rmSync(outputDir, { recursive: true, force: true });
  }
});

test('frontdesk-librechat-package exports a same-origin LibreChat-first hosted shell pilot', () => {
  const codexFixture = createCodexConfigFixture({
    model: 'gpt-5.4-operator',
    reasoningEffort: 'xhigh',
  });
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
    ], {
      CODEX_HOME: codexFixture.codexHome,
    });

    assert.equal(output.version, 'g2');
    assert.equal(output.librechat_pilot_package.surface_id, 'opl_librechat_hosted_shell_pilot_package');
    assert.equal(output.librechat_pilot_package.shell_integration_target, 'librechat_first');
    assert.equal(output.librechat_pilot_package.package_status, 'landed');
    assert.equal(output.librechat_pilot_package.hosted_shell_status, 'landed');
    assert.equal(output.librechat_pilot_package.actual_managed_runtime_status, 'not_landed');
    assert.equal(output.librechat_pilot_package.hosted_shell_entry_url, 'https://opl.example.com/');
    assert.equal(output.librechat_pilot_package.frontdesk_entry_url, 'https://opl.example.com/pilot/opl/');
    assert.equal(output.librechat_pilot_package.frontdesk_runtime_upstream, 'host.docker.internal:8787');
    assert.equal(
      output.librechat_pilot_package.hosted_runtime_readiness.surface_kind,
      'opl_hosted_runtime_readiness',
    );
    assert.equal(
      output.librechat_pilot_package.hosted_runtime_readiness.status,
      'pilot_ready_not_managed',
    );
    assert.equal(
      output.librechat_pilot_package.hosted_runtime_readiness.librechat_pilot_package_landed,
      true,
    );
    assert.equal(
      output.librechat_pilot_package.hosted_runtime_readiness.managed_hosted_runtime_landed,
      false,
    );

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
    assert.match(composeFile, /\.\.\/opl-frontdesk\/app:\/app\/opl-frontdesk:ro/);
    assert.match(composeFile, /OPL_FRONTDESK_API_BASE_URL: http:\/\/host\.docker\.internal:8787\/pilot\/opl\/api/);
    assert.match(composeFile, /\$\{PUBLIC_HTTP_PORT:-8080\}:\$\{PUBLIC_HTTP_PORT:-8080\}/);

    const caddyfile = fs.readFileSync(assets.caddyfile, 'utf8');
    assert.match(caddyfile, /@opl_frontdesk path \/pilot\/opl \/pilot\/opl\/\*/);
    assert.match(caddyfile, /reverse_proxy \{\$OPL_FRONTDESK_UPSTREAM\}/);

    const librechatConfig = fs.readFileSync(assets.librechat_config, 'utf8');
    assert.match(librechatConfig, /Welcome to OPL Atlas/);
    assert.match(librechatConfig, /OPL Agent/);
    assert.match(librechatConfig, /modelDisplayLabel: OPL Agent/);
    assert.match(librechatConfig, /model: gpt-5\.4-operator/);
    assert.match(librechatConfig, /reasoning_effort: xhigh/);
    assert.match(librechatConfig, /https:\/\/opl\.example\.com\/pilot\/opl\//);
    assert.match(librechatConfig, /mcpServers:/);
    assert.match(librechatConfig, /opl_cortex:/);
    assert.match(librechatConfig, /type: stdio/);
    assert.match(librechatConfig, /mcp-stdio/);

    const envExample = fs.readFileSync(assets.stack_env_example, 'utf8');
    assert.match(envExample, /APP_TITLE=OPL Atlas/);
    assert.match(envExample, /OPENAI_MODELS=gpt-5\.4-operator/);
  } finally {
    fs.rmSync(codexFixture.codexHome, { recursive: true, force: true });
    fs.rmSync(outputDir, { recursive: true, force: true });
  }
});

test('mcp-stdio lists OPL tools and proxies dashboard calls through the configured frontdesk API', async () => {
  const fakeApi = await startFakeFrontDeskApiServer();
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
        tools: Array<{ name: string }>;
      }).tools;
      assert.equal(tools.some((tool) => tool.name === 'opl_dashboard'), true);
      assert.equal(tools.some((tool) => tool.name === 'opl_runtime_status'), true);
      assert.equal(tools.some((tool) => tool.name === 'opl_workspace_catalog'), true);
      assert.equal(tools.some((tool) => tool.name === 'opl_activate_workspace'), true);

      writeJsonLine(child.stdin, {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
          name: 'opl_activate_workspace',
          arguments: {
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
      assert.match(activateContent[0].text, /"action": "activate"/);

      writeJsonLine(child.stdin, {
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: {
          name: 'opl_dashboard',
          arguments: {},
        },
      });
      const toolCall = await readJsonLine(child.stdout);
      const content = (toolCall.result as {
        content: Array<{ type: string; text: string }>;
      }).content;
      assert.equal(content[0].type, 'text');
      assert.match(content[0].text, new RegExp(activatedWorkspacePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
      assert.equal(fakeApi.requests.some((request) =>
        request.path === '/api/workspace-activate'
        && request.body?.project_id === 'medautoscience'
        && request.body?.workspace_path === activatedWorkspacePath
      ), true);
      assert.equal(fakeApi.requests.some((request) =>
        request.path === '/api/dashboard'
        && request.query.path === activatedWorkspacePath
        && request.query.sessions_limit === '7'
      ), true);
    } finally {
      child.kill('SIGTERM');
      await once(child, 'exit');
    }
  } finally {
    await stopHttpServer(fakeApi.server);
  }
});

test('mcp-stdio defaults to a LibreChat-compatible protocol version when the client does not negotiate one', async () => {
  const fakeApi = await startFakeFrontDeskApiServer();

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

test('frontdesk bootstrap manages the local LibreChat shell, inherits local Codex defaults, and auto-bootstraps local trusted Paperclip', async () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-librechat-home-'));
  const codexFixture = createCodexConfigFixture({
    model: 'gpt-5.4-frontdoor',
    reasoningEffort: 'xhigh',
    baseUrl: 'https://codex-frontdoor.example.test/v1',
    apiKey: 'codex-frontdoor-key',
  });
  const masWorkspaceFixture = createMasWorkspaceFixture();
  const launchctlFixture = createFakeLaunchctlFixture();
  const dockerFixture = createFakeDockerFixture();
  const openFixture = createFakeOpenFixture();
  const fakePaperclip = await startFakePaperclipPilotServer({
    workspacePath: masWorkspaceFixture.fixtureRoot,
  });
  const hermesDir = path.join(homeRoot, '.hermes');
  fs.mkdirSync(hermesDir, { recursive: true });
  fs.writeFileSync(
    path.join(hermesDir, '.env'),
    [
      'OPENAI_API_KEY=legacy-hermes-key',
      'OPENAI_BASE_URL=https://legacy-hermes.example.test/v1',
      '',
    ].join('\n'),
    'utf8',
  );
  const serviceEnv = {
    HOME: homeRoot,
    CODEX_HOME: codexFixture.codexHome,
    OPL_LAUNCHCTL_BIN: launchctlFixture.launchctlPath,
    OPL_DOCKER_BIN: dockerFixture.dockerPath,
    OPL_OPEN_BIN: openFixture.openPath,
  };

  try {
    const install = await runCliAsync([
      'frontdesk-bootstrap',
      '--host',
      '127.0.0.1',
      '--port',
      '8911',
      '--path',
      masWorkspaceFixture.fixtureRoot,
      '--sessions-limit',
      '7',
      '--public-origin',
      'http://127.0.0.1:18080',
      '--paperclip-base-url',
      fakePaperclip.baseUrl,
    ], serviceEnv) as {
      frontdesk_librechat: {
        action: string;
        installed: boolean;
        running: boolean;
        public_origin: string;
        assets: {
          env_file: string;
          librechat_config: string;
        };
      };
      frontdesk_service: {
        loaded: boolean;
      };
      paperclip_control_plane: {
        readiness: string;
        connection: {
          base_url: string;
          auth: {
            header_env: string | null;
          };
        };
        project_bindings: Array<{
          project_id: string;
          paperclip_project_id: string | null;
          project_workspace_id: string | null;
        }>;
      };
    };

    assert.equal(install.frontdesk_librechat.action, 'install');
    assert.equal(install.frontdesk_librechat.installed, true);
    assert.equal(install.frontdesk_librechat.running, true);
    assert.equal(install.frontdesk_librechat.public_origin, 'http://127.0.0.1:18080');
    assert.equal(install.frontdesk_service.loaded, true);
    assert.equal(install.paperclip_control_plane.readiness, 'configured');
    assert.equal(install.paperclip_control_plane.connection.base_url, fakePaperclip.baseUrl);
    assert.equal(install.paperclip_control_plane.connection.auth.header_env, null);
    assert.equal(install.paperclip_control_plane.project_bindings.some((binding) =>
      binding.project_id === 'medautoscience'
      && binding.paperclip_project_id === fakePaperclip.projectId
      && binding.project_workspace_id === fakePaperclip.workspaceId
    ), true);
    const runtimeEnv = fs.readFileSync(install.frontdesk_librechat.assets.env_file, 'utf8');
    assert.match(runtimeEnv, /APP_TITLE=OPL Atlas/);
    assert.match(runtimeEnv, /OPENAI_API_KEY=codex-frontdoor-key/);
    assert.match(runtimeEnv, /OPENAI_BASE_URL=https:\/\/codex-frontdoor\.example\.test\/v1/);
    assert.match(runtimeEnv, /OPENAI_MODELS=gpt-5\.4-frontdoor/);
    const librechatConfig = fs.readFileSync(install.frontdesk_librechat.assets.librechat_config, 'utf8');
    assert.match(librechatConfig, /Welcome to OPL Atlas/);
    assert.match(librechatConfig, /Active workspace:/);
    assert.match(librechatConfig, /Bound project: med-autoscience/);
    assert.match(librechatConfig, /modelDisplayLabel: OPL Agent/);
    assert.match(librechatConfig, /model: gpt-5\.4-frontdoor/);
    assert.match(librechatConfig, /reasoning_effort: xhigh/);
    assert.match(librechatConfig, /opl_cortex:/);
    const workspaceRegistryPath = path.join(homeRoot, 'Library', 'Application Support', 'OPL', 'frontdesk', 'workspace-registry.json');
    const workspaceRegistry = JSON.parse(fs.readFileSync(workspaceRegistryPath, 'utf8')) as {
      bindings: Array<{ project_id: string; workspace_path: string; status: string }>;
    };
    assert.equal(workspaceRegistry.bindings.some((binding) =>
      binding.project_id === 'medautoscience'
      && binding.workspace_path === masWorkspaceFixture.fixtureRoot
      && binding.status === 'active'
    ), true);
    assert.match(fs.readFileSync(dockerFixture.callsPath, 'utf8'), /up -d/);

    const status = runCli(['frontdesk-librechat-status'], serviceEnv);
    assert.equal(status.frontdesk_librechat.action, 'status');
    assert.equal(status.frontdesk_librechat.installed, true);
    assert.equal(status.frontdesk_librechat.running, true);
    assert.equal(status.frontdesk_librechat.identity.app_title, 'OPL Atlas');
    assert.equal(status.frontdesk_librechat.identity.model_display_label, 'OPL Agent');
    assert.equal(status.frontdesk_librechat.identity.installed_model, 'gpt-5.4-frontdoor');
    assert.equal(status.frontdesk_librechat.identity.installed_reasoning_effort, 'xhigh');

    const openOutput = runCli(['frontdesk-librechat-open'], serviceEnv);
    assert.equal(openOutput.frontdesk_librechat.action, 'open');
    assert.match(fs.readFileSync(openFixture.capturePath, 'utf8'), /http:\/\/127\.0\.0\.1:18080/);

    const stopOutput = runCli(['frontdesk-librechat-stop'], serviceEnv);
    assert.equal(stopOutput.frontdesk_librechat.action, 'stop');
    assert.equal(stopOutput.frontdesk_librechat.running, false);

    const startOutput = runCli(['frontdesk-librechat-start'], serviceEnv);
    assert.equal(startOutput.frontdesk_librechat.action, 'start');
    assert.equal(startOutput.frontdesk_librechat.running, true);
  } finally {
    await stopHttpServer(fakePaperclip.server);
    fs.rmSync(codexFixture.codexHome, { recursive: true, force: true });
    fs.rmSync(masWorkspaceFixture.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(homeRoot, { recursive: true, force: true });
    fs.rmSync(launchctlFixture.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(dockerFixture.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(openFixture.fixtureRoot, { recursive: true, force: true });
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
    assert.deepEqual(catalogOutput.workspace_catalog.projects[2].available_actions, ['bind', 'activate', 'archive', 'launch']);
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

test('domain-manifests resolves real family manifest fixtures while workspace-catalog stays registry-only', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-domain-manifest-state-'));
  const fixtures = loadFamilyManifestFixtures();
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const env = {
    OPL_FRONTDESK_STATE_DIR: stateRoot,
    OPL_CONTRACTS_DIR: fixtureContractsRoot,
  };

  try {
    runCli([
      'workspace-bind',
      '--project',
      'medautogrant',
      '--path',
      repoRoot,
      '--manifest-command',
      buildManifestCommand(fixtures.medautogrant),
    ], env);
    runCli([
      'workspace-bind',
      '--project',
      'medautoscience',
      '--path',
      repoRoot,
      '--manifest-command',
      buildManifestCommand(fixtures.medautoscience),
    ], env);
    runCli([
      'workspace-bind',
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

    const catalogOutput = runCli(['workspace-catalog'], env);
    const magCatalog = catalogOutput.workspace_catalog.projects.find((entry: { project_id: string }) => entry.project_id === 'medautogrant');
    const masCatalog = catalogOutput.workspace_catalog.projects.find((entry: { project_id: string }) => entry.project_id === 'medautoscience');
    const redcubeCatalog = catalogOutput.workspace_catalog.projects.find((entry: { project_id: string }) => entry.project_id === 'redcube');
    assert.equal(magCatalog?.active_binding?.direct_entry?.manifest_command, buildManifestCommand(fixtures.medautogrant));
    assert.equal(masCatalog?.active_binding?.direct_entry?.manifest_command, buildManifestCommand(fixtures.medautoscience));
    assert.equal(redcubeCatalog?.active_binding?.direct_entry?.manifest_command, buildManifestCommand(fixtures.redcube));

    const manifestOutput = runCli(['domain-manifests'], env);
    assert.equal(manifestOutput.domain_manifests.summary.total_projects_count, 3);
    assert.equal(manifestOutput.domain_manifests.summary.manifest_configured_count, 3);
    assert.equal(manifestOutput.domain_manifests.summary.resolved_count, 3);
    assert.equal(manifestOutput.domain_manifests.summary.failed_count, 0);

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
    assert.equal(medautogrant.manifest.product_entry_preflight.surface_kind, 'product_entry_preflight');
    assert.equal(medautogrant.manifest.product_entry_preflight.ready_to_try_now, true);
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
    assert.equal(medautoscience.manifest.product_entry_preflight.surface_kind, 'product_entry_preflight');
    assert.equal(medautoscience.manifest.product_entry_preflight.ready_to_try_now, true);
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
    assert.equal(redcube.manifest.product_entry_start.modes[2].mode_id, 'federated_handoff');
    assert.equal(redcube.manifest.product_entry_start.modes[3].mode_id, 'resume_session');

    const dashboardOutput = runCli(['dashboard', '--path', repoRoot, '--sessions-limit', '1'], env);
    assert.equal(dashboardOutput.dashboard.front_desk.recommended_entry_surfaces_count, 3);
    assert.equal(
      dashboardOutput.dashboard.front_desk.hosted_runtime_readiness.surface_kind,
      'opl_hosted_runtime_readiness',
    );
    assert.equal(
      dashboardOutput.dashboard.front_desk.hosted_runtime_readiness.status,
      'pilot_ready_not_managed',
    );
    assert.equal(
      dashboardOutput.dashboard.front_desk.domain_entry_parity.summary.total_projects_count,
      3,
    );
    assert.equal(
      dashboardOutput.dashboard.front_desk.domain_entry_parity.summary.aligned_projects_count,
      1,
    );
    assert.equal(
      dashboardOutput.dashboard.front_desk.domain_entry_parity.summary.partial_projects_count,
      2,
    );
    assert.equal(
      dashboardOutput.dashboard.front_desk.domain_entry_parity.summary.blocked_projects_count,
      0,
    );
    assert.equal(
      dashboardOutput.dashboard.front_desk.domain_entry_parity.summary.direct_entry_locator_ready_projects_count,
      1,
    );
    assert.equal(
      dashboardOutput.dashboard.front_desk.domain_entry_parity.summary.ready_for_opl_start_count,
      3,
    );
    assert.equal(
      dashboardOutput.dashboard.front_desk.domain_entry_parity.summary.ready_for_domain_handoff_count,
      3,
    );
    const grantParity = dashboardOutput.dashboard.front_desk.domain_entry_parity.projects.find(
      (entry: { project_id: string }) => entry.project_id === 'medautogrant',
    );
    const scienceParity = dashboardOutput.dashboard.front_desk.domain_entry_parity.projects.find(
      (entry: { project_id: string }) => entry.project_id === 'medautoscience',
    );
    const redcubeParity = dashboardOutput.dashboard.front_desk.domain_entry_parity.projects.find(
      (entry: { project_id: string }) => entry.project_id === 'redcube',
    );
    assert.equal(grantParity.entry_parity_status, 'partial');
    assert.equal(grantParity.direct_entry_locator_status, 'missing');
    assert.equal(grantParity.ready_for_opl_start, true);
    assert.equal(grantParity.ready_for_domain_handoff, true);
    assert.equal(grantParity.product_entry_readiness_verdict, 'agent_assisted_ready_not_product_grade');
    assert.equal(scienceParity.entry_parity_status, 'partial');
    assert.equal(scienceParity.direct_entry_locator_status, 'missing');
    assert.equal(scienceParity.ready_for_opl_start, true);
    assert.equal(scienceParity.ready_for_domain_handoff, true);
    assert.equal(scienceParity.product_entry_readiness_verdict, 'runtime_ready_not_standalone_product');
    assert.equal(redcubeParity.entry_parity_status, 'aligned');
    assert.equal(redcubeParity.direct_entry_locator_status, 'ready');
    assert.equal(redcubeParity.ready_for_opl_start, true);
    assert.equal(redcubeParity.ready_for_domain_handoff, true);
    assert.equal(redcubeParity.product_entry_readiness_verdict, 'service_surface_ready_not_managed_product');
    assert.equal(redcubeParity.recommended_start_command, 'redcube product frontdesk');
    assert.equal(
      redcubeParity.recommended_check_command,
      'redcube workspace doctor --workspace-root /fixtures/redcube/workspace',
    );
    const grantEntry = dashboardOutput.dashboard.front_desk.recommended_entry_surfaces.find(
      (entry: { project_id: string }) => entry.project_id === 'medautogrant',
    );
    const scienceEntry = dashboardOutput.dashboard.front_desk.recommended_entry_surfaces.find(
      (entry: { project_id: string }) => entry.project_id === 'medautoscience',
    );
    const recommendedEntry = dashboardOutput.dashboard.front_desk.recommended_entry_surfaces.find(
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
    assert.equal(
      grantEntry.product_entry_preflight.recommended_check_command,
      'uv run python -m med_autogrant validate-workspace --input /fixtures/med-autogrant/nsfc_workspace_p2c_critique.json --format json',
    );
    assert.deepEqual(grantEntry.product_entry_preflight_blocking_check_ids, []);
    assert.equal(grantEntry.product_entry_preflight_checks_count, 4);
    assert.equal(grantEntry.product_entry_overview.summary, grantEntry.product_entry_status_summary);
    assert.equal(grantEntry.product_entry_overview.progress_surface.surface_kind, 'grant_progress');
    assert.equal(grantEntry.product_entry_overview.resume_surface.surface_kind, 'grant_user_loop');
    assert.equal(scienceEntry.product_entry_shell.workspace_cockpit.purpose.includes('workspace'), true);
    assert.equal(scienceEntry.shared_handoff.opl_handoff_builder.entry_mode, 'opl-handoff');
    assert.equal(scienceEntry.product_entry_overview.summary, scienceEntry.product_entry_status_summary);
    assert.equal(scienceEntry.product_entry_overview.progress_surface.surface_kind, 'study_progress');
    assert.equal(scienceEntry.product_entry_overview.resume_surface.surface_kind, 'launch_study');
    assert.equal(scienceEntry.product_entry_readiness_verdict, 'runtime_ready_not_standalone_product');
    assert.equal(scienceEntry.product_entry_readiness_good_to_use_now, false);
    assert.equal(scienceEntry.product_entry_readiness_loop_command, 'uv run python -m med_autoscience.cli workspace-cockpit --profile /fixtures/med-autoscience/profile.local.toml');
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
    assert.equal(recommendedEntry.product_entry_start.surface_kind, 'product_entry_start');
    assert.equal(recommendedEntry.product_entry_start.recommended_mode_id, 'open_frontdesk');
    assert.equal(recommendedEntry.product_entry_start_resume_surface_kind, 'product_entry_session');
    assert.equal(recommendedEntry.product_entry_start_mode_ids[2], 'federated_handoff');
    assert.equal(
      recommendedEntry.product_entry_preflight.recommended_check_command,
      'redcube workspace doctor --workspace-root /fixtures/redcube/workspace',
    );
    assert.deepEqual(recommendedEntry.product_entry_preflight_blocking_check_ids, []);
    assert.equal(recommendedEntry.product_entry_preflight_checks_count, 4);
    assert.equal(recommendedEntry.operator_loop_actions.start_deliverable.command, 'redcube product invoke');
    assert.equal(recommendedEntry.product_entry_overview.summary, recommendedEntry.product_entry_status_summary);
    assert.equal(recommendedEntry.product_entry_overview.progress_surface.surface_kind, 'product_entry_session');
    assert.equal(
      recommendedEntry.product_entry_overview.resume_surface.checkpoint_locator_field,
      'continuation_snapshot.latest_managed_run_id',
    );
    assert.equal(recommendedEntry.product_entry_shell.federated.surface_kind, 'federated_product_entry');
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

    const wiringOutput = runCli(['frontdesk-domain-wiring'], env);
    assert.equal(wiringOutput.frontdesk_domain_wiring.domain_binding_parity.surface_kind, 'opl_domain_binding_parity');
    assert.equal(wiringOutput.frontdesk_domain_wiring.domain_binding_parity.summary.total_projects_count, 3);
    assert.equal(wiringOutput.frontdesk_domain_wiring.domain_binding_parity.summary.active_projects_count, 3);
    assert.equal(wiringOutput.frontdesk_domain_wiring.domain_binding_parity.summary.direct_entry_ready_projects_count, 1);
    assert.equal(wiringOutput.frontdesk_domain_wiring.domain_binding_parity.summary.manifest_ready_projects_count, 3);
    assert.equal(wiringOutput.frontdesk_domain_wiring.domain_binding_parity.summary.launch_ready_projects_count, 1);
    const grantBindingParity = wiringOutput.frontdesk_domain_wiring.domain_binding_parity.projects.find(
      (entry: { project_id: string }) => entry.project_id === 'medautogrant',
    );
    const scienceBindingParity = wiringOutput.frontdesk_domain_wiring.domain_binding_parity.projects.find(
      (entry: { project_id: string }) => entry.project_id === 'medautoscience',
    );
    const redcubeBindingParity = wiringOutput.frontdesk_domain_wiring.domain_binding_parity.projects.find(
      (entry: { project_id: string }) => entry.project_id === 'redcube',
    );
    assert.equal(grantBindingParity.direct_entry_ready, false);
    assert.equal(grantBindingParity.manifest_ready, true);
    assert.deepEqual(grantBindingParity.available_actions, ['bind', 'activate', 'archive']);
    assert.equal(scienceBindingParity.direct_entry_ready, false);
    assert.equal(scienceBindingParity.manifest_ready, true);
    assert.deepEqual(scienceBindingParity.available_actions, ['bind', 'activate', 'archive']);
    assert.equal(redcubeBindingParity.direct_entry_ready, true);
    assert.equal(redcubeBindingParity.manifest_ready, true);
    assert.equal(redcubeBindingParity.active_binding.direct_entry.url, 'http://127.0.0.1:3310/redcube');
    assert.deepEqual(redcubeBindingParity.available_actions, ['bind', 'activate', 'archive', 'launch']);

    const readinessOutput = runCli(['frontdesk-readiness', '--path', repoRoot, '--sessions-limit', '1'], env);
    assert.equal(readinessOutput.frontdesk_readiness.summary.total_projects_count, 3);
    assert.equal(readinessOutput.frontdesk_readiness.summary.usable_now_projects_count, 3);
    assert.equal(readinessOutput.frontdesk_readiness.summary.good_to_use_now_projects_count, 0);
    assert.equal(readinessOutput.frontdesk_readiness.summary.fully_automatic_projects_count, 0);
    assert.equal(readinessOutput.frontdesk_readiness.summary.ready_to_try_now_projects_count, 3);
    assert.equal(readinessOutput.frontdesk_readiness.summary.ready_for_opl_start_count, 3);
    assert.equal(readinessOutput.frontdesk_readiness.summary.ready_for_domain_handoff_count, 3);
    assert.equal(readinessOutput.frontdesk_readiness.summary.direct_entry_ready_projects_count, 1);
    const grantReadiness = readinessOutput.frontdesk_readiness.projects.find(
      (entry: { project_id: string }) => entry.project_id === 'medautogrant',
    );
    const scienceReadiness = readinessOutput.frontdesk_readiness.projects.find(
      (entry: { project_id: string }) => entry.project_id === 'medautoscience',
    );
    const redcubeReadiness = readinessOutput.frontdesk_readiness.projects.find(
      (entry: { project_id: string }) => entry.project_id === 'redcube',
    );
    assert.equal(grantReadiness.usable_now, true);
    assert.equal(grantReadiness.good_to_use_now, false);
    assert.equal(grantReadiness.fully_automatic, false);
    assert.equal(grantReadiness.ready_to_try_now, true);
    assert.equal(grantReadiness.blocking_gaps_count, 3);
    assert.equal(scienceReadiness.usable_now, true);
    assert.equal(scienceReadiness.preflight_checks_count, 7);
    assert.equal(redcubeReadiness.usable_now, true);
    assert.equal(redcubeReadiness.binding_launch_ready, true);
    assert.equal(redcubeReadiness.recommended_start_command, 'redcube product frontdesk');
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
    fs.rmSync(stateRoot, { recursive: true, force: true });
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
      'workspace-bind',
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
    assert.equal(output.product_entry_start.available_modes[2].mode_id, 'federated_handoff');
    assert.equal(output.product_entry_start.resume_surface.surface_kind, 'product_entry_session');
    assert.deepEqual(output.product_entry_start.human_gate_ids, ['redcube_operator_review_gate']);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('domain-manifests reports invalid json when a bound manifest command is malformed', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-domain-manifest-invalid-json-state-'));

  try {
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

    const manifestOutput = runCli(['domain-manifests'], {
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
      output.handoff_bundle.domain_manifest_recommendation.product_entry_shell.federated.surface_kind,
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
      'federated_handoff',
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
    assert.equal(output.handoff_bundle.domain_entry_parity.summary.total_projects_count, 2);
    assert.equal(output.handoff_bundle.domain_entry_parity.summary.aligned_projects_count, 1);
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

test('launch-domain resolves a bound direct-entry locator into an honest launcher surface', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-launch-domain-state-'));
  const openFixture = createFakeOpenFixture();
  const shellFixture = createFakeShellCommandFixture();

  try {
    runCli([
      'workspace-bind',
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
      'launch-domain',
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
      'launch-domain',
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
      'launch-domain',
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
      '--workspace-path',
      repoRoot,
    ], {
      OPL_HERMES_BIN: hermesPath,
      OPL_FRONTDESK_STATE_DIR: stateRoot,
      PATH: `${psFixture.fixtureRoot}:${process.env.PATH ?? ''}`,
    });
    assert.equal(askOutput.product_entry.hermes.session_id, 'sess_ledger');

    const resumeOutput = runCli(['resume', 'sess_ledger'], {
      OPL_HERMES_BIN: hermesPath,
      OPL_FRONTDESK_STATE_DIR: stateRoot,
      PATH: `${psFixture.fixtureRoot}:${process.env.PATH ?? ''}`,
    });
    assert.equal(resumeOutput.product_entry.mode, 'resume');

    const ledgerOutput = runCli(['session-ledger', '--limit', '5'], {
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
    assert.equal(ledgerOutput.session_ledger.sessions[0].resource_totals.latest_process_count, 2);
    assert.equal(ledgerOutput.session_ledger.sessions[0].workspace_locator.absolute_path, repoRoot);
    assert.equal(ledgerOutput.session_ledger.summary.session_aggregate_count, 1);

    const runtimeOutput = runCli(['runtime-status', '--limit', '2'], {
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

test('web starts a local front-desk pilot and serves dashboard plus ask surfaces', async () => {
  const codexFixture = createCodexConfigFixture({
    model: 'gpt-5.4-web',
    reasoningEffort: 'xhigh',
  });
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

  let child: ChildProcessByStdio<null, Readable, Readable> | null = null;

  try {
    const startup = await startCliServer(
      ['web', '--host', '127.0.0.1', '--port', '0', '--path', repoRoot, '--sessions-limit', '1'],
      {
        HOME: homeRoot,
        CODEX_HOME: codexFixture.codexHome,
        OPL_HERMES_BIN: hermesPath,
        PATH: `${psFixture.fixtureRoot}:${process.env.PATH ?? ''}`,
      },
    );
    child = startup.child;

    const webFrontdesk = startup.payload.web_frontdesk as {
      entry_surface: string;
      hosted_status: string;
      api: {
        frontdesk_readiness: string;
        frontdesk_domain_wiring: string;
        librechat_package: string;
      };
      listening: {
        base_url: string;
      };
    };

    assert.equal(startup.payload.version, 'g2');
    assert.equal(webFrontdesk.entry_surface, 'opl_local_web_frontdesk_pilot');
    assert.equal(webFrontdesk.hosted_status, 'librechat_pilot_landed');
    assert.equal(webFrontdesk.api.frontdesk_readiness, '/api/frontdesk-readiness');
    assert.equal(webFrontdesk.api.frontdesk_domain_wiring, '/api/frontdesk-domain-wiring');
    assert.equal(webFrontdesk.api.librechat_package, '/api/librechat-package');

    const baseUrl = String(webFrontdesk.listening.base_url);
    const page = await fetch(baseUrl);
    assert.equal(page.status, 200);
    const pageHtml = await page.text();
    assert.match(pageHtml, /OPL Front Desk/);
    assert.match(pageHtml, /Control Room/);
    assert.match(pageHtml, /Hosted-Friendly Surface/);
    assert.match(pageHtml, /Domain Wiring/);
    assert.match(pageHtml, /Frontdesk Readiness/);
    assert.match(pageHtml, /Hosted Runtime Readiness/);
    assert.match(pageHtml, /Domain Entry Parity/);

    const dashboardResponse = await fetch(`${baseUrl}/api/dashboard`);
    const dashboardPayload = await dashboardResponse.json();
    assert.equal(dashboardPayload.dashboard.front_desk.local_web_frontdesk_status, 'pilot_landed');
    assert.equal(dashboardPayload.dashboard.projects.length, 3);
    assert.equal(dashboardPayload.dashboard.domain_manifests.summary.total_projects_count, 2);
    assert.equal(
      dashboardPayload.dashboard.front_desk.hosted_runtime_readiness.status,
      'pilot_ready_not_managed',
    );
    assert.equal(
      dashboardPayload.dashboard.front_desk.domain_entry_parity.summary.total_projects_count,
      2,
    );

    const healthResponse = await fetch(`${baseUrl}/api/health`);
    const healthPayload = await healthResponse.json();
    assert.equal(healthPayload.health.entry_surface, 'opl_local_web_frontdesk_pilot');
    assert.equal(healthPayload.health.status, 'ok');
    assert.equal(healthPayload.health.checks.gateway_service.loaded, true);

    const manifestResponse = await fetch(`${baseUrl}/api/frontdesk-manifest`);
    const manifestPayload = await manifestResponse.json();
    assert.equal(manifestPayload.frontdesk_manifest.shell_integration_target, 'librechat_first');
    assert.equal(manifestPayload.frontdesk_manifest.endpoints.sessions, '/api/sessions');

    const wiringResponse = await fetch(`${baseUrl}/api/frontdesk-domain-wiring`);
    const wiringPayload = await wiringResponse.json();
    assert.equal(wiringPayload.frontdesk_domain_wiring.surface_id, 'opl_frontdesk_domain_wiring');
    assert.equal(wiringPayload.frontdesk_domain_wiring.summary.total_projects_count, 2);
    assert.equal(wiringPayload.frontdesk_domain_wiring.domain_binding_parity.summary.total_projects_count, 2);
    assert.equal(wiringPayload.frontdesk_domain_wiring.domain_binding_parity.summary.active_projects_count, 0);
    assert.equal(wiringPayload.frontdesk_domain_wiring.summary.recommended_entry_surfaces_count, 0);

    const readinessResponse = await fetch(`${baseUrl}/api/frontdesk-readiness`);
    const readinessPayload = await readinessResponse.json();
    assert.equal(readinessPayload.frontdesk_readiness.surface_id, 'opl_frontdesk_readiness');
    assert.equal(readinessPayload.frontdesk_readiness.summary.total_projects_count, 2);
    assert.equal(readinessPayload.frontdesk_readiness.summary.usable_now_projects_count, 0);
    assert.equal(readinessPayload.frontdesk_readiness.local_service.health.status, 'not_installed');

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
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});

test('web front-desk exposes start api and renders a direct start panel for resolved domain manifests', async () => {
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
      'workspace-bind',
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

    const baseUrl = String((startup.payload.web_frontdesk as { listening: { base_url: string } }).listening.base_url);
    const page = await fetch(baseUrl);
    assert.equal(page.status, 200);
    const pageHtml = await page.text();
    assert.match(pageHtml, /Start A Domain Project/);
    assert.match(pageHtml, /Resolve the exact recommended direct entry mode/);
    assert.match(pageHtml, /Launch Bound Domain Entry/);

    const startResponse = await fetch(`${baseUrl}/api/start?project=redcube`);
    assert.equal(startResponse.status, 200);
    const startPayload = await startResponse.json();
    assert.equal(startPayload.product_entry_start.surface_kind, 'opl_product_entry_start');
    assert.equal(startPayload.product_entry_start.project_id, 'redcube');
    assert.equal(startPayload.product_entry_start.recommended_mode_id, 'open_frontdesk');
    assert.equal(startPayload.product_entry_start.selected_mode_id, 'open_frontdesk');
    assert.equal(startPayload.product_entry_start.selected_mode.command, 'redcube product frontdesk');
    assert.deepEqual(startPayload.product_entry_start.human_gate_ids, ['redcube_operator_review_gate']);

    const modeResponse = await fetch(`${baseUrl}/api/start?project=redcube&mode=federated_handoff`);
    assert.equal(modeResponse.status, 200);
    const modePayload = await modeResponse.json();
    assert.equal(modePayload.product_entry_start.selected_mode_id, 'federated_handoff');
    assert.equal(modePayload.product_entry_start.selected_mode.command, 'redcube product federate');

    const launchResponse = await fetch(`${baseUrl}/api/launch-domain`, {
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

test('paperclip-bootstrap exposes operator preflight plus the task and gate operating loops', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-paperclip-bootstrap-'));

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
      OPL_PAPERCLIP_AUTH_HEADER: 'Bearer bootstrap-token',
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
      OPL_PAPERCLIP_AUTH_HEADER: 'Bearer bootstrap-token',
    });

    const output = runCli(['paperclip-bootstrap'], {
      OPL_FRONTDESK_STATE_DIR: stateRoot,
      OPL_PAPERCLIP_AUTH_HEADER: 'Bearer bootstrap-token',
    }) as {
      paperclip_control_plane: {
        action: string;
      };
      paperclip_bootstrap: {
        readiness: string;
        preflight: {
          ready_for_task_projection: boolean;
          ready_for_gate_projection: boolean;
        };
        automation_surfaces: {
          operator_loop_command: string;
          sync_command: string;
          web: {
            bootstrap: string;
            sync: string;
          };
        };
        operator_playbooks: Array<{
          playbook_id: string;
          steps: Array<{
            step_id: string;
            command: string | null;
          }>;
        }>;
        docs_ref: string;
      };
    };

    assert.equal(output.paperclip_control_plane.action, 'bootstrap');
    assert.equal(output.paperclip_bootstrap.readiness, 'configured');
    assert.equal(output.paperclip_bootstrap.preflight.ready_for_task_projection, true);
    assert.equal(output.paperclip_bootstrap.preflight.ready_for_gate_projection, true);
    assert.equal(
      output.paperclip_bootstrap.automation_surfaces.operator_loop_command,
      'opl paperclip-operator-loop --all --interval-ms 30000',
    );
    assert.equal(output.paperclip_bootstrap.automation_surfaces.sync_command, 'opl paperclip-sync --all');
    assert.equal(output.paperclip_bootstrap.automation_surfaces.web.bootstrap, '/api/paperclip/control-plane/bootstrap');
    assert.equal(output.paperclip_bootstrap.automation_surfaces.web.sync, '/api/paperclip/control-plane/sync');
    assert.deepEqual(
      output.paperclip_bootstrap.operator_playbooks.map((entry) => entry.playbook_id),
      ['task_execution_loop', 'human_gate_loop'],
    );
    assert.equal(
      output.paperclip_bootstrap.operator_playbooks[0].steps.some((step) =>
        step.step_id === 'open_task' && step.command === 'opl paperclip-open-task "<request...>" --workspace-path <path>',
      ),
      true,
    );
    assert.equal(
      output.paperclip_bootstrap.operator_playbooks[1].steps.some((step) =>
        step.step_id === 'open_gate' && step.command === 'opl paperclip-open-gate "<request...>" --workspace-path <path>',
      ),
      true,
    );
    assert.equal(
      output.paperclip_bootstrap.docs_ref,
      'docs/references/paperclip-control-plane-operator-guide.md',
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('paperclip-status treats a local trusted Paperclip deployment as configured even when no auth env is declared', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-paperclip-local-trusted-'));

  return (async () => {
    const fakePaperclip = await startFakePaperclipPilotServer({
      workspacePath: repoRoot,
    });

    try {
      runCli([
        'paperclip-config',
        '--base-url',
        fakePaperclip.baseUrl,
        '--control-company-id',
        fakePaperclip.companyId,
        '--local-trusted-no-auth',
      ], {
        OPL_FRONTDESK_STATE_DIR: stateRoot,
      });

      const status = runCli(['paperclip-status', '--path', repoRoot, '--sessions-limit', '1'], {
        OPL_FRONTDESK_STATE_DIR: stateRoot,
      });

      assert.equal(status.paperclip_control_plane.readiness, 'configured');
      assert.equal(status.paperclip_control_plane.connection.base_url, fakePaperclip.baseUrl);
      assert.equal(status.paperclip_control_plane.connection.auth.header_env, null);
      assert.equal(status.paperclip_control_plane.connection.auth.header_present, false);
    } finally {
      await stopHttpServer(fakePaperclip.server);
      fs.rmSync(stateRoot, { recursive: true, force: true });
    }
  })();
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

test('paperclip-sync writes a deduplicated OPL state comment back to a tracked Paperclip issue', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-paperclip-sync-'));
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
      OPL_PAPERCLIP_AUTH_HEADER: 'Bearer sync-token',
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
      OPL_PAPERCLIP_AUTH_HEADER: 'Bearer sync-token',
    });

    await runCliAsync([
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
      OPL_PAPERCLIP_AUTH_HEADER: 'Bearer sync-token',
    });

    const synced = await runCliAsync([
      'paperclip-sync',
      '--issue-id',
      'issue-1',
      '--path',
      repoRoot,
      '--sessions-limit',
      '1',
    ], {
      OPL_FRONTDESK_STATE_DIR: stateRoot,
      OPL_PAPERCLIP_AUTH_HEADER: 'Bearer sync-token',
    }) as {
      paperclip_control_plane: {
        action: string;
      };
      paperclip_sync: {
        summary: {
          matched_projection_count: number;
          synced_count: number;
          skipped_count: number;
          approval_updates_count: number;
          resolved_gate_count: number;
        };
        projections: Array<{
          issue_id: string;
          sync_status: string;
          remote_issue_status: string | null;
          remote_approval_status: string | null;
          gate_status: string | null;
          gate_decision: string | null;
          snapshot: {
            workspace_path: string;
            related_session_aggregate_count: number;
            domain_manifest_status: string;
          };
          comment: {
            id: string;
          } | null;
        }>;
      };
    };

    assert.equal(synced.paperclip_control_plane.action, 'sync');
    assert.equal(synced.paperclip_sync.summary.matched_projection_count, 1);
    assert.equal(synced.paperclip_sync.summary.synced_count, 1);
    assert.equal(synced.paperclip_sync.summary.skipped_count, 0);
    assert.equal(synced.paperclip_sync.summary.approval_updates_count, 0);
    assert.equal(synced.paperclip_sync.summary.resolved_gate_count, 0);
    assert.equal(synced.paperclip_sync.projections[0].issue_id, 'issue-1');
    assert.equal(synced.paperclip_sync.projections[0].sync_status, 'synced');
    assert.equal(synced.paperclip_sync.projections[0].remote_issue_status, 'backlog');
    assert.equal(synced.paperclip_sync.projections[0].remote_approval_status, null);
    assert.equal(synced.paperclip_sync.projections[0].gate_status, null);
    assert.equal(synced.paperclip_sync.projections[0].gate_decision, null);
    assert.equal(synced.paperclip_sync.projections[0].snapshot.workspace_path, repoRoot);
    assert.equal(synced.paperclip_sync.projections[0].snapshot.related_session_aggregate_count, 0);
    assert.equal(synced.paperclip_sync.projections[0].snapshot.domain_manifest_status, 'not_bound');
    assert.equal(synced.paperclip_sync.projections[0].comment?.id, 'comment-1');

    assert.equal(fakePaperclip.requests.length, 3);
    const issueStatusRequest = fakePaperclip.requests[1];
    const commentRequest = fakePaperclip.requests[2];
    assert.equal(issueStatusRequest.method, 'GET');
    assert.equal(issueStatusRequest.path, '/api/companies/company-redcube/issues/issue-1');
    assert.equal(commentRequest.path, '/api/companies/company-redcube/issues/issue-1/comments');
    assert.equal(commentRequest.headers.authorization, 'Bearer sync-token');
    assert.match(String(commentRequest.body?.body ?? ''), /# OPL Sync Update/);
    assert.match(String(commentRequest.body?.body ?? ''), /Prepare a defense-ready slide deck/);
    assert.match(String(commentRequest.body?.body ?? ''), /workspace_status/);

    const skipped = await runCliAsync([
      'paperclip-sync',
      '--issue-id',
      'issue-1',
      '--path',
      repoRoot,
      '--sessions-limit',
      '1',
    ], {
      OPL_FRONTDESK_STATE_DIR: stateRoot,
      OPL_PAPERCLIP_AUTH_HEADER: 'Bearer sync-token',
    }) as {
      paperclip_sync: {
        summary: {
          matched_projection_count: number;
          synced_count: number;
          skipped_count: number;
          approval_updates_count: number;
          resolved_gate_count: number;
        };
        projections: Array<{
          sync_status: string;
          remote_issue_status: string | null;
          comment: {
            id: string;
          } | null;
        }>;
      };
    };

    assert.equal(skipped.paperclip_sync.summary.matched_projection_count, 1);
    assert.equal(skipped.paperclip_sync.summary.synced_count, 0);
    assert.equal(skipped.paperclip_sync.summary.skipped_count, 1);
    assert.equal(skipped.paperclip_sync.summary.approval_updates_count, 0);
    assert.equal(skipped.paperclip_sync.summary.resolved_gate_count, 0);
    assert.equal(skipped.paperclip_sync.projections[0].sync_status, 'skipped_no_change');
    assert.equal(skipped.paperclip_sync.projections[0].remote_issue_status, 'backlog');
    assert.equal(skipped.paperclip_sync.projections[0].comment, null);
    assert.equal(fakePaperclip.requests.length, 4);
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

test('paperclip-sync pulls approval decisions back into tracked gate state before writing audit comments', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-paperclip-gate-sync-'));
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
      OPL_PAPERCLIP_AUTH_HEADER: 'Bearer gate-sync-token',
    });

    await runCliAsync([
      'paperclip-open-gate',
      'Review publish readiness for the defense deck.',
      '--preferred-family',
      'ppt_deck',
      '--workspace-path',
      repoRoot,
      '--gate-kind',
      'publish_readiness',
    ], {
      OPL_FRONTDESK_STATE_DIR: stateRoot,
      OPL_PAPERCLIP_AUTH_HEADER: 'Bearer gate-sync-token',
    });

    fakePaperclip.setIssueStatus('issue-1', 'in_review');
    fakePaperclip.setApprovalDecision('approval-1', 'approved', 'approve');

    const synced = await runCliAsync([
      'paperclip-sync',
      '--issue-id',
      'issue-1',
      '--path',
      repoRoot,
      '--sessions-limit',
      '1',
    ], {
      OPL_FRONTDESK_STATE_DIR: stateRoot,
      OPL_PAPERCLIP_AUTH_HEADER: 'Bearer gate-sync-token',
    }) as {
      paperclip_sync: {
        summary: {
          matched_projection_count: number;
          synced_count: number;
          approval_updates_count: number;
          resolved_gate_count: number;
        };
        projections: Array<{
          projection_kind: string;
          remote_issue_status: string | null;
          remote_approval_status: string | null;
          gate_status: string | null;
          gate_decision: string | null;
          comment: {
            id: string;
          } | null;
        }>;
      };
    };

    assert.equal(synced.paperclip_sync.summary.matched_projection_count, 1);
    assert.equal(synced.paperclip_sync.summary.synced_count, 1);
    assert.equal(synced.paperclip_sync.summary.approval_updates_count, 1);
    assert.equal(synced.paperclip_sync.summary.resolved_gate_count, 1);
    assert.equal(synced.paperclip_sync.projections[0].projection_kind, 'gate');
    assert.equal(synced.paperclip_sync.projections[0].remote_issue_status, 'in_review');
    assert.equal(synced.paperclip_sync.projections[0].remote_approval_status, 'approved');
    assert.equal(synced.paperclip_sync.projections[0].gate_status, 'approved');
    assert.equal(synced.paperclip_sync.projections[0].gate_decision, 'approve');
    assert.equal(synced.paperclip_sync.projections[0].comment?.id, 'comment-1');

    const status = runCli(['paperclip-status', '--path', repoRoot, '--sessions-limit', '1'], {
      OPL_FRONTDESK_STATE_DIR: stateRoot,
      OPL_PAPERCLIP_AUTH_HEADER: 'Bearer gate-sync-token',
    }) as {
      paperclip_control_plane: {
        summary: {
          tracked_resolved_gate_count: number;
          tracked_pending_gate_count: number;
        };
        tracked_projections: Array<{
          issue_id: string;
          approval_status: string | null;
          gate_status: string | null;
          gate_decision: string | null;
          remote_issue_status: string | null;
          last_polled_at: string | null;
        }>;
      };
    };

    assert.equal(status.paperclip_control_plane.summary.tracked_resolved_gate_count, 1);
    assert.equal(status.paperclip_control_plane.summary.tracked_pending_gate_count, 0);
    assert.equal(status.paperclip_control_plane.tracked_projections[0].issue_id, 'issue-1');
    assert.equal(status.paperclip_control_plane.tracked_projections[0].approval_status, 'approved');
    assert.equal(status.paperclip_control_plane.tracked_projections[0].gate_status, 'approved');
    assert.equal(status.paperclip_control_plane.tracked_projections[0].gate_decision, 'approve');
    assert.equal(status.paperclip_control_plane.tracked_projections[0].remote_issue_status, 'in_review');
    assert.match(String(status.paperclip_control_plane.tracked_projections[0].last_polled_at), /^2026-/);
  } finally {
    await stopHttpServer(fakePaperclip.server);
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('paperclip-operator-loop runs repeated reconcile cycles and persists loop state for status surfaces', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-paperclip-operator-loop-'));
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
      OPL_PAPERCLIP_AUTH_HEADER: 'Bearer loop-token',
    });
    runCli([
      'paperclip-bind',
      '--project',
      'redcube',
      '--company-id',
      'company-redcube',
      '--paperclip-project-id',
      'project-redcube',
    ], {
      OPL_FRONTDESK_STATE_DIR: stateRoot,
      OPL_PAPERCLIP_AUTH_HEADER: 'Bearer loop-token',
    });

    await runCliAsync([
      'paperclip-open-task',
      'Prepare a defense-ready slide deck for a thesis committee.',
      '--preferred-family',
      'ppt_deck',
      '--workspace-path',
      repoRoot,
    ], {
      OPL_FRONTDESK_STATE_DIR: stateRoot,
      OPL_PAPERCLIP_AUTH_HEADER: 'Bearer loop-token',
    });

    const loop = await runCliAsync([
      'paperclip-operator-loop',
      '--project',
      'redcube',
      '--path',
      repoRoot,
      '--sessions-limit',
      '1',
      '--interval-ms',
      '1',
      '--cycles',
      '2',
    ], {
      OPL_FRONTDESK_STATE_DIR: stateRoot,
      OPL_PAPERCLIP_AUTH_HEADER: 'Bearer loop-token',
    }) as {
      paperclip_control_plane: {
        action: string;
      };
      paperclip_operator_loop: {
        state: string;
        interval_ms: number;
        cycles_completed: number;
        summary: {
          synced_count: number;
          skipped_count: number;
        };
      };
    };

    assert.equal(loop.paperclip_control_plane.action, 'operator_loop');
    assert.equal(loop.paperclip_operator_loop.state, 'completed');
    assert.equal(loop.paperclip_operator_loop.interval_ms, 1);
    assert.equal(loop.paperclip_operator_loop.cycles_completed, 2);
    assert.equal(loop.paperclip_operator_loop.summary.synced_count, 1);
    assert.equal(loop.paperclip_operator_loop.summary.skipped_count, 1);

    const status = runCli(['paperclip-status', '--path', repoRoot, '--sessions-limit', '1'], {
      OPL_FRONTDESK_STATE_DIR: stateRoot,
      OPL_PAPERCLIP_AUTH_HEADER: 'Bearer loop-token',
    }) as {
      paperclip_control_plane: {
        operator_loop: {
          state: string;
          last_completed_at: string | null;
          last_run_summary: {
            cycles_completed: number;
            synced_count: number;
            skipped_count: number;
          } | null;
        };
      };
    };

    assert.equal(status.paperclip_control_plane.operator_loop.state, 'idle');
    assert.match(String(status.paperclip_control_plane.operator_loop.last_completed_at), /^2026-/);
    assert.equal(status.paperclip_control_plane.operator_loop.last_run_summary?.cycles_completed, 2);
    assert.equal(status.paperclip_control_plane.operator_loop.last_run_summary?.synced_count, 1);
    assert.equal(status.paperclip_control_plane.operator_loop.last_run_summary?.skipped_count, 1);
  } finally {
    await stopHttpServer(fakePaperclip.server);
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('paperclip-status recovers stale paperclip operator loop state when the recorded owner pid is gone', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-paperclip-operator-stale-'));
  const operatorLoopFile = path.join(stateRoot, 'paperclip-operator-loop.json');

  try {
    fs.writeFileSync(
      operatorLoopFile,
      `${JSON.stringify({
        version: 'g2',
        state: 'running',
        owner_pid: 999999,
        last_started_at: '2026-04-13T10:00:00.000Z',
        last_completed_at: null,
        last_error: null,
        last_run_summary: {
          cycles_completed: 1,
          matched_projection_count: 1,
          synced_count: 1,
          skipped_count: 0,
          approval_updates_count: 0,
          resolved_gate_count: 0,
        },
      }, null, 2)}\n`,
      'utf8',
    );

    const status = runCli(['paperclip-status'], {
      OPL_FRONTDESK_STATE_DIR: stateRoot,
    }) as {
      paperclip_control_plane: {
        operator_loop: {
          state: string;
          last_started_at: string | null;
          last_completed_at: string | null;
          last_error: string | null;
        };
      };
    };

    assert.equal(status.paperclip_control_plane.operator_loop.state, 'idle');
    assert.equal(status.paperclip_control_plane.operator_loop.last_started_at, '2026-04-13T10:00:00.000Z');
    assert.match(
      String(status.paperclip_control_plane.operator_loop.last_completed_at),
      /^2026-/,
    );
    assert.match(
      String(status.paperclip_control_plane.operator_loop.last_error),
      /Recovered stale Paperclip operator loop state from terminated pid 999999\./,
    );

    const persisted = JSON.parse(fs.readFileSync(operatorLoopFile, 'utf8')) as {
      state: string;
      owner_pid?: number | null;
      last_completed_at: string | null;
      last_error: string | null;
    };
    assert.equal(persisted.state, 'idle');
    assert.equal(persisted.owner_pid ?? null, null);
    assert.match(String(persisted.last_completed_at), /^2026-/);
    assert.match(
      String(persisted.last_error),
      /Recovered stale Paperclip operator loop state from terminated pid 999999\./,
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('web front-desk exposes the Paperclip control-plane aggregate surface', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-paperclip-web-state-'));
  const fakePaperclip = await startFakePaperclipServer();
  let child: ChildProcessByStdio<null, Readable, Readable> | null = null;

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
      OPL_PAPERCLIP_AUTH_HEADER: 'Bearer web-token',
    });
    runCli([
      'paperclip-bind',
      '--project',
      'redcube',
      '--company-id',
      'company-redcube',
      '--paperclip-project-id',
      'project-redcube',
    ], {
      OPL_FRONTDESK_STATE_DIR: stateRoot,
      OPL_PAPERCLIP_AUTH_HEADER: 'Bearer web-token',
    });
    await runCliAsync([
      'paperclip-open-task',
      'Prepare a defense-ready slide deck for a thesis committee.',
      '--preferred-family',
      'ppt_deck',
      '--workspace-path',
      repoRoot,
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
        paperclip_bootstrap: string;
        paperclip_sync: string;
      };
      listening: {
        base_url: string;
      };
    };

    assert.equal(webFrontdesk.api.paperclip_control_plane, '/api/paperclip/control-plane');
    assert.equal(webFrontdesk.api.paperclip_bootstrap, '/api/paperclip/control-plane/bootstrap');
    assert.equal(webFrontdesk.api.paperclip_sync, '/api/paperclip/control-plane/sync');

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
    assert.equal(payload.paperclip_control_plane.connection.base_url, fakePaperclip.baseUrl);
    assert.equal(payload.paperclip_control_plane.summary.project_bindings_count, 1);

    const bootstrapResponse = await fetch(`${webFrontdesk.listening.base_url}/api/paperclip/control-plane/bootstrap`);
    const bootstrapPayload = await bootstrapResponse.json() as {
      paperclip_control_plane: {
        action: string;
      };
      paperclip_bootstrap: {
        automation_surfaces: {
          web: {
            sync: string;
          };
        };
      };
    };
    assert.equal(bootstrapPayload.paperclip_control_plane.action, 'bootstrap');
    assert.equal(bootstrapPayload.paperclip_bootstrap.automation_surfaces.web.sync, '/api/paperclip/control-plane/sync');

    const syncResponse = await fetch(`${webFrontdesk.listening.base_url}/api/paperclip/control-plane/sync`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        issue_id: 'issue-1',
        workspace_path: repoRoot,
        sessions_limit: 1,
      }),
    });
    const syncPayload = await syncResponse.json() as {
      paperclip_control_plane: {
        action: string;
      };
      paperclip_sync: {
        summary: {
          synced_count: number;
        };
      };
    };
    assert.equal(syncPayload.paperclip_control_plane.action, 'sync');
    assert.equal(syncPayload.paperclip_sync.summary.synced_count, 1);
  } finally {
    if (child) {
      await stopCliServer(child);
    }
    await stopHttpServer(fakePaperclip.server);
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

test('validate-contracts falls back to the active CLI repo contracts when cwd has no contract root', () => {
  const unrelatedCwd = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-cli-entry-cwd-'));

  try {
    const output = runCliInCwd(['validate-contracts'], unrelatedCwd);

    assert.equal(output.validation.contracts_dir, contractsDir);
    assert.equal(output.validation.contracts_root_source, 'cli_entry');
  } finally {
    fs.rmSync(unrelatedCwd, { recursive: true, force: true });
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
    ['frontdesk-bootstrap', 'frontdesk-librechat-install', 'frontdesk-librechat-status', 'frontdesk-librechat-start', 'frontdesk-librechat-stop', 'frontdesk-librechat-open'].every((command) =>
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
