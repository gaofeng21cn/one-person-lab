import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { runPackDoctor } from '../../src/authority/packages/pack-doctor.ts';
import { runCliInProcess, runCliReadOnly } from './cli/helpers.ts';

function writeJson(filePath: string, payload: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

test('runPackDoctor probes declarative CLI, Python, and Node dependencies without side effects', (t) => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-pack-doctor-'));
  t.after(() => fs.rmSync(repo, { recursive: true, force: true }));

  fs.mkdirSync(path.join(repo, 'node_modules/sample-pkg'), { recursive: true });
  writeJson(path.join(repo, 'node_modules/sample-pkg/package.json'), {
    name: 'sample-pkg',
    version: '1.0.0',
  });
  writeJson(path.join(repo, 'contracts/pack_doctor.json'), {
    surface_kind: 'opl_pack_doctor_spec',
    schema_version: 1,
    pack_id: 'demo-pack',
    owner: 'demo',
    automatic_install_allowed: false,
    cli_checks: [
      { name: 'node', required: true, version_args: ['--version'] },
      { name: 'definitely_missing_binary_xyz', required: false, install_hint: 'brew install demo' },
    ],
    python_module_checks: [
      { module: 'json', required: true },
      { module: 'definitely_missing_mod_xyz', required: false },
    ],
    node_package_checks: [
      { name: 'sample-pkg', required: true },
      { name: 'definitely-missing-node-pkg', required: false },
    ],
  });

  const payload = runPackDoctor({ repoRoot: repo });
  assert.equal(payload.version, 'g2');
  const doctor = payload.pack_doctor;
  assert.equal(doctor.surface_kind, 'opl_pack_doctor_report');
  assert.equal(doctor.status, 'ok');
  assert.equal(doctor.pack_id, 'demo-pack');
  assert.equal(doctor.summary.total, 6);
  assert.equal(doctor.summary.ok, 3);
  assert.equal(doctor.summary.missing, 3);
  assert.equal(doctor.summary.required_missing, 0);
  assert.equal(doctor.dependency_install.automatic_install_allowed, false);
  assert.equal(doctor.authority_boundary.can_write_domain_truth, false);
  assert.equal(doctor.authority_boundary.can_claim_domain_ready, false);
});

test('runPackDoctor marks status degraded when a required dependency is missing and rejects auto-install specs', (t) => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-pack-doctor-degraded-'));
  t.after(() => fs.rmSync(repo, { recursive: true, force: true }));

  writeJson(path.join(repo, 'contracts/pack_doctor.json'), {
    surface_kind: 'opl_pack_doctor_spec',
    schema_version: 1,
    pack_id: 'demo-pack',
    owner: 'demo',
    cli_checks: [
      { name: 'definitely_missing_required_tool_xyz', required: true },
    ],
  });
  const degraded = runPackDoctor({ repoRoot: repo });
  assert.equal(degraded.pack_doctor.status, 'degraded');
  assert.equal(degraded.pack_doctor.summary.required_missing, 1);

  writeJson(path.join(repo, 'contracts/bad_doctor.json'), {
    surface_kind: 'opl_pack_doctor_spec',
    schema_version: 1,
    pack_id: 'demo-pack',
    owner: 'demo',
    automatic_install_allowed: true,
  });
  assert.throws(
    () => runPackDoctor({ repoRoot: repo, configRef: 'contracts/bad_doctor.json' }),
    /automatic_install_allowed/,
  );
  assert.throws(
    () => runPackDoctor({ repoRoot: repo, configRef: '../outside.json' }),
    /cleanly inside the repository/,
  );
});

test('CLI opl pack doctor preserves brand surface fallback and supports --repo declarative probing', async (t) => {
  const brandDoctor = await runCliReadOnly(['pack', 'doctor']);
  assert.equal(brandDoctor.brand_module_surface.surface_kind, 'opl_pack_brand_module_doctor');

  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-pack-doctor-cli-'));
  t.after(() => fs.rmSync(repo, { recursive: true, force: true }));
  writeJson(path.join(repo, 'contracts/pack_doctor.json'), {
    surface_kind: 'opl_pack_doctor_spec',
    schema_version: 1,
    pack_id: 'cli-pack',
    owner: 'cli',
    cli_checks: [{ name: 'node', required: true }],
  });

  const cliResult = await runCliInProcess(['pack', 'doctor', '--repo', repo]);
  assert.equal(cliResult.version, 'g2');
  assert.equal(cliResult.pack_doctor.pack_id, 'cli-pack');
  assert.equal(cliResult.pack_doctor.status, 'ok');
});
