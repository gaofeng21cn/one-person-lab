import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { isRecord } from '@opl/core';
import { PackError } from '../errors.ts';
import { normalizeDistributionVersion } from '../distribution/registry-client.ts';
import {
  isReservedAppSettingsId,
  isSafeRelativePosixPath,
  type I18nText,
  type OplPackageManifestV2,
  type SettingsDestination,
} from '../manifest/schema.ts';
import { parsePackageManifestV2 } from '../manifest/validate.ts';

export interface MigrateV1Options {
  readonly repoDir: string;
  readonly apply?: boolean;
  readonly clean?: boolean;
}

export interface MigrateV1Relocation {
  readonly from: string;
  readonly to: string;
  readonly kind: 'file' | 'directory';
}

export interface MigrateV1CleanupReport {
  readonly files_to_delete: readonly string[];
  readonly dirs_to_delete: readonly string[];
  readonly relocations: readonly MigrateV1Relocation[];
  readonly warnings: readonly string[];
}

export interface MigrateV1Result {
  readonly manifest: OplPackageManifestV2;
  readonly source_manifest_path: string;
  readonly target_manifest_path: string;
  readonly nested_layout_detected: boolean;
  readonly nested_plugin_dir: string | null;
  readonly extra_entrypoints: readonly string[];
  readonly applied: boolean;
  readonly cleaned: boolean;
  readonly cleanup_report: MigrateV1CleanupReport;
}

function readJsonIfExists(filePath: string): Record<string, unknown> | null {
  if (!fs.existsSync(filePath)) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown;
  } catch (error) {
    throw new PackError(
      'PACK_MIGRATION_FAILED',
      `Corrupt JSON in '${filePath}': ${error instanceof Error ? error.message : String(error)}`,
      { file_path: filePath },
      { cause: error },
    );
  }
  if (!isRecord(parsed)) {
    throw new PackError(
      'PACK_MIGRATION_FAILED',
      `Expected JSON object in '${filePath}'.`,
      { file_path: filePath },
    );
  }
  return parsed;
}

function toKebabId(raw: string, fallback = 'opl-package'): string {
  const cleaned = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
  return cleaned || fallback;
}

function toScopedId(raw: string, fallback = 'item'): string {
  const cleaned = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, '')
    .replace(/-{2,}/g, '-');
  return cleaned || fallback;
}

function normI18n(raw: unknown, fallbackEn: string, fallbackZh?: string): I18nText {
  if (isRecord(raw)) {
    const rawZh =
      typeof raw['zh-CN'] === 'string' && raw['zh-CN'].trim()
        ? raw['zh-CN'].trim()
        : typeof raw.zh === 'string' && raw.zh.trim()
          ? raw.zh.trim()
          : '';
    const rawEn =
      typeof raw['en-US'] === 'string' && raw['en-US'].trim()
        ? raw['en-US'].trim()
        : typeof raw.en === 'string' && raw.en.trim()
          ? raw.en.trim()
          : '';
    const en = rawEn || rawZh || fallbackEn.trim() || 'Package';
    const zh = rawZh || fallbackZh?.trim() || en;
    return { 'zh-CN': zh, 'en-US': en };
  }
  const en = fallbackEn.trim() || 'Package';
  const zh = fallbackZh?.trim() || en;
  return { 'zh-CN': zh, 'en-US': en };
}

function stripLeadingDotSlash(p: string): string {
  return p.replace(/^\.\//, '').replace(/\/+$/, '');
}

function isValidHttpUrl(value: unknown): value is string {
  if (typeof value !== 'string' || !value.trim()) return false;
  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function normalizeRepoUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const trimmed = value.trim().replace(/\.git$/, '');
  return isValidHttpUrl(trimmed) ? trimmed : undefined;
}

function extractCodexInterface(codexDoc: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!codexDoc) return null;
  if (isRecord(codexDoc.interface)) return codexDoc.interface;
  const exts = isRecord(codexDoc.extensions) ? codexDoc.extensions : null;
  const openai = exts && isRecord(exts['com.openai']) ? exts['com.openai'] : null;
  if (openai && isRecord(openai.interface)) return openai.interface;
  return null;
}

function normalizeViewType(
  rawType: unknown,
): 'channel_access' | 'service_status' | 'activity_log' | 'list_detail' | 'approval_diff' | 'remote_companion_access' {
  switch (rawType) {
    case 'channel_access':
    case 'service_status':
    case 'activity_log':
    case 'list_detail':
    case 'approval_diff':
    case 'remote_companion_access':
      return rawType;
    case 'timeline':
      return 'activity_log';
    case 'task_board':
    case 'artifact_view':
    default:
      return 'list_detail';
  }
}

function normalizeSettingsDestination(raw: unknown): SettingsDestination {
  switch (raw) {
    case 'models':
    case 'resources':
    case 'workspace':
    case 'capabilities':
    case 'services':
    case 'preferences':
      return raw;
    default:
      return 'resources';
  }
}

function inferIntent(
  old: Record<string, unknown>,
  id: string,
  repoName: string,
): OplPackageManifestV2['identity']['intent'] {
  const presentation = isRecord(old.presentation) ? old.presentation : null;
  if (presentation?.software_type === 'agent') return 'agent';
  if (presentation?.software_type === 'application') return 'app';
  const entrypoints = Array.isArray(old.entrypoints) ? old.entrypoints.filter(isRecord) : [];
  if (
    entrypoints.some(
      (e) =>
        e.kind === 'channel_provider'
        || e.entrypoint_kind === 'channel_provider'
        || e.kind === 'remote_companion_connector'
        || e.entrypoint_kind === 'remote_companion_connector',
    )
    || id.includes('channel-')
    || repoName.includes('channel-')
  ) {
    return 'channel';
  }
  const surfaceKind = typeof old.surface_kind === 'string' ? old.surface_kind : '';
  if (old.kind === 'agent' || surfaceKind.includes('agent_package')) return 'agent';
  if (id === 'opl-relay' || (presentation && isRecord(presentation.miniapp))) return 'app';
  return 'extension';
}

function rewritePluginRootString(raw: string, nestedRelDir: string | null): string {
  if (raw === '${PLUGIN_ROOT}') return '.';
  if (raw.startsWith('${PLUGIN_ROOT}/')) {
    return `./${raw.slice('${PLUGIN_ROOT}/'.length)}`;
  }
  if (nestedRelDir && raw.startsWith(`./${nestedRelDir}/`)) {
    return `./${raw.slice(`./${nestedRelDir}/`.length)}`;
  }
  return raw;
}

