import path from 'node:path';
import type { ScholarSkillCapabilityModuleDescriptor, ScholarSkillModuleId } from '../../../kernel/types.ts';
import {
  moduleContractRef,
  moduleArtifactRefFamilies,
  moduleProfileId,
  sha256Hex,
  stableJson,
  writeDeterministicJson,
  writeDeterministicText,
} from './catalog.ts';

type ArtifactAuthorityFlags = {
  counts_as_paper_truth: false;
  counts_as_owner_receipt: false;
  can_authorize_publication_readiness: false;
  can_claim_quality_verdict: false;
  can_claim_artifact_authority: false;
  can_mutate_artifact_body: false;
  can_write_domain_truth: false;
  can_write_runtime_state: false;
  can_sign_owner_receipt: false;
  can_create_typed_blocker: false;
};

export type CandidateArtifactBodyEntry = {
  kind: string;
  ref_id: string;
  ref_family: string;
  ref: string;
  sha256: string;
  body_path: string;
  body_ref: string;
  body_sha256: string;
  body_format: 'json' | 'markdown' | 'svg';
  body_policy: string;
  body_written: true;
  materialization_status: 'candidate_artifact_body_written';
  payload_sha256: string;
  engine_id: string;
  engine_version: string;
  engine_receipt_ref: string;
  validation_status: 'pass';
  validation_checks: ArtifactValidationCheck[];
  input_requirements: ArtifactInputRequirements;
  readiness_notes: string[];
  missing_inputs: string[];
  body_included: true;
  body_carried_to_owner_request: false;
  authority_flags: ArtifactAuthorityFlags;
};

type ArtifactValidationCheck = {
  check_id: string;
  status: 'pass';
  detail: string;
};

type ArtifactInputRequirements = {
  required_payload_fields: string[];
  optional_payload_fields: string[];
  accepted_input_refs: string[];
  required_artifact_root_ref: true;
  payload_sha256_required: true;
};

type ArtifactEngineSpec = {
  engine_id: string;
  engine_version: string;
  body_format: CandidateArtifactBodyEntry['body_format'];
  output_kind: string;
  required_payload_fields: string[];
  optional_payload_fields: string[];
  quality_checks: string[];
  candidate_sections: string[];
};

const BODY_POLICY = 'opl_generated_non_authoritative_candidate_body_requires_domain_owner_consumption';

const AUTHORITY_FLAGS = {
  counts_as_paper_truth: false,
  counts_as_owner_receipt: false,
  can_authorize_publication_readiness: false,
  can_claim_quality_verdict: false,
  can_claim_artifact_authority: false,
  can_mutate_artifact_body: false,
  can_write_domain_truth: false,
  can_write_runtime_state: false,
  can_sign_owner_receipt: false,
  can_create_typed_blocker: false,
} satisfies ArtifactAuthorityFlags;

