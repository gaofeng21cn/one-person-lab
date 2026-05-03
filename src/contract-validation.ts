export type ErrorCode =
  | 'contract_file_missing'
  | 'contract_json_invalid'
  | 'contract_shape_invalid'
  | 'build_command_failed'
  | 'launcher_failed'
  | 'workstream_not_found'
  | 'domain_not_found'
  | 'surface_not_found'
  | 'cli_usage_error'
  | 'unknown_command'
  | 'hermes_binary_not_found'
  | 'hermes_command_failed'
  | 'hermes_output_parse_failed'
  | 'codex_command_failed';

export function defaultExitCode(code: ErrorCode): number {
  switch (code) {
    case 'cli_usage_error':
    case 'unknown_command':
      return 2;
    case 'contract_file_missing':
    case 'contract_json_invalid':
    case 'contract_shape_invalid':
    case 'build_command_failed':
      return 3;
    case 'launcher_failed':
    case 'workstream_not_found':
    case 'domain_not_found':
    case 'surface_not_found':
    case 'hermes_binary_not_found':
    case 'hermes_command_failed':
    case 'hermes_output_parse_failed':
    case 'codex_command_failed':
      return 4;
  }
}

export class GatewayContractError extends Error {
  readonly code: ErrorCode;
  readonly exitCode: number;
  readonly details?: Record<string, unknown>;

  constructor(
    code: ErrorCode,
    message: string,
    details?: Record<string, unknown>,
    exitCode = defaultExitCode(code),
  ) {
    super(message);
    this.name = 'GatewayContractError';
    this.code = code;
    this.exitCode = exitCode;
    this.details = details;
  }

  toJSON() {
    return {
      version: 'g2',
      error: {
        code: this.code,
        message: this.message,
        exit_code: this.exitCode,
        ...(this.details ? { details: this.details } : {}),
      },
    };
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function expectString(
  value: unknown,
  field: string,
  filePath: string,
): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new GatewayContractError(
      'contract_shape_invalid',
      `Contract field "${field}" must be a non-empty string.`,
      { file: filePath, field },
    );
  }

  return value;
}

export function expectStringArray(
  value: unknown,
  field: string,
  filePath: string,
): string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
    throw new GatewayContractError(
      'contract_shape_invalid',
      `Contract field "${field}" must be a string array.`,
      { file: filePath, field },
    );
  }

  return value;
}

export function expectBoolean(
  value: unknown,
  field: string,
  filePath: string,
): boolean {
  if (typeof value !== 'boolean') {
    throw new GatewayContractError(
      'contract_shape_invalid',
      `Contract field "${field}" must be a boolean.`,
      { file: filePath, field },
    );
  }

  return value;
}
