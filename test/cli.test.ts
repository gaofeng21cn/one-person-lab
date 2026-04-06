import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  GatewayContractError,
  loadGatewayContracts,
} from '../src/contracts.ts';
import {
  explainDomainBoundary,
  resolveRequestSurface,
} from '../src/resolver.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const cliPath = path.join(repoRoot, 'src', 'cli.ts');

function runCli(args: string[]) {
  return runCliWithEnv(args);
}

function runCliWithEnv(args: string[], envOverrides: Record<string, string> = {}) {
  const result = spawnSync(
    process.execPath,
    ['--experimental-strip-types', cliPath, ...args],
    {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        NODE_NO_WARNINGS: '1',
        ...envOverrides,
      },
    },
  );

  assert.equal(result.status, 0, result.stderr);

  return JSON.parse(result.stdout);
}

function runCliFailure(args: string[]) {
  const result = spawnSync(
    process.execPath,
    ['--experimental-strip-types', cliPath, ...args],
    {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        NODE_NO_WARNINGS: '1',
      },
    },
  );

  assert.equal(result.status, 1);

  return JSON.parse(result.stderr);
}

test('loadGatewayContracts returns the frozen gateway registries', () => {
  const contracts = loadGatewayContracts(repoRoot);

  assert.equal(contracts.workstreams.version, 'g1');
  assert.equal(contracts.domains.version, 'g1');
  assert.equal(contracts.routingVocabulary.version, 'g1');
  assert.equal(contracts.taskTopology.scope, 'opl_task_topology');
  assert.equal(
    contracts.publicSurfaceIndex.scope,
    'opl_public_gateway_surface_index',
  );
});

test('loadGatewayContracts rejects missing files with a stable error', async (t) => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-gateway-missing-'));

  await t.test('missing contracts directory', () => {
    assert.throws(
      () => loadGatewayContracts(tempRoot),
      (error: unknown) =>
        error instanceof GatewayContractError &&
        error.code === 'contract_file_missing',
    );
  });
});

test('loadGatewayContracts honors OPL_CONTRACTS_DIR when provided', () => {
  const tempContracts = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-gateway-contracts-'));
  fs.cpSync(path.join(repoRoot, 'contracts', 'opl-gateway'), tempContracts, {
    recursive: true,
  });

  const workstreamsPath = path.join(tempContracts, 'workstreams.json');
  const workstreams = JSON.parse(fs.readFileSync(workstreamsPath, 'utf8'));
  workstreams.workstreams[0].label = 'Research Ops Override';
  fs.writeFileSync(workstreamsPath, JSON.stringify(workstreams, null, 2));

  const output = runCliWithEnv(['get-workstream', 'research_ops'], {
    OPL_CONTRACTS_DIR: tempContracts,
  });

  assert.equal(output.workstream.label, 'Research Ops Override');
});

test('list-workstreams returns admitted workstream summaries', () => {
  const output = runCli(['list-workstreams']);

  assert.deepEqual(output, {
    version: 'g2',
    workstreams: [
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
    ],
  });
});

test('get-workstream returns the full registered workstream meaning', () => {
  const output = runCli(['get-workstream', 'presentation_ops']);

  assert.equal(output.version, 'g2');
  assert.equal(output.workstream.workstream_id, 'presentation_ops');
  assert.equal(output.workstream.domain_id, 'redcube');
  assert.deepEqual(output.workstream.primary_families, ['ppt_deck']);
});

test('list-domains returns the registered domain gateway summaries', () => {
  const output = runCli(['list-domains']);

  assert.deepEqual(output, {
    version: 'g2',
    domains: [
      {
        domain_id: 'medautoscience',
        gateway_surface: 'Research Ops Gateway',
        owned_workstreams: ['research_ops'],
      },
      {
        domain_id: 'redcube',
        gateway_surface: 'Visual Deliverable Gateway',
        owned_workstreams: ['presentation_ops'],
      },
    ],
  });
});

