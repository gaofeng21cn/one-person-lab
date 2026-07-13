import type { FrameworkContracts } from '../../kernel/types.ts';
import { FUNCTIONAL_PRIVATIZATION_AUDIT_ENVELOPE_CONTRACT } from './functional-privatization-envelope.ts';

export type SemanticHygieneGateId =
  | 'provider_readiness_single_truth'
  | 'generated_surface_drift_owner_claim'
  | 'app_operator_drilldown_overprojection'
  | 'evidence_envelope_single_semantics'
  | 'public_surface_budget_conformance'
  | 'functional_privatization_evidence_gate'
  | 'app_release_evidence_not_contract_only'
  | 'family_runtime_parser_monolith'
  | 'stage_launch_guarantee_clarity'
  | 'domain_specific_carrier_boundary'
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
  surface_budget_conformance?: SurfaceBudgetConformance;
  functional_privatization_evidence_gate?: FunctionalPrivatizationEvidenceGateConformance;
  domain_specific_carrier_boundary?: DomainSpecificCarrierBoundaryConformance;
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

type SurfaceBudgetConformance = ReturnType<typeof buildSurfaceBudgetConformance>;
type FunctionalPrivatizationEvidenceGateConformance =
  ReturnType<typeof buildFunctionalPrivatizationEvidenceGateConformance>;
type DomainSpecificCarrierBoundaryConformance =
  ReturnType<typeof buildDomainSpecificCarrierBoundaryConformance>;

const DOMAIN_SPECIFIC_CARRIER_BOUNDARIES = [
  {
    carrier_string: 'domain_route',
    carrier_kind: 'domain_owned_route_profile',
    boundary_ref: 'DOMAIN_ROUTE_COMPATIBILITY_PROFILE',
    allowed_machine_role: 'domain_route_compatibility_carrier',
    source_evidence_refs: [
      'src/modules/runway/family-runtime-domain-route.ts',
      'src/modules/runway/family-runtime-domain-route-terminal-sync.ts',
    ],
  },
  {
    carrier_string: 'visual_transition',
    carrier_kind: 'domain_transition_profile_extension',
    boundary_ref: 'domain_transition_profile_extension_is_core_ontology=false',
    allowed_machine_role: 'domain_transition_profile_or_fixture_projection',
    source_evidence_refs: [
      'src/modules/stagecraft/family-transition-visual-ingestion.ts',
    ],
  },
  {
    carrier_string: 'publication',
    carrier_kind: 'domain_owned_verdict_ref',
    boundary_ref: 'qualityGateRuntimeAuthorityBoundary',
    allowed_machine_role: 'refs_only_quality_or_publication_receipt_projection',
    source_evidence_refs: [
      'src/modules/stagecraft/quality-gate-runtime.ts',
      'src/modules/ledger/current-owner-delta-parts/projection.ts',
    ],
  },
  {
    carrier_string: 'fundability',
    carrier_kind: 'domain_owned_verdict_ref',
    boundary_ref: 'generic substrate non_authority_flags',
    allowed_machine_role: 'domain_owned_fundability_verdict_ref_projection',
    source_evidence_refs: [
      'src/modules/runway/generic-substrate-projection.ts',
      'src/kernel/standard-agent-registry.ts',
      'src/modules/foundry-lab/agent-lab-promotion.ts',
    ],
  },
] as const;

