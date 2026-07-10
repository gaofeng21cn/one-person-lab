import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  buildDomainPackCompilerList,
  buildRepoGeneratedInterfaceBundle,
  buildStandardAgentRepoContractReadout,
  compileStandardAgentStageManifest,
} from '../../src/modules/pack/index.ts';
import { FrameworkContractError } from '../../src/kernel/contract-validation.ts';
import { buildStandardDomainAgentConformanceReport } from '../../src/modules/foundry-lab/standard-domain-agent-conformance.ts';
import { withOplMetaAgentDescriptorEntry } from '../../src/modules/atlas/index.ts';
import { buildFamilyStageAdmissionReview } from '../../src/modules/stagecraft/index.ts';

type JsonRecord = Record<string, any>;

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function writeJson(root: string, ref: string, value: unknown) {
  const file = path.join(root, ref);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function writeText(root: string, ref: string) {
  const file = path.join(root, ref);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `# ${ref}\n`);
}

function fixture(domainId: string, canonicalAgentId = domainId) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-stage-manifest-'));
  const packRefs = [
    'agent/stages/manifest.json',
    'agent/stages/intake.md',
    'agent/stages/deliver.md',
    'agent/prompts/intake.md',
    'agent/prompts/deliver.md',
    'agent/knowledge/domain.md',
    'agent/quality_gates/quality.md',
    'agent/skills/domain.md',
    'agent/tools/domain.md',
  ];
  for (const ref of packRefs.filter((entry) => !entry.endsWith('manifest.json'))) {
    writeText(root, ref);
  }
  writeText(root, 'runtime/authority_functions/README.md');
  writeJson(root, 'contracts/owner_receipt_contract.json', {
    surface_kind: 'domain_owner_receipt_contract',
  });
  writeJson(root, 'contracts/domain_descriptor.json', {
    surface_kind: 'domain_agent_descriptor',
    schema_version: 1,
    domain_id: domainId,
    domain_label: domainId,
    authority_boundary: {
      opl_can_write_domain_truth: false,
      opl_can_write_memory_body: false,
      opl_can_authorize_quality_or_export: false,
    },
  });
  writeJson(root, 'contracts/action_catalog.json', {
    surface_kind: 'family_action_catalog',
    version: 'family-action-catalog.v1',
    catalog_id: `${domainId}.actions`,
    target_domain_id: domainId,
    owner: domainId,
    authority_boundary: { opl_role: 'projection_consumer_only' },
    actions: ['inspect', 'deliver'].map((actionId) => ({
        action_id: actionId,
        title: actionId,
        summary: `Run ${actionId}.`,
        owner: domainId,
        effect: 'mutating',
        source_command: { command: `${domainId} ${actionId}`, surface_kind: 'domain_cli' },
        input_schema_ref: 'contracts/input.schema.json',
        output_schema_ref: 'contracts/output.schema.json',
        workspace_locator_fields: ['workspace_root'],
        human_gate_ids: [],
        supported_surfaces: {
          cli: { command: `${domainId} ${actionId}`, surface_kind: 'domain_cli' },
          mcp: { tool_name: actionId, surface_kind: 'domain_mcp' },
          skill: { command_contract_id: actionId, surface_kind: 'domain_skill' },
          product_entry: {
            action_key: actionId,
            command: `${domainId} product ${actionId}`,
            surface_kind: 'domain_product_entry',
          },
          openai: { tool_name: actionId },
          ai_sdk: { tool_name: actionId },
        },
      })),
    notes: [],
  });
  writeJson(root, 'contracts/pack_compiler_input.json', {
    surface_kind: 'opl_domain_pack_compiler_input',
    domain_id: domainId,
    canonical_agent_id: canonicalAgentId,
    generated_surface_owner: 'one-person-lab',
    domain_repo_can_own_generated_surface: false,
    authority_boundary: {
      opl_can_write_domain_truth: false,
      opl_can_write_memory_body: false,
      opl_can_authorize_quality_or_export: false,
      domain_can_claim_generated_surface_owner: false,
    },
    required_domain_pack_paths: packRefs,
  });
  writeJson(root, 'agent/stages/manifest.json', {
    surface_kind: 'opl_standard_agent_declarative_stage_manifest',
    version: 'opl-standard-agent-declarative-stage-manifest.v1',
    target_domain_id: domainId,
    owner: domainId,
    authority_boundary: {
      domain_truth_owner: domainId,
      opl_can_write_domain_truth: false,
      opl_can_authorize_quality_or_export: false,
    },
    stages: [
      {
        stage_id: 'intake',
        stage_kind: 'intake',
        title: 'Intake',
        summary: 'Intake.',
        goal: 'Inspect the request.',
        policy_ref: 'agent/stages/intake.md',
        prompt_ref: 'agent/prompts/intake.md',
        knowledge_refs: ['agent/knowledge/domain.md'],
        quality_gate_refs: ['agent/quality_gates/quality.md'],
        allowed_action_refs: ['inspect'],
        requires: ['request'],
        ensures: ['intake_ready'],
        next_stage_refs: ['deliver'],
        trust_lane: 'domain_agent',
      },
      {
        stage_id: 'deliver',
        stage_kind: 'packaging',
        title: 'Deliver',
        summary: 'Deliver.',
        goal: 'Route the accepted delivery.',
        policy_ref: 'agent/stages/deliver.md',
        prompt_ref: 'agent/prompts/deliver.md',
        knowledge_refs: ['agent/knowledge/domain.md'],
        quality_gate_refs: ['agent/quality_gates/quality.md'],
        allowed_action_refs: ['deliver'],
        requires: ['intake_ready'],
        ensures: ['delivery_routed'],
        next_stage_refs: [],
        trust_lane: 'human_gate',
      },
    ],
  });
  return root;
}

