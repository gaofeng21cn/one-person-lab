import { FrameworkContractError } from '../../charter/index.ts';

const DEFAULT_MODULE_EXEC_MAX_BUFFER = 32 * 1024 * 1024;

export function resolveModuleExecMaxBuffer() {
  const raw = process.env.OPL_MODULE_EXEC_MAX_BUFFER?.trim();
  if (!raw) {
    return DEFAULT_MODULE_EXEC_MAX_BUFFER;
  }
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'OPL_MODULE_EXEC_MAX_BUFFER must be a positive integer.',
      { env: 'OPL_MODULE_EXEC_MAX_BUFFER', value: raw },
    );
  }
  return parsed;
}