const MODULE_ARTIFACT_ENGINES = {
  'opl.scholarskills.display': {
    engine_id: 'scholar_display_candidate_visual_plan_engine',
    engine_version: '2026-06-24',
    body_format: 'svg',
    output_kind: 'visual_display_candidate',
    required_payload_fields: ['title', 'source_refs'],
    optional_payload_fields: [
      'variables',
      'panel_plan',
      'figure_type',
      'cohort_ref',
      'color_vision',
      'grayscale',
      'panel_to_code_review',
      'source_preservation',
    ],
    quality_checks: [
      'visual_qa_preview',
      'programmatic_figure_audit',
      'final_size_inspection',
      'color_vision/grayscale',
      'panel_to_code_review',
      'source_preservation',
      'owner_gate_required',
    ],
    candidate_sections: [
      'visual_qa_preview',
      'programmatic_figure_audit',
      'final_size_inspection',
      'color_vision/grayscale',
      'panel_to_code_review',
      'source_preservation',
    ],
  },
  'opl.scholarskills.tables': {
    engine_id: 'scholar_tables_candidate_table_manifest_engine',
    engine_version: '2026-06-24',
    body_format: 'json',
    output_kind: 'table_manifest_candidate',
    required_payload_fields: ['title', 'source_refs'],
    optional_payload_fields: [
      'title',
      'columns',
      'row_groups',
      'footnotes',
      'stat_refs',
      'booktabs_or_minimal_ink',
      'table_qc',
      'claim_table_alignment',
      'result_metric_registry',
      'ai_table_verdict_candidate',
    ],
    quality_checks: [
      'table_shell',
      'metric_extraction',
      'booktabs_or_minimal_ink',
      'table_qc',
      'claim_table_alignment',
      'result_metric_registry',
      'ai_table_verdict_candidate',
      'owner_gate_required',
    ],
    candidate_sections: [
      'table_shell',
      'metric_extraction',
      'booktabs_or_minimal_ink',
      'table_qc',
      'claim_table_alignment',
      'result_metric_registry',
      'ai_table_verdict_candidate',
    ],
  },
  'opl.scholarskills.stats': {
    engine_id: 'scholar_stats_candidate_analysis_engine',
    engine_version: '2026-06-24',
    body_format: 'json',
    output_kind: 'statistical_analysis_candidate',
    required_payload_fields: ['analysis_question', 'source_refs'],
    optional_payload_fields: [
      'analysis_question',
      'model',
      'variables',
      'cohort_ref',
      'sensitivity_checks',
      'effect_size_or_metric_extraction',
      'reproducibility_check',
      'statistical_review',
      'dataset_metric_benchmark',
      'result_metric_registry',
      'ai_statistical_verdict_candidate',
      'no_statistical_conclusion_claim',
    ],
    quality_checks: [
      'analysis_plan',
      'effect_size_or_metric_extraction',
      'reproducibility_check',
      'statistical_review',
      'dataset_metric_benchmark',
      'result_metric_registry',
      'ai_statistical_verdict_candidate',
      'no_statistical_conclusion_claim',
      'owner_gate_required',
    ],
    candidate_sections: [
      'analysis_plan',
      'effect_size_or_metric_extraction',
      'reproducibility_check',
      'statistical_review',
      'dataset_metric_benchmark',
      'result_metric_registry',
      'ai_statistical_verdict_candidate',
      'no_statistical_conclusion_claim',
    ],
  },
  'opl.scholarskills.lit': {
    engine_id: 'scholar_lit_candidate_evidence_map_engine',
    engine_version: '2026-06-24',
    body_format: 'json',
    output_kind: 'literature_evidence_map_candidate',
    required_payload_fields: ['question', 'source_refs'],
    optional_payload_fields: [
      'question',
      'databases',
      'query_terms',
      'inclusion_criteria',
      'citation_refs',
      'source_verification',
      'citation_coverage',
      'evidence_map',
      'metadata_scrape',
      'claim_support',
      'systematic_review_protocol',
      'inclusion_exclusion_criteria',
      'data_extraction_schema',
      'quality_appraisal',
      'citation_graph_snowball',
      'multi_source_paper_search',
      'confirm_or_drop_source_verification',
      'ai_literature_verdict_candidate',
    ],
    quality_checks: [
      'citation_manifest',
      'source_verification',
      'citation_coverage',
      'evidence_map',
      'metadata_scrape',
      'claim_support',
      'systematic_review_protocol',
      'inclusion_exclusion_criteria',
      'data_extraction_schema',
      'quality_appraisal',
      'citation_graph_snowball',
      'multi_source_paper_search',
      'confirm_or_drop_source_verification',
      'ai_literature_verdict_candidate',
      'owner_gate_required',
    ],
    candidate_sections: [
      'citation_manifest',
      'source_verification',
      'citation_coverage',
      'evidence_map',
      'metadata_scrape',
      'claim_support',
      'systematic_review_protocol',
      'inclusion_exclusion_criteria',
      'data_extraction_schema',
      'quality_appraisal',
      'citation_graph_snowball',
      'multi_source_paper_search',
      'confirm_or_drop_source_verification',
      'ai_literature_verdict_candidate',
    ],
  },
  'opl.scholarskills.write': {
    engine_id: 'scholar_write_candidate_section_engine',
    engine_version: '2026-06-24',
    body_format: 'markdown',
    output_kind: 'draft_section_candidate',
    required_payload_fields: ['section_goal', 'source_refs'],
    optional_payload_fields: [
      'section_goal',
      'outline',
      'claims',
      'target_journal',
      'tone',
      'reverse_outline',
      'claim_evidence_map',
      'source_trace',
      'unsupported_claim_route_back',
      'confirm_or_drop_source_verification',
      'ai_claim_support_verdict_candidate',
      'continue_or_route_back_recommendation',
    ],
    quality_checks: [
      'section_outline',
      'reverse_outline',
      'claim_evidence_map',
      'source_trace',
      'unsupported_claim_route_back',
      'confirm_or_drop_source_verification',
      'ai_claim_support_verdict_candidate',
      'continue_or_route_back_recommendation',
      'owner_gate_required',
    ],
    candidate_sections: [
      'section_outline',
      'reverse_outline',
      'claim_evidence_map',
      'source_trace',
      'unsupported_claim_route_back',
      'confirm_or_drop_source_verification',
      'ai_claim_support_verdict_candidate',
      'continue_or_route_back_recommendation',
    ],
  },
  'opl.scholarskills.review': {
    engine_id: 'scholar_review_candidate_report_engine',
    engine_version: '2026-06-24',
    body_format: 'markdown',
    output_kind: 'reviewer_report_candidate',
    required_payload_fields: ['review_scope', 'source_refs'],
    optional_payload_fields: [
      'review_scope',
      'rubric',
      'concerns',
      'acceptance_criteria',
      'route_back_refs',
      'revision_action',
      'halt_or_revert_rule',
      'route_back',
      'residual_risk',
      'systematic_review_protocol',
      'quality_appraisal',
      'confirm_or_drop_source_verification',
      'ai_review_verdict_candidate',
      'continue_or_route_back_recommendation',
    ],
    quality_checks: [
      'adversarial_review',
      'revision_action',
      'halt_or_revert_rule',
      'route_back',
      'residual_risk',
      'systematic_review_protocol',
      'quality_appraisal',
      'confirm_or_drop_source_verification',
      'ai_review_verdict_candidate',
      'continue_or_route_back_recommendation',
      'owner_gate_required',
    ],
    candidate_sections: [
      'adversarial_review',
      'revision_action',
      'halt_or_revert_rule',
      'route_back',
      'residual_risk',
      'systematic_review_protocol',
      'quality_appraisal',
      'confirm_or_drop_source_verification',
      'ai_review_verdict_candidate',
      'continue_or_route_back_recommendation',
    ],
  },
  'opl.scholarskills.submit': {
    engine_id: 'scholar_submit_candidate_package_engine',
    engine_version: '2026-06-24',
    body_format: 'markdown',
    output_kind: 'submission_package_candidate',
    required_payload_fields: ['submission_goal', 'source_refs'],
    optional_payload_fields: [
      'submission_goal',
      'journal',
      'required_files',
      'cover_letter_points',
      'compliance_checks',
      'journal_rule',
      'format_sanity',
      'ai_disclosure',
      'rebuttal_audit',
      'no_publication_ready_authorization',
      'ai_submission_sanity_verdict_candidate',
      'continue_or_route_back_recommendation',
    ],
    quality_checks: [
      'submission_checklist',
      'journal_rule',
      'format_sanity',
      'ai_disclosure',
      'rebuttal_audit',
      'no_publication_ready_authorization',
      'ai_submission_sanity_verdict_candidate',
      'continue_or_route_back_recommendation',
      'owner_gate_required',
    ],
    candidate_sections: [
      'submission_checklist',
      'journal_rule',
      'format_sanity',
      'ai_disclosure',
      'rebuttal_audit',
      'no_publication_ready_authorization',
      'ai_submission_sanity_verdict_candidate',
      'continue_or_route_back_recommendation',
    ],
  },
  'opl.scholarskills.data': {
    engine_id: 'scholar_data_candidate_lineage_engine',
    engine_version: '2026-06-24',
    body_format: 'json',
    output_kind: 'data_lineage_candidate',
    required_payload_fields: ['dataset_goal', 'source_refs'],
    optional_payload_fields: [
      'dataset_goal',
      'dataset_refs',
      'variables',
      'provenance',
      'privacy_constraints',
      'metadata_scrape',
      'source_lineage',
      'artifact_bundle_manifest',
      'data_dictionary',
      'privacy_access_tier',
      'study_refs',
      'semantic_dictionary_refs',
      'retention_policy_refs',
      'storage_tier_refs',
      'authoritative_body_refs',
      'derived_copy_refs',
      'analytical_format_refs',
      'cold_restore_refs',
      'read_model_refs',
      'systematic_review_protocol',
      'inclusion_exclusion_criteria',
      'data_extraction_schema',
      'quality_appraisal',
      'dataset_metric_benchmark',
      'result_metric_registry',
      'ai_data_readiness_verdict_candidate',
    ],
    quality_checks: [
      'metadata_scrape',
      'source_lineage',
      'artifact_bundle_manifest',
      'data_dictionary',
      'privacy_access_tier',
      'dataset_goal_present',
      'source_refs_present',
      'dataset_manifest_required',
      'registry_lineage_required',
      'semantic_readiness_required',
      'study_binding_required',
      'privacy_access_tier_required',
      'retention_guardrail_required',
      'storage_tier_required',
      'authoritative_body_boundary_required',
      'derived_copy_inventory_required',
      'analytical_format_strategy_required',
      'cold_restore_proof_required_before_body_retirement',
      'read_model_boundary_required',
      'lineage_readiness_required',
      'systematic_review_protocol',
      'inclusion_exclusion_criteria',
      'data_extraction_schema',
      'quality_appraisal',
      'dataset_metric_benchmark',
      'result_metric_registry',
      'ai_data_readiness_verdict_candidate',
      'owner_gate_required',
    ],
    candidate_sections: [
      'metadata_scrape',
      'source_lineage',
      'artifact_bundle_manifest',
      'data_dictionary',
      'privacy_access_tier',
      'retention_guardrail',
      'storage_tier',
      'authoritative_body_boundary',
      'derived_copy_inventory',
      'analytical_format_strategy',
      'cold_restore_proof',
      'read_model_boundary',
      'systematic_review_protocol',
      'inclusion_exclusion_criteria',
      'data_extraction_schema',
      'quality_appraisal',
      'dataset_metric_benchmark',
      'result_metric_registry',
      'ai_data_readiness_verdict_candidate',
    ],
  },
} as const satisfies Record<ScholarSkillModuleId, ArtifactEngineSpec>;

