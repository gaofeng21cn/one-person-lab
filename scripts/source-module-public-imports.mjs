#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs as parseNodeArgs } from 'node:util';
import ts from 'typescript';
import { readJsonFile } from './script-json-boundary.mjs';

const defaultRepoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = parseCliOptions(process.argv.slice(2));
const repoRoot = args.root ? path.resolve(args.root) : defaultRepoRoot;
const contractPath = path.join(repoRoot, 'contracts', 'opl-framework', 'source-module-map.json');
const contract = readJson(contractPath);
const physicalModuleRoot = contract.physical_module_root ?? 'src/modules';
const modules = readModules(contract);
const moduleIdSet = new Set(modules);
for (const moduleId of args.sourceModules) {
  if (!moduleIdSet.has(moduleId)) {
    fail(`source module public imports: unknown source module ${moduleId}`);
  }
}
const selectedSourceModules = args.sourceModules.length > 0 ? new Set(args.sourceModules) : null;
const analysis = analyzeDeepImports();

if (args.apply && !args.importsOnly) {
  applyPublicExports(analysis);
}
const summary = {
  status: 'ok',
  mode: args.apply ? 'apply' : 'inspect',
  source_modules: selectedSourceModules ? [...selectedSourceModules].sort() : 'all',
  exports_only: args.exportsOnly,
  imports_only: args.importsOnly,
  deep_imports_seen: analysis.deepImports.length,
  target_export_files: [...analysis.exportsByTargetFile.keys()].length,
  export_symbol_count: [...analysis.exportsByTargetFile.values()]
    .reduce((sum, entry) => sum + entry.symbols.size, 0),
  import_rewrite_count: analysis.importRewrites.length,
  changed_files: args.apply ? [...analysis.changedFiles].sort() : [],
};

process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);

function parseCliOptions(argv) {
  const { values } = parseNodeArgs({
    args: argv,
    options: {
      root: { type: 'string' },
      apply: { type: 'boolean', default: false },
      'exports-only': { type: 'boolean', default: false },
      'imports-only': { type: 'boolean', default: false },
      'source-module': { type: 'string', multiple: true, default: [] },
      'source-modules': { type: 'string', multiple: true, default: [] },
    },
    strict: true,
    allowPositionals: false,
  });
  const parsed = {
    root: values.root ?? null,
    apply: values.apply === true,
    exportsOnly: values['exports-only'] === true,
    importsOnly: values['imports-only'] === true,
    sourceModules: [
      ...values['source-module'],
      ...values['source-modules'].flatMap((entry) => entry.split(',')),
    ],
  };
  if (parsed.exportsOnly && parsed.importsOnly) {
    fail('source module public imports: --exports-only and --imports-only cannot be used together');
  }
  parsed.sourceModules = [...new Set(parsed.sourceModules.map((entry) => entry.trim()).filter(Boolean))];
  return parsed;
}

function readJson(file) {
  try {
    return readJsonFile(file);
  } catch (error) {
    fail(`source module public imports: failed to read ${file}: ${error.message}`);
  }
}

function readModules(contractValue) {
  if (!Array.isArray(contractValue.modules)) {
    fail('source module public imports: source-module-map modules must be an array');
  }
  return contractValue.modules.map((entry) => entry.module_id).filter(Boolean).sort();
}

