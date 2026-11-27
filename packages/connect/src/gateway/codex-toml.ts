import { getStaticTOMLValue, parseTOML, type AST } from 'toml-eslint-parser';

export function parseConfig(text: string) {
  try {
    return parseTOML(text, { tomlVersion: '1.0' });
  } catch {
    // Parser diagnostics may include the credential-bearing line.
    throw new Error('Invalid Codex configuration TOML.');
  }
}
export function readConfig(text: string) {
  return getStaticTOMLValue(parseConfig(text)) as Record<string, unknown>;
}

function quote(value: string) {
  return JSON.stringify(value).replace(/\u007f/g, '\\u007f');
}

function renderKey(key: string) {
  return /^[a-zA-Z0-9_-]+$/.test(key) ? key : quote(key);
}

function change(text: string, start: number, end: number, replacement: string) {
  return text.slice(0, start) + replacement + text.slice(end);
}

function removeAssignment(text: string, node: AST.TOMLKeyValue) {
  const parent = node.parent;
  const [start, end] = node.range;
  if (parent.type === 'TOMLInlineTable') {
    const i = parent.body.indexOf(node);
    const next = parent.body[i + 1];
    const previous = parent.body[i - 1];
    return change(text, previous && !next ? previous.range[1] : start, next?.range[0] ?? end, '');
  }
  const lineStart = text.lastIndexOf('\n', start - 1) + 1;
  const lineEnd = text.indexOf('\n', end);
  const endOfContent = lineEnd === -1 ? text.length : lineEnd;
  if (!text.slice(lineStart, start).trim() && !text.slice(end, endOfContent).trim()) {
    return change(text, lineStart, lineEnd === -1 ? endOfContent : lineEnd + 1, '');
  }
  return change(text, start, end, '');
}

// Use TOML token ranges so comments, dotted keys, arrays and multiline values
// outside the three managed provider fields survive activation and rollback.
export function setConfigValue(text: string, path: string[], value?: string) {
  const ast = parseConfig(text);
  const root = ast.body[0];
  const target = JSON.stringify(path);
  let match: AST.TOMLKeyValue | undefined;
  let scope: AST.TOMLTable | AST.TOMLInlineTable | undefined;
  let scopeDepth = 0;
  function visit(node: AST.TOMLKeyValue | AST.TOMLTable, prefix: (number | string)[]) {
    const keyPath = node.type === 'TOMLTable'
      ? node.resolvedKey
      : [...prefix, ...getStaticTOMLValue(node.key)];
    if (!keyPath.every((key, i) => path[i] === key)) return;
    if (node.type === 'TOMLKeyValue' && JSON.stringify(keyPath) === target) {
      match = node;
      return;
    }
    const child = node.type === 'TOMLTable' ? node : node.value;
    if (child.type === 'TOMLTable' || child.type === 'TOMLInlineTable') {
      if (keyPath.length >= scopeDepth) {
        scope = child;
        scopeDepth = keyPath.length;
      }
      for (const entry of child.body) visit(entry, keyPath);
    }
  }
  for (const entry of root.body) visit(entry, []);
  if (match) {
    return value === undefined ? removeAssignment(text, match)
      : change(text, match.value.range[0], match.value.range[1], quote(value));
  }
  if (value === undefined) return text;

  const newline = text.includes('\r\n') ? '\r\n' : '\n';
  const assignment = path.slice(scopeDepth).map(renderKey).join('.') + ' = ' + quote(value);
  if (scope?.type === 'TOMLInlineTable') {
    return change(text, scope.range[1] - 1, scope.range[1] - 1, (scope.body.length ? ', ' : '') + assignment);
  }
  if (scope?.type === 'TOMLTable') {
    const headerEnd = text.indexOf('\n', scope.key.range[1]);
    return headerEnd === -1 ? text + newline + assignment + newline
      : change(text, headerEnd + 1, headerEnd + 1, assignment + newline);
  }
  if (path.length === 1) return assignment + newline + text;
  // A dotted declaration of this table already in the root cannot be redeclared.
  const tablePath = path.slice(0, -1);
  const dotted = root.body.some(entry => entry.type === 'TOMLKeyValue'
    && tablePath.every((part, i) => part === getStaticTOMLValue(entry.key)[i]));
  if (dotted) return assignment + newline + text;
  const header = '[' + tablePath.map(renderKey).join('.') + ']';
  const join = text && !text.endsWith('\n') ? newline + newline : '';
  return text + join + header + newline + renderKey(path.at(-1)!) + ' = ' + quote(value) + newline;
}

export function removeEmptyProviderTable(text: string, id: string) {
  const root = parseConfig(text).body[0];
  const table = root.body.find(node => node.type === 'TOMLTable'
    && JSON.stringify(node.resolvedKey) === JSON.stringify(['model_providers', id]));
  if (table?.type === 'TOMLTable' && !table.body.length) {
    const end = table.range[1];
    return change(text, table.range[0], end + (text.slice(end).match(/^\r?\n/)?.[0].length ?? 0), '');
  }
  return text;
}
