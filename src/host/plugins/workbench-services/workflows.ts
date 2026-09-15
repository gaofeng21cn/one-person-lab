import { ApplicationFailure, CancellationScope, defineQuery, isCancellation, proxyActivities, setHandler, sleep, workflowInfo } from '@temporalio/workflow';
import type { TaskDefinition, TaskReadback, TaskRunRef, WorkbenchTaskExecutor } from './types.ts';

const activity = proxyActivities<WorkbenchTaskExecutor>({ startToCloseTimeout: '60 seconds', retry: { maximumAttempts: 1 } });
export const personalTaskState = defineQuery<TaskReadback | { status: string }>('personalTaskState');

// Temporal owns the durable run. Only the existing carrier can create/read Codex turns.
export async function OplPersonalTaskWorkflow(task: TaskDefinition): Promise<TaskReadback> {
  let ref: TaskRunRef | undefined;
  let state: TaskReadback = { threadId: '', turnId: '', status: 'starting' };
  setHandler(personalTaskState, () => state);
  try {
    if (Date.now() - workflowInfo().startTime.getTime() > 300_000) return { threadId: '', turnId: '', status: 'skipped_late' };
    const thread = await activity.createThread(task);
    ref = { ...thread, turnId: '' };
    state = { ...ref, status: 'starting' };
    ref = await activity.startTask(task, thread);
    state = { ...ref, status: 'running' };
    const deadline = Date.now() + task.timeoutMinutes * 60_000;
    while (Date.now() < deadline) {
      state = await activity.readTask(ref);
      if (['completed', 'failed', 'interrupted', 'cancelled'].includes(state.status)) return state;
      await sleep(2000);
    }
    await activity.interruptTask(ref);
    state = { ...ref, status: 'timed_out' };
    return state;
  } catch (error) {
    if (ref) await CancellationScope.nonCancellable(() => activity.interruptTask(ref!)).catch(() => undefined);
    state = { threadId: ref?.threadId ?? '', turnId: ref?.turnId ?? '', status: isCancellation(error) ? 'cancelled' : 'failed' };
    return { threadId: ref?.threadId ?? '', turnId: ref?.turnId ?? '', status: isCancellation(error) ? 'cancelled' : 'failed', summary: 'Execution failed; inspect the canonical conversation. The task is not automatically replayed.' };
  }
}
