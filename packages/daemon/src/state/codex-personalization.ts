import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { KernelError } from '@opl/core';
import { normalizeRelativePosixPath, resolveConfiguredCodexHome, resolveSafePackagePath, type PackService } from '@opl/pack';
import { readCodexUserInstructions, writeCodexUserInstructions } from './codex-user-instructions.ts';
import { fileStatFingerprint } from './file-stat-cache.ts';

function readFlowDefault(pack: PackService) {
  const flow = pack.inspect('opl-flow');
  const base = {
    surface_kind: 'opl_flow_default_user_instructions.v1',
    source: 'installed_owner_descriptor',
    package_version: flow?.version ?? null,
    source_path: null, content: null, sha256: null,
  };
  if (!flow?.enabled || flow.origin === 'external') {
    return { templatePath: null, value: { ...base, status: 'unavailable' as const, reason: 'opl_flow_package_not_installed_or_enabled' } };
  }

  try {
    const source = (relative: string) => resolveSafePackagePath(flow.install_path, relative, {
      allowSymlinks: flow.install_mode === 'dev_link',
    });
    const descriptor = JSON.parse(fs.readFileSync(source('profile/manifest.json'), 'utf8'));
    if (descriptor?.schema !== 'opl_flow_profile_manifest.v2' || typeof descriptor.runtime_profile?.path !== 'string') {
      throw new Error('Missing Flow runtime Profile declaration.');
    }
    const relative = normalizeRelativePosixPath(descriptor.runtime_profile.path);
    const sourcePath = source(relative);
    const stat = fs.statSync(sourcePath);
    if (!stat.isFile() || stat.size > 256 * 1024) throw new Error('Invalid Flow template.');
    const bytes = fs.readFileSync(sourcePath);
    const content = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    if (!content.trim() || content.includes('\0')) throw new Error('Invalid Flow template.');
    return {
      templatePath: path.join(flow.install_path, relative),
      value: { ...base, status: 'available' as const, reason: null, content, source_path: sourcePath,
        sha256: crypto.createHash('sha256').update(bytes).digest('hex') },
    };
  } catch {
    return { templatePath: null, value: { ...base, status: 'invalid' as const, reason: 'installed_owner_profile_source_missing_or_invalid' } };
  }
}

export type CodexPersonalizationSnapshot = {
  readonly surface_kind: 'opl_codex_personalization.v1';
  readonly user_agents: ReturnType<typeof readCodexUserInstructions> | { readonly status: 'unavailable'; readonly source: 'codex_home_agents_md' };
  readonly opl_flow_default_user_agents: ReturnType<typeof readFlowDefault>['value'];
};

export function createCodexPersonalizationReader() {
  let cachedUser: { key: string; value: CodexPersonalizationSnapshot['user_agents'] } | null = null;
  let cachedFlow: {
    flowKey: string;
    profileDirPath: string;
    profileDirStat: string;
    manifestPath: string;
    manifestStat: string;
    templatePath: string | null;
    templateStat: string;
    value: ReturnType<typeof readFlowDefault>['value'];
  } | null = null;
  let cachedSnapshot: CodexPersonalizationSnapshot | null = null;

  return {
    invalidate() {
      cachedUser = null;
      cachedFlow = null;
      cachedSnapshot = null;
    },
    read(pack: PackService): CodexPersonalizationSnapshot {
      const targetPath = path.join(resolveConfiguredCodexHome(), 'AGENTS.md');
      const userKey = `${targetPath}\0${fileStatFingerprint(targetPath, false)}`;
      if (!cachedUser || cachedUser.key !== userKey) {
        let userAgents: CodexPersonalizationSnapshot['user_agents'];
        try {
          userAgents = readCodexUserInstructions();
        } catch {
          userAgents = { status: 'unavailable', source: 'codex_home_agents_md' };
        }
        cachedUser = { key: userKey, value: userAgents };
        cachedSnapshot = null;
      }

      const flow = pack.inspect('opl-flow');
      const flowKey = !flow?.enabled || flow.origin === 'external'
        ? `unavailable:${flow?.version ?? ''}`
        : [flow.version, flow.install_mode, flow.install_path, flow.content_digest].join('\0');
      const profileDirPath = flow ? path.join(flow.install_path, 'profile') : '';
      const manifestPath = flow ? path.join(profileDirPath, 'manifest.json') : '';
      const followSymlinks = flow?.install_mode === 'dev_link';
      const profileDirStat = flow ? fileStatFingerprint(profileDirPath, followSymlinks) : 'missing';
      const manifestStat = flow ? fileStatFingerprint(manifestPath, followSymlinks) : 'missing';
      const flowCacheHit = cachedFlow
        && cachedFlow.flowKey === flowKey
        && cachedFlow.profileDirPath === profileDirPath
        && cachedFlow.profileDirStat === profileDirStat
        && cachedFlow.manifestPath === manifestPath
        && cachedFlow.manifestStat === manifestStat
        && cachedFlow.value.status !== 'invalid'
        && (!cachedFlow.templatePath || fileStatFingerprint(cachedFlow.templatePath, followSymlinks) === cachedFlow.templateStat);
      if (!flowCacheHit) {
        const { value, templatePath } = readFlowDefault(pack);
        cachedFlow = {
          flowKey,
          profileDirPath,
          profileDirStat,
          manifestPath,
          manifestStat,
          templatePath,
          templateStat: templatePath ? fileStatFingerprint(templatePath, followSymlinks) : 'none',
          value,
        };
        cachedSnapshot = null;
      }

      return (cachedSnapshot ??= {
        surface_kind: 'opl_codex_personalization.v1',
        user_agents: cachedUser.value,
        opl_flow_default_user_agents: cachedFlow!.value,
      });
    },
  };
}

const defaultReader = createCodexPersonalizationReader();

export function readCodexPersonalization(pack: PackService) {
  return defaultReader.read(pack);
}

export function restoreCodexUserInstructions(
  pack: PackService, stateDir: string, payload: Record<string, unknown>, dryRun: boolean,
) {
  const { value: template } = readFlowDefault(pack);
  if (template.status !== 'available') {
    throw new KernelError('INVALID_INPUT', 'The installed OPL Flow package has no available default Profile.');
  }
  const result = writeCodexUserInstructions(stateDir, { ...payload, content: template.content }, dryRun);
  return { codex_user_instructions_restore: {
    surface_kind: 'opl_codex_user_instructions_restore.v1', status: dryRun ? 'dry_run' : 'restored',
    default_source: template, write: result.codex_user_instructions_write,
  } };
}
