const path = require('node:path');
const { createClient } = require('@libsql/client');

function createDatabase(databasePath = process.env.DATABASE_PATH || path.join(__dirname, 'todo.sqlite')) {
  let client;

  if (process.env.VERCEL && !process.env.TURSO_DATABASE_URL) {
    throw new Error('TURSO_DATABASE_URL is required when deploying to Vercel.');
  }

  if (process.env.TURSO_DATABASE_URL) {
    if (!process.env.TURSO_AUTH_TOKEN) {
      throw new Error('TURSO_AUTH_TOKEN is required when TURSO_DATABASE_URL is set.');
    }
    client = createClient({
      url: process.env.TURSO_DATABASE_URL,
      authToken: process.env.TURSO_AUTH_TOKEN,
      intMode: 'number'
    });
  } else {
    const url = databasePath === ':memory:'
      ? 'file::memory:'
      : `file:${path.resolve(databasePath)}`;
    client = createClient({ url, intMode: 'number' });
  }

  return {
    execute: (sql, args = []) => client.execute({ sql, args }),
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

async function initializeDatabase(db) {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL COLLATE NOCASE UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await db.execute(`
    CREATE INDEX IF NOT EXISTS tasks_user_id_created_at
      ON tasks(user_id, created_at, id)
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS sessions (
      sid TEXT PRIMARY KEY,
      sess TEXT NOT NULL,
      expires INTEGER NOT NULL
    )
  `);
}

module.exports = { createDatabase, initializeDatabase };
