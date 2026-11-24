import { buildFamilyStageReadinessInspect } from '../../../authority/stages/index.ts';
import {
  emptyDomainManifestCatalog,
  type DomainManifestCatalog,
  type DomainManifestCatalogLoader,
} from '../../../kernel/domain-manifest-port.ts';
import type { FrameworkContracts } from '../../../kernel/types.ts';
import { record, type JsonRecord } from '../../../kernel/json-record.ts';

export type { DomainManifestCatalog } from '../../../kernel/domain-manifest-port.ts';

type StageReadinessWorklistInput = {
  runtimeSnapshot?: unknown;
  stageReadiness?: JsonRecord;
  domainManifests?: DomainManifestCatalog;
  loadDomainManifests?: DomainManifestCatalogLoader;
};

const EVIDENCE_WORKLIST_MANIFEST_COMMAND_TIMEOUT_MS = 5_000;

export function domainManifestsForWorklist(
  contracts: FrameworkContracts,
  input: StageReadinessWorklistInput,
) {
  if (input.domainManifests) {
    return input.domainManifests;
  }
  if (input.runtimeSnapshot && input.stageReadiness) {
    return null;
  }
  return input.loadDomainManifests?.(contracts, {
      manifestCommandTimeoutMs: EVIDENCE_WORKLIST_MANIFEST_COMMAND_TIMEOUT_MS,
      manifestCommandTimeoutPolicy: 'fixed',
      materializeFamilyTransitions: false,
      useProjectionCacheOnFailure: true,
    }) ?? emptyDomainManifestCatalog();
}

export function stageReadinessForWorklist(
  contracts: FrameworkContracts,
  input: StageReadinessWorklistInput,
  domainManifests: DomainManifestCatalog | null,
) {
  if (input.stageReadiness) {
    return input.stageReadiness;
  }
  return record(buildFamilyStageReadinessInspect(
    contracts,
    { 'family-defaults': true, detail: 'full' },
    {
      ...(domainManifests ? { domainManifests } : {}),
      manifestCommandTimeoutMs: EVIDENCE_WORKLIST_MANIFEST_COMMAND_TIMEOUT_MS,
      manifestCommandTimeoutPolicy: 'fixed',
      useProjectionCacheOnFailure: true,
    },
  ).family_stage_readiness);
}
