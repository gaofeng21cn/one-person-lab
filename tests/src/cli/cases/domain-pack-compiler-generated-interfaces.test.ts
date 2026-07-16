import './domain-pack-compiler-generated-interfaces-cases/active-caller-cutover-cases.ts';
import { assert, buildManifestCommand, createFamilyContractsFixtureRoot, fs, loadFamilyManifestFixtures, os, parseJsonText, path, repoRoot, runCli, runCliFailure, test } from '../helpers.ts';
import { buildReadyAgentRepo, retargetReadyRepo, writeJson } from './agents-conformance-fixtures.ts';
import {
  bindFamilyManifests,
  createFamilyDefaultContractWorkspace,
  withPackCompilerReadySurfaces,
} from './domain-pack-compiler-fixtures.ts';

const DEFAULT_ENTRY_SURFACES = [
  'cli',
  'mcp',
  'openai_tool',
  'ai_sdk',
  'skill_plugin',
  'app_action',
  'status_read_model',
  'workbench',
];

function assertIncludesAll(values: unknown[], expected: unknown[]) {
  for (const value of expected) assert.ok(values.includes(value), String(value));
}

function assertNoGeneratedAuthority(boundary: Record<string, unknown>) {
  for (const key of [
    'generated_interface_can_write_memory_body',
    'generated_interface_can_mutate_artifacts',
    'generated_interface_can_write_domain_truth',
    'generated_interface_can_authorize_quality_or_export',
    'parity_proof_can_write_domain_truth',
    'parity_proof_can_sign_owner_receipt',
    'parity_proof_can_create_typed_blocker',
    'parity_proof_can_claim_domain_ready',
    'consumption_bundle_can_claim_domain_ready',
    'consumption_bundle_can_claim_production_ready',
    'gate_can_claim_domain_ready',
    'gate_can_claim_production_ready',
    'gate_can_write_domain_truth',
    'gate_can_authorize_quality_or_export',
  ]) {
    if (key in boundary) assert.equal(boundary[key], false, key);
  }
}

