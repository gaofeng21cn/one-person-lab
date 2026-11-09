#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import semver from 'semver';
import * as ts from 'typescript/unstable/ast';
import { API } from 'typescript/unstable/sync';

const defaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const options = readOptions(process.argv.slice(2));
if (options.help) {
  process.stdout.write([
    'Usage: node scripts/source-package-boundary.mjs [options]',
    '',
    'Options:',
    '  --root <path>      Repository root to inspect.',
    '  --contract <path>  Package topology contract.',
    '  --format json      Machine-readable output format (default).',
    '  --help             Print this help.',
    '',
  ].join('\n'));
  process.exit(0);
}

const repoRoot = path.resolve(options.root ?? defaultRoot);
const contractPath = path.resolve(
  options.contract ?? path.join(repoRoot, 'contracts/opl-framework/package-topology.json'),
);
const failures = [];
const rootManifest = readJson(path.join(repoRoot, 'package.json'), 'root package manifest');
const topology = readJson(contractPath, 'package topology contract');
const entries = Array.isArray(topology.packages) ? topology.packages : [];
if (!Array.isArray(topology.packages)) failures.push('packages: topology must declare a package array');
if (topology.version !== 'package-topology.v2') failures.push('version: package topology must be package-topology.v2');

const sourceTopologyRef = requiredString(topology.source_topology_ref, 'source_topology_ref');
const sourceTopologyPath = path.resolve(repoRoot, sourceTopologyRef);
const sourceTopology = readJson(sourceTopologyPath, 'source topology contract');
const sourceUnitIds = new Set(
  Array.isArray(sourceTopology.source_units)
    ? sourceTopology.source_units.map((entry) => entry?.unit_id).filter((value) => typeof value === 'string')
    : [],
);
const capabilityRegistryRef = requiredString(
  sourceTopology.capability_domain_registry_ref,
  'source_topology.capability_domain_registry_ref',
);
const capabilityRegistry = readJson(path.resolve(repoRoot, capabilityRegistryRef), 'capability-domain registry');
const capabilityDomainIds = new Set(
  Array.isArray(capabilityRegistry.domains)
    ? capabilityRegistry.domains.map((entry) => entry?.domain_id).filter((value) => typeof value === 'string')
    : [],
);
const legacyPaths = topology.legacy_paths;
if (!legacyPaths || typeof legacyPaths !== 'object' || Array.isArray(legacyPaths)) {
  failures.push('legacy_paths: topology must declare retired paths');
} else {
  if (legacyPaths.state !== 'retired') failures.push('legacy_paths.state: must be retired');
  if (legacyPaths.must_be_absent !== true) failures.push('legacy_paths.must_be_absent: must be true');
  for (const legacyPath of Array.isArray(legacyPaths.paths) ? legacyPaths.paths : []) {
    if (fs.existsSync(path.resolve(repoRoot, legacyPath))) failures.push(`${legacyPath}: retired Package source path must be absent`);
  }
}
for (const targetSourceRoot of Array.isArray(topology.target_source_roots) ? topology.target_source_roots : []) {
  if (!fs.existsSync(path.resolve(repoRoot, targetSourceRoot))) failures.push(`${targetSourceRoot}: target Package source root is missing`);
}

const contractPaths = entries.map((entry, index) => requiredString(entry?.path, `packages.${index}.path`));
const contractIds = entries.map((entry, index) => requiredString(entry?.package_id, `packages.${index}.package_id`));
recordDuplicates(contractPaths, 'package path');
recordDuplicates(contractIds, 'package id');

const workspacePatterns = Array.isArray(rootManifest.workspaces)
  ? rootManifest.workspaces.filter((value) => typeof value === 'string')
  : [];
