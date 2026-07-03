import crypto from 'node:crypto';

const LEDGER_EVENT_SCHEMA_VERSION = 'artifact-provenance-ledger-event.v1';

type ArtifactProvenanceLedgerEventKind = 'record' | 'inspect' | 'doctor' | 'export';
type HashEntry = {
  algorithm: 'sha256';
  value: string;
};

export function buildArtifactProvenanceLedgerEvent(input: {
  eventKind: ArtifactProvenanceLedgerEventKind;
  bundleId: string | null;
  domainId: string | null;
  artifactRef: string | null;
  bundleManifestRef: string | null;
  bundleManifestHash: HashEntry | null;
  ledgerFile: string | null;
  refs: unknown;
  sections: unknown[];
  issues: unknown[];
  authorityBoundary: unknown;
}) {
  const occurredAt = new Date().toISOString();
  const eventSeed = [
    input.eventKind,
    input.bundleId ?? '',
    input.artifactRef ?? '',
    input.bundleManifestRef ?? '',
    input.bundleManifestHash?.value ?? '',
    occurredAt,
  ].join('\n');
  const eventId = crypto.createHash('sha256').update(eventSeed).digest('hex').slice(0, 24);
  return {
    surface_kind: 'opl_artifact_provenance_ledger_event',
    schema_version: LEDGER_EVENT_SCHEMA_VERSION,
    event_id: eventId,
    event_kind: input.eventKind,
    event_ref: `opl://artifact-provenance-ledger-event/${input.eventKind}/${eventId}`,
    occurred_at: occurredAt,
    bundle_id: input.bundleId,
    domain_id: input.domainId,
    artifact_ref: input.artifactRef,
    bundle_manifest_ref: input.bundleManifestRef,
    bundle_manifest_hash: input.bundleManifestHash,
    ledger_file: input.ledgerFile,
    artifact_body_read: false,
    refs: input.refs,
    sections: input.sections,
    issues: input.issues,
    issue_count: input.issues.length,
    authority_boundary: input.authorityBoundary,
  };
}
