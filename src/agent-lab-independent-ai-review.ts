export const REQUIRED_INDEPENDENT_AI_REVIEW_PROVENANCE_FIELDS = [
  'receipt_ref',
  'receipt_source',
  'assessment_mode',
  'reviewer_ref',
  'reviewer_agent_ref',
  'reviewed_mechanism_candidate_ref',
  'execution_attempt_ref',
  'review_attempt_ref',
  'request_ref',
  'response_ref',
  'evidence_refs',
  'no_shared_context',
  'forbidden_write_scan_ref',
  'verdict',
  'risk_tier',
];

export function isFixtureReviewReceipt(receiptSource: string, assessmentMode: string) {
  return receiptSource === 'synthetic_fixture'
    || receiptSource === 'generated_fixture'
    || receiptSource === 'fixture'
    || receiptSource.endsWith('_fixture')
    || assessmentMode === 'synthetic_fixture'
    || assessmentMode === 'generated_fixture'
    || assessmentMode === 'fixture_receipt'
    || assessmentMode.endsWith('_fixture');
}
