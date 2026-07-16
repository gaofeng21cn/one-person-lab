import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { FrameworkContractError } from '../../../src/kernel/contract-validation.ts';
import { materializeAgentScaffold } from '../../../src/modules/pack/agent-scaffold-materialization.ts';
import { buildAgentProfileConformance } from '../../../src/modules/pack/agent-profile-spine.ts';
import {
  makeConformantAgentFixture,
  makeSourceDerivedAgentFixture,
  updateSourceDerivedTypedObjectProjections,
  writeJson,
} from './fixtures.ts';

test('profile conformance checks selected profile refs, stage knowledge refs, and evidence objects', () => {
  const { repoDir, profile } = makeConformantAgentFixture();
  const conformance = buildAgentProfileConformance([
    '--repo-dir',
    repoDir,
    '--profile',
    profile.profile_id,
  ]).profile_conformance;

  assert.ok(conformance.observed);
  assert.ok(conformance.authority_boundary);
  assert.equal(conformance.status, 'passed', conformance.blockers.join('\n'));
  assert.deepEqual(conformance.blockers, []);
  assert.equal(conformance.observed.stages_with_knowledge_refs, 1);
  assert.equal(conformance.authority_boundary.conformance_can_claim_domain_ready, false);
});

test('scaffold materialization rejects the retired producer-specific v1 request', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-scaffold-materialization-v1-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const requestPath = path.join(root, 'request.json');
  writeJson(requestPath, {
    surface_kind: 'opl_agent_scaffold_materialization_request',
    version: 'opl-agent-scaffold-materialization-request.v1',
    request_owner: 'opl-meta-agent',
  });

  assert.throws(
    () => materializeAgentScaffold({
      requestPath,
      targetDir: path.join(root, 'target'),
    }),
    (error: unknown) => {
      assert.ok(error instanceof FrameworkContractError);
      assert.equal(error.message, 'Scaffold materialization request version is unsupported.');
      assert.deepEqual(error.details?.supported_versions, [
        'opl-agent-scaffold-materialization-request.v2',
      ]);
      return true;
    },
  );
});

test('profile conformance accepts source-derived design route receipts without a builtin profile', () => {
  const { repoDir } = makeSourceDerivedAgentFixture();
  const conformance = buildAgentProfileConformance([
    '--repo-dir',
    repoDir,
    '--profile',
    'source_derived_design_profile_route.v1',
  ]).profile_conformance;

  assert.equal(conformance.status, 'passed', conformance.blockers.join('\n'));
  assert.deepEqual(conformance.blockers, []);
  assert.equal(conformance.profile_ref, 'opl-profile-route:source_derived_design_profile_route.v1');
  assert.ok(conformance.observed.capability_profile_refs.includes('opl-profile-route:source_derived_design_profile_route.v1'));
  assert.ok(conformance.observed.required_stage_archetypes.includes('transferable_pattern_mapping'));
  const sourceDerivedDesign = conformance.observed.source_derived_design;
  assert.ok(sourceDerivedDesign);
  assert.ok(sourceDerivedDesign.reference_design_source_refs.includes('paper-ref:uploaded-colorectal-risk-framework'));
  assert.ok(sourceDerivedDesign.transfer_map_refs.includes('transfer-map-ref:oma/reference-designs/uploaded-paper/transfer-map'));
  assert.ok(sourceDerivedDesign.agent_pack_plan_refs.includes('agent-pack-plan-ref:colorectal-surgery-risk-from-paper/pack-plan'));
  assert.ok(sourceDerivedDesign.design_admission_receipt_refs.includes('design-admission-receipt-ref:colorectal-surgery-risk-from-paper/source-derived-design-admission'));
  assert.ok(sourceDerivedDesign.design_admission_receipt_stage_refs.includes('stage:colorectal-surgery-risk-from-paper/source-material-intake'));
  assert.ok(sourceDerivedDesign.design_admission_receipt_rejected_source_pattern_refs.includes('non-transferable:uploaded-paper/external-runtime-truth-authority'));
  assert.ok(sourceDerivedDesign.design_admission_receipt_forbidden_claims.includes('target_domain_ready'));
  assert.ok(sourceDerivedDesign.build_receipt_refs.includes('build-receipt-ref:colorectal-surgery-risk-from-paper/source-derived-build'));
  assert.ok(sourceDerivedDesign.stage_pattern_source_refs.includes('pattern-ref:uploaded-paper/colorectal-risk-workflow'));
  const typedObjectFloor = sourceDerivedDesign.typed_object_floor;
  assert.ok(typedObjectFloor);
  assert.deepEqual(typedObjectFloor.workflow_step_refs, [
    'colorectal-risk-workflow/source-material-intake',
    'colorectal-risk-workflow/risk-evidence-synthesis',
  ]);
  assert.equal(typedObjectFloor.mapped_workflow_step_count, 2);
  assert.equal(typedObjectFloor.planned_stage_refs.length, 2);
  assert.equal(typedObjectFloor.admitted_design_stage_refs.length, 2);
  assert.equal(conformance.authority_boundary.conformance_can_claim_domain_ready, false);
});

