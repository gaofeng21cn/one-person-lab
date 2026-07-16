import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { canonicalJsonBytes } from '../../src/kernel/canonical-json.ts';
import {
  FOUNDRY_PROTOCOL_VERSION,
  foundryContentDigest,
  foundryFrozenEvaluationPlanDigest,
  type AgentBlueprint,
  type AgentVersion,
  type DesignRequest,
  type MaterializedCandidate,
} from '../../src/modules/foundry/index.ts';
import { foundryEvaluationOperationIdentity } from '../../src/modules/foundry/operation-result.ts';
import { ProcessFoundryEvaluationExecutor } from '../../src/modules/runway/foundry-process-evaluator.ts';

const request: DesignRequest = {
  surface_kind: 'opl_foundry_design_request',
  version: FOUNDRY_PROTOCOL_VERSION,
  request_id: 'request:process-evaluator',
  mode: 'create',
  target_agent_id: 'fixture-agent',
  target_domain_id: 'fixture-domain',
  target_version_ref: null,
  objective: 'Evaluate one immutable candidate.',
  acceptance_criteria: ['The required case passes.'],
  non_goals: [],
  source_refs: ['source:fixture'],
  constraints: {
    capability_refs: ['capability:text'],
    permission_refs: [],
    privacy_requirements: ['privacy:no-sensitive-data'],
    cost_limits: { usd: 1 },
    latency_limits: { milliseconds: 1000 },
  },
  delivery_policy: { activation_mode: 'qualify_only', max_generations: 1 },
};

const inputSchemaRef = `opl-content://sha256/${'a'.repeat(64)}`;
const outputSchemaRef = `opl-content://sha256/${'b'.repeat(64)}`;

const blueprint: AgentBlueprint = {
  surface_kind: 'opl_foundry_agent_blueprint',
  version: FOUNDRY_PROTOCOL_VERSION,
  blueprint_id: 'blueprint:process-evaluator',
  target_agent_id: request.target_agent_id,
  target_domain_id: request.target_domain_id,
  target_version_ref: null,
  design_request_digest: `sha256:${'1'.repeat(64)}`,
  generation: 0,
  stage_graph: {
    entry_stage_id: 'deliver',
    stages: [{
      stage_id: 'deliver',
      stage_kind: 'domain_delivery',
      goal: 'Deliver the accepted output.',
      input_artifact_types: ['request'],
      output_artifact_types: ['delivery'],
      prompt_ref: 'prompt:fixture',
      skill_refs: [],
      knowledge_refs: [],
      capability_refs: ['capability:text'],
      next_stage_ids: [],
    }],
  },
  actions: [{
    action_id: 'deliver',
    summary: 'Deliver the fixture output.',
    entry_stage_id: 'deliver',
    input_schema_ref: inputSchemaRef,
    output_schema_ref: outputSchemaRef,
  }],
  artifact_contracts: [{
    artifact_type: 'delivery',
    schema_ref: outputSchemaRef,
    authority_owner_ref: 'owner:fixture',
  }],
  content_refs: {
    prompt_refs: ['prompt:fixture'],
    skill_refs: [],
    knowledge_refs: [],
    helper_refs: [],
    model_refs: ['model:fixture'],
    tool_refs: [],
    schema_refs: [inputSchemaRef, outputSchemaRef],
  },
  capability_requirements: ['capability:text'],
  authority_policy: {
    truth_owner_ref: 'owner:fixture',
    artifact_owner_ref: 'owner:fixture',
    quality_owner_ref: 'owner:fixture',
    permission_refs: [],
    generated_agent_can_modify_versions: false,
    generated_agent_can_modify_evaluation: false,
    generated_agent_can_modify_permissions: false,
    generated_agent_can_modify_activation: false,
  },
  memory_policy: { memory_classes: [], retention_refs: [], write_authority_refs: [] },
  assumptions: [],
  design_evidence_refs: ['evidence:design'],
  eval_spec: {
    eval_spec_id: 'eval:process-evaluator',
    public_cases: [{ case_id: 'case:required', test_ref: 'test:required', weight: 1, required: true }],
    protected_requirements: [{ category: 'privacy:no-sensitive-data', minimum_case_count: 1 }],
    gates: [{ gate_id: 'gate:required', metric: 'score', operator: 'gte', threshold: 1, required: true }],
    baseline_comparison: { required: false, regression_tolerance: 0 },
    independent_evaluator_required: true,
  },
  risk_hint: 'low',
};

const candidatePackRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-process-evaluator-packs-'));
const candidatePackRealRoot = fs.realpathSync.native(candidatePackRoot);
test.after(() => fs.rmSync(candidatePackRoot, { recursive: true, force: true }));
const candidateDirectories = new Map<string, string>();

function sha256(bytes: Buffer) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function exactCandidate(input: {
  target_agent_id?: string;
  target_domain_id?: string;
  blueprint_digest?: string;
  marker: string;
}): MaterializedCandidate {
  const blueprintDigest = input.blueprint_digest ?? `sha256:${'2'.repeat(64)}`;
  const manifestBytes = Buffer.from(`${input.marker}\n`, 'utf8');
  const files = [{
    path: 'agent/agent-pack.json',
    sha256: sha256(manifestBytes),
    byte_size: manifestBytes.byteLength,
  }];
  const candidateDigest = foundryContentDigest({
    surface_kind: 'opl_foundry_candidate_file_index',
    version: 'opl-foundry-candidate-index.v2',
    blueprint_digest: blueprintDigest,
    files,
  });
  const directory = path.join(candidatePackRoot, candidateDigest.slice('sha256:'.length));
  fs.mkdirSync(path.join(directory, 'agent'), { recursive: true });
  fs.writeFileSync(path.join(directory, files[0]!.path), manifestBytes);
  fs.writeFileSync(path.join(directory, 'candidate-index.json'), canonicalJsonBytes({
    surface_kind: 'opl_foundry_candidate_file_index',
    version: 'opl-foundry-candidate-index.v2',
    blueprint_digest: blueprintDigest,
    candidate_digest: candidateDigest,
    files,
  }));
  candidateDirectories.set(candidateDigest, directory);
  return {
    surface_kind: 'opl_foundry_materialized_candidate',
    target_agent_id: input.target_agent_id ?? request.target_agent_id,
    target_domain_id: input.target_domain_id ?? request.target_domain_id,
    blueprint_digest: blueprintDigest,
    candidate_digest: candidateDigest,
    candidate_ref: `opl://foundry/candidate/${candidateDigest}`,
    manifest_digest: `sha256:${sha256(manifestBytes)}`,
  };
}

const candidate = exactCandidate({ marker: 'candidate fixture' });
const candidatePackResolver = {
  resolveDirectory: (identity: { candidate_digest: string }) =>
    candidateDirectories.get(identity.candidate_digest) ?? path.join(candidatePackRoot, 'missing'),
};

const operationIdentity = foundryEvaluationOperationIdentity({
  run_id: 'run:process-evaluator',
  generation: 0,
  phase: 'evaluate',
  input_digest: `sha256:${'5'.repeat(64)}`,
});

