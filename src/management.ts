import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { GatewayContractError } from './contracts.ts';
import {
  buildHermesSessionsListArgs,
  inspectHermesRuntime,
  parseHermesSessionsTable,
  runHermesCommand,
} from './hermes.ts';
import type { GatewayContracts } from './types.ts';

export interface WorkspaceStatusOptions {
  workspacePath?: string;
}

export interface RuntimeStatusOptions {
  sessionsLimit?: number;
}

export interface DashboardOptions extends WorkspaceStatusOptions, RuntimeStatusOptions {}

const frontDeskEndpoints = {
  health: '/api/health',
  manifest: '/api/frontdesk-manifest',
  projects: '/api/projects',
  workspace_status: '/api/workspace-status',
  runtime_status: '/api/runtime-status',
  dashboard: '/api/dashboard',
  ask: '/api/ask',
  sessions: '/api/sessions',
  resume: '/api/resume',
  logs: '/api/logs',
} as const;

type CommandResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

type GitCommandResult = CommandResult & {
  ok: boolean;
  text: string;
};

function runCommand(command: string, args: string[], cwd?: string): CommandResult {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    env: process.env,
  });

  return {
    exitCode: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

function normalizeOutput(stdout: string, stderr = '') {
  return [stdout, stderr]
    .filter((chunk) => chunk.trim().length > 0)
    .join('\n')
    .trim();
}

function runGit(cwd: string, args: string[]): GitCommandResult {
  const result = runCommand('git', ['-C', cwd, ...args]);

  return {
    ...result,
    ok: result.exitCode === 0,
    text: normalizeOutput(result.stdout, result.stderr),
  };
}

function parseStatusLine(statusLine: string) {
  const branchMatch = statusLine.match(/^##\s+([^\s.]+)(?:\.\.\.([^\s]+))?(?:\s+\[(.+)\])?$/);

  return {
    raw: statusLine,
    branch: branchMatch?.[1] ?? null,
    upstream: branchMatch?.[2] ?? null,
    upstream_state: branchMatch?.[3] ?? null,
  };
}

function buildWorkspaceEntriesSummary(absolutePath: string) {
  const entries = fs.readdirSync(absolutePath, { withFileTypes: true });
  const directories = entries.filter((entry) => entry.isDirectory()).length;
  const files = entries.filter((entry) => entry.isFile()).length;
  const others = entries.length - directories - files;

  return {
    total: entries.length,
    directories,
    files,
    others,
    sample: entries
      .slice(0, 12)
      .map((entry) => ({
        name: entry.name,
        kind: entry.isDirectory() ? 'directory' : entry.isFile() ? 'file' : 'other',
      })),
  };
}

function buildGitWorkspaceStatus(absolutePath: string) {
  const inside = runGit(absolutePath, ['rev-parse', '--is-inside-work-tree']);
  if (!inside.ok || inside.text !== 'true') {
    return {
      inside_work_tree: false,
    };
  }

  const root = runGit(absolutePath, ['rev-parse', '--show-toplevel']);
  const gitDir = runGit(absolutePath, ['rev-parse', '--path-format=absolute', '--git-dir']);
  const commonDir = runGit(absolutePath, ['rev-parse', '--path-format=absolute', '--git-common-dir']);
  const status = runGit(absolutePath, ['status', '--short', '--branch']);
  const lines = status.ok
    ? status.stdout.split(/\r?\n/).map((line) => line.trimEnd()).filter(Boolean)
    : [];
  const statusLine = lines[0] ?? null;
  const fileLines = lines.slice(statusLine ? 1 : 0);

  const stagedCount = fileLines.filter((line) => {
    const indexStatus = line[0];
    return indexStatus && indexStatus !== ' ' && indexStatus !== '?';
  }).length;
  const modifiedCount = fileLines.filter((line) => {
    const worktreeStatus = line[1];
    return worktreeStatus && worktreeStatus !== ' ';
  }).length;
  const untrackedCount = fileLines.filter((line) => line.startsWith('??')).length;

  return {
    inside_work_tree: true,
    root: root.ok ? root.text : absolutePath,
    git_dir: gitDir.ok ? gitDir.text : null,
    git_common_dir: commonDir.ok ? commonDir.text : null,
    linked_worktree: Boolean(gitDir.ok && commonDir.ok && gitDir.text !== commonDir.text),
    status_line: statusLine,
    branch: statusLine ? parseStatusLine(statusLine).branch : null,
    upstream: statusLine ? parseStatusLine(statusLine).upstream : null,
    upstream_state: statusLine ? parseStatusLine(statusLine).upstream_state : null,
    modified_count: modifiedCount,
    staged_count: stagedCount,
    untracked_count: untrackedCount,
    is_clean: fileLines.length === 0,
  };
}

function normalizeWorkspacePath(workspacePath?: string) {
  const resolved = path.resolve(workspacePath ?? process.cwd());

  if (!fs.existsSync(resolved)) {
    throw new GatewayContractError(
      'cli_usage_error',
      'workspace-status requires an existing path.',
      {
        workspace_path: resolved,
      },
    );
  }

  return resolved;
}

type HermesStatusSectionMap = Record<string, Record<string, string>>;

export function parseHermesStatusOutput(output: string) {
  const sections: HermesStatusSectionMap = {};
  let currentSection: string | null = null;

  for (const rawLine of output.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    const sectionMatch = line.match(/^◆\s+(.+)$/);
    if (sectionMatch) {
      currentSection = sectionMatch[1].trim();
      sections[currentSection] = {};
      continue;
    }

    if (!currentSection) {
      continue;
    }

    const fieldMatch =
      line.match(/^\s{2,}([A-Za-z0-9./() _-]+):\s{2,}(.*)$/)
      ?? line.match(/^\s{2,}(.+?)\s{2,}(.+)$/);

    if (!fieldMatch) {
      continue;
    }

    sections[currentSection][fieldMatch[1].trim()] = fieldMatch[2].trim();
  }

  const messagingPlatforms = Object.entries(sections['Messaging Platforms'] ?? {})
    .filter(([, value]) => value.startsWith('✓'))
    .map(([name]) => name);

  return {
    sections,
    summary: {
      project_root: sections.Environment?.Project ?? null,
      model: sections.Environment?.Model ?? null,
      terminal_backend: sections['Terminal Backend']?.Backend ?? null,
      gateway_status: sections['Gateway Service']?.Status ?? null,
      gateway_manager: sections['Gateway Service']?.Manager ?? null,
      scheduled_jobs: sections['Scheduled Jobs']?.Jobs
        ? Number.parseInt(sections['Scheduled Jobs'].Jobs, 10)
        : null,
      active_sessions: sections.Sessions?.Active
        ? Number.parseInt(sections.Sessions.Active, 10)
        : null,
      configured_messaging_platforms: messagingPlatforms,
    },
  };
}

export function parseHermesProcessTable(output: string) {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.match(/^(\d+)\s+(\d+)\s+([\d.]+)\s+([\d.]+)\s+(\d+)\s+(\S+)\s+(.+)$/))
    .filter((match): match is RegExpMatchArray => Boolean(match))
    .map((match) => {
      const command = match[7];
      const normalized = command.toLowerCase();

      return {
        pid: Number.parseInt(match[1], 10),
        ppid: Number.parseInt(match[2], 10),
        cpu_percent: Number.parseFloat(match[3]),
        memory_percent: Number.parseFloat(match[4]),
        rss_kb: Number.parseInt(match[5], 10),
        elapsed: match[6],
        command,
        role: normalized.includes('gateway run')
          ? 'gateway'
          : normalized.includes('hermes')
            ? 'runtime_process'
            : 'other',
      };
    });
}

function collectHermesProcessUsage() {
  const result = runCommand('ps', ['-axo', 'pid=,ppid=,pcpu=,pmem=,rss=,etime=,command=']);
  if (result.exitCode !== 0) {
    throw new GatewayContractError(
      'hermes_command_failed',
      'Failed to collect process data for Hermes runtime status.',
      {
        command: ['ps', '-axo', 'pid=,ppid=,pcpu=,pmem=,rss=,etime=,command='],
        stdout: result.stdout,
        stderr: result.stderr,
      },
    );
  }

  const processes = parseHermesProcessTable(result.stdout).filter((entry) =>
    /(^|\s|\/)hermes($|\s)|hermes_cli(\.main)?/i.test(entry.command),
  );

  return {
    raw_output: processes
      .map((entry) =>
        [
          entry.pid,
          entry.ppid,
          entry.cpu_percent.toFixed(1),
          entry.memory_percent.toFixed(1),
          entry.rss_kb,
          entry.elapsed,
          entry.command,
        ].join(' '),
      )
      .join('\n'),
    processes,
    summary: {
      process_count: processes.length,
      total_rss_kb: processes.reduce((sum, entry) => sum + entry.rss_kb, 0),
      total_cpu_percent: Number(
        processes.reduce((sum, entry) => sum + entry.cpu_percent, 0).toFixed(1),
      ),
    },
  };
}

function buildRecentSessions(limit = 5) {
  const result = runHermesCommand(buildHermesSessionsListArgs({ limit }));

  if (result.exitCode !== 0) {
    throw new GatewayContractError(
      'hermes_command_failed',
      'Hermes sessions list failed inside OPL runtime-status.',
      {
        args: buildHermesSessionsListArgs({ limit }),
        stdout: result.stdout,
        stderr: result.stderr,
      },
    );
  }

  return {
    command_preview: ['hermes', ...buildHermesSessionsListArgs({ limit })],
    sessions: parseHermesSessionsTable(result.stdout),
  };
}

export function buildProjectsOverview(contracts: GatewayContracts) {
  return {
    version: 'g2',
    contracts_context: {
      contracts_dir: contracts.contractsDir,
      contracts_root_source: contracts.contractsRootSource,
    },
    projects: [
      {
        project_id: 'opl',
        project: 'one-person-lab',
        scope: 'family_gateway',
        direct_entry_surface: 'opl',
        owned_workstreams: contracts.workstreams.workstreams.map((workstream) => workstream.workstream_id),
      },
      ...contracts.domains.domains.map((domain) => ({
        project_id: domain.domain_id,
        project: domain.project,
        scope: 'domain_gateway',
        gateway_surface: domain.gateway_surface,
        harness_surface: domain.harness_surface,
        standalone_allowed: domain.standalone_allowed,
        owned_workstreams: domain.owned_workstreams,
      })),
    ],
  };
}

export function buildFrontDeskManifest(contracts: GatewayContracts) {
  return {
    version: 'g2',
    contracts_context: {
      contracts_dir: contracts.contractsDir,
      contracts_root_source: contracts.contractsRootSource,
    },
    frontdesk_manifest: {
      surface_id: 'opl_hosted_friendly_frontdesk_manifest',
      entry_surface: 'opl_local_web_frontdesk_pilot',
      runtime_substrate: 'external_hermes_kernel',
      shell_integration_target: 'librechat_first',
      readiness: 'hosted_friendly_local_only',
      hosted_packaging_status: 'not_landed',
      handoff_envelope_fields: [
        'target_domain_id',
        'task_intent',
        'entry_mode',
        'workspace_locator',
        'runtime_session_contract',
        'return_surface_contract',
      ],
      endpoints: frontDeskEndpoints,
      notes: [
        'This manifest freezes the local hosted-friendly shell contract that future web shells can consume.',
        'It does not claim that hosted packaging, hosted runtime ownership, or LibreChat-first rollout are already landed.',
      ],
    },
  };
}

export function buildWorkspaceStatus(options: WorkspaceStatusOptions = {}) {
  const absolutePath = normalizeWorkspacePath(options.workspacePath);
  const stats = fs.statSync(absolutePath);

  if (!stats.isDirectory()) {
    throw new GatewayContractError(
      'cli_usage_error',
      'workspace-status currently supports directories only.',
      {
        workspace_path: absolutePath,
      },
    );
  }

  return {
    version: 'g2',
    workspace: {
      requested_path: options.workspacePath ?? process.cwd(),
      absolute_path: absolutePath,
      kind: 'directory',
      entries: buildWorkspaceEntriesSummary(absolutePath),
      git: buildGitWorkspaceStatus(absolutePath),
    },
  };
}

export function buildRuntimeStatus(options: RuntimeStatusOptions = {}) {
  const hermes = inspectHermesRuntime();
  const statusResult = hermes.binary ? runHermesCommand(['status']) : null;
  const statusOutput = statusResult ? normalizeOutput(statusResult.stdout, statusResult.stderr) : '';
  const parsedStatus = statusOutput ? parseHermesStatusOutput(statusOutput) : null;
  const processUsage = collectHermesProcessUsage();
  const recentSessions = hermes.binary ? buildRecentSessions(options.sessionsLimit ?? 5) : {
    command_preview: ['hermes', 'sessions', 'list', '--limit', String(options.sessionsLimit ?? 5)],
    sessions: [],
  };

  return {
    version: 'g2',
    runtime_status: {
      runtime_substrate: 'external_hermes_kernel',
      hermes,
      status_report: {
        command_preview: ['hermes', 'status'],
        raw_output: statusOutput,
        parsed: parsedStatus,
      },
      recent_sessions: recentSessions,
      process_usage: processUsage,
      notes: [
        'Process usage is runtime-level visibility, not a guaranteed per-session resource attribution.',
        'Workspace and project orchestration still sit above the external Hermes kernel.',
      ],
    },
  };
}

export function buildFrontDeskHealth(contracts: GatewayContracts) {
  const hermes = inspectHermesRuntime();
  const status = !hermes.binary
    ? 'blocked'
    : hermes.gateway_service.loaded
      ? 'ok'
      : 'degraded';

  return {
    version: 'g2',
    contracts_context: {
      contracts_dir: contracts.contractsDir,
      contracts_root_source: contracts.contractsRootSource,
    },
    health: {
      surface_id: 'opl_frontdesk_health_surface',
      entry_surface: 'opl_local_web_frontdesk_pilot',
      runtime_substrate: 'external_hermes_kernel',
      status,
      hosted_packaging_status: 'not_landed',
      checks: {
        hermes_binary: {
          found: Boolean(hermes.binary),
          path: hermes.binary?.path ?? null,
          source: hermes.binary?.source ?? null,
        },
        gateway_service: {
          loaded: hermes.gateway_service.loaded,
          raw_output: hermes.gateway_service.raw_output,
        },
        issues: hermes.issues,
      },
      notes: [
        'Health here means the local front-desk shell can truthfully expose the current Hermes-backed runtime status.',
        'Hosted packaging and hosted rollout remain separate work even when this local health surface is green.',
      ],
    },
  };
}

export function buildFrontDeskDashboard(
  contracts: GatewayContracts,
  options: DashboardOptions = {},
) {
  const projects = buildProjectsOverview(contracts).projects;
  const workspace = buildWorkspaceStatus({ workspacePath: options.workspacePath }).workspace;
  const runtimeStatus = buildRuntimeStatus({ sessionsLimit: options.sessionsLimit }).runtime_status;

  return {
    version: 'g2',
    contracts_context: {
      contracts_dir: contracts.contractsDir,
      contracts_root_source: contracts.contractsRootSource,
    },
    dashboard: {
      front_desk: {
        direct_entry_command: 'opl',
        local_shell_status: 'landed',
        local_web_frontdesk_command: 'opl web',
        local_web_frontdesk_status: 'pilot_landed',
        hosted_friendly_surface_status: 'landed',
        hosted_web_status: 'librechat_pilot_frozen_not_landed',
        next_major_target: 'opl_hosted_web_frontdesk_packaging',
        hosted_friendly_endpoints: frontDeskEndpoints,
        rollout_board_refs: [
          'docs/references/opl-frontdesk-delivery-board.md',
          'docs/references/opl-hosted-web-frontdesk-benchmark.md',
          'docs/references/family-lightweight-direct-entry-rollout-board.md',
          'docs/references/mas-top-level-cutover-board.md',
        ],
        notes: [
          'OPL now exposes a local web front-desk pilot through `opl web`.',
          'The hosted-friendly shell contract now has dedicated manifest/health/session/resume/log surfaces for future hosted shells.',
          'Hosted packaging still remains a separate follow-up track; this repo does not yet claim hosted readiness.',
        ],
      },
      projects,
      workspace,
      runtime_status: runtimeStatus,
    },
  };
}
