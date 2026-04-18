import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import {
  buildCodexCliPreview,
  buildCodexExecArgs,
  extractCodexRecentOutput,
  parseCodexExecOutput,
  resolveCodexBinary,
} from './codex.ts';
import { GatewayContractError } from './contracts.ts';
import { readFrontDeskRuntimeModes } from './frontdesk-runtime-modes.ts';
import { ensureFrontDeskStateDir, resolveFrontDeskStatePaths } from './frontdesk-state.ts';
import {
  buildHermesCliPreview,
  parseHermesQuietChatOutput,
  resolveHermesBinary,
} from './hermes.ts';
import {
  prepareProductEntryAsk,
  type PreparedProductEntryAsk,
  type ProductEntryCliInput,
  type ProductEntryExecutor,
} from './product-entry.ts';
import type { GatewayContracts } from './types.ts';

type FrontDeskTaskStatus = 'accepted' | 'running' | 'succeeded' | 'failed';

type FrontDeskTaskRecord = {
  version: 'g1';
  task_id: string;
  mode: 'ask';
  executor_backend: ProductEntryExecutor;
  status: FrontDeskTaskStatus;
  stage: string;
  summary: string;
  created_at: string;
  updated_at: string;
  goal: string;
  workspace_path: string | null;
  session_id: string | null;
  pid: number | null;
  exit_code: number | null;
  command_preview: string[];
  log_file: string;
  recent_output: string;
  routing_status: string;
  domain_id: string | null;
  workstream_id: string | null;
};

function buildContractsContext(contracts: GatewayContracts) {
  return {
    contracts_dir: contracts.contractsDir,
    contracts_root_source: contracts.contractsRootSource,
  };
}

function ensureTaskStateDir() {
  const paths = ensureFrontDeskStateDir(resolveFrontDeskStatePaths());
  fs.mkdirSync(paths.task_state_dir, { recursive: true });
  return paths;
}

