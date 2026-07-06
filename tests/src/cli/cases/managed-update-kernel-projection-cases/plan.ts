import { assert, createFakeCodexFixture, fs, os, path, runCli, test } from '../../helpers.ts';

test('update plan can be scoped to capability packages and preserves safe command refs', () => {
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
    const output = runCli(['update', 'plan', '--component', 'capability_packages'], {
      HOME: homeRoot,
      CODEX_HOME: path.join(homeRoot, 'codex-home'),
      OPL_STATE_DIR: path.join(homeRoot, 'state'),
      OPL_MODULES_ROOT: path.join(homeRoot, 'modules'),
      OPL_FAMILY_WORKSPACE_ROOT: path.join(homeRoot, 'family'),
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
          receipt: {
            schema_version: string;
            source_manifest_ref: string; // reuse-first: allow existing receipt projection field.
            content_identity_fields: string[];
            post_apply_hooks: string[]; // reuse-first: allow existing post-apply projection field.
            apply_mode: string;
            status_detail: { auto_apply_eligible: boolean | null; app_background_safe: boolean | null };
            reload_guidance: { reload_recommended: boolean };
          };
          auto_apply: { eligible: boolean; app_background_safe: boolean; command_ref: string | null };
          post_apply_guidance: { command_refs: string[]; reload_guidance: { reload_recommended: boolean } };
          authority_boundary: Record<string, boolean>;
        }>;
      };
    };

    assert.equal(output.managed_update.operation, 'plan');
    assert.equal(output.managed_update.requested_component_id, 'capability_packages');
    assert.equal(output.managed_update.components.length, 1);
    const agents = output.managed_update.components[0];
    assert.equal(agents.component_id, 'capability_packages');
    assert.equal(agents.provider_id, 'capability_packages');
    assert.equal(agents.receipt.schema_version, 'opl_managed_update_component_receipt.v1');
    assert.equal(agents.receipt.source_manifest_ref, 'ghcr.io/gaofeng21cn/one-person-lab-manifest:latest'); // reuse-first: allow owner-routed descriptor projection assertion.
    assert.equal(agents.receipt.content_identity_fields.includes('digest'), true);
    assert.equal(agents.receipt.content_identity_fields.includes('sha256'), true);
    assert.equal(agents.receipt.post_apply_hooks.includes('sync_plugin_registry'), true); // reuse-first: allow post-apply projection assertion.
    assert.equal(agents.receipt.apply_mode, 'auto_apply');
    assert.equal(agents.receipt.status_detail.auto_apply_eligible, true);
    assert.equal(agents.receipt.status_detail.app_background_safe, true);
    assert.equal(agents.receipt.reload_guidance.reload_recommended, true);
    assert.equal(agents.auto_apply.eligible, true);
    assert.equal(agents.auto_apply.app_background_safe, true);
    assert.equal(agents.auto_apply.command_ref, 'opl update apply --component capability_packages --json');
    assert.deepEqual(agents.post_apply_guidance.command_refs, [
      'opl connect reconcile-modules --json',
      'opl connect sync-skills --json',
    ]);
    assert.equal(agents.post_apply_guidance.reload_guidance.reload_recommended, true);
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
