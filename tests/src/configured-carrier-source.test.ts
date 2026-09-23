import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { installPayloadMarketplace } from '../../src/adapters/integration/agent-package-registry-parts/configured-codex-plugin-carrier-payload.ts';
import { hostedRuntimeReadiness } from '../../src/adapters/integration/agent-package-registry-parts/registry-status-projection.ts';
import { gitMarketplaceRuntimeRoot } from '../../src/kernel/git-marketplace-runtime-root.ts';

const hash = (bytes: Buffer) => `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
const json = (value: unknown) => Buffer.from(`${JSON.stringify(value)}\n`);

function fixture(fault?: 'digest' | 'identity' | 'symlink' | 'nested-owner' | 'nested-identity' | 'escaping-root' | 'root-identity' | 'unicode-path') {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'opl-source-acquisition-')));
  const source = path.join(root, 'archive/fixture');
  const packages = path.join(root, 'packages');
  const bin = path.join(root, 'bin');
  for (const dir of [source, packages, bin]) fs.mkdirSync(dir, { recursive: true });
  const commit = '1'.repeat(40);
  const artifact = 'ghcr.io/owner/one-person-lab-packages/fixture:1.0.0';
  const owner = {
    surface_kind: 'opl_agent_package_manifest.v1', package_id: 'fixture', version: '1.0.0',
    source_repo: 'https://github.com/owner/fixture.git',
    codex_surface: { plugin_id: 'fixture', carrier_source_commit: commit,
      plugin_payload_manifest_url: 'payload.json', configured_codex_plugin_carrier: {
        marketplace_source: 'owner/fixture', publication_ref: artifact.replace(':1.0.0', ':latest-stable'),
      } },
  };
  const write = (ref: string, bytes: Buffer) => {
    const file = path.join(source, ref); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, bytes);
  };
  write('opl-package.json', json(owner));
  write('contracts/domain_descriptor.json', json({ domain_id: 'fixture' }));
  write('contracts/action_catalog.json', json({ actions: [] }));
  write('agent/stages/manifest.json', json({ stages: [] }));
  const files = new Map([
    ['plugin.json', json({ $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json', name: 'fixture', version: '1.0.0', skills: './skills/' })],
    ['opl-package.json', json(owner)],
    ['skills/fixture/SKILL.md', Buffer.from('# Fixture\n')],
  ]);
  if (fault === 'unicode-path') files.set('skills/fixture/docs/\u533b\u5b66.md', Buffer.from('# Medical\n'));
  const lock = crypto.createHash('sha256');
  for (const [ref, bytes] of files) {
    write(`plugins/fixture/${ref}`, bytes);
    for (const part of [Buffer.from(ref), bytes]) {
      const size = Buffer.alloc(8); size.writeBigUInt64BE(BigInt(part.length)); lock.update(size); lock.update(part);
    }
  }
  const payload = { package_id: 'fixture', plugin_id: 'fixture', package_version: '1.0.0',
    source_commit: commit, source_repo: owner.source_repo, source_root: 'plugins/fixture',
    content_lock: { digest: `sha256:${lock.digest('hex')}` },
    files: [...files].map(([ref, bytes]) => ({ path: ref, mode: '100644', sha256: hash(bytes),
      source_url: `https://raw.githubusercontent.com/owner/fixture/${commit}/plugins/fixture/${ref.split('/').map(encodeURIComponent).join('/')}` })),
  };
  if (fault === 'nested-owner' || fault === 'nested-identity' || fault === 'escaping-root') {
    fs.unlinkSync(path.join(source, 'opl-package.json'));
  }
  if (fault === 'nested-identity') write('plugins/fixture/opl-package.json', json({ ...owner, package_id: 'foreign' }));
  if (fault === 'root-identity') write('opl-package.json', json({ ...owner, package_id: 'foreign' }));
  if (fault === 'escaping-root') payload.source_root = '../outside';
  fs.writeFileSync(path.join(packages, 'fixture.json'), json(owner));
  fs.writeFileSync(path.join(packages, 'payload.json'), json(payload));
  if (fault === 'symlink') fs.symlinkSync('/tmp', path.join(source, 'escape'));
  const archive = path.join(root, 'source.tar.gz');
  execFileSync('tar', ['-czf', archive, '-C', path.dirname(source), 'fixture']);
  const blobs = new Map<string, Buffer>();
  const layer = (kind: string, bytes: Buffer) => {
    const digest = hash(bytes); blobs.set(digest, bytes);
    return { mediaType: `application/vnd.onepersonlab.package.${kind}`, digest, size: bytes.length };
  };
  const sourceLayer = layer('source.v1+gzip', fs.readFileSync(archive));
  const manifest = { layers: [sourceLayer,
    layer('manifest.v1+json', json(fault === 'identity' ? { ...owner, package_id: 'foreign' } : owner)),
    layer('payload.v1+json', json({ ...payload, package_source: { transport: 'same_oci_artifact_source_archive',
      artifact_ref: artifact, archive_root: 'fixture', archive_sha256: sourceLayer.digest } })),
  ] };
  if (fault === 'digest') blobs.set(sourceLayer.digest, Buffer.from('corrupt'));
  const responses = Object.fromEntries([...blobs].map(([digest, bytes]) => [digest, bytes.toString('base64')]));
  const script = `#!${process.execPath}\nconst args=process.argv.slice(2); const url=args.at(-1); const blobs=${JSON.stringify(responses)}; if(url.includes('/token?')) process.stdout.write(${JSON.stringify(JSON.stringify({token:'fixture-token'}))}); else if(url.includes('/manifests/')) process.stdout.write(${JSON.stringify(JSON.stringify(manifest))}); else {const b=blobs[url.split('/blobs/')[1]]; if(!b)process.exit(22); process.stdout.write(Buffer.from(b,'base64'));}\n`;
  fs.writeFileSync(path.join(bin, 'curl'), script, { mode: 0o755 });
  const state = path.join(root, 'state');
  const marketplace = path.join(state, 'codex-plugin-marketplaces/fixture');
  const install = () => installPayloadMarketplace({ packageId: 'fixture', pluginId: 'fixture@fixture',
    packageDirectory: packages, env: { ...process.env, OPL_STATE_DIR: state, PATH: `${bin}:${process.env.PATH}` } });
  return { root, source, marketplace, install };
}