test('profile conformance binds generated stage provenance to the planned stage with the same id', async (t) => {
  const cases: Array<{
    name: string;
    mutate: (stages: Record<string, any>[]) => void;
    blocker: string;
  }> = [
    {
      name: 'origin',
      mutate: ([stage]) => {
        stage.stage_origin = 'target_only_requirement';
        stage.target_only_requirement_ref = 'target-only-requirement:wrong-origin';
        delete stage.pattern_id;
        delete stage.step_id;
        delete stage.provenance_kind;
        delete stage.source_pattern_ref;
        delete stage.source_anchor_refs;
        delete stage.stage_pattern_source_refs;
      },
      blocker: 'source_derived_design_stage_manifest_origin_mismatch:source-material-intake',
    },
    {
      name: 'pattern id',
      mutate: ([stage]) => {
        stage.pattern_id = 'wrong-pattern';
      },
      blocker: 'source_derived_design_stage_manifest_pattern_id_mismatch:source-material-intake',
    },
    {
      name: 'step id',
      mutate: ([stage]) => {
        stage.step_id = 'wrong-step';
      },
      blocker: 'source_derived_design_stage_manifest_step_id_mismatch:source-material-intake',
    },
    {
      name: 'source pattern ref',
      mutate: ([stage]) => {
        stage.source_pattern_ref = 'pattern-ref:wrong/source';
        stage.stage_pattern_source_refs = ['pattern-ref:wrong/source'];
      },
      blocker: 'source_derived_design_stage_manifest_source_pattern_ref_mismatch:source-material-intake',
    },
    {
      name: 'target-only requirement ref',
      mutate: (stages) => {
        const stage = stages.at(-1);
        assert.ok(stage);
        stage.target_only_requirement_ref = 'target-only-requirement:wrong/closeout';
      },
      blocker: 'source_derived_design_stage_manifest_target_only_requirement_ref_mismatch:owner-gated-closeout',
    },
  ];

  for (const entry of cases) {
    await t.test(entry.name, () => {
      const { repoDir } = makeSourceDerivedAgentFixture();
      const manifestPath = path.join(repoDir, 'agent', 'stages', 'manifest.json');
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      entry.mutate(manifest.stages);
      writeJson(manifestPath, manifest);

      const conformance = buildAgentProfileConformance([
        '--repo-dir',
        repoDir,
        '--profile',
        'source_derived_design_profile_route.v1',
      ]).profile_conformance;

      assert.equal(conformance.status, 'blocked');
      assert.equal(conformance.blockers.includes(entry.blocker), true);
    });
  }
});

test('profile conformance recomputes complete planned file digests from the target agent root', () => {
  const missingDigestFixture = makeSourceDerivedAgentFixture();
  const missingDigestRef = 'agent/stages/source-material-intake.md';
  updateSourceDerivedTypedObjectProjections(missingDigestFixture.repoDir, (typedObjects) => {
    typedObjects.build_receipt.materialization.materialized_file_digests =
      typedObjects.build_receipt.materialization.materialized_file_digests.filter(
        (entry: Record<string, unknown>) => entry.ref !== missingDigestRef,
      );
  });
  const missingDigest = buildAgentProfileConformance([
    '--repo-dir',
    missingDigestFixture.repoDir,
    '--profile',
    'source_derived_design_profile_route.v1',
  ]).profile_conformance;
  assert.equal(missingDigest.status, 'blocked');
  assert.equal(
    missingDigest.blockers.includes(
      `source_derived_design_build_receipt_missing_planned_file_digest:${missingDigestRef}`,
    ),
    true,
  );

  const missingFileFixture = makeSourceDerivedAgentFixture();
  const missingFileRef = 'agent/tools/source-intake.md';
  fs.rmSync(path.join(missingFileFixture.repoDir, missingFileRef));
  const missingFile = buildAgentProfileConformance([
    '--repo-dir',
    missingFileFixture.repoDir,
    '--profile',
    'source_derived_design_profile_route.v1',
  ]).profile_conformance;
  assert.equal(missingFile.status, 'blocked');
  assert.equal(
    missingFile.blockers.includes(
      `reference_build_proof_materialized_file_missing:${missingFileRef}`,
    ),
    true,
  );

  const driftedFileFixture = makeSourceDerivedAgentFixture();
  const driftedFileRef = 'agent/knowledge/reference-design.md';
  fs.appendFileSync(path.join(driftedFileFixture.repoDir, driftedFileRef), 'drifted after receipt\n');
  const driftedFile = buildAgentProfileConformance([
    '--repo-dir',
    driftedFileFixture.repoDir,
    '--profile',
    'source_derived_design_profile_route.v1',
  ]).profile_conformance;
  assert.equal(driftedFile.status, 'blocked');
  assert.equal(
    driftedFile.blockers.includes(
      `source_derived_design_build_receipt_materialized_file_digest_mismatch:${driftedFileRef}:sha256`,
    ),
    true,
  );
});