function readManifest(root: string) {
  return JSON.parse(fs.readFileSync(path.join(root, 'agent/stages/manifest.json'), 'utf8')) as JsonRecord;
}

function writeManifest(root: string, manifest: unknown) {
  writeJson(root, 'agent/stages/manifest.json', manifest);
}

function collectNestedBlockers(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap(collectNestedBlockers);
  }
  if (!value || typeof value !== 'object') {
    return [];
  }
  return Object.entries(value).flatMap(([key, entry]) => [
    ...(key === 'blockers' && Array.isArray(entry)
      ? entry.filter((blocker): blocker is string => typeof blocker === 'string')
      : []),
    ...collectNestedBlockers(entry),
  ]);
}

test('standard Agent stage manifest compiler keeps stable domain identity and target separation', () => {
  const alphaRoot = fixture('target-alpha', 'agent-alpha');
  const betaRoot = fixture('target-beta', 'agent-beta');
  const alpha = compileStandardAgentStageManifest(alphaRoot);
  const alphaAgain = compileStandardAgentStageManifest(alphaRoot);
  const beta = compileStandardAgentStageManifest(betaRoot);

  assert.equal(alpha.stage_control_plane.plane_id, 'target_alpha_stage_control_plane');
  assert.equal(alpha.source_binding.canonical_agent_id, 'agent-alpha');
  assert.equal(alpha.source_binding.domain_id, 'target-alpha');
  assert.equal(alphaAgain.stage_control_plane.plane_id, alpha.stage_control_plane.plane_id);
  assert.equal(alphaAgain.source_binding.stage_manifest_sha256, alpha.source_binding.stage_manifest_sha256);
  assert.notEqual(beta.stage_control_plane.plane_id, alpha.stage_control_plane.plane_id);
  assert.deepEqual(alpha.stage_control_plane.stages[0]?.skills.map((entry) => entry.ref), ['agent/skills/domain.md']);
  assert.deepEqual(alpha.stage_control_plane.stages[0]?.tool_refs?.map((entry) => entry.ref), ['agent/tools/domain.md']);
  assert.deepEqual(alpha.stage_control_plane.stages[0]?.allowed_action_refs, ['inspect']);
  assert.deepEqual((alpha.stage_control_plane.stages[0]?.handoff as JsonRecord).next_stage_refs, ['deliver']);
  assert.equal(alpha.stage_control_plane.authority_boundary.opl_can_sign_owner_receipt, false);
  assert.equal('target_agent_ref' in alpha.stage_control_plane, false);

  const readout = buildStandardAgentRepoContractReadout(alphaRoot);
  assert.equal(readout.canonical_agent_id, 'agent-alpha');
  assert.equal(readout.target_domain_id, 'target-alpha');
  assert.equal(readout.source_binding?.canonical_agent_id, 'agent-alpha');
  const generated = buildRepoGeneratedInterfaceBundle(alphaRoot, 'product-entry').bundle as JsonRecord;
  assert.equal(generated.agent_id, 'agent-alpha');
  assert.equal(generated.target_domain_id, 'target-alpha');
});

