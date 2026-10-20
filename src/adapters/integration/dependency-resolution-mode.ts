/**
 * Version overrides are test fixtures only. Runtime and packaged operations
 * always resolve the latest stable release from the canonical source manifest.
 * An explicit zero is useful for tests that exercise the production boundary.
 */
export function allowDependencyVersionOverride() {
  const explicit = process.env.OPL_DEPENDENCY_TEST_OVERRIDE?.trim();
  if (explicit !== undefined) return explicit === '1';
  if (process.env.NODE_ENV === 'test') return true;
  return process.execArgv.some((argument) => argument === '--test' || argument.startsWith('--test-'));
}