if (workspacePatterns.length === 0) failures.push('package.json: workspaces must be a non-empty string array');
const workspacePaths = expandWorkspacePackagePaths(workspacePatterns);
const contractPathSet = new Set(contractPaths);
const workspacePathSet = new Set(workspacePaths);
for (const packagePath of contractPaths) {
  if (!workspacePathSet.has(packagePath)) failures.push(`${packagePath}: topology package is not a root workspace`);
}
for (const packagePath of workspacePaths) {
  if (!contractPathSet.has(packagePath)) failures.push(`${packagePath}: workspace Package is absent from package topology`);
}

const packageById = new Map();
const packageResults = [];
for (const [index, entry] of entries.entries()) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    failures.push(`packages.${index}: topology entry must be an object`);
    continue;
  }
  const packageId = contractIds[index];
  const packagePath = contractPaths[index];
  const packageRoot = path.resolve(repoRoot, packagePath);
  const manifestPath = path.join(packageRoot, 'package.json');
  const manifest = readJson(manifestPath, `${packagePath}/package.json`);
  const packageFailures = [];
  const failPackage = (message) => {
    packageFailures.push(message);
    failures.push(`${packagePath}: ${message}`);
  };
  if (manifest.name !== packageId) failPackage(`manifest name must be ${packageId}`);
  if (typeof manifest.version !== 'string' || semver.valid(manifest.version) === null) {
    failPackage('manifest version must be an exact semantic version');
  }
  if (entry.version_policy !== 'independent') {
    failPackage('cutover Package must declare version_policy=independent');
  }
  const exportEntries = normalizeExports(manifest.exports);
  if (exportEntries.length === 0) {
    failPackage('manifest exports must expose at least one entrypoint');
  }
  for (const exportEntry of exportEntries) {
    if (!exportEntry.defaultTarget) failPackage(`${exportEntry.key}: export must declare a default build target`);
    if (!exportEntry.typesTarget) failPackage(`${exportEntry.key}: export must declare a types target`);
  }
  for (const scriptName of ['build', 'typecheck']) {
    if (typeof manifest.scripts?.[scriptName] !== 'string' || manifest.scripts[scriptName].trim() === '') {
      failPackage(`manifest must declare a non-empty ${scriptName} script`);
    }
  }
  if (!Array.isArray(manifest.files) || !manifest.files.includes('dist')) {
    failPackage('manifest files must include dist');
  }

  const sourceFiles = listFiles(path.join(packageRoot, 'src'), (file) => /\.[cm]?ts$/.test(file));
  const imports = sourceFiles.flatMap((file) => inspectImports(file, packageRoot, packageId, manifest));
  for (const violation of imports.filter((entry) => entry.failure !== null)) failPackage(violation.failure);

  const packageKind = requiredString(entry.package_kind, `packages.${index}.package_kind`);
  const entryCapabilityDomains = requiredStringArray(entry.capability_domain_ids, `packages.${index}.capability_domain_ids`);
  const entrySourceUnits = requiredStringArray(entry.source_unit_refs, `packages.${index}.source_unit_refs`);
  const entryPluginIds = requiredStringArray(entry.plugin_ids, `packages.${index}.plugin_ids`);
  for (const domainId of entryCapabilityDomains) {
    if (!capabilityDomainIds.has(domainId)) failPackage(`unknown capability_domain_id ${domainId}`);
  }
  for (const sourceUnitId of entrySourceUnits) {
    if (!sourceUnitIds.has(sourceUnitId)) failPackage(`unknown source_unit_ref ${sourceUnitId}`);
  }
  const descriptorSources = Array.isArray(entry.plugin_descriptor_sources)
    ? entry.plugin_descriptor_sources.map((value, sourceIndex) =>
      requiredString(value, `packages.${index}.plugin_descriptor_sources.${sourceIndex}`))
    : [];
  if (!Array.isArray(entry.plugin_descriptor_sources)) {
    failPackage('plugin_descriptor_sources must be an array');
  }
  if (packageKind === 'cordis_contribution' && descriptorSources.length === 0) {
    failPackage('Cordis contribution Package must declare a plugin descriptor source');
  }
  if (packageKind === 'cordis_contribution' && entryPluginIds.length === 0) {
    failPackage('Cordis contribution Package must declare plugin_ids');
  }
  if (packageKind === 'shared_abi' && descriptorSources.length !== 0) {
    failPackage('shared ABI Package cannot declare runtime plugin descriptor sources');
  }
  let descriptorCount = 0;
  for (const descriptorSource of descriptorSources) {
    const sourcePath = path.resolve(packageRoot, descriptorSource);
    if (!isInside(packageRoot, sourcePath) || !fs.existsSync(sourcePath)) {
      failPackage(`${descriptorSource}: plugin descriptor source is missing or escapes the Package`);
      continue;
    }
    const descriptors = descriptorSource.endsWith('.json')
      ? [readJson(sourcePath, `${packagePath}/${descriptorSource}`)]
      : readTypeScriptDescriptorRefs(sourcePath);
    if (descriptors.length === 0) {
      failPackage(`${descriptorSource}: no buildCordisPluginDescriptor declaration found`);
      continue;
    }
    descriptorCount += descriptors.length;
    for (const [descriptorIndex, descriptor] of descriptors.entries()) {
      const location = `${descriptorSource}#descriptor-${descriptorIndex + 1}`;
      const packageRef = descriptor.package_ref;
      if (!packageRef || typeof packageRef !== 'object' || Array.isArray(packageRef)) {
        failPackage(`${location}: runtime plugin descriptor must declare package_ref`);
        continue;
      }
      if (packageRef.package_id !== packageId) {
        failPackage(`${location}: package_ref.package_id must be ${packageId}`);
      }
      if (packageRef.package_version !== manifest.version) {
        failPackage(`${location}: package_ref.package_version must match manifest version ${manifest.version}`);
      }
      const expectedRef = `npm:${packageId}@${manifest.version}`;
      if (packageRef.package_ref !== expectedRef) {
        failPackage(`${location}: package_ref.package_ref must be ${expectedRef}`);
      }
    }
  }
  const result = {
    package_id: packageId,
    path: packagePath,
    version: typeof manifest.version === 'string' ? manifest.version : null,
    package_kind: packageKind,
    export_count: exportEntries.length,
    source_file_count: sourceFiles.length,
    descriptor_count: descriptorCount,
    capability_domain_ids: entryCapabilityDomains,
    source_unit_refs: entrySourceUnits,
    plugin_ids: entryPluginIds,
    failures: packageFailures,
  };
  packageResults.push(result);
  packageById.set(packageId, { entry, manifest, result });
}

