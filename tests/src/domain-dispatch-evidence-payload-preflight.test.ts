import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';

import {
  assertDomainDispatchEvidencePayloadReady,
  preflightDomainDispatchEvidencePayload,
} from '../../src/domain-dispatch-evidence-payload-preflight.ts';
import { FrameworkContractError } from '../../src/contracts.ts';
import { recordStageRunExecutionAuthorizationReceipts } from '../../src/stage-run-execution-authorization-ledger.ts';

const route = {
  action_id: 'domain_dispatch:medautoscience:sat-dm003:record',
  required_evidence_refs: [
    'mas://dm003/paper-facing-artifact-delta',
    'mas://dm003/ai-reviewer-currentness',
    'mas://dm003/domain-owner-receipt',
  ],
};

test('domain dispatch evidence payload must cover every route-declared required ref', () => {
  const preflight = preflightDomainDispatchEvidencePayload(
    {
      domain_receipt_refs: ['mas://dm003/domain-owner-receipt'],
      evidence_refs: ['mas://dm003/paper-facing-artifact-delta'],
    },
    route,
  );

  assert.equal(preflight.status, 'blocked');
  assert.equal(preflight.can_record_refs_only_receipt, false);
  assert.equal(preflight.selected_payload_path, 'blocked');
  assert.equal(
    preflight.payload_path_policy,
    'choose_success_closeout_refs_path_or_domain_owned_typed_blocker_path_evidence_refs_are_supplemental',
  );
  assert.equal(preflight.accepted_payload_paths.success_refs_path.status, 'not_ready');
  assert.equal(preflight.accepted_payload_paths.typed_blocker_path.status, 'not_ready');
  assert.deepEqual(preflight.required_evidence_refs, route.required_evidence_refs);
  assert.deepEqual(preflight.missing_required_evidence_refs, ['mas://dm003/ai-reviewer-currentness']);
  assert.equal(preflight.required_evidence_refs_covered, false);
});

test('generic evidence refs are supplemental and cannot close domain dispatch on their own', () => {
  const preflight = preflightDomainDispatchEvidencePayload(
    {
      evidence_refs: ['mas://dm003/paper-facing-artifact-delta'],
    },
    {
      action_id: 'domain_dispatch:medautoscience:sat-dm003:record',
      required_evidence_refs: ['mas://dm003/paper-facing-artifact-delta'],
    },
  );

  assert.equal(preflight.status, 'blocked');
  assert.equal(preflight.can_record_refs_only_receipt, false);
  assert.equal(preflight.selected_payload_path, 'blocked');
  assert.equal(preflight.required_evidence_refs_covered, true);
  assert.equal(preflight.accepted_payload_paths.success_refs_path.status, 'not_ready');
  assert.deepEqual(preflight.required_any_operator_payload_refs, [
    'domain_receipt_refs',
    'typed_blocker_refs',
    'owner_chain_refs',
    'no_regression_refs',
  ]);
  assert.deepEqual(preflight.supplemental_operator_payload_refs, ['evidence_refs']);
  assert.deepEqual(preflight.missing_payload_fields, [
    'domain_receipt_refs_or_typed_blocker_refs_or_owner_chain_refs_or_no_regression_refs',
  ]);
  assert.equal(preflight.accepted_ref_counts.evidence_refs, 1);
});

test('typed blocker refs may close a route-declared required evidence gap without claiming success', () => {
  const preflight = preflightDomainDispatchEvidencePayload(
    {
      typed_blocker_refs: ['mas://dm003/blockers/ai-reviewer-currentness'],
    },
    route,
  );

  assert.equal(preflight.status, 'ready_to_record');
  assert.equal(preflight.selected_payload_path, 'typed_blocker_path');
  assert.equal(preflight.typed_blocker_path_ready, true);
  assert.equal(preflight.accepted_payload_paths.typed_blocker_path.status, 'ready');
  assert.equal(preflight.accepted_payload_paths.typed_blocker_path.success_claimed, false);
  assert.equal(preflight.success_path_ready, false);
  assert.deepEqual(preflight.missing_required_evidence_refs, route.required_evidence_refs);
});

