import { assert, fs, os, path, runCli, test } from '../helpers.ts';
import { buildRepoContractDescriptor } from '../../../../src/modules/pack/domain-pack-compiler/repo-contract-descriptor.ts';
import { buildReadyAgentRepo, writeJson } from './agents-conformance-fixtures.ts';

function writeCompactAudit(repoDir: string, codePaths: string[]) {
  for (const sourcePath of [
    ...codePaths,
    'agent/primary_skill/SKILL.md',
    'runtime/domain-handler.ts',
  ]) {
    const filePath = path.join(repoDir, sourcePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, '# compact audit fixture\n');
  }
  const packInputPath = path.join(repoDir, 'contracts', 'pack_compiler_input.json');
  const packInput = JSON.parse(fs.readFileSync(packInputPath, 'utf8')) as Record<string, unknown>;
  packInput.declarative_domain_pack = ['stage_manifest', 'action_catalog'];
  writeJson(packInputPath, packInput);
  writeJson(path.join(repoDir, 'contracts', 'functional_privatization_audit.json'), {
    schema_version: 1,
    surface_kind: 'functional_privatization_audit',
    owner: 'SampleBriefAgent',
    domain_id: 'sample-brief-agent',
    target_domain_id: 'sample-brief-agent',
    authority_boundary: {
      domain_can_claim_generic_runtime_owner: false,
      domain_repo_can_own_generated_surface: false,
      opl_can_write_domain_truth: false,
      opl_can_write_memory_body: false,
      opl_can_authorize_quality_or_export: false,
    },
    modules: [
      {
        module_id: 'sample_brief_owner_receipt',
        classification: 'minimal_authority_function',
        code_paths: ['runtime/domain-handler.ts'],
        active_callers: ['OPL generated domain handler dispatch'],
        migration_action: 'keep_domain_authority_function',
        retention_reason: 'OPL cannot sign a domain owner receipt.',
        standardization_layer: 'authority_function_inventory',
      },
      {
        module_id: 'sample_brief_refs_projection',
        classification: 'refs_only_domain_adapter',
        code_paths: codePaths,
        active_callers: ['OPL generated interface projections'],
        migration_action: 'expose_refs_only_to_opl_generated_surfaces',
        retention_reason: 'Domain projection refs remain domain-owned.',
        standardization_layer: 'private_platform_residue_inventory',
      },
    ],
    retired_generated_surface_provenance: [
      {
        surface_id: 'legacy_cli_wrapper',
        replacement_ref: 'contracts/generated_surface_handoff.json#cli',
        provenance_refs: ['docs/history/legacy-cli-wrapper.md'],
      },
      {
        surface_id: 'legacy_status_wrapper',
        replacement_ref: 'contracts/generated_surface_handoff.json#status_read_model',
        provenance_refs: ['docs/history/legacy-status-wrapper.md'],
      },
      {
        surface_id: 'legacy_workbench_wrapper',
        replacement_ref: 'contracts/generated_surface_handoff.json#workbench_drilldown',
        provenance_refs: ['docs/history/legacy-workbench-wrapper.md'],
      },
      {
        surface_id: 'legacy_runtime_probe',
        replacement_ref: 'contracts/generated_surface_handoff.json#domain_handler',
        provenance_refs: ['docs/history/legacy-runtime-probe.md'],
      },
    ],
    bridge_exit_gate: {
      physical_delete_authorization_refs: ['owner-receipt:retirement'],
      no_forbidden_write_refs: ['test:no-forbidden-write'],
      provenance_refs: ['docs/history/legacy-generated-surfaces.md'],
    },
  });
}

