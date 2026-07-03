#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = parseArgs(process.argv.slice(2));
const targetRoot = args.root ? path.resolve(args.root) : repoRoot;
const contractPath = args.contract
  ? path.resolve(args.contract)
  : path.join(targetRoot, 'contracts', 'opl-framework', 'source-module-map.json');
const policyPath = args.policy
  ? path.resolve(args.policy)
  : path.join(targetRoot, 'contracts', 'opl-framework', 'module-dependency-policy.json');

const failures = [];
const contract = readJson(contractPath);
const layout = readPhysicalLayout(contract);
const rootTsPolicy = readRootTsPolicy(layout);
const modules = readModules(contract);
const dependencyPolicy = readModuleDependencyPolicy(readOptionalJson(policyPath), modules, layout);
const moduleIds = modules.map((moduleEntry) => moduleEntry.moduleId);
const moduleIdSet = new Set(moduleIds);
const expectedModuleEntrypoints = [];
const missingModuleEntrypoints = [];
const mismatchedModuleEntrypoints = [];
const unexpectedModuleRoots = listModuleRootDirectories(contract.physical_module_root ?? 'src/modules')
  .filter((moduleId) => !moduleIdSet.has(moduleId));

for (const moduleEntry of modules) {
  const expectedEntrypoint = layout.moduleEntrypointPattern.replace('<module_id>', moduleEntry.moduleId);
  expectedModuleEntrypoints.push(expectedEntrypoint);
  if (moduleEntry.publicEntrypoint !== expectedEntrypoint) {
    mismatchedModuleEntrypoints.push({
      module_id: moduleEntry.moduleId,
      expected: expectedEntrypoint,
      actual: moduleEntry.publicEntrypoint,
    });
  }
  if (!existsRelative(expectedEntrypoint)) {
    missingModuleEntrypoints.push(expectedEntrypoint);
  }
}

if (mismatchedModuleEntrypoints.length > 0) {
  failures.push(...mismatchedModuleEntrypoints.map((entry) =>
    `${entry.module_id}: public_entrypoint must be ${entry.expected}, got ${entry.actual}`
  ));
}
if (missingModuleEntrypoints.length > 0) {
  failures.push(...missingModuleEntrypoints.map((entrypoint) => `${entrypoint}: module entrypoint is missing`));
}
if (unexpectedModuleRoots.length > 0) {
  failures.push(...unexpectedModuleRoots.map((moduleId) =>
    `${contract.physical_module_root ?? 'src/modules'}/${moduleId}: unexpected source module directory; update source-module-map and module-dependency-policy before adding another module`
  ));
}

const targetCliExists = existsRelative(layout.targetCliEntrypoint);
const legacyCliExists = existsRelative(layout.legacyCliEntrypoint);
const targetMode = args.enforceTarget || layout.stage === 'target' || targetCliExists;
const rootTsFiles = listTopLevelTsFiles(contract.source_root ?? 'src');
const exceptionByPath = new Map(rootTsPolicy.allowedTransitionExceptions.map((entry) => [entry.path, entry]));
const allowedRootTsFiles = [];
const unclassifiedRootTsFiles = [];
const retiredExceptionViolations = [];

for (const rootTsFile of rootTsFiles) {
  const exception = exceptionByPath.get(rootTsFile);
  if (!exception) {
    unclassifiedRootTsFiles.push(rootTsFile);
    continue;
  }
  allowedRootTsFiles.push(rootTsFile);
  if (exception.retire_when === 'target_cli_entrypoint_exists' && targetCliExists) {
    retiredExceptionViolations.push(rootTsFile);
  }
}

if (targetMode && !targetCliExists) {
  failures.push(`${layout.targetCliEntrypoint}: target CLI entrypoint is missing`);
}
if (!targetMode && !targetCliExists && !legacyCliExists) {
  failures.push(`${layout.targetCliEntrypoint}: target CLI entrypoint is missing and ${layout.legacyCliEntrypoint} is not available as a transition entrypoint`);
}
if (targetMode && unclassifiedRootTsFiles.length > 0) {
  failures.push(...unclassifiedRootTsFiles.map((file) =>
    `${file}: root-level src/*.ts is not an explicit entrypoint/kernel transition exception`
  ));
}
if (targetMode && retiredExceptionViolations.length > 0) {
  failures.push(...retiredExceptionViolations.map((file) =>
    `${file}: legacy CLI entrypoint must be retired after ${layout.targetCliEntrypoint} exists`
  ));
}

