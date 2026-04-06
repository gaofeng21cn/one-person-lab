import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadGatewayContracts } from '../src/contracts.ts';
import { explainDomainBoundary, resolveRequestSurface } from '../src/resolver.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const contractsRoot = path.join(repoRoot, 'contracts', 'opl-gateway');
const deferredSurfaceFiles = [
  'handoff.schema.json',
  'routed-actions.schema.json',
  'governance-audit.schema.json',
  'publish-promotion.schema.json',
  'domain-onboarding-readiness.schema.json',
] as const;
const forbiddenExecutableSurfacePattern =
  /webhook|route handler|rpc contract|payload schema|telemetry pipeline|runtime log sink|audit persistence|server surface|domain mutation/i;

function createContractsFixture() {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-readonly-guardrails-'));
  const fixtureContractsRoot = path.join(fixtureRoot, 'contracts', 'opl-gateway');
  fs.cpSync(contractsRoot, fixtureContractsRoot, { recursive: true });
  return { fixtureRoot, fixtureContractsRoot };
}

test('core contract loading stays independent from deferred runtime and payload schema artifacts', () => {
  const { fixtureRoot, fixtureContractsRoot } = createContractsFixture();

  try {
    for (const fileName of deferredSurfaceFiles) {
      fs.writeFileSync(
        path.join(fixtureContractsRoot, fileName),
        '{ invalid deferred surface artifact\n',
      );
    }

    const contracts = loadGatewayContracts(fixtureRoot);

    assert.equal(contracts.workstreams.version, 'g1');
    assert.equal(contracts.domains.version, 'g1');
    assert.equal(contracts.routingVocabulary.version, 'g1');
    assert.ok(contracts.publicSurfaceIndex.surfaces.length > 0);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('gateway resolution outputs stay free of webhook, RPC, payload-schema, telemetry, and mutation semantics', () => {
  const contracts = loadGatewayContracts(repoRoot);
  const routed = resolveRequestSurface(
    {
      intent: 'presentation_delivery',
      target: 'deliverable',
      goal: 'Prepare a defense-ready slide deck for a thesis committee.',
      preferredFamily: 'ppt_deck',
    },
    contracts,
  );
  const boundary = explainDomainBoundary(
    {
      intent: 'create',
      target: 'deliverable',
      goal: 'Grant proposal reviewer simulation and revision planning.',
    },
    contracts,
  );

  assert.doesNotMatch(JSON.stringify(routed), forbiddenExecutableSurfacePattern);
  assert.doesNotMatch(JSON.stringify(boundary), forbiddenExecutableSurfacePattern);
  assert.equal(routed.status, 'routed');
  if (routed.status === 'routed') {
    assert.equal(routed.entry_surface, 'domain_gateway');
  }
});
