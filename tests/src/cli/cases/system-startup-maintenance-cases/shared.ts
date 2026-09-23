import { createFakeCodexFixture, createGitModuleRemoteFixture, fs, path } from '../../helpers.ts';
import { runGitFixtureCommand } from '../../helpers-parts/family-fixtures.ts';
import {
  writeFakeBookForgeGeneratedSurfacePack,
  writeFakeOmaGeneratedSurfacePack,
} from '../../../cli-codex-default-shell-helpers.ts';
import { DOMAIN_MODULE_SPECS } from '../../../../../src/adapters/integration/system-installation/module-specs.ts';

// Startup maintenance targets every registered domain module, so the expected
// counts follow the module registry instead of a frozen number.
const DOMAIN_MODULES = DOMAIN_MODULE_SPECS.filter((spec) => spec.scope === 'domain_module');

export const DOMAIN_MODULE_TARGET_COUNT = DOMAIN_MODULES.length;

// Every registered domain module needs an env override in tests that start
// module maintenance, otherwise the missing one falls back to its declared
// GitHub URL, which makes the case slow, flaky and network dependent.
export function domainModuleRepoUrlEnvironment(remoteRoot: string) {
  return Object.fromEntries(DOMAIN_MODULES.map((spec) => [
    `OPL_MODULE_REPO_URL_${spec.module_id.toUpperCase()}`,
    remoteRoot,
  ]));
}

export function domainModulePathEnvironment(checkoutPath: string) {
  return Object.fromEntries(DOMAIN_MODULES.map((spec) => [
    `OPL_MODULE_PATH_${spec.module_id.toUpperCase()}`,
    checkoutPath,
  ]));
}

const FIXTURE_CODEX_VERSION = '0.134.0';
const AGENT_PLUGIN_SCHEMA = 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json';

export function withCliTimeout<T>(timeoutMs: string, fn: () => T): T {
  const previous = process.env.OPL_CLI_TEST_TIMEOUT_MS;
  process.env.OPL_CLI_TEST_TIMEOUT_MS = timeoutMs;
  try {
    return fn();
  } finally {
    if (previous === undefined) {
      delete process.env.OPL_CLI_TEST_TIMEOUT_MS;
    } else {
      process.env.OPL_CLI_TEST_TIMEOUT_MS = previous;
    }
  }
}

export function createCurrentCodexFixture() {
  const fixture = createFakeCodexFixture(`
if [[ "$1" == "--version" ]]; then
  echo "codex-cli ${FIXTURE_CODEX_VERSION}"
  exit 0
fi
echo "Unsupported codex fixture command: $*" >&2
exit 1
`);
  fs.symlinkSync(process.execPath, path.join(fixture.fixtureRoot, 'node'));
  return fixture;
}

export function currentCodexEnvironment(
  codexFixture: ReturnType<typeof createCurrentCodexFixture>,
  additionalBinRoots: string[] = [],
) {
  return {
    OPL_CODEX_BIN: codexFixture.codexPath,
    OPL_MIN_CODEX_CLI_VERSION: FIXTURE_CODEX_VERSION,
    OPL_CODEX_CLI_LATEST_VERSION: FIXTURE_CODEX_VERSION,
    PATH: [codexFixture.fixtureRoot, ...additionalBinRoots, '/usr/bin', '/bin'].join(path.delimiter),
  };
}

export function agentPluginManifestFixtureFiles(pluginName: string, prefix = ''): Record<string, string> {
  return {
    [`${prefix}plugin.json`]: JSON.stringify({
      $schema: AGENT_PLUGIN_SCHEMA,
      name: pluginName,
      version: '0.1.0',
      description: `${pluginName} startup-maintenance fixture.`,
    }, null, 2),
    [`${prefix}.codex-plugin/plugin.json`]: JSON.stringify({
      name: pluginName,
      version: '0.1.0',
      skills: './skills/',
    }, null, 2),
  };
}

