import path from 'node:path';

import * as ts from 'typescript/unstable/ast';
import { API, SymbolFlags, type NodeHandle, type Project, type Symbol } from 'typescript/unstable/sync';

import type {
  SourceClosureCallEdge,
  SourceClosureGraphScan,
  SourceClosureObservedCall,
  SourceClosureSymbol,
  SourceClosureUnresolvedEdge,
} from './types.ts';

function unixPath(value: string) {
  return value.split(path.sep).join('/');
}

function lineOf(sourceFile: ts.SourceFile, node: ts.Node) {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

function functionName(node: ts.Node, sourceFile: ts.SourceFile) {
  if (
    ts.isFunctionDeclaration(node)
    || ts.isMethodDeclaration(node)
    || ts.isGetAccessorDeclaration(node)
    || ts.isSetAccessorDeclaration(node)
  ) {
    const ownName = node.name?.getText(sourceFile);
    if (ownName && ts.isMethodDeclaration(node) && node.parent && ts.isClassLikeDeclaration(node.parent)) {
      return `${node.parent.name?.getText(sourceFile) ?? '<anonymous-class>'}.${ownName}`;
    }
    return ownName ?? `<anonymous@${lineOf(sourceFile, node)}>`;
  }
  if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
    if (ts.isVariableDeclaration(node.parent) && ts.isIdentifier(node.parent.name)) {
      return node.parent.name.text;
    }
    if (ts.isPropertyAssignment(node.parent)) {
      return node.parent.name.getText(sourceFile);
    }
    return `<anonymous@${lineOf(sourceFile, node)}>`;
  }
  return null;
}

function functionLike(node: ts.Node) {
  return ts.isFunctionDeclaration(node)
    || ts.isMethodDeclaration(node)
    || ts.isGetAccessorDeclaration(node)
    || ts.isSetAccessorDeclaration(node)
    || ts.isArrowFunction(node)
    || ts.isFunctionExpression(node);
}

function literalArguments(call: ts.CallExpression) {
  return call.arguments.map((argument) => {
    if (
      ts.isStringLiteralLikeNode(argument)
      || ts.isNumericLiteral(argument)
      || argument.kind === ts.SyntaxKind.TrueKeyword
      || argument.kind === ts.SyntaxKind.FalseKeyword
    ) {
      return ts.isStringLiteralLikeNode(argument) || ts.isNumericLiteral(argument)
        ? argument.text
        : argument.getText();
    }
    return '<dynamic>';
  });
}

function uniqueBy<T>(values: T[], key: (value: T) => string) {
  return [...new Map(values.map((value) => [key(value), value])).values()];
}

export function buildTypescriptSourceGraph(repoDir: string, relativeFiles: string[]): SourceClosureGraphScan {
  if (relativeFiles.length === 0) {
    return {
      scan_complete: true,
      symbols: [],
      call_edges: [],
      unresolved_edges: [],
      observed_calls: [],
      diagnostics: [],
    };
  }
  const absoluteFiles = relativeFiles.map((file) => path.resolve(repoDir, file));
  const configPath = path.resolve(repoDir, '.opl-source-closure.tsconfig.json');
  const config = JSON.stringify({
    compilerOptions: {
      allowJs: true,
      allowImportingTsExtensions: true,
      checkJs: false,
      esModuleInterop: true,
      module: 'nodenext',
      moduleResolution: 'nodenext',
      noEmit: true,
      skipLibCheck: true,
      target: 'es2022',
    },
    files: absoluteFiles,
  });
  const api = new API({
    cwd: path.resolve(repoDir),
    fs: {
      fileExists: (file) => path.resolve(file) === configPath ? true : undefined,
      readFile: (file) => path.resolve(file) === configPath ? config : undefined,
    },
  });
  try {
    const snapshot = api.updateSnapshot({ openProjects: [configPath] });
    try {
      const project = snapshot.getProject(configPath);
      if (!project) {
        throw new Error(`Unable to open TypeScript source graph project: ${repoDir}`);
      }
      return scanTypescriptProject(project, repoDir, absoluteFiles);
    } finally {
      snapshot.dispose();
    }
  } finally {
    api.close();
  }
}

