import { assert, runCli, test } from '../helpers.ts';

test('packages manifest exposes package coordinates while marking module install updates as git-checkout based', () => {
  const output = runCli(['packages', 'manifest'], {
    OPL_RELEASE_VERSION: '26.4.27',
    OPL_PACKAGES_OWNER: 'gaofeng21cn',
    OPL_RELEASE_CHANNEL: 'stable',
  }) as {
    packages_manifest: {
      opl_version: string;
      release_channel: string;
      module_install_update_source: string;
      package_consumption_status: string;
      packages: {
        webui_docker_image: { image: string; aliases: string[] };
        native_helper: { image: string; target_tag_template: string };
        modules: Record<string, {
          artifact: string;
          package_consumption_status: string;
          current_install_update_source: string;
          fallback_git: { repo_url: string; ref: string };
          install_strategy: string;
          dependency_of: string[];
        }>;
      };
    };
  };

  assert.equal(output.packages_manifest.opl_version, '26.4.27');
  assert.equal(output.packages_manifest.release_channel, 'stable');
  assert.equal(output.packages_manifest.module_install_update_source, 'git_checkout');
  assert.equal(
    output.packages_manifest.package_consumption_status,
    'packages_defined_not_consumed_by_install_update',
  );
  assert.equal(
    output.packages_manifest.packages.webui_docker_image.image,
    'ghcr.io/gaofeng21cn/one-person-lab-webui:26.4.27',
  );
  assert.equal(
    output.packages_manifest.packages.native_helper.target_tag_template,
    'ghcr.io/gaofeng21cn/one-person-lab-native-helper:<target>-<native_helper_version>',
  );
  assert.equal(
    output.packages_manifest.packages.modules.medautoscience.artifact,
    'ghcr.io/gaofeng21cn/one-person-lab-modules/med-autoscience:26.4.27',
  );
  assert.equal(
    output.packages_manifest.packages.modules.medautoscience.package_consumption_status,
    'defined_not_consumed_by_install_update',
  );
  assert.equal(
    output.packages_manifest.packages.modules.medautoscience.current_install_update_source,
    'git_checkout',
  );
  assert.equal(
    output.packages_manifest.packages.modules.medautoscience.fallback_git.repo_url,
    'https://github.com/gaofeng21cn/med-autoscience.git',
  );
  assert.deepEqual(output.packages_manifest.packages.modules.meddeepscientist.dependency_of, ['medautoscience']);
  assert.equal(
    output.packages_manifest.packages.modules.redcube.install_strategy,
    'extract_to_managed_modules_root',
  );
});
