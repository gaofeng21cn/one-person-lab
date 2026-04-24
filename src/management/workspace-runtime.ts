import fs from 'node:fs';

import { GatewayContractError } from '../contracts.ts';
import {
  buildHermesSessionsListArgs,
  inspectHermesRuntime,
  parseHermesSessionsTable,
  runHermesCommand,
} from '../hermes.ts';
import { buildSessionLedger } from '../session-ledger.ts';
import {
  collectHermesProcessUsage,
  normalizeCommandOutput,
  parseHermesStatusOutput,
} from '../runtime-observer.ts';

import type { RuntimeStatusOptions, WorkspaceStatusOptions } from './types.ts';
import {
  buildGitWorkspaceStatus,
  buildWorkspaceEntriesSummary,
  normalizeWorkspacePath,
} from './shared.ts';

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
  const statusOutput = statusResult ? normalizeCommandOutput(statusResult.stdout, statusResult.stderr) : '';
  const parsedStatus = statusOutput ? parseHermesStatusOutput(statusOutput) : null;
  const processUsage = collectHermesProcessUsage();
  const recentSessions = hermes.binary ? buildRecentSessions(options.sessionsLimit ?? 5) : {
    command_preview: ['hermes', 'sessions', 'list', '--limit', String(options.sessionsLimit ?? 5)],
    sessions: [],
  };
  const ledger = buildSessionLedger(options.ledgerLimit ?? options.sessionsLimit ?? 5).session_ledger;

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
      managed_session_ledger: ledger,
      notes: [
        'Process usage remains runtime-level visibility.',
        'The managed session ledger adds OPL-owned event attribution, but does not claim kernel-global exact per-session billing.',
        'Workspace and project orchestration still sit above the external Hermes kernel.',
      ],
    },
  };
}

