import assert from 'node:assert/strict';
import test from 'node:test';

import {
  LedgerError,
  MAX_LEDGER_PAYLOAD_BYTES,
  MAX_LEDGER_STRING_LENGTH,
  assertRefsOnlyPayload,
  validateLedgerEntryInput,
} from '../src/index.ts';

test('validateLedgerEntryInput accepts all 7 canonical and PoC entry kinds', () => {
  const cases = [
    {
      task_id: 'task-1',
      entry_kind: 'artifact_ref' as const,
      owner_id: 'mas',
      payload: { path: 'analysis/plan.md', sha256: 'abc123' },
    },
    {
      task_id: 'task-1',
      entry_kind: 'owner_receipt' as const,
      owner_id: 'mas',
      payload: { resolves_debt: 'debt-fig1', status: 'ready_for_review', usage: { input_tokens: 1200, output_tokens: 300 }, credential_handle: 'keychain:mail-1' },
    },
    {
      task_id: 'task-1',
      entry_kind: 'owner_receipt' as const,
      owner_id: 'mas',
      payload: { seq: 1 },
    },
    {
      task_id: 'task-1',
      entry_kind: 'quality_debt' as const,
      owner_id: 'mas',
      payload: { code: 'fig2_ci_missing', blocks_submission: true },
    },
    {
      task_id: 'task-1',
      entry_kind: 'quality_debt' as const,
      owner_id: 'mas',
      payload: { id: 'debt-fig1', summary: 'Figure 1 not generated yet' },
    },
    {
      task_id: 'task-1',
      entry_kind: 'review_verdict' as const,
      owner_id: 'mas.reviewer',
      payload: { verdict: 'approved', verified_hashes: ['abc123', 'def456'] },
    },
    {
      task_id: 'task-1',
      entry_kind: 'typed_blocker' as const,
      owner_id: 'opl.runway',
      payload: { code: 'executor_lost_after_restart', retryable: true },
    },
    {
      task_id: 'task-1',
      entry_kind: 'human_decision' as const,
      owner_id: 'human',
      payload: { decision: 'approve', waived_debt_ids: ['debt-fig1'], reason: 'Verified manually' },
    },
    {
      task_id: 'task-1',
      entry_kind: 'failed_path_note' as const,
      owner_id: 'mas',
      payload: { summary: 'OLS regression diverged on sparse subgroup', failed_path_ref: 'logs/attempt-1.log' },
    },
  ];

  for (const input of cases) {
    const validated = validateLedgerEntryInput(input);
    assert.equal(validated.entry.entry_kind, input.entry_kind);
    assert.ok(validated.entry.entry_id.startsWith('le_'));
    assert.ok(validated.payloadJson.length > 0);
  }
});

test('validateLedgerEntryInput rejects invalid kinds, missing required fields, and path traversal', () => {
  assert.throws(
    () =>
      validateLedgerEntryInput({
        task_id: 'task-1',
        entry_kind: 'unknown_kind' as never,
        owner_id: 'mas',
        payload: {} as never,
      }),
    (err: unknown) => err instanceof LedgerError && err.code === 'INVALID_LEDGER_INPUT',
  );

  assert.throws(
    () =>
      validateLedgerEntryInput({
        task_id: 'task-1',
        entry_kind: 'artifact_ref',
        owner_id: 'mas',
        payload: { sha256: 'abc123' } as never,
      }),
    (err: unknown) => err instanceof LedgerError && err.code === 'INVALID_LEDGER_INPUT',
  );

  assert.throws(
    () =>
      validateLedgerEntryInput({
        task_id: 'task-1',
        entry_kind: 'artifact_ref',
        owner_id: 'mas',
        payload: { path: '../../etc/passwd' },
      }),
    (err: unknown) => err instanceof LedgerError && err.code === 'REFS_ONLY_VIOLATION',
  );
});