function normalizePayload(payload: unknown): Record<string, unknown> {
  return payload !== null && typeof payload === 'object' && !Array.isArray(payload)
    ? payload as Record<string, unknown>
    : { value: payload };
}

function fieldValue(payload: Record<string, unknown>, fields: string[], fallback: string) {
  for (const field of fields) {
    const value = payload[field];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value;
    }
  }
  return fallback;
}

function arrayValue(payload: Record<string, unknown>, field: string): unknown[] {
  const value = payload[field];
  return Array.isArray(value) ? value : [];
}

function inputRequirements(spec: ArtifactEngineSpec): ArtifactInputRequirements {
  return {
    required_payload_fields: spec.required_payload_fields,
    optional_payload_fields: spec.optional_payload_fields,
    accepted_input_refs: ['current_owner_delta_ref', 'refs_only_handoff_ref', 'domain_owner_request_ref'],
    required_artifact_root_ref: true,
    payload_sha256_required: true,
  };
}

function missingRequiredPayloadFields(spec: ArtifactEngineSpec, payload: Record<string, unknown>) {
  return spec.required_payload_fields.filter((field) => !Object.hasOwn(payload, field));
}

function readinessNotes(spec: ArtifactEngineSpec, payload: Record<string, unknown>) {
  const missing = missingRequiredPayloadFields(spec, payload);
  return [
    `${spec.engine_id} produced a non-authoritative candidate artifact body.`,
    'MAS/domain owner gate must judge adequacy before paper truth or owner receipt.',
    ...(missing.length > 0
      ? [`Missing payload fields require owner completion: ${missing.join(', ')}.`]
      : ['Required payload fields were observed; domain owner still must review semantic adequacy.']),
  ];
}

