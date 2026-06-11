import { assert, createFakeCodexFixture, fs, os, path, runCli, test } from '../helpers.ts';

test('update status exposes the managed update kernel projection without mutating global tools or domain truth', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-managed-update-status-'));
  const codexFixture = createFakeCodexFixture(`
if [ "$1" = "--version" ]; then
  echo "codex-cli 0.130.0"
  exit 0
fi
echo "Unsupported codex fixture command: $*" >&2
exit 2
`);

  try {
    const output = runCli(['update', 'status'], {
      HOME: homeRoot,
      CODEX_HOME: path.join(homeRoot, 'codex-home'),
      OPL_STATE_DIR: path.join(homeRoot, 'state'),
      OPL_CODEX_CLI_LATEST_VERSION: '0.134.0',
      PATH: `${codexFixture.fixtureRoot}:/usr/bin:/bin`,
    }) as {
      managed_update: {
        operation: string;
        surface_id: string;
        operation_mode: string;
        lifecycle: string[];
        summary: Record<string, number>;
        components: Array<{
          component_id: string;
          provider_id: string;
          state: string;
          conditions: Array<{ type: string; status: string; reason: string; message: string; observed_generation: number }>;
          plan: { action: string; command_refs: Array<{ command: string; mode: string; destructive: boolean }> };
          authority_boundary: Record<string, boolean>;
          current: Record<string, unknown>;
          target: Record<string, unknown> | null;
        }>;
        authority_boundary: Record<string, boolean>;
      };
    };

    assert.equal(output.managed_update.operation, 'status');
    assert.equal(output.managed_update.surface_id, 'opl_managed_update_kernel');
    assert.equal(output.managed_update.operation_mode, 'read_only_projection');
    assert.deepEqual(output.managed_update.lifecycle.slice(0, 4), [
      'manifest',
      'current_state',
      'plan',
      'fetch',
    ]);
    assert.equal(output.managed_update.summary.total_components_count, 4);
    assert.equal(output.managed_update.authority_boundary.can_mutate_user_global_homebrew, false);
    assert.equal(output.managed_update.authority_boundary.can_mutate_app_owned_runtime_root, false);
    assert.equal(output.managed_update.authority_boundary.can_write_domain_truth, false);
    assert.equal(output.managed_update.authority_boundary.can_claim_quality_or_export_verdict, false);
    assert.deepEqual(
      output.managed_update.components.map((entry) => entry.component_id),
      ['app_binary', 'runtime_toolchain', 'agent_package_channel', 'capability_exposure'],
    );
    assert.equal(
      output.managed_update.components.every((component) =>
        component.conditions.every((entry) =>
          typeof entry.type === 'string'
          && ['True', 'False', 'Unknown'].includes(entry.status)
          && typeof entry.reason === 'string'
          && typeof entry.message === 'string'
          && Number.isInteger(entry.observed_generation)
        )
      ),
      true,
    );

    const runtime = output.managed_update.components.find((entry) => entry.component_id === 'runtime_toolchain');
    assert.ok(runtime);
    assert.equal(runtime.provider_id, 'runtime_toolchain');
    assert.equal(runtime.state, 'update_available');
    assert.equal(typeof runtime.current.current_pointer, 'string');
    assert.equal(typeof runtime.current.staged_root, 'string');
    assert.equal(Object.hasOwn(runtime.current, 'rollback_pointer'), true);
    assert.equal(typeof runtime.target?.staged_root, 'string');
    assert.equal(runtime.plan.command_refs.some((entry) => entry.command === 'opl system startup-maintenance --json'), true);
    assert.equal(runtime.authority_boundary.can_mutate_homebrew, false);
    assert.equal(runtime.authority_boundary.can_mutate_global_npm, false);

    const agents = output.managed_update.components.find((entry) => entry.component_id === 'agent_package_channel');
    assert.ok(agents);
    assert.equal(agents.provider_id, 'agent_package_channel');
    assert.equal(agents.current.tag_role, 'selector_only');
    assert.equal(
      agents.conditions.some((entry) => entry.type === 'DigestPinned' && entry.reason === 'ChannelTagSelectorOnly'),
      true,
    );
    assert.equal(agents.authority_boundary.can_overwrite_dirty_checkout, false);
    assert.equal(agents.authority_boundary.can_write_domain_truth, false);

    const exposure = output.managed_update.components.find((entry) => entry.component_id === 'capability_exposure');
    assert.ok(exposure);
    assert.equal(
      exposure.conditions.some((entry) => entry.type === 'DerivedProjection' && entry.status === 'True'),
      true,
    );
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
    fs.rmSync(codexFixture.fixtureRoot, { recursive: true, force: true });
  }
});

