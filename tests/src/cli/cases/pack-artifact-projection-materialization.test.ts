import crypto from 'node:crypto';

import {
  artifactProjectionTreeSha256,
  materializeArtifactProjection,
  type ArtifactProjectionMaterializationRequest,
} from '../../../../src/modules/pack/artifact-projection-materialization.ts';
import {
  assert,
  fs,
  os,
  path,
  runCli,
  runCliFailure,
  test,
} from '../helpers.ts';

function sha256(bytes: string | Buffer) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function writeSource(root: string) {
  const sourceRoot = path.join(root, 'source');
  const files = {
    'STATUS.json': '{"status":"delivered_paused"}\n',
    'audit/submission_manifest.json': '{"layout":"submission-package.v2"}\n',
    'paper.pdf': 'candidate-pdf-bytes\n',
  };
  for (const [relativePath, content] of Object.entries(files)) {
    const file = path.join(sourceRoot, relativePath);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  }
  const expectedFiles = Object.entries(files)
    .map(([relativePath, content]) => ({
      path: relativePath,
      byte_size: Buffer.byteLength(content),
      sha256: sha256(content),
    }))
    .sort((left, right) => left.path.localeCompare(right.path));
  return { sourceRoot, expectedFiles };
}

function requestFixture(root: string): ArtifactProjectionMaterializationRequest {
  const workspaceRoot = path.join(root, 'workspace');
  fs.mkdirSync(workspaceRoot, { recursive: true });
  const { sourceRoot, expectedFiles } = writeSource(root);
  return {
    surface_kind: 'opl_artifact_projection_materialization_request.v1',
    schema_version: 1,
    operation_id: 'dm003-candidate-final',
    domain_id: 'medautoscience',
    generation_id: 'dm003-generation-1',
    workspace_root: workspaceRoot,
    source_root: sourceRoot,
    target_relative_path: 'studies/dm003/submission',
    expected_files: expectedFiles,
    expected_tree_sha256: artifactProjectionTreeSha256(expectedFiles),
    completion_marker_paths: ['STATUS.json', 'audit/submission_manifest.json'],
    domain_authorization: {
      owner: 'MedAutoScience',
      ref: 'mas://owner-receipt/dm003-generation-1',
      scope: 'artifact_projection_only',
      artifact_body_write_authorized: true,
      authorizes_quality_publication_or_submission: false,
    },
  };
}

