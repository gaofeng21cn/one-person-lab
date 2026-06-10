import { assert, fs, os, path, runCli, runCliFailure, test } from '../helpers.ts';

function writeDescriptor(root: string, overrides: Record<string, unknown> = {}) {
  fs.mkdirSync(path.join(root, 'templates'), { recursive: true });
  fs.writeFileSync(path.join(root, 'templates', 'figure.json'), '{"kind":"template"}\n');
  fs.writeFileSync(path.join(root, 'schema.json'), '{"type":"object"}\n');

  const descriptor = {
    schema_version: 1,
    pack_id: 'mas.display.cli',
    version: '2.0.0',
    pack_kind: 'display_pack',
    owner: 'MedAutoScience',
    capabilities: [
      {
        capability_id: 'medical_display',
        capability_kind: 'display_template',
        entrypoint_ref: 'templates/figure.json',
        input_contract_ref: 'schema.json',
        output_contract_ref: 'paper/build/display_pack_lock.json',
      },
    ],
    resources: [
      {
        resource_id: 'template.medical_display',
        role: 'template',
        ref: 'templates/figure.json',
      },
      {
        resource_id: 'schema.input',
        role: 'schema',
        ref: 'schema.json',
      },
      {
        resource_id: 'audit.receipt',
        role: 'receipt_ref',
        ref: 'mas://paper/figure_visual_audit_receipt.json',
      },
    ],
    artifact_lifecycle: {
      states: ['declared', 'resolved', 'locked', 'review_receipts_observed', 'handoff_ready'],
      current_state: 'declared',
      artifact_locator_refs: ['paper/build/display_pack_lock.json#/publication_figure_quality_refs'],
      retention: {
        policy_ref: 'policy:retain-pack-locks',
        restore_proof_required: true,
      },
    },
    review_transport: {
      receipt_refs: ['paper/figure_visual_audit_receipt.json'],
      reviewer_adapter_refs: ['vlm-reviewer:display-audit'],
      receipt_transport_only: true,
      quality_verdict_owner: 'MedAutoScience',
    },
    authority_boundary: {
      can_write_domain_truth: false,
      can_mutate_artifact_body: false,
      can_sign_domain_owner_receipt: false,
      can_authorize_quality_verdict: false,
      can_authorize_publication_readiness: false,
      can_authorize_grant_readiness: false,
      can_authorize_visual_export_readiness: false,
      can_authorize_app_release_readiness: false,
      provider_completion_is_pack_quality_ready: false,
    },
    provenance: {
      source_ref: 'git:https://github.com/gaofeng21cn/med-autoscience.git',
      license_ref: 'license:internal',
      release_ref: 'git:main',
      descriptor_created_by: 'cli-test-fixture',
    },
    ...overrides,
  };

  const descriptorPath = path.join(root, 'display-pack.json');
  fs.writeFileSync(descriptorPath, `${JSON.stringify(descriptor, null, 2)}\n`);
  return descriptorPath;
}

test('pack os CLI inspects validates and writes refs-only locks', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-pack-os-cli-'));
  try {
    const descriptorPath = writeDescriptor(root);
    const inspect = runCli(['pack', 'os', 'inspect', '--descriptor', descriptorPath]).pack_os;
    assert.equal(inspect.surface_kind, 'opl_pack_os_inspection');
    assert.equal(inspect.pack_id, 'mas.display.cli');
    assert.equal(inspect.status, 'resolved');
    assert.equal(inspect.authority_boundary.can_authorize_publication_readiness, false);

    const validation = runCli(['pack', 'os', 'validate', '--descriptor', descriptorPath]).pack_os_validation;
    assert.equal(validation.status, 'valid');
    assert.equal(validation.checks.every((entry: { status: string }) => entry.status === 'pass'), true);

    const outputPath = path.join(root, 'build', 'pack-lock.json');
    const lockPayload = runCli(['pack', 'os', 'lock', '--descriptor', descriptorPath, '--output', outputPath]);
    assert.equal(lockPayload.pack_lock.surface_kind, 'opl_generic_pack_lock');
    assert.equal(lockPayload.pack_lock.summary.present_resource_count, 2);
    assert.equal(lockPayload.pack_lock_output.status, 'written');
    assert.match(lockPayload.pack_lock_output.sha256, /^[0-9a-f]{64}$/);
    const written = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
    assert.equal(written.lock_id, 'opl-pack-lock:mas.display.cli@2.0.0');
    assert.equal(written.authority_boundary.can_authorize_quality_verdict, false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('pack os CLI keeps false-authority violations fail-closed', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-pack-os-cli-invalid-'));
  try {
    const descriptorPath = writeDescriptor(root, {
      authority_boundary: {
        can_write_domain_truth: false,
        can_mutate_artifact_body: false,
        can_sign_domain_owner_receipt: false,
        can_authorize_quality_verdict: false,
        can_authorize_publication_readiness: true,
        can_authorize_grant_readiness: false,
        can_authorize_visual_export_readiness: false,
        can_authorize_app_release_readiness: false,
        provider_completion_is_pack_quality_ready: false,
      },
    });

    const failure = runCliFailure(['pack', 'os', 'validate', '--descriptor', descriptorPath]);
    assert.equal(failure.status, 3);
    assert.equal(failure.payload.error.code, 'contract_shape_invalid');
    assert.match(failure.payload.error.message, /can_authorize_publication_readiness must be false/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('pack os commands are discoverable under OPL Pack help and do not restore packages', () => {
  const help = runCli(['help', 'pack', 'os']);
  assert.equal(help.help.command, 'pack os');
  const subcommands = help.help.subcommands.map((entry: { command: string }) => entry.command);
  assert.equal(subcommands.includes('pack os inspect'), true);
  assert.equal(subcommands.includes('pack os lock'), true);
  assert.equal(subcommands.includes('pack os validate'), true);

  const rootHelp = runCli(['help']);
  assert.equal(
    rootHelp.help.commands.some((entry: { command: string }) => entry.command === 'packages manifest'),
    false,
  );
});
