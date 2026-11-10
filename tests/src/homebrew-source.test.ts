import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { FrameworkContractError } from '../../src/kernel/contract-validation.ts';
import { executeHomebrewSourceAction, OPL_HOMEBREW_SOURCE_ID, readHomebrewSourceProjection, refreshHomebrewSource, type HomebrewRunner } from '../../src/adapters/integration/homebrew-source.ts';
import { executeOplSoftwareSourceAction, listOplSoftwareSources, softwareSourceActionCatalog } from '../../src/adapters/integration/software-sources.ts';
import { readFrameworkSoftwareInstallation } from '../../src/adapters/integration/software-sources-framework-installation.ts';

const tap = 'gaofeng21cn/one-person-lab';
function fixture() {
  const state = { connected: true, installed: null as string | null, available: '2.0', outdated: false, disabled: false, failure: false, readbackFailure: false };
  const commands: string[][] = [];
  const formula = { name: 'opl', full_name: `${tap}/opl`, tap, desc: 'CLI', versions: { stable: '0.3.11' }, installed: [], outdated: false };
  const run: HomebrewRunner = async (args, options) => {
    commands.push(args);
    assert.equal(options.env.HOMEBREW_NO_AUTO_UPDATE, '1');
    assert.equal(options.env.HOMEBREW_NO_INSTALL_CLEANUP, '1');
    assert.equal(options.env.HOMEBREW_NO_AUTOREMOVE, '1');
    assert.equal(args.some(arg => ['--zap', '--force', '--ignore-dependencies'].includes(arg)), false);
    if (args[0] === 'tap-info') return { status: 0, stdout: JSON.stringify([{ name: tap, installed: state.connected, formula_names: state.connected ? [`${tap}/opl`] : [], cask_tokens: state.connected ? [`${tap}/example-app`] : [] }]) };
    if (args[0] === 'info') return state.readbackFailure ? { status: 1, stdout: '' } : { status: 0, stdout: JSON.stringify({ formulae: [formula], casks: [{ full_token: `${tap}/example-app`, tap, name: ['Example'], desc: 'Native App', version: state.available, installed: state.installed, outdated: state.outdated, disabled: state.disabled }] }) };
    if (state.failure) return { status: 1, stdout: 'private-native-diagnostic-must-not-leak' };
    if (args[0] === 'tap') state.connected = true;
    if (['install', 'upgrade'].includes(args[0])) { state.installed = state.available; state.outdated = false; }
    if (args[0] === 'uninstall') state.installed = null;
    return { status: 0, stdout: '' };
  };
  return { state, commands, run };
}
async function withState(run: (env: NodeJS.ProcessEnv) => Promise<void>) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-homebrew-'));
  const previous = process.env.OPL_STATE_DIR;
  process.env.OPL_STATE_DIR = directory;
  try { await run({ ...process.env, OPL_STATE_DIR: directory }); } finally {
    if (previous === undefined) delete process.env.OPL_STATE_DIR; else process.env.OPL_STATE_DIR = previous;
    fs.rmSync(directory, { recursive: true, force: true });
  }
}
function reason(code: string) { return (error: unknown) => error instanceof FrameworkContractError && error.details?.reason_code === code; }