test('generated interfaces derive compact functional audit inventory from the contract, pack inventory, and source readback', (t) => {
  const repoDir = buildReadyAgentRepo();
  t.after(() => fs.rmSync(repoDir, { recursive: true, force: true }));
  const codePaths = [
    'agent/cli.ts',
    'agent/mcp.ts',
    'agent/product-entry.ts',
    'agent/status.ts',
    'runtime/workbench.ts',
    'runtime/harness.ts',
  ];
  writeCompactAudit(repoDir, codePaths);

  const descriptor = buildRepoContractDescriptor(repoDir).descriptor;
  const audit = descriptor.functional_privatization_audit as Record<string, unknown>;
  const bundle = runCli(['agents', 'interfaces', '--repo-dir', repoDir]).generated_agent_interfaces;
  const sourceConsumption = bundle.source_contract_consumption.consumed_contracts.find(
    (contract: { contract_id: string }) => contract.contract_id === 'functional_privatization_audit',
  );

  assert.equal(audit.source_field_role, 'standard_contract_source');
  assert.equal((audit.summary as Record<string, unknown>).authority_function_inventory_count, 1);
  assert.equal((audit.summary as Record<string, unknown>).private_platform_residue_inventory_count, 5);
  assert.equal((audit.summary as Record<string, unknown>).standard_domain_pack_inventory_count, 2);
  assert.equal((audit.contract_readback as Record<string, unknown>).status, 'resolved');
  assert.equal(
    ((audit.contract_readback as Record<string, unknown>).morphology as Record<string, unknown>).resolved_code_path_count,
    7,
  );
  assert.equal(
    ((audit.contract_readback as Record<string, unknown>).morphology as Record<string, unknown>).retired_generated_surface_provenance_count,
    4,
  );
  assert.deepEqual((audit.contract_readback as Record<string, unknown>).blockers, []);
  assert.equal(sourceConsumption.status, 'resolved');
});

test('compact functional audit accepts a domain-declared non-empty retired provenance list without fixed cardinality', (t) => {
  const repoDir = buildReadyAgentRepo();
  t.after(() => fs.rmSync(repoDir, { recursive: true, force: true }));
  writeCompactAudit(repoDir, ['agent/cli.ts']);
  const auditPath = path.join(repoDir, 'contracts', 'functional_privatization_audit.json');
  const audit = JSON.parse(fs.readFileSync(auditPath, 'utf8')) as Record<string, unknown>;
  audit.retired_generated_surface_provenance = (audit.retired_generated_surface_provenance as unknown[]).slice(0, 1);
  writeJson(auditPath, audit);

  const descriptor = buildRepoContractDescriptor(repoDir).descriptor;
  const readback = descriptor.functional_privatization_audit as Record<string, any>;

  assert.equal(readback.contract_readback.status, 'resolved');
  assert.equal(readback.contract_readback.morphology.retired_generated_surface_provenance_count, 1);
  assert.deepEqual(readback.contract_readback.blockers, []);
});

for (const invalidCase of [
  {
    name: 'missing list',
    mutate(audit: Record<string, unknown>) {
      delete audit.retired_generated_surface_provenance;
    },
    blocker: 'compact_functional_audit_missing_retired_generated_surface_provenance',
  },
  {
    name: 'empty list',
    mutate(audit: Record<string, unknown>) {
      audit.retired_generated_surface_provenance = [];
    },
    blocker: 'compact_functional_audit_requires_retired_generated_surface_provenance_entry',
  },
  {
    name: 'non-object entry',
    mutate(audit: Record<string, unknown>) {
      audit.retired_generated_surface_provenance = ['legacy-wrapper'];
    },
    blocker: 'compact_functional_audit_retired_provenance_invalid_entry:0',
  },
  {
    name: 'entry missing replacement ref',
    mutate(audit: Record<string, unknown>) {
      audit.retired_generated_surface_provenance = [{
        surface_id: 'legacy-wrapper',
        provenance_refs: ['docs/history/legacy-wrapper.md'],
      }];
    },
    blocker: 'compact_functional_audit_retired_provenance_missing_replacement_ref:0',
  },
]) {
  test(`compact functional audit fails closed for ${invalidCase.name}`, (t) => {
    const repoDir = buildReadyAgentRepo();
    t.after(() => fs.rmSync(repoDir, { recursive: true, force: true }));
    writeCompactAudit(repoDir, ['agent/cli.ts']);
    const auditPath = path.join(repoDir, 'contracts', 'functional_privatization_audit.json');
    const audit = JSON.parse(fs.readFileSync(auditPath, 'utf8')) as Record<string, unknown>;
    invalidCase.mutate(audit);
    writeJson(auditPath, audit);

    const descriptor = buildRepoContractDescriptor(repoDir).descriptor;
    const readback = descriptor.functional_privatization_audit as Record<string, any>;

    assert.equal(readback.contract_readback.status, 'blocked');
    assert.equal(readback.contract_readback.blockers.includes(invalidCase.blocker), true);
  });
}

