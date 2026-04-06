import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const cliEntrypoint =
  process.env.OPL_CLI_ENTRYPOINT
  ?? [
    path.join(repoRoot, 'dist', 'cli.js'),
    path.join(repoRoot, 'dist', 'cli', 'index.js'),
  ].find((candidate) => existsSync(candidate))
  ?? path.join(repoRoot, 'dist', 'cli.js');
const contractsRoot = path.join(repoRoot, 'contracts', 'opl-gateway');

function runCli(args, options = {}) {
  return spawnSync(process.execPath, [cliEntrypoint, ...args], {
    cwd: options.cwd ?? repoRoot,
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

function createContractsFixtureRoot(mutator) {
  const fixtureRoot = mkdtempSync(path.join(os.tmpdir(), 'opl-contract-fixture-'));
  const fixtureContractsRoot = path.join(fixtureRoot, 'contracts', 'opl-gateway');
  mkdirSync(fixtureContractsRoot, { recursive: true });

  for (const fileName of ['workstreams.json', 'domains.json', 'routing-vocabulary.json', 'task-topology.json', 'public-surface-index.json']) {
    writeFileSync(
      path.join(fixtureContractsRoot, fileName),
      readFileSync(path.join(contractsRoot, fileName), 'utf8'),
    );
  }

  mutator(fixtureRoot, fixtureContractsRoot);
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

test('list-surfaces returns the public gateway surface summaries', () => {
  const result = runCli(['list-surfaces']);
  assert.equal(result.status, 0, formatFailure(result));

  const payload = parseJsonOutput(result);
  assert.equal(payload.version, 'g2');
  assert.ok(Array.isArray(payload.surfaces));
  assert.deepEqual(payload.surfaces[0], {
    surface_id: 'opl_public_readme',
    category_id: 'opl_public_entry',
    surface_kind: 'readme',
    owner_scope: 'opl',
  });
});

test('get-surface returns the full public surface meaning', () => {
  const result = runCli(['get-surface', 'opl_public_surface_index_doc']);
  assert.equal(result.status, 0, formatFailure(result));

  const payload = parseJsonOutput(result);
  assert.equal(payload.version, 'g2');
  assert.equal(payload.surface.surface_id, 'opl_public_surface_index_doc');
  assert.match(JSON.stringify(payload.surface.routes_to), /opl_surface_review_matrix/);
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
    '--intent', 'create',
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

test('resolve-request-surface emits ambiguous_task with machine-readable clarification evidence', () => {
  const result = runCli([
    'resolve-request-surface',
    '--intent', 'create',
    '--target', 'deliverable',
    '--goal', 'Package the study for submission and also turn it into a defense-ready deck.',
  ]);
  assert.equal(result.status, 0, formatFailure(result));

  const payload = parseJsonOutput(result);
  assert.equal(payload.version, 'g2');
  assert.equal(payload.resolution.status, 'ambiguous_task');
  assert.deepEqual(payload.resolution.candidate_workstreams, [
    'research_ops',
    'presentation_ops',
  ]);
  assert.deepEqual(payload.resolution.candidate_domains, [
    'medautoscience',
    'redcube',
  ]);
  assert.deepEqual(payload.resolution.required_clarification, [
    'Is the primary output a formal research submission package or a presentation deliverable?',
    'If presentation delivery is primary, should the family be ppt_deck or another RedCube family?',
  ]);
  assert.deepEqual(payload.resolution.routing_evidence, [
    'research delivery semantics',
    'presentation delivery semantics',
    'missing primary deliverable',
  ]);
});

test('explain-domain-boundary explains that grant proposal reviewer simulation stays under definition', () => {
  const result = runCli([
    'explain-domain-boundary',
    '--intent', 'create',
    '--target', 'deliverable',
    '--goal', 'Grant proposal reviewer simulation and revision planning.',
  ]);
  assert.equal(result.status, 0, formatFailure(result));

  const payload = parseJsonOutput(result);
  assert.equal(payload.version, 'g2');
  assert.equal(payload.boundary_explanation.request_summary, 'Grant proposal reviewer simulation and revision planning.');
  assert.match(JSON.stringify(payload.boundary_explanation), /grant_ops|under definition|unknown_domain/i);
});

test('list-workstreams fails with a stable JSON contract-loading error when contracts are missing from cwd', () => {
  const missingRoot = mkdtempSync(path.join(os.tmpdir(), 'opl-missing-contracts-'));

  try {
    const result = runCli(['list-workstreams'], { cwd: missingRoot });
    assert.notEqual(result.status, 0, 'Expected a non-zero exit when contracts are missing from cwd.');

    const payload = parseJsonOutput(result);
    assert.match(payload.error.code, /contract_file_missing|contract_load_error/i);
    assert.match(payload.error.message, /workstreams\.json|contracts/i);
  } finally {
    rmSync(missingRoot, { recursive: true, force: true });
  }
});

test('get-domain surfaces invalid JSON from the contract set rooted at cwd', () => {
  const brokenRoot = createContractsFixtureRoot((fixtureRoot, fixtureContractsRoot) => {
    writeFileSync(path.join(fixtureContractsRoot, 'domains.json'), '{ invalid json\n');
    mkdirSync(path.join(fixtureRoot, 'dist'), { recursive: true });
    cpSync(path.join(repoRoot, 'dist'), path.join(fixtureRoot, 'dist'), { recursive: true });
  });

  try {
    const result = runCli(['get-domain', 'redcube'], { cwd: brokenRoot });
    assert.notEqual(result.status, 0, 'Expected a non-zero exit when domains.json is invalid.');

    const payload = parseJsonOutput(result);
    assert.match(payload.error.code, /contract_json_invalid|contract_load_error/i);
    assert.match(payload.error.message, /domains\.json|invalid json/i);
  } finally {
    rmSync(brokenRoot, { recursive: true, force: true });
  }
});

test('get-surface returns a stable machine-readable not-found envelope', () => {
  const result = runCli(['get-surface', 'unknown_surface']);
  assert.notEqual(result.status, 0, 'Expected a non-zero exit when a surface id is unknown.');

  const payload = parseJsonOutput(result);
  assert.equal(payload.version, 'g2');
  assert.equal(payload.error.code, 'surface_not_found');
  assert.equal(payload.error.exit_code, result.status);
  assert.deepEqual(payload.error.details, { surface_id: 'unknown_surface' });
});

test('get-surface surfaces invalid JSON from the contract set rooted at cwd', () => {
  const brokenRoot = createContractsFixtureRoot((fixtureRoot, fixtureContractsRoot) => {
    writeFileSync(path.join(fixtureContractsRoot, 'public-surface-index.json'), '{ invalid json\n');
    mkdirSync(path.join(fixtureRoot, 'dist'), { recursive: true });
    cpSync(path.join(repoRoot, 'dist'), path.join(fixtureRoot, 'dist'), { recursive: true });
  });

  try {
    const result = runCli(['get-surface', 'opl_public_readme'], { cwd: brokenRoot });
    assert.notEqual(result.status, 0, 'Expected a non-zero exit when public-surface-index.json is invalid.');

    const payload = parseJsonOutput(result);
    assert.match(payload.error.code, /contract_json_invalid|contract_load_error/i);
    assert.match(payload.error.message, /public-surface-index\.json|invalid json/i);
  } finally {
    rmSync(brokenRoot, { recursive: true, force: true });
  }
});
