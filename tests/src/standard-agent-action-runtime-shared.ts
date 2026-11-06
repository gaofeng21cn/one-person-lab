import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { canonicalJsonBytes } from '../../src/kernel/canonical-json.ts';
import { resolveStandardAgent } from '../../src/kernel/standard-agent-registry.ts';
import type { StandardAgentStageQualityRuntimeBinding } from '../../src/authority/packages/index.ts';
import {
  readHostedAgentRuntimeActionContracts,
  type HostedAgentRuntimeBindingProvenance,
  type HostedAgentRuntimeBindingSnapshot,
} from '../../src/adapters/execution/hosted-agent-runtime-binding.ts';
import { normalizeStageQualityCyclePolicy } from '../../src/authority/stages/stage-quality-cycle.ts';

export function root(prefix: string) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

export function writeWorkspaceRegistry(input: {
  stateRoot: string;
  workspaceRoot: string;
  bindingId?: string;
  projectScopeId?: string;
}) {
  fs.mkdirSync(input.stateRoot, { recursive: true });
  fs.writeFileSync(path.join(input.stateRoot, 'workspace-registry.json'), `${JSON.stringify({
    version: 'g2',
    bindings: [{
      binding_id: input.bindingId ?? 'binding:medautoscience:test',
      project_scope_id: input.projectScopeId ?? 'project:medautoscience:test',
      project_id: 'medautoscience',
      project: 'Med Auto Science',
      workspace_path: fs.realpathSync.native(input.workspaceRoot),
      label: 'Scoped action fixture',
      status: 'active',
      direct_entry: {
        command: null,
        manifest_command: null,
        url: null,
        workspace_locator: null,
      },
      created_at: '2026-07-21T00:00:00.000Z',
      updated_at: '2026-07-21T00:00:00.000Z',
      archived_at: null,
    }],
  })}\n`);
}

export function writeWorkItemInventory(input: {
  checkoutRoot: string;
  workspaceRoot: string;
  studies: Array<{ studyId: string; root: string }>;
}) {
  fs.mkdirSync(path.join(input.checkoutRoot, 'contracts'), { recursive: true });
  fs.writeFileSync(path.join(input.checkoutRoot, 'contracts', 'domain_descriptor.json'), `${JSON.stringify({
    domain_id: 'medautoscience',
    standard_agent_interface: {
      version: 'opl_standard_agent_interface.v1',
      inventory_projection: {
        source_kind: 'workspace_relative_json',
        relative_path: 'workspace_index.json',
        items_pointer: '/studies',
        work_item_root_template: 'studies/{study_id}',
        field_map: {
          work_item_id: 'study_id',
          work_item_root: 'canonical_study_root',
          business_status: 'status',
          current_stage_id: 'current_stage_id',
          current_stage_status: 'current_stage_status',
          package_status: 'package_status',
          lifecycle_ref: 'lifecycle_ref',
        },
      },
      stage_catalog: null,
      domain_detail_views: [],
      workspace_binding: {
        locator_surface_kind: 'fixture_workspace_locator',
        default_profile_id: 'portfolio',
        workspace_kind: 'medical_research_workspace',
        project_kind: 'study',
        project_collection_label: 'studies',
        default_workspace_id: 'fixture-workspace',
        default_project_id: 'fixture-study',
        required_locator_fields: ['workspace_root'],
        optional_locator_fields: [],
      },
      runtime: {
        runtime_domain_id: 'medautoscience',
        registration_ref: null,
      },
      progress: { deliverable_delta_aliases: [], platform_delta_aliases: [] },
      routing: {
        explicit_aliases: [],
        workstream_ids: [],
        intent_signals: [],
        ambiguity_policy: 'explicit_action_required',
      },
    },
  })}\n`);
  for (const study of input.studies) {
    fs.mkdirSync(path.resolve(input.workspaceRoot, study.root), { recursive: true });
  }
  fs.writeFileSync(path.join(input.workspaceRoot, 'workspace_index.json'), `${JSON.stringify({
    studies: input.studies.map((study) => ({
      study_id: study.studyId,
      canonical_study_root: study.root,
      status: 'active',
      current_stage_id: null,
      current_stage_status: null,
      package_status: 'not_ready',
      lifecycle_ref: 'control/lifecycle.json',
    })),
  })}\n`);
}

