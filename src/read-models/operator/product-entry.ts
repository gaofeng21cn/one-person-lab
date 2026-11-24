import type { ContractValidationSummary, FrameworkContracts } from '../../kernel/types.ts';
import type {
  BoundaryExplanation,
  DomainAgentSelectionInput,
  ResolutionResult,
} from '../../kernel/types.ts';
import {
  buildCodexCliPreview,
  buildCodexExecArgs,
  inspectFamilyRuntimeProvider,
  parseCodexExecOutput,
  recordSessionLedgerEntry,
  resolveCodexBinary,
  resolveFamilyRuntimeProviderKind,
  runCodexCommand,
} from '../../adapters/execution/index.ts';
import type { CordisAgentExecutorService } from '../../adapters/execution/index.ts';
import { findDomainOrThrow } from '../../authority/contracts/index.ts';
import type { CordisWorkspaceLocatorService } from '../../authority/workspace/index.ts';
import { FrameworkContractError } from '../../kernel/contract-validation.ts';
import { isInteractiveShell } from '../../kernel/terminal.ts';
import { explainDomainBoundary, selectDomainAgentEntry, type CordisAtlasCatalogService } from '../catalog/index.ts';
import {
  buildProductEntryHandoffBundleView,
  type ProductEntryHandoffBundleResult,
} from './product-entry-handoff-bundle.ts';

export type ProductEntryMode =
  | 'product_entry'
  | 'ask'
  | 'exec'
  | 'chat'
  | 'session_seed'
  | 'resume'
  | 'sessions'
  | 'logs';

export type ProductEntryCliInput = {
  dryRun: boolean;
  goal: string;
  intent: string;
  target: string;
  preferredFamily?: string;
  requestKind?: string;
  model?: string;
  provider?: string;
  reasoningEffort?: string;
  workspacePath?: string;
  skills: string[];
};

export type ProductEntryExecInput = {
  dryRun: boolean;
  prompt: string;
  executorKind?: string;
  model?: string;
  provider?: string;
  reasoningEffort?: string;
  workspacePath?: string;
  json?: boolean;
};

export type PreparedProductEntryAsk = {
  selectionInput: DomainAgentSelectionInput;
  stageSelection: ResolutionResult;
  boundary: BoundaryExplanation;
  handoffPrompt: string;
  args: string[];
  handoffBundle: ProductEntryHandoffBundleResult;
};

function normalizeCodexOutput(stdout: string, stderr = '') {
  return [stdout, stderr].filter((chunk) => chunk.trim().length > 0).join('\n').trim();
}

function assertCodexSuccess(exitCode: number, message: string, details: Record<string, unknown>) {
  if (exitCode === 0) return;
  throw new FrameworkContractError('codex_command_failed', message, details, exitCode);
}

export function buildDomainAgentSelectionInput(input: ProductEntryCliInput): DomainAgentSelectionInput {
  return {
    intent: input.intent,
    target: input.target,
    goal: input.goal,
    preferredFamily: input.preferredFamily,
    requestKind: input.requestKind,
  };
}

export function buildContractsContext(contracts: FrameworkContracts) {
  return {
    contracts_dir: contracts.contractsDir,
    contracts_root_source: contracts.contractsRootSource,
  };
}

