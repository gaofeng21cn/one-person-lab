#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

import {
  compileFlowCapabilityBuildLock,
  compileFlowCapabilityStrategyFromSourceRoot,
} from '../src/adapters/integration/agent-package-registry/flow-capability-compiler.ts';

function writeJson(filePath, value) {
  const resolved = path.resolve(filePath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  const temporary = `${resolved}.tmp-${process.pid}`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(temporary, resolved);
  return resolved;
}

function readResolutions(filePath) {
  const payload = JSON.parse(fs.readFileSync(path.resolve(filePath), 'utf8'));
  if (!Array.isArray(payload)) throw new Error('Flow capability resolutions must be a JSON array.');
  return payload;
}

const { values } = parseArgs({
  options: {
    'flow-root': { type: 'string' },
    'strategy-output': { type: 'string' },
    resolutions: { type: 'string' },
    'build-lock-output': { type: 'string' },
    json: { type: 'boolean', default: false },
  },
  strict: true,
});

if (!values['flow-root']) {
  throw new Error('Usage: compile-opl-flow-capability-projections.mjs --flow-root <path> [--strategy-output <path>] [--resolutions <json> --build-lock-output <path>] [--json]');
}
if (Boolean(values.resolutions) !== Boolean(values['build-lock-output'])) {
  throw new Error('--resolutions and --build-lock-output must be provided together.');
}

const strategy = compileFlowCapabilityStrategyFromSourceRoot(path.resolve(values['flow-root']));
const strategyOutput = values['strategy-output'] ? writeJson(values['strategy-output'], strategy) : null;
const buildLock = values.resolutions
  ? compileFlowCapabilityBuildLock({ strategy, resolutions: readResolutions(values.resolutions) })
  : null;
const buildLockOutput = buildLock && values['build-lock-output']
  ? writeJson(values['build-lock-output'], buildLock)
  : null;
const result = {
  surface_kind: 'opl_flow_capability_compilation_receipt.v1',
  strategy,
  build_lock: buildLock,
  outputs: {
    strategy: strategyOutput,
    build_lock: buildLockOutput,
  },
};

process.stdout.write(values.json ? `${JSON.stringify(result, null, 2)}\n` : `${strategy.strategy_digest}\n`);
