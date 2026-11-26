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
  const projections = listCurrentPackageProjections(packageDirectory, { officialOnly: true });
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
    } satisfies DomainModuleRuntimeSpec;
  });

  return [...agentSpecs, ...dependencySpecs, ...LEGACY_RUNTIME_MODULE_ADAPTERS];
}

export const DOMAIN_MODULE_SPECS = buildDomainModuleSpecs();
