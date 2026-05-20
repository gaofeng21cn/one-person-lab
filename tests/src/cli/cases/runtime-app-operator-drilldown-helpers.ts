import { spawnSync } from 'node:child_process';

import {
  assert,
  path,
  repoRoot,
} from '../helpers.ts';

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
}
