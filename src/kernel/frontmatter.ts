export type MarkdownFrontmatter = {
  frontmatter: string;
  lines: string[];
  body: string;
};

export function normalizeFrontmatterScalar(value: string | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed) return '';
  if (trimmed.length >= 2) {
    const first = trimmed[0];
    const last = trimmed[trimmed.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return trimmed.slice(1, -1).trim();
    }
  }
  return trimmed;
}

export function extractMarkdownFrontmatter(markdown: string): MarkdownFrontmatter | null {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) return null;
  return {
    frontmatter: match[1],
    lines: match[1].split(/\r?\n/),
    body: markdown.slice(match[0].length),
  };
}

export function parseFrontmatterKeys(frontmatterLines: readonly string[]): string[] {
  return frontmatterLines.flatMap((line) => {
    const key = line.match(/^([A-Za-z0-9_-]+)\s*:/)?.[1];
    return key ? [key] : [];
  });
}

export function frontmatterFieldValue(frontmatterLines: readonly string[], key: string): string {
  const index = frontmatterLines.findIndex((line) => line.match(/^([A-Za-z0-9_-]+)\s*:/)?.[1] === key);
  if (index < 0) return '';
  const inline = frontmatterLines[index].slice(frontmatterLines[index].indexOf(':') + 1).trim();
  if (!/^[>|][+-]?$/.test(inline)) return normalizeFrontmatterScalar(inline);

  const blockLines: string[] = [];
  for (const line of frontmatterLines.slice(index + 1)) {
    if (line.trim() === '') {
      blockLines.push('');
      continue;
    }
    if (!/^\s/.test(line)) break;
    blockLines.push(line.replace(/^\s+/, ''));
  }
  const value = inline.startsWith('>')
    ? blockLines.join(' ').replace(/\s+/g, ' ')
    : blockLines.join('\n');
  return value.trim();
}

export function firstFrontmatterValue(frontmatter: string, key: string): string {
  return frontmatter ? frontmatterFieldValue(frontmatter.split(/\r?\n/), key) : '';
}
