import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { GatewayContractError } from './contracts.ts';
import {
  buildFrontDeskApiBaseUrl,
  buildFrontDeskEndpoints,
  buildFrontDeskEntryUrl,
  normalizeBasePath,
} from './frontdesk-paths.ts';
import { buildDomainManifestCatalog } from './domain-manifest.ts';
import {
  buildHermesSessionsListArgs,
  inspectHermesRuntime,
  parseHermesSessionsTable,
  runHermesCommand,
} from './hermes.ts';
import { buildSessionLedger } from './session-ledger.ts';
import {
  collectHermesProcessUsage,
  normalizeCommandOutput,
  parseHermesStatusOutput,
} from './runtime-observer.ts';
import { buildWorkspaceCatalog, getActiveWorkspaceBinding } from './workspace-registry.ts';
import { buildPaperclipControlPlaneSummary } from './paperclip-control-plane.ts';
import type { GatewayContracts } from './types.ts';

export interface WorkspaceStatusOptions {
  workspacePath?: string;
}

export interface RuntimeStatusOptions {
  sessionsLimit?: number;
  ledgerLimit?: number;
}

export interface DashboardOptions extends WorkspaceStatusOptions, RuntimeStatusOptions {
  basePath?: string;
}

export interface HostedPilotBundleOptions {
  host?: string;
  port?: number;
  workspacePath?: string;
  sessionsLimit?: number;
  basePath?: string;
}

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

function runGit(cwd: string, args: string[]): GitCommandResult {
  const result = runCommand('git', ['-C', cwd, ...args]);

  return {
    ...result,
    ok: result.exitCode === 0,
    text: normalizeCommandOutput(result.stdout, result.stderr),
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

function pickManifestPhaseId(repoMainline: Record<string, unknown> | null) {
  if (!repoMainline) {
    return null;
  }

  return [
    repoMainline.phase_id,
    repoMainline.current_program_phase_id,
    repoMainline.active_phase,
  ].find((value) => typeof value === 'string' && value.trim()) ?? null;
}

function pickManifestTrancheId(repoMainline: Record<string, unknown> | null) {
  if (!repoMainline) {
    return null;
  }

  return [
    repoMainline.tranche_id,
    repoMainline.current_stage_id,
    repoMainline.active_tranche,
  ].find((value) => typeof value === 'string' && value.trim()) ?? null;
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

function normalizeBaseUrlHost(host: string) {
  if (host === '0.0.0.0') {
    return '127.0.0.1';
  }

  if (host === '::') {
    return '[::1]';
  }

  return host.includes(':') && !host.startsWith('[') ? `[${host}]` : host;
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
        active_binding: getActiveWorkspaceBinding('opl'),
        owned_workstreams: contracts.workstreams.workstreams.map((workstream) => workstream.workstream_id),
      },
      ...contracts.domains.domains.map((domain) => ({
        project_id: domain.domain_id,
        project: domain.project,
        scope: 'domain_gateway',
        gateway_surface: domain.gateway_surface,
        harness_surface: domain.harness_surface,
        standalone_allowed: domain.standalone_allowed,
        active_binding: getActiveWorkspaceBinding(domain.domain_id),
        owned_workstreams: domain.owned_workstreams,
      })),
    ],
  };
}

export function buildFrontDeskManifest(contracts: GatewayContracts, options: { basePath?: string } = {}) {
  const endpoints = buildFrontDeskEndpoints(options.basePath);

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
      readiness: 'hosted_friendly_shell_pilot_landed',
      hosted_packaging_status: 'librechat_pilot_landed',
      pilot_bundle_status: 'landed',
      base_path: normalizeBasePath(options.basePath),
      handoff_envelope_fields: [
        'target_domain_id',
        'task_intent',
        'entry_mode',
        'workspace_locator',
        'runtime_session_contract',
        'return_surface_contract',
      ],
      endpoints,
      notes: [
        'This manifest freezes the local hosted-friendly shell contract now consumed by the landed LibreChat-first pilot package.',
        'It still does not claim managed hosted runtime ownership or multi-tenant platform readiness.',
      ],
    },
  };
}

