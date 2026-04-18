import { findDomainOrThrow, GatewayContractError } from './contracts.ts';
import {
  buildCodexCliPreview,
  buildCodexExecArgs,
  parseCodexExecOutput,
  runCodexCommand,
} from './codex.ts';
import { buildHandoffBundle } from './handoff-bundle.ts';
import {
  buildHermesCliPreview,
  buildHermesLogsArgs,
  buildHermesSessionsListArgs,
  type HermesLogsOptions,
  type HermesSessionsListOptions,
  inspectHermesRuntime,
  isInteractiveShell,
  parseHermesQuietChatOutput,
  parseHermesSessionsTable,
  repairHermesGateway,
  runHermesCommand,
  runHermesLogs,
  runHermesResume,
  runHermesSessionsList,
} from './hermes.ts';
import { explainDomainBoundary, resolveRequestSurface } from './resolver.ts';
import { recordSessionLedgerEntry } from './session-ledger.ts';
import type {
  BoundaryExplanation,
  ContractValidationSummary,
  GatewayContracts,
  ResolutionResult,
  ResolveRequestInput,
} from './types.ts';

export type ProductEntryMode =
  | 'ask'
  | 'chat'
  | 'frontdesk'
  | 'resume'
  | 'sessions'
  | 'logs'
  | 'repair_hermes_gateway';

export type ProductEntryExecutor = 'codex' | 'hermes';

export type ProductEntryCliInput = {
  dryRun: boolean;
  goal: string;
  intent: string;
  target: string;
  preferredFamily?: string;
  requestKind?: string;
  model?: string;
  provider?: string;
  workspacePath?: string;
  skills: string[];
  executor?: ProductEntryExecutor;
};

export type PreparedProductEntryAsk = {
  resolveInput: ResolveRequestInput;
  routing: ResolutionResult;
  boundary: BoundaryExplanation;
  handoffPrompt: string;
  args: string[];
  handoffBundle: ReturnType<typeof buildHandoffBundle>;
};

function appendHermesOptions(
  args: string[],
  input: Pick<ProductEntryCliInput, 'model' | 'provider' | 'skills'>,
) {
  if (input.model) {
    args.push('--model', input.model);
  }

  if (input.provider) {
    args.push('--provider', input.provider);
  }

  if (input.skills.length > 0) {
    args.push('--skills', input.skills.join(','));
  }

  args.push('--source', 'opl-product-entry');
  return args;
}

function buildResolveRequestInput(input: ProductEntryCliInput): ResolveRequestInput {
  return {
    intent: input.intent,
    target: input.target,
    goal: input.goal,
    preferredFamily: input.preferredFamily,
    requestKind: input.requestKind,
  };
}

function buildContractsContext(contracts: GatewayContracts) {
  return {
    contracts_dir: contracts.contractsDir,
    contracts_root_source: contracts.contractsRootSource,
  };
}

function resolveProductEntryAskExecutor(input: ProductEntryCliInput): ProductEntryExecutor {
  return input.executor ?? 'codex';
}

function normalizeHermesOutput(stdout: string, stderr = '') {
  return [stdout, stderr]
    .filter((chunk) => chunk.trim().length > 0)
    .join('\n')
    .trim();
}

function assertHermesSuccess(
  exitCode: number,
  message: string,
  details: Record<string, unknown>,
) {
  if (exitCode === 0) {
    return;
  }

  throw new GatewayContractError(
    'hermes_command_failed',
    message,
    details,
    exitCode,
  );
}

function assertCodexSuccess(
  exitCode: number,
  message: string,
  details: Record<string, unknown>,
) {
  if (exitCode === 0) {
    return;
  }

  throw new GatewayContractError(
    'codex_command_failed',
    message,
    details,
    exitCode,
  );
}

