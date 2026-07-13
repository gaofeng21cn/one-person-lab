import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeFamilyActionCatalog } from '../../src/kernel/family-action-catalog-contract.ts';
import { projectFamilyAction } from '../../src/kernel/family-action-catalog-projection.ts';
import {
  buildFamilyActionStageRouteParity,
  normalizeFamilyStageControlPlane,
} from '../../src/modules/stagecraft/index.ts';

function catalog(
  route: Record<string, unknown> | undefined,
  effect: 'read_only' | 'mutating' = 'mutating',
  options: {
    stageRouteExempt?: unknown;
    targetOnly?: boolean;
  } = {},
) {
  return normalizeFamilyActionCatalog({
    surface_kind: 'family_action_catalog',
    version: 'family-action-catalog.v1',
    catalog_id: 'sample_actions',
    target_domain_id: 'sample',
    owner: 'sample',
    authority_boundary: {},
    actions: [{
      action_id: 'build',
      title: 'Build',
      summary: 'Build the sample.',
      owner: 'sample',
      effect,
      source_command: { command: 'sample build', surface_kind: 'domain_cli' },
      input_schema_ref: 'input.json',
      output_schema_ref: 'output.json',
      workspace_locator_fields: [],
      human_gate_ids: [],
      supported_surfaces: options.targetOnly ? {
        cli: null,
        mcp: { descriptor_only: true, public_runtime: false },
        skill: null,
        product_entry: {},
        openai: null,
        ai_sdk: null,
      } : {
        cli: {}, mcp: {}, skill: {}, product_entry: {}, openai: {}, ai_sdk: {},
      },
      authority_boundary: {},
      ...(route ? { stage_route: route } : {}),
      ...(options.stageRouteExempt !== undefined ? { stage_route_exempt: options.stageRouteExempt } : {}),
    }],
    notes: [],
  })!;
}

function plane(nextFromPlan: string[] = ['review'], allowedActionRefs: string[] = ['build']) {
  const stage = (stageId: string, nextStageRefs: string[]) => ({
    stage_id: stageId,
    stage_kind: 'domain_specific',
    title: stageId,
    goal: stageId,
    owner: 'sample',
    domain_stage_refs: [],
    inputs: [],
    knowledge_refs: [],
    skills: [],
    prompt_refs: [],
    allowed_action_refs: allowedActionRefs,
    outputs: [],
    evaluation: [],
    handoff: { next_stage_refs: nextStageRefs },
    source_refs: [],
    authority_boundary: {},
  });
  return normalizeFamilyStageControlPlane({
    surface_kind: 'family_stage_control_plane',
    version: 'family-stage-control-plane.v1',
    plane_id: 'sample_plane',
    target_domain_id: 'sample',
    owner: 'sample',
    authority_boundary: {},
    stages: [
      stage('intake', ['plan']),
      stage('plan', nextFromPlan),
      stage('research', ['review']),
      stage('review', []),
    ],
    notes: [],
  })!;
}

const validRoute = {
  entry_stage_ref: 'intake',
  required_stage_refs: ['intake', 'plan', 'review'],
  optional_stage_refs: ['research'],
  terminal_stage_refs: ['review'],
  route_policy: 'ai_selected_progress_route',
};

test('action stage route accepts an AI-selected route over declared stages', () => {
  const normalizedCatalog = catalog(validRoute);
  const parity = buildFamilyActionStageRouteParity(normalizedCatalog, plane(['review', 'research']), {
    require_declared_routes: true,
  });
  assert.equal(parity.status, 'aligned');
  assert.equal(parity.declared_route_count, 1);
  assert.deepEqual(projectFamilyAction(normalizedCatalog.actions[0]!).product_entry.stage_route, validRoute);
});

test('domain-handler target-only action is exempt from stage routes without creating a route projection', () => {
  const normalizedCatalog = catalog(undefined, 'mutating', {
    stageRouteExempt: 'domain_handler_target_only',
    targetOnly: true,
  });
  const action = normalizedCatalog.actions[0]!;
  const parity = buildFamilyActionStageRouteParity(normalizedCatalog, plane(['review'], []), {
    require_declared_routes: true,
  });

  assert.equal(action.stage_route_exempt, 'domain_handler_target_only');
  assert.equal(action.stage_route, undefined);
  assert.equal(parity.status, 'aligned');
  assert.equal(parity.declared_route_count, 0);
  assert.equal(projectFamilyAction(action).product_entry.stage_route, undefined);
});

test('domain-handler target-only action fails when a stage exposes it as executable', () => {
  const parity = buildFamilyActionStageRouteParity(
    catalog(undefined, 'mutating', {
      stageRouteExempt: 'domain_handler_target_only',
      targetOnly: true,
    }),
    plane(),
    { require_declared_routes: true },
  );

  assert.match(parity.issues.join('\n'), /target-only action must not be allowed by a stage/);
});

test('domain-handler target-only exemption rejects non-mutating, routed, and public actions', () => {
  assert.throws(
    () => catalog(undefined, 'read_only', {
      stageRouteExempt: 'domain_handler_target_only',
      targetOnly: true,
    }),
    /stage_route_exempt=domain_handler_target_only requires effect=mutating/,
  );
  assert.throws(
    () => catalog(validRoute, 'mutating', {
      stageRouteExempt: 'domain_handler_target_only',
      targetOnly: true,
    }),
    /stage_route_exempt=domain_handler_target_only must not declare stage_route/,
  );
  assert.throws(
    () => catalog(undefined, 'mutating', {
      stageRouteExempt: 'domain_handler_target_only',
    }),
    /stage_route_exempt=domain_handler_target_only requires a descriptor-only non-public MCP target/,
  );
});

test('action stage route requires a declared graph and rejects unknown stages without enforcing order', () => {
  const missing = buildFamilyActionStageRouteParity(catalog(undefined), plane(), {
    require_declared_routes: true,
  });
  assert.match(missing.issues.join('\n'), /missing required stage_route/);
  assert.equal(buildFamilyActionStageRouteParity(catalog(undefined, 'read_only'), plane(), {
    require_declared_routes: true,
  }).status, 'aligned');

  const unknown = buildFamilyActionStageRouteParity(catalog({
    ...validRoute,
    terminal_stage_refs: ['missing'],
    optional_stage_refs: ['missing'],
  }), plane());
  assert.match(unknown.issues.join('\n'), /unknown stages: missing/);

  const nonlinear = buildFamilyActionStageRouteParity(catalog(validRoute), plane(['intake']));
  assert.equal(nonlinear.status, 'aligned');
});

test('action stage route and stage allowed_action_refs remain bidirectionally aligned', () => {
  const route = { ...validRoute, optional_stage_refs: [] };
  const parity = buildFamilyActionStageRouteParity(catalog(route), plane());
  assert.match(parity.issues.join('\n'), /allowed stage is omitted from stage_route: research/);
});