test('fast sources read only native snapshots and never invent empty or latest remote state', async () => withState(async env => {
  assert.equal(readHomebrewSourceProjection(env).entry_count, null);
  assert.equal(readHomebrewSourceProjection(env).inventory_status, 'not_checked');
  assert.equal(readHomebrewSourceProjection(env).inventory_refresh_required, true);
  const native = fixture();
  const checked = await executeOplSoftwareSourceAction('source_check', { source_id: OPL_HOMEBREW_SOURCE_ID }, { env, homebrewRun: native.run });
  assert.ok('software_source' in checked);
  assert.equal(checked.software_source.entry_count, 2);
  const snapshot = listOplSoftwareSources().entries.find(source => source.source_id === OPL_HOMEBREW_SOURCE_ID)!;
  assert.equal(snapshot.version_basis, 'homebrew_local_recipes');
  assert.equal(snapshot.inventory_refresh_required, false);
  assert.equal(snapshot.native_items?.[0].display_name, 'OPL Framework');
  assert.equal(snapshot.native_items?.[0].name, `${tap}/opl`);
  assert.equal(snapshot.native_items?.[0].item_id, `formula:${tap}/opl`);
  assert.ok(snapshot.native_items?.[0].description_i18n?.['zh-CN']);
  assert.equal(snapshot.native_items?.[1].display_name, 'Example');
  assert.equal(snapshot.native_items?.[1].installed, false);
  assert.equal(snapshot.catalog_origin, 'opl');
  assert.equal(snapshot.origin_basis, 'owner_projection');
  assert.deepEqual(snapshot.catalog_source, { manager: 'homebrew', marketplace_id: tap, delivery: 'marketplace' });
  // Even an unbranded item has OPL source provenance: tap membership owns this
  // classification, not its name or current installation status.
  assert.equal(snapshot.native_items?.[1].catalog_origin, 'opl');
  assert.equal(snapshot.native_items?.[1].origin_basis, 'owner_projection');
  assert.deepEqual(snapshot.native_items?.[1].catalog_source, snapshot.catalog_source);
  assert.deepEqual(native.commands.map(args => args[0]), ['tap-info', 'info']);
  assert.equal(snapshot.available_actions.some(action => action.action_id === 'source_install'), false);
  const itemAction = snapshot.native_items?.[1].available_actions[0];
  assert.equal(itemAction?.action_id, 'source_install');
  assert.equal(itemAction?.confirmation_required, true);
  assert.equal(softwareSourceActionCatalog().some(action => action.action_id === itemAction?.action_id), true);
}));

test('native install update uninstall use exact owner identity and verify real state without data cleanup', async () => withState(async env => {
  const native = fixture();
  const deps = { env, run: native.run };
  let snapshot = await refreshHomebrewSource(deps);
  const install = await executeHomebrewSourceAction('source_install', snapshot.native_items[1].available_actions[0].default_payload, deps);
  assert.equal(install.native_action.status, 'completed');
  assert.equal(install.native_inventory.native_items[1].installed_version, '2.0');
  assert.deepEqual(native.commands.find(args => args[0] === 'install'), ['install', '--cask', `${tap}/example-app`]);
  native.state.available = '3.0'; native.state.outdated = true;
  snapshot = await refreshHomebrewSource(deps);
  const update = await executeHomebrewSourceAction('source_update', snapshot.native_items[1].available_actions.find(action => action.action_id === 'source_update')!.default_payload, deps);
  assert.equal(update.native_action.status, 'completed');
  assert.equal(update.native_inventory.native_items[1].installed_version, '3.0');
  const uninstall = await executeHomebrewSourceAction('source_uninstall', update.native_inventory.native_items[1].available_actions[0].default_payload, deps);
  assert.equal(uninstall.native_action.status, 'completed');
  assert.equal(uninstall.native_action.business_data_cleanup_requested, false);
  assert.equal(uninstall.native_inventory.native_items[1].installed, false);
  assert.deepEqual(native.commands.find(args => args[0] === 'uninstall'), ['uninstall', '--cask', `${tap}/example-app`]);
}));

test('stale recipes, foreign identities and unavailable actions cannot trigger native mutations', async () => withState(async env => {
  const native = fixture();
  const deps = { env, run: native.run };
  const snapshot = await refreshHomebrewSource(deps);
  const payload = snapshot.native_items[1].available_actions[0].default_payload;
  native.state.available = '3.0';
  await assert.rejects(executeHomebrewSourceAction('source_install', payload, deps), reason('homebrew_item_changed'));
  await assert.rejects(executeHomebrewSourceAction('source_install', { ...payload, item_id: 'cask:someone/else/app' }, deps), reason('homebrew_item_not_in_source'));
  await assert.rejects(executeHomebrewSourceAction('source_install', { ...payload, source_id: 'public-registry:opl' }, deps), reason('homebrew_source_mismatch'));
  native.state.available = '2.0';
  await assert.rejects(executeHomebrewSourceAction('source_update', payload, deps), reason('homebrew_action_unavailable'));
  assert.equal(native.commands.some(args => ['install', 'upgrade', 'uninstall'].includes(args[0])), false);
}));