const crossModuleImports = inspectCrossModuleImports(contract, modules, layout, dependencyPolicy);
if (crossModuleImports.deep_import_violations.enforced && crossModuleImports.deep_import_violations.count > 0) {
  failures.push(`cross_module_imports: ${crossModuleImports.deep_import_violations.count} deep cross-module import(s) violate public entrypoint rule`);
}
if (crossModuleImports.forbidden_dependency_violations.count > 0) {
  failures.push(...crossModuleImports.forbidden_dependency_violations.items.map((entry) =>
    `${entry.from_module_id}->${entry.to_module_id}: forbidden module dependency used by ${entry.count} import(s)`
  ));
}
const summary = {
  status: failures.length === 0 ? 'ok' : 'failed',
  contract: relativeFromRoot(contractPath),
  module_dependency_policy: dependencyPolicy.path,
  layout_stage: layout.stage,
  enforcement: {
    mode: targetMode ? 'target' : 'transition',
    forced: args.enforceTarget,
    target_activation_path: layout.targetActivationPath,
    target_activation_exists: existsRelative(layout.targetActivationPath),
  },
  module_entrypoints: {
    expected_count: expectedModuleEntrypoints.length,
    missing: missingModuleEntrypoints,
    mismatched: mismatchedModuleEntrypoints,
    unexpected_module_roots: unexpectedModuleRoots,
  },
  cli_entrypoint: {
    target: layout.targetCliEntrypoint,
    target_exists: targetCliExists,
    legacy: layout.legacyCliEntrypoint,
    legacy_exists: legacyCliExists,
  },
  root_ts: {
    top_level_count: rootTsFiles.length,
    target_top_level_ts_count: rootTsPolicy.targetTopLevelTsCount,
    allowed_transition_exception_count: allowedRootTsFiles.length,
    unclassified_transition_count: unclassifiedRootTsFiles.length,
    unclassified_transition_files: targetMode || failures.length > 0 ? unclassifiedRootTsFiles : [],
    retired_exception_violations: retiredExceptionViolations,
  },
  cross_module_imports: crossModuleImports,
  failures,
};

process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
if (failures.length > 0) {
  process.stderr.write(`source module boundary check failed (${failures.length} issue${failures.length === 1 ? '' : 's'}):\n`);
  process.stderr.write(failures.map((failure) => `- ${failure}`).join('\n'));
  process.stderr.write('\n');
  process.exit(1);
}

function parseArgs(argv) {
  const parsed = {
    root: null,
    contract: null,
    policy: null,
    enforceTarget: false,
    strictImports: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--root') {
      parsed.root = readArgValue(argv, index, '--root');
      index += 1;
    } else if (value.startsWith('--root=')) {
      parsed.root = value.slice('--root='.length);
    } else if (value === '--contract') {
      parsed.contract = readArgValue(argv, index, '--contract');
      index += 1;
    } else if (value.startsWith('--contract=')) {
      parsed.contract = value.slice('--contract='.length);
    } else if (value === '--policy') {
      parsed.policy = readArgValue(argv, index, '--policy');
      index += 1;
    } else if (value.startsWith('--policy=')) {
      parsed.policy = value.slice('--policy='.length);
    } else if (value === '--enforce-target') {
      parsed.enforceTarget = true;
    } else if (value === '--strict-imports') {
      parsed.strictImports = true;
    } else {
      process.stderr.write(`source module boundary: unknown argument ${value}\n`);
      process.exit(1);
    }
  }
  return parsed;
}

function readArgValue(argv, index, flag) {
  const value = argv[index + 1];
  if (!value) {
    process.stderr.write(`source module boundary: ${flag} requires a value\n`);
    process.exit(1);
  }
  return value;
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    process.stderr.write(`source module boundary: failed to read ${file}: ${error.message}\n`);
    process.exit(1);
  }
}

function readOptionalJson(file) {
  if (!fs.existsSync(file)) {
    return null;
  }
  return readJson(file);
}

