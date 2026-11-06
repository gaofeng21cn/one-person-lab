import * as shared from './shared.ts';
import assert from 'node:assert/strict';

const {
  spawnSync,
  fs,
  os,
  path,
  test,
  buildDomainPackCompilerList,
  buildGeneratedAgentInterfaces,
  buildRepoGeneratedInterfaceBundle,
  buildStandardAgentRepoContractReadout,
  compileStandardAgentStageManifest,
  resolveStandardAgentStageQualityRuntimeBinding,
  FrameworkContractError,
  normalizeFamilyStageControlPlane,
  buildReadyAgentRepo,
  retargetReadyRepo,
  HOSTED_FOUNDRY_GENERATED_SURFACE_HANDOFF_DEFAULTS_PROFILE,
  resolveGeneratedSurfaceHandoffContract,
  STANDARD_GENERATED_SURFACE_HANDOFF_DEFAULTS_PROFILE,
  REPO_ROOT,
  writeJson,
  writeText,
  resolvePython3Executable,
  writePrimaryOnlyDeliverPolicy,
  fixture,
  readManifest,
  writeManifest,
} = shared;
type JsonRecord = shared.JsonRecord;

test('standard Agent stage manifest compiler keeps stable domain identity and target separation', () => {
  const alphaRoot = fixture('target-alpha', 'agent-alpha');
  const betaRoot = fixture('target-beta', 'agent-beta');
  const alpha = compileStandardAgentStageManifest(alphaRoot);
  const alphaAgain = compileStandardAgentStageManifest(alphaRoot);
  const beta = compileStandardAgentStageManifest(betaRoot);

  assert.equal(alpha.stage_control_plane.plane_id, 'target_alpha_stage_control_plane');
  assert.equal(alpha.source_binding.canonical_agent_id, 'agent-alpha');
  assert.equal(alpha.source_binding.domain_id, 'target-alpha');
  assert.equal(alphaAgain.stage_control_plane.plane_id, alpha.stage_control_plane.plane_id);
  assert.equal(alphaAgain.source_binding.stage_manifest_sha256, alpha.source_binding.stage_manifest_sha256);
  assert.notEqual(beta.stage_control_plane.plane_id, alpha.stage_control_plane.plane_id);
  assert.deepEqual(alpha.stage_control_plane.stages[0]?.display_names, {
    'en-US': 'Intake',
    'fr-FR': 'Accueil',
  });
  assert.equal(
    alpha.stage_control_plane.stages[0]?.title,
    alpha.stage_control_plane.stages[0]?.display_names?.['en-US'],
  );
  assert.deepEqual(alpha.stage_control_plane.stages[0]?.skills.map((entry) => entry.ref), ['agent/skills/domain.md']);
  assert.deepEqual(alpha.stage_control_plane.stages[0]?.tool_refs?.map((entry) => entry.ref), ['agent/tools/domain.md']);
  assert.deepEqual(alpha.stage_control_plane.stages[0]?.allowed_action_refs, ['inspect']);
  const promptRef = alpha.stage_control_plane.stages[0]?.prompt_refs[0];
  assert.equal(promptRef?.layer, 'domain_stage_main_prompt');
  assert.equal(promptRef?.content, '# agent/prompts/intake.md\n');
  assert.match(promptRef?.sha256 ?? '', /^[a-f0-9]{64}$/);
  assert.equal(promptRef?.size_bytes, Buffer.byteLength('# agent/prompts/intake.md\n', 'utf8'));
  assert.deepEqual((alpha.stage_control_plane.stages[0]?.handoff as JsonRecord).next_stage_refs, ['deliver']);
  assert.deepEqual(
    (alpha.stage_control_plane.stages[1]?.handoff as JsonRecord).review_boundary,
    {
      artifact_effect: 'reviewed_immutable_refs_only',
      freezes_canonical_artifact_bytes: false,
      issues_quality_export_publication_or_ready_claim: false,
      downstream_owner_retains_acceptance: true,
    },
  );
  assert.equal(alpha.stage_control_plane.authority_boundary.opl_can_sign_owner_receipt, false);
  assert.equal('target_agent_ref' in alpha.stage_control_plane, false);

  const readout = buildStandardAgentRepoContractReadout(alphaRoot);
  assert.equal(readout.canonical_agent_id, 'agent-alpha');
  assert.equal(readout.target_domain_id, 'target-alpha');
  assert.equal(readout.source_binding?.canonical_agent_id, 'agent-alpha');
  const generated = buildRepoGeneratedInterfaceBundle(alphaRoot, 'product-entry').bundle as JsonRecord;
  assert.equal(generated.agent_id, 'agent-alpha');
  assert.equal(generated.target_domain_id, 'target-alpha');
});

