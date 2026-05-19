import type { FrameworkContracts } from './types.ts';

export type SemanticHygieneGateId =
  | 'provider_readiness_single_truth'
  | 'generated_surface_drift_owner_claim'
  | 'app_operator_drilldown_overprojection'
  | 'family_runtime_parser_monolith'
  | 'stage_launch_guarantee_clarity'
  | 'legacy_vocabulary_active_leakage';

export type SemanticHygieneGate = {
  gate_id: SemanticHygieneGateId;
  pollution_point: string;
  status: 'guarded' | 'attention_required';
  owner: string;
  source_evidence: string[];
  current_state_claims: {
    production_ready: false;
    domain_ready: false;
    artifact_authority: false;
  };
  required_boundary: string;
  next_action: string;
};

const NO_READY_CLAIMS = {
  production_ready: false,
  domain_ready: false,
  artifact_authority: false,
} as const;

function sourceEvidence(...refs: string[]) {
  return refs.map((ref) => ({
    ref,
    evidence_kind: 'machine_surface_or_guard',
  }));
}

export function buildOplFrameworkSemanticHygieneAudit(_contracts: FrameworkContracts) {
  const gates: SemanticHygieneGate[] = [
    {
      gate_id: 'provider_readiness_single_truth',
      pollution_point: 'provider readiness single truth',
      status: 'attention_required',
      owner: 'one-person-lab',
      source_evidence: [
        'src/production-functional-closeout-provider-readiness.ts',
        'src/family-runtime-temporal-readiness.ts',
        'src/family-runtime-temporal-provider.ts',
      ],
      current_state_claims: NO_READY_CLAIMS,
      required_boundary:
        'Temporal-backed provider readiness is the production substrate truth; local/offline provider status cannot stand in for Full online readiness.',
      next_action:
        'Keep provider readiness claims routed through the Temporal readiness/proof surfaces and reject secondary ready/domain-ready wording.',
    },
    {
      gate_id: 'generated_surface_drift_owner_claim',
      pollution_point: 'generated surface drift/owner claim',
      status: 'guarded',
      owner: 'one-person-lab',
      source_evidence: [
        'src/domain-pack-compiler.ts',
        'src/domain-pack-compiler/generated-interface-read-model.ts',
        'tests/src/cli/cases/domain-pack-compiler-drift-manifest.test.ts',
      ],
      current_state_claims: NO_READY_CLAIMS,
      required_boundary:
        'OPL owns generated wrappers and drift manifests; domain repositories keep truth, quality verdicts, memory bodies, and artifact authority.',
      next_action:
        'Continue treating generated artifact drift and domain owner claims as machine gates before claiming generated surfaces are aligned.',
    },
    {
      gate_id: 'app_operator_drilldown_overprojection',
      pollution_point: 'App operator drilldown overprojection',
      status: 'guarded',
      owner: 'one-person-lab',
      source_evidence: [
        'src/runtime-tray-app-operator-drilldown.ts',
        'src/runtime-tray-app-operator-drilldown-parts/detail-view.ts',
        'tests/src/cli/cases/runtime-app-operator-drilldown.test.ts',
      ],
      current_state_claims: NO_READY_CLAIMS,
      required_boundary:
        'App/operator drilldown is refs-only projection and cannot authorize domain readiness, export quality, or artifact mutation.',
      next_action:
        'Keep drilldown outputs explicit about refs-only authority and add blockers when the projection lacks owner/source evidence.',
    },
    {
      gate_id: 'family_runtime_parser_monolith',
      pollution_point: 'family-runtime parser monolith',
      status: 'attention_required',
      owner: 'one-person-lab',
      source_evidence: [
        'src/family-runtime-command.ts',
        'src/family-runtime-command-parts/shared.ts',
        'src/family-runtime-command-parts/provider.ts',
        'tests/src/cli/cases/family-runtime.test.ts',
      ],
      current_state_claims: NO_READY_CLAIMS,
      required_boundary:
        'Family runtime command parsing must stay split by provider/queue/lifecycle/stage responsibilities and must not become a semantic owner.',
      next_action:
        'Keep new runtime command semantics in command-parts modules with focused tests instead of re-growing one parser surface.',
    },
    {
      gate_id: 'stage_launch_guarantee_clarity',
      pollution_point: 'stage launch guarantee clarity',
      status: 'guarded',
      owner: 'one-person-lab',
      source_evidence: [
        'src/family-runtime-stage-admission-gate.ts',
        'src/family-stage-admission.ts',
        'tests/src/family-stage-admission.test.ts',
      ],
      current_state_claims: NO_READY_CLAIMS,
      required_boundary:
        'Stage launch admission can allow executor start only after admission checks; it does not guarantee completion, quality, or domain readiness.',
      next_action:
        'Route launch guarantees through admission/blocker envelopes and keep completion/readiness claims in domain-owned receipts.',
    },
    {
      gate_id: 'legacy_vocabulary_active_leakage',
      pollution_point: 'legacy vocabulary active leakage',
      status: 'guarded',
      owner: 'one-person-lab',
      source_evidence: [
        'tests/src/active-path-residue-scan.test.ts',
        'tests/src/stale-compat-retirement-guard.test.ts',
        'src/family-domain-agent-skeleton.ts',
      ],
      current_state_claims: NO_READY_CLAIMS,
      required_boundary:
        'Retired gateway, old operator-entry, federation, or non-default executor substrate vocabulary may remain only as history, diagnostic, provenance, or explicit executor-adapter context.',
      next_action:
        'Keep active CLI, machine contracts, and current docs free of retired vocabulary as current-truth aliases.',
    },
  ];

  return {
    surface_kind: 'opl_framework_semantic_hygiene_audit',
    version: 'opl-framework-semantic-hygiene-audit.v1',
    owner: 'one-person-lab',
    purpose:
      'Machine-readable semantic hygiene read model for framework-level pollution points that can otherwise over-claim production or domain readiness.',
    summary: {
      gate_count: gates.length,
      guarded_gate_count: gates.filter((gate) => gate.status === 'guarded').length,
      attention_required_gate_count: gates.filter((gate) => gate.status === 'attention_required').length,
      production_ready_claim_count: 0,
      domain_ready_claim_count: 0,
      artifact_authority_claim_count: 0,
      production_or_domain_ready: false,
    },
    gates: gates.map((gate) => ({
      ...gate,
      source_evidence: sourceEvidence(...gate.source_evidence),
    })),
    authority_boundary: {
      opl_can_project_framework_hygiene: true,
      opl_can_claim_provider_production_ready_from_this_surface: false,
      opl_can_claim_domain_ready_from_this_surface: false,
      opl_can_authorize_quality_or_export_from_this_surface: false,
      domain_truth_owner: 'MAS/MAG/RCA domain repositories',
      production_provider_truth_owner: 'Temporal provider readiness/proof surfaces',
    },
    next_actions: gates.map((gate) => ({
      gate_id: gate.gate_id,
      owner: gate.owner,
      action: gate.next_action,
      source_evidence_refs: gate.source_evidence,
    })),
  };
}
