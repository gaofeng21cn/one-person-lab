import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertFamilyActionHandlerRefsResolve,
  normalizeDomainHandlerRegistry,
  normalizeFamilyActionCatalog,
} from '../../src/kernel/family-action-catalog-contract.ts';
import { projectFamilyAction } from '../../src/kernel/family-action-catalog-projection.ts';
import {
  buildFamilyActionStageRouteParity,
  normalizeFamilyStageControlPlane,
} from '../../src/modules/stagecraft/index.ts';
import { buildGeneratedDirectParityProof } from '../../src/modules/pack/domain-pack-compiler/generated-interface-parity.ts';

const validRoute = {
  entry_stage_ref: 'intake',
  required_stage_refs: ['intake', 'plan', 'review'],
  optional_stage_refs: ['research'],
  terminal_stage_refs: ['review'],
  route_policy: 'ai_selected_progress_route',
};

function catalogValue(
  route: Record<string, unknown> | undefined,
  options: {
    binding?: 'stage_binding' | 'handler_ref' | 'foundry_binding';
    handlerRef?: unknown;
    stageManifestRef?: unknown;
    providerManifestRef?: unknown;
  } = {},
) {
  const binding = options.binding ?? 'stage_binding';
  return {
    surface_kind: 'family_action_catalog',
    version: 'family-action-catalog.v2',
    catalog_id: 'sample_actions',
    target_domain_id: 'sample',
    owner: 'sample',
    authority_boundary: {
      domain_truth_owner: 'sample',
      opl_role: binding === 'foundry_binding' ? 'foundry_runtime_owner' : 'projection_consumer_only',
      write_policy: 'no_domain_truth_writes',
    },
    actions: [{
      action_id: 'build',
      title: 'Build',
      summary: 'Build the sample.',
      owner: 'sample',
      effect: 'mutating',
      execution_binding: binding === 'handler_ref'
        ? { kind: 'handler_ref', handler_ref: options.handlerRef ?? 'handler:sample.build' }
        : binding === 'foundry_binding'
          ? {
              kind: 'foundry_binding',
              provider_manifest_ref: options.providerManifestRef ?? 'contracts/foundry_provider.json',
            }
          : {
            kind: 'stage_binding',
            stage_manifest_ref: options.stageManifestRef ?? 'agent/stages/manifest.json',
          },
      input_schema_ref: 'input.json',
      output_schema_ref: 'output.json',
      required_fields: [],
      optional_fields: [],
      workspace_locator_fields: [],
      human_gate_ids: [],
      supported_surfaces: {
        cli: {}, mcp: {}, skill: {}, product_entry: {}, openai: {}, ai_sdk: {},
      },
      authority_boundary: {},
      ...(route ? { stage_route: route } : {}),
    }],
    notes: [],
  };
}

