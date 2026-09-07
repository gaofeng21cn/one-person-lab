import {
  assert,
  fs,
  os,
  parseJsonText,
  path,
  runCli,
  test,
} from '../../helpers.ts';
import { execFileSync } from 'node:child_process';

function readJsonFile(filePath: string) {
  return parseJsonText(fs.readFileSync(filePath, 'utf8')) as any;
}

function writeBookForgeLifecycleProfile(projectRoot: string) {
  const profilePath = path.join(
    projectRoot,
    'control',
    'opl',
    'artifact_lifecycle',
    'artifact_lifecycle_profile.json',
  );
  fs.mkdirSync(path.dirname(profilePath), { recursive: true });
  fs.writeFileSync(profilePath, JSON.stringify({
    surface_kind: 'opl_workspace_artifact_lifecycle_profile',
    version: 'workspace-artifact-lifecycle-profile.v1',
    owner: 'domain_project',
    memory_model: 'bookforge_working_episodic_semantic_qc',
    output_groups: [
      { ref: 'artifacts/manuscript', role: 'manuscript_artifact' },
      { ref: 'artifacts/review', role: 'review_artifact' },
    ],
    required_memory_refs: [
      { ref: 'book-memory/working.md', role: 'book_memory_ref' },
      { ref: 'book-memory/episodic.md', role: 'book_memory_ref' },
      { ref: 'book-memory/semantic.md', role: 'book_memory_ref' },
      { ref: 'book-memory/memory-qc.md', role: 'book_memory_ref' },
    ],
    current_output_refs: [
      { ref: 'artifacts/review/completed-chapters.review.pdf', role: 'current_review_pdf' },
      { ref: 'artifacts/review/completed-chapters.review-pdf-export.json', role: 'current_review_pdf_receipt' },
      { ref: 'artifacts/manuscript/chapter-manifest.json', role: 'chapter_manifest' },
      { ref: 'artifacts/stage_outputs/book-materialization/figure-asset-manifest.json', role: 'figure_asset_manifest' },
      { ref: 'quality/book-project-hygiene.json', role: 'hygiene_report' },
    ],
    authority_boundary: {
      profile_is_refs_only: true,
      opl_can_write_domain_truth: false,
      opl_can_mutate_artifact_body: false,
    },
  }, null, 2));
}

