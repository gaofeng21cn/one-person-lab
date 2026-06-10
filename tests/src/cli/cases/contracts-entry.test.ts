import { spawnSync } from 'node:child_process';

import { FrameworkContractError, PassThrough, assert, buildManifestCommand, buildProjectProgressBrief, cliPath, contractsDir, createCodexConfigFixture, createContractsFixtureRoot, createFakeCodexFixture, createFakeLaunchctlFixture, createFakeOpenFixture, createFakeShellCommandFixture, createFamilyContractsFixtureRoot, createFamilyLocatorResolverFixture, createGitModuleRemoteFixture, createMasWorkspaceFixture, explainDomainBoundary, familyManifestFixtureDir, fs, loadFamilyManifestFixtures, loadFrameworkContracts, once, os, path, readJsonFixture, readJsonLine, repoRoot, selectDomainAgentEntry, runCli, runCliAsync, runCliFailure, runCliFailureInCwd, runCliInCwd, runCliRaw, runCliViaEntryPathInCwd, shellSingleQuote, spawn, startCliServer, startFakeOplApiServer, stopCliPipeChild, stopCliServer, stopHttpServer, test, validateFrameworkContracts, writeJsonLine, assertContractsContext, assertNoContractsProvenance, assertMagActionGraph, assertMasActionGraph, assertRedcubeActionGraph } from '../helpers.ts';

test('loadFrameworkContracts returns the active framework registries', () => {
  const contracts = loadFrameworkContracts(repoRoot);

  assert.equal(contracts.contractsRootSource, 'api');
  assert.equal(contracts.workstreams.version, 'g2');
  assert.equal(contracts.domains.version, 'g2');
  assert.equal(contracts.stageSelectionVocabulary.version, 'g2');
  assert.equal(contracts.taskTopology.scope, 'opl_stage_led_task_topology');
  assert.equal(
    contracts.publicSurfaceIndex.scope,
    'opl_framework_public_surface_index',
  );
});

test('readJsonLine removes transient error listeners after each parsed line', async () => {
  const stream = new PassThrough();

  stream.write('{"id":1}\n');
  const first = await readJsonLine(stream);
  assert.equal(first.id, 1);
  assert.equal(stream.listenerCount('error'), 0);

  stream.write('{"id":2}\n');
  const second = await readJsonLine(stream);
  assert.equal(second.id, 2);
  assert.equal(stream.listenerCount('error'), 0);
});

test('readJsonLine preserves buffered sibling lines from the same chunk', async () => {
  const stream = new PassThrough();

  stream.write('{"id":1}\n{"id":2}\n');
  const first = await readJsonLine(stream);
  assert.equal(first.id, 1);

  const second = await Promise.race([
    readJsonLine(stream),
    new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error('readJsonLine did not flush the second line from the same chunk.'));
      }, 100);
    }),
  ]);
  assert.equal(second.id, 2);
  assert.equal(stream.listenerCount('error'), 0);
});

test('stopCliPipeChild waits for spawned stdio children to exit', async () => {
  const child = spawn(
    process.execPath,
    ['-e', 'setInterval(() => {}, 1000)'],
    {
      cwd: repoRoot,
      stdio: ['pipe', 'pipe', 'pipe'],
    },
  );

  await stopCliPipeChild(child);
  assert.notEqual(child.exitCode === null && child.signalCode === null, true);
});

test('loadFrameworkContracts rejects missing files with a stable error', async (t) => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-framework-missing-'));
  const expectedContractsDir = path.join(tempRoot, 'contracts', 'opl-framework');

  await t.test('missing contracts directory', () => {
    assert.throws(
      () => loadFrameworkContracts(tempRoot),
      (error: unknown) => {
        assert.ok(error instanceof FrameworkContractError);
        assert.equal(error.code, 'contract_file_missing');
        assert.equal(error.details?.contracts_dir, expectedContractsDir);
        assert.equal(error.details?.contracts_root_source, 'api');
        return true;
      },
    );
  });
});

test('loadFrameworkContracts honors OPL_CONTRACTS_DIR when provided', () => {
  const tempContracts = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-framework-contracts-'));
  fs.cpSync(contractsDir, tempContracts, {
    recursive: true,
  });

  const workstreamsPath = path.join(tempContracts, 'workstreams.json');
  const workstreams = JSON.parse(fs.readFileSync(workstreamsPath, 'utf8'));
  workstreams.workstreams.find((entry: { workstream_id: string }) => entry.workstream_id === 'research_ops').label = 'Research Ops Override';
  fs.writeFileSync(workstreamsPath, JSON.stringify(workstreams, null, 2));

  const output = runCli(['contract', 'workstream', 'research_ops'], {
    OPL_CONTRACTS_DIR: tempContracts,
  });

  assertContractsContext(output, 'env', tempContracts);
  assert.equal(output.workstream.label, 'Research Ops Override');
});

