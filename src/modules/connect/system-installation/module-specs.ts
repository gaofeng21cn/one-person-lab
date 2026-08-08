import fs from 'node:fs';
import path from 'node:path';

import { listCurrentPackageProjections } from '../../../kernel/standard-agent-registry.ts';
import { listFirstPartyAgentPackageManifests } from '../agent-package-manifests.ts';
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

function buildMasSourceCarrierProbe(checkoutPath: string) {
  return buildRequiredFilesProbe(checkoutPath, [
    path.join('contracts', 'action_catalog.json'),
    path.join('contracts', 'domain_handler_registry.json'),
    path.join('contracts', 'pack_compiler_input.json'),
    path.join('agent', 'stages', 'manifest.json'),
    path.join('agent', 'primary_skill', 'SKILL.md'),
  ]);
}

function buildMasPackageBootstrapCommand(checkoutPath: string) {
  const pyprojectPath = path.join(checkoutPath, 'pyproject.toml');
  const readmePath = path.join(checkoutPath, 'README.md');
  const packageSourcePath = path.join(checkoutPath, 'src', 'med_autoscience');
  const sourceProbe = buildMasSourceCarrierProbe(checkoutPath);
  return {
    command: getShellBinary(),
    args: ['-c', [
      'set -euo pipefail',
      'test -n "${UV_TOOL_DIR:-}"',
      `test -f ${shellQuote(pyprojectPath)} && test ! -L ${shellQuote(pyprojectPath)}`,
      `test -f ${shellQuote(readmePath)} && test ! -L ${shellQuote(readmePath)}`,
      `test -d ${shellQuote(packageSourcePath)} && test ! -L ${shellQuote(packageSourcePath)}`,
      `test -z "$(find ${shellQuote(packageSourcePath)} -type l -print -quit)"`,
      'OPL_MAS_PREPARATION_ROOT="$(dirname "$UV_TOOL_DIR")"',
      'OPL_MAS_PACKAGE_SOURCE_ROOT="$UV_TOOL_DIR/package-source"',
      'trap \'rm -rf "$OPL_MAS_PREPARATION_ROOT"\' ERR',
      'rm -rf "$OPL_MAS_PACKAGE_SOURCE_ROOT"',
      'mkdir -p "$OPL_MAS_PACKAGE_SOURCE_ROOT/src/med_autoscience"',
      `cp ${shellQuote(pyprojectPath)} "$OPL_MAS_PACKAGE_SOURCE_ROOT/pyproject.toml"`,
      `cp ${shellQuote(readmePath)} "$OPL_MAS_PACKAGE_SOURCE_ROOT/README.md"`,
      `cp -R ${shellQuote(`${packageSourcePath}/.`)} "$OPL_MAS_PACKAGE_SOURCE_ROOT/src/med_autoscience/"`,
      buildPythonCommandShim(),
      'if ! command -v uv >/dev/null 2>&1; then',
      '  command -v curl >/dev/null 2>&1 || { echo "Missing uv and curl; cannot bootstrap MAS package tooling." >&2; exit 127; }',
      '  curl -LsSf https://astral.sh/uv/install.sh | sh',
      '  export PATH="$HOME/.local/bin:$PATH"',
      'fi',
      'command -v uv >/dev/null 2>&1',
      'uv tool install --managed-python --python 3.12 --force "$OPL_MAS_PACKAGE_SOURCE_ROOT"',
      [sourceProbe.command, ...sourceProbe.args].map(shellQuote).join(' '),
      'OPL_MAS_OWNER_GATE_BIN="$UV_TOOL_DIR/med-autoscience/bin/mas-foundry-owner-gate"',
      'node -e \'const fs=require("node:fs"),path=require("node:path");const [bin,root]=process.argv.slice(1);const stat=fs.lstatSync(bin);const expected=path.join(fs.realpathSync(root),"med-autoscience","bin","mas-foundry-owner-gate");if(!stat.isFile()||stat.isSymbolicLink()||fs.realpathSync(bin)!==expected)process.exit(1);fs.accessSync(bin,fs.constants.X_OK)\' "$OPL_MAS_OWNER_GATE_BIN" "$UV_TOOL_DIR"',
      '"$OPL_MAS_OWNER_GATE_BIN" --help >/dev/null',
    ].join('\n')],
  };
}

