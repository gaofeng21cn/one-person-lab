import { parse as parseToml, stringify as stringifyToml } from 'smol-toml';

export type TomlTableBlock = {
  header: string;
  path: string[];
  rawHeader: string;
  content: string;
  leadingComments: string;
  aliases: string[];
  values: Record<string, unknown>;
  isArrayTable?: boolean;
};

export function idAliases(value: string) {
  const normalized = value.trim().toLowerCase().replaceAll('_', '-');
  return [...new Set([
    normalized,
    ...normalized.split(/[@./]/).filter(Boolean),
    normalized.replace(/-local$/, ''),
  ])];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date);
}

export function parseTomlRecord(text: string): Record<string, unknown> {
  return parseToml(text) as Record<string, unknown>;
}

export function validateTomlDocument(text: string): Record<string, unknown> {
  if (!text.trim()) return {};
  return parseTomlRecord(text);
}

export function parseTomlTablePath(rawLine: string): string[] | null {
  const trimmed = rawLine.trim();
  if (!trimmed.startsWith('[') || trimmed.startsWith('[[')) return null;
  let parsed: Record<string, unknown>;
  try {
    parsed = parseTomlRecord(trimmed);
  } catch {
    return null;
  }
  const segments: string[] = [];
  let cursor: unknown = parsed;
  while (isPlainObject(cursor)) {
    const keys = Object.keys(cursor);
    if (keys.length === 0) break;
    if (keys.length !== 1) return null;
    const key = keys[0];
    segments.push(key);
    cursor = cursor[key];
  }
  if (!isPlainObject(cursor) || Object.keys(cursor).length !== 0 || segments.length === 0) {
    return null;
  }
  return segments;
}

function parseTomlArrayTablePath(rawLine: string): string[] | null {
  const trimmed = rawLine.trim();
  if (!trimmed.startsWith('[[')) return null;
  let parsed: Record<string, unknown>;
  try {
    parsed = parseTomlRecord(trimmed);
  } catch {
    return null;
  }
  const segments: string[] = [];
  let cursor: unknown = parsed;
  while (isPlainObject(cursor)) {
    const keys = Object.keys(cursor);
    if (keys.length !== 1) return null;
    const key = keys[0];
    segments.push(key);
    cursor = cursor[key];
  }
  if (!Array.isArray(cursor) || cursor.length !== 1 || !isPlainObject(cursor[0]) || segments.length === 0) {
    return null;
  }
  return segments;
}

export function sameTomlTablePath(
  left: readonly string[] | null,
  right: readonly string[] | null,
) {
  return Boolean(
    left
    && right
    && left.length === right.length
    && left.every((segment, index) => segment === right[index]),
  );
}

export function renderTomlKeySegment(value: string) {
  if (/^[A-Za-z0-9_-]+$/.test(value)) return value;
  const serializedHeader = stringifyToml({ [value]: {} }).trim();
  return serializedHeader.slice(1, -1);
}

export function renderTomlTableHeader(pathSegments: readonly string[]) {
  return `[${pathSegments.map(renderTomlKeySegment).join('.')}]`;
}

function renderTomlScalar(value: unknown): string {
  const rendered = stringifyToml({ v: value }).trimEnd();
  return rendered.slice(rendered.indexOf('=') + 1).trim();
}

export function renderTomlKeyValue(key: string, value: unknown) {
  if (Array.isArray(value)) {
    const renderedKey = renderTomlKeySegment(key);
    return `${renderedKey} = [${value.map((entry) => renderTomlScalar(entry)).join(', ')}]`;
  }
  return stringifyToml({ [key]: value }).trimEnd();
}

function readTableValues(blockContent: string, tablePath: readonly string[]): Record<string, unknown> {
  try {
    let cursor: unknown = parseTomlRecord(blockContent);
    for (const segment of tablePath) {
      if (Array.isArray(cursor)) cursor = cursor[0];
      if (!isPlainObject(cursor)) return {};
      cursor = cursor[segment];
    }
    if (Array.isArray(cursor)) cursor = cursor[0];
    return isPlainObject(cursor) ? cursor : {};
  } catch {
    return {};
  }
}