test('standard Agent stage manifest compiler preserves exclusive source-derived provenance', () => {
  const root = fixture('target-provenance');
  const manifest = readManifest(root);
  manifest.stages[0] = {
    ...manifest.stages[0],
    stage_origin: 'source_pattern_ref',
    pattern_id: 'source-pattern',
    step_id: 'intake-step',
    provenance_kind: 'source_derived',
    source_pattern_ref: 'pattern-ref:source/intake',
    source_anchor_refs: ['source-ref:paper#intake'],
  };
  manifest.stages[1] = {
    ...manifest.stages[1],
    stage_origin: 'target_only_requirement',
    target_only_requirement_ref: 'target-only-requirement:target-provenance/deliver',
  };
  writeManifest(root, manifest);

  const compilation = compileStandardAgentStageManifest(root);
  assert.equal(compilation.stage_control_plane.stages[0]?.stage_origin, 'source_pattern_ref');
  assert.equal(compilation.stage_control_plane.stages[0]?.pattern_id, 'source-pattern');
  assert.equal(compilation.stage_control_plane.stages[0]?.step_id, 'intake-step');
  assert.equal(compilation.stage_control_plane.stages[0]?.source_pattern_ref, 'pattern-ref:source/intake');
  assert.deepEqual(
    compilation.stage_control_plane.stages[0]?.stage_pattern_source_refs,
    ['pattern-ref:source/intake'],
  );
  assert.equal(compilation.stage_control_plane.stages[1]?.stage_origin, 'target_only_requirement');
  assert.equal(
    compilation.stage_control_plane.stages[1]?.target_only_requirement_ref,
    'target-only-requirement:target-provenance/deliver',
  );
});

test('standard Agent stage manifest compiler rejects an alias as the primary source pattern ref', () => {
  const root = fixture('target-provenance-primary-mismatch');
  const manifest = readManifest(root);
  manifest.stages[0] = {
    ...manifest.stages[0],
    stage_origin: 'source_pattern_ref',
    pattern_id: 'source-pattern',
    step_id: 'intake-step',
    provenance_kind: 'source_derived',
    source_pattern_ref: 'pattern-ref:source/alias',
    source_anchor_refs: ['source-ref:paper#intake'],
    stage_pattern_source_refs: [
      'pattern-ref:source/intake',
      'pattern-ref:source/alias',
    ],
  };
  writeManifest(root, manifest);

  assert.throws(
    () => compileStandardAgentStageManifest(root),
    /primary source_pattern_ref must match stage_pattern_source_refs\[0\]/,
  );
});

test('standard Agent stage manifest compiler requires an explicit canonical agent id', async (t) => {
  for (const canonicalAgentId of [undefined, '', '   ']) {
    await t.test(JSON.stringify(canonicalAgentId), () => {
      const root = fixture('target-missing-agent-id');
      const ref = path.join(root, 'contracts/pack_compiler_input.json');
      const input = JSON.parse(fs.readFileSync(ref, 'utf8')) as JsonRecord;
      if (canonicalAgentId === undefined) {
        delete input.canonical_agent_id;
      } else {
        input.canonical_agent_id = canonicalAgentId;
      }
      writeJson(root, 'contracts/pack_compiler_input.json', input);
      assert.throws(() => compileStandardAgentStageManifest(root));
      const readout = buildStandardAgentRepoContractReadout(root);
      assert.equal(readout.status, 'blocked');
      assert.deepEqual(readout.blockers, ['invalid_contract:contracts/pack_compiler_input.json']);
    });
  }
});

