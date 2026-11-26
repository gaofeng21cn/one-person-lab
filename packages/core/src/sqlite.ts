import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { KernelError, toErrorMessage } from './errors.ts';

export type SqliteDb = DatabaseSync;

export interface OpenSqliteOptions {
  readOnly?: boolean;
  busyTimeoutMs?: number;
}

const DEFAULT_BUSY_TIMEOUT_MS = 5_000;
let savepointSeq = 0;

export function openSqliteStore(
  dbPath: string,
  options: OpenSqliteOptions = {},
): DatabaseSync {
  const readOnly = options.readOnly ?? false;
  const busyTimeoutMs = options.busyTimeoutMs ?? DEFAULT_BUSY_TIMEOUT_MS;
  if (!Number.isInteger(busyTimeoutMs) || busyTimeoutMs < 0) {
    throw new KernelError('INVALID_INPUT', 'busyTimeoutMs must be a non-negative integer.', {
      busy_timeout_ms: busyTimeoutMs,
    });
  }

  const isMemory = dbPath === ':memory:';
  if (!isMemory && !readOnly && !dbPath.startsWith('file:')) {
    fs.mkdirSync(path.dirname(path.resolve(dbPath)), { recursive: true });
  }

  const db = new DatabaseSync(dbPath, {
    readOnly,
    enableForeignKeyConstraints: true,
    enableDoubleQuotedStringLiterals: false,
  });

  try {
    db.exec(`PRAGMA busy_timeout = ${busyTimeoutMs};`);
    db.exec('PRAGMA foreign_keys = ON;');
    db.exec('PRAGMA temp_store = MEMORY;');
    if (!readOnly) {
      db.exec('PRAGMA journal_mode = WAL;');
      db.exec('PRAGMA synchronous = NORMAL;');
    }

    const fkRow = db.prepare('PRAGMA foreign_keys').get() as { foreign_keys?: number } | undefined;
    if (fkRow?.foreign_keys !== 1) {
      throw new KernelError('DB_PRAGMA_FAILED', 'SQLite failed to enable foreign_keys = ON.', {
        foreign_keys: fkRow?.foreign_keys ?? null,
      });
    }

    const busyRow = db.prepare('PRAGMA busy_timeout').get() as { timeout?: number } | undefined;
    if (busyRow?.timeout !== busyTimeoutMs) {
      throw new KernelError('DB_PRAGMA_FAILED', 'SQLite failed to apply busy_timeout pragma.', {
        expected: busyTimeoutMs,
        actual: busyRow?.timeout ?? null,
      });
    }

    if (!readOnly && !isMemory) {
      const modeRow = db.prepare('PRAGMA journal_mode').get() as { journal_mode?: string } | undefined;
      if (String(modeRow?.journal_mode ?? '').toLowerCase() !== 'wal') {
        throw new KernelError('DB_PRAGMA_FAILED', 'SQLite failed to enter WAL journal_mode.', {
          journal_mode: modeRow?.journal_mode ?? null,
        });
      }
    }

    return db;
  } catch (error) {
    db.close();
    if (error instanceof KernelError) throw error;
    throw new KernelError(
      'DB_PRAGMA_FAILED',
      `Failed to initialize SQLite pragmas: ${toErrorMessage(error)}`,
      { db_path: dbPath },
      { cause: error },
    );
  }
}

export function txImmediate<T>(
  db: DatabaseSync,
  fn: (db: DatabaseSync) => T,
): T {
  const ownsTransaction = !db.isTransaction;
  if (ownsTransaction) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const result = fn(db);
      db.exec('COMMIT');
      return result;
    } catch (error) {
      if (db.isTransaction) {
        db.exec('ROLLBACK');
      }
      throw error;
    }
  }

  savepointSeq += 1;
  const savepoint = `sp_${savepointSeq}`;
  db.exec(`SAVEPOINT ${savepoint}`);
  try {
    const result = fn(db);
    db.exec(`RELEASE SAVEPOINT ${savepoint}`);
    return result;
  } catch (error) {
    if (db.isTransaction) {
      db.exec(`ROLLBACK TO SAVEPOINT ${savepoint}`);
      db.exec(`RELEASE SAVEPOINT ${savepoint}`);
    }
    throw error;
  }
}
