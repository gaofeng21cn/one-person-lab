import {
  buildCodexCliPreview,
  resolveCodexBinary,
  runCodexCommand,
} from './codex.ts';
import {
  buildHermesCliPreview,
  buildHermesLogsArgs,
  buildHermesSessionsListArgs,
  type HermesLogsOptions,
  type HermesSessionsListOptions,
  inspectHermesRuntime,
  isInteractiveShell,
  parseHermesSessionsTable,
  repairHermesGateway,
  runHermesLogs,
  runHermesResume,
  runHermesSessionsList,
} from './hermes.ts';
import { recordSessionLedgerEntry } from './session-ledger.ts';
import type { ContractValidationSummary } from './types.ts';
import type { ProductEntryExecutor } from './product-entry-parts/types.ts';
import {
  assertCodexSuccess,
  assertHermesSuccess,
  normalizeCodexOutput,
  normalizeHermesOutput,
} from './product-entry-parts/output.ts';

export function buildProductEntryDoctor(validation: ContractValidationSummary) {
  const codex = resolveCodexBinary();
  const hermes = inspectHermesRuntime();
  const localEntryReady = Boolean(codex);
  const ready = localEntryReady;

  return {
    version: 'g2',
    validation,
    product_entry: {
      entry_surface: 'opl_local_product_entry_shell',
      runtime_substrate: 'codex_default_runtime',
      ready,
      local_entry_ready: localEntryReady,
      messaging_gateway_ready: hermes.gateway_service.loaded,
      hermes,
      issues: hermes.issues,
      notes: [
        'Codex-default local entry is provided through `opl`, `opl exec`, and `opl resume`.',
        'Use `opl skill sync` to register the family domain skill packs before default Codex sessions.',
        'Hermes remains an explicit opt-in runtime via `--executor hermes`; its gateway only affects Hermes-backed lanes.',
      ],
    },
  };
}

export function runProductEntryResume(
  sessionId: string,
  executor: ProductEntryExecutor = 'codex',
) {
  if (executor === 'codex') {
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
      executor_backend: 'hermes',
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
