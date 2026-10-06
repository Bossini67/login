const path = require('node:path');
const bcrypt = require('bcryptjs');
const express = require('express');
const session = require('express-session');
const { createDatabase } = require('./db');

const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,32}$/;
const PASSWORD_MIN_LENGTH = 8;
const TASK_TITLE_MAX_LENGTH = 200;
const SESSION_MAX_AGE = 1000 * 60 * 60 * 24 * 7;

class SQLiteSessionStore extends session.Store {
  constructor(db) {
    super();
    this.db = db;
    this.getStatement = db.prepare('SELECT sess, expires FROM sessions WHERE sid = ?');
    this.setStatement = db.prepare(`
      INSERT INTO sessions (sid, sess, expires) VALUES (?, ?, ?)
      ON CONFLICT(sid) DO UPDATE SET sess = excluded.sess, expires = excluded.expires
    `);
    this.destroyStatement = db.prepare('DELETE FROM sessions WHERE sid = ?');
    this.touchStatement = db.prepare('UPDATE sessions SET expires = ? WHERE sid = ?');
    this.deleteExpiredStatement = db.prepare('DELETE FROM sessions WHERE expires <= ?');
  }

  get(sid, callback) {
    try {
      const row = this.getStatement.get(sid);
      if (!row) return callback(null, null);
      if (row.expires <= Date.now()) {
        this.destroyStatement.run(sid);
        return callback(null, null);
      }
      return callback(null, JSON.parse(row.sess));
    } catch (error) {
      return callback(error);
    }
  }

  set(sid, sess, callback = () => {}) {
    try {
      const expires = sess.cookie?.expires
        ? new Date(sess.cookie.expires).getTime()
        : Date.now() + (sess.cookie?.maxAge || SESSION_MAX_AGE);
      this.setStatement.run(sid, JSON.stringify(sess), expires);
      this.deleteExpiredStatement.run(Date.now());
      callback(null);
    } catch (error) {
      callback(error);
    }
  }

  touch(sid, sess, callback = () => {}) {
    try {
      const expires = sess.cookie?.expires
        ? new Date(sess.cookie.expires).getTime()
        : Date.now() + (sess.cookie?.maxAge || SESSION_MAX_AGE);
      this.touchStatement.run(expires, sid);
      callback(null);
    } catch (error) {
      callback(error);
    }
  }

  destroy(sid, callback = () => {}) {
    try {
      this.destroyStatement.run(sid);
      callback(null);
    } catch (error) {
      callback(error);
    }
  }
}

function establishSession(req, userId) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((error) => {
      if (error) return reject(error);
      req.session.userId = userId;
      req.session.save((saveError) => {
        if (saveError) return reject(saveError);
        resolve();
      });
    });
  });
}

function requireUser(req, res, next) {
  if (!Number.isInteger(req.session.userId)) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  next();
}

function createApp({ db, sessionSecret } = {}) {
  if (!db) throw new Error('A SQLite database connection is required.');
  if (!sessionSecret) throw new Error('A session secret is required.');

  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '16kb' }));
  app.use(session({
    name: 'todo.sid',
    secret: sessionSecret,
    store: new SQLiteSessionStore(db),
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: SESSION_MAX_AGE
    }
  }));

  app.get('/api/session', (req, res) => {
    if (!Number.isInteger(req.session.userId)) {
      return res.json({ user: null });
    }
    const user = db.prepare('SELECT id, username FROM users WHERE id = ?').get(req.session.userId);
    if (!user) {
      return req.session.destroy((error) => {
        if (error) return res.status(500).json({ error: 'Unable to clear the invalid session.' });
        res.clearCookie('todo.sid');
        res.json({ user: null });
      });
    }
    res.json({ user: { id: user.id, username: user.username } });
  });

  app.post('/api/register', async (req, res) => {
    const username = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!USERNAME_PATTERN.test(username)) {
      return res.status(400).json({ error: 'Username must be 3–32 letters, numbers, or underscores.' });
    }
    if (password.length < PASSWORD_MIN_LENGTH) {
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    let result;
    try {
      result = db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run(username, passwordHash);
    } catch (error) {
      if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        return res.status(409).json({ error: 'That username is already taken.' });
      }
      throw error;
    }

    await establishSession(req, Number(result.lastInsertRowid));
    res.status(201).json({ user: { id: Number(result.lastInsertRowid), username } });
  });

  app.post('/api/login', async (req, res) => {
    const username = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const user = db.prepare('SELECT id, username, password_hash FROM users WHERE username = ?').get(username);
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: 'Incorrect username or password.' });
    }

    await establishSession(req, user.id);
    res.json({ user: { id: user.id, username: user.username } });
  });

  app.post('/api/logout', (req, res, next) => {
    req.session.destroy((error) => {
      if (error) return next(error);
      res.clearCookie('todo.sid');
      res.status(204).end();
    });
  });

  app.get('/api/tasks', requireUser, (req, res) => {
    const tasks = db.prepare(`
      SELECT id, title, completed, created_at AS createdAt
      FROM tasks
      WHERE user_id = ?
      ORDER BY created_at, id
    `).all(req.session.userId).map((task) => ({
      ...task,
      completed: Boolean(task.completed)
    }));
    res.json({ tasks });
  });

  app.post('/api/tasks', requireUser, (req, res) => {
    const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
    if (!title || title.length > TASK_TITLE_MAX_LENGTH) {
      return res.status(400).json({ error: 'Task title must be between 1 and 200 characters.' });
    }
    const result = db.prepare('INSERT INTO tasks (user_id, title) VALUES (?, ?)').run(req.session.userId, title);
    const task = db.prepare(`
      SELECT id, title, completed, created_at AS createdAt FROM tasks WHERE id = ?
    `).get(Number(result.lastInsertRowid));
    res.status(201).json({ task: { ...task, completed: Boolean(task.completed) } });
  });

  app.patch('/api/tasks/:id', requireUser, (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1 || typeof req.body?.completed !== 'boolean') {
      return res.status(400).json({ error: 'A valid task ID and completed value are required.' });
    }
    const result = db.prepare(`
      UPDATE tasks SET completed = ? WHERE id = ? AND user_id = ?
    `).run(Number(req.body.completed), id, req.session.userId);
    if (result.changes === 0) return res.status(404).json({ error: 'Task not found.' });
    const task = db.prepare(`
      SELECT id, title, completed, created_at AS createdAt FROM tasks WHERE id = ?
    `).get(id);
    res.json({ task: { ...task, completed: Boolean(task.completed) } });
  });

  app.delete('/api/tasks/:id', requireUser, (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) {
      return res.status(400).json({ error: 'A valid task ID is required.' });
    }
    const result = db.prepare('DELETE FROM tasks WHERE id = ? AND user_id = ?').run(id, req.session.userId);
    if (result.changes === 0) return res.status(404).json({ error: 'Task not found.' });
    res.status(204).end();
  });

  app.use(express.static(path.join(__dirname, 'public')));
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    console.error(error);
    res.status(500).json({ error: 'An unexpected server error occurred.' });
  });

  return app;
}

if (require.main === module) {
  if (!process.env.SESSION_SECRET) {
    throw new Error('Set SESSION_SECRET before starting the application.');
  }
  const db = createDatabase();
  const app = createApp({ db, sessionSecret: process.env.SESSION_SECRET });
  const port = Number(process.env.PORT) || 3000;
  app.listen(port, () => console.log(`To-do app listening on http://localhost:${port}`));
}

module.exports = { createApp, SQLiteSessionStore };