test('update plan can be scoped to agent packages and preserves safe command refs', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-managed-update-plan-'));
  const codexFixture = createFakeCodexFixture(`
if [ "$1" = "--version" ]; then
  echo "codex-cli 0.134.0"
  exit 0
fi
echo "Unsupported codex fixture command: $*" >&2
exit 2
`);

  try {
    const output = runCli(['update', 'plan', '--component', 'agent_package_channel'], {
      HOME: homeRoot,
      CODEX_HOME: path.join(homeRoot, 'codex-home'),
      OPL_STATE_DIR: path.join(homeRoot, 'state'),
      OPL_CODEX_CLI_LATEST_VERSION: '0.134.0',
      PATH: `${codexFixture.fixtureRoot}:/usr/bin:/bin`,
    }) as {
      managed_update: {
        operation: string;
        requested_component_id: string;
        components: Array<{
          component_id: string;
          provider_id: string;
          plan: { command_refs: Array<{ action_id: string; command: string; mode: string; destructive: boolean }> };
          receipt: { content_identity_fields: string[] };
          authority_boundary: Record<string, boolean>;
        }>;
      };
    };

    assert.equal(output.managed_update.operation, 'plan');
    assert.equal(output.managed_update.requested_component_id, 'agent_package_channel');
    assert.equal(output.managed_update.components.length, 1);
    const agents = output.managed_update.components[0];
    assert.equal(agents.component_id, 'agent_package_channel');
    assert.equal(agents.provider_id, 'agent_package_channel');
    assert.equal(agents.receipt.content_identity_fields.includes('digest'), true);
    assert.equal(agents.receipt.content_identity_fields.includes('sha256'), true);
    assert.equal(agents.authority_boundary.can_overwrite_developer_checkout, false);
    assert.equal(
      agents.plan.command_refs.every((entry) => entry.destructive === false),
      true,
    );
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
    fs.rmSync(codexFixture.fixtureRoot, { recursive: true, force: true });
  }
});

test('update component filter keeps the retired agent_packages alias as a non-authoritative selector', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-managed-update-agent-packages-alias-'));
  const codexFixture = createFakeCodexFixture(`
if [ "$1" = "--version" ]; then
  echo "codex-cli 0.134.0"
  exit 0
fi
echo "Unsupported codex fixture command: $*" >&2
exit 2
`);

  try {
    const output = runCli(['update', 'status', '--component', 'agent_packages'], {
      HOME: homeRoot,
      CODEX_HOME: path.join(homeRoot, 'codex-home'),
      OPL_STATE_DIR: path.join(homeRoot, 'state'),
      OPL_CODEX_CLI_LATEST_VERSION: '0.134.0',
      PATH: `${codexFixture.fixtureRoot}:/usr/bin:/bin`,
    }) as {
      managed_update: {
        requested_component_id: string;
        components: Array<{ component_id: string; provider_id: string }>;
      };
    };

    assert.equal(output.managed_update.requested_component_id, 'agent_packages');
    assert.equal(output.managed_update.components.length, 1);
    assert.equal(output.managed_update.components[0].component_id, 'agent_package_channel');
    assert.equal(output.managed_update.components[0].provider_id, 'agent_package_channel');
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
    fs.rmSync(codexFixture.fixtureRoot, { recursive: true, force: true });
  }
});

test('update apply repair and rollback remain controlled projections until component actions execute', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-managed-update-operations-'));
  const codexFixture = createFakeCodexFixture(`
if [ "$1" = "--version" ]; then
  echo "codex-cli 0.134.0"
  exit 0
fi
echo "Unsupported codex fixture command: $*" >&2
exit 2
`);

  try {
    for (const operation of ['apply', 'repair', 'rollback'] as const) {
      const output = runCli(['update', operation, '--component', 'runtime_toolchain'], {
        HOME: homeRoot,
        CODEX_HOME: path.join(homeRoot, 'codex-home'),
        OPL_STATE_DIR: path.join(homeRoot, 'state'),
        OPL_CODEX_CLI_LATEST_VERSION: '0.134.0',
        PATH: `${codexFixture.fixtureRoot}:/usr/bin:/bin`,
      }) as {
        managed_update: {
          operation: string;
          operation_mode: string;
          authority_boundary: Record<string, boolean>;
          receipts: { write_policy: string };
          components: Array<{
            component_id: string;
            authority_boundary: Record<string, boolean>;
            plan: { command_refs: Array<{ mode: string; destructive: boolean }> };
          }>;
        };
      };

      assert.equal(output.managed_update.operation, operation);
      assert.equal(output.managed_update.operation_mode, 'controlled_projection');
      assert.equal(output.managed_update.authority_boundary.can_mutate_app_owned_runtime_root, false);
      assert.equal(output.managed_update.authority_boundary.can_silently_update_clean_managed_modules, false);
      assert.equal(output.managed_update.authority_boundary.can_sync_codex_plugin_skill_projection, false);
      assert.equal(output.managed_update.authority_boundary.can_mutate_user_global_npm, false);
      assert.equal(output.managed_update.receipts.write_policy, 'projection_only_no_receipt_write');
      assert.equal(output.managed_update.components.length, 1);
      assert.equal(output.managed_update.components[0].component_id, 'runtime_toolchain');
      assert.equal(output.managed_update.components[0].authority_boundary.can_mutate_app_owned_runtime_root, true);
      assert.equal(
        output.managed_update.components[0].plan.command_refs.every((entry) => entry.destructive === false),
        true,
      );
    }
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
    fs.rmSync(codexFixture.fixtureRoot, { recursive: true, force: true });
  }
});
