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

type RulesSection = 'constraints' | 'layer' | 'boundary';

type RulesLine =
  | { kind: 'section'; section: RulesSection }
  | { kind: 'entry'; key: string; value: string };

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

function parseRulesLine(rawLine: string): RulesLine | null {
  const line = stripInlineComment(rawLine);
  if (!line) {
    return null;
  }
  if (line === '[constraints]') {
    return { kind: 'section', section: 'constraints' };
  }
  if (line === '[[layers]]') {
    return { kind: 'section', section: 'layer' };
  }
  if (line === '[[boundaries]]') {
    return { kind: 'section', section: 'boundary' };
  }

  const equalIndex = line.indexOf('=');
  if (equalIndex === -1) {
    return null;
  }
  return {
    kind: 'entry',
    key: line.slice(0, equalIndex).trim(),
    value: line.slice(equalIndex + 1).trim(),
  };
}

function startRulesSection(config: RulesConfig, section: RulesSection) {
  if (section === 'layer') {
    config.layers.push({ name: '', paths: [] });
  } else if (section === 'boundary') {
    config.boundaries.push({ from: '', to: '', reason: '' });
  }
  return section;
}

function applyConstraintEntry(config: RulesConfig, key: string, value: string) {
  if (key === 'max_depth' || key === 'max_file_lines' || key === 'max_cycles') {
    config.constraints[key] = parseNumber(value);
  }
}

function applyLayerEntry(config: RulesConfig, key: string, value: string) {
  const layer = config.layers[config.layers.length - 1];
  if (!layer) {
    return;
  }
  if (key === 'name') {
    layer.name = parseString(value);
  } else if (key === 'paths') {
    layer.paths = parseStringList(value);
  } else if (key === 'order') {
    layer.order = parseNumber(value);
  }
}

function applyBoundaryEntry(config: RulesConfig, key: string, value: string) {
  const boundary = config.boundaries[config.boundaries.length - 1];
  if (!boundary) {
    return;
  }
  if (key === 'from') {
    boundary.from = parseString(value);
  } else if (key === 'to') {
    boundary.to = parseString(value);
  } else if (key === 'reason') {
    boundary.reason = parseString(value);
  }
}

function applyRulesEntry(config: RulesConfig, section: RulesSection | null, line: Extract<RulesLine, { kind: 'entry' }>) {
  if (section === 'constraints') {
    applyConstraintEntry(config, line.key, line.value);
  } else if (section === 'layer') {
    applyLayerEntry(config, line.key, line.value);
  } else if (section === 'boundary') {
    applyBoundaryEntry(config, line.key, line.value);
  }
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
    const line = parseRulesLine(rawLine);
    if (!line) {
      continue;
    }
    if (line.kind === 'section') {
      section = startRulesSection(config, line.section);
      continue;
    }
    applyRulesEntry(config, section, line);
  }

  config.layers = config.layers.filter((layer) => layer.name && layer.paths.length > 0);
  config.boundaries = config.boundaries.filter((boundary) => boundary.from && boundary.to);
  return config;
}

function matches(pattern: string, relativePath: string) {
  return path.matchesGlob(relativePath, pattern);
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
