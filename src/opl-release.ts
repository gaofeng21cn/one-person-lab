const DEFAULT_OPL_RELEASE_VERSION = '26.4.27';
const DEFAULT_OPL_RELEASE_REPO = 'gaofeng21cn/one-person-lab';

export function getOplReleaseVersion(): string {
  return process.env.OPL_RELEASE_VERSION?.trim() || DEFAULT_OPL_RELEASE_VERSION;
}

export function getOplReleaseRepo(): string {
  return process.env.OPL_RELEASE_REPO?.trim() || DEFAULT_OPL_RELEASE_REPO;
}

export function buildOplReleaseTag(version = getOplReleaseVersion()): string {
  return `v${version}`;
}

export function buildOplGuiArtifactName(options: {
  platform: 'macos' | 'windows' | 'linux';
  arch: string;
  ext: 'dmg' | 'zip' | 'exe' | 'deb' | 'rpm';
  version?: string;
}): string {
  const version = options.version ?? getOplReleaseVersion();
  if (options.platform === 'macos') {
    return `One.Person.Lab-${version}-mac-${options.arch}.${options.ext}`;
  }
  if (options.platform === 'windows') {
    return `One.Person.Lab-${version}-win-${options.arch}.${options.ext}`;
  }
  return `One.Person.Lab-${version}-linux-${options.arch}.${options.ext}`;
}