test('profile conformance requires one user packet per declared source and keeps seed packets secondary', () => {
  const uncoveredSourceFixture = makeSourceDerivedAgentFixture();
  updateSourceDerivedTypedObjectProjections(
    uncoveredSourceFixture.repoDir,
    (typedObjects, capabilityMap) => {
      const extraSourceRef = 'paper-ref:second-user-supplied-reference';
      typedObjects.reference_design_packet.reference_source_refs.push(extraSourceRef);
      capabilityMap.source_derived_design_receipt.source_refs.push(extraSourceRef);
      capabilityMap.source_derived_design_receipt.reference_design_source_refs.push(extraSourceRef);
    },
  );
  const uncoveredSource = buildAgentProfileConformance([
    '--repo-dir',
    uncoveredSourceFixture.repoDir,
    '--profile',
    'source_derived_design_profile_route.v1',
  ]).profile_conformance;
  assert.equal(uncoveredSource.status, 'blocked');
  assert.equal(
    uncoveredSource.blockers.includes(
      'source_derived_design_reference_source_packet_cardinality_mismatch:2:1',
    ),
    true,
  );

  const seedPrimaryFixture = makeSourceDerivedAgentFixture();
  const seedPacketRef = 'expert-workflow-pattern:oma/case-grounded-expert-decision-workflow.v1';
  updateSourceDerivedTypedObjectProjections(
    seedPrimaryFixture.repoDir,
    (typedObjects, capabilityMap) => {
      const packetRefs = [
        seedPacketRef,
        ...typedObjects.reference_design_packet.reference_design_pattern_packet_refs,
      ];
      typedObjects.reference_design_packet.reference_design_pattern_packet_refs = packetRefs;
      capabilityMap.source_derived_design_receipt.reference_design_packet_refs = packetRefs;
      capabilityMap.source_derived_design_receipt.reference_design_pattern_packet_refs = packetRefs;
    },
  );
  const seedPrimary = buildAgentProfileConformance([
    '--repo-dir',
    seedPrimaryFixture.repoDir,
    '--profile',
    'source_derived_design_profile_route.v1',
  ]).profile_conformance;
  assert.equal(seedPrimary.status, 'blocked');
  assert.equal(
    seedPrimary.blockers.includes(
      `source_derived_design_seed_packet_cannot_be_primary:${seedPacketRef}`,
    ),
    true,
  );

  const seedExpansionFixture = makeSourceDerivedAgentFixture();
  updateSourceDerivedTypedObjectProjections(
    seedExpansionFixture.repoDir,
    (typedObjects, capabilityMap, stageManifest) => {
      typedObjects.reference_design_packet.reference_design_pattern_packet_refs.push(seedPacketRef);
      typedObjects.reference_design_packet.transferable_design_patterns[0].source_pattern_ref = seedPacketRef;
      typedObjects.agent_pack_plan.planned_stage_refs[0].source_pattern_ref = seedPacketRef;
      typedObjects.design_admission_receipt.design_derived_stage_refs[0].source_pattern_ref = seedPacketRef;
      typedObjects.design_admission_receipt.source_derived_stage_refs[0].source_pattern_ref = seedPacketRef;
      typedObjects.build_receipt.source_derived_stage_refs[0].source_pattern_ref = seedPacketRef;
      capabilityMap.source_derived_design_receipt.reference_design_packet_refs.push(seedPacketRef);
      capabilityMap.source_derived_design_receipt.reference_design_pattern_packet_refs.push(seedPacketRef);
      stageManifest.stages[0].source_pattern_ref = seedPacketRef;
      stageManifest.stages[0].stage_pattern_source_refs = [seedPacketRef];
    },
  );
  const seedExpansion = buildAgentProfileConformance([
    '--repo-dir',
    seedExpansionFixture.repoDir,
    '--profile',
    'source_derived_design_profile_route.v1',
  ]).profile_conformance;
  assert.equal(seedExpansion.status, 'blocked');
  assert.equal(
    seedExpansion.blockers.includes(
      `source_derived_design_seed_packet_expands_active_stage_graph:source-material-intake:${seedPacketRef}`,
    ),
    true,
  );

  const seedDispositionFixture = makeSourceDerivedAgentFixture();
  updateSourceDerivedTypedObjectProjections(seedDispositionFixture.repoDir, (typedObjects) => {
    typedObjects.reference_design_packet.reference_design_pattern_packet_refs.push(seedPacketRef);
    typedObjects.reference_design_packet.pattern_dispositions[0] = {
      pattern_ref: seedPacketRef,
      pattern_origin: 'provider_neutral_seed_catalog',
      disposition: 'adopt',
    };
  });
  const seedDisposition = buildAgentProfileConformance([
    '--repo-dir',
    seedDispositionFixture.repoDir,
    '--profile',
    'source_derived_design_profile_route.v1',
  ]).profile_conformance;
  assert.equal(seedDisposition.status, 'blocked');
  assert.equal(
    seedDisposition.blockers.includes(
      `source_derived_design_seed_disposition_invalid:${seedPacketRef}`,
    ),
    true,
  );

  const relabeledOriginFixture = makeSourceDerivedAgentFixture();
  let relabeledPatternRef = '';
  updateSourceDerivedTypedObjectProjections(relabeledOriginFixture.repoDir, (typedObjects) => {
    relabeledPatternRef = typedObjects.reference_design_packet.transferable_design_patterns[0].source_pattern_ref;
    typedObjects.reference_design_packet.transferable_design_patterns[0].pattern_origin = 'provider_neutral_seed_catalog';
  });
  const relabeledOrigin = buildAgentProfileConformance([
    '--repo-dir',
    relabeledOriginFixture.repoDir,
    '--profile',
    'source_derived_design_profile_route.v1',
  ]).profile_conformance;
  assert.equal(relabeledOrigin.status, 'blocked');
  assert.equal(
    relabeledOrigin.blockers.includes(
      `source_derived_design_active_pattern_origin_invalid:${relabeledPatternRef}`,
    ),
    true,
  );
});

