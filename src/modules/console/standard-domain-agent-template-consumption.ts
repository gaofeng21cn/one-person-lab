import fs from 'node:fs';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';

import { buildAgentReadinessSummary } from './agent-readiness.ts';
import { loadFrameworkContracts } from '../charter/index.ts';
import { buildStandardDomainAgentConformanceReport } from '../workspace/index.ts';
import {
  DEFAULT_TEMPLATE_CONSUMPTION_SAMPLE_DOMAINS,
  buildStandardDomainAgentScaffold,
  validateStandardDomainAgentScaffold,
} from '../pack/index.ts';
import type { FrameworkContracts } from '../../kernel/types.ts';

type ScaffoldInput = {
  domainId?: string;
  domainLabel?: string;
};

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableJson(entry)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const recordValue = value as Record<string, unknown>;
    return `{${Object.keys(recordValue).sort().map((key) =>
      `${JSON.stringify(key)}:${stableJson(recordValue[key])}`
    ).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function sha256Stable(value: unknown) {
  return crypto.createHash('sha256').update(stableJson(value)).digest('hex');
}

function normalizeDomainId(value: string | undefined) {
  return (value || 'new-domain-agent')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'new-domain-agent';
}

function domainLabelFromId(domainId: string, label: string | undefined) {
  return label?.trim() || domainId
    .split(/[-_.]+/)
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() || ''}${part.slice(1)}`)
    .join(' ');
}

function recordArray(value: unknown) {
  return Array.isArray(value) ? value.filter((entry): entry is JsonRecord => (
    Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry)
  )) : [];
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    : [];
}

function countStageChecks(stageRefValidation: JsonRecord, field: string) {
  return recordArray(stageRefValidation.stage_statuses).filter((stage) =>
    recordArray(stage.checks).some((check) => check.field === field && check.status === 'ok')
  ).length;
}

function countStagePackBindings(stagePackV2Validation: JsonRecord, predicate: (stage: JsonRecord) => boolean) {
  return recordArray(stagePackV2Validation.stage_statuses).filter(predicate).length;
}

function buildValidatedScaffoldConsumptionRefs(input: {
  domainId: string;
  targetDir: string;
  generatedTemplateFileCount: number;
  generatedWrittenFileCount: number;
  validation: JsonRecord;
}) {
  const agentPackValidation = record(input.validation.agent_pack_validation);
  const stageRefValidation = record(input.validation.stage_ref_validation);
  const stagePackV2Validation = record(input.validation.stage_pack_v2_validation);
  const blockers = stringArray(input.validation.blockers);
  const selectedExecutorBindingObservedCount = countStagePackBindings(
    stagePackV2Validation,
    (stage) => Boolean(stringValue(stage.selected_executor_kind)),
  );
  const defaultCodexExecutorBindingCount = countStagePackBindings(
    stagePackV2Validation,
    (stage) =>
      stringValue(stage.selected_executor_kind) === 'codex_cli'
      && stringValue(stage.executor_binding_ref) === 'default_codex_cli',
  );

  return {
    surface_kind: 'opl_standard_agent_template_consumption_refs',
    owner: 'one-person-lab',
    evidence_role: 'refs_only_new_agent_template_consumption',
    status: input.validation.status === 'passed' ? 'validated_scaffold_consumed' : 'validation_blocked',
    mode: 'consumption_evidence',
    domain_id: input.domainId,
    scaffold_ref: 'contracts/opl-framework/standard-domain-agent-skeleton-contract.json',
    source_api_ref: 'opl.console.buildStandardDomainAgentScaffoldConsumptionEvidence',
    next_verification_api_ref: 'opl.console.buildStandardDomainAgentScaffoldConsumptionEvidence',
    target_dir_ref: input.targetDir,
    target_dir_policy: 'ephemeral_generated_repo_removed_after_validation',
    generated_template_file_count: input.generatedTemplateFileCount,
    generated_written_file_count: input.generatedWrittenFileCount,
    validation_consumed_generated_repo: true,
    validation_status: stringValue(input.validation.status),
    blocker_count: blockers.length,
    blockers,
    consumed_pack_path_count: numberValue(agentPackValidation.semantic_listed_path_count),
    consumed_pack_discovered_path_count: numberValue(agentPackValidation.discovered_path_count),
    consumed_stage_count: numberValue(stageRefValidation.stage_count),
    prompt_ref_resolved_stage_count: countStageChecks(stageRefValidation, 'prompt_refs'),
    skill_ref_resolved_stage_count: countStageChecks(stageRefValidation, 'skills'),
    knowledge_ref_resolved_stage_count: countStageChecks(stageRefValidation, 'knowledge_refs'),
    quality_gate_ref_resolved_stage_count: countStageChecks(stageRefValidation, 'evaluation'),
    selected_executor_binding_observed_count: selectedExecutorBindingObservedCount,
    default_codex_executor_binding_count: defaultCodexExecutorBindingCount,
    generated_surface_owner_verified: !stringArray(input.validation.authority_violations)
      .some((violation) => violation.includes('generated_surface')),
    private_surface_policy_guarded: stringArray(input.validation.missing_forbidden_role_guards).length === 0,
    stage_pack_v2_status: stringValue(stagePackV2Validation.status),
    app_operator_consumable: true,
    app_operator_projection_ref: '/app_operator_drilldown/standard_agent_template_consumption_refs',
    claim_policy:
      'scaffold_generation_and_validation_evidence_only_no_domain_ready_artifact_authority_or_production_ready_claim',
    authority_boundary: {
      refs_only: true,
      opl_can_write_domain_truth: false,
      opl_can_write_memory_body: false,
      opl_can_mutate_domain_artifact_body: false,
      opl_can_authorize_quality_or_export: false,
      scaffold_validation_can_claim_domain_ready: false,
      scaffold_validation_can_claim_artifact_authority: false,
      scaffold_validation_can_claim_production_ready: false,
    },
  };
}

