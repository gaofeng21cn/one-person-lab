import { assert, runCli, test } from './helpers.ts';
import { getPublicationAdmittedOplPackageSpecs } from '../../../../../src/adapters/integration/package-distribution.ts';

test('packages manifest projects independent owner channels without publishing a combination', () => {
  const output = runCli(['connect', 'packages', 'manifest', '--json']) as { packages_manifest: Record<string, any> };
  const manifest = output.packages_manifest;
  assert.equal(manifest.manifest_role, 'local_package_distribution_projection');
  assert.equal(manifest.package_install_update_source, 'per_package_owner_latest_stable');
  assert.equal(manifest.packages.framework_core.package_name, 'one-person-lab-framework');
  assert.equal(manifest.packages.framework_core.current_install_update_source, 'framework_owner_channel');
  for (const spec of getPublicationAdmittedOplPackageSpecs()) {
    const entry = manifest.packages.package_artifacts[spec.package_id];
    assert.equal(entry.version, spec.version);
    assert.equal(entry.current_install_update_source, 'per_package_owner_latest_stable');
    assert.equal(entry.release_discipline.package_truth_owner, spec.repo_name);
  }
  assert.equal(Object.hasOwn(manifest, 'release_set'), false);
  assert.equal(Object.hasOwn(manifest, 'release_set_generation'), false);
});
