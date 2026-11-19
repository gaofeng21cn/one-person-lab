import assert from 'node:assert/strict';
import test from 'node:test';
import { exactRefsFromCloseoutMetadata } from '../../src/adapters/execution/family-runtime-temporal-activity-identity.ts';

const sha = 'a'.repeat(64);

test('keeps a framework-observed artifact recorded with only ref_kind', () => {
  // OPL records the artifacts it verified itself with `ref_kind` and an identity receipt,
  // and no `kind`. Dropping those entries removed exactly the artifacts a producer had
  // declared, so the reviewer-snapshot authority failed to bind them.
  const refs = exactRefsFromCloseoutMetadata([{
    ref_kind: 'stage_artifact',
    ref: 'file:///workspace/evaluation-design.json',
    sha256: `sha256:${sha}`,
    size_bytes: 128,
    artifact_identity_receipt_ref: 'file:///state/receipt.json',
  }]);
  assert.equal(refs.length, 1);
  assert.equal(refs[0]!.kind, 'stage_artifact');
  assert.equal(refs[0]!.ref, 'file:///workspace/evaluation-design.json');
  assert.equal(refs[0]!.sha256, `sha256:${sha}`);
  assert.equal(refs[0]!.size_bytes, 128);
});

test('prefers kind and still emits the ref_kind alias when both labels exist', () => {
  const refs = exactRefsFromCloseoutMetadata([{
    kind: 'oma_evaluation_design_decision',
    ref_kind: 'owner_authority',
    ref: 'file:///workspace/evaluation-design.json',
    sha256: `sha256:${sha}`,
    size_bytes: 128,
  }]);
  assert.deepEqual(refs.map((entry) => entry.kind).sort(), ['oma_evaluation_design_decision', 'owner_authority']);
});

test('still drops an entry that carries no label at all', () => {
  const refs = exactRefsFromCloseoutMetadata([{
    ref: 'file:///workspace/evaluation-design.json',
    sha256: `sha256:${sha}`,
    size_bytes: 128,
  }]);
  assert.equal(refs.length, 0);
});

test('still drops an entry whose size or digest is not exact', () => {
  assert.equal(exactRefsFromCloseoutMetadata([{
    ref_kind: 'stage_artifact',
    ref: 'file:///workspace/x.json',
    sha256: `sha256:${sha}`,
  }]).length, 0);
  assert.equal(exactRefsFromCloseoutMetadata([{
    ref_kind: 'stage_artifact',
    ref: 'file:///workspace/x.json',
    sha256: 'sha256:nothex',
    size_bytes: 1,
  }]).length, 0);
});