function evaluatorScript(
  extraFields = '',
  candidateCostUsd = 0.25,
  safetyObservations = '[]',
  probe = '',
) {
  const planDigest = foundryFrozenEvaluationPlanDigest(blueprint.eval_spec);
  return `
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    const input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    ${probe}
    if (/hidden_test_bod|protected_test_bod/.test(JSON.stringify(input))) process.exit(91);
    if (!input.candidate_pack?.candidate_directory) process.exit(92);
    if ((input.baseline_version === null) !== (input.baseline_pack === null)) process.exit(93);
    if (input.protected_test_transport?.evaluator_resolves_target_owner_registry !== false) process.exit(94);
    if (JSON.stringify(input).includes(${JSON.stringify(candidatePackRealRoot)})) process.exit(95);
    if (input.execution_boundary?.mode !== 'offline_projected_pack_observation.v1'
      || input.execution_boundary?.dynamic_evaluation_owner !== 'opl_frozen_plan_evaluation_runtime'
      || input.execution_boundary?.candidate_access !== 'read_only_projected_bytes'
      || input.execution_boundary?.network_access !== false
      || input.execution_boundary?.child_process_access !== false
      || input.protected_test_transport?.trusted_harness_required_for_dynamic_cases !== true) process.exit(96);
    const hasBaseline = input.baseline_version !== null;
    const packFs = await import('node:fs');
    const observePack = (pack) => {
      const bytes = packFs.readFileSync(pack.candidate_directory + '/agent/agent-pack.json', 'utf8');
      const publicPassed = bytes.includes('fixture');
      const protectedPassed = !bytes.includes('sensitive-data');
      const indexRef = 'opl://foundry/candidate-index/' + encodeURIComponent(pack.candidate_index_digest);
      return { publicPassed, protectedPassed, indexRef };
    };
    const candidateObservation = observePack(input.candidate_pack);
    const baselineObservation = hasBaseline ? observePack(input.baseline_pack) : null;
    process.stdout.write(JSON.stringify({
      surface_kind: 'opl_foundry_evaluation_observation',
      version: 'opl-foundry-evaluation-observation.v1',
      evidence_id: 'evidence:process-evaluator',
      target_agent_id: input.request.target_agent_id,
      target_domain_id: input.request.target_domain_id,
      target_version_ref: input.request.target_version_ref,
      blueprint_digest: input.blueprint_digest,
      candidate_digest: input.candidate.candidate_digest,
      baseline_version_digest: input.baseline_version?.version_digest ?? null,
      frozen_test_plan_digest: '${planDigest}',
      public_results: [{
        case_id: 'case:required',
        status: candidateObservation.publicPassed ? 'pass' : 'fail',
        score: candidateObservation.publicPassed ? 1 : 0,
        evidence_refs: [candidateObservation.indexRef]
      }],
      baseline_public_results: hasBaseline
        ? [{
            case_id: 'case:required',
            status: baselineObservation.publicPassed ? 'pass' : 'fail',
            score: baselineObservation.publicPassed ? 1 : 0,
            evidence_refs: [baselineObservation.indexRef]
          }]
        : null,
      baseline_protected_aggregates: hasBaseline
        ? [{
            category: 'privacy:no-sensitive-data',
            total: 1,
            passed: baselineObservation.protectedPassed ? 1 : 0,
            failed: baselineObservation.protectedPassed ? 0 : 1,
            score: baselineObservation.protectedPassed ? 1 : 0
          }]
        : null,
      protected_aggregates: [{
        category: 'privacy:no-sensitive-data',
        total: 1,
        passed: candidateObservation.protectedPassed ? 1 : 0,
        failed: candidateObservation.protectedPassed ? 0 : 1,
        score: candidateObservation.protectedPassed ? 1 : 0
      }],
      candidate_cost_observations: { usd: ${candidateCostUsd} },
      candidate_latency_observations: { milliseconds: 250 },
      safety_observations: ${safetyObservations},
      safety_delta: { incidents: 0 },
      cost_delta: { usd: 0.25 },
      latency_delta: { milliseconds: 250 },
      failure_classification: [],
      provenance: {
        foundry_run_id: input.run_id,
        generation: input.blueprint.generation,
        producer_id: input.evaluator_id,
        evaluated_at: '2026-07-16T00:00:00.000Z',
        source_refs: [
          'evidence:evaluator-process',
          candidateObservation.indexRef,
          ...(baselineObservation ? [baselineObservation.indexRef] : []),
          'sandbox-root:' + input.candidate_pack.candidate_directory.split('/packs/')[0]
        ]
      }${extraFields}
    }));
  `;
}

const reviewerScript = `
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  const transport = JSON.stringify(input);
  if (/hidden_test_bod|protected_test_bod/.test(transport)) process.exit(91);
  if (input.protected_test_transport?.bodies_in_request !== false) process.exit(92);
  if (input.execution_boundary?.mode !== 'offline_projected_pack_observation.v1'
    || input.execution_boundary?.candidate_access !== 'none'
    || input.execution_boundary?.dynamic_evaluation_owner !== 'opl_frozen_plan_evaluation_runtime'
    || input.protected_test_transport?.trusted_harness_required_for_dynamic_cases !== true) process.exit(93);
  const passed = input.public_results.every((entry) => entry.status === 'pass')
    && input.protected_aggregates.every((entry) => entry.failed === 0)
    && input.gate_results.every((entry) => entry.passed);
  process.stdout.write(JSON.stringify({
    surface_kind: 'opl_foundry_independent_review_result',
    version: 'opl-foundry-independent-review-result.v1',
    verdict: passed ? 'pass' : 'fail',
    findings: passed ? [] : ['Offline projected-pack observations did not pass.'],
    evidence_refs: ['evidence:reviewer-process']
  }));
`;

