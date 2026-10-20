import { allowDependencyVersionOverride } from '../dependency-resolution-mode.ts';

export type OplCompanionToolActionStatus = 'ready' | 'installed' | 'updated' | 'missing' | 'failed';
export const OPL_COMPANION_TOOL_IDS = [
  'officecli',
  'mineru-open-api',
  'agent-reach',
  'gh-stack',
  'ffmpeg',
] as const;
export type OplCompanionToolId = typeof OPL_COMPANION_TOOL_IDS[number];
export type OplCompanionToolCurrentness = 'current' | 'update_available' | 'unknown' | 'missing';
export type OplCompanionNetworkAccess = 'allowed' | 'forbidden';

export type OplCompanionToolSyncItem = {
  tool_id: OplCompanionToolId;
  binary_path: string | null;
  version: string | null;
  status: OplCompanionToolActionStatus;
  action: 'none' | 'install' | 'update';
  note: string | null;
  ownership: 'opl_managed' | 'app_bundled' | 'user_managed' | 'global_path' | 'missing';
  content_sha256: string | null;
  latest_version: string | null;
  currentness: OplCompanionToolCurrentness;
  latest_version_source: 'github_tags' | 'npm_registry' | 'configured' | null;
  binary_paths?: Record<string, string>;
  entrypoint?: string[];
  health_check?: {
    adapter: 'agent_reach_doctor';
    status: 'ready' | 'degraded' | 'invalid';
    required_channels: string[];
    ready_channels: string[];
    failed_channels: string[];
    github_api_check?: 'ready' | 'failed';
  };
};

export type ParsedVersion = {
  version: string;
  parts: [number, number, number];
};

export type LatestToolVersion = {
  version: string | null;
  source: OplCompanionToolSyncItem['latest_version_source'];
};

export function parseVersion(value: string | null | undefined): ParsedVersion | null {
  const match = value?.match(/(?:^|[^0-9])(\d+)\.(\d+)\.(\d+)(?:[^0-9]|$)/);
  if (!match) return null;
  return {
    version: `${Number(match[1])}.${Number(match[2])}.${Number(match[3])}`,
    parts: [Number(match[1]), Number(match[2]), Number(match[3])],
  };
}

export function compareVersions(left: ParsedVersion, right: ParsedVersion) {
  for (let index = 0; index < left.parts.length; index += 1) {
    const difference = left.parts[index] - right.parts[index];
    if (difference !== 0) return difference;
  }
  return 0;
}

export function maxVersion(values: string[]) {
  return values
    .map((value) => parseVersion(value))
    .filter((value): value is ParsedVersion => Boolean(value))
    .sort(compareVersions)
    .at(-1)?.version ?? null;
}

export function configuredLatestVersion(toolId: OplCompanionToolId) {
  if (!allowDependencyVersionOverride()) return null;
  const key = {
    officecli: 'OPL_OFFICECLI_LATEST_VERSION',
    'mineru-open-api': 'OPL_MINERU_OPEN_API_LATEST_VERSION',
    'agent-reach': 'OPL_AGENT_REACH_LATEST_VERSION',
    'gh-stack': 'OPL_GH_STACK_LATEST_VERSION',
    ffmpeg: 'OPL_FFMPEG_LATEST_VERSION',
  }[toolId];
  const value = process.env[key]?.trim();
  return value ? parseVersion(value)?.version ?? value : null;
}

export function withCurrentness(
  tool: OplCompanionToolSyncItem,
  latest: LatestToolVersion | null = null,
): OplCompanionToolSyncItem {
  if (!tool.binary_path) {
    return { ...tool, latest_version: latest?.version ?? null, currentness: 'missing', latest_version_source: latest?.source ?? null };
  }
  const current = parseVersion(tool.version);
  const target = parseVersion(latest?.version);
  return {
    ...tool,
    latest_version: target?.version ?? latest?.version ?? null,
    currentness: current && target
      ? compareVersions(current, target) >= 0 ? 'current' : 'update_available'
      : 'unknown',
    latest_version_source: latest?.source ?? null,
  };
}
