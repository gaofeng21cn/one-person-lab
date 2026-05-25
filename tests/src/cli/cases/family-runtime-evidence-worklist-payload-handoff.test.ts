import {
  assert,
  test,
} from '../helpers.ts';
import { runFamilyRuntimeEvidenceWorklist } from '../../../../src/family-runtime-evidence-worklist.ts';
import type { FrameworkContracts } from '../../../../src/types.ts';

const contracts = {
  contractsDir: '/tmp/opl-payload-handoff-contracts',
  contractsRootSource: 'cwd',
  workstreams: { version: 'test', workstreams: [] },
  domains: { version: 'test', domains: [] },
  stageSelectionVocabulary: {
    version: 'test',
    intent_id: [],
    workstream_id: [],
    domain_id: [],
    request_kind: [],
    target_kind: [],
    delivery_kind: [],
    review_kind: [],
    entry_mode: [],
    selection_rules: [],
    special_cases: [],
  },
  taskTopology: {
    version: 'test',
    scope: 'test',
    description: 'test',
    non_goals: [],
    topology_rules: [],
    shared_foundation_reuse: [],
    workstreams: [],
  },
  publicSurfaceIndex: {
    version: 'test',
    scope: 'test',
    description: 'test',
    non_goals: [],
    ownership_rules: [],
    surface_categories: [],
    surfaces: [],
  },
} as FrameworkContracts;

type PayloadHandoffWorklist = {
  summary: {
    open_worklist_item_count: number;
    open_safe_action_payload_required_item_count: number;
  };
  next_safe_actions?: PayloadHandoffAction[];
  worklist_items: Array<{
    action_id: string;
    payload_workorder: {
      surface_kind: string;
      authority_boundary: Record<string, boolean>;
    };
    accepted_payload_paths: Record<string, unknown>;
    required_operator_payload_refs: string[];
    supplemental_operator_payload_refs: string[];
    payload_preflight_policy: string;
    payload_preflight_blocked_error_kind: string;
    identity_binding_policy: string;
    identity_binding_guidance: {
      authority_boundary: Record<string, boolean>;
    };
    worklist_item_is_completion_claim: boolean;
    evidence_requirement: {
      can_claim_domain_ready: boolean;
      can_claim_production_ready: boolean;
    };
  }>;
  domain_dispatch_evidence_workorder_packet: {
    workorders: Array<{
      action_id: string;
      payload_workorder: Record<string, unknown>;
      accepted_payload_paths: Record<string, unknown>;
    }>;
  };
  authority_boundary: Record<string, boolean>;
};

type PayloadHandoffAction = {
  action_id: string;
  payload_workorder: {
    surface_kind: string;
    authority_boundary: Record<string, boolean>;
  };
  accepted_payload_paths: Record<string, unknown>;
  required_operator_payload_refs: string[];
  supplemental_operator_payload_refs: string[];
  payload_preflight_policy: string;
  payload_preflight_blocked_error_kind: string;
  identity_binding_policy: string;
  identity_binding_guidance: {
    authority_boundary: Record<string, boolean>;
  };
  worklist_item_is_completion_claim: boolean;
};

function domainDispatchBridgeRoute(actionId: string) {
  return {
    action_id: actionId,
    action_kind: 'domain_dispatch_evidence_receipt_record',
    owner: 'opl',
    domain_id: 'medautoscience',
    stage_id: 'domain_owner/default-executor-dispatch',
    stage_attempt_id: 'sat_payload_handoff',
    request_id: 'domain_dispatch:medautoscience:sat_payload_handoff',
    request_pack_id: 'medautoscience.domain_dispatch_evidence',
    payload_owner: 'domain_repository_or_app_live_operator',
    route_requires_domain_or_app_payload: true,
    can_close_without_domain_or_app_payload: false,
    route_status: 'request_route_available',
    open_reason: 'domain_dispatch_attempt_missing_owner_receipt_or_typed_blocker_refs',
    payload_requirement:
      'domain_app_or_live_refs_payload_required_to_record_domain_dispatch_owner_receipt_or_typed_blocker',
    ref: 'opl agents evidence apply --domain medautoscience --request-id domain_dispatch:medautoscience:sat_payload_handoff --request-pack-id medautoscience.domain_dispatch_evidence --source-ref /stage_attempt_workbench/attempts/sat_payload_handoff/domain_dispatch_evidence',
    payload_template: {
      domain_receipt_refs: [],
      typed_blocker_refs: [],
      no_regression_refs: [],
      owner_chain_refs: [],
      evidence_refs: [],
    },
    required_operator_payload_refs: [
      'domain_receipt_refs',
      'owner_chain_refs',
      'no_regression_refs',
      'typed_blocker_refs',
    ],
    supplemental_operator_payload_refs: ['evidence_refs'],
    required_evidence_refs: [
      'domain_dispatch:medautoscience:sat_payload_handoff:owner_receipt_or_typed_blocker',
    ],
  };
}

