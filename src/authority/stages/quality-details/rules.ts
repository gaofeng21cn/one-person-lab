import fs from 'node:fs';
import path from 'node:path';
import { parse as parseToml } from 'smol-toml';

import { isRecord } from '../../../kernel/contract-validation.ts';
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

function stringField(record: Record<string, unknown>, key: string) {
  return typeof record[key] === 'string' ? record[key] : '';
}

function numberField(record: Record<string, unknown>, key: string) {
  return typeof record[key] === 'number' && Number.isFinite(record[key]) ? record[key] : undefined;
}

function parseRulesToml(root: string): RulesConfig | null {
  const rulesPath = path.join(root, '.sentrux', 'rules.toml');
  if (!fs.existsSync(rulesPath)) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = parseToml(fs.readFileSync(rulesPath, 'utf8'));
  } catch {
    return { constraints: {}, layers: [], boundaries: [] };
  }
  if (!isRecord(parsed)) {
    return { constraints: {}, layers: [], boundaries: [] };
  }
  const rawConstraints = isRecord(parsed.constraints) ? parsed.constraints : {};
  const rawLayers = Array.isArray(parsed.layers) ? parsed.layers : [];
  const rawBoundaries = Array.isArray(parsed.boundaries) ? parsed.boundaries : [];
  return {
    constraints: {
      max_depth: numberField(rawConstraints, 'max_depth'),
      max_file_lines: numberField(rawConstraints, 'max_file_lines'),
      max_cycles: numberField(rawConstraints, 'max_cycles'),
    },
    layers: rawLayers
      .filter(isRecord)
      .map((entry) => ({
        name: stringField(entry, 'name'),
        paths: Array.isArray(entry.paths)
          ? entry.paths.filter((item): item is string => typeof item === 'string' && item.length > 0)
          : [],
        order: numberField(entry, 'order'),
      }))
      .filter((layer) => layer.name && layer.paths.length > 0),
    boundaries: rawBoundaries
      .filter(isRecord)
      .map((entry) => ({
        from: stringField(entry, 'from'),
        to: stringField(entry, 'to'),
        reason: stringField(entry, 'reason'),
      }))
      .filter((boundary) => boundary.from && boundary.to),
  };
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
