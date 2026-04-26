import { GatewayContractError, PassThrough, assert, buildManifestCommand, buildProjectProgressBrief, cliPath, contractsDir, createCodexConfigFixture, createContractsFixtureRoot, createFakeCodexFixture, createFakeHermesFixture, createFakeLaunchctlFixture, createFakeOpenFixture, createFakePsFixture, createFakeShellCommandFixture, createFamilyContractsFixtureRoot, createFamilyLocatorResolverFixture, createGitModuleRemoteFixture, createMasWorkspaceFixture, explainDomainBoundary, familyManifestFixtureDir, fs, loadFamilyManifestFixtures, loadGatewayContracts, once, os, path, readJsonFixture, readJsonLine, repoRoot, resolveRequestSurface, runCli, runCliAsync, runCliFailure, runCliFailureInCwd, runCliInCwd, runCliRaw, runCliViaEntryPathInCwd, shellSingleQuote, spawn, startCliServer, startFakeOplApiServer, stopCliPipeChild, stopCliServer, stopHttpServer, test, validateGatewayContracts, writeJsonLine, assertContractsContext, assertNoContractsProvenance, assertMagActionGraph, assertMasActionGraph, assertRedcubeActionGraph } from '../helpers.ts';

test('loadGatewayContracts returns the frozen gateway registries', () => {
  const contracts = loadGatewayContracts(repoRoot);

  assert.equal(contracts.contractsRootSource, 'api');
  assert.equal(contracts.workstreams.version, 'g1');
  assert.equal(contracts.domains.version, 'g1');
  assert.equal(contracts.routingVocabulary.version, 'g1');
  assert.equal(contracts.taskTopology.scope, 'opl_task_topology');
  assert.equal(
    contracts.publicSurfaceIndex.scope,
    'opl_public_gateway_surface_index',
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

test('loadGatewayContracts rejects missing files with a stable error', async (t) => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-gateway-missing-'));
  const expectedContractsDir = path.join(tempRoot, 'contracts', 'opl-gateway');

  await t.test('missing contracts directory', () => {
    assert.throws(
      () => loadGatewayContracts(tempRoot),
      (error: unknown) => {
        assert.ok(error instanceof GatewayContractError);
        assert.equal(error.code, 'contract_file_missing');
        assert.equal(error.details?.contracts_dir, expectedContractsDir);
        assert.equal(error.details?.contracts_root_source, 'api');
        return true;
      },
    );
  });
});

test('loadGatewayContracts honors OPL_CONTRACTS_DIR when provided', () => {
  const tempContracts = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-gateway-contracts-'));
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

test('validateGatewayContracts returns a stable summary for the required contract set', () => {
  const validation = validateGatewayContracts(repoRoot);
  const contracts = loadGatewayContracts(repoRoot);

  assert.deepEqual(validation, {
    status: 'valid',
    contracts_dir: contractsDir,
    contracts_root_source: 'api',
    validated_contracts: [
      {
        contract_id: 'workstreams',
        file: path.join(contractsDir, 'workstreams.json'),
        schema_version: 'g1',
        status: 'valid',
      },
      {
        contract_id: 'domains',
        file: path.join(contractsDir, 'domains.json'),
        schema_version: 'g1',
        status: 'valid',
      },
      {
        contract_id: 'routing_vocabulary',
        file: path.join(contractsDir, 'routing-vocabulary.json'),
        schema_version: 'g1',
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
    ],
  });
});

test('contract validate returns a stable machine-readable contract summary', () => {
  const output = runCli(['contract', 'validate']);
  const contracts = loadGatewayContracts(repoRoot);

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
          schema_version: 'g1',
          status: 'valid',
        },
        {
          contract_id: 'domains',
          file: path.join(contractsDir, 'domains.json'),
          schema_version: 'g1',
          status: 'valid',
        },
        {
          contract_id: 'routing_vocabulary',
          file: path.join(contractsDir, 'routing-vocabulary.json'),
          schema_version: 'g1',
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
      ],
    },
  });
});

test('doctor reports a Codex-default ready local entry and Hermes gateway availability when Hermes is available', () => {
  const { fixtureRoot: codexFixtureRoot, codexPath } = createFakeCodexFixture(`
echo "unused"
exit 0
`);
  const { fixtureRoot: hermesFixtureRoot, hermesPath } = createFakeHermesFixture(`
if [ "$1" = "version" ]; then
  echo "Hermes Agent v9.9.9-test"
  exit 0
fi
if [ "$1" = "gateway" ] && [ "$2" = "status" ]; then
  cat <<'EOF'
Launchd plist: /tmp/ai.hermes.gateway.plist
✓ Service definition matches the current Hermes install
✓ Gateway service is loaded
EOF
  exit 0
fi
echo "unexpected fake-hermes args: $*" >&2
exit 1
`);

  try {
    const output = runCli(['doctor'], {
      OPL_CODEX_BIN: codexPath,
      OPL_HERMES_BIN: hermesPath,
    });

    assert.equal(output.version, 'g2');
    assert.equal(output.product_entry.entry_surface, 'opl_local_product_entry_shell');
    assert.equal(output.product_entry.runtime_substrate, 'codex_default_runtime');
    assert.equal(output.product_entry.ready, true);
    assert.equal(output.product_entry.local_entry_ready, true);
    assert.equal(output.product_entry.messaging_gateway_ready, true);
    assert.equal(output.product_entry.hermes.binary.path, hermesPath);
    assert.equal(output.product_entry.hermes.version, 'Hermes Agent v9.9.9-test');
    assert.equal(output.product_entry.hermes.gateway_service.loaded, true);
    assert.match(output.product_entry.notes[0], /opl exec/);
    assert.match(output.product_entry.notes[0], /opl resume/);
    assert.match(output.product_entry.notes[1], /opl skill sync/);
    assert.match(output.product_entry.notes[2], /--executor hermes/);
    assert.deepEqual(output.product_entry.issues, []);
    assert.equal(output.validation.status, 'valid');
  } finally {
    fs.rmSync(codexFixtureRoot, { recursive: true, force: true });
    fs.rmSync(hermesFixtureRoot, { recursive: true, force: true });
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
    });

    assert.equal(output.product_entry.runtime_substrate, 'codex_default_runtime');
    assert.equal(output.product_entry.ready, true);
    assert.equal(output.product_entry.local_entry_ready, true);
    assert.equal(output.product_entry.messaging_gateway_ready, false);
    assert.equal(output.product_entry.hermes.binary, null);
    assert.match(output.product_entry.notes[2], /--executor hermes/);
    assert.equal(
      output.product_entry.issues.includes(
        'Hermes binary not found. Set OPL_HERMES_BIN or install `hermes` into PATH.',
      ),
      true,
    );
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('workspace projects returns the current OPL family project surfaces', () => {
  const output = runCli(['workspace', 'projects']);

  assert.equal(output.version, 'g2');
  assert.equal(output.projects.length, 4);
  assert.equal(output.projects[0].project_id, 'opl');
  assert.equal(output.projects[0].scope, 'family_gateway');
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

test('bare opl command keeps raw Codex frontdoor behavior even when the session ledger file is corrupted', () => {
  const { fixtureRoot, codexPath } = createFakeCodexFixture(`
if [ "$#" -eq 0 ]; then
  cat <<'EOF'
CODEX FRONTDOOR
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

    assert.equal(result.stdout, 'CODEX FRONTDOOR\n');
    assert.equal(result.stderr, '');
    assert.equal(fs.readFileSync(ledgerPath, 'utf8'), corruptedLedgerContent);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('natural-language fallback is a raw Codex passthrough unless the request enters explicit OPL routing', () => {
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

test('top-level @agent aliases are retired in favor of skill sync plus plain Codex entry', () => {
  const { status, payload } = runCliFailure(['@mas', 'tighten the manuscript argument around invasive phenotype findings']);

  assert.equal(status, 2);
  assert.equal(payload.version, 'g2');
  assert.equal(payload.error.code, 'cli_usage_error');
  assert.match(payload.error.message, /Command "opl @mas" has been retired/);
  assert.match(payload.error.message, /opl skill sync/);
});

test('help no longer advertises retired ask chat shell aliases', () => {
  const output = runCli(['help']);
  const commands = output.help.commands.map((entry: { command: string }) => entry.command);
  const examples = output.help.examples as string[];
  assert.equal(commands.includes('ask'), false);
  assert.equal(commands.includes('chat'), false);
  assert.equal(commands.includes('shell'), false);
  assert.equal(commands.includes('skill list'), true);
  assert.equal(commands.includes('skill sync'), true);
  assert.equal(examples.some((entry) => entry.includes('opl ask')), false);
  assert.equal(examples.some((entry) => entry.includes('opl chat')), false);
  assert.equal(examples.some((entry) => entry.includes('opl shell')), false);
  assert.equal(examples.some((entry) => entry.includes('opl @')), false);
  assert.equal(examples.some((entry) => entry.includes('opl skill sync')), true);
});

test('session resume returns raw Codex session output in non-interactive mode by default', () => {
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

    assert.equal(result.stdout, 'RESUMED SESSION BODY\n');
    assert.equal(result.stderr, '');
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('sessions parses the Hermes recent-session table into a product-entry surface', () => {
  const { fixtureRoot, hermesPath } = createFakeHermesFixture(`
if [ "$1" = "sessions" ] && [ "$2" = "list" ]; then
  cat <<'EOF'
Preview                                            Last Active   Src    ID
───────────────────────────────────────────────────────────────────────────────────────────────
Execute the following RedCube service entry enve   10m ago       api_server run_7e2a41
Medical grant revision session                     2m ago        cli    sess_abcd
EOF
  exit 0
fi
echo "unexpected fake-hermes args: $*" >&2
exit 1
`);

  try {
    const output = runCli(['session', 'list', '--limit', '2'], {
      OPL_HERMES_BIN: hermesPath,
    });

    assert.equal(output.product_entry.mode, 'sessions');
    assert.equal(output.product_entry.sessions.length, 2);
    assert.equal(output.product_entry.sessions[0].session_id, 'run_7e2a41');
    assert.equal(output.product_entry.sessions[0].source, 'api_server');
    assert.equal(output.product_entry.sessions[1].session_id, 'sess_abcd');
    assert.equal(output.product_entry.sessions[1].preview, 'Medical grant revision session');
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('status runtime reports Hermes runtime health, sessions, and process usage', () => {
  const { fixtureRoot, hermesPath } = createFakeHermesFixture(`
if [ "$1" = "version" ]; then
  echo "Hermes Agent v9.9.9-test"
  exit 0
fi
if [ "$1" = "gateway" ] && [ "$2" = "status" ]; then
  cat <<'EOF'
Launchd plist: /tmp/ai.hermes.gateway.plist
✓ Service definition matches the current Hermes install
✓ Gateway service is loaded
EOF
  exit 0
fi
if [ "$1" = "status" ]; then
  cat <<'EOF'
◆ Environment
  Project:      /tmp/hermes-agent
  Model:        gpt-5.4
◆ Terminal Backend
  Backend:      local
◆ Messaging Platforms
  Telegram      ✓ configured
  Slack         ✗ not configured
◆ Gateway Service
  Status:       ✓ loaded
  Manager:      launchd
◆ Scheduled Jobs
  Jobs:         2
◆ Sessions
  Active:       3
EOF
  exit 0
fi
if [ "$1" = "sessions" ] && [ "$2" = "list" ]; then
  cat <<'EOF'
Preview                                            Last Active   Src    ID
───────────────────────────────────────────────────────────────────────────────────────────────
OPL dashboard session                              1m ago        cli    sess_dash
RedCube active session                             2m ago        api_server sess_redcube
EOF
  exit 0
fi
echo "unexpected fake-hermes args: $*" >&2
exit 1
`);
  const psFixture = createFakePsFixture(`27025 1 0.1 0.2 49616 22:46 /Users/test/.hermes/venv/bin/python -m hermes_cli.main gateway run --replace
27026 27025 5.2 1.1 125000 00:31 /Users/test/.hermes/venv/bin/python -m hermes_cli.main chat --resume sess_dash`);

  try {
    const output = runCli(['status', 'runtime', '--limit', '2'], {
      OPL_HERMES_BIN: hermesPath,
      PATH: `${psFixture.fixtureRoot}:${process.env.PATH ?? ''}`,
    });

    assert.equal(output.version, 'g2');
    assert.equal(output.runtime_status.runtime_substrate, 'external_hermes_kernel');
    assert.equal(output.runtime_status.hermes.binary.path, hermesPath);
    assert.equal(output.runtime_status.status_report.parsed.summary.active_sessions, 3);
    assert.equal(output.runtime_status.status_report.parsed.summary.scheduled_jobs, 2);
    assert.deepEqual(output.runtime_status.status_report.parsed.summary.configured_messaging_platforms, ['Telegram']);
    assert.equal(output.runtime_status.recent_sessions.sessions.length, 2);
    assert.equal(output.runtime_status.process_usage.summary.process_count, 2);
    assert.equal(output.runtime_status.process_usage.processes[0].role, 'gateway');
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
    fs.rmSync(psFixture.fixtureRoot, { recursive: true, force: true });
  }
});

test('runtime manager reports OPL-managed adapter boundary over external Hermes', () => {
  const { fixtureRoot, hermesPath } = createFakeHermesFixture(`
if [ "$1" = "version" ]; then
  echo "Hermes Agent v9.9.9-test"
  exit 0
fi
if [ "$1" = "gateway" ] && [ "$2" = "status" ]; then
  cat <<'EOF'
Launchd plist: /tmp/ai.hermes.gateway.plist
✓ Service definition matches the current Hermes install
✓ Gateway service is loaded
EOF
  exit 0
fi
echo "unexpected fake-hermes args: $*" >&2
exit 1
`);
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-manager-state-'));

  try {
    const output = runCli(['runtime', 'manager'], {
      OPL_HERMES_BIN: hermesPath,
      OPL_STATE_DIR: stateRoot,
    });

    assert.equal(output.version, 'g2');
    assert.equal(output.runtime_manager.surface_id, 'opl_runtime_manager');
    assert.equal(output.runtime_manager.layer_role, 'product_managed_adapter_over_external_kernel');
    assert.equal(output.runtime_manager.status, 'ready');
    assert.equal(output.runtime_manager.owner_split.runtime_kernel_owner, 'upstream_hermes_agent');
    assert.equal(output.runtime_manager.owner_split.product_manager_owner, 'one-person-lab');
    assert.equal(output.runtime_manager.non_goals.includes('not_a_scheduler_kernel'), true);
    assert.equal(output.runtime_manager.registration_registry.surface_kind, 'opl_runtime_manager_registration_registry');
    assert.equal(output.runtime_manager.registration_registry.domains.length, 3);
    assert.equal(
      output.runtime_manager.registration_registry.domains[0].expected_registration_surface.ref,
      '/skill_catalog/skills/0/domain_projection/opl_runtime_manager_registration',
    );
    assert.deepEqual(
      output.runtime_manager.registration_registry.domains[2].consumable_projection_refs.slice(-2),
      ['/review_state', '/publication_projection'],
    );
    assert.equal(
      output.runtime_manager.registration_registry.required_domain_registration_fields.includes('state_index_inputs'),
      true,
    );
    assert.equal(output.runtime_manager.native_helper_target.status, 'contracted_optional_rust_helpers');
    assert.equal(output.runtime_manager.native_helper_target.language, 'rust');
    assert.equal(output.runtime_manager.native_helper_target.protocol.transport, 'cli_stdio');
    assert.deepEqual(
      output.runtime_manager.native_helper_target.helpers.map((helper: { helper_id: string }) => helper.helper_id),
      ['opl-sysprobe', 'opl-doctor-native', 'opl-runtime-watch', 'opl-artifact-indexer', 'opl-state-indexer'],
    );
    assert.equal(output.runtime_manager.state_index_target.status, 'rust_helper_backed_contract_first');
    assert.equal(
      output.runtime_manager.state_index_target.index_catalog.artifact_projection_index.backing_helper_id,
      'opl-artifact-indexer',
    );
    const nativeHelperContract = JSON.parse(
      fs.readFileSync(path.join(repoRoot, 'contracts/opl-gateway/native-helper-contract.json'), 'utf8'),
    );
    assert.deepEqual(
      nativeHelperContract.helpers.map((helper: { helper_id: string }) => helper.helper_id),
      output.runtime_manager.native_helper_target.helpers.map((helper: { helper_id: string }) => helper.helper_id),
    );
    assert.equal(output.runtime_manager.future_sidecar_migration.enabled_now, false);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('runtime manager invokes native helpers and persists the state index projection', () => {
  const { fixtureRoot, hermesPath } = createFakeHermesFixture(`
if [ "$1" = "version" ]; then
  echo "Hermes Agent v9.9.9-test"
  exit 0
fi
if [ "$1" = "gateway" ] && [ "$2" = "status" ]; then
  cat <<'EOF'
Launchd plist: /tmp/ai.hermes.gateway.plist
✓ Service definition matches the current Hermes install
✓ Gateway service is loaded
EOF
  exit 0
fi
echo "unexpected fake-hermes args: $*" >&2
exit 1
`);
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
      OPL_HERMES_BIN: hermesPath,
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
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(helperBinDir, { recursive: true, force: true });
  }
});
