import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function writeJson(root: string, ref: string, value: unknown) {
  const file = path.join(root, ref);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export function writeText(root: string, ref: string, value: string) {
  const file = path.join(root, ref);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, value, 'utf8');
}

export function createPackFixture(
  reviewInputSnapshotTransport: Record<string, unknown> = {
    review_lane_binding: 'controller_required',
    allowed_review_lanes: ['medical', 'display'],
    executor_may_select_lane: false,
    lane_fallback: false,
  },
) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-pack-bound-quality-e2e-'));
  const requiredPackPaths = [
    'agent/stages/manifest.json',
    'agent/stages/draft.md',
    'agent/prompts/draft.md',
    'agent/knowledge/domain.md',
    'agent/quality_gates/quality.md',
    'agent/skills/domain.md',
    'agent/tools/domain.md',
  ];
  writeText(root, 'agent/stages/draft.md', '# Draft policy\n');
  writeText(root, 'agent/prompts/draft.md', `# Draft

## Producer
Produce the exact requested draft artifact and report its identity.

## Reviewer
Review the exact producer artifact against the declared rubric.

## Repairer
Repair only required findings and report changed artifact identity.

## Re Reviewer
Close prior findings against the repaired artifact.
`);
  writeText(root, 'agent/knowledge/domain.md', '# Domain knowledge\n');
  writeJson(root, 'contracts/durable_knowledge_catalog.json', {
    surface_kind: 'opl_durable_knowledge_catalog',
    version: 'durable-knowledge-catalog.v2',
    owner: 'one-person-lab',
    domain_id: 'medautoscience',
    items: [{
      surface_kind: 'opl_durable_knowledge_item',
      version: 'durable-knowledge-item.v2',
      knowledge_id: 'fixture.pack-bound.draft',
      title: 'Pack-bound draft knowledge',
      scope: { kind: 'product', id: 'medautoscience' }, content_kind: 'mechanism', owner: 'medautoscience',
      body_ref: {
        kind: 'repo_path',
        ref: 'agent/knowledge/domain.md',
      },
      applicability: {
        domains: ['medautoscience'],
        stages: ['draft'],
      },
      status: 'active',
      reviewed_at: '2020-01-01T00:00:00Z',
      next_review_at: '2099-01-01T00:00:00Z',
      authority_boundary: {
        semantic_body_owner: 'medautoscience',
        opl_role: 'catalog_recall_and_receipt_projection_only',
      },
    }],
  });
  writeText(root, 'agent/quality_gates/quality.md', '# Quality rubric\n\nThe draft is complete and source-grounded.\n');
  writeText(root, 'agent/skills/domain.md', '# Domain skill\n');
  writeText(root, 'agent/tools/domain.md', '# Domain tools\n');
  writeText(root, 'runtime/authority_functions/README.md', '# Authority functions\n');
  writeJson(root, 'contracts/owner_receipt_contract.json', {
    surface_kind: 'owner_receipt_contract',
  });
  writeJson(root, 'contracts/domain_descriptor.json', {
    surface_kind: 'domain_agent_descriptor',
    schema_version: 1,
    domain_id: 'medautoscience',
    domain_label: 'Pack-bound MAS fixture',
    authority_boundary: {
      opl_can_write_domain_truth: false,
      opl_can_write_memory_body: false,
      opl_can_authorize_quality_or_export: false,
    },
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
  writeJson(root, 'contracts/action_catalog.json', {
    surface_kind: 'family_action_catalog',
    version: 'family-action-catalog.v2',
    catalog_id: 'pack_bound_quality_e2e.actions',
    target_domain_id: 'medautoscience',
    owner: 'medautoscience',
    authority_boundary: {
      domain_truth_owner: 'medautoscience',
      opl_role: 'projection_consumer_only',
      write_policy: 'no_domain_truth_writes',
    },
    actions: [{
      action_id: 'draft',
      title: 'Draft',
      summary: 'Create a draft artifact.',
      owner: 'medautoscience',
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
        entry_stage_ref: 'draft',
        required_stage_refs: ['draft'],
        optional_stage_refs: [],
        terminal_stage_refs: ['draft'],
        route_policy: 'ai_selected_progress_route',
      },
      supported_surfaces: {
        cli: { surface_kind: 'domain_cli' },
        mcp: { tool_name: 'mas_draft', surface_kind: 'domain_mcp' },
        skill: { command_contract_id: 'mas.draft', surface_kind: 'domain_skill' },
        product_entry: { action_key: 'draft', surface_kind: 'domain_product_entry' },
        openai: { tool_name: 'mas_draft' },
        ai_sdk: { tool_name: 'mas_draft' },
      },
      authority_boundary: {},
    }],
    notes: [],
  });
  writeJson(root, 'contracts/pack_compiler_input.json', {
    surface_kind: 'opl_domain_pack_compiler_input',
    domain_id: 'medautoscience',
    canonical_agent_id: 'mas',
    generated_surface_owner: 'one-person-lab',
    domain_repo_can_own_generated_surface: false,
    authority_boundary: {
      opl_can_write_domain_truth: false,
      opl_can_write_memory_body: false,
      opl_can_authorize_quality_or_export: false,
      domain_can_claim_generated_surface_owner: false,
    },
    required_domain_pack_paths: requiredPackPaths,
  });
  writeJson(root, 'contracts/stage_quality_cycle_policy.json', {
    surface_kind: 'opl_domain_stage_quality_cycle_profile',
    version: 'domain-stage-quality-cycle-profile.v1',
    stages: {
      draft: {
        surface_kind: 'opl_stage_quality_cycle_policy',
        version: 'stage-quality-cycle-policy.v1',
        enabled: true,
        stage_prompt_ref: 'agent/prompts/draft.md',
        role_prompt_refs: {
          producer: 'agent/prompts/draft.md#producer',
          reviewer: 'agent/prompts/draft.md#reviewer',
          repairer: 'agent/prompts/draft.md#repairer',
          re_reviewer: 'agent/prompts/draft.md#re-reviewer',
        },
        quality_rubric_refs: ['agent/quality_gates/quality.md'],
        in_thread_refinement: { allowed: true, authoritative: false },
        formal_review: {
          required: true,
          risk_tier: 'high',
          review_depth: 'multi_axis',
          context_isolation_required: true,
          max_repair_rounds: 3,
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
  writeJson(root, 'agent/stages/manifest.json', {
    surface_kind: 'opl_standard_agent_declarative_stage_manifest',
    version: 'opl-standard-agent-declarative-stage-manifest.v1',
    target_domain_id: 'medautoscience',
    owner: 'medautoscience',
    authority_boundary: {
      domain_truth_owner: 'medautoscience',
      opl_can_write_domain_truth: false,
      opl_can_authorize_quality_or_export: false,
    },
    stages: [{
      stage_id: 'draft',
      stage_kind: 'creation',
      title: 'Draft',
      summary: 'Create the requested draft.',
      goal: 'Produce one source-grounded, consumable draft artifact.',
      policy_ref: 'agent/stages/draft.md',
      prompt_ref: 'agent/prompts/draft.md',
      knowledge_refs: ['agent/knowledge/domain.md'],
      quality_gate_refs: ['agent/quality_gates/quality.md'],
      allowed_action_refs: ['draft'],
      requires: ['source_request'],
      ensures: ['consumable_draft'],
      next_stage_refs: [],
      trust_lane: 'domain_agent',
      stage_quality_cycle_policy_ref: 'contracts/stage_quality_cycle_policy.json#/stages/draft',
      stage_contract_extension: {
        review_input_snapshot_transport: reviewInputSnapshotTransport,
      },
    }],
  });
  return root;
}

export function packageUseBinding(packRoot: string, version = '0.0.0-test') {
  const manifestBytes = fs.readFileSync(path.join(packRoot, 'agent/stages/manifest.json'));
  const manifestSha256 = crypto.createHash('sha256').update(manifestBytes).digest('hex');
  const rootContentDigest = crypto.createHash('sha256')
    .update(`pack-bound-quality-e2e-root-package-v1\0${version}`)
    .digest('hex');
  const closureDigest = crypto.createHash('sha256')
    .update(`medautoscience\0${manifestSha256}\0${rootContentDigest}`)
    .digest('hex');
  return {
    surface_kind: 'opl_agent_package_use_binding.v1',
    use_boundary_id: 'package-use:pack-bound-quality-e2e',
    root_package: {
      package_id: 'medautoscience',
      package_version: version,
      owner_language_version: { scheme: 'pep440', value: version },
      package_lock_ref: `opl://agent-package-lock/medautoscience/${version}`,
      manifest_sha256: manifestSha256,
      content_digest: `sha256:${rootContentDigest}`,
      source_artifact_ref: null,
      artifact_digest: null,
    },
    provider_packages: [],
    dependency_closure_digest: closureDigest,
  };
}

export function restoreEnv(previous: Map<string, string | undefined>) {
  for (const [key, value] of previous) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