function readPhysicalLayout(contractValue) {
  const value = contractValue.physical_layout;
  if (!isRecord(value)) {
    failures.push('physical_layout: missing source module physical layout contract');
    return {
      stage: 'transition',
      moduleEntrypointPattern: 'src/modules/<module_id>/index.ts',
      targetCliEntrypoint: 'src/entrypoints/cli.ts',
      legacyCliEntrypoint: 'src/cli.ts',
      targetActivationPath: 'src/entrypoints/cli.ts',
      rootTsPolicy: {},
    };
  }
  const moduleEntrypointPattern = readString(value.module_entrypoint_pattern, 'physical_layout.module_entrypoint_pattern');
  const targetCliEntrypoint = readString(value.target_cli_entrypoint, 'physical_layout.target_cli_entrypoint');
  const legacyCliEntrypoint = readString(value.legacy_cli_entrypoint, 'physical_layout.legacy_cli_entrypoint');
  return {
    stage: readString(value.stage, 'physical_layout.stage'),
    moduleEntrypointPattern,
    targetCliEntrypoint,
    legacyCliEntrypoint,
    targetActivationPath: readString(value.target_activation_path, 'physical_layout.target_activation_path'),
    rootTsPolicy: isRecord(value.root_ts_policy) ? value.root_ts_policy : {},
  };
}

function readRootTsPolicy(layoutValue) {
  const policy = layoutValue.rootTsPolicy;
  if (!isRecord(policy)) {
    failures.push('physical_layout.root_ts_policy: missing root TypeScript policy');
  }
  const allowedKinds = readStringArray(
    policy.allowed_transition_exception_kinds,
    'physical_layout.root_ts_policy.allowed_transition_exception_kinds',
  );
  const allowedKindSet = new Set(allowedKinds);
  const entries = Array.isArray(policy.allowed_transition_exceptions)
    ? policy.allowed_transition_exceptions
    : [];
  if (!Array.isArray(policy.allowed_transition_exceptions)) {
    failures.push('physical_layout.root_ts_policy.allowed_transition_exceptions must be an array');
  }
  const allowedTransitionExceptions = entries.flatMap((entry, index) => {
    if (!isRecord(entry)) {
      failures.push(`physical_layout.root_ts_policy.allowed_transition_exceptions.${index}: entry must be an object`);
      return [];
    }
    const exception = {
      path: readString(entry.path, `physical_layout.root_ts_policy.allowed_transition_exceptions.${index}.path`),
      kind: readString(entry.kind, `physical_layout.root_ts_policy.allowed_transition_exceptions.${index}.kind`),
      target_path: readString(entry.target_path, `physical_layout.root_ts_policy.allowed_transition_exceptions.${index}.target_path`),
      retire_when: typeof entry.retire_when === 'string' ? entry.retire_when : null,
    };
    if (!allowedKindSet.has(exception.kind)) {
      failures.push(`${exception.path}: transition exception kind must be one of ${allowedKinds.join(', ')}`);
    }
    return [exception];
  });
  return {
    targetTopLevelTsCount: readNonNegativeInteger(
      policy.target_top_level_ts_count,
      'physical_layout.root_ts_policy.target_top_level_ts_count',
    ),
    allowedTransitionExceptions,
  };
}

function readModules(contractValue) {
  if (!Array.isArray(contractValue.modules)) {
    failures.push('modules: source module map must contain a modules array');
    return [];
  }
  const seen = new Set();
  return contractValue.modules.flatMap((entry, index) => {
    if (!isRecord(entry)) {
      failures.push(`modules.${index}: entry must be an object`);
      return [];
    }
    const moduleId = readString(entry.module_id, `modules.${index}.module_id`);
    if (seen.has(moduleId)) {
      failures.push(`${moduleId}: duplicate source module id`);
    }
    seen.add(moduleId);
    return [{
      moduleId,
      publicEntrypoint: readString(entry.public_entrypoint, `modules.${index}.public_entrypoint`),
    }];
  });
}

