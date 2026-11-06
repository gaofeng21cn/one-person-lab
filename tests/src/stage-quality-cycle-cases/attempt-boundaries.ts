import {
  test,
  assert,
  crypto,
  fs,
  os,
  path,
  DatabaseSync,
  FrameworkContractError,
  buildStageReviewContextManifest,
  classifyCodexSessionContinuation,
  evaluateStageQualityFindingClosure,
  initialStageQualityCycleState,
  normalizeStageQualityArtifactIdentity,
  normalizeStageQualityCyclePolicy,
  reduceStageQualityCycleState,
  stageQualityAttemptOutcomeFromEnvelope,
  STAGE_QUALITY_OUTCOMES,
  validateInitialStageQualityReviewOutcome,
  validateIndependentStageReviewReceipt,
  buildFamilyStageConformanceReview,
  bindStageAttemptExecutionSession,
  createStageAttempt,
  createStageAttemptTable,
  inspectStageAttempt,
  materializePersistedStageReviewReceipt,
  syncStageAttemptFromTemporalTerminalObservation,
  validatePersistedStageReviewIsolation,
  buildCodexStageActivityInput,
  requireTemporalStageRunWorkflowInputLaunchable,
  createStageQualityCycle,
  projectTemporalStageRunQualityCycle,
  requireStageQualityAttemptBoundary,
  buildPackBoundTemporalStageRunInput,
  buildStageQualityContextManifestRef,
  buildStageReviewInputSnapshotContext,
  resolveReviewerInputSnapshotMaterialization,
  OFFICIAL_KNOWLEDGE_DELIVERABLE_QUALITY_PROFILE,
  STANDARD_AGENT_REGISTRY,
  createWorkItemExecutionScopeSnapshot,
  createStageRunLaunchTable,
  buildStageRouteDecisionIdentity,
  normalizeRuntimeExecutionScopeWrite,
  persistRuntimeExecutionScope,
  repoRoot,
  qualityContextBinding,
  persistReviewExecutionScope,
  persistDomainStageRun,
  reviewReceipt,
} from './shared.ts';
import type { StandardAgentStageQualityRuntimeBinding, TemporalStageRunWorkflowState } from './shared.ts';
test('StageRun controller input rejects custom Attempt roles and quality budgets above three', (t) => {
  const invocationId = 'stage-run-invocation:bounded';
  const policy = normalizeStageQualityCyclePolicy({
    formal_review: { required: true, risk_tier: 'high', max_repair_rounds: 3 },
  });
  const domainPackRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-stage-run-boundary-'));
  t.after(() => fs.rmSync(domainPackRoot, { recursive: true, force: true }));
  const fixtureRef = 'agent/stages/manifest.json';
  const fixturePath = path.join(domainPackRoot, fixtureRef);
  const fixtureBytes = Buffer.from('{"stages":["artifact_creation","review_and_revision"]}\n');
  fs.mkdirSync(path.dirname(fixturePath), { recursive: true });
  fs.writeFileSync(fixturePath, fixtureBytes);
  fs.mkdirSync(path.join(domainPackRoot, 'contracts'), { recursive: true });
  fs.writeFileSync(
    path.join(domainPackRoot, 'contracts/durable_knowledge_catalog.json'),
    JSON.stringify({
      surface_kind: 'opl_durable_knowledge_catalog',
      version: 'durable-knowledge-catalog.v1',
      owner: 'one-person-lab',
      items: [],
    }),
  );
  const rolePromptRef = 'agent/prompts/stage-quality-cycle-roles.md';
  const rolePromptPath = path.join(domainPackRoot, rolePromptRef);
  fs.mkdirSync(path.dirname(rolePromptPath), { recursive: true });
  fs.writeFileSync(rolePromptPath, [
    '## Producer', 'Produce the artifact.',
    '## Reviewer', 'Review exact artifact bytes.',
    '## Repairer', 'Repair required findings.',
    '## Re Reviewer', 'Close prior findings.',
    '',
  ].join('\n'));
  const fixtureSha256 = crypto.createHash('sha256').update(fixtureBytes).digest('hex');
  const binding: StandardAgentStageQualityRuntimeBinding = {
    surface_kind: 'opl_pack_bound_stage_quality_runtime_binding',
    version: 'opl-pack-bound-stage-quality-runtime-binding.v1',
    stage_id: 'artifact_creation',
    declared_stage_ids: ['artifact_creation', 'review_and_revision'],
    enabled: true,
    stage_role: null,
    policy_ref: `${fixtureRef}#/policy`,
    stage_prompt_ref: `${fixtureRef}#/stage-prompt`,
    quality_policy: policy,
    handoff_review_boundary: null,
    role_prompt_refs: {
      producer: `${rolePromptRef}#producer`,
      reviewer: `${rolePromptRef}#reviewer`,
      repairer: `${rolePromptRef}#repairer`,
      re_reviewer: `${rolePromptRef}#re-reviewer`,
    },
    quality_rubric_refs: [`${fixtureRef}#/rubric`],
    knowledge_refs: [],
    skill_refs: [],
    policy_refs: [],
    stage_goal_refs: [`${fixtureRef}#/goal`],
    source_refs: [`${fixtureRef}#/source`],
    lineage_refs: [],
    manifest_ref: fixtureRef,
    manifest_sha256: fixtureSha256,
  };
  const base = buildPackBoundTemporalStageRunInput({
    binding,
    domainPackRoot,
    domainId: 'redcube',
    stageId: 'artifact_creation',
    stageRunInvocationId: invocationId,
    workspaceLocator: {
      workspace_root: '/tmp/rca-quality-cycle',
      package_use_binding: {
        root_package: {
          package_id: 'redcube',
          package_version: '0.0.0-test',
          owner_language_version: { scheme: 'semver', value: '0.0.0-test' },
          package_lock_ref: 'opl://package-lock/redcube/test',
          manifest_sha256: fixtureSha256,
          content_digest: 'a'.repeat(64),
        },
        provider_packages: [],
        dependency_closure_digest: 'b'.repeat(64),
      },
    },
    sourceFingerprint: null,
    executorKind: 'codex_cli',
  });
  assert.equal(requireTemporalStageRunWorkflowInputLaunchable(base), base);
  assert.throws(() => requireTemporalStageRunWorkflowInputLaunchable({
    ...base,
    role_prompt_refs: { ...base.role_prompt_refs, analysis_redesign: 'prompt:forbidden' },
  } as any), /bounded Framework Attempt roles/);
  assert.throws(() => requireTemporalStageRunWorkflowInputLaunchable({
    ...base,
    quality_policy: {
      ...base.quality_policy,
      formal_review: { ...base.quality_policy.formal_review, max_repair_rounds: 4 },
    },
  }), /between zero and three/);
});