export function createDomainModuleRemote(input: {
  repoName: string;
  pluginName: 'med-autoscience' | 'med-autogrant' | 'redcube-ai' | 'opl-meta-agent' | 'opl-bookforge'
    | 'med-autocast';
  installerKind: 'bash' | 'node';
  logPath: string;
}) {
  const installScript: Record<string, string> =
    input.installerKind === 'bash'
      ? {
        'scripts/install-codex-plugin.sh': [
          '#!/usr/bin/env bash',
          'set -euo pipefail',
          'REPO_ROOT="$PWD"',
          'while (($#)); do',
          '  case "$1" in',
          '    --repo-root)',
          '      REPO_ROOT="$2"',
          '      shift 2',
          '      ;;',
          '    *)',
          '      shift',
          '      ;;',
          '  esac',
          'done',
          'mkdir -p "${REPO_ROOT}/.agents/plugins"',
          `cat >"\${REPO_ROOT}/.agents/plugins/marketplace.json" <<'EOF_MARKETPLACE_${input.pluginName}'`,
          JSON.stringify({
            name: `${input.pluginName}-local`,
            interface: {
              displayName: `${input.pluginName.toUpperCase()} Local`,
            },
            plugins: [
              {
                name: input.pluginName,
                source: {
                  source: 'local',
                  path: `./plugins/${input.pluginName}`,
                },
                policy: {
                  installation: 'AVAILABLE',
                  authentication: 'ON_INSTALL',
                },
                category: 'Productivity',
              },
            ],
          }, null, 2),
          `EOF_MARKETPLACE_${input.pluginName}`,
          `printf '${input.pluginName}-skill-sync\n' >> ${JSON.stringify(input.logPath)}`,
          `printf '%s\n' '{"plugin":"${input.pluginName}","sync":"ok"}'`,
          '',
        ].join('\n'),
      }
      : {
        'scripts/install-codex-plugin.mjs': [
          `import path from 'node:path';`,
          `import fs from 'node:fs';`,
          `let repoRoot = process.cwd();`,
          `const args = process.argv.slice(2);`,
          `for (let index = 0; index < args.length; index += 1) {`,
          `  if (args[index] === '--repo-root' && args[index + 1]) {`,
          `    repoRoot = path.resolve(args[index + 1]);`,
          `    index += 1;`,
          `  }`,
          `}`,
          `fs.mkdirSync(path.join(repoRoot, '.agents', 'plugins'), { recursive: true });`,
          `fs.writeFileSync(path.join(repoRoot, '.agents', 'plugins', 'marketplace.json'), ${JSON.stringify(JSON.stringify({
            name: `${input.pluginName}-local`,
            interface: {
              displayName: `${input.pluginName.toUpperCase()} Local`,
            },
            plugins: [
              {
                name: input.pluginName,
                source: {
                  source: 'local',
                  path: `./plugins/${input.pluginName}`,
                },
                policy: {
                  installation: 'AVAILABLE',
                  authentication: 'ON_INSTALL',
                },
                category: 'Productivity',
              },
            ],
          }, null, 2) + '\n')}, 'utf8');`,
          `fs.appendFileSync(${JSON.stringify(input.logPath)}, '${input.pluginName}-skill-sync\n');`,
          `console.log(JSON.stringify({ plugin: '${input.pluginName}', sync: 'ok' }));`,
          '',
        ].join('\n'),
      };

  return createGitModuleRemoteFixture(input.repoName, {
    extraFiles: {
      ...agentPluginManifestFixtureFiles(input.pluginName, `plugins/${input.pluginName}/`),
      'agent/primary_skill/SKILL.md': [
        '---',
        `name: ${input.pluginName}`,
        `description: Use ${input.pluginName.toUpperCase()} through its OPL-managed product entry.`,
        '---',
        '',
        `# ${input.pluginName.toUpperCase()} Skill`,
        '',
      ].join('\n'),
      [`plugins/${input.pluginName}/skills/${input.pluginName}/SKILL.md`]: [
        '---',
        `name: ${input.pluginName}`,
        `description: Use ${input.pluginName.toUpperCase()} through its OPL-managed product entry.`,
        '---',
        '',
        `# ${input.pluginName.toUpperCase()} Skill`,
        '',
      ].join('\n'),
      'scripts/opl-module-bootstrap.sh': [
        '#!/usr/bin/env bash',
        'set -euo pipefail',
        `printf '${input.pluginName}-bootstrap\n' >> ${JSON.stringify(input.logPath)}`,
        '',
      ].join('\n'),
      'scripts/opl-module-healthcheck.sh': [
        '#!/usr/bin/env bash',
        'set -euo pipefail',
        `printf '${input.pluginName}-health\n' >> ${JSON.stringify(input.logPath)}`,
        '',
      ].join('\n'),
      ...installScript,
    },
  });
}

export function createScholarSkillsRemote() {
  return createGitModuleRemoteFixture('mas-scholar-skills', {
    extraFiles: {
      ...scholarSkillsPluginFixtureFiles('startup-maintenance-managed-source'),
      'contracts/scholar-skills-capability-modules.json': JSON.stringify({
        fixture: 'startup-maintenance-managed-source',
      }, null, 2),
      'docs/README.md': '# ScholarSkills fixture docs\n',
      'gallery/medical-display/gallery_snapshot.json': '{"fixture":true}\n',
      'gallery/medical-display/assets/heavy.png': 'not copied\n',
      'outputs/intermediate.json': '{}\n',
    },
  });
}

export function scholarSkillsPluginFixtureFiles(fixture: string): Record<string, string> {
  return {
    ...agentPluginManifestFixtureFiles('mas-scholar-skills'),
    'skills/mas-scholar-skills/SKILL.md': [
      '---',
      'name: mas-scholar-skills',
      'description: Route professional capability tasks through the external package.',
      '---',
      '',
      '# MAS Scholar Skills',
      '',
      `Fixture: ${fixture}`,
      '',
    ].join('\n'),
    'skills/example-specialist/SKILL.md': [
      '---',
      'name: example-specialist',
      'description: External package-owned specialist fixture.',
      '---',
      '',
      '# Example Specialist',
      '',
    ].join('\n'),
  };
}

