import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import brandProfile from '../../../contracts/opl-framework/brand-system-profile.json' with { type: 'json' };
import { isRecord } from '../../kernel/contract-validation.ts';
import { softwareSourceFailure, softwareSourcesFile } from './software-sources-store.ts';
import { readFrameworkSoftwareInstallation } from './software-sources-framework-installation.ts';
import { readHomebrewAppVersionPresentation } from './homebrew-app-version.ts';

export const OPL_HOMEBREW_SOURCE_ID = 'homebrew:gaofeng21cn-one-person-lab';
const TAP = 'gaofeng21cn/one-person-lab';
export type HomebrewActionId = 'source_setup' | 'source_refresh' | 'source_install' | 'source_update' | 'source_uninstall';
export const HOMEBREW_ACTION_IDS: readonly HomebrewActionId[] = ['source_setup', 'source_refresh', 'source_install', 'source_update', 'source_uninstall'];
export type HomebrewRunner = (args: string[], options: { env: NodeJS.ProcessEnv; timeoutMs: number }) => Promise<{ status: number | null; stdout: string }>;
export type HomebrewDependencies = { env?: NodeJS.ProcessEnv; now?: () => Date; run?: HomebrewRunner };
type NativeItem = {
  item_id: string; name: string; display_name: string; description: string | null; kind: 'formula' | 'cask';
  description_i18n?: Record<string, string>;
  installed: boolean; installed_version: string | null; available_version: string | null;
  update_status: 'available' | 'current' | 'not_installed' | 'unknown'; revision: string; disabled: boolean; pinned: boolean;
  product_id?: string;
  product_display_name?: string;
  homebrew_installed?: boolean;
  homebrew_installed_version?: string | null;
  installed_display_version?: string | null;
  available_display_version?: string | null;
  installed_build_kind?: 'local-development' | null;
  installed_build_id?: string | null;
  installation_owner?: 'homebrew' | 'opl_framework' | 'application' | null;
  installation_kind?: 'homebrew_formula' | 'homebrew_cask' | 'managed_runtime' | 'app_bundle' | null;
  installation_evidence?: string | null;
  installed_source_revision?: string | null;
  owner_settings_route?: 'updates' | null;
};
type Snapshot = {
  inventory_status: 'available' | 'not_checked' | 'unavailable'; inventory_reason: string | null;
  inventory_checked_at: string | null; native_items: NativeItem[];
};

