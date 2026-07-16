import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { canonicalJsonBytes, canonicalJsonText } from '../../src/kernel/canonical-json.ts';
import {
  LedgerFoundryOperationResultJournal,
  LedgerVersionRegistry,
  foundryStoragePaths,
} from '../../src/modules/ledger/foundry-persistent-adapters.ts';
import { foundryEvaluationOperationIdentity } from '../../src/modules/foundry/operation-result.ts';
import {
  FOUNDRY_PROTOCOL_VERSION,
  foundryContentDigest,
  type AgentBlueprint,
} from '../../src/modules/foundry/protocol.ts';
import type {
  ActivationPointer,
  ActivationTransaction,
  AgentVersion,
  MaterializedCandidate,
  QualificationRecord,
} from '../../src/modules/foundry/ports.ts';

const TARGET_AGENT_ID = 'persistent-fixture-agent';
const TARGET_DOMAIN_ID = 'persistent_fixture_domain';

function sha256(value: string | Buffer) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function digest(value: unknown) {
  return `sha256:${sha256(canonicalJsonText(value))}`;
}

function fixtureDigest(label: string) {
  return `sha256:${sha256(label)}`;
}

function registryDirectory(root: string) {
  return path.join(
    foundryStoragePaths(root).registry,
    sha256(`${TARGET_AGENT_ID}\0${TARGET_DOMAIN_ID}`),
  );
}

function writeCanonical(file: string, value: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, canonicalJsonBytes(value));
}

function readJson(file: string) {
  return JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>;
}