function buildPromptHeader(
  mode: ProductEntryMode,
  input: ProductEntryCliInput,
  resolution: ResolutionResult,
  boundary: BoundaryExplanation,
  contracts: GatewayContracts,
) {
  const domainId = 'domain_id' in resolution ? resolution.domain_id : null;
  const domain =
    domainId && resolution.status !== 'ambiguous_task'
      ? findDomainOrThrow(contracts, domainId)
      : null;

  const lines = [
    'You are continuing a session that started from the One Person Lab (OPL) Product Entry.',
    '',
    'OPL routing contract:',
    `- mode: ${mode}`,
    `- requested_executor: ${resolveProductEntryAskExecutor(input)}`,
    `- goal: ${input.goal}`,
    `- intent: ${input.intent}`,
    `- target: ${input.target}`,
    `- request_kind: ${input.requestKind ?? 'product_entry'}`,
    `- routing_status: ${resolution.status}`,
    `- boundary_status: ${boundary.boundary_status}`,
    `- workspace_locator: ${input.workspacePath ?? 'not_provided'}`,
  ];

  if ('workstream_id' in resolution && resolution.workstream_id) {
    lines.push(`- resolved_workstream_id: ${resolution.workstream_id}`);
  }

  if ('candidate_workstream_id' in resolution) {
    lines.push(`- candidate_workstream_id: ${resolution.candidate_workstream_id}`);
  }

  if (domain) {
    lines.push(`- resolved_domain_id: ${domain.domain_id}`);
    lines.push(`- resolved_domain_project: ${domain.project}`);
    lines.push(`- domain_gateway_surface: ${domain.gateway_surface}`);
    lines.push(`- domain_harness_surface: ${domain.harness_surface}`);
  }

  if ('recommended_family' in resolution && resolution.recommended_family) {
    lines.push(`- recommended_family: ${resolution.recommended_family}`);
  }

  if (input.skills.length > 0) {
    lines.push(`- requested_skills: ${input.skills.join(', ')}`);
  }

  lines.push(`- routing_reason: ${resolution.reason}`);
  lines.push(`- boundary_reason: ${boundary.reason}`);
  lines.push(`- routing_evidence: ${resolution.routing_evidence.join(' | ')}`);
  lines.push(`- boundary_evidence: ${boundary.boundary_evidence.join(' | ')}`);
  lines.push('');
  lines.push('Hard boundary rules:');
  lines.push(
    '- Respect the OPL routing result. Do not claim that OPL itself owns domain runtime truth or domain publication truth.',
  );
  lines.push(
    '- If the request is routed, continue within that domain boundary. If it is unknown or ambiguous, help the user clarify without inventing admission or handoff readiness.',
  );
  lines.push(
    '- Hermes is the runtime substrate for this session, not proof that domain authority or object truth moved into OPL.',
  );
  lines.push('');
  lines.push('User request:');
  lines.push(input.goal);
  lines.push('');

  if (mode === 'ask') {
    lines.push('Task: answer the user directly, practically, and within the routing boundary above.');
  } else {
    lines.push(
      'Task: acknowledge the OPL handoff briefly, then continue the conversation as the active session for this request.',
    );
  }

  return lines.join('\n');
}

function buildAskArgs(
  input: ProductEntryCliInput,
  prompt: string,
) {
  return appendHermesOptions(['chat', '--query', prompt, '--quiet'], input);
}

export function prepareProductEntryAsk(
  input: ProductEntryCliInput,
  contracts: GatewayContracts,
): PreparedProductEntryAsk {
  const resolveInput = buildResolveRequestInput(input);
  const routing = resolveRequestSurface(resolveInput, contracts);
  const boundary = explainDomainBoundary(resolveInput, contracts);
  const handoffPrompt = buildPromptHeader('ask', input, routing, boundary, contracts);
  const args = buildAskArgs(input, handoffPrompt);
  const handoffBundle = buildHandoffBundle(contracts, {
    mode: 'ask',
    goal: input.goal,
    intent: input.intent,
    workspacePath: input.workspacePath,
    routing,
    boundary,
  });

  return {
    resolveInput,
    routing,
    boundary,
    handoffPrompt,
    args,
    handoffBundle,
  };
}

function buildChatSeedArgs(
  input: ProductEntryCliInput,
  prompt: string,
) {
  return appendHermesOptions(['chat', '--query', prompt, '--quiet'], input);
}

