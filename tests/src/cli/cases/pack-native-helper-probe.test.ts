import crypto from 'node:crypto';

import { assert, fs, os, path, runCli, runCliFailure, test } from '../helpers.ts';
import { buildPackNativeHelperProbeReceipt } from '../../../../src/modules/pack/native-helper-probe.ts';

const FALSE_AUTHORITY = {
  can_write_domain_truth: false,
  can_mutate_artifact_body: false,
  can_sign_owner_receipt: false,
  can_create_typed_blocker: false,
  can_authorize_quality_verdict: false,
  can_authorize_export_readiness: false,
  can_claim_domain_ready: false,
  can_claim_production_ready: false,
};

function sha256(content: string | Buffer) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function writeDescriptor(root: string, overrides: Record<string, unknown> = {}) {
  const descriptorPath = path.join(root, 'native-helper.json');
  const descriptor = {
    surface_kind: 'opl_pack_native_helper_probe_descriptor',
    schema_version: 1,
    helper_id: 'fixture.helper',
    owner: 'fixture-domain',
    entrypoint_ref: 'helper.js',
    runtime_command: process.execPath,
    required_commands: [],
    authority_boundary: FALSE_AUTHORITY,
    ...overrides,
  };
  fs.writeFileSync(descriptorPath, `${JSON.stringify(descriptor, null, 2)}\n`);
  return descriptorPath;
}

