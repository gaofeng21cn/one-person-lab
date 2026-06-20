import {
  assert,
  fs,
  os,
  path,
  runCli,
  test,
} from '../helpers.ts';

function writeExecutable(filePath: string, body: string) {
  fs.writeFileSync(filePath, body, 'utf8');
  fs.chmodSync(filePath, 0o755);
}

function createFakeDependencyBin(options: { missingLatexPackage?: string; markerPath?: string }) {
  const binDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-dependency-doctor-bin-'));
  for (const command of ['pandoc', 'xelatex', 'pdftoppm']) {
    writeExecutable(path.join(binDir, command), '#!/bin/sh\nprintf "%s\\n" "$0"\n');
  }

  const marker = options.markerPath;
  const missing = options.missingLatexPackage ?? '';
  writeExecutable(
    path.join(binDir, 'kpsewhich'),
    [
      '#!/bin/sh',
      marker ? `if [ -f ${JSON.stringify(marker)} ]; then printf "%s\\n" "/fake/tex/$1"; exit 0; fi` : '',
      missing ? `if [ "$1" = ${JSON.stringify(missing)} ]; then exit 1; fi` : '',
      'printf "%s\\n" "/fake/tex/$1"',
      '',
    ].join('\n'),
  );
  if (marker) {
    writeExecutable(
      path.join(binDir, 'tlmgr'),
      [
        '#!/bin/sh',
        `: > ${JSON.stringify(marker)}`,
        'printf "%s\\n" "installed $*"',
        '',
      ].join('\n'),
    );
  }

  return binDir;
}

test('system dependency-doctor blocks only the Book Forge proof profile when a required LaTeX package is missing', () => {
  const binDir = createFakeDependencyBin({ missingLatexPackage: 'titlesec.sty' });
  try {
    const output = runCli(['system', 'dependency-doctor', '--profile', 'bookforge-publication-proof'], {
      PATH: binDir,
    });
    const doctor = output.system_dependency_doctor;

    assert.equal(output.version, 'g2');
    assert.equal(doctor.surface_kind, 'opl_system_dependency_doctor');
    assert.equal(doctor.profile_id, 'bookforge-publication-proof');
    assert.equal(doctor.status, 'blocked');
    assert.equal(doctor.summary.missing_required_dependency_count, 1);
    assert.equal(doctor.repair_action.status, 'manual_required');
    assert.deepEqual(doctor.repair_action.apply_command, [
      'opl',
      'system',
      'dependency-maintenance',
      '--profile',
      'bookforge-publication-proof',
      '--apply',
      '--json',
    ]);
    assert.equal(doctor.authority_boundary.writes_domain_truth, false);
    assert.equal(doctor.authority_boundary.writes_manuscript, false);
    assert.equal(doctor.authority_boundary.authorizes_publication_ready, false);
    assert.equal(doctor.authority_boundary.ordinary_writing_progress_blocked_by_this_surface, false);
    assert.equal(
      doctor.authority_boundary.publication_proof_claim_requires_required_dependencies_ready,
      true,
    );

    const titlesec = doctor.dependencies.find((entry: { dependency_id: string }) =>
      entry.dependency_id === 'titlesec.sty'
    );
    assert.equal(titlesec?.status, 'missing');
    assert.equal(titlesec?.blocker_when_missing, true);

    const titling = doctor.dependencies.find((entry: { dependency_id: string }) =>
      entry.dependency_id === 'titling.sty'
    );
    assert.equal(titling?.required_level, 'legacy_not_required');
    assert.equal(titling?.blocker_when_missing, false);
  } finally {
    fs.rmSync(binDir, { recursive: true, force: true });
  }
});

test('system dependency-maintenance apply can repair fake TeX Live packages through explicit tlmgr route', () => {
  const markerPath = path.join(os.tmpdir(), `opl-dependency-doctor-${process.pid}-${Date.now()}.installed`);
  const binDir = createFakeDependencyBin({
    missingLatexPackage: 'titlesec.sty',
    markerPath,
  });
  try {
    const output = runCli([
      'system',
      'dependency-maintenance',
      '--profile',
      'bookforge-publication-proof',
      '--apply',
    ], {
      PATH: binDir,
    });
    const action = output.system_action;
    const details = action.details;

    assert.equal(output.version, 'g2');
    assert.equal(action.action, 'dependency_maintenance');
    assert.equal(action.status, 'completed');
    assert.equal(details.surface_kind, 'opl_system_dependency_maintenance');
    assert.equal(details.mutation_requested, true);
    assert.equal(details.mutation_performed, true);
    assert.equal(details.before.status, 'blocked');
    assert.equal(details.repair_action.status, 'completed');
    assert.equal(details.repair_action.package_manager, 'tlmgr');
    assert.deepEqual(details.repair_action.install_targets, ['titlesec']);
    assert.equal(details.after.status, 'ready');
  } finally {
    fs.rmSync(binDir, { recursive: true, force: true });
    fs.rmSync(markerPath, { force: true });
  }
});

test('help exposes the system dependency doctor as a scoped diagnostic command', () => {
  const output = runCli(['help']);
  const commands = output.help.commands.map((entry: { command: string }) => entry.command);

  assert.equal(commands.includes('system dependency-doctor'), false);
  assert.equal(runCli(['help', 'system', 'dependency-doctor']).help.command, 'system dependency-doctor');
  assert.equal(
    runCli(['help', 'system', 'dependency-maintenance']).help.command,
    'system dependency-maintenance',
  );
});