function buildFrontDeskPrompt(contracts: GatewayContracts) {
  const domainLines = contracts.domains.domains.map((domain) => {
    const workstreams = domain.owned_workstreams.join(', ');
    return `- ${domain.domain_id}: ${domain.gateway_surface} -> workstreams: ${workstreams}`;
  });
  const workstreamLines = contracts.workstreams.workstreams.map((workstream) => {
    const families = workstream.primary_families.join(', ');
    return `- ${workstream.workstream_id}: ${workstream.label} -> primary families: ${families}`;
  });

  return [
    'You are the One Person Lab (OPL) Front Desk.',
    'Your role is to be the default natural-language entry for OPL and route requests to the correct domain or family boundary.',
    '',
    'Current admitted domains:',
    ...domainLines,
    '',
    'Current admitted workstreams:',
    ...workstreamLines,
    '',
    'Hard boundary rules:',
    '- OPL is a gateway and federation shell. It is not the runtime truth owner of any domain.',
    '- Keep work inside admitted domain boundaries and family boundaries. Do not invent admission or hosted readiness.',
    '- Hermes is the runtime substrate for this front-desk session.',
    '',
    'Task:',
    '- Greet briefly and keep momentum.',
    '- Clarify only when required.',
    '- If the task maps to an admitted domain or family, continue with that boundary explicitly.',
    '- If it does not, explain the boundary honestly and help the user refine the request.',
  ].join('\n');
}

function buildFrontDeskSeedArgs(prompt: string) {
  return ['chat', '--query', prompt, '--quiet', '--source', 'opl-frontdesk'];
}

function buildPreviewPayload(
  mode: ProductEntryMode,
  input: ProductEntryCliInput,
  contracts: GatewayContracts,
) {
  const resolveInput = buildResolveRequestInput(input);
  const routing = resolveRequestSurface(resolveInput, contracts);
  const boundary = explainDomainBoundary(resolveInput, contracts);
  const handoffPrompt = buildPromptHeader(mode, input, routing, boundary, contracts);
  const handoffBundle = buildHandoffBundle(contracts, {
    mode,
    goal: input.goal,
    intent: input.intent,
    workspacePath: input.workspacePath,
    routing,
    boundary,
  });

  if (mode === 'ask') {
    const executor = resolveProductEntryAskExecutor(input);
    return {
      version: 'g2',
      contracts_context: buildContractsContext(contracts),
      product_entry: {
        entry_surface: 'opl_local_product_entry_shell',
        mode,
        dry_run: true,
        executor_backend: executor,
        input: resolveInput,
        routing,
        boundary,
        ...handoffBundle,
        handoff_prompt_preview: handoffPrompt,
        ...(executor === 'codex'
          ? {
              codex: {
                command_preview: buildCodexCliPreview(buildCodexExecArgs(handoffPrompt, {
                  cwd: input.workspacePath,
                  json: true,
                  model: input.model,
                  provider: input.provider,
                })),
              },
            }
          : {
              hermes: {
                command_preview: buildHermesCliPreview(buildAskArgs(input, handoffPrompt)),
              },
            }),
      },
    };
  }

  return {
    version: 'g2',
    contracts_context: buildContractsContext(contracts),
    product_entry: {
      entry_surface: 'opl_local_product_entry_shell',
      mode,
      dry_run: true,
      input: resolveInput,
      routing,
      boundary,
      ...handoffBundle,
      handoff_prompt_preview: handoffPrompt,
      hermes: {
        seed_command_preview: buildHermesCliPreview(buildChatSeedArgs(input, handoffPrompt)),
        resume_command_preview: ['hermes', '--resume', '<session_id>'],
      },
    },
  };
}

