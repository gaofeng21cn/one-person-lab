import crypto from 'node:crypto';

import { assert, fs, os, path, runCli, runCliFailure, test } from '../helpers.ts';

const AUTHORITY = {
  oma_authors_agent_building_semantics: true,
  oma_writes_target_agent_files: false,
  opl_owns_physical_scaffold_materialization: true,
  opl_owns_materialized_file_digests: true,
  opl_owns_final_build_receipt: true,
  build_receipt_candidate_is_final_receipt: false,
  opl_can_write_target_domain_truth: false,
  opl_can_authorize_quality_or_export: false,
};

function request(overrides: Record<string, unknown> = {}) {
  return {
    surface_kind: 'opl_agent_scaffold_materialization_request',
    version: 'opl-agent-scaffold-materialization-request.v1',
    canonical_schema_ref: 'contracts/opl-framework/agent-scaffold-materialization-request.schema.json',
    request_owner: 'opl-meta-agent',
    execution_owner: 'one-person-lab/OPL Foundry Lab',
    target_identity: { domain_id: 'fixture-agent', domain_label: 'Fixture Agent', target_agent_ref: 'domain-agent:fixture-agent' },
    overwrite_policy: {
      mode: 'replace_declared_files_only', allow_existing_target_dir: true,
      reject_absolute_paths: true, reject_parent_traversal: true, reject_symlink_escape: true,
      allowed_merge_object_paths: ['contracts/domain_descriptor.json', 'contracts/capability_map.json'],
    },
    files: [
      { path: 'contracts/domain_descriptor.json', body: '{"domain_id":"fixture-agent","kept":true}\n', role: 'domain_descriptor' },
      { path: 'contracts/capability_map.json', body: '{"capabilities":[]}\n', role: 'capability_map' },
      { path: 'contracts/pack_compiler_input.json', body: '{"required_domain_pack_paths":["agent/stages/manifest.json"]}\n', role: 'pack_input' },
      { path: 'agent/prompts/run.md', body: '# Run\n', role: 'prompt' },
    ],
    json_projections: [
      { path: 'contracts/domain_descriptor.json', value: { projected: true }, merge_policy: 'merge_object' },
      { path: 'contracts/capability_map.json', value: { owner: 'fixture-agent' }, merge_policy: 'merge_object' },
    ],
    stage_manifest: {
      path: 'agent/stages/manifest.json', value: { surface_kind: 'fixture_manifest' },
      write_policy: 'replace_declared_files_only',
    },
    contracts: [
      {
        path: 'contracts/action_catalog.json', value: { actions: [] },
        write_policy: 'replace_declared_files_only',
      },
      {
        path: 'contracts/stage_control_plane.json', value: { stages: [] },
        write_policy: 'replace_declared_files_only',
      },
    ],
    pack_compiler_input: { required_domain_pack_path_additions: ['agent/prompts/run.md'] },
    build_receipt_candidate: {
      surface_kind: 'opl_meta_agent_build_receipt', receipt_ref: 'build-receipt-ref:opl-meta-agent/fixture-agent',
      authority_boundary: { candidate_only: true },
    },
    build_receipt_installation: {
      expected_build_receipt_ref: 'build-receipt-ref:opl-meta-agent/fixture-agent',
      receipt_path: 'contracts/agent_build_receipt.json',
      projection_paths: ['contracts/domain_descriptor.json', 'contracts/capability_map.json', 'contracts/stage_control_plane.json'],
    },
    validation_requests: ['standard_domain_agent_scaffold', 'domain_pack_compiler', 'agent_profile_conformance'],
    authority_boundary: AUTHORITY,
    ...overrides,
  };
}

function sha256(bytes: Buffer) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function targetSnapshot(root: string) {
  if (!fs.existsSync(root)) return null;
  const files: Record<string, string> = {};
  const visit = (current: string) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) visit(absolute);
      if (entry.isFile()) files[path.relative(root, absolute)] = sha256(fs.readFileSync(absolute));
    }
  };
  visit(root);
  return files;
}

