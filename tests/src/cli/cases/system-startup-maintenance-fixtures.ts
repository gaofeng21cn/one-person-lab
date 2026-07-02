import { fs, path } from '../helpers.ts';
import type { StartupPackageChannelModuleFixture } from './system-startup-maintenance-cases/shared.ts';

export function scholarSkillsPackageFixture(versionLabel: string): StartupPackageChannelModuleFixture {
  return {
    moduleId: 'scholarskills',
    repoName: 'mas-scholar-skills',
    sourceHeadSha: `scholarskills-${versionLabel}-sha`,
    files: {
      '.codex-plugin/plugin.json': fs.readFileSync(
        path.join('plugins', 'mas-scholar-skills', '.codex-plugin', 'plugin.json'),
        'utf8',
      ),
      'skills/mas-scholar-skills/SKILL.md': fs.readFileSync(
        path.join('plugins', 'mas-scholar-skills', 'skills', 'mas-scholar-skills', 'SKILL.md'),
        'utf8',
      ),
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