export function buildProductEntryDoctor(validation: ContractValidationSummary) {
  const hermes = inspectHermesRuntime();
  const localEntryReady = Boolean(hermes.binary);
  const ready = localEntryReady;

  return {
    version: 'g2',
    validation,
    product_entry: {
      entry_surface: 'opl_local_product_entry_shell',
      runtime_substrate: 'external_hermes_kernel',
      ready,
      local_entry_ready: localEntryReady,
      messaging_gateway_ready: hermes.gateway_service.loaded,
      hermes,
      issues: hermes.issues,
      notes: [
        'Local direct entry is provided through `opl`, `opl doctor`, `opl ask`, and `opl chat`.',
        'Hermes gateway service only gates messaging-style product entry; local ask/chat can still work when it is not loaded.',
      ],
    },
  };
}

export function runProductEntryAsk(
  input: ProductEntryCliInput,
  contracts: GatewayContracts,
) {
  if (input.dryRun) {
    return buildPreviewPayload('ask', input, contracts);
  }

  const preparedAsk = prepareProductEntryAsk(input, contracts);
  const executor = resolveProductEntryAskExecutor(input);

  if (executor === 'codex') {
    const codexArgs = buildCodexExecArgs(preparedAsk.handoffPrompt, {
      cwd: input.workspacePath,
      json: true,
      model: input.model,
      provider: input.provider,
    });
    const codexResult = runCodexCommand(codexArgs);

    assertCodexSuccess(
      codexResult.exitCode,
      'Codex ask query failed inside OPL Product Entry.',
      {
        args: buildCodexCliPreview(codexArgs),
        stdout: codexResult.stdout,
        stderr: codexResult.stderr,
      },
    );

    const parsed = parseCodexExecOutput(codexResult.stdout);
    const handoffBundle = buildHandoffBundle(contracts, {
      mode: 'ask',
      goal: input.goal,
      intent: input.intent,
      workspacePath: input.workspacePath,
      routing: preparedAsk.routing,
      boundary: preparedAsk.boundary,
      sessionId: parsed.threadId ?? undefined,
    });

    if (parsed.threadId) {
      recordSessionLedgerEntry({
        sessionId: parsed.threadId,
        mode: 'ask',
        sourceSurface: 'opl_local_product_entry_shell',
        domainId: 'domain_id' in preparedAsk.routing ? preparedAsk.routing.domain_id : null,
        workstreamId: 'workstream_id' in preparedAsk.routing ? preparedAsk.routing.workstream_id : null,
        goalPreview: input.goal,
        workspaceLocator: handoffBundle.handoff_bundle.workspace_locator,
      });
    }

    return {
      version: 'g2',
      contracts_context: buildContractsContext(contracts),
      product_entry: {
        entry_surface: 'opl_local_product_entry_shell',
        mode: 'ask',
        dry_run: false,
        executor_backend: 'codex',
        input: preparedAsk.resolveInput,
        routing: preparedAsk.routing,
        boundary: preparedAsk.boundary,
        ...handoffBundle,
        handoff_prompt_preview: preparedAsk.handoffPrompt,
        codex: {
          command_preview: buildCodexCliPreview(codexArgs),
          response: parsed.finalMessage,
          session_id: parsed.threadId,
          exit_code: codexResult.exitCode,
        },
      },
    };
  }

  const hermesResult = runHermesCommand(preparedAsk.args);

  assertHermesSuccess(
    hermesResult.exitCode,
    'Hermes ask query failed inside OPL Product Entry.',
    {
      args: buildHermesCliPreview(preparedAsk.args),
      stdout: hermesResult.stdout,
      stderr: hermesResult.stderr,
    },
  );

  const parsed = parseHermesQuietChatOutput(hermesResult.stdout);
  const handoffBundle = buildHandoffBundle(contracts, {
    mode: 'ask',
    goal: input.goal,
    intent: input.intent,
    workspacePath: input.workspacePath,
    routing: preparedAsk.routing,
    boundary: preparedAsk.boundary,
    sessionId: parsed.sessionId,
  });
  recordSessionLedgerEntry({
    sessionId: parsed.sessionId,
    mode: 'ask',
    sourceSurface: 'opl_local_product_entry_shell',
    domainId: 'domain_id' in preparedAsk.routing ? preparedAsk.routing.domain_id : null,
    workstreamId: 'workstream_id' in preparedAsk.routing ? preparedAsk.routing.workstream_id : null,
    goalPreview: input.goal,
    workspaceLocator: handoffBundle.handoff_bundle.workspace_locator,
  });

  return {
    version: 'g2',
    contracts_context: buildContractsContext(contracts),
    product_entry: {
      entry_surface: 'opl_local_product_entry_shell',
      mode: 'ask',
      dry_run: false,
      executor_backend: 'hermes',
      input: preparedAsk.resolveInput,
      routing: preparedAsk.routing,
      boundary: preparedAsk.boundary,
      ...handoffBundle,
      handoff_prompt_preview: preparedAsk.handoffPrompt,
      hermes: {
        command_preview: buildHermesCliPreview(preparedAsk.args),
        response: parsed.response,
        session_id: parsed.sessionId,
        exit_code: hermesResult.exitCode,
      },
    },
  };
}

