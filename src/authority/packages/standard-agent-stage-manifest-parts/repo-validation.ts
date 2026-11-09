import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import * as ts from 'typescript/unstable/ast';
import { API } from 'typescript/unstable/sync';

import { FrameworkContractError, isRecord } from '../../../kernel/contract-validation.ts';
import {
  assertFamilyActionHandlerRefsResolve,
  type DomainHandlerRegistry,
} from '../../../kernel/family-action-catalog-contract.ts';
import { optionalString, parseJsonText } from '../../../kernel/json-file.ts';
import type { JsonRecord } from './types.ts';

export function fail(message: string, details: JsonRecord = {}): never {
  throw new FrameworkContractError('contract_shape_invalid', message, details);
}

export function record(value: unknown, field: string, repoDir: string) {
  if (!isRecord(value)) {
    fail(`${field} must be a JSON object.`, { repo_dir: repoDir, field });
  }
  return value;
}

export function text(value: unknown, field: string, repoDir: string) {
  const resolved = optionalString(value);
  if (!resolved) {
    fail(`${field} must be a non-empty string.`, { repo_dir: repoDir, field });
  }
  return resolved;
}

export function stageDisplayNames(value: unknown, title: string, field: string, repoDir: string) {
  if (value === undefined) {
    return { 'en-US': title };
  }
  if (!isRecord(value)) {
    fail(`${field} must be a JSON object.`, { repo_dir: repoDir, field });
  }

  const entries = Object.entries(value);
  if (entries.length === 0) {
    fail(`${field} must contain at least the en-US entry.`, { repo_dir: repoDir, field });
  }
  for (const [locale, displayName] of entries) {
    if (locale.length === 0 || /\s/.test(locale)) {
      fail(`${field} locale keys must be non-empty and contain no whitespace.`, {
        repo_dir: repoDir,
        field,
        locale,
      });
    }
    if (typeof displayName !== 'string' || displayName.trim().length === 0) {
      fail(`${field}.${locale} must be a non-empty string.`, {
        repo_dir: repoDir,
        field: `${field}.${locale}`,
      });
    }
  }

  const displayNames = Object.fromEntries(entries) as Record<string, string>;
  if (!Object.hasOwn(displayNames, 'en-US')) {
    fail(`${field} must contain the en-US entry.`, { repo_dir: repoDir, field });
  }
  if (displayNames['en-US'] !== title) {
    fail(`${field}.en-US must exactly match stage.title.`, {
      repo_dir: repoDir,
      field: `${field}.en-US`,
      title,
      display_name: displayNames['en-US'],
    });
  }
  return displayNames;
}

export function strings(value: unknown, field: string, repoDir: string) {
  if (!Array.isArray(value)) {
    fail(`${field} must be an array of non-empty strings.`, { repo_dir: repoDir, field });
  }
  return value.map((entry, index) => text(entry, `${field}[${index}]`, repoDir));
}

export function optionalStrings(value: unknown, field: string, repoDir: string) {
  return value === undefined ? [] : strings(value, field, repoDir);
}

export function repoFile(repoDir: string, value: unknown, field: string) {
  const ref = text(value, field, repoDir);
  if (
    path.posix.isAbsolute(ref)
    || ref.includes('\\')
    || path.posix.normalize(ref) !== ref
    || ref === '..'
    || ref.startsWith('../')
  ) {
    fail(`${field} must be a canonical repo-relative path.`, { repo_dir: repoDir, field, ref });
  }
  const resolved = path.resolve(repoDir, ref);
  const repoRealPath = fs.realpathSync(repoDir);
  if (
    !resolved.startsWith(`${path.resolve(repoDir)}${path.sep}`)
    || !fs.existsSync(resolved)
    || !fs.statSync(resolved).isFile()
    || !fs.realpathSync(resolved).startsWith(`${repoRealPath}${path.sep}`)
  ) {
    fail(`${field} does not resolve inside the standard Agent root.`, { repo_dir: repoDir, field, ref });
  }
  return { ref, resolved };
}

export function repoRef(repoDir: string, value: unknown, field: string) {
  const ref = text(value, field, repoDir);
  const fileRef = ref.split('#', 1)[0]!;
  repoFile(repoDir, fileRef, field);
  return ref;
}

function declarationModifiers(node: ts.Node) {
  return 'modifiers' in node ? (node as ts.Node & ts.ModifiersBase).modifiers ?? [] : [];
}

function hasModifier(node: ts.Node, kind: ts.SyntaxKind) {
  return declarationModifiers(node).some((modifier) => modifier.kind === kind);
}

