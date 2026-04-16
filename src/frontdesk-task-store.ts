import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { GatewayContractError } from './contracts.ts';
import { ensureFrontDeskStateDir, resolveFrontDeskStatePaths } from './frontdesk-state.ts';
import { prepareProductEntryAsk, type ProductEntryCliInput } from './product-entry.ts';
import type { GatewayContracts } from './types.ts';

type FrontDeskTaskStatus = 'accepted' | 'running' | 'succeeded' | 'failed';

type FrontDeskTaskRecord = {
  version: 'g1';
  task_id: string;
  mode: 'ask';
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

function resolveOplCliEntry() {
  const cliEntry = process.argv[1];
  if (!cliEntry) {
    throw new GatewayContractError(
      'cli_usage_error',
      'Unable to determine the active OPL CLI entrypoint for frontdesk task execution.',
    );
  }

  return cliEntry;
}

function buildOplAskExecution(input: ProductEntryCliInput, contracts: GatewayContracts) {
  const cliEntry = resolveOplCliEntry();
  const execArgs = [
    ...process.execArgv,
    cliEntry,
    '--contracts-dir',
    contracts.contractsDir,
    'ask',
    input.goal,
    '--intent',
    input.intent,
    '--target',
    input.target,
  ];
  const preview = [
    'opl',
    '--contracts-dir',
    contracts.contractsDir,
    'ask',
    input.goal,
    '--intent',
    input.intent,
    '--target',
    input.target,
  ];

  if (input.preferredFamily) {
    execArgs.push('--preferred-family', input.preferredFamily);
    preview.push('--preferred-family', input.preferredFamily);
  }

  if (input.requestKind) {
    execArgs.push('--request-kind', input.requestKind);
    preview.push('--request-kind', input.requestKind);
  }

  if (input.model) {
    execArgs.push('--model', input.model);
    preview.push('--model', input.model);
  }

  if (input.provider) {
    execArgs.push('--provider', input.provider);
    preview.push('--provider', input.provider);
  }

  if (input.workspacePath) {
    execArgs.push('--workspace-path', input.workspacePath);
    preview.push('--workspace-path', input.workspacePath);
  }

  if (input.skills.length > 0) {
    const joinedSkills = input.skills.join(',');
    execArgs.push('--skills', joinedSkills);
    preview.push('--skills', joinedSkills);
  }

  return {
    execArgs,
    preview,
  };
}

function extractCliAskPayload(output: string) {
  try {
    const parsed = JSON.parse(output) as {
      product_entry?: {
        hermes?: {
          response?: string;
          session_id?: string | null;
        };
      };
    };
    return {
      response: parsed.product_entry?.hermes?.response ?? '',
      sessionId: parsed.product_entry?.hermes?.session_id ?? null,
    };
  } catch {
    return {
      response: '',
      sessionId: null,
    };
  }
}

export function submitFrontDeskAskTask(
  input: ProductEntryCliInput,
  contracts: GatewayContracts,
) {
  const preparedAsk = prepareProductEntryAsk(input, contracts);
  const cliExecution = buildOplAskExecution(input, contracts);
  const taskId = buildTaskId();
  const now = new Date().toISOString();
  const { logFile } = resolveTaskFiles(taskId);
  fs.writeFileSync(logFile, '', 'utf8');

  const initialTask: FrontDeskTaskRecord = {
    version: 'g1',
    task_id: taskId,
    mode: 'ask',
    status: 'accepted',
    stage: 'queued',
    summary: '请求已受理，正在提交到后台执行。',
    created_at: now,
    updated_at: now,
    goal: input.goal,
    workspace_path: input.workspacePath ?? null,
    session_id: null,
    pid: null,
    exit_code: null,
    command_preview: cliExecution.preview,
    log_file: logFile,
    recent_output: '',
    routing_status: preparedAsk.routing.status,
    domain_id: 'domain_id' in preparedAsk.routing ? preparedAsk.routing.domain_id : null,
    workstream_id: 'workstream_id' in preparedAsk.routing ? preparedAsk.routing.workstream_id : null,
  };
  writeTaskRecord(initialTask);

  const child = spawn(process.execPath, cliExecution.execArgs, {
    cwd: input.workspacePath ?? process.cwd(),
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  updateTaskRecord(taskId, (current) => ({
    ...current,
    status: 'running',
    stage: 'running',
    summary: '后台执行已启动，正在通过 OPL ask 统一入口处理请求。',
    pid: child.pid ?? null,
  }));

  const appendOutput = (chunk: Buffer | string) => {
    const text = chunk.toString();
    fs.appendFileSync(logFile, text, 'utf8');
    updateTaskRecord(taskId, (current) => {
      const recentOutput = extractRecentOutput(`${current.recent_output}\n${text}`);
      return {
        ...current,
        recent_output: recentOutput,
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
    const cliAskPayload = extractCliAskPayload(rawOutput);
    updateTaskRecord(taskId, (current) => ({
      ...current,
      status: code === 0 ? 'succeeded' : 'failed',
      stage: code === 0 ? 'completed' : 'failed',
      summary:
        code === 0
          ? cliAskPayload.sessionId
            ? '后台执行已完成，并已通过 OPL ask 建立会话记录。'
            : '后台执行已完成。'
          : '后台执行失败，请查看最近输出。',
      session_id: cliAskPayload.sessionId ?? current.session_id,
      exit_code: code ?? 1,
      recent_output: cliAskPayload.response || tailLines(logFile, 20),
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
      input: preparedAsk.resolveInput,
      routing: preparedAsk.routing,
      boundary: preparedAsk.boundary,
      ...preparedAsk.handoffBundle,
      handoff_prompt_preview: preparedAsk.handoffPrompt,
      task: {
        task_id: taskId,
        status: 'accepted',
        stage: 'queued',
        summary: '请求已受理，正在提交到后台执行。',
        session_id: null,
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
        session_id: task.session_id,
        recent_output: tailLines(task.log_file, lines),
        exit_code: task.exit_code,
        created_at: task.created_at,
        updated_at: task.updated_at,
      },
    },
  };
}
