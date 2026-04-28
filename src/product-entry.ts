import type { GatewayContracts } from './types.ts';
import {
  buildCodexCliPreview,
  buildCodexExecArgs,
  parseCodexExecOutput,
  runCodexCommand,
} from './codex.ts';
import {
  buildHermesCliPreview,
  isInteractiveShell,
  parseHermesQuietChatOutput,
  runHermesCommand,
  runHermesResume,
} from './hermes.ts';
import { explainDomainBoundary, resolveRequestSurface } from './resolver.ts';
import { recordSessionLedgerEntry } from './session-ledger.ts';
import type {
  ProductEntryCliInput,
  ProductEntryExecInput,
  ProductEntryExecutor,
  ProductEntryMode,
  PreparedProductEntryAsk,
} from './product-entry-parts/types.ts';
import {
  buildAskArgs,
  buildChatSeedArgs,
  buildContractsContext,
  buildProductEntryFrontdoorPrompt,
  buildProductEntryHandoffBundle,
  buildPromptHeader,
  buildResolveRequestInput,
  resolveProductEntryExecutor,
} from './product-entry-parts/builders.ts';
import {
  assertCodexSuccess,
  assertHermesSuccess,
  normalizeCodexOutput,
  normalizeHermesOutput,
} from './product-entry-parts/output.ts';

export type {
  ProductEntryCliInput,
  ProductEntryExecInput,
  ProductEntryExecutor,
  ProductEntryMode,
  PreparedProductEntryAsk,
};
export { buildProductEntryHandoffEnvelope } from './product-entry-handoff-envelope.ts';
export {
  buildProductEntryDoctor,
  runProductEntryLogs,
  runProductEntryRepairHermesGateway,
  runProductEntryResume,
  runProductEntrySessions,
} from './product-entry-runtime.ts';

export function prepareProductEntryAsk(
  input: ProductEntryCliInput,
  contracts: GatewayContracts,
): PreparedProductEntryAsk {
  const resolveInput = buildResolveRequestInput(input);
  const routing = resolveRequestSurface(resolveInput, contracts);
  const boundary = explainDomainBoundary(resolveInput, contracts);
  const handoffPrompt = buildPromptHeader('ask', input, routing, boundary, contracts);
  const args = buildAskArgs(input, handoffPrompt);
  const handoffBundle = buildProductEntryHandoffBundle(
    contracts,
    'ask',
    input,
    routing,
    boundary,
  );

  return {
    resolveInput,
    routing,
    boundary,
    handoffPrompt,
    args,
    handoffBundle,
  };
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
  const handoffBundle = buildProductEntryHandoffBundle(
    contracts,
    mode,
    input,
    routing,
    boundary,
  );

  if (mode === 'ask') {
    const executor = resolveProductEntryExecutor(input);
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

  const executor = resolveProductEntryExecutor(input);
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
              command_preview: ['codex'],
              resume_command_preview: ['codex', 'resume', '<thread_id>'],
              one_shot_command_preview: buildCodexCliPreview(buildCodexExecArgs(handoffPrompt, {
                cwd: input.workspacePath,
                json: true,
                model: input.model,
                provider: input.provider,
              })),
            },
          }
        : {
            hermes: {
              seed_command_preview: buildHermesCliPreview(buildChatSeedArgs(input, handoffPrompt)),
              resume_command_preview: ['hermes', '--resume', '<session_id>'],
            },
          }),
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
  const executor = resolveProductEntryExecutor(input);

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
    const handoffBundle = buildProductEntryHandoffBundle(
      contracts,
      'ask',
      input,
      preparedAsk.routing,
      preparedAsk.boundary,
      parsed.threadId ?? undefined,
    );

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
  const handoffBundle = buildProductEntryHandoffBundle(
    contracts,
    'ask',
    input,
    preparedAsk.routing,
    preparedAsk.boundary,
    parsed.sessionId,
  );
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

