import {
  assert,
  fs,
  path,
  test,
  parseJsonText,
  validateJsonSchemaPayload,
  buildAgentCatalog,
  buildWorkItemProjectionV2,
  projectWorkItemPrimaryState,
  masDescriptor,
  identityDescriptor,
  fixture,
  type StandardAgentDescriptorInterface,
} from './fixtures.ts';

test('primary-state projection keeps responsibility and lifecycle precedence centralized', () => {
  const baseAttention = {
    kind: 'none' as const,
    reason: 'no_current_action_required',
    owner: null,
    responsible_component: null,
    issue: null,
    impact: null,
    repair_action: null,
    expected_outcome: null,
  };
  const user = projectWorkItemPrimaryState({
    businessState: 'active',
    attention: { ...baseAttention, kind: 'user', reason: 'domain_lifecycle_requires_user_decision', owner: 'user' },
    lastTransitionAt: '2026-07-13T08:00:00.000Z',
  });
  const incompleteSystem = projectWorkItemPrimaryState({
    businessState: 'paused',
    attention: { ...baseAttention, kind: 'system', responsible_component: 'opl_framework' },
    lastTransitionAt: '2026-07-13T09:00:00.000Z',
  });

  assert.deepEqual(user, {
    primary_state: 'awaiting_user_decision',
    primary_state_reason: 'domain_lifecycle_requires_user_decision',
    reason: 'domain_lifecycle_requires_user_decision',
    primary_state_label: '等待你决定',
    last_transition_at: '2026-07-13T08:00:00.000Z',
  });
  assert.equal(incompleteSystem.primary_state, 'paused');
  assert.equal(incompleteSystem.primary_state_reason, 'paused_until_new_direction');
});

test('agent availability is package health only in fast and full profiles', () => {
  const packageItems = ['mas', 'mag', 'rca', 'oma', 'obf'].map((packageId) => ({
    package_id: packageId,
    source_path: `/packages/${packageId}`,
  }));
  const fastStatuses = Object.fromEntries(packageItems.map(({ package_id }) => [package_id, {
    status: 'installed',
    codex_visible: true,
    package_version: '1.0.0',
    package_lock_ref: `/locks/${package_id}.json`,
    lock_ref: `opl://legacy-lock/${package_id}`,
  }]));
  const descriptorByAgent = new Map<string, StandardAgentDescriptorInterface | null>([
    ['mas', masDescriptor()],
    ['mag', identityDescriptor('mag')],
    ['rca', identityDescriptor('rca')],
    ['oma', identityDescriptor('oma')],
    ['obf', identityDescriptor('obf')],
  ]);
  const fast = buildAgentCatalog({
    profile: 'fast',
    checkedAt: '2026-07-13T08:00:00.000Z',
    packageItems,
    packageStatusById: fastStatuses,
    descriptorByAgent,
  }).availability;
  assert.equal(fast.every((entry) => entry.availability === 'available'), true);
  assert.equal(fast.every((entry) => entry.last_checked_at === '2026-07-13T08:00:00.000Z'), true);
  assert.equal(fast.every((entry) => entry.independent_from_work_item_state), true);
  assert.equal(fast.every((entry) => entry.source_ref === `/packages/${entry.package_id}`), true);
  assert.equal(fast.find((entry) => entry.agent_id === 'mag')?.inventory_descriptor.status, 'readable');

  const fullStatuses = Object.fromEntries(Object.entries(fastStatuses).map(([packageId, status]) => [packageId, {
    ...status,
    launch_allowed: packageId !== 'mag',
    launch_blocked_reason: packageId === 'mag' ? 'managed_runtime_source_missing' : null,
  }]));
  delete fullStatuses.obf;
  const full = buildAgentCatalog({
    profile: 'full',
    checkedAt: '2026-07-13T09:00:00.000Z',
    packageItems,
    packageStatusById: fullStatuses,
    descriptorByAgent,
  }).availability;
  assert.equal(full.find((entry) => entry.agent_id === 'mas')?.availability, 'available');
  assert.equal(full.find((entry) => entry.agent_id === 'mag')?.availability, 'attention_required');
  assert.equal(full.find((entry) => entry.agent_id === 'obf'), undefined);
  assert.equal(full.every((entry) => entry.source === 'package_status'), true);
});

