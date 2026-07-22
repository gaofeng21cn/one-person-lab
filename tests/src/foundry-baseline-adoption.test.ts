import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { assertRepoJsonSchemaPayload } from '../../src/kernel/repo-json-schema.ts';
import {
  assertBaselineAdoptionAdmitted,
  BaselineAdoptionPreflightError,
  preflightFoundryBaselineAdoption,
  type BaselineAdoptionContentRefResolver,
  type BaselineAdoptionFailureCode,
  type BaselineAdoptionPreflightDependencies,
  type BaselineAdoptionPreflightReceipt,
} from '../../src/modules/foundry/baseline-adoption.ts';
import { InMemoryOwnerGate } from '../../src/modules/foundry/in-memory-adapters.ts';
import { FoundryKernel } from '../../src/modules/foundry/kernel.ts';
import type {
  ActivationPointer,
  AgentVersion,
  CandidateCompiler,
  DesignerPort,
  EvaluationExecutor,
  FoundryEventStore,
  FoundryObjectStore,
  MaterializedCandidate,
  VersionRegistry,
} from '../../src/modules/foundry/ports.ts';
import {
  validateDesignRequest,
  type DesignRequest,
} from '../../src/modules/foundry/protocol.ts';
import { startTemporalFoundryRunWorkflow } from '../../src/modules/runway/foundry-temporal-control.ts';

const fixtureRoot = path.join(process.cwd(), 'tests/fixtures/foundry-baseline-adoption');
const fixedNow = '2026-07-22T00:00:00.000Z';
const targetVersionRef = `sha256:${'1'.repeat(64)}`;

function fixture<T>(name: string): T {
  return JSON.parse(fs.readFileSync(path.join(fixtureRoot, name), 'utf8')) as T;
}

function sha256(file: string) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function positiveRequest() {
  return validateDesignRequest(fixture('positive-request.json'));
}

function targetVersion(input: Partial<AgentVersion> = {}): AgentVersion {
  return {
    surface_kind: 'opl_foundry_agent_version',
    version_id: 'version:medautoscience:fixture',
    version_digest: targetVersionRef,
    target_agent_id: 'medautoscience',
    target_domain_id: 'mas',
    blueprint_digest: `sha256:${'2'.repeat(64)}`,
    candidate_digest: `sha256:${'3'.repeat(64)}`,
    candidate_ref: `opl://foundry/candidate/sha256:${'3'.repeat(64)}`,
    qualification_digest: `sha256:${'4'.repeat(64)}`,
    created_at: fixedNow,
    ...input,
  };
}

function activePointer(input: Partial<ActivationPointer> = {}): ActivationPointer {
  return {
    surface_kind: 'opl_foundry_activation_pointer',
    target_agent_id: 'medautoscience',
    target_domain_id: 'mas',
    active_version_digest: targetVersionRef,
    revision: 7,
    updated_at: fixedNow,
    ...input,
  };
}

class SpyVersionRegistry implements VersionRegistry {
  readonly mutations = { register: 0, activate: 0, rollback: 0 };
  resolved: AgentVersion | null = targetVersion();
  pointer: ActivationPointer = activePointer();
  resolveError: Error | null = null;
  activationError: Error | null = null;

  async register(_input: Parameters<VersionRegistry['register']>[0]): Promise<never> {
    this.mutations.register += 1;
    throw new Error('preflight must not register an AgentVersion');
  }

  async list() {
    return this.resolved ? [structuredClone(this.resolved)] : [];
  }

  async resolveVersion() {
    if (this.resolveError) throw this.resolveError;
    return this.resolved ? structuredClone(this.resolved) : null;
  }

  async activation() {
    if (this.activationError) throw this.activationError;
    return structuredClone(this.pointer);
  }

  async activationHistory() {
    return [];
  }

  async compareAndSwapActivation(_input: Parameters<VersionRegistry['compareAndSwapActivation']>[0]): Promise<never> {
    this.mutations.activate += 1;
    throw new Error('preflight must not activate an AgentVersion');
  }

  async rollback(_input: Parameters<VersionRegistry['rollback']>[0]): Promise<never> {
    this.mutations.rollback += 1;
    throw new Error('preflight must not roll back an AgentVersion');
  }
}