export function runProductEntryFrontDesk(
  contracts: GatewayContracts,
) {
  const prompt = buildFrontDeskPrompt(contracts);
  const seedArgs = buildFrontDeskSeedArgs(prompt);
  const seedResult = runHermesCommand(seedArgs);

  assertHermesSuccess(
    seedResult.exitCode,
    'Hermes front-desk seed failed inside OPL Product Entry.',
    {
      args: buildHermesCliPreview(seedArgs),
      stdout: seedResult.stdout,
      stderr: seedResult.stderr,
    },
  );

  const parsed = parseHermesQuietChatOutput(seedResult.stdout);
  recordSessionLedgerEntry({
    sessionId: parsed.sessionId,
    mode: 'frontdesk',
    sourceSurface: 'opl_local_product_entry_shell',
    goalPreview: 'OPL Front Desk seed',
  });

  if (isInteractiveShell()) {
    process.stdout.write(
      [
        'OPL Front Desk ready in Hermes.',
        `Hermes session: ${parsed.sessionId}`,
        parsed.response ? `Seed response: ${parsed.response}` : null,
        '',
      ]
        .filter(Boolean)
        .join('\n'),
    );

    const resumeResult = runHermesResume(parsed.sessionId, {
      inheritStdio: true,
    });

    assertHermesSuccess(
      resumeResult.exitCode,
      'Hermes resume failed after OPL Front Desk seeded the session.',
      {
        session_id: parsed.sessionId,
      },
    );

    return {
      __handled: true as const,
    };
  }

  const resumeResult = runHermesResume(parsed.sessionId);

  assertHermesSuccess(
    resumeResult.exitCode,
    'Hermes resume failed after OPL Front Desk seeded the session.',
    {
      session_id: parsed.sessionId,
      stdout: resumeResult.stdout,
      stderr: resumeResult.stderr,
    },
  );

  return {
    version: 'g2',
    contracts_context: buildContractsContext(contracts),
    product_entry: {
      entry_surface: 'opl_local_product_entry_shell',
      mode: 'frontdesk',
      interactive: false,
      handoff_prompt_preview: prompt,
      seed: {
        command_preview: buildHermesCliPreview(seedArgs),
        response: parsed.response,
        session_id: parsed.sessionId,
        exit_code: seedResult.exitCode,
      },
      resume: {
        command_preview: buildHermesCliPreview(['--resume', parsed.sessionId]),
        session_id: parsed.sessionId,
        output: normalizeHermesOutput(resumeResult.stdout, resumeResult.stderr),
        exit_code: resumeResult.exitCode,
      },
    },
  };
}

