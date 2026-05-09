// Database connection factory.
import DatabaseConstructor, { Database } from "better-sqlite3";
import { getDbPath } from "../lib/cache-paths.js";
import { applyMigrations } from "./migrations.js";

export function openDb(dbPath = getDbPath()): Database {
  const db = new DatabaseConstructor(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  applyMigrations(db);
  return db;
}
