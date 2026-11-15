import type { AgentPackageManifest, AgentPackageMiniAppPresentation } from './types.ts';

/** Configuration and technical diagnostics stay on their App-owned functional pages.
 * Legacy Settings placements do not turn business views into configuration. */
export function workspaceContributionViews(manifest: Pick<AgentPackageManifest, 'app_contributions'>) {
  const contributions = manifest.app_contributions;
  return (contributions?.views ?? []).filter(view => {
    if (['channel_access', 'remote_companion_access', 'service_status'].includes(view.view_type)) return false;
    if (view.view_type === 'activity_log') return contributions?.ui?.some(placement =>
      placement.view_id === view.view_id && placement.slot === 'runtime.detail');
    return ['list_detail', 'timeline', 'approval_diff', 'task_board', 'artifact_view'].includes(view.view_type);
  });
}

/** Shared navigation metadata for the software directory and OPL Apps catalog. */
export function miniAppPresentation(
  manifest: Pick<AgentPackageManifest, 'presentation' | 'app_contributions'> | null,
  entryKind: 'product_entry' | 'runtime_view',
): AgentPackageMiniAppPresentation {
  const views = manifest ? workspaceContributionViews(manifest) : [];
  const declared = manifest?.presentation?.miniapp;
  if (declared) {
    const declaredView = manifest?.app_contributions?.views.find(view => view.view_id === declared.entry_view_id);
    const entryViewId = declared.entry_view_id && (!declaredView || views.includes(declaredView))
      ? declared.entry_view_id : views[0]?.view_id;
    return {
      presentation_mode: declared.presentation_mode,
      entry_kind: declared.entry_kind,
      direct_entry: declared.direct_entry && (Boolean(declared.dedicated_resource_uri) || views.length > 0),
      ...(declared.dedicated_resource_uri ? { dedicated_resource_uri: declared.dedicated_resource_uri } : {}),
      ...(entryViewId ? { entry_view_id: entryViewId } : {}),
    };
  }
  const entryViewId = views[0]?.view_id;
  return {
    presentation_mode: 'shared_view',
    entry_kind: entryKind,
    direct_entry: entryKind === 'product_entry' && Boolean(entryViewId),
    ...(entryViewId ? { entry_view_id: entryViewId } : {}),
  };
}
