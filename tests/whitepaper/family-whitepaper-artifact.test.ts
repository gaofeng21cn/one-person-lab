import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const stager = path.join(repoRoot, 'scripts', 'stage-family-whitepaper-artifact.ts');

test('family artifact stager preserves document names and one catalog', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-whitepaper-artifact-'));
  const source = path.join(root, 'source');
  const whitepapers = path.join(source, 'docs', 'site', 'latest', 'whitepapers');
  const rendered = path.join(source, 'tmp', 'pdfs', 'opl-whitepaper', 'rendered');
  fs.mkdirSync(whitepapers, { recursive: true });
  fs.mkdirSync(rendered, { recursive: true });
  fs.writeFileSync(path.join(whitepapers, 'opl-whitepaper.html'), '<html>family</html>');
  fs.writeFileSync(path.join(whitepapers, 'opl-whitepaper.pdf'), 'pdf');
  fs.writeFileSync(path.join(whitepapers, 'opl-whitepaper.verification.json'), '{}');
  fs.writeFileSync(path.join(whitepapers, 'index.html'), '<html>catalog</html>');
  fs.writeFileSync(path.join(rendered, 'page-1.png'), 'png');
  const manifest = path.join(root, 'manifest.json');
  fs.writeFileSync(manifest, JSON.stringify({
    schema_version: 'opl_family_whitepaper_build.v1',
    mode: 'preview',
    generated_at: '2026-08-15T00:00:00.000Z',
    renderer_commit: 'renderer-sha',
    builds: [{
      id: 'opl-family',
      repo_slug: 'gaofeng21cn/one-person-lab',
      repo_root: source,
      git_commit: 'source-sha',
      verification: {
        generated_html: 'docs/site/latest/whitepapers/opl-whitepaper.html',
        generated_pdf: 'docs/site/latest/whitepapers/opl-whitepaper.pdf',
        rendered_dir: 'tmp/pdfs/opl-whitepaper/rendered',
      },
    }],
  }));
  const output = path.join(root, 'artifact');
  const result = spawnSync(process.execPath, ['--experimental-strip-types', stager, '--manifest', manifest, '--output', output], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.readFileSync(path.join(output, 'whitepapers', 'opl-whitepaper.html'), 'utf8'), '<html>family</html>');
  assert.equal(fs.readFileSync(path.join(output, 'whitepapers', 'index.html'), 'utf8'), '<html>catalog</html>');
  assert.ok(fs.existsSync(path.join(output, 'whitepapers', 'opl-family-whitepaper-build.json')));
  const publicManifest = JSON.parse(fs.readFileSync(path.join(output, 'whitepapers', 'opl-family-whitepaper-build.json'), 'utf8'));
  assert.equal(publicManifest.builds[0].git_commit, 'source-sha');
  assert.equal('repo_root' in publicManifest.builds[0], false);
  assert.ok(fs.existsSync(path.join(output, 'evidence', 'opl-family', 'rendered-pages', 'page-1.png')));
});
