import type { AgentPackageManifest, AgentPackageMiniAppPresentation } from './types.ts';

/** Shared navigation metadata for the software directory and OPL Apps catalog. */
export function miniAppPresentation(
  manifest: Pick<AgentPackageManifest, 'presentation' | 'app_contributions'> | null,
  entryKind: 'product_entry' | 'runtime_view',
): AgentPackageMiniAppPresentation {
  const declared = manifest?.presentation?.miniapp;
  if (declared) {
    return {
      presentation_mode: declared.presentation_mode,
      entry_kind: declared.entry_kind,
      direct_entry: declared.direct_entry,
      ...(declared.dedicated_resource_uri ? { dedicated_resource_uri: declared.dedicated_resource_uri } : {}),
      ...(declared.entry_view_id ? { entry_view_id: declared.entry_view_id } : {}),
    };
  }
  const entryViewId = manifest?.app_contributions?.views[0]?.view_id;
  return {
    presentation_mode: 'shared_view',
    entry_kind: entryKind,
    direct_entry: entryKind === 'product_entry' && Boolean(entryViewId),
    ...(entryViewId ? { entry_view_id: entryViewId } : {}),
  };
}
