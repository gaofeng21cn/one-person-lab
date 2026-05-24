import {
  assert,
  test,
} from '../helpers.ts';
import { runFamilyRuntimeEvidenceWorklist } from '../../../../src/family-runtime-evidence-worklist.ts';
import type { FrameworkContracts } from '../../../../src/types.ts';

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
  });

  const worklist = output.family_runtime_evidence_worklist;
  assert.equal(worklist.summary.open_worklist_item_count, 0);
  assert.equal(worklist.evidence_envelope.summary.blocked_envelope_count, 2);
  assert.equal(worklist.summary.zero_open_worklist_is_completion_claim, false);
  assert.equal(worklist.summary.zero_open_worklist_is_domain_ready, false);
  assert.equal(worklist.summary.zero_open_worklist_is_production_ready, false);
  assert.equal(worklist.summary.zero_open_worklist_blocked_refs_only_envelope_count, 2);
  assert.equal(worklist.summary.zero_open_worklist_blocked_refs_only_attention_remains, true);
  assert.equal(worklist.zero_open_worklist_guard.status, 'blocked_refs_only_attention_remains');
  assert.equal(worklist.zero_open_worklist_guard.worklist_item_is_completion_claim, false);
  assert.equal(worklist.zero_open_worklist_guard.can_authorize_domain_ready, false);
  assert.equal(worklist.zero_open_worklist_guard.can_claim_production_ready, false);
});