test('standard Agent stage manifest compiler binds pack identity to the descriptor domain', () => {
  const root = fixture('target-pack-domain-mismatch');
  const ref = path.join(root, 'contracts/pack_compiler_input.json');
  const input = JSON.parse(fs.readFileSync(ref, 'utf8')) as JsonRecord;
  input.domain_id = 'other-domain';
  writeJson(root, 'contracts/pack_compiler_input.json', input);
  assert.throws(() => compileStandardAgentStageManifest(root));
});

test('pack compiler rejects requested Agent identity that differs from the repo canonical id', () => {
  const root = fixture('med-autoscience', 'mas');

  const report = buildDomainPackCompilerList({} as any, {
    familyDefaults: true,
    familyRepoInputs: [{ requested_agent_id: 'mag', repo_dir: root }],
  });
  const projection = report.domain_pack_compiler.domains[0];

  assert.equal(report.domain_pack_compiler.summary.blocked_domain_count, 1);
  assert.equal(projection?.compiler_status, 'blocked');
  assert.equal(projection?.blocker_reasons.includes('identity_mismatch'), true);
  assert.equal(projection?.repo_contract_error?.code, 'contract_shape_invalid');
  assert.equal(projection?.repo_contract_error?.details.requested_agent_id, 'mag');
  assert.equal(projection?.repo_contract_error?.details.canonical_agent_id, 'mas');
});

test('OMA hosted descriptor consumes the generated stage plane without a legacy fallback', () => {
  const root = fixture('opl-meta-agent', 'oma');
  writeJson(root, 'contracts/generated_surface_handoff.json', {
    generated_surface_owner: 'one-person-lab',
    domain_repo_can_own_generated_surface: false,
  });
  writeJson(root, 'contracts/functional_privatization_audit.json', {
    surface_kind: 'functional_privatization_audit',
    modules: [],
  });

  const catalog = withOplMetaAgentDescriptorEntry({
    summary: {
      total_projects_count: 0,
      resolved_count: 0,
      failed_count: 0,
    },
    projects: [],
    notes: [],
    opl_meta_agent_registry: {
      repo_dir: root,
      summary: {},
    },
  } as any);
  const entry = catalog.projects.find((candidate: JsonRecord) => candidate.project_id === 'opl-meta-agent');
  assert.equal(entry?.status, 'resolved');
  assert.equal(entry?.manifest?.domain_entry_contract?.domain_agent_entry_spec?.agent_id, 'oma');
  assert.equal(entry?.manifest?.standard_domain_agent_skeleton?.agent_id, 'oma');
  assert.equal(entry?.manifest?.family_stage_control_plane?.plane_id, 'opl_meta_agent_stage_control_plane');
  assert.equal(
    entry?.manifest?.standard_domain_agent_skeleton?.contracts?.descriptor_refs?.includes(
      'agent/stages/manifest.json',
    ),
    true,
  );
  assert.equal(
    entry?.manifest?.standard_domain_agent_skeleton?.contracts?.descriptor_refs?.includes(
      'contracts/stage_control_plane.json',
    ),
    false,
  );
  assert.equal(
    entry?.manifest?.family_transition_spec_descriptor?.spec_ref,
    'agent/stages/manifest.json#stages',
  );
});

test('standard Agent repo contract readout blocks active private generic residue', () => {
  const root = fixture('target-private-residue');
  writeJson(root, 'contracts/functional_privatization_audit.json', {
    surface_kind: 'functional_privatization_audit',
    target_domain_id: 'target-private-residue',
    modules: [
      {
        module_id: 'repo_owned_generic_scheduler',
        classification: 'generic_scheduler_or_daemon',
        owner: 'target-private-residue',
        code_paths: ['runtime/legacy-scheduler.ts'],
        active_callers: ['legacy local cadence'],
        active_caller_status: 'active_private_scheduler_still_called',
        migration_action: 'move_to_opl_provider_scheduler_then_tombstone',
      },
    ],
  });

  const readout = buildStandardAgentRepoContractReadout(root);
  assert.equal(readout.status, 'blocked');
  assert.deepEqual(readout.blockers, [
    'functional_privatization_audit_has_generic_residue_or_blocker',
  ]);
});