export function buildHostedPilotBundle(
  contracts: GatewayContracts,
  options: HostedPilotBundleOptions = {},
) {
  const host = options.host ?? '127.0.0.1';
  const port = options.port ?? 8787;
  const workspacePath = normalizeWorkspacePath(options.workspacePath);
  const sessionsLimit = options.sessionsLimit ?? 5;
  const normalizedBasePath = normalizeBasePath(options.basePath);
  const baseUrl = `http://${normalizeBaseUrlHost(host)}:${port}`;
  const endpoints = buildFrontDeskEndpoints(normalizedBasePath);

  return {
    version: 'g2',
    contracts_context: {
      contracts_dir: contracts.contractsDir,
      contracts_root_source: contracts.contractsRootSource,
    },
    hosted_pilot_bundle: {
      surface_id: 'opl_hosted_frontdesk_pilot_bundle',
      runtime_substrate: 'external_hermes_kernel',
      shell_integration_target: 'librechat_first',
      pilot_bundle_status: 'landed',
      actual_hosted_runtime_status: 'not_landed',
      base_path: normalizedBasePath,
      entry_url: buildFrontDeskEntryUrl(baseUrl, normalizedBasePath),
      api_base_url: buildFrontDeskApiBaseUrl(baseUrl, normalizedBasePath),
      endpoints,
      defaults: {
        workspace_path: workspacePath,
        sessions_limit: sessionsLimit,
      },
      notes: [
        'This bundle makes the current front desk hosted-pilot-ready through base-path-aware shell packaging.',
        'It now feeds the landed LibreChat-first hosted shell pilot package, but it is still not a managed hosted runtime or multi-tenant platform deployment.',
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

export function buildFrontDeskHealth(contracts: GatewayContracts, options: { basePath?: string } = {}) {
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
      base_path: normalizeBasePath(options.basePath),
      status,
      hosted_packaging_status: 'librechat_pilot_landed',
      pilot_bundle_status: 'landed',
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
        'Health here means the current front-desk shell can truthfully expose the Hermes-backed runtime status.',
        'LibreChat-first hosted shell export is landed, but actual hosted runtime ownership is still not landed.',
      ],
    },
  };
}

export function buildFrontDeskDashboard(
  contracts: GatewayContracts,
  options: DashboardOptions = {},
) {
  const endpoints = buildFrontDeskEndpoints(options.basePath);
  const paperclipControlPlane = buildPaperclipControlPlaneSummary(contracts);
  const projects = buildProjectsOverview(contracts).projects;
  const workspace = buildWorkspaceStatus({ workspacePath: options.workspacePath }).workspace;
  const runtimeStatus = buildRuntimeStatus({
    sessionsLimit: options.sessionsLimit,
    ledgerLimit: options.sessionsLimit,
  }).runtime_status;
  const workspaceCatalog = buildWorkspaceCatalog(contracts).workspace_catalog;
  const domainManifests = buildDomainManifestCatalog(contracts).domain_manifests;
  const recommendedEntrySurfaces = domainManifests.projects
    .filter((entry) => entry.status === 'resolved' && entry.manifest?.recommended_command)
    .map((entry) => ({
      project_id: entry.project_id,
      project: entry.project,
      binding_id: entry.binding_id,
      manifest_target_domain_id: entry.manifest?.target_domain_id ?? null,
      frontdesk_surface: entry.manifest?.frontdesk_surface ?? null,
      operator_loop_shell_key: entry.manifest?.operator_loop_surface?.shell_key ?? null,
      operator_loop_command: entry.manifest?.operator_loop_surface?.command ?? null,
      operator_loop_surface_kind: entry.manifest?.operator_loop_surface?.surface_kind ?? null,
      operator_loop_summary: entry.manifest?.operator_loop_surface?.summary ?? null,
      operator_loop_continuation_command: entry.manifest?.operator_loop_surface?.continuation_command ?? null,
      operator_loop_actions: entry.manifest?.operator_loop_actions ?? {},
      product_entry_overview: entry.manifest?.product_entry_overview ?? null,
      product_entry_preflight: entry.manifest?.product_entry_preflight ?? null,
      product_entry_quickstart: entry.manifest?.product_entry_quickstart ?? null,
      manifest_version: entry.manifest?.manifest_version ?? null,
      recommended_shell: entry.manifest?.recommended_shell ?? null,
      recommended_command: entry.manifest?.recommended_command ?? null,
      product_entry_shell: entry.manifest?.product_entry_shell ?? {},
      shared_handoff: entry.manifest?.shared_handoff ?? {},
      family_orchestration: entry.manifest?.family_orchestration ?? null,
      product_entry_readiness: entry.manifest?.product_entry_readiness ?? null,
      manifest_command: entry.manifest_command,
      workspace_path: entry.workspace_path,
      mainline_phase_id: pickManifestPhaseId(entry.manifest?.repo_mainline ?? null),
      mainline_tranche_id: pickManifestTrancheId(entry.manifest?.repo_mainline ?? null),
      product_entry_status_summary: entry.manifest?.product_entry_status?.summary ?? null,
      product_entry_next_focus: entry.manifest?.product_entry_status?.next_focus ?? [],
      product_entry_remaining_gaps_count:
        entry.manifest?.product_entry_status?.remaining_gaps_count
        ?? entry.manifest?.remaining_gaps.length
        ?? null,
      product_entry_overview_summary: entry.manifest?.product_entry_overview?.summary ?? null,
      product_entry_overview_progress_command:
        entry.manifest?.product_entry_overview?.progress_surface?.command ?? null,
      product_entry_overview_resume_command:
        entry.manifest?.product_entry_overview?.resume_surface?.command ?? null,
      product_entry_overview_human_gate_ids: entry.manifest?.product_entry_overview?.human_gate_ids ?? [],
      product_entry_preflight_summary: entry.manifest?.product_entry_preflight?.summary ?? null,
      product_entry_preflight_ready_to_try_now:
        entry.manifest?.product_entry_preflight?.ready_to_try_now ?? null,
      product_entry_preflight_recommended_check_command:
        entry.manifest?.product_entry_preflight?.recommended_check_command ?? null,
      product_entry_preflight_recommended_start_command:
        entry.manifest?.product_entry_preflight?.recommended_start_command ?? null,
      product_entry_preflight_blocking_check_ids:
        entry.manifest?.product_entry_preflight?.blocking_check_ids ?? [],
      product_entry_preflight_checks_count:
        entry.manifest?.product_entry_preflight?.checks.length ?? 0,
      product_entry_readiness_verdict: entry.manifest?.product_entry_readiness?.verdict ?? null,
      product_entry_readiness_summary: entry.manifest?.product_entry_readiness?.summary ?? null,
      product_entry_readiness_usable_now: entry.manifest?.product_entry_readiness?.usable_now ?? null,
      product_entry_readiness_good_to_use_now:
        entry.manifest?.product_entry_readiness?.good_to_use_now ?? null,
      product_entry_readiness_fully_automatic:
        entry.manifest?.product_entry_readiness?.fully_automatic ?? null,
      product_entry_readiness_start_command:
        entry.manifest?.product_entry_readiness?.recommended_start_command ?? null,
      product_entry_readiness_loop_command:
        entry.manifest?.product_entry_readiness?.recommended_loop_command ?? null,
      product_entry_readiness_blocking_gaps:
        entry.manifest?.product_entry_readiness?.blocking_gaps ?? [],
      family_human_gate_count: entry.manifest?.family_orchestration?.human_gates.length ?? 0,
      family_human_gate_ids:
        entry.manifest?.family_orchestration?.human_gates.map((gate) => String(gate.gate_id)) ?? [],
      family_resume_surface_kind: entry.manifest?.family_orchestration?.resume_contract?.surface_kind ?? null,
      family_action_graph_ref: entry.manifest?.family_orchestration?.action_graph_ref?.ref ?? null,
      family_action_graph_node_count:
        Array.isArray(entry.manifest?.family_orchestration?.action_graph?.nodes)
          ? entry.manifest.family_orchestration.action_graph.nodes.length
          : 0,
      family_action_graph_edge_count:
        Array.isArray(entry.manifest?.family_orchestration?.action_graph?.edges)
          ? entry.manifest.family_orchestration.action_graph.edges.length
          : 0,
      family_event_envelope_ref: entry.manifest?.family_orchestration?.event_envelope_surface?.ref ?? null,
      family_checkpoint_lineage_ref:
        entry.manifest?.family_orchestration?.checkpoint_lineage_surface?.ref ?? null,
      quickstart_step_count: entry.manifest?.product_entry_quickstart?.steps.length ?? 0,
      quickstart_step_ids: entry.manifest?.product_entry_quickstart?.steps.map((step) => step.step_id) ?? [],
    }));

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
        hosted_pilot_bundle_status: 'landed',
        hosted_web_status: 'librechat_pilot_landed',
        librechat_pilot_package_status: 'landed',
        workspace_registry_status: 'landed',
        session_ledger_status: 'landed',
        handoff_bundle_status: 'landed',
        paperclip_control_plane_status: paperclipControlPlane.readiness,
        paperclip_control_plane_endpoint: endpoints.paperclip_control_plane,
        paperclip_bound_projects_count: paperclipControlPlane.summary.project_bindings_count,
        paperclip_control_company_id: paperclipControlPlane.connection.control_company_id,
        recommended_entry_surfaces_count: recommendedEntrySurfaces.length,
        recommended_entry_surfaces: recommendedEntrySurfaces,
        next_major_target: 'opl_hosted_runtime_hardening',
        hosted_friendly_endpoints: endpoints,
        rollout_board_refs: [
          'docs/references/opl-frontdesk-delivery-board.md',
          'docs/references/opl-hosted-web-frontdesk-benchmark.md',
          'docs/references/family-lightweight-direct-entry-rollout-board.md',
          'docs/references/mas-top-level-cutover-board.md',
        ],
      notes: [
        'OPL now exposes a base-path-aware hosted pilot bundle in addition to the local web front-desk pilot.',
        'Workspace registry, managed session ledger, and handoff bundle surfaces are now part of the top-level control room.',
        'Paperclip can now sit downstream as an external control plane through a file-backed OPL bridge instead of becoming a replacement runtime.',
        'workspace-catalog keeps manifest_command as non-executing registry state, while domain-manifests resolves the active bound machine-readable product-entry manifests.',
        'Resolved domain manifests now also feed frontdesk surface plus operator-loop actions and recommended shell/command hints back into dashboard and handoff surfaces.',
        'Resolved domain manifests now also surface family-orchestration companion previews so the top-level front desk can show human-gate and resume semantics instead of hiding them in domain docs.',
        'The LibreChat-first hosted shell pilot is now landed through the export package, while managed hosted runtime readiness remains a separate follow-up track.',
      ],
    },
      projects,
      workspace,
      workspace_catalog: workspaceCatalog,
      domain_manifests: domainManifests,
      runtime_status: runtimeStatus,
    },
  };
}