test('workspace init projects owner output groups and keeps existing profiles and generic inventory', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-artifact-groups-'));
  try {
    const repo = path.join(root, 'owner');
    fs.mkdirSync(path.join(repo, 'contracts'), { recursive: true });
    execFileSync('git', ['init', '--quiet', repo]);
    fs.writeFileSync(path.join(repo, 'contracts/domain_descriptor.json'), JSON.stringify({
      domain_id: 'opl-bookforge',
      standard_contract_refs: { artifact_lifecycle_profile: 'contracts/lifecycle.json' },
      standard_agent_interface: {
        version: 'opl_standard_agent_interface.v1',
        workspace_binding: {
          locator_surface_kind: 'book_workspace', default_profile_id: 'one_off',
          workspace_kind: 'book_workspace', project_kind: 'book',
          project_collection_label: 'projects', project_collection_path: 'projects',
          default_workspace_id: 'books', default_project_id: 'book-1',
          required_locator_fields: ['workspace_root'], optional_locator_fields: [],
        },
        runtime: { runtime_domain_id: 'opl-bookforge', registration_ref: 'contracts/domain_descriptor.json#/runtime' },
        progress: { deliverable_delta_aliases: ['delta'], platform_delta_aliases: ['platform_delta'] },
        routing: { explicit_aliases: ['bookforge'], workstream_ids: ['book'], intent_signals: ['book'], ambiguity_policy: 'require_explicit_workstream' },
      },
    }));
    const declared = { output_groups: [
      { ref: 'chapters', role: 'owner_chapter' },
      { ref: 'chapters/accepted', role: 'accepted_chapter' },
      { ref: 'artifacts/manuscript', role: 'owner_manuscript' },
    ] };
    fs.writeFileSync(path.join(repo, 'contracts/lifecycle.json'), JSON.stringify(declared));
    const env = { OPL_STATE_DIR: path.join(root, 'state'), OPL_MODULE_PATH_OPLBOOKFORGE: repo };
    const initArgs = ['workspace', 'init', '--agent', 'bookforge', '--workspace-root', root, '--workspace-id', 'books', '--project-id', 'book-1'];
    runCli(initArgs, env);
    const workspace = path.join(root, 'books');
    const project = path.join(workspace, 'projects/book-1');
    const profile = path.join(project, 'control/opl/artifact_lifecycle/artifact_lifecycle_profile.json');
    assert.deepEqual(readJsonFile(profile), declared);
    for (const ref of ['chapters/draft.md', 'chapters/accepted/final.md', 'artifacts/manuscript/book.md', 'artifacts/exports/book.pdf', 'quality/report.json', 'receipts/owner.json', 'archive/old.md']) {
      fs.mkdirSync(path.dirname(path.join(project, ref)), { recursive: true });
      fs.writeFileSync(path.join(project, ref), 'fixture');
    }
    const readback = () => runCli(['workspace', 'artifact-lifecycle', '--workspace', workspace, '--project-id', 'book-1'], env).workspace_artifact_lifecycle;
    const declaredOutput = readback().output_lifecycle;
    assert.equal(declaredOutput.artifacts.filter((entry: any) => entry.ref.includes('/chapters/')).length, 2);
    assert.equal(declaredOutput.artifacts.find((entry: any) => entry.ref.endsWith('chapters/accepted/final.md')).role, 'accepted_chapter');
    assert.equal(declaredOutput.artifacts.find((entry: any) => entry.ref.endsWith('artifacts/manuscript/book.md')).role, 'owner_manuscript');
    assert.equal(declaredOutput.summary.archive_file_count, 1);
    fs.writeFileSync(profile, JSON.stringify({ memory_model: 'custom_project' }));
    runCli(initArgs, env);
    runCli(['workspace', 'ensure', '--agent', 'bookforge', '--project-id', 'book-1'], env);
    assert.deepEqual(readJsonFile(profile), { memory_model: 'custom_project' });
    const legacyOutput = readback().output_lifecycle;
    assert.equal(legacyOutput.artifacts.length, declaredOutput.artifacts.length - 2);
    assert.ok(legacyOutput.artifacts.every((entry: any) => entry.role === 'output_artifact'));
    fs.rmSync(profile);
    assert.equal(readback().output_lifecycle.artifacts.length, legacyOutput.artifacts.length);
    runCli(['workspace', 'ensure', '--agent', 'bookforge', '--project-id', 'book-1'], env);
    assert.deepEqual(readJsonFile(profile), declared);
    fs.writeFileSync(profile, JSON.stringify({ output_groups: [{ ref: '../owner', role: 'outside' }] }));
    assert.equal(readback().output_lifecycle.lifecycle_profile_status, 'invalid');
    const outside = path.join(root, 'outside');
    fs.mkdirSync(outside);
    fs.writeFileSync(path.join(outside, 'private.md'), 'outside');
    fs.symlinkSync(outside, path.join(project, 'external'));
    fs.writeFileSync(profile, JSON.stringify({ output_groups: [{ ref: 'external', role: 'outside' }] }));
    const invalid = readback();
    assert.equal(invalid.output_lifecycle.lifecycle_profile_status, 'invalid');
    assert.ok(invalid.health.blockers.some((entry: any) => entry.code === 'artifact_lifecycle_profile_invalid'));
    assert.equal(invalid.output_lifecycle.artifacts.length, legacyOutput.artifacts.length);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

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
    writeBookForgeLifecycleProfile(projectRoot);
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
    assert.equal(output.workspace_artifact_lifecycle.output_lifecycle.artifacts.find((entry: any) =>
      entry.ref.endsWith('/artifacts/manuscript/chapter-manifest.json')).role, 'manuscript_artifact');
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
    writeBookForgeLifecycleProfile(projectRoot);
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
        'memory_required_refs_missing',
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
