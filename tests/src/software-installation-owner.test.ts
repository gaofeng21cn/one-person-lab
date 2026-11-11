import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readSoftwareInstallationOwner, executeSoftwareInstallationOwner } from '../../src/adapters/integration/agent-package-registry-parts/software-installation-owner.ts';
import type { InstalledPackageDescriptor } from '../../src/adapters/integration/agent-package-registry-parts/installed-codex-plugin-directory-types.ts';

test('native installation lifecycle binds the owner, instance and revision and preserves development source', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-installation-'));
  try {
    const script = `import fs from 'node:fs';
const request=JSON.parse(fs.readFileSync(0,'utf8'));
const row={installation_id:'installed:one',version:'1.0.0',location:${JSON.stringify(root)},mode:'development',active:true,revision:'a'.repeat(64),supported_actions:['inspect','activate','update','uninstall','unlink']};
if(request.operation!=='inspect')fs.writeFileSync(${JSON.stringify(path.join(root, 'operation.json'))},JSON.stringify(request));
console.log(JSON.stringify({package_id:'fixture-app',active_installation_status:'active',installations:[row]}));`;
    fs.writeFileSync(path.join(root, 'installer.mjs'), script);
    const descriptor = { sourcePath: root, manifest: { package_id: 'fixture-app', content_lock_paths: ['installer.mjs'],
      entrypoints: [{ kind: 'opl_software_installation_cli', protocol: 'opl_software_installation.v1', runtime: 'node', source_ref: 'installer.mjs', release_target: { version: '1.1.0' } }] } } as unknown as InstalledPackageDescriptor;
    const before = readSoftwareInstallationOwner(descriptor)!;
    assert.equal(before.active_installation_id, 'installed:one');
    assert.equal(before.installations[0].location, root);
    const actions = before.installations[0].available_actions;
    assert.deepEqual(actions.map(action => action.semantic), ['unlink']);
    const payload = actions[0].payload as Record<string, unknown>;
    assert.throws(() => executeSoftwareInstallationOwner(descriptor, { ...payload, expected_revision: 'stale' }), /Refresh this installation/);
    assert.throws(() => executeSoftwareInstallationOwner(descriptor, { ...payload, installation_id: 'other' }), /Refresh this installation/);
    assert.throws(() => executeSoftwareInstallationOwner(descriptor, { ...payload, operation: 'uninstall' }), /Refresh this installation/);
    assert.equal(fs.existsSync(path.join(root, 'operation.json')), false);
    executeSoftwareInstallationOwner(descriptor, payload);
    assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'operation.json'), 'utf8')).operation, 'unlink');
    assert.equal(fs.existsSync(path.join(root, 'installer.mjs')), true);
    descriptor.manifest.content_lock_paths = [];
    assert.equal(readSoftwareInstallationOwner(descriptor)!.management_reason, 'installation_helper_update_required');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('first installation binds the published target and fresh local inventory without pretending an instance exists', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-installation-first-'));
  try {
    const receipt = path.join(root, 'installed.json');
    fs.writeFileSync(path.join(root, 'installer.mjs'), `import fs from 'node:fs';
const request=JSON.parse(fs.readFileSync(0,'utf8'));
const file=${JSON.stringify(receipt)};
if(request.operation==='install') {
  if('installation_id' in request || 'expected_revision' in request || fs.existsSync(file)) throw Error('unexpected overwrite');
  fs.writeFileSync(file,JSON.stringify({installation_id:'release:one',version:request.version,location:${JSON.stringify(root)},mode:'release',active:true,revision:'installed',supported_actions:['activate','uninstall']}));
}
console.log(JSON.stringify({package_id:'fixture-app',active_installation_status:'active',installations:fs.existsSync(file)?[JSON.parse(fs.readFileSync(file,'utf8'))]:[]}));`);
    const descriptor = { sourcePath: root, manifest: { package_id: 'fixture-app', content_lock_paths: ['installer.mjs'],
      entrypoints: [{ kind: 'opl_software_installation_cli', protocol: 'opl_software_installation.v1', runtime: 'node', source_ref: 'installer.mjs',
        operations: ['inspect', 'install'], release_target: { version: '1.1.0' } }] } } as unknown as InstalledPackageDescriptor;
    const before = readSoftwareInstallationOwner(descriptor)!;
    assert.equal(before.installations.length, 0);
    const payload = before.installation_actions[0].payload as Record<string, unknown>;
    assert.equal(payload.installation_id, undefined);
    assert.throws(() => executeSoftwareInstallationOwner(descriptor, { ...payload, version: '99.0.0' }), /Refresh/);
    assert.throws(() => executeSoftwareInstallationOwner(descriptor, { ...payload, expected_revision: 'stale' }), /Refresh/);
    assert.equal(fs.existsSync(receipt), false);
    const result = executeSoftwareInstallationOwner(descriptor, payload);
    assert.equal((result.installations as any[])[0].version, '1.1.0');
    assert.equal(readSoftwareInstallationOwner(descriptor)!.installation_actions.length, 0);
    assert.throws(() => executeSoftwareInstallationOwner(descriptor, payload), /Refresh/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
