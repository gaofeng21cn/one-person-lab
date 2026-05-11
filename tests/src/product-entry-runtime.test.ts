import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { loadFrameworkContracts, validateFrameworkContracts } from '../../src/contracts.ts';
import { buildProductEntryHandoffEnvelope } from '../../src/product-entry-handoff-envelope.ts';
import { buildProductEntrySessionPrompt } from '../../src/product-entry-parts/builders.ts';
import {
  buildProductEntryDoctor,
  runProductEntryLogs,
  runProductEntrySessions,
} from '../../src/product-entry-runtime.ts';

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
  const hermesFixture = createFakeBinaryFixture('hermes', `
if [ "$1" = "version" ]; then
  echo "Hermes Agent v9.9.9-test"
  exit 0
fi
if [ "$1" = "gateway" ] && [ "$2" = "status" ]; then
  echo "Gateway service is loaded"
  exit 0
fi
if [ "$1" = "cron" ] && [ "$2" = "list" ]; then
  echo "Name: opl-family-runtime-tick"
  exit 0
fi
if [ "$1" = "webhook" ] && [ "$2" = "list" ]; then
  echo "opl-family-runtime-webhook"
  exit 0
fi
echo "unexpected fake-hermes args: $*" >&2
exit 1
`);

  try {
    const doctor = withEnv(
      {
        OPL_CODEX_BIN: codexFixture.binaryPath,
        OPL_HERMES_BIN: hermesFixture.binaryPath,
        OPL_FAMILY_RUNTIME_PROVIDER: 'hermes_legacy',
      },
      () => buildProductEntryDoctor(validateFrameworkContracts(contractsDir)),
    );

    assert.equal(doctor.product_entry.entry_surface, 'opl_local_product_entry_shell');
    assert.equal(doctor.product_entry.runtime_substrate, 'codex_default_executor_with_provider_backed_family_runtime');
    assert.equal(doctor.product_entry.ready, true);
    assert.equal(doctor.product_entry.local_entry_ready, true);
    assert.equal(doctor.product_entry.online_runtime_ready, true);
    assert.equal(doctor.product_entry.configured_provider, 'hermes_legacy');
    assert.equal(doctor.product_entry.messaging_gateway_ready, true);
    assert.equal(doctor.product_entry.hermes.binary?.path, hermesFixture.binaryPath);
    assert.match(doctor.product_entry.notes.join('\n'), /configured family runtime provider/);
    assert.match(doctor.product_entry.notes.join('\n'), /hermes_legacy provider/);
  } finally {
    fs.rmSync(codexFixture.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(hermesFixture.fixtureRoot, { recursive: true, force: true });
  }
});

test('product-entry session prompt uses stage-led framework wording instead of retired gateway shell wording', () => {
  const contracts = loadFrameworkContracts();
  const prompt = buildProductEntrySessionPrompt(contracts);

  assert.match(prompt, /Codex-first, stage-led family framework shell/);
  assert.doesNotMatch(prompt, /gateway and federation shell/);
});

test('product-entry runtime leaf wraps Hermes operational surfaces directly', () => {
  const hermesFixture = createFakeBinaryFixture('hermes', `
if [ "$1" = "sessions" ] && [ "$2" = "list" ]; then
  cat <<'EOF'
Preview                                            Last Active   Src    ID
───────────────────────────────────────────────────────────────────────────────────────────────
Focused runtime audit                              2m ago        api_server run_focus
EOF
  exit 0
fi
if [ "$1" = "logs" ] && [ "$2" = "gateway" ]; then
  echo "[INFO] gateway ready"
  exit 0
fi
if [ "$1" = "gateway" ] && [ "$2" = "install" ]; then
  echo "Service definition updated"
  exit 0
fi
if [ "$1" = "gateway" ] && [ "$2" = "status" ]; then
  echo "Gateway service is loaded"
  exit 0
fi
echo "unexpected fake-hermes args: $*" >&2
exit 1
`);

  try {
    withEnv({ OPL_HERMES_BIN: hermesFixture.binaryPath }, () => {
      const sessions = runProductEntrySessions({ limit: 1, source: 'api_server' });
      assert.equal(sessions.product_entry.mode, 'sessions');
      assert.equal(sessions.product_entry.sessions[0].session_id, 'run_focus');
      assert.deepEqual(
        sessions.product_entry.command_preview,
        ['hermes', 'sessions', 'list', '--limit', '1', '--source', 'api_server'],
      );

      const logs = runProductEntryLogs({ logName: 'gateway', lines: 2 });
      assert.equal(logs.product_entry.mode, 'logs');
      assert.match(logs.product_entry.raw_output, /gateway ready/);

    });
  } finally {
    fs.rmSync(hermesFixture.fixtureRoot, { recursive: true, force: true });
  }
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
      opl: { dashboard_command: string };
    };
    assert.equal(domainContext?.project, 'redcube-ai');
    assert.equal(returnSurfaceContract.opl.dashboard_command, 'opl status dashboard');
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});
