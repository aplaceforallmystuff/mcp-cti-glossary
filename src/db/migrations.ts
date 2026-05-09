// Versioned SQLite migrations.
import type { Database } from "better-sqlite3";
import { SCHEMA_SQL } from "./schema.js";

export interface Migration {
  version: number;
  name: string;
  up: (db: Database) => void;
}

export const migrations: Migration[] = [
  {
    version: 1,
    name: "initial_schema",
    up(db) {
      db.exec(SCHEMA_SQL);
    },
  },
];

export function applyMigrations(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);

  const applied = new Set(
    (
      db.prepare("SELECT version FROM _migrations").all() as Array<{
        version: number;
      }>
    ).map((row) => row.version)
  );

  const unapplied = migrations
    .filter((migration) => !applied.has(migration.version))
    .sort((a, b) => a.version - b.version);

  if (unapplied.length === 0) {
    return;
  }

  const run = db.transaction((pending: Migration[]) => {
    const markApplied = db.prepare(
      "INSERT INTO _migrations (version, applied_at) VALUES (?, ?)"
    );

    for (const migration of pending) {
      migration.up(db);
      markApplied.run(migration.version, new Date().toISOString());
    }
  });

  run(unapplied);
}