export function createOmaGeneratedSurfaceRemote(input: {
  logPath: string;
  healthcheckLogPath?: string;
}) {
  const remote = createGitModuleRemoteFixture('opl-meta-agent', {
    extraFiles: {
      'scripts/opl-module-bootstrap.sh': [
        '#!/usr/bin/env bash',
        'set -euo pipefail',
        `printf 'opl-meta-agent-bootstrap\n' >> ${JSON.stringify(input.logPath)}`,
        '',
      ].join('\n'),
      'scripts/verify.sh': [
        '#!/usr/bin/env bash',
        'set -euo pipefail',
        input.healthcheckLogPath
          ? `printf '%s\n' "$1" > ${JSON.stringify(input.healthcheckLogPath)}`
          : `printf 'opl-meta-agent-health\n' >> ${JSON.stringify(input.logPath)}`,
        'test "${1:-}" = "smoke"',
        '',
      ].join('\n'),
    },
    executableFiles: [
      'scripts/opl-module-bootstrap.sh',
      'scripts/verify.sh',
    ],
  });
  writeFakeOmaGeneratedSurfacePack(remote.sourceRoot);
  runGitFixtureCommand(remote.sourceRoot, ['add', 'agent', 'contracts', 'runtime', 'plugins']);
  runGitFixtureCommand(remote.sourceRoot, ['commit', '-m', 'Add OMA generated surface contract pack']);
  runGitFixtureCommand(remote.sourceRoot, ['push', 'origin', 'main']);
  return remote;
}

export function createBookForgeGeneratedSurfaceRemote(input: {
  logPath: string;
  healthcheckLogPath?: string;
}) {
  const remote = createGitModuleRemoteFixture('opl-bookforge', {
    extraFiles: {
      'scripts/opl-module-bootstrap.sh': [
        '#!/usr/bin/env bash',
        'set -euo pipefail',
        `printf 'opl-bookforge-bootstrap\n' >> ${JSON.stringify(input.logPath)}`,
        '',
      ].join('\n'),
      'scripts/verify.sh': [
        '#!/usr/bin/env bash',
        'set -euo pipefail',
        input.healthcheckLogPath
          ? `printf '%s\n' "$1" > ${JSON.stringify(input.healthcheckLogPath)}`
          : `printf 'opl-bookforge-health\n' >> ${JSON.stringify(input.logPath)}`,
        'test "${1:-}" = "fast"',
        '',
      ].join('\n'),
    },
    executableFiles: [
      'scripts/opl-module-bootstrap.sh',
      'scripts/verify.sh',
    ],
  });
  writeFakeBookForgeGeneratedSurfacePack(remote.sourceRoot);
  runGitFixtureCommand(remote.sourceRoot, ['add', 'agent', 'contracts', 'plugins']);
  runGitFixtureCommand(remote.sourceRoot, ['commit', '-m', 'Add Book Forge generated surface contract pack']);
  runGitFixtureCommand(remote.sourceRoot, ['push', 'origin', 'main']);
  return remote;
}

export function createStartupDomainModuleRemotes(input: {
  logPath: string;
  omaHealthcheckLogPath?: string;
  bookForgeHealthcheckLogPath?: string;
}) {
  return {
    masRemote: createDomainModuleRemote({
      repoName: 'med-autoscience',
      pluginName: 'med-autoscience',
      installerKind: 'bash',
      logPath: input.logPath,
    }),
    magRemote: createDomainModuleRemote({
      repoName: 'med-autogrant',
      pluginName: 'med-autogrant',
      installerKind: 'bash',
      logPath: input.logPath,
    }),
    rcaRemote: createDomainModuleRemote({
      repoName: 'redcube-ai',
      pluginName: 'redcube-ai',
      installerKind: 'node',
      logPath: input.logPath,
    }),
    metaRemote: createOmaGeneratedSurfaceRemote({
      logPath: input.logPath,
      healthcheckLogPath: input.omaHealthcheckLogPath,
    }),
    bookForgeRemote: createBookForgeGeneratedSurfaceRemote({
      logPath: input.logPath,
      healthcheckLogPath: input.bookForgeHealthcheckLogPath,
    }),
    autocastRemote: createDomainModuleRemote({
      repoName: 'med-autocast',
      pluginName: 'med-autocast',
      installerKind: 'node',
      logPath: input.logPath,
    }),
  };
}

export function removeStartupDomainModuleRemotes(remotes: ReturnType<typeof createStartupDomainModuleRemotes>) {
  for (const remote of Object.values(remotes)) {
    fs.rmSync(remote.fixtureRoot, { recursive: true, force: true });
  }
}
