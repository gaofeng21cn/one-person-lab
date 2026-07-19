import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';

import { FrameworkContractError, isRecord } from '../../kernel/contract-validation.ts';
import type { FrameworkContracts } from '../../kernel/types.ts';
import { inspectStandardAgentFrameworkImports } from '../connect/index.ts';
import { buildGeneratedAgentInterfaces } from '../pack/index.ts';
import { buildAgentProfileConformance } from '../pack/index.ts';
import { validateStandardDomainAgentScaffold } from '../pack/index.ts';

function readJson(filePath: string) {
  if (!fs.existsSync(filePath)) return null;
  const value: unknown = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return isRecord(value) ? value : null;
}

function frameworkCompatibility(repoDir: string) {
  const packageJson = readJson(path.join(repoDir, 'package.json'));
  const pyprojectPath = path.join(repoDir, 'pyproject.toml');
  const pyproject = fs.existsSync(pyprojectPath) ? fs.readFileSync(pyprojectPath, 'utf8') : '';
  const dependencies = {
    ...(isRecord(packageJson?.dependencies) ? packageJson.dependencies : {}),
    ...(isRecord(packageJson?.devDependencies) ? packageJson.devDependencies : {}),
  };
  const dependencyRef = typeof dependencies['opl-framework'] === 'string'
    ? dependencies['opl-framework']
    : null;
  const pythonDependencyRef = pyproject.includes('git+https://github.com/gaofeng21cn/one-person-lab.git')
    ? 'git_owned_framework_dependency'
    : null;
  const frameworkImports = inspectStandardAgentFrameworkImports(repoDir);
  const requiredExports = frameworkImports.requiredExports;
  const requiresPythonFramework = frameworkImports.hasPythonImport;
  if (!dependencyRef && !pythonDependencyRef && requiredExports.length === 0 && !requiresPythonFramework) {
    return { status: 'not_applicable', dependency_ref: null, required_exports: [], missing_exports: [] };
  }
  const frameworkRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
  const frameworkPackage = readJson(path.join(frameworkRoot, 'package.json'));
  const availableExports = isRecord(frameworkPackage?.exports) ? Object.keys(frameworkPackage.exports) : [];
  const missingExports = requiredExports.filter((entry) => !availableExports.includes(entry));
  const frameworkLink = path.join(repoDir, 'node_modules', 'opl-framework');
  let managedLink = false;
  try {
    managedLink = fs.lstatSync(frameworkLink).isSymbolicLink()
      && fs.realpathSync(frameworkLink) === fs.realpathSync(frameworkRoot);
  } catch {
    managedLink = false;
  }
  const pythonFrameworkLink = path.join(repoDir, 'src', 'opl_framework');
  const pythonFrameworkTarget = path.join(frameworkRoot, 'python', 'opl_framework');
  let managedPythonLink = false;
  try {
    managedPythonLink = fs.lstatSync(pythonFrameworkLink).isSymbolicLink()
      && fs.realpathSync(pythonFrameworkLink) === fs.realpathSync(pythonFrameworkTarget);
  } catch {
    managedPythonLink = false;
  }
  const blockers = [
    dependencyRef ? 'agent_manifest_must_not_own_opl_framework_dependency' : null,
    pythonDependencyRef ? 'agent_manifest_must_not_own_opl_framework_python_dependency' : null,
    requiredExports.length > 0 && !managedLink ? 'opl_managed_framework_link_missing' : null,
    requiresPythonFramework && !managedPythonLink ? 'opl_managed_framework_python_link_missing' : null,
    ...missingExports.map((entry) => `current_opl_export_missing:${entry}`),
  ].filter((entry): entry is string => Boolean(entry));
  return {
    status: blockers.length === 0 ? 'compatible' : 'blocked',
    dependency_ref: dependencyRef,
    python_dependency_ref: pythonDependencyRef,
    managed_link: managedLink,
    managed_python_link: managedPythonLink,
    requires_python_framework: requiresPythonFramework,
    required_exports: requiredExports,
    missing_exports: missingExports,
    blockers,
  };
}

function parseCheckArgs(args: string[]) {
  let values: ReturnType<typeof parseArgs>['values'];
  try {
    ({ values } = parseArgs({
      args,
      options: {
        repo: { type: 'string' },
        profile: { type: 'string' },
      },
      strict: true,
      allowPositionals: false,
    }));
  } catch (error) {
    throw new FrameworkContractError('cli_usage_error', String(error));
  }
  if (typeof values.repo !== 'string' || !values.repo.trim()) {
    throw new FrameworkContractError('cli_usage_error', 'opl agents check requires --repo <agent_repo>.');
  }
  return {
    repoDir: path.resolve(values.repo),
    profileId: typeof values.profile === 'string' && values.profile.trim() ? values.profile.trim() : null,
  };
}

export function buildStandardAgentCheck(
  contracts: FrameworkContracts,
  args: string[],
  options: NonNullable<Parameters<typeof buildGeneratedAgentInterfaces>[2]> = {},
) {
  const { repoDir, profileId } = parseCheckArgs(args);
  const blocked = (error: unknown) => ({
    status: 'blocked',
    blockers: [error instanceof Error ? error.message : String(error)],
  });
  let scaffold: Record<string, unknown>;
  let generated: Record<string, unknown>;
  let profile: Record<string, unknown>;
  let compatibility: Record<string, unknown>;
  try {
    scaffold = validateStandardDomainAgentScaffold({ repoDir }).standard_domain_agent_scaffold_validation;
  } catch (error) {
    scaffold = blocked(error);
  }
  try {
    generated = buildGeneratedAgentInterfaces(contracts, ['--repo-dir', repoDir], options).generated_agent_interfaces;
  } catch (error) {
    generated = blocked(error);
  }
  try {
    profile = profileId
      ? buildAgentProfileConformance(['--repo-dir', repoDir, '--profile', profileId]).profile_conformance
      : { status: 'not_requested', profile_id: null, blockers: [] };
  } catch (error) {
    profile = blocked(error);
  }
  try {
    compatibility = frameworkCompatibility(repoDir);
  } catch (error) {
    compatibility = blocked(error);
  }
  const checks = {
    scaffold: { status: scaffold.status, blockers: scaffold.blockers ?? [] },
    generated_interfaces: {
      status: generated.status,
      blockers: Array.isArray(generated.blocker_reasons) ? generated.blocker_reasons : [],
    },
    profile_conformance: profile,
    framework_compatibility: compatibility,
  };
  const blockedChecks = Object.entries(checks)
    .filter(([, value]) => value.status === 'blocked')
    .map(([name]) => name);
  return {
    version: 'g2',
    standard_agent_check: {
      surface_kind: 'opl_standard_agent_check',
      version: 'standard-agent-check.v1',
      repo_dir: repoDir,
      status: blockedChecks.length === 0 ? 'passed' : 'blocked',
      blocked_checks: blockedChecks,
      checks,
      authority_boundary: {
        aggregates_existing_checks_only: true,
        can_write_domain_truth: false,
        can_create_owner_receipt: false,
        can_claim_domain_ready: false,
        can_claim_production_ready: false,
      },
    },
  };
}
