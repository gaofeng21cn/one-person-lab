import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
export const cliPath = path.join(repoRoot, 'src', 'cli.ts');
export const contractsDir = path.join(repoRoot, 'contracts', 'opl-gateway');
export const familyManifestFixtureDir = path.join(repoRoot, 'tests', 'fixtures', 'family-manifests');
