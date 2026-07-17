import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { buildProfileCommandSpecs } from '../../src/entrypoints/cli/cases/public-command-specs-parts/profiles.ts';
import { parseJsonText, readJsonPayloadFile } from '../../src/kernel/json-file.ts';
import {
  buildProfileCapabilityPlan,
  buildProfileCapabilityPlanInputProjection,
} from '../../src/modules/pack/profile-capability-plan.ts';
import { buildStandardDomainAgentScaffold } from '../../src/modules/pack/standard-domain-agent-scaffold.ts';

type JsonRecord = Record<string, unknown>;

function writeJson(filePath: string, payload: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}

function readJson(filePath: string): JsonRecord {
  return readJsonPayloadFile(filePath) as JsonRecord;
}

function fileFingerprint(filePath: string) {
  return `sha256:${crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')}`;
}

function withTempDir(run: (root: string) => void) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-profile-capability-plan-'));
  try {
    run(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function writeSelection(filePath: string, capabilityRefs: string[]) {
  writeJson(filePath, {
    version: 'g2',
    profile_capability_plan_input: buildProfileCapabilityPlanInputProjection({
      exactCapabilityRefs: capabilityRefs,
      requiredCapabilityKinds: ['stage_prompt'],
      requiredSurfaceRoles: ['quality_gate'],
    }),
    profile_selection_receipt: {
      surface_kind: 'opl_profile_selection_receipt',
      version: 'profile-selection-receipt.v1',
      status: 'selected',
      selected_profile_refs: ['opl-profile:test.v1'],
    },
  });
}

function writeStandardCatalog(repoDir: string, domainId = 'test-agent') {
  buildStandardDomainAgentScaffold({
    domainId,
    domainLabel: 'Test Agent',
    targetDir: repoDir,
  });
  const mapPath = path.join(repoDir, 'contracts', 'capability_map.json');
  const map = readJson(mapPath) as JsonRecord & { capabilities: JsonRecord[] };
  return { mapPath, map };
}

function writeBoundDelta(filePath: string, input: {
  deltaId?: string;
  deltaRef?: string;
  domain?: string;
  domainId?: string;
  currentOwner?: string;
  capabilityRef: string;
  hardBoundary?: string;
}) {
  writeJson(filePath, {
    surface_kind: 'opl_current_owner_delta',
    schema_version: 'current-owner-delta.v1',
    default_planning_root: 'current_owner_delta',
    delta_id: input.deltaId ?? 'current-owner-delta:test/1',
    ...(input.deltaRef === undefined ? {} : { delta_ref: input.deltaRef }),
    domain: input.domain ?? 'test-agent',
    ...(input.domainId === undefined ? {} : { domain_id: input.domainId }),
    task_or_study_ref: 'task:test/1',
    stage_ref: 'stage:test/plan',
    work_unit_ref: 'work-unit:test/1',
    current_owner: input.currentOwner ?? 'test-agent',
    required_capability_refs: [{
      capability_ref: input.capabilityRef,
      binding_kind: 'route_required',
      ...(input.hardBoundary === undefined ? {} : { hard_boundary: input.hardBoundary }),
      required_by_delta_ref: input.deltaRef ?? input.deltaId ?? 'current-owner-delta:test/1',
    }],
  });
}

test('profile capability plan resolves a schema-valid exact ref and emits cwd-bound conditional Pack OS argv', () => {
  withTempDir((root) => {
    const catalogRepo = path.join(root, 'agent-repo');
    const selectionFile = path.join(root, 'profile-selection.json');
    const { mapPath, map } = writeStandardCatalog(catalogRepo);
    const firstCapability = map.capabilities[0];
    const capabilityRef = String(firstCapability.capability_id);
    const pointerRef = 'contracts/capability_map.json#/capabilities/0';
    const descriptorRef = 'packs/test-agent/opl_pack.json';
    const descriptorPath = path.join(catalogRepo, descriptorRef);
    writeJson(descriptorPath, { surface_kind: 'opl_generic_capability_pack_descriptor' });
    firstCapability.dependency_profile_refs = ['runtime_env_dependency_profile:test-agent-v1'];
    firstCapability.environment_action_refs = [
      'opl runtime env prepare --domain test-agent --profile default --platform <platform> --requirement-profile <path> --artifact-root <path> --json',
    ];
    firstCapability.install_action_refs = [
      'opl packages install --manifest <manifest> --json',
    ];
    firstCapability.pack_os_descriptor_refs = [{
      surface_kind: 'opl_pack_os_descriptor_ref',
      descriptor_ref: descriptorRef,
    }];
    writeJson(mapPath, map);
    writeSelection(selectionFile, [capabilityRef, pointerRef, 'capability:missing/optional']);

    const readback = buildProfileCapabilityPlan({
      selectionFile,
      catalogRepos: [catalogRepo],
    }).capability_plan;

    assert.equal(readback.surface_kind, 'opl_profile_capability_plan');
    assert.deepEqual(readback.exact_capability_readout.capability_refs, [pointerRef, capabilityRef].sort());
    assert.equal(readback.dependency_feasibility.candidate_capability_count, 1);
    assert.deepEqual(readback.missing_optional_requirements, [
      'capability:missing/optional',
      'profile-capability-kind:stage_prompt',
      'profile-surface-role:quality_gate',
    ]);
    assert.deepEqual(readback.route_required_blocker_candidates, []);
    assert.deepEqual(readback.dependency_feasibility.candidate_dependency_refs, [
      'runtime_env_dependency_profile:test-agent-v1',
    ]);
    assert.equal(
      readback.dependency_feasibility.environment_preflight.candidate_actions[0].cwd,
      fs.realpathSync.native(catalogRepo),
    );
    assert.equal(
      readback.dependency_feasibility.candidate_install_actions[0].cwd,
      fs.realpathSync.native(catalogRepo),
    );
    assert.deepEqual(
      readback.dependency_feasibility.descriptor_materialization.candidate_descriptor_refs,
      [{
        descriptor_ref: descriptorRef,
        catalog_root: fs.realpathSync.native(catalogRepo),
        descriptor_source_fingerprint: fileFingerprint(descriptorPath),
      }],
    );
    assert.deepEqual(
      readback.dependency_feasibility.descriptor_materialization.candidate_inspect_actions[0],
      {
        action_kind: 'inspect',
        argv: ['opl', 'pack', 'os', 'inspect', '--descriptor', descriptorRef, '--json'],
        cwd: fs.realpathSync.native(catalogRepo),
        descriptor_ref: descriptorRef,
        descriptor_source_fingerprint: fileFingerprint(descriptorPath),
      },
    );
    assert.deepEqual(readback.dependency_feasibility.default_side_effects, {
      network_accessed: false,
      sync_executed: false,
      install_executed: false,
      download_executed: false,
      cache_write_executed: false,
    });
  });
});

test('profile capability plan rejects malformed route-required requirements instead of failing open', () => {
  withTempDir((root) => {
    const catalogRepo = path.join(root, 'agent-repo');
    const selectionFile = path.join(root, 'profile-selection.json');
    const deltaFile = path.join(root, 'current-owner-delta.json');
    writeStandardCatalog(catalogRepo);
    writeSelection(selectionFile, []);
    writeBoundDelta(deltaFile, {
      capabilityRef: 'capability:missing/route-required',
      hardBoundary: 'source_data_evidnce',
    });

    assert.throws(() => buildProfileCapabilityPlan({
      selectionFile,
      catalogRepos: [catalogRepo],
      currentOwnerDeltaFile: deltaFile,
    }), /Payload failed JSON Schema validation/);

    writeBoundDelta(deltaFile, {
      capabilityRef: 'capability:missing/route-required',
    });
    assert.throws(() => buildProfileCapabilityPlan({
      selectionFile,
      catalogRepos: [catalogRepo],
      currentOwnerDeltaFile: deltaFile,
    }), /Payload failed JSON Schema validation/);
  });
});

test('profile capability plan creates a blocker candidate only for a canonical bound hard boundary', () => {
  withTempDir((root) => {
    const catalogRepo = path.join(root, 'agent-repo');
    const selectionFile = path.join(root, 'profile-selection.json');
    const deltaFile = path.join(root, 'current-owner-delta.json');
    writeStandardCatalog(catalogRepo);
    writeSelection(selectionFile, []);
    writeBoundDelta(deltaFile, {
      capabilityRef: 'capability:missing/route-required',
      hardBoundary: 'source_data_evidence',
    });

    const plan = buildProfileCapabilityPlan({
      selectionFile,
      catalogRepos: [catalogRepo],
      currentOwnerDeltaFile: deltaFile,
    }).capability_plan;

    assert.equal(plan.route_required_blocker_candidates.length, 1);
    assert.equal(
      plan.route_required_blocker_candidates[0].missing_capability_ref,
      'capability:missing/route-required',
    );
    assert.equal(plan.authority_boundary.can_create_typed_blocker_instance, false);
  });
});

test('profile capability plan rejects empty or conflicting current-owner-delta identity fields', () => {
  withTempDir((root) => {
    const catalogRepo = path.join(root, 'agent-repo');
    const selectionFile = path.join(root, 'profile-selection.json');
    const deltaFile = path.join(root, 'current-owner-delta.json');
    writeStandardCatalog(catalogRepo);
    writeSelection(selectionFile, []);

    const invalidIdentities = [
      { domain: '' },
      { currentOwner: ' ' },
      { domain: 'test-agent', domainId: 'other-agent' },
      {
        deltaId: 'current-owner-delta:test/id',
        deltaRef: 'current-owner-delta:test/ref',
      },
    ];
    for (const identity of invalidIdentities) {
      writeBoundDelta(deltaFile, {
        capabilityRef: 'capability:missing/route-required',
        hardBoundary: 'source_data_evidence',
        ...identity,
      });
      assert.throws(() => buildProfileCapabilityPlan({
        selectionFile,
        catalogRepos: [catalogRepo],
        currentOwnerDeltaFile: deltaFile,
      }), /not a canonical bound delta/);
    }
  });
});

test('profile capability plan binds its fingerprint to current-owner-delta content and identity', () => {
  withTempDir((root) => {
    const catalogRepo = path.join(root, 'agent-repo');
    const selectionFile = path.join(root, 'profile-selection.json');
    const deltaA = path.join(root, 'delta-a.json');
    const deltaB = path.join(root, 'delta-b.json');
    writeStandardCatalog(catalogRepo);
    writeSelection(selectionFile, []);
    writeBoundDelta(deltaA, {
      deltaId: 'current-owner-delta:test/a',
      currentOwner: 'owner-a',
      capabilityRef: 'capability:missing/route-required',
      hardBoundary: 'source_data_evidence',
    });
    writeBoundDelta(deltaB, {
      deltaId: 'current-owner-delta:test/b',
      currentOwner: 'owner-b',
      capabilityRef: 'capability:missing/route-required',
      hardBoundary: 'source_data_evidence',
    });

    const planA = buildProfileCapabilityPlan({
      selectionFile,
      catalogRepos: [catalogRepo],
      currentOwnerDeltaFile: deltaA,
    }).capability_plan;
    const planB = buildProfileCapabilityPlan({
      selectionFile,
      catalogRepos: [catalogRepo],
      currentOwnerDeltaFile: deltaB,
    }).capability_plan;

    assert.notEqual(planA.plan_fingerprint, planB.plan_fingerprint);
    assert.notEqual(
      planA.current_owner_delta_binding.source_fingerprint,
      planB.current_owner_delta_binding.source_fingerprint,
    );
    assert.equal(planA.route_required_blocker_candidates[0].route_back_owner, 'owner-a');
    assert.equal(planB.route_required_blocker_candidates[0].route_back_owner, 'owner-b');
  });
});

test('profile capability plan rejects ambiguous repo-relative refs across explicit catalogs', () => {
  withTempDir((root) => {
    const catalogA = path.join(root, 'agent-a');
    const catalogB = path.join(root, 'agent-b');
    const selectionFile = path.join(root, 'profile-selection.json');
    const { map: mapA } = writeStandardCatalog(catalogA, 'same-agent');
    writeStandardCatalog(catalogB, 'same-agent');
    const capabilityRef = String(mapA.capabilities[0].capability_id);
    writeSelection(selectionFile, [capabilityRef]);

    assert.throws(() => buildProfileCapabilityPlan({
      selectionFile,
      catalogRepos: [catalogA, catalogB],
    }), new RegExp(`Ambiguous capability ref across catalogs: ${capabilityRef.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
  });
});

test('profile capability plan rejects duplicate capability ids inside a standard catalog', () => {
  withTempDir((root) => {
    const catalogRepo = path.join(root, 'agent-repo');
    const selectionFile = path.join(root, 'profile-selection.json');
    const { mapPath, map } = writeStandardCatalog(catalogRepo);
    const duplicate = structuredClone(map.capabilities[0]);
    map.capabilities[0].dependency_profile_refs = ['dep:first'];
    duplicate.dependency_profile_refs = ['dep:second'];
    map.capabilities.push(duplicate);
    writeJson(mapPath, map);
    writeSelection(selectionFile, [String(map.capabilities[0].capability_id)]);

    assert.throws(() => buildProfileCapabilityPlan({
      selectionFile,
      catalogRepos: [catalogRepo],
    }), /repeats capability ids/);
  });
});

test('profile capability plan binds descriptor content to candidate actions and plan fingerprint', () => {
  withTempDir((root) => {
    const catalogRepo = path.join(root, 'agent-repo');
    const selectionFile = path.join(root, 'profile-selection.json');
    const { mapPath, map } = writeStandardCatalog(catalogRepo);
    const capabilityRef = String(map.capabilities[0].capability_id);
    const descriptorRef = 'packs/test-agent/opl_pack.json';
    const descriptorPath = path.join(catalogRepo, descriptorRef);
    map.capabilities[0].pack_os_descriptor_refs = [{
      surface_kind: 'opl_pack_os_descriptor_ref',
      descriptor_ref: descriptorRef,
    }];
    writeJson(mapPath, map);
    writeSelection(selectionFile, [capabilityRef]);

    writeJson(descriptorPath, { surface_kind: 'opl_generic_capability_pack_descriptor', revision: 1 });
    const firstPlan = buildProfileCapabilityPlan({
      selectionFile,
      catalogRepos: [catalogRepo],
    }).capability_plan;
    writeJson(descriptorPath, { surface_kind: 'opl_generic_capability_pack_descriptor', revision: 2 });
    const secondPlan = buildProfileCapabilityPlan({
      selectionFile,
      catalogRepos: [catalogRepo],
    }).capability_plan;

    assert.notEqual(firstPlan.plan_fingerprint, secondPlan.plan_fingerprint);
    assert.notEqual(
      firstPlan.dependency_feasibility.descriptor_materialization
        .candidate_descriptor_refs[0].descriptor_source_fingerprint,
      secondPlan.dependency_feasibility.descriptor_materialization
        .candidate_descriptor_refs[0].descriptor_source_fingerprint,
    );
    assert.equal(
      secondPlan.dependency_feasibility.descriptor_materialization
        .candidate_inspect_actions[0].descriptor_source_fingerprint,
      fileFingerprint(descriptorPath),
    );
  });
});

test('profile capability plan resolves canonical ScholarSkills capability ids without treating shared module ids as aliases', () => {
  withTempDir((root) => {
    const catalogRepo = path.join(root, 'scholar-skills');
    const selectionFile = path.join(root, 'profile-selection.json');
    writeJson(path.join(catalogRepo, 'contracts', 'capability_map.json'), {
      surface_kind: 'oma_capability_pack_map',
      schema_version: 1,
      domain_id: 'mas-scholar-skills',
      authority_boundary: {
        outputs_are_refs_only_candidates: true,
        can_write_domain_truth: false,
        can_write_runtime_state: false,
        can_mutate_artifact_body: false,
        can_sign_owner_receipt: false,
        can_create_typed_blocker: false,
        can_claim_quality_verdict: false,
        can_claim_owner_closeout: false,
      },
      capabilities: [{
        capability_id: 'medical-figure-design',
        module_id: 'mas-scholar-skills.display',
        canonical_path: 'skills/medical-figure-design/SKILL.md',
        external_repo_ref: 'external_repo:mas-scholar-skills/skills/medical-figure-design/SKILL.md',
        legacy_module_ids: ['opl.scholarskills.display'],
        source_pack_ref: 'packs/medical-display-core/display_pack.toml',
        dependency_profile_refs: ['runtime_env_dependency_profile:scholarskills_display_v1'],
        authority_boundary: {
          outputs_are_refs_only_candidates: true,
          can_write_domain_truth: false,
          can_write_runtime_state: false,
          can_mutate_artifact_body: false,
          can_sign_owner_receipt: false,
          can_create_typed_blocker: false,
          can_claim_quality_verdict: false,
          can_claim_owner_closeout: false,
        },
      }],
    });
    writeSelection(selectionFile, [
      'medical-figure-design',
      'mas-scholar-skills.display',
      'opl.scholarskills.display',
    ]);

    const plan = buildProfileCapabilityPlan({
      selectionFile,
      catalogRepos: [catalogRepo],
    }).capability_plan;

    assert.deepEqual(plan.exact_capability_readout.capability_refs, ['medical-figure-design']);
    assert.equal(plan.exact_capability_readout.resolver_readout.resolutions
      .find((entry) => entry.capability_ref === 'mas-scholar-skills.display')?.resolution_status, 'fail_open');
    assert.equal(plan.exact_capability_readout.resolver_readout.resolutions
      .find((entry) => entry.capability_ref === 'opl.scholarskills.display')?.resolution_status, 'fail_open');
    assert.deepEqual(
      plan.dependency_feasibility.descriptor_materialization.candidate_descriptor_refs,
      [],
    );
    assert.deepEqual(plan.dependency_feasibility.candidate_dependency_refs, [
      'runtime_env_dependency_profile:scholarskills_display_v1',
    ]);
  });
});

test('profile capability plan rejects generic owner maps without an explicit refs-only authority envelope', () => {
  withTempDir((root) => {
    const catalogRepo = path.join(root, 'owner-pack');
    const selectionFile = path.join(root, 'profile-selection.json');
    writeJson(path.join(catalogRepo, 'contracts', 'capability_map.json'), {
      surface_kind: 'owner_capability_map',
      schema_version: 1,
      domain_id: 'owner-pack',
      authority_boundary: {},
      capabilities: [{
        capability_id: 'owner-pack.example',
        authority_boundary: {},
      }],
    });
    writeSelection(selectionFile, ['owner-pack.example']);

    assert.throws(() => buildProfileCapabilityPlan({
      selectionFile,
      catalogRepos: [catalogRepo],
    }), /refs-only no-authority envelope/);
  });
});

test('profile capability plan rejects Pack OS descriptor refs that escape the catalog root', () => {
  withTempDir((root) => {
    const catalogRepo = path.join(root, 'agent-repo');
    const selectionFile = path.join(root, 'profile-selection.json');
    const { mapPath, map } = writeStandardCatalog(catalogRepo);
    const capabilityRef = String(map.capabilities[0].capability_id);
    const outside = path.join(root, 'outside.json');
    const link = path.join(catalogRepo, 'packs', 'escape.json');
    writeJson(outside, { surface_kind: 'opl_generic_capability_pack_descriptor' });
    fs.mkdirSync(path.dirname(link), { recursive: true });
    fs.symlinkSync(outside, link);
    map.capabilities[0].pack_os_descriptor_refs = [{
      surface_kind: 'opl_pack_os_descriptor_ref',
      descriptor_ref: 'packs/escape.json',
    }];
    writeJson(mapPath, map);
    writeSelection(selectionFile, [capabilityRef]);

    assert.throws(() => buildProfileCapabilityPlan({
      selectionFile,
      catalogRepos: [catalogRepo],
    }), /escapes its catalog repo/);
  });
});

test('profile capability plan rejects a capability map symlink that escapes the catalog root', () => {
  withTempDir((root) => {
    const catalogRepo = path.join(root, 'agent-repo');
    const selectionFile = path.join(root, 'profile-selection.json');
    const { mapPath, map } = writeStandardCatalog(catalogRepo);
    const outsideMap = path.join(root, 'outside-capability-map.json');
    writeJson(outsideMap, map);
    fs.rmSync(mapPath);
    fs.symlinkSync(outsideMap, mapPath);
    writeSelection(selectionFile, [String(map.capabilities[0].capability_id)]);

    assert.throws(() => buildProfileCapabilityPlan({
      selectionFile,
      catalogRepos: [catalogRepo],
    }), /escapes its catalog repo/);
  });
});

test('profiles capability-plan accepts only the Framework-owned fixed projection', () => {
  withTempDir((root) => {
    const catalogRepo = path.join(root, 'agent-repo');
    const selectionFile = path.join(root, 'profile-selection.json');
    const { map } = writeStandardCatalog(catalogRepo);
    const capabilityRef = String(map.capabilities[0].capability_id);
    writeSelection(selectionFile, []);
    const spec = buildProfileCommandSpecs()['profiles capability-plan'];
    assert.equal(
      spec.examples.some((example) => example.includes('--capability-ref medical-figure-design')),
      true,
    );
    assert.equal(
      spec.examples.some((example) => example.includes('--capability-ref mas-scholar-skills.display')),
      false,
    );

    const readback = spec.handler([
      '--selection-file',
      selectionFile,
      '--catalog-repo',
      catalogRepo,
      '--capability-ref',
      capabilityRef,
    ]) as ReturnType<typeof buildProfileCapabilityPlan>;
    assert.deepEqual(
      readback.capability_plan.exact_capability_readout.requested_capability_refs,
      [capabilityRef],
    );

    const payload = readJson(selectionFile);
    delete payload.profile_capability_plan_input;
    writeJson(selectionFile, payload);
    assert.throws(() => spec.handler([
      '--selection-file',
      selectionFile,
      '--catalog-repo',
      catalogRepo,
    ]), /must contain profile_capability_plan_input/);
  });
});

test('profile capability plan normalizes shared capability policy profiles', () => {
  withTempDir((root) => {
    const catalogRepo = path.join(root, 'agent-repo');
    const selectionFile = path.join(root, 'profile-selection.json');
    const { mapPath, map } = writeStandardCatalog(catalogRepo);
    const first = map.capabilities[0];
    map.capability_policy_profiles = {
      standard: {
        authority_boundary: first.authority_boundary,
        forbidden_surfaces: first.forbidden_surfaces,
        verification_refs: first.verification_refs,
        owner_closeout_boundary: first.owner_closeout_boundary,
      },
    };
    map.capabilities.forEach((capability) => {
      capability.capability_policy_profile_ref = '#/capability_policy_profiles/standard';
      delete capability.authority_boundary;
      delete capability.forbidden_surfaces;
      delete capability.verification_refs;
      delete capability.owner_closeout_boundary;
    });
    writeJson(mapPath, map);
    const capabilityRef = String(first.capability_id);
    writeSelection(selectionFile, [capabilityRef]);

    const readback = buildProfileCapabilityPlan({
      selectionFile,
      catalogRepos: [catalogRepo],
    }).capability_plan;

    assert.deepEqual(readback.exact_capability_readout.capability_refs, [capabilityRef]);
  });
});

test('profiles select real CLI accepts documented source and pattern aliases and emits canonical plan input', () => {
  const result = spawnSync('./bin/opl', [
    'profiles',
    'select',
    '--intent',
    'colorectal surgery risk decision support',
    '--paper-ref',
    'paper-ref:zoller-2026',
    '--pattern-packet-ref',
    'pattern-packet-ref:zoller-2026',
    '--json',
  ], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: {
      ...process.env,
      OPL_SKIP_SKILL_SYNC: '1',
    },
  });

  assert.equal(result.status, 0, result.stderr);
  const payload = parseJsonText(result.stdout) as JsonRecord;
  const receipt = payload.profile_selection_receipt as JsonRecord;
  const sourceReceipt = receipt.source_derived_design_receipt as JsonRecord;
  assert.deepEqual(sourceReceipt.reference_design_source_refs, ['paper-ref:zoller-2026']);
  assert.deepEqual(sourceReceipt.reference_design_pattern_packet_refs, [
    'pattern-packet-ref:zoller-2026',
  ]);
  assert.equal(
    (payload.profile_capability_plan_input as JsonRecord).surface_kind,
    'opl_profile_capability_plan_input',
  );
});

test('profiles select real CLI accepts every source and pattern alias in --flag=value form', () => {
  const cases = [
    ...[
      '--reference-source',
      '--reference-source-ref',
      '--reference-design-source',
      '--source-ref',
      '--paper',
      '--paper-ref',
    ].map((option) => ({
      option,
      receiptField: 'reference_design_source_refs',
      value: `paper-ref:${option.slice(2)}`,
    })),
    ...[
      '--reference-design-pattern-packet',
      '--reference-design-pattern-packet-ref',
      '--pattern-packet',
      '--pattern-packet-ref',
    ].map((option) => ({
      option,
      receiptField: 'reference_design_pattern_packet_refs',
      value: `pattern-packet-ref:${option.slice(2)}`,
    })),
  ];

  for (const fixture of cases) {
    const result = spawnSync('./bin/opl', [
      'profiles',
      'select',
      '--intent=colorectal surgery risk decision support',
      `${fixture.option}=${fixture.value}`,
      '--json',
    ], {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: {
        ...process.env,
        OPL_SKIP_SKILL_SYNC: '1',
      },
    });

    assert.equal(result.status, 0, `${fixture.option}: ${result.stderr}`);
    const payload = parseJsonText(result.stdout) as JsonRecord;
    const receipt = payload.profile_selection_receipt as JsonRecord;
    const sourceReceipt = receipt.source_derived_design_receipt as JsonRecord;
    assert.deepEqual(sourceReceipt[fixture.receiptField], [fixture.value], fixture.option);
  }
});