function typescriptCallableExports(filePath: string) {
  const absolutePath = path.resolve(filePath);
  const configPath = path.join(path.dirname(absolutePath), '.opl-handler-validation.tsconfig.json');
  const config = JSON.stringify({
    compilerOptions: { allowJs: true, noEmit: true, noResolve: true, noLib: true, types: [] },
    files: [absolutePath],
  });
  const api = new API({
    cwd: path.dirname(absolutePath),
    fs: {
      fileExists: (file) => path.resolve(file) === configPath ? true : undefined,
      readFile: (file) => path.resolve(file) === configPath ? config : undefined,
    },
  });
  try {
    const snapshot = api.updateSnapshot({ openProjects: [configPath] });
    try {
      const project = snapshot.getProject(configPath);
      const sourceFile = project?.program.getSourceFile(absolutePath);
      if (!project || !sourceFile) {
        throw new Error(`Unable to read TypeScript handler file: ${filePath}`);
      }
      if (project.program.getSyntacticDiagnostics(absolutePath).length > 0) {
        throw new Error(`TypeScript handler file has parse errors: ${filePath}`);
      }
      return callableExportsFromSourceFile(sourceFile);
    } finally {
      snapshot.dispose();
    }
  } finally {
    api.close();
  }
}

function callableExportsFromSourceFile(sourceFile: ts.SourceFile) {
  const localCallables = new Set<string>();
  for (const statement of sourceFile.statements) {
    if (
      ts.isFunctionDeclaration(statement)
      && statement.name
      && statement.body
      && !hasModifier(statement, ts.SyntaxKind.DeclareKeyword)
    ) {
      localCallables.add(statement.name.text);
    }
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (
          ts.isIdentifier(declaration.name)
          && declaration.initializer
          && (ts.isArrowFunction(declaration.initializer) || ts.isFunctionExpression(declaration.initializer))
        ) {
          localCallables.add(declaration.name.text);
        }
      }
    }
  }

  const exported = new Set<string>();
  for (const statement of sourceFile.statements) {
    if (ts.isFunctionDeclaration(statement)) {
      if (!statement.body || hasModifier(statement, ts.SyntaxKind.DeclareKeyword)) {
        continue;
      }
      if (hasModifier(statement, ts.SyntaxKind.DefaultKeyword)) {
        exported.add('default');
      } else if (statement.name && hasModifier(statement, ts.SyntaxKind.ExportKeyword)) {
        exported.add(statement.name.text);
      }
      continue;
    }
    if (ts.isVariableStatement(statement) && hasModifier(statement, ts.SyntaxKind.ExportKeyword)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name) && localCallables.has(declaration.name.text)) {
          exported.add(declaration.name.text);
        }
      }
      continue;
    }
    if (ts.isExportDeclaration(statement) && statement.exportClause && ts.isNamedExports(statement.exportClause)) {
      if (statement.moduleSpecifier) {
        continue;
      }
      for (const element of statement.exportClause.elements) {
        const localName = element.propertyName?.text ?? element.name.text;
        if (localCallables.has(localName)) {
          exported.add(element.name.text);
        }
      }
      continue;
    }
    if (ts.isExportAssignment(statement) && !statement.isExportEquals) {
      if (
        ts.isArrowFunction(statement.expression)
        || ts.isFunctionExpression(statement.expression)
        || (ts.isIdentifier(statement.expression) && localCallables.has(statement.expression.text))
      ) {
        exported.add('default');
      }
    }
  }
  return exported;
}

const PYTHON_CALLABLE_PROBE = String.raw`
import ast
import json
import sys

with open(sys.argv[1], "r", encoding="utf-8") as handle:
    tree = ast.parse(handle.read(), filename=sys.argv[1])

parts = sys.argv[2].split(".")
body = tree.body
resolved = None
for index, part in enumerate(parts):
    resolved = None
    for node in body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)) and node.name == part:
            resolved = node
            break
        if isinstance(node, (ast.Assign, ast.AnnAssign)):
            targets = node.targets if isinstance(node, ast.Assign) else [node.target]
            value = node.value
            if any(isinstance(target, ast.Name) and target.id == part for target in targets) and isinstance(value, ast.Lambda):
                resolved = value
                break
    if resolved is None:
        break
    if index < len(parts) - 1:
        if not isinstance(resolved, ast.ClassDef):
            resolved = None
            break
        body = resolved.body

is_callable = isinstance(resolved, (ast.FunctionDef, ast.AsyncFunctionDef, ast.Lambda))
print(json.dumps({"callable": is_callable}))
`;

