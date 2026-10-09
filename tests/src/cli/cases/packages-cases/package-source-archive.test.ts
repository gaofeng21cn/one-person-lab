import { assert, fs, os, path, test } from './helpers.ts';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  packageSourceArchiveMembersStayWithinRoot,
  readPackageSourceArchiveEntries,
  extractPackageSourceArchive,
} from '../../../../../src/adapters/integration/agent-package-registry-parts/package-source-archive.ts';

function buildArchive(root: string, entries: Record<string, 'file' | 'directory' | 'symlink'>, archivePath: string) {
  const sourceDir = fs.mkdtempSync(path.join(root, 'source-'));
  for (const [rel, kind] of Object.entries(entries)) {
    const target = path.join(sourceDir, 'med-autocast', rel);
    if (kind === 'directory') {
      fs.mkdirSync(target, { recursive: true });
      continue;
    }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    if (kind === 'symlink') {
      fs.symlinkSync('/etc/passwd', target);
    } else {
      fs.writeFileSync(target, 'x', 'utf8');
    }
  }
  const archived = spawnSync('tar', ['-czf', archivePath, '-C', sourceDir, 'med-autocast'], {
    encoding: 'utf8',
    // Keep the fixture deterministic across hosts: macOS tar otherwise injects
    // AppleDouble `._` members that a Linux-built package never contains.
    env: { ...process.env, COPYFILE_DISABLE: '1' },
  });
  assert.equal(archived.status, 0, archived.stderr);
  return sourceDir;
}

test('package source archive reader is locale-independent for non-ASCII member names', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-package-source-archive-'));
  try {
    const archivePath = path.join(root, 'source.tar.gz');
    buildArchive(root, {
      'docs/方法适配.md': 'file',
      'skills/med-autocast/SKILL.md': 'file',
    }, archivePath);
    // A C locale is the effective default for a Finder-launched App; the reader
    // must decode UTF-8 member names from the tar headers directly instead of
    // relying on the locale-dependent `tar -t` text output.
    const entries = readPackageSourceArchiveEntries(archivePath, 'med-autocast');
    assert.equal(entries.filter((entry) => entry.kind === 'file').length, 2);
    assert.equal(entries.some((entry) => entry.path.includes('方法适配.md')), true);
    assert.equal(entries.some((entry) => entry.path.includes('\\')), false);
    assert.equal(packageSourceArchiveMembersStayWithinRoot(entries, 'med-autocast'), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('archive validation uses the effective PAX path rather than the harmless ustar name', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-package-source-pax-'));
  try {
    const archivePath = path.join(root, 'source.tar.gz');
    // Python's independent standard archive writer emits a PAX path override
    // with a safe physical header name. System tar honors that override too.
    execFileSync('python3', ['-c',
      'import io,sys,tarfile\nwith tarfile.open(sys.argv[1],"w:gz",format=tarfile.PAX_FORMAT) as t:\n i=tarfile.TarInfo("med-autocast/safe.txt");i.size=1;i.pax_headers={"path":"../escape.txt"};t.addfile(i,io.BytesIO(b"x"))', archivePath]);
    const entries = readPackageSourceArchiveEntries(archivePath, 'med-autocast');
    assert.equal(entries[0].path, '../escape.txt');
    assert.equal(packageSourceArchiveMembersStayWithinRoot(entries, 'med-autocast'), false);
    assert.equal(fs.existsSync(path.join(root, '..', 'escape.txt')), false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('long non-ASCII PAX paths validate and extract with the same structured reader', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-package-source-long-'));
  try {
    const archivePath = path.join(root, 'source.tar.gz');
    const name = `docs/${'方法'.repeat(50)}.md`;
    buildArchive(root, { [name]: 'file' }, archivePath);
    const entries = readPackageSourceArchiveEntries(archivePath, 'med-autocast');
    assert.equal(entries.some((entry) => entry.path === `med-autocast/${name}`), true);
    assert.equal(packageSourceArchiveMembersStayWithinRoot(entries, 'med-autocast'), true);
    extractPackageSourceArchive(archivePath, root);
    assert.equal(fs.readFileSync(path.join(root, 'med-autocast', name), 'utf8'), 'x');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('package source archive reader rejects non-physical member types', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-package-source-archive-symlink-'));
  try {
    const archivePath = path.join(root, 'source.tar.gz');
    buildArchive(root, {
      'skills/SKILL.md': 'file',
      'skills/link': 'symlink',
    }, archivePath);
    assert.throws(
      () => readPackageSourceArchiveEntries(archivePath, 'med-autocast'),
      /non-physical member type/,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('package source archive reader keeps members inside the declared root', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-package-source-archive-escape-'));
  try {
    const archivePath = path.join(root, 'source.tar.gz');
    buildArchive(root, { 'skills/SKILL.md': 'file' }, archivePath);
    const good = readPackageSourceArchiveEntries(archivePath, 'med-autocast');
    assert.equal(packageSourceArchiveMembersStayWithinRoot(good, 'med-autocast'), true);
    assert.equal(packageSourceArchiveMembersStayWithinRoot(good, 'med-autoscience'), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
