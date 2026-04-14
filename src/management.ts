import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { findDomainOrThrow, GatewayContractError } from './contracts.ts';
import {
  buildFrontDeskApiBaseUrl,
  buildFrontDeskEndpoints,
  buildFrontDeskEntryUrl,
  normalizeBasePath,
} from './frontdesk-paths.ts';
import { buildDomainManifestCatalog, type DomainManifestCatalogEntry } from './domain-manifest.ts';
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

export interface StartSurfaceOptions {
  projectId: string;
  modeId?: string;
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

export function buildHostedRuntimeReadiness() {
  return {
    surface_kind: 'opl_hosted_runtime_readiness',
    status: 'pilot_ready_not_managed',
    shell_integration_target: 'librechat_first',
    managed_hosted_runtime_landed: false,
    local_web_frontdesk_landed: true,
    hosted_friendly_contract_landed: true,
    hosted_pilot_bundle_landed: true,
    self_hostable_pilot_package_landed: true,
    librechat_pilot_package_landed: true,
    service_safe_local_packaging_landed: true,
    blocking_gaps: [
      'managed hosted runtime ownership 仍未 landed。',
      'multi-tenant hosted platform orchestration 仍未 landed。',
      'frontdesk 与 hosted shell 的深层 tool wiring 仍未 landed。',
    ],
    recommended_next_actions: [
      '继续把 hosted shell 入口收紧到同一份 frontdesk contract 上。',
      '把 managed hosted runtime 的 service orchestration、tenant boundary 与 policy surface 单独冻结。',
      '保持 Hermes 作为外部 runtime substrate，不在 OPL 仓内虚构托管完成度。',
    ],
  };
}

function hasResolvedCommand(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0;
}

export function buildDomainEntryParity(projects: DomainManifestCatalogEntry[]) {
  const normalizedProjects = projects.map((entry) => {
    const manifest = entry.manifest;
    const binding = getActiveWorkspaceBinding(entry.project_id);
    const manifestResolved = entry.status === 'resolved' && manifest !== null;
    const directEntryLocatorReady = Boolean(binding?.direct_entry.command || binding?.direct_entry.url);
    const frontdeskSurfaceReady = Boolean(
      manifest?.frontdesk_surface?.surface_kind
      && hasResolvedCommand(manifest?.frontdesk_surface?.command),
    );
    const startSurfaceReady = Boolean(
      manifest?.product_entry_start?.surface_kind
      && Array.isArray(manifest?.product_entry_start?.modes)
      && manifest.product_entry_start.modes.length > 0,
    );
    const sharedHandoffReady = Boolean(
      manifest?.shared_handoff && Object.keys(manifest.shared_handoff).length > 0,
    );
    const readyForOplStart = Boolean(manifestResolved && startSurfaceReady);
    const readyForDomainHandoff = Boolean(manifestResolved && sharedHandoffReady);

    const gaps: string[] = [];
    if (!manifestResolved) {
      gaps.push('当前 active binding 尚未暴露 resolved product-entry manifest。');
    }
    if (manifestResolved && !directEntryLocatorReady) {
      gaps.push('当前 active binding 缺少 direct-entry locator（entry command 或 entry URL）。');
    }
    if (manifestResolved && !frontdeskSurfaceReady) {
      gaps.push('manifest 尚未暴露可直接消费的 frontdesk surface。');
    }
    if (manifestResolved && !startSurfaceReady) {
      gaps.push('manifest 尚未暴露可直接消费的 start surface。');
    }
    if (manifestResolved && !sharedHandoffReady) {
      gaps.push('manifest 尚未暴露 shared handoff surface。');
    }

    let entryParityStatus: 'aligned' | 'partial' | 'blocked' = 'blocked';
    if (manifestResolved && frontdeskSurfaceReady && startSurfaceReady && sharedHandoffReady) {
      entryParityStatus = directEntryLocatorReady ? 'aligned' : 'partial';
    } else if (manifestResolved) {
      entryParityStatus = 'partial';
    }

    const recommendedNextActions: string[] = [];
    if (!manifestResolved) {
      recommendedNextActions.push('先冻结并绑定 repo-tracked product-entry manifest。');
    }
    if (manifestResolved && !directEntryLocatorReady) {
      recommendedNextActions.push('给 active binding 补 entry_command 或 entry_url，让 OPL 可直接定位 domain frontdesk。');
    }
    if (manifestResolved && !frontdeskSurfaceReady) {
      recommendedNextActions.push('补齐 manifest.frontdesk_surface.command，让 frontdesk locator 与 manifest 一致。');
    }
    if (manifestResolved && !startSurfaceReady) {
      recommendedNextActions.push('补齐 product_entry_start surface，保持 OPL start 与 domain start 同口径。');
    }
    if (manifestResolved && !sharedHandoffReady) {
      recommendedNextActions.push('补齐 shared_handoff surface，让 OPL handoff 不再靠隐式约定。');
    }

    return {
      project_id: entry.project_id,
      project: entry.project,
      binding_id: binding?.binding_id ?? entry.binding_id,
      workspace_path: binding?.workspace_path ?? entry.workspace_path,
      entry_parity_status: entryParityStatus,
      manifest_status: entry.status,
      direct_entry_locator_status: directEntryLocatorReady ? 'ready' : 'missing',
      frontdesk_surface_status: frontdeskSurfaceReady ? 'ready' : manifestResolved ? 'missing' : 'blocked',
      start_surface_status: startSurfaceReady ? 'ready' : manifestResolved ? 'missing' : 'blocked',
      shared_handoff_status: sharedHandoffReady ? 'ready' : manifestResolved ? 'missing' : 'blocked',
      ready_for_opl_start: readyForOplStart,
      ready_for_domain_handoff: readyForDomainHandoff,
      product_entry_readiness_verdict: manifest?.product_entry_readiness?.verdict ?? null,
      recommended_start_command:
        manifest?.frontdesk_surface?.command
        ?? manifest?.recommended_command
        ?? manifest?.product_entry_preflight?.recommended_start_command
        ?? null,
      recommended_check_command: manifest?.product_entry_preflight?.recommended_check_command ?? null,
      gaps,
      recommended_next_actions: recommendedNextActions,
    };
  });

  return {
    surface_kind: 'opl_domain_entry_parity',
    summary: {
      total_projects_count: normalizedProjects.length,
      aligned_projects_count: normalizedProjects.filter((entry) => entry.entry_parity_status === 'aligned').length,
      partial_projects_count: normalizedProjects.filter((entry) => entry.entry_parity_status === 'partial').length,
      blocked_projects_count: normalizedProjects.filter((entry) => entry.entry_parity_status === 'blocked').length,
      direct_entry_locator_ready_projects_count:
        normalizedProjects.filter((entry) => entry.direct_entry_locator_status === 'ready').length,
      ready_for_opl_start_count:
        normalizedProjects.filter((entry) => entry.ready_for_opl_start).length,
      ready_for_domain_handoff_count:
        normalizedProjects.filter((entry) => entry.ready_for_domain_handoff).length,
    },
    projects: normalizedProjects,
    notes: [
      'Domain entry parity is a family-level derived surface, not a second manifest system.',
      'A project can be start-ready and handoff-ready before it has a direct-entry locator bound into the active workspace.',
      'aligned means frontdesk/start/shared-handoff are resolved and the active binding already carries a direct-entry locator.',
    ],
  };
}

function buildRecommendedEntrySurfaces(projects: DomainManifestCatalogEntry[]) {
  return projects
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
      product_entry_start: entry.manifest?.product_entry_start ?? null,
      product_entry_start_resume_surface_kind:
        entry.manifest?.product_entry_start?.resume_surface?.surface_kind ?? null,
      product_entry_start_mode_ids:
        entry.manifest?.product_entry_start?.modes.map((mode) => mode.mode_id) ?? [],
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
}

function buildDomainBindingParity(
  contracts: GatewayContracts,
  options: { basePath?: string } = {},
) {
  const endpoints = buildFrontDeskEndpoints(options.basePath);
  const workspaceCatalog = buildWorkspaceCatalog(contracts).workspace_catalog;
  const domainProjects = workspaceCatalog.projects.filter((entry) => entry.project_id !== 'opl');
  const projects = domainProjects.map((entry) => ({
    project_id: entry.project_id,
    project: entry.project,
    active_binding: entry.active_binding,
    bindings_count: entry.bindings_count,
    last_updated_at: entry.last_updated_at,
    available_actions: entry.available_actions,
    direct_entry_ready: entry.bindings_count.direct_entry_ready > 0,
    manifest_ready: entry.bindings_count.manifest_ready > 0,
    launch_ready: entry.available_actions.includes('launch'),
  }));

  return {
    surface_kind: 'opl_domain_binding_parity',
    summary: {
      total_projects_count: projects.length,
      active_projects_count: projects.filter((entry) => entry.active_binding !== null).length,
      direct_entry_ready_projects_count: projects.filter((entry) => entry.direct_entry_ready).length,
      manifest_ready_projects_count: projects.filter((entry) => entry.manifest_ready).length,
      launch_ready_projects_count: projects.filter((entry) => entry.launch_ready).length,
      last_binding_change_at: workspaceCatalog.summary.last_binding_change_at,
    },
    projects,
    endpoints: {
      workspace_catalog: endpoints.workspace_catalog,
      workspace_bind: endpoints.workspace_bind,
      workspace_activate: endpoints.workspace_activate,
      workspace_archive: endpoints.workspace_archive,
      launch_domain: endpoints.launch_domain,
    },
    notes: [
      'This surface mirrors the domain-scoped binding state from workspace-catalog so hosted shells do not need to reconstruct it from dashboard.',
      'It stays derived from the writable workspace registry rather than inventing a second binding store.',
      'direct_entry_ready means the current project already has a bound command or URL; manifest_ready means the active binding already carries a manifest_command.',
    ],
  };
}

function buildFrontDeskDomainWiringSurfaceRef(
  contracts: GatewayContracts,
  options: { basePath?: string } = {},
) {
  const wiring = buildFrontDeskDomainWiring(contracts, options).frontdesk_domain_wiring;

  return {
    surface_id: wiring.surface_id,
    endpoint: wiring.endpoints.frontdesk_domain_wiring,
    summary: wiring.summary,
  };
}

export function buildFrontDeskDomainWiring(
  contracts: GatewayContracts,
  options: { basePath?: string } = {},
) {
  const endpoints = buildFrontDeskEndpoints(options.basePath);
  const domainManifests = buildDomainManifestCatalog(contracts).domain_manifests;
  const hostedRuntimeReadiness = buildHostedRuntimeReadiness();
  const domainEntryParity = buildDomainEntryParity(domainManifests.projects);
  const domainBindingParity = buildDomainBindingParity(contracts, options);
  const recommendedEntrySurfaces = buildRecommendedEntrySurfaces(domainManifests.projects);

  return {
    version: 'g2',
    contracts_context: {
      contracts_dir: contracts.contractsDir,
      contracts_root_source: contracts.contractsRootSource,
    },
    frontdesk_domain_wiring: {
      surface_id: 'opl_frontdesk_domain_wiring',
      entry_surface: 'opl_local_web_frontdesk_pilot',
      runtime_substrate: 'external_hermes_kernel',
      shell_integration_target: 'librechat_first',
      base_path: normalizeBasePath(options.basePath),
      hosted_runtime_readiness: hostedRuntimeReadiness,
      domain_entry_parity: domainEntryParity,
      domain_binding_parity: domainBindingParity,
      recommended_entry_surfaces: recommendedEntrySurfaces,
      summary: {
        total_projects_count: domainEntryParity.summary.total_projects_count,
        aligned_projects_count: domainEntryParity.summary.aligned_projects_count,
        ready_for_opl_start_count: domainEntryParity.summary.ready_for_opl_start_count,
        ready_for_domain_handoff_count: domainEntryParity.summary.ready_for_domain_handoff_count,
        active_binding_projects_count: domainBindingParity.summary.active_projects_count,
        manifest_ready_projects_count: domainBindingParity.summary.manifest_ready_projects_count,
        launch_ready_projects_count: domainBindingParity.summary.launch_ready_projects_count,
        recommended_entry_surfaces_count: recommendedEntrySurfaces.length,
      },
      endpoints: {
        frontdesk_domain_wiring: endpoints.frontdesk_domain_wiring,
        domain_manifests: endpoints.domain_manifests,
        dashboard: endpoints.dashboard,
        workspace_catalog: endpoints.workspace_catalog,
        workspace_bind: endpoints.workspace_bind,
        workspace_activate: endpoints.workspace_activate,
        workspace_archive: endpoints.workspace_archive,
        start: endpoints.start,
        launch_domain: endpoints.launch_domain,
        handoff_envelope: endpoints.handoff_envelope,
      },
      notes: [
        'This surface hardens the family-level domain wiring truth for hosted shells and local front-desk consumers.',
        'It stays derived from active domain manifests and workspace bindings; it does not create a second truth source.',
      ],
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
  const hostedRuntimeReadiness = buildHostedRuntimeReadiness();
  const domainWiringSurface = buildFrontDeskDomainWiringSurfaceRef(contracts, options);

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
      hosted_runtime_readiness: hostedRuntimeReadiness,
      domain_wiring_surface: domainWiringSurface,
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
  const hostedRuntimeReadiness = buildHostedRuntimeReadiness();
  const domainWiringSurface = buildFrontDeskDomainWiringSurfaceRef(contracts, {
    basePath: normalizedBasePath,
  });

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
      hosted_runtime_readiness: hostedRuntimeReadiness,
      domain_wiring_surface: domainWiringSurface,
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

export function buildFrontDeskStart(
  contracts: GatewayContracts,
  options: StartSurfaceOptions,
) {
  if (!options.projectId) {
    throw new GatewayContractError(
      'cli_usage_error',
      'start requires a non-empty project_id.',
      {
        required: ['project_id'],
      },
    );
  }

  findDomainOrThrow(contracts, options.projectId);
  const domainManifests = buildDomainManifestCatalog(contracts).domain_manifests;
  const entry = domainManifests.projects.find((candidate) => candidate.project_id === options.projectId);

  if (!entry) {
    throw new GatewayContractError(
      'domain_not_found',
      'Requested project is not part of the admitted domain set.',
      {
        project_id: options.projectId,
      },
    );
  }

  if (entry.status !== 'resolved' || !entry.manifest?.product_entry_start) {
    throw new GatewayContractError(
      'cli_usage_error',
      'The requested project does not currently expose a resolved product_entry_start surface.',
      {
        project_id: options.projectId,
        status: entry.status,
        manifest_command: entry.manifest_command,
        workspace_path: entry.workspace_path,
      },
    );
  }

  const startSurface = entry.manifest.product_entry_start;
  const selectedModeId = options.modeId ?? startSurface.recommended_mode_id;
  const selectedMode = startSurface.modes.find((mode) => mode.mode_id === selectedModeId) ?? null;

  if (!selectedModeId || !selectedMode) {
    throw new GatewayContractError(
      'cli_usage_error',
      'The requested start mode is not available on the resolved product_entry_start surface.',
      {
        project_id: options.projectId,
        mode_id: options.modeId ?? null,
        available_modes: startSurface.modes.map((mode) => mode.mode_id),
      },
    );
  }

  return {
    version: 'g2',
    contracts_context: {
      contracts_dir: contracts.contractsDir,
      contracts_root_source: contracts.contractsRootSource,
    },
    product_entry_start: {
      surface_kind: 'opl_product_entry_start',
      project_id: entry.project_id,
      project: entry.project,
      binding_id: entry.binding_id,
      workspace_path: entry.workspace_path,
      manifest_command: entry.manifest_command,
      target_domain_id: entry.manifest.target_domain_id,
      summary: startSurface.summary,
      recommended_mode_id: startSurface.recommended_mode_id,
      selected_mode_id: selectedModeId,
      selected_mode: selectedMode,
      available_modes: startSurface.modes,
      resume_surface: startSurface.resume_surface,
      human_gate_ids: startSurface.human_gate_ids,
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
  const hostedRuntimeReadiness = buildHostedRuntimeReadiness();
  const domainEntryParity = buildDomainEntryParity(domainManifests.projects);
  const recommendedEntrySurfaces = buildRecommendedEntrySurfaces(domainManifests.projects);

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
        hosted_runtime_readiness: hostedRuntimeReadiness,
        workspace_registry_status: 'landed',
        session_ledger_status: 'landed',
        handoff_bundle_status: 'landed',
        domain_entry_parity: domainEntryParity,
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