export function runProductEntryChat(
  input: ProductEntryCliInput,
  contracts: GatewayContracts,
) {
  if (input.dryRun) {
    return buildPreviewPayload('chat', input, contracts);
  }

  if (input.executor && input.executor !== 'hermes') {
    throw new GatewayContractError(
      'cli_usage_error',
      'chat currently supports the Hermes interactive lane only.',
      {
        executor: input.executor,
      },
      2,
    );
  }

  const resolveInput = buildResolveRequestInput(input);
  const routing = resolveRequestSurface(resolveInput, contracts);
  const boundary = explainDomainBoundary(resolveInput, contracts);
  const handoffPrompt = buildPromptHeader('chat', input, routing, boundary, contracts);
  const seedArgs = buildChatSeedArgs(input, handoffPrompt);
  const seedResult = runHermesCommand(seedArgs);

  assertHermesSuccess(
    seedResult.exitCode,
    'Hermes chat seeding failed inside OPL Product Entry.',
    {
      args: buildHermesCliPreview(seedArgs),
      stdout: seedResult.stdout,
      stderr: seedResult.stderr,
    },
  );

  const parsed = parseHermesQuietChatOutput(seedResult.stdout);
  const handoffBundle = buildHandoffBundle(contracts, {
    mode: 'chat',
    goal: input.goal,
    intent: input.intent,
    workspacePath: input.workspacePath,
    routing,
    boundary,
    sessionId: parsed.sessionId,
  });
  recordSessionLedgerEntry({
    sessionId: parsed.sessionId,
    mode: 'chat',
    sourceSurface: 'opl_local_product_entry_shell',
    domainId: 'domain_id' in routing ? routing.domain_id : null,
    workstreamId: 'workstream_id' in routing ? routing.workstream_id : null,
    goalPreview: input.goal,
    workspaceLocator: handoffBundle.handoff_bundle.workspace_locator,
  });

  if (isInteractiveShell()) {
    process.stdout.write(
      [
        'OPL Product Entry handoff seeded into Hermes.',
        `Routing status: ${routing.status}`,
        `Hermes session: ${parsed.sessionId}`,
        parsed.response ? `Seed response: ${parsed.response}` : null,
        '',
      ]
        .filter(Boolean)
        .join('\n'),
    );

    const resumeResult = runHermesResume(parsed.sessionId, {
      inheritStdio: true,
    });

    assertHermesSuccess(
      resumeResult.exitCode,
      'Hermes resume failed after OPL Product Entry seeded the session.',
      {
        session_id: parsed.sessionId,
      },
    );

    return {
      __handled: true as const,
    };
  }

  const resumeResult = runHermesResume(parsed.sessionId);

  assertHermesSuccess(
    resumeResult.exitCode,
    'Hermes resume failed after OPL Product Entry seeded the session.',
    {
      session_id: parsed.sessionId,
      stdout: resumeResult.stdout,
      stderr: resumeResult.stderr,
    },
  );

  return {
    version: 'g2',
    contracts_context: buildContractsContext(contracts),
    product_entry: {
      entry_surface: 'opl_local_product_entry_shell',
      mode: 'chat',
      dry_run: false,
      interactive: false,
      input: resolveInput,
      routing,
      boundary,
      ...handoffBundle,
      handoff_prompt_preview: handoffPrompt,
      seed: {
        command_preview: buildHermesCliPreview(seedArgs),
        response: parsed.response,
        session_id: parsed.sessionId,
        exit_code: seedResult.exitCode,
      },
      resume: {
        command_preview: buildHermesCliPreview(['--resume', parsed.sessionId]),
        session_id: parsed.sessionId,
        output: normalizeHermesOutput(resumeResult.stdout, resumeResult.stderr),
        exit_code: resumeResult.exitCode,
      },
    },
  };
}

export function runProductEntryResume(sessionId: string) {
  if (isInteractiveShell()) {
    const resumeResult = runHermesResume(sessionId, {
      inheritStdio: true,
    });

    assertHermesSuccess(
      resumeResult.exitCode,
      'Hermes resume failed inside OPL Product Entry.',
      {
        session_id: sessionId,
      },
    );

    return {
      __handled: true as const,
    };
  }

  const resumeResult = runHermesResume(sessionId);

  assertHermesSuccess(
    resumeResult.exitCode,
    'Hermes resume failed inside OPL Product Entry.',
    {
      session_id: sessionId,
      stdout: resumeResult.stdout,
      stderr: resumeResult.stderr,
    },
  );
  recordSessionLedgerEntry({
    sessionId,
    mode: 'resume',
    sourceSurface: 'opl_local_product_entry_shell',
  });

  return {
    version: 'g2',
    product_entry: {
      entry_surface: 'opl_local_product_entry_shell',
      mode: 'resume',
      interactive: false,
      resume: {
        command_preview: buildHermesCliPreview(['--resume', sessionId]),
        session_id: sessionId,
        output: normalizeHermesOutput(resumeResult.stdout, resumeResult.stderr),
        exit_code: resumeResult.exitCode,
      },
    },
  };
}

