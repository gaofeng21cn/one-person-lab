import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');

function readAgentLabContract() {
  return JSON.parse(
    fs.readFileSync(
      path.join(repoRoot, 'contracts/opl-framework/agent-lab-contract.json'),
      'utf8',
    ),
  ) as Record<string, any>;
}

test('Agent Lab Developer Mode contract requires verified risk-tier promotion receipts', () => {
  const contract = readAgentLabContract();
  const routeSurface = contract.developer_mode_repair_route_surface;

  assert.equal(
    routeSurface.dynamic_route_builder.risk_tier_auto_promotion_ref_policy,
    'verified_agent_lab_risk_tier_promotion_ledger_receipt_required',
  );
  assert.equal(
    routeSurface.live_closeout_evidence.ledger_intake
      .risk_tier_auto_promotion_ref_policy,
    'verified_agent_lab_risk_tier_promotion_ledger_receipt_required',
  );
  assert.equal(
    routeSurface.live_closeout_evidence.scaleout_followthrough
      .risk_tier_auto_promotion_ref_policy,
    'verified_agent_lab_risk_tier_promotion_ledger_receipt_required',
  );
  assert.ok(
    routeSurface.live_closeout_evidence.scaleout_followthrough
      .required_return_shapes.includes(
        'verified_agent_lab_risk_tier_auto_promotion_receipt_ref',
      ),
  );
  assert.equal(
    routeSurface.live_closeout_evidence.ledger_intake
      .risk_tier_auto_promotion_record_cli,
    'opl agent-lab risk-tier-promotion record --payload <json>',
  );
  assert.equal(
    routeSurface.live_closeout_evidence.ledger_intake
      .risk_tier_auto_promotion_verify_cli,
    'opl agent-lab risk-tier-promotion verify [--receipt-ref <ref>]',
  );
  assert.equal(
    routeSurface.live_closeout_evidence.ledger_intake
      .external_owner_acceptance_missing_count_excludes_repo_contract_fixture_drills,
    true,
  );
  assert.equal(
    routeSurface.live_closeout_evidence.ledger_intake
      .fixture_drill_external_owner_acceptance_missing_count_exposes_fixture_negative_guard,
    true,
  );
});
