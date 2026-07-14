import crypto from 'node:crypto';

import {
  assert,
  fs,
  os,
  path,
  runCli,
  runCliFailure,
  test,
} from '../helpers.ts';
import { provisionSubmissionResource } from '../../../../src/modules/pack/submission-resource-provisioning.ts';

const PACKAGE_RESOURCE_ID = 'frontiers_harvard_csl';
const HOST_RESOURCE_ID = 'frontiers_word_manuscript_template';

function sha256(content: string | Buffer) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function requirementsPayload(packagePath = 'resources/frontiers.csl') {
  return {
    surface_kind: 'fixture_submission_resource_requirements.v1',
    schema_version: 1,
    owner: 'fixture-domain',
    resources: {
      [PACKAGE_RESOURCE_ID]: {
        provisioning: 'package_bundled_or_host_exact_path',
        package_path: packagePath,
        path_env: 'OPL_FIXTURE_CSL_PATH',
      },
      [HOST_RESOURCE_ID]: {
        provisioning: 'host_exact_path_required',
        path_env: 'OPL_FIXTURE_TEMPLATE_PATH',
      },
    },
    missing_resource_output: {
      status: 'request_only',
      action_id: 'opl_pack_provision_submission_resource',
    },
    authority_boundary: {
      network_fallback_allowed: false,
      requires_existing_exact_path: true,
    },
  };
}

function writeRequirements(root: string, packagePath?: string) {
  const requirementsPath = path.join(root, 'submission-resource-requirements.json');
  fs.writeFileSync(
    requirementsPath,
    `${JSON.stringify(requirementsPayload(packagePath), null, 2)}\n`,
  );
  return requirementsPath;
}

function writePackageFixture(root: string, content = 'fixture-csl\n') {
  const packageRoot = path.join(root, 'package');
  const resourcePath = path.join(packageRoot, 'resources', 'frontiers.csl');
  fs.mkdirSync(path.dirname(resourcePath), { recursive: true });
  fs.writeFileSync(resourcePath, content);
  return { packageRoot, resourcePath };
}

function provisioningResult(output: any) {
  return output.pack_submission_resource_provisioning;
}

