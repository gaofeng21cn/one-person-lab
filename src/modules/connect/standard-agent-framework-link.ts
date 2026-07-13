import fs from 'node:fs';
import path from 'node:path';

import { FrameworkContractError, isRecord } from '../../kernel/contract-validation.ts';
import { parseJsonText } from '../../kernel/json-file.ts';
import { buildOplFrameworkLocator } from './opl-framework-locator.ts';

const FRAMEWORK_PACKAGE_NAME = 'opl-framework';
const JAVASCRIPT_SOURCE_GLOBS = [
  '*.{js,mjs,cjs,ts,mts,cts}',
  '{src,scripts,packages}/**/*.{js,mjs,cjs,ts,mts,cts}',
];
const PYTHON_SOURCE_GLOBS = ['*.py', '{src,scripts}/**/*.py'];
const PYTHON_IMPORT_NAME = 'opl_framework';

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

function sourceContains(agentRoot: string, globs: string[], importName: string) {
  return fs.globSync(globs, {
    cwd: agentRoot,
    exclude: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.git/**'],
  }).some((relativePath) => fs.readFileSync(path.join(agentRoot, relativePath), 'utf8').includes(importName));
}

function readLinkTarget(linkPath: string) {
  try {
    const stat = fs.lstatSync(linkPath);
    if (!stat.isSymbolicLink()) {
      throw new FrameworkContractError('contract_shape_invalid', 'Framework link path is not a symlink.', {
        failure_code: 'framework_link_conflict',
        link_path: linkPath,
        repair_action: 'remove_the_agent_owned_conflict_then_rerun_opl_link_or_repair',
      });
    }
    return path.resolve(path.dirname(linkPath), fs.readlinkSync(linkPath));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
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
  const hasJavaScriptImport = sourceContains(agentRoot, JAVASCRIPT_SOURCE_GLOBS, FRAMEWORK_PACKAGE_NAME);
  const hasPythonImport = sourceContains(agentRoot, PYTHON_SOURCE_GLOBS, PYTHON_IMPORT_NAME);
  const javascriptLinkPath = path.join(agentRoot, 'node_modules', FRAMEWORK_PACKAGE_NAME);
  const pythonLinkPath = path.join(agentRoot, 'src', PYTHON_IMPORT_NAME);
  const pythonTargetRoot = path.join(frameworkRoot, 'python', PYTHON_IMPORT_NAME);
  const base = {
    surface_kind: 'opl_standard_agent_framework_link',
    agent_root: agentRoot,
    link_path: hasJavaScriptImport ? javascriptLinkPath : pythonLinkPath,
    target_root: frameworkRoot,
    import_specifier: FRAMEWORK_PACKAGE_NAME,
    javascript_link_path: hasJavaScriptImport ? javascriptLinkPath : null,
    python_link_path: hasPythonImport ? pythonLinkPath : null,
    python_target_root: hasPythonImport ? pythonTargetRoot : null,
    python_import_name: hasPythonImport ? PYTHON_IMPORT_NAME : null,
    authority_boundary: authorityBoundary(),
  } as const;

  if (!hasJavaScriptImport && !hasPythonImport) {
    return {
      ...base,
      status: 'not_applicable',
      reason: 'no_static_opl_framework_imports',
      writes_performed: false,
    } as const;
  }
  if (hasJavaScriptImport && packageReadout && declaresFrameworkDependency(packageReadout.manifest)) {
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

  const links = [
    ...(hasJavaScriptImport ? [{ path: javascriptLinkPath, target: frameworkRoot }] : []),
    ...(hasPythonImport ? [{ path: pythonLinkPath, target: pythonTargetRoot }] : []),
  ];
  const unresolvedLinks = links.filter((link) => readLinkTarget(link.path) !== link.target);

  if (unresolvedLinks.length === 0) {
    return { ...base, status: 'already_linked', reason: null, writes_performed: false } as const;
  }
  if (input.checkOnly) {
    throw new FrameworkContractError('contract_shape_invalid', 'Standard Agent framework link is missing or points to another root.', {
      failure_code: 'framework_link_missing',
      agent_root: agentRoot,
      unresolved_links: unresolvedLinks.map((link) => ({
        link_path: link.path,
        expected_target_root: link.target,
        existing_target_root: readLinkTarget(link.path),
      })),
      repair_command: `opl packages link-framework --agent-root ${agentRoot} --json`,
    });
  }
  if (input.dryRun) {
    return { ...base, status: 'validated_no_write', reason: null, writes_performed: false } as const;
  }

  for (const link of unresolvedLinks) {
    fs.mkdirSync(path.dirname(link.path), { recursive: true });
    if (readLinkTarget(link.path)) fs.unlinkSync(link.path);
    fs.symlinkSync(link.target, link.path, process.platform === 'win32' ? 'junction' : 'dir');
  }
  return { ...base, status: 'linked', reason: null, writes_performed: true } as const;
}