test('deferred inventory resolves producer identity but isolates one descriptor failure', () => {
  const input = fixture();
  let descriptorReadCount = 0;
  try {
    const projection = buildWorkItemProjectionV2({
      profile: 'fast',
      bindings: input.bindings,
      packageProjectionItems: input.packageProjectionItems,
      packageStatusById: input.packageStatusById,
      inventoryDetail: 'deferred',
      resolveDescriptor: (agentId) => {
        descriptorReadCount += 1;
        if (agentId === 'rca') throw new Error('synthetic producer read failure');
        return input.resolveDescriptor(agentId);
      },
      generatedAt: '2026-07-13T00:00:00.000Z',
    });
    assert.equal(descriptorReadCount, 6);
    assert.equal(projection.project_catalog.length, 3);
    assert.equal(projection.agent_catalog.length, 5);
    assert.equal(projection.agent_catalog.some((entry) => entry.agent_id === 'rca'), false);
    assert.equal(projection.agent_catalog.some((entry) => entry.agent_id === 'synthetic-agent'), true);
    assert.equal(
      projection.agent_availability.some((entry) => entry.agent_id === 'synthetic-agent'),
      true,
    );
    assert.equal(
      projection.agent_availability.some((entry) => entry.agent_id === 'rca'),
      false,
    );
    assert.deepEqual(projection.items, []);
    assert.equal(projection.detail_policy.inventory_detail, 'deferred');
    assert.equal(projection.detail_policy.all_work_item_summaries_included, false);
    assert.equal(projection.detail_policy.attempt_ref_limit_per_item, 0);
    assert.equal(projection.detail_policy.full_detail_surface, 'opl app state --profile full --json');
  } finally {
    fs.rmSync(input.root, { recursive: true, force: true });
  }
});

test('WorkItemProjection V2 output validates against its machine schema', () => {
  const input = fixture();
  try {
    const schemaRef = 'contracts/opl-framework/work-item-projection-v2.schema.json';
    const schema = parseJsonText(fs.readFileSync(path.join(process.cwd(), schemaRef), 'utf8')) as Record<string, unknown>;
    for (const projection of [
      buildWorkItemProjectionV2({
        profile: 'full',
        bindings: input.bindings,
        packageProjectionItems: input.packageProjectionItems,
        packageStatusById: input.packageStatusById,
        attempts: [],
        resolveDescriptor: input.resolveDescriptor,
        generatedAt: '2026-07-13T00:00:00.000Z',
      }),
      buildWorkItemProjectionV2({
        profile: 'fast',
        bindings: input.bindings,
        packageProjectionItems: input.packageProjectionItems,
        packageStatusById: input.packageStatusById,
        inventoryDetail: 'deferred',
        generatedAt: '2026-07-13T00:00:00.000Z',
      }),
    ]) {
      const validation = validateJsonSchemaPayload({
        schemaId: 'opl.work_item_projection.v2',
        schema,
        sourceRef: schemaRef,
      }, projection);
      assert.equal(validation.ok, true, validation.ok ? '' : JSON.stringify(validation.errors, null, 2));
    }

    const fullProjection = buildWorkItemProjectionV2({
      profile: 'full',
      bindings: input.bindings,
      packageProjectionItems: input.packageProjectionItems,
      packageStatusById: input.packageStatusById,
      attempts: [],
      resolveDescriptor: input.resolveDescriptor,
      generatedAt: '2026-07-13T00:00:00.000Z',
    });
    const localizedStage = fullProjection.items.find((item) => item.stage_map.length > 0)?.stage_map[0];
    assert.ok(localizedStage);
    localizedStage.display_names['zh-CN'] = '研究立项';
    const localizedValidation = validateJsonSchemaPayload({
      schemaId: 'opl.work_item_projection.v2',
      schema,
      sourceRef: schemaRef,
    }, fullProjection);
    assert.equal(
      localizedValidation.ok,
      true,
      localizedValidation.ok ? '' : JSON.stringify(localizedValidation.errors, null, 2),
    );
    localizedStage.display_names['zh-CN'] = '   ';
    const invalidValidation = validateJsonSchemaPayload({
      schemaId: 'opl.work_item_projection.v2',
      schema,
      sourceRef: schemaRef,
    }, fullProjection);
    assert.equal(invalidValidation.ok, false);
  } finally {
    fs.rmSync(input.root, { recursive: true, force: true });
  }
});