function buildSurfaceConsumptionProof(repoDir: string, domainId: string, contracts: FrameworkContracts) {
  const conformance = buildStandardDomainAgentConformanceReport([
    '--agent',
    `${domainId}=${repoDir}`,
  ], contracts).standard_domain_agent_conformance;
  const conformanceSummary = record(conformance.summary);
  const readiness = buildAgentReadinessSummary([
    '--agent',
    `${domainId}=${repoDir}`,
  ], contracts).agent_readiness;
  const readinessSummary = record(readiness.summary);
  const readinessGates = record(readiness.gates);
  const scaffoldGate = record(readinessGates.scaffold_and_conformance);
  const appOperatorRefs = {
    surface_kind: 'opl_standard_agent_template_app_operator_consumption_refs',
    projection_ref: '/app_operator_drilldown/standard_agent_template_consumption_refs',
    summary_fields: [
      'standard_agent_template_consumption_status',
      'standard_agent_template_consumption_proof_api_ref_count',
      'standard_agent_template_consumption_app_operator_ref_count',
      'standard_agent_template_consumption_default_sample_count',
      'standard_agent_template_consumption_repeat_supported',
      'standard_agent_template_consumption_consumed_surface_count_per_sample',
      'standard_agent_template_consumption_readiness_surface_consumed',
      'standard_agent_template_consumption_app_operator_surface_consumed',
    ],
    full_detail_ref: '/runtime_tray_snapshot/app_operator_drilldown/standard_agent_template_consumption_refs',
    status: 'app_operator_projection_consumable',
  };

  return {
    surface_kind: 'opl_standard_agent_template_surface_consumption_proof',
    consumed_surface_status: 'scaffold_conformance_readiness_and_app_operator_surfaces_consumed',
    scaffold_validation_api_ref: 'opl.pack.validateStandardDomainAgentScaffold',
    conformance_ref: `opl agents conformance --agent ${domainId}=<ephemeral-new-agent-repo> --json`,
    readiness_ref: `opl agents readiness --agent ${domainId}=<ephemeral-new-agent-repo> --json`,
    app_operator_projection_ref: appOperatorRefs.projection_ref,
    conformance_status: stringValue(conformance.status),
    conformance_passed_count: numberValue(conformanceSummary.passed_count),
    conformance_blocked_count: numberValue(conformanceSummary.blocked_count),
    readiness_status: stringValue(readiness.status),
    readiness_structural_conformance_status: stringValue(readinessSummary.structural_conformance_status),
    readiness_scaffold_gate_status: stringValue(scaffoldGate.status),
    production_evidence_tail_count:
      numberValue(readinessSummary.agent_readiness_production_evidence_tail_count),
    app_operator_refs: appOperatorRefs,
    authority_boundary: {
      refs_only: true,
      can_write_domain_truth: false,
      can_write_memory_body: false,
      can_mutate_domain_artifact_body: false,
      can_authorize_quality_or_export: false,
      can_claim_domain_ready: false,
      can_claim_artifact_authority: false,
      can_claim_production_ready: false,
    },
  };
}