test('profile conformance binds workflow transfer mappings to planned stage refs', () => {
  const { repoDir } = makeSourceDerivedAgentFixture();
  const capabilityMapPath = path.join(repoDir, 'contracts', 'capability_map.json');
  const capabilityMap = JSON.parse(fs.readFileSync(capabilityMapPath, 'utf8'));

  capabilityMap.transfer_map.mappings[0].target_stage_or_capability_slot =
    'stage:colorectal-surgery-risk-from-paper/unrelated-stage';
  writeJson(capabilityMapPath, capabilityMap);

  const conformance = buildAgentProfileConformance([
    '--repo-dir',
    repoDir,
    '--profile',
    'source_derived_design_profile_route.v1',
  ]).profile_conformance;

  assert.equal(conformance.status, 'blocked');
  assert.equal(
    conformance.blockers.includes(
      'source_derived_design_agent_pack_plan_missing_workflow_step_stage:colorectal-risk-workflow/source-material-intake',
    ),
    true,
  );
});

test('profile conformance requires every source and target-only planned stage to be materialized', () => {
  const { repoDir } = makeSourceDerivedAgentFixture();
  const stageManifestPath = path.join(repoDir, 'agent', 'stages', 'manifest.json');
  const stageManifest = JSON.parse(fs.readFileSync(stageManifestPath, 'utf8'));
  const removedStage = stageManifest.stages.pop();
  writeJson(stageManifestPath, stageManifest);

  const conformance = buildAgentProfileConformance([
    '--repo-dir',
    repoDir,
    '--profile',
    'source_derived_design_profile_route.v1',
  ]).profile_conformance;

  assert.equal(conformance.status, 'blocked');
  assert.equal(
    conformance.blockers.includes(
      `source_derived_design_stage_control_plane_planned_stage_count_invalid:${removedStage.stage_id}`,
    ),
    true,
  );
});

