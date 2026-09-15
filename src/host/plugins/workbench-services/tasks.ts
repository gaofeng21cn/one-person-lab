import { createHash, randomUUID } from 'node:crypto';
import Long from 'long';
import { hostname } from 'node:os';
import { realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client, Connection, ScheduleOverlapPolicy, type ScheduleSpec } from '@temporalio/client';
import { defaultPayloadConverter } from '@temporalio/common';
import { NativeConnection, Worker } from '@temporalio/worker';
import { familyRuntimePaths } from '../../../adapters/execution/family-runtime-store.ts';
import { resolveTemporalAddressForPaths } from '../../../adapters/execution/family-runtime-temporal-service.ts';
import { resolveTemporalClientNamespace } from '../../../adapters/execution/family-runtime-temporal-client.ts';
import type { TaskDefinition, WorkbenchTaskExecutor } from './types.ts';

export async function validateTask(input: Record<string, unknown>): Promise<TaskDefinition> {
  const task = structuredClone(input) as unknown as TaskDefinition;
  if (!/^[a-z0-9-]{1,64}$/.test(task.id ?? '')) throw Error('Invalid task ID.');
  if (typeof task.title !== 'string' || !task.title.trim() || task.title.length > 160) throw Error('Task title is required (maximum 160 characters).');
  if (typeof task.prompt !== 'string' || !task.prompt.trim() || task.prompt.length > 32_000) throw Error('Task prompt is required (maximum 32000 characters).');
  if (!path.isAbsolute(task.cwd ?? '') || !(await stat(task.cwd)).isDirectory()) throw Error('Select an existing absolute workspace directory.');
  task.cwd = await realpath(task.cwd);
  if (![':read-only', ':workspace-write'].includes(task.permissions)) throw Error('Scheduled tasks require read-only or workspace-write permissions.');
  if (!Number.isInteger(task.timeoutMinutes) || task.timeoutMinutes < 1 || task.timeoutMinutes > 120) throw Error('Timeout must be 1–120 minutes.');
  if (task.model !== undefined && (typeof task.model !== 'string' || task.model.length > 200)) throw Error('Invalid model.');
  if (task.reasoningEffort !== undefined && !['low', 'medium', 'high', 'xhigh', 'max'].includes(task.reasoningEffort)) throw Error('Invalid reasoning effort.');
  if (!task.schedule || typeof task.schedule.timeZone !== 'string') throw Error('A time zone is required.');
  new Intl.DateTimeFormat('en', { timeZone: task.schedule.timeZone }).format();
  const s = task.schedule;
  if (s.kind === 'once') {
    if (!s.at || !/(Z|[+-]\d\d:\d\d)$/.test(s.at) || !Number.isFinite(Date.parse(s.at)) || Date.parse(s.at) <= Date.now()) throw Error('Choose a future ISO timestamp including a UTC offset.');
  } else if (s.kind === 'interval') {
    if (!Number.isInteger(s.minutes) || s.minutes! < 1 || s.minutes! > 525600) throw Error('Interval must be 1–525600 minutes.');
  } else if (s.kind === 'daily' || s.kind === 'weekly') {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(s.time ?? '')) throw Error('Time must be HH:mm.');
    if (s.kind === 'weekly' && (!Array.isArray(s.weekdays) || !s.weekdays.length || s.weekdays.some(n => !Number.isInteger(n) || n < 0 || n > 6))) throw Error('Select weekdays (Sunday=0).');
  } else throw Error('Unsupported schedule.');
  return { id: task.id, title: task.title.trim(), prompt: task.prompt, cwd: task.cwd, permissions: task.permissions,
    timeoutMinutes: task.timeoutMinutes, schedule: task.schedule, revision: Number.isInteger(task.revision) ? task.revision : 0,
    ...(task.model ? { model: task.model } : {}), ...(task.reasoningEffort ? { reasoningEffort: task.reasoningEffort } : {}) };
}

export function scheduleSpec(task: TaskDefinition): ScheduleSpec {
  const s = task.schedule;
  if (s.kind === 'once') {
    const d = new Date(s.at!);
    return { timezone: 'UTC', cronExpressions: [`${d.getUTCSeconds()} ${d.getUTCMinutes()} ${d.getUTCHours()} ${d.getUTCDate()} ${d.getUTCMonth() + 1} * ${d.getUTCFullYear()}`] };
  }
  if (s.kind === 'interval') return { intervals: [{ every: s.minutes! * 60_000 }], timezone: s.timeZone };
  const [hour, minute] = s.time!.split(':');
  return { timezone: s.timeZone, cronExpressions: [`${minute} ${hour} * * ${s.kind === 'weekly' ? [...new Set(s.weekdays)].join(',') : '*'}`] };
}