function buildSurfaceBudgetConformance(contracts: FrameworkContracts) {
  const surfaces = contracts.publicSurfaceIndex.surfaces;
  const activeDefaultSurfaces = surfaces.filter((surface) => surface.surface_budget.default_surface);
  const invalidSurfaces = surfaces.filter((surface) => {
    const budget = surface.surface_budget;
    const promotionEvidenceRefs = Object.values(budget.promotion_evidence_refs)
      .filter((ref): ref is string => typeof ref === 'string' && ref.trim().length > 0);
    return (
      budget.default_surface_allowed_reasons.length === 0
      || promotionEvidenceRefs.length === 0
      || new Set(budget.consumer_refs).size < 2
      || budget.authority_boundary.can_claim_domain_ready !== false
      || budget.authority_boundary.can_claim_quality_verdict !== false
      || budget.authority_boundary.can_claim_artifact_authority !== false
      || budget.authority_boundary.can_claim_production_ready !== false
      || budget.authority_boundary.can_replace_ai_executor_planning !== false
      || budget.authority_boundary.can_replace_domain_owner !== false
    );
  });

  return {
    surface_count: surfaces.length,
    default_surface_count: activeDefaultSurfaces.length,
    budgeted_surface_count: surfaces.length - invalidSurfaces.length,
    default_surface_budgeted_count:
      activeDefaultSurfaces.length - invalidSurfaces.filter((surface) =>
        surface.surface_budget.default_surface
      ).length,
    all_default_surfaces_budgeted:
      activeDefaultSurfaces.every((surface) => !invalidSurfaces.includes(surface)),
    invalid_surface_budget_count: invalidSurfaces.length,
    invalid_surface_ids: invalidSurfaces.map((surface) => surface.surface_id),
    default_surface_policy:
      'default_surfaces_require_allowed_reason_promotion_evidence_multi_consumer_and_false_authority_flags',
    ai_first_policy:
      'surface_budget_limits_default_navigation_without_replacing_ai_executor_planning_or_domain_owner',
    authority_boundary: {
      can_claim_domain_ready: false,
      can_claim_quality_verdict: false,
      can_claim_artifact_authority: false,
      can_claim_production_ready: false,
      can_replace_ai_executor_planning: false,
      can_replace_domain_owner: false,
    },
  };
}

function buildFunctionalPrivatizationEvidenceGateConformance() {
  const gate = FUNCTIONAL_PRIVATIZATION_AUDIT_ENVELOPE_CONTRACT.semantic_equivalence_evidence_gate;
  return {
    semantic_equivalence_requires_evidence_when_active_private:
      FUNCTIONAL_PRIVATIZATION_AUDIT_ENVELOPE_CONTRACT.ai_first_contract_light_policy
        .semantic_equivalence_requires_evidence_when_active_private,
    evidence_required_when_any: [...gate.evidence_required_when_any],
    required_evidence_policy: gate.required_evidence_policy,
    can_close_without_evidence: gate.can_close_without_evidence,
    mechanical_completion_can_close: gate.mechanical_completion_can_close,
    closure_policy:
      'private residue or semantic equivalence review closure requires domain/App/live evidence refs, typed blocker, or owner receipt',
    authority_boundary: {
      can_claim_domain_ready: false,
      can_claim_private_residue_deleted: false,
      can_authorize_quality_or_export: false,
      can_replace_domain_owner: false,
    },
  };
}

function buildDomainSpecificCarrierBoundaryConformance() {
  const carrierBoundaries = DOMAIN_SPECIFIC_CARRIER_BOUNDARIES.map((carrier) => ({
    ...carrier,
    domain_specific_carrier_only: true,
    opl_core_ontology: false,
    opl_domain_authority: false,
    can_claim_domain_ready: false,
    can_authorize_quality_or_export: false,
    can_write_domain_truth: false,
  }));

  return {
    carrier_string_count: carrierBoundaries.length,
    covered_carrier_strings: carrierBoundaries.map((carrier) => carrier.carrier_string),
    all_carriers_have_non_ontology_boundary: carrierBoundaries.every((carrier) =>
      carrier.domain_specific_carrier_only
      && carrier.opl_core_ontology === false
      && carrier.opl_domain_authority === false
      && carrier.can_claim_domain_ready === false
      && carrier.can_authorize_quality_or_export === false
      && carrier.can_write_domain_truth === false
    ),
    allowed_machine_roles: carrierBoundaries.map((carrier) => ({
      carrier_string: carrier.carrier_string,
      carrier_kind: carrier.carrier_kind,
      allowed_machine_role: carrier.allowed_machine_role,
      boundary_ref: carrier.boundary_ref,
    })),
    forbidden_interpretations: [
      'opl_core_ontology',
      'opl_domain_authority',
      'domain_ready_claim',
      'quality_or_export_authority',
      'domain_truth_write_authority',
    ],
    authority_boundary: {
      can_define_opl_core_ontology: false,
      can_claim_domain_ready: false,
      can_authorize_quality_or_export: false,
      can_write_domain_truth: false,
      can_replace_domain_owner: false,
    },
    carrier_boundaries: carrierBoundaries,
  };
}

