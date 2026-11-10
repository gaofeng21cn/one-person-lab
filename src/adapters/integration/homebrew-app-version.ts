import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { isRecord } from '../../kernel/contract-validation.ts';

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/** Display identities are read from App-owned artifacts, never decoded from updater numbers. */
export function readHomebrewAppVersionPresentation(raw: Record<string, unknown>, installedVersion: string | null, env: NodeJS.ProcessEnv) {
  // The App publisher declares Cask version as updater_version,display_version.
  // Bind the display member to the exact declared release URL before projecting it.
  const versions = text(raw.version)?.split(',').map(value => value.trim()) ?? [];
  const release = /^https:\/\/github\.com\/gaofeng21cn\/one-person-lab-app\/releases\/download\/v([^/]+)\//.exec(String(raw.url ?? ''))?.[1];
  const sourceDisplay = release && versions.length === 2 && versions[1] === release ? release
    : release && versions.length === 1 && versions[0] === release ? release : null;
  const result = {
    available_display_version: sourceDisplay,
    installed_display_version: installedVersion && sourceDisplay && versions[0] === installedVersion ? sourceDisplay : null,
    installed_build_kind: null as 'local-development' | null,
    installed_build_id: null as string | null,
  };
  if (!installedVersion) return result;
  const target = Array.isArray(raw.artifacts) ? raw.artifacts.filter(isRecord)
    .find(artifact => Array.isArray(artifact.app) && typeof artifact.target === 'string')?.target : null;
  const appPath = text(env.OPL_APP_INSTALLED_PATH) ?? text(target);
  if (!appPath || !path.isAbsolute(appPath) || !appPath.endsWith('.app')) return result;
  const infoPath = path.join(appPath, 'Contents', 'Info.plist');
  if (!fs.existsSync(infoPath)) return result;
  let info: unknown;
  try {
    info = JSON.parse(execFileSync(env.OPL_PLUTIL_BIN?.trim() || 'plutil', ['-convert', 'json', '-o', '-', '--', infoPath], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 1_000, maxBuffer: 256 * 1024,
    }));
  } catch { return result; }
  if (!isRecord(info) || info.CFBundleIdentifier !== 'cn.onepersonlab.opl'
    || (text(info.CFBundleShortVersionString) ?? text(info.CFBundleVersion)) !== installedVersion) return result;
  if (info.OPLBuildKind === 'local-development') {
    result.installed_build_kind = 'local-development';
    result.installed_build_id = text(info.OPLLocalBuildID);
  }
  // Match the existing App manual-install identity reader's Full manifest paths.
  for (const resource of ['opl-studio-full-runtime', 'opl-full-runtime']) {
    try {
      const manifest: unknown = JSON.parse(fs.readFileSync(path.join(appPath, 'Contents', 'Resources', resource, 'manifest', 'full-package-manifest.json'), 'utf8'));
      if (isRecord(manifest) && isRecord(manifest.carrier) && manifest.carrier.bundle_id === info.CFBundleIdentifier && text(manifest.version)) {
        result.installed_display_version = text(manifest.version);
        break;
      }
    } catch { /* Standard installations may only have the declared Cask identity. */ }
  }
  return result;
}
