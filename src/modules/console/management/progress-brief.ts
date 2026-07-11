import type { pickCurrentProjectEntry } from './progress-study.ts';
import {
  buildDomainOperatorProgressSurface,
  describeHumanGate,
  explainManifestFailure,
} from './progress-study.ts';
import { uniqueStrings } from './shared.ts';

type CurrentProjectEntry = ReturnType<typeof pickCurrentProjectEntry>;
type OperatorProgressSurface = ReturnType<typeof buildDomainOperatorProgressSurface>;
type ReadinessEntry = {
  project_id: string;
  usable_now: boolean;
  summary: string | null;
  recommended_next_actions: string[];
  blocking_gaps: string[];
  recommended_start_command: string | null;
};
type ManifestEntry = CurrentProjectEntry['manifestEntry'];
type Manifest = NonNullable<ManifestEntry>['manifest'];
type ManifestOverview = NonNullable<Manifest>['product_entry_overview'];
type ProductStatus = NonNullable<Manifest>['product_entry_status'];
type RepoMainline = NonNullable<Manifest>['repo_mainline'];

export function currentReadinessEntryForProject(
  projects: ReadinessEntry[],
  projectId: string | null,
) {
  return projectId
    ? projects.find((entry) => entry.project_id === projectId) ?? null
    : null;
}

export function buildProjectState(
  manifestEntry: ManifestEntry,
  readinessEntry: ReadinessEntry | null,
) {
  if (manifestEntry === null) return 'unbound';
  if (manifestEntry.status !== 'resolved') return 'attention_needed';
  return readinessEntry?.usable_now === false ? 'attention_needed' : 'active';
}

export function buildProgressSummary(options: {
  manifestEntry: ManifestEntry;
  overview: ManifestOverview | null;
  productStatus: ProductStatus | null;
  readinessEntry: ReadinessEntry | null;
  operatorSurface: OperatorProgressSurface;
}) {
  return (
    options.operatorSurface.progressSummary
    ?? options.overview?.summary
    ?? options.productStatus?.summary
    ?? options.readinessEntry?.summary
    ?? (
      options.manifestEntry === null
        ? '当前 workspace 还没有绑定到可直接汇报进度的项目。'
        : '当前还没有读到结构化的项目进度摘要。'
    )
  );
}

export function pickProgressNextFocus(options: {
  overview: ManifestOverview | null;
  productStatus: ProductStatus | null;
  readinessEntry: ReadinessEntry | null;
  repoMainline: RepoMainline | null;
  operatorSurface: OperatorProgressSurface;
}) {
  return [
    options.operatorSurface.nextFocus,
    ...(options.overview?.next_focus ?? []),
    ...(options.productStatus?.next_focus ?? []),
    ...(Array.isArray(options.repoMainline?.next_focus)
      ? options.repoMainline.next_focus.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      : []),
    ...(options.readinessEntry?.recommended_next_actions ?? []),
  ][0] ?? null;
}

export function buildProgressAttentionItems(options: {
  manifestEntry: ManifestEntry;
  readinessEntry: ReadinessEntry | null;
  operatorSurface: OperatorProgressSurface;
}) {
  return uniqueStrings([
    ...options.operatorSurface.attentionItems,
    ...(options.readinessEntry?.usable_now === false ? options.readinessEntry.blocking_gaps : []),
    explainManifestFailure(options.manifestEntry?.error ?? null),
  ]);
}

export function buildProgressInspectPaths(options: {
  currentProject: CurrentProjectEntry;
  manifest: Manifest | null;
  manifestEntry: ManifestEntry;
  operatorSurface: OperatorProgressSurface;
  workspacePath: string;
}) {
  return uniqueStrings([
    options.workspacePath,
    options.currentProject.activeBindingEntry?.active_binding?.workspace_path ?? null,
    options.manifestEntry?.workspace_path ?? null,
    typeof options.manifest?.workspace_locator?.workspace_root === 'string'
      ? options.manifest.workspace_locator.workspace_root
      : null,
    typeof options.manifest?.workspace_locator?.profile_ref === 'string'
      ? options.manifest.workspace_locator.profile_ref
      : null,
    ...options.operatorSurface.inspectPaths,
  ]);
}

export function buildConfiguredHumanGates(options: {
  manifest: Manifest | null;
  overview: ManifestOverview | null;
}) {
  return uniqueStrings([
    ...(options.overview?.human_gate_ids ?? []),
    ...(options.manifest?.product_entry_start?.human_gate_ids ?? []),
  ]).map((gateId) => describeHumanGate(gateId));
}

export function splitProgressWorkspaceFiles(
  workspaceFiles: OperatorProgressSurface['workspaceFiles'],
) {
  return {
    deliverableFiles: workspaceFiles.filter((entry) => entry.kind === 'deliverable'),
    supportingFiles: workspaceFiles.filter((entry) => entry.kind === 'supporting'),
  };
}
