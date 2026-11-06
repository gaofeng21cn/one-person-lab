import {
  assert,
  fs,
  path,
  test,
  fileURLToPath,
  DatabaseSync,
  buildPackBoundTemporalStageRunInput,
  createCordisBaseHeadlessComposition,
  createFamilyRuntimeQueueTables,
  createStageRunLaunchTable,
  digest,
  ensureProviderHostedStageAttempt,
  launchRegisteredStageRun,
  normalizeStageQualityCyclePolicy,
  nativeCarrierReadiness,
  packageUseBinding,
  temporaryRoot,
  writeJson,
  writeLifecycleCasReadState,
  writeLifecycleContracts,
  writeLifecycleWorkspace,
} from '../shared.ts';
import type {
  FamilyRuntimeTaskRow,
  StandardAgentStageQualityRuntimeBinding,
} from '../shared.ts';

test('public plan-only StageRun launch requires active lifecycle before durable registration', async () => {
  const fixtureRoot = temporaryRoot('opl-family-lifecycle-plan-only-');
  const checkoutRoot = path.join(fixtureRoot, 'checkout');
  const workspaceRoot = path.join(fixtureRoot, 'workspace');
  const stateRoot = path.join(fixtureRoot, 'state');
  const previousStateRoot = process.env.OPL_STATE_DIR;
  try {
    fs.mkdirSync(checkoutRoot, { recursive: true });
    fs.mkdirSync(workspaceRoot, { recursive: true });
    process.env.OPL_STATE_DIR = stateRoot;
    writeLifecycleContracts(checkoutRoot);
    const refs = writeLifecycleWorkspace(workspaceRoot);
    const files: Record<string, string> = {
      'contracts/stage-quality.json': '{}',
      'agent/prompts/intake.md': '# Intake\n',
      'agent/prompts/quality.md': [
        '# Quality',
        '## Producer', 'Produce.',
        '## Reviewer', 'Review.',
        '## Repairer', 'Repair.',
        '## Re-reviewer', 'Re-review.',
      ].join('\n'),
      'agent/quality_gates/stage.md': '# Rubric\n',
      'agent/goals/intake.md': '# Intake goal\n',
      'agent/sources/request.md': '# Request\n',
      'agent/lineage/intake.json': '{"stage_id":"intake"}\n',
    };
    for (const [relativePath, bytes] of Object.entries(files)) {
      const file = path.join(checkoutRoot, relativePath);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, bytes);
    }
    const binding: StandardAgentStageQualityRuntimeBinding = {
      surface_kind: 'opl_pack_bound_stage_quality_runtime_binding',
      version: 'opl-pack-bound-stage-quality-runtime-binding.v1',
      stage_id: 'intake',
      declared_stage_ids: ['intake'],
      enabled: true,
      stage_role: null,
      policy_ref: 'contracts/stage-quality.json',
      stage_prompt_ref: 'agent/prompts/intake.md',
      quality_policy: normalizeStageQualityCyclePolicy({
        formal_review: { required: true, risk_tier: 'high', max_repair_rounds: 1 },
      }),
      handoff_review_boundary: null,
      role_prompt_refs: {
        producer: 'agent/prompts/quality.md#producer',
        reviewer: 'agent/prompts/quality.md#reviewer',
        repairer: 'agent/prompts/quality.md#repairer',
        re_reviewer: 'agent/prompts/quality.md#re-reviewer',
      },
      quality_rubric_refs: ['agent/quality_gates/stage.md'],
      knowledge_refs: [],
      skill_refs: [],
      policy_refs: [],
      stage_goal_refs: ['agent/goals/intake.md'],
      source_refs: ['agent/sources/request.md'],
      lineage_refs: ['agent/lineage/intake.json'],
      manifest_ref: 'agent/stages/manifest.json',
      manifest_sha256: digest(fs.readFileSync(path.join(checkoutRoot, 'agent/stages/manifest.json'))),
    };
    const stageRunInput = buildPackBoundTemporalStageRunInput({
      binding,
      domainPackRoot: checkoutRoot,
      domainId: 'mas',
      stageId: 'intake',
      stageRunInvocationId: 'sri_lifecycle_plan_only',
      workspaceLocator: {
        workspace_root: workspaceRoot,
        study_id: 'study-001',
        package_use_binding: packageUseBinding(),
      },
      sourceFingerprint: `sha256:${'7'.repeat(64)}`,
      executorKind: 'codex_cli',
      actionId: 'launch_stage',
    });
    const db = new DatabaseSync(':memory:');
    createStageRunLaunchTable(db);

    try {
      await assert.rejects(
        launchRegisteredStageRun({
          db,
          stageRunInput,
          start: false,
          startWorkflow: async () => assert.fail('plan-only launch must not start Temporal'),
        }),
        /lifecycle is inactive/i,
      );
      assert.equal((db.prepare(
        'SELECT COUNT(*) AS count FROM stage_run_launches',
      ).get() as any).count, 0);

      writeJson(fileURLToPath(refs.lifecycle.ref), {
        study_id: 'study-001', lifecycle_state: 'active', lifecycle_generation: 8,
      });
      writeLifecycleCasReadState({
        stateRoot,
        workspaceRoot,
        phase: 'settled',
        transitionId: 'plan-only-open-journal',
        journal: true,
      });
      await assert.rejects(
        launchRegisteredStageRun({
          db,
          stageRunInput,
          start: false,
          startWorkflow: async () => assert.fail('plan-only launch must not start Temporal'),
        }),
        (error: any) => {
          assert.equal(error.details?.failure_code, 'domain_lifecycle_stage_launch_blocked');
          assert.equal(error.details?.observation_reason, 'workspace_cas_journal_present');
          return true;
        },
      );
      assert.equal((db.prepare(
        'SELECT COUNT(*) AS count FROM stage_run_launches',
      ).get() as any).count, 0);
      writeLifecycleCasReadState({
        stateRoot,
        workspaceRoot,
        phase: 'settled',
        transitionId: 'plan-only-settled',
        journal: false,
      });
      const planned = await launchRegisteredStageRun({
        db,
        stageRunInput,
        start: false,
        startWorkflow: async () => assert.fail('plan-only launch must not start Temporal'),
      });
      assert.equal(planned.start_status, 'registered');
      assert.equal((db.prepare(
        'SELECT COUNT(*) AS count FROM stage_run_launches',
      ).get() as any).count, 1);
    } finally {
      db.close();
    }
  } finally {
    if (previousStateRoot === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previousStateRoot;
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
test('provider-hosted launch preserves currentness observation and gates before attempt creation', async () => {
  const fixtureRoot = temporaryRoot('opl-family-lifecycle-provider-hosted-');
  const checkoutRoot = path.join(fixtureRoot, 'checkout');
  const workspaceRoot = path.join(fixtureRoot, 'workspace');
  const stateRoot = path.join(fixtureRoot, 'state');
  const previousStateRoot = process.env.OPL_STATE_DIR;
  const host = await createCordisBaseHeadlessComposition();
  const db = new DatabaseSync(':memory:');
  createFamilyRuntimeQueueTables(db);
  try {
    fs.mkdirSync(checkoutRoot, { recursive: true });
    fs.mkdirSync(workspaceRoot, { recursive: true });
    process.env.OPL_STATE_DIR = stateRoot;
    writeLifecycleContracts(checkoutRoot);
    const refs = writeLifecycleWorkspace(workspaceRoot);
    const now = new Date().toISOString();
    const row: FamilyRuntimeTaskRow = {
      task_id: 'task:lifecycle-provider-hosted',
      domain_id: 'medautoscience',
      task_kind: 'test/lifecycle-provider-hosted',
      payload_json: '{}',
      dedupe_key: null,
      priority: 0,
      status: 'queued',
      attempts: 0,
      max_attempts: 3,
      source: 'test',
      requires_approval: 0,
      approved_at: null,
      lease_owner: null,
      lease_expires_at: null,
      last_error: null,
      dead_letter_reason: null,
      created_at: now,
      updated_at: now,
    };
    const payload = {
      opl_provider_hosted_stage_attempt: true,
      stage_id: 'intake',
      study_id: 'study-001',
      workspace_root: workspaceRoot,
    };
    const options = {
      createStageRouteComposition: host.services.childFactories.createStageRouteComposition,
      ensurePackageLaunchReady: async () => ({
        runtime_source_readiness: { checkout_path: checkoutRoot },
        ...nativeCarrierReadiness(checkoutRoot),
        package_use_binding: packageUseBinding(),
      }) as never,
    };

    await assert.rejects(
      ensureProviderHostedStageAttempt(db, row, payload, options),
      /lifecycle is inactive/i,
    );
    assert.equal((db.prepare('SELECT COUNT(*) AS count FROM stage_attempts').get() as any).count, 0);

    writeJson(fileURLToPath(refs.lifecycle.ref), {
      study_id: 'study-001', lifecycle_state: 'active', lifecycle_generation: 8,
    });
    writeLifecycleCasReadState({
      stateRoot,
      workspaceRoot,
      phase: 'in_progress',
      transitionId: 'provider-pending',
      journal: true,
    });
    await assert.rejects(
      ensureProviderHostedStageAttempt(db, row, payload, options),
      /sync-pending/i,
    );
    assert.equal((db.prepare('SELECT COUNT(*) AS count FROM stage_attempts').get() as any).count, 0);
    writeLifecycleCasReadState({
      stateRoot,
      workspaceRoot,
      phase: 'settled',
      transitionId: 'provider-settled',
      journal: false,
    });
    const attempt = await ensureProviderHostedStageAttempt(db, row, payload, options);
    assert.ok(attempt);
    const launchEvent = attempt.activity_events.find((event: any) => (
      event.event_kind === 'stage_context_observed'
    ));
    assert.equal(
      launchEvent?.observation.domain_lifecycle_admission.status,
      'admitted_by_canonical_active_lifecycle',
    );
    assert.equal(launchEvent?.observation.status, 'declaration_debt');
  } finally {
    await host.dispose();
    if (previousStateRoot === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previousStateRoot;
    db.close();
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