function ownerGate(input: { registerReceipt?: boolean } = {}) {
  const gate = new InMemoryOwnerGate(() => fixedNow);
  gate.registerAuthorityPolicy({
    policy_ref: 'opl://foundry/authority-policies/fixture-mas',
    target_agent_id: 'medautoscience',
    target_domain_id: 'mas',
    authority_refs: ['opl://owner/fixture-mas'],
  });
  if (input.registerReceipt !== false) {
    const receipt = gate.register({
      surface_kind: 'opl_foundry_owner_authority_receipt',
      version: 'opl-foundry-owner-authority-receipt.v1',
      receipt_id: 'receipt:baseline-adoption:fixture:7',
      authority_ref: 'opl://owner/fixture-mas',
      action: 'authorize_improve',
      decision: 'approve',
      target_agent_id: 'medautoscience',
      target_domain_id: 'mas',
      run_id: 'foundry:baseline-adoption:fixture',
      version_digest: targetVersionRef,
      expected_revision: 7,
      issued_at: fixedNow,
    });
    assert.equal(receipt.receipt_ref, positiveRequest().baseline_adoption!.owner_authorization_ref);
  }
  return gate;
}

function contentResolver(request: DesignRequest, missing = new Set<string>()): BaselineAdoptionContentRefResolver {
  const available = new Set([
    ...request.source_refs,
    ...(request.baseline_adoption?.evidence_refs ?? []),
    ...(request.baseline_adoption?.qualification_obligation_refs ?? []),
  ]);
  return { has: (ref) => available.has(ref) && !missing.has(ref) };
}

function dependencies(input: {
  registry?: SpyVersionRegistry;
  gate?: InMemoryOwnerGate;
  contentRefs?: BaselineAdoptionContentRefResolver;
  omitContentResolver?: boolean;
} = {}): BaselineAdoptionPreflightDependencies & { versions: SpyVersionRegistry } {
  const request = positiveRequest();
  return {
    versions: input.registry ?? new SpyVersionRegistry(),
    ownerGate: input.gate ?? ownerGate(),
    ...(!input.omitContentResolver
      ? { contentRefs: input.contentRefs ?? contentResolver(request) }
      : {}),
    now: () => fixedNow,
  };
}

async function preflight(
  request: unknown,
  input: Parameters<typeof dependencies>[0] = {},
) {
  return preflightFoundryBaselineAdoption(
    { request, run_id: 'foundry:baseline-adoption:fixture' },
    dependencies(input),
  );
}

function assertBlocked(receipt: BaselineAdoptionPreflightReceipt, code: BaselineAdoptionFailureCode) {
  assert.equal(receipt.disposition, 'blocked');
  assert.equal(receipt.invocation_status, 'not_invoked');
  assert.equal(receipt.failure_codes.includes(code), true, JSON.stringify(receipt, null, 2));
  assert.deepEqual(receipt.authority_boundary, {
    authority_mutation_performed: false,
    foundry_object_written: false,
    foundry_run_created: false,
    provider_invoked: false,
    registry_written: false,
    qualification_established: false,
    activation_performed: false,
    rollback_performed: false,
    permissions_expanded: false,
  });
  assert.throws(() => assertBaselineAdoptionAdmitted(receipt), BaselineAdoptionPreflightError);
}

test('baseline adoption positive fixture binds exact version, owner, content, permissions, and obligations', async () => {
  const request = positiveRequest();
  for (const schemaRef of [
    'contracts/opl-framework/foundry-design-request.schema.json',
    'contracts/opl-framework/foundry-baseline-adoption-request.schema.json',
  ]) {
    const payload = schemaRef.endsWith('baseline-adoption-request.schema.json')
      ? request.baseline_adoption
      : request;
    assert.equal(assertRepoJsonSchemaPayload({
      repoRoot: process.cwd(),
      schemaRef,
      payload,
      label: schemaRef,
    }).status, 'valid');
  }

  const deps = dependencies();
  const receipt = await preflightFoundryBaselineAdoption(
    { request, run_id: 'foundry:baseline-adoption:fixture' },
    deps,
  );
  assert.equal(receipt.disposition, 'admitted');
  assert.equal(receipt.failure_code, null);
  assert.deepEqual(receipt.failure_codes, []);
  assert.equal(receipt.registered_version_ref, targetVersionRef);
  assert.equal(receipt.active_version_ref, targetVersionRef);
  assert.equal(receipt.activation_revision, 7);
  assert.equal(receipt.currentness.active_version_matches_target, true);
  assert.equal(receipt.content_refs_verified, true);
  assert.deepEqual(receipt.permission_refs, request.constraints.permission_refs);
  assert.deepEqual(deps.versions.mutations, { register: 0, activate: 0, rollback: 0 });
  assert.equal(assertRepoJsonSchemaPayload({
    repoRoot: process.cwd(),
    schemaRef: 'contracts/opl-framework/foundry-baseline-adoption-preflight-receipt.schema.json',
    payload: receipt,
    label: 'admitted baseline adoption receipt',
  }).status, 'valid');
});

