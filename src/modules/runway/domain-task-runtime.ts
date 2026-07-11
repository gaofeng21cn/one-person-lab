import fs from 'node:fs';
import path from 'node:path';

import { FrameworkContractError } from '../../kernel/contract-validation.ts';
import { runAgentExecutor } from './agent-executor.ts';
import type { AgentExecutionRequest, AgentExecutionReceipt } from './agent-executor.ts';

export {
  buildCodexExecArgs,
  parseCodexExecOutput,
  resolveCodexBinary,
  runCodexCommand,
  runCodexCommandStreaming,
} from './codex.ts';
export type { CodexCommandResult, CodexExecEvent, CodexExecOptions, CodexStreamingCommandOptions } from './codex.ts';

type JsonRecord = Record<string, unknown>;

export type DomainRunIdentity = {
  domain_id: string;
  program_id: string;
  topic_id: string;
  deliverable_id: string;
  run_id: string;
};

export type DomainActionHandler<TOptions extends JsonRecord = JsonRecord> = (
  options: TOptions,
) => unknown | Promise<unknown>;

function requiredIdentity(field: keyof DomainRunIdentity, value: string) {
  const normalized = value.trim();
  if (!normalized) {
    throw new FrameworkContractError('contract_shape_invalid', `Domain run requires ${field}.`, {
      required: [field],
    });
  }
  return normalized;
}

export function createDomainRunRecord(
  identity: DomainRunIdentity,
  input: {
    status?: string;
    attempt?: number;
    parent_run_id?: string | null;
    refs?: string[];
    metadata?: JsonRecord;
    now?: () => Date;
  } = {},
) {
  const now = (input.now ?? (() => new Date()))().toISOString();
  return {
    surface_kind: 'opl_domain_run_record',
    version: 'domain-run.v1',
    domain_id: requiredIdentity('domain_id', identity.domain_id),
    program_id: requiredIdentity('program_id', identity.program_id),
    topic_id: requiredIdentity('topic_id', identity.topic_id),
    deliverable_id: requiredIdentity('deliverable_id', identity.deliverable_id),
    run_id: requiredIdentity('run_id', identity.run_id),
    status: input.status?.trim() || 'created',
    attempt: Math.max(0, Math.trunc(input.attempt ?? 0)),
    parent_run_id: input.parent_run_id?.trim() || null,
    refs: [...new Set((input.refs ?? []).map((entry) => entry.trim()).filter(Boolean))],
    metadata: input.metadata ?? {},
    created_at: now,
    updated_at: now,
    authority_boundary: {
      framework_owns_run_lifecycle: true,
      framework_owns_domain_verdict: false,
      framework_can_sign_owner_receipt: false,
      framework_can_create_typed_blocker: false,
    },
  };
}

export function appendDomainRunEvent(input: {
  events_file: string;
  identity: DomainRunIdentity;
  event_kind: string;
  payload?: JsonRecord;
  refs?: string[];
  now?: () => Date;
}) {
  const eventKind = input.event_kind.trim();
  if (!eventKind) {
    throw new FrameworkContractError('contract_shape_invalid', 'Domain run event requires event_kind.', {
      required: ['event_kind'],
    });
  }
  const run = createDomainRunRecord(input.identity, { now: input.now });
  const event = {
    ...run,
    surface_kind: 'opl_domain_run_event',
    version: 'domain-run-event.v1',
    event_kind: eventKind,
    payload: input.payload ?? {},
    refs: [...new Set((input.refs ?? []).map((entry) => entry.trim()).filter(Boolean))],
    occurred_at: (input.now ?? (() => new Date()))().toISOString(),
  };
  delete (event as JsonRecord).status;
  delete (event as JsonRecord).attempt;
  delete (event as JsonRecord).parent_run_id;
  delete (event as JsonRecord).metadata;
  delete (event as JsonRecord).created_at;
  delete (event as JsonRecord).updated_at;
  fs.mkdirSync(path.dirname(path.resolve(input.events_file)), { recursive: true });
  fs.appendFileSync(path.resolve(input.events_file), `${JSON.stringify(event)}\n`, 'utf8');
  return event;
}

export function readDomainRunEvents(eventsFile: string) {
  const absolute = path.resolve(eventsFile);
  if (!fs.existsSync(absolute)) return [];
  return fs.readFileSync(absolute, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as JsonRecord);
}

export async function dispatchDomainAction(
  actionId: string,
  options: JsonRecord,
  handlers: Record<string, DomainActionHandler>,
) {
  const action = actionId.trim();
  const handler = handlers[action];
  if (!action || !handler) {
    throw new FrameworkContractError('cli_usage_error', `Unsupported domain action: ${actionId}.`, {
      action_id: actionId,
      supported_action_ids: Object.keys(handlers).sort(),
    });
  }
  return handler(options);
}

export function executeDomainTask(input: {
  identity: DomainRunIdentity;
  execution: AgentExecutionRequest;
  events_file?: string;
  now?: () => Date;
}): { run: ReturnType<typeof createDomainRunRecord>; execution: AgentExecutionReceipt } {
  const run = createDomainRunRecord(input.identity, { status: 'running', now: input.now });
  if (input.events_file) {
    appendDomainRunEvent({
      events_file: input.events_file,
      identity: input.identity,
      event_kind: 'executor_started',
      now: input.now,
    });
  }
  const execution = runAgentExecutor(input.execution);
  if (input.events_file) {
    appendDomainRunEvent({
      events_file: input.events_file,
      identity: input.identity,
      event_kind: execution.exit_code === 0 ? 'executor_completed' : 'executor_failed',
      payload: { executor_kind: execution.executor_kind, exit_code: execution.exit_code },
      refs: execution.session_id ? [`executor-session:${execution.session_id}`] : [],
      now: input.now,
    });
  }
  return { run: { ...run, status: execution.exit_code === 0 ? 'completed' : 'failed' }, execution };
}