test('OMA hosted descriptor rejects a repo with non-OMA canonical identity', () => {
  const root = fixture('med-autogrant', 'mag');
  writeJson(root, 'contracts/generated_surface_handoff.json', {
    generated_surface_owner: 'one-person-lab',
    domain_repo_can_own_generated_surface: false,
  });
  writeJson(root, 'contracts/functional_privatization_audit.json', {
    surface_kind: 'functional_privatization_audit',
    modules: [],
  });

  const catalog = withOplMetaAgentDescriptorEntry({
    summary: {
      total_projects_count: 0,
      resolved_count: 0,
      failed_count: 0,
    },
    projects: [],
    notes: [],
  } as any, [{ requested_agent_id: 'oma', repo_dir: root }]);
  const entry = catalog.projects.find((candidate: JsonRecord) => candidate.project_id === 'opl-meta-agent');

  assert.equal(entry?.status, 'invalid_manifest');
  assert.equal(entry?.manifest, null);
});

test('standard Agent repo contracts reject generated-surface authority escalation', async (t) => {
  const cases: Array<[string, (root: string) => void]> = [
    ['pack compiler input', (root) => {
      const ref = path.join(root, 'contracts/pack_compiler_input.json');
      const input = JSON.parse(fs.readFileSync(ref, 'utf8')) as JsonRecord;
      input.generated_surface_owner = 'target-authority';
      input.domain_repo_can_own_generated_surface = true;
      input.authority_boundary.opl_can_write_domain_truth = true;
      writeJson(root, 'contracts/pack_compiler_input.json', input);
    }],
    ['action catalog', (root) => {
      const ref = path.join(root, 'contracts/action_catalog.json');
      const catalog = JSON.parse(fs.readFileSync(ref, 'utf8')) as JsonRecord;
      catalog.authority_boundary.opl_can_authorize_quality_or_export = true;
      writeJson(root, 'contracts/action_catalog.json', catalog);
    }],
    ['generated surface handoff', (root) => {
      writeJson(root, 'contracts/generated_surface_handoff.json', {
        generated_surface_owner: 'target-authority',
        domain_repo_can_own_generated_surface: true,
        authority_boundary: {
          opl_can_write_domain_truth: true,
        },
      });
    }],
  ];

  for (const [name, mutate] of cases) {
    await t.test(name, () => {
      const root = fixture('target-authority');
      mutate(root);
      const readout = buildStandardAgentRepoContractReadout(root);
      assert.equal(readout.status, 'blocked');
    });
  }
});

test('standard Agent stage manifest compiler requires every declared pack source', () => {
  const root = fixture('target-missing-required-source');
  const ref = path.join(root, 'contracts/pack_compiler_input.json');
  const input = JSON.parse(fs.readFileSync(ref, 'utf8')) as JsonRecord;
  input.required_domain_pack_paths = [
    ...(input.required_domain_pack_paths as string[]),
    'agent/prompts/definitely-missing.md',
  ];
  writeJson(root, 'contracts/pack_compiler_input.json', input);
  assert.throws(() => compileStandardAgentStageManifest(root));
});

