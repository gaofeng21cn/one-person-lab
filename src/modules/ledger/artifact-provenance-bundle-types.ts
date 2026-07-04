export const SCHEMA_VERSION = 'artifact-provenance-bundle.v1';
export const LEDGER_VERSION = 'opl-artifact-provenance-bundle-ledger.v1';
export const REF_KEYS = [
  'code',
  'inputs',
  'outputs',
  'environment',
  'agent_trace',
  'reviews',
  'replay',
] as const;
export const FORBIDDEN_BODY_FIELDS = ['body', 'artifact_body', 'artifact_content', 'artifact_payload', 'body_inline'];
export const REQUIRED_MANIFEST_FIELDS = [
  'schema_version',
  'bundle_id',
  'artifact_ref',
  'domain_id',
  'artifact_type',
  'created_at',
  'refs',
  'hashes',
  'authority_boundary',
] as const;
export const ALLOWED_MANIFEST_FIELDS = new Set<string>([
  ...REQUIRED_MANIFEST_FIELDS,
  'metadata',
  'missing_refs',
  'restricted_refs',
  'typed_issues',
]);
export const ALLOWED_REF_FIELDS = new Set<string>(REF_KEYS);
export const ALLOWED_AUTHORITY_FIELDS = new Set<string>([
  'ledger_refs_only',
  'forbidden_claims',
  'can_read_artifact_body',
  'can_store_artifact_body',
  'can_mutate_artifact_body',
  'can_write_domain_truth',
  'can_create_owner_receipt',
  'can_authorize_quality_verdict',
  'can_claim_domain_ready',
  'can_claim_artifact_ready',
  'can_claim_production_ready',
]);
export const FALSE_AUTHORITY_FIELDS = [...ALLOWED_AUTHORITY_FIELDS].filter((field) =>
  field !== 'ledger_refs_only' && field !== 'forbidden_claims'
);
export const ALLOWED_HASH_ENTRY_FIELDS = new Set<string>(['algorithm', 'value']);

export type RefKey = typeof REF_KEYS[number];
export type BundleRefs = Record<RefKey, string[]>;
export type HashEntry = {
  algorithm: 'sha256';
  value: string;
};
export type IssueSeverity = 'error' | 'warning' | 'info';
export type ArtifactProvenanceBundleIssue = {
  code: string;
  severity: IssueSeverity;
  ref: string;
  message: string;
  action: string;
};
export type DeclaredRefIssue = {
  ref: string;
  source_path: string;
  section_key: RefKey | null;
};
export type ArtifactProvenanceBundleSection = {
  section_key: RefKey;
  refs: string[];
  missing_refs: string[];
  restricted_refs: string[];
};
export type ArtifactProvenanceBundleAuthorityBoundary = {
  ledger_refs_only: true;
  forbidden_claims: string[];
  can_read_artifact_body: false;
  can_store_artifact_body: false;
  can_mutate_artifact_body: false;
  can_write_domain_truth: false;
  can_create_owner_receipt: false;
  can_authorize_quality_verdict: false;
  can_claim_domain_ready: false;
  can_claim_artifact_ready: false;
  can_claim_production_ready: false;
};
export type ArtifactProvenanceBundleManifest = {
  schema_version: typeof SCHEMA_VERSION;
  bundle_id: string;
  artifact_ref: string;
  domain_id: string;
  artifact_type: string;
  created_at: string;
  refs: BundleRefs;
  hashes: Record<string, HashEntry>;
  authority_boundary: ArtifactProvenanceBundleAuthorityBoundary;
  metadata?: Record<string, unknown>;
};
export type LoadedBundle = {
  bundle_path: string;
  manifest_path: string;
  manifest_text: string;
  parsed: unknown;
  manifest: ArtifactProvenanceBundleManifest;
};
export type BundleValidation = {
  surface_kind: 'opl_artifact_provenance_bundle_validation';
  schema_version: typeof SCHEMA_VERSION | null;
  status: 'valid' | 'invalid';
  bundle_id: string | null;
  artifact_ref: string | null;
  domain_id: string | null;
  artifact_type: string | null;
  created_at: string | null;
  bundle_path: string;
  manifest_path: string;
  artifact_body_read: false;
  missing_required_fields: string[];
  invalid_fields: string[];
  invalid_hash_fields: string[];
  authority_violations: string[];
  forbidden_body_fields: string[];
  missing_refs: string[];
  restricted_refs: string[];
  issues: ArtifactProvenanceBundleIssue[];
  issue_count: number;
  sections: ArtifactProvenanceBundleSection[];
  refs: BundleRefs;
  hash_keys: string[];
  forbidden_claims: string[];
  authority_boundary: ArtifactProvenanceBundleAuthorityBoundary;
};
export type ArtifactProvenanceBundleRecord = {
  surface_kind: 'opl_artifact_provenance_bundle_record';
  record_ref: string;
  recorded_at: string;
  bundle_id: string;
  domain_id: string;
  artifact_ref: string;
  artifact_type: string;
  bundle_manifest_ref: string;
  bundle_manifest_hash: HashEntry;
  refs: BundleRefs;
  hashes: Record<string, HashEntry>;
  issues: ArtifactProvenanceBundleIssue[];
  issue_count: number;
  sections: ArtifactProvenanceBundleSection[];
  index_keys: {
    bundle_id: string;
    domain_artifact: string;
    artifact_ref: string;
  };
  artifact_body_read: false;
  authority_boundary: ArtifactProvenanceBundleAuthorityBoundary;
};
export type ArtifactProvenanceBundleLedger = {
  surface_kind: 'opl_artifact_provenance_bundle_ledger';
  version: typeof LEDGER_VERSION;
  records: ArtifactProvenanceBundleRecord[];
};
