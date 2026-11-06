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

test('stage runtime binding projects an explicit review lane as a generic fixed binding', () => {
  const root = fixture('target-fixed-review-lane');
  writePrimaryOnlyDeliverPolicy(root);
  const manifest = readManifest(root);
  manifest.stages[1].stage_quality_cycle_policy_ref =
    'contracts/stage_quality_cycle_policy.json#/stages/deliver';
  manifest.stages[1].stage_contract_extension = {
    review_input_snapshot_transport: {
      review_lane_binding: 'domain_fixed_review_lane',
      review_lane: 'statistical',
    },
  };
  writeManifest(root, manifest);

  assert.deepEqual(
    resolveStandardAgentStageQualityRuntimeBinding(root, manifest.stages[1].stage_id)
      ?.review_lane_binding,
    {
      binding_kind: 'fixed',
      review_lane: 'statistical',
      executor_may_select_lane: false,
      lane_fallback: false,
    },
  );
});

test('stage runtime binding preserves an opaque binding without an explicit review lane', () => {
  const root = fixture('target-fixed-review-lane-missing-value');
  writePrimaryOnlyDeliverPolicy(root);
  const manifest = readManifest(root);
  manifest.stages[1].stage_quality_cycle_policy_ref =
    'contracts/stage_quality_cycle_policy.json#/stages/deliver';
  manifest.stages[1].stage_contract_extension = {
    review_input_snapshot_transport: {
      review_lane_binding: 'domain_fixed_review_lane',
    },
  };
  writeManifest(root, manifest);

  assert.equal(
    resolveStandardAgentStageQualityRuntimeBinding(root, manifest.stages[1].stage_id)
      ?.review_lane_binding,
    null,
  );
});

test('stage runtime binding rejects an explicit empty fixed review lane', () => {
  const root = fixture('target-fixed-review-lane-empty-value');
  writePrimaryOnlyDeliverPolicy(root);
  const manifest = readManifest(root);
  manifest.stages[1].stage_quality_cycle_policy_ref =
    'contracts/stage_quality_cycle_policy.json#/stages/deliver';
  manifest.stages[1].stage_contract_extension = {
    review_input_snapshot_transport: {
      review_lane_binding: 'domain_fixed_review_lane',
      review_lane: '   ',
    },
  };
  writeManifest(root, manifest);

  assert.throws(
    () => resolveStandardAgentStageQualityRuntimeBinding(root, manifest.stages[1].stage_id),
    FrameworkContractError,
  );
});

test('stage runtime binding rejects a controller-required lane with an explicit fixed lane', () => {
  const root = fixture('target-fixed-review-lane-controller-conflict');
  writePrimaryOnlyDeliverPolicy(root);
  const manifest = readManifest(root);
  manifest.stages[1].stage_quality_cycle_policy_ref =
    'contracts/stage_quality_cycle_policy.json#/stages/deliver';
  manifest.stages[1].stage_contract_extension = {
    review_input_snapshot_transport: {
      review_lane_binding: 'controller_required',
      review_lane: 'statistical',
    },
  };
  writeManifest(root, manifest);

  assert.throws(
    () => resolveStandardAgentStageQualityRuntimeBinding(root, manifest.stages[1].stage_id),
    FrameworkContractError,
  );
});

test('stage runtime binding rejects unsafe controller review lane declarations', async (t) => {
  for (const [name, transport] of [
    ['empty', {
      review_lane_binding: 'controller_required',
      allowed_review_lanes: [],
      executor_may_select_lane: false,
      lane_fallback: false,
    }],
    ['duplicate', {
      review_lane_binding: 'controller_required',
      allowed_review_lanes: ['medical', 'medical'],
      executor_may_select_lane: false,
      lane_fallback: false,
    }],
    ['executor-selected', {
      review_lane_binding: 'controller_required',
      allowed_review_lanes: ['medical'],
      executor_may_select_lane: true,
      lane_fallback: false,
    }],
    ['fallback', {
      review_lane_binding: 'controller_required',
      allowed_review_lanes: ['medical'],
      executor_may_select_lane: false,
      lane_fallback: true,
    }],
  ] as const) {
    await t.test(name, () => {
      const root = fixture(`target-controller-review-lane-${name}`);
      writePrimaryOnlyDeliverPolicy(root);
      const manifest = readManifest(root);
      manifest.stages[1].stage_quality_cycle_policy_ref =
        'contracts/stage_quality_cycle_policy.json#/stages/deliver';
      manifest.stages[1].stage_contract_extension = {
        review_input_snapshot_transport: transport,
      };
      writeManifest(root, manifest);
      assert.throws(
        () => resolveStandardAgentStageQualityRuntimeBinding(root, manifest.stages[1].stage_id),
        FrameworkContractError,
      );
    });
  }
});