test('standard Agent stage manifest compiler fails closed for malformed identity, refs, actions, and transitions', async (t) => {
  const cases: Array<[string, (root: string, manifest: JsonRecord) => unknown]> = [
    ['nonobject', (_root) => []],
    ['wrong domain', (_root, manifest) => ({ ...manifest, target_domain_id: 'other' })],
    ['empty stages', (_root, manifest) => ({ ...manifest, stages: [] })],
    ['duplicate stage', (_root, manifest) => ({ ...manifest, stages: [manifest.stages[0], manifest.stages[0]] })],
    ['path traversal', (_root, manifest) => ({
      ...manifest,
      stages: [{ ...manifest.stages[0], policy_ref: '../outside.md' }, manifest.stages[1]],
    })],
    ['missing ref', (_root, manifest) => ({
      ...manifest,
      stages: [{ ...manifest.stages[0], prompt_ref: 'agent/prompts/missing.md' }, manifest.stages[1]],
    })],
    ['missing action', (_root, manifest) => ({
      ...manifest,
      stages: [{ ...manifest.stages[0], allowed_action_refs: ['unknown'] }, manifest.stages[1]],
    })],
    ['empty action refs', (_root, manifest) => ({
      ...manifest,
      stages: [{ ...manifest.stages[0], allowed_action_refs: [] }, manifest.stages[1]],
    })],
    ['empty quality gate refs', (_root, manifest) => ({
      ...manifest,
      stages: [{ ...manifest.stages[0], quality_gate_refs: [] }, manifest.stages[1]],
    })],
    ['unresolved transition', (_root, manifest) => ({
      ...manifest,
      stages: [{ ...manifest.stages[0], next_stage_refs: ['missing'] }, manifest.stages[1]],
    })],
    ['mixed source and target-only provenance', (_root, manifest) => ({
      ...manifest,
      stages: [{
        ...manifest.stages[0],
        stage_origin: 'source_pattern_ref',
        pattern_id: 'source-pattern',
        step_id: 'intake-step',
        provenance_kind: 'source_derived',
        source_pattern_ref: 'pattern-ref:source/intake',
        source_anchor_refs: ['source-ref:paper#intake'],
        target_only_requirement_ref: 'target-only-requirement:target-negative/intake',
      }, manifest.stages[1]],
    })],
    ['mixed target-only and source provenance', (_root, manifest) => ({
      ...manifest,
      stages: [{
        ...manifest.stages[0],
        stage_origin: 'target_only_requirement',
        target_only_requirement_ref: 'target-only-requirement:target-negative/intake',
        pattern_id: 'source-pattern',
        step_id: 'intake-step',
        provenance_kind: 'source_derived',
        source_pattern_ref: 'pattern-ref:source/intake',
        source_anchor_refs: ['source-ref:paper#intake'],
      }, manifest.stages[1]],
    })],
  ];
  for (const [name, mutate] of cases) {
    await t.test(name, () => {
      const root = fixture('target-negative');
      writeManifest(root, mutate(root, readManifest(root)));
      assert.throws(() => compileStandardAgentStageManifest(root));
    });
  }
});

test('repo descriptor never falls back to the legacy tracked stage control plane', () => {
  const root = fixture('target-no-fallback');
  fs.rmSync(path.join(root, 'agent/stages/manifest.json'));
  writeJson(root, 'contracts/stage_control_plane.json', {
    surface_kind: 'family_stage_control_plane',
    version: 'family-stage-control-plane.v1',
    plane_id: 'legacy',
    target_domain_id: 'target-no-fallback',
    owner: 'target-no-fallback',
    authority_boundary: {},
    stages: [{
      stage_id: 'legacy',
      stage_kind: 'intake',
      title: 'Legacy',
      goal: 'Legacy.',
      owner: 'target-no-fallback',
      authority_boundary: {},
    }],
  });
  assert.throws(() => buildRepoGeneratedInterfaceBundle(root, 'product-entry'));
});

test('stage manifest compiler rejects missing default receipt and authority-function refs', async (t) => {
  for (const ref of [
    'contracts/owner_receipt_contract.json',
    'runtime/authority_functions/README.md',
  ]) {
    await t.test(ref, () => {
      const root = fixture('target-missing-default-ref');
      fs.rmSync(path.join(root, ref));
      assert.throws(() => compileStandardAgentStageManifest(root));
    });
  }
});

test('stage manifest compiler fails closed for an invalid required v2 declaration', () => {
  const root = fixture('target-invalid-stage-pack');
  const inputRef = path.join(root, 'contracts/pack_compiler_input.json');
  const input = JSON.parse(fs.readFileSync(inputRef, 'utf8')) as JsonRecord;
  input.standard_stage_pack_conformance = {
    required: true,
    version: 'standard-stage-pack.v1',
  };
  writeJson(root, 'contracts/pack_compiler_input.json', input);
  assert.throws(() => compileStandardAgentStageManifest(root));
});

