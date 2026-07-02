import { spawnSync } from 'node:child_process';

import {
  assert,
  fs,
  loadFamilyManifestFixtures,
  path,
  repoRoot,
} from '../helpers.ts';
import {
  STANDARD_PROGRESS_DELTA_POLICY,
  STANDARD_TYPED_BLOCKER_LINEAGE_POLICY,
} from '../../../../src/modules/foundry-lab/standard-domain-agent-scaffold-constants.ts';
import { writeFakeOmaGeneratedSurfacePack } from '../../cli-codex-default-shell-helpers.ts';

export function insertProviderProof(stateRoot: string) {
  const queueDb = path.join(stateRoot, 'family-runtime', 'queue.sqlite');
  const result = spawnSync(process.execPath, [
    '--experimental-strip-types',
    '-e',
    `import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync(${JSON.stringify(queueDb)});
db.prepare("INSERT INTO events(event_id, task_id, domain_id, event_type, source, payload_json, created_at) VALUES (?, NULL, NULL, ?, ?, ?, ?)")
  .run(
    'evt_app_drilldown_provider_proof',
    'temporal_residency_proof',
    'test',
    JSON.stringify({
      provider_kind: 'temporal',
      proof_mode: 'external_temporal_service_worker',
      closeout_status: 'production_residency_proven',
      proof_receipt: {
        receipt_kind: 'temporal_production_residency_proof',
        receipt_status: 'proven',
        provider_kind: 'temporal'
      }
    }),
    ${JSON.stringify(new Date().toISOString())}
  );
db.close();`,
  ], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      NODE_NO_WARNINGS: '1',
    },
  });
  assert.equal(result.status, 0, result.stderr);
}

