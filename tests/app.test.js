const { afterEach, beforeEach, test } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createDatabase } = require('../db');
const { createApp } = require('../server');

let db;
let app;

beforeEach(() => {
  db = createDatabase(':memory:');
  app = createApp({ db, sessionSecret: 'integration-test-session-secret' });
});

afterEach(() => {
  db.close();
});

async function register(agent, username, password = 'correct-horse-battery') {
  return agent.post('/api/register').send({ username, password });
}

test('registers an account, logs in with its password, and rejects incorrect credentials', async () => {
  const agent = request.agent(app);
  const registration = await register(agent, 'alice');
  assert.equal(registration.status, 201);
  assert.equal(registration.body.user.username, 'alice');

  await agent.post('/api/logout').expect(204);
  const badLogin = await agent.post('/api/login')
    .send({ username: 'alice', password: 'not-the-password' });
  assert.equal(badLogin.status, 401);

  const login = await agent.post('/api/login')
    .send({ username: 'alice', password: 'correct-horse-battery' });
  assert.equal(login.status, 200);
  assert.equal(login.body.user.username, 'alice');
  await agent.get('/api/tasks').expect(200, { tasks: [] });
});

test('keeps each user task list private and restricts task changes to its owner', async () => {
  const alice = request.agent(app);
  const bob = request.agent(app);
  await register(alice, 'alice');
  await register(bob, 'bob');

  const created = await alice.post('/api/tasks').send({ title: 'Write a note' }).expect(201);
  const taskId = created.body.task.id;
  assert.equal(created.body.task.title, 'Write a note');
  assert.equal(created.body.task.completed, false);

  await bob.get('/api/tasks').expect(200, { tasks: [] });
  await bob.patch(`/api/tasks/${taskId}`).send({ completed: true }).expect(404);
  await bob.delete(`/api/tasks/${taskId}`).expect(404);

  await alice.get('/api/tasks').expect(200, {
    tasks: [{
      id: taskId,
      title: 'Write a note',
      completed: false,
      createdAt: created.body.task.createdAt
    }]
  });
  const completed = await alice.patch(`/api/tasks/${taskId}`).send({ completed: true }).expect(200);
  assert.equal(completed.body.task.completed, true);
  await alice.delete(`/api/tasks/${taskId}`).expect(204);
  await alice.get('/api/tasks').expect(200, { tasks: [] });
});

test('requires authentication and validates task titles', async () => {
  await request(app).get('/api/tasks').expect(401);
  const agent = request.agent(app);
  await register(agent, 'carol');
  await agent.post('/api/tasks').send({ title: '   ' }).expect(400);
  await agent.post('/api/tasks').send({ title: 'A task'.repeat(34) }).expect(400);
});
