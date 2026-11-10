import { assert, fs, os, path, runCli, runCliFailure, test } from '../helpers.ts';

test('software source CLI and App action share one refs-only configuration', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-source-cli-'));
  const env = { OPL_STATE_DIR: root, PATH: '/usr/bin:/bin' };
  const sourceId = 'github-packages:gaofeng21cn';
  try {
    const initial = runCli(['sources', 'list'], env).software_sources;
    assert.equal(initial.entries.find((source: { source_id: string }) => source.source_id === sourceId).status, 'signed_out');
    const configured = runCli(['sources', 'configure', '--source-id', sourceId], env).software_source;
    assert.equal(configured.source_id, sourceId);
    assert.equal(configured.credential_handle_present, true);
    assert.equal(configured.status, 'signed_out'); // Isolated fixture has no native GitHub login.
    const stored = JSON.parse(fs.readFileSync(path.join(root, 'software-sources.json'), 'utf8'));
    assert.equal(stored.sources.find((source: { source_id: string }) => source.source_id === sourceId).credential_handle, 'provider:github_packages:gh-cli');
    const fromAction = runCli(['app', 'action', 'execute', '--action', 'source_list'], env).app_action_execution;
    assert.equal(fromAction.delegated_surface, 'opl sources list');
    assert.equal(fromAction.result.software_sources.entries.find((source: { source_id: string }) => source.source_id === sourceId).credential_handle_present, true);
    const disconnected = runCli(['app', 'action', 'execute', '--action', 'source_disconnect', '--payload', JSON.stringify({ source_id: sourceId })], env).app_action_execution.result;
    assert.equal(disconnected.software_source.status, 'signed_out');
    assert.equal(disconnected.software_source.credential_handle_present, false);
    assert.equal(disconnected.local_installations_preserved, true);
    const rejected = runCliFailure(['sources', 'configure', '--source-id', sourceId, '--enabled', 'invalid'], env);
    assert.equal(rejected.payload.error.code, 'cli_usage_error');
    const secretRejected = runCliFailure(['app', 'action', 'execute', '--action', 'source_configure', '--payload', JSON.stringify({ source_id: sourceId, token: 'never-store-this-value' })], env);
    assert.equal(secretRejected.payload.error.details.reason_code, 'credential_payload_forbidden');
    assert.equal(fs.readFileSync(path.join(root, 'software-sources.json'), 'utf8').includes('never-store-this-value'), false);
    const missingRevision = runCliFailure(['sources', 'install', '--source-id', 'homebrew:gaofeng21cn-one-person-lab', '--item-id', 'formula:gaofeng21cn/one-person-lab/opl'], env);
    assert.equal(missingRevision.payload.error.code, 'cli_usage_error');
    const wrongNativeSource = runCliFailure(['sources', 'setup', '--source-id', sourceId], env);
    assert.equal(wrongNativeSource.payload.error.details.reason_code, 'homebrew_source_mismatch');
    const nativeDryRun = runCliFailure(['app', 'action', 'execute', '--action', 'source_uninstall', '--payload', JSON.stringify({ source_id: 'homebrew:gaofeng21cn-one-person-lab', item_id: 'formula:gaofeng21cn/one-person-lab/opl', expected_revision: 'fixture' }), '--dry-run'], env);
    assert.equal(nativeDryRun.payload.error.details.reason_code, 'software_source_dry_run_unsupported');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