test('native marketplace install preserves verified Standard Agent runtime after source acquisition cleanup', () => {
  const f = fixture();
  try {
    assert.equal(f.install(), f.marketplace);
    const plugin = path.join(f.marketplace, 'plugins/fixture');
    assert.equal(gitMarketplaceRuntimeRoot(plugin, 'owner/fixture', 'contracts/domain_descriptor.json'), f.marketplace);
    assert.equal(fs.existsSync(path.join(plugin, 'contracts')), false);
    for (const ref of ['contracts/domain_descriptor.json', 'contracts/action_catalog.json', 'agent/stages/manifest.json']) {
      assert.deepEqual(fs.readFileSync(path.join(f.marketplace, ref)), fs.readFileSync(path.join(f.source, ref)));
    }
    const marker = JSON.parse(fs.readFileSync(path.join(f.marketplace, '.codex-marketplace-install.json'), 'utf8'));
    assert.match(marker.artifact_ref, /@sha256:[a-f0-9]{64}$/);
    assert.match(marker.archive_sha256, /^sha256:[a-f0-9]{64}$/);
    const descriptor = { sourcePath: plugin, marketplaceSource: f.marketplace, carrier: { carrier: { marketplaceSource: 'owner/fixture' } },
      manifest: { package_id: 'fixture', package_role: 'standard_agent', entrypoints: [{ entrypoint_kind: 'opl_hosted_action_catalog', source_ref: 'contracts/action_catalog.json' }] } } as any;
    assert.equal(hostedRuntimeReadiness(descriptor).ready, true);
    fs.writeFileSync(path.join(f.marketplace, '.codex-marketplace-install.json'), json({ ...marker, source: 'other/foreign' }));
    assert.equal(hostedRuntimeReadiness(descriptor).ready, false);
    fs.writeFileSync(path.join(f.marketplace, '.codex-marketplace-install.json'), json(marker));
    fs.unlinkSync(path.join(f.marketplace, 'contracts/domain_descriptor.json'));
    assert.equal(hostedRuntimeReadiness(descriptor).reason, 'hosted_agent_source_unavailable');
    f.install();
    assert.equal(hostedRuntimeReadiness(descriptor).ready, true);
  } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
});

