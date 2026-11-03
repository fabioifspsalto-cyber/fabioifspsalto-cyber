import { PGlite } from '@electric-sql/pglite';
import { readFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// PGlite = Postgres real (WASM) para dev/testes sem Docker.
// Em produção troque por `pg` apontando para Postgres gerenciado no Brasil;
// o SQL é o mesmo.
export type Db = PGlite;

export async function openDb(dataDir?: string): Promise<Db> {
  let db: PGlite;
  if (dataDir) {
    mkdirSync(dataDir, { recursive: true });
    db = new PGlite(path.join(dataDir, 'pg'));
  } else {
    db = new PGlite();
  }
  const sql = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'schema.sql'), 'utf8');
  await db.exec(sql);
  return db;
}