export function buildPaperclipControlPlaneStatus(
  contracts: GatewayContracts,
  options: DashboardOptions = {},
) {
  const endpoints = buildFrontDeskEndpoints(options.basePath);
  const paperclipControlPlane = buildPaperclipControlPlaneSummary(contracts);

  return {
    version: 'g2',
    contracts_context: {
      contracts_dir: contracts.contractsDir,
      contracts_root_source: contracts.contractsRootSource,
    },
    paperclip_control_plane: {
      action: 'status',
      ...paperclipControlPlane,
      gateway: {
        surface: {
          surface_id: 'opl_paperclip_control_plane_bridge_surface',
          endpoints: {
            control_plane: endpoints.paperclip_control_plane,
            bootstrap: endpoints.paperclip_bootstrap,
            sync: endpoints.paperclip_sync,
            dashboard: endpoints.dashboard,
            domain_manifests: endpoints.domain_manifests,
            handoff_envelope: endpoints.handoff_envelope,
          },
          contract_refs: {
            handoff: 'contracts/opl-gateway/handoff.schema.json',
            family_human_gate: 'contracts/family-orchestration/family-human-gate.schema.json',
            governance_audit: 'contracts/opl-gateway/governance-audit.schema.json',
          },
        },
        dashboard: buildFrontDeskDashboard(contracts, options).dashboard,
      },
    },
  };
}
