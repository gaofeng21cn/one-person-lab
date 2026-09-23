import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { FrameworkContractError } from '../../src/kernel/contract-validation.ts';
import { parseJsonText } from '../../src/kernel/json-file.ts';
import {
  verifyAppComponentCompatibilityReceipt,
  writeAppComponentCompatibilityReceipt,
} from '../../src/read-models/operator/app-compatibility-receipt.ts';
import { runCli } from './cli/helpers.ts';

type JsonRecord = Record<string, any>;

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const cliEntrypoint = path.join(repoRoot, 'src', 'entrypoints', 'cli.ts');
const fixedNow = new Date('2026-07-31T03:00:00.000Z');
const contractRef =
  'contracts/app-install-exposure-policy.json#component_interoperability.compatibility_admission';

function sha256(bytes: string | Buffer) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function writeJson(filePath: string, value: unknown) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function readJson(filePath: string) {
  return parseJsonText(fs.readFileSync(filePath, 'utf8')) as JsonRecord;
}

function expectFailure(action: () => unknown, failureCode: string) {
  assert.throws(
    action,
    (error) => error instanceof FrameworkContractError
      && error.details?.failure_code === failureCode,
  );
}

function fixture(t: TestContext) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-compatibility-receipt-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const appAsar = path.join(root, 'app.asar');
  const buildReceipt = path.join(root, 'app-build-receipt.json');
  const subjectFile = path.join(root, 'subject.json');
  fs.writeFileSync(appAsar, 'installed-app-asar-bytes');
  writeJson(buildReceipt, {
    schema: 'opl_app_build_receipt.v1',
    build_id: 'app-build-fixture',
  });
  writeJson(subjectFile, {
    schema: 'opl_app_compatibility_subject.v1',
    owner: 'one-person-lab-app',
    selected_app_artifact: {
      owner_authority: 'one-person-lab-app',
      immutable_release_tag: 'v0.1.54',
      asset_url: 'https://example.invalid/One-Person-Lab.dmg',
      asset_name: 'One-Person-Lab.dmg',
      byte_size: 4096,
      sha256: `sha256:${'a'.repeat(64)}`,
    },
    installed_app_asar: {
      path: appAsar,
      sha256: sha256(fs.readFileSync(appAsar)),
    },
    build_receipt: {
      path: buildReceipt,
      sha256: sha256(fs.readFileSync(buildReceipt)),
    },
  });
  let serial = 0;
  const produce = (
    requirements: JsonRecord[],
    options: { ttlSeconds?: number; producerEntrypointFile?: string } = {},
  ) => {
    serial += 1;
    const requirementsFile = path.join(root, `requirements-${serial}.json`);
    const outputFile = path.join(root, `receipt-${serial}.json`);
    writeJson(requirementsFile, {
      schema: 'opl_component_compatibility_requirements.v1',
      owner: 'one-person-lab-app',
      contract_ref: contractRef,
      requirements,
    });
    const result = writeAppComponentCompatibilityReceipt(
      {
        requirementsFile,
        subjectFile,
        outputFile,
        ttlSeconds: options.ttlSeconds,
      },
      {
        now: () => fixedNow,
        producerEntrypointFile: options.producerEntrypointFile ?? cliEntrypoint,
      },
    );
    return { outputFile, requirementsFile, result, receipt: readJson(outputFile) };
  };
  return { root, appAsar, buildReceipt, subjectFile, produce };
}

function frameworkCapability(requirementId: string, capabilityId: string, schemaRange: string) {
  return {
    requirement_id: requirementId,
    component_id: 'opl_framework',
    kind: 'capability_id_with_versioned_schema',
    capability_id: capabilityId,
    schema_range: schemaRange,
  };
}

function frameworkRange(requirementId: string, versionRequirement: string) {
  return {
    requirement_id: requirementId,
    component_id: 'opl_framework',
    kind: 'semver_range',
    version_requirement: versionRequirement,
  };
}

function rewriteReceiptAndSidecar(outputFile: string, mutate: (receipt: JsonRecord) => void) {
  const receipt = readJson(outputFile);
  mutate(receipt);
  writeJson(outputFile, receipt);
  const digest = sha256(fs.readFileSync(outputFile)).slice('sha256:'.length);
  fs.writeFileSync(`${outputFile}.sha256`, `${digest}  ${path.basename(outputFile)}\n`);
}

