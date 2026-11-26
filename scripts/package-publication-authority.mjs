#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const frameworkRepository = 'gaofeng21cn/one-person-lab';
const catalogRepository = 'gaofeng21cn/opl-catalog';
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
  if ((plan.catalog_source_commit ?? '') !== (inputs.expected_catalog_source_commit ?? '')) {
    throw new Error('Daily publication provenance does not match the requested Catalog commit.');
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
  if ((entry.expected_catalog_source_commit ?? '') !== (inputs.expected_catalog_source_commit ?? '')) {
    throw new Error('Daily plan Package entry does not match the requested Catalog commit.');
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

function githubFile(repository, file, ref) {
  const content = ghJson(`repos/${repository}/contents/${file}?ref=${ref}`);
  return JSON.parse(Buffer.from(content.content, 'base64').toString('utf8'));
}

function currentCatalogPackage(inputs, legacyPath = null) {
  const catalogCommit = inputs.expected_catalog_source_commit;
  if (catalogCommit && !commitPattern.test(catalogCommit)) throw new Error('Catalog source commit must be an exact Git commit.');
  const head = ghJson(`repos/${catalogRepository}/commits/main`);
  if (!commitPattern.test(head.sha ?? '')) throw new Error('Official Catalog main commit is unavailable.');
  if (catalogCommit && head.sha !== catalogCommit) {
    const comparison = ghJson(`repos/${catalogRepository}/compare/${catalogCommit}...${head.sha}?per_page=1`);
    if (comparison.status !== 'ahead') throw new Error('Catalog source commit must be on official Catalog main.');
  }
  const { tree, truncated } = ghJson(`repos/${catalogRepository}/git/trees/${head.sha}?recursive=1`);
  if (truncated) throw new Error('Official Catalog tree is incomplete.');
  const packagePaths = tree.filter(({ path: name, type }) => type === 'blob'
    && /^packages\/(agents|applications|extensions|channels|dependencies)\/[^/]+\.json$/.test(name)
    && name.endsWith(`/${inputs.package_id}.json`));
  if (packagePaths.length !== 1) throw new Error('Official Catalog must declare one current Package.');
  const manifest = githubFile(catalogRepository, packagePaths[0].path, head.sha);
  if (manifest.package_id !== inputs.package_id
    || manifest.version !== inputs.expected_package_version
    || manifest.codex_surface?.carrier_source_commit !== inputs.expected_owner_source_commit
    || manifest.publication_channel_admission === 'retired'
    || manifest.publication_channel_admission === 'development_only') {
    throw new Error('Requested Package release differs from official Catalog main.');
  }
  if (head.sha !== catalogCommit) {
    const selectedRepo = legacyPath ? frameworkRepository : catalogRepository;
    const selectedCommit = legacyPath ? inputs.expected_framework_source_commit : catalogCommit;
    if (!commitPattern.test(selectedCommit)) throw new Error('Legacy Framework publication must select an exact commit.');
    const selected = githubFile(selectedRepo, legacyPath ?? packagePaths[0].path, selectedCommit);
    for (const key of ['visibility', 'access_policy_ref', 'credential_provider', 'source_repo',
      'publication_channel_admission', 'management_scope']) {
      if ((selected[key] ?? null) !== (manifest[key] ?? null)) {
        throw new Error(`Selected Catalog release policy changed: ${key}.`);
      }
    }
    const surface = selected.codex_surface;
    const mainSurface = manifest.codex_surface;
    if (selected.package_id !== manifest.package_id || selected.version !== manifest.version
      || surface?.carrier_source_commit !== mainSurface?.carrier_source_commit
      || surface?.plugin_payload_manifest_url !== mainSurface?.plugin_payload_manifest_url
      || surface?.configured_codex_plugin_carrier?.publication_ref
        !== mainSurface?.configured_codex_plugin_carrier?.publication_ref) {
      throw new Error('Selected Catalog release no longer matches the current publisher policy.');
    }
    const payloadRef = mainSurface?.plugin_payload_manifest_url;
    const selectedPayloadDirectory = legacyPath ? 'contracts/opl-framework/packages' : 'packages';
    if (payloadRef !== `payloads/${inputs.package_id}-${inputs.expected_package_version}.json`
      || JSON.stringify(githubFile(selectedRepo, `${selectedPayloadDirectory}/${payloadRef}`, selectedCommit))
        !== JSON.stringify(githubFile(catalogRepository, `packages/${payloadRef}`, head.sha))) {
      throw new Error('Selected Catalog payload bytes differ from the current release.');
    }
  }
  return manifest;
}

function main() {
  const inputs = JSON.parse(process.env.PUBLICATION_INPUTS ?? '{}');
  if (!/^[a-z0-9][a-z0-9.-]*$/.test(inputs.package_id ?? '')) throw new Error('Invalid Package id.');
  const legacyPath = `contracts/opl-framework/packages/${inputs.package_id}.json`;
  const legacyAvailable = fs.existsSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', legacyPath));
  const catalogPackage = inputs.expected_catalog_source_commit ? currentCatalogPackage(inputs)
    : legacyAvailable ? null : currentCatalogPackage(inputs, legacyPath);
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
      const currentPackage = catalogPackage ?? githubFile(frameworkRepository, legacyPath, 'main');
      environment = validateScheduledPublication({ run, plan, inputs, currentPackage, callerRepository: process.env.GITHUB_REPOSITORY });
    } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
  }
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `environment=${environment}\n`);
  process.stdout.write(`${environment}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
