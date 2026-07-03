import { buildDomainManifestCatalog } from '../../atlas/index.ts';
import { buildFamilyStageReadinessInspect } from '../../stagecraft/index.ts';
import type { FrameworkContracts } from '../../../kernel/types.ts';

type JsonRecord = Record<string, unknown>;

export type DomainManifestCatalog = ReturnType<typeof buildDomainManifestCatalog>['domain_manifests'];

type StageReadinessWorklistInput = {
  runtimeSnapshot?: unknown;
  stageReadiness?: JsonRecord;
  domainManifests?: DomainManifestCatalog;
};

const EVIDENCE_WORKLIST_MANIFEST_COMMAND_TIMEOUT_MS = 5_000;

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function record(value: unknown): JsonRecord {
  return isRecord(value) ? value : {};
}

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
  return buildDomainManifestCatalog(contracts, {
    manifestCommandTimeoutMs: EVIDENCE_WORKLIST_MANIFEST_COMMAND_TIMEOUT_MS,
    manifestCommandTimeoutPolicy: 'fixed',
    materializeFamilyTransitions: false,
    useProjectionCacheOnFailure: true,
  }).domain_manifests;
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
    ['--family-defaults', '--detail', 'full'],
    {
      ...(domainManifests ? { domainManifests } : {}),
      manifestCommandTimeoutMs: EVIDENCE_WORKLIST_MANIFEST_COMMAND_TIMEOUT_MS,
      manifestCommandTimeoutPolicy: 'fixed',
      useProjectionCacheOnFailure: true,
    },
  ).family_stage_readiness);
}
