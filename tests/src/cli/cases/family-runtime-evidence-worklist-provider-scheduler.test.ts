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
  MINIMAL_BRAND_SYSTEM_PROFILE_CONTRACT,
  MINIMAL_TARGET_OPERATING_ARCHITECTURE_CONTRACT,
} from './agent-workspace-norm-fixture.ts';

const minimalContracts = {
  contractsDir: '/tmp/opl-scheduler-guard-worklist-contracts',
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
  brandSystemProfile: MINIMAL_BRAND_SYSTEM_PROFILE_CONTRACT,
  targetOperatingArchitecture: MINIMAL_TARGET_OPERATING_ARCHITECTURE_CONTRACT,
} as FrameworkContracts;

function schedulerRoute(action: string, actionKind: string) {
  return {
    action_id: `provider-scheduler:temporal:${action}`,
    action_kind: actionKind,
    owner: 'opl',
    route_target_kind: 'opl_cli',
    execution_surface: 'opl runtime action execute',
    action_ref: `opl family-runtime scheduler ${action} --provider temporal`,
    opl_cli_args: ['scheduler', action, '--provider', 'temporal'],
    provider_kind: 'temporal',
    route_status: action === 'status'
      ? 'diagnostic_only'
      : 'blocked_by_provider_worker_mutation_guard',
    route_status_detail: action === 'status'
      ? 'Provider scheduler status is a read-only diagnostic query.'
      : 'Run the managed runtime/current OPL CLI, set OPL_STATE_DIR for an isolated developer worker, or explicitly set OPL_ALLOW_DEVELOPER_CHECKOUT_SHARED_WORKER=1.',
    default_actionable: false,
    default_actionability_status: action === 'status'
      ? 'diagnostic_only_not_operator_actionable'
      : 'blocked_by_provider_worker_mutation_guard',
    can_submit_to_safe_action_shell: action === 'status',
  };
}

test('family-runtime evidence-worklist keeps provider scheduler diagnostics and worker-guarded mutations out of open attention', async () => {
  const output = await runFamilyRuntimeEvidenceWorklist(minimalContracts, {
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
          summary: {},
          app_execution_bridge: {
            safe_action_routes: [
              schedulerRoute('status', 'provider_scheduler_status'),
              schedulerRoute('install', 'provider_scheduler_install'),
              schedulerRoute('trigger', 'provider_scheduler_trigger'),
              schedulerRoute('tick', 'provider_scheduler_tick'),
            ],
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
            summary: {
              envelope_count: 0,
              open_envelope_count: 0,
              closed_envelope_count: 0,
              blocked_envelope_count: 0,
            },
          },
        },
      },
    } as never,
  });
  const fullWorklist = output.family_runtime_evidence_worklist as Record<string, any>;
  const providerItems = fullWorklist.worklist_items.filter((item: { claim_scope: string }) =>
    item.claim_scope === 'provider_scheduler_cadence'
  );

  assert.equal(providerItems.length, 4);
  assert.equal(fullWorklist.summary.open_worklist_item_count, 0);
  assert.equal(
    fullWorklist.attention_queue.some((item: { claim_scope: string }) =>
      item.claim_scope === 'provider_scheduler_cadence'
    ),
    false,
  );
  assert.equal(
    fullWorklist.next_action_ledger.next_action_items.some(
      (item: { evidence_requirement: { claim_scope: string } }) =>
        item.evidence_requirement.claim_scope === 'provider_scheduler_cadence',
    ),
    false,
  );

  const statusItem = providerItems.find(
    (item: { action_kind: string }) => item.action_kind === 'provider_scheduler_status',
  );
  assert.ok(statusItem);
  assert.equal(statusItem.status, 'diagnostic_only');
  assert.equal(statusItem.evidence_requirement.status, 'closed');
  assert.equal(statusItem.worklist_status_detail, 'diagnostic_only_not_operator_actionable');

  const mutationItems = providerItems.filter(
    (item: { action_kind: string }) => item.action_kind !== 'provider_scheduler_status',
  );
  assert.equal(mutationItems.length, 3);
  assert.equal(
    mutationItems.every((item: {
      status: string;
      route_status: string;
      evidence_requirement: { status: string };
      worklist_status_detail: string;
    }) =>
      item.status === 'blocked_by_provider_worker_mutation_guard'
      && item.route_status === 'blocked_by_provider_worker_mutation_guard'
      && item.evidence_requirement.status === 'blocked'
      && item.worklist_status_detail === 'blocked_by_provider_worker_mutation_guard'
    ),
    true,
  );
});
