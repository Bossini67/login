const authPanel = document.querySelector('#auth-panel');
const tasksPanel = document.querySelector('#tasks-panel');
const authForm = document.querySelector('#auth-form');
const authTitle = document.querySelector('#auth-title');
const authSubmit = document.querySelector('#auth-submit');
const passwordInput = document.querySelector('#password');
const modePrompt = document.querySelector('#mode-prompt');
const modeToggle = document.querySelector('#mode-toggle');
const authMessage = document.querySelector('#auth-message');
const taskMessage = document.querySelector('#task-message');
const taskForm = document.querySelector('#task-form');
const taskInput = document.querySelector('#task-title');
const taskList = document.querySelector('#task-list');
const emptyState = document.querySelector('#empty-state');
const welcomeUser = document.querySelector('#welcome-user');
const logoutButton = document.querySelector('#logout-button');

let isRegistering = false;

async function request(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers }
  });
  const result = response.status === 204 ? null : await response.json();
  if (!response.ok) throw new Error(result?.error || 'Something went wrong. Please try again.');
  return result;
}

function showAuth(message = '') {
  authPanel.hidden = false;
  tasksPanel.hidden = true;
  authMessage.textContent = message;
}

function showTasks(user) {
  authPanel.hidden = true;
  tasksPanel.hidden = false;
  welcomeUser.textContent = `Signed in as ${user.username}`;
  taskMessage.textContent = '';
  loadTasks();
}

async function loadTasks() {
  try {
    const { tasks } = await request('/api/tasks');
    taskList.replaceChildren();
    emptyState.hidden = tasks.length > 0;

    for (const task of tasks) {
      const item = document.createElement('li');
      item.className = `task-item${task.completed ? ' is-complete' : ''}`;

      const label = document.createElement('label');
      label.className = 'task-label';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = task.completed;
      checkbox.setAttribute('aria-label', `Mark "${task.title}" ${task.completed ? 'incomplete' : 'complete'}`);
      checkbox.addEventListener('change', () => updateTask(task.id, checkbox.checked));
      const title = document.createElement('span');
      title.textContent = task.title;
      label.append(checkbox, title);

      const removeButton = document.createElement('button');
      removeButton.className = 'delete-button';
      removeButton.type = 'button';
      removeButton.textContent = 'Delete';
      removeButton.setAttribute('aria-label', `Delete "${task.title}"`);
      removeButton.addEventListener('click', () => deleteTask(task.id));

      item.append(label, removeButton);
      taskList.append(item);
    }
  } catch (error) {
    taskMessage.textContent = error.message;
  }
}

async function updateTask(id, completed) {
  try {
    await request(`/api/tasks/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ completed })
    });
    await loadTasks();
  } catch (error) {
    taskMessage.textContent = error.message;
  }
}

async function deleteTask(id) {
  try {
    await request(`/api/tasks/${id}`, { method: 'DELETE' });
    await loadTasks();
  } catch (error) {
    taskMessage.textContent = error.message;
  }
}

modeToggle.addEventListener('click', () => {
  isRegistering = !isRegistering;
  authTitle.textContent = isRegistering ? 'Create your account' : 'Sign in to your list';
  authSubmit.textContent = isRegistering ? 'Create account' : 'Sign in';
  passwordInput.autocomplete = isRegistering ? 'new-password' : 'current-password';
  modePrompt.textContent = isRegistering ? 'Already have an account?' : 'New here?';
  modeToggle.textContent = isRegistering ? 'Sign in' : 'Create an account';
  authMessage.textContent = '';
});

authForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  authMessage.textContent = '';
  const data = new FormData(authForm);
  try {
    const result = await request(isRegistering ? '/api/register' : '/api/login', {
      method: 'POST',
      body: JSON.stringify({
        username: data.get('username'),
        password: data.get('password')
      })
    });
    authForm.reset();
    showTasks(result.user);
  } catch (error) {
    authMessage.textContent = error.message;
  }
});

taskForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  taskMessage.textContent = '';
  try {
    await request('/api/tasks', {
      method: 'POST',
      body: JSON.stringify({ title: taskInput.value })
    });
    taskForm.reset();
    taskInput.focus();
    await loadTasks();
  } catch (error) {
    taskMessage.textContent = error.message;
  }
});

logoutButton.addEventListener('click', async () => {
  try {
    await request('/api/logout', { method: 'POST' });
    showAuth();
  } catch (error) {
    taskMessage.textContent = error.message;
  }
});

request('/api/session')
  .then(({ user }) => user ? showTasks(user) : showAuth())
  .catch((error) => showAuth(error.message));
