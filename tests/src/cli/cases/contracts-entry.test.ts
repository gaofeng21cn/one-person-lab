import {
  FrameworkContractError,
  PassThrough,
  assert,
  contractsDir,
  createContractsFixtureRoot,
  createFakeCodexFixture,
  fs,
  loadFrameworkContracts,
  os,
  parseJsonText,
  path,
  readJsonLine,
  repoRoot,
  runCli,
  runCliFailure,
  runCliRaw,
  spawn,
  stopCliPipeChild,
  test,
  validateFrameworkContracts,
} from '../helpers.ts';
import './contracts-entry-cases/native-helper-doctor.test.ts';
import './contracts-entry-cases/native-helper-lifecycle.test.ts';

test('framework contracts load and validate the active registry set', () => {
  const contracts = loadFrameworkContracts(repoRoot);
  const validation = validateFrameworkContracts(repoRoot);
  const validated = new Set(validation.validated_contracts.map((entry: any) => entry.contract_id));

  assert.equal(contracts.contractsRootSource, 'api');
  assert.equal(contracts.workstreams.version, 'g2');
  assert.equal(contracts.domains.version, 'g2');
  assert.equal(contracts.stageSelectionVocabulary.version, 'g2');
  assert.equal(contracts.cliCommandRegistry.contract_kind, 'opl_cli_command_registry.v1');
  assert.equal(validation.status, 'valid');
  assert.equal(validation.contracts_dir, contractsDir);
  for (const contractId of [
    'workstreams',
    'domains',
    'stage_selection_vocabulary',
    'brand_module_registry',
    'cli_command_registry',
    'target_operating_architecture',
    'pack_bundle',
  ]) {
    assert.equal(validated.has(contractId), true, contractId);
  }
});

test('readJsonLine drains buffered siblings and cleans transient listeners', async () => {
  const stream = new PassThrough();
  stream.write('{"id":1}\n{"id":2}\n');

  assert.equal((await readJsonLine(stream)).id, 1);
  assert.equal(stream.listenerCount('error'), 0);
  assert.equal((await readJsonLine(stream)).id, 2);
  assert.equal(stream.listenerCount('error'), 0);
});

test('stopCliPipeChild terminates spawned stdio children', async () => {
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
    cwd: repoRoot,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  await stopCliPipeChild(child);
  assert.notEqual(child.exitCode === null && child.signalCode === null, true);
});