function createCandidate(root: string, label: string): MaterializedCandidate {
  const promptBytes = Buffer.from(`Prompt fixture: ${label}\n`, 'utf8');
  const promptHash = sha256(promptBytes);
  const promptRef = `opl-content://sha256/${promptHash}`;
  const blueprint: AgentBlueprint = {
    surface_kind: 'opl_foundry_agent_blueprint',
    version: FOUNDRY_PROTOCOL_VERSION,
    blueprint_id: `blueprint:persistent:${label}`,
    target_agent_id: TARGET_AGENT_ID,
    target_domain_id: TARGET_DOMAIN_ID,
    target_version_ref: null,
    design_request_digest: fixtureDigest(`design-request:${label}`),
    generation: 0,
    stage_graph: {
      entry_stage_id: 'deliver',
      stages: [{
        stage_id: 'deliver',
        stage_kind: 'domain_delivery',
        goal: 'Deliver the persistent registry fixture.',
        input_artifact_types: ['request'],
        output_artifact_types: ['delivery'],
        prompt_ref: promptRef,
        skill_refs: [],
        knowledge_refs: [],
        capability_refs: ['capability:text'],
        next_stage_ids: [],
      }],
    },
    actions: [{
      action_id: 'deliver',
      summary: 'Deliver the persistent registry fixture.',
      entry_stage_id: 'deliver',
      input_schema_ref: 'schema:persistent-input',
      output_schema_ref: 'schema:persistent-output',
    }],
    artifact_contracts: [{
      artifact_type: 'delivery',
      schema_ref: 'schema:persistent-output',
      authority_owner_ref: 'owner:persistent-fixture',
    }],
    content_refs: {
      prompt_refs: [promptRef],
      skill_refs: [],
      knowledge_refs: [],
      helper_refs: [],
      model_refs: [],
      tool_refs: [],
    },
    capability_requirements: ['capability:text'],
    authority_policy: {
      truth_owner_ref: 'owner:persistent-fixture',
      artifact_owner_ref: 'owner:persistent-fixture',
      quality_owner_ref: 'owner:persistent-fixture',
      owner_gate_refs: ['owner-gate:persistent-fixture'],
      generated_agent_can_modify_versions: false,
      generated_agent_can_modify_evaluation: false,
      generated_agent_can_modify_permissions: false,
      generated_agent_can_modify_activation: false,
    },
    memory_policy: {
      memory_classes: [],
      retention_refs: [],
      write_authority_refs: [],
    },
    assumptions: [],
    design_evidence_refs: ['evidence:persistent-fixture'],
    eval_spec: {
      eval_spec_id: `eval:persistent:${label}`,
      public_cases: [{
        case_id: 'case:required',
        test_ref: 'test:required',
        weight: 1,
        required: true,
      }],
      protected_requirements: [{ category: 'protected-safety', minimum_case_count: 1 }],
      gates: [{
        gate_id: 'gate:required',
        metric: 'score',
        operator: 'gte',
        threshold: 1,
        required: true,
      }],
      baseline_comparison: { required: false, regression_tolerance: 0 },
      independent_evaluator_required: true,
    },
    risk_hint: 'low',
  };
  const blueprintDigest = foundryContentDigest(blueprint);
  const promptPath = `content/prompt/${promptHash}.blob`;
  const contentBindings = [{
    kind: 'prompt',
    declared_ref: promptRef,
    immutable_ref: promptRef,
    pack_path: promptPath,
    sha256: `sha256:${promptHash}`,
    byte_size: promptBytes.byteLength,
  }];
  const resourceLock = {
    surface_kind: 'opl_foundry_candidate_resource_lock',
    version: 'opl-foundry-candidate-resource-lock.v1',
    blueprint_digest: blueprintDigest,
    resources: contentBindings,
  };
  const agentPack = {
    surface_kind: 'opl_foundry_agent_pack',
    version: 'opl-foundry-agent-pack.v1',
    target_agent_id: TARGET_AGENT_ID,
    target_domain_id: TARGET_DOMAIN_ID,
    blueprint_digest: blueprintDigest,
    content_bindings: contentBindings,
    resource_lock: {
      ref: 'contracts/resource-lock.json',
      digest: foundryContentDigest(resourceLock),
    },
  };
  const plannedFiles = [
    { path: 'agent-blueprint.json', bytes: canonicalJsonBytes(blueprint) },
    { path: 'agent/agent-pack.json', bytes: canonicalJsonBytes(agentPack) },
    { path: 'contracts/resource-lock.json', bytes: canonicalJsonBytes(resourceLock) },
    { path: promptPath, bytes: promptBytes },
  ].sort((left, right) => left.path.localeCompare(right.path));
  const files = plannedFiles.map((entry) => ({
    path: entry.path,
    sha256: sha256(entry.bytes),
    byte_size: entry.bytes.byteLength,
  }));
  const indexBase = {
    surface_kind: 'opl_foundry_candidate_file_index',
    version: 'opl-foundry-candidate-index.v2',
    blueprint_digest: blueprintDigest,
    files,
  };
  const candidateDigest = digest(indexBase);
  const directory = path.join(foundryStoragePaths(root).candidates, candidateDigest.slice('sha256:'.length));
  fs.mkdirSync(directory, { recursive: true });
  for (const entry of plannedFiles) {
    fs.mkdirSync(path.dirname(path.join(directory, entry.path)), { recursive: true });
    fs.writeFileSync(path.join(directory, entry.path), entry.bytes);
  }
  writeCanonical(path.join(directory, 'candidate-index.json'), {
    ...indexBase,
    candidate_digest: candidateDigest,
  });
  return {
    surface_kind: 'opl_foundry_materialized_candidate',
    target_agent_id: TARGET_AGENT_ID,
    target_domain_id: TARGET_DOMAIN_ID,
    blueprint_digest: blueprintDigest,
    candidate_digest: candidateDigest,
    candidate_ref: `opl://foundry/candidate/${candidateDigest}`,
    manifest_digest: foundryContentDigest(agentPack),
  };
}

type RegisterInput = Parameters<LedgerVersionRegistry['register']>[0];

function registerInput(candidate: MaterializedCandidate, overrides: Partial<RegisterInput> = {}): RegisterInput {
  return {
    target_agent_id: TARGET_AGENT_ID,
    target_domain_id: TARGET_DOMAIN_ID,
    blueprint_digest: candidate.blueprint_digest,
    candidate,
    evidence_digest: fixtureDigest(`evidence:${candidate.candidate_digest}`),
    risk_tier: 'low',
    qualified_at: '2026-07-16T00:00:00.000Z',
    ...overrides,
  };
}

