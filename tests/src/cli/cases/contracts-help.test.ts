import { GatewayContractError, PassThrough, assert, buildManifestCommand, buildProjectProgressBrief, cliPath, contractsDir, createCodexConfigFixture, createContractsFixtureRoot, createFakeCodexFixture, createFakeHermesFixture, createFakeLaunchctlFixture, createFakeOpenFixture, createFakePsFixture, createFakeShellCommandFixture, createFamilyContractsFixtureRoot, createFamilyLocatorResolverFixture, createGitModuleRemoteFixture, createMasWorkspaceFixture, explainDomainBoundary, familyManifestFixtureDir, fs, loadFamilyManifestFixtures, loadGatewayContracts, once, os, path, readJsonFixture, readJsonLine, repoRoot, resolveRequestSurface, runCli, runCliAsync, runCliFailure, runCliFailureInCwd, runCliInCwd, runCliRaw, runCliViaEntryPathInCwd, shellSingleQuote, spawn, startCliServer, startFakeOplApiServer, stopCliPipeChild, stopCliServer, stopHttpServer, test, validateGatewayContracts, writeJsonLine, assertContractsContext, assertNoContractsProvenance, assertMagActionGraph, assertMasActionGraph, assertRedcubeActionGraph } from '../helpers.ts';

test('logs returns a structured wrapper over Hermes log output', () => {
  const { fixtureRoot, hermesPath } = createFakeHermesFixture(`
if [ "$1" = "logs" ] && [ "$2" = "gateway" ]; then
  cat <<'EOF'
[INFO] gateway boot
[INFO] domain handoff ready
EOF
  exit 0
fi
echo "unexpected fake-hermes args: $*" >&2
exit 1
`);

  try {
    const output = runCli(['session', 'logs', 'gateway', '--lines', '20'], {
      OPL_HERMES_BIN: hermesPath,
    });

    assert.equal(output.product_entry.mode, 'logs');
    assert.equal(output.product_entry.log_name, 'gateway');
    assert.equal(output.product_entry.lines, 20);
    assert.match(output.product_entry.raw_output, /gateway boot/);
    assert.ok(output.product_entry.command_preview.includes('gateway'));
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('runtime repair-gateway reinstalls and rechecks the gateway service', () => {
  const { fixtureRoot, hermesPath } = createFakeHermesFixture(`
if [ "$1" = "gateway" ] && [ "$2" = "install" ]; then
  cat <<'EOF'
↻ Updated gateway launchd service definition to match the current Hermes install
✓ Service definition updated
EOF
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
    const output = runCli(['runtime', 'repair-gateway'], {
      OPL_HERMES_BIN: hermesPath,
    });

    assert.equal(output.product_entry.mode, 'repair_hermes_gateway');
    assert.match(output.product_entry.install_output, /Service definition updated/);
    assert.equal(output.product_entry.gateway_service.loaded, true);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('top-level @mag alias is retired in favor of skill sync plus plain Codex entry', () => {
  const { status, payload } = runCliFailure([
    '@mag',
    'Draft a grant revision response pack.',
    '--dry-run',
  ]);

  assert.equal(status, 2);
  assert.equal(payload.error.code, 'cli_usage_error');
  assert.match(payload.error.message, /Command "opl @mag" has been retired/);
  assert.match(payload.error.message, /opl skill sync/);
});

test('contract validate exposes env contract-root provenance', () => {
  const { fixtureRoot, fixtureContractsRoot } = createContractsFixtureRoot(() => {});

  try {
    const output = runCli(['contract', 'validate'], {
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });

    assert.equal(output.validation.contracts_dir, fixtureContractsRoot);
    assert.equal(output.validation.contracts_root_source, 'env');
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('contract validate exposes cli-flag contract-root provenance', () => {
  const { fixtureRoot, fixtureContractsRoot } = createContractsFixtureRoot(() => {});

  try {
    const output = runCli([
      '--contracts-dir',
      fixtureContractsRoot,
      'contract',
      'validate',
    ]);

    assert.equal(output.validation.contracts_dir, fixtureContractsRoot);
    assert.equal(output.validation.contracts_root_source, 'cli_flag');
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('contract validate falls back to the active CLI repo contracts when cwd has no contract root', () => {
  const unrelatedCwd = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-cli-entry-cwd-'));

  try {
    const output = runCliInCwd(['contract', 'validate'], unrelatedCwd);

    assert.equal(output.validation.contracts_dir, contractsDir);
    assert.equal(output.validation.contracts_root_source, 'cli_entry');
  } finally {
    fs.rmSync(unrelatedCwd, { recursive: true, force: true });
  }
});

test('contract validate resolves repo contracts through a symlinked CLI entry path', () => {
  const unrelatedCwd = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-cli-entry-link-cwd-'));
  const linkedCliRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-cli-entry-link-'));
  const linkedCliPath = path.join(linkedCliRoot, 'opl-linked.ts');

  try {
    fs.symlinkSync(cliPath, linkedCliPath);
    const output = runCliViaEntryPathInCwd(linkedCliPath, ['contract', 'validate'], unrelatedCwd);

    assert.equal(output.validation.contracts_dir, contractsDir);
    assert.equal(output.validation.contracts_root_source, 'cli_entry');
  } finally {
    fs.rmSync(unrelatedCwd, { recursive: true, force: true });
    fs.rmSync(linkedCliRoot, { recursive: true, force: true });
  }
});

test('contract validate surfaces stable missing-file errors with cwd provenance', () => {
  const { fixtureRoot, fixtureContractsRoot } = createContractsFixtureRoot((contractsRoot) => {
    fs.rmSync(path.join(contractsRoot, 'task-topology.json'));
  });

  try {
    const { status, payload } = runCliFailureInCwd(['contract', 'validate'], fixtureRoot);

    assert.equal(payload.version, 'g2');
    assert.equal(payload.error.code, 'contract_file_missing');
    assert.equal(payload.error.exit_code, 3);
    assert.equal(status, 3);
    assert.match(payload.error.message, /task-topology\.json/i);
    assert.equal(payload.error.details.contracts_dir, fs.realpathSync.native(fixtureContractsRoot));
    assert.equal(payload.error.details.contracts_root_source, 'cwd');
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('contract validate surfaces stable invalid-json errors', () => {
  const { fixtureRoot, fixtureContractsRoot } = createContractsFixtureRoot((contractsRoot) => {
    fs.writeFileSync(path.join(contractsRoot, 'domains.json'), '{ invalid json\n');
  });

  try {
    const { status, payload } = runCliFailure(['contract', 'validate'], {
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });

    assert.equal(payload.version, 'g2');
    assert.equal(payload.error.code, 'contract_json_invalid');
    assert.equal(payload.error.exit_code, 3);
    assert.equal(status, 3);
    assert.match(payload.error.message, /domains\.json/i);
    assert.equal(payload.error.details.contracts_dir, fixtureContractsRoot);
    assert.equal(payload.error.details.contracts_root_source, 'env');
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('contract validate surfaces stable shape-invalid errors with cli-flag provenance', () => {
  const { fixtureRoot, fixtureContractsRoot } = createContractsFixtureRoot((contractsRoot) => {
    const workstreamsPath = path.join(contractsRoot, 'workstreams.json');
    const workstreams = JSON.parse(fs.readFileSync(workstreamsPath, 'utf8'));
    delete workstreams.workstreams[0].label;
    fs.writeFileSync(workstreamsPath, JSON.stringify(workstreams, null, 2));
  });

  try {
    const { status, payload } = runCliFailure([
      '--contracts-dir',
      fixtureContractsRoot,
      'contract',
      'validate',
    ]);

    assert.equal(payload.version, 'g2');
    assert.equal(payload.error.code, 'contract_shape_invalid');
    assert.equal(payload.error.exit_code, 3);
    assert.equal(status, 3);
    assert.match(payload.error.message, /label/i);
    assert.equal(payload.error.details.contracts_dir, fixtureContractsRoot);
    assert.equal(payload.error.details.contracts_root_source, 'cli_flag');
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('missing value for global --contracts-dir returns a usage error with exit code 2', () => {
  const { status, payload } = runCliFailure(['--contracts-dir']);

  assert.equal(payload.version, 'g2');
  assert.equal(payload.error.code, 'cli_usage_error');
  assert.equal(payload.error.exit_code, 2);
  assert.equal(status, 2);
  assert.match(payload.error.message, /contracts-dir/i);
});

test('global --contracts-dir expects an exact contract root', () => {
  const { status, payload } = runCliFailure([
    '--contracts-dir',
    repoRoot,
    'contract',
    'validate',
  ]);

  assert.equal(payload.version, 'g2');
  assert.equal(payload.error.code, 'contract_file_missing');
  assert.equal(payload.error.exit_code, 3);
  assert.equal(status, 3);
});

test('list-workstreams returns admitted workstream summaries', () => {
  const output = runCli(['contract', 'workstreams']);

  assert.deepEqual(output, {
    version: 'g2',
    contracts_context: {
      contracts_dir: contractsDir,
      contracts_root_source: 'cwd',
    },
    workstreams: [
      {
        workstream_id: 'grant_ops',
        label: 'Grant Ops',
        status: 'emerging',
        domain_id: 'medautogrant',
      },
      {
        workstream_id: 'research_ops',
        label: 'Research Foundry',
        status: 'active',
        domain_id: 'medautoscience',
      },
      {
        workstream_id: 'presentation_ops',
        label: 'Presentation Foundry',
        status: 'emerging',
        domain_id: 'redcube',
      },
    ],
  });
});

test('contract workstream returns the full registered workstream meaning', () => {
  const output = runCli(['contract', 'workstream', 'presentation_ops']);

  assert.equal(output.version, 'g2');
  assertContractsContext(output, 'cwd');
  assert.equal(output.workstream.workstream_id, 'presentation_ops');
  assert.equal(output.workstream.domain_id, 'redcube');
  assert.deepEqual(output.workstream.primary_families, ['ppt_deck']);
});

test('contract domains returns the registered domain gateway summaries', () => {
  const output = runCli(['contract', 'domains']);

  assert.deepEqual(output, {
    version: 'g2',
    contracts_context: {
      contracts_dir: contractsDir,
      contracts_root_source: 'cwd',
    },
    domains: [
      {
        domain_id: 'medautogrant',
        gateway_surface: 'Grant Ops Gateway',
        owned_workstreams: ['grant_ops'],
      },
      {
        domain_id: 'medautoscience',
        gateway_surface: 'Research Foundry Gateway',
        owned_workstreams: ['research_ops'],
      },
      {
        domain_id: 'redcube',
        gateway_surface: 'Visual Deliverable Gateway',
        owned_workstreams: ['presentation_ops'],
      },
    ],
  });
});

test('contract surfaces returns the public gateway surface summaries', () => {
  const output = runCli(['contract', 'surfaces']);

  assert.equal(output.version, 'g2');
  assertContractsContext(output, 'cwd');
  assert.ok(Array.isArray(output.surfaces));
  assert.ok(output.surfaces.length > 10);
  assert.deepEqual(output.surfaces[0], {
    surface_id: 'opl_public_readme',
    category_id: 'opl_public_entry',
    surface_kind: 'readme',
    owner_scope: 'opl',
  });
  assert.ok(
    output.surfaces.some(
      (surface: {
        surface_id: string;
        category_id: string;
        surface_kind: string;
        owner_scope: string;
      }) =>
        surface.surface_id === 'redcube_public_gateway'
        && surface.category_id === 'domain_public_entry'
        && surface.owner_scope === 'domain',
    ),
  );
});

test('contract domain returns the full registered domain meaning', () => {
  const output = runCli(['contract', 'domain', 'redcube']);

  assert.equal(output.version, 'g2');
  assertContractsContext(output, 'cwd');
  assert.equal(output.domain.domain_id, 'redcube');
  assert.equal(output.domain.project, 'redcube-ai');
  assert.deepEqual(output.domain.non_opl_families, ['xiaohongshu']);
});

test('contract surface returns the full registered public surface meaning', () => {
  const output = runCli(['contract', 'surface', 'opl_gateway_contract_hub']);

  assert.equal(output.version, 'g2');
  assertContractsContext(output, 'cwd');
  assert.equal(output.surface.surface_id, 'opl_gateway_contract_hub');
  assert.equal(output.surface.category_id, 'opl_contract_surface');
  assert.match(output.surface.boundary_role, /contract_hub|machine_readable_contract_hub/);
});

test('resolveRequestSurface routes research delivery to medautoscience', () => {
  const resolution = resolveRequestSurface(
    {
      intent: 'submission_delivery',
      target: 'publication',
      goal: 'Prepare the manuscript package for journal review.',
    },
    loadGatewayContracts(repoRoot),
  );

  assert.equal(resolution.status, 'routed');
  assert.equal(resolution.workstream_id, 'research_ops');
  assert.equal(resolution.domain_id, 'medautoscience');
});

test('resolveRequestSurface routes presentation delivery to redcube', () => {
  const resolution = resolveRequestSurface(
    {
      intent: 'presentation_delivery',
      target: 'deliverable',
      goal: 'Prepare a defense-ready slide deck for a thesis committee.',
    },
    loadGatewayContracts(repoRoot),
  );

  assert.equal(resolution.status, 'routed');
  assert.equal(resolution.request_kind, 'discover');
  assert.equal(resolution.workstream_id, 'presentation_ops');
  assert.equal(resolution.domain_id, 'redcube');
  assert.equal(resolution.entry_surface, 'domain_gateway');
  assert.equal(resolution.recommended_family, 'ppt_deck');
});

test('resolveRequestSurface keeps ppt_deck mapped to presentation_ops', () => {
  const output = runCli([
    'domain',
    'resolve-request',
    '--intent',
    'presentation_delivery',
    '--target',
    'deliverable',
    '--goal',
    'Create the committee deck.',
    '--preferred-family',
    'ppt_deck',
  ]);

  assert.equal(output.version, 'g2');
  assertContractsContext(output, 'cwd');
  assert.equal(output.resolution.status, 'routed');
  assert.equal(output.resolution.workstream_id, 'presentation_ops');
  assert.equal(output.resolution.domain_id, 'redcube');
});

test('resolveRequestSurface keeps xiaohongshu at the redcube family boundary', () => {
  const output = runCli([
    'domain',
    'resolve-request',
    '--intent',
    'create',
    '--target',
    'deliverable',
    '--goal',
    'Prepare a xiaohongshu campaign pack.',
    '--preferred-family',
    'xiaohongshu',
  ]);

  assertContractsContext(output, 'cwd');
  assert.equal(output.resolution.status, 'domain_boundary');
  assert.equal(output.resolution.domain_id, 'redcube');
  assert.equal(output.resolution.workstream_id, null);
});

test('resolveRequestSurface routes grant work to medautogrant', () => {
  const output = runCli([
    'domain',
    'resolve-request',
    '--intent',
    'plan',
    '--target',
    'deliverable',
    '--goal',
    'Build a formal grant proposal operating lane from the supplied topic brief.',
  ]);

  assertContractsContext(output, 'cwd');
  assert.equal(output.resolution.status, 'routed');
  assert.equal(output.resolution.domain_id, 'medautogrant');
  assert.equal(output.resolution.workstream_id, 'grant_ops');
  assert.equal(output.resolution.entry_surface, 'domain_gateway');
});

test('resolveRequestSurface returns ambiguous_task with explicit boundary evidence when the primary deliverable is unclear', () => {
  const output = runCli([
    'domain',
    'resolve-request',
    '--intent',
    'create',
    '--target',
    'deliverable',
    '--goal',
    'Package the study for submission and also turn it into a defense-ready deck.',
  ]);

  assertContractsContext(output, 'cwd');
  assert.equal(output.resolution.status, 'ambiguous_task');
  assert.deepEqual(output.resolution.candidate_workstreams, [
    'research_ops',
    'presentation_ops',
  ]);
  assert.deepEqual(output.resolution.candidate_domains, [
    'medautoscience',
    'redcube',
  ]);
  assert.deepEqual(output.resolution.required_clarification, [
    'Is the primary goal a formal research deliverable or a presentation deliverable?',
    'If visual delivery is primary, should the family be ppt_deck or another RedCube family?',
  ]);
  assert.deepEqual(output.resolution.routing_evidence, [
    'research delivery semantics',
    'presentation delivery semantics',
    'missing primary deliverable',
  ]);
});

test('explainDomainBoundary explains admitted presentation routing', () => {
  const explanation = explainDomainBoundary(
    {
      intent: 'presentation_delivery',
      target: 'deliverable',
      goal: 'Prepare a defense-ready slide deck for a thesis committee.',
    },
    loadGatewayContracts(repoRoot),
  );

  assert.equal(explanation.boundary_status, 'routed');
  assert.equal(explanation.resolved_domain, 'redcube');
  assert.equal(explanation.resolved_workstream_id, 'presentation_ops');
  assert.equal(explanation.rejected_domains[0]?.domain_id, 'medautoscience');
  assert.match(explanation.rejected_domains[0]?.reason ?? '', /research evidence/i);
  assert.match(explanation.reason, /visual deliverable/i);
});

test('domain explain-boundary explains xiaohongshu non-equivalence', () => {
  const output = runCli([
    'domain',
    'explain-boundary',
    '--intent',
    'create',
    '--target',
    'deliverable',
    '--goal',
    'Prepare a xiaohongshu campaign pack.',
    '--preferred-family',
    'xiaohongshu',
  ]);

  assertContractsContext(output, 'cwd');
  assert.equal(output.boundary_explanation.resolved_domain, 'redcube');
  assert.equal(output.boundary_explanation.resolved_workstream_id, null);
  assert.match(output.boundary_explanation.reason, /not automatically equal presentation foundry/i);
});

test('domain explain-boundary explains under-definition requests', () => {
  const output = runCli([
    'domain',
    'explain-boundary',
    '--intent',
    'plan',
    '--target',
    'deliverable',
    '--goal',
    'Build a thesis defense preparation pack from the current papers.',
  ]);

  assertContractsContext(output, 'cwd');
  assert.equal(output.boundary_explanation.resolved_domain, null);
  assert.equal(output.boundary_explanation.candidate_workstream_id, 'thesis_ops');
  assert.match(output.boundary_explanation.reason, /under definition/i);
});

test('help returns command discovery and runnable examples', () => {
  const output = runCli(['help']);

  assertNoContractsProvenance(output);
  assert.equal(output.version, 'g2');
  assert.equal(output.help.command, null);
  assert.equal(output.help.usage, 'opl [command ...|request...] [args]');
  assert.ok(
    ['contract workstreams', 'contract workstream', 'contract domains', 'contract domain', 'contract surfaces', 'contract surface', 'domain resolve-request', 'domain explain-boundary'].every((command) =>
      output.help.commands.some((entry: { command: string }) => entry.command === command),
    ),
  );
  assert.ok(
    output.help.commands.some((entry: { command: string }) => entry.command === 'contract validate'),
  );
  assert.equal(
    ['service install', 'service status', 'service open'].some((command) =>
      output.help.commands.some((entry: { command: string }) => entry.command === command),
    ),
    false,
  );
  assert.equal(
    output.help.commands.some((entry: { command: string }) => entry.command === 'frontdesk bootstrap'),
    false,
  );
  assert.ok(
    output.help.commands.some((entry: { command: string }) => entry.command === 'system'),
  );
  assert.ok(
    output.help.commands.some(
      (entry: { command: string; examples: string[] }) =>
        entry.command === 'contract validate'
        && entry.examples.includes('opl contract validate'),
    ),
  );
  assert.ok(output.help.examples.includes('opl contract handoff-envelope "Prepare a defense-ready slide deck." --preferred-family ppt_deck'));
  assert.ok(
    output.help.examples.includes(
      'opl domain explain-boundary --intent create --target deliverable --goal "Prepare a xiaohongshu campaign pack." --preferred-family xiaohongshu',
    ),
  );
});

test('root --help returns the same machine-readable help payload', () => {
  const output = runCli(['--help']);

  assertNoContractsProvenance(output);
  assert.equal(output.version, 'g2');
  assert.equal(output.help.command, null);
  assert.equal(output.help.usage, 'opl [command ...|request...] [args]');
  assert.ok(
    output.help.commands.some((entry: { command: string }) => entry.command === 'contract domain'),
  );
});

test('command --help returns command-scoped usage and examples', () => {
  const output = runCli(['contract', 'domain', '--help']);

  assertNoContractsProvenance(output);
  assert.equal(output.version, 'g2');
  assert.equal(output.help.command, 'contract domain');
  assert.equal(output.help.usage, 'opl contract domain <domain_id>');
  assert.ok(output.help.examples.includes('opl contract domain redcube'));
});

test('help <command> returns the same payload as command --help', () => {
  const viaHelp = runCli(['help', 'contract', 'domain']);
  const viaFlag = runCli(['contract', 'domain', '--help']);

  assert.deepEqual(viaHelp, viaFlag);
});

test('domain explain-boundary --help advertises the xiaohongshu family-boundary example', () => {
  const output = runCli(['domain', 'explain-boundary', '--help']);

  assertNoContractsProvenance(output);
  assert.equal(output.version, 'g2');
  assert.equal(output.help.command, 'domain explain-boundary');
  assert.ok(
    output.help.examples.includes(
      'opl domain explain-boundary --intent create --target deliverable --goal "Prepare a xiaohongshu campaign pack." --preferred-family xiaohongshu',
    ),
  );
});

test('command help literal returns a usage error instead of command-scoped help', () => {
  const { status, payload } = runCliFailure(['contract', 'domain', 'help']);

  assert.equal(payload.version, 'g2');
  assert.equal(payload.error.code, 'cli_usage_error');
  assert.equal(payload.error.exit_code, 2);
  assert.equal(status, 2);
  assert.equal(payload.error.details.help_usage, 'opl contract domain --help');
});

test('CLI usage errors expose machine-readable usage guidance', () => {
  const { status, payload } = runCliFailure(['contract', 'domain']);

  assertNoContractsProvenance(payload);
  assert.equal(payload.version, 'g2');
  assert.equal(payload.error.code, 'cli_usage_error');
  assert.equal(payload.error.exit_code, 2);
  assert.equal(status, 2);
  assert.equal(payload.error.details.usage, 'opl contract domain <domain_id>');
  assert.ok(Array.isArray(payload.error.details.examples));
  assert.ok(payload.error.details.examples.includes('opl contract domain redcube'));
});

test('CLI returns stable JSON errors for unknown ids', () => {
  const { status, payload } = runCliFailure(['contract', 'domain', 'unknown']);

  assert.equal(payload.version, 'g2');
  assert.equal(payload.error.code, 'domain_not_found');
  assert.equal(payload.error.exit_code, 4);
  assert.equal(status, 4);
});

test('CLI returns stable JSON errors for unknown surface ids', () => {
  const { status, payload } = runCliFailure(['contract', 'surface', 'unknown_surface']);

  assert.equal(payload.version, 'g2');
  assert.equal(payload.error.code, 'surface_not_found');
  assert.equal(payload.error.exit_code, 4);
  assert.equal(status, 4);
  assert.deepEqual(payload.error.details, { surface_id: 'unknown_surface' });
});

test('CLI returns machine-readable JSON errors for unknown commands with available command discovery', () => {
  const { status, payload } = runCliFailure(['unknown-command']);

  assertNoContractsProvenance(payload);
  assert.equal(payload.version, 'g2');
  assert.equal(payload.error.code, 'unknown_command');
  assert.equal(payload.error.exit_code, 2);
  assert.equal(status, 2);
  assert.ok(Array.isArray(payload.error.details.commands));
  assert.ok(payload.error.details.commands.includes('contract validate'));
  assert.equal(payload.error.details.command, 'unknown-command');
  assert.equal(payload.error.details.usage, 'opl help');
});
