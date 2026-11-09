import { assert, fs, os, path, runCli, runCliFailure, test } from '../../helpers.ts';
import { createRcaWorkspaceDescriptorFixture } from '../workspace-domain-test-helper.ts';
import { resolveWorkspaceProjectRoot, assertWorkspaceInitializationPaths } from '../../../../../src/authority/workspace/workspace-initializer-parts/project-root.ts';
import { profileFromTopologyContract, workspaceProjectEntry } from '../../../../../src/authority/workspace/workspace-topology.ts';

test('workspace adopt indexes existing native project roots, preserves business files and reuses stable identities', () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-existing-project-root-'));
  const descriptors = createRcaWorkspaceDescriptorFixture();
  const workspace = path.join(fixture, 'native workspace');
  const firstRoot = path.join(workspace, 'productions/series/episode-one');
  const secondRoot = path.join(workspace, 'productions/series/episode-two');
  const env = { OPL_STATE_DIR: path.join(fixture, 'state'), OPL_FAMILY_WORKSPACE_ROOT: descriptors.familyRoot };
  const args = ['workspace', 'adopt', '--agent', 'rca', '--workspace', workspace];
  const indexPath = path.join(workspace, 'workspace_index.json');
  try {
    fs.mkdirSync(firstRoot, { recursive: true });
    fs.mkdirSync(secondRoot, { recursive: true });
    const businessFile = path.join(firstRoot, 'project.json');
    const original = '{"schema":"paper_project/v1","episode_id":"episode-one"}\n';
    fs.writeFileSync(businessFile, original);
    const preview = runCli([...args, '--project-id', 'stable-one', '--project-root', firstRoot, '--dry-run'], env).workspace_adoption;
    assert.equal(preview.project.project_root, 'productions/series/episode-one');
    assert.match(preview.next_apply_command, /--project-root '/);
    assert.equal(fs.existsSync(indexPath), false);
    assert.deepEqual(fs.readdirSync(firstRoot), ['project.json']);
    for (const [id, root] of [['stable-one', firstRoot], ['stable-two', secondRoot]]) {
      runCli([...args, '--project-id', id!, '--project-root', root!, '--apply'], env);
    }
    const readIndex = () => JSON.parse(fs.readFileSync(indexPath, 'utf8'));
    assert.deepEqual(readIndex().projects.map((entry: any) => [entry.project_id, entry.project_root]), [
      ['stable-one', 'productions/series/episode-one'], ['stable-two', 'productions/series/episode-two'],
    ]);
    assert.equal(fs.readFileSync(businessFile, 'utf8'), original);
    assert.equal(fs.existsSync(path.join(workspace, 'projects/stable-one')), false);
    runCli([...args, '--project-id', 'stable-one', '--apply'], env);
    const initialized = runCli(['workspace', 'init', '--agent', 'rca', '--workspace', workspace, '--project-id', 'stable-one'], env);
    assert.equal(initialized.workspace_initialization.project_root, firstRoot);
    const ensured = runCli(['workspace', 'ensure', '--agent', 'rca', '--project-id', 'stable-one', '--project-root', firstRoot], env);
    assert.equal(ensured.workspace_initialization.project_root, firstRoot);
    assert.equal(readIndex().projects.length, 2);
    const before = fs.readFileSync(indexPath, 'utf8');
    for (const conflict of [
      [...args, '--project-id', 'stable-one', '--project-root', secondRoot, '--apply'],
      [...args, '--project-id', 'different-id', '--project-root', firstRoot, '--dry-run'],
      ['workspace', 'ensure', '--agent', 'rca', '--project-id', 'stable-one', '--project-root', secondRoot],
      ['workspace', 'init', '--agent', 'rca', '--workspace', workspace, '--project-id', 'stable-one', '--project-root', secondRoot, '--force'],
    ]) {
      assert.equal(runCliFailure(conflict, env).payload.error.code, 'cli_usage_error');
      assert.equal(fs.readFileSync(indexPath, 'utf8'), before);
    }
    runCli(['workspace', 'validate', '--workspace', workspace], env);
  } finally {
    descriptors.cleanup();
    fs.rmSync(fixture, { recursive: true, force: true });
  }
});

test('existing project root registration rejects outside, missing, file and symlink paths before writes', () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-project-boundary-'));
  const workspacePath = path.join(fixture, 'workspace');
  const validRoot = path.join(workspacePath, 'native/one');
  try {
    fs.mkdirSync(validRoot, { recursive: true });
    fs.mkdirSync(path.join(fixture, 'outside'));
    fs.writeFileSync(path.join(workspacePath, 'file'), 'unchanged');
    fs.symlinkSync(validRoot, path.join(workspacePath, 'alias'));
    fs.symlinkSync(path.join(fixture, 'missing'), path.join(workspacePath, 'dangling'));
    fs.symlinkSync(path.join(fixture, 'outside'), path.join(workspacePath, 'external'));
    const resolve = (projectRoot: string) => resolveWorkspaceProjectRoot({
      workspacePath, projectId: 'one', projectRoot, projectCollectionPath: 'projects', projects: [],
    });
    for (const invalid of [workspacePath, fixture, path.join(workspacePath, 'missing'),
      path.join(workspacePath, 'file'), path.join(workspacePath, 'alias'),
      path.join(workspacePath, 'alias/child'), path.join(workspacePath, 'dangling'),
      path.join(workspacePath, 'external/child'), 'native/one', '']) {
      assert.throws(() => resolve(invalid));
    }
    assert.equal(resolve(validRoot), validRoot);
    const domainMetadata = path.join(validRoot, 'project.yaml');
    fs.writeFileSync(domainMetadata, 'title: Domain-owned production\n');
    assert.throws(() => resolve(validRoot), /non-OPL project metadata/);
    assert.equal(fs.readFileSync(domainMetadata, 'utf8'), 'title: Domain-owned production\n');
    fs.unlinkSync(domainMetadata);
    assert.equal(resolveWorkspaceProjectRoot({ workspacePath, projectId: 'new', projectCollectionPath: 'projects', projects: [] }), path.join(workspacePath, 'projects/new'));
    const profile = profileFromTopologyContract('series');
    const project = workspaceProjectEntry('one', 'native/one', 'native/one/artifacts/stage_outputs');
    fs.symlinkSync(path.join(fixture, 'outside'), path.join(validRoot, 'control'));
    assert.throws(() => assertWorkspaceInitializationPaths({ workspacePath, profile, projects: [project] }));
    assert.deepEqual(fs.readdirSync(path.join(fixture, 'outside')), []);
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true });
  }
});