function validationChecks(spec: ArtifactEngineSpec, payload: Record<string, unknown>): ArtifactValidationCheck[] {
  return [
    ...spec.required_payload_fields.map((field) => ({
      check_id: `payload_field_${field}`,
      status: 'pass' as const,
      detail: Object.hasOwn(payload, field)
        ? `Payload field ${field} supplied or explicitly empty; domain owner must judge adequacy.`
        : `Payload field ${field} absent; candidate stays non-authoritative and requires owner completion.`,
    })),
    ...spec.quality_checks.map((check) => ({
      check_id: check,
      status: 'pass' as const,
      detail: `${check} recorded as a required owner-gate check, not an OPL quality verdict.`,
    })),
    {
      check_id: 'authority_boundary_false',
      status: 'pass',
      detail: 'Candidate engine cannot write domain truth, sign owner receipts, or claim artifact authority.',
    },
  ];
}

function buildStructuredCandidate(options: {
  module: ScholarSkillCapabilityModuleDescriptor;
  refFamily: string;
  inputRef: string;
  artifactRoot: string;
  payload: Record<string, unknown>;
  payloadSha256: string;
  bodyShaSeed: string;
}) {
  const spec = MODULE_ARTIFACT_ENGINES[options.module.module_id];
  const subject = fieldValue(
    options.payload,
    ['title', 'analysis_question', 'pipeline_goal', 'question', 'section_goal', 'review_scope', 'submission_goal', 'dataset_goal', 'intake_goal'],
    `${options.module.display_name} candidate`,
  );
  const sourceRefs = arrayValue(options.payload, 'source_refs');
  const engineReceiptRef = `opl://scholarskills/artifact-engine-receipts/${encodeURIComponent(options.module.module_id)}/${sha256Hex(options.bodyShaSeed)}`;
  return {
    surface_kind: 'opl_scholarskills_executable_candidate_artifact',
    status: 'candidate_artifact_engine_output',
    module_id: options.module.module_id,
    ref_family: options.refFamily,
    output_kind: spec.output_kind,
    descriptor_ref: moduleContractRef(options.module),
    input_ref: options.inputRef,
    artifact_root_ref: options.artifactRoot,
    payload_sha256: options.payloadSha256,
    engine: {
      engine_id: spec.engine_id,
      engine_version: spec.engine_version,
      executable_claim: 'deterministic_opl_candidate_artifact_body_builder',
      counts_as_domain_runtime: false,
      counts_as_domain_authority: false,
    },
    input_requirements: inputRequirements(spec),
    validation: {
      status: 'pass',
      checks: validationChecks(spec, options.payload),
      owner_gate_required: true,
    },
    candidate: {
      subject,
      source_refs: sourceRefs,
      sections: spec.candidate_sections.map((section) => ({
        section_id: section,
        status: 'candidate',
        ref: `${options.artifactRoot}/${options.refFamily}#${section}`,
      })),
      payload_excerpt: Object.fromEntries(
        [...spec.required_payload_fields, ...spec.optional_payload_fields]
          .filter((field) => Object.hasOwn(options.payload, field))
          .map((field) => [field, options.payload[field]]),
      ),
      quality_checks_required: spec.quality_checks,
      owner_consumption_required: true,
    },
    receipt_metadata: {
      engine_receipt_ref: engineReceiptRef,
      unsigned: true,
      payload_sha256: options.payloadSha256,
      output_ref: `${options.artifactRoot}/${options.refFamily}`,
      sha256_refs: {
        payload_ref: `sha256:${options.payloadSha256}`,
      },
    },
    readiness_notes: readinessNotes(spec, options.payload),
    missing_inputs: missingRequiredPayloadFields(spec, options.payload),
    body_included: true,
    body_carried_to_owner_request: false,
    body_policy: BODY_POLICY,
    authority_flags: AUTHORITY_FLAGS,
  };
}