test('missing native provider and malformed membership remain unknown without auto-tapping', async () => withState(async env => {
  const absent = await refreshHomebrewSource({ env, run: async () => ({ status: null, stdout: '' }) });
  assert.equal(absent.inventory_reason, 'homebrew_unavailable');
  assert.equal(absent.entry_count, null);
  const commands: string[][] = [];
  const invalid = await refreshHomebrewSource({ env, run: async args => {
    commands.push(args);
    return { status: 0, stdout: JSON.stringify([{ name: tap, installed: true, formula_names: ['other/tap/formula'], cask_tokens: [] }]) };
  } });
  assert.equal(invalid.inventory_reason, 'homebrew_tap_membership_invalid');
  assert.equal(commands.length, 1);
}));

test('setup only connects the fixed tap and refresh only updates recipes', async () => withState(async env => {
  const native = fixture(); native.state.connected = false;
  const deps = { env, run: native.run };
  const before = await refreshHomebrewSource(deps);
  assert.equal(before.entry_count, null);
  assert.equal(before.inventory_reason, 'homebrew_tap_not_connected');
  assert.equal(native.commands.some(args => args[0] === 'info'), false);
  const setup = await executeHomebrewSourceAction('source_setup', { source_id: OPL_HOMEBREW_SOURCE_ID }, deps);
  assert.equal(setup.native_action.status, 'completed');
  assert.deepEqual(native.commands.find(args => args[0] === 'tap'), ['tap', tap]);
  const refresh = await executeHomebrewSourceAction('source_refresh', { source_id: OPL_HOMEBREW_SOURCE_ID }, deps);
  assert.equal(refresh.native_action.status, 'completed');
  assert.deepEqual(native.commands.find(args => args[0] === 'update'), ['update']);
  assert.equal(native.state.installed, null);
}));

test('native failure never claims success or exposes native command output', async () => withState(async env => {
  const native = fixture();
  const deps = { env, run: native.run };
  const snapshot = await refreshHomebrewSource(deps);
  native.state.failure = true;
  const result = await executeHomebrewSourceAction('source_install', snapshot.native_items[1].available_actions[0].default_payload, deps);
  assert.equal(result.native_action.status, 'needs_attention');
  assert.equal(result.native_action.reason_code, 'homebrew_native_command_failed');
  assert.equal(result.native_inventory.native_items[1].installed, false);
  assert.equal(JSON.stringify(result).includes('private-native-diagnostic'), false);
  await assert.rejects(async () => executeOplSoftwareSourceAction('source_install', { ...snapshot.native_items[1].available_actions[0].default_payload, force: true }, { env, homebrewRun: native.run }), reason('software_source_payload_invalid'));
}));

test('successful native exit still requires installation readback and serializes concurrent actions', async () => withState(async env => {
  const native = fixture();
  const snapshot = await refreshHomebrewSource({ env, run: native.run });
  const payload = snapshot.native_items[1].available_actions[0].default_payload;
  let release: (() => void) | undefined;
  const run: HomebrewRunner = async (args, options) => {
    if (args[0] === 'install') {
      await new Promise<void>(resolve => { release = resolve; });
      return { status: 0, stdout: '' }; // A native exit is not an installation receipt.
    }
    return native.run(args, options);
  };
  const pending = executeHomebrewSourceAction('source_install', payload, { env, run });
  while (!release) await new Promise(resolve => setTimeout(resolve, 1));
  await assert.rejects(executeHomebrewSourceAction('source_install', payload, { env, run }), reason('homebrew_action_busy'));
  release();
  const result = await pending;
  assert.equal(result.native_action.status, 'needs_attention');
  assert.equal(result.native_action.reason_code, 'homebrew_native_readback_unverified');
}));