function evaluator(extraFields = '', candidateCostUsd = 0.25, safetyObservations = '[]') {
  return new ProcessFoundryEvaluationExecutor({
    execution_mode: 'offline_projected_pack_observation.v1',
    executable: process.execPath,
    args: ['--input-type=module', '--eval', evaluatorScript(extraFields, candidateCostUsd, safetyObservations)],
    reviewer_executable: process.execPath,
    reviewer_args: ['--input-type=module', '--eval', reviewerScript],
    reviewer_id: 'reviewer:separate-process',
    candidate_pack_resolver: candidatePackResolver,
    timeout_ms: 10_000,
    reviewer_timeout_ms: 10_000,
  });
}

function evaluatorWithScripts(evaluatorSource: string, reviewerSource: string) {
  return new ProcessFoundryEvaluationExecutor({
    execution_mode: 'offline_projected_pack_observation.v1',
    executable: process.execPath,
    args: ['--input-type=module', '--eval', evaluatorSource],
    reviewer_executable: process.execPath,
    reviewer_args: ['--input-type=module', '--eval', reviewerSource],
    reviewer_id: 'reviewer:sandbox-probe',
    candidate_pack_resolver: candidatePackResolver,
    timeout_ms: 10_000,
    reviewer_timeout_ms: 10_000,
  });
}

function sandboxAttackProbe(input: {
  ownerRegistryFile: string;
  originalCandidateFile: string;
  writeTarget: string;
  networkPort: number;
  requireProjectedCandidate: boolean;
}) {
  return `
    const fs = await import('node:fs');
    const net = await import('node:net');
    const childProcess = await import('node:child_process');
    const workerThreads = await import('node:worker_threads');
    const attackSucceeded = [];
    const forbiddenPaths = ${JSON.stringify([input.ownerRegistryFile, input.originalCandidateFile])};
    if (process.env.OPL_FOUNDRY_SANDBOX_SECRET !== undefined) attackSucceeded.push('secret_env');
    for (const forbiddenPath of forbiddenPaths) {
      try {
        fs.readFileSync(forbiddenPath);
        attackSucceeded.push('host_read:' + forbiddenPath);
      } catch {}
    }
    if (forbiddenPaths.some((forbiddenPath) => JSON.stringify(input).includes(forbiddenPath))) {
      attackSucceeded.push('host_path_in_request');
    }
    try {
      fs.writeFileSync(${JSON.stringify(input.writeTarget)}, 'forbidden');
      attackSucceeded.push('file_write');
    } catch {}
    let networkConnected = false;
    await new Promise((resolve) => {
      let socket;
      try {
        socket = net.createConnection({ host: '127.0.0.1', port: ${input.networkPort} });
      } catch {
        resolve();
        return;
      }
      const timer = setTimeout(() => {
        socket.destroy();
        resolve();
      }, 250);
      socket.once('connect', () => {
        networkConnected = true;
        clearTimeout(timer);
        socket.destroy();
        resolve();
      });
      socket.once('error', () => {
        clearTimeout(timer);
        resolve();
      });
    });
    if (networkConnected) attackSucceeded.push('network');
    try {
      const spawned = childProcess.spawnSync(process.execPath, ['--version']);
      if (!spawned.error) attackSucceeded.push('child_process');
    } catch {}
    try {
      const worker = new workerThreads.Worker('0', { eval: true });
      attackSucceeded.push('worker');
      await worker.terminate();
    } catch {}
    ${input.requireProjectedCandidate ? `
      const projected = fs.readFileSync(
        input.candidate_pack.candidate_directory + '/agent/agent-pack.json',
        'utf8',
      );
      if (projected !== 'candidate fixture\\n') attackSucceeded.push('projected_candidate_mismatch');
    ` : ''}
    if (attackSucceeded.length > 0) {
      throw new Error('sandbox escape succeeded: ' + attackSucceeded.join(','));
    }
  `;
}

