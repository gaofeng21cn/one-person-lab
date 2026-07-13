import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { getCapabilityDependenciesForModule } from '../agent-package-manifests.ts';
import { getShellBinary } from './shared.ts';
import type { DomainModuleRuntimeSpec } from './module-action-workflow.ts';

function resolveRepoOwnedScriptCommand(checkoutPath: string, relativePath: string, args: string[] = []) {
  const scriptPath = path.join(checkoutPath, relativePath);
  if (!fs.existsSync(scriptPath) || !fs.statSync(scriptPath).isFile()) {
    return null;
  }

  return {
    command: 'bash',
    args: [scriptPath, ...args],
  };
}

function shellQuote(value: string): string {
  return "'" + value.replace(/'/g, "'\\''") + "'";
}

function buildPythonCommandShim() {
  return [
    'OPL_PYTHON_SHIM_DIR="$(mktemp -d "${TMPDIR:-/tmp}/opl-python-shim.XXXXXX")"',
    'trap \'rm -rf "$OPL_PYTHON_SHIM_DIR"\' EXIT',
    'if ! command -v python >/dev/null 2>&1 && command -v python3 >/dev/null 2>&1; then',
    '  ln -s "$(command -v python3)" "$OPL_PYTHON_SHIM_DIR/python"',
    '  export PATH="$OPL_PYTHON_SHIM_DIR:$PATH"',
    'fi',
  ].join('\n');
}

function buildPythonEditableBootstrapCommand(checkoutPath: string, pythonVersion: string) {
  const uvArgs = ['uv', 'tool', 'install', '--managed-python', '--python', pythonVersion, '--force', '--editable', checkoutPath];
  return {
    command: getShellBinary(),
    args: ['-lc', [
      'set -euo pipefail',
      buildPythonCommandShim(),
      'if ! command -v uv >/dev/null 2>&1; then',
      '  command -v curl >/dev/null 2>&1 || { echo "Missing uv and curl; cannot bootstrap Python module tooling." >&2; exit 127; }',
      '  curl -LsSf https://astral.sh/uv/install.sh | sh',
      '  export PATH="$HOME/.local/bin:$PATH"',
      'fi',
      'command -v uv >/dev/null 2>&1',
      uvArgs.map(shellQuote).join(' '),
    ].join('\n')],
  };
}

function buildHealthCheckCommand(checkoutPath: string, verifyLane = 'fast') {
  const verifyScript = path.join('scripts', 'verify.sh');
  return resolveRepoOwnedScriptCommand(checkoutPath, path.join('scripts', 'opl-module-healthcheck.sh'))
    ?? {
      command: getShellBinary(),
      args: ['-lc', [
        'set -euo pipefail',
        buildPythonCommandShim(),
        ['bash', verifyScript, verifyLane].map(shellQuote).join(' '),
      ].join('\n')],
    };
}

function buildPythonCleanRunnerExecCommand(checkoutPath: string, moduleName: string, args: string[]) {
  const runnerPath = path.join(checkoutPath, 'scripts', 'run-python-clean.sh');
  if (!fs.existsSync(runnerPath) || !fs.statSync(runnerPath).isFile()) {
    return null;
  }
  return {
    command: runnerPath,
    args: ['-m', moduleName, ...args],
  };
}

function buildNodeImportProbe(checkoutPath: string, relativePath: string) {
  return {
    command: 'node',
    args: [
      '--experimental-strip-types',
      '--input-type=module',
      '-e',
      `await import(${JSON.stringify(pathToFileURL(path.join(checkoutPath, relativePath)).href)})`,
    ],
  };
}

function buildRequiredFilesProbe(checkoutPath: string, relativePaths: string[]) {
  return {
    command: 'node',
    args: [
      '-e',
      'const fs=require("node:fs");for(const p of process.argv.slice(1)){if(!fs.statSync(p).isFile())process.exit(1)}',
      ...relativePaths.map((relativePath) => path.join(checkoutPath, relativePath)),
    ],
  };
}

function buildBookForgeProbe(checkoutPath: string) {
  return buildRequiredFilesProbe(checkoutPath, [
    path.join('contracts', 'domain_descriptor.json'),
    path.join('agent', 'primary_skill', 'SKILL.md'),
  ]);
}

function buildNpmPackageBootstrapCommand(checkoutPath: string) {
  const repoBootstrap = path.join(checkoutPath, 'scripts', 'opl-module-bootstrap.sh');
  return {
    command: getShellBinary(),
    args: ['-lc', [
      'set -euo pipefail',
      `if [[ -f ${shellQuote(repoBootstrap)} ]]; then`,
      `  bash ${shellQuote(repoBootstrap)}`,
      'elif [[ -f package-lock.json ]]; then',
      '  npm ci',
      'else',
      '  npm install',
      'fi',
    ].join('\n')],
  };
}

function buildNpmPackagePrepareCommand() {
  return {
    command: getShellBinary(),
    args: ['-lc', [
      'set -euo pipefail',
      'if node -e \'const p=require("./package.json");process.exit(p.scripts?.build?0:1)\'; then',
      '  npm run --silent build',
      'fi',
    ].join('\n')],
  };
}

export const DOMAIN_MODULE_SPECS: DomainModuleRuntimeSpec[] = [
  {
    module_id: 'medautoscience',
    label: 'Med Auto Science',
    repo_name: 'med-autoscience',
    repo_url: 'https://github.com/gaofeng21cn/med-autoscience.git',
    scope: 'domain_module',
    default_install: true,
    description: 'Research Foundry in medicine: study execution, paper drafting, progress narration, and deliverable files.',
    bootstrap_command: (checkoutPath) => resolveRepoOwnedScriptCommand(
      checkoutPath,
      path.join('scripts', 'opl-module-bootstrap.sh'),
    ),
    health_check_command: (checkoutPath) => resolveRepoOwnedScriptCommand(
      checkoutPath,
      path.join('scripts', 'opl-module-healthcheck.sh'),
    ),
    runtime_probe_command: (checkoutPath) => resolveRepoOwnedScriptCommand(
      checkoutPath,
      path.join('scripts', 'opl-module-healthcheck.sh'),
      ['--probe'],
    ),
    skill_sync_domain: 'medautoscience',
    capability_dependencies: getCapabilityDependenciesForModule('medautoscience'),
  },
  {
    module_id: 'meddeepscientist',
    label: 'Med Deep Scientist',
    repo_name: 'med-deepscientist',
    repo_url: 'https://github.com/gaofeng21cn/med-deepscientist.git',
    scope: 'runtime_dependency',
    default_install: false,
    description: 'Optional MAS-declared legacy oracle and backend audit companion; not part of the default OPL install.',
    bootstrap_command: (checkoutPath) => (
      resolveRepoOwnedScriptCommand(checkoutPath, path.join('scripts', 'opl-module-bootstrap.sh'))
      ?? buildPythonEditableBootstrapCommand(checkoutPath, '3.11')
    ),
    health_check_command: (checkoutPath) => buildHealthCheckCommand(checkoutPath),
  },
  {
    module_id: 'medautogrant',
    label: 'Med Auto Grant',
    repo_name: 'med-autogrant',
    repo_url: 'https://github.com/gaofeng21cn/med-autogrant.git',
    scope: 'domain_module',
    default_install: true,
    description: 'Grant Foundry for proposal planning, critique, revision, and package assembly.',
    bootstrap_command: (checkoutPath) => (
      resolveRepoOwnedScriptCommand(checkoutPath, path.join('scripts', 'opl-module-bootstrap.sh'))
      ?? buildPythonEditableBootstrapCommand(checkoutPath, '3.12')
    ),
    health_check_command: (checkoutPath) => buildHealthCheckCommand(checkoutPath),
    exec_command: (checkoutPath, args) => buildPythonCleanRunnerExecCommand(
      checkoutPath,
      'med_autogrant.cli',
      args,
    ),
    skill_sync_domain: 'medautogrant',
  },
  {
    module_id: 'redcube',
    label: 'RedCube AI',
    repo_name: 'redcube-ai',
    repo_url: 'https://github.com/gaofeng21cn/redcube-ai.git',
    scope: 'domain_module',
    default_install: true,
    description: 'Presentation Ops module for slide decks and other visual deliverables.',
    bootstrap_command: (checkoutPath) => (
      resolveRepoOwnedScriptCommand(checkoutPath, path.join('scripts', 'opl-module-bootstrap.sh'))
      ?? { command: 'npm', args: ['install'] }
    ),
    package_bootstrap_command: (checkoutPath) => buildNpmPackageBootstrapCommand(checkoutPath),
    package_prepare_command: () => buildNpmPackagePrepareCommand(),
    health_check_command: (checkoutPath) => buildHealthCheckCommand(checkoutPath),
    exec_command: (_checkoutPath, args) => ({
      command: 'npm',
      args: ['run', '--silent', 'redcube', '--', ...args],
    }),
    skill_sync_domain: 'redcube',
  },
  {
    module_id: 'oplmetaagent',
    label: 'OPL Meta Agent',
    repo_name: 'opl-meta-agent',
    repo_url: 'https://github.com/gaofeng21cn/opl-meta-agent.git',
    scope: 'domain_module',
    default_install: true,
    description: 'Foundry Agent for building new OPL-compatible high-value knowledge delivery agents.',
    bootstrap_command: (checkoutPath) => (
      resolveRepoOwnedScriptCommand(checkoutPath, path.join('scripts', 'opl-module-bootstrap.sh'))
      ?? { command: 'npm', args: ['install'] }
    ),
    health_check_command: (checkoutPath) => buildHealthCheckCommand(checkoutPath, 'smoke'),
    package_health_check_command: (checkoutPath) => buildNodeImportProbe(
      checkoutPath,
      path.join('scripts', 'lib', 'domain-pack.ts'),
    ),
    exec_command: (_checkoutPath, args) => ({
      command: 'npm',
      args: ['test', '--', ...args],
    }),
    skill_sync_domain: 'oplmetaagent',
  },
  {
    module_id: 'oplbookforge',
    label: 'OPL Book Forge',
    repo_name: 'opl-bookforge',
    repo_url: 'https://github.com/gaofeng21cn/opl-bookforge.git',
    scope: 'domain_module',
    default_install: true,
    description: 'Book Foundry agent for storyline architecture, chapter drafting, figures, tables, style control, and export handoff.',
    bootstrap_command: (checkoutPath) => (
      resolveRepoOwnedScriptCommand(checkoutPath, path.join('scripts', 'opl-module-bootstrap.sh'))
      ?? { command: 'npm', args: ['install', '--no-package-lock'] }
    ),
    health_check_command: (checkoutPath) => buildHealthCheckCommand(checkoutPath),
    package_health_check_command: (checkoutPath) => buildBookForgeProbe(checkoutPath),
    runtime_probe_command: (checkoutPath) => buildBookForgeProbe(checkoutPath),
    exec_command: (_checkoutPath, args) => ({
      command: 'npm',
      args: ['test', '--', ...args],
    }),
    skill_sync_domain: 'oplbookforge',
  },
  {
    module_id: 'scholarskills',
    label: 'MAS Scholar Skills',
    repo_name: 'mas-scholar-skills',
    repo_url: 'https://github.com/gaofeng21cn/mas-scholar-skills.git',
    scope: 'framework_capability_package',
    default_install: false,
    description: 'External professional Codex skill package consumed by MAS workspaces and quests.',
    skill_sync_domain: 'scholarskills',
  },
];
