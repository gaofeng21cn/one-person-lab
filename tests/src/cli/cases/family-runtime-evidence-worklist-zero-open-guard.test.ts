import {
  assert,
  test,
} from '../helpers.ts';
import { runFamilyRuntimeEvidenceWorklist } from '../../../../src/family-runtime-evidence-worklist.ts';
import type { FrameworkContracts } from '../../../../src/types.ts';
import {
  MINIMAL_AGENT_WORKSPACE_NORM_CONTRACT,
  MINIMAL_BRAND_CLI_GOVERNANCE_CONTRACT,
  MINIMAL_BRAND_MODULE_L5_OPERATING_EVIDENCE_CONTRACT,
  MINIMAL_BRAND_MODULE_REGISTRY_CONTRACT,
  MINIMAL_BRAND_MODULE_SURFACES_CONTRACT,
} from './agent-workspace-norm-fixture.ts';

const contracts = {
  contractsDir: '/tmp/opl-zero-open-guard-contracts',
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
  agentWorkspaceNorm: MINIMAL_AGENT_WORKSPACE_NORM_CONTRACT,
  brandModuleRegistry: MINIMAL_BRAND_MODULE_REGISTRY_CONTRACT,
  brandCliGovernance: MINIMAL_BRAND_CLI_GOVERNANCE_CONTRACT,
  brandModuleSurfaces: MINIMAL_BRAND_MODULE_SURFACES_CONTRACT,
  brandModuleL5OperatingEvidence: MINIMAL_BRAND_MODULE_L5_OPERATING_EVIDENCE_CONTRACT,
} as FrameworkContracts;

test('family-runtime evidence-worklist states zero open worklist items do not close blocked refs-only envelopes', async () => {
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
            safe_action_routes: [],
          },
          operator_action_routing_refs: {
            refs: [],
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
              envelope_count: 2,
              open_envelope_count: 0,
              closed_envelope_count: 0,
              blocked_envelope_count: 2,
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
    stageReadiness: {
      domains: [],
    },
  });

  const worklist = output.family_runtime_evidence_worklist;
  assert.equal(worklist.summary.open_worklist_item_count, 0);
  assert.equal(worklist.evidence_envelope.summary.blocked_envelope_count, 2);
  assert.equal(worklist.summary.zero_open_worklist_is_completion_claim, false);
  assert.equal(worklist.summary.zero_open_worklist_is_domain_ready, false);
  assert.equal(worklist.summary.zero_open_worklist_is_production_ready, false);
  assert.equal(worklist.summary.zero_open_worklist_blocked_refs_only_envelope_count, 2);
  assert.equal(worklist.summary.zero_open_worklist_blocked_refs_only_attention_remains, true);
  assert.equal(
    worklist.progress_first_operator_summary.surface_kind,
    'opl_progress_first_operator_summary',
  );
  assert.equal(
    worklist.progress_first_operator_summary.status,
    'domain_or_human_owner_blocked_refs_only',
  );
  assert.equal(
    worklist.progress_first_operator_summary.progress_delta_classification,
    'blocked_refs_only_attention',
  );
  assert.equal(worklist.progress_first_operator_summary.deliverable_progress_delta, null);
  assert.equal(worklist.progress_first_operator_summary.platform_repair_delta, null);
  assert.equal(
    worklist.progress_first_operator_summary.next_forced_delta,
    'domain_or_app_owner_payload_ref_or_typed_blocker_required',
  );
  assert.equal(worklist.progress_first_operator_summary.open_safe_action_count, 0);
  assert.equal(worklist.progress_first_operator_summary.blocked_refs_only_envelope_count, 2);
  assert.equal(worklist.progress_first_operator_summary.domain_or_human_owner_blocked_count, 2);
  assert.equal(worklist.progress_first_operator_summary.zero_open_worklist_is_completion_claim, false);
  assert.equal(worklist.progress_first_operator_summary.zero_open_worklist_is_domain_ready, false);
  assert.equal(worklist.progress_first_operator_summary.zero_open_worklist_is_production_ready, false);
  assert.equal(
    worklist.progress_first_operator_summary.authority_boundary.deliverable_progress_delta_owner,
    'domain_agent',
  );
  assert.equal(worklist.zero_open_worklist_guard.status, 'blocked_refs_only_attention_remains');
  assert.equal(worklist.zero_open_worklist_guard.worklist_item_is_completion_claim, false);
  assert.equal(worklist.zero_open_worklist_guard.can_authorize_domain_ready, false);
  assert.equal(worklist.zero_open_worklist_guard.can_claim_production_ready, false);
});

test('family-runtime evidence-worklist excludes non-ordinary lanes from default open owner delta', async () => {
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
            safe_action_routes: [{
              action_id: 'diagnostic-open-drift',
              action_kind: 'progress_first_attempt_supervision',
              owner: 'opl',
              route_status: 'request_route_available',
              default_actionability_status: 'request_route_available',
              can_submit_to_safe_action_shell: true,
              default_actionable: true,
            }, {
              action_id: 'cleanup-open-drift',
              action_kind: 'legacy_cleanup_apply',
              owner: 'opl',
              route_status: 'request_route_available',
              default_actionability_status: 'request_route_available',
              can_submit_to_safe_action_shell: true,
              default_actionable: true,
            }],
          },
          operator_action_routing_refs: {
            refs: [],
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
            summary: {
              blocked_envelope_count: 0,
              open_envelope_count: 0,
            },
          },
        },
      },
    } as never,
    stageReadiness: {
      domains: [],
    },
  });

  const worklist = output.family_runtime_evidence_worklist;
  if (!('worklist_items' in worklist) || !('attention_queue' in worklist)) {
    throw new Error('expected full evidence worklist payload');
  }
  const items = worklist.worklist_items as Array<Record<string, any>>;
  const diagnostic = items.find((item) => item.action_id === 'diagnostic-open-drift');
  const cleanup = items.find((item) => item.action_id === 'cleanup-open-drift');
  assert.equal(diagnostic?.worklist_lane, 'diagnostic');
  assert.equal(diagnostic?.default_owner_delta_eligible, false);
  assert.equal(cleanup?.worklist_lane, 'cleanup');
  assert.equal(cleanup?.default_owner_delta_eligible, false);
  assert.equal(worklist.summary.open_worklist_item_count, 0);
  assert.equal(worklist.open_worklist_item_count, 0);
  assert.equal(worklist.next_safe_actions.length, 0);
  assert.equal(worklist.attention_queue.length, 0);
  assert.equal(worklist.current_owner_delta_read_model.next_safe_action_or_none, null);
  assert.equal(worklist.zero_open_worklist_guard.zero_open_worklist_item_count, true);
  assert.equal(worklist.zero_open_worklist_guard.zero_open_worklist_is_completion_claim, false);
});
