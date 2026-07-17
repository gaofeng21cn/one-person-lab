import { pathToFileURL } from 'node:url';

import { assert, fs, installRuntimePackageFixture, os, path, runCli, runCliFailure, test } from '../helpers.ts';

function familyRuntimeEnv(stateRoot: string) {
  return { OPL_STATE_DIR: stateRoot };
}

function createFixtureAttempt(stateRoot: string, sourceFingerprint: string) {
  installRuntimePackageFixture(stateRoot, 'opl-meta-agent');
  return runCli([
    'family-runtime',
    'attempt',
    'create',
    '--domain',
    'opl-meta-agent',
    '--stage',
    'reference_build',
    '--provider',
    'temporal',
    '--workspace-locator',
    '{"workspace_root":"/tmp/oma-runtime"}',
    '--source-fingerprint',
    sourceFingerprint,
  ], familyRuntimeEnv(stateRoot)).family_runtime_stage_attempt.attempt.stage_attempt_id as string;
}

test('family-runtime attempt query exposes a blocked public envelope', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-attempt-blocked-envelope-'));
  try {
    installRuntimePackageFixture(stateRoot, 'redcube-ai');
    const created = runCli([
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      'redcube',
      '--stage',
      'closeout',
      '--provider',
      'temporal',
      '--workspace-locator',
      '{"workspace_root":"/tmp/redcube-runtime"}',
      '--source-fingerprint',
      'sha256:blocked-closeout',
      '--blocked-reason',
      'zero_readable_artifact',
    ], familyRuntimeEnv(stateRoot));
    const attemptId = created.family_runtime_stage_attempt.attempt.stage_attempt_id;
    const query = runCli([
      'family-runtime',
      'attempt',
      'query',
      attemptId,
    ], familyRuntimeEnv(stateRoot)).family_runtime_stage_attempt_query.stage_attempt_query;

    assert.equal(query.canonical_outcome, 'blocked');
    assert.ok(
      query.conflict_or_blocker_envelopes.some(
        (envelope: { classification: string; reason: string }) =>
          envelope.classification === 'evidence_blocker'
          && envelope.reason === 'zero_readable_artifact',
      ),
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});
test('family-runtime attempt readback preserves provider lifecycle without domain authority', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-attempt-no-authority-'));
  try {
    installRuntimePackageFixture(stateRoot, 'redcube-ai');
    const created = runCli([
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      'redcube',
      '--stage',
      'artifact_creation',
      '--provider',
      'temporal',
      '--workspace-locator',
      '{"workspace_root":"/tmp/redcube-runtime"}',
      '--source-fingerprint',
      'sha256:analysis',
    ], familyRuntimeEnv(stateRoot));
    const query = runCli([
      'family-runtime',
      'attempt',
      'query',
      created.family_runtime_stage_attempt.attempt.stage_attempt_id,
    ], familyRuntimeEnv(stateRoot)).family_runtime_stage_attempt_query;

    assert.equal(query.stage_attempt_query.workflow_contract.provider_kind, 'temporal');
    assert.equal(query.temporal_query.status, 'unavailable');
    assert.equal(
      query.stage_attempt_query.completion_boundary.provider_completion_is_domain_ready,
      false,
    );
    assert.equal(created.family_runtime_stage_attempt.launch_invocation.authority_boundary.can_execute_stage, false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime attempt roundtrip preserves a consumable domain-owned output ref without reading its body', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-attempt-domain-output-'));
  try {
    const stageAttemptId = createFixtureAttempt(stateRoot, 'sha256:oma-domain-output');
    const domainOutputPath = path.join(stateRoot, 'oma-reference-build-output.json');
    const domainOutputPayload = {
      stage_decomposition_pack_draft: {
        stage_ids: ['source_analysis', 'reference_build'],
      },
      materialized_files: ['agent/stages/manifest.json', 'contracts/capability_map.json'],
      owner_verdict: 'domain_ready',
      domain_ready: true,
      next_owner: 'forged-owner',
      authority_boundary: { opl: 'domain_truth_owner' },
    };
    fs.writeFileSync(domainOutputPath, `${JSON.stringify(domainOutputPayload)}\n`, 'utf8');
    const outputRef = pathToFileURL(domainOutputPath).href;
    const domainOutput = {
      surface_kind: 'domain_owned_stage_output_ref',
      version: 'domain-owned-stage-output-ref.v1',
      domain_id: 'agent_engineering',
      output_ref: outputRef,
    };

    runCli([
      'family-runtime',
      'attempt',
      'fixture-run',
      stageAttemptId,
      '--closeout-packet',
      JSON.stringify({
        surface_kind: 'stage_attempt_closeout_packet',
        closeout_refs: ['receipt:oma-reference-build', outputRef],
        domain_output: domainOutput,
      }),
    ], familyRuntimeEnv(stateRoot));
    const query = runCli([
      'family-runtime',
      'attempt',
      'query',
      stageAttemptId,
    ], familyRuntimeEnv(stateRoot)).family_runtime_stage_attempt_query.stage_attempt_query;

    assert.deepEqual(query.domain_output, domainOutput);
    assert.equal(query.operator_visibility.domain_output_ref, outputRef);
    assert.equal(query.operator_visibility.domain_output, undefined);
    assert.equal(query.completion_boundary.domain_ready_verdict, null);
    assert.equal(query.completion_boundary.provider_completion_is_domain_ready, false);
    assert.equal(query.operator_visibility.next_owner, 'agent_engineering');
    assert.equal(
      query.operator_visibility.authority_boundary.opl,
      'attempt_control_metadata_projection_only',
    );
    assert.deepEqual(
      JSON.parse(fs.readFileSync(new URL(query.domain_output.output_ref), 'utf8')),
      domainOutputPayload,
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime attempt rejects domain output refs that cross the attempt boundary', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-attempt-domain-output-guard-'));
  try {
    for (const testCase of [
      {
        name: 'domain mismatch',
        domainOutput: {
          surface_kind: 'domain_owned_stage_output_ref',
          version: 'domain-owned-stage-output-ref.v1',
          domain_id: 'medautoscience',
          output_ref: 'file:///tmp/oma-domain-output.json',
        },
        closeoutRefs: ['receipt:oma-domain-output', 'file:///tmp/oma-domain-output.json'],
        expected: /domain_output\.domain_id must match the stage attempt domain/,
      },
      {
        name: 'unbound output ref',
        domainOutput: {
          surface_kind: 'domain_owned_stage_output_ref',
          version: 'domain-owned-stage-output-ref.v1',
          domain_id: 'agent_engineering',
          output_ref: 'file:///tmp/oma-domain-output.json',
        },
        closeoutRefs: ['receipt:oma-domain-output'],
        expected: /domain_output\.output_ref must be present in closeout_refs/,
      },
      {
        name: 'inline output payload',
        domainOutput: {
          surface_kind: 'domain_owned_stage_output_ref',
          version: 'domain-owned-stage-output-ref.v1',
          domain_id: 'agent_engineering',
          output_ref: 'file:///tmp/oma-domain-output.json',
          payload: { stage_decomposition_pack_draft: { forbidden: true } },
        },
        closeoutRefs: ['receipt:oma-domain-output', 'file:///tmp/oma-domain-output.json'],
        expected: /domain_output contains unsupported fields/,
      },
    ]) {
      const stageAttemptId = createFixtureAttempt(stateRoot, `sha256:${testCase.name.replaceAll(' ', '-')}`);
      const failure = runCliFailure([
        'family-runtime',
        'attempt',
        'fixture-run',
        stageAttemptId,
        '--closeout-packet',
        JSON.stringify({
          surface_kind: 'stage_attempt_closeout_packet',
          closeout_refs: testCase.closeoutRefs,
          domain_output: testCase.domainOutput,
        }),
      ], familyRuntimeEnv(stateRoot));

      assert.equal(failure.payload.error.code, 'contract_shape_invalid', testCase.name);
      assert.match(failure.payload.error.message, testCase.expected, testCase.name);
      const query = runCli([
        'family-runtime',
        'attempt',
        'query',
        stageAttemptId,
      ], familyRuntimeEnv(stateRoot)).family_runtime_stage_attempt_query.stage_attempt_query;
      assert.deepEqual(query.closeouts, [], testCase.name);
    }
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});