test('generated interfaces consume compact functional audits directly without source-ref aliases', (t) => {
  const repoDir = buildReadyAgentRepo();
  t.after(() => fs.rmSync(repoDir, { recursive: true, force: true }));
  writeCompactAudit(repoDir, ['agent/cli.ts']);

  const packInputPath = path.join(repoDir, 'contracts', 'pack_compiler_input.json');
  const packInput = JSON.parse(fs.readFileSync(packInputPath, 'utf8')) as {
    source_refs: Record<string, unknown>;
  };
  delete packInput.source_refs.functional_audit;
  delete packInput.source_refs.functional_privatization_audit_source_ref;
  writeJson(packInputPath, packInput);

  const validation = runCli(['agents', 'scaffold', '--validate', repoDir]).standard_domain_agent_scaffold;
  const bundle = runCli(['agents', 'interfaces', '--repo-dir', repoDir]).generated_agent_interfaces;
  const sourceConsumption = bundle.source_contract_consumption.consumed_contracts.find(
    (contract: { contract_id: string }) => contract.contract_id === 'functional_privatization_audit',
  );

  assert.equal(validation.validation.status, 'passed');
  assert.equal(bundle.status, 'ready');
  assert.equal(sourceConsumption.status, 'resolved');
});

test('generated interfaces block a compact audit when a declared source path is absent', (t) => {
  const repoDir = buildReadyAgentRepo();
  t.after(() => fs.rmSync(repoDir, { recursive: true, force: true }));
  writeCompactAudit(repoDir, ['agent/cli.ts', 'src/missing-domain-adapter.py']);
  fs.rmSync(path.join(repoDir, 'src', 'missing-domain-adapter.py'), { force: true });

  const descriptor = buildRepoContractDescriptor(repoDir).descriptor;
  const audit = descriptor.functional_privatization_audit as Record<string, unknown>;
  const bundle = runCli(['agents', 'interfaces', '--repo-dir', repoDir]).generated_agent_interfaces;
  const sourceConsumption = bundle.source_contract_consumption.consumed_contracts.find(
    (contract: { contract_id: string }) => contract.contract_id === 'functional_privatization_audit',
  );

  assert.equal((audit.contract_readback as Record<string, unknown>).status, 'blocked');
  assert.equal(
    ((audit.contract_readback as Record<string, unknown>).blockers as string[]).includes(
      'compact_functional_audit_code_path_missing:sample_brief_refs_projection:src/missing-domain-adapter.py',
    ),
    true,
  );
  assert.equal(sourceConsumption.status, 'blocked');
});

test('generated interfaces block a compact audit source symlink that escapes the repository', (t) => {
  const repoDir = buildReadyAgentRepo();
  const externalDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-compact-audit-external-'));
  t.after(() => {
    fs.rmSync(repoDir, { recursive: true, force: true });
    fs.rmSync(externalDir, { recursive: true, force: true });
  });
  const sourceRef = 'runtime/escaped-domain-adapter.ts';
  writeCompactAudit(repoDir, ['agent/cli.ts', sourceRef]);
  const linkedPath = path.join(repoDir, sourceRef);
  fs.rmSync(linkedPath, { force: true });
  const externalPath = path.join(externalDir, 'escaped-domain-adapter.ts');
  fs.writeFileSync(externalPath, '# external source\n');
  fs.symlinkSync(externalPath, linkedPath);

  const descriptor = buildRepoContractDescriptor(repoDir).descriptor;
  const audit = descriptor.functional_privatization_audit as Record<string, unknown>;
  const bundle = runCli(['agents', 'interfaces', '--repo-dir', repoDir]).generated_agent_interfaces;
  const sourceConsumption = bundle.source_contract_consumption.consumed_contracts.find(
    (contract: { contract_id: string }) => contract.contract_id === 'functional_privatization_audit',
  );

  assert.equal((audit.contract_readback as Record<string, unknown>).status, 'blocked');
  assert.equal(
    ((audit.contract_readback as Record<string, unknown>).blockers as string[]).includes(
      `compact_functional_audit_code_path_escaped_repo:sample_brief_refs_projection:${sourceRef}`,
    ),
    true,
  );
  assert.equal(sourceConsumption.status, 'blocked');
});
