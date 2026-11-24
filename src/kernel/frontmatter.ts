import matter from 'gray-matter';
import YAML from 'yaml';

export type ParsedMarkdownFrontmatter = {
  hasFrontmatter: boolean;
  parseable: boolean;
  data: Record<string, unknown> | null;
  body: string;
  rawFrontmatter: string | null;
  keys: string[];
  duplicateKeys: boolean;
};

function formatFrontmatterFlowNodes(node: unknown): void {
  if (YAML.isSeq(node)) {
    node.flow = true;
    for (const item of node.items) {
      formatFrontmatterFlowNodes(item);
    }
    return;
  }
  if (YAML.isMap(node)) {
    node.flow = true;
    for (const pair of node.items) {
      if (YAML.isScalar(pair.key)) {
        pair.key.type = YAML.Scalar.QUOTE_DOUBLE;
      }
      formatFrontmatterFlowNodes(pair.value);
    }
  }
}

const YAML_FRONTMATTER_ENGINE = {
  parse(raw: string) {
    const parsed = YAML.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  },
  stringify(data: object) {
    const doc = new YAML.Document(data);
    if (YAML.isMap(doc.contents)) {
      for (const pair of doc.contents.items) {
        formatFrontmatterFlowNodes(pair.value);
      }
    }
    return doc.toString({
      indent: 2,
      indentSeq: true,
      lineWidth: 0,
    });
  },
};

export function stringifyYamlDocument(value: unknown) {
  return YAML.stringify(value, {
    indent: 2,
    indentSeq: true,
    lineWidth: 0,
  });
}

export function stringifyMarkdownFrontmatter(data: Record<string, unknown>) {
  const rendered = matter.stringify('', data, {
    engines: {
      yaml: YAML_FRONTMATTER_ENGINE,
    },
  }).trimEnd();
  return rendered;
}

export function parseMarkdownFrontmatter(markdown: string): ParsedMarkdownFrontmatter {
  const normalized = markdown.replace(/\r\n/g, '\n');
  const match = normalized.match(/^---\n(?:([\s\S]*?)\n)?---(?:\n|$)/);
  if (!match) {
    return {
      hasFrontmatter: false,
      parseable: false,
      data: null,
      body: normalized,
      rawFrontmatter: null,
      keys: [],
      duplicateKeys: false,
    };
  }

  const rawFrontmatter = match[1] ?? '';
  const body = normalized.slice(match[0].length);

  if (!rawFrontmatter.trim()) {
    return {
      hasFrontmatter: true,
      parseable: true,
      data: {},
      body,
      rawFrontmatter,
      keys: [],
      duplicateKeys: false,
    };
  }

  const document = YAML.parseDocument(rawFrontmatter, { uniqueKeys: false });
  if (document.errors.length > 0) {
    return {
      hasFrontmatter: true,
      parseable: false,
      data: null,
      body,
      rawFrontmatter,
      keys: [],
      duplicateKeys: false,
    };
  }

  if (document.contents === null) {
    return {
      hasFrontmatter: true,
      parseable: true,
      data: {},
      body,
      rawFrontmatter,
      keys: [],
      duplicateKeys: false,
    };
  }

  if (!YAML.isMap(document.contents)) {
    return {
      hasFrontmatter: true,
      parseable: false,
      data: null,
      body,
      rawFrontmatter,
      keys: [],
      duplicateKeys: false,
    };
  }

  const keys: string[] = [];
  const data: Record<string, unknown> = {};
  for (const pair of document.contents.items) {
    const keyNode = pair.key;
    const key = YAML.isScalar(keyNode) && keyNode.value !== null && keyNode.value !== undefined
      ? String(keyNode.value)
      : null;
    if (!key) {
      return {
        hasFrontmatter: true,
        parseable: false,
        data: null,
        body,
        rawFrontmatter,
        keys: [],
        duplicateKeys: false,
      };
    }
    keys.push(key);
    if (!(key in data)) {
      data[key] = YAML.isNode(pair.value) ? pair.value.toJS(document) : null;
    }
  }

  let parsedBody = body;
  try {
    const gm = matter(normalized, {
      engines: {
        yaml: {
          parse: () => data,
          stringify: YAML_FRONTMATTER_ENGINE.stringify,
        },
      },
    });
    parsedBody = gm.content;
  } catch {
    parsedBody = body;
  }

  return {
    hasFrontmatter: true,
    parseable: true,
    data,
    body: parsedBody,
    rawFrontmatter,
    keys,
    duplicateKeys: new Set(keys).size !== keys.length,
  };
}
