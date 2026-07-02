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

const failures = [];
const contract = readJson(contractPath);
const layout = readPhysicalLayout(contract);
const rootTsPolicy = readRootTsPolicy(layout);
const modules = readModules(contract);
const expectedModuleEntrypoints = [];
const missingModuleEntrypoints = [];
const mismatchedModuleEntrypoints = [];

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

const summary = {
  status: failures.length === 0 ? 'ok' : 'failed',
  contract: relativeFromRoot(contractPath),
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
    enforceTarget: false,
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
    } else if (value === '--enforce-target') {
      parsed.enforceTarget = true;
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

function relativeFromRoot(file) {
  const relative = path.relative(targetRoot, file);
  return relative.startsWith('..') ? file : normalizeRelativePath(relative);
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