function readModuleDependencyPolicy(policyValue, modulesValue, layoutValue) {
  const knownModuleIds = modulesValue.map((moduleEntry) => moduleEntry.moduleId);
  const knownModuleIdSet = new Set(knownModuleIds);
  const defaultPolicy = {
    path: fs.existsSync(policyPath) ? relativeFromRoot(policyPath) : null,
    module_ids: knownModuleIds,
    aggregate_entrypoint: 'src/modules/index.ts',
    public_entrypoint_rule: {
      module_entrypoint_pattern: layoutValue.moduleEntrypointPattern,
      cross_module_imports: 'public_entrypoint',
    },
    source_scan_scope: 'all_module_ts_files',
    deep_import_failure_mode: args.strictImports ? 'strict' : 'advisory',
    forbiddenPairs: new Map(),
  };
  if (!policyValue) {
    return defaultPolicy;
  }

  const publicEntrypointRule = isRecord(policyValue.public_entrypoint_rule) ? policyValue.public_entrypoint_rule : {};
  if (!isRecord(policyValue.public_entrypoint_rule)) {
    failures.push('module_dependency_policy.public_entrypoint_rule: expected object');
  }
  const policyEntrypointPattern = readString(
    publicEntrypointRule.module_entrypoint_pattern,
    'module_dependency_policy.public_entrypoint_rule.module_entrypoint_pattern',
  );
  if (policyEntrypointPattern && policyEntrypointPattern !== layoutValue.moduleEntrypointPattern) {
    failures.push(
      `module_dependency_policy.public_entrypoint_rule.module_entrypoint_pattern: expected ${layoutValue.moduleEntrypointPattern}, got ${policyEntrypointPattern}`,
    );
  }

  const dependencyPolicy = isRecord(policyValue.dependency_policy) ? policyValue.dependency_policy : {};
  if (!isRecord(policyValue.dependency_policy)) {
    failures.push('module_dependency_policy.dependency_policy: expected object');
  }
  const sourceScanScope = isRecord(policyValue.source_scan_scope) ? policyValue.source_scan_scope : {};
  if (!isRecord(policyValue.source_scan_scope)) {
    failures.push('module_dependency_policy.source_scan_scope: expected object');
  }
  const deepImportPolicy = isRecord(policyValue.deep_cross_module_imports)
    ? policyValue.deep_cross_module_imports
    : {};
  if (!isRecord(policyValue.deep_cross_module_imports)) {
    failures.push('module_dependency_policy.deep_cross_module_imports: expected object');
  }

  return {
    path: relativeFromRoot(policyPath),
    module_ids: knownModuleIds,
    aggregate_entrypoint: readString(
      publicEntrypointRule.aggregate_entrypoint,
      'module_dependency_policy.public_entrypoint_rule.aggregate_entrypoint',
    ),
    public_entrypoint_rule: {
      module_entrypoint_pattern: policyEntrypointPattern,
      cross_module_imports: readString(
        publicEntrypointRule.cross_module_imports,
        'module_dependency_policy.public_entrypoint_rule.cross_module_imports',
      ),
    },
    source_scan_scope: readString(
      sourceScanScope.checker_scope,
      'module_dependency_policy.source_scan_scope.checker_scope',
    ),
    deep_import_failure_mode: args.strictImports
      ? 'strict'
      : readFailureMode(
        deepImportPolicy.failure_mode,
        'module_dependency_policy.deep_cross_module_imports.failure_mode',
      ),
    forbiddenPairs: readForbiddenPairs(dependencyPolicy.forbidden_dependencies, knownModuleIdSet),
  };
}

function readForbiddenPairs(value, knownModuleIdSet) {
  const forbidden = new Map();
  if (!Array.isArray(value)) {
    failures.push('module_dependency_policy.dependency_policy.forbidden_dependencies: expected array');
    return forbidden;
  }
  for (const [index, entry] of value.entries()) {
    if (!isRecord(entry)) {
      failures.push(`module_dependency_policy.dependency_policy.forbidden_dependencies.${index}: expected object`);
      continue;
    }
    const fromModuleId = readString(entry.from_module_id, `module_dependency_policy.dependency_policy.forbidden_dependencies.${index}.from_module_id`);
    const toModuleId = readString(entry.to_module_id, `module_dependency_policy.dependency_policy.forbidden_dependencies.${index}.to_module_id`);
    if (!knownModuleIdSet.has(fromModuleId)) {
      failures.push(`module_dependency_policy.dependency_policy.forbidden_dependencies.${index}.from_module_id: unknown ${fromModuleId}`);
      continue;
    }
    if (!knownModuleIdSet.has(toModuleId)) {
      failures.push(`module_dependency_policy.dependency_policy.forbidden_dependencies.${index}.to_module_id: unknown ${toModuleId}`);
      continue;
    }
    forbidden.set(`${fromModuleId}->${toModuleId}`, {
      from_module_id: fromModuleId,
      to_module_id: toModuleId,
      reason: typeof entry.reason === 'string' ? entry.reason : '',
    });
  }
  return forbidden;
}