function domainDispatchOperatorRoute(actionId: string) {
  return {
    ...domainDispatchBridgeRoute(actionId),
    target_identity: {
      domain_id: 'medautoscience',
      stage_id: 'domain_owner/default-executor-dispatch',
      stage_attempt_id: 'sat_payload_handoff',
      task_kind: 'domain_owner/default-executor-dispatch',
      study_id: '002-dm-china-us-mortality-attribution',
      source_fingerprint: 'mas_default_executor_source_fixture',
      domain_source_fingerprint: 'domain-source-fixture',
      profile: '/profiles/dm-cvd-mortality-risk.local.toml',
      profile_name: 'dm-cvd-mortality-risk',
    },
    identity_binding_policy:
      'record_payload_identity_must_not_conflict_with_stage_attempt_target_identity',
    payload_ref_hints: {
      domain_receipt_refs_should_cover: [
        'domain_dispatch:medautoscience:sat_payload_handoff:owner_receipt',
      ],
      typed_blocker_refs_may_close_instead_of_success: true,
      owner_chain_refs_recommended: true,
      no_regression_refs_recommended: true,
      required_any_payload_refs: [
        'domain_receipt_refs',
        'owner_chain_refs',
        'no_regression_refs',
        'typed_blocker_refs',
      ],
      supplemental_payload_refs: ['evidence_refs'],
      evidence_refs_are_supplemental_context_only: true,
    },
    copyable_runtime_action_execute_commands: {
      record_success_path:
        'opl runtime action execute --action domain_dispatch:medautoscience:sat_payload_handoff:record --payload \'{"domain_receipt_refs":["<medautoscience-owner-receipt-ref>"],"typed_blocker_refs":[],"no_regression_refs":["<medautoscience-no-regression-ref>"],"owner_chain_refs":["<medautoscience-owner-chain-ref>"],"evidence_refs":[]}\'',
      record_typed_blocker_path:
        'opl runtime action execute --action domain_dispatch:medautoscience:sat_payload_handoff:record --payload \'{"domain_receipt_refs":[],"typed_blocker_refs":["<medautoscience-typed-blocker-ref>"],"no_regression_refs":[],"owner_chain_refs":[],"evidence_refs":[]}\'',
    },
    payload_workorder: {
      surface_kind: 'opl_domain_dispatch_evidence_payload_workorder',
      workorder_policy:
        'operator_must_choose_success_refs_path_or_domain_owned_typed_blocker_path_empty_template_blocks',
      payload_owner: 'domain_repository_or_app_live_operator',
      accepted_payload_paths: {
        success_refs_path: {
          required_any_operator_payload_refs: [
            'domain_receipt_refs',
            'owner_chain_refs',
            'no_regression_refs',
          ],
          supplemental_operator_payload_refs: ['evidence_refs'],
          typed_blocker_refs_must_be_absent: true,
          closes_domain_ready: false,
          closes_production_ready: false,
        },
        typed_blocker_path: {
          required_operator_payload_refs: ['typed_blocker_refs'],
          success_claimed: false,
          closes_domain_ready: false,
          closes_production_ready: false,
        },
      },
      required_evidence_refs: [
        'domain_dispatch:medautoscience:sat_payload_handoff:owner_receipt_or_typed_blocker',
      ],
      empty_payload_template_is_success_evidence: false,
      preflight_error_code: 'cli_usage_error',
      preflight_blocked_error_kind: 'domain_dispatch_evidence_payload_preflight_blocked',
      authority_boundary: {
        can_write_domain_truth: false,
        can_generate_domain_owner_receipt: false,
        can_generate_typed_blocker: false,
        can_close_domain_ready: false,
        can_claim_production_ready: false,
      },
    },
    payload_preflight_policy:
      'domain_dispatch_evidence_payload_must_pass_success_refs_or_typed_blocker_path_preflight',
    payload_preflight_error_code: 'cli_usage_error',
    payload_preflight_blocked_error_kind: 'domain_dispatch_evidence_payload_preflight_blocked',
  };
}

