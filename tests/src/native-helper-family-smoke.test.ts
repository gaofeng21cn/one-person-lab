import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');

test('native family smoke indexes MAS and MAG workspaces without touching RCA', () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-smoke-'));
  const familyRoot = path.join(fixtureRoot, 'workspace');
  const helperBinDir = path.join(fixtureRoot, 'native-bin');
  fs.mkdirSync(helperBinDir, { recursive: true });
  writeDomainFixtures(familyRoot);
  writeHelperBinaries(helperBinDir);

  try {
    const result = runFamilySmoke(familyRoot, helperBinDir);
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.surface_kind, 'opl_native_helper_family_index_smoke');
    assert.deepEqual(Object.keys(output.domains), ['medautoscience', 'medautogrant']);
    assert.equal(output.domains.medautoscience.status, 'indexed');
    assert.equal(output.domains.medautogrant.status, 'indexed');
    assert.equal(output.domains.medautoscience.workspace_path, path.join(familyRoot, 'med-autoscience'));
    assert.equal(output.domains.medautogrant.workspace_path, path.join(familyRoot, 'med-autogrant'));
    assert.equal(output.registration_proof_summary.medautoscience.status, 'verified');
    assert.equal(output.registration_proof_summary.medautogrant.status, 'verified');
    assert.equal(output.domains.medautoscience.native_helper_consumption.registration.status, 'verified');
    assert.equal(output.domains.medautogrant.native_helper_consumption.proof.status, 'verified');
    assert.match(
      output.registration_proof_summary.medautogrant.proof_surface_ref,
      /native_helper_consumption\.proof_surface/,
    );
    assert.equal(JSON.stringify(output).includes('redcube'), false);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('native family smoke fixture mode validates declared registration and proof surfaces', () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-smoke-fixture-'));
  const helperBinDir = path.join(fixtureRoot, 'native-bin');
  fs.mkdirSync(helperBinDir, { recursive: true });
  writeHelperBinaries(helperBinDir);

  try {
    const result = spawnSync(process.execPath, [
      path.join(repoRoot, 'scripts/native-helper-family-smoke.mjs'),
      '--fixture',
      '--require-real-workspaces',
    ], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        OPL_FAMILY_WORKSPACE_ROOT: path.join(fixtureRoot, 'missing-family-root'),
        OPL_NATIVE_HELPER_BIN_DIR: helperBinDir,
      },
    });
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.fixture_mode, true);
    assert.deepEqual(Object.keys(output.domains), ['medautoscience', 'medautogrant']);
    assert.equal(output.domains.medautoscience.status, 'indexed');
    assert.equal(output.domains.medautogrant.status, 'indexed');
    assert.equal(output.registration_proof_summary.medautoscience.registration_status, 'verified');
    assert.equal(output.registration_proof_summary.medautogrant.proof_status, 'verified');
    assert.equal(
      output.domains.medautoscience.native_helper_consumption.authority_boundary.domain_truth_owner,
      'MedAutoScience',
    );
    assert.equal(
      output.domains.medautogrant.native_helper_consumption.authority_boundary.domain_truth_owner,
      'Med Auto Grant',
    );
    assert.equal(JSON.stringify(output).includes('redcube'), false);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('native family smoke fails closed when a declared proof projection is missing', () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-smoke-bad-proof-'));
  const familyRoot = path.join(fixtureRoot, 'workspace');
  const helperBinDir = path.join(fixtureRoot, 'native-bin');
  fs.mkdirSync(helperBinDir, { recursive: true });
  writeDomainFixtures(familyRoot, { omitMagProofProjection: true });
  writeHelperBinaries(helperBinDir);

  try {
    const result = runFamilySmoke(familyRoot, helperBinDir);
    assert.equal(result.status, 1);
    const output = JSON.parse(result.stdout);
    assert.equal(output.domains.medautoscience.status, 'indexed');
    assert.equal(output.domains.medautogrant.status, 'verification_failed');
    assert.equal(output.registration_proof_summary.medautogrant.proof_status, 'failed');
    assert.ok(
      output.domains.medautogrant.native_helper_consumption.errors.some(
        (error: { code: string }) => error.code === 'json_array_value_missing',
      ),
    );
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

function runFamilySmoke(familyRoot: string, helperBinDir: string) {
  return spawnSync(process.execPath, [
    path.join(repoRoot, 'scripts/native-helper-family-smoke.mjs'),
    '--require-real-workspaces',
  ], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      OPL_FAMILY_WORKSPACE_ROOT: familyRoot,
      OPL_NATIVE_HELPER_BIN_DIR: helperBinDir,
    },
  });
}

