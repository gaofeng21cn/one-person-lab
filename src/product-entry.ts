import { findDomainOrThrow, GatewayContractError } from './contracts.ts';
import {
  buildHermesCliPreview,
  inspectHermesRuntime,
  parseHermesQuietChatOutput,
  runHermesCommand,
} from './hermes.ts';
import { explainDomainBoundary, resolveRequestSurface } from './resolver.ts';
import type {
  BoundaryExplanation,
  ContractValidationSummary,
  GatewayContracts,
  ResolutionResult,
  ResolveRequestInput,
} from './types.ts';

export type ProductEntryMode = 'ask' | 'chat';

export type ProductEntryCliInput = {
  dryRun: boolean;
  goal: string;
  intent: string;
  target: string;
  preferredFamily?: string;
  requestKind?: string;
  model?: string;
  provider?: string;
  skills: string[];
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
    `- goal: ${input.goal}`,
    `- intent: ${input.intent}`,
    `- target: ${input.target}`,
    `- request_kind: ${input.requestKind ?? 'product_entry'}`,
    `- routing_status: ${resolution.status}`,
    `- boundary_status: ${boundary.boundary_status}`,
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

function buildChatSeedArgs(
  input: ProductEntryCliInput,
  prompt: string,
) {
  return appendHermesOptions(['chat', '--query', prompt, '--quiet'], input);
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

  if (mode === 'ask') {
    return {
      version: 'g2',
      contracts_context: {
        contracts_dir: contracts.contractsDir,
        contracts_root_source: contracts.contractsRootSource,
      },
      product_entry: {
        entry_surface: 'opl_local_product_entry_shell',
        mode,
        dry_run: true,
        input: resolveInput,
        routing,
        boundary,
        handoff_prompt_preview: handoffPrompt,
        hermes: {
          command_preview: buildHermesCliPreview(buildAskArgs(input, handoffPrompt)),
        },
      },
    };
  }

  return {
    version: 'g2',
    contracts_context: {
      contracts_dir: contracts.contractsDir,
      contracts_root_source: contracts.contractsRootSource,
    },
    product_entry: {
      entry_surface: 'opl_local_product_entry_shell',
      mode,
      dry_run: true,
      input: resolveInput,
      routing,
      boundary,
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
        'Local direct entry is provided through `opl doctor`, `opl ask`, and `opl chat`.',
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

  const resolveInput = buildResolveRequestInput(input);
  const routing = resolveRequestSurface(resolveInput, contracts);
  const boundary = explainDomainBoundary(resolveInput, contracts);
  const handoffPrompt = buildPromptHeader('ask', input, routing, boundary, contracts);
  const args = buildAskArgs(input, handoffPrompt);
  const hermesResult = runHermesCommand(args);

  if (hermesResult.exitCode !== 0) {
    throw new GatewayContractError(
      'hermes_command_failed',
      'Hermes ask query failed inside OPL Product Entry.',
      {
        args: buildHermesCliPreview(args),
        stdout: hermesResult.stdout,
        stderr: hermesResult.stderr,
      },
      hermesResult.exitCode,
    );
  }

  const parsed = parseHermesQuietChatOutput(hermesResult.stdout);

  return {
    version: 'g2',
    contracts_context: {
      contracts_dir: contracts.contractsDir,
      contracts_root_source: contracts.contractsRootSource,
    },
    product_entry: {
      entry_surface: 'opl_local_product_entry_shell',
      mode: 'ask',
      dry_run: false,
      input: resolveInput,
      routing,
      boundary,
      handoff_prompt_preview: handoffPrompt,
      hermes: {
        command_preview: buildHermesCliPreview(args),
        response: parsed.response,
        session_id: parsed.sessionId,
        exit_code: hermesResult.exitCode,
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

  const resolveInput = buildResolveRequestInput(input);
  const routing = resolveRequestSurface(resolveInput, contracts);
  const boundary = explainDomainBoundary(resolveInput, contracts);
  const handoffPrompt = buildPromptHeader('chat', input, routing, boundary, contracts);
  const seedArgs = buildChatSeedArgs(input, handoffPrompt);
  const seedResult = runHermesCommand(seedArgs);

  if (seedResult.exitCode !== 0) {
    throw new GatewayContractError(
      'hermes_command_failed',
      'Hermes chat seeding failed inside OPL Product Entry.',
      {
        args: buildHermesCliPreview(seedArgs),
        stdout: seedResult.stdout,
        stderr: seedResult.stderr,
      },
      seedResult.exitCode,
    );
  }

  const parsed = parseHermesQuietChatOutput(seedResult.stdout);

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

  const resumeResult = runHermesCommand(['--resume', parsed.sessionId], {
    inheritStdio: true,
  });

  if (resumeResult.exitCode !== 0) {
    throw new GatewayContractError(
      'hermes_command_failed',
      'Hermes resume failed after OPL Product Entry seeded the session.',
      {
        session_id: parsed.sessionId,
      },
      resumeResult.exitCode,
    );
  }

  return {
    __handled: true as const,
  };
}
