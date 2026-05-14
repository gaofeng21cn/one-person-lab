import fs from 'node:fs';

import { FrameworkContractError } from '../contracts.ts';
import { inspectHermesRuntime } from '../hermes.ts';
import { inspectFamilyRuntimeProviders, resolveFamilyRuntimeProviderKind } from '../family-runtime-providers.ts';
import { buildSessionLedger } from '../session-ledger.ts';
import { collectHermesProcessUsage } from '../runtime-observer.ts';

import type { RuntimeStatusOptions, WorkspaceStatusOptions } from './types.ts';
import {
  buildGitWorkspaceStatus,
  buildWorkspaceEntriesSummary,
  normalizeWorkspacePath,
} from './shared.ts';

export function buildWorkspaceStatus(options: WorkspaceStatusOptions = {}) {
  const absolutePath = normalizeWorkspacePath(options.workspacePath);
  const stats = fs.statSync(absolutePath);

  if (!stats.isDirectory()) {
    throw new FrameworkContractError(
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
  const providerKind = resolveFamilyRuntimeProviderKind();
  const familyRuntimeProviders = inspectFamilyRuntimeProviders(providerKind);
  const hermes = inspectHermesRuntime({
    deep: false,
    reason: 'Runtime status did not deep-inspect Hermes because OPL family-runtime providers are local_sqlite or temporal only.',
  });
  const statusOutput = '';
  const parsedStatus = null;
  const processUsage = collectHermesProcessUsage();
  const recentSessions = {
    command_preview: ['hermes', 'sessions', 'list', '--limit', String(options.sessionsLimit ?? 5)],
    sessions: [],
  };
  const ledger = buildSessionLedger(options.ledgerLimit ?? options.sessionsLimit ?? 5).session_ledger;

  return {
    version: 'g2',
    runtime_status: {
      runtime_substrate: 'provider_backed_family_runtime',
      configured_provider: providerKind,
      family_runtime_providers: familyRuntimeProviders,
      hermes_diagnostics: {
        hermes,
        status_report: {
          command_preview: ['hermes', 'status'],
          raw_output: statusOutput,
          parsed: parsedStatus,
        },
        recent_sessions: recentSessions,
        process_usage: processUsage,
      },
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
        'Runtime status is provider-backed; Hermes fields are explicit non-provider diagnostics only.',
        'Process usage remains runtime-level diagnostic visibility.',
        'The managed session ledger adds OPL-owned event attribution, but does not claim kernel-global exact per-session billing.',
        'Workspace and project orchestration sit above the configured family runtime provider.',
      ],
    },
  };
}
