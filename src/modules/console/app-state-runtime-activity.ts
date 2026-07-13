import { buildWorkItemProjectionV2 } from './work-item-projection/projection.ts';
import { projectWorkItemRuntimeActivityItems } from './work-item-projection/legacy-adapter.ts';

export function buildAppStateRuntimeActivityItems(profile: 'fast' | 'full' = 'full') {
  return projectWorkItemRuntimeActivityItems(buildWorkItemProjectionV2({ profile }));
}
