import {
  buildCodexCliPreview,
  resolveCodexBinary,
  runCodexCommand,
} from './codex.ts';
import { inspectFamilyRuntimeProvider, resolveFamilyRuntimeProviderKind } from './family-runtime-providers.ts';
import {
  buildHermesCliPreview,
  buildHermesLogsArgs,
  buildHermesSessionsListArgs,
  type HermesLogsOptions,
  type HermesSessionsListOptions,
  inspectHermesRuntime,
  isInteractiveShell,
  parseHermesSessionsTable,
  runHermesLogs,
  runHermesSessionsList,
} from './hermes.ts';
import { recordSessionLedgerEntry } from './session-ledger.ts';
import type { ContractValidationSummary } from './types.ts';
import {
  assertCodexSuccess,
  assertHermesSuccess,
  normalizeCodexOutput,
  normalizeHermesOutput,
} from './product-entry-parts/output.ts';

export function buildProductEntryDoctor(validation: ContractValidationSummary) {
  const codex = resolveCodexBinary();
  const providerKind = resolveFamilyRuntimeProviderKind();
  const provider = inspectFamilyRuntimeProvider(providerKind);
  const hermes = inspectHermesRuntime();
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
      messaging_gateway_ready: providerKind === 'hermes_legacy' ? hermes.gateway_service.loaded : provider.ready,
      family_runtime_provider: provider,
      hermes,
      issues: provider.degraded_reason ? [provider.degraded_reason, ...hermes.issues] : hermes.issues,
      notes: [
        'Codex-default local entry is provided through `opl`, `opl exec`, and `opl resume`.',
        'Use `opl skill sync` to register the family domain skill packs before default Codex sessions.',
        'Full OPL readiness uses the configured family runtime provider; Hermes is now the hermes_legacy provider or an explicit executor route.',
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
