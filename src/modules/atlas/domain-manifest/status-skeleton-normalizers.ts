import { normalizeDomainTransitionOracle } from '../../stagecraft/index.ts';
import { stringValue as optionalString } from '../../../kernel/json-record.ts';
import {
  isRecord,
  readStringList,
} from './shared-utils.ts';
import type { NormalizedDomainManifest } from './types.ts';

type JsonRecord = Record<string, unknown>;
type NormalizedProductEntryStatus = NormalizedDomainManifest['product_entry_status'];

export function normalizeProductEntryStatus(
  value: unknown,
  remainingGaps: string[],
): NormalizedProductEntryStatus {
  if (!isRecord(value)) {
    return null;
  }
  return {
    summary: optionalString(value.summary),
    next_focus: readStringList(value.next_focus),
    remaining_gaps_count:
      typeof value.remaining_gaps_count === 'number'
        ? value.remaining_gaps_count
        : remainingGaps.length,
  };
}

export function buildStandardDomainAgentSkeletonCandidate(
  manifest: JsonRecord,
  sourceField: string | null,
  providerReadyContract: JsonRecord | null,
) {
  if (!sourceField) {
    return null;
  }
  const rawSkeleton = manifest[sourceField] as JsonRecord;
  return {
    ...rawSkeleton,
    ...(isRecord(manifest.artifact_locator_contract)
      ? { artifact_locator_contract: manifest.artifact_locator_contract }
      : {}),
    ...(isRecord(manifest.workspace_runtime_artifact_root_locator)
      ? { workspace_runtime_artifact_root_locator: manifest.workspace_runtime_artifact_root_locator }
      : {}),
    ...(isRecord(providerReadyContract?.workspace_runtime_artifact_root_locator)
      ? { workspace_runtime_artifact_root_locator: providerReadyContract?.workspace_runtime_artifact_root_locator }
      : {}),
    ...(isRecord(manifest.controlled_stage_attempt_projection)
      ? { controlled_stage_attempt_projection: manifest.controlled_stage_attempt_projection }
      : {}),
    ...(isRecord(manifest.physical_skeleton_follow_through)
      ? { physical_skeleton_follow_through: manifest.physical_skeleton_follow_through }
      : {}),
  };
}

export function normalizeDomainTransitionOracleSurface(value: unknown) {
  return isRecord(value) ? normalizeDomainTransitionOracle(value) : null;
}
