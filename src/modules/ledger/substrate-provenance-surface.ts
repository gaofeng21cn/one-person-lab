const SURFACE_SCHEMA_VERSION = 'opl-substrate-provenance-surface.v1';

type HashEntry = {
  algorithm: 'sha256';
  value: string;
};

type ArtifactGraphRefInput = {
  role: string;
  ref: string;
  graph_ref?: string;
  hash?: string | HashEntry;
};

type ClaimWarningInput = {
  claim: string;
  reason: string;
  owner?: string;
  action?: string;
};

type AnnotationRegenerationReceiptInput = {
  receipt_ref: string;
  annotation_ref: string;
  source_ref: string;
  regenerated_artifact_ref?: string;
  command_ref?: string;
  hash?: string | HashEntry;
};

type NativeViewerWatchOnlyInput = {
  viewer_ref: string;
  watched_refs: string[];
  receipt_ref?: string;
};

export type SubstrateProvenanceSurfaceInput = {
  project_id: string;
  artifact_graph_refs: ArtifactGraphRefInput[];
  ledger_ref: string;
  ledger_hash: string | HashEntry;
  claim_warnings?: ClaimWarningInput[];
  annotation_regeneration_receipts?: AnnotationRegenerationReceiptInput[];
  native_viewer_watch_only?: NativeViewerWatchOnlyInput;
};

function requiredString(value: string, field: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`substrate provenance surface requires ${field}`);
  }
  return trimmed;
}

function sha256(value: string | HashEntry, field: string): HashEntry {
  if (typeof value !== 'string') {
    if (value.algorithm === 'sha256' && /^[a-f0-9]{64}$/i.test(value.value)) {
      return { algorithm: 'sha256', value: value.value.toLowerCase() };
    }
    throw new Error(`substrate provenance surface requires ${field} sha256 hash`);
  }
  if (!/^[a-f0-9]{64}$/i.test(value)) {
    throw new Error(`substrate provenance surface requires ${field} sha256 hash`);
  }
  return { algorithm: 'sha256', value: value.toLowerCase() };
}

function optionalSha256(value: string | HashEntry | undefined, field: string) {
  return value === undefined ? null : sha256(value, field);
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

export function buildSubstrateProvenanceSurface(input: SubstrateProvenanceSurfaceInput) {
  const projectId = requiredString(input.project_id, 'project_id');
  if (input.artifact_graph_refs.length === 0) {
    throw new Error('substrate provenance surface requires artifact_graph_refs');
  }
  const warnings = input.claim_warnings?.length
    ? input.claim_warnings
    : [{
        claim: 'readiness_or_quality_claim',
        reason: 'Substrate provenance records refs and hashes only; domain owner evidence is still required.',
        owner: 'domain_agent',
        action: 'Route readiness, quality, or artifact authority claims to the owning domain agent.',
      }];

  return {
    surface_kind: 'opl_substrate_provenance_surface',
    schema_version: SURFACE_SCHEMA_VERSION,
    project_id: projectId,
    project_local_artifact_graph_refs: input.artifact_graph_refs.map((entry, index) => ({
      role: requiredString(entry.role, `artifact_graph_refs[${index}].role`),
      ref: requiredString(entry.ref, `artifact_graph_refs[${index}].ref`),
      graph_ref: entry.graph_ref ? requiredString(entry.graph_ref, `artifact_graph_refs[${index}].graph_ref`) : null,
      hash: optionalSha256(entry.hash, `artifact_graph_refs[${index}].hash`),
      locality: 'project_local',
      body_included: false,
      write_permitted: false,
    })),
    project_local_ledger_pointer: {
      ref: requiredString(input.ledger_ref, 'ledger_ref'),
      hash: sha256(input.ledger_hash, 'ledger_hash'),
      locality: 'project_local',
      body_included: false,
      write_permitted: false,
    },
    claim_warning_descriptor: {
      status: warnings.length ? 'warning' : 'clear',
      warnings: warnings.map((warning, index) => ({
        claim: requiredString(warning.claim, `claim_warnings[${index}].claim`),
        reason: requiredString(warning.reason, `claim_warnings[${index}].reason`),
        owner: warning.owner ? requiredString(warning.owner, `claim_warnings[${index}].owner`) : 'domain_agent',
        action: warning.action
          ? requiredString(warning.action, `claim_warnings[${index}].action`)
          : 'Collect owner evidence before making the claim.',
      })),
      can_authorize_claim: false,
    },
    annotation_to_source_regeneration_receipt_descriptor: {
      receipts: (input.annotation_regeneration_receipts ?? []).map((receipt, index) => ({
        receipt_ref: requiredString(receipt.receipt_ref, `annotation_regeneration_receipts[${index}].receipt_ref`),
        annotation_ref: requiredString(receipt.annotation_ref, `annotation_regeneration_receipts[${index}].annotation_ref`),
        source_ref: requiredString(receipt.source_ref, `annotation_regeneration_receipts[${index}].source_ref`),
        regenerated_artifact_ref: receipt.regenerated_artifact_ref
          ? requiredString(receipt.regenerated_artifact_ref, `annotation_regeneration_receipts[${index}].regenerated_artifact_ref`)
          : null,
        command_ref: receipt.command_ref
          ? requiredString(receipt.command_ref, `annotation_regeneration_receipts[${index}].command_ref`)
          : null,
        hash: optionalSha256(receipt.hash, `annotation_regeneration_receipts[${index}].hash`),
        artifact_body_mutated_by_opl: false,
        domain_truth_written_by_opl: false,
      })),
      receipt_count: input.annotation_regeneration_receipts?.length ?? 0,
    },
    native_viewer_watch_only_descriptor: {
      mode: 'watch_only',
      viewer_ref: input.native_viewer_watch_only
        ? requiredString(input.native_viewer_watch_only.viewer_ref, 'native_viewer_watch_only.viewer_ref')
        : null,
      watched_refs: uniqueStrings(input.native_viewer_watch_only?.watched_refs ?? []),
      receipt_ref: input.native_viewer_watch_only?.receipt_ref
        ? requiredString(input.native_viewer_watch_only.receipt_ref, 'native_viewer_watch_only.receipt_ref')
        : null,
      can_open_native_viewer: Boolean(input.native_viewer_watch_only),
      can_mutate_artifact: false,
      can_write_ledger: false,
      can_claim_viewer_authority: false,
    },
    authority_boundary: {
      owner: 'one-person-lab',
      role: 'refs_only_substrate_provenance_projection',
      forbidden_external_imports: [
        'OpenScience runtime',
        'OpenScience Electron app',
        'OpenScience MCP server',
        'AGPL source code',
        'new dependency',
        'generic platform',
      ],
      can_read_artifact_body: false,
      can_store_artifact_body: false,
      can_mutate_artifact_body: false,
      can_write_domain_truth: false,
      can_create_owner_receipt: false,
      can_authorize_quality_verdict: false,
      can_claim_domain_ready: false,
      can_claim_artifact_ready: false,
      can_claim_production_ready: false,
    },
  };
}
