import fs from 'node:fs';

import { FrameworkContractError } from '../contracts.ts';
import { inspectFamilyRuntimeProviders, resolveFamilyRuntimeProviderKind } from '../family-runtime-providers.ts';
import { buildSessionLedger } from '../session-ledger.ts';

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
  const ledger = buildSessionLedger(options.ledgerLimit ?? options.sessionsLimit ?? 5).session_ledger;

  return {
    version: 'g2',
    runtime_status: {
      runtime_substrate: 'provider_backed_family_runtime',
      configured_provider: providerKind,
      family_runtime_providers: familyRuntimeProviders,
      managed_session_ledger: ledger,
      notes: [
        'Runtime status is provider-backed and uses provider surfaces plus the OPL-managed session ledger.',
        'The managed session ledger adds OPL-owned event attribution, but does not claim kernel-global exact per-session billing.',
        'Workspace and project orchestration sit above the configured family runtime provider.',
      ],
    },
  };
}
