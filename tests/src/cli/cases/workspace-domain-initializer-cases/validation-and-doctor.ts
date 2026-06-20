import {
  assert,
  fs,
  os,
  path,
  runCli,
  runCliFailure,
  test,
} from '../../helpers.ts';

test('workspace validate fails closed and doctor reports blockers for missing workspace index', () => {
  const workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-workspace-missing-index-'));

  try {
    const failure = runCliFailure(['workspace', 'validate', '--workspace', workspacePath]);
    assert.equal(failure.payload.error.code, 'contract_shape_invalid');
    assert.equal(failure.payload.error.details.blockers[0].code, 'workspace_index_missing');
    assert.equal(failure.payload.error.details.repairable_findings[0].code, 'workspace_config_missing');

    const doctor = runCli(['workspace', 'doctor', '--workspace', workspacePath]);
    assert.equal(doctor.workspace_doctor.status, 'blocked');
    assert.equal(doctor.workspace_doctor.blockers[0].code, 'workspace_index_missing');
    assert.equal(doctor.workspace_doctor.repairable_findings[0].code, 'workspace_config_missing');
  } finally {
    fs.rmSync(workspacePath, { recursive: true, force: true });
  }
});
