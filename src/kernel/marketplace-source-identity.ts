export function githubMarketplaceSourceIdentity(value: string) {
  const slug = value.match(/^([A-Za-z0-9][A-Za-z0-9-]*)\/([A-Za-z0-9][A-Za-z0-9._-]*)$/);
  if (slug) return `${slug[1]!.toLowerCase()}/${slug[2]!.toLowerCase()}`;
  const ssh = value.match(
    /^ssh:\/\/git@ssh\.github\.com:443\/([A-Za-z0-9][A-Za-z0-9-]*)\/([A-Za-z0-9][A-Za-z0-9._-]*)\.git$/,
  );
  if (ssh) return `${ssh[1]!.toLowerCase()}/${ssh[2]!.toLowerCase()}`;
  try {
    const source = new URL(value);
    if (source.protocol !== 'https:'
      || source.hostname.toLowerCase() !== 'github.com'
      || source.port
      || source.username
      || source.password
      || source.search
      || source.hash) {
      return null;
    }
    const parts = source.pathname.split('/').filter(Boolean);
    if (parts.length !== 2) return null;
    const owner = parts[0]!;
    const repository = parts[1]!.replace(/\.git$/, '');
    if (!/^[A-Za-z0-9][A-Za-z0-9-]*$/.test(owner)
      || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(repository)) {
      return null;
    }
    return `${owner.toLowerCase()}/${repository.toLowerCase()}`;
  } catch {
    return null;
  }
}

export function sameMarketplaceSource(left: string | null, right: string) {
  if (left === right) return true;
  if (!left) return false;
  const leftIdentity = githubMarketplaceSourceIdentity(left);
  const rightIdentity = githubMarketplaceSourceIdentity(right);
  return leftIdentity !== null && leftIdentity === rightIdentity;
}
