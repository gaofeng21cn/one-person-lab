import type { FrameworkContracts } from './types.ts';
import {
  buildCodexCliPreview,
  buildCodexExecArgs,
  parseCodexExecOutput,
  runCodexCommand,
} from './codex.ts';
import { runAgentExecutor } from './agent-executor.ts';
import { isInteractiveShell } from './hermes.ts';
import type { ProductEntryExecInput } from './product-entry-parts/types.ts';
import {
  buildContractsContext,
  buildProductEntrySessionPrompt,
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
} from './product-entry-parts/types.ts';
export { buildProductEntryHandoffEnvelope } from './product-entry-handoff-envelope.ts';
export {
  buildProductEntryDoctor,
  runProductEntryLogs,
  runProductEntryResume,
  runProductEntrySessions,
} from './product-entry-runtime.ts';

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
        executor_backend: input.executorKind ?? 'codex_cli',
        input: {
          prompt: input.prompt,
          executor_kind: input.executorKind ?? 'codex_cli',
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

  const receipt = runAgentExecutor({
    executor_kind: input.executorKind,
    mode: 'structured_call',
    prompt: input.prompt,
    cwd: input.workspacePath,
    model: input.model,
    provider: input.provider,
    json,
  });
  if (receipt.executor_kind === 'codex_cli') {
    assertCodexSuccess(
      receipt.exit_code,
      'Codex exec command failed inside OPL Product Entry.',
      {
        args: receipt.proof?.command_preview ?? buildCodexCliPreview(codexArgs),
        stdout: receipt.stdout_preview,
        stderr: receipt.stderr_preview,
      },
    );
  }
  const parsed = receipt.executor_kind === 'codex_cli' && json
    ? parseCodexExecOutput(receipt.stdout_preview)
    : null;

  return {
    version: 'g2',
    product_entry: {
      entry_surface: 'opl_local_product_entry_shell',
      mode: 'exec',
      dry_run: false,
      executor_backend: receipt.executor_kind,
      input: {
        prompt: input.prompt,
        executor_kind: input.executorKind ?? 'codex_cli',
        workspace_path: input.workspacePath ?? null,
        model: input.model ?? null,
        provider: input.provider ?? null,
      },
      agent_execution_receipt: receipt,
      codex: {
        command_preview: Array.isArray(receipt.proof?.command_preview)
          ? receipt.proof.command_preview
          : buildCodexCliPreview(codexArgs),
        session_id: parsed?.threadId ?? receipt.session_id,
        response: parsed?.finalMessage ?? '',
        raw_output: normalizeCodexOutput(receipt.stdout_preview, receipt.stderr_preview),
        exit_code: receipt.exit_code,
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