test('family-runtime evidence-worklist joins domain-dispatch payload handoff from full operator routes', async () => {
  const actionId = 'domain_dispatch:medautoscience:sat_payload_handoff:record';
  const output = await runFamilyRuntimeEvidenceWorklist(contracts, {
    familyDefaults: true,
    providerKind: 'temporal',
    executorKind: 'codex_cli',
    detailLevel: 'full',
    runtimeSnapshot: {
      runtime_tray_snapshot: {
        runtime_health: {
          provider_kind: 'temporal',
        },
        app_operator_drilldown: {
          app_execution_bridge: {
            safe_action_routes: [domainDispatchBridgeRoute(actionId)],
          },
          operator_action_routing_refs: {
            refs: [domainDispatchOperatorRoute(actionId)],
          },
          domain_evidence_request_refs: {
            external_receipts: [],
            evidence_gate_receipts: [],
          },
          domain_dispatch_evidence: {
            attempts: [],
          },
          default_caller_deletion_evidence_refs: {
            domains: [],
          },
          evidence_envelope: {
            surface_kind: 'opl_evidence_envelope_projection',
            model_version: 'evidence_envelope.v1',
            projection_policy: 'fixture_refs_only_projection',
            source_refs: ['/fixture/evidence_envelope'],
            summary: {
              envelope_count: 1,
              open_envelope_count: 1,
              closed_envelope_count: 0,
              blocked_envelope_count: 0,
              superseded_envelope_count: 0,
              owner_count: 1,
              owners: ['med-autoscience'],
            },
            authority_boundary: {
              refs_only: true,
              can_authorize_domain_ready: false,
              can_claim_production_ready: false,
            },
          },
        },
      },
    } as never,
  });

  const worklist = output.family_runtime_evidence_worklist as unknown as PayloadHandoffWorklist;
  const item = worklist.worklist_items.find((entry: { action_id: string }) =>
    entry.action_id === actionId
  );
  const packetWorkorder = worklist.domain_dispatch_evidence_workorder_packet.workorders.find(
    (entry: { action_id: string }) => entry.action_id === actionId,
  );

  assert.equal(worklist.summary.open_worklist_item_count, 1);
  assert.equal(worklist.summary.open_safe_action_payload_required_item_count, 1);
  assert.ok(item);
  assert.ok(packetWorkorder);
  assert.equal(item.payload_workorder.surface_kind, 'opl_domain_dispatch_evidence_payload_workorder');
  assert.deepEqual(item.payload_workorder, packetWorkorder.payload_workorder);
  assert.deepEqual(item.accepted_payload_paths, packetWorkorder.accepted_payload_paths);
  assert.equal(item.payload_workorder.authority_boundary.can_generate_domain_owner_receipt, false);
  assert.equal(item.payload_workorder.authority_boundary.can_generate_typed_blocker, false);
  assert.equal(item.payload_workorder.authority_boundary.can_close_domain_ready, false);
  assert.equal(item.payload_workorder.authority_boundary.can_claim_production_ready, false);
  assert.deepEqual(item.required_operator_payload_refs, [
    'domain_receipt_refs',
    'owner_chain_refs',
    'no_regression_refs',
    'typed_blocker_refs',
  ]);
  assert.deepEqual(item.supplemental_operator_payload_refs, ['evidence_refs']);
  assert.equal(
    item.payload_preflight_policy,
    'domain_dispatch_evidence_payload_must_pass_success_refs_or_typed_blocker_path_preflight',
  );
  assert.equal(
    item.payload_preflight_blocked_error_kind,
    'domain_dispatch_evidence_payload_preflight_blocked',
  );
  assert.equal(
    item.identity_binding_policy,
    'record_payload_identity_must_not_conflict_with_stage_attempt_target_identity',
  );
  assert.equal(item.identity_binding_guidance.authority_boundary.can_generate_domain_owner_receipt, false);
  assert.equal(item.worklist_item_is_completion_claim, false);
  assert.equal(item.evidence_requirement.can_claim_domain_ready, false);
  assert.equal(item.evidence_requirement.can_claim_production_ready, false);
  assert.equal(worklist.authority_boundary.can_write_domain_truth, false);
});