test('offline process observation stays non-qualification-grade even when evaluator and reviewer report pass', async () => {
  const processEvaluator = evaluator();
  const evidence = await processEvaluator.evaluate({
    operation_identity: operationIdentity,
    run_id: operationIdentity.run_id,
    request,
    blueprint,
    blueprint_digest: candidate.blueprint_digest,
    candidate,
    baseline_version: null,
  });

  assert.deepEqual(processEvaluator.qualification_capability, {
    status: 'observation_only',
    execution_mode: 'offline_projected_pack_observation.v1',
    protected_fact_authority: 'untrusted_process_observation',
  });
  assert.equal(evidence.qualified, false);
  assert.equal(evidence.gate_score, 1);
  assert.equal(evidence.independent_review.evaluator_ref, 'reviewer:separate-process');
  assert.equal(evidence.independent_review.verdict, 'blocked');
  assert.ok(evidence.independent_review.findings.includes(
    'Offline projected-pack observations are not qualification-grade; a Framework-owned FrozenPlan Evaluation Runtime must execute protected requirements.',
  ));
  assert.notEqual(
    evidence.independent_review.evaluation_execution_ref,
    evidence.independent_review.review_execution_ref,
  );
  assert.deepEqual(evidence.independent_review.evidence_refs, ['evidence:reviewer-process']);
  assert.ok(evidence.provenance.source_refs.includes(
    'opl://foundry/evaluation-capability/offline-projected-pack-observation-only',
  ));
  assert.deepEqual(evidence.candidate_cost_observations, { usd: 0.25 });
  assert.deepEqual(evidence.cost_delta, { usd: 0.25 });
  assert.deepEqual(evidence.latency_delta, { milliseconds: 250 });
});

test('offline process evaluation derives public and protected observations from exact projected bytes', async () => {
  const rejectedCandidate = exactCandidate({ marker: 'rejected candidate bytes' });
  const evidence = await evaluator().evaluate({
    operation_identity: operationIdentity,
    run_id: operationIdentity.run_id,
    request,
    blueprint,
    blueprint_digest: rejectedCandidate.blueprint_digest,
    candidate: rejectedCandidate,
    baseline_version: null,
  });

  assert.equal(evidence.public_results[0]?.status, 'fail');
  assert.equal(evidence.public_results[0]?.score, 0);
  assert.equal(evidence.independent_review.verdict, 'fail');
  assert.equal(evidence.qualified, false);
  assert.ok(evidence.public_results[0]?.evidence_refs.some((entry) =>
    entry.startsWith('opl://foundry/candidate-index/sha256%3A')));

  const sensitiveCandidate = exactCandidate({ marker: 'fixture with sensitive-data' });
  const sensitiveEvidence = await evaluator().evaluate({
    operation_identity: operationIdentity,
    run_id: operationIdentity.run_id,
    request,
    blueprint,
    blueprint_digest: sensitiveCandidate.blueprint_digest,
    candidate: sensitiveCandidate,
    baseline_version: null,
  });
  assert.equal(sensitiveEvidence.public_results[0]?.status, 'pass');
  assert.deepEqual(sensitiveEvidence.protected_aggregates, [{
    category: 'privacy:no-sensitive-data',
    total: 1,
    passed: 0,
    failed: 1,
    score: 0,
  }]);
  assert.equal(sensitiveEvidence.independent_review.verdict, 'fail');
  assert.equal(sensitiveEvidence.qualified, false);
});

test('process evaluator cannot self-report independent review or qualification fields', async () => {
  await assert.rejects(evaluator(`,
    independent_review: {
      evaluator_ref: 'reviewer:self-reported',
      evaluation_execution_ref: 'evaluation:self-reported',
      review_execution_ref: 'review:self-reported',
      verdict: 'pass', findings: [], evidence_refs: ['evidence:self-reported']
    },
    qualified: true,
    gate_score: 1
  `).evaluate({
    operation_identity: operationIdentity,
    run_id: operationIdentity.run_id,
    request,
    blueprint,
    blueprint_digest: candidate.blueprint_digest,
    candidate,
    baseline_version: null,
  }), /evaluation observation/i);
});

test('process evaluation applies absolute resource limits even when the comparison delta is small', async () => {
  const evidence = await evaluator('', 2).evaluate({
    operation_identity: operationIdentity,
    run_id: operationIdentity.run_id,
    request,
    blueprint,
    blueprint_digest: candidate.blueprint_digest,
    candidate,
    baseline_version: null,
  });

  assert.equal(evidence.qualified, false);
  assert.deepEqual(evidence.cost_delta, { usd: 0.25 });
  assert.ok(evidence.failure_classification.some((entry) =>
    entry.gate_id === 'request_constraint:cost:usd'
    && entry.failure_class === 'cost_constraint_exceeded'));
});