test('list-surfaces returns the public gateway surface summaries', () => {
  const output = runCli(['list-surfaces']);

  assert.equal(output.version, 'g2');
  assert.ok(Array.isArray(output.surfaces));
  assert.ok(output.surfaces.length > 10);
  assert.deepEqual(output.surfaces[0], {
    surface_id: 'opl_public_readme',
    category_id: 'opl_public_entry',
    surface_kind: 'readme',
    owner_scope: 'opl',
  });
  assert.ok(
    output.surfaces.some(
      (surface: {
        surface_id: string;
        category_id: string;
        surface_kind: string;
        owner_scope: string;
      }) =>
        surface.surface_id === 'redcube_public_gateway'
        && surface.category_id === 'domain_public_entry'
        && surface.owner_scope === 'domain',
    ),
  );
});

test('get-domain returns the full registered domain meaning', () => {
  const output = runCli(['get-domain', 'redcube']);

  assert.equal(output.version, 'g2');
  assert.equal(output.domain.domain_id, 'redcube');
  assert.equal(output.domain.project, 'redcube-ai');
  assert.deepEqual(output.domain.non_opl_families, ['xiaohongshu']);
});

test('get-surface returns the full registered public surface meaning', () => {
  const output = runCli(['get-surface', 'opl_read_only_discovery_gateway']);

  assert.equal(output.version, 'g2');
  assert.equal(output.surface.surface_id, 'opl_read_only_discovery_gateway');
  assert.equal(output.surface.category_id, 'opl_contract_surface');
  assert.deepEqual(output.surface.routes_to, [
    'medautoscience_public_gateway',
    'redcube_public_gateway',
  ]);
});

test('resolveRequestSurface routes research delivery to medautoscience', () => {
  const resolution = resolveRequestSurface(
    {
      intent: 'submission_delivery',
      target: 'publication',
      goal: 'Prepare the manuscript package for journal review.',
    },
    loadGatewayContracts(repoRoot),
  );

  assert.equal(resolution.status, 'routed');
  assert.equal(resolution.workstream_id, 'research_ops');
  assert.equal(resolution.domain_id, 'medautoscience');
});

test('resolveRequestSurface routes presentation delivery to redcube', () => {
  const resolution = resolveRequestSurface(
    {
      intent: 'presentation_delivery',
      target: 'deliverable',
      goal: 'Prepare a defense-ready slide deck for a thesis committee.',
    },
    loadGatewayContracts(repoRoot),
  );

  assert.equal(resolution.status, 'routed');
  assert.equal(resolution.workstream_id, 'presentation_ops');
  assert.equal(resolution.domain_id, 'redcube');
  assert.equal(resolution.recommended_family, 'ppt_deck');
});

test('resolveRequestSurface keeps ppt_deck mapped to presentation_ops', () => {
  const output = runCli([
    'resolve-request-surface',
    '--intent',
    'presentation_delivery',
    '--target',
    'deliverable',
    '--goal',
    'Create the committee deck.',
    '--preferred-family',
    'ppt_deck',
  ]);

  assert.equal(output.version, 'g2');
  assert.equal(output.resolution.status, 'routed');
  assert.equal(output.resolution.workstream_id, 'presentation_ops');
  assert.equal(output.resolution.domain_id, 'redcube');
});

test('resolveRequestSurface keeps xiaohongshu at the redcube family boundary', () => {
  const output = runCli([
    'resolve-request-surface',
    '--intent',
    'create',
    '--target',
    'deliverable',
    '--goal',
    'Prepare a xiaohongshu campaign pack.',
    '--preferred-family',
    'xiaohongshu',
  ]);

  assert.equal(output.resolution.status, 'domain_boundary');
  assert.equal(output.resolution.domain_id, 'redcube');
  assert.equal(output.resolution.workstream_id, null);
});

test('resolveRequestSurface returns unknown_domain for under-definition workstreams', () => {
  const output = runCli([
    'resolve-request-surface',
    '--intent',
    'plan',
    '--target',
    'deliverable',
    '--goal',
    'Build a formal grant proposal operating lane from the supplied topic brief.',
  ]);

  assert.equal(output.resolution.status, 'unknown_domain');
  assert.equal(output.resolution.candidate_workstream_id, 'grant_ops');
});