test('stage manifest compiler honors an explicit v2 version with canonical Framework floors', () => {
  const root = fixture('target-stage-policy');
  const inputRef = path.join(root, 'contracts/pack_compiler_input.json');
  const input = JSON.parse(fs.readFileSync(inputRef, 'utf8')) as JsonRecord;
  input.standard_stage_pack_conformance = {
    required: false,
    version: 'standard-stage-pack.v2',
  };
  writeJson(root, 'contracts/pack_compiler_input.json', input);
  const compilation = compileStandardAgentStageManifest(root);
  const stage = compilation.stage_control_plane.stages[0]!;
  const stageContract = stage.stage_contract as JsonRecord;
  const completionPolicy = stageContract.stage_completion_policy as JsonRecord;
  const userStageLogContract = stageContract.user_stage_log_contract as JsonRecord;
  const l4EntryGate = stageContract.l4_entry_gate as JsonRecord;
  const l5EntryGate = stageContract.l5_entry_gate as JsonRecord;
  assert.equal(compilation.stage_control_plane.stage_pack_conformance_version, 'standard-stage-pack.v2');
  assert.equal(stage.stage_pack_conformance_version, 'standard-stage-pack.v2');
  assert.equal(completionPolicy.surface_kind, 'domain_stage_completion_policy');
  assert.equal(completionPolicy.owner, 'one-person-lab');
  assert.equal(completionPolicy.closeout_packet_required, true);
  assert.equal(userStageLogContract.surface_kind, 'opl_standard_agent_user_stage_log_contract');
  assert.equal(userStageLogContract.owner, 'one-person-lab');
  assert.deepEqual(stage.stage_contract?.receipt_schema_refs, [{
    ref_kind: 'repo_path',
    ref: 'contracts/owner_receipt_contract.json',
    role: 'owner_receipt_schema',
  }]);
  assert.deepEqual(stage.stage_contract?.authority_function_refs, [{
    ref_kind: 'repo_path',
    ref: 'runtime/authority_functions/README.md',
    role: 'minimal_authority_function_inventory',
  }]);
  assert.equal(l4EntryGate.entry_level, 'L4_structural_baseline');
  assert.equal(l4EntryGate.can_claim_domain_ready, false);
  assert.equal(l5EntryGate.entry_level, 'L5_production_operating_maturity');
  assert.equal(l5EntryGate.conformance_pass_counts_as_l5, false);
});

test('stage manifest compiler fails closed on every Framework stage-contract floor mismatch', async (t) => {
  const cases: Array<[string, unknown]> = [
    ['expected_receipt_refs', []],
    ['receipt_schema_refs', [{ ref_kind: 'url', ref: 'https://attacker.invalid/receipt' }]],
    ['authority_function_refs', [{ ref_kind: 'url', ref: 'https://attacker.invalid/sign' }]],
    ['l4_entry_gate', { entry_level: 'L4_fake', can_claim_domain_ready: true }],
    ['l5_entry_gate', { entry_level: 'L5_fake', conformance_pass_counts_as_l5: true }],
    ['stage_completion_policy', {
      surface_kind: 'domain_override',
      owner: 'target-stage-policy',
      closeout_packet_required: false,
    }],
    ['user_stage_log_contract', {
      surface_kind: 'domain_override',
      owner: 'target-stage-policy',
      required: false,
    }],
  ];

  for (const [field, value] of cases) {
    await t.test(field, () => {
      const root = fixture(`target-stage-policy-${field.replaceAll('_', '-')}`);
      const manifest = readManifest(root);
      manifest.stages[0].stage_contract = { [field]: value };
      writeManifest(root, manifest);

      assert.throws(() => compileStandardAgentStageManifest(root), (error: unknown) => {
        assert.ok(error instanceof FrameworkContractError);
        assert.equal(error.details?.blocker, 'standard_agent_stage_contract_framework_floor_mismatch');
        assert.equal(error.details?.field, field);
        return true;
      });
    });
  }
});

