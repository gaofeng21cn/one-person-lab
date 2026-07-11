import fs from 'node:fs';
import path from 'node:path';

import { FrameworkContractError, isRecord } from '../../kernel/contract-validation.ts';
import { parseJsonText } from '../../kernel/json-file.ts';
import { buildOplFrameworkLocator } from './opl-framework-locator.ts';

const FRAMEWORK_PACKAGE_NAME = 'opl-framework';
const SOURCE_GLOBS = [
  '*.{js,mjs,cjs,ts,mts,cts}',
  '{src,scripts,packages}/**/*.{js,mjs,cjs,ts,mts,cts}',
];

export type StandardAgentFrameworkLinkInput = {
  agentRoot: string;
  dryRun?: boolean;
  checkOnly?: boolean;
};

function readPackageManifest(agentRoot: string) {
  const manifestPath = path.join(agentRoot, 'package.json');
  if (!fs.existsSync(manifestPath)) return null;
  const manifest = parseJsonText(fs.readFileSync(manifestPath, 'utf8'));
  if (!isRecord(manifest)) {
    throw new FrameworkContractError('contract_shape_invalid', 'Standard Agent package.json must be an object.', {
      agent_root: agentRoot,
      manifest_path: manifestPath,
    });
  }
  return { manifest, manifestPath };
}

function declaresFrameworkDependency(manifest: Record<string, unknown>) {
  return ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'].some((field) => {
    const dependencies = isRecord(manifest[field]) ? manifest[field] : {};
    return Object.hasOwn(dependencies, FRAMEWORK_PACKAGE_NAME);
  });
}

function hasStaticFrameworkImport(agentRoot: string) {
  return fs.globSync(SOURCE_GLOBS, {
    cwd: agentRoot,
    exclude: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.git/**'],
  }).some((relativePath) => fs.readFileSync(path.join(agentRoot, relativePath), 'utf8').includes(FRAMEWORK_PACKAGE_NAME));
}

function authorityBoundary() {
  return {
    opl_owns_framework_install_runtime_and_generated_surfaces: true,
    agent_owns_domain_truth_artifacts_verdicts_memory_and_owner_receipts: true,
    link_can_write_domain_truth: false,
    link_can_mutate_domain_artifact_body: false,
    link_can_authorize_quality_or_export: false,
    link_can_create_owner_receipt: false,
  } as const;
}

export function materializeStandardAgentFrameworkLink(input: StandardAgentFrameworkLinkInput) {
  const agentRoot = fs.realpathSync.native(path.resolve(input.agentRoot));
  const packageReadout = readPackageManifest(agentRoot);
  const frameworkRoot = buildOplFrameworkLocator().framework_locator.resolved.root;
  const linkPath = path.join(agentRoot, 'node_modules', FRAMEWORK_PACKAGE_NAME);
  const base = {
    surface_kind: 'opl_standard_agent_framework_link',
    agent_root: agentRoot,
    link_path: linkPath,
    target_root: frameworkRoot,
    import_specifier: FRAMEWORK_PACKAGE_NAME,
    authority_boundary: authorityBoundary(),
  } as const;

  if (!packageReadout || !hasStaticFrameworkImport(agentRoot)) {
    return {
      ...base,
      status: 'not_applicable',
      reason: packageReadout ? 'no_static_opl_framework_imports' : 'package_manifest_absent',
      writes_performed: false,
    } as const;
  }
  if (declaresFrameworkDependency(packageReadout.manifest)) {
    if (input.checkOnly) {
      throw new FrameworkContractError('contract_shape_invalid', 'Standard Agent manifest still owns the OPL Framework dependency.', {
        failure_code: 'framework_dependency_manifest_owned',
        agent_root: agentRoot,
        manifest_path: packageReadout.manifestPath,
        remove_dependency: FRAMEWORK_PACKAGE_NAME,
      });
    }
    return {
      ...base,
      status: 'not_applicable',
      reason: 'package_manifest_still_owns_framework_dependency',
      writes_performed: false,
    } as const;
  }

  let existingTarget: string | null = null;
  try {
    const stat = fs.lstatSync(linkPath);
    if (!stat.isSymbolicLink()) {
      throw new FrameworkContractError('contract_shape_invalid', 'Framework link path is not a symlink.', {
        failure_code: 'framework_link_conflict',
        agent_root: agentRoot,
        link_path: linkPath,
        repair_action: 'remove_the_agent_owned_conflict_then_rerun_opl_link_or_repair',
      });
    }
    existingTarget = path.resolve(path.dirname(linkPath), fs.readlinkSync(linkPath));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }

  if (existingTarget === frameworkRoot) {
    return { ...base, status: 'already_linked', reason: null, writes_performed: false } as const;
  }
  if (input.checkOnly) {
    throw new FrameworkContractError('contract_shape_invalid', 'Standard Agent framework link is missing or points to another root.', {
      failure_code: 'framework_link_missing',
      agent_root: agentRoot,
      link_path: linkPath,
      expected_target_root: frameworkRoot,
      existing_target_root: existingTarget,
      repair_command: `opl connect agent-packages link-framework --agent-root ${agentRoot} --json`,
    });
  }
  if (input.dryRun) {
    return { ...base, status: 'validated_no_write', reason: null, writes_performed: false } as const;
  }

  fs.mkdirSync(path.dirname(linkPath), { recursive: true });
  if (existingTarget) fs.unlinkSync(linkPath);
  fs.symlinkSync(frameworkRoot, linkPath, process.platform === 'win32' ? 'junction' : 'dir');
  return { ...base, status: 'linked', reason: null, writes_performed: true } as const;
}