function scanTypescriptProject(project: Project, repoDir: string, absoluteFiles: string[]): SourceClosureGraphScan {
  const { program, checker } = project;
  const symbolResolutionDiagnostics = new Set<string>();
  const resolveNodeHandle = (handle: NodeHandle) => {
    const node = handle.resolve(project);
    if (!node) {
      symbolResolutionDiagnostics.add(
        `typescript_symbol_resolution_error:${handle.path}:${handle.index}`,
      );
    }
    return node;
  };
  const activeFiles = new Set(absoluteFiles.map((file) => path.resolve(file)));
  const sourceFiles = absoluteFiles.flatMap((file) => {
    const sourceFile = program.getSourceFile(file);
    return sourceFile ? [sourceFile] : [];
  });
  const relativeByAbsolute = new Map(sourceFiles.map((file) => [
    path.resolve(file.fileName),
    unixPath(path.relative(repoDir, file.fileName)),
  ]));
  const nodeSymbols = new Map<ts.Node, string>();
  const symbols: SourceClosureSymbol[] = [];

  for (const sourceFile of sourceFiles) {
    const relativeFile = relativeByAbsolute.get(path.resolve(sourceFile.fileName))!;
    const moduleId = `${relativeFile}#<module>`;
    nodeSymbols.set(sourceFile, moduleId);
    symbols.push({
      symbol_id: moduleId,
      language: 'typescript',
      file: relativeFile,
      module_name: null,
      symbol: '<module>',
      line: 1,
    });
    const visit = (node: ts.Node) => {
      if (functionLike(node)) {
        const name = functionName(node, sourceFile)!;
        const symbolId = `${relativeFile}#${name}`;
        nodeSymbols.set(node, symbolId);
        if (ts.isVariableDeclaration(node.parent)) {
          nodeSymbols.set(node.parent, symbolId);
        }
        symbols.push({
          symbol_id: symbolId,
          language: 'typescript',
          file: relativeFile,
          module_name: null,
          symbol: name,
          line: lineOf(sourceFile, node),
        });
      }
      node.forEachChild(visit);
    };
    sourceFile.forEachChild(visit);
  }

  const containingSymbol = (node: ts.Node) => {
    let current: ts.Node | undefined = node;
    while (current) {
      const symbolId = nodeSymbols.get(current);
      if (symbolId) {
        return symbolId;
      }
      current = current.parent;
    }
    const sourceFile = node.getSourceFile();
    const relativeFile = relativeByAbsolute.get(path.resolve(sourceFile.fileName));
    return `${relativeFile ?? unixPath(path.relative(repoDir, sourceFile.fileName))}#<module>`;
  };
  const localSymbolId = (symbol: Symbol | undefined) => {
    if (!symbol) {
      return null;
    }
    const resolved = (symbol.flags & SymbolFlags.Alias) !== 0
      ? checker.getAliasedSymbol(symbol)
      : symbol;
    for (const declaration of resolved.declarations ?? []) {
      let current: ts.Node | undefined = resolveNodeHandle(declaration);
      while (current) {
        const symbolId = nodeSymbols.get(current);
        if (symbolId) {
          return symbolId;
        }
        current = current.parent;
      }
    }
    return null;
  };

  const callEdges: SourceClosureCallEdge[] = [];
  const unresolvedEdges: SourceClosureUnresolvedEdge[] = [];
  const observedCalls: SourceClosureObservedCall[] = [];
  for (const sourceFile of sourceFiles) {
    const relativeFile = relativeByAbsolute.get(path.resolve(sourceFile.fileName))!;
    const moduleId = `${relativeFile}#<module>`;
    const visit = (node: ts.Node) => {
      if (
        functionLike(node)
        && node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)
      ) {
        const target = nodeSymbols.get(node);
        if (target) {
          callEdges.push({
            from_symbol: moduleId,
            to_symbol: target,
            file: relativeFile,
            line: lineOf(sourceFile, node),
            edge_kind: 'static_import',
          });
        }
      }
      if (
        ts.isVariableStatement(node)
        && node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)
      ) {
        for (const declaration of node.declarationList.declarations) {
          const target = nodeSymbols.get(declaration);
          if (target) {
            callEdges.push({
              from_symbol: moduleId,
              to_symbol: target,
              file: relativeFile,
              line: lineOf(sourceFile, declaration),
              edge_kind: 'static_import',
            });
          }
        }
      }
      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
        const specifier = node.moduleSpecifier;
        if (specifier && ts.isStringLiteralLikeNode(specifier)) {
          const moduleSymbol = checker.getSymbolAtLocation(specifier);
          const resolvedFile = moduleSymbol?.declarations
            .map((declaration) => resolveNodeHandle(declaration))
            .find((declaration): declaration is ts.SourceFile => declaration !== undefined && ts.isSourceFile(declaration));
          if (resolvedFile) {
            const targetFile = relativeByAbsolute.get(path.resolve(resolvedFile.fileName));
            if (targetFile) {
              callEdges.push({
                from_symbol: moduleId,
                to_symbol: `${targetFile}#<module>`,
                file: relativeFile,
                line: lineOf(sourceFile, node),
                edge_kind: 'static_import',
              });
            }
          } else if (specifier.text.startsWith('.')) {
            unresolvedEdges.push({
              from_symbol: moduleId,
              file: relativeFile,
              line: lineOf(sourceFile, node),
              reason: 'relative_import_unresolved',
              expression: specifier.text,
              sensitive: true,
            });
          }
        }
        if (ts.isExportDeclaration(node) && node.exportClause && ts.isNamedExports(node.exportClause)) {
          for (const element of node.exportClause.elements) {
            const target = localSymbolId(checker.getSymbolAtLocation(element.name));
            if (target) {
              callEdges.push({
                from_symbol: moduleId,
                to_symbol: target,
                file: relativeFile,
                line: lineOf(sourceFile, element),
                edge_kind: 'static_import',
              });
            }
          }
        }
      }
      if (ts.isCallExpression(node)) {
        const fromSymbol = containingSymbol(node);
        const callee = node.expression.getText(sourceFile);
        observedCalls.push({
          symbol_id: fromSymbol,
          file: relativeFile,
          line: lineOf(sourceFile, node),
          callee,
          source_text: node.getText(sourceFile),
          literal_arguments: literalArguments(node),
          argument_expressions: node.arguments.map((argument) => argument.getText(sourceFile)),
        });
        const target = localSymbolId(checker.getSymbolAtLocation(node.expression));
        if (target) {
          callEdges.push({
            from_symbol: fromSymbol,
            to_symbol: target,
            file: relativeFile,
            line: lineOf(sourceFile, node),
            edge_kind: 'call',
          });
        }
        const dynamicImport = node.expression.kind === ts.SyntaxKind.ImportKeyword
          && (!node.arguments[0] || !ts.isStringLiteralLikeNode(node.arguments[0]));
        const dynamicRequire = ts.isIdentifier(node.expression)
          && node.expression.text === 'require'
          && (!node.arguments[0] || !ts.isStringLiteralLikeNode(node.arguments[0]));
        const dynamicDispatch = ts.isElementAccessExpression(node.expression)
          && (!node.expression.argumentExpression
            || !ts.isStringLiteralLikeNode(node.expression.argumentExpression));
        if (dynamicImport || dynamicRequire || dynamicDispatch) {
          unresolvedEdges.push({
            from_symbol: fromSymbol,
            file: relativeFile,
            line: lineOf(sourceFile, node),
            reason: dynamicImport
              ? 'dynamic_import'
              : dynamicRequire
                ? 'dynamic_require'
                : 'dynamic_dispatch',
            expression: node.getText(sourceFile),
            sensitive: true,
          });
        }
      }
      node.forEachChild(visit);
    };
    sourceFile.forEachChild(visit);
  }

  const syntaxDiagnostics = program.getSyntacticDiagnostics()
    .filter((diagnostic) => diagnostic.fileName && activeFiles.has(path.resolve(diagnostic.fileName)))
    .map((diagnostic) => {
      const file = diagnostic.fileName
        ? relativeByAbsolute.get(path.resolve(diagnostic.fileName)) ?? diagnostic.fileName
        : '<unknown>';
      return `typescript_parse_error:${file}:${diagnostic.text}`;
    });
  const diagnostics = [...new Set([...symbolResolutionDiagnostics, ...syntaxDiagnostics])];
  return {
    scan_complete: diagnostics.length === 0,
    symbols: uniqueBy(symbols, (item) => item.symbol_id),
    call_edges: uniqueBy(callEdges, (item) => `${item.from_symbol}:${item.to_symbol}:${item.line}:${item.edge_kind}`),
    unresolved_edges: uniqueBy(unresolvedEdges, (item) => `${item.file}:${item.line}:${item.reason}:${item.expression}`),
    observed_calls: uniqueBy(observedCalls, (item) => `${item.symbol_id}:${item.line}:${item.source_text}`),
    diagnostics,
  };
}