function registrationRecords(input: RegisterInput) {
  const qualificationBase = {
    surface_kind: 'opl_foundry_qualification_record' as const,
    qualification_id: `qualification:${input.target_agent_id}:${input.candidate.candidate_digest}`,
    target_agent_id: input.target_agent_id,
    target_domain_id: input.target_domain_id,
    blueprint_digest: input.blueprint_digest,
    candidate_digest: input.candidate.candidate_digest,
    evidence_digest: input.evidence_digest,
    risk_tier: input.risk_tier,
    qualified_at: input.qualified_at,
  };
  const qualification: QualificationRecord = {
    ...qualificationBase,
    qualification_digest: digest(qualificationBase),
  };
  const versionBase = {
    surface_kind: 'opl_foundry_agent_version' as const,
    version_id: `version:${input.target_agent_id}:${input.candidate.candidate_digest}`,
    target_agent_id: input.target_agent_id,
    target_domain_id: input.target_domain_id,
    blueprint_digest: input.blueprint_digest,
    candidate_digest: input.candidate.candidate_digest,
    candidate_ref: input.candidate.candidate_ref,
    qualification_digest: qualification.qualification_digest,
    created_at: input.qualified_at,
  };
  const version: AgentVersion = { ...versionBase, version_digest: digest(versionBase) };
  return { qualification, version };
}

function registrationFiles(root: string, records: ReturnType<typeof registrationRecords>) {
  const directory = registryDirectory(root);
  return {
    qualification: path.join(
      directory,
      'qualifications',
      `${records.qualification.qualification_digest.slice('sha256:'.length)}.json`,
    ),
    version: path.join(
      directory,
      'agent-versions',
      `${records.version.version_digest.slice('sha256:'.length)}.json`,
    ),
    activation: path.join(directory, 'activation.json'),
    transactions: path.join(directory, 'activation-transactions'),
  };
}

async function createRegisteredFixture(root: string, label = 'v1') {
  const candidate = createCandidate(root, label);
  const input = registerInput(candidate);
  const registry = new LedgerVersionRegistry(root);
  const registered = await registry.register(input);
  return { candidate, input, registry, ...registered };
}

function transaction(
  kind: ActivationTransaction['transaction_kind'],
  fromVersionDigest: string | null,
  toVersionDigest: string,
  previousRevision: number,
  authorityReceiptRef: string | null,
  occurredAt: string,
): ActivationTransaction {
  const base = {
    surface_kind: 'opl_foundry_activation_transaction' as const,
    transaction_kind: kind,
    target_agent_id: TARGET_AGENT_ID,
    target_domain_id: TARGET_DOMAIN_ID,
    from_version_digest: fromVersionDigest,
    to_version_digest: toVersionDigest,
    previous_revision: previousRevision,
    next_revision: previousRevision + 1,
    authority_receipt_ref: authorityReceiptRef,
    occurred_at: occurredAt,
  };
  return { ...base, transaction_id: `activation:${digest(base)}` };
}

function pointer(versionDigest: string, revision: number, updatedAt: string): ActivationPointer {
  return {
    surface_kind: 'opl_foundry_activation_pointer',
    target_agent_id: TARGET_AGENT_ID,
    target_domain_id: TARGET_DOMAIN_ID,
    active_version_digest: versionDigest,
    revision,
    updated_at: updatedAt,
  };
}

