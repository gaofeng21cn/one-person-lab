import { assert, fs, os, path, runCli, test } from '../helpers.ts';
import { createFamilyDefaultContractWorkspace } from './domain-pack-compiler-fixtures.ts';

test('framework operating maturity reports owner gates and false-ready boundaries', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-operating-maturity-state-'));
  const workspaceRoot = createFamilyDefaultContractWorkspace();
  try {
    const env = {
      OPL_STATE_DIR: stateRoot,
      OPL_FAMILY_WORKSPACE_ROOT: workspaceRoot,
    };
    const maturity = runCli([
      'framework',
      'operating-maturity',
      '--family-defaults',
    ], env).framework_operating_maturity;

    assert.equal(maturity.surface_kind, 'opl_family_operating_maturity_readout');
    assert.equal(maturity.status, 'evidence_required');
    assert.equal(maturity.baseline_level, 'L4_executable_baseline');
    assert.equal(maturity.target_level, 'L5_production_operating_maturity');
    assert.equal(maturity.unresolved_owner_gates.status, 'owner_gates_required');
    assert.equal(maturity.unresolved_owner_gates.ready_claim_authorized, false);
    assert.deepEqual(maturity.unresolved_owner_gates.gate_ids, [
      'owner-gate:current_owner_delta_owner_answer',
      'owner-gate:domain_owner_chain_scaleout',
      'owner-gate:brand_module_l5_operating_maturity',
      'owner-gate:app_release_user_path',
      'owner-gate:provider_long_soak',
      'owner-gate:private_platform_retirement',
      'owner-gate:memory_artifact_lifecycle_apply',
    ]);
    assert.equal(maturity.current_owner_delta_bridge.default_planning_root, 'current_owner_delta');
    assert.equal(maturity.current_owner_delta_bridge.hard_gate.domain_ready_authorized, false);
    assert.equal(maturity.summary.domain_owner_chain_open_domain_count, 4);
    assert.equal(maturity.domain_owner_chain_scaleout.domains.length, 4);
    assert.equal(maturity.owner_evidence_intake.status, 'owner_evidence_required');
    const domainOwnerEvidence = maturity.owner_evidence_intake.lane_evidence.find(
      (entry: { lane: string }) => entry.lane === 'domain_owner_chain_scaleout',
    );
    assert.equal(domainOwnerEvidence.evidence_route, 'opl runtime domain-owner-payload-summary list --json');
    assert.equal(domainOwnerEvidence.verified_receipt_count, 0);
    assert.deepEqual(domainOwnerEvidence.observed_receipt_refs, []);
    assert.deepEqual(domainOwnerEvidence.observed_domains, []);
    assert.equal(maturity.foundry_agent_os_production_evidence_gate.status, 'evidence_required');
    assert.equal(maturity.foundry_agent_os_production_evidence_gate.summary.closed_by_opl, false);
    assert.equal(maturity.foundry_agent_os_production_evidence_gate.summary.production_ready_claim_authorized, false);
    assert.deepEqual(
      maturity.next_owner_actions.map((entry: { lane: string }) => entry.lane),
      [
        'domain_owner_chain_scaleout',
        'brand_module_l5_operating_maturity',
        'app_release_user_path',
        'provider_long_soak',
        'private_platform_retirement',
        'memory_artifact_lifecycle_apply',
      ],
    );
    assert.equal(maturity.authority_boundary.can_claim_domain_ready, false);
    assert.equal(maturity.authority_boundary.can_claim_app_release_ready, false);
    assert.equal(maturity.authority_boundary.can_claim_l5, false);
    assert.equal(maturity.authority_boundary.can_claim_production_ready, false);
    assert.equal(maturity.authority_boundary.can_sign_owner_receipt, false);
    assert.equal(maturity.authority_boundary.can_create_typed_blocker, false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test('framework operating maturity compact readback stays projection-only', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-operating-maturity-compact-state-'));
  const workspaceRoot = createFamilyDefaultContractWorkspace();
  try {
    const env = {
      OPL_STATE_DIR: stateRoot,
      OPL_FAMILY_WORKSPACE_ROOT: workspaceRoot,
    };
    const full = runCli([
      'framework',
      'operating-maturity',
      '--family-defaults',
    ], env).framework_operating_maturity;
    const compactOutput = runCli([
      'framework',
      'operating-maturity',
      '--family-defaults',
      '--detail',
      'compact',
    ], env);
    const compact = compactOutput.framework_operating_maturity_compact;

    assert.equal(Object.hasOwn(compactOutput, 'framework_operating_maturity'), false);
    assert.equal(compact.surface_kind, 'opl_family_operating_maturity_compact_readback');
    assert.equal(compact.detail_level, 'compact');
    assert.equal(compact.status, full.status);
    assert.equal(compact.summary.ready_claim_authorized, false);
    assert.deepEqual(compact.unresolved_owner_gates.gate_ids, full.unresolved_owner_gates.gate_ids);
    assert.equal(compact.omitted_sections.includes('owner_evidence_intake'), true);
    assert.equal(Object.hasOwn(compact, 'owner_evidence_intake'), false);
    assert.equal(compact.false_ready_guard.default_full_readback_unchanged, true);
    assert.equal(compact.false_ready_guard.compact_readback_can_claim_domain_ready, false);
    assert.equal(compact.false_ready_guard.compact_readback_can_claim_app_release_ready, false);
    assert.equal(compact.false_ready_guard.compact_readback_can_claim_l5, false);
    assert.equal(compact.false_ready_guard.compact_readback_can_claim_production_ready, false);
    assert.equal(compact.authority_boundary.refs_only, true);
    assert.equal(compact.authority_boundary.derived_from_full_readback, true);
    assert.equal(compact.authority_boundary.can_write_domain_truth, false);
    assert.equal(compact.authority_boundary.can_sign_owner_receipt, false);
    assert.equal(compact.authority_boundary.can_create_typed_blocker, false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});