function markdownBody(candidate: ReturnType<typeof buildStructuredCandidate>) {
  return [
    `# ${candidate.candidate.subject}`,
    '',
    `module_id: ${candidate.module_id}`,
    `ref_family: ${candidate.ref_family}`,
    `engine_id: ${candidate.engine.engine_id}`,
    `payload_sha256: ${candidate.payload_sha256}`,
    `engine_receipt_ref: ${candidate.receipt_metadata.engine_receipt_ref}`,
    `body_policy: ${candidate.body_policy}`,
    '',
    '## Candidate Sections',
    ...candidate.candidate.sections.map((section) => `- ${section.section_id}: ${section.ref}`),
    '',
    '## Validation',
    ...candidate.validation.checks.map((check) => `- ${check.check_id}: ${check.detail}`),
    '',
    '## Authority Boundary',
    '- counts_as_paper_truth: false',
    '- counts_as_owner_receipt: false',
    '- can_authorize_publication_readiness: false',
    '- can_sign_owner_receipt: false',
    '',
    '```json',
    stableJson(candidate.candidate.payload_excerpt),
    '```',
    '',
  ].join('\n');
}

function svgBody(candidate: ReturnType<typeof buildStructuredCandidate>) {
  const payloadShortSha = candidate.payload_sha256.slice(0, 16);
  const title = candidate.candidate.subject
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .slice(0, 72);
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540" role="img">',
    `<title>${title}</title>`,
    '<rect width="960" height="540" fill="#f7f7f2"/>',
    '<rect x="56" y="56" width="848" height="428" rx="8" fill="#ffffff" stroke="#2f3a3f" stroke-width="2"/>',
    '<text x="88" y="116" font-family="Arial, sans-serif" font-size="26" fill="#1d2529">Scholar Display Candidate</text>',
    `<text x="88" y="164" font-family="Arial, sans-serif" font-size="20" fill="#34515e">${title}</text>`,
    `<text x="88" y="214" font-family="Arial, sans-serif" font-size="18" fill="#34515e">engine: ${candidate.engine.engine_id}</text>`,
    `<text x="88" y="262" font-family="Arial, sans-serif" font-size="18" fill="#34515e">ref_family: ${candidate.ref_family}</text>`,
    `<text x="88" y="310" font-family="Arial, sans-serif" font-size="18" fill="#34515e">payload_sha256: ${payloadShortSha}</text>`,
    ...candidate.candidate.sections.slice(0, 4).map((section, index) => (
      `<text x="88" y="${360 + index * 28}" font-family="Arial, sans-serif" font-size="16" fill="#34515e">section: ${section.section_id}</text>`
    )),
    '<text x="88" y="482" font-family="Arial, sans-serif" font-size="18" fill="#6b2f2f">candidate only: owner gate required before paper truth</text>',
    '</svg>',
    '',
  ].join('\n');
}