test('stage manifest compiler rejects invalid stage-contract extensions', async (t) => {
  const cases: Array<[string, unknown]> = [
    ['non_object', []],
    ['stage_semantics_override', { requires: ['overridden_requirement'] }],
    ['framework_floor_override', { stage_completion_policy: { closeout_packet_required: false } }],
    ['opl_quality_owner', { quality_verdict_owner: 'one-person-lab' }],
    ['opl_authority_flag', { opl_can_sign_owner_receipt: true }],
    ['runtime_event_override', { runtime_event_refs: [] }],
  ];
  for (const [name, extension] of cases) {
    await t.test(name, () => {
      const root = fixture(`target-stage-contract-extension-${name}`);
      const manifest = readManifest(root);
      manifest.stages[0].stage_contract_extension = extension;
      writeManifest(root, manifest);

      assert.throws(() => compileStandardAgentStageManifest(root), FrameworkContractError);
    });
  }
});

test('stage manifest compiler rejects OPL authority claims in declared stage contracts', () => {
  const root = fixture('target-stage-contract-opl-authority');
  const manifest = readManifest(root);
  manifest.stages[0].stage_contract = {
    quality_verdict_owner: 'one-person-lab',
  };
  writeManifest(root, manifest);

  assert.throws(() => compileStandardAgentStageManifest(root), FrameworkContractError);
});

test('stage manifest compiler fails closed for an invalid required v2 declaration', () => {
  const root = fixture('target-invalid-stage-pack');
  const inputRef = path.join(root, 'contracts/pack_compiler_input.json');
  const input = JSON.parse(fs.readFileSync(inputRef, 'utf8')) as JsonRecord;
  input.standard_stage_pack_conformance = {
    required: true,
    version: 'standard-stage-pack.v1',
  };
  writeJson(root, 'contracts/pack_compiler_input.json', input);
  assert.throws(() => compileStandardAgentStageManifest(root));
});

test('stage manifest compiler honors an explicit v2 version with canonical Framework floors', () => {
  const root = fixture('target-stage-policy');
  const inputRef = path.join(root, 'contracts/pack_compiler_input.json');
  const input = JSON.parse(fs.readFileSync(inputRef, 'utf8')) as JsonRecord;
  input.standard_stage_pack_conformance = {
    required: false,
    version: 'standard-stage-pack.v2',
  };
  writeJson(root, 'contracts/pack_compiler_input.json', input);
  const compilation = compileStandardAgentStageManifest(root);
  const stage = compilation.stage_control_plane.stages[0]!;
  const stageContract = stage.stage_contract as JsonRecord;
  const completionPolicy = stageContract.stage_completion_policy as JsonRecord;
  const userStageLogContract = stageContract.user_stage_log_contract as JsonRecord;
  const l4EntryGate = stageContract.l4_entry_gate as JsonRecord;
  const l5EntryGate = stageContract.l5_entry_gate as JsonRecord;
  assert.equal(compilation.stage_control_plane.stage_pack_conformance_version, 'standard-stage-pack.v2');
  assert.equal(compilation.stage_control_plane.authority_boundary.domain_truth_owner, 'target-stage-policy');
  assert.equal(stage.stage_pack_conformance_version, 'standard-stage-pack.v2');
  assert.equal(completionPolicy.surface_kind, 'domain_stage_completion_policy');
  assert.equal(completionPolicy.owner, 'one-person-lab');
  assert.equal(completionPolicy.closeout_packet_required, false);
  assert.equal(completionPolicy.raw_artifact_sufficient_for_progress, true);
  assert.equal(completionPolicy.semantic_route_decision_owner, 'decisive_codex_attempt');
  assert.equal(completionPolicy.stage_transition_materialization_owner, 'opl_stage_run_controller');
  assert.equal(userStageLogContract.surface_kind, 'opl_standard_agent_user_stage_log_contract');
  assert.equal(userStageLogContract.owner, 'one-person-lab');
  assert.deepEqual(stage.stage_contract?.receipt_schema_refs, [{
    ref_kind: 'repo_path',
    ref: 'contracts/owner_receipt_contract.json',
    role: 'owner_receipt_schema',
  }]);
  assert.deepEqual(stage.stage_contract?.authority_function_refs, [{
    ref_kind: 'repo_path',
    ref: 'runtime/authority_functions/README.md',
    role: 'minimal_authority_function_inventory',
  }]);
  assert.equal(l4EntryGate.entry_level, 'L4_structural_baseline');
  assert.equal(l4EntryGate.can_claim_domain_ready, false);
  assert.equal(l5EntryGate.entry_level, 'L5_production_operating_maturity');
  assert.equal(l5EntryGate.conformance_pass_counts_as_l5, false);
});

