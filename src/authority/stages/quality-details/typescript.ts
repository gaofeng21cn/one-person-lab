import path from 'node:path';
import * as ts from 'typescript/unstable/ast';
import { API, type Project } from 'typescript/unstable/sync';

import type { FunctionFinding, SourceFileInfo } from './types.ts';

type AnalyzedFunction = ts.FunctionDeclaration | ts.FunctionExpression | ts.ArrowFunction | ts.MethodDeclaration;

function lineOf(sourceFile: ts.SourceFile, position: number) {
  return sourceFile.getLineAndCharacterOfPosition(position).line + 1;
}

function nameOf(node: AnalyzedFunction) {
  const named = node as AnalyzedFunction & { name?: ts.PropertyName };
  if (named.name && ts.isIdentifier(named.name)) {
    return named.name.text;
  }
  if (named.name && (ts.isStringLiteral(named.name) || ts.isNumericLiteral(named.name))) {
    return named.name.text;
  }
  const parent = node.parent;
  if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) {
    return parent.name.text;
  }
  if (ts.isPropertyAssignment(parent) && ts.isIdentifier(parent.name)) {
    return parent.name.text;
  }
  return '<anonymous>';
}

function parentName(node: ts.Node) {
  if (ts.isClassDeclaration(node) || ts.isInterfaceDeclaration(node) || ts.isEnumDeclaration(node) || ts.isModuleDeclaration(node)) {
    return node.name?.text;
  }
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
    return node.name.text;
  }
  if (ts.isPropertyAssignment(node)) {
    if (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name) || ts.isNumericLiteral(node.name)) {
      return node.name.text;
    }
  }
  if (ts.isObjectLiteralExpression(node)) {
    const parent = node.parent;
    if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) {
      return parent.name.text;
    }
    if (ts.isPropertyAssignment(parent)) {
      if (ts.isIdentifier(parent.name) || ts.isStringLiteral(parent.name) || ts.isNumericLiteral(parent.name)) {
        return parent.name.text;
      }
    }
  }
  if (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node) || ts.isMethodDeclaration(node)) {
    return nameOf(node);
  }
  return undefined;
}

function qualifiedNameOf(node: AnalyzedFunction) {
  const names: string[] = [];
  for (let current: ts.Node | undefined = node.parent; current; current = current.parent) {
    const name = parentName(current);
    if (name && name !== '<anonymous>') {
      names.push(name);
    }
  }
  return [...names.reverse(), nameOf(node)].join('.');
}

function complexityOf(root: AnalyzedFunction) {
  let complexity = 1;

  const visit = (node: ts.Node) => {
    if (node !== root && (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node) || ts.isMethodDeclaration(node))) {
      return;
    }

    if (
      ts.isIfStatement(node)
      || ts.isForStatement(node)
      || ts.isForInStatement(node)
      || ts.isForOfStatement(node)
      || ts.isWhileStatement(node)
      || ts.isDoStatement(node)
      || ts.isConditionalExpression(node)
      || ts.isCatchClause(node)
    ) {
      complexity += 1;
    }

    if (ts.isCaseClause(node)) {
      complexity += 1;
    }

    if (
      ts.isBinaryExpression(node)
      && (node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken
        || node.operatorToken.kind === ts.SyntaxKind.BarBarToken
        || node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken)
    ) {
      complexity += 1;
    }

    node.forEachChild(visit);
  };

  visit(root);
  return complexity;
}

function scoreFunction(lines: number, parameters: number, complexity: number) {
  return (complexity * 6) + (parameters * 3) + Math.min(lines, 200);
}

function reasonsFor(lines: number, parameters: number, complexity: number) {
  const reasons: string[] = [];
  if (complexity >= 8) {
    reasons.push(`complexity ${complexity}`);
  }
  if (parameters >= 5) {
    reasons.push(`parameters ${parameters}`);
  }
  if (lines >= 80) {
    reasons.push(`lines ${lines}`);
  }
  if (reasons.length === 0) {
    reasons.push(`score ${scoreFunction(lines, parameters, complexity)}`);
  }
  return reasons;
}

function collectImportTargets(sourceFile: ts.SourceFile) {
  const imports = new Set<string>();

  const visit = (node: ts.Node) => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      imports.add(node.moduleSpecifier.text);
    }

    if (
      ts.isCallExpression(node)
      && ts.isIdentifier(node.expression)
      && node.expression.text === 'require'
      && node.arguments.length === 1
      && ts.isStringLiteral(node.arguments[0])
    ) {
      imports.add(node.arguments[0].text);
    }

    node.forEachChild(visit);
  };

  visit(sourceFile);
  return [...imports].sort((left, right) => left.localeCompare(right));
}

function analyzeTypescriptFiles(files: SourceFileInfo[]) {
  if (files.length === 0) {
    return { files: [], functions: [] };
  }
  const cwd = path.dirname(path.resolve(files[0]!.absolutePath));
  const configPath = path.join(cwd, '.opl-quality-details.tsconfig.json');
  const config = JSON.stringify({
    compilerOptions: { allowJs: true, noEmit: true, noResolve: true, noLib: true, types: [] },
    files: files.map((file) => path.resolve(file.absolutePath)),
  });
  const api = new API({
    cwd,
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
        throw new Error(`Unable to open TypeScript quality project: ${cwd}`);
      }
      return analyzeProjectFiles(files, project);
    } finally {
      snapshot.dispose();
    }
  } finally {
    api.close();
  }
}

function analyzeProjectFiles(files: SourceFileInfo[], project: Project) {
  const functions: FunctionFinding[] = [];
  const updatedFiles: SourceFileInfo[] = [];

  for (const file of files) {
    const sourceFile = project.program.getSourceFile(path.resolve(file.absolutePath));
    if (!sourceFile) {
      throw new Error(`Unable to read TypeScript source file: ${file.absolutePath}`);
    }

    const visit = (node: ts.Node) => {
      if (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node) || ts.isMethodDeclaration(node)) {
        const startLine = lineOf(sourceFile, node.getStart(sourceFile));
        const endLine = lineOf(sourceFile, node.end);
        const lines = Math.max(1, endLine - startLine + 1);
        const parameters = node.parameters.length;
        const cyclomaticComplexity = complexityOf(node);
        functions.push({
          kind: 'function_metric',
          file: file.relativePath,
          function_name: nameOf(node),
          qualified_name: qualifiedNameOf(node),
          start_line: startLine,
          end_line: endLine,
          lines,
          parameters,
          cyclomatic_complexity: cyclomaticComplexity,
          score: scoreFunction(lines, parameters, cyclomaticComplexity),
          reasons: reasonsFor(lines, parameters, cyclomaticComplexity),
        });
      }

      node.forEachChild(visit);
    };

    visit(sourceFile);
    updatedFiles.push({
      ...file,
      importTargets: collectImportTargets(sourceFile),
    });
  }

  return { files: updatedFiles, functions };
}

export { analyzeTypescriptFiles };
