import crypto from 'node:crypto';
import fs from 'node:fs';
import { KernelError } from '@opl/core';
import { resolveSafePackagePath, type PackService } from '@opl/pack';
import { readCodexUserInstructions, writeCodexUserInstructions } from './codex-user-instructions.ts';

function readFlowDefault(pack: PackService) {
  const flow = pack.inspect('opl-flow');
  const base = {
    surface_kind: 'opl_flow_default_user_instructions.v1',
    source: 'installed_owner_descriptor',
    package_version: flow?.version ?? null,
    source_path: null, content: null, sha256: null,
  };
  if (!flow?.enabled || flow.origin === 'external') {
    return { ...base, status: 'unavailable' as const, reason: 'opl_flow_package_not_installed_or_enabled' };
  }

  try {
    const source = (relative: string) => resolveSafePackagePath(flow.install_path, relative, {
      allowSymlinks: flow.install_mode === 'dev_link',
    });
    const descriptor = JSON.parse(fs.readFileSync(source('profile/manifest.json'), 'utf8'));
    if (descriptor?.schema !== 'opl_flow_profile_manifest.v2' || typeof descriptor.runtime_profile?.path !== 'string') {
      throw new Error('Missing Flow runtime Profile declaration.');
    }
    const sourcePath = source(descriptor.runtime_profile.path);
    const stat = fs.statSync(sourcePath);
    if (!stat.isFile() || stat.size > 256 * 1024) throw new Error('Invalid Flow template.');
    const bytes = fs.readFileSync(sourcePath);
    const content = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    if (!content.trim() || content.includes('\0')) throw new Error('Invalid Flow template.');
    return { ...base, status: 'available' as const, reason: null, content, source_path: sourcePath,
      sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
  } catch {
    return { ...base, status: 'invalid' as const, reason: 'installed_owner_profile_source_missing_or_invalid' };
  }
}

export function readCodexPersonalization(pack: PackService) {
  let userAgents;
  try {
    userAgents = readCodexUserInstructions();
  } catch {
    userAgents = { status: 'unavailable', source: 'codex_home_agents_md' };
  }
  return {
    surface_kind: 'opl_codex_personalization.v1',
    user_agents: userAgents,
    opl_flow_default_user_agents: readFlowDefault(pack),
  };
}

export function restoreCodexUserInstructions(
  pack: PackService, stateDir: string, payload: Record<string, unknown>, dryRun: boolean,
) {
  const template = readFlowDefault(pack);
  if (template.status !== 'available') {
    throw new KernelError('INVALID_INPUT', 'The installed OPL Flow package has no available default Profile.');
  }
  const result = writeCodexUserInstructions(stateDir, { ...payload, content: template.content }, dryRun);
  return { codex_user_instructions_restore: {
    surface_kind: 'opl_codex_user_instructions_restore.v1', status: dryRun ? 'dry_run' : 'restored',
    default_source: template, write: result.codex_user_instructions_write,
  } };
}
