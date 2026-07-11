import { buildWorkspaceCatalog } from '../../workspace/index.ts';
import {
  buildDomainManifestCatalog,
} from '../../atlas/index.ts';
import type {
  DomainManifestCatalogEntry,
  NormalizedDomainManifest,
} from '../../atlas/index.ts';
import { uniqueStrings } from './shared.ts';

function inferWorkspaceLabel(workspacePath?: string | null) {
  const normalized = workspacePath?.trim();
  if (!normalized) {
    return 'Unbound workspace';
  }

  const cleanPath = normalized.replace(/[\\/]+$/, '');
  const segments = cleanPath.split(/[\\/]/).filter(Boolean);
  return segments.at(-1) ?? cleanPath;
}

export type ProjectProgressDecision = {
  gate_id: string;
  label: string;
  reason: string;
};

export function describeHumanGate(gateId: string): ProjectProgressDecision {
  return {
    gate_id: gateId,
    label: '存在一个域侧人工判断口',
    reason: `当前域声明了人工判断口 ${gateId}；具体判断语义和决策权归 domain owner。`,
  };
}

export function explainManifestFailure(error: DomainManifestCatalogEntry['error']) {
  if (!error) {
    return null;
  }

  const stderrLines = (error.stderr ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const usefulLine =
    stderrLines.find((line) => !line.includes('parameter not set'))
    ?? stderrLines[0]
    ?? error.message;

  return usefulLine === error.message ? usefulLine : `${error.message} ${usefulLine}`;
}

export function pickCurrentProjectEntry(
  domainManifests: ReturnType<typeof buildDomainManifestCatalog>['domain_manifests'],
  workspaceCatalog: ReturnType<typeof buildWorkspaceCatalog>['workspace_catalog'],
  workspacePath: string,
) {
  const activeBindingEntry =
    workspaceCatalog.projects.find((entry) => entry.active_binding?.workspace_path === workspacePath)
    ?? workspaceCatalog.projects.find((entry) => entry.active_binding?.status === 'active')
    ?? null;
  const manifestEntry =
    (activeBindingEntry
      ? domainManifests.projects.find((entry) => entry.project_id === activeBindingEntry.project_id)
      : null)
    ?? domainManifests.projects.find((entry) => entry.workspace_path === workspacePath)
    ?? null;

  return {
    activeBindingEntry,
    manifestEntry,
    projectId: activeBindingEntry?.project_id ?? manifestEntry?.project_id ?? null,
    projectLabel:
      activeBindingEntry?.project
      ?? manifestEntry?.project
      ?? inferWorkspaceLabel(workspacePath),
  };
}

export function buildDomainOperatorProgressSurface(options: {
  workspacePath: string;
  overview: NormalizedDomainManifest['product_entry_overview'] | null;
  manifest: NormalizedDomainManifest | null;
}) {
  const control = options.manifest?.runtime_control ?? null;
  const session = options.manifest?.session_continuity ?? null;
  const progress = options.manifest?.progress_projection ?? null;
  const artifacts = options.manifest?.artifact_inventory ?? null;
  const workspaceFiles = [
    ...(artifacts?.deliverable_files ?? []),
    ...(artifacts?.supporting_files ?? []),
  ].map((entry) => ({
    file_id: entry.file_id,
    label: entry.label,
    kind: entry.kind,
    path: entry.path,
    summary: entry.summary,
  }));
  const progressCommand =
    control?.control_surfaces.progress?.command
    ?? progress?.progress_surface?.command
    ?? session?.progress_surface?.command
    ?? options.overview?.progress_surface?.command
    ?? null;
  const resumeCommand =
    control?.control_surfaces.resume?.command
    ?? session?.restore_surface?.command
    ?? options.manifest?.task_lifecycle?.resume_surface?.command
    ?? options.overview?.resume_surface?.command
    ?? null;

  return {
    progressSummary: progress?.headline ?? session?.summary ?? null,
    nextFocus:
      progress?.next_step
      ?? session?.restore_surface?.summary
      ?? options.overview?.next_focus[0]
      ?? null,
    attentionItems: progress?.attention_items ?? [],
    inspectPaths: uniqueStrings([
      artifacts?.workspace_path ?? null,
      ...(progress?.inspect_paths ?? []),
      ...(artifacts?.inspect_paths ?? []),
    ]),
    recentActivity: progress || session
      ? {
          session_id: progress?.session_id ?? session?.session_id ?? 'domain-runtime-session',
          last_active: progress?.latest_update ?? session?.summary ?? '当前 session 仍可恢复',
          source:
            progress?.progress_surface?.surface_kind
            ?? session?.progress_surface?.surface_kind
            ?? 'domain_runtime_continuity',
          preview: progress?.headline ?? session?.summary ?? '当前 runtime continuity 已暴露',
        }
      : null,
    workspaceFiles,
    recommendedCommands: {
      progress: progressCommand,
      resume: resumeCommand,
      approval: control?.control_surfaces.approval?.command ?? null,
      interrupt: control?.control_surfaces.interrupt?.command ?? null,
      artifacts:
        control?.control_surfaces.artifact_pickup?.command
        ?? artifacts?.artifact_surface?.command
        ?? session?.artifact_surface?.command
        ?? null,
    },
    userOptions: [
      '展开当前 runtime continuity 详情',
      ...(workspaceFiles.length > 0 ? ['列出当前 deliverable 与 supporting files'] : []),
      ...(resumeCommand ? ['按当前 restore surface 继续推进'] : []),
      ...(control?.control_surfaces.approval?.command ? ['查看当前 domain approval/control gate'] : []),
    ],
    continuity: { control, session, progress, artifacts },
  };
}
