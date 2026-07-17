import path from 'node:path';

import ts from 'typescript';

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
    if (ownName && ts.isMethodDeclaration(node) && node.parent && ts.isClassLike(node.parent)) {
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
      ts.isStringLiteralLike(argument)
      || ts.isNumericLiteral(argument)
      || argument.kind === ts.SyntaxKind.TrueKeyword
      || argument.kind === ts.SyntaxKind.FalseKeyword
    ) {
      return ts.isStringLiteralLike(argument) || ts.isNumericLiteral(argument)
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
  const compilerOptions: ts.CompilerOptions = {
    allowJs: true,
    allowImportingTsExtensions: true,
    checkJs: false,
    esModuleInterop: true,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    noEmit: true,
    skipLibCheck: true,
    target: ts.ScriptTarget.ES2022,
  };
  const program = ts.createProgram({ rootNames: absoluteFiles, options: compilerOptions });
  const checker = program.getTypeChecker();
  const activeFiles = new Set(absoluteFiles.map((file) => path.resolve(file)));
  const sourceFiles = program.getSourceFiles().filter((file) => activeFiles.has(path.resolve(file.fileName)));
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
      ts.forEachChild(node, visit);
    };
    ts.forEachChild(sourceFile, visit);
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
  const localSymbolId = (symbol: ts.Symbol | undefined) => {
    if (!symbol) {
      return null;
    }
    const resolved = (symbol.flags & ts.SymbolFlags.Alias) !== 0
      ? checker.getAliasedSymbol(symbol)
      : symbol;
    for (const declaration of resolved.declarations ?? []) {
      let current: ts.Node | undefined = declaration;
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
        && ts.canHaveModifiers(node)
        && ts.getModifiers(node)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)
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
        && ts.getModifiers(node)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)
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
        if (specifier && ts.isStringLiteralLike(specifier)) {
          const resolved = ts.resolveModuleName(
            specifier.text,
            sourceFile.fileName,
            compilerOptions,
            ts.sys,
          ).resolvedModule;
          if (resolved) {
            const targetFile = relativeByAbsolute.get(path.resolve(resolved.resolvedFileName));
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
          && (!node.arguments[0] || !ts.isStringLiteralLike(node.arguments[0]));
        const dynamicRequire = ts.isIdentifier(node.expression)
          && node.expression.text === 'require'
          && (!node.arguments[0] || !ts.isStringLiteralLike(node.arguments[0]));
        const dynamicDispatch = ts.isElementAccessExpression(node.expression)
          && (!node.expression.argumentExpression
            || !ts.isStringLiteralLike(node.expression.argumentExpression));
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
      ts.forEachChild(node, visit);
    };
    ts.forEachChild(sourceFile, visit);
  }

  const syntaxDiagnostics = program.getSyntacticDiagnostics()
    .filter((diagnostic) => diagnostic.file && activeFiles.has(path.resolve(diagnostic.file.fileName)))
    .map((diagnostic) => {
      const file = diagnostic.file
        ? relativeByAbsolute.get(path.resolve(diagnostic.file.fileName)) ?? diagnostic.file.fileName
        : '<unknown>';
      return `typescript_parse_error:${file}:${ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ')}`;
    });
  return {
    scan_complete: syntaxDiagnostics.length === 0,
    symbols: uniqueBy(symbols, (item) => item.symbol_id),
    call_edges: uniqueBy(callEdges, (item) => `${item.from_symbol}:${item.to_symbol}:${item.line}:${item.edge_kind}`),
    unresolved_edges: uniqueBy(unresolvedEdges, (item) => `${item.file}:${item.line}:${item.reason}:${item.expression}`),
    observed_calls: uniqueBy(observedCalls, (item) => `${item.symbol_id}:${item.line}:${item.source_text}`),
    diagnostics: syntaxDiagnostics,
  };
}
