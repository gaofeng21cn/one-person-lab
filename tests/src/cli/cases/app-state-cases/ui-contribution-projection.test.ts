import { assert, fs, os, path, runCli, runCliFailure, test } from '../../helpers.ts';
import { buildAppUiContributionsProjection } from '../../../../../src/read-models/operator/app-state-ui-contributions.ts';

function packageStatus(input: {
  installed?: boolean;
  exposureStatus?: string;
  contributionId: string;
  sortOrder: number;
  appEnabled?: boolean;
}) {
  return {
    app_enabled: input.appEnabled !== false,
    presence: { installed: input.installed !== false },
    capability_exposure: { status: input.exposureStatus ?? 'visible' },
    app_contributions: {
      schema_version: 'opl-app-contributions.v1',
      navigation: [],
      views: [{
        view_id: 'activity',
        view_type: 'activity_log',
        title_i18n: { 'en-US': 'Activity' },
        data_ref: 'example.activity.v1#current',
        command_ids: ['refresh'],
        badge_ids: ['health'],
      }],
      commands: [{
        command_id: 'refresh',
        label_i18n: { 'en-US': 'Refresh' },
        action_ref: 'example.activity.v1#refresh',
        confirmation_required: false,
      }],
      badges: [{
        badge_id: 'health',
        label_i18n: { 'en-US': 'Healthy' },
        data_ref: 'example.activity.v1#health',
        tone: 'success',
      }],
      ui: [{
        contribution_id: input.contributionId,
        slot: 'runtime.detail',
        contribution_kind: 'view',
        trust_tier: 'declarative',
        scope: 'work_item',
        sort_order: input.sortOrder,
        view_id: 'activity',
      }],
    },
  } as any;
}

test('Framework resolves installed Package UI contributions into stable slots', () => {
  const projection = buildAppUiContributionsProjection({
    'z-package': packageStatus({ contributionId: 'later', sortOrder: 20 }),
    'a-package': packageStatus({ contributionId: 'first', sortOrder: 10 }),
    'disabled-package': packageStatus({
      exposureStatus: 'disabled',
      contributionId: 'disabled',
      sortOrder: 0,
    }),
    'uninstalled-package': packageStatus({
      installed: false,
      contributionId: 'uninstalled',
      sortOrder: 0,
    }),
    'app-disabled-package': packageStatus({
      appEnabled: false,
      contributionId: 'disabled-only-in-app',
      sortOrder: 0,
    }),
  });

  assert.equal(projection.contribution_count, 2);
  assert.deepEqual(
    projection.slots['runtime.detail'].map((entry) => entry.contribution_key),
    ['a-package:first', 'z-package:later'],
  );
  assert.equal((projection.entries[0].view as any).view_type, 'activity_log');
  assert.equal((projection.entries[0].commands[0] as any).command_id, 'refresh');
  assert.equal((projection.entries[0].badges[0] as any).badge_id, 'health');
  assert.equal(projection.authority_boundary.arbitrary_code_allowed, false);
});

test('App package preference persists across CLI processes without changing native carrier configuration', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-package-preferences-'));
  const codexHome = path.join(root, 'codex');
  fs.mkdirSync(codexHome);
  const nativeConfig = '[plugins."example@local"]\nenabled = true\n';
  fs.writeFileSync(path.join(codexHome, 'config.toml'), nativeConfig);
  const env = { OPL_STATE_DIR: path.join(root, 'state'), CODEX_HOME: codexHome };
  const file = path.join(env.OPL_STATE_DIR, 'app-package-preferences.json');
  const command = ['app', 'action', 'execute', '--action', 'package_app_set_enabled', '--payload'];
  try {
    const disabled = JSON.stringify({ package_id: 'example', enabled: false });
    const preview = runCli([...command, disabled, '--dry-run', '--json'], env);
    assert.equal(preview.app_action_execution.result.app_enabled, false);
    assert.equal(fs.existsSync(file), false);

    const result = runCli([...command, disabled, '--json'], env);
    assert.equal(result.app_action_execution.result.app_enabled, false);
    assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')).packages, { example: false });

    const staleAction = runCliFailure(['app', 'action', 'execute', '--action', 'package_contribution_execute',
      '--payload', JSON.stringify({ package_id: 'example', ref: 'example.activity.v1#refresh', input: {}, confirmed: false }), '--json'], env);
    assert.match(JSON.stringify(staleAction), /package_disabled_in_app/);

    runCli([...command, JSON.stringify({ package_id: 'other-package', enabled: false }), '--json'], env);
    runCli([...command, JSON.stringify({ package_id: 'example', enabled: true }), '--json'], env);
    assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')).packages, { example: true, 'other-package': false });
    assert.equal(fs.readFileSync(path.join(codexHome, 'config.toml'), 'utf8'), nativeConfig);
    assert.equal(fs.existsSync(path.join(env.OPL_STATE_DIR, 'agent-package-home-shortcut-preferences.json')), false);

    runCliFailure([...command, JSON.stringify({ package_id: 'example', enabled: 'false' }), '--json'], env);
    assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).packages.example, true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('Framework emits stable empty slots when no Package contributes UI', () => {
  const projection = buildAppUiContributionsProjection({});

  assert.equal(projection.contribution_count, 0);
  assert.deepEqual(Object.keys(projection.slots), [
    'composer.palette',
    'runtime.detail',
    'settings.section',
  ]);
  assert.deepEqual(projection.entries, []);
});
