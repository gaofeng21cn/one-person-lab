import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const defaultCliEntrypoint = path.join(repoRoot, 'dist', 'cli', 'index.js');
const cliEntrypoint = process.env.OPL_CLI_ENTRYPOINT ?? defaultCliEntrypoint;
const contractsRoot = path.join(repoRoot, 'contracts', 'opl-gateway');

function runCli(args, options = {}) {
  return spawnSync(process.execPath, [cliEntrypoint, ...args], {
    cwd: repoRoot,
    env: {
      ...process.env,
      ...options.env,
    },
    encoding: 'utf8',
  });
}

function formatFailure(result) {
  return [
    `status=${result.status}`,
    `signal=${result.signal}`,
    `stdout=${result.stdout.trim()}`,
    `stderr=${result.stderr.trim()}`,
  ].join('\n');
}

function parseJsonOutput(result) {
  const text = (result.stdout && result.stdout.trim()) || (result.stderr && result.stderr.trim()) || '';
  return JSON.parse(text);
}

function createBrokenContractsDir(mutator) {
  const fixtureRoot = mkdtempSync(path.join(os.tmpdir(), 'opl-contract-fixture-'));

  for (const fileName of ['workstreams.json', 'domains.json', 'routing-vocabulary.json', 'task-topology.json']) {
    writeFileSync(path.join(fixtureRoot, fileName), readFileSync(path.join(contractsRoot, fileName), 'utf8'));
  }

  mutator(fixtureRoot);
  return fixtureRoot;
}

test('list-workstreams returns the admitted workstream summaries', () => {
  assert.ok(existsSync(cliEntrypoint), `Expected CLI entrypoint at ${cliEntrypoint}. Set OPL_CLI_ENTRYPOINT if Lane B emits a different build path.`);

  const result = runCli(['list-workstreams']);
  assert.equal(result.status, 0, formatFailure(result));

  const payload = parseJsonOutput(result);
  assert.equal(payload.version, 'g2');
  assert.deepEqual(payload.workstreams, [
    {
      workstream_id: 'research_ops',
      label: 'Research Ops',
      status: 'active',
      domain_id: 'medautoscience',
    },
    {
      workstream_id: 'presentation_ops',
      label: 'Presentation Ops',
      status: 'emerging',
      domain_id: 'redcube',
    },
  ]);
});

test('get-domain redcube returns gateway and harness truth', () => {
  const result = runCli(['get-domain', 'redcube']);
  assert.equal(result.status, 0, formatFailure(result));

  const payload = parseJsonOutput(result);
  assert.equal(payload.version, 'g2');
  assert.equal(payload.domain.domain_id, 'redcube');
  assert.equal(payload.domain.project, 'redcube-ai');
  assert.equal(payload.domain.gateway_surface, 'Visual Deliverable Gateway');
  assert.equal(payload.domain.harness_surface, 'Visual Deliverable Harness OS');
  assert.deepEqual(payload.domain.owned_workstreams, ['presentation_ops']);
  assert.deepEqual(payload.domain.non_opl_families, ['xiaohongshu']);
});

test('resolve-request-surface maps a defense-ready slide deck to presentation_ops via redcube', () => {
  const result = runCli([
    'resolve-request-surface',
    '--intent', 'presentation_delivery',
    '--target', 'deliverable',
    '--goal', 'Prepare a defense-ready slide deck for a thesis committee.',
    '--preferred-family', 'ppt_deck',
  ]);
  assert.equal(result.status, 0, formatFailure(result));

  const payload = parseJsonOutput(result);
  assert.equal(payload.version, 'g2');
  assert.equal(payload.resolution.workstream_id, 'presentation_ops');
  assert.equal(payload.resolution.domain_id, 'redcube');
  assert.equal(payload.resolution.entry_surface, 'domain_gateway');
  assert.equal(payload.resolution.recommended_family, 'ppt_deck');
  assert.equal(payload.resolution.confidence, 'high');
});

test('resolve-request-surface keeps xiaohongshu at the redcube family boundary without auto-admitting presentation_ops', () => {
  const result = runCli([
    'resolve-request-surface',
    '--intent', 'presentation_delivery',
    '--target', 'deliverable',
    '--goal', 'Create a xiaohongshu campaign pack for a lab update.',
    '--preferred-family', 'xiaohongshu',
  ]);
  assert.equal(result.status, 0, formatFailure(result));

  const payload = parseJsonOutput(result);
  assert.equal(payload.version, 'g2');
  assert.equal(payload.resolution.domain_id, 'redcube');
  assert.equal(payload.resolution.workstream_id, null);
  assert.equal(payload.resolution.recommended_family, 'xiaohongshu');
  assert.match(payload.resolution.reason, /must not auto-resolve|not automatically equal|family boundary/i);
});

test('explain-domain-boundary explains that grant proposal reviewer simulation stays under definition', () => {
  const result = runCli([
    'explain-domain-boundary',
    '--request-summary', 'Grant proposal reviewer simulation and revision planning.',
  ]);
  assert.equal(result.status, 0, formatFailure(result));

  const payload = parseJsonOutput(result);
  assert.equal(payload.version, 'g2');
  assert.equal(payload.boundary_explanation.request_summary, 'Grant proposal reviewer simulation and revision planning.');
  assert.match(JSON.stringify(payload.boundary_explanation), /grant_ops|under_definition|unknown_domain/i);
});

test('list-workstreams fails with a stable JSON contract-loading error when the contracts root is missing', () => {
  const missingContractsDir = path.join(repoRoot, 'tests', 'fixtures', 'missing-contracts');
  const result = runCli(['list-workstreams'], {
    env: { OPL_CONTRACTS_DIR: missingContractsDir },
  });

  assert.notEqual(result.status, 0, 'Expected a non-zero exit when OPL_CONTRACTS_DIR points to a missing contracts directory.');
  const payload = parseJsonOutput(result);
  assert.equal(payload.error.code, 'CONTRACT_LOAD_ERROR');
  assert.match(payload.error.message, /workstreams\.json|contracts root/i);
});

test('get-domain surfaces invalid JSON in the contract set through the OPL_CONTRACTS_DIR override', () => {
  const brokenContractsDir = createBrokenContractsDir((fixtureRoot) => {
    writeFileSync(path.join(fixtureRoot, 'domains.json'), '{ invalid json\n');
  });

  try {
    const result = runCli(['get-domain', 'redcube'], {
      env: { OPL_CONTRACTS_DIR: brokenContractsDir },
    });

    assert.notEqual(result.status, 0, 'Expected a non-zero exit when domains.json is invalid.');
    const payload = parseJsonOutput(result);
    assert.equal(payload.error.code, 'CONTRACT_LOAD_ERROR');
    assert.match(payload.error.message, /domains\.json|invalid json/i);
  } finally {
    rmSync(brokenContractsDir, { recursive: true, force: true });
  }
});
