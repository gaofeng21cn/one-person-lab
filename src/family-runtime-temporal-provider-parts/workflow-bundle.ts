import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { bundleWorkflowCode, type WorkerOptions } from '@temporalio/worker';

import {
  resolveTemporalNamespace,
  resolveTemporalTaskQueue,
} from '../family-runtime-temporal.ts';
import type { TemporalWorkerPaths } from '../family-runtime-temporal-client.ts';

export type TemporalWorkflowBundleManifest = {
  provider_kind: 'temporal';
  bundle_kind: 'temporal_workflow_bundle';
  code_path: string;
  manifest_path: string;
  workflow_bundle_version: string;
  workflow_bundle_source_version: string;
  workflows_path: string;
  namespace: string;
  task_queue: string;
  generated_at: string;
};

export type TemporalStageAttemptWorkerOptionsBuild = {
  worker_options: Pick<WorkerOptions, 'namespace' | 'taskQueue' | 'activities' | 'workflowBundle'>;
  workflow_bundle: TemporalWorkflowBundleManifest;
};

export function temporalWorkflowBundleDir(paths: TemporalWorkerPaths) {
  return path.join(paths.root, 'temporal-workflow-bundle');
}

export function temporalWorkflowBundleManifestPath(paths: TemporalWorkerPaths) {
  return path.join(temporalWorkflowBundleDir(paths), 'manifest.json');
}

function bundleFileName(sourceVersion: string) {
  const digest = crypto.createHash('sha256').update(sourceVersion).digest('hex');
  return `stage-attempt-workflows-${digest.slice(0, 16)}.js`;
}

function workflowBundleVersion(code: string) {
  return `workflow-bundle:sha256:${crypto.createHash('sha256').update(code).digest('hex')}`;
}

export async function materializeTemporalWorkflowBundle(input: {
  paths: TemporalWorkerPaths;
  workflowsPath: string;
  sourceVersion: string;
}): Promise<TemporalWorkflowBundleManifest> {
  const bundleDir = temporalWorkflowBundleDir(input.paths);
  const codePath = path.join(bundleDir, bundleFileName(input.sourceVersion));
  const manifestPath = temporalWorkflowBundleManifestPath(input.paths);
  fs.mkdirSync(bundleDir, { recursive: true });

  const bundle = await bundleWorkflowCode({ workflowsPath: input.workflowsPath });
  const version = workflowBundleVersion(bundle.code);
  fs.writeFileSync(codePath, bundle.code, 'utf8');
  const manifest: TemporalWorkflowBundleManifest = {
    provider_kind: 'temporal',
    bundle_kind: 'temporal_workflow_bundle',
    code_path: codePath,
    manifest_path: manifestPath,
    workflow_bundle_version: version,
    workflow_bundle_source_version: input.sourceVersion,
    workflows_path: input.workflowsPath,
    namespace: resolveTemporalNamespace(),
    task_queue: resolveTemporalTaskQueue(),
    generated_at: new Date().toISOString(),
  };
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return manifest;
}

export async function buildTemporalStageAttemptWorkerOptions(input: {
  paths: TemporalWorkerPaths;
  workflowsPath: string;
  activities: WorkerOptions['activities'];
  sourceVersion: string;
}): Promise<TemporalStageAttemptWorkerOptionsBuild> {
  const workflowBundle = await materializeTemporalWorkflowBundle({
    paths: input.paths,
    workflowsPath: input.workflowsPath,
    sourceVersion: input.sourceVersion,
  });
  return {
    worker_options: {
      namespace: resolveTemporalNamespace(),
      taskQueue: resolveTemporalTaskQueue(),
      activities: input.activities,
      workflowBundle: {
        codePath: workflowBundle.code_path,
      },
    },
    workflow_bundle: workflowBundle,
  };
}
