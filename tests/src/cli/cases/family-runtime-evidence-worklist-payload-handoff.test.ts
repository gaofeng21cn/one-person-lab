import {
  assert,
  fs,
  os,
  path,
  test,
} from '../helpers.ts';
import { runExternalEvidenceApply } from '../../../../src/external-evidence-ledger.ts';
import { runFamilyRuntimeEvidenceWorklist } from '../../../../src/family-runtime-evidence-worklist.ts';
import type { FrameworkContracts } from '../../../../src/types.ts';
import {
  assertCurrentOwnerDeltaReadModel,
  assertCurrentOwnerDeltaToplineNextAction,
} from './owner-payload-workorder-assertions.ts';

type JsonRecord = Record<string, unknown>;

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
  current_owner_delta?: JsonRecord;
  current_owner_delta_read_model?: JsonRecord;
  operator_next_owner?: string;
  operator_required_delta?: string;
  operator_payload_requirement?: string;
  operator_accepted_answer_shape?: string[];
  operator_next_action?: JsonRecord;
  operator_next_missing_input_refs?: string[];
  stage_run_next_missing_input_refs?: string[];
  stage_run_next_required_ref_shape?: JsonRecord;
  stage_run_cockpit_summary?: JsonRecord;
  next_safe_actions?: PayloadHandoffAction[];
  audit_worklist_next_safe_actions?: PayloadHandoffAction[];
  worklist_items: Array<{
    action_id: string;
    status: string;
    worklist_status_detail: string;
    typed_blocker_refs: string[];
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
      status: string;
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
  action_kind: string;
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
          attention_first_payload: {
            owner_delta_first: {
              surface_kind: 'opl_owner_delta_first_projection',
              status: 'owner_delta_required',
              domain_id: 'medautoscience',
              next_owner: 'med-autoscience',
              next_required_delta:
                'domain_app_or_live_refs_payload_required_to_record_domain_dispatch_owner_receipt_or_typed_blocker',
              required_return_shapes: [
                'domain_owner_receipt_ref',
                'typed_blocker_ref',
                'domain_typed_blocker_ref',
                'owner_chain_ref',
                'no_regression_ref',
              ],
              primary_item: {
                stage_id: 'domain_owner/default-executor-dispatch',
                stage_attempt_id: 'sat_payload_handoff',
                owner: 'med-autoscience',
                status:
                  'domain_app_or_live_refs_payload_required_to_record_domain_dispatch_owner_receipt_or_typed_blocker',
              },
            },
          },
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

test('family-runtime evidence-worklist closes domain-dispatch payload workorder after verified typed blocker', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-domain-dispatch-verified-blocker-'));
  const previousStateDir = process.env.OPL_STATE_DIR;
  const actionId = 'domain_dispatch:medautoscience:sat_payload_handoff:record';
  try {
    process.env.OPL_STATE_DIR = stateRoot;
    const recorded = runExternalEvidenceApply({
      mode: 'record',
      domain_id: 'medautoscience',
      request_id: 'domain_dispatch:medautoscience:sat_payload_handoff',
      request_pack_id: 'medautoscience.domain_dispatch_evidence',
      source_ref: '/stage_attempt_workbench/attempts/sat_payload_handoff/domain_dispatch_evidence',
      typed_blocker_refs: ['mas://typed-blocker/default-executor-stale-owner-route'],
    });
    assert.equal(recorded.external_evidence_apply.status, 'recorded');
    const verified = runExternalEvidenceApply({
      mode: 'verify',
      domain_id: 'medautoscience',
      request_id: 'domain_dispatch:medautoscience:sat_payload_handoff',
      request_pack_id: 'medautoscience.domain_dispatch_evidence',
      source_ref: '/stage_attempt_workbench/attempts/sat_payload_handoff/domain_dispatch_evidence',
    });
    assert.equal(verified.external_evidence_apply.status, 'verified');

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

    assert.ok(item);
    assert.equal(worklist.summary.open_worklist_item_count, 0);
    assert.equal(worklist.summary.open_safe_action_payload_required_item_count, 0);
    assert.equal(worklist.domain_dispatch_evidence_workorder_packet.workorders.length, 0);
    assert.equal(item.status, 'closed_by_domain_owned_typed_blocker');
    assert.equal(item.worklist_status_detail, 'closed_by_domain_owned_typed_blocker_ref');
    assert.deepEqual(item.typed_blocker_refs, ['mas://typed-blocker/default-executor-stale-owner-route']);
    assert.equal(item.evidence_requirement.status, 'domain_owned_typed_blocker');
    assert.equal(item.evidence_requirement.can_claim_domain_ready, false);
    assert.equal(item.evidence_requirement.can_claim_production_ready, false);
  } finally {
    if (previousStateDir === undefined) {
      delete process.env.OPL_STATE_DIR;
    } else {
      process.env.OPL_STATE_DIR = previousStateDir;
    }
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
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
          attention_first_payload: {
            owner_delta_first: {
              surface_kind: 'opl_owner_delta_first_projection',
              status: 'owner_delta_required',
              domain_id: 'medautoscience',
              next_owner: 'med-autoscience',
              next_required_delta:
                'domain_app_or_live_refs_payload_required_to_record_domain_dispatch_owner_receipt_or_typed_blocker',
              required_return_shapes: [
                'domain_owner_receipt_ref',
                'typed_blocker_ref',
                'domain_typed_blocker_ref',
                'owner_chain_ref',
                'no_regression_ref',
              ],
              primary_item: {
                stage_id: 'domain_owner/default-executor-dispatch',
                stage_attempt_id: 'sat_payload_handoff',
                owner: 'med-autoscience',
                status:
                  'domain_app_or_live_refs_payload_required_to_record_domain_dispatch_owner_receipt_or_typed_blocker',
              },
            },
          },
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
  const action = worklist.audit_worklist_next_safe_actions?.find((entry) =>
    entry.action_id === actionId
  );

  assert.equal(worklist.summary.open_worklist_item_count, 1);
  assert.equal(
    worklist.next_safe_actions?.[0]?.action_kind,
    'current_owner_delta_owner_answer_or_typed_blocker_required',
  );
  assertCurrentOwnerDeltaReadModel(worklist.current_owner_delta_read_model as JsonRecord, {
    currentOwner: 'med-autoscience',
    openSafeActionCount: 1,
    payloadRequiredCount: 1,
    domainDispatchWorkorderCount: 1,
    fullDetailRefKeys: [
      'evidence_worklist_ref',
      'app_operator_drilldown_ref',
    ],
  });
  assert.deepEqual(
    worklist.current_owner_delta,
    worklist.current_owner_delta_read_model?.current_owner_delta,
  );
  assert.equal(worklist.operator_next_owner, 'med-autoscience');
  assertCurrentOwnerDeltaToplineNextAction(worklist as JsonRecord);
  assert.equal(
    worklist.operator_required_delta,
    worklist.current_owner_delta?.desired_delta_description,
  );
  assert.equal(
    worklist.operator_payload_requirement,
    worklist.current_owner_delta?.payload_requirement,
  );
  assert.deepEqual(
    worklist.operator_accepted_answer_shape,
    worklist.current_owner_delta?.accepted_answer_shape,
  );
  assert.equal(
    worklist.stage_run_cockpit_summary?.current_owner,
    'med-autoscience',
  );
  assert.equal(
    worklist.stage_run_cockpit_summary?.current_owner_delta_owner,
    worklist.current_owner_delta?.current_owner,
  );
  assert.equal(worklist.stage_run_cockpit_summary?.refs_only, true);
  assert.equal(
    worklist.stage_run_cockpit_summary?.next_required_owner,
    'med-autoscience',
  );
  assert.equal(
    worklist.stage_run_cockpit_summary?.next_required_action,
    worklist.current_owner_delta?.desired_delta_description,
  );
  assert.equal(
    worklist.stage_run_next_missing_input_refs?.includes('provider_attempt_ref'),
    false,
  );
  assert.equal(
    worklist.stage_run_next_missing_input_refs?.includes('attempt_lease_ref'),
    false,
  );
  assert.equal(
    worklist.stage_run_next_missing_input_refs?.includes('execution_authorization_decision_ref'),
    false,
  );
  assert.equal(
    worklist.stage_run_next_missing_input_refs?.includes('owner_answer_ref'),
    true,
  );
  assert.deepEqual(
    worklist.operator_next_missing_input_refs,
    worklist.stage_run_next_missing_input_refs,
  );
  assert.deepEqual(
    worklist.operator_next_action?.missing_input_refs,
    worklist.stage_run_next_missing_input_refs,
  );
  assert.deepEqual(
    worklist.operator_next_action?.required_ref_shape,
    worklist.stage_run_next_required_ref_shape,
  );
  assert.equal(
    worklist.operator_next_action?.stage_run_closeout_binding_policy,
    'domain_owner_answer_must_bind_stage_run_manifest_current_pointer_source_fingerprint_and_idempotency',
  );
  assert.equal(
    worklist.operator_next_stage_run_closeout_binding_ref,
    '/stage_run_cockpit/execution_authorization',
  );
  assert.equal(
    worklist.operator_next_stage_run_closeout_binding_policy,
    'domain_owner_answer_must_bind_stage_run_manifest_current_pointer_source_fingerprint_and_idempotency',
  );
  const acceptedReturnShapes =
    (worklist.current_owner_delta_read_model as JsonRecord)
      .accepted_return_shapes as unknown[];
  assert.equal(
    acceptedReturnShapes.includes('domain_owner_receipt_ref'),
    true,
  );
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
