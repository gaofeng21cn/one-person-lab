import type { FrameworkContracts } from './types.ts';
import {
  buildCodexCliPreview,
  buildCodexExecArgs,
  parseCodexExecOutput,
  runCodexCommand,
} from './codex.ts';
import { isInteractiveShell } from './hermes.ts';
import { explainDomainBoundary, selectDomainAgentEntry } from './resolver.ts';
import { recordSessionLedgerEntry } from './session-ledger.ts';
import type {
  ProductEntryCliInput,
  ProductEntryExecInput,
  ProductEntryMode,
  PreparedProductEntryAsk,
} from './product-entry-parts/types.ts';
import {
  buildContractsContext,
  buildProductEntrySessionPrompt,
  buildProductEntryHandoffBundle,
  buildPromptHeader,
  buildDomainAgentSelectionInput,
} from './product-entry-parts/builders.ts';
import {
  assertCodexSuccess,
  normalizeCodexOutput,
} from './product-entry-parts/output.ts';

export type {
  ProductEntryCliInput,
  ProductEntryExecInput,
  ProductEntryMode,
  PreparedProductEntryAsk,
};
export { buildProductEntryHandoffEnvelope } from './product-entry-handoff-envelope.ts';
export {
  buildProductEntryDoctor,
  runProductEntryLogs,
  runProductEntryResume,
  runProductEntrySessions,
} from './product-entry-runtime.ts';

export function prepareProductEntryAsk(
  input: ProductEntryCliInput,
  contracts: FrameworkContracts,
): PreparedProductEntryAsk {
  const selectionInput = buildDomainAgentSelectionInput(input);
  const stageSelection = selectDomainAgentEntry(selectionInput, contracts);
  const boundary = explainDomainBoundary(selectionInput, contracts);
  const handoffPrompt = buildPromptHeader('ask', input, stageSelection, boundary, contracts);
  const args = buildCodexExecArgs(handoffPrompt, {
    cwd: input.workspacePath,
    json: true,
    model: input.model,
    provider: input.provider,
  });
  const handoffBundle = buildProductEntryHandoffBundle(
    contracts,
    'ask',
    input,
    stageSelection,
    boundary,
  );

  return {
    selectionInput,
    stageSelection,
    boundary,
    handoffPrompt,
    args,
    handoffBundle,
  };
}

function buildPreviewPayload(
  mode: ProductEntryMode,
  input: ProductEntryCliInput,
  contracts: FrameworkContracts,
) {
  const selectionInput = buildDomainAgentSelectionInput(input);
  const stageSelection = selectDomainAgentEntry(selectionInput, contracts);
  const boundary = explainDomainBoundary(selectionInput, contracts);
  const handoffPrompt = buildPromptHeader(mode, input, stageSelection, boundary, contracts);
  const handoffBundle = buildProductEntryHandoffBundle(
    contracts,
    mode,
    input,
    stageSelection,
    boundary,
  );

  if (mode === 'ask') {
    return {
      version: 'g2',
      contracts_context: buildContractsContext(contracts),
      product_entry: {
        entry_surface: 'opl_local_product_entry_shell',
        mode,
        dry_run: true,
        executor_backend: 'codex',
        input: selectionInput,
        stage_selection: stageSelection,
        boundary,
        ...handoffBundle,
        handoff_prompt_preview: handoffPrompt,
        codex: {
          command_preview: buildCodexCliPreview(buildCodexExecArgs(handoffPrompt, {
            cwd: input.workspacePath,
            json: true,
            model: input.model,
            provider: input.provider,
          })),
        },
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
      executor_backend: 'codex',
      input: selectionInput,
      stage_selection: stageSelection,
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

export function runProductEntryAsk(
  input: ProductEntryCliInput,
  contracts: FrameworkContracts,
) {
  if (input.dryRun) {
    return buildPreviewPayload('ask', input, contracts);
  }

  const preparedAsk = prepareProductEntryAsk(input, contracts);
  const codexArgs = preparedAsk.args;
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
    preparedAsk.stageSelection,
    preparedAsk.boundary,
    parsed.threadId ?? undefined,
  );

  if (parsed.threadId) {
    recordSessionLedgerEntry({
      sessionId: parsed.threadId,
      mode: 'ask',
      sourceSurface: 'opl_local_product_entry_shell',
      domainId: 'domain_id' in preparedAsk.stageSelection ? preparedAsk.stageSelection.domain_id : null,
      workstreamId: 'workstream_id' in preparedAsk.stageSelection ? preparedAsk.stageSelection.workstream_id : null,
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
      input: preparedAsk.selectionInput,
      stage_selection: preparedAsk.stageSelection,
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

export function runProductEntrySession(
  contracts: FrameworkContracts,
) {
  if (isInteractiveShell()) {
    const productEntryResult = runCodexCommand([], {
      inheritStdio: true,
    });

    assertCodexSuccess(
      productEntryResult.exitCode,
      'Codex entry session failed inside OPL Product Entry.',
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
      mode: 'product_entry',
      interactive: false,
      executor_backend: 'codex',
      handoff_prompt_preview: buildProductEntrySessionPrompt(contracts),
      codex: {
        command_preview: ['codex'],
        resume_command_preview: ['codex', 'resume', '<thread_id>'],
      },
    },
  };
}

export function runProductEntryChat(
  input: ProductEntryCliInput,
  contracts: FrameworkContracts,
) {
  if (input.dryRun) {
    return buildPreviewPayload('chat', input, contracts);
  }

  const selectionInput = buildDomainAgentSelectionInput(input);
  const stageSelection = selectDomainAgentEntry(selectionInput, contracts);
  const boundary = explainDomainBoundary(selectionInput, contracts);
  const handoffPrompt = buildPromptHeader('chat', input, stageSelection, boundary, contracts);
  const handoffBundle = buildProductEntryHandoffBundle(
    contracts,
    'chat',
    input,
    stageSelection,
    boundary,
  );

  if (isInteractiveShell()) {
    const productEntryResult = runCodexCommand([handoffPrompt], {
      inheritStdio: true,
    });
    assertCodexSuccess(
      productEntryResult.exitCode,
      'Codex entry session failed after OPL Product Entry chat stage selection.',
      {
        stage_selection_status: stageSelection.status,
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
      input: selectionInput,
      stage_selection: stageSelection,
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