test('profile conformance fails closed when source-derived route only exposes route ref', () => {
  const { repoDir } = makeSourceDerivedAgentFixture();
  const capabilityMapPath = path.join(repoDir, 'contracts', 'capability_map.json');
  const capabilityMap = JSON.parse(fs.readFileSync(capabilityMapPath, 'utf8'));
  const routeOnlyReceipt = {
    route_id: 'source_derived_design_profile_route.v1',
    route_ref: 'opl-profile-route:source_derived_design_profile_route.v1',
  };
  capabilityMap.source_derived_design_receipt = routeOnlyReceipt;
  delete capabilityMap.reference_design_packet;
  delete capabilityMap.reference_design_packet_ref;
  delete capabilityMap.transfer_map;
  delete capabilityMap.transfer_map_ref;
  delete capabilityMap.agent_pack_plan;
  delete capabilityMap.agent_pack_plan_ref;
  delete capabilityMap.design_admission_receipt;
  delete capabilityMap.design_admission_receipt_ref;
  delete capabilityMap.design_admission_receipt_refs;
  delete capabilityMap.build_receipt;
  delete capabilityMap.build_receipt_ref;
  delete capabilityMap.build_receipt_refs;
  capabilityMap.profile_requirements = {
    required_stage_archetypes: capabilityMap.profile_requirements.required_stage_archetypes,
    required_capability_kinds: capabilityMap.profile_requirements.required_capability_kinds,
    required_surface_roles: capabilityMap.profile_requirements.required_surface_roles,
  };
  writeJson(capabilityMapPath, capabilityMap);

  const conformance = buildAgentProfileConformance([
    '--repo-dir',
    repoDir,
    '--profile',
    'source_derived_design_profile_route.v1',
  ]).profile_conformance;

  assert.equal(conformance.status, 'blocked');
  assert.equal(
    conformance.blockers.includes('source_derived_design_missing_reference_design_source_refs'),
    true,
  );
  assert.equal(
    conformance.blockers.includes('source_derived_design_missing_reference_design_packet_refs'),
    true,
  );
  assert.equal(
    conformance.blockers.includes('source_derived_design_missing_transfer_map_refs'),
    true,
  );
  assert.equal(
    conformance.blockers.includes('source_derived_design_missing_agent_pack_plan_refs'),
    true,
  );
  assert.equal(
    conformance.blockers.includes('source_derived_design_missing_build_receipt_refs'),
    true,
  );
    assert.equal(
      conformance.blockers.includes('source_derived_design_missing_design_admission_receipt_refs'),
      true,
    );
  assert.equal(
    conformance.blockers.includes('source_derived_design_missing_stage_pattern_source_refs_or_target_only_requirement'),
    true,
  );
});

test('profile conformance fails closed when source-derived requirements exist without transfer objects', () => {
  const { repoDir } = makeSourceDerivedAgentFixture();
  const capabilityMapPath = path.join(repoDir, 'contracts', 'capability_map.json');
  const capabilityMap = JSON.parse(fs.readFileSync(capabilityMapPath, 'utf8'));

  delete capabilityMap.source_derived_design_receipt.transfer_map_refs;
  delete capabilityMap.source_derived_design_receipt.agent_pack_plan_refs;
  delete capabilityMap.source_derived_design_receipt.design_admission_receipt_refs;
  delete capabilityMap.design_admission_receipt;
  delete capabilityMap.design_admission_receipt_ref;
  delete capabilityMap.design_admission_receipt_refs;
  delete capabilityMap.source_derived_design_receipt.build_receipt_refs;
  delete capabilityMap.build_receipt;
  delete capabilityMap.build_receipt_ref;
  delete capabilityMap.build_receipt_refs;
  delete capabilityMap.transfer_map;
  delete capabilityMap.transfer_map_ref;
  delete capabilityMap.agent_pack_plan;
  delete capabilityMap.agent_pack_plan_ref;

  writeJson(capabilityMapPath, capabilityMap);

  const conformance = buildAgentProfileConformance([
    '--repo-dir',
    repoDir,
    '--profile',
    'source_derived_design_profile_route.v1',
  ]).profile_conformance;

  assert.equal(conformance.status, 'blocked');
  assert.equal(
    conformance.blockers.includes('source_derived_design_missing_transfer_map_refs'),
    true,
  );
  assert.equal(
    conformance.blockers.includes('source_derived_design_missing_agent_pack_plan_refs'),
    true,
  );
  assert.equal(
    conformance.blockers.includes('source_derived_design_missing_build_receipt_refs'),
    true,
  );
    assert.equal(
      conformance.blockers.includes('source_derived_design_missing_design_admission_receipt_refs'),
      true,
    );
  assert.equal(
    conformance.blockers.includes('source_derived_design_missing_stage_pattern_source_refs_or_target_only_requirement'),
    true,
  );
});

