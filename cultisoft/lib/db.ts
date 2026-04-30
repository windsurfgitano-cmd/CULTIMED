// Postgres client (Supabase) usando postgres-js.
// Mantiene la misma API que la versión SQLite (get/all/run/transaction) pero AHORA TODAS SON ASYNC.
// Convierte placeholders `?` → `$1, $2, ...` para no romper queries existentes.

import postgres from "postgres";

const DATABASE_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL;

if (!DATABASE_URL) {
  // En build time (Vercel) puede no estar definido aún, lo tomamos en runtime.
  console.warn("[db] DATABASE_URL no definido — el cliente fallará en runtime hasta setearlo");
}

let _sql: ReturnType<typeof postgres> | null = null;

export function getSql() {
  if (_sql) return _sql;
  if (!DATABASE_URL) throw new Error("DATABASE_URL no definido");
  _sql = postgres(DATABASE_URL, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false, // Compatible con poolers (Supavisor, PgBouncer transaction mode)
    ssl: process.env.PGSSL === "false" ? undefined : "require",
  });
  return _sql;
}

/**
 * Convierte placeholders SQLite (`?`) a Postgres (`$1, $2, ...`).
 * Permite mantener todos los queries existentes sin reescribirlos.
 */
function pg(sql: string): string {
  let i = 0;
  // Cuidado con strings literales que tienen '?' adentro → no es común en nuestro código.
  return sql.replace(/\?/g, () => `$${++i}`);
}

/** Devuelve TODAS las filas. */
export async function all<T = any>(sql: string, ...params: any[]): Promise<T[]> {
  const rows = await getSql().unsafe(pg(sql), params);
  return rows as unknown as T[];
}

/** Devuelve la PRIMERA fila o undefined. */
export async function get<T = any>(sql: string, ...params: any[]): Promise<T | undefined> {
  const rows = await getSql().unsafe(pg(sql), params);
  return (rows[0] as T | undefined) ?? undefined;
}

/**
 * Ejecuta INSERT/UPDATE/DELETE.
 * Retorna { lastInsertRowid, changes } para mantener compat con better-sqlite3.
 * Para INSERT usamos RETURNING id automáticamente si no está presente.
 */
export async function run(sql: string, ...params: any[]): Promise<{
  lastInsertRowid: number | bigint;
  changes: number;
}> {
  const trimmed = sql.trim();
  const isInsert = /^\s*INSERT\s/i.test(trimmed);
  const hasReturning = /\bRETURNING\b/i.test(trimmed);
  const finalSql = isInsert && !hasReturning ? `${trimmed} RETURNING id` : trimmed;
  const rows = await getSql().unsafe(pg(finalSql), params);
  const lastInsertRowid = rows[0]?.id ?? 0;
  // postgres-js no expone "changes" por separado — usamos rows.count si existe.
  const changes = (rows as any).count ?? rows.length;
  return { lastInsertRowid, changes };
}

/**
 * Ejecuta una serie de queries en una transacción.
 * El callback recibe un cliente con la misma API (all/get/run) pero pegado a la transacción.
 *
 * Uso:
 *   await transaction(async (tx) => {
 *     await tx.run("INSERT ...");
 *     await tx.run("UPDATE ...");
 *   });
 */
export async function transaction<T>(
  fn: (tx: TxClient) => Promise<T>
): Promise<T> {
  return getSql().begin(async (sql) => {
    const tx: TxClient = {
      all: async <U = any>(sqlText: string, ...params: any[]) => {
        const rows = await sql.unsafe(pg(sqlText), params);
        return rows as unknown as U[];
      },
      get: async <U = any>(sqlText: string, ...params: any[]) => {
        const rows = await sql.unsafe(pg(sqlText), params);
        return (rows[0] as U | undefined) ?? undefined;
      },
      run: async (sqlText: string, ...params: any[]) => {
        const trimmed = sqlText.trim();
        const isInsert = /^\s*INSERT\s/i.test(trimmed);
        const hasReturning = /\bRETURNING\b/i.test(trimmed);
        const finalSql = isInsert && !hasReturning ? `${trimmed} RETURNING id` : trimmed;
        const rows = await sql.unsafe(pg(finalSql), params);
        const lastInsertRowid = rows[0]?.id ?? 0;
        const changes = (rows as any).count ?? rows.length;
        return { lastInsertRowid, changes };
      },
    };
    return fn(tx);
  }) as unknown as T;
}

export interface TxClient {
  all: <T = any>(sql: string, ...params: any[]) => Promise<T[]>;
  get: <T = any>(sql: string, ...params: any[]) => Promise<T | undefined>;
  run: (sql: string, ...params: any[]) => Promise<{
    lastInsertRowid: number | bigint;
    changes: number;
  }>;
}
