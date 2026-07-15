import type { AppStateProfile } from './app-state-profile.ts';
import {
  buildWorkItemProjectionV2,
  type BuildWorkItemProjectionV2Options,
} from './work-item-projection/projection.ts';
import type {
  TokenObservation,
  WorkItemProjectionItem,
} from './work-item-projection/types.ts';

export type BuildAppRuntimeWorkItemProjectionOptions = Omit<
  BuildWorkItemProjectionV2Options,
  'profile' | 'inventoryDetail'
> & {
  profile?: AppStateProfile;
};

function compactFastTokenObservation(observation: TokenObservation): TokenObservation {
  return {
    ...observation,
    source_refs: [],
  };
}

function compactFastWorkItemSummary(item: WorkItemProjectionItem): WorkItemProjectionItem {
  return {
    ...item,
    telemetry: {
      ...item.telemetry,
      current_stage: compactFastTokenObservation(item.telemetry.current_stage),
      cumulative: compactFastTokenObservation(item.telemetry.cumulative),
    },
    stage_map: item.stage_map.map((stage) => ({
      ...stage,
      usage: stage.usage ? compactFastTokenObservation(stage.usage) : null,
    })),
    conditions: [],
    source_refs: [],
  };
}

/**
 * Produces the canonical Runtime-page inventory. Fast keeps every registered
 * work-item summary while the projection layer bounds attempt refs and hides
 * diagnostic bodies; full remains the explicit diagnostic surface.
 */
export function buildAppRuntimeWorkItemProjection(
  options: BuildAppRuntimeWorkItemProjectionOptions = {},
) {
  const profile = options.profile ?? 'fast';
  const projection = buildWorkItemProjectionV2({
    ...options,
    profile,
    inventoryDetail: 'included',
  });
  if (profile === 'full') return projection;
  return {
    ...projection,
    items: projection.items.map(compactFastWorkItemSummary),
  };
}
