const { createDatabase } = require('./db');
const { createApp, getSessionSecret } = require('./server');

const db = createDatabase();
const app = createApp({ db, sessionSecret: getSessionSecret() });

module.exports = app;