test('pack native-helper probe binds resolved receipt to descriptor and helper content', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-pack-native-helper-'));
  try {
    const helperContent = 'process.stdout.write("fixture");\n';
    fs.writeFileSync(path.join(root, 'helper.js'), helperContent);
    const descriptorPath = writeDescriptor(root);

    const receipt = runCli([
      'pack',
      'native-helper',
      'probe',
      '--descriptor',
      descriptorPath,
    ]).pack_native_helper_probe_receipt;

    assert.equal(receipt.surface_kind, 'opl_pack_native_helper_probe_receipt');
    assert.equal(receipt.status, 'resolved');
    assert.equal(receipt.descriptor_sha256, sha256(fs.readFileSync(descriptorPath)));
    assert.equal(receipt.content_sha256, sha256(helperContent));
    assert.equal(receipt.runtime_command_probe.status, 'resolved');
    assert.deepEqual(receipt.required_command_probes, []);
    assert.deepEqual(receipt.authority_boundary, FALSE_AUTHORITY);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('pack native-helper probe returns a missing receipt without executing the helper', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-pack-native-helper-missing-'));
  try {
    fs.writeFileSync(path.join(root, 'helper.js'), 'throw new Error("must not execute");\n');
    const descriptorPath = writeDescriptor(root, {
      runtime_command: 'opl-command-that-does-not-exist',
      required_commands: ['another-missing-command'],
    });

    const receipt = runCli([
      'pack',
      'native-helper',
      'probe',
      '--descriptor',
      descriptorPath,
    ]).pack_native_helper_probe_receipt;

    assert.equal(receipt.status, 'missing');
    assert.equal(receipt.runtime_command_probe.status, 'missing');
    assert.deepEqual(receipt.missing_requirements, [
      'runtime_command:opl-command-that-does-not-exist',
      'required_command:another-missing-command',
    ]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('pack native-helper probe rejects entrypoint refs outside the descriptor root', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-pack-native-helper-invalid-'));
  try {
    const descriptorPath = writeDescriptor(root, { entrypoint_ref: '../helper.js' });
    assert.throws(
      () => runCli(['pack', 'native-helper', 'probe', '--descriptor', descriptorPath]),
      /entrypoint_ref must stay inside the descriptor directory/,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('pack native-helper probe rejects entrypoint symlinks outside the descriptor root', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-pack-native-helper-symlink-'));
  const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-pack-native-helper-outside-'));
  try {
    const outsideHelper = path.join(outsideRoot, 'helper.js');
    fs.writeFileSync(outsideHelper, 'process.exit(0);\n');
    fs.symlinkSync(outsideHelper, path.join(root, 'helper.js'));
    const descriptorPath = writeDescriptor(root);

    assert.throws(
      () => runCli(['pack', 'native-helper', 'probe', '--descriptor', descriptorPath]),
      /entrypoint_ref must stay inside the descriptor directory/,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(outsideRoot, { recursive: true, force: true });
  }
});

test('pack native-helper probe accepts entrypoint symlinks inside the descriptor root', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-pack-native-helper-internal-symlink-'));
  try {
    const helperContent = 'process.exit(0);\n';
    fs.writeFileSync(path.join(root, 'helper-target.js'), helperContent);
    fs.symlinkSync('helper-target.js', path.join(root, 'helper.js'));
    const descriptorPath = writeDescriptor(root);

    const receipt = runCli([
      'pack',
      'native-helper',
      'probe',
      '--descriptor',
      descriptorPath,
    ]).pack_native_helper_probe_receipt;

    assert.equal(receipt.status, 'resolved');
    assert.equal(receipt.content_sha256, sha256(helperContent));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('pack native-helper probe hashes the same contained file identity that it validates', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-pack-native-helper-race-'));
  const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-pack-native-helper-race-outside-'));
  const originalRealpathSync = fs.realpathSync;
  try {
    const entrypointPath = path.join(root, 'helper.js');
    const internalTarget = path.join(root, 'helper-target.js');
    const outsideTarget = path.join(outsideRoot, 'helper.js');
    const internalContent = 'process.stdout.write("internal");\n';
    const outsideContent = 'process.stdout.write("outside");\n';
    fs.writeFileSync(internalTarget, internalContent);
    fs.writeFileSync(outsideTarget, outsideContent);
    fs.symlinkSync('helper-target.js', entrypointPath);
    const descriptorPath = writeDescriptor(root);
    let swapped = false;
    fs.realpathSync = ((candidate: fs.PathLike) => {
      const resolved = originalRealpathSync(candidate);
      if (!swapped && path.resolve(String(candidate)) === entrypointPath) {
        fs.rmSync(entrypointPath);
        fs.symlinkSync(outsideTarget, entrypointPath);
        swapped = true;
      }
      return resolved;
    }) as typeof fs.realpathSync;

    const receipt = buildPackNativeHelperProbeReceipt(descriptorPath);

    assert.equal(swapped, true);
    assert.equal(receipt.content_sha256, sha256(internalContent));
    assert.notEqual(receipt.content_sha256, sha256(outsideContent));
  } finally {
    fs.realpathSync = originalRealpathSync;
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(outsideRoot, { recursive: true, force: true });
  }
});

test('pack native-helper probe parses and hashes one descriptor byte snapshot', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-pack-native-helper-descriptor-race-'));
  const originalReadFileSync = fs.readFileSync;
  const originalRealpathSync = fs.realpathSync;
  try {
    fs.writeFileSync(path.join(root, 'helper.js'), 'process.exit(0);\n');
    const descriptorPath = writeDescriptor(root, { helper_id: 'first.helper' });
    const firstBytes = fs.readFileSync(descriptorPath);
    const secondDescriptor = JSON.parse(firstBytes.toString('utf8')) as Record<string, unknown>;
    secondDescriptor.helper_id = 'second.helper';
    const secondBytes = Buffer.from(`${JSON.stringify(secondDescriptor, null, 2)}\n`);
    let swapped = false;
    const swapDescriptor = () => {
      if (swapped) return;
      const replacementPath = `${descriptorPath}.replacement`;
      fs.writeFileSync(replacementPath, secondBytes);
      fs.renameSync(replacementPath, descriptorPath);
      swapped = true;
    };
    fs.realpathSync = ((candidate: fs.PathLike) => {
      const resolved = originalRealpathSync(candidate);
      if (!swapped && path.resolve(String(candidate)) === descriptorPath) {
        swapDescriptor();
      }
      return resolved;
    }) as typeof fs.realpathSync;
    fs.readFileSync = ((candidate: fs.PathOrFileDescriptor, ...args: unknown[]) => {
      const content = originalReadFileSync(candidate, ...(args as [any]));
      if (!swapped && typeof candidate !== 'number' && path.resolve(String(candidate)) === descriptorPath) {
        swapDescriptor();
      }
      return content;
    }) as typeof fs.readFileSync;

    const receipt = buildPackNativeHelperProbeReceipt(descriptorPath);

    assert.equal(swapped, true);
    assert.equal(receipt.helper_id, 'second.helper');
    assert.equal(receipt.descriptor_sha256, sha256(secondBytes));
  } finally {
    fs.readFileSync = originalReadFileSync;
    fs.realpathSync = originalRealpathSync;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('pack native-helper probe rejects undeclared authority fields', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-pack-native-helper-authority-'));
  try {
    fs.writeFileSync(path.join(root, 'helper.js'), 'process.exit(0);\n');
    const descriptorPath = writeDescriptor(root, {
      authority_boundary: {
        ...FALSE_AUTHORITY,
        can_execute_domain_renderer: true,
      },
    });
    assert.throws(
      () => runCli(['pack', 'native-helper', 'probe', '--descriptor', descriptorPath]),
      /authority_boundary contains unknown fields/,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('pack native-helper probe is discoverable under OPL Pack help', () => {
  const help = runCli(['pack', 'native-helper']).help;
  assert.equal(help.command, 'pack native-helper');
  assert.equal(
    help.subcommands.some((entry: { command: string }) => entry.command === 'pack native-helper probe'),
    true,
  );
});

test('pack native-helper probe reports missing CLI arguments as usage errors', () => {
  const failure = runCliFailure(['pack', 'native-helper', 'probe']);
  assert.equal(failure.payload.error.code, 'cli_usage_error');
});
