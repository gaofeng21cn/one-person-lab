import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { FrameworkContractError, isRecord } from '../../kernel/contract-validation.ts';
import { runAgentLabSuite, type AgentLabSuite } from './agent-lab.ts';

export const DEFAULT_AGENT_LAB_LONG_LINE_SUITE_REF =
  'contracts/opl-framework/external-suites/example-domain-longline-suite.json';

const OPL_REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

function readSuiteFile(suitePath: string): AgentLabSuite {
  const absolutePath = suitePath === DEFAULT_AGENT_LAB_LONG_LINE_SUITE_REF
    ? path.resolve(OPL_REPO_ROOT, suitePath)
    : path.resolve(suitePath);
  if (!fs.existsSync(absolutePath)) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Agent Lab longline suite manifest was not found.',
      { suite_path: absolutePath },
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
  } catch (error) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Agent Lab longline suite manifest is not valid JSON.',
      { suite_path: absolutePath, cause: error instanceof Error ? error.message : String(error) },
    );
  }
  if (!isRecord(parsed) || !Array.isArray(parsed.tasks)) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Agent Lab longline suite manifest requires an object root and tasks array.',
      { suite_path: absolutePath },
    );
  }
  return parsed as AgentLabSuite;
}

export function buildLonglineAgentLabResult(
  suite: AgentLabSuite | string = DEFAULT_AGENT_LAB_LONG_LINE_SUITE_REF,
) {
  return runAgentLabSuite(typeof suite === 'string' ? readSuiteFile(suite) : suite);
}
