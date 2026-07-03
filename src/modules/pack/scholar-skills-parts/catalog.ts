import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type {
  ScholarSkillAuthorityBoundary,
  ScholarSkillCapabilityModuleDescriptor,
  ScholarSkillModuleId,
} from '../../../kernel/types.ts';

export const MODULE_REQUIRED_ARTIFACT_REF_FAMILIES = {
  'mas-scholar-skills.display': ['display_pack_agent_orchestration'],
  'mas-scholar-skills.tables': ['table_manifest', 'table_qc'],
  'mas-scholar-skills.stats': ['analysis_manifest', 'reproducibility_check'],
  'mas-scholar-skills.lit': ['evidence_map', 'citation_manifest'],
  'mas-scholar-skills.write': ['draft_section_manifest', 'source_trace'],
  'mas-scholar-skills.review': ['reviewer_report', 'route_back'],
  'mas-scholar-skills.submit': ['package_manifest', 'submission_checklist'],
  'mas-scholar-skills.data': [
    'data_manifest',
    'dataset_manifest',
    'data_governance_handoff',
    'data_governance_assessment',
    'data_operation_receipt',
    'manifest_completeness_check',
    'privacy_tier_check',
    'study_impact_check',
    'registry_lineage',
    'semantic_readiness',
    'study_binding',
    'privacy_access_tier',
    'retention_guardrail',
    'storage_tier',
    'authoritative_body_boundary',
    'derived_copy_inventory',
    'analytical_format_strategy',
    'cold_restore_proof',
    'read_model_boundary',
    'lineage_readiness',
  ],
} as const satisfies Record<ScholarSkillModuleId, readonly string[]>;

export const MODULE_EXECUTION_RECEIPT_REF_FAMILIES = {
  'mas-scholar-skills.display': [
    'input_fingerprint',
    'dependency_profile',
    'prepared_run_context',
    'render_cache',
    'artifact_manifest',
    'visual_audit_or_gallery_preview',
  ],
  'mas-scholar-skills.tables': [
    'input_fingerprint',
    'dependency_profile',
    'prepared_run_context',
    'table_manifest',
    'table_qc',
  ],
  'mas-scholar-skills.stats': [
    'input_fingerprint',
    'dependency_profile',
    'prepared_run_context',
    'analysis_manifest',
    'reproducibility_check',
  ],
  'mas-scholar-skills.lit': [
    'input_fingerprint',
    'dependency_profile',
    'prepared_run_context',
    'evidence_map',
    'citation_manifest',
  ],
  'mas-scholar-skills.write': [
    'input_fingerprint',
    'dependency_profile',
    'prepared_run_context',
    'draft_section_manifest',
    'source_trace',
  ],
  'mas-scholar-skills.review': [
    'input_fingerprint',
    'dependency_profile',
    'prepared_run_context',
    'reviewer_report',
    'route_back',
  ],
  'mas-scholar-skills.submit': [
    'input_fingerprint',
    'dependency_profile',
    'prepared_run_context',
    'package_manifest',
    'submission_checklist',
  ],
  'mas-scholar-skills.data': [
    'input_fingerprint',
    'dependency_profile',
    'prepared_run_context',
    'data_manifest',
    'dataset_manifest',
    'data_governance_handoff',
    'data_governance_assessment',
    'data_operation_receipt',
    'manifest_completeness_check',
    'privacy_tier_check',
    'study_impact_check',
    'registry_lineage',
    'semantic_readiness',
    'study_binding',
    'privacy_access_tier',
    'retention_guardrail',
    'storage_tier',
    'authoritative_body_boundary',
    'derived_copy_inventory',
    'analytical_format_strategy',
    'cold_restore_proof',
    'read_model_boundary',
    'lineage_readiness',
  ],
} as const satisfies Record<ScholarSkillModuleId, readonly string[]>;

export const AUTHORITY_FALSE_FIELDS = [
  'can_claim_domain_ready',
  'can_claim_quality_verdict',
  'can_claim_artifact_authority',
  'can_claim_production_ready',
  'can_claim_runtime_ready',
  'can_schedule_runtime',
  'can_write_domain_truth',
  'can_write_runtime_state',
  'can_write_memory_body',
  'can_mutate_artifact_body',
  'can_sign_owner_receipt',
  'can_create_typed_blocker',
  'can_replace_domain_owner',
  'can_replace_ai_executor_planning',
] as const satisfies readonly (keyof ScholarSkillAuthorityBoundary)[];

export function moduleProfileId(module: ScholarSkillCapabilityModuleDescriptor) {
  return module.module_id.replace('mas-scholar-skills.', '');
}

export function moduleArtifactRefFamilies(module: ScholarSkillCapabilityModuleDescriptor) {
  return [...MODULE_REQUIRED_ARTIFACT_REF_FAMILIES[module.module_id]];
}

export function moduleExecutionReceiptRefFamilies(module: ScholarSkillCapabilityModuleDescriptor) {
  return [...MODULE_EXECUTION_RECEIPT_REF_FAMILIES[module.module_id]];
}

export function moduleContractRef(module: ScholarSkillCapabilityModuleDescriptor) {
  return `contracts/opl-framework/scholar-skills-capability-modules.json#modules.${module.module_id}`;
}

export function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value) ?? 'null';
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableJson(entry)).join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(',')}}`;
}

export function sha256Hex(value: string | Buffer) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function writeDeterministicJson(filePath: string, payload: unknown) {
  const content = `${stableJson(payload)}\n`;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
  return {
    path: filePath,
    sha256: sha256Hex(content),
  };
}

export function writeDeterministicText(filePath: string, content: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
  return {
    path: filePath,
    sha256: sha256Hex(content),
  };
}