test('process evaluation cannot qualify high or critical safety observations', async () => {
  const evidence = await evaluator('', 0.25, JSON.stringify([{
    observation_id: 'safety:credential-exposure',
    event_type: 'credential_exposure',
    severity: 'critical',
    evidence_refs: ['evidence:safety:credential-exposure'],
  }])).evaluate({
    operation_identity: operationIdentity,
    run_id: operationIdentity.run_id,
    request,
    blueprint,
    blueprint_digest: candidate.blueprint_digest,
    candidate,
    baseline_version: null,
  });

  assert.equal(evidence.qualified, false);
  assert.deepEqual(evidence.failure_classification.filter((entry) =>
    entry.failure_class === 'safety_event'), [{
    failure_class: 'safety_event',
    gate_id: 'safety_observation:safety:credential-exposure',
    severity: 'critical',
    evidence_refs: ['evidence:safety:credential-exposure'],
  }]);
});

test('process evaluator transports exact candidate and baseline packs and rejects unavailable or drifted baseline bytes', async () => {
  const baselineCandidate = exactCandidate({
    marker: 'baseline fixture',
    blueprint_digest: `sha256:${'6'.repeat(64)}`,
  });
  const baseline: AgentVersion = {
    surface_kind: 'opl_foundry_agent_version',
    version_id: 'version:baseline',
    version_digest: `sha256:${'7'.repeat(64)}`,
    target_agent_id: baselineCandidate.target_agent_id,
    target_domain_id: baselineCandidate.target_domain_id,
    blueprint_digest: baselineCandidate.blueprint_digest,
    candidate_digest: baselineCandidate.candidate_digest,
    candidate_ref: baselineCandidate.candidate_ref,
    qualification_digest: `sha256:${'8'.repeat(64)}`,
    created_at: '2026-07-16T00:00:00.000Z',
  };
  const evidence = await evaluator().evaluate({
    operation_identity: operationIdentity,
    run_id: operationIdentity.run_id,
    request,
    blueprint,
    blueprint_digest: candidate.blueprint_digest,
    candidate,
    baseline_version: baseline,
  });
  assert.equal(evidence.baseline_version_digest, baseline.version_digest);
  assert.equal(evidence.baseline_public_results?.[0]?.status, 'pass');

  const missing = { ...baseline, candidate_digest: `sha256:${'9'.repeat(64)}` };
  await assert.rejects(evaluator().evaluate({
    operation_identity: operationIdentity,
    run_id: operationIdentity.run_id,
    request,
    blueprint,
    blueprint_digest: candidate.blueprint_digest,
    candidate,
    baseline_version: missing,
  }), /baseline candidate pack directory is unavailable/);

  const baselineDirectory = candidateDirectories.get(baseline.candidate_digest)!;
  fs.writeFileSync(path.join(baselineDirectory, 'agent/agent-pack.json'), 'baseline bytes drifted\n');
  await assert.rejects(evaluator().evaluate({
    operation_identity: operationIdentity,
    run_id: operationIdentity.run_id,
    request,
    blueprint,
    blueprint_digest: candidate.blueprint_digest,
    candidate,
    baseline_version: baseline,
  }), /baseline candidate bytes do not match the immutable file index/);
});

