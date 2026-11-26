import fs from 'node:fs';

export interface SqliteMigration {
  readonly version: number;
  readonly name: string;
  readonly sql: string;
}

const INITIAL_SQL_URL = new URL('../../migrations/0001_initial_v2.sql', import.meta.url);

export const MIGRATION_0001_INITIAL_V2: SqliteMigration = {
  version: 1,
  name: '0001_initial_v2',
  sql: fs.readFileSync(INITIAL_SQL_URL, 'utf8'),
};
