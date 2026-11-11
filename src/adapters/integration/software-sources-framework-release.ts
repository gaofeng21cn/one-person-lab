import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { isRecord } from '../../kernel/contract-validation.ts';
import { softwareSourcesFile } from './software-sources-store.ts';
import { readFrameworkChannelEntry } from './system-installation/framework-self-update-parts/channel-artifact.ts';
import { resolveFrameworkArtifactRef } from './system-installation/release-channel.ts';

type ChannelEntry = ReturnType<typeof readFrameworkChannelEntry>;
function cacheFile(env: NodeJS.ProcessEnv) {
  return path.join(path.dirname(softwareSourcesFile(env)), 'framework-channel-readback.json');
}

/** Only upstream release metadata is cached. Installation and pending state stay owner reads. */
export function readFrameworkSoftwareRelease(env: NodeJS.ProcessEnv = process.env) {
  try {
    const cached: unknown = JSON.parse(fs.readFileSync(cacheFile(env), 'utf8'));
    if (!isRecord(cached) || cached.source_ref !== resolveFrameworkArtifactRef()
      || typeof cached.checked_at !== 'string' || !Number.isFinite(Date.parse(cached.checked_at))) throw new Error();
    const entry = cached.entry;
    if (entry !== null && (!isRecord(entry)
      || typeof entry.channel_version !== 'string' || !/^\d+\.\d+\.\d+$/.test(entry.channel_version)
      || typeof entry.artifact_digest !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(entry.artifact_digest)
      || typeof entry.artifact !== 'string' || !entry.artifact.endsWith(`@${entry.artifact_digest}`)
      || typeof entry.source_archive_sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(entry.source_archive_sha256)
      || typeof entry.source_git_head_sha !== 'string' || !/^[0-9a-f]{40}$/.test(entry.source_git_head_sha))) throw new Error();
    return { entry: entry as ChannelEntry | null, refresh_required: Date.now() - Date.parse(cached.checked_at) >= 60_000 };
  } catch { return { entry: null, refresh_required: true }; }
}

export function refreshFrameworkSoftwareRelease(env: NodeJS.ProcessEnv = process.env,
  readChannel: () => ChannelEntry = readFrameworkChannelEntry) {
  let entry: ChannelEntry | null = null;
  try { entry = readChannel(); } catch { /* An unavailable source is unknown, never current. */ }
  const file = cacheFile(env);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporary, JSON.stringify({ source_ref: resolveFrameworkArtifactRef(), checked_at: new Date().toISOString(), entry }), { mode: 0o600, flag: 'wx' });
    fs.renameSync(temporary, file);
  } finally { fs.rmSync(temporary, { force: true }); }
  return entry;
}