function pythonModuleFile(repoDir: string, moduleName: string, field: string) {
  const modulePath = moduleName.split('.').join('/');
  const candidates = [
    `${modulePath}.py`,
    `${modulePath}/__init__.py`,
    `src/${modulePath}.py`,
    `src/${modulePath}/__init__.py`,
  ].filter((candidate) => fs.existsSync(path.resolve(repoDir, candidate)));
  if (candidates.length === 0) {
    fail(`${field}.module does not resolve to a repo-contained Python module.`, {
      repo_dir: repoDir,
      field,
      module: moduleName,
    });
  }
  if (candidates.length > 1) {
    fail(`${field}.module resolves ambiguously inside the standard Agent root.`, {
      repo_dir: repoDir,
      field,
      module: moduleName,
      candidates,
    });
  }
  return repoFile(repoDir, candidates[0], `${field}.module`);
}

function assertPythonCallable(filePath: string, callableName: string, field: string, repoDir: string) {
  const executables = [process.env.PYTHON, 'python3', 'python']
    .filter((entry, index, values): entry is string => Boolean(entry) && values.indexOf(entry) === index);
  for (const executable of executables) {
    const result = spawnSync(executable, ['-I', '-B', '-c', PYTHON_CALLABLE_PROBE, filePath, callableName], {
      encoding: 'utf8',
      maxBuffer: 1024 * 1024,
    });
    if (result.error && 'code' in result.error && result.error.code === 'ENOENT') {
      continue;
    }
    if (result.status !== 0) {
      fail(`${field} could not be parsed as a Python callable.`, {
        repo_dir: repoDir,
        field,
        stderr: result.stderr.trim(),
      });
    }
    let probe: unknown;
    try {
      probe = JSON.parse(result.stdout);
    } catch {
      fail(`${field} Python callable probe returned invalid output.`, { repo_dir: repoDir, field });
    }
    if (!isRecord(probe) || probe.callable !== true) {
      fail(`${field} does not resolve to a callable Python symbol.`, {
        repo_dir: repoDir,
        field,
        callable: callableName,
      });
    }
    return;
  }
  fail(`${field} requires an available Python 3 interpreter for static callable validation.`, {
    repo_dir: repoDir,
    field,
  });
}

export function assertDomainHandlerImplementationsResolve(repoDir: string, registry: DomainHandlerRegistry) {
  registry.handlers.forEach((handler, index) => {
    const field = `domain_handler_registry.handlers[${index}].binding`;
    if (handler.binding.kind === 'typescript_export') {
      const file = repoFile(repoDir, handler.binding.file, `${field}.file`);
      const extension = path.extname(file.ref);
      if (
        file.ref.endsWith('.d.ts')
        || file.ref.endsWith('.d.mts')
        || file.ref.endsWith('.d.cts')
        || !['.ts', '.tsx', '.mts', '.cts', '.js', '.mjs', '.cjs'].includes(extension)
      ) {
        fail(`${field}.file must be a TypeScript or JavaScript module.`, {
          repo_dir: repoDir,
          field,
          ref: file.ref,
        });
      }
      const exported = typescriptCallableExports(file.resolved);
      if (!exported.has(handler.binding.export)) {
        fail(`${field}.export does not resolve to a callable export in the declared file.`, {
          repo_dir: repoDir,
          field,
          ref: file.ref,
          export: handler.binding.export,
        });
      }
      return;
    }
    const file = pythonModuleFile(repoDir, handler.binding.module, field);
    assertPythonCallable(file.resolved, handler.binding.callable, `${field}.callable`, repoDir);
  });
}

export function readJson(repoDir: string, ref: string, field: string) {
  const file = repoFile(repoDir, ref, field);
  const source = fs.readFileSync(file.resolved, 'utf8');
  try {
    return { payload: parseJsonText(source), source };
  } catch (error) {
    throw new FrameworkContractError('contract_json_invalid', `Invalid JSON in ${ref}.`, {
      repo_dir: repoDir,
      relative_path: ref,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export function readJsonPointer(repoDir: string, ref: string, field: string) {
  const [fileRef, fragment = ''] = ref.split('#', 2);
  let value = readJson(repoDir, fileRef!, field).payload;
  if (fragment) {
    if (!fragment.startsWith('/')) {
      fail(`${field} must use a JSON Pointer fragment.`, { repo_dir: repoDir, ref });
    }
    for (const rawToken of fragment.slice(1).split('/')) {
      const token = rawToken.replace(/~1/g, '/').replace(/~0/g, '~');
      if (!isRecord(value) || !Object.hasOwn(value, token)) {
        fail(`${field} JSON Pointer does not resolve.`, { repo_dir: repoDir, ref, token });
      }
      value = value[token];
    }
  }
  return value;
}
