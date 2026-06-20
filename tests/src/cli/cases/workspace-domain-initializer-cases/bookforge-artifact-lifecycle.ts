import {
  assert,
  fs,
  os,
  path,
  runCli,
  test,
} from '../../helpers.ts';

function readJsonFile(filePath: string) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

test('workspace artifact-lifecycle materializes refs-only Book Forge artifact projections', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-workspace-artifact-lifecycle-state-'));
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-workspace-artifact-lifecycle-root-'));

  try {
    runCli([
      'workspace',
      'init',
      '--agent',
      'bookforge',
      '--workspace-root',
      workspaceRoot,
      '--workspace-id',
      'bookforge-workspace',
      '--project-id',
      'book-001',
    ], {
      OPL_STATE_DIR: stateRoot,
    });

    const workspacePath = path.join(workspaceRoot, 'bookforge-workspace');
    const projectRoot = path.join(workspacePath, 'projects', 'book-001');
    fs.mkdirSync(path.join(projectRoot, 'inputs'), { recursive: true });
    fs.writeFileSync(path.join(projectRoot, 'inputs', 'initial-plan.md'), '# Initial plan\n');
    fs.mkdirSync(path.join(projectRoot, 'sources'), { recursive: true });
    fs.writeFileSync(path.join(projectRoot, 'sources', 'source-note.md'), '# Source note\n');
    fs.writeFileSync(path.join(projectRoot, 'sources', 'source-map.json'), JSON.stringify([
      {
        id: 'SRC-1',
        title: 'Owner supplied source',
        path: 'sources/source-note.md',
        use: 'Supports the chapter source boundary.',
        owner: 'owner_supplied',
        provenance: 'local_file',
        allowed_use: 'source_boundary_only',
        privacy: 'owner_private',
        evidence_class: 'owner_supplied_source',
        claim_refs: ['chapter-01:source-boundary'],
      },
    ], null, 2));
    for (const ref of [
      'book-memory/working.md',
      'book-memory/episodic.md',
      'book-memory/semantic.md',
      'book-memory/memory-qc.md',
    ]) {
      const filePath = path.join(projectRoot, ref);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, `# ${path.basename(ref)}\n`);
    }
    for (const ref of [
      'artifacts/review/completed-chapters.review.pdf',
      'artifacts/review/completed-chapters.review-pdf-export.json',
      'artifacts/manuscript/chapter-manifest.json',
      'artifacts/stage_outputs/book-materialization/figure-asset-manifest.json',
      'quality/book-project-hygiene.json',
      'meta-review/round-1-entrypoint-decision.md',
      'revision-routing/storyline-route-back.json',
      'revision-routing/storyline-repair-plan.md',
      'quality/downstream-freshness-gate.json',
      'control/opl/current-owner-delta.json',
    ]) {
      const filePath = path.join(projectRoot, ref);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, ref.endsWith('.pdf') || ref.endsWith('.md') ? '# ref\n' : '{}\n');
    }
    fs.mkdirSync(path.join(projectRoot, 'handoff'), { recursive: true });
    fs.writeFileSync(path.join(projectRoot, 'handoff', 'review-repair-transport.json'), JSON.stringify({
      revision_entrypoint_decision_ref: 'meta-review/round-1-entrypoint-decision.md',
      route_back_ref: 'revision-routing/storyline-route-back.json',
      repair_plan_ref: 'revision-routing/storyline-repair-plan.md',
      freshness_gate_ref: 'quality/downstream-freshness-gate.json',
      current_owner_delta_ref: 'control/opl/current-owner-delta.json',
      current_owner: 'OPL Book Forge',
      accepted_answer_shape: ['domain_repair_receipt_ref', 'typed_blocker_ref', 'owner_decision_ref'],
      selected_transport_kind: 'route_back',
      domain_decision_label: 'storyline_architecture_repair',
      route_back: {
        target_stage_ref: 'storyline-architecture',
        target_owner: 'OPL Book Forge',
      },
      downstream_freshness_refs: [
        'artifacts/manuscript/chapter-manifest.json',
        'quality/book-project-hygiene.json',
      ],
      stale_downstream_refs: [],
      iteration: {
        current_iteration: 1,
        limit: 3,
      },
      closure_options: ['domain_repair_receipt_ref', 'typed_blocker_ref'],
    }, null, 2));

    const output = runCli([
      'workspace',
      'artifact-lifecycle',
      '--workspace',
      workspacePath,
      '--project-id',
      'book-001',
      '--apply',
    ], {
      OPL_STATE_DIR: stateRoot,
    });

    assert.equal(output.workspace_artifact_lifecycle.surface_kind, 'opl_workspace_artifact_lifecycle');
    assert.equal(output.workspace_artifact_lifecycle.status, 'applied');
    assert.equal(output.workspace_artifact_lifecycle.lifecycle_status, 'passed');
    assert.equal(output.workspace_artifact_lifecycle.health.status, 'passed');
    assert.equal(output.workspace_artifact_lifecycle.source_passport.summary.source_map_entry_count, 1);
    assert.equal(output.workspace_artifact_lifecycle.memory_lifecycle.summary.missing_required_ref_count, 0);
    assert.equal(output.workspace_artifact_lifecycle.output_lifecycle.summary.missing_current_ref_count, 0);
    assert.equal(output.workspace_artifact_lifecycle.review_repair_transport.status, 'passed');
    assert.equal(
      output.workspace_artifact_lifecycle.review_repair_transport.route_back.target_stage_ref,
      'storyline-architecture',
    );
    assert.equal(
      output.workspace_artifact_lifecycle.review_repair_transport.authority_boundary
        .transport_does_not_parse_domain_revision_semantics,
      true,
    );
    assert.equal(
      output.workspace_artifact_lifecycle.review_repair_transport.authority_boundary.opl_can_write_domain_truth,
      false,
    );
    assert.equal(output.workspace_artifact_lifecycle.authority_boundary.lifecycle_index_is_projection_only, true);
    assert.equal(output.workspace_artifact_lifecycle.authority_boundary.opl_can_write_domain_truth, false);

    for (const ref of [
      'control/opl/artifact_lifecycle/source_passport.json',
      'control/opl/artifact_lifecycle/memory_lifecycle.json',
      'control/opl/artifact_lifecycle/output_lifecycle.json',
      'control/opl/artifact_lifecycle/review_repair_transport.json',
      'control/opl/artifact_lifecycle/artifact_lifecycle_health.json',
      'control/opl/artifact_lifecycle/artifact_lifecycle_index.json',
    ]) {
      assert.equal(fs.statSync(path.join(projectRoot, ref)).isFile(), true, ref);
    }

    const health = readJsonFile(path.join(projectRoot, 'control/opl/artifact_lifecycle/artifact_lifecycle_health.json'));
    assert.equal(health.status, 'passed');
    assert.equal(health.authority_boundary.health_can_claim_publication_ready, false);
    const reviewRepair = readJsonFile(
      path.join(projectRoot, 'control/opl/artifact_lifecycle/review_repair_transport.json'),
    );
    assert.equal(reviewRepair.status, 'passed');
    assert.equal(reviewRepair.current_owner, 'OPL Book Forge');
    assert.deepEqual(reviewRepair.accepted_answer_shape, [
      'domain_repair_receipt_ref',
      'typed_blocker_ref',
      'owner_decision_ref',
    ]);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test('workspace artifact-lifecycle blocks missing Book Forge lifecycle refs without writing domain truth', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-workspace-artifact-lifecycle-block-state-'));
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-workspace-artifact-lifecycle-block-root-'));

  try {
    runCli([
      'workspace',
      'init',
      '--agent',
      'bookforge',
      '--workspace-root',
      workspaceRoot,
      '--workspace-id',
      'bookforge-workspace',
      '--project-id',
      'book-001',
    ], {
      OPL_STATE_DIR: stateRoot,
    });

    const workspacePath = path.join(workspaceRoot, 'bookforge-workspace');
    const projectRoot = path.join(workspacePath, 'projects', 'book-001');
    fs.mkdirSync(path.join(projectRoot, 'sources'), { recursive: true });
    fs.writeFileSync(path.join(projectRoot, 'sources', 'source-map.json'), JSON.stringify([
      {
        id: 'SRC-1',
        title: 'Incomplete source',
        use: 'Missing lifecycle fields on purpose.',
      },
    ], null, 2));
    fs.mkdirSync(path.join(projectRoot, 'handoff'), { recursive: true });
    fs.writeFileSync(path.join(projectRoot, 'handoff', 'review-repair-transport.json'), JSON.stringify({
      revision_entrypoint_decision_ref: 'meta-review/round-1-entrypoint-decision.md',
      route_back_ref: 'revision-routing/storyline-route-back.json',
      selected_transport_kind: 'route_back',
      stale_downstream_refs: ['artifacts/manuscript/chapter-manifest.json'],
      iteration: {
        current_iteration: 4,
        limit: 3,
      },
    }, null, 2));

    const output = runCli([
      'workspace',
      'artifact-lifecycle',
      '--workspace',
      workspacePath,
      '--project-id',
      'book-001',
      '--apply',
    ], {
      OPL_STATE_DIR: stateRoot,
    });

    assert.equal(output.workspace_artifact_lifecycle.status, 'applied');
    assert.equal(output.workspace_artifact_lifecycle.lifecycle_status, 'blocked');
    assert.deepEqual(
      output.workspace_artifact_lifecycle.health.blockers.map((entry: { code: string }) => entry.code).sort(),
      [
        'book_memory_required_refs_missing',
        'output_lifecycle_current_refs_missing',
        'review_repair_transport_blocked',
        'source_map_lifecycle_fields_missing',
      ],
    );
    assert.deepEqual(
      output.workspace_artifact_lifecycle.review_repair_transport.blockers
        .map((entry: { code: string }) => entry.code)
        .sort(),
      [
        'review_repair_accepted_answer_shape_missing',
        'review_repair_current_owner_missing',
        'review_repair_downstream_refs_stale',
        'review_repair_iteration_limit_exceeded',
        'review_repair_route_back_target_missing',
      ],
    );
    assert.equal(output.workspace_artifact_lifecycle.health.authority_boundary.health_can_claim_domain_ready, false);
    assert.equal(output.workspace_artifact_lifecycle.memory_lifecycle.authority_boundary.opl_can_write_memory_body, false);
    assert.equal(fs.existsSync(path.join(projectRoot, 'book-memory', 'working.md')), false);

    const health = readJsonFile(path.join(projectRoot, 'control/opl/artifact_lifecycle/artifact_lifecycle_health.json'));
    assert.equal(health.status, 'blocked');
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});
