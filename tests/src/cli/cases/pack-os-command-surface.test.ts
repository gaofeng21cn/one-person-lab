import { assert, fs, os, parseJsonText, path, runCli, runCliFailure, test } from '../helpers.ts';

function writeDescriptor(root: string, overrides: Record<string, unknown> = {}) {
  fs.mkdirSync(path.join(root, 'templates', 'figure'), { recursive: true });
  fs.writeFileSync(path.join(root, 'templates', 'figure', 'template.toml'), 'kind = "template"\n');
  fs.writeFileSync(path.join(root, 'schema.json'), '{"type":"object"}\n');

  const descriptor = {
    schema_version: 1,
    pack_id: 'mas.display.cli',
    version: '2.0.0',
    pack_kind: 'display_pack',
    owner: 'MedAutoScience',
    modes: ['final', 'candidate'],
    capabilities: [
      {
        capability_id: 'medical_display',
        capability_kind: 'display_template',
        entrypoint_ref: 'templates/figure/template.toml',
        input_contract_ref: 'schema.json',
        output_contract_ref: 'paper/build/display_pack_lock.json',
      },
    ],
    resources: [
      {
        resource_id: 'template.medical_display',
        role: 'template',
        ref: 'templates/figure/template.toml',
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

function writeMasDisplayPackV2Contract(root: string, overrides: Record<string, unknown> = {}) {
  const contract = {
    schema_version: 2,
    contract_id: 'display-pack-contract.v2',
    owner: 'MedAutoScience',
    purpose: 'MAS Display Pack v2 contract fixture',
    machine_boundary: 'MAS owns display truth; OPL consumes refs only.',
    source_module: 'src/med_autoscience/display_pack_v2_contract.py',
    pack_descriptor: {
      surface_kind: 'display_pack_v2_pack_descriptor',
      native_manifest: 'display_pack.toml',
      required_fields: [
        'pack_id',
        'version',
        'display_api_version',
        'source',
        'owner',
        'license',
        'templates',
        'style_profiles',
        'qc_profiles',
        'ai_policy',
        'goldens',
        'exemplars',
        'provenance',
        'opl_handoff',
      ],
    },
    template_descriptor: {
      surface_kind: 'display_pack_v2_template_descriptor',
      native_manifest: 'templates/<template_id>/template.toml',
      required_fields: [
        'template_id',
        'full_template_id',
        'kind',
        'display_name',
        'paper_family_ids',
        'audit_family',
        'renderer_family',
        'input_schema_ref',
        'qc_profile_ref',
        'style_profile_ref',
        'required_exports',
        'execution_mode',
        'entrypoint',
        'paper_proven',
        'golden_case_paths',
        'exemplar_refs',
      ],
      allowed_kinds: ['evidence_figure', 'illustration_shell', 'table_shell'],
      allowed_execution_modes: ['python_plugin', 'subprocess'],
      authority_boundary: 'Template descriptors do not authorize publication readiness.',
    },
    quality_surfaces: {
      publication_figure_quality_contract_ref: 'contracts/publication_figure_quality_contract.json',
      display_pack_lock_surface: 'paper/build/display_pack_lock.json',
      paper_quality_refs: [
        'paper/figure_intent.json',
        'paper/figure_spec.json',
        'paper/figure_style_reference_bundle.json',
        'paper/figure_visual_audit_receipt.json',
        'paper/figure_polish_lifecycle.json',
        'paper/ai_illustration_receipt.json',
      ],
      boundary: 'display_pack_lock.json preserves refs and hashes but does not become a publication verdict.',
    },
    authority_boundaries: {
      mas_pack_descriptor_authority: true,
      mas_publication_quality_authority: true,
      mas_owns_opl_generic_pack_os: false,
      opl_can_write_mas_publication_truth: false,
      display_pack_lock_can_authorize_publication_readiness: false,
      pack_descriptor_can_mutate_study_truth: false,
      ai_illustration_can_carry_scientific_claim: false,
    },
    opl_handoff: {
      surface_kind: 'display_pack_v2_opl_pack_os_handoff',
      status: 'handoff_tail',
      tail_status: 'not_landed_gap',
      target_owner: 'OPL Pack OS',
      target_capabilities: [
        'generic_pack_install',
        'generic_pack_registry',
        'generic_pack_version_resolution',
        'generic_pack_lock_projection',
        'generic_pack_submission_handoff',
        'generic_pack_asset_inventory',
      ],
      mas_current_capabilities: [
        'display_pack_toml_loader',
        'template_toml_loader',
        'display_pack_lock_refs',
        'publication_figure_quality_refs',
        'submission_manifest_ref_preservation',
      ],
      handoff_rule: 'MAS exposes refs and boundaries for OPL to consume later.',
      forbidden_claims: [
        'MAS owns generic OPL Pack OS',
        'Display Pack v2 contract closes the OPL generic pack substrate',
        'OPL tail is landed inside this repository',
      ],
    },
    ...overrides,
  };

  const contractPath = path.join(root, 'display-pack-contract.v2.json');
  fs.writeFileSync(contractPath, `${JSON.stringify(contract, null, 2)}\n`);
  return contractPath;
}

test('pack os CLI inspects validates and writes refs-only locks', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-pack-os-cli-'));
  try {
    const descriptorPath = writeDescriptor(root);
    const inspect = runCli(['pack', 'os', 'inspect', '--descriptor', descriptorPath]).pack_os;
    assert.equal(inspect.surface_kind, 'opl_pack_os_inspection');
    assert.equal(inspect.pack_id, 'mas.display.cli');
    assert.equal(inspect.status, 'resolved');
    assert.equal(inspect.descriptor_oci.digest, `sha256:${inspect.descriptor_sha256}`);
    assert.equal(inspect.content_addressed_lock_policy.registry_push_pull_implemented, false);
    assert.equal(inspect.authority_boundary.can_authorize_publication_readiness, false);

    const validation = runCli(['pack', 'os', 'validate', '--descriptor', descriptorPath]).pack_os_validation;
    assert.equal(validation.status, 'valid');
    assert.equal(validation.checks.every((entry: { status: string }) => entry.status === 'pass'), true);
    assert.equal(validation.content_addressed_lock_policy.lock_records_refs_only, true);

    const outputPath = path.join(root, 'build', 'pack-lock.json');
    const lockPayload = runCli(['pack', 'os', 'lock', '--descriptor', descriptorPath, '--output', outputPath]);
    assert.equal(lockPayload.pack_lock.surface_kind, 'opl_generic_pack_lock');
    assert.equal(lockPayload.pack_lock.summary.present_resource_count, 2);
    assert.equal(lockPayload.pack_lock.content_addressed_lock_policy.stores_artifact_body, false);
    assert.equal(lockPayload.pack_lock_output.status, 'written');
    assert.match(lockPayload.pack_lock_output.sha256, /^[0-9a-f]{64}$/);
    const written = parseJsonText(fs.readFileSync(outputPath, 'utf8')) as Record<string, any>;
    assert.equal(written.lock_id, 'opl-pack-lock:mas.display.cli@2.0.0');
    assert.equal(written.authority_boundary.can_authorize_quality_verdict, false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('generic pack aliases inspect check plan run and gallery without domain execution', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-pack-generic-cli-'));
  try {
    const descriptorPath = writeDescriptor(root);
    fs.copyFileSync(descriptorPath, path.join(root, 'opl_pack.json'));

    const inspect = runCli(['pack', 'inspect', '--pack', root]).opl_pack;
    assert.equal(inspect.surface_kind, 'opl_generic_pack_inspection');
    assert.equal(inspect.substrate, 'opl_pack_os');
    assert.equal(inspect.pack_id, 'mas.display.cli');
    assert.equal(inspect.authority_boundary.can_authorize_publication_readiness, false);

    const check = runCli(['pack', 'check', '--pack', root]).opl_pack_check;
    assert.equal(check.surface_kind, 'opl_generic_pack_check');
    assert.equal(check.status, 'valid');
    assert.equal(check.checks.every((entry: { status: string }) => entry.status === 'pass'), true);

    const run = runCli([
      'pack',
      'run',
      '--pack',
      root,
      '--action',
      'render',
      '--template',
      'figure',
      '--mode',
      'candidate',
    ]).opl_pack_run_plan;
    assert.equal(run.surface_kind, 'opl_generic_pack_run_plan');
    assert.equal(run.status, 'planned_refs_only');
    assert.equal(run.executable_runner_invoked, false);
    assert.equal(run.action, 'render');
    assert.equal(run.mode, 'candidate');
    assert.equal(run.not_claims.includes('publication_ready'), true);

    const unknownTemplate = runCliFailure([
      'pack',
      'run',
      '--pack',
      root,
      '--action',
      'render',
      '--template',
      'missing',
      '--mode',
      'candidate',
    ]);
    assert.equal(unknownTemplate.status, 2);
    assert.equal(unknownTemplate.payload.error.code, 'cli_usage_error');
    assert.match(unknownTemplate.payload.error.message, /template is not declared/);
    assert.equal(unknownTemplate.payload.error.details.supported_templates.includes('figure'), true);
    assert.equal(unknownTemplate.payload.error.details.supported_templates.includes('template.medical_display'), false);

    const unknownMode = runCliFailure([
      'pack',
      'run',
      '--pack',
      root,
      '--action',
      'render',
      '--template',
      'figure',
      '--mode',
      'preview',
    ]);
    assert.equal(unknownMode.status, 2);
    assert.equal(unknownMode.payload.error.code, 'cli_usage_error');
    assert.match(unknownMode.payload.error.message, /mode is not supported/);
    assert.deepEqual(unknownMode.payload.error.details.supported_modes, ['final', 'candidate']);

    const gallery = runCli(['pack', 'gallery', '--pack', root]).opl_pack_gallery_plan;
    assert.equal(gallery.surface_kind, 'opl_generic_pack_gallery_plan');
    assert.equal(gallery.status, 'planned_refs_only');
    assert.equal(gallery.executable_runner_invoked, false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('pack os CLI installs lists caches and distributes generic packs', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-pack-os-cli-install-'));
  try {
    const descriptorPath = writeDescriptor(root);
    const registryPath = path.join(root, 'registry', 'pack-registry.json');
    const cacheRoot = path.join(root, 'cache');
    const outputPath = path.join(root, 'dist', 'pack-distribution.json');

    const install = runCli([
      'pack',
      'os',
      'install',
      '--descriptor',
      descriptorPath,
      '--registry',
      registryPath,
      '--cache-root',
      cacheRoot,
    ]).pack_os_install;
    assert.equal(install.surface_kind, 'opl_pack_os_install_receipt');
    assert.equal(install.status, 'installed');
    assert.equal(install.registry_entry.registry_key, 'mas.display.cli@2.0.0');
    assert.equal(install.cache_manifest.summary.cached_resource_count, 2);
    assert.equal(install.cache_manifest.content_addressed_lock_policy.external_refs_cached, false);
    assert.equal(install.registry_entry.authority_boundary.can_write_domain_truth, false);

    const registry = runCli(['pack', 'os', 'registry', '--registry', registryPath]).pack_os_registry;
    assert.equal(registry.surface_kind, 'opl_pack_os_registry');
    assert.equal(registry.status, 'available');
    assert.equal(registry.entries.length, 1);
    assert.equal(registry.entries[0].registry_key, 'mas.display.cli@2.0.0');
    assert.equal(registry.entries[0].content_addressed_lock_policy.writes_domain_truth, false);

    const cache = runCli([
      'pack',
      'os',
      'cache',
      '--descriptor',
      descriptorPath,
      '--cache-root',
      cacheRoot,
    ]).pack_os_cache;
    assert.equal(cache.surface_kind, 'opl_pack_os_cache_manifest');
    assert.equal(cache.summary.cached_resource_count, 2);
    assert.equal(cache.content_addressed_lock_policy.present_local_resource_digest_required, true);
    assert.equal(cache.cached_resources.every((entry: { cache_ref: string }) => /^sha256\//.test(entry.cache_ref)), true);

    const distribution = runCli([
      'pack',
      'os',
      'distribute',
      '--descriptor',
      descriptorPath,
      '--output',
      outputPath,
      '--cache-root',
      cacheRoot,
    ]).pack_os_distribution;
    assert.equal(distribution.surface_kind, 'opl_pack_os_distribution_manifest');
    assert.equal(distribution.status, 'written');
    assert.equal(distribution.bundle.pack_lock.lock_id, 'opl-pack-lock:mas.display.cli@2.0.0');
    assert.equal(distribution.bundle.content_addressed_lock_policy.closes_stage, false);
    assert.equal(distribution.bundle.cache_manifest.summary.cached_resource_count, 2);
    assert.equal(distribution.bundle.not_claims.includes('quality_verdict'), true);

    const written = parseJsonText(fs.readFileSync(outputPath, 'utf8')) as Record<string, any>;
    assert.equal(written.surface_kind, 'opl_pack_os_distribution_bundle');
    assert.equal(written.authority_boundary.can_authorize_publication_readiness, false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('pack os CLI consumes MAS Display Pack v2 contract as refs-only smoke', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-pack-os-cli-mas-display-'));
  try {
    const contractPath = writeMasDisplayPackV2Contract(root);
    const outputPath = path.join(root, 'build', 'mas-display-lock.json');
    const smoke = runCli([
      'pack',
      'os',
      'mas-display-smoke',
      '--contract',
      contractPath,
      '--output',
      outputPath,
    ]);

    assert.equal(smoke.pack_os_display_pack_v2_smoke.status, 'pass');
    assert.equal(smoke.pack_os_display_pack_v2_smoke.domain_authority_owner, 'MedAutoScience');
    assert.equal(smoke.pack_os_display_pack_v2_smoke.pack_lock.summary.artifact_locator_ref_count, 7);
    assert.equal(
      smoke.pack_os_display_pack_v2_smoke.pack_lock.authority_boundary.can_authorize_publication_readiness,
      false,
    );
    assert.equal(smoke.pack_lock_output.status, 'written');
    const written = parseJsonText(fs.readFileSync(outputPath, 'utf8')) as Record<string, any>;
    assert.equal(written.lock_id, 'opl-pack-lock:mas.display-pack.v2@2.0.0');
    assert.equal(written.review_transport.quality_verdict_owner, 'MedAutoScience');
    assert.equal(written.not_claims.includes('quality_verdict'), true);
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
  assert.equal(subcommands.includes('pack os install'), true);
  assert.equal(subcommands.includes('pack os registry'), true);
  assert.equal(subcommands.includes('pack os cache'), true);
  assert.equal(subcommands.includes('pack os distribute'), true);
  assert.equal(subcommands.includes('pack os lock'), true);
  assert.equal(subcommands.includes('pack os validate'), true);
  assert.equal(subcommands.includes('pack os mas-display-smoke'), true);

  const rootHelp = runCli(['help']);
  assert.equal(
    rootHelp.help.commands.some((entry: { command: string }) => entry.command === 'packages manifest'),
    false,
  );
});
