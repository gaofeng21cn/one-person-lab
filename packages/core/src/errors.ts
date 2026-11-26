export type KernelErrorCode =
  | 'PLUGIN_DUPLICATE'
  | 'PLUGIN_DEPENDENCY_MISSING'
  | 'PLUGIN_DEPENDENCY_CYCLE'
  | 'PLUGIN_LIFECYCLE_FAILED'
  | 'LOCK_CONTENTION'
  | 'LOCK_INVALID'
  | 'DB_PRAGMA_FAILED'
  | 'DB_MIGRATION_FAILED'
  | 'DB_TX_ERROR'
  | 'REVISION_CONFLICT'
  | 'UNAUTHORIZED_CLIENT'
  | 'STATE_DIR_FORBIDDEN'
  | 'INVALID_INPUT';

export class KernelError extends Error {
  readonly code: KernelErrorCode;
  readonly details: Record<string, unknown>;

  constructor(
    code: KernelErrorCode,
    message: string,
    details: Record<string, unknown> = {},
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'KernelError';
    this.code = code;
    this.details = details;
  }

  toJSON(): {
    name: string;
    code: KernelErrorCode;
    message: string;
    details: Record<string, unknown>;
  } {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      details: this.details,
    };
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