function writeHelperBinaries(helperBinDir: string) {
  for (const binary of ['opl-artifact-indexer', 'opl-state-indexer']) {
    fs.writeFileSync(
      path.join(helperBinDir, binary),
      `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const input = JSON.parse(fs.readFileSync(0, 'utf8') || '{}');
const helper = path.basename(process.argv[1]);
const result = helper === 'opl-artifact-indexer'
  ? { surface_kind: 'native_artifact_manifest', workspace_root: input.workspace_root, summary: { total_files_count: 2 }, files: [] }
  : { surface_kind: 'native_state_index', roots: [{ root: input.workspace_root, file_count: 2 }], json_validation: { checked_files_count: 1, invalid_files_count: 0, files: [] } };
process.stdout.write(JSON.stringify({
  protocol_version: 'opl_native_helper.v1',
  helper_id: helper,
  helper_version: '0.1.0',
  crate_name: 'opl-native-helper',
  crate_version: '0.1.0',
  ok: true,
  request_id: input.request_id,
  result,
  errors: [],
}) + '\\n');
`,
      { mode: 0o755 },
    );
  }
}

function writeDomainFixtures(
  familyRoot: string,
  options: { omitMagProofProjection?: boolean } = {},
) {
  writeMasFixture(path.join(familyRoot, 'med-autoscience'));
  writeMagFixture(path.join(familyRoot, 'med-autogrant'), options);
}

function writeMasFixture(repoPath: string) {
  fs.mkdirSync(path.join(repoPath, 'contracts', 'opl-gateway'), { recursive: true });
  fs.writeFileSync(path.join(repoPath, 'contracts', 'surface.json'), '{"ok":true}\n');
  fs.writeFileSync(path.join(repoPath, 'contracts', 'opl-gateway', 'native-helper-contract.json'), `${JSON.stringify({
    schema_version: 1,
    surface_kind: 'opl_native_helper_consumption_contract',
    contract_id: 'mas.opl_native_helper.consumption.v1',
    manager_surface_id: 'opl_runtime_manager',
    consumer_domain: 'medautoscience',
    helper_owner: 'one-person-lab',
    helper_language: 'rust',
    allowed_operations: ['index_only'],
    indexable_runtime_surface_refs: [
      '/skill_catalog/skills/0/domain_projection/runtime_continuity',
      '/progress_projection/domain_projection/research_runtime_control_projection',
      '/runtime_inventory',
    ],
    indexable_product_entry_surface_refs: [
      '/skill_catalog/skills/0/domain_projection/opl_runtime_manager_registration/domain_entry_surface',
      '/skill_catalog/skills/0/domain_projection/opl_runtime_manager_registration/registration_surface',
      '/artifact_inventory/artifact_surface',
      '/automation/automations/0',
    ],
    authority_boundary: {
      domain_truth_owner: 'MedAutoScience',
      helper_write_policy: 'no_domain_truth_writes',
      authoritative_truth_refs: [
        '/study_runtime_status',
        '/runtime_watch',
        '/publication_eval/latest.json',
        '/controller_decisions/latest.json',
      ],
    },
    excluded_scopes: [
      'domain_logic',
      'publication_gate',
      'evidence_or_review_ledger',
      'hermes_agent_implementation',
      'rca',
    ],
  }, null, 2)}\n`);
}

function writeMagFixture(
  repoPath: string,
  options: { omitMagProofProjection?: boolean },
) {
  fs.mkdirSync(path.join(repoPath, 'contracts', 'runtime-program'), { recursive: true });
  fs.writeFileSync(path.join(repoPath, 'contracts', 'surface.json'), '{"ok":true}\n');

  const managerConsumedProjection = [
    'domain_entry_contract',
    'runtime_control.semantic_closure',
    'skill_catalog.domain_projection.runtime_continuity',
    'skill_catalog.domain_projection.opl_runtime_manager_registration',
  ];
  const consumesMagSurfaces = [
    'runtime_control',
    'runtime_continuity',
    'opl_runtime_manager_registration',
    'native_helper_consumption',
  ];
  if (!options.omitMagProofProjection) {
    managerConsumedProjection.push(
      'skill_catalog.domain_projection.opl_runtime_manager_registration.native_helper_consumption.proof_surface',
    );
    consumesMagSurfaces.push('native_helper_consumption.proof_surface');
  }

  fs.writeFileSync(path.join(repoPath, 'contracts', 'runtime-program', 'current-program.json'), `${JSON.stringify({
    program_id: 'med-autogrant-mainline',
    runtime_owner: {
      runtime_manager_boundary: {
        manager: 'OPL Runtime Manager',
        mag_owned_truth: [
          'grant_run_id/workspace_id/draft_id/program_id identity boundary',
          'author-side route truth',
          'submission-ready export gate',
        ],
        manager_consumed_projection: managerConsumedProjection,
        manager_non_goals: [
          'grant-domain truth owner',
          'concrete authoring executor',
        ],
      },
    },
    ideal_target: {
      authoring_truth_owner: 'Med Auto Grant',
      opl_runtime_manager: {
        consumes_mag_surfaces: consumesMagSurfaces,
        does_not_own: [
          'grant authoring truth',
          'route truth',
          'submission-ready export gate',
        ],
      },
    },
  }, null, 2)}\n`);
}