export function runProductEntryExec(input: ProductEntryExecInput) {
  const json = input.json ?? true;
  const codexArgs = buildCodexExecArgs(input.prompt, {
    cwd: input.workspacePath,
    json,
    model: input.model,
    provider: input.provider,
  });

  if (input.dryRun) {
    return {
      version: 'g2',
      product_entry: {
        entry_surface: 'opl_local_product_entry_shell',
        mode: 'exec',
        dry_run: true,
        executor_backend: 'codex',
        input: {
          prompt: input.prompt,
          workspace_path: input.workspacePath ?? null,
          model: input.model ?? null,
          provider: input.provider ?? null,
        },
        codex: {
          command_preview: buildCodexCliPreview(codexArgs),
        },
      },
    };
  }

  const codexResult = runCodexCommand(codexArgs);
  assertCodexSuccess(
    codexResult.exitCode,
    'Codex exec command failed inside OPL Product Entry.',
    {
      args: buildCodexCliPreview(codexArgs),
      stdout: codexResult.stdout,
      stderr: codexResult.stderr,
    },
  );

  const parsed = json ? parseCodexExecOutput(codexResult.stdout) : null;
  return {
    version: 'g2',
    product_entry: {
      entry_surface: 'opl_local_product_entry_shell',
      mode: 'exec',
      dry_run: false,
      executor_backend: 'codex',
      input: {
        prompt: input.prompt,
        workspace_path: input.workspacePath ?? null,
        model: input.model ?? null,
        provider: input.provider ?? null,
      },
      codex: {
        command_preview: buildCodexCliPreview(codexArgs),
        session_id: parsed?.threadId ?? null,
        response: parsed?.finalMessage ?? '',
        raw_output: normalizeCodexOutput(codexResult.stdout, codexResult.stderr),
        exit_code: codexResult.exitCode,
      },
    },
  };
}

export function runProductEntryFrontdoor(
  contracts: GatewayContracts,
) {
  if (isInteractiveShell()) {
    const frontDoorResult = runCodexCommand([], {
      inheritStdio: true,
    });

    assertCodexSuccess(
      frontDoorResult.exitCode,
      'Codex frontdoor failed inside OPL Product Entry.',
      {},
    );

    return {
      __handled: true as const,
    };
  }

  return {
    version: 'g2',
    contracts_context: buildContractsContext(contracts),
    product_entry: {
      entry_surface: 'opl_local_product_entry_shell',
      mode: 'frontdoor',
      interactive: false,
      executor_backend: 'codex',
      handoff_prompt_preview: buildProductEntryFrontdoorPrompt(contracts),
      codex: {
        command_preview: ['codex'],
        resume_command_preview: ['codex', 'resume', '<thread_id>'],
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

  const executor = resolveProductEntryExecutor(input);
  const resolveInput = buildResolveRequestInput(input);
  const routing = resolveRequestSurface(resolveInput, contracts);
  const boundary = explainDomainBoundary(resolveInput, contracts);
  const handoffPrompt = buildPromptHeader('chat', input, routing, boundary, contracts);

  if (executor === 'codex') {
    const handoffBundle = buildProductEntryHandoffBundle(
      contracts,
      'chat',
      input,
      routing,
      boundary,
    );

    if (isInteractiveShell()) {
      const frontDoorResult = runCodexCommand([handoffPrompt], {
        inheritStdio: true,
      });
      assertCodexSuccess(
        frontDoorResult.exitCode,
        'Codex frontdoor failed after OPL Product Entry chat routing.',
        {
          routing_status: routing.status,
        },
      );

      return {
        __handled: true as const,
      };
    }

    return {
      version: 'g2',
      contracts_context: buildContractsContext(contracts),
      product_entry: {
        entry_surface: 'opl_local_product_entry_shell',
        mode: 'chat',
        dry_run: false,
        interactive: false,
        executor_backend: 'codex',
        input: resolveInput,
        routing,
        boundary,
        ...handoffBundle,
        handoff_prompt_preview: handoffPrompt,
        codex: {
          command_preview: ['codex'],
          resume_command_preview: ['codex', 'resume', '<thread_id>'],
          one_shot_command_preview: buildCodexCliPreview(buildCodexExecArgs(handoffPrompt, {
            cwd: input.workspacePath,
            json: true,
            model: input.model,
            provider: input.provider,
          })),
        },
      },
    };
  }

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
  const handoffBundle = buildProductEntryHandoffBundle(
    contracts,
    'chat',
    input,
    routing,
    boundary,
    parsed.sessionId,
  );
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
      executor_backend: 'hermes',
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