export function homebrewActionCatalog() {
  return HOMEBREW_ACTION_IDS.map(actionId => {
    const operation = actionId.slice('source_'.length);
    const itemAction = ['install', 'update', 'uninstall'].includes(operation);
    return {
      action_id: actionId, label: ({ setup: 'Connect Homebrew source', refresh: 'Refresh Homebrew recipes', install: 'Install software', update: 'Update software', uninstall: 'Uninstall software' } as Record<string, string>)[operation],
      delegated_surface: `opl sources ${operation} --source-id <source_id>${itemAction ? ' --item-id <item_id> --expected-revision <revision>' : ''}`,
      payload_fields: itemAction ? ['source_id', 'item_id', 'expected_revision'] : ['source_id'],
      mutates: itemAction ? 'homebrew_native_installation' : 'homebrew_tap_recipes', dry_run_supported: false, confirmation_required: true,
      danger_level: 'medium' as const,
      impact: operation === 'uninstall' ? 'Use Homebrew uninstall without zap, force, dependency removal, or business data cleanup.'
        : operation === 'refresh' ? 'Run Homebrew update to refresh native recipes; installed software is not upgraded.'
          : operation === 'setup' ? 'Connect the fixed OPL tap through Homebrew and read its native software inventory.'
            : 'Use Homebrew to install or upgrade this exact software and its native dependencies, then verify installation.',
      follow_up_action_ids: ['source_list'], verify_action_id: 'source_list',
    };
  });
}
function cacheFile(env: NodeJS.ProcessEnv) { return path.join(path.dirname(softwareSourcesFile(env)), 'homebrew-source-readback.json'); }
function emptySnapshot(reason: string | null = null): Snapshot {
  return { inventory_status: reason ? 'unavailable' : 'not_checked', inventory_reason: reason, inventory_checked_at: null, native_items: [] };
}
function text(value: unknown): string | null { return typeof value === 'string' && value.trim() ? value : null; }
function fullName(value: unknown): value is string { return typeof value === 'string' && value.startsWith(`${TAP}/`) && /^[a-z0-9][a-z0-9+@._-]*$/.test(value.slice(TAP.length + 1)); }
function itemActions(item: NativeItem) {
  const brewInstalled = item.homebrew_installed ?? item.installed;
  const ids = brewInstalled ? ['source_uninstall', ...(item.update_status === 'available' && !item.disabled && !item.pinned ? ['source_update'] : [])]
    : item.installed || item.disabled ? [] : ['source_install'];
  return homebrewActionCatalog().filter(action => ids.includes(action.action_id)).map(action => ({
    ...action, default_payload: { source_id: OPL_HOMEBREW_SOURCE_ID, item_id: item.item_id, expected_revision: item.revision },
  }));
}
function projection(snapshot: Snapshot, env: NodeJS.ProcessEnv) {
  const frameworkInstallation = readFrameworkSoftwareInstallation(env);
  // Membership is verified against the configured OPL tap before caching.
  // These labels describe maintenance and transport, never action authority.
  const provenance = {
    catalog_origin: 'opl' as const,
    origin_basis: 'owner_projection' as const,
    catalog_source: { manager: 'homebrew', marketplace_id: TAP, delivery: 'marketplace' as const },
  };
  const checkedAt = snapshot.inventory_checked_at ? Date.parse(snapshot.inventory_checked_at) : Number.NaN;
  const refreshRequired = !Number.isFinite(checkedAt) || Date.now() - checkedAt >= 60_000
    || (snapshot.inventory_status === 'available' && snapshot.native_items.some(item => item.homebrew_installed === undefined));
  return { ...snapshot, ...provenance, version_basis: 'homebrew_local_recipes', installation_owner: 'homebrew',
    inventory_refresh_required: refreshRequired,
    entry_count: snapshot.inventory_status === 'available' ? snapshot.native_items.length : null,
    native_items: snapshot.native_items.map(raw => {
      const item = { ...raw, homebrew_installed: raw.homebrew_installed ?? raw.installed,
        homebrew_installed_version: raw.homebrew_installed === undefined ? raw.installed_version : raw.homebrew_installed_version ?? null };
      if (item.name === `${TAP}/opl` && !item.homebrew_installed && frameworkInstallation) {
        Object.assign(item, frameworkInstallation, { update_status: 'unknown' });
      }
      return { ...item, ...productPresentation(item), ...provenance, available_actions: itemActions(item) };
    }),
  };
}
function productPresentation(item: NativeItem) {
  const product = brandProfile.product_cognition_layers.find(layer => item.product_id === `github:gaofeng21cn/${layer.owner}`
    || ('native_carriers' in layer && layer.native_carriers?.some(carrier => carrier.kind === `homebrew_${item.kind}` && carrier.package_ref === item.name)));
  if (!product) return {};
  const description = 'description_i18n' in product ? product.description_i18n : undefined;
  return { product_display_name: product.product_name,
    // Preserve carrier labels such as Full and Nightly inside source details.
    ...(item.kind === 'formula' ? { display_name: product.product_name } : {}),
    ...(description ? { description: description['en-US'], description_i18n: description } : {}) };
}
export function readHomebrewSourceProjection(env: NodeJS.ProcessEnv = process.env) {
  try {
    const value: unknown = JSON.parse(fs.readFileSync(cacheFile(env), 'utf8'));
    if (!isRecord(value) || value.surface_kind !== 'opl_homebrew_readback.v1' || !isRecord(value.snapshot)) throw new Error();
    const snapshot = value.snapshot;
    if (!['available', 'unavailable'].includes(String(snapshot.inventory_status)) || !Array.isArray(snapshot.native_items)
      || !(snapshot.inventory_reason === null || typeof snapshot.inventory_reason === 'string') || typeof snapshot.inventory_checked_at !== 'string') throw new Error();
    for (const item of snapshot.native_items) {
      if (!isRecord(item) || !['formula', 'cask'].includes(String(item.kind)) || !fullName(item.name)
        || item.item_id !== `${item.kind}:${item.name}` || typeof item.display_name !== 'string'
        || !(item.description === null || typeof item.description === 'string') || typeof item.installed !== 'boolean'
        || !(item.installed_version === null || typeof item.installed_version === 'string')
        || !(item.available_version === null || typeof item.available_version === 'string')
        || !['available', 'current', 'not_installed', 'unknown'].includes(String(item.update_status))
        || typeof item.revision !== 'string' || typeof item.disabled !== 'boolean' || typeof item.pinned !== 'boolean') throw new Error();
      if (item.homebrew_installed !== undefined && (typeof item.homebrew_installed !== 'boolean'
        || !(item.homebrew_installed_version === null || typeof item.homebrew_installed_version === 'string'))) throw new Error();
      for (const key of ['installed_display_version', 'available_display_version', 'installed_build_id']) {
        if (item[key] !== undefined && item[key] !== null && typeof item[key] !== 'string') throw new Error();
      }
      if (item.installed_build_kind !== undefined && item.installed_build_kind !== null && item.installed_build_kind !== 'local-development') throw new Error();
      if (item.product_id !== undefined && (typeof item.product_id !== 'string' || !/^github:[a-z0-9_.-]+\/[a-z0-9_.-]+$/.test(item.product_id))) throw new Error();
    }
    return projection(snapshot as Snapshot, env);
  } catch { return projection(emptySnapshot(), env); }
}
function persist(snapshot: Snapshot, env: NodeJS.ProcessEnv) {
  const file = cacheFile(env);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporary, JSON.stringify({ surface_kind: 'opl_homebrew_readback.v1', snapshot }), { mode: 0o600, flag: 'wx' });
    fs.renameSync(temporary, file);
  } finally { fs.rmSync(temporary, { force: true }); }
}
const defaultRunner: HomebrewRunner = (args, options) => new Promise(resolve => {
  const configuredPath = options.env.PATH ?? process.env.PATH ?? '';
  const child = spawn('brew', args, { env: { ...options.env, PATH: `${configuredPath}:/opt/homebrew/bin:/usr/local/bin` }, stdio: ['ignore', 'pipe', 'ignore'], detached: process.platform !== 'win32' });
  let stdout = '';
  let oversized = false;
  let killTimer: ReturnType<typeof setTimeout> | undefined;
  const stop = () => {
    const signal = (kind: NodeJS.Signals) => {
      try { if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, kind); else child.kill(kind); } catch { /* The owner process already exited. */ }
    };
    signal('SIGTERM');
    killTimer ??= setTimeout(() => signal('SIGKILL'), 2_000);
  };
  const clearTimers = () => { clearTimeout(timer); if (killTimer) clearTimeout(killTimer); };
  const timer = setTimeout(stop, options.timeoutMs);
  child.stdout.on('data', chunk => {
    stdout += String(chunk);
    if (stdout.length > 4 * 1024 * 1024) { oversized = true; stop(); }
  });
  child.on('error', () => { clearTimers(); resolve({ status: null, stdout: '' }); });
  child.on('close', status => { clearTimers(); resolve({ status: oversized ? null : status, stdout: oversized ? '' : stdout }); });
});
function runBrew(args: string[], deps: HomebrewDependencies, mutation = false) {
  return (deps.run ?? defaultRunner)(args, {
    env: { ...(deps.env ?? process.env), HOMEBREW_NO_AUTO_UPDATE: '1', HOMEBREW_NO_ANALYTICS: '1', HOMEBREW_NO_INSTALL_CLEANUP: '1', HOMEBREW_NO_AUTOREMOVE: '1', HOMEBREW_NO_ENV_HINTS: '1', NONINTERACTIVE: '1' },
    timeoutMs: mutation ? 10 * 60_000 : 30_000,
  });
}
function parseJson(value: string): unknown { try { return JSON.parse(value); } catch { return null; } }
function normalizeItem(raw: Record<string, unknown>, kind: 'formula' | 'cask', env: NodeJS.ProcessEnv): NativeItem {
  const name = String(kind === 'formula' ? raw.full_name : raw.full_token);
  const baseName = kind === 'cask' && Array.isArray(raw.name) ? text(raw.name[0]) ?? name.split('/').at(-1)! : name.split('/').at(-1)!;
  const displayName = name.endsWith('-nightly') && !/nightly/i.test(baseName) ? `${baseName} Nightly` : baseName;
  const versions = isRecord(raw.versions) ? raw.versions : {};
  const stable = text(versions.stable);
  const available = kind === 'formula' ? stable && `${stable}${typeof raw.revision === 'number' && raw.revision > 0 ? `_${raw.revision}` : ''}` : text(raw.version);
  const brewInstalled = kind === 'formula' ? (Array.isArray(raw.installed) ? raw.installed.filter(isRecord).map(row => text(row.version)).filter(Boolean).sort().join(', ') || null : null) : text(raw.installed);
  // Homebrew reports bundle versions even when an App was installed outside
  // Homebrew or updated itself. Its receipt is not the current bundle version.
  const bundleVersion = kind === 'cask' ? text(raw.bundle_short_version) ?? text(raw.bundle_version) : null;
  const installed = bundleVersion ?? brewInstalled;
  const receiptMatchesBundle = !bundleVersion || Boolean(brewInstalled?.split(',').map(value => value.trim()).includes(bundleVersion));
  const productRepo = /^https:\/\/github\.com\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+?)(?:\.git)?\/?$/.exec(String(raw.homepage ?? ''))?.[1];
  const state = { name, kind, installed, brewInstalled, available, outdated: raw.outdated, disabled: raw.disabled === true, pinned: raw.pinned === true, recipe: raw.ruby_source_checksum ?? null };
  return {
    item_id: `${kind}:${name}`, name, kind, display_name: displayName,
    description: text(raw.desc), installed: installed !== null, installed_version: installed, available_version: available,
    ...(productRepo ? { product_id: `github:${productRepo.toLowerCase()}` } : {}),
    ...(kind === 'cask' && productRepo === 'gaofeng21cn/one-person-lab-app' ? readHomebrewAppVersionPresentation(raw, installed, env) : {}),
    homebrew_installed: brewInstalled !== null, homebrew_installed_version: brewInstalled,
    installation_owner: brewInstalled ? 'homebrew' : bundleVersion ? 'application' : null,
    installation_kind: bundleVersion ? 'app_bundle' : brewInstalled ? kind === 'formula' ? 'homebrew_formula' : 'homebrew_cask' : null,
    installation_evidence: bundleVersion ? 'homebrew_bundle_readback' : brewInstalled ? 'homebrew_install_receipt' : null,
    owner_settings_route: productRepo === 'gaofeng21cn/one-person-lab-app' && installed ? 'updates' : null,
    update_status: !installed ? 'not_installed' : !brewInstalled || !receiptMatchesBundle ? 'unknown' : raw.outdated === true ? 'available' : raw.outdated === false ? 'current' : 'unknown',
    revision: createHash('sha256').update(JSON.stringify(state)).digest('hex'), disabled: state.disabled, pinned: state.pinned,
  };
}
export async function refreshHomebrewSource(deps: HomebrewDependencies = {}) {
  const checkedAt = (deps.now ?? (() => new Date()))().toISOString();
  const finish = (snapshot: Snapshot) => {
    snapshot.inventory_checked_at = checkedAt;
    persist(snapshot, deps.env ?? process.env);
    return projection(snapshot, deps.env ?? process.env);
  };
  const tapResult = await runBrew(['tap-info', '--json', TAP], deps);
  if (tapResult.status !== 0) return finish(emptySnapshot(tapResult.status === null ? 'homebrew_unavailable' : 'homebrew_tap_read_failed'));
  const taps = parseJson(tapResult.stdout);
  const tap = Array.isArray(taps) ? taps.find(row => isRecord(row) && row.name === TAP) : null;
  if (!isRecord(tap)) return finish(emptySnapshot('homebrew_tap_read_invalid'));
  if (tap.installed !== true) return finish(emptySnapshot('homebrew_tap_not_connected'));
  if (!Array.isArray(tap.formula_names) || !Array.isArray(tap.cask_tokens)) return finish(emptySnapshot('homebrew_tap_read_invalid'));
  const names = [...tap.formula_names, ...tap.cask_tokens];
  if (names.some(name => !fullName(name)) || new Set(names).size !== names.length) return finish(emptySnapshot('homebrew_tap_membership_invalid'));
  if (!names.length) return finish({ inventory_status: 'available', inventory_reason: null, inventory_checked_at: checkedAt, native_items: [] });
  const infoResult = await runBrew(['info', '--json=v2', ...names], deps);
  const info = parseJson(infoResult.stdout);
  if (infoResult.status !== 0 || !isRecord(info) || !Array.isArray(info.formulae) || !Array.isArray(info.casks)) return finish(emptySnapshot('homebrew_inventory_read_failed'));
  const items: NativeItem[] = [];
  for (const [kind, rows, expected] of [['formula', info.formulae, tap.formula_names], ['cask', info.casks, tap.cask_tokens]] as const) {
    for (const row of rows) {
      const name = isRecord(row) ? kind === 'formula' ? row.full_name : row.full_token : null;
      if (!isRecord(row) || row.tap !== TAP || !fullName(name) || !expected.includes(name)) return finish(emptySnapshot('homebrew_inventory_identity_invalid'));
      items.push(normalizeItem(row, kind, deps.env ?? process.env));
    }
  }
  if (items.length !== names.length || new Set(items.map(item => item.item_id)).size !== names.length) return finish(emptySnapshot('homebrew_inventory_incomplete'));
  return finish({ inventory_status: 'available', inventory_reason: null, inventory_checked_at: checkedAt, native_items: items });
}

