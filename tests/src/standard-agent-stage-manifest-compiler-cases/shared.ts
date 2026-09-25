import { after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  buildDomainPackCompilerList,
  buildGeneratedAgentInterfaces,
  buildRepoGeneratedInterfaceBundle,
  buildStandardAgentRepoContractReadout,
  compileStandardAgentStageManifest,
  resolveStandardAgentStageQualityRuntimeBinding,
} from '../../../src/authority/packages/index.ts';
import { FrameworkContractError } from '../../../src/kernel/contract-validation.ts';
import { normalizeFamilyStageControlPlane } from '../../../src/authority/stages/family-stage-control-plane-contract.ts';
import { buildReadyAgentRepo, retargetReadyRepo } from '../cli/cases/agents-conformance-fixtures.ts';
import {
  HOSTED_FOUNDRY_GENERATED_SURFACE_HANDOFF_DEFAULTS_PROFILE,
  resolveGeneratedSurfaceHandoffContract,
  STANDARD_GENERATED_SURFACE_HANDOFF_DEFAULTS_PROFILE,
} from '../../../src/authority/packages/standard-agent-proof-contract-defaults.ts';

const ownedFixtureRoots = new Set<string>();
after(() => {
  for (const root of ownedFixtureRoots) fs.rmSync(root, { recursive: true, force: true });
  ownedFixtureRoots.clear();
});

type JsonRecord = Record<string, any>;

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

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

function resolvePython3Executable() {
  for (const executable of [process.env.PYTHON, 'python3', 'python']) {
    if (!executable) continue;
    const result = spawnSync(executable, ['--version'], { encoding: 'utf8' });
    if (result.status === 0) return executable;
  }
  throw new Error('Python 3 is required for the stage-manifest callable probe test.');
}

function writePrimaryOnlyDeliverPolicy(root: string) {
  fs.writeFileSync(path.join(root, 'agent/prompts/deliver.md'), `# Deliver

## Producer
Produce.

## Reviewer
Review.

## Repairer
Repair.

## Re Reviewer
Re-review.
`);
  writeJson(root, 'contracts/stage_quality_cycle_policy.json', {
    stages: {
      deliver: {
        surface_kind: 'opl_stage_quality_cycle_policy',
        version: 'stage-quality-cycle-policy.v1',
        enabled: true,
        stage_prompt_ref: 'agent/prompts/deliver.md',
        role_prompt_refs: {
          producer: 'agent/prompts/deliver.md#producer',
          reviewer: 'agent/prompts/deliver.md#reviewer',
          repairer: 'agent/prompts/deliver.md#repairer',
          re_reviewer: 'agent/prompts/deliver.md#re-reviewer',
        },
        quality_rubric_refs: ['agent/quality_gates/quality.md'],
        in_thread_refinement: { allowed: true, authoritative: false },
        formal_review: {
          required: false,
          risk_tier: 'low',
          review_depth: 'focused',
          context_isolation_required: true,
          max_repair_rounds: 0,
        },
        budget_exhaustion: 'complete_with_quality_debt_if_consumable',
        attempt_boundary: {
          inherits_stage_goal_scope_authority: true,
          role_overlay_may_only_narrow: true,
          controller_creates_next_attempt: true,
          attempt_is_not_sub_stage: true,
        },
      },
    },
  });
}

function fixture(domainId: string, canonicalAgentId = domainId) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-stage-manifest-'));
  ownedFixtureRoots.add(root);
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
    surface_kind: 'owner_receipt_contract',
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
    version: 'family-action-catalog.v2',
    catalog_id: `${domainId}.actions`,
    target_domain_id: domainId,
    owner: domainId,
    authority_boundary: {
      domain_truth_owner: domainId,
      opl_role: 'projection_consumer_only',
      write_policy: 'no_domain_truth_writes',
    },
    actions: ['inspect', 'deliver'].map((actionId) => {
      const stageId = actionId === 'inspect' ? 'intake' : 'deliver';
      return {
        action_id: actionId,
        title: actionId,
        summary: `Run ${actionId}.`,
        owner: domainId,
        effect: 'mutating',
        execution_binding: {
          kind: 'stage_binding',
          stage_manifest_ref: 'agent/stages/manifest.json',
        },
        input_schema_ref: 'contracts/input.schema.json',
        output_schema_ref: 'contracts/output.schema.json',
        required_fields: ['workspace_root'],
        optional_fields: [],
        workspace_locator_fields: ['workspace_root'],
        human_gate_ids: [],
        stage_route: {
          entry_stage_ref: stageId,
          required_stage_refs: [stageId],
          optional_stage_refs: [],
          terminal_stage_refs: [stageId],
          route_policy: 'ai_selected_progress_route',
        },
        supported_surfaces: {
          cli: { surface_kind: 'domain_cli' },
          mcp: { tool_name: actionId, surface_kind: 'domain_mcp' },
          skill: { command_contract_id: actionId, surface_kind: 'domain_skill' },
          product_entry: {
            action_key: actionId,
            surface_kind: 'domain_product_entry',
          },
          openai: { tool_name: actionId },
          ai_sdk: { tool_name: actionId },
        },
      };
    }),
    notes: [],
  });
  writeJson(root, 'contracts/input.schema.json', {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    properties: { workspace_root: { type: 'string' } },
    required: ['workspace_root'],
  });
  writeJson(root, 'contracts/output.schema.json', {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
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
        display_names: {
          'en-US': 'Intake',
          'fr-FR': 'Accueil',
        },
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
        handoff_review_boundary: {
          artifact_effect: 'reviewed_immutable_refs_only',
          freezes_canonical_artifact_bytes: false,
          issues_quality_export_publication_or_ready_claim: false,
          downstream_owner_retains_acceptance: true,
        },
        title: 'Deliver',
        display_names: {
          'en-US': 'Deliver',
        },
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


export {
  assert,
  spawnSync,
  fs,
  os,
  path,
  test,
  buildDomainPackCompilerList,
  buildGeneratedAgentInterfaces,
  buildRepoGeneratedInterfaceBundle,
  buildStandardAgentRepoContractReadout,
  compileStandardAgentStageManifest,
  resolveStandardAgentStageQualityRuntimeBinding,
  FrameworkContractError,
  normalizeFamilyStageControlPlane,
  buildReadyAgentRepo,
  retargetReadyRepo,
  HOSTED_FOUNDRY_GENERATED_SURFACE_HANDOFF_DEFAULTS_PROFILE,
  resolveGeneratedSurfaceHandoffContract,
  STANDARD_GENERATED_SURFACE_HANDOFF_DEFAULTS_PROFILE,
  REPO_ROOT,
  writeJson,
  writeText,
  resolvePython3Executable,
  writePrimaryOnlyDeliverPolicy,
  fixture,
  readManifest,
  writeManifest,
};
export type { JsonRecord };
