import {
  assert,
  assertContractsContext,
  assertNoContractsProvenance,
  cliPath,
  contractsDir,
  createContractsFixtureRoot,
  explainDomainBoundary,
  fs,
  loadFrameworkContracts,
  os,
  parseJsonText,
  path,
  repoRoot,
  runCli,
  runCliFailure,
  runCliFailureInCwd,
  runCliInCwd,
  runCliViaEntryPathInCwd,
  selectDomainAgentEntry,
  test,
} from '../helpers.ts';

test('contract validate honors explicit contract-root provenance', () => {
  const { fixtureRoot, fixtureContractsRoot } = createContractsFixtureRoot(() => {});

  try {
    for (const { args, env, source } of [
      {
        args: ['contract', 'validate'],
        env: { OPL_CONTRACTS_DIR: fixtureContractsRoot },
        source: 'env',
      },
      {
        args: ['--contracts-dir', fixtureContractsRoot, 'contract', 'validate'],
        env: {},
        source: 'cli_flag',
      },
    ]) {
      const output = runCli(args, env);
      assert.equal(output.validation.contracts_dir, fixtureContractsRoot);
      assert.equal(output.validation.contracts_root_source, source);
    }
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

test('contract validate ignores domain package OPL contracts when they are not framework registries', () => {
  const domainCwd = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-domain-package-cwd-'));
  const domainContractsDir = path.join(domainCwd, 'contracts', 'opl-framework');

  try {
    fs.mkdirSync(domainContractsDir, { recursive: true });
    fs.writeFileSync(
      path.join(domainContractsDir, 'family-contract-adoption.json'),
      JSON.stringify({
        contract_kind: 'domain_opl_family_contract_adoption.v1',
        owner: 'domain-agent',
      }, null, 2),
    );

    const output = runCliInCwd(['contract', 'validate'], domainCwd);

    assert.equal(output.validation.contracts_dir, contractsDir);
    assert.equal(output.validation.contracts_root_source, 'cli_entry');
  } finally {
    fs.rmSync(domainCwd, { recursive: true, force: true });
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
    const workstreams = parseJsonText(fs.readFileSync(workstreamsPath, 'utf8')) as {
      workstreams: Array<{ label?: string }>;
    };
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

test('contract list and detail commands expose sparse canonical readbacks', () => {
  const outputs = {
    workstreams: runCli(['contract', 'workstreams']),
    workstream: runCli(['contract', 'workstream', 'presentation_ops']),
    domains: runCli(['contract', 'domains']),
    domain: runCli(['contract', 'domain', 'redcube']),
    surfaces: runCli(['contract', 'surfaces']),
    surface: runCli(['contract', 'surface', 'one_person_lab_app_workbench']),
  };

  for (const output of Object.values(outputs)) {
    assert.equal(output.version, 'g2');
    assertContractsContext(output, 'cwd');
  }
  assert.equal(
    outputs.workstreams.workstreams.some((entry: any) =>
      entry.workstream_id === 'presentation_ops' && entry.domain_id === 'redcube' && entry.status === 'active'
    ),
    true,
  );
  assert.equal(outputs.workstream.workstream.workstream_id, 'presentation_ops');
  assert.deepEqual(outputs.workstream.workstream.primary_families, ['ppt_deck']);
  assert.equal(
    outputs.domains.domains.some((domain: any) =>
      domain.domain_id === 'medautoscience'
      && domain.independent_domain_agent === 'mas'
      && domain.embeds_opl_runtime === false
    ),
    true,
  );
  assert.equal(outputs.domain.domain.project, 'redcube-ai');
  assert.deepEqual(outputs.domain.domain.non_opl_families, ['xiaohongshu']);
  assert.equal(
    outputs.surfaces.surfaces.some((surface: any) =>
      surface.surface_id === 'opl_framework_locator'
      && surface.surface_kind === 'framework_dependency_locator'
      && surface.owner_scope === 'opl'
    ),
    true,
  );
  assert.equal(outputs.surface.surface.boundary_role, 'app_consumer_workbench');
  assert.equal(outputs.surface.surface.truth_mode, 'projection_consumer');
});

test('domain selection routes representative admitted boundary and candidate-lane requests', () => {
  const contracts = loadFrameworkContracts(repoRoot);
  assert.deepEqual(
    [
      selectDomainAgentEntry(
        { intent: 'submission_delivery', target: 'publication', goal: 'Prepare the manuscript package for journal review.' },
        contracts,
      ),
      selectDomainAgentEntry(
        { intent: 'presentation_delivery', target: 'deliverable', goal: 'Prepare a defense-ready slide deck for a thesis committee.' },
        contracts,
      ),
    ].map((resolution) => [resolution.status, 'workstream_id' in resolution ? resolution.workstream_id : undefined, 'domain_id' in resolution ? resolution.domain_id : undefined]),
    [
      ['selected_domain_agent_entry', 'research_ops', 'medautoscience'],
      ['selected_domain_agent_entry', 'presentation_ops', 'redcube'],
    ],
  );

  const cliCases: Array<{ goal: string; preferred?: string; intent?: string; expected: unknown[] }> = [
    { goal: 'Create the committee deck.', preferred: 'ppt_deck', expected: ['selected_domain_agent_entry', 'presentation_ops', 'redcube'] },
    { goal: 'Prepare a xiaohongshu campaign pack.', preferred: 'xiaohongshu', intent: 'create', expected: ['domain_boundary', null, 'redcube'] },
    {
      goal: 'Draft a patent application with claims and embodiments from this medical research result.',
      intent: 'ip_ops',
      expected: ['unknown_domain', 'ip_ops', undefined],
    },
    {
      goal: 'Prepare a science and technology award application with achievement summary and impact evidence.',
      intent: 'award_ops',
      expected: ['unknown_domain', 'award_ops', undefined],
    },
    { goal: 'Build a formal grant proposal operating lane from the supplied topic brief.', intent: 'proposal_authoring', expected: ['selected_domain_agent_entry', 'grant_ops', 'medautogrant'] },
  ];
  for (const entry of cliCases) {
    const args = [
      'domain',
      'select-entry',
      '--intent',
      entry.intent ?? (entry.preferred === undefined ? 'create' : 'presentation_delivery'),
      '--target',
      'deliverable',
      '--goal',
      entry.goal,
    ];
    if (entry.preferred) args.push('--preferred-family', entry.preferred);
    const output = runCli(args);
    const workstream = output.resolution.workstream_id === null
      ? null
      : output.resolution.workstream_id ?? output.resolution.candidate_workstream_id;
    assertContractsContext(output, 'cwd');
    assert.deepEqual(
      [output.resolution.status, workstream, output.resolution.domain_id],
      entry.expected,
    );
  }
});

test('domain selection uses package-locked domain routing signals for natural-language goals', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-atlas-package-lock-'));
  const domainRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-atlas-domain-'));
  const previousStateRoot = process.env.OPL_STATE_DIR;
  try {
    fs.mkdirSync(path.join(domainRepo, 'contracts'), { recursive: true });
    fs.writeFileSync(path.join(domainRepo, 'contracts', 'domain_descriptor.json'), `${JSON.stringify({
      domain_id: 'redcube-ai',
      standard_agent_interface: {
        version: 'opl_standard_agent_interface.v1',
        workspace_binding: {
          locator_surface_kind: 'redcube_workspace',
          default_profile_id: 'series',
          workspace_kind: 'visual_theme_workspace',
          project_kind: 'slide_deck',
          project_collection_label: 'deliverables',
          default_workspace_id: 'visual-workspace',
          default_project_id: 'deck-001',
          required_locator_fields: ['workspace_root'],
          optional_locator_fields: [],
        },
        runtime: { runtime_domain_id: 'redcube', registration_ref: null },
        progress: { deliverable_delta_aliases: [], platform_delta_aliases: [] },
        routing: {
          explicit_aliases: ['rca'],
          workstream_ids: ['presentation_ops'],
          intent_signals: ['speaker notes'],
          ambiguity_policy: 'require_one_declared_signal',
        },
      },
    })}\n`);
    fs.writeFileSync(path.join(stateRoot, 'agent-package-locks.json'), `${JSON.stringify({
      packages: [{
        package_id: 'rca',
        agent_id: 'rca',
        managed_runtime_source: { status: 'current', checkout_path: domainRepo },
      }],
    })}\n`);
    process.env.OPL_STATE_DIR = stateRoot;
    const resolution = selectDomainAgentEntry({
      intent: 'create',
      target: 'deliverable',
      goal: 'Prepare speaker notes for the committee.',
    }, loadFrameworkContracts(repoRoot));
    assert.equal(resolution.status, 'selected_domain_agent_entry');
    assert.equal('domain_id' in resolution ? resolution.domain_id : null, 'redcube');
    assert.equal('workstream_id' in resolution ? resolution.workstream_id : null, 'presentation_ops');
  } finally {
    if (previousStateRoot === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previousStateRoot;
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(domainRepo, { recursive: true, force: true });
  }
});

test('selectDomainAgentEntry refuses to infer domain semantics from unstructured goal text', () => {
  const output = runCli([
    'domain',
    'select-entry',
    '--intent',
    'create',
    '--target',
    'deliverable',
    '--goal',
    'Package the study for submission and also turn it into a defense-ready deck.',
  ]);

  assertContractsContext(output, 'cwd');
  assert.equal(output.resolution.status, 'ambiguous_task');
  assert.deepEqual(output.resolution.candidate_workstreams, []);
  assert.deepEqual(output.resolution.candidate_domains, []);
  assert.deepEqual(output.resolution.required_clarification, [
    'Select a Standard Agent, admitted workstream, primary family, or top-level intent.',
  ]);
  assert.deepEqual(output.resolution.selection_evidence, [
    'unmatched_normalized_signal=create',
    'unmatched_normalized_signal=deliverable',
  ]);
});

test('explainDomainBoundary explains admitted presentation stage selection', () => {
  const explanation = explainDomainBoundary(
    {
      intent: 'presentation_delivery',
      target: 'deliverable',
      goal: 'Prepare a defense-ready slide deck for a thesis committee.',
    },
    loadFrameworkContracts(repoRoot),
  );

  assert.equal(explanation.boundary_status, 'selected_domain_agent_entry');
  assert.equal(explanation.resolved_domain, 'redcube');
  assert.equal(explanation.resolved_workstream_id, 'presentation_ops');
  const rejectedResearch = explanation.rejected_domains.find((entry) => entry.domain_id === 'medautoscience');
  assert.match(rejectedResearch?.reason ?? '', /no explicit normalized routing signal/i);
  assert.match(explanation.reason, /admitted workstream selected/i);
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
  assert.match(output.boundary_explanation.reason, /cannot infer one active workstream/i);
});

test('domain explain-boundary explains under-definition requests', () => {
  const output = runCli([
    'domain',
    'explain-boundary',
    '--intent',
    'thesis_ops',
    '--target',
    'deliverable',
    '--goal',
    'Build a thesis defense preparation pack from the current papers.',
  ]);

  assertContractsContext(output, 'cwd');
  assert.equal(output.boundary_explanation.resolved_domain, null);
  assert.equal(output.boundary_explanation.candidate_workstream_id, 'thesis_ops');
  assert.match(output.boundary_explanation.reason, /no active admitted domain owner/i);
});

test('help returns machine-readable command discovery without retired entries', () => {
  const output = runCli(['help']);

  assertNoContractsProvenance(output);
  assert.equal(output.version, 'g2');
  assert.equal(output.help.command, null);
  assert.equal(output.help.usage, 'opl [command ...|request...] [args]');
  assert.ok(
    ['charter status', 'atlas inspect', 'stagecraft interfaces', 'runway doctor', 'ledger validate', 'console status', 'foundry-lab inspect', 'connect sync-skills', 'agents foundry status'].every((command) =>
      output.help.commands.some((entry: { command: string }) => entry.command === command),
    ),
  );
  assert.equal(output.help.commands.some((entry: { command: string }) => entry.command === 'contract validate'), false);
  assert.equal(
    ['service install', 'service status', 'service open'].some((command) =>
      output.help.commands.some((entry: { command: string }) => entry.command === command),
    ),
    false,
  );
  assert.equal(
    output.help.commands.some((entry: { command: string }) => entry.command === 'product entry bootstrap'),
    false,
  );
  assert.equal(output.help.commands.some((entry: { command: string }) => entry.command === 'system'), false);
  const commandText = JSON.stringify(output.help.commands);
  assert.match(commandText, /--executor\b/);
  assert.doesNotMatch(commandText, /<codex\|hermes>/);
  assert.doesNotMatch(commandText, /hermes-cron/);
  assert.doesNotMatch(commandText, /Compatibility alias/);
});

test('command help forms return stable machine-readable usage', () => {
  assert.deepEqual(runCli(['--help']), runCli(['help']));
  const output = runCli(['contract', 'domain', '--help']);

  assertNoContractsProvenance(output);
  assert.equal(output.version, 'g2');
  assert.equal(output.help.command, 'contract domain');
  assert.equal(output.help.usage, 'opl contract domain <domain_id>');
  assert.deepEqual(runCli(['help', 'contract', 'domain']), output);
  assert.equal(runCli(['domain', 'explain-boundary', '--help']).help.command, 'domain explain-boundary');
});

test('family-runtime nested --help returns command help without executing runtime subcommands', () => {
  for (const args of [
    ['family-runtime', 'provider-slo', 'tick', '--help'],
    ['family-runtime', 'scheduler', 'tick', '--help'],
    ['family-runtime', 'attempt', 'query', '--help'],
  ]) {
    const output = runCli(args);

    assertNoContractsProvenance(output);
    assert.equal(output.version, 'g2');
    assert.equal(output.help.command, 'family-runtime');
    assert.match(output.help.usage, /provider-slo tick/);
    assert.match(output.help.usage, /attempt query/);
    assert.doesNotMatch(output.help.usage, /scheduler tick|family-runtime tick|\benqueue\b|queue (list|release|retire)|\bapprove\b/);
    assert.equal(Object.hasOwn(output, 'family_runtime_queue'), false);
    assert.equal(Object.hasOwn(output, 'family_runtime_queue_release'), false);
    assert.equal(Object.hasOwn(output, 'family_runtime_tick'), false);
    assert.equal(Object.hasOwn(output, 'family_runtime_provider_slo_tick'), false);
  }
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

test('CLI returns stable JSON errors for unknown contract ids', () => {
  for (const { args, code, details } of [
    {
      args: ['contract', 'domain', 'unknown'],
      code: 'domain_not_found',
      details: undefined,
    },
    {
      args: ['contract', 'surface', 'unknown_surface'],
      code: 'surface_not_found',
      details: { surface_id: 'unknown_surface' },
    },
  ]) {
    const { status, payload } = runCliFailure(args);
    assert.equal(payload.version, 'g2');
    assert.equal(payload.error.code, code);
    assert.equal(payload.error.exit_code, 4);
    assert.equal(status, 4);
    if (details) assert.deepEqual(payload.error.details, details);
  }
});

test('CLI returns bounded machine-readable JSON errors for unknown commands', () => {
  const { status, payload } = runCliFailure(['unknown-command']);

  assertNoContractsProvenance(payload);
  assert.equal(payload.version, 'g2');
  assert.equal(payload.error.code, 'unknown_command');
  assert.equal(payload.error.exit_code, 2);
  assert.equal(status, 2);
  assert.equal(payload.error.details.command, 'unknown-command');
  assert.equal(typeof payload.error.details.command_count, 'number');
  assert.ok(payload.error.details.command_count > 0);
  assert.equal(payload.error.details.usage, 'opl help');
  assert.equal(payload.error.details.help_command, 'opl help');
  assert.equal('commands' in payload.error.details, false);
});