for (const { manifest, result } of packageById.values()) {
  for (const dependencyGroup of ['dependencies', 'peerDependencies', 'optionalDependencies']) {
    const dependencies = manifest[dependencyGroup];
    if (!dependencies || typeof dependencies !== 'object' || Array.isArray(dependencies)) continue;
    for (const [dependencyId, declaredVersion] of Object.entries(dependencies)) {
      const sibling = packageById.get(dependencyId);
      if (!sibling) continue;
      if (declaredVersion !== sibling.manifest.version) {
        const message = `${dependencyGroup}.${dependencyId} must bind the independently versioned sibling exactly at ${sibling.manifest.version}`;
        result.failures.push(message);
        failures.push(`${result.path}: ${message}`);
      }
    }
  }
}

const summary = {
  status: failures.length === 0 ? 'ok' : 'failed',
  contract: relativeToRoot(contractPath),
  root_package: topology.root_package ?? null,
  workspace_patterns: workspacePatterns,
  workspace_package_count: workspacePaths.length,
  topology_package_count: entries.length,
  packages: packageResults,
  failures,
};
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
if (failures.length > 0) {
  process.stderr.write(`source package boundary check failed (${failures.length} issue${failures.length === 1 ? '' : 's'}):\n`);
  process.stderr.write(`${failures.map((failure) => `- ${failure}`).join('\n')}\n`);
  process.exit(1);
}