test('family-runtime evidence-worklist summary next actions carry domain-dispatch payload handoff', async () => {
  const actionId = 'domain_dispatch:medautoscience:sat_payload_handoff:record';
  const output = await runFamilyRuntimeEvidenceWorklist(contracts, {
    familyDefaults: true,
    providerKind: 'temporal',
    executorKind: 'codex_cli',
    runtimeSnapshot: {
      runtime_tray_snapshot: {
        runtime_health: {
          provider_kind: 'temporal',
        },
        app_operator_drilldown: {
          app_execution_bridge: {
            safe_action_routes: [domainDispatchBridgeRoute(actionId)],
          },
          operator_action_routing_refs: {
            refs: [domainDispatchOperatorRoute(actionId)],
          },
          domain_evidence_request_refs: {
            external_receipts: [],
            evidence_gate_receipts: [],
          },
          domain_dispatch_evidence: {
            attempts: [],
          },
          default_caller_deletion_evidence_refs: {
            domains: [],
          },
          evidence_envelope: {
            surface_kind: 'opl_evidence_envelope_projection',
            model_version: 'evidence_envelope.v1',
            projection_policy: 'fixture_refs_only_projection',
            source_refs: ['/fixture/evidence_envelope'],
            summary: {
              envelope_count: 1,
              open_envelope_count: 1,
              closed_envelope_count: 0,
              blocked_envelope_count: 0,
              superseded_envelope_count: 0,
              owner_count: 1,
              owners: ['med-autoscience'],
            },
            authority_boundary: {
              refs_only: true,
              can_authorize_domain_ready: false,
              can_claim_production_ready: false,
            },
          },
        },
      },
    } as never,
  });

  const worklist = output.family_runtime_evidence_worklist as unknown as PayloadHandoffWorklist;
  const action = worklist.next_safe_actions?.find((entry) => entry.action_id === actionId);

  assert.equal(worklist.summary.open_worklist_item_count, 1);
  assert.ok(action);
  assert.equal(action.payload_workorder.surface_kind, 'opl_domain_dispatch_evidence_payload_workorder');
  assert.equal(action.payload_workorder.authority_boundary.can_generate_domain_owner_receipt, false);
  assert.equal(action.payload_workorder.authority_boundary.can_generate_typed_blocker, false);
  assert.equal(action.payload_workorder.authority_boundary.can_close_domain_ready, false);
  assert.equal(action.payload_workorder.authority_boundary.can_claim_production_ready, false);
  assert.deepEqual(action.required_operator_payload_refs, [
    'domain_receipt_refs',
    'owner_chain_refs',
    'no_regression_refs',
    'typed_blocker_refs',
  ]);
  assert.deepEqual(action.supplemental_operator_payload_refs, ['evidence_refs']);
  assert.equal(
    action.payload_preflight_policy,
    'domain_dispatch_evidence_payload_must_pass_success_refs_or_typed_blocker_path_preflight',
  );
  assert.equal(
    action.payload_preflight_blocked_error_kind,
    'domain_dispatch_evidence_payload_preflight_blocked',
  );
  assert.equal(
    action.identity_binding_policy,
    'record_payload_identity_must_not_conflict_with_stage_attempt_target_identity',
  );
  assert.equal(action.identity_binding_guidance.authority_boundary.can_generate_domain_owner_receipt, false);
  assert.equal(action.worklist_item_is_completion_claim, false);
});