function buildMasPackageHealthCheckCommand(checkoutPath: string) {
  const sourceProbe = buildMasSourceCarrierProbe(checkoutPath);
  return {
    command: getShellBinary(),
    args: ['-c', [
      'set -euo pipefail',
      [sourceProbe.command, ...sourceProbe.args].map(shellQuote).join(' '),
      'test -n "${UV_TOOL_DIR:-}"',
      'OPL_MAS_OWNER_GATE_BIN="$UV_TOOL_DIR/med-autoscience/bin/mas-foundry-owner-gate"',
      'node -e \'const fs=require("node:fs"),path=require("node:path");const [bin,root]=process.argv.slice(1);const stat=fs.lstatSync(bin);const expected=path.join(fs.realpathSync(root),"med-autoscience","bin","mas-foundry-owner-gate");if(!stat.isFile()||stat.isSymbolicLink()||fs.realpathSync(bin)!==expected)process.exit(1);fs.accessSync(bin,fs.constants.X_OK)\' "$OPL_MAS_OWNER_GATE_BIN" "$UV_TOOL_DIR"',
      '"$OPL_MAS_OWNER_GATE_BIN" --help >/dev/null',
    ].join('\n')],
  };
}

function buildStandardAgentPackProbe(checkoutPath: string) {
  return buildRequiredFilesProbe(checkoutPath, [
    path.join('contracts', 'action_catalog.json'),
    path.join('contracts', 'domain_descriptor.json'),
    path.join('contracts', 'pack_compiler_input.json'),
    path.join('agent', 'stages', 'manifest.json'),
    path.join('agent', 'primary_skill', 'SKILL.md'),
  ]);
}

function buildFoundryAgentPackProbe(checkoutPath: string) {
  return buildRequiredFilesProbe(checkoutPath, [
    path.join('contracts', 'action_catalog.json'),
    path.join('contracts', 'domain_descriptor.json'),
    path.join('contracts', 'foundry_provider.json'),
    path.join('contracts', 'pack_compiler_input.json'),
    path.join('agent', 'stages', 'manifest.json'),
    path.join('agent', 'primary_skill', 'SKILL.md'),
  ]);
}