test('baseline adoption hard stops are typed and fail closed', async (t) => {
  const base = positiveRequest();
  const staticCases: Array<[
    label: string,
    code: BaselineAdoptionFailureCode,
    mutate: (request: Record<string, any>) => void,
  ]> = [
    ['missing extension', 'foundry_baseline_adoption_contract_missing', (request) => delete request.baseline_adoption],
    ['invalid extension contract', 'foundry_baseline_adoption_contract_invalid', (request) => { request.baseline_adoption.version = 'invalid'; }],
    ['create cannot upgrade', 'foundry_baseline_adoption_mode_must_be_improve', (request) => { request.mode = 'create'; }],
    ['missing target version', 'foundry_baseline_adoption_target_version_missing', (request) => { request.target_version_ref = null; }],
    ['package lock is not a version', 'foundry_baseline_adoption_target_version_invalid', (request) => { request.target_version_ref = 'opl://agent-package-lock/mas/0.2.16/digest'; }],
    ['missing source refs', 'foundry_baseline_adoption_source_refs_missing', (request) => { request.source_refs = []; }],
    ['non-content source refs', 'foundry_baseline_adoption_source_refs_invalid', (request) => { request.source_refs = ['source:mutable']; }],
    ['missing evidence refs', 'foundry_baseline_adoption_evidence_refs_missing', (request) => { request.baseline_adoption.evidence_refs = []; }],
    ['non-content evidence refs', 'foundry_baseline_adoption_evidence_refs_invalid', (request) => { request.baseline_adoption.evidence_refs = ['evidence:mutable']; }],
    ['missing permission refs', 'foundry_baseline_adoption_permission_refs_missing', (request) => { request.constraints.permission_refs = []; }],
    ['missing qualification obligations', 'foundry_baseline_adoption_qualification_obligations_missing', (request) => { request.baseline_adoption.qualification_obligation_refs = []; }],
    ['non-content qualification obligations', 'foundry_baseline_adoption_qualification_obligations_invalid', (request) => { request.baseline_adoption.qualification_obligation_refs = ['qualification:mutable']; }],
    ['missing owner authorization', 'foundry_baseline_adoption_owner_authorization_missing', (request) => { request.baseline_adoption.owner_authorization_ref = null; }],
    ['invalid owner authorization', 'foundry_baseline_adoption_owner_authorization_invalid', (request) => { request.baseline_adoption.owner_authorization_ref = 'owner:unbound'; }],
  ];
  for (const [label, code, mutate] of staticCases) {
    await t.test(label, async () => {
      const request = structuredClone(base) as unknown as Record<string, any>;
      mutate(request);
      assertBlocked(await preflight(request), code);
    });
  }

  await t.test('missing FoundryRun lineage', async () => {
    assertBlocked(
      await preflightFoundryBaselineAdoption(
        { request: base, run_id: null },
        dependencies(),
      ),
      'foundry_baseline_adoption_run_id_missing',
    );
  });

  await t.test('content resolver is required', async () => {
    assertBlocked(await preflight(base, { omitContentResolver: true }), 'foundry_baseline_adoption_content_resolver_unconfigured');
  });
  await t.test('missing content bytes', async () => {
    const missing = new Set([base.baseline_adoption!.evidence_refs[0]!]);
    assertBlocked(
      await preflight(base, { contentRefs: contentResolver(base, missing) }),
      'foundry_baseline_adoption_content_unavailable',
    );
  });
  await t.test('package digest does not resolve as AgentVersion', async () => {
    const registry = new SpyVersionRegistry();
    registry.resolved = null;
    assertBlocked(await preflight(base, { registry }), 'foundry_baseline_adoption_target_version_unregistered');
  });
  await t.test('registry read failure', async () => {
    const registry = new SpyVersionRegistry();
    registry.resolveError = new Error('registry unavailable');
    assertBlocked(await preflight(base, { registry }), 'foundry_baseline_adoption_target_version_registry_unavailable');
  });
  await t.test('registry identity mismatch', async () => {
    const registry = new SpyVersionRegistry();
    registry.resolved = targetVersion({ target_domain_id: 'other-domain' });
    assertBlocked(await preflight(base, { registry }), 'foundry_baseline_adoption_registered_version_mismatch');
  });
  await t.test('activation currentness read failure', async () => {
    const registry = new SpyVersionRegistry();
    registry.activationError = new Error('currentness unavailable');
    assertBlocked(await preflight(base, { registry }), 'foundry_baseline_adoption_currentness_unavailable');
  });
  await t.test('missing active version', async () => {
    const registry = new SpyVersionRegistry();
    registry.pointer = activePointer({ active_version_digest: null });
    assertBlocked(await preflight(base, { registry }), 'foundry_baseline_adoption_active_version_missing');
  });
  await t.test('historical version cannot control current admission', async () => {
    const registry = new SpyVersionRegistry();
    registry.pointer = activePointer({ active_version_digest: `sha256:${'9'.repeat(64)}`, revision: 8 });
    const receipt = await preflight(base, { registry });
    assertBlocked(receipt, 'foundry_baseline_adoption_target_version_not_current');
    assert.equal(receipt.currentness.historical_evidence_retained, true);
  });
  await t.test('owner receipt must verify exact run, version, and activation revision', async () => {
    assertBlocked(
      await preflight(base, { gate: ownerGate({ registerReceipt: false }) }),
      'foundry_baseline_adoption_owner_authorization_unverified',
    );
  });
});