function boundFamilyEnv(prefix: string) {
  const { fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const env = { OPL_CONTRACTS_DIR: fixtureContractsRoot, OPL_STATE_DIR: stateRoot };
  const workspaceRoot = bindFamilyManifests(env);
  return { env, stateRoot, workspaceRoot };
}

function writeDomainRepoContracts(targetDir: string, manifest: Record<string, any>) {
  fs.mkdirSync(path.join(targetDir, 'contracts'), { recursive: true });
  const manifestSurface = typeof manifest.product_entry_manifest === 'object'
    && manifest.product_entry_manifest !== null
    && !Array.isArray(manifest.product_entry_manifest)
    ? manifest.product_entry_manifest as Record<string, any>
    : manifest;
  const stageManifestPath = path.join(targetDir, 'agent', 'stages', 'manifest.json');
  const stageManifest = parseJsonText(fs.readFileSync(stageManifestPath, 'utf8')) as Record<string, any>;
  const compiledStageId = stageManifest.stages[0].stage_id;
  for (const action of manifestSurface.family_action_catalog.actions) {
    if (action.execution_binding?.kind !== 'stage_binding') continue;
    action.stage_route = {
      ...action.stage_route,
      entry_stage_ref: compiledStageId,
      required_stage_refs: [compiledStageId],
      optional_stage_refs: [],
      terminal_stage_refs: [compiledStageId],
    };
  }
  for (const [file, payload] of [
    ['domain_descriptor.json', {
      surface_kind: 'domain_agent_descriptor',
      schema_version: 1,
      domain_id: 'med-autoscience',
      domain_label: 'MedAutoScience',
      generated_surface_owner: 'one-person-lab',
      domain_repo_can_own_generated_surface: false,
      authority_boundary: {
        opl_can_write_domain_truth: false,
        opl_can_write_memory_body: false,
        opl_can_authorize_quality_or_export: false,
      },
    }],
    ['action_catalog.json', manifestSurface.family_action_catalog],
    ['memory_descriptor.json', manifestSurface.domain_memory_descriptor],
    ['functional_privatization_audit.json', manifestSurface.functional_privatization_audit],
    ['generated_surface_handoff.json', {
      surface_kind: 'opl_generated_surface_handoff',
      schema_version: 1,
      domain_id: 'med-autoscience',
      generated_surface_owner: 'one-person-lab',
      domain_repo_can_own_generated_surface: false,
      generated_surfaces: [
        { surface_id: 'cli', owner: 'one-person-lab', status: 'descriptor_source_available' },
        { surface_id: 'mcp', owner: 'one-person-lab', status: 'descriptor_source_available' },
        { surface_id: 'skill', owner: 'one-person-lab', status: 'descriptor_source_available' },
        { surface_id: 'product_entry_manifest', owner: 'one-person-lab', status: 'descriptor_source_available' },
        { surface_id: 'domain_handler', owner: 'one-person-lab', status: 'descriptor_source_available' },
        { surface_id: 'status_read_model', owner: 'one-person-lab', status: 'descriptor_source_available' },
        { surface_id: 'workbench_drilldown', owner: 'one-person-lab', status: 'descriptor_source_available' },
      ],
      handoff_surfaces: [
        {
          surface_id: 'cli',
          current_paths: ['runtime/authority_functions/verdict.ts'],
          current_role: 'domain_authority_active',
          target_role: 'domain_handler_target',
        },
        {
          surface_id: 'mcp',
          current_paths: ['runtime/authority_functions/tool.ts'],
          current_role: 'domain_handler_target',
          target_role: 'domain_handler_target',
        },
      ],
    }],
  ] as const) {
    fs.writeFileSync(path.join(targetDir, 'contracts', file), `${JSON.stringify(payload)}\n`);
  }
  stageManifest.stages[0].allowed_action_refs = [manifestSurface.family_action_catalog.actions[0].action_id];
  fs.writeFileSync(stageManifestPath, `${JSON.stringify(stageManifest, null, 2)}\n`);
  for (const action of manifestSurface.family_action_catalog.actions) {
    const schemaPath = path.join(targetDir, action.input_schema_ref);
    const requiredFields = action.required_fields ?? action.workspace_locator_fields ?? [];
    const optionalFields = action.optional_fields ?? [];
    fs.mkdirSync(path.dirname(schemaPath), { recursive: true });
    fs.writeFileSync(schemaPath, `${JSON.stringify({
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      required: requiredFields,
      properties: Object.fromEntries(
        [...requiredFields, ...optionalFields].map((field) => [field, { type: 'string' }]),
      ),
    })}\n`);
  }
  return manifestSurface;
}

test('generated interfaces block default cutover without handoff proof but keep authority false', () => {
  const { env, workspaceRoot } = boundFamilyEnv('opl-generated-interfaces-state-');
  fs.rmSync(path.join(
    workspaceRoot,
    'med-autoscience',
    'contracts',
    'generated_surface_handoff.json',
  ));
  const bundle = runCli(['agents', 'interfaces', '--domain', 'mas'], env).generated_agent_interfaces;

  assert.equal(bundle.surface_kind, 'opl_generated_agent_interface_bundle');
  assert.equal(bundle.status, 'blocked');
  assert.equal(bundle.owner, 'one-person-lab');
  assert.equal(bundle.domain_repo_can_own_generated_surface, false);
  assert.equal(bundle.active_caller_cutover_proof.status, 'blocked');
  assert.equal(bundle.active_caller_cutover_proof.blocked_target_count > 0, true);
  assert.deepEqual(bundle.active_caller_cutover_proof.forbidden_generated_authority, [
    'domain_truth_write',
    'memory_body_write',
    'quality_or_export_verdict',
    'artifact_mutation',
  ]);
  assert.match(
    bundle.cli.descriptors[0].command,
    /^opl agents run --domain mas --action study_packet --workspace /,
  );
  assert.equal(bundle.cli.descriptors[0].execution_binding.kind, 'stage_binding');
  assert.equal(bundle.mcp.descriptors[0].name, 'study_packet');
  assert.equal(bundle.generated_direct_parity.status, 'blocked_or_drift_detected');
  assert.ok(bundle.generated_direct_parity.issues.includes('active caller target proof is not ready'));
  assert.equal(bundle.generated_surface_consumption_bundle.status, 'blocked');
  assert.deepEqual(bundle.generated_surface_consumption_bundle.consumer_surface_ids, DEFAULT_ENTRY_SURFACES);
  assert.equal(bundle.generated_surface_consumption_bundle.consumption_status_counts.blocked > 0, true);
  assertNoGeneratedAuthority(bundle.generated_direct_parity.authority_boundary);
  assertNoGeneratedAuthority(bundle.generated_surface_consumption_bundle.authority_boundary);
  assertNoGeneratedAuthority(bundle.authority_boundary);

  const mcpOnly = runCli(['agents', 'interfaces', '--domain', 'mas', '--format', 'mcp'], env)
    .generated_agent_interfaces;
  assert.equal(mcpOnly.selected_format, 'mcp');
  assert.equal('cli' in mcpOnly, false);
  assert.equal('skill' in mcpOnly, false);
  assert.deepEqual(mcpOnly.generated_direct_parity.checked_surface_ids, [
    'cli',
    'mcp',
    'skill',
    'product_entry',
    'openai_tool',
    'ai_sdk',
  ]);
  assert.ok(mcpOnly.generated_surface_consumption_bundle.consumer_surface_ids.includes('app_action'));
});

test('generated default entry and no-resurrection gates share the default surface set', () => {
  const { env } = boundFamilyEnv('opl-generated-interfaces-default-entry-');
  const bundle = runCli(['agents', 'interfaces', '--domain', 'mas'], env).generated_agent_interfaces;
  const contract = parseJsonText(fs.readFileSync(
    path.join(repoRoot, 'contracts', 'opl-framework', 'domain-pack-compiler-contract.json'),
    'utf8',
  )) as Record<string, any>;
  const schema = parseJsonText(fs.readFileSync(
    path.join(repoRoot, 'contracts', 'family-orchestration', 'family-action-catalog.schema.json'),
    'utf8',
  )) as Record<string, any>;

  assert.deepEqual(bundle.default_entry_policy.default_entry_surface_ids, DEFAULT_ENTRY_SURFACES);
  assert.deepEqual(
    bundle.supported_derived_surfaces.map((surface: { surface_id: string }) => surface.surface_id),
    DEFAULT_ENTRY_SURFACES,
  );
  assert.equal(bundle.source_of_work_lineage.status, 'ready_from_family_action_catalog');
  assert.equal(bundle.product_status.default_source_of_work.source_action_id, 'study_packet');
  assert.equal(bundle.workbench.default_source_of_work.source_action_id, 'study_packet');
  assert.equal(bundle.generated_wrapper_bundle.domain_repo_role_policy, 'domain_handler_target_or_refs_only_adapter');
  assert.deepEqual(
    bundle.generated_default_entry_no_resurrection_gate.required_default_entry_surface_ids,
    DEFAULT_ENTRY_SURFACES,
  );
  assert.equal(bundle.generated_default_entry_no_resurrection_gate.release_gate, true);
  assert.equal(bundle.generated_default_entry_no_resurrection_gate.gate_status, 'pass');
  assertIncludesAll(bundle.generated_default_entry_no_resurrection_gate.blocked_resurrection_surface_classes, [
    'domain_local_wrapper',
    'handwritten_default_tool_surface',
    'repo_local_workbench_shell',
  ]);
  assert.deepEqual(
    contract.generated_interface_bundle.default_entry_policy.default_entry_surface_ids,
    DEFAULT_ENTRY_SURFACES,
  );
  assert.equal(
    contract.generated_interface_bundle.source_of_work_lineage.authority_boundary.lineage_can_claim_domain_ready,
    false,
  );
  assert.deepEqual(
    contract.generated_interface_bundle.generated_surface_consumption_bundle.selected_format_surface_map['product-entry'],
    ['app_action', 'status_read_model', 'workbench'],
  );
  assert.deepEqual(schema.$defs.action.properties.supported_surfaces.required, [
    'cli',
    'mcp',
    'skill',
    'product_entry',
    'openai',
    'ai_sdk',
  ]);
  assert.equal(schema.$defs.sourceOfWork.properties.derived_surface_policy.const,
    'derive_cli_mcp_openai_ai_sdk_skill_app_status_workbench_from_single_catalog');
  assertNoGeneratedAuthority(bundle.generated_default_entry_no_resurrection_gate.authority_boundary);
  assertNoGeneratedAuthority(bundle.authority_boundary);
});

test('generated interfaces reject action catalogs missing generated default surface slots', () => {
  const repoDir = buildReadyAgentRepo();
  const actionCatalogPath = path.join(repoDir, 'contracts', 'action_catalog.json');
  const actionCatalog = parseJsonText(fs.readFileSync(actionCatalogPath, 'utf8')) as Record<string, any>;
  delete actionCatalog.actions[0].supported_surfaces.openai;
  writeJson(actionCatalogPath, actionCatalog);

  const failure = runCliFailure(['agents', 'interfaces', '--repo-dir', repoDir]);

  assert.equal(failure.payload.error.code, 'contract_shape_invalid');
  assert.ok(failure.payload.error.details.error.includes('family_action_catalog.actions[0].supported_surfaces.openai'));
});

test('generated interfaces emit descriptors only for declared non-null surface slots', () => {
  const repoDir = buildReadyAgentRepo();
  const actionCatalogPath = path.join(repoDir, 'contracts', 'action_catalog.json');
  const actionCatalog = parseJsonText(fs.readFileSync(actionCatalogPath, 'utf8')) as Record<string, any>;
  actionCatalog.actions[0].supported_surfaces = {
    cli: null,
    mcp: { tool_name: 'sample_brief_agent_draft_brief' },
    skill: null,
    product_entry: null,
    openai: null,
    ai_sdk: null,
  };
  writeJson(actionCatalogPath, actionCatalog);

  const bundle = runCli(['agents', 'interfaces', '--repo-dir', repoDir]).generated_agent_interfaces;
  assert.equal(bundle.cli.descriptors.length, 0);
  assert.equal(bundle.mcp.descriptors.length, 1);
  assert.equal(bundle.skill.descriptors.length, 0);
  assert.equal(bundle.product_entry.descriptors.length, 0);
  assert.equal(bundle.openai_tool.descriptors.length, 0);
  assert.equal(bundle.ai_sdk.descriptors.length, 0);
  assert.equal(bundle.product_status.descriptors.length, 0);
  assert.deepEqual(
    bundle.generated_direct_parity.action_parity[0].expected_generated_surface_ids,
    ['mcp'],
  );
});

test('generated interfaces preserve action fields and expose canonical handler refs', () => {
  const repoDir = buildReadyAgentRepo();
  const actionCatalogPath = path.join(repoDir, 'contracts', 'action_catalog.json');
  const actionCatalog = parseJsonText(fs.readFileSync(actionCatalogPath, 'utf8')) as Record<string, any>;
  const action = actionCatalog.actions[0];
  action.required_fields = ['workspace_root', 'brief'];
  action.optional_fields = ['audience'];
  const handlerAction = structuredClone(action);
  handlerAction.action_id = 'authority_check';
  handlerAction.title = 'Authority check';
  handlerAction.execution_binding = { kind: 'handler_ref', handler_ref: 'handler:draft_brief' };
  delete handlerAction.stage_route;
  handlerAction.supported_surfaces.mcp.tool_name = 'sample_brief_agent_authority_check';
  handlerAction.supported_surfaces.skill.command_contract_id = 'sample-brief-agent.authority_check';
  handlerAction.supported_surfaces.product_entry.action_key = 'authority_check';
  handlerAction.supported_surfaces.openai.tool_name = 'sample_brief_agent_authority_check';
  handlerAction.supported_surfaces.ai_sdk.tool_name = 'sample_brief_agent_authority_check';
  actionCatalog.actions.push(handlerAction);
  writeJson(actionCatalogPath, actionCatalog);
  writeJson(path.join(repoDir, 'contracts', 'draft-brief.input.schema.json'), {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    required: ['workspace_root', 'brief'],
    properties: {
      workspace_root: { type: 'string' },
      brief: { type: 'string' },
      audience: { type: 'string' },
    },
  });

  const bundle = runCli(['agents', 'interfaces', '--repo-dir', repoDir]).generated_agent_interfaces;
  const descriptors = [
    bundle.cli.descriptors[1],
    bundle.mcp.descriptors[1],
    bundle.skill.descriptors[1],
    bundle.product_entry.descriptors[1],
    bundle.openai_tool.descriptors[1],
    bundle.ai_sdk.descriptors[1],
  ];

  assert.equal(bundle.status, 'ready');
  for (const descriptor of descriptors) {
    assert.deepEqual(descriptor.required_fields, ['workspace_root', 'brief']);
    assert.deepEqual(descriptor.optional_fields, ['audience']);
    assert.deepEqual(descriptor.execution_binding, {
      kind: 'handler_ref',
      handler_ref: 'handler:draft_brief',
    });
    assert.equal(
      descriptor.command,
      `opl agents run --domain sample-brief-agent --action authority_check --workspace ${repoDir}`,
    );
  }
  assert.equal(bundle.domain_handler.descriptors[0].handler_ref, 'handler:draft_brief');
});

test('generated interfaces reject non-canonical domain handler implementations', () => {
  const repoDir = buildReadyAgentRepo();
  const registryPath = path.join(repoDir, 'contracts', 'domain_handler_registry.json');
  const registry = parseJsonText(fs.readFileSync(registryPath, 'utf8')) as Record<string, any>;
  registry.handlers[0].binding = { kind: 'shell_command', command: 'node ./src/cli.ts' };
  writeJson(registryPath, registry);

  const actionCatalogPath = path.join(repoDir, 'contracts', 'action_catalog.json');
  const actionCatalog = parseJsonText(fs.readFileSync(actionCatalogPath, 'utf8')) as Record<string, any>;
  actionCatalog.actions[0].execution_binding = {
    kind: 'handler_ref',
    handler_ref: 'handler:draft_brief',
  };
  delete actionCatalog.actions[0].stage_route;
  writeJson(actionCatalogPath, actionCatalog);

  const failure = runCliFailure(['agents', 'interfaces', '--repo-dir', repoDir]);
  assert.equal(failure.payload.error.code, 'contract_shape_invalid');
  assert.ok(failure.payload.error.details.error.includes(
    'binding.kind must be typescript_export or python_callable',
  ));
});

test('generated interfaces require repo-contained callable handler implementations', () => {
  const registryFor = (repoDir: string) => {
    const registryPath = path.join(repoDir, 'contracts', 'domain_handler_registry.json');
    return {
      registryPath,
      registry: parseJsonText(fs.readFileSync(registryPath, 'utf8')) as Record<string, any>,
    };
  };

  const missingFileRepo = buildReadyAgentRepo();
  const missingFile = registryFor(missingFileRepo);
  missingFile.registry.handlers[0].binding.file = 'src/handlers/missing.ts';
  writeJson(missingFile.registryPath, missingFile.registry);
  const missingFileFailure = runCliFailure(['agents', 'interfaces', '--repo-dir', missingFileRepo]);
  assert.ok(missingFileFailure.payload.error.details.error.includes(
    'binding.file does not resolve inside the standard Agent root',
  ));

  const missingExportRepo = buildReadyAgentRepo();
  const missingExport = registryFor(missingExportRepo);
  missingExport.registry.handlers[0].binding.export = 'missingExport';
  writeJson(missingExport.registryPath, missingExport.registry);
  const missingExportFailure = runCliFailure(['agents', 'interfaces', '--repo-dir', missingExportRepo]);
  assert.ok(missingExportFailure.payload.error.details.error.includes(
    'binding.export does not resolve to a callable export',
  ));

  const declarationOnlyRepo = buildReadyAgentRepo();
  fs.writeFileSync(
    path.join(declarationOnlyRepo, 'src', 'handlers', 'draft-brief.ts'),
    'export declare function draftBrief(): void;\n',
  );
  const declarationOnlyFailure = runCliFailure([
    'agents',
    'interfaces',
    '--repo-dir',
    declarationOnlyRepo,
  ]);
  assert.ok(declarationOnlyFailure.payload.error.details.error.includes(
    'binding.export does not resolve to a callable export',
  ));

  const declarationFileRepo = buildReadyAgentRepo();
  const declarationFile = registryFor(declarationFileRepo);
  const declarationPath = path.join(declarationFileRepo, 'src', 'handlers', 'draft-brief.d.ts');
  fs.writeFileSync(declarationPath, 'export declare function draftBrief(): void;\n');
  declarationFile.registry.handlers[0].binding.file = 'src/handlers/draft-brief.d.ts';
  writeJson(declarationFile.registryPath, declarationFile.registry);
  const declarationFileFailure = runCliFailure(['agents', 'interfaces', '--repo-dir', declarationFileRepo]);
  assert.ok(declarationFileFailure.payload.error.details.error.includes(
    'binding.file must be a TypeScript or JavaScript module',
  ));

  const escapingRepo = buildReadyAgentRepo();
  const escapingHandlerPath = path.join(escapingRepo, 'src', 'handlers', 'draft-brief.ts');
  const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-handler-outside-'));
  const outsideHandlerPath = path.join(outsideDir, 'draft-brief.ts');
  fs.writeFileSync(outsideHandlerPath, 'export function draftBrief() {}\n');
  fs.rmSync(escapingHandlerPath);
  fs.symlinkSync(outsideHandlerPath, escapingHandlerPath);
  const escapingFailure = runCliFailure(['agents', 'interfaces', '--repo-dir', escapingRepo]);
  assert.ok(escapingFailure.payload.error.details.error.includes(
    'binding.file does not resolve inside the standard Agent root',
  ));

  const pythonRepo = buildReadyAgentRepo();
  const python = registryFor(pythonRepo);
  python.registry.handlers[0].binding = {
    kind: 'python_callable',
    module: 'sample.handlers',
    callable: 'DraftHandler.invoke',
  };
  writeJson(python.registryPath, python.registry);
  const pythonModulePath = path.join(pythonRepo, 'src', 'sample', 'handlers.py');
  fs.mkdirSync(path.dirname(pythonModulePath), { recursive: true });
  fs.writeFileSync(pythonModulePath, [
    'class DraftHandler:',
    '    @staticmethod',
    '    def invoke():',
    "        return {'status': 'owner_receipt_candidate'}",
    '',
  ].join('\n'));
  assert.equal(
    runCli(['agents', 'interfaces', '--repo-dir', pythonRepo]).generated_agent_interfaces.status,
    'ready',
  );

  python.registry.handlers[0].binding.callable = 'DraftHandler.missing';
  writeJson(python.registryPath, python.registry);
  const missingCallableFailure = runCliFailure(['agents', 'interfaces', '--repo-dir', pythonRepo]);
  assert.ok(missingCallableFailure.payload.error.details.error.includes(
    'binding.callable does not resolve to a callable Python symbol',
  ));
});

test('action catalog parameter lists reject non-arrays and non-string entries', () => {
  for (const [field, value] of [
    ['required_fields', 'workspace_root'],
    ['required_fields', ['workspace_root', 7]],
    ['optional_fields', 'audience'],
    ['optional_fields', ['audience', false]],
    ['workspace_locator_fields', 'workspace_root'],
    ['workspace_locator_fields', ['workspace_root', {}]],
  ] as const) {
    const repoDir = buildReadyAgentRepo();
    const actionCatalogPath = path.join(repoDir, 'contracts', 'action_catalog.json');
    const actionCatalog = parseJsonText(fs.readFileSync(actionCatalogPath, 'utf8')) as Record<string, any>;
    actionCatalog.actions[0][field] = value;
    writeJson(actionCatalogPath, actionCatalog);

    const failure = runCliFailure(['agents', 'interfaces', '--repo-dir', repoDir]);
    assert.equal(failure.payload.error.code, 'contract_shape_invalid');
    assert.ok(failure.payload.error.details.error.includes(`family_action_catalog.actions[0].${field}`));
  }
});

test('repo compiler rejects input schema symlinks that escape the repo', () => {
  const repoDir = buildReadyAgentRepo();
  const schemaPath = path.join(repoDir, 'contracts', 'draft-brief.input.schema.json');
  const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-action-schema-outside-'));
  const outsideSchema = path.join(outsideDir, 'outside.schema.json');
  writeJson(outsideSchema, {
    type: 'object',
    required: ['workspace_root'],
    properties: { workspace_root: { type: 'string' } },
  });
  fs.rmSync(schemaPath);
  fs.symlinkSync(outsideSchema, schemaPath);

  const bundle = runCli(['agents', 'interfaces', '--repo-dir', repoDir]).generated_agent_interfaces;
  assert.equal(bundle.status, 'blocked');
  assert.equal(bundle.source_contract_consumption.action_input_schema_resolutions[0].status,
    'invalid_repo_relative_ref');
});

test('repo compiler rejects uncompileable schemas and missing local fragments', () => {
  const invalidRepoDir = buildReadyAgentRepo();
  writeJson(path.join(invalidRepoDir, 'contracts', 'draft-brief.input.schema.json'), {
    type: 'not-a-json-schema-type',
  });
  const invalidBundle = runCli(['agents', 'interfaces', '--repo-dir', invalidRepoDir])
    .generated_agent_interfaces;
  assert.equal(invalidBundle.status, 'blocked');
  assert.equal(invalidBundle.source_contract_consumption.action_input_schema_resolutions[0].status,
    'invalid_schema');

  const fragmentRepoDir = buildReadyAgentRepo();
  const catalogPath = path.join(fragmentRepoDir, 'contracts', 'action_catalog.json');
  const catalog = parseJsonText(fs.readFileSync(catalogPath, 'utf8')) as Record<string, any>;
  catalog.actions[0].input_schema_ref = 'contracts/draft-brief.input.schema.json#/$defs/missing';
  writeJson(catalogPath, catalog);
  const fragmentBundle = runCli(['agents', 'interfaces', '--repo-dir', fragmentRepoDir])
    .generated_agent_interfaces;
  assert.equal(fragmentBundle.status, 'blocked');
  assert.equal(fragmentBundle.source_contract_consumption.action_input_schema_resolutions[0].status,
    'missing_fragment');
});

test('repo compiler rejects schemas with dangling local refs', () => {
  const repoDir = buildReadyAgentRepo();
  writeJson(path.join(repoDir, 'contracts', 'draft-brief.input.schema.json'), {
    $ref: '#/$defs/missing',
  });

  const bundle = runCli(['agents', 'interfaces', '--repo-dir', repoDir]).generated_agent_interfaces;
  assert.equal(bundle.status, 'blocked');
  assert.equal(bundle.source_contract_consumption.action_input_schema_resolutions[0].status,
    'invalid_schema');
});

test('repo compiler blocks malformed schema fragments without aborting readback', () => {
  const repoDir = buildReadyAgentRepo();
  const catalogPath = path.join(repoDir, 'contracts', 'action_catalog.json');
  const catalog = parseJsonText(fs.readFileSync(catalogPath, 'utf8')) as Record<string, any>;
  catalog.actions[0].input_schema_ref = 'contracts/draft-brief.input.schema.json#/%';
  writeJson(catalogPath, catalog);

  const bundle = runCli(['agents', 'interfaces', '--repo-dir', repoDir]).generated_agent_interfaces;
  assert.equal(bundle.status, 'blocked');
  assert.equal(bundle.source_contract_consumption.action_input_schema_resolutions[0].status,
    'missing_fragment');
});

test('repo compiler requires action fields to match the selected input schema', () => {
  const repoDir = buildReadyAgentRepo();
  const actionCatalogPath = path.join(repoDir, 'contracts', 'action_catalog.json');
  const actionCatalog = parseJsonText(fs.readFileSync(actionCatalogPath, 'utf8')) as Record<string, any>;
  actionCatalog.actions[0].required_fields = ['workspace_root', 'brief'];
  actionCatalog.actions[0].optional_fields = ['audience'];
  writeJson(actionCatalogPath, actionCatalog);

  const bundle = runCli(['agents', 'interfaces', '--repo-dir', repoDir]).generated_agent_interfaces;
  assert.equal(bundle.status, 'blocked');
  assert.equal(bundle.source_contract_consumption.action_input_schema_resolutions[0].status,
    'field_contract_mismatch');
});

test('repo compiler blocks missing repo-relative action input schemas', () => {
  const repoDir = buildReadyAgentRepo();
  fs.rmSync(path.join(repoDir, 'contracts', 'draft-brief.input.schema.json'));
  const bundle = runCli(['agents', 'interfaces', '--repo-dir', repoDir]).generated_agent_interfaces;

  assert.equal(bundle.status, 'blocked');
  assert.ok(bundle.blocker_reasons.includes(
    'missing_action_input_schema:draft_brief:contracts/draft-brief.input.schema.json',
  ));
});

test('repo compiler rejects unresolved handler refs and labels external schema resolution', () => {
  const invalidRepoDir = buildReadyAgentRepo();
  const invalidCatalogPath = path.join(invalidRepoDir, 'contracts', 'action_catalog.json');
  const invalidCatalog = parseJsonText(fs.readFileSync(invalidCatalogPath, 'utf8')) as Record<string, any>;
  invalidCatalog.actions[0].execution_binding = {
    kind: 'handler_ref',
    handler_ref: 'handler:missing-handler',
  };
  delete invalidCatalog.actions[0].stage_route;
  writeJson(invalidCatalogPath, invalidCatalog);

  const failure = runCliFailure(['agents', 'interfaces', '--repo-dir', invalidRepoDir]);
  assert.equal(failure.payload.error.code, 'contract_shape_invalid');
  assert.ok(failure.payload.error.details.error.includes(
    'Unresolved domain handler refs: missing-handler',
  ));

  const externalRepoDir = buildReadyAgentRepo();
  const externalCatalogPath = path.join(externalRepoDir, 'contracts', 'action_catalog.json');
  const externalCatalog = parseJsonText(fs.readFileSync(externalCatalogPath, 'utf8')) as Record<string, any>;
  externalCatalog.actions[0].input_schema_ref = 'opl://schemas/domain-action-input.v1';
  writeJson(externalCatalogPath, externalCatalog);

  const bundle = runCli(['agents', 'interfaces', '--repo-dir', externalRepoDir]).generated_agent_interfaces;
  assert.equal(bundle.status, 'ready');
  assert.deepEqual(bundle.source_contract_consumption.action_input_schema_resolutions[0], {
    action_id: 'draft_brief',
    input_schema_ref: 'opl://schemas/domain-action-input.v1',
    resolution_scope: 'external_contract_ref',
    status: 'external_resolution_explicit',
  });
});

test('generated interfaces family-defaults expose product-entry feed and direct parity for all domains', () => {
  const { fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-generated-interfaces-family-feed-'));
  const workspaceRoot = createFamilyDefaultContractWorkspace();
  const env = {
    OPL_CONTRACTS_DIR: fixtureContractsRoot,
    OPL_STATE_DIR: stateRoot,
    OPL_FAMILY_WORKSPACE_ROOT: workspaceRoot,
  };

  try {
    const feed = runCli(['agents', 'interfaces', '--family-defaults', '--format', 'product-entry'], env)
      .generated_agent_interfaces;
    assert.equal(feed.surface_kind, 'opl_generated_agent_interfaces_family_report');
    assert.deepEqual(feed.summary, {
      total_domain_count: 4,
      ready_domain_count: 4,
      blocked_domain_count: 0,
    });
    assert.equal(feed.authority_boundary.report_can_claim_domain_ready, false);
    for (const report of feed.reports) {
      const bundle = report.generated_agent_interfaces;
      assert.equal(bundle.status, 'ready');
      assert.equal(bundle.selected_format, 'product-entry');
      assert.equal(bundle.product_entry.status, 'ready');
      assert.equal(bundle.product_status.status, 'ready_from_family_action_catalog');
      assert.equal(bundle.workbench.status, 'ready_from_stage_control_plane');
      assert.equal(bundle.generated_surface_consumption_bundle.status, 'ready_for_generated_surface_consumption');
      assert.deepEqual(bundle.generated_surface_consumption_bundle.consumption_status_counts, {
        selected: 3,
        ready: 3,
        blocked: 0,
      });
      assertNoGeneratedAuthority(bundle.authority_boundary);
    }

    const report = runCli(['agents', 'interfaces', '--family-defaults'], env).generated_agent_interfaces;
    const expected = new Map([
      ['mas', { domain: 'med-autoscience', action: 'study_packet' }],
      ['mag', { domain: 'med-autogrant', action: 'grant_packet' }],
      ['rca', { domain: 'redcube_ai', action: 'visual_packet' }],
      ['oma', { domain: 'opl-meta-agent', action: 'agent_packet' }],
    ]);
    assert.deepEqual(
      report.reports.map((entry: { requested_agent_id: string }) => entry.requested_agent_id).sort(),
      [...expected.keys()].sort(),
    );
    for (const entry of report.reports) {
      const expectedDomain = expected.get(entry.requested_agent_id);
      assert.ok(expectedDomain, `unexpected generated interface report ${entry.requested_agent_id}`);
      assert.equal(entry.generated_agent_interfaces.agent_id, entry.requested_agent_id);
      assert.equal(entry.generated_agent_interfaces.target_domain_id, expectedDomain.domain);
      const parity = entry.generated_agent_interfaces.generated_direct_parity;
      assert.equal(parity.status, 'aligned');
      assert.equal(parity.domain_id, expectedDomain.domain);
      assert.deepEqual(parity.checked_action_ids, [expectedDomain.action]);
      assert.deepEqual(parity.checked_surface_ids, [
        'cli',
        'mcp',
        'skill',
        'product_entry',
        'openai_tool',
        'ai_sdk',
      ]);
      assert.equal(parity.issue_count, 0);
      assert.equal(parity.accepted_answer_shape_roundtrip[0].roundtrip_status, 'accepted_answer_shape_aligned');
      assertNoGeneratedAuthority(parity.authority_boundary);
    }
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test('generated interfaces consume active repo handoff and disambiguate multi-action MCP lineage', () => {
  const { fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-generated-interfaces-domain-handoff-'));
  const targetDir = buildReadyAgentRepo();
  retargetReadyRepo(targetDir, 'med-autoscience', 'MedAutoScience');
  const env = { OPL_CONTRACTS_DIR: fixtureContractsRoot, OPL_STATE_DIR: stateRoot };
  const fixtures = loadFamilyManifestFixtures();
  const manifest = withPackCompilerReadySurfaces(fixtures.medautoscience, {
    agentId: 'mas',
    targetDomainId: 'med-autoscience',
    owner: 'MedAutoScience',
    actionId: 'study_packet',
    stageId: 'study_stage',
    memoryRefId: 'mas_publication_route_memory',
  }) as Record<string, any>;
  const manifestSurface = writeDomainRepoContracts(targetDir, manifest);

  runCli([
    'workspace',
    'bind',
    '--project',
    'medautoscience',
    '--path',
    targetDir,
    '--manifest-command',
    buildManifestCommand(manifest),
  ], env);

  const readyBundle = runCli(['agents', 'interfaces', '--domain', 'mas'], env).generated_agent_interfaces;
  assert.equal(readyBundle.status, 'ready');
  assert.equal(readyBundle.active_caller_target_proof.status, 'ready');
  assert.equal(readyBundle.generated_direct_parity.status, 'aligned');
  assert.equal(readyBundle.generated_wrapper_bundle.status, 'ready');
  assert.equal(readyBundle.generated_surface_consumption_bundle.status, 'ready_for_generated_surface_consumption');
  assert.equal(readyBundle.generated_surface_consumption_bundle.consumption_status_counts.ready, 8);

  const catalog = manifestSurface.family_action_catalog as Record<string, any>;
  const firstAction = catalog.actions[0];
  catalog.actions.push({
    ...firstAction,
    action_id: 'study_packet_route',
    source_of_work: {
      source_catalog: 'family_action_catalog',
      source_catalog_ref: `family_action_catalog:${catalog.catalog_id}`,
      source_action_id: 'study_packet_route',
      stage_catalog_ref: 'family_stage_control_plane',
      derived_surface_policy: 'derive_cli_mcp_openai_ai_sdk_skill_app_status_workbench_from_single_catalog',
      domain_repo_wrapper_policy: 'handler_target_refs_only_adapter_or_tombstone_candidate',
    },
    input_schema_ref: 'contracts/route-input.schema.json',
    output_schema_ref: 'contracts/route-output.schema.json',
    supported_surfaces: {
      ...firstAction.supported_surfaces,
      mcp: {
        tool_name: 'study_packet_route',
        surface_kind: 'domain_mcp',
      },
      skill: {
        command_contract_id: 'study_packet_route',
        surface_kind: 'domain_skill_contract',
      },
      product_entry: {
        action_key: 'study_packet_route',
        surface_kind: 'domain_product_entry',
      },
      openai: { tool_name: 'study_packet_route' },
      ai_sdk: { tool_name: 'study_packet_route' },
    },
  });
  fs.writeFileSync(path.join(targetDir, 'contracts', 'action_catalog.json'), `${JSON.stringify(catalog)}\n`);
  const stageManifestPath = path.join(targetDir, 'agent', 'stages', 'manifest.json');
  const stageManifest = parseJsonText(fs.readFileSync(stageManifestPath, 'utf8')) as Record<string, any>;
  stageManifest.stages[0].allowed_action_refs = ['study_packet', 'study_packet_route'];
  fs.writeFileSync(stageManifestPath, `${JSON.stringify(stageManifest, null, 2)}\n`);

  const lineageBundle = runCli(['agents', 'interfaces', '--repo-dir', targetDir], env).generated_agent_interfaces;
  const routeParity = lineageBundle.generated_direct_parity.action_parity.find(
    (entry: { action_id: string }) => entry.action_id === 'study_packet_route',
  );
  const routeMcpParity = routeParity.generated_surfaces.find(
    (surface: { surface_id: string }) => surface.surface_id === 'mcp',
  );

  assert.equal(lineageBundle.generated_direct_parity.status, 'aligned');
  assert.deepEqual(lineageBundle.generated_direct_parity.checked_action_ids, [
    'study_packet',
    'study_packet_route',
  ]);
  assert.equal(routeParity.status, 'aligned');
  assert.equal(routeMcpParity.source_action_id, 'study_packet_route');
  assert.equal(routeMcpParity.output_schema_ref, 'contracts/route-output.schema.json');
  assert.equal(
    lineageBundle.generated_direct_parity.accepted_answer_shape_roundtrip.find(
      (entry: { action_id: string }) => entry.action_id === 'study_packet_route',
    ).generated_accepted_answer_shape_refs.mcp,
    'contracts/route-output.schema.json',
  );
});
