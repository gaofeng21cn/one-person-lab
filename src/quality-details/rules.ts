import fs from 'node:fs';
import path from 'node:path';

import type { RulesFinding, SourceFileInfo } from './types.ts';

type RulesConfig = {
  constraints: {
    max_depth?: number;
    max_file_lines?: number;
    max_cycles?: number;
  };
  layers: Array<{
    name: string;
    paths: string[];
    order?: number;
  }>;
  boundaries: Array<{
    from: string;
    to: string;
    reason: string;
  }>;
};

function stripInlineComment(line: string) {
  let inString = false;
  let quote = '';
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if ((char === '"' || char === "'") && line[index - 1] !== '\\') {
      if (!inString) {
        inString = true;
        quote = char;
      } else if (quote === char) {
        inString = false;
      }
    }
    if (char === '#' && !inString) {
      return line.slice(0, index).trim();
    }
  }
  return line.trim();
}

function parseString(raw: string) {
  const trimmed = raw.trim();
  const match = trimmed.match(/^["'](.*)["']$/);
  return match ? match[1] : trimmed;
}

function parseStringList(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) {
    return [];
  }
  const inner = trimmed.slice(1, -1).trim();
  if (!inner) {
    return [];
  }
  return inner
    .split(',')
    .map((entry) => parseString(entry.trim()))
    .filter(Boolean);
}

function parseNumber(raw: string) {
  const parsed = Number(raw.trim());
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseRulesToml(root: string): RulesConfig | null {
  const rulesPath = path.join(root, '.sentrux', 'rules.toml');
  if (!fs.existsSync(rulesPath)) {
    return null;
  }

  const config: RulesConfig = {
    constraints: {},
    layers: [],
    boundaries: [],
  };
  let section: 'constraints' | 'layer' | 'boundary' | null = null;

  for (const rawLine of fs.readFileSync(rulesPath, 'utf8').split(/\r?\n/)) {
    const line = stripInlineComment(rawLine);
    if (!line) {
      continue;
    }

    if (line === '[constraints]') {
      section = 'constraints';
      continue;
    }
    if (line === '[[layers]]') {
      section = 'layer';
      config.layers.push({ name: '', paths: [] });
      continue;
    }
    if (line === '[[boundaries]]') {
      section = 'boundary';
      config.boundaries.push({ from: '', to: '', reason: '' });
      continue;
    }

    const equalIndex = line.indexOf('=');
    if (equalIndex === -1) {
      continue;
    }

    const key = line.slice(0, equalIndex).trim();
    const value = line.slice(equalIndex + 1).trim();

    if (section === 'constraints') {
      if (key === 'max_depth' || key === 'max_file_lines' || key === 'max_cycles') {
        config.constraints[key] = parseNumber(value);
      }
      continue;
    }

    if (section === 'layer') {
      const layer = config.layers[config.layers.length - 1];
      if (key === 'name') {
        layer.name = parseString(value);
      } else if (key === 'paths') {
        layer.paths = parseStringList(value);
      } else if (key === 'order') {
        layer.order = parseNumber(value);
      }
      continue;
    }

    if (section === 'boundary') {
      const boundary = config.boundaries[config.boundaries.length - 1];
      if (key === 'from') {
        boundary.from = parseString(value);
      } else if (key === 'to') {
        boundary.to = parseString(value);
      } else if (key === 'reason') {
        boundary.reason = parseString(value);
      }
    }
  }

  config.layers = config.layers.filter((layer) => layer.name && layer.paths.length > 0);
  config.boundaries = config.boundaries.filter((boundary) => boundary.from && boundary.to);
  return config;
}

function globToRegExp(pattern: string) {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '\u0000')
    .replace(/\*/g, '[^/]*')
    .replace(/\u0000/g, '.*');
  return new RegExp(`^${escaped}$`);
}

function matches(pattern: string, relativePath: string) {
  return globToRegExp(pattern).test(relativePath);
}

function layerFor(file: string, config: RulesConfig) {
  return config.layers.find((layer) => layer.paths.some((pattern) => matches(pattern, file)));
}

function analyzeRules(root: string, files: SourceFileInfo[], maxDepth: number) {
  const config = parseRulesToml(root);
  const findings: RulesFinding[] = [];
  if (!config) {
    return findings;
  }

  if (config.constraints.max_depth !== undefined && maxDepth > config.constraints.max_depth) {
    findings.push({
      kind: 'rule_violation',
      rule_kind: 'max_depth',
      value: maxDepth,
      limit: config.constraints.max_depth,
      reason: `dependency depth ${maxDepth} exceeds configured max_depth ${config.constraints.max_depth}`,
    });
  }

  if (config.constraints.max_file_lines !== undefined) {
    for (const file of files.filter((entry) => !entry.isTest)) {
      if (file.lineCount > config.constraints.max_file_lines) {
        findings.push({
          kind: 'rule_violation',
          rule_kind: 'max_file_lines',
          file: file.relativePath,
          value: file.lineCount,
          limit: config.constraints.max_file_lines,
          reason: `${file.relativePath} has ${file.lineCount} lines, above max_file_lines ${config.constraints.max_file_lines}`,
        });
      }
    }
  }

  const boundaryByPair = new Map(config.boundaries.map((boundary) => [`${boundary.from}\u0000${boundary.to}`, boundary]));
  for (const file of files.filter((entry) => !entry.isTest)) {
    const fromLayer = layerFor(file.relativePath, config);
    if (!fromLayer) {
      continue;
    }
    for (const target of file.resolvedImports) {
      const toLayer = layerFor(target, config);
      if (!toLayer) {
        continue;
      }
      const boundary = boundaryByPair.get(`${fromLayer.name}\u0000${toLayer.name}`);
      if (boundary) {
        findings.push({
          kind: 'rule_violation',
          rule_kind: 'layer_boundary',
          file: file.relativePath,
          from: fromLayer.name,
          to: toLayer.name,
          path: [file.relativePath, target],
          reason: boundary.reason || `${fromLayer.name} must not depend on ${toLayer.name}`,
        });
      }
    }
  }

  return findings.sort((left, right) => {
    const leftScore = left.value ?? 0;
    const rightScore = right.value ?? 0;
    return rightScore - leftScore;
  });
}

export { analyzeRules, parseRulesToml };
