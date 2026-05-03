import fs from 'node:fs';
import ts from 'typescript';

import type { FunctionFinding, SourceFileInfo } from './types.ts';

function scriptKindFor(filePath: string) {
  if (filePath.endsWith('.tsx') || filePath.endsWith('.jsx')) {
    return ts.ScriptKind.TSX;
  }
  if (filePath.endsWith('.js') || filePath.endsWith('.mjs') || filePath.endsWith('.cjs') || filePath.endsWith('.jsx')) {
    return ts.ScriptKind.JS;
  }
  return ts.ScriptKind.TS;
}

function lineOf(sourceFile: ts.SourceFile, position: number) {
  return sourceFile.getLineAndCharacterOfPosition(position).line + 1;
}

function nameOf(node: ts.FunctionLikeDeclarationBase) {
  const named = node as ts.FunctionLikeDeclarationBase & { name?: ts.PropertyName };
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

function complexityOf(root: ts.FunctionLikeDeclarationBase) {
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

    ts.forEachChild(node, visit);
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

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return [...imports].sort((left, right) => left.localeCompare(right));
}

function analyzeTypescriptFiles(files: SourceFileInfo[]) {
  const functions: FunctionFinding[] = [];
  const updatedFiles: SourceFileInfo[] = [];

  for (const file of files) {
    const text = fs.readFileSync(file.absolutePath, 'utf8');
    const sourceFile = ts.createSourceFile(file.absolutePath, text, ts.ScriptTarget.Latest, true, scriptKindFor(file.absolutePath));

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
          start_line: startLine,
          end_line: endLine,
          lines,
          parameters,
          cyclomatic_complexity: cyclomaticComplexity,
          score: scoreFunction(lines, parameters, cyclomaticComplexity),
          reasons: reasonsFor(lines, parameters, cyclomaticComplexity),
        });
      }

      ts.forEachChild(node, visit);
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