function bodyFileName(refFamily: string, format: CandidateArtifactBodyEntry['body_format']) {
  const extension = format === 'markdown' ? 'md' : format;
  return `${refFamily}.${extension}`;
}

export function materializeCandidateArtifactBodies(options: {
  module: ScholarSkillCapabilityModuleDescriptor;
  inputRef: string;
  artifactRoot: string;
  outputRoot: string;
  payload: unknown;
}): CandidateArtifactBodyEntry[] {
  const payload = normalizePayload(options.payload);
  const payloadSha256 = sha256Hex(stableJson(options.payload));
  const spec = MODULE_ARTIFACT_ENGINES[options.module.module_id];
  return moduleArtifactRefFamilies(options.module).map((refFamily) => {
    const bodyShaSeed = stableJson({
      module_id: options.module.module_id,
      ref_family: refFamily,
      input_ref: options.inputRef,
      artifact_root_ref: options.artifactRoot,
      payload_sha256: payloadSha256,
      engine_id: spec.engine_id,
    });
    const candidate = buildStructuredCandidate({
      module: options.module,
      refFamily,
      inputRef: options.inputRef,
      artifactRoot: options.artifactRoot,
      payload,
      payloadSha256,
      bodyShaSeed,
    });
    const bodyPath = path.join(
      options.outputRoot,
      'candidate_artifacts',
      moduleProfileId(options.module),
      bodyFileName(refFamily, spec.body_format),
    );
    const writeResult = spec.body_format === 'json'
      ? writeDeterministicJson(bodyPath, candidate)
      : writeDeterministicText(
        bodyPath,
        spec.body_format === 'svg' ? svgBody(candidate) : markdownBody(candidate),
      );
    return {
      kind: refFamily,
      ref_id: refFamily,
      ref_family: refFamily,
      ref: `${options.artifactRoot}/${refFamily}`,
      sha256: `sha256:${writeResult.sha256}`,
      body_path: writeResult.path,
      body_ref: `file://${writeResult.path}`,
      body_sha256: writeResult.sha256,
      body_format: spec.body_format,
      body_policy: BODY_POLICY,
      body_written: true,
      materialization_status: 'candidate_artifact_body_written',
      payload_sha256: payloadSha256,
      engine_id: spec.engine_id,
      engine_version: spec.engine_version,
      engine_receipt_ref: candidate.receipt_metadata.engine_receipt_ref,
      validation_status: 'pass',
      validation_checks: candidate.validation.checks,
      input_requirements: candidate.input_requirements,
      readiness_notes: candidate.readiness_notes,
      missing_inputs: candidate.missing_inputs,
      body_included: true,
      body_carried_to_owner_request: false,
      authority_flags: AUTHORITY_FLAGS,
    };
  });
}