test('process evaluator and reviewer cannot escape their isolated sandboxes', async () => {
  const hostRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-evaluator-host-secrets-'));
  const ownerRegistryFile = path.join(hostRoot, 'owner-registry-secret.json');
  const writeTarget = path.join(hostRoot, 'forbidden-write.txt');
  fs.writeFileSync(ownerRegistryFile, '{"protected":"owner-only"}\n');
  const originalCandidateFile = fs.realpathSync.native(path.join(
    candidateDirectories.get(candidate.candidate_digest)!,
    'agent/agent-pack.json',
  ));
  let connections = 0;
  const server = net.createServer((socket) => {
    connections += 1;
    socket.destroy();
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const previousSecret = process.env.OPL_FOUNDRY_SANDBOX_SECRET;
  process.env.OPL_FOUNDRY_SANDBOX_SECRET = 'must-not-cross-process-boundary';

  try {
    const evaluatorProbe = sandboxAttackProbe({
      ownerRegistryFile: fs.realpathSync.native(ownerRegistryFile),
      originalCandidateFile,
      writeTarget,
      networkPort: address.port,
      requireProjectedCandidate: true,
    });
    const reviewerProbe = sandboxAttackProbe({
      ownerRegistryFile: fs.realpathSync.native(ownerRegistryFile),
      originalCandidateFile,
      writeTarget,
      networkPort: address.port,
      requireProjectedCandidate: false,
    });
    const sandboxReviewerScript = `
      const chunks = [];
      for await (const chunk of process.stdin) chunks.push(chunk);
      const input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      ${reviewerProbe}
      process.stdout.write(JSON.stringify({
        surface_kind: 'opl_foundry_independent_review_result',
        version: 'opl-foundry-independent-review-result.v1',
        verdict: 'pass',
        findings: [],
        evidence_refs: ['evidence:reviewer-sandbox', 'sandbox-root:' + process.cwd()]
      }));
    `;
    const evidence = await evaluatorWithScripts(
      evaluatorScript('', 0.25, '[]', evaluatorProbe),
      sandboxReviewerScript,
    ).evaluate({
      operation_identity: operationIdentity,
      run_id: operationIdentity.run_id,
      request,
      blueprint,
      blueprint_digest: candidate.blueprint_digest,
      candidate,
      baseline_version: null,
    });

    const evaluatorSandboxRef = evidence.provenance.source_refs.find((entry) =>
      entry.startsWith('sandbox-root:'));
    const reviewerSandboxRef = evidence.independent_review.evidence_refs.find((entry) =>
      entry.startsWith('sandbox-root:'));
    assert.ok(evaluatorSandboxRef);
    assert.ok(reviewerSandboxRef);
    const evaluatorSandbox = evaluatorSandboxRef.slice('sandbox-root:'.length);
    const reviewerSandbox = reviewerSandboxRef.slice('sandbox-root:'.length);
    assert.notEqual(evaluatorSandbox, reviewerSandbox);
    assert.equal(fs.existsSync(evaluatorSandbox), false);
    assert.equal(fs.existsSync(reviewerSandbox), false);
    assert.equal(fs.readFileSync(ownerRegistryFile, 'utf8'), '{"protected":"owner-only"}\n');
    assert.equal(fs.existsSync(writeTarget), false);
    assert.equal(connections, 0);
  } finally {
    if (previousSecret === undefined) delete process.env.OPL_FOUNDRY_SANDBOX_SECRET;
    else process.env.OPL_FOUNDRY_SANDBOX_SECRET = previousSecret;
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    fs.rmSync(hostRoot, { recursive: true, force: true });
  }
});

test('process evaluator cannot widen the injected Node permission policy', async () => {
  const unsafe = new ProcessFoundryEvaluationExecutor({
    execution_mode: 'offline_projected_pack_observation.v1',
    executable: process.execPath,
    args: ['--allow-net', '--input-type=module', '--eval', evaluatorScript()],
    reviewer_executable: process.execPath,
    reviewer_args: ['--input-type=module', '--eval', reviewerScript],
    candidate_pack_resolver: candidatePackResolver,
  });
  await assert.rejects(unsafe.evaluate({
    operation_identity: operationIdentity,
    run_id: operationIdentity.run_id,
    request,
    blueprint,
    blueprint_digest: candidate.blueprint_digest,
    candidate,
    baseline_version: null,
  }), /cannot widen sandbox permissions/);
});

test('process evaluation fails closed without a separately configured reviewer executable', async () => {
  const withoutReviewer = new ProcessFoundryEvaluationExecutor({
    execution_mode: 'offline_projected_pack_observation.v1',
    executable: process.execPath,
    args: ['--input-type=module', '--eval', evaluatorScript()],
    candidate_pack_resolver: candidatePackResolver,
  });
  await assert.rejects(withoutReviewer.evaluate({
    operation_identity: operationIdentity,
    run_id: operationIdentity.run_id,
    request,
    blueprint,
    blueprint_digest: candidate.blueprint_digest,
    candidate,
    baseline_version: null,
  }), /separately configured reviewer executable/);
});
