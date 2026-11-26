import fs from 'node:fs';
import path from 'node:path';

const catalogFixtureRoot = path.resolve(import.meta.dirname, '../../fixtures/catalog');

export const catalogFixturePackageRoot = path.join(catalogFixtureRoot, 'packages');
export const catalogFixtureAllowlistRoot = path.join(catalogFixtureRoot, 'allowlists');

export function catalogFixtureManifestPath(packageId: string): string {
  for (const category of fs.readdirSync(catalogFixturePackageRoot, { withFileTypes: true })) {
    if (!category.isDirectory() || category.name === 'payloads') continue;
    const candidatePath = path.join(catalogFixturePackageRoot, category.name, `${packageId}.json`);
    if (fs.existsSync(candidatePath)) return candidatePath;
  }
  throw new Error(`Missing test catalog manifest for ${packageId}.`);
}

export function legacyCatalogFixtureManifestPath(packageId: string): string {
  return path.join(catalogFixtureRoot, 'legacy', `${packageId}.json`);
}