function buildTaskId() {
  return `task_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function resolveTaskFiles(taskId: string) {
  const paths = ensureTaskStateDir();
  return {
    taskFile: path.join(paths.task_state_dir, `${taskId}.json`),
    logFile: path.join(paths.task_state_dir, `${taskId}.log`),
  };
}

function writeTaskRecord(record: FrontDeskTaskRecord) {
  const { taskFile } = resolveTaskFiles(record.task_id);
  fs.writeFileSync(taskFile, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
}

function readTaskRecord(taskId: string) {
  const { taskFile } = resolveTaskFiles(taskId);
  if (!fs.existsSync(taskFile)) {
    return null;
  }

  return JSON.parse(fs.readFileSync(taskFile, 'utf8')) as FrontDeskTaskRecord;
}

function tailLines(filePath: string, lines: number) {
  if (!fs.existsSync(filePath)) {
    return '';
  }

  return fs.readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0)
    .filter((line) => !/^session_id:\s*\S+/i.test(line))
    .filter((line) => !/^[╭╰]/.test(line))
    .slice(-lines)
    .join('\n');
}

function updateTaskRecord(taskId: string, updater: (current: FrontDeskTaskRecord) => FrontDeskTaskRecord) {
  const current = readTaskRecord(taskId);
  if (!current) {
    return null;
  }

  const next = updater(current);
  next.updated_at = new Date().toISOString();
  writeTaskRecord(next);
  return next;
}

function extractRecentOutput(output: string) {
  return output
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0)
    .filter((line) => !/^session_id:\s*\S+/i.test(line))
    .filter((line) => !/^[╭╰]/.test(line))
    .slice(-6)
    .join('\n');
}

function resolveFrontDeskAskExecutor(input: ProductEntryCliInput): ProductEntryExecutor {
  return input.executor ?? readFrontDeskRuntimeModes().interaction_mode;
}

function buildTaskExecution(
  input: ProductEntryCliInput,
  preparedAsk: PreparedProductEntryAsk,
  executorBackend: ProductEntryExecutor,
) {
  if (executorBackend === 'codex') {
    const codexBinary = resolveCodexBinary();
    if (!codexBinary) {
      throw new GatewayContractError(
        'surface_not_found',
        'Codex binary is required for Codex-backed frontdesk execution.',
        {
          env_var: 'OPL_CODEX_BIN',
        },
      );
    }

    const args = buildCodexExecArgs(preparedAsk.handoffPrompt, {
      cwd: input.workspacePath,
      json: true,
      model: input.model,
      provider: input.provider,
    });

    return {
      command: codexBinary.path,
      args,
      preview: buildCodexCliPreview(args),
    };
  }

  const hermesBinary = resolveHermesBinary();
  if (!hermesBinary) {
    throw new GatewayContractError(
      'hermes_binary_not_found',
      'Hermes binary is required for Hermes-backed frontdesk execution.',
      {
        env_var: 'OPL_HERMES_BIN',
      },
    );
  }

  return {
    command: hermesBinary.path,
    args: preparedAsk.args,
    preview: buildHermesCliPreview(preparedAsk.args),
  };
}

function buildTaskRunningSummary(executorBackend: ProductEntryExecutor) {
  return executorBackend === 'codex'
    ? '后台执行已启动，Codex 正在接管这个请求。'
    : '后台执行已启动，Hermes 正在处理这个请求。';
}

function buildTaskRecentOutput(logFile: string, executorBackend: ProductEntryExecutor, lines = 20) {
  if (!fs.existsSync(logFile)) {
    return '';
  }

  const rawOutput = fs.readFileSync(logFile, 'utf8');
  const recentOutput = buildTaskHumanOutput(rawOutput, executorBackend);
  if (!recentOutput) {
    return tailLines(logFile, lines);
  }

  return recentOutput
    .split(/\r?\n/)
    .slice(-lines)
    .join('\n');
}

function buildTaskHumanOutput(output: string, executorBackend: ProductEntryExecutor) {
  if (executorBackend === 'codex') {
    return extractCodexRecentOutput(output, 20);
  }

  return extractRecentOutput(output);
}

function extractTaskCompletionPayload(output: string, executorBackend: ProductEntryExecutor) {
  if (executorBackend === 'codex') {
    const parsed = parseCodexExecOutput(output);
    return {
      sessionId: parsed.threadId,
      response: parsed.finalMessage || buildTaskHumanOutput(output, executorBackend),
    };
  }

  try {
    const parsed = parseHermesQuietChatOutput(output);
    return {
      sessionId: parsed.sessionId,
      response: parsed.response || buildTaskHumanOutput(output, executorBackend),
    };
  } catch {
    return {
      sessionId: null,
      response: buildTaskHumanOutput(output, executorBackend),
    };
  }
}

export function submitFrontDeskAskTask(
  input: ProductEntryCliInput,
  contracts: GatewayContracts,
) {
  const preparedAsk = prepareProductEntryAsk(input, contracts);
  const executorBackend = resolveFrontDeskAskExecutor(input);
  const taskExecution = buildTaskExecution(input, preparedAsk, executorBackend);
  const taskId = buildTaskId();
  const now = new Date().toISOString();
  const { logFile } = resolveTaskFiles(taskId);
  fs.writeFileSync(logFile, '', 'utf8');

  const initialTask: FrontDeskTaskRecord = {
    version: 'g1',
    task_id: taskId,
    mode: 'ask',
    executor_backend: executorBackend,
    status: 'accepted',
    stage: 'queued',
    summary: `请求已受理，准备提交给 ${executorBackend === 'codex' ? 'Codex' : 'Hermes'}。`,
    created_at: now,
    updated_at: now,
    goal: input.goal,
    workspace_path: input.workspacePath ?? null,
    session_id: null,
    pid: null,
    exit_code: null,
    command_preview: taskExecution.preview,
    log_file: logFile,
    recent_output: '',
    routing_status: preparedAsk.routing.status,
    domain_id: 'domain_id' in preparedAsk.routing ? preparedAsk.routing.domain_id : null,
    workstream_id: 'workstream_id' in preparedAsk.routing ? preparedAsk.routing.workstream_id : null,
  };
  writeTaskRecord(initialTask);

  const child = spawn(taskExecution.command, taskExecution.args, {
    cwd: input.workspacePath ?? process.cwd(),
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  updateTaskRecord(taskId, (current) => ({
    ...current,
    status: 'running',
    stage: 'running',
    summary: buildTaskRunningSummary(executorBackend),
    pid: child.pid ?? null,
  }));

  const appendOutput = (chunk: Buffer | string) => {
    const text = chunk.toString();
    fs.appendFileSync(logFile, text, 'utf8');
    updateTaskRecord(taskId, (current) => {
      const recentOutput = buildTaskRecentOutput(logFile, executorBackend, 8);
      const latestLine = recentOutput.split(/\r?\n/).filter(Boolean).at(-1) ?? current.summary;
      return {
        ...current,
        recent_output: recentOutput,
        summary: latestLine,
      };
    });
  };

  child.stdout?.on('data', appendOutput);
  child.stderr?.on('data', appendOutput);

  child.once('error', (error) => {
    updateTaskRecord(taskId, (current) => ({
      ...current,
      status: 'failed',
      stage: 'failed',
      summary: `后台执行启动失败：${error.message}`,
      exit_code: 1,
    }));
  });

  child.once('close', (code) => {
    const rawOutput = fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8') : '';
    const completion = extractTaskCompletionPayload(rawOutput, executorBackend);
    updateTaskRecord(taskId, (current) => ({
      ...current,
      status: code === 0 ? 'succeeded' : 'failed',
      stage: code === 0 ? 'completed' : 'failed',
      summary:
        code === 0
          ? completion.sessionId
            ? `${executorBackend === 'codex' ? 'Codex' : 'Hermes'} 已完成本轮执行，并已记录会话。`
            : `${executorBackend === 'codex' ? 'Codex' : 'Hermes'} 已完成本轮执行。`
          : '后台执行失败，请查看最近输出。',
      session_id: completion.sessionId ?? current.session_id,
      exit_code: code ?? 1,
      recent_output: completion.response || buildTaskRecentOutput(logFile, executorBackend, 20),
    }));
  });

  return {
    version: 'g2',
    contracts_context: buildContractsContext(contracts),
    product_entry: {
      entry_surface: 'opl_local_web_frontdesk_pilot',
      mode: 'ask',
      dry_run: false,
      execution_mode: 'async_accept',
      executor_backend: executorBackend,
      input: preparedAsk.resolveInput,
      routing: preparedAsk.routing,
      boundary: preparedAsk.boundary,
      ...preparedAsk.handoffBundle,
      handoff_prompt_preview: preparedAsk.handoffPrompt,
      task: {
        task_id: taskId,
        status: 'accepted',
        stage: 'queued',
        summary: initialTask.summary,
        session_id: null,
        executor_backend: executorBackend,
      },
    },
  };
}

export function readFrontDeskTaskStatus(taskId: string, lines = 20) {
  const task = readTaskRecord(taskId);
  if (!task) {
    throw new GatewayContractError(
      'cli_usage_error',
      'Requested frontdesk task does not exist.',
      {
        task_id: taskId,
      },
      2,
    );
  }

  return {
    version: 'g2',
    product_entry: {
      mode: 'task_status',
      task: {
        task_id: task.task_id,
        status: task.status,
        stage: task.stage,
        summary: task.summary,
        executor_backend: task.executor_backend,
        session_id: task.session_id,
        recent_output: buildTaskRecentOutput(task.log_file, task.executor_backend, lines),
        exit_code: task.exit_code,
        created_at: task.created_at,
        updated_at: task.updated_at,
      },
    },
  };
}
