export type TaskDefinition = {
  id: string;
  title: string;
  prompt: string;
  cwd: string;
  model?: string;
  reasoningEffort?: string;
  permissions: ':read-only' | ':workspace-write';
  schedule: { kind: 'once' | 'daily' | 'weekly' | 'interval'; at?: string; time?: string; weekdays?: number[]; minutes?: number; timeZone: string };
  timeoutMinutes: number;
  revision: number;
};
export type TaskRunRef = { threadId: string; turnId: string };
export type TaskReadback = TaskRunRef & { status: string; summary?: string };
export type WorkbenchTaskExecutor = {
  createThread(task: TaskDefinition): Promise<{ threadId: string }>;
  startTask(task: TaskDefinition, thread: { threadId: string }): Promise<TaskRunRef>;
  readTask(ref: TaskRunRef): Promise<TaskReadback>;
  interruptTask(ref: TaskRunRef): Promise<unknown>;
};
export type WorkbenchActionInput = { operation: string; input?: Record<string, unknown>; dryRun?: boolean };