function readOptions(argv) {
  try {
    const { values } = parseArgs({
      args: argv,
      options: {
        root: { type: 'string' },
        contract: { type: 'string' },
        format: { type: 'string', default: 'json' },
        help: { type: 'boolean', default: false },
      },
      strict: true,
      allowPositionals: false,
    });
    if (values.format !== 'json') throw new Error('--format must be json');
    return values;
  } catch (error) {
    process.stderr.write(`source package boundary: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}

function readJson(file, label) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    failures.push(`${relativeToRoot(file)}: cannot read ${label}: ${error instanceof Error ? error.message : String(error)}`);
    return {};
  }
}

function requiredString(value, label) {
  if (typeof value === 'string' && value.trim() !== '') return value;
  failures.push(`${label}: must be a non-empty string`);
  return `<invalid:${label}>`;
}

function requiredStringArray(value, label) {
  if (!Array.isArray(value)) {
    failures.push(`${label}: must be an array`);
    return [];
  }
  return value.flatMap((entry, index) => {
    if (typeof entry === 'string' && entry.trim()) return [entry.trim()];
    failures.push(`${label}.${index}: must be a non-empty string`);
    return [];
  });
}

function recordDuplicates(values, label) {
  const seen = new Set();
  for (const value of values) {
    if (seen.has(value)) failures.push(`${value}: duplicate ${label} in package topology`);
    seen.add(value);
  }
}

function expandWorkspacePackagePaths(patterns) {
  const expanded = [];
  for (const pattern of patterns) {
    const matches = fs.globSync(pattern, { cwd: repoRoot, withFileTypes: true });
    for (const match of matches) {
      const relativePath = typeof match.parentPath === 'string'
        ? path.relative(repoRoot, path.join(match.parentPath, match.name))
        : match.name;
      const normalized = relativePath.split(path.sep).join('/');
      if (fs.existsSync(path.join(repoRoot, normalized, 'package.json'))) expanded.push(normalized);
    }
  }
  return [...new Set(expanded)].sort();
}

function normalizeExports(exportsValue) {
  if (typeof exportsValue === 'string') {
    return [{ key: '.', defaultTarget: exportsValue, typesTarget: null }];
  }
  if (!exportsValue || typeof exportsValue !== 'object' || Array.isArray(exportsValue)) return [];
  const entries = Object.keys(exportsValue).some((key) => key.startsWith('.'))
    ? Object.entries(exportsValue)
    : [['.', exportsValue]];
  return entries.map(([key, value]) => {
    if (typeof value === 'string') return { key, defaultTarget: value, typesTarget: null };
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return { key, defaultTarget: null, typesTarget: null };
    }
    return {
      key,
      defaultTarget: typeof value.default === 'string' ? value.default : null,
      typesTarget: typeof value.types === 'string' ? value.types : null,
    };
  });
}

function inspectImports(file, packageRoot, packageId, manifest) {
  const source = parseSourceFile(file);
  const findings = [];
  const visit = (node) => {
    let specifier = null;
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      specifier = node.moduleSpecifier.text;
    } else if (ts.isCallExpression(node)
      && node.expression.kind === ts.SyntaxKind.ImportKeyword
      && node.arguments.length === 1
      && ts.isStringLiteral(node.arguments[0])) {
      specifier = node.arguments[0].text;
    }
    if (specifier !== null) findings.push(inspectSpecifier(file, specifier, packageRoot, packageId, manifest));
    node.forEachChild(visit);
  };
  visit(source);
  return findings;
}

function inspectSpecifier(file, specifier, packageRoot, packageId, manifest) {
  const location = `${path.relative(repoRoot, file).split(path.sep).join('/')}: import ${specifier}`;
  if (specifier.startsWith('.')) {
    const resolved = path.resolve(path.dirname(file), specifier);
    return {
      failure: isInside(packageRoot, resolved)
        ? null
        : `${location} escapes the Package and may not import root authority`,
    };
  }
  if (specifier === topology.root_package || specifier.startsWith(`${topology.root_package}/`)) {
    return { failure: `${location} may not import the root authority Package` };
  }
  if (specifier.startsWith('/') || specifier.startsWith('src/') || specifier.startsWith('contracts/opl-framework/')) {
    return { failure: `${location} may not address repository authority by physical path` };
  }
  const dependencyId = specifier.startsWith('@')
    ? specifier.split('/').slice(0, 2).join('/')
    : specifier.split('/')[0];
  const declaredDependencies = {
    ...manifest.dependencies,
    ...manifest.peerDependencies,
    ...manifest.optionalDependencies,
  };
  if (dependencyId.startsWith('@one-person-lab/') && dependencyId !== packageId && !(dependencyId in declaredDependencies)) {
    return { failure: `${location} uses an undeclared OPL Package dependency` };
  }
  return { failure: null };
}

function readTypeScriptDescriptorRefs(file) {
  const source = parseSourceFile(file);
  const descriptors = [];
  const visit = (node) => {
    if (ts.isCallExpression(node)
      && ts.isIdentifier(node.expression)
      && node.expression.text === 'buildCordisPluginDescriptor'
      && node.arguments.length > 0
      && ts.isObjectLiteralExpression(node.arguments[0])) {
      const packageRefNode = objectProperty(node.arguments[0], 'package_ref');
      descriptors.push({ package_ref: readLiteralObject(packageRefNode) });
    }
    node.forEachChild(visit);
  };
  visit(source);
  return descriptors;
}

// TypeScript 7 exports the parser through its sync API. Only the synthetic
// config is virtual; undefined delegates source reads to the host filesystem.
function parseSourceFile(file) {
  const absolutePath = path.resolve(file);
  const configPath = path.join(path.dirname(absolutePath), '.opl-source-package-boundary.tsconfig.json');
  const config = JSON.stringify({
    compilerOptions: {
      allowJs: true,
      noEmit: true,
      noResolve: true,
      noLib: true,
      types: [],
    },
    files: [absolutePath],
  });
  const api = new API({
    cwd: path.dirname(absolutePath),
    fs: {
      fileExists: (candidate) => path.resolve(candidate) === configPath ? true : undefined,
      readFile: (candidate) => path.resolve(candidate) === configPath ? config : undefined,
    },
  });
  try {
    const snapshot = api.updateSnapshot({ openProjects: [configPath] });
    try {
      const project = snapshot.getProject(configPath);
      const source = project?.program.getSourceFile(absolutePath);
      if (!source) throw new Error(`Unable to parse TypeScript source file: ${file}`);
      return source;
    } finally {
      snapshot.dispose();
    }
  } finally {
    api.close();
  }
}

function objectProperty(object, name) {
  const property = object.properties.find((entry) => {
    if (!ts.isPropertyAssignment(entry)) return false;
    return (ts.isIdentifier(entry.name) || ts.isStringLiteral(entry.name)) && entry.name.text === name;
  });
  return property && ts.isPropertyAssignment(property) ? property.initializer : null;
}

function readLiteralObject(node) {
  if (!node || !ts.isObjectLiteralExpression(node)) return null;
  const result = {};
  for (const property of node.properties) {
    if (!ts.isPropertyAssignment(property)) continue;
    if (!ts.isIdentifier(property.name) && !ts.isStringLiteral(property.name)) continue;
    if (ts.isStringLiteral(property.initializer) || ts.isNoSubstitutionTemplateLiteral(property.initializer)) {
      result[property.name.text] = property.initializer.text;
    }
  }
  return result;
}

function listFiles(root, include) {
  if (!fs.existsSync(root)) return [];
  const files = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...listFiles(target, include));
    else if (entry.isFile() && include(target)) files.push(target);
  }
  return files.sort();
}

function isInside(parent, target) {
  const relative = path.relative(parent, target);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function relativeToRoot(file) {
  const relative = path.relative(repoRoot, file);
  return relative.startsWith('..') ? file : relative.split(path.sep).join('/');
}