export async function executeHomebrewSourceAction(actionId: HomebrewActionId, payload: Record<string, unknown>, deps: HomebrewDependencies = {}) {
  if (payload.source_id !== OPL_HOMEBREW_SOURCE_ID) softwareSourceFailure('homebrew_source_mismatch', 'Native lifecycle actions require the managed OPL Homebrew source.');
  const itemAction = ['source_install', 'source_update', 'source_uninstall'].includes(actionId);
  if (itemAction && (typeof payload.item_id !== 'string' || typeof payload.expected_revision !== 'string')) softwareSourceFailure('homebrew_item_identity_required', 'Use item_id and expected_revision from the current source readback.');
  const file = cacheFile(deps.env ?? process.env);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const lock = `${file}.lock`;
  try { fs.mkdirSync(lock); } catch { softwareSourceFailure('homebrew_action_busy', 'A Homebrew source action is already in progress.'); }
  try {
    const before = await refreshHomebrewSource(deps);
    let args: string[];
    let item: (typeof before.native_items)[number] | undefined;
    if (actionId === 'source_setup') {
      if (before.inventory_status === 'available') return { native_action: { action_id: actionId, status: 'already_connected' }, native_inventory: before };
      if (before.inventory_reason !== 'homebrew_tap_not_connected') softwareSourceFailure('homebrew_setup_unavailable', 'Install or repair Homebrew through its native setup before connecting this source.');
      args = ['tap', TAP];
    } else {
      if (before.inventory_status !== 'available') softwareSourceFailure('homebrew_inventory_unavailable', 'Check and connect the Homebrew source before changing software.');
      if (actionId === 'source_refresh') args = ['update'];
      else {
        item = before.native_items.find(candidate => candidate.item_id === payload.item_id);
        if (!item) softwareSourceFailure('homebrew_item_not_in_source', 'The requested software is not a member of the managed OPL tap.');
        if (item.revision !== payload.expected_revision) softwareSourceFailure('homebrew_item_changed', 'The software or source recipe changed; review the fresh source readback before retrying.');
        if (!item.available_actions.some(action => action.action_id === actionId)) softwareSourceFailure('homebrew_action_unavailable', 'This lifecycle action is not available for the current native installation.');
        args = [actionId === 'source_update' ? 'upgrade' : actionId.slice('source_'.length), `--${item.kind}`, item.name];
      }
    }
    const result = await runBrew(args, deps, true);
    const after = await refreshHomebrewSource(deps);
    const readback = item ? after.native_items.find(candidate => candidate.item_id === item!.item_id) : undefined;
    const verified = after.inventory_status === 'available' && (!item || (actionId === 'source_uninstall' ? readback?.homebrew_installed === false : readback?.homebrew_installed === true && readback.update_status === 'current'));
    return { native_action: { action_id: actionId, item_id: item?.item_id ?? null, status: result.status === 0 && verified ? 'completed' : 'needs_attention',
      reason_code: result.status !== 0 ? 'homebrew_native_command_failed' : verified ? null : 'homebrew_native_readback_unverified',
      business_data_cleanup_requested: false, installation_owner: 'homebrew' }, native_inventory: after };
  } finally { fs.rmdirSync(lock); }
}