test('Framework writes a file-bound receipt with exact coverage and producer byte identity', (t) => {
  const { produce } = fixture(t);
  const produced = produce([
    frameworkCapability(
      'receipt-capability',
      'opl_component_compatibility_receipt',
      '>=1.0.0 <2.0.0',
    ),
    frameworkCapability('app-action-capability', 'opl_app_action_execution', '^1.0.0'),
  ]);

  assert.equal(produced.result.status, 'compatible');
  assert.equal(produced.result.failure_count, 0);
  assert.equal(produced.result.requirement_count, 2);
  assert.equal(produced.receipt.schema, 'opl_component_compatibility_receipt.v1');
  assert.equal(produced.receipt.receipt_ref, pathToFileURL(fs.realpathSync(produced.outputFile)).href);
  assert.deepEqual(produced.result.producer_identity, produced.receipt.producer_identity);
  assert.equal(
    produced.receipt.producer_identity.command_surface,
    'opl app compatibility receipt',
  );
  assert.equal(produced.receipt.producer_identity.executable_path, cliEntrypoint);
  assert.match(produced.receipt.producer_identity.executable_sha256, /^sha256:[0-9a-f]{64}$/);
  assert.equal(produced.receipt.producer_identity.framework_version, '0.3.6');
  assert.equal(produced.receipt.producer_identity.package_ref, pathToFileURL(repoRoot).href);
  assert.deepEqual(
    produced.receipt.coverage.map((entry: JsonRecord) => entry.status),
    ['satisfied', 'satisfied'],
  );
  assert.deepEqual(
    produced.receipt.observed_components[0].capabilities.map(
      (entry: JsonRecord) => entry.capability_id,
    ),
    [
      'opl_app_state_projection',
      'opl_app_action_execution',
      'opl_dynamic_package_directory',
      'opl_component_compatibility_receipt',
    ],
  );
  assert.deepEqual(
    verifyAppComponentCompatibilityReceipt(produced.outputFile, { now: () => fixedNow }),
    produced.result,
  );
});

test('npm SemVer ranges support complete maintained-library forms and reject invalid ranges', (t) => {
  const { produce } = fixture(t);
  const accepted = [
    ['prerelease and build metadata', '>=0.3.5-rc.1+build.7 <0.4.0'],
    ['build metadata exact range', '0.3.6+producer.7'],
    ['hyphen range', '0.3.0 - 0.3.6'],
    ['partial range', '0.3.x'],
    ['comparator set', '>=0.3.0 <0.4.0'],
    ['OR range', '<0.1.0 || >=0.3.5'],
    ['caret range', '^0.3.5'],
    ['tilde range', '~0.3.0'],
  ] as const;
  for (const [label, range] of accepted) {
    const produced = produce([frameworkRange(label, range)]);
    assert.equal(produced.result.status, 'compatible', label);
  }

  const minimum = produce([{
    requirement_id: 'minimum-prerelease-build',
    component_id: 'opl_framework',
    kind: 'minimum_version',
    version_requirement: '0.3.5-rc.1+build.9',
  }]);
  assert.equal(minimum.result.status, 'compatible');

  expectFailure(
    () => produce([frameworkRange('invalid-range', '>=0.3.5 || definitely-not-semver')]),
    'component_compatibility_requirement_invalid',
  );
});

test('missing owner observations and unmet capability or version requirements fail closed', (t) => {
  const { produce } = fixture(t);
  const produced = produce([
    {
      requirement_id: 'unknown-shell',
      component_id: 'opl_shell',
      kind: 'semver_range',
      version_requirement: '>=1.0.0',
    },
    frameworkCapability('missing-capability', 'not_a_real_capability', '^1.0.0'),
    frameworkCapability('schema-too-new', 'opl_component_compatibility_receipt', '>=2.0.0'),
    {
      requirement_id: 'minimum-too-new',
      component_id: 'opl_framework',
      kind: 'minimum_version',
      version_requirement: '0.4.0',
    },
    frameworkRange('range-too-old', '<0.3.5'),
  ]);

  assert.equal(produced.result.status, 'incompatible');
  assert.equal(produced.result.failure_count, 5);
  assert.equal(produced.receipt.coverage[0].observation_ref, null);
  assert.deepEqual(
    produced.receipt.failures.map((entry: JsonRecord) => entry.code),
    [
      'incompatible_semver_range',
      'incompatible_missing_capability',
      'incompatible_capability_schema',
      'incompatible_minimum_version',
      'incompatible_semver_range',
    ],
  );
});

test('empty requirements, identity drift, symlinks, external entrypoints and expired receipts fail closed', (t) => {
  const state = fixture(t);
  expectFailure(
    () => state.produce([]),
    'component_compatibility_requirements_missing',
  );

  const symlinkEntrypoint = path.join(state.root, 'linked-cli.ts');
  fs.symlinkSync(cliEntrypoint, symlinkEntrypoint);
  expectFailure(
    () => state.produce(
      [frameworkRange('symlink', '^0.3.5')],
      { producerEntrypointFile: symlinkEntrypoint },
    ),
    'component_compatibility_evidence_invalid',
  );

  const externalEntrypoint = path.join(state.root, 'opl');
  fs.writeFileSync(externalEntrypoint, '#!/bin/sh\n');
  expectFailure(
    () => state.produce(
      [frameworkRange('external-global-opl', '^0.3.5')],
      { producerEntrypointFile: externalEntrypoint },
    ),
    'component_compatibility_producer_identity_invalid',
  );

  const produced = state.produce(
    [frameworkRange('short-lived', '^0.3.5')],
    { ttlSeconds: 60 },
  );
  expectFailure(
    () => verifyAppComponentCompatibilityReceipt(produced.outputFile, {
      now: () => new Date(fixedNow.getTime() + 60_000),
    }),
    'component_compatibility_receipt_expired',
  );

  rewriteReceiptAndSidecar(produced.outputFile, (receipt) => {
    receipt.producer_identity.executable_sha256 = `sha256:${'0'.repeat(64)}`;
  });
  expectFailure(
    () => verifyAppComponentCompatibilityReceipt(produced.outputFile, { now: () => fixedNow }),
    'component_compatibility_producer_identity_mismatch',
  );
});