function readFailureMode(value, field) {
  if (value === 'advisory' || value === 'strict') {
    return value;
  }
  failures.push(`${field}: expected advisory or strict`);
  return 'advisory';
}

function inspectCrossModuleImports(contractValue, modulesValue, layoutValue, policyValue) {
  const physicalModuleRoot = contractValue.physical_module_root ?? 'src/modules';
  const moduleIdSet = new Set(modulesValue.map((moduleEntry) => moduleEntry.moduleId));
  const moduleEntrypoints = new Map(modulesValue.map((moduleEntry) => [
    moduleEntry.moduleId,
    layoutValue.moduleEntrypointPattern.replace('<module_id>', moduleEntry.moduleId),
  ]));
  const pairCounts = new Map();
  const deepImportExamples = [];
  const forbiddenImports = new Map();

  const moduleSourceFiles = listModuleSourceFiles(physicalModuleRoot, moduleIdSet);
  for (const file of moduleSourceFiles) {
    const fromModuleId = moduleIdFromPath(file, physicalModuleRoot);
    if (!fromModuleId) {
      continue;
    }
    const text = fs.readFileSync(path.join(targetRoot, ...file.split('/')), 'utf8');
    for (const importRef of readImportSpecifiers(text)) {
      const resolved = resolveRelativeImport(file, importRef.specifier);
      if (!resolved) {
        continue;
      }
      const toModuleId = moduleIdFromPath(resolved, physicalModuleRoot);
      if (!toModuleId || toModuleId === fromModuleId) {
        continue;
      }
      const pairKey = `${fromModuleId}->${toModuleId}`;
      pairCounts.set(pairKey, (pairCounts.get(pairKey) ?? 0) + 1);
      const importEntry = {
        from_module_id: fromModuleId,
        to_module_id: toModuleId,
        importing_file: file,
        imported_specifier: importRef.specifier,
        resolved_path: resolved,
        expected_public_entrypoint: moduleEntrypoints.get(toModuleId),
      };
      if (!isPublicModuleEntrypoint(resolved, toModuleId, physicalModuleRoot)) {
        deepImportExamples.push(importEntry);
      }
      if (policyValue.forbiddenPairs.has(pairKey)) {
        addImportViolation(forbiddenImports, pairKey, importEntry);
      }
    }
  }

  const sortedPairCounts = [...pairCounts.entries()]
    .map(([pair, count]) => {
      const [fromModuleId, toModuleId] = pair.split('->');
      return { from_module_id: fromModuleId, to_module_id: toModuleId, count };
    })
    .sort(compareModulePairEntries);
  const forbiddenItems = summarizeImportViolations(forbiddenImports);
  return {
    policy: {
      module_count: policyValue.module_ids.length,
      source_scan_scope: policyValue.source_scan_scope,
      public_entrypoint_rule: policyValue.public_entrypoint_rule.cross_module_imports,
      deep_import_failure_mode: policyValue.deep_import_failure_mode,
      strict_imports_requested: args.strictImports,
    },
    pair_counts: sortedPairCounts,
    deep_import_violations: {
      count: deepImportExamples.length,
      failure_mode: policyValue.deep_import_failure_mode,
      enforced: policyValue.deep_import_failure_mode === 'strict',
      examples: deepImportExamples.slice(0, 25),
    },
    forbidden_dependency_violations: {
      count: forbiddenItems.reduce((sum, entry) => sum + entry.count, 0),
      items: forbiddenItems,
    },
    source_files_scanned: moduleSourceFiles.length,
  };
}