test('profile conformance blocks hollow source-derived typed objects', () => {
  const { repoDir } = makeSourceDerivedAgentFixture();
  const capabilityMapPath = path.join(repoDir, 'contracts', 'capability_map.json');
  const capabilityMap = JSON.parse(fs.readFileSync(capabilityMapPath, 'utf8'));

  capabilityMap.reference_design_packet = {
      surface_kind: 'opl_foundry_reference_design_packet',
      version: 'opl.foundry.reference-design-packet.v1',
      packet_ref: capabilityMap.reference_design_packet_ref,
      transferable_design_patterns: [{ pattern_id: 'generic-pattern' }],
  };
  capabilityMap.transfer_map = {
      surface_kind: 'opl_foundry_transfer_map',
      version: 'opl.foundry.transfer-map.v1',
      transfer_map_ref: capabilityMap.transfer_map_ref,
      reference_design_packet_ref: capabilityMap.reference_design_packet_ref,
      mappings: [{ source_anchor_ref: 'ref-only' }],
  };
  capabilityMap.agent_pack_plan = {
      surface_kind: 'opl_foundry_agent_pack_plan',
      version: 'opl.foundry.agent-pack-plan.v1',
      plan_ref: capabilityMap.agent_pack_plan_ref,
      reference_design_packet_ref: capabilityMap.reference_design_packet_ref,
      transfer_map_ref: capabilityMap.transfer_map_ref,
      planned_stage_refs: [{ stage_ref: 'stage:generic' }],
  };
  capabilityMap.design_admission_receipt = {
      surface_kind: 'opl_foundry_design_admission_receipt',
      version: 'opl.foundry.design-admission-receipt.v1',
      receipt_ref: capabilityMap.design_admission_receipt_ref,
      reference_design_packet_ref: capabilityMap.reference_design_packet_ref,
      transfer_map_ref: capabilityMap.transfer_map_ref,
      agent_pack_plan_ref: capabilityMap.agent_pack_plan_ref,
      design_derived_stage_refs: [],
  };
  writeJson(capabilityMapPath, capabilityMap);

  const conformance = buildAgentProfileConformance([
    '--repo-dir',
    repoDir,
    '--profile',
    'source_derived_design_profile_route.v1',
  ]).profile_conformance;

  assert.equal(conformance.status, 'blocked');
  assert.equal(
    conformance.blockers.includes(
      'source_derived_design_reference_design_packet_workflow_steps_invalid:generic-pattern',
    ),
    true,
  );
  assert.equal(
    conformance.blockers.includes('source_derived_design_transfer_map_missing_typed_workflow_mappings'),
    true,
  );
  assert.equal(
    conformance.blockers.includes('source_derived_design_agent_pack_plan_missing_typed_workflow_stages'),
    true,
  );
  assert.equal(
    conformance.blockers.includes('source_derived_design_design_admission_receipt_missing_stage_refs'),
    true,
  );
});

test('profile conformance fails closed when profile refs and knowledge refs are missing', () => {
  const { repoDir, profile } = makeConformantAgentFixture();
  const capabilityMapPath = path.join(repoDir, 'contracts', 'capability_map.json');
  const stageManifestPath = path.join(repoDir, 'agent', 'stages', 'manifest.json');
  const capabilityMap = JSON.parse(fs.readFileSync(capabilityMapPath, 'utf8'));
  const stageManifest = JSON.parse(fs.readFileSync(stageManifestPath, 'utf8'));
  delete capabilityMap.selected_profile_refs;
  stageManifest.stages[0].knowledge_refs = [];
  writeJson(capabilityMapPath, capabilityMap);
  writeJson(stageManifestPath, stageManifest);

  const conformance = buildAgentProfileConformance([
    '--repo-dir',
    repoDir,
    '--profile',
    profile.profile_id,
  ]).profile_conformance;

  assert.equal(conformance.status, 'blocked');
  assert.equal(
    conformance.blockers.includes('capability_map_missing_selected_profile_ref:evidence_grounded_decision_agent_profile.v1'),
    true,
  );
  assert.equal(conformance.blockers.includes('stage_control_plane_missing_knowledge_refs'), true);
});
