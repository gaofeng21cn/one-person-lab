import {
  buildCodexCliPreview,
  resolveCodexBinary,
  runCodexCommand,
} from '../runway/index.ts';
import { inspectFamilyRuntimeProvider, resolveFamilyRuntimeProviderKind } from '../runway/index.ts';
import { isInteractiveShell } from '../../kernel/terminal.ts';
import { recordSessionLedgerEntry } from '../runway/index.ts';
import type { ContractValidationSummary } from '../../kernel/types.ts';
import {
  assertCodexSuccess,
  normalizeCodexOutput,
} from './product-entry-parts/output.ts';

export function buildProductEntryDoctor(validation: ContractValidationSummary) {
  const codex = resolveCodexBinary();
  const providerKind = resolveFamilyRuntimeProviderKind();
  const provider = inspectFamilyRuntimeProvider(providerKind);
  const localEntryReady = Boolean(codex);
  const onlineRuntimeReady = provider.ready;
  const ready = localEntryReady && onlineRuntimeReady;

  return {
    version: 'g2',
    validation,
    product_entry: {
      entry_surface: 'opl_local_product_entry_shell',
      runtime_substrate: 'codex_default_executor_with_provider_backed_family_runtime',
      ready,
      local_entry_ready: localEntryReady,
      online_runtime_ready: onlineRuntimeReady,
      configured_provider: providerKind,
      family_runtime_provider_ready: provider.ready,
      family_runtime_provider: provider,
      issues: provider.degraded_reason ? [provider.degraded_reason] : [],
      notes: [
        'Codex-default local entry is provided through `opl`, `opl exec`, and `opl resume`.',
        'Use `opl connect sync-skills` to register the family domain skill packs before default Codex sessions.',
        'Full OPL readiness uses the configured family runtime provider; non-default executors are explicit stage/request selections with independent receipts.',
      ],
    },
  };
}

export function runProductEntryResume(
  sessionId: string,
) {
  const codexArgs = ['resume', sessionId];
  if (isInteractiveShell()) {
    const resumeResult = runCodexCommand(codexArgs, {
      inheritStdio: true,
    });

    assertCodexSuccess(
      resumeResult.exitCode,
      'Codex resume failed inside OPL Product Entry.',
      {
        session_id: sessionId,
      },
    );

    return {
      __handled: true as const,
    };
  }

  const resumeResult = runCodexCommand(codexArgs);
  assertCodexSuccess(
    resumeResult.exitCode,
    'Codex resume failed inside OPL Product Entry.',
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
      executor_backend: 'codex',
      resume: {
        command_preview: ['codex', ...codexArgs],
        session_id: sessionId,
        output: normalizeCodexOutput(resumeResult.stdout, resumeResult.stderr),
        exit_code: resumeResult.exitCode,
      },
    },
  };
}
