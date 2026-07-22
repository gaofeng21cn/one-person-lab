import crypto from 'node:crypto';
import { once } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import { Worker } from 'node:worker_threads';

type BoundaryMutation =
  | { kind: 'append_file'; file_path: string; bytes: string }
  | { kind: 'add_hard_link'; source_path: string; link_path: string }
  | { kind: 'replace_file'; file_path: string; displaced_path: string; replacement_path: string }
  | { kind: 'replace_root_with_symlink'; root_path: string; displaced_path: string; target_path: string }
  | { kind: 'swap_directories'; first_path: string; second_path: string; temporary_path: string };

const WORKER_SOURCE = String.raw`
  const fs = require('node:fs');
  const path = require('node:path');
  const { parentPort, workerData } = require('node:worker_threads');
  const sleeper = new Int32Array(new SharedArrayBuffer(4));
  const deadline = Date.now() + workerData.timeout_ms;
  while (!fs.existsSync(workerData.ready_path) && Date.now() < deadline) {
    Atomics.wait(sleeper, 0, 0, 5);
  }
  let outcome;
  try {
    if (!fs.existsSync(workerData.ready_path)) throw new Error('boundary interlock ready file was not observed');
    const mutation = workerData.mutation;
    if (mutation.kind === 'append_file') {
      fs.appendFileSync(mutation.file_path, mutation.bytes);
    } else if (mutation.kind === 'add_hard_link') {
      fs.mkdirSync(path.dirname(mutation.link_path), { recursive: true });
      fs.linkSync(mutation.source_path, mutation.link_path);
    } else if (mutation.kind === 'replace_file') {
      fs.renameSync(mutation.file_path, mutation.displaced_path);
      fs.renameSync(mutation.replacement_path, mutation.file_path);
    } else if (mutation.kind === 'replace_root_with_symlink') {
      fs.renameSync(mutation.root_path, mutation.displaced_path);
      fs.symlinkSync(mutation.target_path, mutation.root_path, 'dir');
    } else if (mutation.kind === 'swap_directories') {
      fs.renameSync(mutation.first_path, mutation.temporary_path);
      fs.renameSync(mutation.second_path, mutation.first_path);
      fs.renameSync(mutation.temporary_path, mutation.second_path);
    } else {
      throw new Error('unsupported boundary mutation');
    }
    outcome = { ok: true, mutation_kind: mutation.kind };
  } catch (error) {
    outcome = { ok: false, error: error instanceof Error ? error.message : String(error) };
  } finally {
    fs.writeFileSync(workerData.continue_path, 'continue\n');
    parentPort.postMessage(outcome);
  }
`;

export async function runWithWorkItemFileBoundaryInterlock<T>(input: {
  temporaryRoot: string;
  point: 'after_root_open' | 'after_file_open';
  mutation: BoundaryMutation;
  invoke: () => T;
}): Promise<T> {
  const token = crypto.randomUUID();
  const readyPath = path.join(input.temporaryRoot, `.boundary-ready-${token}`);
  const continuePath = path.join(input.temporaryRoot, `.boundary-continue-${token}`);
  const previousInterlock = process.env.OPL_WORK_ITEM_FILE_BOUNDARY_TEST_INTERLOCK;
  const previousNodeTestContext = process.env.NODE_TEST_CONTEXT;
  const worker = new Worker(WORKER_SOURCE, {
    eval: true,
    workerData: {
      ready_path: readyPath,
      continue_path: continuePath,
      timeout_ms: 10_000,
      mutation: input.mutation,
    },
  });
  await once(worker, 'online');
  process.env.NODE_TEST_CONTEXT = previousNodeTestContext ?? 'work-item-file-boundary-test';
  process.env.OPL_WORK_ITEM_FILE_BOUNDARY_TEST_INTERLOCK = JSON.stringify({
    point: input.point,
    ready_path: readyPath,
    continue_path: continuePath,
    timeout_ms: 8_000,
  });
  let result: T | undefined;
  let invocationError: unknown;
  try {
    result = input.invoke();
  } catch (error) {
    invocationError = error;
  } finally {
    if (previousInterlock === undefined) delete process.env.OPL_WORK_ITEM_FILE_BOUNDARY_TEST_INTERLOCK;
    else process.env.OPL_WORK_ITEM_FILE_BOUNDARY_TEST_INTERLOCK = previousInterlock;
    if (previousNodeTestContext === undefined) delete process.env.NODE_TEST_CONTEXT;
    else process.env.NODE_TEST_CONTEXT = previousNodeTestContext;
  }
  const [outcome] = await once(worker, 'message') as [{ ok: boolean; error?: string }];
  await worker.terminate();
  fs.rmSync(readyPath, { force: true });
  fs.rmSync(continuePath, { force: true });
  if (!outcome.ok) throw new Error(`Boundary mutation failed: ${outcome.error ?? 'unknown error'}`);
  if (invocationError !== undefined) throw invocationError;
  return result as T;
}