function writeJson(file: string, payload: unknown) {
  fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`);
}

export function createOmaContractFixture(
  fixtureRoot: string,
  options: { productionAcceptance?: boolean } = {},
) {
  const repoDir = path.join(fixtureRoot, 'opl-meta-agent');
  const contractsDir = path.join(repoDir, 'contracts');
  const productionAcceptanceDir = path.join(contractsDir, 'production_acceptance');
  fs.mkdirSync(contractsDir, { recursive: true });
  writeFakeOmaGeneratedSurfacePack(repoDir);
  writeJson(path.join(contractsDir, 'opl_domain_manifest_registration.json'), {
    surface_kind: 'opl_domain_manifest_registration',
    owner: 'opl-meta-agent',
    registry_owner: 'one-person-lab',
    domain_id: 'opl-meta-agent',
    domain_manifest: {
      domain_label: 'OPL Meta Agent',
      domain_descriptor_ref: 'contracts/domain_descriptor.json',
      stage_control_plane_ref: 'contracts/stage_control_plane.json',
      action_catalog_ref: 'contracts/action_catalog.json',
      pack_compiler_input_ref: 'contracts/pack_compiler_input.json',
      generated_surface_handoff_ref: 'contracts/generated_surface_handoff.json',
    },
    discovery_receipt: {
      status: 'ready_for_opl_registry_consumption',
      receipt_ref: 'discovery-receipt:opl-meta-agent/test-fixture',
    },
  });
  writeJson(path.join(contractsDir, 'app_workbench_projection.json'), {
    surface_kind: 'opl_app_workbench_projection_contract',
    domain_id: 'opl-meta-agent',
    workbench_sections: [
      { section_id: 'target_brief', projection_fields: ['domain_descriptor_ref'], write_boundary: 'display_refs_only' },
      { section_id: 'candidate_package', projection_fields: ['candidate_agent_package_ref'], write_boundary: 'display_refs_only' },
      { section_id: 'agent_lab_results', projection_fields: ['scaleout_evidence_ref'], write_boundary: 'display_refs_only' },
      { section_id: 'developer_work_order', projection_fields: ['developer_patch_work_order_ref'], write_boundary: 'display_refs_only' },
      { section_id: 'mechanism_patch_proposal', projection_fields: ['mechanism_patch_proposal_ref'], write_boundary: 'display_refs_only' },
      { section_id: 'scaleout_evidence', projection_fields: ['real_target_agent_scaleout_evidence_ref'], write_boundary: 'display_refs_only' },
      {
        section_id: 'trajectory_learning',
        projection_fields: [
          'trajectory_learning_contract_ref',
          'failure_evidence_ref',
          'root_cause_ref',
          'targeted_fix_ref',
          'predicted_impact_ref',
          'next_run_falsification_ref',
          'owner_receipt_or_typed_blocker_ref',
          'agent_lab_re_evaluation_ref',
          'patch_absorption_ref',
        ],
        write_boundary: 'display_refs_only',
      },
    ],
    source_refs: {
      trajectory_learning_contract_ref: 'contracts/trajectory_learning_contract.json',
    },
    drilldown_readiness_receipt: {
      status: 'ready_for_app_consumption_refs_only',
      live_rendering_status: 'not_claimed_by_contract',
      receipt_ref: 'oma-app-drilldown:fixture/ready',
      receipt_ref_fields: [
        'developer_patch_work_order_owner_receipt_ref',
        'trajectory_atomization_receipt_ref',
      ],
      blocker_ref_fields: [
        'owner_review_receipt_or_typed_blocker_ref',
      ],
    },
  });
  writeJson(path.join(contractsDir, 'real_target_agent_scaleout_evidence.json'), {
    surface_kind: 'real_target_agent_scaleout_evidence_contract',
    domain_id: 'opl-meta-agent',
    evidence_status: 'multi_target_scaleout_closed_by_refs_only_receipts',
    multi_target_scaleout_closeout: {
      status: 'closed_by_two_real_target_refs_only_receipts',
      target_agents: [
        {
          domain_id: 'med-autoscience',
          target_agent_owner_receipt_refs: [
            'owner-receipt:oma-fixture/med-autoscience',
          ],
          typed_blocker_refs: [],
          agent_lab_result_refs: ['agent-lab:oma-fixture/med-autoscience'],
          no_forbidden_write_proof_refs: ['no-forbidden-write:oma-fixture/med-autoscience'],
          cleanup_closeout_refs: ['cleanup:oma-fixture/med-autoscience'],
          failure_evidence_refs: ['failure-evidence:oma-fixture/med-autoscience'],
          root_cause_refs: ['root-cause:oma-fixture/med-autoscience'],
          targeted_fix_refs: ['targeted-fix:oma-fixture/med-autoscience'],
          predicted_impact_refs: ['predicted-impact:oma-fixture/med-autoscience'],
          next_run_falsification_refs: ['next-run-falsification:oma-fixture/med-autoscience'],
        },
        {
          domain_id: 'med-autogrant',
          target_agent_owner_receipt_refs: [],
          typed_blocker_refs: [
            'typed-blocker:oma-fixture/med-autogrant',
          ],
          agent_lab_result_refs: ['agent-lab:oma-fixture/med-autogrant'],
          no_forbidden_write_proof_refs: ['no-forbidden-write:oma-fixture/med-autogrant'],
          cleanup_closeout_refs: ['cleanup:oma-fixture/med-autogrant'],
          failure_evidence_refs: ['failure-evidence:oma-fixture/med-autogrant'],
          root_cause_refs: ['root-cause:oma-fixture/med-autogrant'],
          targeted_fix_refs: ['targeted-fix:oma-fixture/med-autogrant'],
          predicted_impact_refs: ['predicted-impact:oma-fixture/med-autogrant'],
          next_run_falsification_refs: ['next-run-falsification:oma-fixture/med-autogrant'],
        },
      ],
    },
  });
  if (options.productionAcceptance) {
    fs.mkdirSync(productionAcceptanceDir, { recursive: true });
    writeJson(path.join(productionAcceptanceDir, 'meta-agent-production-acceptance.json'), {
      surface_kind: 'opl_meta_agent_production_acceptance_evidence',
      schema_version: 1,
      domain_id: 'opl-meta-agent',
      owner: 'opl-meta-agent',
      evidence_status: 'closed_by_domain_owned_acceptance_receipt',
      receipt_ref: 'production-acceptance-receipt:opl-meta-agent/fixture',
      refs: {
        production_consumption_receipt_refs: [
          'opl://oma-production-consumption/fixture-long-soak',
        ],
        long_soak_refs: [
          'long_soak_ref://opl-meta-agent/production-consumption/fixture-window',
        ],
        historical_typed_blocker_refs: [
          'typed_blocker_ref://opl-meta-agent/production-consumption/long-soak-pending-fixture',
        ],
      },
      stage_replay_human_gate_blocker_summary: {
        surface_kind: 'opl_meta_agent_stage_replay_human_gate_blocker_summary',
        owner: 'opl-meta-agent',
        role: 'domain_owned_body_free_typed_blocker_for_stage_replay_missing_receipt',
        target_identity: {
          domain_id: 'opl-meta-agent',
          stage_id: 'stage-decomposition',
          missing_ref: 'human_gate:oma_baseline_owner_review',
        },
        missing_ref_kind: 'human_gate_ref',
        payload_path: 'typed_blocker_path',
        typed_blocker_refs: [
          'oma-typed-blocker:stage-replay-human-gate:stage-decomposition:oma_baseline_owner_review/baseline-owner-review-receipt-pending',
        ],
        source_ref:
          'contracts/production_acceptance/meta-agent-production-acceptance.json#/stage_replay_human_gate_blocker_summary',
        success_claimed: false,
        human_gate_approval_claimed: false,
        domain_ready_claimed: false,
        production_ready_claimed: false,
        authority_boundary: {
          refs_only: true,
          can_requery_human: false,
          can_write_owner_receipt: false,
          can_write_target_domain_truth: false,
          can_promote_default_agent_without_gate: false,
          can_close_replay_success_path: false,
        },
      },
      production_consumption_followthrough: {
        status: 'production_consumption_refs_projected',
        production_consumption_ready: true,
        production_consumption_ready_semantics:
          'refs_only_current_cohort_consumption_gate_ready_not_production_readiness_verdict',
        production_readiness_verdict_claimed: false,
        long_soak_refs: [
          'long_soak_ref://opl-meta-agent/production-consumption/fixture-window',
        ],
        verified_receipt_refs: [
          'opl://oma-production-consumption/fixture-long-soak',
        ],
        historical_typed_blocker_refs: [
          'typed_blocker_ref://opl-meta-agent/production-consumption/long-soak-pending-fixture',
        ],
        authority_boundary: {
          refs_only: true,
          can_claim_domain_ready: false,
          can_claim_production_ready: false,
          can_close_long_soak_gate: false,
          can_write_opl_runtime_state: false,
          can_promote_default_agent_without_gate: false,
        },
      },
    });
  }
  return repoDir;
}

export function createFamilyWorkspaceFixture(
  fixtureRoot: string,
  options: { omaProductionAcceptance?: boolean } = {},
) {
  const domainDescriptors = [
    {
      project: 'med-autoscience',
      domain_id: 'med-autoscience',
      domain_label: 'MedAutoScience',
    },
    {
      project: 'med-autogrant',
      domain_id: 'med-autogrant',
      domain_label: 'MedAutoGrant',
    },
    {
      project: 'redcube-ai',
      domain_id: 'redcube_ai',
      domain_label: 'RedCube AI',
    },
  ];
  for (const descriptor of domainDescriptors) {
    fs.mkdirSync(path.join(fixtureRoot, descriptor.project, 'contracts'), { recursive: true });
    writeJson(
      path.join(fixtureRoot, descriptor.project, 'contracts', 'domain_descriptor.json'),
      {
        surface_kind: 'family_domain_descriptor',
        domain_id: descriptor.domain_id,
        domain_label: descriptor.domain_label,
      },
    );
  }
  const omaRepoDir = createOmaContractFixture(fixtureRoot, {
    productionAcceptance: options.omaProductionAcceptance,
  });
  return {
    workspaceRoot: fixtureRoot,
    omaRepoDir,
  };
}

export function assertMasLifecycleDrilldownProjection(drilldown: any) {
  assert.equal(drilldown.authority_boundary.can_write_domain_truth, false);
  assert.equal(drilldown.authority_boundary.can_read_memory_body, false);
  assert.equal(drilldown.authority_boundary.can_read_artifact_body, false);
  assert.equal(drilldown.summary.owner_receipt_ref_count, 4);
  assert.equal(drilldown.summary.typed_blocker_count, 3);
  assert.equal(drilldown.summary.domain_dispatch_evidence_domain_count, 1);
  assert.equal(drilldown.summary.domain_dispatch_evidence_attempt_count, 1);
  assert.equal(drilldown.summary.domain_dispatch_evidence_owner_receipt_ref_count, 3);
  assert.equal(drilldown.summary.domain_dispatch_evidence_typed_blocker_ref_count, 2);
  assert.equal(drilldown.summary.domain_dispatch_evidence_no_regression_ref_count, 1);
  assert.equal(drilldown.summary.domain_dispatch_evidence_memory_writeback_ref_count, 1);
  assert.equal(drilldown.summary.domain_dispatch_evidence_domain_ready_claim_count, 0);
  assert.equal(drilldown.summary.lifecycle_index_ref_count, 2);
  assert.equal(drilldown.summary.lifecycle_restore_proof_ref_count, 2);
  assert.equal(drilldown.summary.lifecycle_reconcile_missing_ref_count, 0);
  assert.equal(drilldown.summary.lifecycle_reconcile_extra_ref_count, 0);
  assert.equal(drilldown.summary.lifecycle_reconcile_stale_ref_count, 0);
  assert.equal(drilldown.summary.lifecycle_domain_physical_delete_requires_owner_receipt, true);
  assert.equal(drilldown.summary.lifecycle_domain_physical_delete_can_execute, false);
  assert.equal(drilldown.summary.lifecycle_opl_cleanup_apply_can_execute, true);
  assert.equal(drilldown.summary.safe_action_ref_count >= 2, true);
  assert.equal(drilldown.summary.freshness_signal_count >= 1, true);
  assert.equal(
    drilldown.owner_receipt_refs.refs.some((ref: { ref: string }) =>
      ref.ref === 'mas-owner-receipt:guarded-apply'
    ),
    true,
  );
  assert.equal(
    drilldown.owner_receipt_refs.refs.some((ref: { ref: string }) =>
      ref.ref === 'mas-owner-receipt:transition'
    ),
    true,
  );
  assert.equal(
    drilldown.typed_blocker_refs.refs.some((ref: { ref: string }) =>
      ref.ref === 'mas-blocker:publication-currentness'
    ),
    true,
  );
  assert.equal(
    drilldown.typed_blocker_refs.blockers.some((blocker: { blocker_id: string }) =>
      blocker.blocker_id === 'domain_owned_lifecycle_receipt_required'
    ),
    true,
  );
  assert.equal(drilldown.domain_dispatch_evidence.surface_kind, 'opl_app_drilldown_domain_dispatch_evidence');
  assert.equal(drilldown.domain_dispatch_evidence.summary.domain_count, 1);
  assert.equal(drilldown.domain_dispatch_evidence.by_domain.medautoscience.attempt_count, 1);
  assert.equal(drilldown.domain_dispatch_evidence.by_domain.medautoscience.domain_ready_claim_count, 0);
  assert.equal(
    drilldown.domain_dispatch_evidence.attempts[0].authority_boundary.provider_completion_is_domain_ready,
    false,
  );
  assert.deepEqual(drilldown.domain_dispatch_evidence.attempts[0].no_regression_evidence_refs, [
    'mas-no-regression:package',
  ]);
  assert.deepEqual(drilldown.domain_dispatch_evidence.attempts[0].writeback_receipt_refs, [
    'memory-writeback:receipt-1',
  ]);
  assert.deepEqual(drilldown.memory_writeback_refs.writeback_receipt_refs, [
    'memory-writeback:receipt-1',
    'mas://memory/writeback/receipt.json',
  ]);
  assert.equal(
    drilldown.runtime_visualization_projection.graph.nodes.some(
      (node: { node_kind: string; ref: string }) =>
        node.node_kind === 'memory_writeback_receipt'
        && node.ref === 'mas://memory/writeback/receipt.json',
    ),
    true,
  );
  assert.equal(
    drilldown.freshness_refs.refs.some((ref: { source_fingerprint: string }) =>
      ref.source_fingerprint === 'sha256:mas-drilldown-source'
    ),
    true,
  );
  assert.equal(
    drilldown.ref_family_refs.source_refs.refs.some((ref: { ref: string }) =>
      ref.ref === 'source:dataset'
    ),
    true,
  );
  assert.equal(
    drilldown.ref_family_refs.artifact_refs.refs.some((ref: { ref: string }) =>
      ref.ref === 'artifact:table'
    ),
    true,
  );
  assert.equal(
    drilldown.ref_family_refs.memory_refs.refs.some((ref: { ref: string }) =>
      ref.ref === 'memory:route-policy'
    ),
    true,
  );
  assert.equal(
    drilldown.safe_action_refs.refs.some((ref: { role: string; ref: string }) =>
      ref.role === 'lifecycle_cleanup_receipt_ref'
        && ref.ref.startsWith('opl://family-runtime/lifecycle-apply/medautoscience')
    ),
    true,
  );
  assert.deepEqual(drilldown.lifecycle_ledger_refs.restore_proof_refs, [
    'restore-proof:mas-index',
    'restore-proof:mas-package',
  ]);
  assert.equal(drilldown.lifecycle_ledger_refs.reconcile_projection.status, 'reconciled');
  assert.equal(
    drilldown.lifecycle_ledger_refs.reconcile_projection.delete_ready_proof.can_execute_delete,
    false,
  );
  assert.equal(
    drilldown.lifecycle_ledger_refs.reconcile_projection.delete_ready_proof.opl_cleanup_apply_ready,
    true,
  );
  assert.equal(drilldown.lifecycle_ledger_refs.authority_boundary.can_write_domain_truth, false);
}

export function assertEvidenceTailAndDomainRefs(drilldown: any, snapshot: any) {
  const stageTailItem = drilldown.production_evidence_tail_ledger.tail_items.find(
    (item: { claim_scope: string; tail_id: string }) =>
      item.claim_scope === 'stage_production_caller_executor_receipt_monitor'
      && item.tail_id.includes(':review:'),
  );
  assert.equal(stageTailItem.status, 'open');
  assert.equal(stageTailItem.owner_group, 'medautoscience');
  assert.equal(stageTailItem.receipt_ref, null);
  assert.equal(stageTailItem.typed_blocker_ref, null);
  assert.equal(stageTailItem.evidence_requirement_model, 'evidence_requirement.v1');
  assert.equal(stageTailItem.evidence_requirement.requirement_id, stageTailItem.tail_id);
  assert.equal(stageTailItem.evidence_requirement.requirement_kind, stageTailItem.tail_item);
  assert.equal(stageTailItem.evidence_requirement.owner, stageTailItem.owner_group);
  assert.equal(stageTailItem.evidence_requirement.domain_id, stageTailItem.domain_id);
  assert.equal(stageTailItem.evidence_requirement.status, stageTailItem.status);
  assert.equal(stageTailItem.evidence_requirement.current_ref, stageTailItem.current_ref);
  assert.equal(stageTailItem.not_authorized_claims.includes('domain_ready'), true);
  assert.equal(stageTailItem.authority_boundary.can_claim_domain_ready, false);
  assert.equal(
    stageTailItem.next_verification_command,
    'opl runtime app-operator-drilldown --detail full --json',
  );
  const nextActionLedger = drilldown.production_evidence_tail_ledger.next_action_ledger;
  assert.equal(
    nextActionLedger.surface_kind,
    'opl_app_drilldown_production_tail_next_action_ledger',
  );
  assert.equal(
    nextActionLedger.summary.open_tail_item_count,
    drilldown.production_evidence_tail_ledger.summary.open_tail_item_count,
  );
  assert.equal(nextActionLedger.authority_boundary.reads_declared_refs_only, true);
  assert.equal(nextActionLedger.authority_boundary.can_read_memory_body, false);
  assert.equal(nextActionLedger.authority_boundary.can_read_artifact_body, false);
  assert.equal(nextActionLedger.authority_boundary.can_claim_receipt_closure, false);
  const stageNextAction = nextActionLedger.next_action_items.find(
    (item: { stage_id: string | null; domain: string }) =>
      item.domain === 'medautoscience' && item.stage_id === 'review',
  );
  assert.equal(stageNextAction.owner, 'medautoscience');
  assert.equal(stageNextAction.domain, 'medautoscience');
  assert.equal(stageNextAction.stage_or_request, 'review');
  assert.equal(
    stageNextAction.required_receipt_type,
    'stage_production_caller_owner_receipt_or_domain_typed_blocker',
  );
  assert.equal(stageNextAction.current_ref, stageTailItem.replay_ref);
  assert.equal(stageNextAction.evidence_requirement_model, 'evidence_requirement.v1');
  assert.equal(stageNextAction.evidence_requirement.requirement_id, stageTailItem.tail_id);
  assert.equal(stageNextAction.evidence_requirement.owner, stageTailItem.owner_group);
  assert.equal(stageNextAction.evidence_requirement.domain_id, stageTailItem.domain_id);
  assert.equal(stageNextAction.evidence_requirement.status, stageTailItem.status);
  assert.equal(
    stageNextAction.next_safe_action_route,
    'opl runtime app-operator-drilldown --detail full --json',
  );
  assert.equal(stageNextAction.authority_boundary.can_read_memory_body, false);
  assert.equal(stageNextAction.authority_boundary.can_claim_domain_ready, false);
  assert.equal(
    nextActionLedger.groups.some(
      (group: { owner: string; domain: string; stage_or_request: string }) =>
        group.owner === 'medautoscience'
        && group.domain === 'medautoscience'
        && group.stage_or_request === 'review',
    ),
    true,
  );
  assert.equal(drilldown.app_execution_bridge.authority_boundary.can_write_domain_truth, false);
  assert.equal(
    drilldown.operator_action_routing_refs.refs.some(
      (ref: { owner: string; route_target_kind: string }) =>
        ref.owner === 'opl' && ref.route_target_kind === 'app_surface',
    ),
    true,
  );
  assert.equal(drilldown.functional_privatization_audit_summary.total_module_count >= 0, true);
  assert.equal(typeof drilldown.functional_privatization_audit_summary.by_migration_class, 'object');
  assert.equal(
    drilldown.functional_privatization_audit_summary.by_migration_class.temporary_migration_bridge_count >= 0,
    true,
  );
  assert.equal(
    drilldown.functional_privatization_audit_summary.by_migration_class.domain_authority_count >= 0,
    true,
  );
  assert.equal(
    drilldown.functional_privatization_audit_summary.by_migration_class.refs_only_domain_adapter_count >= 0,
    true,
  );
  assert.equal(drilldown.functional_privatization_audit_summary.default_watchlist_count, 0);
  assert.equal(drilldown.summary.functional_privatization_action_required_count, 0);
  assert.equal(
    drilldown.summary.functional_privatization_hidden_cleared_count,
    drilldown.functional_privatization_audit_summary.default_hidden_cleared_count,
  );
  assert.equal(
    drilldown.summary.functional_privatization_audit_default_policy,
    'audit_action_required_first_full_inventory_via_explicit_drilldown',
  );
  assert.equal(drilldown.functional_privatization_audit_summary.semantic_equivalence_review_count, 0);
  assert.equal(
    drilldown.functional_privatization_audit_refs.summary.active_private_generic_residue_count,
    drilldown.functional_privatization_audit_summary.active_private_generic_residue_count,
  );
  assert.equal(
    drilldown.functional_privatization_audit_refs.domains.some(
      (domain: { domain_id: string; module_refs: { module_id: string }[] }) =>
        domain.domain_id === 'medautoscience'
        && domain.module_refs.some((module) => module.module_id === 'package_lifecycle_adapter'),
    ),
    true,
  );
  assert.equal(
    drilldown.functional_privatization_audit_refs.domains.every(
      (domain: { authority_boundary: { can_write_domain_truth: boolean } }) =>
        domain.authority_boundary.can_write_domain_truth === false,
    ),
    true,
  );
  assert.equal(
    drilldown.domain_projection_refs.refs.some(
      (ref: { ref: string }) => ref.ref === 'mas://runtime/control/latest.json',
    ),
    true,
  );
  assert.equal(
    drilldown.domain_evidence_request_refs.external_requests.some(
      (ref: {
        request_id: string;
        required_return_shapes: string[];
        external_receipt_status: string;
      }) =>
        ref.request_id === 'app_workbench_package_ref_consumption'
        && ref.external_receipt_status === 'verified'
        && ref.required_return_shapes.includes('domain_owner_receipt'),
    ),
    true,
  );
  assert.equal(
    drilldown.domain_evidence_request_refs.external_receipts.some(
      (ref: { ref: string; receipt_status: string; domain_receipt_refs: string[] }) =>
        ref.ref === 'opl://external-evidence/medautoscience/app_workbench_package_ref_consumption'
        && ref.receipt_status === 'verified'
        && ref.domain_receipt_refs.includes('mas://receipts/package-lifecycle/latest.json'),
    ),
    true,
  );
  assert.equal(
    drilldown.domain_evidence_request_refs.evidence_gates.some(
      (ref: { ref: string }) => ref.ref === 'real_package_lifecycle_receipt',
    ),
    false,
  );
  assert.equal(
    drilldown.domain_evidence_request_refs.evidence_gate_receipts.some(
      (ref: {
        ref: string;
        gate_id: string;
        request_id: string;
        request_pack_id: string;
        receipt_status: string;
        domain_receipt_refs: string[];
      }) =>
        ref.ref === 'opl://external-evidence/medautoscience/real_package_lifecycle_receipt'
        && ref.gate_id === 'real_package_lifecycle_receipt'
        && ref.request_id === 'real_package_lifecycle_receipt'
        && ref.request_pack_id === 'medautoscience.evidence_gate_projection'
        && ref.receipt_status === 'verified'
        && ref.domain_receipt_refs.includes('mas://receipts/package-lifecycle/latest.json'),
    ),
    true,
  );
  assert.equal(
    drilldown.domain_evidence_request_refs.replacement_expectations.some(
      (ref: { ref: string; state: string }) =>
        ref.ref === 'artifact_package_lifecycle_shell'
        && ref.state === 'external_replacement_contract_expected',
    ),
    true,
  );
  assert.equal(
    drilldown.domain_evidence_request_refs.remaining_bridge_modules.some(
      (ref: {
        ref: string;
        module_id: string;
        replacement_owner: string;
        replacement_surface: string;
        classification: string;
        migration_class: string;
        retained_domain_authority: string[];
        required_before_retire: string[];
        domain_can_own_replacement_runtime: boolean;
        declares_replacement_complete: boolean;
        forbidden_generic_owner_flags: {
          mas_owns_generic_artifact_lifecycle_shell: boolean;
        };
      }) =>
        ref.ref === 'package_lifecycle_adapter'
        && ref.module_id === 'package_lifecycle_adapter'
        && ref.classification === 'refs_only_domain_adapter'
        && ref.migration_class === 'refs_only_domain_adapter'
        && ref.replacement_owner === 'one-person-lab'
        && ref.replacement_surface === 'opl_artifact_package_lifecycle_shell'
        && ref.retained_domain_authority.includes('package_owner_receipt_refs')
        && ref.required_before_retire.includes('no_regression_proof_recorded')
        && ref.domain_can_own_replacement_runtime === false
        && ref.declares_replacement_complete === false
        && ref.forbidden_generic_owner_flags.mas_owns_generic_artifact_lifecycle_shell === false,
    ),
    true,
  );
  assert.equal(
    snapshot.source_refs.some((ref: { role: string }) => ref.role === 'app_operator_drilldown'),
    true,
  );
  assert.equal(
    snapshot.source_refs.some((ref: { role: string }) => ref.role === 'domain_evidence_request_refs'),
    true,
  );
  assert.equal(
    snapshot.source_refs.some((ref: { role: string }) => ref.role === 'domain_legacy_cleanup_plan_refs'),
    true,
  );
  assert.equal(
    snapshot.source_refs.some((ref: { role: string }) => ref.role === 'runtime_visualization_projection'),
    true,
  );
}

export function buildMasAppOperatorDrilldownFixtureManifest() {
  const masManifest = structuredClone(loadFamilyManifestFixtures().medautoscience);
  masManifest.family_stage_control_plane = {
    surface_kind: 'family_stage_control_plane',
    version: 'family-stage-control-plane.v1',
    plane_id: 'med_autoscience_stage_control_plane',
    target_domain_id: 'medautoscience',
    owner: 'med-autoscience',
    authority_boundary: { opl_role: 'projection_consumer_only' },
    stages: [
      {
        stage_id: 'write',
        stage_kind: 'creation',
        title: 'Write',
        summary: 'Write from explicit refs.',
        goal: 'Produce draft refs under MAS authority.',
        owner: 'med-autoscience',
        domain_stage_refs: ['write'],
        inputs: [],
        knowledge_refs: [],
        skills: [],
        prompt_refs: [],
        allowed_action_refs: [],
        outputs: [],
        evaluation: [],
        handoff: null,
        source_refs: [],
        freshness: null,
        action_parity: null,
        stage_contract: {
          requires: ['sources_ready'],
          ensures: ['draft_ready'],
          progress_delta_policy: STANDARD_PROGRESS_DELTA_POLICY,
          typed_blocker_lineage_policy: STANDARD_TYPED_BLOCKER_LINEAGE_POLICY,
          boundary_assumptions: ['domain_truth_remains_domain_owned'],
          properties: [],
          runtime_event_refs: ['runtime_event:write.owner_receipt_recorded'],
          runtime_assumptions: [],
          monitor_refs: [{ ref_kind: 'metric_ref', ref: 'metric:write/currentness', role: 'monitor' }],
          source_scope_refs: [{ ref_kind: 'source_ref', ref: 'source:dataset', role: 'source_scope' }],
          cohort_query_refs: [{ ref_kind: 'query_ref', ref: 'cohort:write/current', role: 'cohort_query' }],
          trigger_refs: [{ ref_kind: 'queue_ref', ref: 'queue:write/current', role: 'trigger' }],
          metric_refs: [{ ref_kind: 'metric_ref', ref: 'metric:write/currentness', role: 'metric' }],
          dashboard_metric_refs: [],
          artifact_scope_refs: [{ ref_kind: 'artifact_ref', ref: 'artifact:table', role: 'artifact_scope' }],
          workspace_scope_refs: [{ ref_kind: 'workspace_ref', ref: 'workspace:/tmp/mas', role: 'workspace_scope' }],
        },
        trust_boundary: {
          lane: 'domain_agent',
          static_check_eligible: false,
          effect_boundary: true,
          records_runtime_events: true,
          runtime_event_refs: ['runtime_event:write.owner_receipt_recorded'],
          owner_receipt_required: true,
        },
        authority_boundary: {
          opl_role: 'projection_consumer_only',
          expected_receipt_refs: ['receipt:write-closeout'],
          can_write_domain_truth: false,
          can_authorize_quality_verdict: false,
        },
      },
      {
        stage_id: 'review',
        stage_kind: 'review',
        title: 'Review',
        summary: 'Review from draft refs.',
        goal: 'Return review refs under MAS authority.',
        owner: 'med-autoscience',
        domain_stage_refs: ['review'],
        inputs: [],
        knowledge_refs: [],
        skills: [],
        prompt_refs: [],
        allowed_action_refs: [],
        outputs: [],
        evaluation: [],
        handoff: null,
        source_refs: [],
        freshness: null,
        action_parity: null,
        stage_contract: {
          requires: ['draft_ready'],
          ensures: ['review_ready'],
          progress_delta_policy: STANDARD_PROGRESS_DELTA_POLICY,
          typed_blocker_lineage_policy: STANDARD_TYPED_BLOCKER_LINEAGE_POLICY,
          boundary_assumptions: ['reviewer_judgment_is_domain_owned'],
          properties: [],
          runtime_event_refs: ['runtime_event:review.receipt_recorded'],
          runtime_assumptions: [],
          monitor_refs: [{ ref_kind: 'metric_ref', ref: 'metric:review/currentness', role: 'monitor' }],
          source_scope_refs: [{ ref_kind: 'source_ref', ref: 'source:review', role: 'source_scope' }],
          cohort_query_refs: [{ ref_kind: 'query_ref', ref: 'cohort:review/current', role: 'cohort_query' }],
          trigger_refs: [{ ref_kind: 'queue_ref', ref: 'queue:review/current', role: 'trigger' }],
          metric_refs: [{ ref_kind: 'metric_ref', ref: 'metric:review/currentness', role: 'metric' }],
          dashboard_metric_refs: [],
          artifact_scope_refs: [],
          workspace_scope_refs: [],
        },
        trust_boundary: {
          lane: 'human_gate',
          static_check_eligible: false,
          effect_boundary: true,
          records_runtime_events: true,
          runtime_event_refs: ['runtime_event:review.receipt_recorded'],
          owner_receipt_required: true,
          human_gate_required: true,
        },
        authority_boundary: {
          opl_role: 'projection_consumer_only',
          expected_receipt_refs: ['mas:review-receipt'],
          can_authorize_quality_verdict: false,
        },
      },
    ],
    notes: [],
  };

  masManifest.runtime_inventory = {
    ...((masManifest.runtime_inventory as Record<string, unknown>) ?? {}),
    domain_projection: {
      surface_kind: 'mas_runtime_inventory_projection',
      source_refs: ['mas://runtime/inventory/latest.json'],
    },
  };
  masManifest.progress_projection = {
    ...((masManifest.progress_projection as Record<string, unknown>) ?? {}),
    domain_projection: {
      surface_kind: 'mas_progress_projection',
      research_runtime_control_projection: {
        surface_kind: 'research_runtime_control_projection',
        source_refs: ['mas://runtime/control/latest.json'],
      },
      paper_route_lens: {
        surface_kind: 'mas_opl_paper_route_lens',
        schema_version: 1,
        mode: 'refs_only_paper_route_lens',
        study_id: 'dm-cvd',
        status: 'available',
        body_included: false,
        manuscript_body_included: false,
        artifact_body_included: false,
        claims_publication_ready: false,
        publication_ready_authorized: false,
        paper_route_lens_refs: ['mas://studies/dm-cvd/paper-route-lens/latest.json'],
        owner_receipt_refs: ['mas://receipts/dm-cvd/write-owner-route.json'],
        typed_blocker_refs: ['mas://blockers/dm-cvd/reviewer-refresh.json'],
        reviewer_gate_refs: ['mas://reviewer-gates/dm-cvd/currentness.json'],
        artifact_refs: ['mas://artifacts/dm-cvd/current-package.zip'],
        source_refs: ['mas://sources/dm-cvd/source-scope.json'],
        workspace_refs: ['mas://workspaces/dm-cvd'],
        next_route_refs: ['mas://routes/dm-cvd/reviewer-refresh'],
        next_action_refs: ['mas://actions/dm-cvd/run-reviewer-refresh'],
        authority: {
          can_read_paper_body: false,
          can_write_paper_truth: false,
          can_authorize_publication_ready: false,
          can_authorize_quality_verdict: false,
        },
      },
      route_decision_graph_ref: 'mas://runtime/route-decision/latest.json',
      quality_readiness_ref: 'mas://publication_eval/latest.json',
    },
  };
  masManifest.artifact_inventory = {
    ...((masManifest.artifact_inventory as Record<string, unknown>) ?? {}),
    domain_projection: {
      surface_kind: 'mas_artifact_inventory_projection',
      artifact_refs: ['mas://artifacts/current-package.zip'],
      package_lifecycle_ref: 'mas://artifacts/package-lifecycle/latest.json',
    },
  };
  masManifest.functional_privatization_audit = {
    target_domain_id: 'medautoscience',
    modules: [
      {
        module_id: 'app_workbench_package_ref_consumption',
        migration_class: 'refs_only_adapter',
        owner: 'med-autoscience',
      },
      {
        module_id: 'package_lifecycle_adapter',
        classification: 'split_owner_boundary',
        migration_class: 'refs_only_adapter',
        owner: 'med-autoscience',
        forbidden_generic_owner_flags: {
          mas_owns_generic_artifact_lifecycle_shell: false,
          mas_owns_generic_workbench: false,
        },
        bridge_exit_gate: {
          gate_id: 'package_lifecycle_adapter_bridge_exit_gate',
          bridge_role: 'package_lifecycle_refs_adapter_until_opl_artifact_shell_live',
          bridge_owner: 'med_autoscience_migration_bridge',
          replacement_owner: 'one-person-lab',
          replacement_surface: 'opl_artifact_package_lifecycle_shell',
          exit_gate_ref: '/mag_consumer_thinning_contract/opl_replacement_expectations/0',
          current_status: 'bridge_until_exit_gates_pass',
          required_before_retire: [
            'domain_authority_refs_preserved',
            'no_regression_proof_recorded',
          ],
          retained_rca_authority: [
            'domain_artifact_authority',
            'package_owner_receipt_refs',
          ],
          after_exit_rca_surface: 'artifact_authority_and_package_receipt_refs',
          can_delete_without_no_active_caller_proof: false,
          declares_replacement_complete: false,
          rca_can_own_replacement_runtime: false,
          opl_can_issue_owner_receipt: false,
        },
      },
    ],
    bridge_exit_gate: {
      remaining_evidence_gate_ids: ['real_package_lifecycle_receipt'],
      remaining_bridge_module_ids: ['package_lifecycle_adapter'],
    },
    mag_consumer_thinning_contract: {
      external_evidence_request_pack: {
        request_pack_id: 'mas.external_evidence_request_pack.fixture',
        owner: 'med-autoscience',
        request_owner: 'med-autoscience',
        requested_from: ['one-person-lab', 'codex_app'],
        policy: 'request_refs_receipt_shapes_and_parity_only_no_runtime_implementation',
        requests: [
          {
            request_id: 'app_workbench_package_ref_consumption',
            status: 'requested_not_received',
            required_evidence_refs: ['mas://artifacts/package-lifecycle/latest.json'],
            required_return_shapes: ['domain_owner_receipt', 'typed_blocker'],
            required_receipt_shapes: ['lifecycle_receipt_ref'],
            forbidden_payload_classes: ['domain_truth_body', 'artifact_body'],
            accepted_payload_policy: 'refs_receipts_and_shape_metadata_only',
            source_pointer: '/functional_privatization_audit/mag_consumer_thinning_contract/external_evidence_request_pack/requests/0',
          },
        ],
      },
      opl_replacement_expectations: [
        {
          primitive_id: 'artifact_package_lifecycle_shell',
          owner: 'one-person-lab',
          state: 'external_replacement_contract_expected',
          opl_provides: ['package_lifecycle_shell', 'restore_ref_index'],
          mag_keeps: ['domain_owner_receipt'],
          implemented_in_mag: false,
        },
      ],
    },
  };
  masManifest.standard_domain_agent_skeleton = {
    surface_kind: 'standard_domain_agent_skeleton',
    version: 'standard-domain-agent-skeleton.v1',
    agent_id: 'mas',
    repo_source_boundary: {
      required_dirs: ['agent', 'contracts', 'runtime', 'docs'],
      forbidden_dirs: ['artifacts'],
    },
    artifact_boundary: {
      repo_contains_real_artifacts: false,
      artifact_roots_are_locators: true,
      workspace_artifact_locator_refs: ['workspace:/artifacts'],
      runtime_artifact_locator_refs: ['runtime:/receipts'],
    },
    artifact_locator_contract: {
      surface_kind: 'artifact_locator_contract',
      locator_model: 'workspace_runtime_artifact_root',
    },
    authority_boundary: {
      opl: 'framework_transport_and_projection_only',
      domain: 'truth_quality_artifact_owner',
    },
  };
  masManifest.physical_skeleton_follow_through = {
    surface_kind: 'mas_physical_skeleton_follow_through',
    status: 'minimum_repo_source_anchors_landed',
    source_refs: [
      'agent/README.md',
      'contracts/README.md',
      'runtime/README.md',
      'docs/status.md',
    ],
    direct_skill_parity_refs: ['proof:mas:direct-skill-parity'],
    opl_hosted_parity_refs: ['proof:mas:opl-hosted-parity'],
    replacement_parity_refs: ['proof:mas:replacement-parity'],
    provenance_refs: ['docs/history/runtime-substrate/mas-local-runtime-tombstone.md'],
    legacy_active_path_policy: 'physically_removed_or_history_tombstone_only',
    legacy_active_path_residue: [
      {
        path_family: 'default MAS local scheduler',
        state: 'tombstone_only',
        evidence_ref: 'docs/history/runtime-substrate/mas-local-scheduler-tombstone.md',
      },
    ],
  };
  masManifest.legacy_retirement_tombstone_proof = {
    status: 'no_active_default_caller_proven',
    active_default_callers: [],
    tombstone_refs: ['docs/history/runtime-substrate/mas-local-scheduler-tombstone.md'],
    source_refs: ['docs/decisions.md#temporal-runtime'],
  };

  return masManifest;
}
