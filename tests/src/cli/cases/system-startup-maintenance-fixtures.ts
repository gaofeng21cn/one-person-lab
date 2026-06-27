import { fs, path } from '../helpers.ts';
import type { StartupPackageChannelModuleFixture } from './system-startup-maintenance-cases/shared.ts';

export function scholarSkillsPackageFixture(versionLabel: string): StartupPackageChannelModuleFixture {
  return {
    moduleId: 'scholarskills',
    repoName: 'opl-scholarskills',
    sourceHeadSha: `scholarskills-${versionLabel}-sha`,
    files: {
      '.codex-plugin/plugin.json': fs.readFileSync(
        path.join('plugins', 'opl-scholarskills', '.codex-plugin', 'plugin.json'),
        'utf8',
      ),
      'skills/opl-scholarskills/SKILL.md': fs.readFileSync(
        path.join('plugins', 'opl-scholarskills', 'skills', 'opl-scholarskills', 'SKILL.md'),
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