export function runProductEntrySessions(options: HermesSessionsListOptions = {}) {
  const args = buildHermesSessionsListArgs(options);
  const result = runHermesSessionsList(options);

  assertHermesSuccess(
    result.exitCode,
    'Hermes sessions list failed inside OPL Product Entry.',
    {
      args: buildHermesCliPreview(args),
      stdout: result.stdout,
      stderr: result.stderr,
    },
  );

  return {
    version: 'g2',
    product_entry: {
      entry_surface: 'opl_local_product_entry_shell',
      mode: 'sessions',
      command_preview: buildHermesCliPreview(args),
      limit: options.limit ?? null,
      source_filter: options.source ?? null,
      sessions: parseHermesSessionsTable(result.stdout),
      raw_output: normalizeHermesOutput(result.stdout, result.stderr),
    },
  };
}

export function runProductEntryLogs(options: HermesLogsOptions = {}) {
  const args = buildHermesLogsArgs(options);
  const result = runHermesLogs(options);

  assertHermesSuccess(
    result.exitCode,
    'Hermes logs failed inside OPL Product Entry.',
    {
      args: buildHermesCliPreview(args),
      stdout: result.stdout,
      stderr: result.stderr,
    },
  );

  return {
    version: 'g2',
    product_entry: {
      entry_surface: 'opl_local_product_entry_shell',
      mode: 'logs',
      log_name: options.logName ?? null,
      lines: options.lines ?? null,
      since: options.since ?? null,
      level: options.level ?? null,
      component: options.component ?? null,
      session_id: options.sessionId ?? null,
      command_preview: buildHermesCliPreview(args),
      raw_output: normalizeHermesOutput(result.stdout, result.stderr),
    },
  };
}

export function runProductEntryRepairHermesGateway() {
  const repaired = repairHermesGateway();

  assertHermesSuccess(
    repaired.installResult.exitCode,
    'Hermes gateway install failed inside OPL Product Entry.',
    {
      args: buildHermesCliPreview(['gateway', 'install']),
      stdout: repaired.installResult.stdout,
      stderr: repaired.installResult.stderr,
    },
  );

  assertHermesSuccess(
    repaired.statusResult.exitCode,
    'Hermes gateway status failed after OPL Product Entry repair.',
    {
      args: buildHermesCliPreview(['gateway', 'status']),
      stdout: repaired.statusResult.stdout,
      stderr: repaired.statusResult.stderr,
    },
  );

  return {
    version: 'g2',
    product_entry: {
      entry_surface: 'opl_local_product_entry_shell',
      mode: 'repair_hermes_gateway',
      install_command_preview: buildHermesCliPreview(['gateway', 'install']),
      status_command_preview: buildHermesCliPreview(['gateway', 'status']),
      install_output: normalizeHermesOutput(
        repaired.installResult.stdout,
        repaired.installResult.stderr,
      ),
      gateway_service: repaired.gatewayService,
    },
  };
}

export function buildProductEntryHandoffEnvelope(
  input: ProductEntryCliInput,
  contracts: GatewayContracts,
) {
  const resolveInput = buildResolveRequestInput(input);
  const routing = resolveRequestSurface(resolveInput, contracts);
  const boundary = explainDomainBoundary(resolveInput, contracts);

  return {
    version: 'g2',
    contracts_context: buildContractsContext(contracts),
    ...buildHandoffBundle(contracts, {
      mode: 'ask',
      goal: input.goal,
      intent: input.intent,
      workspacePath: input.workspacePath,
      routing,
      boundary,
    }),
  };
}