test('real MAG manifest compiles into generated product-entry without the legacy contract', (t) => {
  const explicitMagRepo = process.env.MAG_REPO_DIR
    ? path.resolve(process.env.MAG_REPO_DIR)
    : null;
  const candidates = [
    path.resolve(REPO_ROOT, '../med-autogrant'),
    path.resolve(REPO_ROOT, '../../med-autogrant'),
  ];
  const magRepo = explicitMagRepo
    ?? candidates.find((entry) =>
      fs.existsSync(path.join(entry, 'agent/stages/manifest.json'))
      && !fs.existsSync(path.join(entry, 'contracts/stage_control_plane.json'))
    );
  if (!magRepo) {
    t.skip('real MAG checkout not available');
    return;
  }
  assert.equal(fs.existsSync(path.join(magRepo, 'contracts/stage_control_plane.json')), false);
  assert.equal(fs.existsSync(path.join(magRepo, 'src/med_autogrant/stage_control_plane.py')), false);

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-real-mag-stage-manifest-'));
  fs.cpSync(path.join(magRepo, 'agent'), path.join(root, 'agent'), { recursive: true });
  for (const ref of [
    'contracts/domain_descriptor.json',
    'contracts/action_catalog.json',
    'contracts/pack_compiler_input.json',
    'contracts/functional_privatization_audit.json',
    'contracts/generated_surface_handoff.json',
    'contracts/memory_descriptor.json',
    'contracts/owner_receipt_contract.json',
  ]) {
    const source = path.join(magRepo, ref);
    if (fs.existsSync(source)) {
      fs.mkdirSync(path.dirname(path.join(root, ref)), { recursive: true });
      fs.copyFileSync(source, path.join(root, ref));
    }
  }
  fs.mkdirSync(path.join(root, 'runtime', 'authority_functions'), { recursive: true });
  fs.copyFileSync(
    path.join(magRepo, 'runtime', 'authority_functions', 'README.md'),
    path.join(root, 'runtime', 'authority_functions', 'README.md'),
  );
  assert.equal(fs.existsSync(path.join(root, 'contracts/stage_control_plane.json')), false);

  const compilation = compileStandardAgentStageManifest(root);
  assert.equal(compilation.stage_control_plane.plane_id, 'med_autogrant_stage_control_plane');
  assert.equal(compilation.source_binding.canonical_agent_id, 'mag');
  assert.equal(compilation.source_binding.domain_id, 'med-autogrant');
  assert.equal(compilation.stage_control_plane.stages.length, 6);
  assert.ok(compilation.stage_control_plane.stages.every((stage) =>
    stage.skills.some((entry) => entry.ref === 'agent/skills/grant_authoring.md')
  ));
  assert.ok(compilation.stage_control_plane.stages.every((stage) =>
    stage.tool_refs?.some((entry) => entry.ref === 'agent/tools/domain_affordances.md')
  ));
  assert.ok(compilation.stage_control_plane.stages.every((stage) =>
    (stage.stage_contract?.stage_completion_policy as JsonRecord)?.surface_kind
      === 'domain_stage_completion_policy'
  ));
  assert.ok(compilation.stage_control_plane.stages.every((stage) =>
    stage.stage_contract?.user_stage_log_contract?.surface_kind
      === 'opl_standard_agent_user_stage_log_contract'
  ));
  type AdmissionManifest = NonNullable<Parameters<typeof buildFamilyStageAdmissionReview>[1]>;
  const actionCatalog = JSON.parse(
    fs.readFileSync(path.join(root, 'contracts/action_catalog.json'), 'utf8'),
  ) as NonNullable<AdmissionManifest['family_action_catalog']>;
  const admission = buildFamilyStageAdmissionReview(compilation.stage_control_plane, {
    family_action_catalog: actionCatalog,
  });
  assert.equal(admission.status, 'admitted');
  assert.deepEqual(admission.findings.filter((finding) => finding.severity === 'blocker'), []);

  const generated = buildRepoGeneratedInterfaceBundle(root, 'product-entry').bundle as JsonRecord;
  assert.equal(generated.agent_id, 'mag');
  assert.equal(generated.target_domain_id, 'med-autogrant');
  assert.equal(generated.product_entry.family_stage_control_plane.plane_id, 'med_autogrant_stage_control_plane');
  const consumed = generated.source_contract_consumption.consumed_contracts as JsonRecord[];
  assert.equal(consumed.some((entry) => entry.path === 'contracts/stage_control_plane.json'), false);
  assert.equal(consumed.some((entry) => entry.path === 'agent/stages/manifest.json'), true);

  const conformance = buildStandardDomainAgentConformanceReport([
    '--agent',
    `mag=${magRepo}`,
  ]).standard_domain_agent_conformance;
  assert.equal(conformance.status, 'passed');
  assert.equal(conformance.reports[0]?.status, 'passed');
  assert.deepEqual(collectNestedBlockers(conformance.reports[0]), []);
});
