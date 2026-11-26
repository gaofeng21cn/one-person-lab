export type PackErrorCode =
  | 'INVALID_MANIFEST'
  | 'INVALID_INPUT'
  | 'PACK_MISSING_PATH'
  | 'PACK_SYMLINK_ESCAPE'
  | 'PACK_LOCK_MISMATCH'
  | 'PACK_NOT_FOUND'
  | 'PACK_ALREADY_EXISTS'
  | 'PACK_DEPENDENCY_MISSING'
  | 'PACK_DOWNLOAD_FAILED'
  | 'PACK_DOWNLOAD_CANCELLED'
  | 'PACK_INSUFFICIENT_SPACE'
  | 'PACK_ARCHIVE_INVALID'
  | 'PACK_CODEX_SYNC_FAILED'
  | 'PACK_OPERATION_BUSY'
  | 'PACK_OPERATION_CANCELLED'
  | 'PACK_TRUSTED_HOST_REQUIRED'
  | 'PACK_MIGRATION_FAILED';

const RPC_CODE_BY_ERROR: Record<PackErrorCode, number> = {
  INVALID_MANIFEST: -32602,
  INVALID_INPUT: -32602,
  PACK_MISSING_PATH: -32010,
  PACK_SYMLINK_ESCAPE: -32011,
  PACK_LOCK_MISMATCH: -32012,
  PACK_NOT_FOUND: -32013,
  PACK_ALREADY_EXISTS: -32014,
  PACK_DEPENDENCY_MISSING: -32015,
  PACK_DOWNLOAD_FAILED: -32016,
  PACK_DOWNLOAD_CANCELLED: -32017,
  PACK_INSUFFICIENT_SPACE: -32018,
  PACK_ARCHIVE_INVALID: -32019,
  PACK_CODEX_SYNC_FAILED: -32020,
  PACK_OPERATION_BUSY: -32021,
  PACK_OPERATION_CANCELLED: -32022,
  PACK_TRUSTED_HOST_REQUIRED: -32003,
  PACK_MIGRATION_FAILED: -32023,
};

export class PackError extends Error {
  readonly code: PackErrorCode;
  readonly rpcCode: number;
  readonly details: Record<string, unknown>;

  constructor(
    code: PackErrorCode,
    message: string,
    details: Record<string, unknown> = {},
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'PackError';
    this.code = code;
    this.rpcCode = RPC_CODE_BY_ERROR[code];
    this.details = details;
  }

  toJSON(): {
    name: string;
    code: PackErrorCode;
    rpcCode: number;
    message: string;
    details: Record<string, unknown>;
  } {
    return {
      name: this.name,
      code: this.code,
      rpcCode: this.rpcCode,
      message: this.message,
      details: this.details,
    };
  }
}
