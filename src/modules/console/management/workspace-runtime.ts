import fs from 'node:fs';

import { FrameworkContractError } from '../../../kernel/contract-validation.ts';
import { inspectSelectedFamilyRuntimeProvidersWithLifecycle } from '../../runway/index.ts';
import { readManagedProviderProjectionSummary } from '../../runway/index.ts';
import { familyRuntimePaths } from '../../runway/index.ts';
import { buildSessionLedger } from '../../runway/index.ts';

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

export async function buildRuntimeStatus(options: RuntimeStatusOptions = {}) {
  const { selectedProvider, providerRuntime: familyRuntimeProviders } =
    await inspectSelectedFamilyRuntimeProvidersWithLifecycle({
      paths: familyRuntimePaths(),
      options: {
        managedProviderProjection: readManagedProviderProjectionSummary(),
      },
    });
  const ledger = buildSessionLedger(options.ledgerLimit ?? options.sessionsLimit ?? 5).session_ledger;

  return {
    version: 'g2',
    runtime_status: {
      runtime_substrate: 'provider_backed_family_runtime',
      configured_provider: selectedProvider,
      family_runtime_providers: familyRuntimeProviders,
      production_provider_policy: {
        required_provider: 'temporal',
        configured_provider_role: familyRuntimeProviders.provider_catalog[selectedProvider]?.provider_role ?? 'unknown',
        local_sqlite_provider_retired: true,
        domain_daemon_policy: 'domain_launchagents_and_repo_local_supervision_ticks_are_legacy_cleanup_or_diagnostic_only',
        scheduler_replacement_surface: 'opl family-runtime scheduler install|status|trigger|remove --provider temporal',
      },
      managed_session_ledger: ledger,
      notes: [
        'Runtime status is provider-backed and uses provider surfaces plus the OPL-managed session ledger.',
        'Temporal is the family runtime provider; local_sqlite is retired as a provider and any SQLite sidecar is projection/readback index only.',
        'Domain LaunchAgent or repo-local supervision daemons must be retired or kept as explicit diagnostics after OPL scheduler replacement is installed.',
        'The managed session ledger adds OPL-owned event attribution, but does not claim kernel-global exact per-session billing.',
        'Workspace and project orchestration sit above the configured family runtime provider.',
      ],
    },
  };
}