// The schedule definition and run history live exclusively in Temporal.
export class PersonalTasks {
  status = 'not_configured';
  reason = 'Task service has not connected. Refresh to retry.';
  private client?: Client;
  private connection?: Connection;
  private native?: NativeConnection;
  private worker?: Worker;
  private workerRun?: Promise<void>;
  private connecting?: Promise<void>;
  private closed = false;
  readonly prefix: string;
  constructor(private executor: WorkbenchTaskExecutor, private memoryHome: string, private env: NodeJS.ProcessEnv) {
    this.prefix = `opl-personal-${createHash('sha256').update(`${hostname()}:${path.resolve(memoryHome)}`).digest('hex').slice(0, 20)}-`;
  }
  async connect() {
    if (this.closed) throw Error('Workbench host is closed.');
    if (this.status === 'available') return;
    this.connecting ??= this.open().finally(() => { this.connecting = undefined; });
    return this.connecting;
  }
  private async open() {
    this.status = 'loading';
    try {
      await this.stopWorker();
      const paths = familyRuntimePaths();
      const address = resolveTemporalAddressForPaths(paths, this.env).address;
      if (!address) throw Error('Configure or start the existing Framework Temporal service, then refresh.');
      const namespace = resolveTemporalClientNamespace({ paths, addressOverride: address, env: this.env });
      this.connection = await Connection.connect({ address, connectTimeout: 3000 });
      this.client = new Client({ connection: this.connection, namespace });
      this.native = await NativeConnection.connect({ address });
      this.worker = await Worker.create({
        connection: this.native, namespace, taskQueue: this.prefix,
        workflowsPath: fileURLToPath(new URL('./workflows.js', import.meta.url)),
        activities: this.executor, maxConcurrentActivityTaskExecutions: 4,
        shutdownGraceTime: '5 seconds', shutdownForceTime: '15 seconds',
      });
      this.workerRun = this.worker.run().catch(() => { this.status = 'unavailable'; this.reason = 'Task worker stopped. Refresh to reconnect; existing history is retained.'; });
      this.status = 'available'; this.reason = '';
    } catch (error) {
      await this.stopWorker();
      this.status = 'not_configured';
      this.reason = 'The Framework Temporal service or task worker is unavailable. Start the service in Runtime settings and refresh.';
    }
  }
  private async stopWorker() {
    if (this.worker && ['RUNNING', 'INITIALIZED'].includes(this.worker.getState())) this.worker.shutdown();
    await this.workerRun;
    this.worker = undefined; this.workerRun = undefined;
    await this.native?.close(); this.native = undefined;
    await this.connection?.close(); this.connection = undefined; this.client = undefined;
  }
  async dispose() { this.closed = true; await this.connecting; await this.stopWorker(); }
  private async use<T>(fn: (client: Client) => Promise<T>) {
    await this.connect();
    if (!this.client || this.status !== 'available') throw Error(this.reason);
    try { return await this.client.withDeadline(Date.now() + 10_000, () => fn(this.client!)); }
    catch (error) { throw error; }
  }
  private id(id: unknown) {
    if (typeof id !== 'string' || !/^[a-z0-9-]{1,64}$/.test(id)) throw Error('Invalid task ID.');
    return this.prefix + id;
  }
  async list() {
    return this.use(async client => {
      const items = [];
      for await (const row of client.schedule.list({ query: `ScheduleId STARTS_WITH "${this.prefix}"`, pageSize: 100 })) {
        const description = await client.schedule.getHandle(row.scheduleId).describe();
        const task = description.action.args?.[0] as TaskDefinition & { deleted?: boolean };
        if (!task || task.deleted) continue;
        items.push({ ...task, paused: description.state.paused, nextRuns: description.info.nextActionTimes, running: description.info.runningActions, skippedOverlap: description.info.numActionsSkippedOverlap });
        if (items.length >= 200) break;
      }
      return { status: 'available', items, limit: 200, owner: 'Framework / Temporal', readAt: new Date().toISOString(), exitPolicy: 'App must remain running; late starts beyond five minutes are skipped.' };
    });
  }
  async history(id?: unknown) {
    return this.use(async client => {
      const prefix = id ? this.id(id) : this.prefix;
      const items = [];
      for await (const row of client.workflow.list({ query: `WorkflowType = "OplPersonalTaskWorkflow" AND WorkflowId STARTS_WITH "${prefix}"`, pageSize: 50 })) {
        // Exact task filter: the memo is retained after deletion of a task.
        if (id && row.memo?.taskId !== id) continue;
        const handle = client.workflow.getHandle(row.workflowId, row.runId);
        let result: unknown;
        try { result = row.status.name === 'RUNNING' ? await handle.query('personalTaskState') : row.status.name === 'COMPLETED' ? await handle.result() : { status: row.status.name.toLowerCase(), reason: 'Execution did not complete; inspect the carrier and retry.' }; }
        catch { result = { status: 'read_error', reason: 'Run details could not be read. Refresh to retry.' }; }
        items.push({ workflowId: row.workflowId, runId: row.runId, title: row.memo?.title, taskId: row.memo?.taskId, startTime: row.startTime, result });
        if (items.length >= 50) break;
      }
      return { status: 'available', items, limit: 50, readAt: new Date().toISOString() };
    });
  }
  async action(operation: string, input: Record<string, unknown>, dryRun: boolean) {
    const scheduleId = this.id(input.id);
    if (!['task_create', 'task_update', 'task_pause', 'task_resume', 'task_delete', 'task_run'].includes(operation)) throw Error('Unsupported task operation.');
    const task = ['task_create', 'task_update'].includes(operation) ? await validateTask(input) : undefined;
    return this.use(async client => {
      const handle = client.schedule.getHandle(scheduleId);
      if (operation === 'task_create') {
        if (dryRun) return { status: 'preview', task: { ...task, revision: 1 }, owner: 'Framework / Temporal', summary: `Create ${task!.title}; ${task!.schedule.kind} / ${task!.schedule.timeZone}; ${task!.permissions}; workspace ${task!.cwd}.` };
        try {
          await client.schedule.create({ scheduleId, spec: scheduleSpec(task!), action: {
            type: 'startWorkflow', workflowType: 'OplPersonalTaskWorkflow', taskQueue: this.prefix,
            workflowId: scheduleId, args: [{ ...task, revision: 1 }], memo: { taskId: task!.id, title: task!.title },
            retry: { maximumAttempts: 1 }, workflowExecutionTimeout: (task!.timeoutMinutes + 10) * 60_000,
          }, policies: { overlap: ScheduleOverlapPolicy.SKIP, catchupWindow: '1 minute' }, memo: { owner: 'opl-workbench-services.v1' } });
        } catch (error) {
          if ((error as Error).name !== 'ScheduleAlreadyRunning') throw error;
          const existing = (await handle.describe()).action.args?.[0];
          if (JSON.stringify(existing) !== JSON.stringify({ ...task, revision: 1 })) throw Error('Task ID already exists. Refresh before retrying.');
          return { status: 'noop', id: task!.id, reason: 'This task was already created.' };
        }
        return { status: 'executed', id: task!.id };
      }
      const raw = await client.workflowService.describeSchedule({ namespace: client.options.namespace, scheduleId });
      const schedule = raw.schedule!;
      const previous = defaultPayloadConverter.fromPayload(schedule.action!.startWorkflow!.input!.payloads![0]!) as TaskDefinition & { deleted?: boolean };
      if (previous.deleted) throw Error('Task was deleted. Refresh the task list.');
      if (previous.revision !== input.revision) throw Error('Task changed. Reload before applying an operation.');
      if (dryRun) return { status: 'preview', effect: operation, task: task ?? previous, owner: 'Framework / Temporal', summary: `${operation}: ${(task ?? previous).title}; ${(task ?? previous).permissions}; ${(task ?? previous).schedule.kind} / ${(task ?? previous).schedule.timeZone}; workspace ${(task ?? previous).cwd}.`, runningPolicy: 'Pause/delete prevents future runs. An active run remains visible in history.' };
      if (operation === 'task_run') {
        await client.workflowService.patchSchedule({ namespace: client.options.namespace, scheduleId, identity: 'opl-workbench-services', requestId: String(input.requestId ?? randomUUID()), patch: { triggerImmediately: { overlapPolicy: 1 } } });
      } else {
        const next = { ...(task ?? previous), revision: previous.revision + 1, ...(operation === 'task_delete' ? { deleted: true } : {}) };
        schedule.action!.startWorkflow!.input = { payloads: [defaultPayloadConverter.toPayload(next)!] };
        if (task) {
          const spec = scheduleSpec(task);
          schedule.spec = { timezoneName: spec.timezone, cronString: spec.cronExpressions, interval: spec.intervals?.map(i => ({ interval: { seconds: Long.fromNumber(Number(i.every) / 1000) } })) };
          schedule.action!.startWorkflow!.workflowExecutionTimeout = { seconds: Long.fromNumber((task.timeoutMinutes + 10) * 60) };
        }
        schedule.state ??= {};
        if (['task_pause', 'task_delete'].includes(operation)) schedule.state.paused = true;
        if (operation === 'task_resume') schedule.state.paused = false;
        await client.workflowService.updateSchedule({ namespace: client.options.namespace, scheduleId, schedule, conflictToken: raw.conflictToken, identity: 'opl-workbench-services', requestId: String(input.requestId ?? randomUUID()) });
      }
      return { status: 'executed', id: previous.id, effect: operation };
    });
  }
}