function withStateRoot(root: string, callback: () => void) {
  const previous = process.env.OPL_STATE_DIR;
  process.env.OPL_STATE_DIR = path.join(root, 'state');
  try {
    callback();
  } finally {
    if (previous === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previous;
  }
}

test('pack artifact projection replaces an incomplete preferred root only after markers validate', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-artifact-projection-'));
  try {
    withStateRoot(root, () => {
      const request = requestFixture(root);
      const target = path.join(request.workspace_root, request.target_relative_path);
      fs.mkdirSync(target, { recursive: true });
      fs.writeFileSync(path.join(target, 'partial.txt'), 'incomplete preferred root\n');

      const output = materializeArtifactProjection(request).pack_artifact_projection_materialization;
      assert.equal(output.status, 'materialized');
      assert.equal(output.writes_performed, true);
      assert.equal(fs.existsSync(path.join(target, 'partial.txt')), false);
      assert.equal(fs.existsSync(path.join(target, 'STATUS.json')), true);
      assert.equal(fs.existsSync(path.join(target, 'audit', 'submission_manifest.json')), true);
      assert.equal(output.receipt.source.tree_sha256, request.expected_tree_sha256);
      assert.equal(output.receipt.target.tree_sha256, request.expected_tree_sha256);
      assert.equal(output.receipt.authority_boundary.can_write_domain_truth, false);
      assert.equal(output.receipt.domain_authorization.authorizes_quality_publication_or_submission, false);
      assert.equal(fs.existsSync(output.receipt_path), true);

      const repeated = materializeArtifactProjection(request).pack_artifact_projection_materialization;
      assert.equal(repeated.status, 'already_materialized');
      assert.equal(repeated.writes_performed, false);
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('pack artifact projection rejects missing completion markers without touching canonical target', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-artifact-projection-markers-'));
  try {
    withStateRoot(root, () => {
      const request = requestFixture(root);
      const target = path.join(request.workspace_root, request.target_relative_path);
      fs.mkdirSync(target, { recursive: true });
      fs.writeFileSync(path.join(target, 'previous.txt'), 'previous canonical tree\n');
      request.expected_files = request.expected_files.filter((entry) => entry.path !== 'STATUS.json');
      request.expected_tree_sha256 = artifactProjectionTreeSha256(request.expected_files);

      assert.throws(() => materializeArtifactProjection(request), /Completion markers/);
      assert.equal(fs.readFileSync(path.join(target, 'previous.txt'), 'utf8'), 'previous canonical tree\n');
      assert.equal(fs.existsSync(path.join(target, 'STATUS.json')), false);
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('pack artifact projection restores the previous root when the canonical switch fails', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-artifact-projection-rollback-'));
  try {
    withStateRoot(root, () => {
      const request = requestFixture(root);
      const target = path.join(request.workspace_root, request.target_relative_path);
      fs.mkdirSync(target, { recursive: true });
      fs.writeFileSync(path.join(target, 'previous.txt'), 'previous canonical tree\n');
      let renameCount = 0;
      const rename = ((source: fs.PathLike, destination: fs.PathLike) => {
        renameCount += 1;
        if (renameCount === 2) {
          const error = new Error('injected canonical switch failure') as NodeJS.ErrnoException;
          error.code = 'EIO';
          throw error;
        }
        return fs.renameSync(source, destination);
      }) as typeof fs.renameSync;

      assert.throws(
        () => materializeArtifactProjection(request, { rename }),
        /injected canonical switch failure/,
      );
      assert.equal(fs.readFileSync(path.join(target, 'previous.txt'), 'utf8'), 'previous canonical tree\n');
      const parent = path.dirname(target);
      const baseName = path.basename(target);
      assert.equal(fs.existsSync(path.join(parent, `.${baseName}.opl-artifact-projection.staging`)), false);
      assert.equal(fs.existsSync(path.join(parent, `.${baseName}.opl-artifact-projection.backup`)), false);
      assert.equal(fs.existsSync(path.join(parent, `.${baseName}.opl-artifact-projection.lock`)), false);
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('pack artifact projection recovers a dead-owner transaction before installing the new tree', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-artifact-projection-recovery-'));
  try {
    withStateRoot(root, () => {
      const request = requestFixture(root);
      const target = path.join(request.workspace_root, request.target_relative_path);
      const parent = path.dirname(target);
      const baseName = path.basename(target);
      fs.mkdirSync(parent, { recursive: true });
      const backup = path.join(parent, `.${baseName}.opl-artifact-projection.backup`);
      const staging = path.join(parent, `.${baseName}.opl-artifact-projection.staging`);
      const lock = path.join(parent, `.${baseName}.opl-artifact-projection.lock`);
      fs.mkdirSync(backup);
      fs.writeFileSync(path.join(backup, 'previous.txt'), 'recoverable previous tree\n');
      fs.mkdirSync(staging);
      fs.writeFileSync(path.join(staging, 'partial.txt'), 'abandoned staging\n');
      fs.writeFileSync(lock, JSON.stringify({ pid: 99999999 }));

      const output = materializeArtifactProjection(request).pack_artifact_projection_materialization;
      assert.equal(output.status, 'materialized');
      assert.equal(output.receipt.transaction.recovery_action, 'restored_previous_target');
      assert.equal(fs.existsSync(path.join(target, 'STATUS.json')), true);
      assert.equal(fs.existsSync(backup), false);
      assert.equal(fs.existsSync(staging), false);
      assert.equal(fs.existsSync(lock), false);
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('pack artifact projection rejects source symlinks and target escapes', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-artifact-projection-paths-'));
  try {
    withStateRoot(root, () => {
      const request = requestFixture(root);
      const outside = path.join(root, 'outside.txt');
      fs.writeFileSync(outside, 'outside\n');
      const paper = path.join(request.source_root, 'paper.pdf');
      fs.rmSync(paper);
      fs.symlinkSync(outside, paper);
      assert.throws(() => materializeArtifactProjection(request), /symbolic links/);

      const clean = requestFixture(path.join(root, 'clean'));
      clean.target_relative_path = '../outside';
      assert.throws(() => materializeArtifactProjection(clean), /JSON Schema validation|contained relative path/);
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('pack artifact projection CLI is registry-backed and dry-run performs no writes', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-artifact-projection-cli-'));
  try {
    withStateRoot(root, () => {
      const request = requestFixture(root);
      const requestPath = path.join(root, 'request.json');
      fs.writeFileSync(requestPath, `${JSON.stringify(request, null, 2)}\n`);
      const output = runCli([
        'pack',
        'materialize-artifact-projection',
        '--request',
        requestPath,
        '--dry-run',
      ]).pack_artifact_projection_materialization;
      assert.equal(output.status, 'dry_run');
      assert.equal(output.writes_performed, false);
      assert.equal(fs.existsSync(path.join(request.workspace_root, request.target_relative_path)), false);
      assert.equal(fs.existsSync(output.receipt_path), false);

      const invalid = runCliFailure([
        'pack',
        'materialize-artifact-projection',
        '--request',
        path.join(root, 'missing.json'),
      ]);
      assert.equal(invalid.payload.error.code, 'contract_json_invalid');
      const help = runCli(['help', 'pack', 'materialize-artifact-projection']).help;
      assert.equal(help.registry.command_id, 'pack materialize-artifact-projection');
      assert.equal(help.registry.authority_boundary.can_write_domain_truth, false);
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
