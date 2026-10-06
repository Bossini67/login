# Little List

A small to-do app with username/password accounts and user-owned tasks stored in SQLite.

## Requirements

- Node.js 20 or newer
- npm

## Run locally

```sh
npm install
SESSION_SECRET="replace-this-with-a-long-random-value" npm start
```

Open [http://localhost:3000](http://localhost:3000). The app creates `todo.sqlite` in the project directory on first start. Set `DATABASE_PATH` to store it elsewhere.

Create an account with a username of 3–32 letters, numbers, or underscores and a password of at least 8 characters. Passwords are stored as bcrypt hashes. Set a stable, secret `SESSION_SECRET` in deployment so signed sessions remain valid across restarts; use HTTPS in production.

## Run tests

```sh
npm test
```

The integration tests use an in-memory SQLite database and cover registration/login, task-list ownership, task completion/deletion, and input validation.
