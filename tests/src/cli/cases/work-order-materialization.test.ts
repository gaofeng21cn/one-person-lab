import crypto from 'node:crypto';

import { assert, fs, os, path, runCli, runCliFailure, test } from '../helpers.ts';
import { readJson, writeExecutableWorkOrder, writeJson } from './agent-lab-work-order-fixtures.ts';

function sha256(bytes: Buffer): string {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function writeDeveloperSemanticEnvelope(root: string) {
  const candidatePath = path.join(root, 'candidate.json');
  writeExecutableWorkOrder(candidatePath, path.join(root, 'target-agent'));
  const requestPath = path.join(root, 'oma-output.json');
  writeJson(requestPath, {
    product_id: 'opl-meta-agent',
    agent_building_judgment: {
      developer_patch_work_order: readJson(candidatePath),
    },
    semantic_requests: {
      developer_patch_work_order: readJson(candidatePath),
      physical_materialization_owner: 'one-person-lab/OPL Foundry Lab',
      oma_writes_request_files: false,
      requested_file_name: 'developer-patch-work-order.json',
      execution_surface: 'opl work-order execute --work-order <developer-patch-work-order.json>',
    },
  });
  return requestPath;
}

test('work-order materialize-request consumes an OMA developer semantic envelope atomically', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-work-order-materialize-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const requestPath = writeDeveloperSemanticEnvelope(root);
  const targetDir = path.join(root, 'materialized');

  const output = runCli([
    'work-order', 'materialize-request', '--request', requestPath, '--target-dir', targetDir, '--json',
  ]);
  const workOrderPath = path.join(targetDir, 'developer-patch-work-order.json');
  const receiptPath = path.join(targetDir, 'work-order-materialization-receipt.json');
  const workOrder = readJson(workOrderPath);
  const receipt = readJson(receiptPath);

  assert.equal(output.work_order_materialization.status, 'materialized');
  assert.equal(workOrder.surface_kind, 'opl_developer_patch_work_order');
  assert.equal(workOrder.canonical_schema_ref,
    'contracts/opl-framework/developer-patch-work-order.schema.json');
  assert.equal(workOrder.canonical_closeout_receipt_schema_ref,
    'contracts/opl-framework/work-order-owner-closeout-receipt.schema.json');
  assert.equal(workOrder.authority_boundary.can_write_target_domain_truth, false);
  assert.equal(receipt.authority_boundary.receipt_can_claim_patch_execution, false);
  assert.equal(receipt.authority_boundary.receipt_can_claim_target_owner_closeout, false);
  assert.equal(receipt.materialized_files[0].sha256, sha256(fs.readFileSync(workOrderPath)));
});

test('work-order materialize-request consumes the four-file agent evidence semantic bundle', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-foundry-work-order-materialize-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const requestPath = path.join(root, 'oma-agent-evidence-output.json');
  const targetDir = path.join(root, 'materialized');
  writeJson(requestPath, {
    agent_building_judgment: {
      target_capability_improvement_candidate: {
        surface_kind: 'opl_meta_agent_target_capability_improvement_candidate',
        candidate_id: 'candidate:test',
      },
    },
    semantic_requests: {
      foundry_evaluation_request: {
        surface_kind: 'opl_meta_agent_foundry_evaluation_request',
        request_id: 'evaluation:test',
      },
      owner_receipt_refs: {
        surface_kind: 'opl_meta_agent_owner_receipt_refs',
        owner_receipt_refs: ['owner-receipt:expected/test'],
      },
      foundry_lab_work_order: {
        surface_kind: 'opl_meta_agent_foundry_lab_work_order_candidate',
        work_order_id: 'foundry-work-order:test',
      },
      physical_materialization_owner: 'one-person-lab/OPL Foundry Lab',
      oma_writes_request_files: false,
      requested_file_names: {
        foundry_evaluation_request: 'foundry-evaluation-request.json',
        owner_receipt_refs: 'owner-receipt-refs.json',
        target_capability_improvement_candidate: 'target-capability-improvement-candidate.json',
        foundry_lab_work_order: 'foundry-lab-work-order.json',
      },
    },
  });

  const output = runCli([
    'work-order', 'materialize-request', '--request', requestPath, '--target-dir', targetDir, '--json',
  ]);
  const receipt = readJson(path.join(targetDir, 'work-order-materialization-receipt.json'));

  assert.equal(output.work_order_materialization.work_order_path,
    path.join(targetDir, 'foundry-lab-work-order.json'));
  assert.deepEqual(receipt.materialized_files.map((file: { path: string }) => file.path).sort(), [
    'foundry-evaluation-request.json',
    'foundry-lab-work-order.json',
    'owner-receipt-refs.json',
    'target-capability-improvement-candidate.json',
  ]);
  assert.equal(fs.existsSync(path.join(targetDir, 'owner-receipt-refs.json')), true);
});

test('work-order materialize-request fails closed before target creation for blocked or malformed input', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-work-order-materialize-blocked-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const blockedPath = path.join(root, 'blocked.json');
  const blockedTarget = path.join(root, 'blocked-target');
  writeJson(blockedPath, {
    agent_building_judgment: { status: 'blocked' },
  });

  const blocked = runCliFailure([
    'work-order', 'materialize-request', '--request', blockedPath, '--target-dir', blockedTarget, '--json',
  ]);
  assert.equal(blocked.payload.error.code, 'contract_shape_invalid');
  assert.equal(fs.existsSync(blockedTarget), false);

  const malformedPath = writeDeveloperSemanticEnvelope(root);
  const malformed = readJson(malformedPath);
  malformed.semantic_requests.developer_patch_work_order.owner_route_refs = [];
  writeJson(malformedPath, malformed);
  const malformedTarget = path.join(root, 'malformed-target');
  const failure = runCliFailure([
    'work-order', 'materialize-request', '--request', malformedPath, '--target-dir', malformedTarget, '--json',
  ]);
  assert.equal(failure.payload.error.code, 'contract_shape_invalid');
  assert.deepEqual(failure.payload.error.details.missing_guard_fields, ['target_owner_route']);
  assert.equal(fs.existsSync(malformedTarget), false);
});
