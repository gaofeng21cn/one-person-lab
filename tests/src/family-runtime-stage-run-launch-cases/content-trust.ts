import {
  assert,
  crypto,
  fs,
  os,
  path,
  DatabaseSync,
  test,
  pathToFileURL,
  Worker,
  createWorkItemExecutionScopeSnapshot,
  parseFamilyRuntimeCommand,
  runFamilyRuntime,
  buildPackBoundTemporalStageRunInput,
  resolveStageRunAttemptExecutorContent,
  buildCliStageRunInvocationId,
  buildHostedActionStageRunInvocationId,
  buildRouteStageRunInvocation,
  deriveStageRunId,
  stageAttemptExecutionContentBindingSha256,
  stageRunSpecSha256,
  revalidateStageRunImmutableSpecContent,
  launchRegisteredStageRun,
  materializeStageRunRoute,
  claimStageRunStart,
  findStageRunLaunch,
  inspectStageRunLaunch,
  recordStageRunClosed,
  recordStageRunStartFailure,
  recordStageRunTemporalStart,
  registerStageRunLaunch,
  requireTemporalStageRunWorkflowInputLaunchable,
  stageQualityAttemptMaterializeActivity,
  createStageAttempt,
  createFamilyRuntimeQueueTables,
  openQueueDb,
  normalizeStageQualityCyclePolicy,
  runWithWorkItemFileBoundaryInterlock,
  fixtureRoot,
  domainPackRoot,
  workspaceRoot,
  sha256,
  writeFixture,
  safeIdentityDirectory,
  manifestFixture,
  artifactFixtures,
  binding,
  packageUseBinding,
  workspaceLocator,
  stageRunInput,
  workItemExecutionScope,
  scopedStageRunInput,
  registerStageRunInConfiguredState,
  decisiveExecutionBinding,
  writeTrustedIdentityReceipt,
  temporalStartReceipt,
  workerClaim,
  workerClose,
  waitForBarrierCount,
} from './shared.ts';
test('work-item content bindings reject local root escape and cross-study receipts', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-stage-run-work-item-content-'));
  const previousStateRoot = process.env.OPL_STATE_DIR;
  process.env.OPL_STATE_DIR = stateRoot;
  try {
    const studyOne = workItemExecutionScope('study-001');
    const studyTwo = workItemExecutionScope('study-002');
    fs.mkdirSync(studyOne.canonical_work_item_root!, { recursive: true });
    assert.throws(() => stageRunInput({
      invocationId: 'sri_work_item_root_escape',
      executionScope: studyOne,
    }), (error: any) => {
      assert.equal(error.details?.failure_code, 'stage_run_artifact_outside_work_item_root');
      return true;
    });

    const localArtifact = writeFixture(
      studyOne.canonical_work_item_root!,
      'artifacts/input.json',
      '{"study_id":"study-001"}\n',
    );
    const localArtifactRef = pathToFileURL(localArtifact.filePath).href;
    const localInput = stageRunInput({
      invocationId: 'sri_work_item_local_artifact',
      executionScope: studyOne,
      artifact: { ...localArtifact, ref: localArtifactRef },
    });
    const localBinding = localInput.stage_run_spec.content_bindings.find((entry) => (
      entry.purpose === 'input_artifact' && entry.ref === localArtifactRef
    ));
    assert.equal(localBinding?.scope_kind, 'work_item');
    assert.equal(localBinding?.work_item_scope_id, studyOne.work_item_scope_id);
    assert.equal(localBinding?.scope_digest, studyOne.scope_digest);

    const localReceipt = writeTrustedIdentityReceipt({
      stateRoot,
      domainId: 'medautoscience',
      stageAttemptId: 'sat-study-001-local-owner',
      stageRunId: 'sr-study-001-local-owner',
      executionScope: studyOne,
      artifactRef: localArtifactRef,
      artifactSha256: localArtifact.sha256,
      sizeBytes: fs.statSync(localArtifact.filePath).size,
    });
    const receiptBoundLocalInput = stageRunInput({
      invocationId: 'sri_work_item_local_artifact_with_receipt',
      executionScope: studyOne,
      artifact: {
        ...localArtifact,
        ref: localArtifactRef,
        identityReceiptRef: localReceipt.ref,
      },
    });
    const receiptBoundLocalBinding = receiptBoundLocalInput.stage_run_spec.content_bindings.find((entry) => (
      entry.purpose === 'input_artifact' && entry.ref === localArtifactRef
    ));
    assert.equal(receiptBoundLocalBinding?.verification_kind, 'trusted_artifact_identity_receipt');
    assert.equal(receiptBoundLocalBinding?.identity_receipt_ref, localReceipt.ref);
    assert.equal(
      receiptBoundLocalBinding?.producing_stage_run_ref,
      'opl://stage-runs/sr-study-001-local-owner',
    );

    const sourceRef = 'https://evidence.example.invalid/study-001/source.json';
    const sourceBytes = Buffer.from('{"study_id":"study-001"}\n');
    const sourceSha256 = sha256(sourceBytes);
    const receipt = writeTrustedIdentityReceipt({
      stateRoot,
      domainId: 'medautoscience',
      stageAttemptId: 'sat-study-001-owner',
      stageRunId: 'sr-study-001-owner',
      executionScope: studyOne,
      artifactRef: sourceRef,
      artifactSha256: sourceSha256,
      sizeBytes: sourceBytes.length,
    });
    stageRunInput({
      invocationId: 'sri_work_item_receipt_same_scope',
      executionScope: studyOne,
      sourceFingerprint: sourceSha256,
      sourceRefs: [sourceRef],
      artifact: { ref: sourceRef, sha256: sourceSha256, identityReceiptRef: receipt.ref },
    });
    assert.throws(() => stageRunInput({
      invocationId: 'sri_work_item_receipt_cross_scope',
      executionScope: studyTwo,
      sourceFingerprint: sourceSha256,
      sourceRefs: [sourceRef],
      artifact: { ref: sourceRef, sha256: sourceSha256, identityReceiptRef: receipt.ref },
    }), (error: any) => {
      assert.equal(error.details?.failure_code, 'stage_run_artifact_identity_receipt_mismatch');
      return true;
    });
  } finally {
    if (previousStateRoot === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previousStateRoot;
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('StageRun build rejects a physical work-item root replacement by another Study', () => {
  const studyOne = workItemExecutionScope('study-root-rebind-build-001');
  const studyTwo = workItemExecutionScope('study-root-rebind-build-002');
  const displacedStudyOneRoot = `${studyOne.canonical_work_item_root}.displaced`;
  try {
    fs.mkdirSync(studyOne.canonical_work_item_root!, { recursive: true });
    fs.mkdirSync(studyTwo.canonical_work_item_root!, { recursive: true });
    const foreignArtifact = writeFixture(
      studyTwo.canonical_work_item_root!,
      'artifacts/rebound.json',
      '{"study_id":"study-root-rebind-build-002"}\n',
    );
    fs.renameSync(studyOne.canonical_work_item_root!, displacedStudyOneRoot);
    fs.renameSync(studyTwo.canonical_work_item_root!, studyOne.canonical_work_item_root!);
    const reboundArtifactRef = pathToFileURL(path.join(
      studyOne.canonical_work_item_root!,
      'artifacts/rebound.json',
    )).href;

    assert.throws(() => stageRunInput({
      invocationId: 'sri_work_item_root_rebind_build',
      executionScope: studyOne,
      artifact: { ref: reboundArtifactRef, sha256: foreignArtifact.sha256 },
    }), (error: any) => {
      assert.equal(
        error.details?.failure_code,
        'stage_run_artifact_work_item_root_identity_drift',
      );
      return true;
    });
  } finally {
    fs.rmSync(studyOne.canonical_work_item_root!, { recursive: true, force: true });
    fs.rmSync(displacedStudyOneRoot, { recursive: true, force: true });
    fs.rmSync(studyTwo.canonical_work_item_root!, { recursive: true, force: true });
  }
});

test('StageRun revalidation rejects a physical work-item root replacement after spec creation', () => {
  const studyOne = workItemExecutionScope('study-root-rebind-revalidate-001');
  const studyTwo = workItemExecutionScope('study-root-rebind-revalidate-002');
  const displacedStudyOneRoot = `${studyOne.canonical_work_item_root}.displaced`;
  try {
    fs.mkdirSync(studyOne.canonical_work_item_root!, { recursive: true });
    fs.mkdirSync(studyTwo.canonical_work_item_root!, { recursive: true });
    const originalArtifact = writeFixture(
      studyOne.canonical_work_item_root!,
      'artifacts/rebound.json',
      '{"study_id":"study-root-rebind-revalidate-001"}\n',
    );
    const input = stageRunInput({
      invocationId: 'sri_work_item_root_rebind_revalidate',
      executionScope: studyOne,
      artifact: {
        ref: pathToFileURL(originalArtifact.filePath).href,
        sha256: originalArtifact.sha256,
      },
    });
    writeFixture(
      studyTwo.canonical_work_item_root!,
      'artifacts/rebound.json',
      '{"study_id":"study-root-rebind-revalidate-001"}\n',
    );
    fs.renameSync(studyOne.canonical_work_item_root!, displacedStudyOneRoot);
    fs.renameSync(studyTwo.canonical_work_item_root!, studyOne.canonical_work_item_root!);

    assert.throws(() => revalidateStageRunImmutableSpecContent({
      spec: input.stage_run_spec,
      domainPackRoot,
      workspaceLocator: input.workspace_locator,
      scopeKind: input.scope_kind ?? (input.execution_scope ? 'work_item' : 'domain'),
      executionScope: input.execution_scope ?? null,
    }), (error: any) => {
      assert.equal(error.details?.failure_code, 'stage_run_artifact_scope_binding_mismatch');
      assert.equal(
        error.details?.boundary_failure_code,
        'work_item_file_boundary_root_attestation_mismatch',
      );
      return true;
    });
  } finally {
    fs.rmSync(studyOne.canonical_work_item_root!, { recursive: true, force: true });
    fs.rmSync(displacedStudyOneRoot, { recursive: true, force: true });
    fs.rmSync(studyTwo.canonical_work_item_root!, { recursive: true, force: true });
  }
});

test('StageRun rejects an unknown verification kind before it can bypass cross-Study file scope', () => {
  const studyOne = workItemExecutionScope('study-unknown-kind-001');
  const studyTwo = workItemExecutionScope('study-unknown-kind-002');
  try {
    const sharedBytes = '{"content":"same bytes in two Studies"}\n';
    const studyOneArtifact = writeFixture(
      studyOne.canonical_work_item_root!,
      'artifacts/input.json',
      sharedBytes,
    );
    const studyTwoArtifact = writeFixture(
      studyTwo.canonical_work_item_root!,
      'artifacts/input.json',
      sharedBytes,
    );
    const input = stageRunInput({
      invocationId: 'sri_work_item_unknown_verification_kind',
      executionScope: studyOne,
      artifact: {
        ref: pathToFileURL(studyOneArtifact.filePath).href,
        sha256: studyOneArtifact.sha256,
      },
    });
    const tamperedSpec = structuredClone(input.stage_run_spec);
    const inputArtifactBinding = tamperedSpec.content_bindings.find((binding) => (
      binding.purpose === 'input_artifact'
    ));
    assert.ok(inputArtifactBinding);
    inputArtifactBinding.ref = pathToFileURL(studyTwoArtifact.filePath).href;
    (inputArtifactBinding as any).verification_kind = 'unregistered_workspace_bytes';
    tamperedSpec.input_artifacts = [{
      ref: pathToFileURL(studyTwoArtifact.filePath).href,
      sha256: studyTwoArtifact.sha256,
      identity_receipt_ref: null,
    }];
    const tamperedInput = {
      ...input,
      stage_run_spec: tamperedSpec,
      stage_run_spec_sha256: stageRunSpecSha256(tamperedSpec),
      artifact_refs: tamperedSpec.input_artifacts.map((artifact) => artifact.ref),
      artifact_hashes: tamperedSpec.input_artifacts.map((artifact) => artifact.sha256),
      artifact_identity_receipt_refs: [],
    };
    const db = new DatabaseSync(':memory:');
    try {
      assert.throws(() => registerStageRunLaunch(db, tamperedInput), (error: any) => {
        assert.equal(error.details?.failure_code, 'stage_run_content_verification_kind_invalid');
        return true;
      });
    } finally {
      db.close();
    }
  } finally {
    fs.rmSync(studyOne.canonical_work_item_root!, { recursive: true, force: true });
    fs.rmSync(studyTwo.canonical_work_item_root!, { recursive: true, force: true });
  }
});

test('StageRun input artifacts cannot be rebound as managed package bytes', () => {
  const studyOne = workItemExecutionScope('study-managed-kind-bypass-001');
  try {
    const localArtifact = writeFixture(
      studyOne.canonical_work_item_root!,
      'artifacts/input.json',
      '{"study_id":"study-managed-kind-bypass-001"}\n',
    );
    const input = stageRunInput({
      invocationId: 'sri_input_artifact_managed_kind_bypass',
      executionScope: studyOne,
      artifact: {
        ref: pathToFileURL(localArtifact.filePath).href,
        sha256: localArtifact.sha256,
      },
    });
    const managedRef = 'agent/sources/request.md';
    const managedSha256 = sha256(fs.readFileSync(path.join(domainPackRoot, managedRef)));
    const tamperedSpec = structuredClone(input.stage_run_spec);
    const inputArtifactBinding = tamperedSpec.content_bindings.find((binding) => (
      binding.purpose === 'input_artifact'
    ));
    assert.ok(inputArtifactBinding);
    Object.assign(inputArtifactBinding, {
      ref: managedRef,
      sha256: managedSha256,
      verification_kind: 'managed_pack_file_bytes',
      identity_receipt_ref: null,
      producing_attempt_ref: null,
      scope_kind: null,
      work_item_scope_id: null,
      scope_digest: null,
    });
    tamperedSpec.input_artifacts = [{
      ref: managedRef,
      sha256: managedSha256,
      identity_receipt_ref: null,
    }];
    const tamperedInput = {
      ...input,
      stage_run_spec: tamperedSpec,
      stage_run_spec_sha256: stageRunSpecSha256(tamperedSpec),
      artifact_refs: [managedRef],
      artifact_hashes: [managedSha256],
      artifact_identity_receipt_refs: [],
    };
    const db = new DatabaseSync(':memory:');
    try {
      assert.throws(() => registerStageRunLaunch(db, tamperedInput), (error: any) => {
        assert.equal(error.details?.failure_code, 'stage_run_content_binding_authority_mismatch');
        return true;
      });
    } finally {
      db.close();
    }
  } finally {
    fs.rmSync(studyOne.canonical_work_item_root!, { recursive: true, force: true });
  }
});

test('StageRun revalidation classifies file drift independently from root drift', async () => {
  const studyOne = workItemExecutionScope('study-content-file-drift-001');
  try {
    const artifact = writeFixture(
      studyOne.canonical_work_item_root!,
      'artifacts/input.json',
      '{"study_id":"study-content-file-drift-001"}\n',
    );
    const input = stageRunInput({
      invocationId: 'sri_content_file_drift',
      executionScope: studyOne,
      artifact: {
        ref: pathToFileURL(artifact.filePath).href,
        sha256: artifact.sha256,
      },
    });
    await assert.rejects(() => runWithWorkItemFileBoundaryInterlock({
      temporaryRoot: workspaceRoot,
      point: 'after_file_open',
      mutation: { kind: 'append_file', file_path: artifact.filePath, bytes: 'changed during verification\n' },
      invoke: () => revalidateStageRunImmutableSpecContent({
        spec: input.stage_run_spec,
        domainPackRoot,
        workspaceLocator: input.workspace_locator,
        scopeKind: input.scope_kind ?? 'work_item',
        executionScope: input.execution_scope ?? null,
        skipManagedPackBytes: true,
      }),
    }), (error: any) => {
      assert.equal(error.details?.failure_code, 'stage_run_content_changed_during_verification');
      assert.equal(error.details?.boundary_failure_code, 'work_item_file_boundary_ref_drift');
      return true;
    });
  } finally {
    fs.rmSync(studyOne.canonical_work_item_root!, { recursive: true, force: true });
  }
});

test('every child Attempt preserves parent evidence and binds the latest execution snapshot', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-stage-run-child-content-'));
  const previousStateRoot = process.env.OPL_STATE_DIR;
  const stagePromptPath = path.join(domainPackRoot, 'agent/prompts/intake.md');
  const rubricPath = path.join(domainPackRoot, 'agent/quality_gates/stage.md');
  const originalStagePrompt = fs.readFileSync(stagePromptPath);
  const originalRubric = fs.readFileSync(rubricPath);
  const executionPackRoot = path.join(stateRoot, 'current-pack');
  fs.cpSync(domainPackRoot, executionPackRoot, { recursive: true });
  const currentStagePromptPath = path.join(executionPackRoot, 'agent/prompts/intake.md');
  const currentRolePromptPath = path.join(executionPackRoot, 'agent/prompts/stage-quality.md');
  const currentRubricPath = path.join(executionPackRoot, 'agent/quality_gates/stage.md');
  fs.writeFileSync(currentStagePromptPath, '# intake prompt from current package\n');
  fs.writeFileSync(
    currentRolePromptPath,
    '# Stage quality roles\n\n## Producer\nUse the current producer policy.\n\n## Reviewer\nUse the current reviewer policy.\n\n## Repairer\nRepair current findings.\n\n## Re-reviewer\nClose current findings.\n',
  );
  const currentUseBinding = packageUseBinding({
    packageVersion: '0.2.2',
  });
  const materializationOptions = {
    ensurePackageLaunchReady: async () => ({
      runtime_source_readiness: {
        status: 'current',
        checkout_path: executionPackRoot,
        operational_ready: true,
      },
      package_use_binding: currentUseBinding,
    }),
    resolveStageBinding: () => binding(),
  };
  process.env.OPL_STATE_DIR = stateRoot;
  try {
    const input = stageRunInput({ invocationId: 'sri_child_executor_content' });
    registerStageRunInConfiguredState(input);
    const materialized = await stageQualityAttemptMaterializeActivity({
      stage_run: input,
      quality_cycle_id: 'sqc_child_executor_content',
      attempt_role: 'producer',
      quality_round_index: 0,
      artifact_refs: input.artifact_refs ?? [],
      artifact_hashes: input.artifact_hashes ?? [],
      artifact_identity_receipt_refs: input.artifact_identity_receipt_refs ?? [],
    }, materializationOptions);
    assert.equal(
      materialized.workflow_input.stage_run_content_binding_version,
      'opl-stage-run-attempt-content-binding.v1',
    );
    assert.deepEqual(materialized.workflow_input.stage_run_spec, input.stage_run_spec);
    assert.equal(materialized.workflow_input.stage_run_spec_sha256, input.stage_run_spec_sha256);
    assert.equal(materialized.workflow_input.domain_pack_root, executionPackRoot);
    assert.equal(
      materialized.workflow_input.execution_content_binding?.parent_stage_run_spec_sha256,
      input.stage_run_spec_sha256,
    );
    assert.equal(
      (materialized.workflow_input.execution_content_binding?.spec.package_closure as any)
        ?.root_package?.package_version,
      '0.2.2',
    );
    assert.deepEqual(
      materialized.workflow_input.execution_content_binding?.declared_stage_ids,
      ['draft', 'intake', 'review'],
    );
    assert.equal(
      materialized.workflow_input.execution_content_binding?.binding_sha256,
      stageAttemptExecutionContentBindingSha256(
        materialized.workflow_input.execution_content_binding!,
      ),
    );
    const { stage_run_content_binding_version: _bindingVersion, ...unboundChild } = materialized.workflow_input;
    assert.throws(() => resolveStageRunAttemptExecutorContent(unboundChild), (error: any) => {
      assert.equal(error.details?.failure_code, 'stage_run_child_content_binding_version_missing');
      return true;
    });
    const resolved = resolveStageRunAttemptExecutorContent(materialized.workflow_input);
    assert.equal(resolved.effectiveStagePrompt?.content, '# intake prompt from current package\n');
    assert.match(resolved.effectiveQualityRolePrompt?.content ?? '', /current producer policy/);
    assert.throws(() => resolveStageRunAttemptExecutorContent({
      ...materialized.workflow_input,
      execution_content_binding: {
        ...materialized.workflow_input.execution_content_binding!,
        declared_stage_ids: ['draft', 'intake', 'new-stage', 'review'],
      },
    }), (error: any) => {
      assert.equal(error.details?.failure_code, 'stage_attempt_execution_content_binding_mismatch');
      return true;
    });

    // Parent bytes are historical evidence. Their later availability or drift cannot invalidate this Attempt.
    fs.appendFileSync(stagePromptPath, 'changed-after-child-materialization\n');
    fs.appendFileSync(rubricPath, 'historical-parent-rubric-drift\n');
    assert.doesNotThrow(() => resolveStageRunAttemptExecutorContent(materialized.workflow_input));

    // The immutable snapshot selected for this Attempt must remain byte-stable while it executes.
    fs.appendFileSync(currentStagePromptPath, 'changed-after-child-materialization\n');
    assert.throws(() => resolveStageRunAttemptExecutorContent(materialized.workflow_input), (error: any) => {
      assert.equal(error.details?.failure_code, 'stage_run_content_binding_stale');
      assert.equal(error.details?.ref, 'agent/prompts/intake.md');
      assert.ok(['lineage', 'stage_prompt'].includes(error.details?.purpose));
      return true;
    });
    fs.writeFileSync(currentStagePromptPath, '# intake prompt from current package\n');

    // A newer package appearing before the next Attempt is captured as that Attempt's current truth.
    fs.appendFileSync(currentRubricPath, 'new rubric rule before next attempt\n');
    fs.writeFileSync(
      currentRolePromptPath,
      fs.readFileSync(currentRolePromptPath, 'utf8').replace(
        'Use the current producer policy.',
        'Use the newer producer policy.',
      ),
    );
    const next = await stageQualityAttemptMaterializeActivity({
      stage_run: input,
      quality_cycle_id: 'sqc_child_next_current_snapshot',
      attempt_role: 'producer',
      quality_round_index: 0,
      artifact_refs: input.artifact_refs ?? [],
      artifact_hashes: input.artifact_hashes ?? [],
      artifact_identity_receipt_refs: input.artifact_identity_receipt_refs ?? [],
    }, materializationOptions);
    const nextResolved = resolveStageRunAttemptExecutorContent(next.workflow_input);
    assert.match(nextResolved.effectiveQualityRolePrompt?.content ?? '', /newer producer policy/);
    assert.notEqual(
      next.workflow_input.execution_content_binding?.spec_sha256,
      materialized.workflow_input.execution_content_binding?.spec_sha256,
    );
  } finally {
    fs.writeFileSync(stagePromptPath, originalStagePrompt);
    fs.writeFileSync(rubricPath, originalRubric);
    if (previousStateRoot === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previousStateRoot;
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('Temporal materialization retry reuses the first child Attempt and package-use binding', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-stage-run-child-retry-'));
  const previousStateRoot = process.env.OPL_STATE_DIR;
  const firstPackRoot = path.join(stateRoot, 'first-pack');
  const laterPackRoot = path.join(stateRoot, 'later-pack');
  fs.cpSync(domainPackRoot, firstPackRoot, { recursive: true });
  fs.cpSync(domainPackRoot, laterPackRoot, { recursive: true });
  fs.writeFileSync(
    path.join(laterPackRoot, 'agent/prompts/stage-quality.md'),
    '# Stage quality roles\n\n## Producer\nUse the later producer policy.\n',
  );
  const firstUseBinding = {
    ...packageUseBinding({
      checkedAt: '2026-07-14T00:00:00.000Z',
      packageVersion: '0.2.2',
    }),
    use_boundary_id: 'package-use:retry-first',
  };
  const laterUseBinding = {
    ...packageUseBinding({
      checkedAt: '2026-07-14T00:01:00.000Z',
      packageVersion: '0.2.3',
    }),
    use_boundary_id: 'package-use:retry-later',
  };
  const firstStageBinding = binding();
  const laterStageBinding = {
    ...binding(),
    role_prompt_refs: {
      ...binding().role_prompt_refs,
      producer: 'agent/prompts/stage-quality.md#later-producer',
    },
  };
  let readinessCalls = 0;
  let bindingCalls = 0;
  const materializationOptions = {
    ensurePackageLaunchReady: async () => {
      const snapshot = readinessCalls === 0
        ? { checkoutRoot: firstPackRoot, useBinding: firstUseBinding }
        : { checkoutRoot: laterPackRoot, useBinding: laterUseBinding };
      readinessCalls += 1;
      return {
        runtime_source_readiness: {
          status: 'current',
          checkout_path: snapshot.checkoutRoot,
          operational_ready: true,
        },
        package_use_binding: snapshot.useBinding,
      };
    },
    resolveStageBinding: () => {
      const snapshot = bindingCalls === 0 ? firstStageBinding : laterStageBinding;
      bindingCalls += 1;
      return snapshot;
    },
  };
  process.env.OPL_STATE_DIR = stateRoot;
  try {
    const stageRun = stageRunInput({ invocationId: 'sri_child_temporal_retry' });
    registerStageRunInConfiguredState(stageRun);
    const materializationInput = {
      stage_run: stageRun,
      quality_cycle_id: 'sqc_child_temporal_retry',
      attempt_role: 'producer' as const,
      quality_round_index: 0,
      artifact_refs: stageRun.artifact_refs ?? [],
      artifact_hashes: stageRun.artifact_hashes ?? [],
      artifact_identity_receipt_refs: stageRun.artifact_identity_receipt_refs ?? [],
    };

    const first = await stageQualityAttemptMaterializeActivity(
      materializationInput,
      materializationOptions,
    );
    const retry = await stageQualityAttemptMaterializeActivity(
      materializationInput,
      materializationOptions,
    );

    assert.equal(readinessCalls, 1);
    assert.equal(bindingCalls, 1);
    assert.equal(retry.attempt_ref, first.attempt_ref);
    assert.deepEqual(
      retry.workflow_input.execution_content_binding,
      first.workflow_input.execution_content_binding,
    );
    assert.equal(
      retry.workflow_input.execution_content_binding?.use_boundary_id,
      firstUseBinding.use_boundary_id,
    );
    assert.equal(
      Object.hasOwn(retry.workflow_input.workspace_locator.package_use_binding as object, 'use_receipt_ref'),
      false,
    );

    const db = new DatabaseSync(path.join(stateRoot, 'family-runtime', 'queue.sqlite'));
    try {
      const count = db.prepare(`
        SELECT COUNT(*) AS count
        FROM stage_attempts
        WHERE stage_run_id = ? AND quality_cycle_id = ?
      `).get(stageRun.stage_run_id, materializationInput.quality_cycle_id) as { count: number };
      assert.equal(count.count, 1);
    } finally {
      db.close();
    }
  } finally {
    if (previousStateRoot === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previousStateRoot;
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});
