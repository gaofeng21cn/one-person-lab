export function idAliases(value: string) {
  const normalized = value.trim().toLowerCase().replaceAll('_', '-');
  return [...new Set([
    normalized,
    ...normalized.split(/[@./]/).filter(Boolean),
    normalized.replace(/-local$/, ''),
  ])];
}

export type TomlTableBlock = {
  header: string;
  content: string;
  aliases: string[];
};

export function parseTomlDocument(text: string) {
  const preamble: string[] = [];
  const tables: TomlTableBlock[] = [];
  let current: { header: string; lines: string[]; aliases: string[] } | null = null;
  for (const line of text.split('\n')) {
    const match = line.trim().match(/^\[([^\]]+)\]$/);
    if (match) {
      if (current) {
        tables.push({
          header: current.header,
          content: `${current.lines.join('\n').trimEnd()}\n`,
          aliases: current.aliases,
        });
      }
      const header = match[1].replaceAll('"', '');
      current = { header, lines: [line], aliases: idAliases(header) };
    } else if (current) {
      current.lines.push(line);
    } else {
      preamble.push(line);
    }
  }
  if (current) {
    tables.push({
      header: current.header,
      content: `${current.lines.join('\n').trimEnd()}\n`,
      aliases: current.aliases,
    });
  }
  return { preamble: preamble.join('\n').trimEnd(), tables };
}

export function renderTomlDocument(preamble: string, tables: Array<Pick<TomlTableBlock, 'content'>>) {
  const parts = [preamble.trimEnd(), ...tables.map((table) => table.content.trim())].filter(Boolean);
  return parts.length > 0 ? `${parts.join('\n\n')}\n` : '';
}

