import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { loadFrameworkContracts, validateFrameworkContracts } from '../../src/modules/charter/contracts.ts';
import { buildProductEntryHandoffEnvelope } from '../../src/modules/console/product-entry-handoff-envelope.ts';
import { buildProductEntrySessionPrompt } from '../../src/modules/console/product-entry-parts/builders.ts';
import {
  buildProductEntryDoctor,
} from '../../src/modules/console/product-entry-runtime.ts';

const contractsDir = path.join(process.cwd(), 'contracts', 'opl-framework');
const repoRoot = process.cwd();

function createFakeBinaryFixture(binaryName: string, body: string) {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), `opl-${binaryName}-fixture-`));
  const binaryPath = path.join(fixtureRoot, binaryName);
  fs.writeFileSync(
    binaryPath,
    `#!/usr/bin/env bash
set -euo pipefail
${body}
`,
    { mode: 0o755 },
  );

  return {
    fixtureRoot,
    binaryPath,
  };
}

function withEnv<T>(updates: Record<string, string | undefined>, run: () => T): T {
  const previous = new Map<string, string | undefined>();

  for (const key of Object.keys(updates)) {
    previous.set(key, process.env[key]);
    const value = updates[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    return run();
  } finally {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

test('product-entry runtime leaf exposes Codex-default executor over provider-backed family runtime', () => {
  const codexFixture = createFakeBinaryFixture('codex', `
echo "unused"
exit 0
`);

  try {
    const doctor = withEnv(
      {
        OPL_CODEX_BIN: codexFixture.binaryPath,
        OPL_FAMILY_RUNTIME_PROVIDER: undefined,
        OPL_TEMPORAL_ADDRESS: '',
        TEMPORAL_ADDRESS: '',
      },
      () => buildProductEntryDoctor(validateFrameworkContracts(contractsDir)),
    );

    assert.equal(doctor.product_entry.entry_surface, 'opl_local_product_entry_shell');
    assert.equal(doctor.product_entry.runtime_substrate, 'codex_default_executor_with_provider_backed_family_runtime');
    assert.equal(doctor.product_entry.ready, false);
    assert.equal(doctor.product_entry.local_entry_ready, true);
    assert.equal(doctor.product_entry.online_runtime_ready, false);
    assert.equal(doctor.product_entry.configured_provider, 'temporal');
    assert.equal(doctor.product_entry.family_runtime_provider_ready, false);
    assert.equal(doctor.product_entry.family_runtime_provider.degraded_reason, 'temporal_runtime_not_configured');
    assert.equal(Object.hasOwn(doctor.product_entry, 'messaging_gateway_ready'), false);
    assert.equal(Object.hasOwn(doctor.product_entry, 'hermes'), false);
    assert.match(doctor.product_entry.notes.join('\n'), /configured family runtime provider/);
    assert.match(doctor.product_entry.notes.join('\n'), /non-default executors are explicit stage\/request selections/);
  } finally {
    fs.rmSync(codexFixture.fixtureRoot, { recursive: true, force: true });
  }
});

test('product-entry session prompt carries runtime-owner and executor contract without retired gateway shell wording', () => {
  const contracts = loadFrameworkContracts();
  const prompt = buildProductEntrySessionPrompt(contracts);

  assert.match(prompt, /not the runtime truth owner of any domain/);
  assert.match(prompt, /Codex CLI is the default concrete executor/);
  assert.doesNotMatch(prompt, /gateway and federation shell/);
});

test('product-entry handoff envelope leaf builds the current family handoff payload', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-handoff-leaf-state-'));

  try {
    const envelope = withEnv({ OPL_STATE_DIR: stateRoot }, () =>
      buildProductEntryHandoffEnvelope(
        {
          dryRun: false,
          goal: 'Prepare a defense-ready slide deck for a thesis committee.',
          intent: 'presentation_delivery',
          target: 'deliverable',
          preferredFamily: 'ppt_deck',
          workspacePath: repoRoot,
          skills: [],
        },
        loadFrameworkContracts(contractsDir),
      ),
    );

    assert.equal(envelope.version, 'g2');
    assert.equal(envelope.handoff_bundle.surface_id, 'opl_family_handoff_bundle');
    assert.equal(envelope.handoff_bundle.target_domain_id, 'redcube');
    assert.equal(envelope.handoff_bundle.entry_mode, 'product_entry_handoff');
    assert.equal(envelope.handoff_bundle.workspace_locator.absolute_path, repoRoot);
    const domainContext = envelope.handoff_bundle.domain_context as { project: string } | null;
    const returnSurfaceContract = envelope.handoff_bundle.return_surface_contract as {
      opl: { dashboard_command: string; runtime_status_command: string };
    };
    assert.equal(domainContext?.project, 'redcube-ai');
    assert.equal(returnSurfaceContract.opl.runtime_status_command, 'opl status runtime --limit 10');
    assert.equal(returnSurfaceContract.opl.dashboard_command, 'opl status dashboard');
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});
