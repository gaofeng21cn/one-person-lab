import { spawnSync } from 'node:child_process';

import {
  assert,
  buildManifestCommand,
  createFamilyContractsFixtureRoot,
  fs,
  loadFamilyManifestFixtures,
  os,
  path,
  repoRoot,
  runCli,
  test,
} from '../helpers.ts';

test('runtime snapshot exposes App operator drilldown as refs-only owner-aware read model', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-drilldown-state-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const masManifest = structuredClone(loadFamilyManifestFixtures().medautoscience);

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

  try {
    runCli([
      'workspace',
      'bind',
      '--project',
      'medautoscience',
      '--path',
      repoRoot,
      '--manifest-command',
      buildManifestCommand(masManifest),
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });
    runCli(['family-runtime', 'events', 'export'], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });
    insertProviderProof(stateRoot);

    const attempt = runCli([
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      'medautoscience',
      '--stage',
      'write',
      '--provider',
      'local_sqlite',
      '--workspace-locator',
      '{"workspace_root":"/tmp/mas","artifact_root":"/tmp/mas/artifacts","source_refs":["source:dataset"],"missing_material_refs":["material:irb"],"restore_refs":["restore:study-run"]}',
      '--task',
      'task-app-drilldown',
      '--checkpoint-ref',
      'checkpoint:write-start',
      '--source-fingerprint',
      'sha256:app-drilldown-source',
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });
    const attemptId = attempt.family_runtime_stage_attempt.attempt.stage_attempt_id;
    runCli([
      'family-runtime',
      'attempt',
      'fixture-run',
      attemptId,
      '--closeout-packet',
      '{"surface_kind":"stage_attempt_closeout_packet","closeout_refs":["receipt:write-closeout"],"consumed_refs":["artifact:table"],"consumed_memory_refs":["memory:route-policy"],"writeback_receipt_refs":["memory-writeback:receipt-1"],"rejected_writes":[{"reason":"domain_truth_write_forbidden"}],"next_owner":"med-autoscience","domain_ready_verdict":"domain_gate_pending","route_impact":{"decision":"bounded_repair","quality_refs":["publication_eval/latest.json"],"readiness_refs":["controller_decisions/latest.json"],"slo_ref":"slo:write-currentness","breached_slo_ids":["review_currentness"],"repair_command":"medautosci sidecar dispatch --task <task.json> --format json","package_refs":["package:submission-minimal"],"export_refs":["export:current-package"],"gap_report_refs":["gap:package-readiness"],"handoff_refs":["handoff:manual-submission"]}}',
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });

    const output = runCli(['runtime', 'snapshot'], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });
    const snapshot = output.runtime_tray_snapshot;
    const drilldown = snapshot.app_operator_drilldown;

    assert.equal(drilldown.surface_kind, 'opl_app_operator_drilldown_read_model');
    assert.equal(drilldown.projection_scope, 'runtime_snapshot');
    assert.equal(drilldown.consumer, 'one_person_lab_app_operator_workbench');
    assert.equal(drilldown.availability, 'available');
    assert.equal(drilldown.authority_boundary.can_write_domain_truth, false);
    assert.equal(drilldown.authority_boundary.can_read_memory_body, false);
    assert.equal(drilldown.authority_boundary.can_read_artifact_body, false);
    assert.equal(drilldown.authority_boundary.can_authorize_quality_verdict, false);
    assert.equal(drilldown.authority_boundary.can_authorize_export_verdict, false);
    assert.equal(drilldown.authority_boundary.can_execute_domain_action, false);
    assert.equal(drilldown.authority_boundary.provider_completion_is_domain_ready, false);
    assert.deepEqual(drilldown.non_goals, [
      'does_not_write_domain_truth',
      'does_not_read_or_store_memory_body',
      'does_not_read_or_mutate_artifact_body',
      'does_not_authorize_quality_readiness_or_export_verdict',
      'does_not_execute_domain_or_provider_actions',
    ]);

    assert.equal(drilldown.summary.stage_attempt_count, 1);
    assert.equal(drilldown.summary.domain_projection_ref_count >= 3, true);
    assert.equal(drilldown.summary.route_graph_ref_count, 1);
    assert.equal(drilldown.summary.review_repair_queue_item_count, 1);
    assert.equal(drilldown.summary.artifact_gallery_item_count, 3);
    assert.equal(drilldown.summary.package_ref_count, 1);
    assert.equal(drilldown.summary.export_ref_count, 1);
    assert.equal(drilldown.summary.memory_ref_count, 1);
    assert.equal(drilldown.summary.memory_writeback_ref_count, 1);
    assert.equal(drilldown.summary.quality_ref_count, 1);
    assert.equal(drilldown.summary.readiness_ref_count, 1);
    assert.equal(drilldown.summary.provider_slo_action_count, 1);
    assert.equal(drilldown.summary.operator_action_route_count, 13);
    assert.equal(drilldown.summary.domain_owned_action_route_count, 2);
    assert.equal(drilldown.summary.functional_privatization_default_watchlist_count, 0);
    assert.equal(drilldown.summary.functional_privatization_semantic_equivalence_review_count, 0);

    assert.equal(drilldown.route_graph_refs.surface_kind, 'opl_app_drilldown_route_graph_refs');
    assert.equal(drilldown.route_graph_refs.refs[0].ref, `/stage_attempt_workbench/attempts/${attemptId}/route_decision_graph`);
    assert.equal(drilldown.review_repair_queue_refs.items[0].repair_target, `opl family-runtime attempt query ${attemptId}`);
    assert.equal(drilldown.artifact_gallery_refs.content_policy, 'locator_only_no_artifact_content');
    assert.equal(drilldown.artifact_gallery_refs.refs.length, 3);
    assert.deepEqual(drilldown.package_export_lifecycle_refs.package_refs, ['package:submission-minimal']);
    assert.deepEqual(drilldown.package_export_lifecycle_refs.export_refs, ['export:current-package']);
    assert.deepEqual(drilldown.memory_writeback_refs.consumed_memory_refs, ['memory:route-policy']);
    assert.deepEqual(drilldown.memory_writeback_refs.writeback_receipt_refs, ['memory-writeback:receipt-1']);
    assert.deepEqual(drilldown.quality_readiness_refs.quality_refs, ['publication_eval/latest.json']);
    assert.deepEqual(drilldown.quality_readiness_refs.readiness_refs, ['controller_decisions/latest.json']);
    assert.equal(
      drilldown.provider_slo_operator_action_refs.refs[0].ref,
      'opl family-runtime residency proof --provider temporal --production',
    );
    assert.equal(drilldown.provider_slo_operator_action_refs.refs[0].execution_owner, 'operator_or_infrastructure');

    const domainRoute = drilldown.operator_action_routing_refs.refs.find(
      (ref: { action_kind: string }) => ref.action_kind === 'domain_sidecar_repair_command',
    );
    assert.equal(domainRoute.owner, 'domain');
    assert.equal(domainRoute.execution_policy, 'route_only_no_execution');
    assert.equal(domainRoute.can_execute, false);
    assert.equal(
      drilldown.operator_action_routing_refs.refs.some(
        (ref: { owner: string; route_target_kind: string }) =>
          ref.owner === 'opl' && ref.route_target_kind === 'app_surface',
      ),
      true,
    );
    assert.equal(drilldown.functional_privatization_audit_summary.total_module_count >= 0, true);
    assert.equal(drilldown.functional_privatization_audit_summary.default_watchlist_count, 0);
    assert.equal(drilldown.functional_privatization_audit_summary.semantic_equivalence_review_count, 0);
    assert.equal(
      drilldown.domain_projection_refs.refs.some(
        (ref: { ref: string }) => ref.ref === 'mas://runtime/control/latest.json',
      ),
      true,
    );
    assert.equal(
      snapshot.source_refs.some((ref: { role: string }) => ref.role === 'app_operator_drilldown'),
      true,
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

function insertProviderProof(stateRoot: string) {
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