test('target Stage binding does not inherit an unrelated later Stage quality failure', () => {
  const root = fixture('target-stage-local-binding');
  writePrimaryOnlyDeliverPolicy(root);
  const manifest = readManifest(root);
  manifest.stages[0].prompt_ref = 'agent/prompts/deliver.md';
  manifest.stages[0].stage_quality_cycle_policy_ref = 'contracts/stage_quality_cycle_policy.json#/stages/deliver';
  manifest.stages[1].stage_quality_cycle_policy_ref = 'contracts/stage_quality_cycle_policy.json#/stages/missing-later-stage';
  writeManifest(root, manifest);

  assert.throws(() => compileStandardAgentStageManifest(root), FrameworkContractError);
  const binding = resolveStandardAgentStageQualityRuntimeBinding(root, manifest.stages[0].stage_id);
  assert.equal(binding?.compile_mode, 'target_stage_binding');
  assert.equal(binding?.stage_id, manifest.stages[0].stage_id);
});

test('Python callable validation disables bytecode even when isolated mode ignores Python env', () => {
  const root = fixture('target-python-bytecode');
  const moduleRoot = path.join(root, 'runtime', 'authority_functions');
  const modulePath = path.join(moduleRoot, 'handler.py');
  const argsRecordPath = path.join(root, 'python-probe-args.txt');
  const pythonWrapperPath = path.join(root, 'python-probe-wrapper');
  const pythonExecutable = resolvePython3Executable();
  const previousPython = process.env.PYTHON;
  const previousRealPython = process.env.OPL_TEST_REAL_PYTHON;
  const previousArgsRecord = process.env.OPL_TEST_PYTHON_ARGS_RECORD;

  fs.writeFileSync(modulePath, 'def execute():\n    return "ready"\n');
  fs.chmodSync(modulePath, 0o444);
  writeJson(root, 'contracts/domain_handler_registry.json', {
    surface_kind: 'domain_handler_registry',
    version: 'domain-handler-registry.v1',
    handlers: [{
      handler_id: 'python.execute',
      binding: {
        kind: 'python_callable',
        module: 'runtime.authority_functions.handler',
        callable: 'execute',
      },
    }],
  });
  fs.writeFileSync(
    pythonWrapperPath,
    [
      '#!/bin/sh',
      'printf "%s\\n%s\\n%s\\n" "$1" "$2" "$3" > "$OPL_TEST_PYTHON_ARGS_RECORD"',
      'exec "$OPL_TEST_REAL_PYTHON" "$@"',
      '',
    ].join('\n'),
  );
  fs.chmodSync(pythonWrapperPath, 0o755);

  try {
    process.env.PYTHON = pythonWrapperPath;
    process.env.OPL_TEST_REAL_PYTHON = pythonExecutable;
    process.env.OPL_TEST_PYTHON_ARGS_RECORD = argsRecordPath;
    assert.doesNotThrow(() => compileStandardAgentStageManifest(root));
    assert.deepEqual(fs.readFileSync(argsRecordPath, 'utf8').trim().split('\n'), ['-I', '-B', '-c']);

    const importProbe = 'import sys; sys.path.insert(0, sys.argv[1]); import handler';
    const isolatedEnvOnly = spawnSync(
      pythonExecutable,
      ['-I', '-c', importProbe, moduleRoot],
      {
        encoding: 'utf8',
        env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
      },
    );
    assert.equal(isolatedEnvOnly.status, 0, isolatedEnvOnly.stderr || isolatedEnvOnly.stdout);
    assert.equal(fs.existsSync(path.join(moduleRoot, '__pycache__')), true);

    fs.rmSync(path.join(moduleRoot, '__pycache__'), { recursive: true, force: true });
    const isolatedNoBytecode = spawnSync(
      pythonExecutable,
      ['-I', '-B', '-c', importProbe, moduleRoot],
      {
        encoding: 'utf8',
        env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
      },
    );
    assert.equal(isolatedNoBytecode.status, 0, isolatedNoBytecode.stderr || isolatedNoBytecode.stdout);
    assert.equal(fs.existsSync(path.join(moduleRoot, '__pycache__')), false);
    assert.deepEqual(
      fs.readdirSync(moduleRoot).filter((entry) => /\.py[co]$/i.test(entry)),
      [],
    );
  } finally {
    if (previousPython === undefined) delete process.env.PYTHON;
    else process.env.PYTHON = previousPython;
    if (previousRealPython === undefined) delete process.env.OPL_TEST_REAL_PYTHON;
    else process.env.OPL_TEST_REAL_PYTHON = previousRealPython;
    if (previousArgsRecord === undefined) delete process.env.OPL_TEST_PYTHON_ARGS_RECORD;
    else process.env.OPL_TEST_PYTHON_ARGS_RECORD = previousArgsRecord;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('standard Agent stage manifest compiler round-trips locale names and backfills legacy en-US', () => {
  const root = fixture('target-localized-stage');
  const manifest = readManifest(root);
  manifest.stages[0].display_names = {
    'en-US': 'Intake',
    'fr-FR': 'Accueil',
    'de-DE': 'Aufnahme',
  };
  delete manifest.stages[1].display_names;
  writeManifest(root, manifest);

  const stages = compileStandardAgentStageManifest(root).stage_control_plane.stages;
  assert.deepEqual(stages[0]?.display_names, manifest.stages[0].display_names);
  assert.equal(stages[0]?.title, stages[0]?.display_names?.['en-US']);
  assert.deepEqual(stages[1]?.display_names, { 'en-US': 'Deliver' });
  assert.equal(stages[1]?.title, stages[1]?.display_names?.['en-US']);
});

test('standard Agent stage manifest compiler rejects invalid localized stage names', async (t) => {
  const cases: Array<[string, unknown, RegExp]> = [
    ['non-object map', [], /display_names must be a JSON object/],
    ['empty map', {}, /display_names must contain at least the en-US entry/],
    [
      'empty locale key',
      { '': 'Intake', 'en-US': 'Intake' },
      /display_names locale keys must be non-empty and contain no whitespace/,
    ],
    [
      'whitespace locale key',
      { 'en US': 'Intake', 'en-US': 'Intake' },
      /display_names locale keys must be non-empty and contain no whitespace/,
    ],
    ['non-string value', { 'en-US': 42 }, /display_names\.en-US must be a non-empty string/],
    ['blank value', { 'en-US': '   ' }, /display_names\.en-US must be a non-empty string/],
    ['missing en-US', { 'fr-FR': 'Accueil' }, /display_names must contain the en-US entry/],
    ['title mismatch', { 'en-US': 'Intake stage' }, /display_names\.en-US must exactly match stage\.title/],
  ];

  for (const [name, displayNames, expected] of cases) {
    await t.test(name, () => {
      const root = fixture(`target-localized-${name.replaceAll(' ', '-')}`);
      const manifest = readManifest(root);
      manifest.stages[0].display_names = displayNames;
      writeManifest(root, manifest);
      assert.throws(() => compileStandardAgentStageManifest(root), expected);
    });
  }
});

test('family stage control plane normalizer preserves and validates localized names', async (t) => {
  const baseline = compileStandardAgentStageManifest(fixture('target-shared-localization')).stage_control_plane;
  const valid = structuredClone(baseline);
  valid.stages[0]!.display_names = {
    'en-US': 'Intake',
    'fr-FR': 'Accueil',
  };
  assert.deepEqual(
    normalizeFamilyStageControlPlane(valid)?.stages[0]?.display_names,
    valid.stages[0]!.display_names,
  );

  for (const [name, displayNames, expected] of [
    ['non-object map', [], /display_names must be an object/],
    [
      'whitespace locale key',
      { 'en-US': 'Intake', 'bad locale': 'Invalid' },
      /locale keys must be non-empty and contain no whitespace/,
    ],
    ['blank value', { 'en-US': 'Intake', 'fr-FR': '   ' }, /display_names\.fr-FR must be a non-empty string/],
    ['missing en-US', { 'fr-FR': 'Accueil' }, /display_names must contain the en-US entry/],
    ['title mismatch', { 'en-US': 'Different' }, /display_names\.en-US must exactly match the stage title/],
  ] as const) {
    await t.test(name, () => {
      const candidate = structuredClone(baseline) as JsonRecord;
      candidate.stages[0].display_names = displayNames;
      assert.throws(() => normalizeFamilyStageControlPlane(candidate), expected);
    });
  }
});

test('packaging Handoff must classify its final-artifact review boundary', () => {
  const root = fixture('target-handoff-boundary');
  const manifest = readManifest(root);
  delete manifest.stages[1].handoff_review_boundary;
  writeManifest(root, manifest);

  assert.throws(
    () => compileStandardAgentStageManifest(root),
    /stage\.handoff_review_boundary must be a JSON object/,
  );
});

test('primary-only Handoff requires downstream owner acceptance', () => {
  const root = fixture('target-handoff-owner');
  const manifest = readManifest(root);
  manifest.stages[1].stage_quality_cycle_policy_ref =
    'contracts/stage_quality_cycle_policy.json#/stages/deliver';
  manifest.stages[1].handoff_review_boundary.downstream_owner_retains_acceptance = false;
  writePrimaryOnlyDeliverPolicy(root);
  writeManifest(root, manifest);

  assert.throws(
    () => compileStandardAgentStageManifest(root),
    /Primary-only Handoff is limited to reviewed refs or mechanical repackaging/,
  );
});

test('every high-risk Handoff signal fails closed when formal Stage Review is disabled', async (t) => {
  for (const [name, reviewBoundary] of [
    ['new reviewable bytes', {
      artifact_effect: 'new_or_transformed_reviewable_bytes',
      freezes_canonical_artifact_bytes: false,
      issues_quality_export_publication_or_ready_claim: false,
      downstream_owner_retains_acceptance: true,
    }],
    ['canonical byte freeze', {
      artifact_effect: 'mechanical_repackaging_of_reviewed_bytes',
      freezes_canonical_artifact_bytes: true,
      issues_quality_export_publication_or_ready_claim: false,
      downstream_owner_retains_acceptance: true,
    }],
    ['ready claim', {
      artifact_effect: 'reviewed_immutable_refs_only',
      freezes_canonical_artifact_bytes: false,
      issues_quality_export_publication_or_ready_claim: true,
      downstream_owner_retains_acceptance: true,
    }],
  ] as const) {
    await t.test(name, () => {
      const root = fixture(`target-handoff-review-${name.replaceAll(' ', '-')}`);
      writePrimaryOnlyDeliverPolicy(root);
      const manifest = readManifest(root);
      manifest.stages[1].stage_quality_cycle_policy_ref =
        'contracts/stage_quality_cycle_policy.json#/stages/deliver';
      manifest.stages[1].handoff_review_boundary = reviewBoundary;
      writeManifest(root, manifest);

      assert.throws(
        () => compileStandardAgentStageManifest(root),
        /requires formal Stage Review/,
      );
    });
  }
});

test('required formal Handoff Review cannot be disabled at runtime', () => {
  const root = fixture('target-handoff-runtime-disabled');
  writePrimaryOnlyDeliverPolicy(root);
  const manifest = readManifest(root);
  manifest.stages[1].stage_quality_cycle_policy_ref =
    'contracts/stage_quality_cycle_policy.json#/stages/deliver';
  manifest.stages[1].handoff_review_boundary.artifact_effect =
    'new_or_transformed_reviewable_bytes';
  writeManifest(root, manifest);

  const policyPath = path.join(root, 'contracts/stage_quality_cycle_policy.json');
  const policy = JSON.parse(fs.readFileSync(policyPath, 'utf8')) as JsonRecord;
  policy.stages.deliver.enabled = false;
  policy.stages.deliver.formal_review.required = true;
  fs.writeFileSync(policyPath, `${JSON.stringify(policy, null, 2)}\n`);

  assert.throws(
    () => compileStandardAgentStageManifest(root),
    /Required formal Stage Review cannot be disabled at runtime/,
  );
});

test('official knowledge-deliverable profile compiles isolated Stage Review and one Meta Review role', () => {
  const root = fixture('medautoscience', 'mas');
  fs.writeFileSync(path.join(root, 'agent/prompts/intake.md'), `# Intake

## Producer
Produce.

## Reviewer
Review.

## Repairer
Repair.

## Re Reviewer
Re-review.
`);
  writeJson(root, 'contracts/stage_quality_cycle_policy.json', {
    surface_kind: 'opl_domain_stage_quality_cycle_profile',
    version: 'domain-stage-quality-cycle-profile.v1',
    framework_contract_ref: 'contracts/opl-framework/stage-quality-cycle-contract.json',
    stages: {
      intake: {
        surface_kind: 'opl_stage_quality_cycle_policy',
        version: 'stage-quality-cycle-policy.v1',
        enabled: true,
        stage_prompt_ref: 'agent/prompts/intake.md',
        role_prompt_refs: {
          producer: 'agent/prompts/intake.md#producer',
          reviewer: 'agent/prompts/intake.md#reviewer',
          repairer: 'agent/prompts/intake.md#repairer',
          re_reviewer: 'agent/prompts/intake.md#re-reviewer',
        },
        quality_rubric_refs: ['agent/quality_gates/quality.md'],
        in_thread_refinement: { allowed: true, authoritative: false },
        formal_review: {
          required: false,
          risk_tier: 'medium',
          review_depth: 'full',
          context_isolation_required: true,
          max_repair_rounds: 0,
        },
        budget_exhaustion: 'complete_with_quality_debt_if_consumable',
        attempt_boundary: {
          inherits_stage_goal_scope_authority: true,
          role_overlay_may_only_narrow: true,
          controller_creates_next_attempt: true,
          attempt_is_not_sub_stage: true,
        },
      },
    },
    meta_review_policy: {
      stage_ref: 'intake',
      independent_stage_run_required: true,
      max_route_back_rounds: 3,
    },
  });
  const manifest = readManifest(root);
  manifest.quality_governance_profile_ref =
    'contracts/opl-framework/official-knowledge-deliverable-quality-profile.json';
  manifest.meta_review_policy_ref =
    'contracts/stage_quality_cycle_policy.json#/meta_review_policy';
  manifest.stages[0] = {
    ...manifest.stages[0],
    stage_kind: 'review',
    stage_role: 'cross_stage_meta_review',
    stage_quality_cycle_policy_ref: 'contracts/stage_quality_cycle_policy.json#/stages/intake',
  };
  writeManifest(root, manifest);

  const compiled = compileStandardAgentStageManifest(root).stage_control_plane;
  assert.equal(compiled.quality_governance_profile_ref,
    'contracts/opl-framework/official-knowledge-deliverable-quality-profile.json');
  assert.equal(compiled.meta_review_policy_ref,
    'contracts/stage_quality_cycle_policy.json#/meta_review_policy');
  assert.equal(compiled.stages[0]?.stage_role, 'cross_stage_meta_review');
  assert.equal(compiled.stages[0]?.stage_quality_cycle_policy_ref,
    'contracts/stage_quality_cycle_policy.json#/stages/intake');

  const binding = resolveStandardAgentStageQualityRuntimeBinding(root, 'intake');
  assert.equal(binding?.surface_kind, 'opl_pack_bound_stage_quality_runtime_binding');
  assert.equal(binding?.enabled, true);
  assert.equal(binding?.stage_role, 'cross_stage_meta_review');
  assert.deepEqual(binding?.declared_stage_ids, ['intake', 'deliver']);
  assert.equal(binding?.policy_ref, 'contracts/stage_quality_cycle_policy.json#/stages/intake');
  assert.equal(binding?.quality_policy.formal_review.required, false);
  assert.equal(binding?.quality_policy.formal_review.max_repair_rounds, 0);
  assert.equal(binding?.handoff_review_boundary, null);
  assert.equal(binding?.quality_policy.formal_review.attempt_internal_parallel_review_facets_allowed, false);
  assert.deepEqual(binding?.role_prompt_refs, {
    producer: 'agent/prompts/intake.md#producer',
    reviewer: 'agent/prompts/intake.md#reviewer',
    repairer: 'agent/prompts/intake.md#repairer',
    re_reviewer: 'agent/prompts/intake.md#re-reviewer',
  });
  assert.deepEqual(binding?.quality_rubric_refs, ['agent/quality_gates/quality.md']);
  assert.deepEqual(binding?.knowledge_refs, ['agent/knowledge/domain.md']);
  assert.deepEqual(binding?.skill_refs, []);
  assert.deepEqual(binding?.policy_refs, []);
  assert.deepEqual(binding?.stage_goal_refs, ['agent/stages/manifest.json#/stages/0/goal']);
  assert.deepEqual(binding?.source_refs, ['agent/stages/intake.md']);
  assert.deepEqual(binding?.lineage_refs, ['agent/stages/manifest.json#/stages/0']);
  assert.equal(binding?.manifest_ref, 'agent/stages/manifest.json');
  assert.equal(binding?.manifest_sha256, compileStandardAgentStageManifest(root).source_binding.stage_manifest_sha256);
  assert.equal(resolveStandardAgentStageQualityRuntimeBinding(root, 'deliver'), null);
});

test('official knowledge-deliverable AI stage fails closed when its quality cycle is disabled', () => {
  const root = fixture('medautoscience', 'mas');
  fs.writeFileSync(path.join(root, 'agent/prompts/intake.md'), `# Intake

## Producer
Produce.

## Reviewer
Review.

## Repairer
Repair.

## Re Reviewer
Re-review.
`);
  writeJson(root, 'contracts/stage_quality_cycle_policy.json', {
    surface_kind: 'opl_domain_stage_quality_cycle_profile',
    version: 'domain-stage-quality-cycle-profile.v1',
    stages: {
      intake: {
        surface_kind: 'opl_stage_quality_cycle_policy',
        version: 'stage-quality-cycle-policy.v1',
        enabled: false,
        stage_prompt_ref: 'agent/prompts/intake.md',
        role_prompt_refs: {
          producer: 'agent/prompts/intake.md#producer',
          reviewer: 'agent/prompts/intake.md#reviewer',
          repairer: 'agent/prompts/intake.md#repairer',
          re_reviewer: 'agent/prompts/intake.md#re-reviewer',
        },
        quality_rubric_refs: ['agent/quality_gates/quality.md'],
        in_thread_refinement: { allowed: true, authoritative: false },
        formal_review: {
          required: true,
          risk_tier: 'medium',
          review_depth: 'full',
          context_isolation_required: true,
          max_repair_rounds: 3,
        },
        budget_exhaustion: 'complete_with_quality_debt_if_consumable',
        attempt_boundary: {
          inherits_stage_goal_scope_authority: true,
          role_overlay_may_only_narrow: true,
          controller_creates_next_attempt: true,
          attempt_is_not_sub_stage: true,
        },
      },
    },
    meta_review_policy: { stage_ref: 'intake', independent_stage_run_required: true },
  });
  const manifest = readManifest(root);
  manifest.quality_governance_profile_ref =
    'contracts/opl-framework/official-knowledge-deliverable-quality-profile.json';
  manifest.meta_review_policy_ref = 'contracts/stage_quality_cycle_policy.json#/meta_review_policy';
  manifest.stages[0].stage_quality_cycle_policy_ref =
    'contracts/stage_quality_cycle_policy.json#/stages/intake';
  manifest.stages[0].next_stage_refs = [];
  manifest.stages = [manifest.stages[0]];
  writeManifest(root, manifest);

  assert.throws(
    () => resolveStandardAgentStageQualityRuntimeBinding(root, 'intake'),
    /Required formal Stage Review cannot be disabled at runtime/,
  );
});