test('source acquisition accepts an owner descriptor in the bound plugin source directory', () => {
  const f = fixture('nested-owner');
  try {
    assert.equal(f.install(), f.marketplace);
    assert.equal(fs.existsSync(path.join(f.marketplace, 'opl-package.json')), false);
    assert.equal(gitMarketplaceRuntimeRoot(path.join(f.marketplace, 'plugins/fixture'),
      'owner/fixture', 'contracts/domain_descriptor.json'), f.marketplace);
  } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
});

test('source acquisition resolves percent-encoded carrier paths within the archive', () => {
  const f = fixture('unicode-path');
  try {
    assert.equal(f.install(), f.marketplace);
    assert.equal(fs.readFileSync(path.join(f.marketplace, 'plugins/fixture/skills/fixture/docs/\u533b\u5b66.md'), 'utf8'), '# Medical\n');
  } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
});

for (const fault of ['digest', 'identity', 'symlink', 'nested-identity', 'escaping-root', 'root-identity'] as const) {
  test(`source acquisition rejects ${fault} without replacing an installed marketplace`, () => {
    const f = fixture(fault);
    try {
      fs.mkdirSync(f.marketplace, { recursive: true });
      fs.writeFileSync(path.join(f.marketplace, 'previous'), 'keep');
      assert.throws(f.install);
      assert.equal(fs.readFileSync(path.join(f.marketplace, 'previous'), 'utf8'), 'keep');
      assert.deepEqual(fs.readdirSync(path.dirname(f.marketplace)), ['fixture']);
    } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
  });
}


test('hosted readiness preserves explicit developer and Full runtime sources', () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'opl-hosted-selected-')));
  const keys = ['OPL_STATE_DIR', 'OPL_MODULE_PATH_REDCUBE', 'OPL_FULL_RUNTIME_HOME'];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  try {
    process.env.OPL_STATE_DIR = path.join(root, 'state');
    process.env.OPL_MODULE_PATH_REDCUBE = root;
    delete process.env.OPL_FULL_RUNTIME_HOME;
    fs.mkdirSync(path.join(root, 'contracts'));
    fs.writeFileSync(path.join(root, 'contracts/domain_descriptor.json'), '{}');
    fs.writeFileSync(path.join(root, 'contracts/action_catalog.json'), '{}');
    const descriptor = { sourcePath: path.join(root, 'minimal-carrier'), marketplaceSource: null,
      carrier: { carrier: { marketplaceSource: 'gaofeng21cn/redcube-ai' } },
      manifest: { package_id: 'rca', package_role: 'standard_agent',
        entrypoints: [{ entrypoint_kind: 'opl_hosted_action_catalog', source_ref: 'contracts/action_catalog.json' }] } } as any;
    assert.equal(hostedRuntimeReadiness(descriptor).source_root, root);
    process.env.OPL_FULL_RUNTIME_HOME = root;
    fs.writeFileSync(path.join(root, 'opl-runtime-module.json'), JSON.stringify({
      module_id: 'redcube', repo_name: 'redcube-ai', packaged_runtime: true, source_git: {},
    }));
    assert.equal(hostedRuntimeReadiness(descriptor).source_root, root);
    fs.unlinkSync(path.join(root, 'contracts/action_catalog.json'));
    assert.equal(hostedRuntimeReadiness(descriptor).ready, false);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    fs.rmSync(root, { recursive: true, force: true });
  }
});