test('assertRefsOnlyPayload rejects inline bodies, secrets, oversized strings, deep nesting, and >16KiB payloads', () => {
  const forbiddenPayloads: unknown[] = [
    { path: 'a.md', body: 'inline text' },
    { path: 'a.md', content: 'inline text' },
    { path: 'a.md', nested: { payload_body: 'hidden' } },
    { path: 'a.md', domain_body: {} },
    { path: 'a.md', body_included: true },
    { status: 'ok', api_key: 'not-allowed' },
    { status: 'ok', nested: { password: '123' } },
    { summary: '-----BEGIN RSA PRIVATE KEY-----\nMIIE...' },
    { summary: 'data:text/plain;base64,SGVsbG8=' },
    { summary: 'token sk-123456789012345678901234567890' },
    { summary: 'x'.repeat(MAX_LEDGER_STRING_LENGTH + 1) },
    { a: { b: { c: { d: { e: { f: { g: { h: 1 } } } } } } } },
  ];

  for (const payload of forbiddenPayloads) {
    assert.throws(
      () => assertRefsOnlyPayload(payload),
      (err: unknown) => err instanceof LedgerError && err.code === 'REFS_ONLY_VIOLATION',
    );
  }

  // > 16 KiB serialized JSON
  const bigRefs = Array.from({ length: 40 }, (_, i) => `ref-${i}-${'a'.repeat(500)}`);
  const oversized = { status: 'ok', evidence_refs: bigRefs };
  assert.ok(Buffer.byteLength(JSON.stringify(oversized), 'utf8') > MAX_LEDGER_PAYLOAD_BYTES);
  assert.throws(
    () => assertRefsOnlyPayload(oversized),
    (err: unknown) => err instanceof LedgerError && err.code === 'REFS_ONLY_VIOLATION',
  );

  // Telemetry token counters and opaque credential handles are allowed
  assert.doesNotThrow(() =>
    assertRefsOnlyPayload({
      status: 'ok',
      credential_handle: 'keychain:mail-1',
      usage: { input_tokens: 100, output_tokens: 50, cached_tokens: 20 },
    }),
  );
});

test('assertRefsOnlyPayload blocks broadened data URIs, modern API keys, Bearer tokens, PGP keys, and *_ref traversal', () => {
  const secretBypasses: unknown[] = [
    { summary: 'data:text/plain;charset=utf-8;base64,SGVsbG8gd29ybGQ=' },
    { summary: 'prefix data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==' },
    { summary: 'leaked key sk-ant-api03-abcd1234_efgh5678_ijkl9012' },
    { summary: 'leaked key sk-proj-abcd-1234-efgh-5678-ijkl' },
    { summary: 'Bearer abcdef+ghijkl/mnopqr==' },
    { summary: '-----BEGIN PGP PRIVATE KEY BLOCK-----\nVersion: GnuPG' },
  ];
  for (const payload of secretBypasses) {
    assert.throws(
      () => assertRefsOnlyPayload(payload),
      (err: unknown) => err instanceof LedgerError && err.code === 'REFS_ONLY_VIOLATION',
    );
  }

  const refTraversalPayloads: unknown[] = [
    { path: 'a.md', source_refs: ['../../etc/passwd'] },
    { status: 'ok', produced_refs: ['..\\..\\secret'] },
    { status: 'ok', evidence_refs: ['/etc/passwd'] },
    { code: 'b1', typed_blocker_ref: 'C:\\Windows\\System32' },
    { summary: 'fail', failed_path_ref: 'logs/bad\nline.log' },
  ];
  for (const payload of refTraversalPayloads) {
    assert.throws(
      () => assertRefsOnlyPayload(payload),
      (err: unknown) => err instanceof LedgerError && err.code === 'REFS_ONLY_VIOLATION',
    );
  }

  // Opaque ref IDs and normal relative ref paths remain valid
  assert.doesNotThrow(() =>
    assertRefsOnlyPayload({
      path: 'analysis/plan.md',
      finding_ref: 'finding_1',
      evidence_refs: ['debt-1', 'logs/attempt-1.log'],
      credential_handle: 'cred_abc',
      usage: { input_tokens: 1200, output_tokens: 450 },
    }),
  );
});

test('validateLedgerEntryInput trims payload fields before serializing payloadJson', () => {
  const validated = validateLedgerEntryInput({
    task_id: 'task-1',
    entry_kind: 'artifact_ref',
    owner_id: 'mas',
    payload: {
      path: '   artifacts/trimmed.txt   ',
      summary: '   hello   ',
      source_refs: ['   refs/input.csv   '],
    },
  });
  assert.equal(validated.entry.payload.path, 'artifacts/trimmed.txt');
  assert.equal(validated.entry.payload.summary, 'hello');
  assert.deepEqual(JSON.parse(validated.payloadJson), validated.entry.payload);
});
