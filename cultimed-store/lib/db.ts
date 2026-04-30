import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";

const DB_PATH = process.env.DB_PATH || "../cultisoft/data/cultisoft.db";

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;
  const absPath = path.isAbsolute(DB_PATH) ? DB_PATH : path.resolve(process.cwd(), DB_PATH);
  if (!fs.existsSync(absPath)) {
    throw new Error(
      `Cultimed-store DB not found at ${absPath}. ` +
      `Run \`npm run db:reset\` (or db:reset:clean) inside ../cultisoft first.`
    );
  }
  _db = new Database(absPath);
  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");
  return _db;
}

export function all<T = any>(sql: string, ...params: any[]): T[] {
  return getDb().prepare(sql).all(...params) as T[];
}
export function get<T = any>(sql: string, ...params: any[]): T | undefined {
  return getDb().prepare(sql).get(...params) as T | undefined;
}
export function run(sql: string, ...params: any[]) {
  return getDb().prepare(sql).run(...params);
}
export function transaction<T>(fn: () => T): T {
  return getDb().transaction(fn)();
}