function splitDetachedLeadingComments(lines: string[]) {
  let end = lines.length;
  while (end > 0 && lines[end - 1].trim() === '') end -= 1;
  let commentStart = end;
  while (commentStart > 0 && lines[commentStart - 1].trim().startsWith('#')) {
    commentStart -= 1;
  }
  if (commentStart < end && commentStart > 0 && lines[commentStart - 1].trim() === '') {
    return {
      bodyLines: lines.slice(0, commentStart),
      detachedComments: lines.slice(commentStart, end).join('\n'),
    };
  }
  return {
    bodyLines: lines,
    detachedComments: '',
  };
}

export function parseTomlDocumentBlocks(text: string) {
  const preambleLines: string[] = [];
  const tables: TomlTableBlock[] = [];
  let current: {
    path: string[];
    rawHeader: string;
    leadingComments: string;
    isArrayTable: boolean;
    lines: string[];
  } | null = null;

  const finalizeCurrent = (nextLeadingComments: string) => {
    if (!current) return nextLeadingComments;
    const { bodyLines, detachedComments } = splitDetachedLeadingComments(current.lines);
    const content = `${bodyLines.join('\n').trimEnd()}\n`;
    const header = current.path.join('.');
    tables.push({
      header,
      path: current.path,
      rawHeader: current.rawHeader,
      content,
      leadingComments: current.leadingComments,
      aliases: idAliases(header),
      values: readTableValues(content, current.path),
      ...(current.isArrayTable ? { isArrayTable: true } : {}),
    });
    return detachedComments;
  };

  for (const line of text.replace(/\r\n/g, '\n').split('\n')) {
    const tablePath = parseTomlTablePath(line);
    const arrayTablePath = tablePath ? null : parseTomlArrayTablePath(line);
    const headerPath = tablePath ?? arrayTablePath;
    if (headerPath) {
      const leadingComments = finalizeCurrent('');
      current = {
        path: headerPath,
        rawHeader: line.trim(),
        leadingComments,
        isArrayTable: Boolean(arrayTablePath),
        lines: [line],
      };
    } else if (current) {
      current.lines.push(line);
    } else {
      preambleLines.push(line);
    }
  }
  if (current) {
    const content = `${current.lines.join('\n').trimEnd()}\n`;
    const header = current.path.join('.');
    tables.push({
      header,
      path: current.path,
      rawHeader: current.rawHeader,
      content,
      leadingComments: current.leadingComments,
      aliases: idAliases(header),
      values: readTableValues(content, current.path),
      ...(current.isArrayTable ? { isArrayTable: true } : {}),
    });
  }

  return {
    preamble: preambleLines.join('\n').trimEnd(),
    tables,
  };
}

export function renderTomlDocumentBlocks(
  preamble: string,
  tables: ReadonlyArray<Pick<TomlTableBlock, 'content'> & { leadingComments?: string }>,
) {
  const parts = [
    preamble.trimEnd(),
    ...tables.map((table) => {
      const prefix = table.leadingComments?.trimEnd();
      const body = table.content.trim();
      return prefix ? `${prefix}\n${body}` : body;
    }),
  ].filter(Boolean);
  return parts.length > 0 ? `${parts.join('\n\n')}\n` : '';
}

function consumeKeyAssignment(lines: readonly string[], startIndex: number): {
  keys: string[];
  endIndex: number;
} | null {
  const firstTrimmed = lines[startIndex].trim();
  if (!firstTrimmed || firstTrimmed.startsWith('#') || firstTrimmed.startsWith('[')) {
    return null;
  }
  if (!firstTrimmed.includes('=')) {
    return null;
  }
  for (let endIndex = startIndex; endIndex < lines.length; endIndex += 1) {
    if (endIndex > startIndex) {
      const candidate = lines[endIndex];
      if (parseTomlTablePath(candidate) || parseTomlArrayTablePath(candidate)) {
        break;
      }
    }
    const slice = lines.slice(startIndex, endIndex + 1).join('\n');
    try {
      const parsed = parseTomlRecord(slice);
      return {
        keys: Object.keys(parsed),
        endIndex,
      };
    } catch {
      // Continue accumulating multiline values such as multiline arrays or strings.
    }
  }
  return null;
}