test('stage manifest compiler requires every mutating action route after route adoption starts', () => {
  const root = fixture('target-partial-action-route');
  const catalogRef = path.join(root, 'contracts/action_catalog.json');
  const catalog = JSON.parse(fs.readFileSync(catalogRef, 'utf8')) as JsonRecord;
  delete catalog.actions[1].stage_route;
  writeJson(root, 'contracts/action_catalog.json', catalog);

  assert.throws(
    () => compileStandardAgentStageManifest(root),
    (error: unknown) => error instanceof FrameworkContractError
      && typeof error.details?.error === 'string'
      && error.details.error.includes('execution_binding.kind=stage_binding requires stage_route'),
  );
});

test('stage manifest compiler fails closed on every Framework stage-contract floor mismatch', async (t) => {
  const cases: Array<[string, unknown]> = [
    ['expected_receipt_refs', []],
    ['receipt_schema_refs', [{ ref_kind: 'url', ref: 'https://attacker.invalid/receipt' }]],
    ['authority_function_refs', [{ ref_kind: 'url', ref: 'https://attacker.invalid/sign' }]],
    ['l4_entry_gate', { entry_level: 'L4_fake', can_claim_domain_ready: true }],
    ['l5_entry_gate', { entry_level: 'L5_fake', conformance_pass_counts_as_l5: true }],
    ['stage_completion_policy', {
      surface_kind: 'domain_override',
      owner: 'target-stage-policy',
      closeout_packet_required: false,
    }],
    ['user_stage_log_contract', {
      surface_kind: 'domain_override',
      owner: 'target-stage-policy',
      required: false,
    }],
    ['progress_delta_policy', { surface_kind: 'domain_override' }],
    ['typed_blocker_lineage_policy', { surface_kind: 'domain_override' }],
  ];

  for (const [field, value] of cases) {
    await t.test(field, () => {
      const root = fixture(`target-stage-policy-${field.replaceAll('_', '-')}`);
      const manifest = readManifest(root);
      manifest.stages[0].stage_contract = { [field]: value };
      writeManifest(root, manifest);

      assert.throws(() => compileStandardAgentStageManifest(root), (error: unknown) => {
        assert.ok(error instanceof FrameworkContractError);
        assert.equal(error.details?.blocker, 'standard_agent_stage_contract_framework_floor_mismatch');
        assert.equal(error.details?.field, field);
        return true;
      });
    });
  }
});