const MODULE_ADAPTER_OVERRIDES: Record<string, Partial<DomainModuleRuntimeSpec>> = {
  medautoscience: {
    bootstrap_command: (checkoutPath) => buildMasSourceCarrierProbe(checkoutPath),
    package_bootstrap_command: (checkoutPath) => buildMasPackageBootstrapCommand(checkoutPath),
    health_check_command: (checkoutPath) => buildMasSourceCarrierProbe(checkoutPath),
    package_health_check_command: (checkoutPath) => buildMasPackageHealthCheckCommand(checkoutPath),
    runtime_probe_command: (checkoutPath) => buildMasSourceCarrierProbe(checkoutPath),
  },
  medautogrant: {
    bootstrap_command: (checkoutPath) => (
      resolveRepoOwnedScriptCommand(checkoutPath, path.join('scripts', 'opl-module-bootstrap.sh'))
      ?? buildPythonEditableBootstrapCommand(checkoutPath, '3.12')
    ),
    health_check_command: (checkoutPath) => buildHealthCheckCommand(checkoutPath),
    package_health_check_command: (checkoutPath) => buildStandardAgentPackProbe(checkoutPath),
    runtime_probe_command: (checkoutPath) => buildStandardAgentPackProbe(checkoutPath),
    exec_command: (checkoutPath, args) => buildPythonCleanRunnerExecCommand(
      checkoutPath,
      'med_autogrant.cli',
      args,
    ),
  },
  redcube: {
    bootstrap_command: (checkoutPath) => (
      resolveRepoOwnedScriptCommand(checkoutPath, path.join('scripts', 'opl-module-bootstrap.sh'))
      ?? { command: 'npm', args: ['install'] }
    ),
    health_check_command: (checkoutPath) => resolveRepoOwnedScriptCommand(
      checkoutPath,
      path.join('scripts', 'opl-module-healthcheck.sh'),
    ),
    package_health_check_command: (checkoutPath) => buildStandardAgentPackProbe(checkoutPath),
    runtime_probe_command: (checkoutPath) => buildStandardAgentPackProbe(checkoutPath),
  },
  oplmetaagent: {
    bootstrap_command: (checkoutPath) => (
      resolveRepoOwnedScriptCommand(checkoutPath, path.join('scripts', 'opl-module-bootstrap.sh'))
      ?? { command: 'npm', args: ['install'] }
    ),
    health_check_command: (checkoutPath) => buildHealthCheckCommand(checkoutPath, 'smoke'),
    package_health_check_command: (checkoutPath) => buildFoundryAgentPackProbe(checkoutPath),
    runtime_probe_command: (checkoutPath) => buildFoundryAgentPackProbe(checkoutPath),
    exec_command: (_checkoutPath, args) => ({
      command: 'npm',
      args: ['test', '--', ...args],
    }),
  },
  oplbookforge: {
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
  },
};

// MDS is a compatibility-only runtime companion. It is not a Package or Agent
// membership source and remains isolated until its last legacy caller is retired.
const LEGACY_RUNTIME_MODULE_ADAPTERS: DomainModuleRuntimeSpec[] = [
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
];

function projectionRecord(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function projectionString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function buildDomainModuleSpecs(packageDirectory?: string): DomainModuleRuntimeSpec[] {
  const projections = listCurrentPackageProjections(packageDirectory);
  const packageProjections = new Map(
    projections.map(({ payload }) => [projectionString(payload.package_id), payload]),
  );
  const agentManifests = listFirstPartyAgentPackageManifests(packageDirectory);
  const agentSpecs = agentManifests.map((manifest) => ({
    module_id: manifest.module_id,
    label: manifest.display_name,
    repo_name: manifest.repo_name,
    repo_url: manifest.repo_url,
    scope: 'domain_module' as const,
    default_install: true,
    description: manifest.description,
    skill_sync_domain: manifest.module_id,
    capability_dependencies: manifest.capability_dependencies,
    ...MODULE_ADAPTER_OVERRIDES[manifest.module_id],
  } satisfies DomainModuleRuntimeSpec));

  const dependencySpecs = [...new Map(agentManifests.flatMap((manifest) =>
    manifest.capability_dependencies.map((dependency) => [dependency.module_id, dependency] as const)
  )).values()].map((dependency) => {
    const payload = packageProjections.get(dependency.package_id);
    const repoUrl = projectionString(payload?.source_repo) ?? '';
    const repoName = repoUrl.replace(/[\\/]+$/, '').replace(/\.git$/, '').split(/[\\/]/).at(-1)
      ?? dependency.package_id;
    const label = projectionString(payload?.display_name) ?? dependency.package_id;
    return {
      module_id: dependency.module_id,
      label,
      repo_name: repoName,
      repo_url: repoUrl,
      scope: 'capability_package' as const,
      default_install: false,
      description: label,
      skill_sync_domain: dependency.module_id,
      ...MODULE_ADAPTER_OVERRIDES[dependency.module_id],
    } satisfies DomainModuleRuntimeSpec;
  });

  return [...agentSpecs, ...dependencySpecs, ...LEGACY_RUNTIME_MODULE_ADAPTERS];
}

export const DOMAIN_MODULE_SPECS = buildDomainModuleSpecs();