test('typed blocker refs lacking current StageRun closeout binding fail closed when route requires binding', () => {
  const workspaceRoot = mkdtempSync(join(tmpdir(), 'opl-ref-identity-missing-binding-'));
  try {
    const typedBlockerRef =
      'studies/003-dpcc-primary-care-phenotype-treatment-gap/artifacts/controller_decisions/latest.json';
    const typedBlockerPath = join(workspaceRoot, typedBlockerRef);
    mkdirSync(join(typedBlockerPath, '..'), { recursive: true });
    writeFileSync(typedBlockerPath, JSON.stringify({
      study_id: '003-dpcc-primary-care-phenotype-treatment-gap',
      status: 'blocked',
      blocked_reason: 'medical_paper_readiness_not_ready',
    }));

    const preflight = preflightDomainDispatchEvidencePayload(
      { typed_blocker_refs: [typedBlockerRef] },
      {
        target_identity: {
          study_id: '003-dpcc-primary-care-phenotype-treatment-gap',
          stage_run_id: 'app-stage-run:medautoscience:domain-owner-default-executor-dispatch',
          stage_manifest_ref: 'opl://stage-manifests/domain_owner%2Fdefault-executor-dispatch',
          current_pointer_ref:
            'opl://stage-runs/app-stage-run%3Amedautoscience%3Adomain-owner-default-executor-dispatch/current',
          source_fingerprint: 'mas_default_executor_source_current',
          idempotency_key: 'idem_current',
          provider_attempt_ref: 'temporal://attempt/sat-current',
          attempt_lease_ref: 'opl://stage-attempts/sat-current/leases/frt-current/active',
          execution_authorization_decision_ref:
            'opl://stage-attempts/sat-current/execution-authorizations/frt-current/wf-current',
        },
        workspace_root: workspaceRoot,
      },
    );

    assert.equal(preflight.status, 'blocked');
    assert.equal(preflight.can_record_refs_only_receipt, false);
    assert.equal(preflight.identity_binding.status, 'payload_identity_not_provided');
    assert.deepEqual(preflight.identity_binding.missing_required_closeout_binding_fields, [
      'stage_run_id',
      'source_fingerprint',
      'idempotency_key',
      'stage_manifest_ref',
      'current_pointer_ref',
      'provider_attempt_ref',
      'attempt_lease_ref',
      'execution_authorization_decision_ref',
    ]);
    assert.equal(
      preflight.identity_binding.policy,
      'record_fails_closed_when_stage_run_closeout_identity_is_missing_or_conflicts_with_target_attempt',
    );
  } finally {
    rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test('MAS paper-line owner-chain result payload feeds success refs without a ready claim', () => {
  const preflight = assertDomainDispatchEvidencePayloadReady(route, {
    evidence_refs: ['mas://dm003/paper-facing-artifact-delta'],
    paper_line_owner_chain_results: [
      {
        surface_kind: 'mas_paper_line_owner_chain_result',
        paper_line_id: '003-dpcc-primary-care-phenotype-treatment-gap',
        result_kind: 'owner_receipt',
        owner_receipt_refs: ['mas://dm003/domain-owner-receipt'],
        stable_typed_blocker_refs: [],
        progress_delta_refs: ['mas://dm003/ai-reviewer-currentness'],
        no_forbidden_write_proof_ref: 'mas://dm003/no-forbidden-write',
        body_included: false,
        readiness_claims: {
          claims_paper_closure: false,
          claims_publication_ready: false,
          claims_artifact_mutation_authorized: false,
          claims_current_package_updated: false,
        },
      },
    ],
  });

  assert.equal(preflight.status, 'ready_to_record');
  assert.equal(preflight.selected_payload_path, 'success_refs_path');
  assert.equal(preflight.accepted_ref_counts.domain_receipt_refs, 1);
  assert.equal(preflight.accepted_ref_counts.owner_chain_refs, 2);
  assert.equal(preflight.accepted_ref_counts.typed_blocker_refs, 0);
  assert.equal(preflight.accepted_payload_paths.success_refs_path.can_claim_domain_ready, false);
  assert.deepEqual(preflight.missing_required_evidence_refs, []);
});

test('MAS paper-line stable typed blocker result feeds blocker path without success', () => {
  const preflight = preflightDomainDispatchEvidencePayload(
    {
      paper_line_owner_chain_results: [
        {
          surface_kind: 'mas_paper_line_owner_chain_result',
          paper_line_id: '003-dpcc-primary-care-phenotype-treatment-gap',
          result_kind: 'stable_typed_blocker',
          owner_receipt_refs: [],
          stable_typed_blocker_refs: ['mas://dm003/blockers/ai-reviewer-currentness'],
          body_included: false,
        },
      ],
    },
    route,
  );

  assert.equal(preflight.status, 'ready_to_record');
  assert.equal(preflight.selected_payload_path, 'typed_blocker_path');
  assert.equal(preflight.accepted_ref_counts.domain_receipt_refs, 0);
  assert.equal(preflight.accepted_ref_counts.owner_chain_refs, 0);
  assert.equal(preflight.accepted_ref_counts.typed_blocker_refs, 1);
  assert.equal(preflight.accepted_payload_paths.typed_blocker_path.success_claimed, false);
  assert.equal(preflight.accepted_payload_paths.typed_blocker_path.can_claim_domain_ready, false);
});

test('MAS owner delta result payload feeds quality gate and stable blocker refs without body access', () => {
  const preflight = preflightDomainDispatchEvidencePayload(
    {
      owner_delta_result: {
        surface_kind: 'mas_current_owner_delta_result',
        study_id: '002-dm-china-us-mortality-attribution',
        result_kind: 'quality_gate_receipt_with_stable_typed_blocker',
        required_return_shape_satisfied: true,
        owner_receipt_refs: [],
        quality_gate_receipt_refs: [
          'mas://dm003/domain-owner-receipt',
          'mas://dm003/ai-reviewer-currentness',
        ],
        stable_typed_blocker_refs: ['mas://dm003/blockers/medical-paper-readiness'],
        body_included: false,
        authority_boundary: {
          writes_publication_eval: false,
          quality_claim_authorized: false,
        },
      },
    },
    route,
  );

  assert.equal(preflight.status, 'ready_to_record');
  assert.equal(preflight.selected_payload_path, 'typed_blocker_path');
  assert.equal(preflight.accepted_ref_counts.domain_receipt_refs, 2);
  assert.equal(preflight.accepted_ref_counts.typed_blocker_refs, 1);
  assert.equal(preflight.accepted_payload_paths.typed_blocker_path.success_claimed, false);
  assert.equal(preflight.accepted_payload_paths.typed_blocker_path.can_claim_domain_ready, false);
  assert.equal(preflight.accepted_payload_paths.typed_blocker_path.can_claim_production_ready, false);
});

test('MAS owner delta result closeout binding can satisfy StageRun owner-answer identity', () => {
  const preflight = preflightDomainDispatchEvidencePayload(
    {
      owner_delta_result: {
        surface_kind: 'mas_current_owner_delta_result',
        study_id: '002-dm-china-us-mortality-attribution',
        result_kind: 'stable_typed_blocker',
        required_return_shape_satisfied: true,
        owner_receipt_refs: [],
        quality_gate_receipt_refs: [],
        stable_typed_blocker_refs: ['mas://dm002/blockers/medical-paper-readiness'],
        body_included: false,
        closeout_binding: {
          stage_run_id: 'stage-run::dm002::domain-owner-dispatch',
          stage_manifest_ref: 'mas://stage-manifests/dm002/domain-owner-dispatch',
          current_pointer_ref: 'mas://current-pointers/dm002/domain-owner-dispatch',
          source_fingerprint: 'mas_default_executor_source_current',
          idempotency_key: 'owner-route::dm002::medical-paper-readiness',
          provider_attempt_ref: 'opl://stage-attempts/sat-dm002-readiness',
          attempt_lease_ref: 'opl://stage-attempts/sat-dm002-readiness/leases/current',
          execution_authorization_decision_ref:
            'opl://stage-attempts/sat-dm002-readiness/execution-authorizations/current',
        },
      },
    },
    {
      target_identity: {
        study_id: '002-dm-china-us-mortality-attribution',
        stage_run_id: 'stage-run::dm002::domain-owner-dispatch',
        stage_manifest_ref: 'mas://stage-manifests/dm002/domain-owner-dispatch',
        current_pointer_ref: 'mas://current-pointers/dm002/domain-owner-dispatch',
        source_fingerprint: 'mas_default_executor_source_current',
        idempotency_key: 'owner-route::dm002::medical-paper-readiness',
        provider_attempt_ref: 'opl://stage-attempts/sat-dm002-readiness',
        attempt_lease_ref: 'opl://stage-attempts/sat-dm002-readiness/leases/current',
        execution_authorization_decision_ref:
          'opl://stage-attempts/sat-dm002-readiness/execution-authorizations/current',
      },
    },
  );

  assert.equal(preflight.status, 'ready_to_record');
  assert.equal(preflight.identity_binding.status, 'matched');
  assert.deepEqual(preflight.identity_binding.conflict_fields, []);
  assert.equal(
    preflight.identity_binding.payload_identity.stage_run_id,
    'stage-run::dm002::domain-owner-dispatch',
  );
  assert.equal(
    preflight.identity_binding.payload_identity.idempotency_key,
    'owner-route::dm002::medical-paper-readiness',
  );
});

test('MAS owner delta result closeout binding conflicts fail closed', () => {
  const preflight = preflightDomainDispatchEvidencePayload(
    {
      owner_delta_result: {
        surface_kind: 'mas_current_owner_delta_result',
        study_id: '002-dm-china-us-mortality-attribution',
        result_kind: 'stable_typed_blocker',
        required_return_shape_satisfied: true,
        stable_typed_blocker_refs: ['mas://dm002/blockers/medical-paper-readiness'],
        body_included: false,
        closeout_binding: {
          stage_run_id: 'stage-run::dm002::stale',
          stage_manifest_ref: 'mas://stage-manifests/dm002/stale',
          current_pointer_ref: 'mas://current-pointers/dm002/stale',
          source_fingerprint: 'mas_default_executor_source_stale',
          idempotency_key: 'owner-route::dm002::stale',
        },
      },
    },
    {
      target_identity: {
        study_id: '002-dm-china-us-mortality-attribution',
        stage_run_id: 'stage-run::dm002::current',
        stage_manifest_ref: 'mas://stage-manifests/dm002/current',
        current_pointer_ref: 'mas://current-pointers/dm002/current',
        source_fingerprint: 'mas_default_executor_source_current',
        idempotency_key: 'owner-route::dm002::current',
      },
    },
  );

  assert.equal(preflight.status, 'blocked');
  assert.equal(preflight.identity_binding.status, 'conflict');
  assert.deepEqual(preflight.identity_binding.conflict_fields, [
    'stage_run_id',
    'source_fingerprint',
    'idempotency_key',
    'stage_manifest_ref',
    'current_pointer_ref',
  ]);
  assert.equal(preflight.can_record_refs_only_receipt, false);
});

test('MAS paper-line result carrying body or readiness claims fails closed', () => {
  assert.throws(
    () => assertDomainDispatchEvidencePayloadReady(route, {
      evidence_refs: ['mas://dm003/paper-facing-artifact-delta'],
      paper_line_owner_chain_results: [
        {
          surface_kind: 'mas_paper_line_owner_chain_result',
          paper_line_id: '003-dpcc-primary-care-phenotype-treatment-gap',
          result_kind: 'owner_receipt',
          owner_receipt_refs: ['mas://dm003/domain-owner-receipt'],
          progress_delta_refs: ['mas://dm003/ai-reviewer-currentness'],
          body_included: true,
          readiness_claims: {
            claims_paper_closure: true,
            claims_publication_ready: true,
            claims_artifact_mutation_authorized: true,
            claims_current_package_updated: true,
          },
        },
      ],
    }),
    (error) => {
      assert.equal(error instanceof FrameworkContractError, true);
      const details = (error as FrameworkContractError).details as {
        error_kind: string;
        forbidden_payload_authority_claims: Array<{ path: string }>;
        receipt_recorded: boolean;
        preflight: {
          can_record_refs_only_receipt: boolean;
          accepted_payload_paths: {
            success_refs_path: {
              can_claim_domain_ready: boolean;
              can_claim_production_ready: boolean;
            };
          };
        };
      };
      assert.equal(
        details.error_kind,
        'domain_dispatch_evidence_payload_authority_claims_forbidden',
      );
      assert.equal(details.receipt_recorded, false);
      assert.equal(details.preflight.can_record_refs_only_receipt, false);
      assert.equal(details.preflight.accepted_payload_paths.success_refs_path.can_claim_domain_ready, false);
      assert.equal(details.preflight.accepted_payload_paths.success_refs_path.can_claim_production_ready, false);
      assert.deepEqual(details.forbidden_payload_authority_claims.map((claim) => claim.path), [
        'paper_line_owner_chain_results[0].body_included',
        'paper_line_owner_chain_results[0].readiness_claims.claims_paper_closure',
        'paper_line_owner_chain_results[0].readiness_claims.claims_publication_ready',
        'paper_line_owner_chain_results[0].readiness_claims.claims_artifact_mutation_authorized',
        'paper_line_owner_chain_results[0].readiness_claims.claims_current_package_updated',
      ]);
      return true;
    },
  );
});

test('domain dispatch evidence payload records only when success refs cover all required refs', () => {
  const preflight = assertDomainDispatchEvidencePayloadReady(route, {
    domain_receipt_refs: ['mas://dm003/domain-owner-receipt'],
    owner_chain_refs: ['mas://dm003/ai-reviewer-currentness'],
    evidence_refs: ['mas://dm003/paper-facing-artifact-delta'],
  });

  assert.equal(preflight.status, 'ready_to_record');
  assert.equal(preflight.selected_payload_path, 'success_refs_path');
  assert.equal(preflight.accepted_payload_paths.success_refs_path.status, 'ready');
  assert.equal(preflight.accepted_payload_paths.success_refs_path.typed_blocker_refs_must_be_absent, true);
  assert.equal(preflight.required_evidence_refs_covered, true);
  assert.deepEqual(preflight.missing_required_evidence_refs, []);
});

test('missing route-required refs fail closed with structured preflight details', () => {
  assert.throws(
    () => assertDomainDispatchEvidencePayloadReady(route, {
      domain_receipt_refs: ['mas://dm003/domain-owner-receipt'],
      evidence_refs: ['mas://dm003/unrelated-proof'],
    }),
    (error) => {
      assert.equal(error instanceof FrameworkContractError, true);
      const details = (error as FrameworkContractError).details as {
        error_kind: string;
        preflight: { missing_required_evidence_refs: string[] };
      };
      assert.equal(details.error_kind, 'domain_dispatch_evidence_required_refs_missing');
      assert.deepEqual(details.preflight.missing_required_evidence_refs, [
        'mas://dm003/paper-facing-artifact-delta',
        'mas://dm003/ai-reviewer-currentness',
      ]);
      return true;
    },
  );
});

test('domain dispatch evidence separates OPL attempt key from domain source freshness', () => {
  const preflight = preflightDomainDispatchEvidencePayload(
    {
      domain_id: 'medautoscience',
      task_kind: 'domain_owner/default-executor-dispatch',
      study_id: '002-dm-china-us-mortality-attribution',
      source_fingerprint: '4a0c28ae63dc5d68',
      typed_blocker_refs: ['mas://typed-blockers/default-executor-pending'],
    },
    {
      action_id: 'domain_dispatch:medautoscience:sat-default-executor:record',
      target_identity: {
        domain_id: 'medautoscience',
        task_kind: 'domain_owner/default-executor-dispatch',
        study_id: '002-dm-china-us-mortality-attribution',
        source_fingerprint: 'mas_default_executor_source_76b3786a207154317d53c958',
        domain_source_fingerprint: '4a0c28ae63dc5d68',
      },
    },
  );

  assert.equal(preflight.status, 'ready_to_record');
  assert.equal(preflight.identity_binding.status, 'matched');
  assert.deepEqual(preflight.identity_binding.conflict_fields, []);
  assert.equal(
    preflight.identity_binding.payload_identity.domain_source_fingerprint,
    '4a0c28ae63dc5d68',
  );
  assert.equal(
    preflight.identity_binding.target_identity.source_fingerprint,
    'mas_default_executor_source_76b3786a207154317d53c958',
  );
  assert.equal(preflight.identity_binding.payload_identity.source_fingerprint, undefined);
});

test('domain source freshness mismatch still fails closed', () => {
  const preflight = preflightDomainDispatchEvidencePayload(
    {
      domain_id: 'medautoscience',
      task_kind: 'domain_owner/default-executor-dispatch',
      study_id: '002-dm-china-us-mortality-attribution',
      source_fingerprint: 'stale-domain-source',
      typed_blocker_refs: ['mas://typed-blockers/default-executor-pending'],
    },
    {
      target_identity: {
        domain_id: 'medautoscience',
        task_kind: 'domain_owner/default-executor-dispatch',
        study_id: '002-dm-china-us-mortality-attribution',
        source_fingerprint: 'mas_default_executor_source_76b3786a207154317d53c958',
        domain_source_fingerprint: '4a0c28ae63dc5d68',
      },
    },
  );

  assert.equal(preflight.status, 'blocked');
  assert.equal(preflight.identity_binding.status, 'conflict');
  assert.deepEqual(preflight.identity_binding.conflict_fields, ['domain_source_fingerprint']);
  assert.equal(preflight.can_record_refs_only_receipt, false);
});

test('explicit OPL attempt key still conflicts independently from domain source freshness', () => {
  const preflight = preflightDomainDispatchEvidencePayload(
    {
      domain_id: 'medautoscience',
      task_kind: 'domain_owner/default-executor-dispatch',
      study_id: '002-dm-china-us-mortality-attribution',
      source_fingerprint: '4a0c28ae63dc5d68',
      stage_attempt_source_fingerprint: 'wrong-provider-attempt-key',
      typed_blocker_refs: ['mas://typed-blockers/default-executor-pending'],
    },
    {
      target_identity: {
        domain_id: 'medautoscience',
        task_kind: 'domain_owner/default-executor-dispatch',
        study_id: '002-dm-china-us-mortality-attribution',
        source_fingerprint: 'mas_default_executor_source_76b3786a207154317d53c958',
        domain_source_fingerprint: '4a0c28ae63dc5d68',
      },
    },
  );

  assert.equal(preflight.status, 'blocked');
  assert.equal(preflight.identity_binding.status, 'conflict');
  assert.deepEqual(preflight.identity_binding.conflict_fields, ['source_fingerprint']);
  assert.equal(preflight.can_record_refs_only_receipt, false);
});

test('typed blocker ref content identity mismatch fails closed even when payload omits identity fields', () => {
  const workspaceRoot = mkdtempSync(join(tmpdir(), 'opl-ref-identity-'));
  const stateRoot = mkdtempSync(join(tmpdir(), 'opl-ref-identity-state-'));
  const previousStateDir = process.env.OPL_STATE_DIR;
  try {
    process.env.OPL_STATE_DIR = stateRoot;
    const authorizationRecord = recordStageRunExecutionAuthorizationReceipts([{
      stage_run_id: 'app-stage-run:medautoscience:domain-owner-default-executor-dispatch',
      domain_id: 'medautoscience',
      stage_id: 'domain_owner/default-executor-dispatch',
      phase: 'launch',
      selected_executor: 'codex_cli',
      provider_attempt_ref: 'temporal://attempt/sat_current',
      stage_attempt_id: 'sat-current',
      attempt_lease_ref: 'opl://stage-attempts/sat_current/leases/frt_current/active',
      attempt_lease_status: 'active',
      execution_authorization_decision_ref:
        'opl://stage-attempts/sat_current/execution-authorizations/frt_current/wf_current',
      workspace_scope_ref: `workspace:${workspaceRoot}`,
      artifact_scope_ref: 'stage-packet:current',
      source_fingerprint: 'mas_default_executor_source_current',
      study_id: 'study:domain-dispatch-current',
      domain_context: {
        domain_id: 'medautoscience',
        study_id: 'study:domain-dispatch-current',
        stage_id: 'domain_owner/default-executor-dispatch',
      },
      action_type: 'domain_owner/default-executor-dispatch',
      work_unit_id: 'stage-packet:current',
      work_unit_fingerprint: 'mas_default_executor_source_current',
      decision: 'authorize',
      reason: 'test_authorized_refs_only_stage_attempt_execution',
      operator: 'test:domain-dispatch-evidence-payload-preflight',
      idempotency_key: 'idem_current',
      current_pointer_ref:
        'opl://stage-runs/app-stage-run%3Amedautoscience%3Adomain-owner-default-executor-dispatch/current',
      stage_manifest_ref: 'opl://stage-manifests/domain_owner%2Fdefault-executor-dispatch',
    }]);
    assert.equal(authorizationRecord.status, 'recorded');

    const typedBlockerRef =
      'studies/003-dpcc-primary-care-phenotype-treatment-gap/artifacts/stage_outputs/08-publication_package_handoff/receipts/typed_blocker.json';
    const typedBlockerPath = join(workspaceRoot, typedBlockerRef);
    mkdirSync(join(typedBlockerPath, '..'), { recursive: true });
    writeFileSync(typedBlockerPath, JSON.stringify({
      surface_kind: 'mas_stage_owner_receipt',
      receipt_kind: 'typed_blocker',
      study_id: '003-dpcc-primary-care-phenotype-treatment-gap',
      stage_run_id: 'stage-run::003-dpcc-primary-care-phenotype-treatment-gap::08-publication_package_handoff',
      stage_manifest_ref: 'artifacts/stage_outputs/08-publication_package_handoff/stage_manifest.json',
      current_pointer_ref: 'artifacts/stage_outputs/08-publication_package_handoff/current.json',
      source_fingerprint: 'mas_default_executor_source_stale',
      idempotency_key: 'idem_stale',
      closeout_binding: {
        source_fingerprint: 'mas_default_executor_source_stale',
        idempotency_key: 'idem_stale',
        provider_attempt_ref: 'temporal://attempt/sat_stale',
        attempt_lease_ref: 'opl://stage-attempts/sat_stale/leases/frt_stale/active',
        execution_authorization_decision_ref:
          'opl://stage-attempts/sat_stale/execution-authorizations/frt_stale/wf_stale',
      },
    }));

    const currentRoute = {
      action_id: 'domain_dispatch:medautoscience:sat-current:record',
      target_identity: {
        domain_id: 'medautoscience',
        stage_attempt_id: 'sat-current',
        task_kind: 'domain_owner/default-executor-dispatch',
        study_id: '003-dpcc-primary-care-phenotype-treatment-gap',
      },
      workspace_root: workspaceRoot,
    };

    const preflight = preflightDomainDispatchEvidencePayload(
      { typed_blocker_refs: [typedBlockerRef] },
      currentRoute,
    );

    assert.equal(preflight.status, 'blocked');
    assert.equal(preflight.identity_binding.status, 'conflict');
    assert.deepEqual(preflight.identity_binding.conflict_fields, [
      'stage_run_id',
      'source_fingerprint',
      'idempotency_key',
      'stage_manifest_ref',
      'current_pointer_ref',
      'provider_attempt_ref',
      'attempt_lease_ref',
      'execution_authorization_decision_ref',
    ]);
    assert.equal(preflight.can_record_refs_only_receipt, false);
    assert.throws(
      () => assertDomainDispatchEvidencePayloadReady(
        currentRoute,
        { typed_blocker_refs: [typedBlockerRef] },
      ),
      (error) => {
        assert.equal(error instanceof FrameworkContractError, true);
        const details = (error as FrameworkContractError).details as {
          error_kind: string;
          identity_conflicts: Array<{ field: string }>;
        };
        assert.equal(details.error_kind, 'domain_dispatch_evidence_receipt_conflict');
        assert.deepEqual(details.identity_conflicts.map((conflict) => conflict.field), [
          'stage_run_id',
          'source_fingerprint',
          'idempotency_key',
          'stage_manifest_ref',
          'current_pointer_ref',
          'provider_attempt_ref',
          'attempt_lease_ref',
          'execution_authorization_decision_ref',
        ]);
        return true;
      },
    );
  } finally {
    if (previousStateDir === undefined) {
      delete process.env.OPL_STATE_DIR;
    } else {
      process.env.OPL_STATE_DIR = previousStateDir;
    }
    rmSync(workspaceRoot, { recursive: true, force: true });
    rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('local owner answer inspection supports JSON fragments and ignores JSONL history refs', () => {
  const workspaceRoot = mkdtempSync(join(tmpdir(), 'opl-ref-identity-json-fragment-'));
  try {
    const closeoutRef =
      'studies/002-dm-china-us-mortality-attribution/artifacts/supervision/consumer/default_executor_execution/sat-current.closeout.json#domain_blocker';
    const historyRef =
      'studies/002-dm-china-us-mortality-attribution/artifacts/supervision/consumer/default_executor_execution/history.jsonl';
    const closeoutPath = join(workspaceRoot, closeoutRef.split('#')[0]);
    const historyPath = join(workspaceRoot, historyRef);
    mkdirSync(join(closeoutPath, '..'), { recursive: true });
    writeFileSync(closeoutPath, JSON.stringify({
      surface_kind: 'mas_default_executor_execution_closeout',
      stage_attempt_id: 'sat-current',
      study_id: '002-dm-china-us-mortality-attribution',
      domain_blocker: {
        surface_kind: 'mas_domain_typed_blocker',
        stage_attempt_id: 'sat-current',
        study_id: '002-dm-china-us-mortality-attribution',
        reason: 'publication_eval_not_ai_reviewer_owned',
      },
    }));
    writeFileSync(
      historyPath,
      [
        JSON.stringify({ generated_at: '2026-06-07T14:00:00Z', status: 'blocked' }),
        JSON.stringify({ generated_at: '2026-06-07T14:05:00Z', status: 'blocked' }),
      ].join('\n'),
    );

    const preflight = preflightDomainDispatchEvidencePayload(
      {
        typed_blocker_refs: [closeoutRef],
        owner_chain_refs: [historyRef],
      },
      {
        target_identity: {
          stage_attempt_id: 'sat-current',
          study_id: '002-dm-china-us-mortality-attribution',
        },
        workspace_root: workspaceRoot,
      },
    );

    assert.equal(preflight.status, 'ready_to_record');
    assert.equal(preflight.identity_binding.status, 'matched');
    assert.deepEqual(preflight.identity_binding.conflict_fields, []);
    assert.equal(preflight.local_owner_answer_ref_identity.inspected_ref_count, 1);
    assert.equal(preflight.local_owner_answer_ref_identity.inspected_refs[0].ref, closeoutRef);
    assert.equal(preflight.local_owner_answer_ref_identity.inspected_refs[0].fragment, 'domain_blocker');
    assert.equal(
      preflight.local_owner_answer_ref_identity.inspected_refs[0].identity.stage_attempt_id,
      'sat-current',
    );
  } finally {
    rmSync(workspaceRoot, { recursive: true, force: true });
  }
});