function readImportSpecifiers(text) {
  const imports = [];
  const pattern = /\b(?:import|export)\s+(?:type\s+)?(?:[^'"();]*?\s+from\s*)?['"]([^'"]+)['"]/g;
  let match;
  while ((match = pattern.exec(text))) {
    imports.push({ specifier: match[1] });
  }
  return imports;
}

function resolveRelativeImport(importingFile, specifier) {
  if (!specifier.startsWith('.')) {
    return null;
  }
  return normalizeRelativePath(path.normalize(path.join(path.dirname(importingFile), specifier)))
    .replace(/\.(ts|tsx|js|jsx|mjs|cjs)$/, '');
}

function moduleIdFromPath(relativePath, physicalModuleRoot) {
  const modulePrefix = `${physicalModuleRoot}/`;
  if (!relativePath.startsWith(modulePrefix)) {
    return null;
  }
  const rest = relativePath.slice(modulePrefix.length);
  const [moduleId] = rest.split('/');
  return moduleId || null;
}

function isPublicModuleEntrypoint(relativePath, moduleId, physicalModuleRoot) {
  const rest = relativePath.slice(`${physicalModuleRoot}/${moduleId}`.length).replace(/^\//, '');
  return rest === '' || rest === 'index' || rest === 'index.ts';
}

function addImportViolation(violations, pairKey, importEntry) {
  const current = violations.get(pairKey) ?? [];
  current.push(importEntry);
  violations.set(pairKey, current);
}

function summarizeImportViolations(violations) {
  return [...violations.entries()]
    .map(([pair, imports]) => {
      const [fromModuleId, toModuleId] = pair.split('->');
      return {
        from_module_id: fromModuleId,
        to_module_id: toModuleId,
        count: imports.length,
        examples: imports.slice(0, 10),
      };
    })
    .sort(compareModulePairEntries);
}

function compareModulePairEntries(left, right) {
  return `${left.from_module_id}->${left.to_module_id}`.localeCompare(`${right.from_module_id}->${right.to_module_id}`);
}

function readString(value, field) {
  if (typeof value === 'string' && value.length > 0) {
    return normalizeRelativePath(value);
  }
  failures.push(`${field}: expected non-empty string`);
  return '';
}

function readStringArray(value, field) {
  if (!Array.isArray(value)) {
    failures.push(`${field}: expected array`);
    return [];
  }
  return value.flatMap((entry, index) => {
    if (typeof entry !== 'string' || entry.length === 0) {
      failures.push(`${field}.${index}: expected non-empty string`);
      return [];
    }
    return [entry];
  });
}

function readNonNegativeInteger(value, field) {
  if (Number.isInteger(value) && value >= 0) {
    return value;
  }
  failures.push(`${field}: expected non-negative integer`);
  return 0;
}

function normalizeRelativePath(value) {
  return value.replaceAll('\\', '/').replace(/^\.\/+/, '');
}

function existsRelative(relativePath) {
  return fs.existsSync(path.join(targetRoot, ...relativePath.split('/')));
}

function listTopLevelTsFiles(sourceRoot) {
  const sourceDir = path.join(targetRoot, sourceRoot);
  if (!fs.existsSync(sourceDir)) {
    failures.push(`${sourceRoot}: source root is missing`);
    return [];
  }
  return fs.readdirSync(sourceDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
    .map((entry) => `${sourceRoot}/${entry.name}`)
    .sort();
}

function listModuleRootDirectories(physicalModuleRoot) {
  const moduleRoot = path.join(targetRoot, ...physicalModuleRoot.split('/'));
  if (!fs.existsSync(moduleRoot)) {
    failures.push(`${physicalModuleRoot}: physical module root is missing`);
    return [];
  }
  return fs.readdirSync(moduleRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function listModuleSourceFiles(physicalModuleRoot, moduleIdSet) {
  const files = [];
  for (const moduleId of moduleIdSet) {
    const moduleRoot = path.join(targetRoot, ...physicalModuleRoot.split('/'), moduleId);
    if (!fs.existsSync(moduleRoot)) {
      continue;
    }
    collectTsFiles(moduleRoot, `${physicalModuleRoot}/${moduleId}`, files);
  }
  return files.sort();
}

function collectTsFiles(directory, relativeDirectory, files) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const relativePath = `${relativeDirectory}/${entry.name}`;
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      collectTsFiles(absolutePath, relativePath, files);
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.ts')) {
      files.push(relativePath);
    }
  }
}

function relativeFromRoot(file) {
  const relative = path.relative(targetRoot, file);
  return relative.startsWith('..') ? file : normalizeRelativePath(relative);
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