test('App bundle versions are local installation truth while Homebrew receipts retain lifecycle ownership', async () => withState(async env => {
  const native = fixture();
  const run: HomebrewRunner = async (args, options) => {
    const result = await native.run(args, options);
    if (args[0] !== 'info') return result;
    const value = JSON.parse(result.stdout);
    Object.assign(value.casks[0], { homepage: 'https://github.com/gaofeng21cn/one-person-lab-app', bundle_short_version: '4.0' });
    return { ...result, stdout: JSON.stringify(value) };
  };
  const deps = { env, run };
  let snapshot = await refreshHomebrewSource(deps);
  const external = snapshot.native_items[1];
  assert.equal(external.product_id, 'github:gaofeng21cn/one-person-lab-app');
  assert.equal(external.installed, true);
  assert.equal(external.installed_version, '4.0');
  assert.equal(external.homebrew_installed, false);
  assert.equal(external.homebrew_installed_version, null);
  assert.equal(external.installation_owner, 'application');
  assert.equal(external.update_status, 'unknown');
  assert.deepEqual(external.available_actions, []);
  for (const actionId of ['source_install', 'source_update', 'source_uninstall'] as const) {
    await assert.rejects(executeHomebrewSourceAction(actionId, {
      source_id: OPL_HOMEBREW_SOURCE_ID, item_id: external.item_id, expected_revision: external.revision,
    }, deps), reason('homebrew_action_unavailable'));
  }
  native.state.installed = '2.0'; native.state.available = '3.0'; native.state.outdated = true;
  snapshot = await refreshHomebrewSource(deps);
  const selfUpdated = snapshot.native_items[1];
  assert.equal(selfUpdated.installed_version, '4.0');
  assert.equal(selfUpdated.homebrew_installed_version, '2.0');
  assert.equal(selfUpdated.update_status, 'unknown');
  assert.deepEqual(selfUpdated.available_actions.map(action => action.action_id), ['source_uninstall']);
  assert.equal(native.commands.some(args => ['install', 'upgrade', 'uninstall'].includes(args[0])), false);
}));

test('App display versions and development identity come from declared release and installed bundle metadata', async () => withState(async env => {
  const appPath = path.join(env.OPL_STATE_DIR!, 'One Person Lab.app');
  const infoPath = path.join(appPath, 'Contents', 'Info.plist');
  const manifestPath = path.join(appPath, 'Contents', 'Resources', 'opl-studio-full-runtime', 'manifest', 'full-package-manifest.json');
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  const info = { CFBundleIdentifier: 'cn.onepersonlab.opl', CFBundleShortVersionString: '26.11.1091',
    OPLBuildKind: 'local-development', OPLLocalBuildID: 'local.src123456789abc' };
  fs.writeFileSync(infoPath, JSON.stringify(info));
  fs.writeFileSync(manifestPath, JSON.stringify({ carrier: { bundle_id: 'cn.onepersonlab.opl' }, version: '26.11.10' }));
  const plutil = path.join(env.OPL_STATE_DIR!, 'plutil-fixture');
  fs.writeFileSync(plutil, '#!/bin/sh\nfor arg do last="$arg"; done\ncat "$last"\n', { mode: 0o755 });
  const native = fixture();
  native.state.available = '26.11.991,26.11.9';
  let releaseDisplay = '26.11.9';
  const run: HomebrewRunner = async (args, options) => {
    const result = await native.run(args, options);
    if (args[0] !== 'info') return result;
    const value = JSON.parse(result.stdout);
    Object.assign(value.casks[0], { homepage: 'https://github.com/gaofeng21cn/one-person-lab-app',
      bundle_short_version: '26.11.1091', url: `https://github.com/gaofeng21cn/one-person-lab-app/releases/download/v${releaseDisplay}/One-Person-Lab.dmg`,
      artifacts: [{ app: ['One Person Lab.app'], target: appPath }] });
    return { ...result, stdout: JSON.stringify(value) };
  };
  const deps = { env: { ...env, OPL_PLUTIL_BIN: plutil }, run };
  const item = (await refreshHomebrewSource(deps)).native_items[1];
  assert.equal(item.installed_version, '26.11.1091');
  assert.equal(item.available_version, '26.11.991,26.11.9');
  assert.equal(item.installed_display_version, '26.11.10');
  assert.equal(item.available_display_version, '26.11.9');
  assert.equal(item.installed_build_kind, 'local-development');
  assert.equal(item.installed_build_id, 'local.src123456789abc');
  assert.equal(item.update_status, 'unknown');
  assert.equal(item.owner_settings_route, 'updates');
  assert.deepEqual(item.available_actions, []);
  assert.equal(readHomebrewSourceProjection(deps.env).native_items[1].installed_display_version, '26.11.10');
  // An absent display artifact must not trigger arithmetic decoding of the updater version.
  fs.rmSync(manifestPath);
  const withoutManifest = (await refreshHomebrewSource(deps)).native_items[1];
  assert.equal(withoutManifest.installed_display_version, null);
  assert.equal(withoutManifest.installed_build_kind, 'local-development');
  // Nor may an unrelated bundle at the observed path label this installation as development.
  fs.writeFileSync(infoPath, JSON.stringify({ ...info, CFBundleIdentifier: 'unrelated.app' }));
  const unrelated = (await refreshHomebrewSource(deps)).native_items[1];
  assert.equal(unrelated.installed_build_kind, null);
  assert.equal(unrelated.installed_display_version, null);
  // A Standard bundle may use the published Cask's exact machine/display pair.
  fs.writeFileSync(infoPath, JSON.stringify({ CFBundleIdentifier: info.CFBundleIdentifier, CFBundleShortVersionString: info.CFBundleShortVersionString }));
  native.state.available = '26.11.1091,26.11.10';
  releaseDisplay = '26.11.10';
  const aligned = (await refreshHomebrewSource(deps)).native_items[1];
  assert.equal(aligned.installed_display_version, '26.11.10');
  assert.equal(aligned.available_display_version, '26.11.10');
  assert.equal(aligned.installed_version, '26.11.1091');
  assert.equal(aligned.installed_build_kind, null);
  assert.deepEqual(aligned.available_actions, []);
}));