function findPluginManifestDirs(repoRoot: string): string[] {
  const pluginsDir = path.join(repoRoot, 'plugins');
  if (!fs.existsSync(pluginsDir) || !fs.statSync(pluginsDir).isDirectory()) return [];
  return fs
    .readdirSync(pluginsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort((a, b) => a.localeCompare(b));
}

function selectPrimaryPluginSubdir(repoRoot: string, pluginSubdirs: readonly string[]): string | null {
  if (pluginSubdirs.length === 0) return null;
  let best: { relDir: string; score: number } | null = null;
  for (const name of pluginSubdirs) {
    const dir = path.join(repoRoot, 'plugins', name);
    let score = 0;
    if (fs.existsSync(path.join(dir, 'opl-package.json'))) score += 100;
    if (fs.existsSync(path.join(dir, '.codex-plugin', 'plugin.json'))) score += 40;
    if (fs.existsSync(path.join(dir, 'plugin.json'))) score += 30;
    if (fs.existsSync(path.join(dir, 'mcp.json'))) score += 20;
    if (fs.existsSync(path.join(dir, 'skills')) && fs.statSync(path.join(dir, 'skills')).isDirectory()) {
      score += 10;
    }
    if (!best || score > best.score) {
      best = { relDir: `plugins/${name}`, score };
    }
  }
  return best && best.score > 0 ? best.relDir : `plugins/${pluginSubdirs[0]}`;
}

function applyMigrationPlan(params: {
  readonly repoRoot: string;
  readonly rootManifestPath: string;
  readonly manifestJsonText: string;
  readonly relocations: readonly MigrateV1Relocation[];
  readonly filesToDelete: ReadonlySet<string>;
  readonly dirsToDelete: ReadonlySet<string>;
  readonly apply: boolean;
  readonly clean: boolean;
}): { readonly applied: boolean; readonly cleaned: boolean } {
  if (!params.apply) {
    return { applied: false, cleaned: false };
  }

  const prevRootBytes = fs.existsSync(params.rootManifestPath)
    ? fs.readFileSync(params.rootManifestPath)
    : null;
  const createdTargets: string[] = [];
  let wroteRootManifest = false;
  const backupDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-migrate-bak-'));
  const backedUpCleanPaths: Array<{ readonly rel: string; readonly bakAbs: string }> = [];

  try {
    for (const reloc of params.relocations) {
      const fromAbs = path.join(params.repoRoot, reloc.from);
      const toAbs = path.join(params.repoRoot, reloc.to);
      if (fs.existsSync(fromAbs) && !fs.existsSync(toAbs)) {
        fs.mkdirSync(path.dirname(toAbs), { recursive: true });
        createdTargets.push(toAbs);
        fs.cpSync(fromAbs, toAbs, { recursive: true });
      }
    }
    fs.writeFileSync(params.rootManifestPath, params.manifestJsonText, 'utf8');
    wroteRootManifest = true;

    let cleaned = false;
    if (params.clean) {
      let idx = 0;
      for (const relFile of params.filesToDelete) {
        const abs = path.join(params.repoRoot, relFile);
        if (fs.existsSync(abs)) {
          const bakAbs = path.join(backupDir, `f_${idx++}`);
          fs.cpSync(abs, bakAbs, { recursive: true });
          backedUpCleanPaths.push({ rel: relFile, bakAbs });
          fs.rmSync(abs, { force: true });
        }
      }
      for (const relDir of params.dirsToDelete) {
        const abs = path.join(params.repoRoot, relDir);
        if (fs.existsSync(abs)) {
          const bakAbs = path.join(backupDir, `d_${idx++}`);
          fs.cpSync(abs, bakAbs, { recursive: true });
          backedUpCleanPaths.push({ rel: relDir, bakAbs });
          fs.rmSync(abs, { recursive: true, force: true });
        }
      }
      const pluginsDir = path.join(params.repoRoot, 'plugins');
      if (fs.existsSync(pluginsDir) && fs.readdirSync(pluginsDir).length === 0) {
        fs.rmdirSync(pluginsDir);
      }
      const codexDir = path.join(params.repoRoot, '.codex-plugin');
      if (fs.existsSync(codexDir) && fs.readdirSync(codexDir).length === 0) {
        fs.rmdirSync(codexDir);
      }
      cleaned = true;
    }
    return { applied: true, cleaned };
  } catch (error) {
    for (let i = backedUpCleanPaths.length - 1; i >= 0; i -= 1) {
      const entry = backedUpCleanPaths[i]!;
      const origAbs = path.join(params.repoRoot, entry.rel);
      try {
        fs.mkdirSync(path.dirname(origAbs), { recursive: true });
        fs.cpSync(entry.bakAbs, origAbs, { recursive: true });
      } catch {
        // best-effort restore
      }
    }
    if (wroteRootManifest) {
      try {
        if (prevRootBytes !== null) {
          fs.writeFileSync(params.rootManifestPath, prevRootBytes);
        } else {
          fs.rmSync(params.rootManifestPath, { force: true });
        }
      } catch {
        // best-effort restore
      }
    }
    for (let i = createdTargets.length - 1; i >= 0; i -= 1) {
      try {
        fs.rmSync(createdTargets[i]!, { recursive: true, force: true });
      } catch {
        // best-effort cleanup
      }
    }
    throw error;
  } finally {
    fs.rmSync(backupDir, { recursive: true, force: true });
  }
}

export function migrateV1Package(options: MigrateV1Options): MigrateV1Result {
  if (!fs.existsSync(options.repoDir) || !fs.statSync(options.repoDir).isDirectory()) {
    throw new PackError('PACK_NOT_FOUND', `Repository directory not found: ${options.repoDir}`);
  }
  const repoRoot = fs.realpathSync(options.repoDir);
  const pluginSubdirs = findPluginManifestDirs(repoRoot);

  // 1. Discover primary manifest
  const rootManifestPath = path.join(repoRoot, 'opl-package.json');
  const contractManifestPath = path.join(repoRoot, 'contracts', 'opl_agent_package_manifest.json');
  const nestedManifestCandidates = pluginSubdirs
    .map((name) => ({
      name,
      relDir: `plugins/${name}`,
      manifestPath: path.join(repoRoot, 'plugins', name, 'opl-package.json'),
    }))
    .filter((c) => fs.existsSync(c.manifestPath));

  let sourceManifestPath = '';
  let nestedPluginRelDir: string | null = null;
  let nestedLayoutDetected = false;

  if (fs.existsSync(rootManifestPath)) {
    sourceManifestPath = rootManifestPath;
    if (pluginSubdirs.length > 0) {
      nestedLayoutDetected = true;
      nestedPluginRelDir =
        nestedManifestCandidates[0]?.relDir ?? selectPrimaryPluginSubdir(repoRoot, pluginSubdirs);
    }
  } else if (nestedManifestCandidates.length > 0) {
    sourceManifestPath = nestedManifestCandidates[0].manifestPath;
    nestedPluginRelDir = nestedManifestCandidates[0].relDir;
    nestedLayoutDetected = true;
  } else if (fs.existsSync(contractManifestPath)) {
    sourceManifestPath = contractManifestPath;
    if (pluginSubdirs.length > 0) {
      nestedLayoutDetected = true;
      nestedPluginRelDir = selectPrimaryPluginSubdir(repoRoot, pluginSubdirs);
    }
  } else {
    throw new PackError(
      'PACK_MISSING_PATH',
      `No v1 opl-package.json, contracts/opl_agent_package_manifest.json, or plugins/*/opl-package.json found in ${repoRoot}.`,
      { repo_dir: repoRoot },
    );
  }

  const old = readJsonIfExists(sourceManifestPath);
  if (!old) {
    throw new PackError('PACK_MIGRATION_FAILED', `Failed to parse v1 manifest at ${sourceManifestPath}.`);
  }

  // Already v2? Relocate & clean if discovered under nested plugins/<name>/, otherwise return idempotently
  if (old.schema_version === 'opl.package.v2') {
    const validated = parsePackageManifestV2(old);
    if (!nestedLayoutDetected || !nestedPluginRelDir || sourceManifestPath === rootManifestPath) {
      return {
        manifest: validated,
        source_manifest_path: sourceManifestPath,
        target_manifest_path: rootManifestPath,
        nested_layout_detected: nestedLayoutDetected,
        nested_plugin_dir: nestedPluginRelDir,
        extra_entrypoints: [],
        applied: false,
        cleaned: false,
        cleanup_report: {
          files_to_delete: [],
          dirs_to_delete: [],
          relocations: [],
          warnings: ['Manifest is already opl.package.v2.'],
        },
      };
    }

    const v2Relocations: MigrateV1Relocation[] = [];
    const v2DirsToDelete = new Set<string>(pluginSubdirs.map((s) => `plugins/${s}`));
    const v2FilesToDelete = new Set<string>();
    const relocKeys = new Set<string>();
    const addV2Reloc = (subRel: string, kind: 'file' | 'directory') => {
      const cleanSub = stripLeadingDotSlash(subRel);
      if (!cleanSub || !isSafeRelativePosixPath(cleanSub)) return;
      const fromRel = `${nestedPluginRelDir}/${cleanSub}`;
      const fromAbs = path.join(repoRoot, fromRel);
      const toAbs = path.join(repoRoot, cleanSub);
      const key = `${fromRel}=>${cleanSub}`;
      if (relocKeys.has(key)) return;
      if (fs.existsSync(fromAbs) && !fs.existsSync(toAbs)) {
        const stat = fs.statSync(fromAbs);
        if ((kind === 'directory' && stat.isDirectory()) || (kind === 'file' && stat.isFile())) {
          v2Relocations.push({ from: fromRel, to: cleanSub, kind });
          relocKeys.add(key);
        }
      }
    };
    for (const stdDir of ['skills', 'assets', 'bin', 'workbench', 'runtime', 'scripts', 'openclaw']) {
      addV2Reloc(stdDir, 'directory');
    }
    if (validated.identity.icon) {
      addV2Reloc(validated.identity.icon, 'file');
    }
    for (const sk of validated.provides?.skills ?? []) {
      addV2Reloc(sk.path, 'directory');
    }

    const v2RefSubpaths: string[] = [];
    const pushSubpath = (raw: string | undefined) => {
      if (!raw) return;
      const stripped = raw.replace(/^\$\{PLUGIN_ROOT\}\//, '');
      if (stripped.startsWith('./') || stripped.includes('/') || raw.startsWith('${PLUGIN_ROOT}/')) {
        v2RefSubpaths.push(stripped);
      }
    };
    const pushArgv = (argv: readonly string[] | undefined) => {
      for (const arg of argv ?? []) {
        pushSubpath(arg);
      }
    };
    if (validated.provides?.agent?.stages_ref) {
      v2RefSubpaths.push(validated.provides.agent.stages_ref);
    }
    if (validated.provides?.agent?.authority_entrypoint) {
      pushArgv(validated.provides.agent.authority_entrypoint.argv);
    }
    for (const bin of validated.provides?.cli_bin ?? []) {
      v2RefSubpaths.push(bin.path);
    }
    for (const srv of validated.provides?.mcp_servers ?? []) {
      pushSubpath(srv.command);
      pushArgv(srv.args);
    }
    for (const cp of validated.provides?.connection_providers ?? []) {
      if (cp.entrypoint.kind === 'esm_module') v2RefSubpaths.push(cp.entrypoint.module);
      else pushArgv(cp.entrypoint.argv);
    }
    for (const ch of validated.provides?.channels ?? []) {
      v2RefSubpaths.push(ch.entrypoint.module);
    }
    for (const rc of validated.provides?.remote_companion_connectors ?? []) {
      v2RefSubpaths.push(rc.entrypoint.module);
    }
    for (const ex of validated.provides?.executors ?? []) {
      v2RefSubpaths.push(ex.entrypoint.module);
    }
    for (const ce of validated.provides?.cli_extensions ?? []) {
      if (ce.entrypoint.kind === 'esm_module') v2RefSubpaths.push(ce.entrypoint.module);
      else pushArgv(ce.entrypoint.argv);
    }
    if (validated.provides?.contribution_handler) {
      if (validated.provides.contribution_handler.kind === 'esm_module') {
        v2RefSubpaths.push(validated.provides.contribution_handler.module);
      } else {
        pushArgv(validated.provides.contribution_handler.argv);
      }
    }
    if (validated.ui?.dsh_client?.client_entry) {
      v2RefSubpaths.push(validated.ui.dsh_client.client_entry);
    }
    if (validated.ui?.dsh_client?.host_entry) {
      v2RefSubpaths.push(validated.ui.dsh_client.host_entry);
    }
    if (validated.identity.icon) {
      v2RefSubpaths.push(validated.identity.icon);
    }
    for (const refPath of v2RefSubpaths) {
      const cleanRef = stripLeadingDotSlash(refPath);
      const topSeg = cleanRef.split('/')[0];
      if (!topSeg || topSeg === '.' || topSeg === '..' || topSeg === 'plugins') {
        continue;
      }
      const nestedTopAbs = path.join(repoRoot, nestedPluginRelDir, topSeg);
      if (fs.existsSync(nestedTopAbs)) {
        addV2Reloc(topSeg, fs.statSync(nestedTopAbs).isDirectory() ? 'directory' : 'file');
      }
    }

    const execRes = applyMigrationPlan({
      repoRoot,
      rootManifestPath,
      manifestJsonText: `${JSON.stringify(validated, null, 2)}\n`,
      relocations: v2Relocations,
      filesToDelete: v2FilesToDelete,
      dirsToDelete: v2DirsToDelete,
      apply: Boolean(options.apply),
      clean: Boolean(options.clean),
    });

    return {
      manifest: validated,
      source_manifest_path: sourceManifestPath,
      target_manifest_path: rootManifestPath,
      nested_layout_detected: true,
      nested_plugin_dir: nestedPluginRelDir,
      extra_entrypoints: [],
      applied: execRes.applied,
      cleaned: execRes.cleaned,
      cleanup_report: {
        files_to_delete: [],
        dirs_to_delete: [...v2DirsToDelete].sort(),
        relocations: v2Relocations,
        warnings: ['Relocated nested opl.package.v2 manifest from plugins/ to package root.'],
      },
    };
  }

  // 2. Discover Codex manifest, mcp.json, carrier_projection.json, app-contribution-adapter.json
  const codexCandidates = [
    path.join(repoRoot, '.codex-plugin', 'plugin.json'),
    ...(nestedPluginRelDir
      ? [
          path.join(repoRoot, nestedPluginRelDir, '.codex-plugin', 'plugin.json'),
          path.join(repoRoot, nestedPluginRelDir, 'plugin.json'),
        ]
      : []),
    path.join(repoRoot, 'plugin.json'),
  ];
  let oldCodex: Record<string, unknown> | null = null;
  for (const candidate of codexCandidates) {
    const doc = readJsonIfExists(candidate);
    if (doc) {
      oldCodex = doc;
      break;
    }
  }
  const oldCodexIface = extractCodexInterface(oldCodex);

  const mcpCandidates = [
    path.join(repoRoot, 'mcp.json'),
    ...(nestedPluginRelDir ? [path.join(repoRoot, nestedPluginRelDir, 'mcp.json')] : []),
  ];
  let oldMcp: Record<string, unknown> | null = null;
  let oldMcpNestedRel: string | null = null;
  for (const candidate of mcpCandidates) {
    const doc = readJsonIfExists(candidate);
    if (doc) {
      oldMcp = doc;
      const rel = path.relative(repoRoot, path.dirname(candidate)).split(path.sep).join('/');
      oldMcpNestedRel = rel && rel !== '.' ? rel : null;
      break;
    }
  }

  const carrierProjection = readJsonIfExists(
    path.join(repoRoot, 'contracts', 'carrier_projection.json'),
  );
  const adapterDoc =
    readJsonIfExists(path.join(repoRoot, 'app-contribution-adapter.json'))
    ?? (nestedPluginRelDir
      ? readJsonIfExists(path.join(repoRoot, nestedPluginRelDir, 'app-contribution-adapter.json'))
      : null);

  const relocations: MigrateV1Relocation[] = [];
  const filesToDelete = new Set<string>();
  const dirsToDelete = new Set<string>();
  const warnings: string[] = [];

  // 3. Identity
  const rawId =
    typeof old.package_id === 'string' && old.package_id.trim()
      ? old.package_id
      : typeof old.agent_id === 'string' && old.agent_id.trim()
        ? old.agent_id
        : path.basename(repoRoot);
  const id = toKebabId(rawId, path.basename(repoRoot));
  const rawVersion =
    (typeof old.version === 'string' && old.version.trim())
    || (typeof oldCodex?.version === 'string' && oldCodex.version.trim())
    || '0.1.0';
  const version = normalizeDistributionVersion(rawVersion);
  const intent = inferIntent(old, id, path.basename(repoRoot));
  const displayName =
    (typeof old.display_name === 'string' && old.display_name.trim())
    || (typeof oldCodexIface?.displayName === 'string' && oldCodexIface.displayName.trim())
    || id;
  const presentation = isRecord(old.presentation) ? old.presentation : null;
  const name = normI18n(presentation?.display_name_i18n, displayName, displayName);
  const summaryFallback =
    (typeof oldCodex?.description === 'string' && oldCodex.description.trim())
    || (typeof oldCodexIface?.shortDescription === 'string' && oldCodexIface.shortDescription.trim())
    || `${displayName} package`;
  const summary = normI18n(presentation?.description_i18n, summaryFallback, summaryFallback);

  const longDesc =
    typeof oldCodexIface?.longDescription === 'string' && oldCodexIface.longDescription.trim()
      ? oldCodexIface.longDescription.trim()
      : undefined;
  const publisher =
    (typeof old.publisher === 'string' && old.publisher.trim())
    || (typeof oldCodexIface?.developerName === 'string' && oldCodexIface.developerName.trim())
    || 'one-person-lab';

  // Resolve icon across presentation.icon_ref, carrier_projection file_aliases, codex logo, and assets/branding
  const rawFileAliases = carrierProjection?.file_aliases;
  let iconRel: string | undefined;
  const candidateIcons: string[] = [];
  if (typeof presentation?.icon_ref === 'string' && presentation.icon_ref.trim()) {
    candidateIcons.push(stripLeadingDotSlash(presentation.icon_ref.trim()));
  }
  if (Array.isArray(rawFileAliases)) {
    for (const alias of rawFileAliases) {
      if (
        isRecord(alias)
        && typeof alias.from === 'string'
        && typeof alias.to === 'string'
        && (alias.to.includes('icon') || alias.to.includes('logo'))
      ) {
        candidateIcons.push(stripLeadingDotSlash(alias.from));
      }
    }
  } else if (isRecord(rawFileAliases)) {
    for (const [srcAlias, dstAlias] of Object.entries(rawFileAliases)) {
      if (typeof dstAlias === 'string' && (dstAlias.includes('icon') || dstAlias.includes('logo'))) {
        candidateIcons.push(stripLeadingDotSlash(srcAlias));
      }
    }
  }
  if (typeof oldCodexIface?.logo === 'string' && oldCodexIface.logo.trim()) {
    const logoClean = stripLeadingDotSlash(oldCodexIface.logo.trim());
    candidateIcons.push(logoClean);
    if (nestedPluginRelDir && !logoClean.startsWith(`${nestedPluginRelDir}/`)) {
      candidateIcons.push(`${nestedPluginRelDir}/${logoClean}`);
    }
  }
  const brandingDir = path.join(repoRoot, 'assets', 'branding');
  if (fs.existsSync(brandingDir) && fs.statSync(brandingDir).isDirectory()) {
    for (const entry of fs.readdirSync(brandingDir).sort()) {
      if (/(?:logo|icon)\.(?:png|svg|jpg|jpeg|webp)$/i.test(entry)) {
        candidateIcons.push(`assets/branding/${entry}`);
      }
    }
  }
  candidateIcons.push('assets/icon.png', 'assets/icon.svg');
  if (nestedPluginRelDir) {
    candidateIcons.push(`${nestedPluginRelDir}/assets/icon.png`, `${nestedPluginRelDir}/assets/icon.svg`);
  }

  for (const cand of candidateIcons) {
    const absCand = path.join(repoRoot, cand);
    if (isSafeRelativePosixPath(cand) && fs.existsSync(absCand) && fs.statSync(absCand).isFile()) {
      if (nestedPluginRelDir && cand.startsWith(`${nestedPluginRelDir}/assets/`)) {
        const targetIcon = cand.slice(nestedPluginRelDir.length + 1);
        relocations.push({ from: cand, to: targetIcon, kind: 'file' });
        iconRel = targetIcon;
      } else {
        iconRel = cand;
      }
      break;
    }
  }
  if (!iconRel && candidateIcons.length > 0) {
    warnings.push(
      `Declared icon '${candidateIcons[0]}' was not found on disk; omitted identity.icon.`,
    );
  }

  const repository = normalizeRepoUrl(old.source_repo ?? oldCodex?.repository);
  const homepage = normalizeRepoUrl(oldCodex?.homepage);
  const license =
    typeof oldCodex?.license === 'string' && oldCodex.license.trim()
      ? oldCodex.license.trim()
      : undefined;
  const keywords = Array.isArray(oldCodex?.keywords)
    ? oldCodex.keywords.filter((k): k is string => typeof k === 'string' && k.trim().length > 0)
    : undefined;
  const routingSummary = isRecord(presentation?.session_routing_summary_i18n)
    ? normI18n(presentation.session_routing_summary_i18n, summary['en-US'], summary['zh-CN'])
    : undefined;
  const defaultPrompts = Array.isArray(oldCodexIface?.defaultPrompt)
    ? oldCodexIface.defaultPrompt.filter((p): p is string => typeof p === 'string' && p.trim().length > 0)
    : undefined;

  const homeShortcutsRaw = Array.isArray(presentation?.home_shortcuts)
    ? presentation.home_shortcuts.filter(isRecord)
    : [];
  const homeShortcuts =
    homeShortcutsRaw.length > 0
      ? homeShortcutsRaw.map((h, idx) => ({
          id: toScopedId(
            typeof h.shortcut_id === 'string' ? h.shortcut_id : `shortcut-${idx + 1}`,
            `shortcut-${idx + 1}`,
          ),
          label: normI18n(h.label_i18n, String(h.shortcut_id ?? 'Open')),
          default_visible: h.default_visible !== false,
          target: {
            kind: (isRecord(presentation?.miniapp) ? 'mcp_app' : 'agent') as 'mcp_app' | 'agent',
            ref: id,
          },
        }))
      : undefined;

  // 4. Dependencies (string[] + object[] requires + required/bundled capability package ids + capability_dependencies)
  const depMap = new Map<
    string,
    { id: string; version?: string; optional?: boolean; required_capabilities?: string[] }
  >();
  const addDep = (
    pkgIdRaw: string,
    opts: { version?: string; optional?: boolean; required_capabilities?: string[] } = {},
  ) => {
    const depId = toKebabId(pkgIdRaw);
    const existing = depMap.get(depId);
    const mergedCaps = new Set<string>([
      ...(existing?.required_capabilities ?? []),
      ...(opts.required_capabilities ?? []),
    ]);
    depMap.set(depId, {
      id: depId,
      ...(opts.version ?? existing?.version ? { version: opts.version ?? existing?.version } : {}),
      optional:
        existing !== undefined
          ? Boolean(existing.optional && (opts.optional ?? false))
          : Boolean(opts.optional),
      ...(mergedCaps.size > 0 ? { required_capabilities: [...mergedCaps] } : {}),
    });
  };

  if (Array.isArray(old.requires)) {
    for (const r of old.requires) {
      if (typeof r === 'string' && r.trim()) {
        addDep(r.trim(), { optional: false });
      } else if (isRecord(r) && typeof r.package_id === 'string' && r.package_id.trim()) {
        addDep(r.package_id, {
          version: typeof r.version === 'string' && r.version.trim() ? r.version.trim() : undefined,
          optional: r.presence === 'optional' || r.required === false,
        });
      }
    }
  }

  const codexSurface = isRecord(old.codex_surface) ? old.codex_surface : null;
  for (const listKey of ['required_capability_package_ids', 'bundled_capability_package_ids'] as const) {
    const arr = codexSurface?.[listKey];
    if (Array.isArray(arr)) {
      for (const pid of arr) {
        if (typeof pid === 'string' && pid.trim()) {
          addDep(pid.trim(), { optional: false });
        }
      }
    }
  }

  if (Array.isArray(old.capability_dependencies)) {
    for (const cd of old.capability_dependencies) {
      if (!isRecord(cd) || typeof cd.package_id !== 'string' || !cd.package_id.trim()) continue;
      const reqCaps = Array.isArray(cd.required_export_ids)
        ? cd.required_export_ids
            .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
            .map((x) => toScopedId(x))
        : undefined;
      addDep(cd.package_id, {
        version:
          typeof cd.version_requirement === 'string' && cd.version_requirement.trim()
            ? cd.version_requirement.trim()
            : typeof cd.version === 'string' && cd.version.trim()
              ? cd.version.trim()
              : undefined,
        optional: cd.required === false,
        required_capabilities: reqCaps,
      });
    }
  }

  // 5. Permissions (array in redcube-ai vs object)
  let permissions: OplPackageManifestV2['permissions'] | undefined;
  if (Array.isArray(old.permissions)) {
    const items = old.permissions.filter(isRecord);
    const hasWrite = items.some((p) =>
      String(p.access ?? '').includes('write') || String(p.permission_id ?? '').includes('mutation'),
    );
    const hasRead = items.some((p) => String(p.access ?? '').includes('read'));
    permissions = {
      workspace: {
        access: hasWrite ? 'read_write' : hasRead ? 'read' : 'none',
        reason: normI18n(
          null,
          'Workspace access migrated from legacy permissions list',
          '从旧版权限列表迁移的工作区访问权限',
        ),
      },
    };
  } else if (isRecord(old.permissions)) {
    const rawWs = isRecord(old.permissions.workspace) ? old.permissions.workspace : null;
    const wsAccess =
      rawWs?.access === 'none' || rawWs?.access === 'read' || rawWs?.access === 'read_write'
        ? rawWs.access
        : undefined;
    const rawNet = old.permissions.network;
    const net =
      rawNet === 'none' || rawNet === 'outbound_api' || rawNet === 'local_loopback' || rawNet === 'remote_tunnel'
        ? rawNet
        : undefined;
    const rawExec = old.permissions.execution_mode;
    const execMode =
      rawExec === 'in_process'
      || rawExec === 'local_subprocess'
      || rawExec === 'sandbox_iframe'
      || rawExec === 'declarative_only'
        ? rawExec
        : undefined;
    if (wsAccess || net || execMode) {
      permissions = {
        ...(wsAccess
          ? {
              workspace: {
                access: wsAccess,
                ...(isRecord(rawWs?.reason)
                  ? { reason: normI18n(rawWs.reason, 'Workspace access') }
                  : {}),
              },
            }
          : {}),
        ...(net ? { network: net } : {}),
        ...(execMode ? { execution_mode: execMode } : {}),
      };
    }
  }

  // 6. Provides: skills, entrypoints (cli, channel_provider, remote_companion_connector, entrypoint_kind), mcp.json
  const skillIds = new Set<string>();
  if (Array.isArray(codexSurface?.required_skill_ids)) {
    for (const sid of codexSurface.required_skill_ids) {
      if (typeof sid === 'string' && sid.trim()) skillIds.add(sid.trim());
    }
  }
  const exportsObj = isRecord(old.exports) ? old.exports : null;
  if (Array.isArray(exportsObj?.core_skill_ids)) {
    for (const sid of exportsObj.core_skill_ids) {
      if (typeof sid === 'string' && sid.trim()) skillIds.add(sid.trim());
    }
  }

  const skills: Array<{ id: string; path: string; exposure: 'default' | 'opt_in' }> = [];
  for (const sid of skillIds) {
    const cleanId = toScopedId(sid);
    const rootSkillPath = `skills/${sid}`;
    const nestedSkillPath = nestedPluginRelDir ? `${nestedPluginRelDir}/skills/${sid}` : null;
    const primarySkillDir = 'agent/primary_skill';

    let chosenPath = `./${rootSkillPath}`;
    if (fs.existsSync(path.join(repoRoot, rootSkillPath, 'SKILL.md'))) {
      chosenPath = `./${rootSkillPath}`;
    } else if (nestedSkillPath && fs.existsSync(path.join(repoRoot, nestedSkillPath, 'SKILL.md'))) {
      relocations.push({ from: nestedSkillPath, to: rootSkillPath, kind: 'directory' });
      chosenPath = `./${rootSkillPath}`;
    } else if (fs.existsSync(path.join(repoRoot, primarySkillDir, 'SKILL.md'))) {
      chosenPath = `./${primarySkillDir}`;
    } else {
      warnings.push(`Skill '${sid}' directory not found on disk; defaulted to '${chosenPath}'.`);
    }

    skills.push({
      id: cleanId,
      path: chosenPath,
      exposure: codexSurface?.codex_default_exposure === false ? 'opt_in' : 'default',
    });
  }

  const channels: Array<{
    channel_id: string;
    entrypoint: { kind: 'esm_module'; module: string; export: string };
  }> = [];
  const remoteCompanions: Array<{
    channel_id: string;
    entrypoint: { kind: 'esm_module'; module: string; export: string };
  }> = [];
  const cliBinMap = new Map<string, { name: string; path: string }>();
  const extraEntrypointSet = new Set<string>();

  const rawEntrypoints = Array.isArray(old.entrypoints) ? old.entrypoints.filter(isRecord) : [];
  for (const ep of rawEntrypoints) {
    const rawKind =
      typeof ep.kind === 'string' && ep.kind.trim()
        ? ep.kind.trim()
        : typeof ep.entrypoint_kind === 'string' && ep.entrypoint_kind.trim()
          ? ep.entrypoint_kind.trim()
          : '';
    if (!rawKind) continue;

    if (rawKind === 'channel_provider' || rawKind === 'remote_companion_connector') {
      const moduleRef = typeof ep.module_ref === 'string' ? ep.module_ref.trim() : '';
      const exportName = typeof ep.export_name === 'string' ? ep.export_name.trim() : 'default';
      const channelId = toScopedId(
        typeof ep.entrypoint_id === 'string' ? ep.entrypoint_id : id,
        id,
      );
      if (moduleRef && isSafeRelativePosixPath(moduleRef)) {
        const entry = {
          channel_id: channelId,
          entrypoint: {
            kind: 'esm_module' as const,
            module: moduleRef.startsWith('./') ? moduleRef : `./${moduleRef}`,
            export: exportName || 'default',
          },
        };
        if (rawKind === 'channel_provider') {
          channels.push(entry);
        } else {
          remoteCompanions.push(entry);
        }
      }
      continue;
    }

    if (rawKind === 'cli') {
      const argv = Array.isArray(ep.argv)
        ? ep.argv.filter((a): a is string => typeof a === 'string' && a.trim().length > 0)
        : [];
      const first = argv[0];
      const second = argv[1];
      let targetPath = '';
      if (first && (first.startsWith('./') || first.startsWith('../') || first.includes('/'))) {
        targetPath = stripLeadingDotSlash(first);
      } else if (
        first
        && /^(?:python|python3|node|uv|bash|sh)$/.test(path.basename(first))
        && second
        && isSafeRelativePosixPath(second)
      ) {
        targetPath = stripLeadingDotSlash(second);
      } else if (typeof ep.path === 'string' && isSafeRelativePosixPath(ep.path)) {
        targetPath = stripLeadingDotSlash(ep.path);
      }
      if (targetPath && isSafeRelativePosixPath(targetPath)) {
        const binName = toKebabId(
          typeof ep.name === 'string'
            ? ep.name
            : typeof ep.entrypoint_id === 'string'
              ? ep.entrypoint_id
              : path.basename(targetPath, path.extname(targetPath)),
          id,
        );
        if (!cliBinMap.has(binName)) {
          cliBinMap.set(binName, { name: binName, path: targetPath });
        }
      } else {
        warnings.push(`CLI entrypoint '${String(ep.entrypoint_id ?? 'cli')}' had no relative executable path.`);
      }
      continue;
    }

    if (rawKind !== 'codex_skill' && rawKind !== 'opl_hosted_action_catalog') {
      extraEntrypointSet.add(rawKind);
    }
  }

  // mcp.json -> provides.mcp_servers
  const mcpServers: Array<{
    id: string;
    transport: 'stdio' | 'streamable_http';
    command?: string;
    args?: string[];
    url?: string;
  }> = [];
  if (oldMcp && isRecord(oldMcp.mcpServers)) {
    for (const [serverKey, serverVal] of Object.entries(oldMcp.mcpServers)) {
      if (!isRecord(serverVal)) continue;
      const serverId = toScopedId(serverKey);
      if (typeof serverVal.url === 'string' && isValidHttpUrl(serverVal.url)) {
        mcpServers.push({
          id: serverId,
          transport: 'streamable_http',
          url: serverVal.url,
        });
      } else if (typeof serverVal.command === 'string' && serverVal.command.trim()) {
        const rawCmd = rewritePluginRootString(serverVal.command.trim(), oldMcpNestedRel);
        const rawArgs = Array.isArray(serverVal.args)
          ? serverVal.args
              .filter((a): a is string => typeof a === 'string')
              .map((a) => rewritePluginRootString(a, oldMcpNestedRel))
          : undefined;
        mcpServers.push({
          id: serverId,
          transport: 'stdio',
          command: rawCmd,
          ...(rawArgs?.length ? { args: rawArgs } : {}),
        });
      }
    }
  }

  // Contribution handler
  let contributionHandler: NonNullable<OplPackageManifestV2['provides']>['contribution_handler'] =
    undefined;
  const abiObj = codexSurface && isRecord(codexSurface.app_contribution_abi)
    ? codexSurface.app_contribution_abi
    : null;
  if (abiObj && Array.isArray(abiObj.argv) && abiObj.argv.length > 0) {
    contributionHandler = {
      kind: 'cli',
      argv: abiObj.argv.filter((a): a is string => typeof a === 'string' && a.length > 0),
      transport: 'stdin_json_stdout_json',
    };
  } else if (adapterDoc && Array.isArray(adapterDoc.argv) && adapterDoc.argv.length > 0) {
    contributionHandler = {
      kind: 'cli',
      argv: adapterDoc.argv.filter((a): a is string => typeof a === 'string' && a.length > 0),
      transport: 'stdin_json_stdout_json',
    };
  } else if (adapterDoc && typeof adapterDoc.command === 'string' && adapterDoc.command.trim()) {
    const parts = adapterDoc.command.trim().split(/\s+/).filter(Boolean);
    if (parts.length > 0) {
      const candidateArgv = parts.map((p, i) =>
        i > 0 && isSafeRelativePosixPath(p) && !p.startsWith('./') ? `./${p}` : p,
      );
      const missingRel = candidateArgv.find((arg, i) => {
        if (!arg.startsWith('./') && !(i === 0 && arg.includes('/'))) return false;
        const rel = stripLeadingDotSlash(arg);
        const absRoot = path.join(repoRoot, rel);
        const absNested = nestedPluginRelDir ? path.join(repoRoot, nestedPluginRelDir, rel) : null;
        return !fs.existsSync(absRoot) && (!absNested || !fs.existsSync(absNested));
      });
      if (!missingRel) {
        contributionHandler = {
          kind: 'cli',
          argv: candidateArgv,
          transport: 'stdin_json_stdout_json',
        };
      } else {
        warnings.push(
          `Skipped app-contribution-adapter.json command because '${missingRel}' does not exist on disk.`,
        );
      }
    }
  }

  // 7. Declarative UI + Tier 3 MCP Apps
  const appContrib = isRecord(old.app_contributions) ? old.app_contributions : null;
  const rawDeclarative = isRecord(old.declarative) ? old.declarative : null;
  const rawNavList = Array.isArray(appContrib?.navigation)
    ? appContrib.navigation.filter(isRecord)
    : Array.isArray(rawDeclarative?.navigation)
      ? rawDeclarative.navigation.filter(isRecord)
      : [];
  const navReferencedViewIds = new Set<string>();
  for (const n of rawNavList) {
    if (typeof n.view_id === 'string' && n.view_id.trim()) {
      navReferencedViewIds.add(toScopedId(n.view_id));
    }
  }

  const rawViews = Array.isArray(appContrib?.views)
    ? appContrib.views.filter(isRecord)
    : Array.isArray(rawDeclarative?.views)
      ? rawDeclarative.views.filter(isRecord)
      : [];
  const rawCommands = Array.isArray(appContrib?.commands)
    ? appContrib.commands.filter(isRecord)
    : [];
  const rawUiEntries = Array.isArray(appContrib?.ui)
    ? appContrib.ui.filter(isRecord)
    : [];

  const views: NonNullable<NonNullable<NonNullable<OplPackageManifestV2['ui']>['declarative']>['views']> = [];
  const settingsForms: NonNullable<
    NonNullable<NonNullable<OplPackageManifestV2['ui']>['declarative']>['settings_forms']
  > = [];

  for (const [idx, v] of rawViews.entries()) {
    const viewId = toScopedId(
      typeof v.view_id === 'string'
        ? v.view_id
        : typeof v.id === 'string'
          ? v.id
          : `view-${idx + 1}`,
    );
    if (v.view_type === 'settings_form') {
      settingsForms.push({
        id: viewId,
        destination: normalizeSettingsDestination(v.settings_destination ?? v.destination),
        title: normI18n(v.title_i18n ?? v.title, viewId, viewId),
        data_ref:
          typeof v.data_ref === 'string' && v.data_ref.trim()
            ? v.data_ref.trim()
            : `${id}.${viewId}#state`,
        submit_action_ref:
          typeof v.submit_action_ref === 'string' && v.submit_action_ref.trim()
            ? v.submit_action_ref.trim()
            : `${id}.${viewId}#submit`,
      });
      continue;
    }

    const uiEntry = rawUiEntries.find((u) => toScopedId(String(u.view_id ?? '')) === viewId);
    const rawSlot = typeof uiEntry?.slot === 'string' ? uiEntry.slot : typeof v.slot === 'string' ? v.slot : '';
    let slot: 'settings.section' | 'runtime.detail' | 'composer.palette' | 'workbench.panel' =
      rawSlot === 'settings.section'
      || rawSlot === 'runtime.detail'
      || rawSlot === 'composer.palette'
      || rawSlot === 'workbench.panel'
        ? rawSlot
        : 'workbench.panel';
    // navigation cannot target settings.section views
    if (navReferencedViewIds.has(viewId) && slot === 'settings.section') {
      slot = 'workbench.panel';
    }

    const cmdIds = new Set(
      Array.isArray(v.command_ids)
        ? v.command_ids.filter((c): c is string => typeof c === 'string')
        : [],
    );
    const matchedCmds = rawCommands.filter(
      (c) => typeof c.command_id === 'string' && cmdIds.has(c.command_id),
    );

    views.push({
      id: viewId,
      view_type: normalizeViewType(v.view_type),
      slot,
      ...(slot === 'settings.section'
        ? {
            settings_destination: normalizeSettingsDestination(
              uiEntry?.settings_destination ?? v.settings_destination,
            ),
          }
        : {}),
      title: normI18n(v.title_i18n ?? v.title, viewId, viewId),
      data_ref:
        typeof v.data_ref === 'string' && v.data_ref.trim()
          ? v.data_ref.trim()
          : `${id}.${viewId}#state`,
      ...(isRecord(v.empty_state_i18n) || isRecord(v.empty_state)
        ? {
            empty_state: normI18n(
              v.empty_state_i18n ?? v.empty_state,
              'No data available',
              '暂无数据',
            ),
          }
        : {}),
      ...(matchedCmds.length > 0
        ? {
            actions: matchedCmds.map((c, cIdx) => ({
              id: toScopedId(
                typeof c.command_id === 'string' ? c.command_id : `action-${cIdx + 1}`,
              ),
              label: normI18n(c.label_i18n ?? c.label, String(c.command_id ?? 'Run')),
              action_ref:
                typeof c.action_ref === 'string' && c.action_ref.trim()
                  ? c.action_ref.trim()
                  : `${id}#${String(c.command_id ?? cIdx)}`,
              confirm: Boolean(c.confirmation_required),
              effect_timing: 'immediate' as const,
            })),
          }
        : {}),
    });
  }

  const viewIdSet = new Set(views.map((v) => v.id));
  const navItems: NonNullable<
    NonNullable<NonNullable<OplPackageManifestV2['ui']>['declarative']>['navigation']
  > = [];
  for (const [idx, n] of rawNavList.entries()) {
    const rawViewId = typeof n.view_id === 'string' ? toScopedId(n.view_id) : '';
    if (!rawViewId || !viewIdSet.has(rawViewId) || isReservedAppSettingsId(rawViewId)) {
      continue;
    }
    const navId = toScopedId(
      typeof n.navigation_id === 'string'
        ? n.navigation_id
        : typeof n.id === 'string'
          ? n.id
          : `tab-${idx + 1}`,
    );
    const safeNavId = isReservedAppSettingsId(navId) ? `${id}.${navId}` : navId;
    navItems.push({
      id: safeNavId,
      label: normI18n(n.label_i18n ?? n.label, safeNavId, safeNavId),
      view_id: rawViewId,
      ...(typeof n.sort_order === 'number' && Number.isInteger(n.sort_order)
        ? { sort_order: n.sort_order }
        : { sort_order: idx + 1 }),
    });
  }

  // Ensure contribution_handler exists when views or settings_forms are declared
  if ((views.length > 0 || settingsForms.length > 0) && !contributionHandler) {
    const hasRegularFile = (rel: string): boolean => {
      const full = path.join(repoRoot, rel);
      return fs.existsSync(full) && fs.statSync(full).isFile();
    };
    const binRel = `bin/${id}`;
    const hasBinEntry =
      hasRegularFile(binRel)
      || (nestedPluginRelDir !== null && hasRegularFile(`${nestedPluginRelDir}/${binRel}`));
    const isUsableEsmEntrypoint = (
      ep: { kind: 'esm_module'; module: string; export: string } | undefined,
    ): ep is { kind: 'esm_module'; module: string; export: string } => {
      if (!ep) return false;
      const rel = stripLeadingDotSlash(ep.module);
      return (
        isSafeRelativePosixPath(ep.module)
        && ep.export.trim().length > 0
        && (hasRegularFile(rel) || (nestedPluginRelDir !== null && hasRegularFile(`${nestedPluginRelDir}/${rel}`)))
      );
    };

    const hasAppContribPy =
      hasRegularFile('runtime/app_contribution.py')
      || (nestedPluginRelDir !== null && hasRegularFile(`${nestedPluginRelDir}/runtime/app_contribution.py`));
    const declaredCliBin =
      [...cliBinMap.values()].find(
        (b) => hasRegularFile(b.path) || (nestedPluginRelDir !== null && hasRegularFile(`${nestedPluginRelDir}/${b.path}`)),
      ) ?? [...cliBinMap.values()][0];
    const discoveredBinRel = (() => {
      for (const baseRel of ['bin', ...(nestedPluginRelDir ? [`${nestedPluginRelDir}/bin`] : [])]) {
        const binDir = path.join(repoRoot, baseRel);
        if (!fs.existsSync(binDir) || !fs.statSync(binDir).isDirectory()) continue;
        const first = fs
          .readdirSync(binDir, { withFileTypes: true })
          .filter((e) => e.isFile())
          .map((e) => e.name)
          .sort()[0];
        if (first) return `./bin/${first}`;
      }
      return null;
    })();

    if (hasBinEntry) {
      contributionHandler = {
        kind: 'cli',
        argv: [`./bin/${id}`, '--json', 'app-contribution'],
        transport: 'stdin_json_stdout_json',
      };
      warnings.push(
        `Synthesized fallback provides.contribution_handler for declarative UI views (${views.length}).`,
      );
    } else if (isUsableEsmEntrypoint(channels[0]?.entrypoint)) {
      contributionHandler = { ...channels[0].entrypoint };
      warnings.push(
        `Synthesized fallback provides.contribution_handler for declarative UI views (${views.length}).`,
      );
    } else if (isUsableEsmEntrypoint(remoteCompanions[0]?.entrypoint)) {
      contributionHandler = { ...remoteCompanions[0].entrypoint };
      warnings.push(
        `Synthesized fallback provides.contribution_handler for declarative UI views (${views.length}).`,
      );
    } else if (hasAppContribPy) {
      contributionHandler = {
        kind: 'cli',
        argv: ['python3', './runtime/app_contribution.py'],
        transport: 'stdin_json_stdout_json',
      };
      warnings.push(
        `Synthesized fallback provides.contribution_handler from runtime/app_contribution.py for declarative UI views (${views.length}).`,
      );
    } else if (declaredCliBin) {
      const binRelPath = declaredCliBin.path.startsWith('./')
        ? declaredCliBin.path
        : `./${declaredCliBin.path}`;
      contributionHandler = {
        kind: 'cli',
        argv: [binRelPath, '--json', 'app-contribution'],
        transport: 'stdin_json_stdout_json',
      };
      warnings.push(
        `Synthesized fallback provides.contribution_handler from cli_bin '${declaredCliBin.name}' for declarative UI views (${views.length}).`,
      );
    } else if (discoveredBinRel) {
      contributionHandler = {
        kind: 'cli',
        argv: [discoveredBinRel, '--json', 'app-contribution'],
        transport: 'stdin_json_stdout_json',
      };
      warnings.push(
        `Synthesized fallback provides.contribution_handler from '${discoveredBinRel}' for declarative UI views (${views.length}).`,
      );
    } else {
      views.length = 0;
      settingsForms.length = 0;
      navItems.length = 0;
      warnings.push(
        'Omitted ui.declarative because no valid provides.contribution_handler entrypoint exists on disk.',
      );
    }
  }

  // MiniApp -> ui.mcp_apps
  const miniapp = presentation && isRecord(presentation.miniapp) ? presentation.miniapp : null;
  const mcpApps: NonNullable<NonNullable<OplPackageManifestV2['ui']>['mcp_apps']> = [];
  if (miniapp && typeof miniapp.dedicated_resource_uri === 'string' && /^ui:\/\/[a-z0-9]/.test(miniapp.dedicated_resource_uri)) {
    if (mcpServers.length === 0) {
      mcpServers.push({
        id: `${id}-mcp`,
        transport: 'stdio',
        command: `./bin/${id}`,
        args: ['mcp'],
      });
      warnings.push('Synthesized provides.mcp_servers entry for declared presentation.miniapp.');
    }
    mcpApps.push({
      id: `${id}.workbench`,
      title: name,
      mcp_server_id: mcpServers[0].id,
      resource_uri: miniapp.dedicated_resource_uri,
      host_capabilities: ['theme_sync', 'connect_package_grant'],
    });
  }

  // 8. Distribution & host_hints.codex
  const carrierCfg =
    codexSurface && isRecord(codexSurface.configured_codex_plugin_carrier)
      ? codexSurface.configured_codex_plugin_carrier
      : null;
  const rawPubRef =
    typeof carrierCfg?.publication_ref === 'string' ? carrierCfg.publication_ref.trim() : '';
  const ociRef = rawPubRef ? rawPubRef.replace(/:[^/]+$/, '') : undefined;
  const visibility =
    old.visibility === 'authorized_only' || old.visibility === 'public'
      ? old.visibility
      : 'public';

  // Build provides object
  const stagesRef =
    intent === 'agent' && typeof old.domain_descriptor_ref === 'string'
      ? fs.existsSync(path.join(repoRoot, 'agent', 'stages', 'manifest.json'))
        ? 'agent/stages/manifest.json'
        : isSafeRelativePosixPath(old.domain_descriptor_ref)
          ? stripLeadingDotSlash(old.domain_descriptor_ref)
          : undefined
      : undefined;

  const providesObj: OplPackageManifestV2['provides'] = {
    ...(stagesRef ? { agent: { stages_ref: stagesRef } } : {}),
    ...(cliBinMap.size > 0 ? { cli_bin: [...cliBinMap.values()] } : {}),
    ...(skills.length > 0 ? { skills } : {}),
    ...(mcpServers.length > 0 ? { mcp_servers: mcpServers } : {}),
    ...(channels.length > 0 ? { channels } : {}),
    ...(remoteCompanions.length > 0 ? { remote_companion_connectors: remoteCompanions } : {}),
    ...(contributionHandler ? { contribution_handler: contributionHandler } : {}),
  };

  const hasProvides = Object.keys(providesObj).length > 0;
  const hasDeclarative = navItems.length > 0 || settingsForms.length > 0 || views.length > 0;
  const uiObj: OplPackageManifestV2['ui'] =
    hasDeclarative || mcpApps.length > 0
      ? {
          ...(hasDeclarative
            ? {
                declarative: {
                  ...(navItems.length > 0 ? { navigation: navItems } : {}),
                  ...(settingsForms.length > 0 ? { settings_forms: settingsForms } : {}),
                  ...(views.length > 0 ? { views } : {}),
                },
              }
            : {}),
          ...(mcpApps.length > 0 ? { mcp_apps: mcpApps } : {}),
        }
      : undefined;

  const syncEnabled = codexSurface?.interaction_mode !== 'headless_internal';
  const pluginName =
    (typeof oldCodex?.name === 'string' && oldCodex.name.trim())
    || (typeof codexSurface?.plugin_id === 'string' && codexSurface.plugin_id.trim())
    || id;
  const codexCapabilities = Array.isArray(oldCodexIface?.capabilities)
    ? oldCodexIface.capabilities.filter((c): c is string => typeof c === 'string' && c.trim().length > 0)
    : undefined;

  const candidateV2: Record<string, unknown> = {
    schema_version: 'opl.package.v2',
    identity: {
      id,
      version,
      intent,
      name,
      summary,
      ...(longDesc ? { description: normI18n(null, longDesc, longDesc) } : {}),
      publisher,
      ...(license ? { license } : {}),
      ...(iconRel ? { icon: iconRel } : {}),
      ...(repository ? { repository } : {}),
      ...(homepage ? { homepage } : {}),
      ...(keywords?.length ? { keywords } : {}),
      ...(routingSummary ? { routing_summary: routingSummary } : {}),
      ...(defaultPrompts?.length ? { default_prompts: defaultPrompts } : {}),
      ...(homeShortcuts?.length ? { home_shortcuts: homeShortcuts } : {}),
    },
    dependencies: {
      opl_base: '^2.0.0',
      ...(depMap.size > 0 ? { packages: [...depMap.values()] } : {}),
    },
    ...(permissions ? { permissions } : {}),
    ...(hasProvides ? { provides: providesObj } : {}),
    ...(uiObj ? { ui: uiObj } : {}),
    distribution: {
      ...(ociRef ? { oci: ociRef } : {}),
      visibility,
      ...(typeof old.access_policy_ref === 'string' && old.access_policy_ref.trim()
        ? { access_policy_ref: old.access_policy_ref.trim() }
        : {}),
      ...(typeof old.credential_provider === 'string' && old.credential_provider.trim()
        ? { credential_provider: old.credential_provider.trim() }
        : {}),
    },
    host_hints: {
      codex: {
        sync_enabled: syncEnabled,
        plugin_name: pluginName,
        ...(typeof oldCodexIface?.category === 'string' && oldCodexIface.category.trim()
          ? { category: oldCodexIface.category.trim() }
          : {}),
        ...(typeof oldCodexIface?.brandColor === 'string' && /^#[0-9A-Fa-f]{6}$/.test(oldCodexIface.brandColor)
          ? { brand_color: oldCodexIface.brandColor }
          : {}),
        ...(codexCapabilities?.length ? { capabilities: codexCapabilities } : {}),
      },
    },
  };

  const validated = parsePackageManifestV2(candidateV2);

  // 9. Build cleanup report
  for (const relCandidate of [
    '.codex-plugin/plugin.json',
    'plugin.json',
    'contracts/carrier_projection.json',
    'contracts/opl_agent_package_manifest.json',
    'app-contribution-adapter.json',
  ]) {
    if (fs.existsSync(path.join(repoRoot, relCandidate))) {
      filesToDelete.add(relCandidate);
    }
  }
  for (const pluginSub of pluginSubdirs) {
    dirsToDelete.add(`plugins/${pluginSub}`);
  }
  if (nestedPluginRelDir) {
    const relocationSet = new Set(relocations.map((r) => `${r.from}=>${r.to}`));
    const addRelocIfNeeded = (subRel: string, kind: 'file' | 'directory') => {
      const cleanSub = stripLeadingDotSlash(subRel);
      if (!cleanSub || !isSafeRelativePosixPath(cleanSub)) return;
      const fromRel = `${nestedPluginRelDir}/${cleanSub}`;
      const fromAbs = path.join(repoRoot, fromRel);
      const toAbs = path.join(repoRoot, cleanSub);
      const key = `${fromRel}=>${cleanSub}`;
      if (relocationSet.has(key)) return;
      if (fs.existsSync(fromAbs) && !fs.existsSync(toAbs)) {
        const stat = fs.statSync(fromAbs);
        if ((kind === 'directory' && stat.isDirectory()) || (kind === 'file' && stat.isFile())) {
          relocations.push({ from: fromRel, to: cleanSub, kind });
          relocationSet.add(key);
        }
      }
    };

    for (const stdDir of ['bin', 'workbench', 'runtime', 'scripts', 'openclaw']) {
      addRelocIfNeeded(stdDir, 'directory');
    }

    const referencedSubpaths: string[] = [];
    for (const srv of mcpServers) {
      if (srv.command && (srv.command.startsWith('./') || srv.command.includes('/'))) {
        referencedSubpaths.push(srv.command);
      }
      for (const arg of srv.args ?? []) {
        if (arg.startsWith('./') || arg.includes('/')) {
          referencedSubpaths.push(arg);
        }
      }
    }
    for (const bin of cliBinMap.values()) {
      referencedSubpaths.push(bin.path);
    }
    for (const ch of channels) {
      referencedSubpaths.push(ch.entrypoint.module);
    }
    for (const rc of remoteCompanions) {
      referencedSubpaths.push(rc.entrypoint.module);
    }
    if (contributionHandler?.kind === 'cli') {
      for (const arg of contributionHandler.argv) {
        if (arg.startsWith('./') || arg.includes('/')) {
          referencedSubpaths.push(arg);
        }
      }
    } else if (contributionHandler?.kind === 'esm_module') {
      referencedSubpaths.push(contributionHandler.module);
    }
    for (const refPath of referencedSubpaths) {
      const cleanRef = stripLeadingDotSlash(refPath);
      const topSeg = cleanRef.split('/')[0];
      if (
        !topSeg
        || topSeg === '.'
        || topSeg === '..'
        || topSeg === 'plugins'
        || topSeg === 'skills'
        || topSeg === 'assets'
      ) {
        continue;
      }
      const nestedTopAbs = path.join(repoRoot, nestedPluginRelDir, topSeg);
      if (fs.existsSync(nestedTopAbs)) {
        addRelocIfNeeded(topSeg, fs.statSync(nestedTopAbs).isDirectory() ? 'directory' : 'file');
      }
    }
  }

  const execRes = applyMigrationPlan({
    repoRoot,
    rootManifestPath,
    manifestJsonText: `${JSON.stringify(validated, null, 2)}\n`,
    relocations,
    filesToDelete,
    dirsToDelete,
    apply: Boolean(options.apply),
    clean: Boolean(options.clean),
  });
  const applied = execRes.applied;
  const cleaned = execRes.cleaned;

  return {
    manifest: validated,
    source_manifest_path: sourceManifestPath,
    target_manifest_path: rootManifestPath,
    nested_layout_detected: nestedLayoutDetected,
    nested_plugin_dir: nestedPluginRelDir,
    extra_entrypoints: [...extraEntrypointSet].sort(),
    applied,
    cleaned,
    cleanup_report: {
      files_to_delete: [...filesToDelete].sort(),
      dirs_to_delete: [...dirsToDelete].sort(),
      relocations,
      warnings,
    },
  };
}