test('registration hides a prepared qualification and exact retry atomically publishes its AgentVersion', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-foundry-registry-prepare-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const candidate = createCandidate(root, 'prepared');
  const input = registerInput(candidate);
  const records = registrationRecords(input);
  const files = registrationFiles(root, records);
  writeCanonical(files.qualification, records.qualification);

  const registry = new LedgerVersionRegistry(root);
  assert.deepEqual(await registry.list(TARGET_AGENT_ID, TARGET_DOMAIN_ID), []);
  const committed = await registry.register(input);
  assert.deepEqual(committed, records);
  assert.deepEqual(await registry.list(TARGET_AGENT_ID, TARGET_DOMAIN_ID), [records.version]);
  assert.deepEqual(await new LedgerVersionRegistry(root).register(input), records);

  await assert.rejects(
    registry.register({ ...input, evidence_digest: fixtureDigest('different-evidence') }),
    /different immutable metadata/,
  );
  await assert.rejects(
    registry.register({ ...input, risk_tier: 'high' }),
    /different immutable metadata/,
  );
  await assert.rejects(
    registry.register({ ...input, blueprint_digest: fixtureDigest('different-blueprint') }),
    /blueprint digest is inconsistent/,
  );
  await assert.rejects(
    registry.register({
      ...input,
      candidate: { ...candidate, target_domain_id: 'wrong-domain' },
    }),
    /target identity is inconsistent/,
  );
});

test('operation result journal persists one exact evidence identity and rejects conflicting replay', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-foundry-operation-result-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const identity = foundryEvaluationOperationIdentity({
    run_id: 'run:persistent-operation-result',
    generation: 2,
    phase: 'evaluate',
    input_digest: fixtureDigest('operation-input'),
  });
  const input = {
    identity,
    evidence_digest: fixtureDigest('operation-evidence'),
    evidence_ref: 'opl://foundry/object/operation-evidence',
    completed_at: '2026-07-16T00:00:00.000Z',
  };
  const journal = new LedgerFoundryOperationResultJournal(root);
  const committed = await journal.commit(input);
  assert.deepEqual(await new LedgerFoundryOperationResultJournal(root).read(identity), committed);
  assert.deepEqual(await journal.commit(input), committed);
  assert.equal(Object.hasOwn(committed, 'evidence'), false);

  await assert.rejects(
    journal.commit({ ...input, evidence_digest: fixtureDigest('different-evidence') }),
    /different result/,
  );
  const files = fs.readdirSync(foundryStoragePaths(root).operation_results);
  assert.equal(files.length, 1);
  writeCanonical(path.join(foundryStoragePaths(root).operation_results, files[0]!), {
    ...committed,
    evidence_ref: 'opl://foundry/object/tampered',
  });
  await assert.rejects(journal.read(identity), /result digest does not match/);
});

test('registry load rejects corrupt record surface, digest, identity, ref, and cross-reference', async (t) => {
  const cases: Array<{
    name: string;
    mutate: (root: string, records: ReturnType<typeof registrationRecords>) => void;
    error: RegExp;
  }> = [
    {
      name: 'qualification surface',
      mutate: (root, records) => {
        const files = registrationFiles(root, records);
        writeCanonical(files.qualification, { ...records.qualification, surface_kind: 'wrong_surface' });
      },
      error: /QualificationRecord surface is invalid/,
    },
    {
      name: 'qualification digest',
      mutate: (root, records) => {
        const files = registrationFiles(root, records);
        writeCanonical(files.qualification, { ...records.qualification, evidence_digest: fixtureDigest('tampered') });
      },
      error: /QualificationRecord digest does not match/,
    },
    {
      name: 'version identity',
      mutate: (root, records) => {
        const files = registrationFiles(root, records);
        writeCanonical(files.version, { ...records.version, target_domain_id: 'wrong-domain' });
      },
      error: /AgentVersion target identity does not match/,
    },
    {
      name: 'candidate ref',
      mutate: (root, records) => {
        const files = registrationFiles(root, records);
        writeCanonical(files.version, { ...records.version, candidate_ref: 'opl://foundry/candidate/sha256:wrong' });
      },
      error: /candidate ref does not match/,
    },
    {
      name: 'qualification cross-reference',
      mutate: (root, records) => {
        const files = registrationFiles(root, records);
        const base = { ...records.version, qualification_digest: fixtureDigest('missing-qualification') };
        delete (base as Partial<AgentVersion>).version_digest;
        const changed = { ...base, version_digest: digest(base) } as AgentVersion;
        fs.rmSync(files.version);
        writeCanonical(
          path.join(path.dirname(files.version), `${changed.version_digest.slice('sha256:'.length)}.json`),
          changed,
        );
      },
      error: /qualification record is missing/,
    },
  ];

  for (const scenario of cases) {
    await t.test(scenario.name, async (st) => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-foundry-registry-corrupt-'));
      st.after(() => fs.rmSync(root, { recursive: true, force: true }));
      const fixture = await createRegisteredFixture(root, scenario.name);
      scenario.mutate(root, registrationRecords(fixture.input));
      await assert.rejects(
        new LedgerVersionRegistry(root).list(TARGET_AGENT_ID, TARGET_DOMAIN_ID),
        scenario.error,
      );
    });
  }
});