test('pack provision-submission-resource caches package bytes and is content-addressed and idempotent', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-pack-submission-resource-'));
  try {
    const requirementsPath = writeRequirements(root);
    const fixture = writePackageFixture(root);
    const destinationRoot = path.join(root, 'cache');
    const first = provisioningResult(runCli([
      'pack',
      'provision-submission-resource',
      '--requirements',
      requirementsPath,
      '--resource-id',
      PACKAGE_RESOURCE_ID,
      '--package-root',
      fixture.packageRoot,
      '--destination-root',
      destinationRoot,
    ]));

    const firstDigest = sha256('fixture-csl\n');
    assert.equal(first.status, 'provisioned');
    assert.equal(first.writes_performed, true);
    assert.equal(first.receipt.action_id, 'opl_pack_provision_submission_resource');
    assert.equal(first.receipt.source.kind, 'package_bundled_file');
    assert.equal(first.receipt.source.sha256, firstDigest);
    assert.equal(first.receipt.target.sha256, firstDigest);
    assert.equal(first.receipt.target.exact_path, path.join(destinationRoot, 'sha256', firstDigest));
    assert.equal(first.receipt.provisioned_resources[PACKAGE_RESOURCE_ID].cached_path, first.receipt.target.exact_path);
    assert.deepEqual(first.receipt.authority_boundary, {
      can_download_network_resource: false,
      can_write_domain_truth: false,
      can_mutate_artifact_body: false,
      can_mutate_domain_artifact: false,
      can_sign_owner_receipt: false,
      can_create_owner_receipt: false,
      can_create_typed_blocker: false,
      can_authorize_quality_verdict: false,
      can_authorize_submission_readiness: false,
    });
    assert.equal(fs.readFileSync(first.receipt.target.exact_path, 'utf8'), 'fixture-csl\n');
    assert.equal(JSON.parse(fs.readFileSync(first.receipt_path, 'utf8')).resource_id, PACKAGE_RESOURCE_ID);

    const second = provisioningResult(runCli([
      'pack',
      'provision-submission-resource',
      '--requirements',
      requirementsPath,
      '--resource-id',
      PACKAGE_RESOURCE_ID,
      '--package-root',
      fixture.packageRoot,
      '--destination-root',
      destinationRoot,
    ]));
    assert.equal(second.status, 'already_provisioned');
    assert.equal(second.writes_performed, false);
    assert.equal(second.receipt_path, first.receipt_path);

    fs.writeFileSync(fixture.resourcePath, 'changed-csl\n');
    const changed = provisioningResult(runCli([
      'pack',
      'provision-submission-resource',
      '--requirements',
      requirementsPath,
      '--resource-id',
      PACKAGE_RESOURCE_ID,
      '--package-root',
      fixture.packageRoot,
      '--destination-root',
      destinationRoot,
    ]));
    assert.equal(changed.status, 'provisioned');
    assert.notEqual(changed.receipt.target.exact_path, first.receipt.target.exact_path);
    assert.equal(fs.existsSync(first.receipt.target.exact_path), true);
    assert.equal(fs.existsSync(changed.receipt.target.exact_path), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('pack provision-submission-resource accepts an explicit stable host file and rejects expected digest drift', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-pack-submission-host-'));
  try {
    const requirementsPath = writeRequirements(root);
    const sourcePath = path.join(root, 'template.docx');
    const content = Buffer.from('fixture-docx-bytes');
    fs.writeFileSync(sourcePath, content);
    const destinationRoot = path.join(root, 'cache');

    const output = provisioningResult(runCli([
      'pack',
      'provision-submission-resource',
      '--requirements',
      requirementsPath,
      '--resource-id',
      HOST_RESOURCE_ID,
      '--source-path',
      sourcePath,
      '--expected-sha256',
      sha256(content),
      '--destination-root',
      destinationRoot,
    ]));
    assert.equal(output.receipt.source.kind, 'host_exact_file');
    assert.equal(output.receipt.requirement.path_env_guidance, 'OPL_FIXTURE_TEMPLATE_PATH');
    assert.equal(output.receipt.source.exact_path, sourcePath);

    const failed = runCliFailure([
      'pack',
      'provision-submission-resource',
      '--requirements',
      requirementsPath,
      '--resource-id',
      HOST_RESOURCE_ID,
      '--source-path',
      sourcePath,
      '--expected-sha256',
      '0'.repeat(64),
      '--destination-root',
      destinationRoot,
    ]);
    assert.equal(failed.payload.error.code, 'contract_shape_invalid');
    assert.match(failed.payload.error.message, /does not match expected_sha256/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('App submission-resource action supports a true zero-write inline-payload dry-run', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-pack-submission-app-'));
  try {
    const sourcePath = path.join(root, 'template.docx');
    const destinationRoot = path.join(root, 'must-not-exist');
    fs.writeFileSync(sourcePath, 'template');
    const output = runCli([
      'app',
      'action',
      'execute',
      '--action',
      'opl_pack_provision_submission_resource',
      '--payload',
      JSON.stringify({
        requirements_payload: requirementsPayload(),
        resource_id: HOST_RESOURCE_ID,
        source_path: sourcePath,
        destination_root: destinationRoot,
      }),
      '--dry-run',
    ]).app_action_execution;

    assert.equal(output.action_id, 'opl_pack_provision_submission_resource');
    assert.equal(output.delegated_surface, 'opl pack provision-submission-resource');
    assert.equal(output.result.pack_submission_resource_provisioning.status, 'dry_run');
    assert.equal(output.result.pack_submission_resource_provisioning.writes_performed, false);
    assert.equal(fs.existsSync(destinationRoot), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('package-bundled-or-host requirements can use an explicit host file and default OPL state cache', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-pack-submission-default-state-'));
  const previousStateRoot = process.env.OPL_STATE_DIR;
  try {
    const stateRoot = path.join(root, 'state');
    const sourcePath = path.join(root, 'frontiers.csl');
    fs.writeFileSync(sourcePath, 'host-supplied-csl');
    process.env.OPL_STATE_DIR = stateRoot;

    const output = provisioningResult(provisionSubmissionResource({
      requirements_payload: requirementsPayload(),
      resource_id: PACKAGE_RESOURCE_ID,
      source_path: sourcePath,
    }));
    assert.equal(output.receipt.source.kind, 'host_exact_file');
    assert.equal(
      output.receipt.target.exact_path.startsWith(
        path.join(stateRoot, 'pack', 'submission-resources', 'sha256') + path.sep,
      ),
      true,
    );
    assert.equal(fs.existsSync(output.receipt.target.exact_path), true);
  } finally {
    if (previousStateRoot === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previousStateRoot;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('submission-resource provisioning rejects package escape and symbolic links', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-pack-submission-paths-'));
  try {
    const fixture = writePackageFixture(root);
    const outsidePath = path.join(root, 'outside.csl');
    fs.writeFileSync(outsidePath, 'outside');

    const escapeRequirements = writeRequirements(root, '../outside.csl');
    const escaped = runCliFailure([
      'pack',
      'provision-submission-resource',
      '--requirements',
      escapeRequirements,
      '--resource-id',
      PACKAGE_RESOURCE_ID,
      '--package-root',
      fixture.packageRoot,
    ]);
    assert.match(escaped.payload.error.message, /must stay inside package_root/);

    const requirementsPath = writeRequirements(root);
    fs.rmSync(fixture.resourcePath);
    fs.symlinkSync(outsidePath, fixture.resourcePath);
    const symlinked = runCliFailure([
      'pack',
      'provision-submission-resource',
      '--requirements',
      requirementsPath,
      '--resource-id',
      PACKAGE_RESOURCE_ID,
      '--package-root',
      fixture.packageRoot,
    ]);
    assert.match(symlinked.payload.error.message, /must not contain symbolic links/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('submission-resource provisioning rejects URL, missing source, and path_env fallback', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-pack-submission-no-network-'));
  try {
    const requirementsPath = writeRequirements(root);
    const fromUrl = runCliFailure([
      'pack',
      'provision-submission-resource',
      '--requirements',
      requirementsPath,
      '--resource-id',
      HOST_RESOURCE_ID,
      '--source-path',
      'https://example.invalid/template.docx',
    ]);
    assert.match(fromUrl.payload.error.message, /URL and scheme fallbacks are forbidden/);

    const missing = runCliFailure([
      'pack',
      'provision-submission-resource',
      '--requirements',
      requirementsPath,
      '--resource-id',
      HOST_RESOURCE_ID,
      '--source-path',
      path.join(root, 'missing.docx'),
    ]);
    assert.equal(missing.payload.error.code, 'contract_file_missing');

    const envOnly = runCliFailure([
      'pack',
      'provision-submission-resource',
      '--requirements',
      requirementsPath,
      '--resource-id',
      HOST_RESOURCE_ID,
    ], {
      OPL_FIXTURE_TEMPLATE_PATH: path.join(root, 'secret-from-env.docx'),
    });
    assert.match(envOnly.payload.error.message, /needs exactly one explicit source_path/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('submission-resource provisioning fails when an exact host file changes during stable read', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-pack-submission-race-'));
  const originalReadFileSync = fs.readFileSync;
  try {
    const sourcePath = path.join(root, 'template.docx');
    fs.writeFileSync(sourcePath, 'first-bytes');
    let descriptorReadCount = 0;
    let changed = false;
    fs.readFileSync = ((candidate: fs.PathOrFileDescriptor, ...args: unknown[]) => {
      const bytes = originalReadFileSync(candidate, ...(args as [any]));
      if (typeof candidate === 'number') {
        descriptorReadCount += 1;
        if (descriptorReadCount === 1) {
          fs.writeFileSync(sourcePath, 'changed-byte');
          changed = true;
        }
      }
      return bytes;
    }) as typeof fs.readFileSync;

    assert.throws(
      () => provisionSubmissionResource({
        requirements_payload: requirementsPayload(),
        resource_id: HOST_RESOURCE_ID,
        source_path: sourcePath,
        destination_root: path.join(root, 'cache'),
      }),
      /changed while it was being read/,
    );
    assert.equal(changed, true);
    assert.equal(fs.existsSync(path.join(root, 'cache')), false);
  } finally {
    fs.readFileSync = originalReadFileSync;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('pack submission-resource CLI is registry-backed and discoverable', () => {
  const help = runCli(['help', 'pack', 'provision-submission-resource']).help;
  assert.equal(help.command, 'pack provision-submission-resource');
  assert.match(help.usage, /--requirements <path>/);
  assert.equal(help.registry.command_id, 'pack provision-submission-resource');
  assert.equal(help.registry.authority_boundary.can_write_domain_truth, false);
});