function filterKeyLines(lines: readonly string[], keysToRemove: ReadonlySet<string>) {
  const kept: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const assignment = consumeKeyAssignment(lines, index);
    if (assignment && assignment.keys.some((key) => keysToRemove.has(key))) {
      index = assignment.endIndex;
      continue;
    }
    kept.push(lines[index]);
  }
  return kept;
}

export function removeRootTomlKeys(text: string, keys: ReadonlySet<string>) {
  const document = parseTomlDocumentBlocks(text);
  const filteredPreamble = document.preamble
    ? filterKeyLines(document.preamble.split('\n'), keys).join('\n').trim()
    : '';
  const rendered = renderTomlDocumentBlocks(filteredPreamble, document.tables).trim();
  validateTomlDocument(rendered);
  return rendered;
}

export function upsertTomlTableKeys(
  text: string,
  pathSegments: readonly string[],
  replacements: ReadonlyArray<readonly [key: string, value: unknown | null]>,
) {
  const document = parseTomlDocumentBlocks(text);
  const replacementKeys = new Set(replacements.map(([key]) => key));
  const replacementLines = replacements
    .filter(([, value]) => value !== null && value !== undefined)
    .map(([key, value]) => renderTomlKeyValue(key, value));

  let foundTable = false;
  const updatedTables = document.tables.map((table) => {
    if (table.isArrayTable || !sameTomlTablePath(table.path, pathSegments)) {
      return table;
    }
    foundTable = true;
    const lines = table.content.trimEnd().split('\n');
    const [headerLine, ...bodyLines] = lines;
    const preservedBody = filterKeyLines(bodyLines, replacementKeys);
    return {
      ...table,
      content: `${[headerLine, ...replacementLines, ...preservedBody].join('\n').trimEnd()}\n`,
    };
  });

  if (!foundTable) {
    const header = renderTomlTableHeader(pathSegments);
    updatedTables.push({
      header: pathSegments.join('.'),
      path: [...pathSegments],
      rawHeader: header,
      content: `${[header, ...replacementLines].join('\n').trimEnd()}\n`,
      leadingComments: '',
      aliases: idAliases(pathSegments.join('.')),
      values: {},
    });
  }

  const rendered = renderTomlDocumentBlocks(document.preamble, updatedTables)
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  validateTomlDocument(rendered);
  return rendered;
}

export function removeTomlTables(
  text: string,
  shouldRemove: (block: TomlTableBlock) => boolean,
) {
  const document = parseTomlDocumentBlocks(text);
  let removed = 0;
  const kept = document.tables.filter((table) => {
    if (!table.isArrayTable && shouldRemove(table)) {
      removed += 1;
      return false;
    }
    return true;
  });
  const rendered = renderTomlDocumentBlocks(document.preamble, kept)
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd();
  validateTomlDocument(rendered);
  return {
    text: rendered,
    removed,
  };
}

export function upsertTomlTable(
  text: string,
  pathSegments: readonly string[],
  entries: Record<string, unknown>,
) {
  const withoutTable = removeTomlTables(text, (table) => sameTomlTablePath(table.path, pathSegments));
  const header = renderTomlTableHeader(pathSegments);
  const bodyLines = Object.entries(entries)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => renderTomlKeyValue(key, value));
  const block = [header, ...bodyLines].join('\n');
  const rendered = withoutTable.text
    ? `${withoutTable.text.trimEnd()}\n\n${block}\n`
    : `${block}\n`;
  validateTomlDocument(rendered);
  return rendered;
}

export function readMcpServerConfigFromToml(text: string, serverId: string) {
  let parsed: Record<string, unknown>;
  try {
    parsed = parseTomlRecord(text);
  } catch {
    return { present: false, command: null, args: [] as string[], enabled: false };
  }
  const mcpServers = parsed.mcp_servers;
  if (!isPlainObject(mcpServers)) {
    return { present: false, command: null, args: [] as string[], enabled: false };
  }
  const server = mcpServers[serverId];
  if (!isPlainObject(server)) {
    return { present: false, command: null, args: [] as string[], enabled: false };
  }
  const command = typeof server.command === 'string' ? server.command : null;
  const args = Array.isArray(server.args)
    ? server.args.filter((entry): entry is string => typeof entry === 'string')
    : [];
  const enabled = typeof server.enabled === 'boolean' ? server.enabled : true;
  return { present: true, command, args, enabled };
}