test('blocked Kernel admission performs zero object, event, provider, registry, or authority mutation', async () => {
  const request = positiveRequest();
  const registry = new SpyVersionRegistry();
  const writes = { objects: 0, events: 0, designer: 0, compiler: 0, evaluator: 0 };
  const objects: FoundryObjectStore = {
    async put<T>(_value: T) {
      writes.objects += 1;
      throw new Error('blocked preflight must not write an object');
    },
    async get<T>(_digest: string): Promise<T | null> {
      return null;
    },
  };
  const events: FoundryEventStore = {
    async create() {
      writes.events += 1;
      throw new Error('blocked preflight must not create a run');
    },
    async append(): Promise<never> {
      writes.events += 1;
      throw new Error('blocked preflight must not append a run');
    },
    async read() {
      return [];
    },
    async list() {
      return [];
    },
  };
  const designer: DesignerPort = {
    producer_id: 'designer:must-not-run',
    async design(): Promise<never> {
      writes.designer += 1;
      throw new Error('designer must not run');
    },
    async diagnose(): Promise<never> {
      writes.designer += 1;
      throw new Error('designer must not run');
    },
  };
  const compiler: CandidateCompiler = {
    async materialize(): Promise<MaterializedCandidate> {
      writes.compiler += 1;
      throw new Error('compiler must not run');
    },
  };
  const evaluator: EvaluationExecutor = {
    evaluator_id: 'evaluator:must-not-run',
    async evaluate(): Promise<never> {
      writes.evaluator += 1;
      throw new Error('evaluator must not run');
    },
    async canary(): Promise<never> {
      writes.evaluator += 1;
      throw new Error('evaluator must not run');
    },
  };
  const kernel = new FoundryKernel({
    designer,
    compiler,
    evaluator,
    objects,
    events,
    versions: registry,
    ownerGate: ownerGate({ registerReceipt: false }),
    baselineAdoptionContentRefs: contentResolver(request),
  });

  await assert.rejects(
    kernel.startBaselineAdoptionRun({ request, run_id: 'foundry:baseline-adoption:fixture' }),
    (error: unknown) => {
      assert.equal(error instanceof BaselineAdoptionPreflightError, true);
      assert.equal(
        (error as BaselineAdoptionPreflightError).receipt.failure_code,
        'foundry_baseline_adoption_owner_authorization_unverified',
      );
      return true;
    },
  );
  assert.deepEqual(writes, { objects: 0, events: 0, designer: 0, compiler: 0, evaluator: 0 });
  assert.deepEqual(registry.mutations, { register: 0, activate: 0, rollback: 0 });
});

test('Temporal control runs blocked baseline preflight before workflow creation', async () => {
  const request = positiveRequest();
  const blocked = await preflight(request, { gate: ownerGate({ registerReceipt: false }) });
  let preflightCalls = 0;
  await assert.rejects(
    startTemporalFoundryRunWorkflow(
      { request, run_id: 'foundry:baseline-adoption:fixture' },
      { addressOverride: '127.0.0.1:1', connectTimeoutMs: 1 },
      {
        preflightBaselineAdoption: async () => {
          preflightCalls += 1;
          return blocked;
        },
      },
    ),
    BaselineAdoptionPreflightError,
  );
  assert.equal(preflightCalls, 1);
});