test('activation history is contiguous, replay is exact, and a missing pointer rebuilds from transactions', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-foundry-registry-activation-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const first = await createRegisteredFixture(root, 'activation-v1');
  const secondCandidate = createCandidate(root, 'activation-v2');
  const second = await first.registry.register(registerInput(secondCandidate, {
    evidence_digest: fixtureDigest('evidence:v2'),
    qualified_at: '2026-07-16T00:01:00.000Z',
  }));

  await first.registry.compareAndSwapActivation({
    target_agent_id: TARGET_AGENT_ID,
    target_domain_id: TARGET_DOMAIN_ID,
    expected_revision: 0,
    version_digest: first.version.version_digest,
    authority_receipt_ref: null,
    occurred_at: '2026-07-16T00:02:00.000Z',
  });
  await first.registry.compareAndSwapActivation({
    target_agent_id: TARGET_AGENT_ID,
    target_domain_id: TARGET_DOMAIN_ID,
    expected_revision: 1,
    version_digest: second.version.version_digest,
    authority_receipt_ref: 'owner:activate-v2',
    occurred_at: '2026-07-16T00:03:00.000Z',
  });
  const rollbackInput = {
    target_agent_id: TARGET_AGENT_ID,
    target_domain_id: TARGET_DOMAIN_ID,
    expected_revision: 2,
    version_digest: first.version.version_digest,
    authority_receipt_ref: 'owner:rollback-v1',
    occurred_at: '2026-07-16T00:04:00.000Z',
  };
  const rollback = await first.registry.rollback(rollbackInput);
  assert.equal((await first.registry.activation(TARGET_AGENT_ID, TARGET_DOMAIN_ID)).revision, 3);
  assert.deepEqual(await first.registry.rollback(rollbackInput), rollback);
  await assert.rejects(
    first.registry.rollback({ ...rollbackInput, occurred_at: '2026-07-16T00:04:01.000Z' }),
    /replay conflicts with immutable history/,
  );
  await assert.rejects(
    first.registry.rollback({ ...rollbackInput, expected_revision: 99 }),
    /compare-and-swap failed/,
  );

  const files = registrationFiles(root, registrationRecords(first.input));
  fs.rmSync(files.activation);
  assert.deepEqual(
    await new LedgerVersionRegistry(root).activation(TARGET_AGENT_ID, TARGET_DOMAIN_ID),
    pointer(first.version.version_digest, 3, rollbackInput.occurred_at),
  );
  assert.equal(fs.existsSync(files.activation), false);
  assert.deepEqual(await first.registry.rollback(rollbackInput), rollback);
  assert.deepEqual(
    readJson(files.activation),
    pointer(first.version.version_digest, 3, rollbackInput.occurred_at),
  );
  const storedBlueprint = readJson(path.join(
    foundryStoragePaths(root).candidates,
    first.version.candidate_digest.slice('sha256:'.length),
    'agent-blueprint.json',
  ));
  assert.equal(storedBlueprint.target_agent_id, TARGET_AGENT_ID);
  assert.equal(foundryContentDigest(storedBlueprint), first.version.blueprint_digest);
});