test('global --contracts-dir override uses the explicit contract root', () => {
  const { fixtureRoot, fixtureContractsRoot } = createContractsFixtureRoot((contractsRoot) => {
    const workstreamsPath = path.join(contractsRoot, 'workstreams.json');
    const workstreams = JSON.parse(fs.readFileSync(workstreamsPath, 'utf8'));
    workstreams.workstreams.find((entry: { workstream_id: string }) => entry.workstream_id === 'research_ops').label = 'Research Ops From Flag';
    fs.writeFileSync(workstreamsPath, JSON.stringify(workstreams, null, 2));
  });

  try {
    const output = runCli([
      '--contracts-dir',
      fixtureContractsRoot,
      'contract',
      'workstream',
      'research_ops',
    ]);

    assertContractsContext(output, 'cli_flag', fixtureContractsRoot);
    assert.equal(output.workstream.label, 'Research Ops From Flag');
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('global --contracts-dir override takes precedence over OPL_CONTRACTS_DIR', () => {
  const envFixture = createContractsFixtureRoot((contractsRoot) => {
    const workstreamsPath = path.join(contractsRoot, 'workstreams.json');
    const workstreams = JSON.parse(fs.readFileSync(workstreamsPath, 'utf8'));
    workstreams.workstreams.find((entry: { workstream_id: string }) => entry.workstream_id === 'research_ops').label = 'Research Ops From Env';
    fs.writeFileSync(workstreamsPath, JSON.stringify(workstreams, null, 2));
  });
  const flagFixture = createContractsFixtureRoot((contractsRoot) => {
    const workstreamsPath = path.join(contractsRoot, 'workstreams.json');
    const workstreams = JSON.parse(fs.readFileSync(workstreamsPath, 'utf8'));
    workstreams.workstreams.find((entry: { workstream_id: string }) => entry.workstream_id === 'research_ops').label = 'Research Ops From Flag';
    fs.writeFileSync(workstreamsPath, JSON.stringify(workstreams, null, 2));
  });

  try {
    const output = runCli(
      ['--contracts-dir', flagFixture.fixtureContractsRoot, 'contract', 'workstream', 'research_ops'],
      { OPL_CONTRACTS_DIR: envFixture.fixtureContractsRoot },
    );

    assertContractsContext(output, 'cli_flag', flagFixture.fixtureContractsRoot);
    assert.equal(output.workstream.label, 'Research Ops From Flag');
  } finally {
    fs.rmSync(envFixture.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(flagFixture.fixtureRoot, { recursive: true, force: true });
  }
});

test('validateFrameworkContracts returns a stable summary for the required contract set', () => {
  const validation = validateFrameworkContracts(repoRoot);
  const contracts = loadFrameworkContracts(repoRoot);

  assert.deepEqual(validation, {
    status: 'valid',
    contracts_dir: contractsDir,
    contracts_root_source: 'api',
    validated_contracts: [
      {
        contract_id: 'workstreams',
        file: path.join(contractsDir, 'workstreams.json'),
        schema_version: contracts.workstreams.version,
        status: 'valid',
      },
      {
        contract_id: 'domains',
        file: path.join(contractsDir, 'domains.json'),
        schema_version: 'g2',
        status: 'valid',
      },
      {
        contract_id: 'stage_selection_vocabulary',
        file: path.join(contractsDir, 'stage-selection-vocabulary.json'),
        schema_version: contracts.stageSelectionVocabulary.version,
        status: 'valid',
      },
      {
        contract_id: 'task_topology',
        file: path.join(contractsDir, 'task-topology.json'),
        schema_version: contracts.taskTopology.version,
        status: 'valid',
      },
      {
        contract_id: 'public_surface_index',
        file: path.join(contractsDir, 'public-surface-index.json'),
        schema_version: contracts.publicSurfaceIndex.version,
        status: 'valid',
      },
      {
        contract_id: 'agent_workspace_norm',
        file: path.join(contractsDir, 'agent-workspace-norm-contract.json'),
        schema_version: contracts.agentWorkspaceNorm.version,
        status: 'valid',
      },
      {
        contract_id: 'brand_module_registry',
        file: path.join(contractsDir, 'brand-module-registry.json'),
        schema_version: contracts.brandModuleRegistry.version,
        status: 'valid',
      },
      {
        contract_id: 'brand_cli_governance',
        file: path.join(contractsDir, 'brand-cli-governance.json'),
        schema_version: contracts.brandCliGovernance.version,
        status: 'valid',
      },
      {
        contract_id: 'brand_module_surfaces',
        file: path.join(contractsDir, 'brand-module-surfaces.json'),
        schema_version: contracts.brandModuleSurfaces.version,
        status: 'valid',
      },
      {
        contract_id: 'brand_module_l5_operating_evidence',
        file: path.join(contractsDir, 'brand-module-l5-operating-evidence.json'),
        schema_version: contracts.brandModuleL5OperatingEvidence.version,
        status: 'valid',
      },
      {
        contract_id: 'brand_system_profile',
        file: path.join(contractsDir, 'brand-system-profile.json'),
        schema_version: contracts.brandSystemProfile.version,
        status: 'valid',
      },
      {
        contract_id: 'target_operating_architecture',
        file: path.join(contractsDir, 'target-operating-architecture-contract.json'),
        schema_version: contracts.targetOperatingArchitecture.schema_version,
        status: 'valid',
      },
      {
        contract_id: 'pack_os',
        file: path.join(contractsDir, 'pack-os-contract.json'),
        schema_version: String(contracts.packOs.schema_version),
        status: 'valid',
      },
    ],
  });
});

test('contract validate returns a stable machine-readable contract summary', () => {
  const output = runCli(['contract', 'validate']);
  const contracts = loadFrameworkContracts(repoRoot);

  assert.deepEqual(output, {
    version: 'g2',
    validation: {
      status: 'valid',
      contracts_dir: contractsDir,
      contracts_root_source: 'cwd',
      validated_contracts: [
        {
          contract_id: 'workstreams',
          file: path.join(contractsDir, 'workstreams.json'),
          schema_version: contracts.workstreams.version,
          status: 'valid',
        },
        {
          contract_id: 'domains',
          file: path.join(contractsDir, 'domains.json'),
          schema_version: 'g2',
          status: 'valid',
        },
        {
          contract_id: 'stage_selection_vocabulary',
          file: path.join(contractsDir, 'stage-selection-vocabulary.json'),
          schema_version: contracts.stageSelectionVocabulary.version,
          status: 'valid',
        },
        {
          contract_id: 'task_topology',
          file: path.join(contractsDir, 'task-topology.json'),
          schema_version: contracts.taskTopology.version,
          status: 'valid',
        },
        {
          contract_id: 'public_surface_index',
          file: path.join(contractsDir, 'public-surface-index.json'),
          schema_version: contracts.publicSurfaceIndex.version,
          status: 'valid',
        },
        {
          contract_id: 'agent_workspace_norm',
          file: path.join(contractsDir, 'agent-workspace-norm-contract.json'),
          schema_version: contracts.agentWorkspaceNorm.version,
          status: 'valid',
        },
        {
          contract_id: 'brand_module_registry',
          file: path.join(contractsDir, 'brand-module-registry.json'),
          schema_version: contracts.brandModuleRegistry.version,
          status: 'valid',
        },
        {
          contract_id: 'brand_cli_governance',
          file: path.join(contractsDir, 'brand-cli-governance.json'),
          schema_version: contracts.brandCliGovernance.version,
          status: 'valid',
        },
        {
          contract_id: 'brand_module_surfaces',
          file: path.join(contractsDir, 'brand-module-surfaces.json'),
          schema_version: contracts.brandModuleSurfaces.version,
          status: 'valid',
        },
        {
          contract_id: 'brand_module_l5_operating_evidence',
          file: path.join(contractsDir, 'brand-module-l5-operating-evidence.json'),
          schema_version: contracts.brandModuleL5OperatingEvidence.version,
          status: 'valid',
        },
        {
          contract_id: 'brand_system_profile',
          file: path.join(contractsDir, 'brand-system-profile.json'),
          schema_version: contracts.brandSystemProfile.version,
          status: 'valid',
        },
        {
          contract_id: 'target_operating_architecture',
          file: path.join(contractsDir, 'target-operating-architecture-contract.json'),
          schema_version: contracts.targetOperatingArchitecture.schema_version,
          status: 'valid',
        },
        {
          contract_id: 'pack_os',
          file: path.join(contractsDir, 'pack-os-contract.json'),
          schema_version: String(contracts.packOs.schema_version),
          status: 'valid',
        },
      ],
    },
  });
});

test('agent workspace norm contract is fail-closed during load and validation', () => {
  const { fixtureRoot, fixtureContractsRoot } = createContractsFixtureRoot((contractsRoot) => {
    const normPath = path.join(contractsRoot, 'agent-workspace-norm-contract.json');
    const normContract = JSON.parse(fs.readFileSync(normPath, 'utf8'));
    normContract.default_workspace_precondition.command = 'opl workspace bootstrap';
    fs.writeFileSync(normPath, `${JSON.stringify(normContract, null, 2)}\n`);
  });

  try {
    assert.throws(
      () => loadFrameworkContracts({
        contractsDir: fixtureContractsRoot,
        source: 'api',
      }),
      (error: unknown) => {
        assert.ok(error instanceof FrameworkContractError);
        assert.equal(error.code, 'contract_shape_invalid');
        assert.equal(error.details?.field, 'default_workspace_precondition.command');
        assert.equal(error.details?.expected, 'opl workspace ensure');
        assert.equal(error.details?.actual, 'opl workspace bootstrap');
        assert.equal(error.details?.file, path.join(fixtureContractsRoot, 'agent-workspace-norm-contract.json'));
        return true;
      },
    );

    const { status, payload } = runCliFailure([
      '--contracts-dir',
      fixtureContractsRoot,
      'contract',
      'validate',
    ]);
    assert.equal(status, 3);
    assert.equal(payload.error.code, 'contract_shape_invalid');
    assert.equal(payload.error.details.field, 'default_workspace_precondition.command');
    assert.equal(payload.error.details.expected, 'opl workspace ensure');
    assert.equal(payload.error.details.actual, 'opl workspace bootstrap');
    assert.equal(payload.error.details.file, path.join(fixtureContractsRoot, 'agent-workspace-norm-contract.json'));
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('target operating architecture contract requires the multi-plane operating model', () => {
  const { fixtureRoot, fixtureContractsRoot } = createContractsFixtureRoot((contractsRoot) => {
    const contractPath = path.join(contractsRoot, 'target-operating-architecture-contract.json');
    const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
    delete contract.multi_plane_operating_system;
    fs.writeFileSync(contractPath, `${JSON.stringify(contract, null, 2)}\n`);
  });

  try {
    assert.throws(
      () => loadFrameworkContracts({
        contractsDir: fixtureContractsRoot,
        source: 'api',
      }),
      (error: unknown) => {
        assert.ok(error instanceof FrameworkContractError);
        assert.equal(error.code, 'contract_shape_invalid');
        assert.equal(error.details?.field, 'multi_plane_operating_system');
        assert.equal(error.details?.file, path.join(fixtureContractsRoot, 'target-operating-architecture-contract.json'));
        return true;
      },
    );
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('doctor reports a Codex-default ready local entry without Hermes compatibility diagnostics', () => {
  const { fixtureRoot: codexFixtureRoot, codexPath } = createFakeCodexFixture(`
echo "unused"
exit 0
`);

  try {
    const output = runCli(['doctor'], {
      OPL_CODEX_BIN: codexPath,
      OPL_HERMES_BIN: path.join(codexFixtureRoot, 'retired-hermes'),
      OPL_FAMILY_RUNTIME_PROVIDER: '',
      OPL_TEMPORAL_ADDRESS: '',
      TEMPORAL_ADDRESS: '',
    });

    assert.equal(output.version, 'g2');
    assert.equal(output.product_entry.entry_surface, 'opl_local_product_entry_shell');
    assert.equal(output.product_entry.runtime_substrate, 'codex_default_executor_with_provider_backed_family_runtime');
    assert.equal(output.product_entry.ready, false);
    assert.equal(output.product_entry.local_entry_ready, true);
    assert.equal(output.product_entry.online_runtime_ready, false);
    assert.equal(output.product_entry.configured_provider, 'temporal');
    assert.equal(output.product_entry.family_runtime_provider_ready, false);
    assert.equal(Object.hasOwn(output.product_entry, 'messaging_gateway_ready'), false);
    assert.equal(Object.hasOwn(output.product_entry, 'hermes'), false);
    assert.match(output.product_entry.notes[0], /opl exec/);
    assert.match(output.product_entry.notes[0], /opl resume/);
    assert.match(output.product_entry.notes[1], /opl connect sync-skills/);
    assert.match(output.product_entry.notes[2], /configured family runtime provider/);
    assert.match(output.product_entry.notes[2], /non-default executors are explicit stage\/request selections/);
    assert.deepEqual(output.product_entry.issues, ['temporal_runtime_not_configured']);
    assert.equal(output.validation.status, 'valid');
  } finally {
    fs.rmSync(codexFixtureRoot, { recursive: true, force: true });
  }
});

test('doctor keeps Codex-default local entry ready even when Hermes is unavailable', () => {
  const { fixtureRoot, codexPath } = createFakeCodexFixture(`
echo "unused"
exit 0
`);

  try {
    const output = runCli(['doctor'], {
      OPL_CODEX_BIN: codexPath,
      PATH: fixtureRoot,
      OPL_FAMILY_RUNTIME_PROVIDER: '',
      OPL_TEMPORAL_ADDRESS: '',
      TEMPORAL_ADDRESS: '',
    });

    assert.equal(output.product_entry.runtime_substrate, 'codex_default_executor_with_provider_backed_family_runtime');
    assert.equal(output.product_entry.ready, false);
    assert.equal(output.product_entry.local_entry_ready, true);
    assert.equal(output.product_entry.online_runtime_ready, false);
    assert.equal(output.product_entry.configured_provider, 'temporal');
    assert.equal(output.product_entry.family_runtime_provider_ready, false);
    assert.equal(Object.hasOwn(output.product_entry, 'messaging_gateway_ready'), false);
    assert.equal(Object.hasOwn(output.product_entry, 'hermes'), false);
    assert.match(output.product_entry.notes[2], /configured family runtime provider/);
    assert.deepEqual(output.product_entry.issues, ['temporal_runtime_not_configured']);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('workspace projects returns the current OPL family project surfaces', () => {
  const output = runCli(['workspace', 'projects']);

  assert.equal(output.version, 'g2');
  assert.equal(output.projects.length, 4);
  assert.equal(output.projects[0].project_id, 'opl');
  assert.equal(output.projects[0].scope, 'opl_framework');
  assert.equal(output.projects[0].direct_entry_surface, 'opl');
  assert.equal(output.projects[1].project_id, 'medautogrant');
  assert.equal(output.projects[2].project_id, 'medautoscience');
  assert.equal(output.projects[3].project_id, 'redcube');
});

test('status workspace reports git and worktree visibility for one workspace path', () => {
  const output = runCli(['status', 'workspace', '--path', repoRoot]);

  assert.equal(output.version, 'g2');
  assert.equal(output.workspace.absolute_path, repoRoot);
  assert.equal(output.workspace.kind, 'directory');
  assert.equal(output.workspace.entries.total > 0, true);
  assert.equal(output.workspace.git.inside_work_tree, true);
  assert.equal(output.workspace.git.root, repoRoot);
  assert.equal(typeof output.workspace.git.linked_worktree, 'boolean');
  assert.equal(typeof output.workspace.git.is_clean, 'boolean');
});

test('bare opl command keeps raw Codex product entry behavior even when the session ledger file is corrupted', () => {
  const { fixtureRoot, codexPath } = createFakeCodexFixture(`
if [ "$#" -eq 0 ]; then
  cat <<'EOF'
CODEX ENTRY
EOF
  exit 0
fi
echo "unexpected fake-codex args: $*" >&2
exit 1
`);
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-corrupt-session-ledger-'));
  const ledgerPath = path.join(stateRoot, 'session-ledger.json');
  const corruptedLedgerContent = '{"version":"g2","entries":[{"broken":';
  fs.writeFileSync(ledgerPath, corruptedLedgerContent);

  try {
    const result = runCliRaw([], {
      OPL_CODEX_BIN: codexPath,
      OPL_STATE_DIR: stateRoot,
    });

    assert.equal(result.stdout, 'CODEX ENTRY\n');
    assert.equal(result.stderr, '');
    assert.equal(fs.readFileSync(ledgerPath, 'utf8'), corruptedLedgerContent);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('natural-language fallback is a raw Codex passthrough unless the request enters explicit OPL stage selection', () => {
  const capturePath = path.join(os.tmpdir(), `opl-natural-fallback-args-${process.pid}.txt`);
  const { fixtureRoot, codexPath } = createFakeCodexFixture(`
printf '%s\\n' "$@" > ${JSON.stringify(capturePath)}
if [ "$#" -gt 0 ]; then
  cat <<'EOF'
AUTO ASK READY
EOF
  exit 0
fi
echo "unexpected fake-codex args: $*" >&2
exit 1
`);

  try {
    const result = runCliRaw(
      ['Plan', 'a', 'medical', 'grant', 'proposal', 'revision', 'loop.'],
      {
        OPL_CODEX_BIN: codexPath,
      },
    );

    assert.equal(result.stdout, 'AUTO ASK READY\n');
    assert.deepEqual(fs.readFileSync(capturePath, 'utf8').trim().split('\n'), [
      'Plan',
      'a',
      'medical',
      'grant',
      'proposal',
      'revision',
      'loop.',
    ]);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
    fs.rmSync(capturePath, { force: true });
  }
});

test('top-level @agent aliases are not registered as command surfaces', () => {
  const { status, payload } = runCliFailure(['@mas', 'tighten the manuscript argument around invasive phenotype findings']);

  assert.equal(status, 2);
  assert.equal(payload.version, 'g2');
  assert.equal(payload.error.code, 'unknown_command');
  assert.match(payload.error.message, /Unknown command: @mas/);
});

test('help no longer advertises retired ask chat shell aliases', () => {
  const output = runCli(['help']);
  const commands = output.help.commands.map((entry: { command: string }) => entry.command);
  const examples = output.help.examples as string[];
  assert.equal(commands.includes('ask'), false);
  assert.equal(commands.includes('chat'), false);
  assert.equal(commands.includes('shell'), false);
  assert.equal(commands.includes('connect skills'), true);
  assert.equal(commands.includes('connect sync-skills'), true);
  assert.equal(commands.includes('agents foundry status'), true);
  assert.equal(commands.includes('agents foundry peers'), true);
  assert.equal(commands.includes('skill list'), false);
  assert.equal(commands.includes('skill sync'), false);
  const diagnostics = output.help.diagnostic_command_groups as Array<{ group_id: string }>;
  for (const groupId of ['domain', 'engine', 'runtime', 'session', 'skill', 'status', 'system']) {
    assert.equal(diagnostics.some((entry) => entry.group_id === groupId), true, groupId);
  }
  assert.equal(examples.some((entry) => entry.includes('opl ask')), false);
  assert.equal(examples.some((entry) => entry.includes('opl chat')), false);
  assert.equal(examples.some((entry) => entry.includes('opl shell')), false);
  assert.equal(examples.some((entry) => entry.includes('opl @')), false);
  assert.equal(examples.some((entry) => entry.includes('opl connect sync-skills')), true);
  assert.equal(examples.some((entry) => entry.includes('opl agents foundry status')), true);
  assert.equal(examples.some((entry) => entry.includes('opl skill sync')), false);
});

test('session resume returns the OPL-managed Codex resume envelope in non-interactive mode', () => {
  const { fixtureRoot, codexPath } = createFakeCodexFixture(`
if [ "$1" = "resume" ] && [ "$2" = "opl-test-session" ]; then
  cat <<'EOF'
RESUMED SESSION BODY
EOF
  exit 0
fi
echo "unexpected fake-codex args: $*" >&2
exit 1
`);

  try {
    const result = runCliRaw(['session', 'resume', 'opl-test-session'], {
      OPL_CODEX_BIN: codexPath,
    });

    const output = JSON.parse(result.stdout);
    assert.equal(output.product_entry.entry_surface, 'opl_local_product_entry_shell');
    assert.equal(output.product_entry.mode, 'resume');
    assert.equal(output.product_entry.executor_backend, 'codex');
    assert.deepEqual(output.product_entry.resume.command_preview, ['codex', 'resume', 'opl-test-session']);
    assert.equal(output.product_entry.resume.session_id, 'opl-test-session');
    assert.equal(output.product_entry.resume.output, 'RESUMED SESSION BODY');
    assert.equal(result.stderr, '');
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('status runtime reports provider-backed runtime status and the OPL session ledger', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-status-state-'));

  try {
    const output = runCli(['status', 'runtime', '--limit', '2'], {
      OPL_STATE_DIR: stateRoot,
      OPL_FAMILY_RUNTIME_PROVIDER: '',
      OPL_TEMPORAL_ADDRESS: '',
      TEMPORAL_ADDRESS: '',
    });

    assert.equal(output.version, 'g2');
    assert.equal(output.runtime_status.runtime_substrate, 'provider_backed_family_runtime');
    assert.equal(output.runtime_status.configured_provider, 'temporal');
    assert.equal(output.runtime_status.family_runtime_providers.selected_provider, 'temporal');
    assert.equal(output.runtime_status.family_runtime_providers.providers.temporal.ready, false);
    assert.equal(output.runtime_status.production_provider_policy.required_provider, 'temporal');
    assert.equal(output.runtime_status.production_provider_policy.local_sqlite_is_dev_ci_offline_only, false);
    assert.equal(
      output.runtime_status.production_provider_policy.scheduler_replacement_surface,
      'opl family-runtime scheduler install|status|trigger|remove --provider temporal',
    );
    assert.equal(output.runtime_status.managed_session_ledger.summary.entry_count, 0);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('runtime manager invokes native helpers and persists the state index projection', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-manager-state-'));
  const helperBinDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-native-helper-bin-'));

  for (const binary of ['opl-doctor-native', 'opl-runtime-watch', 'opl-artifact-indexer', 'opl-state-indexer']) {
    const helperPath = path.join(helperBinDir, binary);
    fs.writeFileSync(
      helperPath,
      `#!/bin/sh
cat >/dev/null
case "$(basename "$0")" in
  opl-doctor-native)
    printf '%s\\n' '{"protocol_version":"opl_native_helper.v1","helper_id":"opl-doctor-native","ok":true,"request_id":"runtime-manager-doctor","result":{"surface_kind":"native_doctor_snapshot","checks":[{"check_id":"json_stdio_protocol","status":"ok"}]},"errors":[]}'
    ;;
  opl-runtime-watch)
    printf '%s\\n' '{"protocol_version":"opl_native_helper.v1","helper_id":"opl-runtime-watch","ok":true,"request_id":"runtime-manager-runtime-watch","result":{"surface_kind":"runtime_health_snapshot_index","roots":[]},"errors":[]}'
    ;;
  opl-artifact-indexer)
    printf '%s\\n' '{"protocol_version":"opl_native_helper.v1","helper_id":"opl-artifact-indexer","ok":true,"request_id":"runtime-manager-artifact-index","result":{"surface_kind":"native_artifact_manifest","summary":{"total_files_count":1},"files":[]},"errors":[]}'
    ;;
  opl-state-indexer)
    printf '%s\\n' '{"protocol_version":"opl_native_helper.v1","helper_id":"opl-state-indexer","ok":true,"request_id":"runtime-manager-state-index","result":{"surface_kind":"native_state_index","roots":[],"json_validation":{"checked_files_count":0,"invalid_files_count":0,"files":[]}},"errors":[]}'
    ;;
esac
`,
      { mode: 0o755 },
    );
  }

  try {
    const output = runCli(['runtime', 'manager'], {
      OPL_STATE_DIR: stateRoot,
      OPL_NATIVE_HELPER_BIN_DIR: helperBinDir,
    });

    assert.equal(output.runtime_manager.native_helper_target.runtime.status, 'available');
    assert.deepEqual(
      output.runtime_manager.native_helper_target.runtime.invocations.map(
        (invocation: { helper_id: string; status: string }) => [invocation.helper_id, invocation.status],
      ),
      [
        ['opl-doctor-native', 'ok'],
        ['opl-state-indexer', 'ok'],
        ['opl-artifact-indexer', 'ok'],
        ['opl-runtime-watch', 'ok'],
      ],
    );
    assert.equal(output.runtime_manager.state_index_target.persistence.status, 'written');
    assert.equal(
      output.runtime_manager.state_index_target.persistence.index_file,
      path.join(stateRoot, 'runtime-manager', 'native-state-index.json'),
    );

    const persisted = JSON.parse(
      fs.readFileSync(output.runtime_manager.state_index_target.persistence.index_file, 'utf8'),
    );
    assert.equal(persisted.surface_kind, 'opl_runtime_manager_native_state_projection');
    assert.equal(persisted.native_indexes.state_index.result.surface_kind, 'native_state_index');
    assert.equal(persisted.native_indexes.artifact_manifest.result.surface_kind, 'native_artifact_manifest');
    assert.equal(persisted.native_indexes.runtime_health.result.surface_kind, 'runtime_health_snapshot_index');
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(helperBinDir, { recursive: true, force: true });
  }
});

test('runtime manager discovers cached native helpers and records index lifecycle metadata', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-manager-cache-state-'));
  const helperCacheDir = path.join(
    stateRoot,
    'native-helper',
    'bin',
    `${process.platform}-${process.arch}`,
    '0.1.0',
  );
  fs.mkdirSync(helperCacheDir, { recursive: true });

  for (const binary of ['opl-doctor-native', 'opl-runtime-watch', 'opl-artifact-indexer', 'opl-state-indexer']) {
    fs.writeFileSync(
      path.join(helperCacheDir, binary),
      `#!/bin/sh
cat >/dev/null
case "$(basename "$0")" in
  opl-doctor-native)
    printf '%s\\n' '{"protocol_version":"opl_native_helper.v1","helper_id":"opl-doctor-native","helper_version":"0.1.0","crate_name":"opl-native-helper","crate_version":"0.1.0","ok":true,"request_id":"runtime-manager-doctor","result":{"surface_kind":"native_doctor_snapshot"},"errors":[]}'
    ;;
  opl-runtime-watch)
    printf '%s\\n' '{"protocol_version":"opl_native_helper.v1","helper_id":"opl-runtime-watch","helper_version":"0.1.0","crate_name":"opl-native-helper","crate_version":"0.1.0","ok":true,"request_id":"runtime-manager-runtime-watch","result":{"surface_kind":"runtime_health_snapshot_index","roots":[]},"errors":[]}'
    ;;
  opl-artifact-indexer)
    printf '%s\\n' '{"protocol_version":"opl_native_helper.v1","helper_id":"opl-artifact-indexer","helper_version":"0.1.0","crate_name":"opl-native-helper","crate_version":"0.1.0","ok":true,"request_id":"runtime-manager-artifact-index","result":{"surface_kind":"native_artifact_manifest","summary":{"total_files_count":1},"files":[]},"errors":[]}'
    ;;
  opl-state-indexer)
    printf '%s\\n' '{"protocol_version":"opl_native_helper.v1","helper_id":"opl-state-indexer","helper_version":"0.1.0","crate_name":"opl-native-helper","crate_version":"0.1.0","ok":true,"request_id":"runtime-manager-state-index","result":{"surface_kind":"native_state_index","roots":[],"json_validation":{"checked_files_count":0,"invalid_files_count":0,"files":[]}},"errors":[]}'
    ;;
esac
`,
      { mode: 0o755 },
    );
  }

  try {
    const output = runCli(['runtime', 'manager'], {
      OPL_STATE_DIR: stateRoot,
    });
    const helperSources = output.runtime_manager.native_helper_target.runtime.discovery.helpers
      .filter((helper: { helper_id: string }) => helper.helper_id !== 'opl-sysprobe')
      .map((helper: { helper_id: string; source: string }) => [helper.helper_id, helper.source]);
    assert.deepEqual(helperSources, [
      ['opl-doctor-native', 'state_cache'],
      ['opl-runtime-watch', 'state_cache'],
      ['opl-artifact-indexer', 'state_cache'],
      ['opl-state-indexer', 'state_cache'],
    ]);
    assert.deepEqual(
      output.runtime_manager.native_helper_target.runtime.invocations.map(
        (invocation: { helper_version: string; crate_name: string; crate_version: string }) => [
          invocation.helper_version,
          invocation.crate_name,
          invocation.crate_version,
        ],
      ),
      [
        ['0.1.0', 'opl-native-helper', '0.1.0'],
        ['0.1.0', 'opl-native-helper', '0.1.0'],
        ['0.1.0', 'opl-native-helper', '0.1.0'],
        ['0.1.0', 'opl-native-helper', '0.1.0'],
      ],
    );

    const persistence = output.runtime_manager.state_index_target.persistence;
    assert.equal(persistence.status, 'written');
    assert.equal(persistence.ttl_ms, 86_400_000);
    assert.equal(persistence.freshness.status, 'fresh');
    assert.equal(persistence.freshness.failure_count, 0);
    assert.match(persistence.history_file, /native-state-index-history\.jsonl$/);
    assert.match(persistence.failure_file, /native-state-index-failures\.jsonl$/);
    assert.match(persistence.last_success_file, /native-state-index-last-success\.json$/);
    assert.equal(persistence.diff.changed, true);
    assert.equal(persistence.gc.retained_history_count, 1);

    const persisted = JSON.parse(fs.readFileSync(persistence.index_file, 'utf8'));
    assert.equal(persisted.lifecycle.expired, false);
    assert.equal(persisted.lifecycle.ttl_ms, 86_400_000);
    assert.equal(persisted.diff.changed, true);
    assert.equal(fs.existsSync(persistence.history_file), true);
    assert.equal(fs.existsSync(persistence.last_success_file), true);
    assert.equal(fs.readFileSync(persistence.history_file, 'utf8').trim().split('\n').length, 1);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('runtime manager records native index failure lifecycle when helpers are unavailable', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-manager-failure-state-'));

  try {
    const output = runCli(['runtime', 'manager'], {
      OPL_STATE_DIR: stateRoot,
      OPL_NATIVE_HELPER_BIN_DIR: path.join(stateRoot, 'missing-native-bin'),
    });
    const persistence = output.runtime_manager.state_index_target.persistence;
    assert.equal(persistence.status, 'skipped_helper_unavailable');
    assert.match(persistence.failure_file, /native-state-index-failures\.jsonl$/);
    assert.equal(fs.existsSync(persistence.failure_file), true);
    const failure = JSON.parse(fs.readFileSync(persistence.failure_file, 'utf8').trim());
    assert.equal(failure.status, 'skipped_helper_unavailable');
    assert.equal(failure.errors[0].code, 'native_index_helper_unavailable');
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('runtime manager reports the native helper package and repair lifecycle', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-manager-state-'));

  try {
    const output = runCli(['runtime', 'manager'], {
      OPL_STATE_DIR: stateRoot,
    });

    assert.equal(output.runtime_manager.native_helper_target.lifecycle.status, 'ready_to_build');
    assert.deepEqual(output.runtime_manager.native_helper_target.lifecycle.commands, {
      build: 'npm run native:build',
      cache: 'npm run native:cache',
      doctor: 'npm run native:doctor',
      prebuild: 'npm run native:prebuild',
      prebuild_pack: 'npm run native:prebuild-pack',
      prebuild_check: 'npm run native:prebuild-check',
      repair: 'npm run native:repair',
      test: 'npm run native:test',
    });
    assert.equal(
      output.runtime_manager.native_helper_target.lifecycle.prebuild.install_command,
      'npm run native:prebuild',
    );
    assert.deepEqual(
      output.runtime_manager.native_helper_target.lifecycle.prebuild.restore_order,
      [
        'OPL_NATIVE_HELPER_PREBUILD_ROOT',
        'package native-helper-prebuilds',
        'GHCR one-person-lab-native-helper OCI archive',
        'local Cargo build fallback',
      ],
    );
    assert.match(
      output.runtime_manager.native_helper_target.lifecycle.cache.cache_dir,
      /native-helper\/bin\/.+\/0\.1\.0$/,
    );
    assert.equal(output.runtime_manager.native_helper_target.lifecycle.cache.target_triple, `${process.platform}-${process.arch}`);
    assert.equal(output.runtime_manager.native_helper_target.lifecycle.package.status, 'included');
    assert.equal(
      output.runtime_manager.native_helper_target.lifecycle.package.required_files.includes('native/opl-native-helper/src/lib.rs'),
      true,
    );

    const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
    assert.equal(packageJson.scripts['native:cache'], 'node ./scripts/native-helper-cache.mjs');
    assert.equal(packageJson.scripts['native:doctor'], 'node ./scripts/native-helper-doctor.mjs');
    assert.equal(packageJson.scripts['native:prebuild'], 'node ./scripts/native-helper-prebuild.mjs install');
    assert.equal(packageJson.scripts['native:repair'], 'node ./scripts/native-helper-repair.mjs');
    assert.equal(packageJson.files.includes('native-helper-prebuilds'), true);
    assert.equal(packageJson.files.includes('native/opl-native-helper/src'), true);
    assert.equal(packageJson.files.includes('scripts/native-helper-doctor.mjs'), true);
    assert.equal(packageJson.files.includes('scripts/native-helper-prebuild.mjs'), true);
    assert.equal(packageJson.files.includes('scripts/native-helper-repair.mjs'), true);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('native helper doctor script emits lifecycle JSON without mutating domain truth', () => {
  const helperBinDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-native-helper-bin-'));
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-manager-state-'));

  for (const binary of ['opl-doctor-native', 'opl-runtime-watch', 'opl-artifact-indexer', 'opl-state-indexer']) {
    const helperPath = path.join(helperBinDir, binary);
    fs.writeFileSync(
      helperPath,
      `#!/bin/sh
cat >/dev/null
case "$(basename "$0")" in
  opl-doctor-native)
    printf '%s\\n' '{"protocol_version":"opl_native_helper.v1","helper_id":"opl-doctor-native","ok":true,"request_id":"runtime-manager-doctor","result":{"surface_kind":"native_doctor_snapshot"},"errors":[]}'
    ;;
  opl-runtime-watch)
    printf '%s\\n' '{"protocol_version":"opl_native_helper.v1","helper_id":"opl-runtime-watch","ok":true,"request_id":"runtime-manager-runtime-watch","result":{"surface_kind":"runtime_health_snapshot_index","roots":[]},"errors":[]}'
    ;;
  opl-artifact-indexer)
    printf '%s\\n' '{"protocol_version":"opl_native_helper.v1","helper_id":"opl-artifact-indexer","ok":true,"request_id":"runtime-manager-artifact-index","result":{"surface_kind":"native_artifact_manifest","summary":{"total_files_count":0},"files":[]},"errors":[]}'
    ;;
  opl-state-indexer)
    printf '%s\\n' '{"protocol_version":"opl_native_helper.v1","helper_id":"opl-state-indexer","ok":true,"request_id":"runtime-manager-state-index","result":{"surface_kind":"native_state_index","roots":[],"json_validation":{"checked_files_count":0,"invalid_files_count":0,"files":[]}},"errors":[]}'
    ;;
esac
`,
      { mode: 0o755 },
    );
  }

  try {
    const result = spawnSync(process.execPath, [path.join(repoRoot, 'scripts/native-helper-doctor.mjs')], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        OPL_NATIVE_HELPER_BIN_DIR: helperBinDir,
        OPL_STATE_DIR: stateRoot,
      },
    });
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.surface_kind, 'opl_native_helper_lifecycle_doctor');
    assert.equal(output.lifecycle.commands.repair, 'npm run native:repair');
    assert.equal(output.runtime.status, 'available');
    assert.equal(fs.existsSync(path.join(stateRoot, 'runtime-manager', 'native-state-index.json')), false);
  } finally {
    fs.rmSync(helperBinDir, { recursive: true, force: true });
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});
