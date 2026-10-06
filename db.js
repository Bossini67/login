const path = require('node:path');
const { createClient } = require('@libsql/client');

const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL COLLATE NOCASE UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS tasks_user_id_created_at
    ON tasks(user_id, created_at, id)`,
  `CREATE TABLE IF NOT EXISTS sessions (
    sid TEXT PRIMARY KEY,
    sess TEXT NOT NULL,
    expires INTEGER NOT NULL
  )`
];

function createDatabase(databasePath = process.env.DATABASE_PATH || path.join(__dirname, 'todo.sqlite')) {
  const tursoUrl = process.env.TURSO_DATABASE_URL || process.env.database;
  const tursoAuthToken = process.env.TURSO_AUTH_TOKEN || process.env.token;

  if (process.env.VERCEL && !tursoUrl) {
    throw new Error('TURSO_DATABASE_URL is required when deploying to Vercel.');
  }

  if (tursoUrl) {
    if (!tursoAuthToken) {
      throw new Error('TURSO_AUTH_TOKEN is required when TURSO_DATABASE_URL is set.');
    }

    const client = createClient({
      url: tursoUrl,
      authToken: tursoAuthToken,
      intMode: 'number'
    });

    return {
      execute: (sql) => client.execute(sql),
      prepare(sql) {
        return {
          async get(...args) {
            const result = await client.execute({ sql, args });
            return result.rows[0];
          },
          async all(...args) {
            const result = await client.execute({ sql, args });
            return result.rows;
          },
          async run(...args) {
            const result = await client.execute({ sql, args });
            return {
              changes: Number(result.rowsAffected),
              lastInsertRowid: Number(result.lastInsertRowid)
            };
          }
        };
      },
      close: () => client.close()
    };
  }

  const Database = require('better-sqlite3');
  const sqlite = new Database(databasePath);
  sqlite.pragma('foreign_keys = ON');
  for (const statement of schemaStatements) sqlite.exec(statement);
  return {
    execute: (sql) => sqlite.exec(sql),
    prepare: (sql) => sqlite.prepare(sql),
    close: () => sqlite.close()
  };
}

async function initializeDatabase(db) {
  for (const statement of schemaStatements) await db.execute(statement);
}

module.exports = { createDatabase, initializeDatabase };