test('exact activation replay repairs a pointer publish failure without duplicating history', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-foundry-registry-pointer-recovery-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const fixture = await createRegisteredFixture(root, 'pointer-recovery');
  const files = registrationFiles(root, registrationRecords(fixture.input));
  const activationInput = {
    target_agent_id: TARGET_AGENT_ID,
    target_domain_id: TARGET_DOMAIN_ID,
    expected_revision: 0,
    version_digest: fixture.version.version_digest,
    authority_receipt_ref: 'owner:activate-after-crash',
    occurred_at: '2026-07-16T00:04:30.000Z',
  };
  const renameDescriptor = Object.getOwnPropertyDescriptor(fs, 'renameSync')!;
  const originalRename = fs.renameSync;
  let injectFailure = true;
  Object.defineProperty(fs, 'renameSync', {
    ...renameDescriptor,
    value(source: fs.PathLike, destination: fs.PathLike) {
      if (injectFailure && path.resolve(String(destination)) === path.resolve(files.activation)) {
        injectFailure = false;
        throw new Error('injected activation pointer publish failure');
      }
      return originalRename(source, destination);
    },
  });
  try {
    await assert.rejects(
      fixture.registry.compareAndSwapActivation(activationInput),
      /injected activation pointer publish failure/,
    );
  } finally {
    Object.defineProperty(fs, 'renameSync', renameDescriptor);
  }

  assert.equal(fs.existsSync(files.activation), false);
  assert.deepEqual(fs.readdirSync(files.transactions), ['0000000001.json']);
  assert.deepEqual(
    fs.readdirSync(path.dirname(files.activation)).filter((entry) => entry.startsWith('activation.json.tmp-')),
    [],
  );
  const recovered = await fixture.registry.compareAndSwapActivation(activationInput);
  assert.equal(recovered.previous_revision, 0);
  assert.equal(recovered.next_revision, 1);
  assert.deepEqual(fs.readdirSync(files.transactions), ['0000000001.json']);
  assert.deepEqual(
    readJson(files.activation),
    pointer(fixture.version.version_digest, 1, activationInput.occurred_at),
  );
});