test('Framework installation requires an installed CLI and owner receipt, not the executing checkout', async () => withState(async env => {
  const userHome = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-installed-home-'));
  const root = path.join(userHome, 'framework');
  const localEnv = { ...env, HOME: userHome, OPL_FRAMEWORK_PACKAGE_ROOT: root };
  try {
    fs.mkdirSync(path.join(root, 'bin'), { recursive: true });
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'opl-framework', version: '0.3.12' }));
    fs.writeFileSync(path.join(root, 'bin', 'opl'), '#!/bin/sh\n');
    fs.writeFileSync(path.join(root, '.opl-framework-installed-source-identity.json'), JSON.stringify({
      schema: 'opl_framework_installed_source_identity.v1', framework_sha: 'a'.repeat(40), install_mode: 'archive', identity_source: 'install_ref',
    }));
    assert.equal(readFrameworkSoftwareInstallation(localEnv), null);
    fs.mkdirSync(path.join(userHome, '.local', 'bin'), { recursive: true });
    fs.symlinkSync(path.join(root, 'bin', 'opl'), path.join(userHome, '.local', 'bin', 'opl'));
    const native = fixture();
    const deps = { env: localEnv, run: native.run };
    const snapshot = await refreshHomebrewSource(deps);
    const framework = snapshot.native_items[0];
    assert.equal(framework.installed, true);
    assert.equal(framework.installed_version, '0.3.12');
    assert.equal(framework.homebrew_installed, false);
    assert.equal(framework.homebrew_installed_version, null);
    assert.equal(framework.installation_owner, 'opl_framework');
    assert.equal(framework.installation_evidence, 'framework_install_receipt');
    assert.equal(framework.owner_settings_route, 'updates');
    assert.equal(framework.update_status, 'unknown');
    assert.deepEqual(framework.available_actions, []);
    await assert.rejects(executeHomebrewSourceAction('source_install', {
      source_id: OPL_HOMEBREW_SOURCE_ID, item_id: framework.item_id, expected_revision: framework.revision,
    }, deps), reason('homebrew_action_unavailable'));
    fs.rmSync(path.join(root, '.opl-framework-installed-source-identity.json'));
    fs.mkdirSync(path.join(root, '.git'));
    assert.equal(readFrameworkSoftwareInstallation(localEnv), null);
    assert.equal(readHomebrewSourceProjection(localEnv).native_items[0].installed, false);
  } finally { fs.rmSync(userHome, { recursive: true, force: true }); }
}));
