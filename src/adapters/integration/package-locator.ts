import fs from 'node:fs';
import path from 'node:path';

import { FrameworkContractError } from '../../kernel/contract-validation.ts';
import { discoverInstalledPackageDescriptors } from './agent-package-registry/installed-codex-plugin-directory.ts';
import type { CodexPluginCommandRunner } from './agent-package-registry/configured-codex-plugin-carrier.ts';

export type LocateInstalledPackageInput = {
  packageId: string;
  asset?: string | null;
  binary?: string;
  env?: NodeJS.ProcessEnv;
  runner?: CodexPluginCommandRunner;
};

function assertValidPackageId(packageId: string): string {
  const trimmed = packageId.trim();
  if (!trimmed || trimmed === '.' || trimmed === '..' || /[/\\\0]/.test(trimmed)) {
    throw new FrameworkContractError('cli_usage_error', 'Invalid package_id for packages locate.', {
      package_id: packageId,
      reason_code: 'package_locate_invalid_package_id',
    });
  }
  return trimmed;
}

function normalizeAssetPath(rawAsset: string): string {
  const trimmed = rawAsset.trim();
  if (!trimmed || trimmed.includes('\0') || path.isAbsolute(trimmed)) {
    throw new FrameworkContractError('contract_shape_invalid', 'Package asset path must be a non-empty relative path.', {
      asset: rawAsset,
      reason_code: 'package_locate_asset_invalid',
    });
  }
  const parts = trimmed.replaceAll('\\', '/').split('/');
  if (parts.some((part) => !part || part === '.' || part === '..')) {
    throw new FrameworkContractError('contract_shape_invalid', 'Package asset path must stay contained within the package root.', {
      asset: rawAsset,
      reason_code: 'package_locate_asset_escapes_package',
    });
  }
  return parts.join('/');
}

export function locateInstalledPackage(input: LocateInstalledPackageInput) {
  const packageId = assertValidPackageId(input.packageId);
  const asset = input.asset === undefined || input.asset === null ? null : normalizeAssetPath(input.asset);
  const descriptors = discoverInstalledPackageDescriptors({
    packageId,
    binary: input.binary,
    env: input.env,
    runner: input.runner,
  });
  const descriptor = descriptors.get(packageId);

  if (!descriptor) {
    return {
      version: 'g2' as const,
      opl_package_location: {
        surface_kind: 'opl_package_location' as const,
        package_id: packageId,
        found: false,
        enabled: false,
        readiness: null,
        package_root: null,
        source_kind: null,
        asset_path: null,
        asset_exists: false,
      },
    };
  }

  let realPackageRoot = path.resolve(descriptor.sourcePath);
  const rootExists = fs.existsSync(realPackageRoot);
  if (rootExists) {
    realPackageRoot = fs.realpathSync.native(realPackageRoot);
  }

  let assetPath: string | null = null;
  let assetExists = false;
  if (asset !== null) {
    const lexicalTarget = path.resolve(realPackageRoot, asset);
    if (lexicalTarget === realPackageRoot || !lexicalTarget.startsWith(`${realPackageRoot}${path.sep}`)) {
      throw new FrameworkContractError('contract_shape_invalid', 'Package asset escapes its installed package root.', {
        package_id: packageId,
        asset,
        reason_code: 'package_locate_asset_escapes_package',
      });
    }
    if (rootExists && fs.existsSync(lexicalTarget)) {
      const realAsset = fs.realpathSync.native(lexicalTarget);
      if (realAsset === realPackageRoot || !realAsset.startsWith(`${realPackageRoot}${path.sep}`)) {
        throw new FrameworkContractError('contract_shape_invalid', 'Package asset symlink escapes its installed package root.', {
          package_id: packageId,
          asset,
          reason_code: 'package_locate_asset_symlink_escape',
        });
      }
      assetPath = realAsset;
      assetExists = true;
    } else {
      assetPath = lexicalTarget;
      assetExists = false;
    }
  }

  return {
    version: 'g2' as const,
    opl_package_location: {
      surface_kind: 'opl_package_location' as const,
      package_id: packageId,
      found: descriptor.readiness.installed && rootExists,
      enabled: descriptor.enabled,
      readiness: descriptor.readiness,
      package_root: rootExists ? realPackageRoot : descriptor.sourcePath,
      source_kind: descriptor.carrier_readback.kind ?? null,
      asset_path: assetPath,
      asset_exists: assetExists,
    },
  };
}
