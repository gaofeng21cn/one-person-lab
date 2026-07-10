import {
  scholarSkillsPluginFixtureFiles,
  type StartupPackageChannelModuleFixture,
} from './system-startup-maintenance-cases/shared.ts';

export function scholarSkillsPackageFixture(versionLabel: string): StartupPackageChannelModuleFixture {
  return {
    moduleId: 'scholarskills',
    repoName: 'mas-scholar-skills',
    sourceHeadSha: `scholarskills-${versionLabel}-sha`,
    files: {
      ...scholarSkillsPluginFixtureFiles(`startup-maintenance-package-channel-${versionLabel}`),
      'contracts/scholar-skills-capability-modules.json': JSON.stringify({
        fixture: `startup-maintenance-package-channel-${versionLabel}`,
      }, null, 2),
      'docs/README.md': `# ScholarSkills ${versionLabel} fixture docs\n`,
      'gallery/medical-display/gallery_snapshot.json': '{"fixture":true}\n',
      'gallery/medical-display/assets/heavy.png': 'not copied\n',
      'outputs/intermediate.json': '{}\n',
    },
  };
}