test('real MAG canonical manifest compiles while the legacy kind remains blocked', (t) => {
  const explicitMagRepo = process.env.MAG_REPO_DIR
    ? path.resolve(process.env.MAG_REPO_DIR)
    : null;
  const candidates = [
    path.resolve(REPO_ROOT, '../med-autogrant'),
    path.resolve(REPO_ROOT, '../../med-autogrant'),
  ];
  const magRepo = explicitMagRepo
    ?? candidates.find((entry) =>
      fs.existsSync(path.join(entry, 'agent/stages/manifest.json'))
      && !fs.existsSync(path.join(entry, 'contracts/stage_control_plane.json'))
    );
  if (!magRepo) {
    t.skip('real MAG checkout not available');
    return;
  }
  assert.equal(fs.existsSync(path.join(magRepo, 'contracts/stage_control_plane.json')), false);
  assert.equal(fs.existsSync(path.join(magRepo, 'src/med_autogrant/stage_control_plane.py')), false);
  const sourceManifest = readManifest(magRepo);
  assert.equal(sourceManifest.surface_kind, 'opl_standard_agent_declarative_stage_manifest');
  assert.equal(sourceManifest.version, 'opl-standard-agent-declarative-stage-manifest.v1');
  const sourceActionCatalog = JSON.parse(
    fs.readFileSync(path.join(magRepo, 'contracts/action_catalog.json'), 'utf8'),
  ) as JsonRecord;
  if (sourceActionCatalog.version !== 'family-action-catalog.v2') {
    assert.throws(
      () => compileStandardAgentStageManifest(magRepo),
      (error: unknown) => error instanceof FrameworkContractError
        && error.message === 'contracts/action_catalog.json is not a valid family-action-catalog.v2 contract.'
        && typeof error.details?.error === 'string',
    );
    return;
  }

  const actionInputSchemaRefs = Array.isArray(sourceActionCatalog.actions)
    ? sourceActionCatalog.actions.flatMap((action: unknown) => {
        if (!action || typeof action !== 'object') return [];
        const ref = (action as JsonRecord).input_schema_ref;
        return typeof ref === 'string' && ref.trim() ? [ref.trim()] : [];
      })
    : [];
  const sourcePackCompilerInput = JSON.parse(
    fs.readFileSync(path.join(magRepo, 'contracts/pack_compiler_input.json'), 'utf8'),
  ) as JsonRecord;
  const requiredDomainPackPaths = Array.isArray(sourcePackCompilerInput.required_domain_pack_paths)
    ? sourcePackCompilerInput.required_domain_pack_paths.filter(
        (entry: unknown): entry is string => typeof entry === 'string' && entry.length > 0,
      )
    : [];

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-real-mag-stage-manifest-'));
  fs.cpSync(path.join(magRepo, 'agent'), path.join(root, 'agent'), { recursive: true });
  fs.cpSync(path.join(magRepo, 'schemas'), path.join(root, 'schemas'), { recursive: true });
  for (const ref of new Set([
    'contracts/domain_descriptor.json',
    'contracts/action_catalog.json',
    'contracts/pack_compiler_input.json',
    'contracts/stage_quality_cycle_policy.json',
    'contracts/functional_privatization_audit.json',
    'contracts/generated_surface_handoff.json',
    'contracts/durable_knowledge_catalog.json',
    'contracts/owner_receipt_contract.json',
    ...actionInputSchemaRefs,
    ...requiredDomainPackPaths,
  ])) {
    const source = path.join(magRepo, ref);
    if (fs.existsSync(source)) {
      fs.mkdirSync(path.dirname(path.join(root, ref)), { recursive: true });
      fs.copyFileSync(source, path.join(root, ref));
    }
  }
  const functionalAudit = JSON.parse(
    fs.readFileSync(path.join(root, 'contracts/functional_privatization_audit.json'), 'utf8'),
  ) as JsonRecord;
  const auditCodePaths = Array.isArray(functionalAudit.modules)
    ? functionalAudit.modules.flatMap((module: unknown) => (
      module && typeof module === 'object' && Array.isArray((module as JsonRecord).code_paths)
        ? (module as JsonRecord).code_paths.filter((entry: unknown): entry is string => typeof entry === 'string')
        : []
    ))
    : [];
  for (const ref of auditCodePaths) {
    const source = path.join(magRepo, ref);
    assert.equal(fs.existsSync(source), true, `MAG compact audit source path is missing: ${ref}`);
    fs.mkdirSync(path.dirname(path.join(root, ref)), { recursive: true });
    fs.copyFileSync(source, path.join(root, ref));
  }
  fs.mkdirSync(path.join(root, 'runtime', 'authority_functions'), { recursive: true });
  fs.copyFileSync(
    path.join(magRepo, 'runtime', 'authority_functions', 'README.md'),
    path.join(root, 'runtime', 'authority_functions', 'README.md'),
  );
  assert.equal(fs.existsSync(path.join(root, 'contracts/stage_control_plane.json')), false);

  const readyReport = buildDomainPackCompilerList({} as any, {
    familyDefaults: true,
    familyRepoInputs: [{ requested_agent_id: 'mag', repo_dir: root }],
  });
  const readyProjection = readyReport.domain_pack_compiler.domains[0];

  assert.equal(readyReport.domain_pack_compiler.summary.total_domain_count, 1);
  assert.equal(
    readyReport.domain_pack_compiler.summary.ready_domain_count,
    1,
    JSON.stringify(readyProjection?.blocker_reasons ?? readyProjection),
  );
  assert.equal(readyReport.domain_pack_compiler.summary.blocked_domain_count, 0);
  assert.equal(readyProjection?.requested_agent_id, 'mag');
  assert.equal(readyProjection?.compiler_status, 'ready');

  const legacyManifest = readManifest(root);
  legacyManifest.surface_kind = 'mag_declarative_stage_manifest';
  writeManifest(root, legacyManifest);
  const blockedReport = buildDomainPackCompilerList({} as any, {
    familyDefaults: true,
    familyRepoInputs: [{ requested_agent_id: 'mag', repo_dir: root }],
  });
  const blockedProjection = blockedReport.domain_pack_compiler.domains[0];

  assert.equal(blockedReport.domain_pack_compiler.summary.total_domain_count, 1);
  assert.equal(blockedReport.domain_pack_compiler.summary.ready_domain_count, 0);
  assert.equal(blockedReport.domain_pack_compiler.summary.blocked_domain_count, 1);
  assert.equal(blockedProjection?.requested_agent_id, 'mag');
  assert.equal(blockedProjection?.compiler_status, 'blocked');
  assert.equal(blockedProjection?.repo_contract_error?.code, 'contract_shape_invalid');
  assert.match(String(blockedProjection?.repo_contract_error?.message ?? ''), /stage_manifest\.surface_kind must be/);
});