export function buildProductEntrySessionPrompt(contracts: FrameworkContracts) {
  const domainLines = contracts.domains.domains.map((domain) =>
    `- ${domain.domain_id}: ${domain.independent_domain_agent.agent_id} app skill ${domain.single_app_skill.skill_id} -> workstreams: ${domain.owned_workstreams.join(', ')}`);
  const workstreamLines = contracts.workstreams.workstreams.map((workstream) =>
    `- ${workstream.workstream_id}: ${workstream.label} -> primary families: ${workstream.primary_families.join(', ')}`);

  return [
    'You are the One Person Lab (OPL) Product Entry.',
    'Your role is to be the default natural-language entry for OPL and select stage entries to the correct domain or family boundary.',
    '',
    'Current admitted domains:',
    ...domainLines,
    '',
    'Current admitted workstreams:',
    ...workstreamLines,
    '',
    'Hard boundary rules:',
    '- OPL is a stage-led, Agent executor-based family framework shell. It is not the runtime truth owner of any domain.',
    '- Keep work inside admitted domain boundaries and family boundaries. Do not invent admission or hosted readiness.',
    '- Codex CLI is the default concrete executor for this product-entry session.',
    '',
    'Task:',
    '- Greet briefly and keep momentum.',
    '- Clarify only when required.',
    '- If the task maps to an admitted domain or family, continue with that boundary explicitly.',
    '- If it does not, explain the boundary honestly and help the user refine the request.',
  ].join('\n');
}

export function buildProductEntryHandoffBundle(
  contracts: FrameworkContracts,
  mode: ProductEntryMode,
  input: ProductEntryCliInput,
  stageSelection: ResolutionResult,
  boundary: BoundaryExplanation,
  workspaceLocator: CordisWorkspaceLocatorService,
  atlas?: CordisAtlasCatalogService,
  sessionId?: string,
) {
  return buildProductEntryHandoffBundleView(contracts, {
    mode,
    goal: input.goal,
    intent: input.intent,
    workspacePath: input.workspacePath,
    stageSelection,
    boundary,
    workspaceLocator,
    atlas,
    sessionId,
  });
}

export function buildProductEntryHandoffEnvelope(
  input: ProductEntryCliInput,
  contracts: FrameworkContracts,
  workspaceLocator: CordisWorkspaceLocatorService,
  atlas?: CordisAtlasCatalogService,
) {
  const selectionInput = buildDomainAgentSelectionInput(input);
  const stageSelection = selectDomainAgentEntry(selectionInput, contracts);
  const boundary = explainDomainBoundary(selectionInput, contracts);

  return {
    version: 'g2',
    contracts_context: buildContractsContext(contracts),
    ...buildProductEntryHandoffBundle(
      contracts,
      'ask',
      input,
      stageSelection,
      boundary,
      workspaceLocator,
      atlas,
    ),
  };
}

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

export function runProductEntryResume(sessionId: string) {
  const codexArgs = ['resume', sessionId];
  if (isInteractiveShell()) {
    const resumeResult = runCodexCommand(codexArgs, { inheritStdio: true });
    assertCodexSuccess(resumeResult.exitCode, 'Codex resume failed inside OPL Product Entry.', { session_id: sessionId });
    return { __handled: true as const };
  }

  const resumeResult = runCodexCommand(codexArgs);
  assertCodexSuccess(resumeResult.exitCode, 'Codex resume failed inside OPL Product Entry.', {
    session_id: sessionId,
    stdout: resumeResult.stdout,
    stderr: resumeResult.stderr,
  });
  recordSessionLedgerEntry({ sessionId, mode: 'resume', sourceSurface: 'opl_local_product_entry_shell' });

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

export async function runProductEntryExec(
  input: ProductEntryExecInput,
  agentExecutor: CordisAgentExecutorService,
) {
  const json = input.json ?? true;
  const codexArgs = buildCodexExecArgs(input.prompt, {
    cwd: input.workspacePath,
    json,
    model: input.model,
    provider: input.provider,
    reasoningEffort: input.reasoningEffort,
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
          reasoning_effort: input.reasoningEffort ?? null,
        },
        codex: {
          command_preview: buildCodexCliPreview(codexArgs),
        },
      },
    };
  }

  const receipt = await agentExecutor.execute({
    executor_kind: input.executorKind,
    mode: 'structured_call',
    prompt: input.prompt,
    cwd: input.workspacePath,
    model: input.model,
    provider: input.provider,
    reasoning_effort: input.reasoningEffort,
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
        reasoning_effort: input.reasoningEffort ?? null,
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