test('agents scaffold materializes only declared files and OPL-signs byte digests', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-scaffold-materialize-'));
  const target = path.join(root, 'target');
  const requestPath = path.join(root, 'request.json');
  fs.mkdirSync(target);
  fs.writeFileSync(path.join(target, 'unrelated.txt'), 'preserve');
  fs.writeFileSync(requestPath, JSON.stringify(request()));
  try {
    const scaffold = runCli([
      'agents', 'scaffold', '--materialize-request', requestPath, '--target-dir', target,
    ]).standard_domain_agent_scaffold;
    const receipt = scaffold.materialization_receipt;
    const descriptor = JSON.parse(fs.readFileSync(path.join(target, 'contracts/domain_descriptor.json'), 'utf8'));
    const packInput = JSON.parse(fs.readFileSync(path.join(target, 'contracts/pack_compiler_input.json'), 'utf8'));
    const buildReceipt = JSON.parse(fs.readFileSync(path.join(target, 'contracts/agent_build_receipt.json'), 'utf8'));
    assert.equal(receipt.status, 'materialized');
    assert.equal(descriptor.kept, true);
    assert.equal(descriptor.projected, true);
    assert.deepEqual(packInput.required_domain_pack_paths, ['agent/stages/manifest.json', 'agent/prompts/run.md']);
    assert.deepEqual(packInput.implementation_profile, {
      profile_id: 'opl.standard_domain_agent.v1',
      agent_identity: 'declarative_standard_agent_pack',
      pack_formats: ['markdown', 'json'],
      helpers: {
        optional: true,
        entries: [],
        language_is_identity: false,
        rust_policy: 'framework_hot_path_only',
      },
      generated_surfaces_owner: 'one-person-lab',
    });
    assert.equal(fs.readFileSync(path.join(target, 'unrelated.txt'), 'utf8'), 'preserve');
    assert.equal(buildReceipt.surface_kind, 'opl_foundry_agent_build_receipt');
    assert.equal(buildReceipt.version, 'opl.foundry.agent-build-receipt.v1');
    assert.equal(buildReceipt.receipt_timing, 'post_materialization');
    assert.equal(buildReceipt.receipt_ref, receipt.build_receipt_ref);
    for (const digest of receipt.materialized_file_digests) {
      assert.equal(digest.sha256, sha256(fs.readFileSync(path.join(target, digest.path))));
    }
    assert.equal(receipt.authority_boundary.materialization_receipt_can_claim_domain_ready, false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('agents scaffold applies a validated implementation profile override to pack input', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-scaffold-profile-'));
  const target = path.join(root, 'target');
  const requestPath = path.join(root, 'request.json');
  const implementationProfile = {
    profile_id: 'opl.standard_domain_agent.v1',
    agent_identity: 'declarative_standard_agent_pack',
    pack_formats: ['markdown', 'json'],
    helpers: {
      optional: true,
      entries: [{ language: 'python', role: 'domain_helper', source_roots: ['runtime/authority_functions/'] }],
      language_is_identity: false,
      rust_policy: 'framework_hot_path_only',
    },
    generated_surfaces_owner: 'one-person-lab',
  };
  fs.writeFileSync(requestPath, JSON.stringify(request({
    pack_compiler_input: {
      required_domain_pack_path_additions: ['agent/prompts/run.md'],
      implementation_profile: implementationProfile,
    },
  })));
  try {
    runCli(['agents', 'scaffold', '--materialize-request', requestPath, '--target-dir', target]);
    const packInput = JSON.parse(fs.readFileSync(path.join(target, 'contracts/pack_compiler_input.json'), 'utf8'));
    assert.deepEqual(packInput.implementation_profile, implementationProfile);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('agents scaffold rejects traversal, duplicate paths, and OMA final-receipt claims', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-scaffold-invalid-'));
  const target = path.join(root, 'target');
  const requestPath = path.join(root, 'request.json');
  try {
    for (const invalid of [
      request({ files: [{ path: '../escape', body: 'x', role: 'invalid' }] }),
      request({ contracts: [{ path: 'agent/stages/manifest.json', value: {}, write_policy: 'replace_declared_files_only' }] }),
      request({ build_receipt_candidate: { surface_kind: 'opl_agent_build_receipt', receipt_ref: 'build-receipt-ref:opl-meta-agent/fixture-agent' } }),
    ]) {
      fs.writeFileSync(requestPath, JSON.stringify(invalid));
      assert.equal(runCliFailure([
        'agents', 'scaffold', '--materialize-request', requestPath, '--target-dir', target,
      ]).payload.error.code, 'contract_shape_invalid');
      fs.rmSync(target, { recursive: true, force: true });
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('agents scaffold preflights malformed contracts, projections, and candidates before any target write', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-scaffold-preflight-'));
  const target = path.join(root, 'target');
  const requestPath = path.join(root, 'request.json');
  fs.mkdirSync(target);
  fs.writeFileSync(path.join(target, 'owner-file.txt'), 'must remain byte-identical\n');
  const baseline = targetSnapshot(target);
  const expectedReceiptRef = 'build-receipt-ref:opl-meta-agent/fixture-agent';
  const invalidRequests = [
    request({
      contracts: [{ path: 'contracts/action_catalog.json', value: {}, write_policy: 'append' }],
    }),
    request({
      build_receipt_installation: {
        expected_build_receipt_ref: expectedReceiptRef,
        receipt_path: 'contracts/agent_build_receipt.json',
        projection_paths: ['contracts/domain_descriptor.json'],
      },
    }),
    request({
      build_receipt_candidate: {
        surface_kind: 'opl_meta_agent_build_receipt',
        receipt_ref: expectedReceiptRef,
        receipt_timing: 'post_materialization',
      },
    }),
  ];
  try {
    for (const invalid of invalidRequests) {
      fs.writeFileSync(requestPath, JSON.stringify(invalid));
      assert.equal(runCliFailure([
        'agents', 'scaffold', '--materialize-request', requestPath, '--target-dir', target,
      ]).payload.error.code, 'contract_shape_invalid');
      assert.deepEqual(targetSnapshot(target), baseline);
    }
    const absentTarget = path.join(root, 'absent-target');
    fs.writeFileSync(requestPath, JSON.stringify(invalidRequests[2]));
    runCliFailure(['agents', 'scaffold', '--materialize-request', requestPath, '--target-dir', absentTarget]);
    assert.equal(fs.existsSync(absentTarget), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('agents scaffold rejects symlink traversal before writing', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-scaffold-symlink-'));
  const target = path.join(root, 'target');
  const outside = path.join(root, 'outside');
  const requestPath = path.join(root, 'request.json');
  fs.mkdirSync(target);
  fs.mkdirSync(outside);
  fs.symlinkSync(outside, path.join(target, 'contracts'));
  fs.writeFileSync(requestPath, JSON.stringify(request()));
  try {
    const failure = runCliFailure([
      'agents', 'scaffold', '--materialize-request', requestPath, '--target-dir', target,
    ]);
    assert.equal(failure.payload.error.code, 'contract_shape_invalid');
    assert.equal(fs.readdirSync(outside).length, 0);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
