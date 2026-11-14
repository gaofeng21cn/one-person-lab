#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const frameworkRepository = 'gaofeng21cn/one-person-lab';
const commitPattern = /^[a-f0-9]{40}$/;

export function validateScheduledPublication({ run, plan, inputs, callerRepository, currentPackage }) {
  if (run.repository?.full_name !== frameworkRepository
    || run.path !== '.github/workflows/daily-package-channel.yml'
    || run.head_branch !== 'main' || !commitPattern.test(run.head_sha ?? '')
    || !['schedule', 'workflow_dispatch'].includes(run.event)
    || !['in_progress', 'completed'].includes(run.status)
    || (run.status === 'completed' && run.conclusion !== 'success')) {
    throw new Error('Publication requires a trusted main daily-channel run.');
  }
  if (String(run.id) !== String(inputs.automation_source_run_id)
    || plan.source_run_id !== String(run.id)
    || (plan.workflow_source_commit ?? plan.framework_source_commit) !== run.head_sha
    || plan.framework_source_commit !== inputs.expected_framework_source_commit) {
    throw new Error('Daily publication provenance does not match the requested Framework commit.');
  }
  const selected = (plan.packages ?? []).filter((entry) => entry.package_id === inputs.package_id
    && entry.owner_tag_status === 'ready');
  if (selected.length !== 1) throw new Error('Daily plan must select one ready Package.');
  const entry = selected[0];
  if (!currentPackage || currentPackage.package_id !== inputs.package_id
    || currentPackage.version !== inputs.expected_package_version
    || currentPackage.codex_surface?.carrier_source_commit !== inputs.expected_owner_source_commit
    || (currentPackage.visibility ?? 'public') !== (entry.visibility ?? 'public')
    || currentPackage.source_repo?.replace(/^https:\/\/github.com\//, '').replace(/\.git$/, '') !== entry.owner_repository) {
    throw new Error('Daily plan no longer selects the current canonical Package release.');
  }
  for (const key of ['expected_package_version', 'expected_owner_source_commit',
    'expected_latest_stable_predecessor', 'publication_request_id']) {
    if (entry[key] !== inputs[key]) throw new Error(`Daily publication input differs: ${key}`);
  }
  const privateOwner = entry.visibility === 'authorized_only';
  if (callerRepository !== (privateOwner ? entry.owner_repository : frameworkRepository)) {
    throw new Error('Daily publisher repository does not match the selected Package access policy.');
  }
  // Private signing material stays in the private owner's existing protected environment.
  return privateOwner ? 'release-stable' : 'release-stable-automated';
}

export function publicationRequestId(packageId, fingerprint) {
  const id = `${packageId}-${fingerprint.package_version}-${fingerprint.owner_source_commit}`;
  if (!/^[a-z0-9.-]+-[a-f0-9]{40}$/.test(id)) throw new Error('Invalid publication identity.');
  return `daily-${id}`;
}

function ghJson(endpoint) {
  return JSON.parse(execFileSync('gh', ['api', endpoint], { encoding: 'utf8', timeout: 30_000 }));
}

function main() {
  const inputs = JSON.parse(process.env.PUBLICATION_INPUTS ?? '{}');
  let environment = 'release-stable';
  if (inputs.automation_source_run_id) {
    if (!/^[1-9][0-9]*$/.test(String(inputs.automation_source_run_id))) throw new Error('Invalid daily source run ID.');
    const id = inputs.automation_source_run_id;
    const run = ghJson(`repos/${frameworkRepository}/actions/runs/${id}`);
    const artifacts = ghJson(`repos/${frameworkRepository}/actions/runs/${id}/artifacts?per_page=100`);
    const name = `opl-daily-package-channel-candidate-${id}`;
    if (artifacts.artifacts.filter((item) => item.name === name && !item.expired).length !== 1) {
      throw new Error('Daily publication requires one unexpired plan artifact.');
    }
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-publication-authority-'));
    try {
      execFileSync('gh', ['run', 'download', String(id), '--repo', frameworkRepository,
        '--name', name, '--dir', temporary], { stdio: 'pipe', timeout: 60_000 });
      const plan = JSON.parse(fs.readFileSync(path.join(temporary, 'package-publication-dispatch-plan.json'), 'utf8'));
      const content = ghJson(`repos/${frameworkRepository}/contents/contracts/opl-framework/packages/${inputs.package_id}.json?ref=main`);
      const currentPackage = JSON.parse(Buffer.from(content.content, 'base64').toString('utf8'));
      environment = validateScheduledPublication({ run, plan, inputs, currentPackage, callerRepository: process.env.GITHUB_REPOSITORY });
    } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
  }
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `environment=${environment}\n`);
  process.stdout.write(`${environment}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