function analyzeDeepImports() {
  const deepImports = [];
  const importRewrites = [];
  const exportsByTargetFile = new Map();
  const changedFiles = new Set();

  for (const relativeFile of listModuleSourceFiles()) {
    const fromModuleId = moduleIdFromPath(relativeFile);
    if (!fromModuleId || (selectedSourceModules && !selectedSourceModules.has(fromModuleId))) {
      continue;
    }
    const absoluteFile = path.join(repoRoot, ...relativeFile.split('/'));
    const text = fs.readFileSync(absoluteFile, 'utf8');
    const sourceFile = ts.createSourceFile(relativeFile, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const replacements = [];

    for (const node of sourceFile.statements) {
      if (!isImportLikeWithModuleSpecifier(node)) {
        continue;
      }
      const specifier = node.moduleSpecifier.text;
      if (!specifier.startsWith('.')) {
        continue;
      }
      const resolvedPath = resolveRelativeImport(relativeFile, specifier);
      const toModuleId = moduleIdFromPath(`${resolvedPath}.ts`) ?? moduleIdFromPath(`${resolvedPath}/`);
      if (!toModuleId || toModuleId === fromModuleId || isPublicModuleEntrypoint(resolvedPath, toModuleId)) {
        continue;
      }
      const targetIndex = `${physicalModuleRoot}/${toModuleId}/index.ts`;
      const newSpecifier = toRelativeTsSpecifier(path.dirname(relativeFile), targetIndex);
      deepImports.push({
        fromModuleId,
        toModuleId,
        importingFile: relativeFile,
        importedSpecifier: specifier,
        resolvedPath,
        targetIndex,
      });
      const exportNames = readImportedOrReexportedNames(node);
      if (exportNames.length > 0) {
        const key = `${toModuleId}:${resolvedPath}`;
        const exportedSymbolKinds = readExportedSymbolKinds(`${resolvedPath}.ts`);
        const current = exportsByTargetFile.get(key) ?? {
          toModuleId,
          resolvedPath,
          symbols: new Map(),
        };
        for (const exportName of exportNames) {
          current.symbols.set(exportName.name, exportedSymbolKinds.get(exportName.name) ?? exportName.kind);
        }
        exportsByTargetFile.set(key, current);
      }
      const literalStart = node.moduleSpecifier.getStart(sourceFile) + 1;
      const literalEnd = node.moduleSpecifier.getEnd() - 1;
      replacements.push({ start: literalStart, end: literalEnd, value: newSpecifier });
      importRewrites.push({
        file: relativeFile,
        oldSpecifier: specifier,
        newSpecifier,
      });
    }

    if (args.apply && replacements.length > 0 && !args.exportsOnly) {
      writeWithReplacements(absoluteFile, text, replacements);
      changedFiles.add(relativeFile);
    }
  }

  return {
    deepImports,
    importRewrites,
    exportsByTargetFile,
    changedFiles,
  };
}

function isImportLikeWithModuleSpecifier(node) {
  return (ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
    && node.moduleSpecifier
    && ts.isStringLiteral(node.moduleSpecifier);
}

function readImportedOrReexportedNames(node) {
  if (ts.isImportDeclaration(node)) {
    const namedBindings = node.importClause?.namedBindings;
    if (!namedBindings || !ts.isNamedImports(namedBindings)) {
      return [];
    }
    const importIsTypeOnly = node.importClause?.isTypeOnly ?? false;
    return namedBindings.elements.map((element) => ({
      name: (element.propertyName ?? element.name).text,
      kind: importIsTypeOnly || element.isTypeOnly ? 'type' : 'value',
    }));
  }
  if (ts.isExportDeclaration(node) && node.exportClause && ts.isNamedExports(node.exportClause)) {
    const exportIsTypeOnly = node.isTypeOnly ?? false;
    return node.exportClause.elements.map((element) => ({
      name: (element.propertyName ?? element.name).text,
      kind: exportIsTypeOnly || element.isTypeOnly ? 'type' : 'value',
    }));
  }
  return [];
}

function applyPublicExports(analysisValue) {
  const additionsByModule = new Map();
  for (const exportEntry of analysisValue.exportsByTargetFile.values()) {
    const current = additionsByModule.get(exportEntry.toModuleId) ?? [];
    current.push(exportEntry);
    additionsByModule.set(exportEntry.toModuleId, current);
  }

  for (const [moduleId, additions] of additionsByModule) {
    const relativeIndex = `${physicalModuleRoot}/${moduleId}/index.ts`;
    const absoluteIndex = path.join(repoRoot, ...relativeIndex.split('/'));
    const originalText = fs.readFileSync(absoluteIndex, 'utf8');
    const text = stripGeneratedPublicSurface(originalText);
    const existingExports = readExistingNamedExports(relativeIndex, text);
    const lines = [];

    for (const addition of additions.sort(compareExportEntries)) {
      const fromSpecifier = toRelativeTsSpecifier(path.dirname(relativeIndex), `${addition.resolvedPath}.ts`);
      const symbols = [...addition.symbols.entries()]
        .filter(([symbol]) => !existingExports.has(symbol))
        .sort(([left], [right]) => left.localeCompare(right));
      const valueNames = symbols
        .filter(([, kind]) => kind === 'value')
        .map(([name]) => name);
      const typeNames = symbols
        .filter(([, kind]) => kind === 'type')
        .map(([name]) => name);
      if (valueNames.length > 0) {
        lines.push(`export { ${valueNames.join(', ')} } from '${fromSpecifier}';`);
      }
      if (typeNames.length > 0) {
        lines.push(`export type { ${typeNames.join(', ')} } from '${fromSpecifier}';`);
      }
      for (const [name] of symbols) {
        existingExports.add(name);
      }
    }

    if (lines.length === 0) {
      continue;
    }
    const prefix = text.endsWith('\n') ? text : `${text}\n`;
    const section = [
      '',
      '// Public cross-module surface generated from existing module consumers.',
      ...lines,
      '',
    ].join('\n');
    fs.writeFileSync(absoluteIndex, `${prefix}${section}`);
    analysisValue.changedFiles.add(relativeIndex);
  }
}

function stripGeneratedPublicSurface(text) {
  const marker = '\n// Public cross-module surface generated from existing module consumers.';
  const index = text.indexOf(marker);
  if (index === -1) {
    return text;
  }
  return text.slice(0, index).replace(/\s+$/, '\n');
}

function readExportedSymbolKinds(relativeFile) {
  const absoluteFile = path.join(repoRoot, ...relativeFile.split('/'));
  if (!fs.existsSync(absoluteFile)) {
    return new Map();
  }
  const sourceFile = ts.createSourceFile(
    relativeFile,
    fs.readFileSync(absoluteFile, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const kinds = new Map();
  for (const node of sourceFile.statements) {
    if (ts.isInterfaceDeclaration(node) && hasExportModifier(node) && node.name) {
      kinds.set(node.name.text, 'type');
    } else if (ts.isTypeAliasDeclaration(node) && hasExportModifier(node) && node.name) {
      kinds.set(node.name.text, 'type');
    } else if ((ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node) || ts.isEnumDeclaration(node))
      && hasExportModifier(node)
      && node.name) {
      kinds.set(node.name.text, 'value');
    } else if (ts.isVariableStatement(node) && hasExportModifier(node)) {
      for (const declaration of node.declarationList.declarations) {
        collectBindingNames(declaration.name, kinds, 'value');
      }
    } else if (ts.isExportDeclaration(node) && node.exportClause && ts.isNamedExports(node.exportClause)) {
      const kind = node.isTypeOnly ? 'type' : 'value';
      for (const element of node.exportClause.elements) {
        kinds.set(element.name.text, element.isTypeOnly ? 'type' : kind);
      }
    }
  }
  return kinds;
}

function readExistingNamedExports(relativeFile, text) {
  const sourceFile = ts.createSourceFile(relativeFile, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const names = new Set();
  for (const node of sourceFile.statements) {
    if (ts.isVariableStatement(node) && hasExportModifier(node)) {
      for (const declaration of node.declarationList.declarations) {
        collectBindingNames(declaration.name, names);
      }
    } else if ((ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node) || ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node) || ts.isEnumDeclaration(node))
      && hasExportModifier(node)
      && node.name) {
      names.add(node.name.text);
    } else if (ts.isExportDeclaration(node) && node.exportClause && ts.isNamedExports(node.exportClause)) {
      for (const element of node.exportClause.elements) {
        names.add(element.name.text);
      }
    }
  }
  return names;
}

function hasExportModifier(node) {
  return Boolean(node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword));
}

function collectBindingNames(name, names, kind = 'value') {
  if (ts.isIdentifier(name)) {
    if (names instanceof Map) {
      names.set(name.text, kind);
    } else {
      names.add(name.text);
    }
    return;
  }
  if (ts.isObjectBindingPattern(name) || ts.isArrayBindingPattern(name)) {
    for (const element of name.elements) {
      if (ts.isBindingElement(element)) {
        collectBindingNames(element.name, names, kind);
      }
    }
  }
}

function writeWithReplacements(file, text, replacements) {
  const ordered = replacements.sort((left, right) => right.start - left.start);
  let next = text;
  for (const replacement of ordered) {
    next = `${next.slice(0, replacement.start)}${replacement.value}${next.slice(replacement.end)}`;
  }
  fs.writeFileSync(file, next);
}

function listModuleSourceFiles() {
  const files = [];
  for (const moduleId of moduleIdSet) {
    collectTsFiles(
      path.join(repoRoot, ...physicalModuleRoot.split('/'), moduleId),
      `${physicalModuleRoot}/${moduleId}`,
      files,
    );
  }
  return files.sort();
}

function collectTsFiles(absoluteDir, relativeDir, files) {
  if (!fs.existsSync(absoluteDir)) {
    return;
  }
  for (const entry of fs.readdirSync(absoluteDir, { withFileTypes: true })) {
    const absolutePath = path.join(absoluteDir, entry.name);
    const relativePath = `${relativeDir}/${entry.name}`;
    if (entry.isDirectory()) {
      collectTsFiles(absolutePath, relativePath, files);
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      files.push(relativePath);
    }
  }
}

function resolveRelativeImport(importingFile, specifier) {
  return normalizeRelativePath(path.normalize(path.join(path.dirname(importingFile), specifier)))
    .replace(/\.(ts|tsx|js|jsx|mjs|cjs)$/, '');
}

function moduleIdFromPath(relativePath) {
  const prefix = `${physicalModuleRoot}/`;
  if (!relativePath.startsWith(prefix)) {
    return null;
  }
  const moduleId = relativePath.slice(prefix.length).split('/')[0];
  return moduleIdSet.has(moduleId) ? moduleId : null;
}

function isPublicModuleEntrypoint(relativePath, moduleId) {
  const rest = relativePath.slice(`${physicalModuleRoot}/${moduleId}`.length).replace(/^\//, '');
  return rest === '' || rest === 'index' || rest === 'index.ts' || rest.startsWith('public/');
}

function toRelativeTsSpecifier(fromDir, targetFile) {
  let specifier = normalizeRelativePath(path.relative(fromDir, targetFile));
  if (!specifier.startsWith('.')) {
    specifier = `./${specifier}`;
  }
  return specifier;
}

function compareExportEntries(left, right) {
  return left.resolvedPath.localeCompare(right.resolvedPath);
}

function normalizeRelativePath(value) {
  return value.replaceAll('\\', '/');
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}