function buildSample(input: Required<ScaffoldInput>, contracts: FrameworkContracts) {
  const domainId = normalizeDomainId(input.domainId);
  const domainLabel = domainLabelFromId(domainId, input.domainLabel);
  const targetDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-standard-agent-consumption-'));
  try {
    const generated = buildStandardDomainAgentScaffold({
      targetDir,
      domainId,
      domainLabel,
      force: true,
    }).standard_domain_agent_scaffold;
    const validation =
      validateStandardDomainAgentScaffold({ repoDir: targetDir }).standard_domain_agent_scaffold_validation;
    const generatedTemplateFileCount = Array.isArray(generated.template_files)
      ? generated.template_files.length
      : 0;
    const generatedWrittenFileCount = numberValue(record(generated.write_summary).written_count);
    const refs = buildValidatedScaffoldConsumptionRefs({
      domainId,
      targetDir,
      generatedTemplateFileCount,
      generatedWrittenFileCount,
      validation,
    });
    const surfaceConsumptionProof = buildSurfaceConsumptionProof(targetDir, domainId, contracts);
    const validationStatus = stringValue(validation.status);
    const evidenceFingerprint = sha256Stable({
      domain_id: domainId,
      generation_summary: {
        generated_written_file_count: generatedWrittenFileCount,
        generated_template_file_count: generatedTemplateFileCount,
      },
      validation_summary: {
        validation_status: validationStatus,
        blocker_count: Array.isArray(validation.blockers) ? validation.blockers.length : 0,
        consumed_pack_path_count: numberValue(refs.consumed_pack_path_count),
        consumed_stage_count: numberValue(refs.consumed_stage_count),
        selected_executor_binding_observed_count:
          numberValue(refs.selected_executor_binding_observed_count),
        default_codex_executor_binding_count: numberValue(refs.default_codex_executor_binding_count),
        quality_gate_ref_resolved_stage_count: numberValue(refs.quality_gate_ref_resolved_stage_count),
        generated_surface_owner_verified: refs.generated_surface_owner_verified === true,
        private_surface_policy_guarded: refs.private_surface_policy_guarded === true,
        stage_pack_v2_status: stringValue(refs.stage_pack_v2_status),
      },
      surface_consumption_status: stringValue(surfaceConsumptionProof.consumed_surface_status),
      conformance_status: stringValue(surfaceConsumptionProof.conformance_status),
      readiness_status: stringValue(surfaceConsumptionProof.readiness_status),
      consumed_surfaces: [
        'scaffold_validation',
        'standard_agent_conformance',
        'agent_readiness',
        'app_operator_projection',
      ],
    });
    const evidenceRef = `opl://standard-agent-template-consumption/${domainId}/${evidenceFingerprint.slice(0, 16)}`;
    return {
      surface_kind: 'opl_standard_agent_template_consumption_evidence',
      owner: 'one-person-lab',
      status: validationStatus === 'passed' ? 'passed' : 'blocked',
      proof_kind: 'ephemeral_generate_then_validate_new_agent_skeleton',
      domain_id: domainId,
      evidence_ref: evidenceRef,
      evidence_fingerprint: `sha256:${evidenceFingerprint}`,
      evidence_ref_policy:
        'deterministic_shape_ref_for_replayable_template_consumption_evidence_not_a_ledger_receipt',
      scaffold_ref: 'contracts/opl-framework/standard-domain-agent-skeleton-contract.json',
      generated_repo_dir_ref: targetDir,
      generated_repo_dir_policy: 'ephemeral_removed_after_validation',
      generation_summary: {
        generated_written_file_count: generatedWrittenFileCount,
        generated_template_file_count: generatedTemplateFileCount,
      },
      validation_summary: {
        validation_status: validationStatus,
        blocker_count: Array.isArray(validation.blockers) ? validation.blockers.length : 0,
        consumed_pack_path_count: numberValue(refs.consumed_pack_path_count),
        consumed_stage_count: numberValue(refs.consumed_stage_count),
        selected_executor_binding_observed_count:
          numberValue(refs.selected_executor_binding_observed_count),
        default_codex_executor_binding_count: numberValue(refs.default_codex_executor_binding_count),
        quality_gate_ref_resolved_stage_count: numberValue(refs.quality_gate_ref_resolved_stage_count),
        generated_surface_owner_verified: refs.generated_surface_owner_verified === true,
        private_surface_policy_guarded: refs.private_surface_policy_guarded === true,
        stage_pack_v2_status: stringValue(refs.stage_pack_v2_status),
      },
      scaffold_consumption_refs: refs,
      surface_consumption_proof: surfaceConsumptionProof,
      non_goals: [
        'does_not_claim_domain_ready',
        'does_not_claim_artifact_authority',
        'does_not_claim_production_ready',
        'does_not_authorize_quality_or_export',
      ],
      authority_boundary: surfaceConsumptionProof.authority_boundary,
    };
  } finally {
    fs.rmSync(targetDir, { recursive: true, force: true });
  }
}