test('legacy DesignRequest ABI remains valid without baseline adoption extension', () => {
  const base = fixture<Record<string, any>>('positive-request.json');
  delete base.baseline_adoption;
  base.request_id = 'request:legacy:create';
  base.mode = 'create';
  base.target_version_ref = null;
  base.source_refs = ['source:legacy'];
  base.constraints.permission_refs = [];
  const create = validateDesignRequest(base);
  assert.equal(create.mode, 'create');
  assert.equal(create.baseline_adoption, undefined);

  const improve = validateDesignRequest({
    ...base,
    request_id: 'request:legacy:improve',
    mode: 'improve',
    target_version_ref: targetVersionRef,
  });
  assert.equal(improve.mode, 'improve');
  assert.equal(improve.baseline_adoption, undefined);
  for (const payload of [create, improve]) {
    assert.equal(assertRepoJsonSchemaPayload({
      repoRoot: process.cwd(),
      schemaRef: 'contracts/opl-framework/foundry-design-request.schema.json',
      payload,
      label: 'legacy DesignRequest',
    }).status, 'valid');
  }
});

test('Study learning DesignRequest remains invalid and not invoked until exact authority inputs exist', async () => {
  const wrapper = fixture<Record<string, any>>('study-learning-design-request.not-invoked.json');
  const expectedReceipt = fixture<BaselineAdoptionPreflightReceipt>('study-learning-preflight-receipt.json');
  const acceptance = fixture<Record<string, any>>('study-learning-acceptance.json');
  assert.equal(wrapper.status, 'not_invoked');
  assert.throws(
    () => validateDesignRequest(wrapper.design_request_candidate),
    /exact target version digest/,
  );
  const actualReceipt = await preflightFoundryBaselineAdoption({
    request: wrapper.design_request_candidate,
    run_id: expectedReceipt.run_id,
  }, {
    versions: {
      async resolveVersion(): Promise<never> {
        throw new Error('static hard stop must precede registry read');
      },
      async activation(): Promise<never> {
        throw new Error('static hard stop must precede currentness read');
      },
    },
    ownerGate: {
      async verify(): Promise<never> {
        throw new Error('static hard stop must precede owner verification');
      },
    },
    now: () => expectedReceipt.checked_at,
  });
  assert.deepEqual(actualReceipt, expectedReceipt);
  assert.equal(assertRepoJsonSchemaPayload({
    repoRoot: process.cwd(),
    schemaRef: 'contracts/opl-framework/foundry-baseline-adoption-preflight-receipt.schema.json',
    payload: expectedReceipt,
    label: 'not-invoked baseline adoption receipt',
  }).status, 'valid');
  assert.equal(acceptance.preflight_expectation.invocation_status, 'not_invoked');
  assert.equal(acceptance.authority_boundary.oma_was_invoked, false);
});

test('content fixtures, PR4 audit, and authority boundary remain exact', () => {
  const acceptance = fixture<Record<string, any>>('study-learning-acceptance.json');
  const bindings = acceptance.input_bindings;
  const files = [
    ['study001_source_ref', 'study001-learning-source.json'],
    ['study002_source_ref', 'study002-learning-source.json'],
    ['qualification_obligations_ref', 'qualification-obligations.json'],
  ] as const;
  for (const [binding, name] of files) {
    assert.equal(bindings[binding], `opl-content://sha256/${sha256(path.join(fixtureRoot, name))}`);
  }
  assert.equal(
    bindings.design_request_candidate_sha256,
    `sha256:${sha256(path.join(fixtureRoot, 'study-learning-design-request.not-invoked.json'))}`,
  );
  assert.equal(
    bindings.preflight_receipt_sha256,
    `sha256:${sha256(path.join(fixtureRoot, 'study-learning-preflight-receipt.json'))}`,
  );
  assert.equal(
    bindings.pr4_audit_sha256,
    `sha256:${sha256(path.join(fixtureRoot, 'pr4-audit.json'))}`,
  );

  const audit = fixture<Record<string, any>>('pr4-audit.json');
  assert.equal(audit.aggregate_stable_patch_id, '43848a3aaa0abbbb1851e4c04811c9c6c84bf8fa');
  assert.deepEqual(audit.scope_boundary.pr_files_replayed, []);
  assert.equal(audit.scope_boundary.implicit_max_tokens_default_added, false);
  assert.equal(JSON.stringify(audit).includes('implicit_max_tokens_default_allowed'), false);

  const contract = fixture<Record<string, any>>('../../../contracts/opl-framework/foundry-baseline-adoption-contract.json');
  assert.equal(contract.forbidden_substitutions.package_digest_is_agent_version_ref, false);
  assert.equal(contract.forbidden_substitutions.package_installation_is_qualification, false);
  assert.equal(contract.provider_boundary.repo_patch_is_oma_output, false);
  assert.equal(contract.failure_policy.zero_authority_mutation_required, true);
});