test('resolveRequestSurface returns ambiguous_task with explicit boundary evidence when the primary deliverable is unclear', () => {
  const output = runCli([
    'resolve-request-surface',
    '--intent',
    'create',
    '--target',
    'deliverable',
    '--goal',
    'Package the study for submission and also turn it into a defense-ready deck.',
  ]);

  assert.equal(output.resolution.status, 'ambiguous_task');
  assert.deepEqual(output.resolution.candidate_workstreams, [
    'research_ops',
    'presentation_ops',
  ]);
  assert.deepEqual(output.resolution.candidate_domains, [
    'medautoscience',
    'redcube',
  ]);
  assert.deepEqual(output.resolution.required_clarification, [
    'Is the primary goal a formal research deliverable or a presentation deliverable?',
    'If visual delivery is primary, should the family be ppt_deck or another RedCube family?',
  ]);
  assert.deepEqual(output.resolution.routing_evidence, [
    'research delivery semantics',
    'presentation delivery semantics',
    'missing primary deliverable',
  ]);
});

test('explainDomainBoundary explains admitted presentation routing', () => {
  const explanation = explainDomainBoundary(
    {
      intent: 'presentation_delivery',
      target: 'deliverable',
      goal: 'Prepare a defense-ready slide deck for a thesis committee.',
    },
    loadGatewayContracts(repoRoot),
  );

  assert.equal(explanation.resolved_domain, 'redcube');
  assert.equal(explanation.resolved_workstream_id, 'presentation_ops');
  assert.match(explanation.reason, /visual deliverable/i);
});

test('explain-domain-boundary explains xiaohongshu non-equivalence', () => {
  const output = runCli([
    'explain-domain-boundary',
    '--intent',
    'create',
    '--target',
    'deliverable',
    '--goal',
    'Prepare a xiaohongshu campaign pack.',
    '--preferred-family',
    'xiaohongshu',
  ]);

  assert.equal(output.boundary_explanation.resolved_domain, 'redcube');
  assert.equal(output.boundary_explanation.resolved_workstream_id, null);
  assert.match(output.boundary_explanation.reason, /not automatically equal presentation ops/i);
});

test('explain-domain-boundary explains under-definition requests', () => {
  const output = runCli([
    'explain-domain-boundary',
    '--intent',
    'plan',
    '--target',
    'deliverable',
    '--goal',
    'Build a thesis defense preparation pack from the current papers.',
  ]);

  assert.equal(output.boundary_explanation.resolved_domain, null);
  assert.equal(output.boundary_explanation.candidate_workstream_id, 'thesis_ops');
  assert.match(output.boundary_explanation.reason, /under definition/i);
});

test('CLI returns stable JSON errors for unknown ids', () => {
  const output = runCliFailure(['get-domain', 'unknown']);

  assert.equal(output.version, 'g2');
  assert.equal(output.error.code, 'domain_not_found');
  assert.equal(output.error.exit_code, 1);
});

test('CLI returns stable JSON errors for unknown surface ids', () => {
  const output = runCliFailure(['get-surface', 'unknown_surface']);

  assert.equal(output.version, 'g2');
  assert.equal(output.error.code, 'surface_not_found');
  assert.equal(output.error.exit_code, 1);
  assert.deepEqual(output.error.details, { surface_id: 'unknown_surface' });
});

test('CLI returns machine-readable JSON errors for unknown commands with available command discovery', () => {
  const output = runCliFailure(['unknown-command']);

  assert.equal(output.version, 'g2');
  assert.equal(output.error.code, 'unknown_command');
  assert.equal(output.error.exit_code, 1);
  assert.ok(Array.isArray(output.error.details.commands));
  assert.ok(output.error.details.commands.includes('list-surfaces'));
  assert.equal(output.error.details.command, 'unknown-command');
});