export function sha256(bytes: string | Buffer) {
  return `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
}

export function writeStagePack(checkoutRoot: string): StandardAgentStageQualityRuntimeBinding {
  const files = new Map<string, string>([
    ['agent/stages/manifest.json', '{"stages":["intake"]}\n'],
    ['contracts/stage_quality_cycle_policy.json', '{"stages":{}}\n'],
    ['agent/prompts/intake.md', '# Intake producer\n'],
    ['agent/prompts/stage-quality.md', [
      '# Stage quality roles',
      '## Producer', 'Produce the artifact.',
      '## Reviewer', 'Review exact artifact bytes.',
      '## Repairer', 'Repair required findings.',
      '## Re Reviewer', 'Close prior findings.',
      '',
    ].join('\n')],
    ['agent/quality_gates/stage.md', '# Stage rubric\n'],
    ['agent/goals/intake.md', '# Intake goal\n'],
    ['agent/sources/request.md', '# Hosted request source\n'],
    ['agent/lineage/intake.json', '{"stage_id":"intake"}\n'],
    ['contracts/durable_knowledge_catalog.json', JSON.stringify({
      surface_kind: 'opl_durable_knowledge_catalog',
      version: 'durable-knowledge-catalog.v1',
      owner: 'one-person-lab',
      items: [],
    })],
  ]);
  for (const [ref, bytes] of files) {
    const filePath = path.join(checkoutRoot, ref);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, bytes);
  }
  const manifestBytes = files.get('agent/stages/manifest.json')!;
  return {
    surface_kind: 'opl_pack_bound_stage_quality_runtime_binding',
    version: 'opl-pack-bound-stage-quality-runtime-binding.v1',
    stage_id: 'intake',
    declared_stage_ids: ['intake'],
    enabled: true,
    stage_role: null,
    policy_ref: 'contracts/stage_quality_cycle_policy.json#/stages/intake',
    stage_prompt_ref: 'agent/prompts/intake.md',
    quality_policy: normalizeStageQualityCyclePolicy({
      formal_review: { required: true, risk_tier: 'high', max_repair_rounds: 3 },
    }),
    handoff_review_boundary: null,
    role_prompt_refs: {
      producer: 'agent/prompts/stage-quality.md#producer',
      reviewer: 'agent/prompts/stage-quality.md#reviewer',
      repairer: 'agent/prompts/stage-quality.md#repairer',
      re_reviewer: 'agent/prompts/stage-quality.md#re-reviewer',
    },
    quality_rubric_refs: ['agent/quality_gates/stage.md'],
    knowledge_refs: [],
    skill_refs: [],
    policy_refs: [],
    stage_goal_refs: ['agent/goals/intake.md'],
    source_refs: ['agent/sources/request.md'],
    lineage_refs: ['agent/lineage/intake.json'],
    manifest_ref: 'agent/stages/manifest.json',
    manifest_sha256: sha256(manifestBytes).slice('sha256:'.length),
  };
}

export function stagePackageUseBinding() {
  return {
    surface_kind: 'opl_agent_package_use_binding.v1',
    use_boundary_id: 'package-use:hosted-stage-test',
    root_package: {
      package_id: 'mas',
      package_version: '0.2.2',
      owner_language_version: { scheme: 'pep440', value: '0.2.2' },
      package_lock_ref: 'opl://agent-package-lock/mas/0.2.2',
      manifest_sha256: '1'.repeat(64),
      content_digest: `sha256:${'2'.repeat(64)}`,
      source_artifact_ref: 'oci://opl/mas@sha256:fixture',
      artifact_digest: `sha256:${'3'.repeat(64)}`,
      source_kind: 'first_party_managed_cohort',
    },
    provider_packages: [],
    dependency_closure_digest: '4'.repeat(64),
    core_skill_tree_digest: null,
    skill_tree_digest: null,
  };
}

export function supportedSurfaces() {
  return {
    cli: {},
    mcp: null,
    skill: null,
    product_entry: null,
    openai: null,
    ai_sdk: null,
  };
}

export function action(input: {
  actionId: string;
  executionBinding: Record<string, unknown>;
  stageRoute?: Record<string, unknown>;
}) {
  return {
    action_id: input.actionId,
    title: input.actionId,
    summary: 'Fixture action.',
    owner: 'fixture-owner',
    effect: 'read_only',
    execution_binding: input.executionBinding,
    input_schema_ref: 'contracts/input.schema.json',
    output_schema_ref: 'contracts/output.schema.json',
    required_fields: ['workspace_root', 'value'],
    optional_fields: [],
    workspace_locator_fields: ['workspace_root'],
    human_gate_ids: [],
    ...(input.stageRoute ? { stage_route: input.stageRoute } : {}),
    supported_surfaces: supportedSurfaces(),
    authority_boundary: {},
  };
}

export function writeContracts(checkoutRoot: string, actions: Record<string, unknown>[], registry?: Record<string, unknown>) {
  const foundryBound = actions.some((entry) => (
    (entry.execution_binding as Record<string, unknown> | undefined)?.kind === 'foundry_binding'
  ));
  fs.mkdirSync(path.join(checkoutRoot, 'contracts'), { recursive: true });
  fs.writeFileSync(path.join(checkoutRoot, 'contracts', 'action_catalog.json'), `${JSON.stringify({
    surface_kind: 'family_action_catalog',
    version: 'family-action-catalog.v2',
    catalog_id: 'fixture-actions',
    target_domain_id: 'medautoscience',
    owner: 'fixture-owner',
    authority_boundary: {
      domain_truth_owner: 'fixture-owner',
      opl_role: foundryBound ? 'foundry_runtime_owner' : 'projection_consumer_only',
      write_policy: 'no_domain_truth_writes',
      opl_can_write_domain_truth: false,
      opl_can_write_memory_body: false,
      opl_can_mutate_domain_artifact_body: false,
      opl_can_authorize_quality_or_export: false,
      provider_completion_is_domain_completion: false,
    },
    actions,
    notes: [],
  })}\n`);
  if (registry) {
    fs.writeFileSync(path.join(checkoutRoot, 'contracts', 'domain_handler_registry.json'), `${JSON.stringify(registry)}\n`);
  }
  fs.writeFileSync(path.join(checkoutRoot, 'contracts', 'input.schema.json'), `${JSON.stringify({
    $id: 'https://fixture.local/input.schema.json',
    type: 'object',
    required: ['workspace_root', 'value'],
    properties: {
      workspace_root: { type: 'string', minLength: 1 },
      value: { type: 'integer' },
    },
    additionalProperties: false,
  })}\n`);
  fs.writeFileSync(path.join(checkoutRoot, 'contracts', 'output.schema.json'), `${JSON.stringify({
    $id: 'https://fixture.local/output.schema.json',
    type: 'object',
    required: ['accepted', 'value'],
    properties: {
      accepted: { const: true },
      value: { type: 'integer' },
    },
    additionalProperties: false,
  })}\n`);
}

export function managed(
  checkoutRoot: string,
  workspaceRoot: string,
  runtimeOverrides: Record<string, unknown> = {},
) {
  return async () => {
    return {
      agent: resolveStandardAgent('mas')!,
      package_id: 'mas',
      workspace_root: fs.realpathSync.native(workspaceRoot),
      checkout_root: fs.realpathSync.native(checkoutRoot),
      package_status: {
        installed_package_count: 1,
        launch_allowed: true,
      },
      package_use_binding: null,
      use_boundary_id: null,
      runtime_source_kind: 'installed_native_carrier',
      native_runtime: {
        package_version: '0.2.25',
        carrier_installed_version: `0.2.25-${'a'.repeat(64)}`,
        manifest_path: path.join(checkoutRoot, 'opl-package.json'),
        manifest_sha256: sha256('mas-owner-manifest'),
        plugin_selector: 'med-autoscience@med-autoscience',
        marketplace_source: 'gaofeng21cn/med-autoscience',
        publication_ref: 'ghcr.io/gaofeng21cn/one-person-lab-packages/mas:latest-stable',
        plugin_source_path: fs.realpathSync.native(checkoutRoot),
        source_tree_sha256: sha256(`native-tree:${checkoutRoot}`),
        ...runtimeOverrides,
      },
    };
  };
}

export function hostedSnapshot(input: {
  checkoutRoot: string;
  workspaceRoot: string;
  label: string;
}): HostedAgentRuntimeBindingSnapshot {
  const checkoutRoot = fs.realpathSync.native(input.checkoutRoot);
  const workspaceRoot = fs.realpathSync.native(input.workspaceRoot);
  const { catalog, registry } = readHostedAgentRuntimeActionContracts(checkoutRoot, ['medautoscience']);
  const provenance: HostedAgentRuntimeBindingProvenance = {
    surface_kind: 'opl_hosted_agent_runtime_binding_provenance',
    version: 'opl-hosted-agent-runtime-binding-provenance.v1',
    source_kind: 'installed_native_carrier',
    target_agent_id: 'mas',
    target_domain_id: 'medautoscience',
    package_id: 'mas',
    package_version: input.label,
    carrier_installed_version: `${input.label}-${'a'.repeat(64)}`,
    owner_manifest_sha256: sha256(`owner-manifest:${input.label}`),
    plugin_selector: 'med-autoscience@med-autoscience',
    marketplace_source: 'gaofeng21cn/med-autoscience',
    plugin_source_path: checkoutRoot,
    source_tree_sha256: sha256(`native-tree:${checkoutRoot}`),
    action_contracts_sha256: sha256(canonicalJsonBytes({ action_catalog: catalog, handler_registry: registry })),
  };
  return {
    source_kind: provenance.source_kind,
    checkout_root: checkoutRoot,
    workspace_root: workspaceRoot,
    agent_id: 'mas',
    runtime_domain_id: 'medautoscience',
    target_domain_id: 'medautoscience',
    catalog_target_domain_ids: ['mas', 'medautoscience'],
    package_use_binding: null,
    provenance,
    provenance_ref: `opl://hosted-agent-runtime-binding/sha256/${sha256(canonicalJsonBytes(provenance)).slice('sha256:'.length)}`,
  };
}

export function recordLedger(input: Record<string, unknown>) {
  return {
    ledger_entry: {
      run_id: input.runId,
      status: input.status,
    },
    recorded_event: { event_type: 'standard_agent_action_run_recorded' },
  } as never;
}