export function buildOplFrameworkSemanticHygieneAudit(contracts: FrameworkContracts) {
  const surfaceBudgetConformance = buildSurfaceBudgetConformance(contracts);
  const functionalPrivatizationEvidenceGate =
    buildFunctionalPrivatizationEvidenceGateConformance();
  const domainSpecificCarrierBoundary =
    buildDomainSpecificCarrierBoundaryConformance();
  const gates: SemanticHygieneGate[] = [
    {
      gate_id: 'provider_readiness_single_truth',
      pollution_point: 'provider readiness single truth',
      status: 'guarded',
      owner: 'one-person-lab',
      source_evidence: [
        'src/family-runtime-temporal-readiness.ts',
        'src/family-runtime-temporal-provider.ts',
        'src/framework-operating-maturity-parts/evidence-lanes.ts',
      ],
      current_state_claims: NO_READY_CLAIMS,
      required_boundary:
        'Temporal-backed provider readiness is the production substrate truth; local/offline provider status cannot stand in for Full online readiness.',
      next_action:
        'Keep provider readiness routed through buildTemporalWorkerReadiness and framework operating-maturity provider_long_soak evidence lanes; reject secondary ready/domain-ready wording.',
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
      gate_id: 'evidence_envelope_single_semantics',
      pollution_point: 'evidence envelope single semantics',
      status: 'guarded',
      owner: 'one-person-lab',
      source_evidence: [
        'src/evidence-envelope.ts',
        'src/framework-readiness.ts',
        'src/family-runtime-evidence-worklist.ts',
        'src/runtime-tray-app-operator-drilldown.ts',
      ],
      current_state_claims: NO_READY_CLAIMS,
      required_boundary:
        'Stage evidence, external evidence, domain dispatch, and cleanup receipts must share the same owner/scope/payload_kind/claim_allowed/receipt_refs/typed_blocker_refs/next_route reading without becoming a second readiness source.',
      next_action:
        'Keep evidence envelopes as refs-only projections consumed by framework readiness and App drilldown; do not add domain-ready, artifact-ready, quality/export, or production-ready verdict fields.',
    },
    {
      gate_id: 'public_surface_budget_conformance',
      pollution_point: 'public surface budget conformance',
      status: surfaceBudgetConformance.invalid_surface_budget_count === 0
        ? 'guarded'
        : 'attention_required',
      owner: 'one-person-lab',
      source_evidence: [
        'contracts/opl-framework/public-surface-index.json',
        'contracts/opl-framework/surface-budget-policy.json',
        'src/contracts.ts',
      ],
      current_state_claims: NO_READY_CLAIMS,
      required_boundary:
        'Every active public surface must carry a surface_budget envelope with allowed default reason, promotion evidence, repeated consumers, and false authority flags; this prevents default navigation surfaces from becoming second truth sources or AI executor planning contracts.',
      next_action:
        'Keep public-surface-index entries budgeted and route new surfaces through diagnostic/reference state until they meet authority, evidence, replay, audit, route-back, or repeated App/runtime consumption gates.',
      surface_budget_conformance: surfaceBudgetConformance,
    },
    {
      gate_id: 'functional_privatization_evidence_gate',
      pollution_point: 'functional privatization contract-only closure',
      status: 'guarded',
      owner: 'one-person-lab',
      source_evidence: [
        'src/functional-privatization-envelope.ts',
        'src/functional-privatization-audit.ts',
        'contracts/opl-framework/functional-privatization-audit-envelope-contract.json',
        'tests/src/functional-privatization-audit-envelope.test.ts',
      ],
      current_state_claims: NO_READY_CLAIMS,
      required_boundary:
        'Functional privatization classification, zero default watchlist, or compact read-model state cannot close semantic-equivalence review or active private residue without domain/App/live evidence refs, typed blocker, or owner receipt.',
      next_action:
        'Keep semantic-equivalence evidence gate visible in system semantic hygiene and reject private residue closure claims that lack domain/App/live evidence refs, typed blocker, or owner receipt.',
      functional_privatization_evidence_gate: functionalPrivatizationEvidenceGate,
    },
    {
      gate_id: 'app_release_evidence_not_contract_only',
      pollution_point: 'App release evidence contract-only substitution',
      status: 'guarded',
      owner: 'one-person-lab-app',
      source_evidence: [
        '../one-person-lab-app/contracts/app-release-channel.json',
        '../one-person-lab-app/scripts/validate-release-evidence-bundle.ts',
        '../one-person-lab-app/tests/release/app-release-boundary.test.ts',
      ],
      current_state_claims: NO_READY_CLAIMS,
      required_boundary:
        'Packaged App release evidence must require real bundle files, JSON sidecars, screenshots, first-run/settings smoke, and release verification; contract-only proof cannot stand in for user-path evidence.',
      next_action:
        'Keep App release validators fail-closed on missing bundle artifacts and report missing evidence instead of claiming packaged App acceptance.',
    },
    {
      gate_id: 'family_runtime_parser_monolith',
      pollution_point: 'family-runtime parser monolith',
      status: 'guarded',
      owner: 'one-person-lab',
      source_evidence: [
        'src/modules/runway/family-runtime-command.ts',
        'src/modules/runway/family-runtime-command-parts/registry.ts',
        'src/modules/runway/family-runtime-command-parts/shared.ts',
        'src/modules/runway/family-runtime-command-parts/provider.ts',
        'tests/src/cli/cases/family-runtime.test.ts',
      ],
      current_state_claims: NO_READY_CLAIMS,
      required_boundary:
        'Family runtime command parsing must stay split by provider/stage-attempt-projection/lifecycle/stage responsibilities and must not become a semantic owner.',
      next_action:
        'Route new runtime command semantics through the command-parts registry and keep behavior tests focused on command ownership boundaries.',
    },
    {
      gate_id: 'stage_launch_guarantee_clarity',
      pollution_point: 'stage launch guarantee clarity',
      status: 'guarded',
      owner: 'one-person-lab',
      source_evidence: [
        'src/family-runtime-stage-context-observation.ts',
        'src/family-stage-conformance.ts',
        'tests/src/family-stage-conformance.test.ts',
      ],
      current_state_claims: NO_READY_CLAIMS,
      required_boundary:
        'Stage launch admission can allow executor start only after admission checks; it does not guarantee completion, quality, or domain readiness.',
      next_action:
        'Route launch guarantees through admission/blocker envelopes and keep completion/readiness claims in domain-owned receipts.',
    },
    {
      gate_id: 'domain_specific_carrier_boundary',
      pollution_point: 'domain-specific compatibility/profile carrier boundary',
      status: domainSpecificCarrierBoundary.all_carriers_have_non_ontology_boundary
        ? 'guarded'
        : 'attention_required',
      owner: 'one-person-lab',
      source_evidence: [
        'src/modules/runway/family-runtime-domain-route.ts',
        'src/modules/stagecraft/family-transition-visual-ingestion.ts',
        'src/modules/stagecraft/quality-gate-runtime.ts',
        'src/modules/runway/generic-substrate-projection.ts',
      ],
      current_state_claims: NO_READY_CLAIMS,
      required_boundary:
        'Active domain_route, visual_transition, publication, and fundability strings are compatibility/profile/fixture/ref-only carriers; they must not be read as OPL core ontology or domain authority.',
      next_action:
        'Keep domain-specific carrier strings explicitly classified with false OPL ontology, domain-ready, quality/export, and domain-truth authority flags before adding or retiring related active surfaces.',
      domain_specific_carrier_boundary: domainSpecificCarrierBoundary,
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
