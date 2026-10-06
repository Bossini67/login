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

## Deploy to Vercel

Vercel runs the Express app as serverless functions, where a local SQLite file is not persistent or shared between function instances. For deployment, use a hosted Turso database (LibSQL, SQLite-compatible):

1. Create a database in Turso and obtain its database URL and auth token.
2. Import this repository into Vercel.
3. Add these environment variables to the Vercel project for Production (and Preview if needed):
   - `TURSO_DATABASE_URL` — the Turso database URL.
   - `TURSO_AUTH_TOKEN` — the database auth token.
   - `SESSION_SECRET` — a long, randomly generated secret.
4. Deploy or redeploy the project.

The root `index.js` exports the Express app for Vercel. The database schema is initialized on first request. For local use, the app continues to create a file-based SQLite database and does not require Turso credentials.

## Run tests

```sh
npm test
```

The integration tests use an in-memory SQLite database and cover registration/login, task-list ownership, task completion/deletion, and input validation.
