import fs from 'node:fs';
import path from 'node:path';

import { isRecord } from './contract-validation.ts';
import { parseJsonText } from './json-file.ts';
import { sameMarketplaceSource } from './marketplace-source-identity.ts';

function pathWithin(root: string, candidate: string) {
  return candidate === root || candidate.startsWith(`${root}${path.sep}`);
}

export function runtimeRootContainsDescriptor(root: string, descriptorRef: string) {
  const descriptorPath = path.resolve(root, descriptorRef);
  if (!pathWithin(root, descriptorPath)) return false;
  try {
    const stat = fs.lstatSync(descriptorPath);
    return stat.isFile()
      && !stat.isSymbolicLink()
      && pathWithin(root, fs.realpathSync.native(descriptorPath));
  } catch {
    return false;
  }
}

export function gitMarketplaceRuntimeRoot(
  pluginSourcePath: string,
  marketplaceSource: string,
  descriptorRef: string,
) {
  let candidate = path.dirname(pluginSourcePath);
  while (candidate !== path.dirname(candidate)) {
    const markerPath = path.join(candidate, '.codex-marketplace-install.json');
    try {
      const stat = fs.lstatSync(markerPath);
      const marker = parseJsonText(fs.readFileSync(markerPath, 'utf8'));
      if (!stat.isFile() || stat.isSymbolicLink() || !isRecord(marker)) return null;
      const source = typeof marker.source === 'string' ? marker.source.trim() : '';
      return source
        && sameMarketplaceSource(source, marketplaceSource)
        && runtimeRootContainsDescriptor(candidate, descriptorRef)
        ? candidate
        : null;
    } catch {
      candidate = path.dirname(candidate);
    }
  }
  // Marketplace carriers may be materialized without the optional marker. In
  // that layout the plugin lives under a repository checkout whose root still
  // carries the declared runtime descriptor. Accept only that explicit
  // checkout shape; never infer a parent from the plugin name alone.
  candidate = path.dirname(pluginSourcePath);
  while (candidate !== path.dirname(candidate)) {
    if (runtimeRootContainsDescriptor(candidate, descriptorRef)
      && fs.existsSync(path.join(candidate, 'opl-package.json'))
      && sameMarketplaceSource(marketplaceSource, 'gaofeng21cn/redcube-ai')) {
      return candidate;
    }
    candidate = path.dirname(candidate);
  }
  return null;
}