test('source, subject and sidecar digest drift is rejected', (t) => {
  const state = fixture(t);
  const sourceDrift = state.produce([frameworkRange('source-drift', '^0.3.5')]);
  fs.appendFileSync(sourceDrift.requirementsFile, '\n');
  expectFailure(
    () => verifyAppComponentCompatibilityReceipt(sourceDrift.outputFile, { now: () => fixedNow }),
    'component_compatibility_source_drift',
  );

  const subjectDrift = state.produce([frameworkRange('subject-drift', '^0.3.5')]);
  fs.appendFileSync(state.appAsar, 'drift');
  expectFailure(
    () => verifyAppComponentCompatibilityReceipt(subjectDrift.outputFile, { now: () => fixedNow }),
    'component_compatibility_source_drift',
  );

  fs.writeFileSync(state.appAsar, 'installed-app-asar-bytes');
  const sidecarDrift = state.produce([frameworkRange('sidecar-drift', '^0.3.5')]);
  fs.writeFileSync(`${sidecarDrift.outputFile}.sha256`, `${'0'.repeat(64)}  receipt.json\n`);
  expectFailure(
    () => verifyAppComponentCompatibilityReceipt(sidecarDrift.outputFile, { now: () => fixedNow }),
    'component_compatibility_receipt_digest_mismatch',
  );
});

test('CLI envelope binds the exact receipt producer identity and SHA-256 sidecar', (t) => {
  const state = fixture(t);
  const requirementsFile = path.join(state.root, 'cli-requirements.json');
  const outputFile = path.join(state.root, 'cli receipt.json');
  writeJson(requirementsFile, {
    schema: 'opl_component_compatibility_requirements.v1',
    owner: 'one-person-lab-app',
    contract_ref: contractRef,
    requirements: [
      frameworkCapability(
        'gui-installed-acceptance',
        'opl_component_compatibility_receipt',
        '>=1.0.0 <2.0.0',
      ),
    ],
  });

  const output = runCli([
    'app',
    'compatibility',
    'receipt',
    '--requirements-file',
    requirementsFile,
    '--subject-file',
    state.subjectFile,
    '--output',
    outputFile,
    '--ttl-seconds',
    '900',
    '--json',
  ]);
  const envelope = output.app_component_compatibility_receipt;
  const receipt = readJson(outputFile);
  assert.equal(output.version, 'g2');
  assert.equal(envelope.receipt_file, fs.realpathSync(outputFile));
  assert.equal(envelope.status, 'compatible');
  assert.deepEqual(envelope.producer_identity, receipt.producer_identity);
  assert.equal(envelope.receipt_sha256, sha256(fs.readFileSync(outputFile)));
  assert.equal(envelope.sha256_file, `${fs.realpathSync(outputFile)}.sha256`);
  assert.equal(receipt.receipt_ref, pathToFileURL(fs.realpathSync(outputFile)).href);
});

test('bin/opl binds receipt producer identity to the exact App-executed launcher bytes', (t) => {
  const state = fixture(t);
  const launcher = fs.realpathSync(path.join(repoRoot, 'bin', 'opl'));
  const requirementsFile = path.join(state.root, 'launcher-requirements.json');
  const outputFile = path.join(state.root, 'launcher-receipt.json');
  writeJson(requirementsFile, {
    schema: 'opl_component_compatibility_requirements.v1',
    owner: 'one-person-lab-app',
    contract_ref: contractRef,
    requirements: [
      frameworkCapability(
        'gui-installed-acceptance',
        'opl_component_compatibility_receipt',
        '>=1.0.0 <2.0.0',
      ),
    ],
  });

  const launched = spawnSync(
    launcher,
    [
      'app',
      'compatibility',
      'receipt',
      '--requirements-file',
      requirementsFile,
      '--subject-file',
      state.subjectFile,
      '--output',
      outputFile,
      '--ttl-seconds',
      '300',
      '--json',
    ],
    {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        HOME: state.root,
        OPL_STATE_DIR: path.join(state.root, 'state'),
      },
    },
  );
  assert.equal(launched.status, 0, launched.stderr);
  const envelope = (parseJsonText(launched.stdout) as JsonRecord)
    .app_component_compatibility_receipt;
  const receipt = readJson(outputFile);
  assert.equal(receipt.producer_identity.executable_path, launcher);
  assert.equal(receipt.producer_identity.executable_sha256, sha256(fs.readFileSync(launcher)));
  assert.deepEqual(envelope.producer_identity, receipt.producer_identity);
});
