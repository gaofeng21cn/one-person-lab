import { Context } from '@deepseek-ai/cordis';
import { homedir } from 'node:os';
import path from 'node:path';
import { realpath } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { PersonalTasks } from './tasks.ts';
import { WorkbenchResources } from './resources.ts';
import type { WorkbenchTaskExecutor } from './types.ts';

export const WORKBENCH_SERVICE_ID = 'opl-workbench-services';
const readOps = ['tasks', 'history', 'memory', 'memory_read', 'inventory'] as const;
const writeOps = ['task_create', 'task_update', 'task_pause', 'task_resume', 'task_delete', 'task_run', 'memory_correct', 'memory_update_note', 'memory_delete_note', 'cleanup'] as const;
type Request = { package_id: string; ref: string; input?: Record<string, unknown>; confirmed?: boolean; dryRun?: boolean; confirmationId?: string };
export type WorkbenchHostOptions = { executor: WorkbenchTaskExecutor; env?: NodeJS.ProcessEnv };
const fingerprint = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

// Public Framework host plugin. The renderer receives projections, never these services.
export async function startCordisWorkbenchServicesHost(options: WorkbenchHostOptions) {
  const ctx = new Context();
  const env = options.env ?? process.env;
  const home = env.HOME || homedir();
  const codexHome = path.resolve(env.CODEX_HOME || path.join(home, '.codex'));
  const canonicalHome = await realpath(codexHome).catch(() => codexHome);
  const resources = new WorkbenchResources(path.join(canonicalHome, 'memories'), [
    { id: 'codex_logs', path: path.join(canonicalHome, 'log'), owner: 'Codex' },
    ...(env.OPL_STUDIO_LOG_ROOT ? [{ id: 'app_logs', path: path.resolve(env.OPL_STUDIO_LOG_ROOT), owner: 'OPL App carrier' }] : []),
  ]);
  const tasks = new PersonalTasks(options.executor, canonicalHome, env);
  const resourceReads = { memory: { status: 'not_read', reason: 'Open Memory to read current files.' }, storage: { status: 'not_read', reason: 'Open Storage to read current inventory.' } };
  const previews = new Map<string, { fingerprint: string; expires: number; result: Record<string, unknown> }>();
  const dispatch = async (operation: string, input: Record<string, unknown>, dryRun: boolean, preview?: Record<string, unknown>) => {
    if (operation.startsWith('task_')) return tasks.action(operation, input, dryRun);
    if (operation === 'memory_correct') return resources.memoryCorrect(input, dryRun);
    if (operation === 'memory_update_note' || operation === 'memory_delete_note') return resources.memoryNote(input, operation === 'memory_delete_note', dryRun);
    if (operation === 'cleanup') return dryRun ? resources.cleanupPreview(input.ids as string[]) : resources.cleanupExecute(String(preview?.token), true);
    throw Error('Unsupported workbench action.');
  };
  const service = {
    appStatePatch: () => ({ workbench_services: {
      schema_version: 'opl-workbench-services.v1', owner: 'OPL Framework', package_id: WORKBENCH_SERVICE_ID,
      tasks: { status: tasks.status, reason: tasks.reason, read_ref: 'workbench#tasks', history_ref: 'workbench#history', action_refs: writeOps.filter(x => x.startsWith('task_')).map(x => `workbench#${x}`) },
      memory: { ...resourceReads.memory, read_ref: 'workbench#memory', action_refs: ['workbench#memory_correct', 'workbench#memory_update_note', 'workbench#memory_delete_note'], write_policy: 'correction_notes_only' },
      storage: { ...resourceReads.storage, read_ref: 'workbench#inventory', action_refs: ['workbench#cleanup'], scope: 'owner_declared_inactive_logs' },
    } }),
    async read(request: Request) {
      if (request.package_id !== WORKBENCH_SERVICE_ID || !readOps.some(op => request.ref === `workbench#${op}`)) throw Error('Unknown workbench contribution.');
      const input = request.input ?? {};
      let result;
      try { switch (request.ref) {
        case 'workbench#tasks': result = await tasks.list(); break;
        case 'workbench#history': result = await tasks.history(input.id); break;
        case 'workbench#memory': result = await resources.memoryList(); break;
        case 'workbench#memory_read': result = await resources.memoryRead(String(input.id)); break;
        case 'workbench#inventory': result = await resources.inventory(); break;
      }
      }
      catch (error) {
        const key = request.ref.includes('memory') ? 'memory' : request.ref.includes('inventory') ? 'storage' : null;
        if (key) resourceReads[key] = { status: 'read_error', reason: 'Owner read failed. Open the feature page to retry.' };
        throw error;
      }
      if (request.ref === 'workbench#memory') resourceReads.memory = { status: 'available', reason: '' };
      if (request.ref === 'workbench#inventory') resourceReads.storage = { status: 'available', reason: '' };
      return result;
    },
    async execute(request: Request) {
      const operation = request.ref.slice('workbench#'.length);
      if (request.package_id !== WORKBENCH_SERVICE_ID || !writeOps.some(op => request.ref === `workbench#${op}`)) throw Error('Unknown workbench action.');
      const input = request.input ?? {};
      const fp = fingerprint({ operation, input });
      for (const [id, preview] of previews) if (preview.expires < Date.now()) previews.delete(id);
      if (request.dryRun !== false) {
        const result = await dispatch(operation, input, true);
        if (previews.size >= 100) throw Error('Too many pending previews.');
        const confirmationId = randomUUID();
        previews.set(confirmationId, { fingerprint: fp, expires: Date.now() + 300_000, result });
        return { status: 'preview_ready', confirmationId, result };
      }
      if (env.OPL_STUDIO_READ_ONLY === '1' || env.OPL_NATIVE_WORKBENCH_READ_ONLY === '1') throw Error('Workbench is read-only.');
      const preview = previews.get(request.confirmationId ?? '');
      if (!request.confirmed || !preview || preview.expires < Date.now() || preview.fingerprint !== fp) throw Error('A matching current preview and explicit confirmation are required.');
      previews.delete(request.confirmationId!);
      const result = await dispatch(operation, input, false, preview.result);
      return { status: result.status === 'partial' ? 'failed' : result.status === 'noop' ? 'no_op' : 'executed', receiptId: randomUUID(), result };
    },
  };
  const fiber = await ctx.plugin({ name: WORKBENCH_SERVICE_ID, provide: WORKBENCH_SERVICE_ID, apply(context: Context) {
    context.provide(WORKBENCH_SERVICE_ID, service);
    context.effect(() => async () => { previews.clear(); await tasks.dispose(); });
  } });
  // Optional resources never block chat-first startup or the channel-provider plugin.
  void tasks.connect();
  return Object.freeze({ ...service, dispose: async () => { await fiber.dispose(); } });
}