export function buildStandardDomainAgentScaffoldConsumptionEvidence(input: ScaffoldInput = {}) {
  const contracts = loadFrameworkContracts();
  const explicitSampleRequested = Boolean(input.domainId || input.domainLabel);
  const samples = explicitSampleRequested
    ? [{
      domainId: normalizeDomainId(input.domainId),
      domainLabel: domainLabelFromId(normalizeDomainId(input.domainId), input.domainLabel),
    }]
    : DEFAULT_TEMPLATE_CONSUMPTION_SAMPLE_DOMAINS;
  const sampleEvidence = samples.map((sample) => buildSample(sample, contracts));
  const primary = sampleEvidence[0];
  const blockedSamples = sampleEvidence.filter((sample) => sample.status !== 'passed');
  const passedSamples = sampleEvidence.filter((sample) => sample.status === 'passed');
  const cohortFingerprint = sha256Stable({
    sample_domain_ids: sampleEvidence.map((sample) => sample.domain_id),
    sample_evidence_refs: sampleEvidence.map((sample) => sample.evidence_ref),
    sample_statuses: sampleEvidence.map((sample) => sample.status),
    consumed_surfaces: [
      'scaffold_validation',
      'standard_agent_conformance',
      'agent_readiness',
      'app_operator_projection',
    ],
    all_samples_passed: blockedSamples.length === 0,
  });

  return {
    version: 'g2',
    standard_domain_agent_template_consumption_evidence: {
      ...primary,
      status: blockedSamples.length === 0 ? 'passed' : 'blocked',
      proof_kind: sampleEvidence.length > 1
        ? 'repeat_ephemeral_generate_then_validate_new_agent_skeletons'
        : primary.proof_kind,
      domain_id: primary.domain_id,
      cohort_evidence_ref:
        `opl://standard-agent-template-consumption/cohort/${cohortFingerprint.slice(0, 16)}`,
      cohort_evidence_fingerprint: `sha256:${cohortFingerprint}`,
      evidence_receipt_candidate_policy:
        'candidate_refs_are_body_free_replayable_shape_ids_not_recorded_ledger_receipts_and_do_not_claim_domain_ready_or_production_ready',
      sample_domain_ids: sampleEvidence.map((sample) => sample.domain_id),
      read_model_contract_ref:
        '/runtime_tray_snapshot/app_operator_drilldown/standard_agent_template_consumption_refs/evidence_contract',
      consumption_cohort: {
        surface_kind: 'opl_standard_agent_template_consumption_cohort_evidence',
        sample_count: sampleEvidence.length,
        passed_sample_count: passedSamples.length,
        blocked_sample_count: blockedSamples.length,
        all_samples_passed: blockedSamples.length === 0,
        explicit_sample_requested: explicitSampleRequested,
        sample_domain_ids: sampleEvidence.map((sample) => sample.domain_id),
        consumed_surface_count_per_sample: 4,
        consumed_surfaces: [
          'scaffold_validation',
          'standard_agent_conformance',
          'agent_readiness',
          'app_operator_projection',
        ],
        samples: sampleEvidence.map((sample) => ({
          domain_id: sample.domain_id,
          evidence_ref: sample.evidence_ref,
          evidence_fingerprint: sample.evidence_fingerprint,
          status: sample.status,
          proof_kind: sample.proof_kind,
          generated_repo_dir_policy: sample.generated_repo_dir_policy,
          generation_summary: sample.generation_summary,
          validation_summary: sample.validation_summary,
          surface_consumption_proof: sample.surface_consumption_proof,
          scaffold_consumption_ref_status: stringValue(record(sample.scaffold_consumption_refs).status),
          authority_boundary: sample.authority_boundary,
        })),
      },
      repeat_consumption_policy:
        'default_api_evaluation_runs_a_small_multi_domain_ephemeral_cohort_through_scaffold_conformance_readiness_and_app_operator_projection_without_claiming_domain_ready_or_production_ready',
    },
  };
}