function catalog(
  route: Record<string, unknown> | undefined,
  options: Parameters<typeof catalogValue>[1] = {},
) {
  return normalizeFamilyActionCatalog(catalogValue(route, options))!;
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

test('stage-bound action projects only the canonical OPL hosted command', () => {
  const normalizedCatalog = catalog(validRoute);
  const parity = buildFamilyActionStageRouteParity(normalizedCatalog, plane(['review', 'research']), {
    require_declared_routes: true,
  });
  const projection = projectFamilyAction(
    normalizedCatalog.actions[0]!,
    'sample',
    '/tmp/sample-agent',
  ).product_entry;

  assert.equal(parity.status, 'aligned');
  assert.equal(parity.declared_route_count, 1);
  assert.deepEqual(projection.stage_route, validRoute);
  assert.equal(
    projection.command,
    'opl agents run --domain sample --action build --workspace /tmp/sample-agent',
  );
});

test('action catalog accepts explicit work-item scope metadata and rejects undeclared aliases', () => {
  const scoped = catalogValue(validRoute) as Record<string, any>;
  scoped.actions[0].required_fields = ['study_id'];
  scoped.actions[0].execution_scope = {
    kind: 'work_item',
    alias_fields: ['study_id'],
  };
  const normalized = normalizeFamilyActionCatalog(scoped)!;
  assert.deepEqual(normalized.actions[0]!.execution_scope, {
    kind: 'work_item',
    alias_fields: ['study_id'],
  });

  const invalid = catalogValue(validRoute) as Record<string, any>;
  invalid.actions[0].execution_scope = {
    kind: 'work_item',
    alias_fields: ['study_id'],
  };
  assert.throws(
    () => normalizeFamilyActionCatalog(invalid),
    /alias_fields reference undeclared action parameters: study_id/,
  );
});

test('handler-bound action stays outside declarative stages and resolves through the canonical registry', () => {
  const normalizedCatalog = catalog(undefined, { binding: 'handler_ref' });
  const registry = normalizeDomainHandlerRegistry({
    surface_kind: 'domain_handler_registry',
    version: 'domain-handler-registry.v1',
    handlers: [{
      handler_id: 'sample.build',
      binding: { kind: 'typescript_export', file: 'src/handler.ts', export: 'build' },
    }],
  });
  const parity = buildFamilyActionStageRouteParity(normalizedCatalog, plane(['review'], []), {
    require_declared_routes: true,
  });

  assert.doesNotThrow(() => assertFamilyActionHandlerRefsResolve(normalizedCatalog, registry));
  assert.equal(normalizedCatalog.actions[0]!.execution_binding.kind, 'handler_ref');
  assert.equal(parity.status, 'aligned');
  assert.equal(parity.declared_route_count, 0);
});

test('handler-bound action fails when a stage exposes it as executable', () => {
  const parity = buildFamilyActionStageRouteParity(
    catalog(undefined, { binding: 'handler_ref' }),
    plane(),
    { require_declared_routes: true },
  );

  assert.match(parity.issues.join('\n'), /handler-bound action must not be allowed by a stage/);
});

test('foundry-bound action delegates its internal route graph to the provider manifest', () => {
  const normalizedCatalog = catalog(undefined, { binding: 'foundry_binding' });
  const parity = buildFamilyActionStageRouteParity(normalizedCatalog, plane(), {
    require_declared_routes: true,
  });

  assert.equal(normalizedCatalog.actions[0]!.execution_binding.kind, 'foundry_binding');
  assert.equal(parity.status, 'aligned');
  assert.equal(parity.declared_route_count, 0);
  assert.equal(parity.required_route_action_count, 0);
});

test('catalog v2 rejects legacy command metadata and incomplete execution bindings', () => {
  const legacyCatalog = catalogValue(validRoute) as Record<string, any>;
  legacyCatalog.actions[0].source_command = { command: 'sample build', surface_kind: 'domain_cli' };
  assert.throws(() => normalizeFamilyActionCatalog(legacyCatalog), /unknown properties: source_command/);

  const surfaceCommandCatalog = catalogValue(validRoute) as Record<string, any>;
  surfaceCommandCatalog.actions[0].supported_surfaces.cli.command = 'sample build';
  assert.throws(() => normalizeFamilyActionCatalog(surfaceCommandCatalog), /unknown properties: command/);

  assert.throws(
    () => catalog(undefined),
    /execution_binding.kind=stage_binding requires stage_route/,
  );
  assert.throws(
    () => catalog(validRoute, { binding: 'handler_ref' }),
    /execution_binding.kind=handler_ref must not declare stage_route/,
  );
  assert.throws(
    () => catalog(validRoute, { binding: 'foundry_binding' }),
    /execution_binding.kind=foundry_binding must not declare stage_route/,
  );
  assert.throws(
    () => catalog(undefined, { binding: 'handler_ref', handlerRef: 'sample.build' }),
    /handler:<handler_id>/,
  );
  assert.throws(
    () => catalog(validRoute, { stageManifestRef: 'storyline-architecture' }),
    /stage_manifest_ref must be agent\/stages\/manifest.json/,
  );

  const invalidAuthorityCatalog = catalogValue(validRoute) as Record<string, any>;
  invalidAuthorityCatalog.authority_boundary = {};
  assert.throws(
    () => normalizeFamilyActionCatalog(invalidAuthorityCatalog),
    /authority_boundary.domain_truth_owner/,
  );

  const invalidNotesCatalog = catalogValue(validRoute) as Record<string, any>;
  invalidNotesCatalog.notes = 'not-an-array';
  assert.throws(
    () => normalizeFamilyActionCatalog(invalidNotesCatalog),
    /notes must be an array of strings/,
  );

  const invalidDescriptorCatalog = catalogValue(validRoute) as Record<string, any>;
  invalidDescriptorCatalog.actions[0].supported_surfaces.mcp.public_runtime = 'yes';
  assert.throws(
    () => normalizeFamilyActionCatalog(invalidDescriptorCatalog),
    /supported_surfaces.mcp.public_runtime must be a boolean/,
  );

  const invalidActionAuthorityCatalog = catalogValue(validRoute) as Record<string, any>;
  invalidActionAuthorityCatalog.actions[0].authority_boundary = 'sample';
  assert.throws(
    () => normalizeFamilyActionCatalog(invalidActionAuthorityCatalog),
    /actions\[0\].authority_boundary must be an object/,
  );

  const forbiddenActionAuthorityCatalog = catalogValue(validRoute) as Record<string, any>;
  forbiddenActionAuthorityCatalog.actions[0].authority_boundary = {
    opl_can_write_domain_truth: true,
  };
  assert.throws(
    () => normalizeFamilyActionCatalog(forbiddenActionAuthorityCatalog),
    /grants forbidden OPL or provider authority: opl_can_write_domain_truth/,
  );

  const forbiddenActionOwnerCatalog = catalogValue(validRoute) as Record<string, any>;
  forbiddenActionOwnerCatalog.actions[0].authority_boundary = {
    quality_verdict_owner: 'one-person-lab',
  };
  assert.throws(
    () => normalizeFamilyActionCatalog(forbiddenActionOwnerCatalog),
    /grants forbidden OPL or provider authority: quality_verdict_owner/,
  );
});

test('catalog v2 rejects ambiguous public descriptor ids per generated surface', () => {
  for (const [surface, idField] of [
    ['mcp', 'tool_name'],
    ['skill', 'command_contract_id'],
    ['product_entry', 'action_key'],
    ['openai', 'tool_name'],
    ['ai_sdk', 'tool_name'],
  ] as const) {
    const value = structuredClone(catalogValue(validRoute)) as Record<string, any>;
    const second = structuredClone(value.actions[0]);
    second.action_id = 'review';
    second.title = 'Review';
    value.actions.push(second);
    value.actions[0].supported_surfaces[surface][idField] = 'shared_descriptor';
    value.actions[1].supported_surfaces[surface][idField] = 'shared_descriptor';

    assert.throws(
      () => normalizeFamilyActionCatalog(value),
      new RegExp(`duplicate ${surface} descriptor id shared_descriptor`),
    );
  }
});

test('generated parity rejects descriptors emitted for unsupported action surfaces', () => {
  const value = catalogValue(validRoute) as Record<string, any>;
  value.actions[0].supported_surfaces = {
    cli: null,
    mcp: {},
    skill: null,
    product_entry: null,
    openai: null,
    ai_sdk: null,
  };
  const normalizedCatalog = normalizeFamilyActionCatalog(value)!;
  const projection = projectFamilyAction(normalizedCatalog.actions[0]!, 'sample', '/tmp/sample-agent');
  const proof = buildGeneratedDirectParityProof(normalizedCatalog, {
    cli: { descriptors: [projection.cli] },
    mcp: { descriptors: [projection.mcp] },
    skill: { descriptors: [] },
    product_entry: { descriptors: [] },
    openai_tool: { descriptors: [] },
    ai_sdk: { descriptors: [] },
  }, {
    status: 'ready',
    blocked_target_count: 0,
  }, '/tmp/sample-agent');

  assert.equal(proof.status, 'blocked_or_drift_detected');
  assert.ok(proof.issues.includes('cli: unexpected generated descriptor build from build'));
  assert.ok(proof.issues.includes('build:cli: generated descriptor exists for an unsupported surface'));
});

test('handler registry is closed, canonical, and rejects aliases or implementation drift', () => {
  const base = {
    surface_kind: 'domain_handler_registry',
    version: 'domain-handler-registry.v1',
    handlers: [{
      handler_id: 'sample.build',
      binding: { kind: 'python_callable', module: 'sample.handlers', callable: 'build' },
    }],
  };
  assert.ok(normalizeDomainHandlerRegistry(base));
  assert.throws(
    () => normalizeDomainHandlerRegistry({ ...base, owner: 'sample' }),
    /unknown properties: owner/,
  );
  assert.throws(
    () => normalizeDomainHandlerRegistry({ ...base, version: 'domain-handler-registry.v1-candidate' }),
    /version must be domain-handler-registry.v1/,
  );
  assert.throws(
    () => normalizeDomainHandlerRegistry({
      ...base,
      handlers: [{ ...base.handlers[0], handler_ref: 'handler:sample.build' }],
    }),
    /unknown properties: handler_ref/,
  );
  assert.throws(
    () => normalizeDomainHandlerRegistry({
      ...base,
      handlers: [{ ...base.handlers[0], handler_id: 'handler:sample.build' }],
    }),
    /handler_id must be a bare canonical handler id/,
  );
  assert.throws(
    () => normalizeDomainHandlerRegistry({
      ...base,
      handlers: [{ ...base.handlers[0], binding: { kind: 'shell_command', command: 'sample build' } }],
    }),
    /kind must be typescript_export or python_callable/,
  );
});

test('action stage route rejects unknown stages without enforcing linear order', () => {
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