test('StageAttempt cannot own Stage topology or transition authority', () => {
  const db = new DatabaseSync(':memory:');
  try {
    createStageAttemptTable(db);
    assert.throws(() => createStageAttempt(db, {
      domainId: 'redcube',
      stageId: 'artifact_creation',
      providerKind: 'temporal',
      workspaceLocator: { workspace_root: '/tmp/rca-quality-cycle' },
      next_stage_refs: ['review_and_revision'],
    } as any), /cannot own Stage semantics or transition authority/);
  } finally {
    db.close();
  }
});

test('Temporal child input independently enforces context isolation and finding lineage', () => {
  const base = {
    stage_run_id: 'stage-run:rca/artifact-creation',
    quality_cycle_id: 'quality-cycle:rca/artifact-creation',
    attempt_role: 'reviewer',
    quality_round_index: 0,
    parent_attempt_ref: 'opl://stage_attempts/producer',
    parent_attempt_lineage: {
      stage_run_id: 'stage-run:rca/artifact-creation',
      quality_cycle_id: 'quality-cycle:rca/artifact-creation',
    },
    quality_role_prompt_ref: 'prompt:reviewer',
    context_manifest_ref: 'context:reviewer',
    no_context_inheritance: true,
    quality_rubric_refs: ['rubric:visual'],
    input_artifact_refs: ['artifact:deck-v1'],
    reviewed_artifact_hashes: ['sha256:deck-v1'],
  };
  assert.equal(requireStageQualityAttemptBoundary(base), base);
  assert.throws(() => requireStageQualityAttemptBoundary({
    ...base,
    no_context_inheritance: false,
  }), /no_context_inheritance=true/);
  assert.throws(() => requireStageQualityAttemptBoundary({
    ...base,
    attempt_role: 're_reviewer',
    quality_round_index: 1,
  }), /prior finding and repair map refs/);
  assert.throws(() => requireStageQualityAttemptBoundary({
    ...base,
    next_stage_refs: ['review_and_revision'],
  }), /cannot own Stage semantics/);
});

test('StageRun controller quality cycle id is preserved by the SQLite projection helper', () => {
  const db = new DatabaseSync(':memory:');
  try {
    createStageAttemptTable(db);
    persistDomainStageRun(db, {
      stageRunId: 'stage-run:rca/artifact-creation',
      domainId: 'redcube',
      stageId: 'artifact_creation',
    });
    const input = {
      qualityCycleId: 'quality-cycle:stage-run:rca/artifact-creation',
      stageRunId: 'stage-run:rca/artifact-creation',
      domainId: 'redcube' as const,
      stageId: 'artifact_creation',
      policy: { formal_review: { required: true, risk_tier: 'high' } },
    };
    const first = createStageQualityCycle(db, input);
    const second = createStageQualityCycle(db, input);
    assert.equal(first.cycle.quality_cycle_id, input.qualityCycleId);
    assert.equal(second.created, false);
    persistDomainStageRun(db, {
      stageRunId: 'stage-run:rca/different-stage-run',
      domainId: 'redcube',
      stageId: 'artifact_creation',
    });
    assert.throws(() => createStageQualityCycle(db, {
      ...input,
      stageRunId: 'stage-run:rca/different-stage-run',
    }), /already bound to a different StageRun identity or policy/);
  } finally {
    db.close();
  }
});
