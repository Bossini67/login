const { createDatabase } = require('./db');
const { createApp } = require('./server');

const db = createDatabase();
const app = createApp({ db, sessionSecret: process.env.SESSION_SECRET });

module.exports = app;