test('activation load and rollback fail closed on history, pointer, or candidate-byte corruption', async (t) => {
  const cases: Array<{
    name: string;
    corrupt: (input: {
      root: string;
      version: AgentVersion;
      transaction: ActivationTransaction;
      files: ReturnType<typeof registrationFiles>;
    }) => void;
    error: RegExp;
  }> = [
    {
      name: 'transaction surface',
      corrupt: ({ transaction, files }) => {
        writeCanonical(path.join(files.transactions, '0000000001.json'), {
          ...transaction,
          surface_kind: 'wrong_surface',
        });
      },
      error: /ActivationTransaction surface is invalid/,
    },
    {
      name: 'transaction id',
      corrupt: ({ transaction, files }) => {
        writeCanonical(path.join(files.transactions, '0000000001.json'), {
          ...transaction,
          transaction_id: 'activation:sha256:corrupt',
        });
      },
      error: /transaction id does not match/i,
    },
    {
      name: 'transaction source version',
      corrupt: ({ transaction, files }) => {
        const base = { ...transaction, from_version_digest: fixtureDigest('wrong-source') };
        delete (base as Partial<ActivationTransaction>).transaction_id;
        writeCanonical(path.join(files.transactions, '0000000001.json'), {
          ...base,
          transaction_id: `activation:${digest(base)}`,
        });
      },
      error: /source version does not match history/,
    },
    {
      name: 'transaction target identity',
      corrupt: ({ transaction, files }) => {
        const base = { ...transaction, target_domain_id: 'wrong-domain' };
        delete (base as Partial<ActivationTransaction>).transaction_id;
        writeCanonical(path.join(files.transactions, '0000000001.json'), {
          ...base,
          transaction_id: `activation:${digest(base)}`,
        });
      },
      error: /ActivationTransaction target identity does not match/,
    },
    {
      name: 'transaction target version',
      corrupt: ({ transaction, files }) => {
        const base = { ...transaction, to_version_digest: fixtureDigest('missing-version') };
        delete (base as Partial<ActivationTransaction>).transaction_id;
        writeCanonical(path.join(files.transactions, '0000000001.json'), {
          ...base,
          transaction_id: `activation:${digest(base)}`,
        });
      },
      error: /target version does not exist/,
    },
    {
      name: 'transaction revision continuity',
      corrupt: ({ transaction, files }) => {
        const base = { ...transaction, previous_revision: 1, next_revision: 2 };
        delete (base as Partial<ActivationTransaction>).transaction_id;
        fs.rmSync(path.join(files.transactions, '0000000001.json'));
        writeCanonical(path.join(files.transactions, '0000000002.json'), {
          ...base,
          transaction_id: `activation:${digest(base)}`,
        });
      },
      error: /history is not contiguous/,
    },
    {
      name: 'activation pointer surface',
      corrupt: ({ version, files }) => {
        writeCanonical(files.activation, {
          ...pointer(version.version_digest, 1, '2026-07-16T00:02:00.000Z'),
          surface_kind: 'wrong_surface',
        });
      },
      error: /ActivationPointer surface is invalid/,
    },
    {
      name: 'activation pointer',
      corrupt: ({ version, files }) => {
        writeCanonical(files.activation, pointer(version.version_digest, 0, '2026-07-16T00:02:00.000Z'));
      },
      error: /revision zero must be empty/,
    },
    {
      name: 'candidate bytes',
      corrupt: ({ root, version }) => {
        fs.writeFileSync(path.join(
          foundryStoragePaths(root).candidates,
          version.candidate_digest.slice('sha256:'.length),
          'agent-blueprint.json',
        ), 'corrupted candidate bytes\n');
      },
      error: /candidate bytes do not match/i,
    },
  ];

  for (const scenario of cases) {
    await t.test(scenario.name, async (st) => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-foundry-registry-activation-corrupt-'));
      st.after(() => fs.rmSync(root, { recursive: true, force: true }));
      const fixture = await createRegisteredFixture(root, scenario.name);
      const activationInput = {
        target_agent_id: TARGET_AGENT_ID,
        target_domain_id: TARGET_DOMAIN_ID,
        expected_revision: 0,
        version_digest: fixture.version.version_digest,
        authority_receipt_ref: 'owner:activate',
        occurred_at: '2026-07-16T00:02:00.000Z',
      };
      const activated = await fixture.registry.compareAndSwapActivation(activationInput);
      const files = registrationFiles(root, registrationRecords(fixture.input));
      scenario.corrupt({ root, version: fixture.version, transaction: activated, files });
      await assert.rejects(
        new LedgerVersionRegistry(root).activation(TARGET_AGENT_ID, TARGET_DOMAIN_ID),
        scenario.error,
      );
    });
  }
});

test('legacy flat qualification/version/transaction files remain readable without a new commit marker', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-foundry-registry-legacy-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const candidate = createCandidate(root, 'legacy');
  const input = registerInput(candidate);
  const records = registrationRecords(input);
  const files = registrationFiles(root, records);
  writeCanonical(files.qualification, records.qualification);
  writeCanonical(files.version, records.version);
  const activated = transaction(
    'activate',
    null,
    records.version.version_digest,
    0,
    null,
    '2026-07-16T00:05:00.000Z',
  );
  writeCanonical(path.join(files.transactions, '0000000001.json'), activated);
  writeCanonical(files.activation, pointer(records.version.version_digest, 1, activated.occurred_at));

  const registry = new LedgerVersionRegistry(root);
  assert.deepEqual(await registry.list(TARGET_AGENT_ID, TARGET_DOMAIN_ID), [records.version]);
  assert.deepEqual(
    await registry.activation(TARGET_AGENT_ID, TARGET_DOMAIN_ID),
    pointer(records.version.version_digest, 1, activated.occurred_at),
  );
});