test('contract roots can be overridden and invalid machine contracts fail closed', () => {
  const override = createContractsFixtureRoot((fixtureContractsRoot) => {
    const workstreamsPath = path.join(fixtureContractsRoot, 'workstreams.json');
    const workstreams = parseJsonText(fs.readFileSync(workstreamsPath, 'utf8')) as any;
    workstreams.workstreams.find((entry: { workstream_id: string }) => entry.workstream_id === 'research_ops').label =
      'Research Ops From Flag';
    fs.writeFileSync(workstreamsPath, `${JSON.stringify(workstreams, null, 2)}\n`);
  });
  const invalid = createContractsFixtureRoot((fixtureContractsRoot) => {
    const contractPath = path.join(fixtureContractsRoot, 'target-operating-architecture-contract.json');
    const contract = parseJsonText(fs.readFileSync(contractPath, 'utf8')) as any;
    delete contract.multi_plane_operating_system;
    fs.writeFileSync(contractPath, `${JSON.stringify(contract, null, 2)}\n`);
  });

  try {
    const output = runCli([
      '--contracts-dir',
      override.fixtureContractsRoot,
      'contract',
      'workstream',
      'research_ops',
    ], {
      OPL_CONTRACTS_DIR: invalid.fixtureContractsRoot,
    });
    assert.equal(output.workstream.label, 'Research Ops From Flag');

    assert.throws(
      () => loadFrameworkContracts({ contractsDir: invalid.fixtureContractsRoot, source: 'api' }),
      (error: unknown) => {
        assert.ok(error instanceof FrameworkContractError);
        assert.equal(error.code, 'contract_shape_invalid');
        assert.equal(error.details?.field, 'multi_plane_operating_system');
        return true;
      },
    );

    const failure = runCliFailure(['--contracts-dir', invalid.fixtureContractsRoot, 'contract', 'validate']);
    assert.equal(failure.status, 3);
    assert.equal(failure.payload.error.code, 'contract_shape_invalid');
  } finally {
    fs.rmSync(override.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(invalid.fixtureRoot, { recursive: true, force: true });
  }
});

test('product entry keeps raw Codex behavior while retired aliases stay closed', () => {
  const { fixtureRoot, codexPath } = createFakeCodexFixture(`
if [ "\${1:-}" = "resume" ] && [ "\${2:-}" = "opl-test-session" ]; then
  printf '%s\\n' "RESUMED SESSION BODY"
  exit 0
fi
if [ "$#" -eq 0 ]; then
  printf '%s\\n' "CODEX ENTRY"
  exit 0
fi
printf 'unexpected fake-codex args: %s\\n' "$*" >&2
exit 1
`);
  const capturePath = path.join(os.tmpdir(), `opl-natural-fallback-args-${process.pid}.txt`);

  try {
    const doctor = runCli(['doctor'], {
      OPL_CODEX_BIN: codexPath,
      PATH: fixtureRoot,
      OPL_FAMILY_RUNTIME_PROVIDER: '',
      OPL_TEMPORAL_ADDRESS: '',
      TEMPORAL_ADDRESS: '',
    });
    assert.equal(doctor.product_entry.local_entry_ready, true);
    assert.equal(doctor.product_entry.online_runtime_ready, false);
    assert.equal(Object.hasOwn(doctor.product_entry, 'hermes'), false);
    assert.deepEqual(doctor.product_entry.issues, ['temporal_runtime_not_configured']);

    const bare = runCliRaw([], { OPL_CODEX_BIN: codexPath });
    assert.equal(bare.stdout, 'CODEX ENTRY\n');
    assert.equal(bare.stderr, '');

    const resume = parseJsonText(runCliRaw(['session', 'resume', 'opl-test-session'], {
      OPL_CODEX_BIN: codexPath,
    }).stdout) as any;
    assert.equal(resume.product_entry.mode, 'resume');
    assert.equal(resume.product_entry.resume.output, 'RESUMED SESSION BODY');

    const aliasFailure = runCliFailure(['@mas', 'tighten manuscript']);
    assert.equal(aliasFailure.status, 2);
    assert.equal(aliasFailure.payload.error.code, 'unknown_command');

    fs.writeFileSync(capturePath, '');
    const fallback = createFakeCodexFixture(`
printf '%s\\n' "$@" > ${JSON.stringify(capturePath)}
printf '%s\\n' "AUTO ASK READY"
`);
    try {
      assert.equal(runCliRaw(['Plan', 'a', 'grant'], { OPL_CODEX_BIN: fallback.codexPath }).stdout, 'AUTO ASK READY\n');
      assert.deepEqual(fs.readFileSync(capturePath, 'utf8').trim().split('\n'), ['Plan', 'a', 'grant']);
    } finally {
      fs.rmSync(fallback.fixtureRoot, { recursive: true, force: true });
    }
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
    fs.rmSync(capturePath, { force: true });
  }
});

test('workspace, help, and runtime manager commands expose stable smoke shapes', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-contracts-entry-state-'));
  try {
    const projects = runCli(['workspace', 'projects']);
    assert.deepEqual(projects.projects.map((entry: { project_id: string }) => entry.project_id), [
      'opl',
      'medautogrant',
      'medautoscience',
      'redcube',
    ]);

    const status = runCli(['status', 'workspace', '--path', repoRoot]);
    assert.equal(status.workspace.git.root, repoRoot);
    assert.equal(typeof status.workspace.git.linked_worktree, 'boolean');

    const help = runCli(['help']);
    const commands = help.help.commands.map((entry: { command: string }) => entry.command);
    assert.equal(commands.includes('ask'), false);
    assert.equal(commands.includes('connect sync-skills'), true);
    assert.equal(commands.includes('foundry status'), true);
    assert.equal(help.help.examples.some((entry: string) => entry.includes('opl ask')), false);

    const runtime = runCli(['status', 'runtime', '--limit', '2'], {
      OPL_STATE_DIR: stateRoot,
      OPL_FAMILY_RUNTIME_PROVIDER: '',
      OPL_TEMPORAL_ADDRESS: '',
      TEMPORAL_ADDRESS: '',
    });
    assert.equal(runtime.runtime_status.runtime_substrate, 'provider_backed_family_runtime');
    assert.equal(runtime.runtime_status.family_runtime_providers.selected_provider, 'temporal');
    assert.equal(runtime.runtime_status.production_provider_policy.local_sqlite_provider_retired, true);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('loadFrameworkContracts reports missing contract roots with stable details', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-framework-missing-'));
  try {
    assert.throws(
      () => loadFrameworkContracts(tempRoot),
      (error: unknown) => {
        assert.ok(error instanceof FrameworkContractError);
        assert.equal(error.code, 'contract_file_missing');
        assert.equal(error.details?.contracts_dir, path.join(tempRoot, 'contracts', 'opl-framework'));
        assert.equal(error.details?.contracts_root_source, 'api');
        return true;
      },
    );
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});
